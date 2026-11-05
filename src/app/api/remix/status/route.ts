import { NextResponse } from 'next/server';
import { isSocialPerson } from '~/lib/people';
import { holdsPersonBalance, personBalanceOn, personBalanceUsd } from '~/lib/balance/person';
import { freeFor } from '~/lib/social/free';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES, REMIX, remixFreeOn, remixGenerateOn } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import { keptDecision } from '~/lib/images/neynar';
import { GATE_WORDING, openToEveryone, refusalFor } from '~/lib/images/gate';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { balanceUsd, prepaidOpen, priceUsd } from '~/lib/wallet/credits';
import { generationsLeft, perDay } from '~/lib/remix/limits';
import { remixPictures, testFakes } from '~/lib/remix/make';
import { frameStorageReady, myFrames } from '~/lib/remix/frames';
import { isAdmin } from '~/lib/admins';
import { remixShot } from '~/lib/remix/shot';

/**
 * What the shot editor needs before Generate (as /api/images/status does for Pictures): is Remix set
 * up here, may this person generate, how many are left today or what their balance pays for, have
 * they agreed to how their words are published, and their own frames for this shot. Never asks
 * Neynar (only Generate does).
 */
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const adaptation = Number(q.get('adaptation')), version = Number(q.get('version')), shotId = q.get('shot') ?? '';
  const shot = Number.isInteger(adaptation) && Number.isInteger(version) && /^[\w-]{1,64}$/.test(shotId) ? remixShot(adaptation, version, shotId) : null;
  const sql = db();
  const keys = process.env.REMIX_TEST_FAKES === '1' && testFakes() ? true : Boolean(process.env.FAL_KEY);
  const ready = Boolean(remixGenerateOn() && sql && keys && frameStorageReady());
  const pictures = shot ? remixPictures({ role: 'layout' } as never, shot).length : 0;
  const base = {
    ready,
    free: remixFreeOn(),
    model: { name: IMAGES.editModel.name, licence: IMAGES.editModel.licence, host: IMAGES.editModel.host },
    // fixed: no camera to move, so Generate draws from the shot's saved layout (owner, 2026-10-22).
    shot: shot ? { id: shot.id, remixable: Boolean(shot.prompt && (shot.hasCamera || shot.savedLayout)), fixed: !shot.hasCamera && Boolean(shot.savedLayout), pictures } : null,
    // The version's own pictures were drawn by a closed model, and Remix sends another version's shot: said in the panel.
    drawnFrom: shot && shot.from !== version ? { version: shot.from, versionModel: shot.versionModel } : null,
    ownWordsMaxChars: REMIX.ownWordsMaxChars,
    layout: { width: REMIX.layout.width, height: REMIX.layout.height },
    walletSignIn: prepaidOpen(),
  };
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ ...base, signedIn: false }, { headers: noStore });
  const invited = IMAGES.invited.includes(person);
  if (!sql) return NextResponse.json({ ...base, signedIn: true, eligible: invited ? true : null, consented: false, frames: [] }, { headers: noStore });
  try {
    const reserveUsd = REMIX.reserveUsd(pictures || REMIX.maxPictures);
    const [consented, left, kept, frames] = await Promise.all([
      hasConsented(person),
      generationsLeft(sql, person, reserveUsd),
      invited || person < 0 ? Promise.resolve(null) : keptDecision(sql, person, IMAGES.neynarMinScore).catch(() => null),
      shot ? myFrames(sql, person, version, shot.id) : Promise.resolve([]),
    ]);
    const mine = frames.map((f) => ({ id: f.id, url: f.imageUrl, words: f.ownWords, hidden: f.hidden, hiddenRole: f.hiddenRole, at: f.createdAt, page: `/remix/${f.id}` }));
    // Paying per person (PERSON_BALANCE): a Farcaster, Lens or Bluesky person's own balance, and whether it lets them
    // make frames the free check refuses (paidOnly; owner, 2026-11-04). Null while off or before the migration.
    const own = personBalanceOn() && holdsPersonBalance(person) ? await personBalanceUsd(sql, person).catch(() => null) : null;
    const personBalance = own === null ? undefined : { balanceUsd: own, priceUsd: priceUsd(reserveUsd), markup: IMAGES.prepaid.markup };
    const paysWhenRefused = own !== null && own >= priceUsd(reserveUsd) && openToEveryone().open;
    if (isSocialPerson(person)) {
      // A Lens or Bluesky account (not linked to a Farcaster account): free only as src/lib/social/free.ts decides.
      // Never asks Lens here (variant B: only Generate does); with no decision yet, eligible is null until Generate.
      const d = await freeFor(sql, person, { lookUp: false });
      const paidOnly = d !== null && !d.free && paysWhenRefused;
      return NextResponse.json({ ...base, signedIn: true, perDay: perDay(person), eligible: paidOnly ? true : d ? d.free : null, paidOnly, refusal: d && !d.free ? d.error : undefined, consented, left, frames: mine, maintainer: false, personBalance }, { headers: noStore });
    }
    if (person < 0) {
      const open = prepaidOpen() && openToEveryone().open;
      const prepaid = { balanceUsd: await balanceUsd(sql, -person), priceUsd: priceUsd(reserveUsd), markup: IMAGES.prepaid.markup };
      return NextResponse.json(
        { ...base, signedIn: true, eligible: open, refusal: open ? undefined : prepaidOpen() ? GATE_WORDING.notOpen : IMAGE_WORDING.prepaid.notOpen, consented, left, prepaid, frames: mine, maintainer: false },
        { headers: noStore },
      );
    }
    // The kept decision only (no score is kept, and none is asked for on a page load).
    const paidOnly = !invited && kept !== null && !kept.passed && paysWhenRefused;
    const eligible = invited ? true : kept === null ? null : kept.passed || paidOnly;
    const refusal = kept !== null && !kept.passed ? refusalFor({ score: null, decidedAt: kept.decidedAt }) : undefined;
    return NextResponse.json({ ...base, signedIn: true, perDay: perDay(person), eligible, paidOnly, refusal, consented, left, frames: mine, maintainer: isAdmin(person), personBalance }, { headers: noStore });
  } catch (e) {
    console.error('remix status failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ ...base, ready: false, signedIn: true, eligible: invited ? true : null, consented: false, frames: [] }, { headers: noStore });
  }
}
