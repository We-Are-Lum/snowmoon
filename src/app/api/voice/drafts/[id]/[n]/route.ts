import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { draftAudio } from '~/lib/voice/drafts';

/** One audio file of one of this person's own drafts, or of a shared ready-made reading (anyone else's reads as missing). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const { id, n } = await ctx.params;
  const mp3 = await draftAudio(sql, who.fid, id, Number(n));
  if (!mp3) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new Response(Buffer.from(mp3), { headers: { 'content-type': 'audio/mpeg', ...noStore } });
}
