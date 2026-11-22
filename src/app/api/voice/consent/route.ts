import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { recordVoiceConsent } from '~/lib/voice/consent';

/** Agreeing to the own-voice screen (once per wording). Each conversion still needs its own tick. */
export async function POST(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { sha256?: string };
  try {
    await recordVoiceConsent(sql, who.fid, String(body.sha256 ?? ''));
  } catch {
    return NextResponse.json({ error: 'The wording changed. Read it again.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}
