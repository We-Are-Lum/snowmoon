import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { voiceTestOn } from '~/lib/voice/flag';
import { whereFrom } from '~/lib/images/countries';
import { takesOn } from '~/lib/voice/publish-deps';
import { freeSceneState, makeFreeScene, type SceneDeps } from '~/lib/voice/free-scene';
import { standInPicture } from '~/lib/voice/stand-in-picture';

/**
 * The free picture of one's own scene (Nate, 2026-11-26; src/lib/voice/free-scene.ts). GET: whether it is made. POST
 * {description}: make it. The local tests use a stand-in card (no model, no cost), with the real claim and records.
 */
async function deps(): Promise<SceneDeps> {
  if (voiceTestOn()) {
    return {
      real: false,
      reference: async () => (await import('sharp')).default({ create: { width: 400, height: 600, channels: 3, background: '#b8b4ac' } }).png().toBuffer(),
      paid: (async (_sql: unknown, _fid: unknown, _req: unknown, job: { checkText: string; make: () => Promise<import('~/lib/images/fal').Made> }) =>
        /\bREFUSE-ME\b/.test(job.checkText) ? { ok: false, status: 422, error: 'refused', extra: { reason: 'refused' } }
        : /\bFAIL-ME\b/.test(job.checkText) ? { ok: false, status: 502, error: 'failed', extra: { reason: 'failed' } }
        : { ok: true, made: await job.make(), left: 9 }) as unknown as SceneDeps['paid'],
      make: async (_m, _prompt, _refs, _req, _worst, description) => ({
        bytes: await standInPicture({ shotNo: 1, attempt: 1, description, angleLabel: 'Lord Ephelion, his own scene', angleId: 'wide', style: null, characters: ['Lord Ephelion'] }),
        contentType: 'image/png', seed: null, requestId: null, nsfw: false, costUsd: 0, settings: { standIn: true },
      }),
    };
  }
  const { realDeps } = await import('~/lib/chapter-pictures/pictures');
  const r = await realDeps();
  const { paidPicture } = await import('~/lib/images/paid');
  return { real: true, reference: r.reference, paid: paidPicture, make: (m, prompt, refs, request, worst) => r.makeAdded(m, prompt, refs, request, worst) };
}

export async function GET(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql || !takesOn()) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  return NextResponse.json(await freeSceneState(sql, who.fid), { headers: noStore });
}

export async function POST(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  if (!takesOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const r = await makeFreeScene(sql, who.fid, request, await request.json().catch(() => ({})), whereFrom(request.headers), await deps());
  return NextResponse.json(r.json, { status: r.status, headers: noStore });
}
