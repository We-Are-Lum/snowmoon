import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { VOICE } from '~/lib/config';
import { noStore, voicePerson, voiceReady } from '~/lib/voice/server';
import { speechById } from '~/lib/voice/speech';
import { presetRecipe, voiceIdFor } from '~/lib/voice/presets';
import { elevenLabsBase } from '~/lib/voice/flag';
import { deleteHistoryItem, textToSpeech } from '~/lib/voice/elevenlabs';
import { refusal, reserve } from '~/lib/voice/costs';
import { latestReading, readingAudio, saveDraft } from '~/lib/voice/drafts';
import { sha256Hex } from '~/lib/voice/ticket';

export const maxDuration = 300;

/** GET: the latest ready-made reading of a speech in a preset (MP3). */
export async function GET(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const q = new URL(request.url).searchParams;
  const r = await latestReading(sql, String(q.get('speech') ?? ''), String(q.get('preset') ?? ''));
  if (!r) return NextResponse.json({ error: 'No reading yet' }, { status: 404 });
  const mp3 = await readingAudio(sql, r.id);
  if (!mp3) return NextResponse.json({ error: 'No reading yet' }, { status: 404 });
  return new Response(Buffer.from(mp3), { headers: { 'content-type': 'audio/mpeg', ...noStore } });
}

/**
 * POST: make the ready-made reading (ElevenLabs text-to-speech of the speech's written words, in one preset), for
 * people who don't record. Made once per speech and preset, then kept; `again` makes a new one.
 */
export async function POST(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql || !voiceReady()) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { speechId?: string; presetId?: string; candidate?: number; again?: boolean };
  const speech = speechById(String(body.speechId ?? ''));
  const preset = presetRecipe(String(body.presetId ?? ''), Number(body.candidate));
  if (!speech || !preset) return NextResponse.json({ error: 'No such speech or voice' }, { status: 400 });
  const voiceId = voiceIdFor(preset.id, preset.candidate, elevenLabsBase() !== 'https://api.elevenlabs.io');
  if (!voiceId) return NextResponse.json({ error: 'That voice is a preview only: it can be used once Nate picks it and it is saved' }, { status: 400 });
  if (!body.again && (await latestReading(sql, speech.id, preset.id))) return NextResponse.json({ error: 'There is already a reading in this voice' }, { status: 409 });
  const text = speech.paragraphs.join('\n\n');
  const estimatedCredits = Math.ceil(text.length * VOICE.rates.readingCreditsPerChar);
  const no = await refusal(sql, who.fid, estimatedCredits, false);
  if (no) return NextResponse.json({ error: no }, { status: 429 });
  const settle = await reserve(sql, who.fid, VOICE.models.reading, estimatedCredits, false);
  let out: Awaited<ReturnType<typeof textToSpeech>>;
  try {
    out = await textToSpeech(text, voiceId);
  } catch {
    await settle({ kind: 'reading', ok: false, seconds: 0, characters: text.length, estimatedCredits, credits: null });
    return NextResponse.json({ error: 'The reading failed. Try again.' }, { status: 502 });
  }
  await settle({ kind: 'reading', ok: true, seconds: 0, characters: text.length, estimatedCredits, credits: out.credits });
  // As for conversions: ElevenLabs writes the history item after answering, so try again while it isn't there yet.
  let historyDeleted = false;
  if (out.historyItemId) {
    for (const wait of [0, 1000, 3000, 6000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      if ((await deleteHistoryItem(out.historyItemId).catch(() => 'not-yet' as const)) === 'gone') {
        historyDeleted = true;
        break;
      }
    }
  }
  const sha256 = sha256Hex(out.audio);
  const recipe = {
    provider: VOICE.provider,
    closedModel: true,
    model: VOICE.models.reading,
    settings: VOICE.readingSettings,
    outputFormat: VOICE.outputFormat,
    preset,
    speech: { id: speech.id, title: speech.title, source: speech.source, standIn: speech.standIn },
    textSha256: sha256Hex(new TextEncoder().encode(text)),
    audioSha256: sha256,
    credits: out.credits,
    historyDeleted,
    madeWith: 'snowmoon.party voice slice 1 (DRAFT)',
  };
  const id = await saveDraft(sql, { fid: who.fid, kind: 'reading', speechId: speech.id, presetId: preset.id, recipe, audio: [{ role: 'reading', sentence: null, replacesStart: null, replacesEnd: null, mp3: out.audio, sha256, seconds: null }] });
  return NextResponse.json({ id, recipe }, { headers: noStore });
}
