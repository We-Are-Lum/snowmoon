import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { noStore, voicePerson, voiceReady } from '~/lib/voice/server';
import { deleteTranscript, speechToText } from '~/lib/voice/elevenlabs';
import { getAudio } from '~/lib/voice/store';
import { recheckDraft } from '~/lib/voice/recheck-draft';

export const maxDuration = 60;

/**
 * POST: check the words again on one of this person's drafts kept without its word check (src/lib/voice/recheck-draft.ts):
 * one transcription of its own converted audio, the transcript deleted at ElevenLabs; the draft is kept again with the
 * check, under a new id, and the old one removed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql || !voiceReady()) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  try {
    const r = await recheckDraft(sql, who.fid, (await params).id, {
      getAudio,
      transcribe: (audio, keyterms) => speechToText(audio, keyterms),
      deleteTranscript,
      sleep: (ms) => new Promise((s) => setTimeout(s, ms)),
    });
    return NextResponse.json(r.json, { status: r.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: 'The word check could not be kept just now. Try again.' }, { status: 503 });
  }
}
