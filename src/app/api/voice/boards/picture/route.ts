import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { voiceTestOn } from '~/lib/voice/flag';
import { whereFrom } from '~/lib/images/countries';
import { boardSource, pictureBytes } from '~/lib/voice/board-store';
import { makeShotPicture, type ShotDeps } from '~/lib/voice/shot-picture';
import { standInPicture } from '~/lib/voice/stand-in-picture';

/**
 * POST: a picture for one shot (src/lib/voice/shot-picture.ts): the challenge's picture code, the person's own words,
 * a camera, the sheets. Nothing is stored until Keep. Real models for whom VOICE.realPictures lets (admins, 2026-11-21);
 * the local tests (VOICE_TEST_ON) use stand-in cards, never a model.
 * GET ?draft=&shot=&sha=: a kept picture, to its draft's own person only.
 */
async function deps(): Promise<ShotDeps> {
  if (voiceTestOn()) {
    return {
      real: false,
      consented: async () => true,
      reference: async () => Buffer.from('stand-in reference'),
      // The daily limits aren't exercised for stand-ins: no model, no cost.
      paid: (async (_sql: unknown, _fid: unknown, _req: unknown, job: { make: () => Promise<import('~/lib/images/fal').Made> }) => ({ ok: true, made: await job.make(), left: 99 })) as unknown as ShotDeps['paid'],
      make: async (_m, _prompt, _refs, _req, _worst, shot) => ({
        bytes: await standInPicture({ shotNo: shot.no, attempt: shot.attempt, description: shot.description, angleLabel: shot.angle, angleId: '', style: shot.style, characters: shot.characters }),
        contentType: 'image/png',
        seed: null,
        requestId: null,
        nsfw: false,
        costUsd: 0,
        settings: { standIn: true },
      }),
    };
  }
  const { realDeps } = await import('~/lib/chapter-pictures/pictures');
  const r = await realDeps();
  const { paidPicture } = await import('~/lib/images/paid');
  return { real: true, consented: r.consented, reference: r.reference, paid: paidPicture, make: (m, prompt, refs, request, worst) => r.makeAdded(m, prompt, refs, request, worst) };
}

export async function POST(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  // The country decides which closed models are offered, for this request only; it isn't kept.
  const r = await makeShotPicture(sql, who.fid, request, body, whereFrom(request.headers), await deps());
  return NextResponse.json(r.json, { status: r.status, headers: noStore });
}

export async function GET(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const q = new URL(request.url).searchParams;
  const draft = await boardSource(sql, who.fid, String(q.get('draft') ?? ''));
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const bytes = await pictureBytes(sql, draft.id, who.fid, String(q.get('shot') ?? ''), String(q.get('sha') ?? ''));
  if (!bytes) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const png = bytes[0] === 0x89;
  return new Response(Buffer.from(bytes), { headers: { 'content-type': png ? 'image/png' : 'image/jpeg', ...noStore } });
}
