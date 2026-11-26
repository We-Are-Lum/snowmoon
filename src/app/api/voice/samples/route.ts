import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { noStore, voicePerson, voiceReady } from '~/lib/voice/server';
import { makeMissingSamples, sampleAudio, sampleList } from '~/lib/voice/samples';

export const maxDuration = 300;

/**
 * The voice samples (src/lib/voice/samples.ts), behind the voice pages' own gate (voicePerson: 404 for anyone it doesn't
 * let in).
 * GET ?speech=&preset=: one sample (MP3). GET with neither: which samples are made, whether this person may make the
 * missing ones (admins only, decided here, never in the page: P5b), and what they would cost.
 * POST: an admin makes the missing samples (testers get 404, as if the route weren't there).
 */
export async function GET(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const q = new URL(request.url).searchParams;
  const speech = q.get('speech');
  const preset = q.get('preset');
  if (speech || preset) {
    const mp3 = await sampleAudio(String(speech ?? ''), String(preset ?? ''));
    if (!mp3) return NextResponse.json({ error: 'No sample yet' }, { status: 404 });
    return new Response(Buffer.from(mp3), { headers: { 'content-type': 'audio/mpeg', ...noStore } });
  }
  return NextResponse.json({ ...(await sampleList()), canMake: isAdmin(who.fid) }, { headers: noStore });
}

export async function POST(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  if (!isAdmin(who.fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  if (!sql || !voiceReady()) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const out = await makeMissingSamples(sql, who.fid);
  return NextResponse.json({ ...out, ...(await sampleList()) }, { status: out.refused ? 429 : 200, headers: noStore });
}
