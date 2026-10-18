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
import { gptReserveUsd, REMIX_GPT } from '~/lib/remix/model';
import { gatewayToken } from '~/lib/chat/model';

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
  const gpt = shot?.model === 'gpt';
  const keys = process.env.REMIX_TEST_FAKES === '1' && testFakes() ? true : gpt ? Boolean(gatewayToken(request)) : Boolean(process.env.FAL_KEY);
  const ready = Boolean(remixGenerateOn() && sql && keys && frameStorageReady());
  const pictures = shot ? remixPictures({ role: 'layout' } as never, shot).length : 0;
  const base = {
    ready,
    free: remixFreeOn(),
    // The model this shot is drawn with; a closed one is named with its maker and that it is closed.
    model: gpt
      ? { name: REMIX_GPT.model.name, licence: REMIX_GPT.model.licence, host: REMIX_GPT.model.host, maker: REMIX_GPT.model.maker, closed: true }
      : { name: IMAGES.editModel.name, licence: IMAGES.editModel.licence, host: IMAGES.editModel.host },
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
    const reserveUsd = gpt ? gptReserveUsd() : REMIX.reserveUsd(pictures || REMIX.maxPictures);
    const [consented, left, kept, frames] = await Promise.all([
      hasConsented(person),
      generationsLeft(sql, person, reserveUsd),
      invited || person < 0 ? Promise.resolve(null) : keptValue(sql, person),
      // Version 2's panel also lists the person's remixes of the same shot of version 1, the open-weight version it was
      // redrawn from (owner, 2026-10-18, decision 2d); newest first, each marked with its version.
      shot
        ? Promise.all([myFrames(sql, person, version, shot.id), shot.openFrom && shot.openFrom !== version ? myFrames(sql, person, shot.openFrom, shot.id) : Promise.resolve([])]).then(([own, open]) =>
            [...own, ...open].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          )
        : Promise.resolve([]),
    ]);
    const mine = frames.map((f) => ({ id: f.id, url: f.imageUrl, words: f.ownWords, hidden: f.hidden, hiddenRole: f.hiddenRole, at: f.createdAt, page: `/remix/${f.id}`, version: f.versionId, model: (f.recipe as { model?: { name?: string; maker?: string; closed?: boolean } }).model ?? null }));
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
