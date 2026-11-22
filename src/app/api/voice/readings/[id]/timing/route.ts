import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson, voiceReady } from '~/lib/voice/server';
import { deleteTranscript, speechToText } from '~/lib/voice/elevenlabs';
import { getAudio } from '~/lib/voice/store';
import { timeReading } from '~/lib/voice/reading-timing';

export const maxDuration = 60;

/**
 * POST: time a ready-made reading once (src/lib/voice/reading-timing.ts): one transcription of its own audio, measured,
 * the transcript deleted at ElevenLabs; then anyone the switch lets in can storyboard it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql || !voiceReady()) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const r = await timeReading(sql, who.fid, (await params).id, {
    getAudio,
    transcribe: (audio, keyterms) => speechToText(audio, keyterms),
    deleteTranscript,
    sleep: (ms) => new Promise((s) => setTimeout(s, ms)),
  });
  return NextResponse.json(r.json, { status: r.status, headers: noStore });
}
