import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES, REMIX, remixFreeOn, remixGenerateOn } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import { keptValue } from '~/lib/images/neynar';
import { GATE_WORDING, openToEveryone } from '~/lib/images/gate';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { balanceUsd, prepaidOpen, priceUsd } from '~/lib/wallet/credits';
import { generationsLeft, perDay } from '~/lib/remix/limits';
import { remixPictures, testFakes } from '~/lib/remix/make';
import { frameStorageReady, isMaintainer, myFrames } from '~/lib/remix/frames';
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
    shot: shot ? { id: shot.id, remixable: Boolean(shot.hasCamera && shot.prompt), pictures } : null,
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
      invited || person < 0 ? Promise.resolve(null) : keptValue(sql, person),
      shot ? myFrames(sql, person, version, shot.id) : Promise.resolve([]),
    ]);
    const mine = frames.map((f) => ({ id: f.id, url: f.imageUrl, words: f.ownWords, hidden: f.hidden, hiddenRole: f.hiddenRole, at: f.createdAt, page: `/remix/${f.id}` }));
    if (person < 0) {
      const open = prepaidOpen() && openToEveryone().open;
      const prepaid = { balanceUsd: await balanceUsd(sql, -person), priceUsd: priceUsd(reserveUsd), markup: IMAGES.prepaid.markup };
      return NextResponse.json(
        { ...base, signedIn: true, eligible: open, refusal: open ? undefined : prepaidOpen() ? GATE_WORDING.notOpen : IMAGE_WORDING.prepaid.notOpen, consented, left, prepaid, frames: mine, maintainer: false },
        { headers: noStore },
      );
    }
    const eligible = invited ? true : kept === null ? null : kept >= IMAGES.neynarMinScore;
    const refusal = eligible === false && kept !== null ? GATE_WORDING.below(kept) : undefined;
    return NextResponse.json({ ...base, signedIn: true, perDay: perDay(person), eligible, refusal, consented, left, frames: mine, maintainer: isMaintainer(person) }, { headers: noStore });
  } catch (e) {
    console.error('remix status failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ ...base, ready: false, signedIn: true, eligible: invited ? true : null, consented: false, frames: [] }, { headers: noStore });
  }
}
