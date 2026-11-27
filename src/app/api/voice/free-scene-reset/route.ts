import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { voiceTestPerson } from '~/lib/voice/flag';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { RESET_WORDING as W } from '~/lib/voice/free-scene-reset';

/**
 * An admin resets a person's free Ephelion picture, for someone who loses theirs (Nate, 2026-11-27). Admins only, decided
 * here on the server (401 signed out, 404 to everyone else, as the other admin answers); studio.reset_free_scene removes the person's row,
 * made or not, and logs who reset it and when (NEXT_ephelion_scene_reset.sql). The person is a number: a FID, minus a
 * wallet account's number, or a Lens or Bluesky account's person number.
 */
export async function POST(request: Request) {
  const fid = voiceTestPerson(request) ?? (await getPerson(request));
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: W.notHere }, { status: 503 });
  const raw = String(((await request.json().catch(() => ({}))) as { person?: unknown }).person ?? '').trim();
  if (!/^-?[0-9]{1,19}$/.test(raw) || /^-?0+$/.test(raw)) return NextResponse.json({ error: W.badNumber }, { status: 400 });
  const person = BigInt(raw);
  if (person > 9223372036854775807n || person < -9223372036854775807n) return NextResponse.json({ error: W.badNumber }, { status: 400 });
  try {
    const [r] = await sql<{ ok: boolean }[]>`select studio.reset_free_scene(${person.toString()}::bigint, ${fid}::bigint) as ok`;
    return NextResponse.json(r?.ok ? { done: 'reset', message: W.done(raw) } : { done: 'nothing', message: W.nothing(raw) });
  } catch (e) {
    console.error('free picture reset failed', (e as Error).name);
    return NextResponse.json({ error: W.failed }, { status: 503 });
  }
}
