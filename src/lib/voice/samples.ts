import 'server-only';
import type postgres from 'postgres';
import { VOICE } from '../config';
import { offeredSpeeches, type Speech } from './speech';
import { presetChoices, voiceIdFor } from './presets';
import { elevenLabsBase } from './flag';
import { deleteHistoryItem, textToSpeech } from './elevenlabs';
import { READINGS_FUNDED, refusal, reserve } from './costs';
import { getAudio, putAudio, sampleKeyFor } from './store';
import { sha256Hex } from './ticket';

/**
 * Voice samples (the four-step recorder, Nate 2026-11-26: "Yes to first-line voice samples for every voice … so each
 * voice can be heard for every speech"): the first sentence of each offered speech read aloud in each saved voice, by
 * ElevenLabs text-to-speech with the readings' model and settings (a closed model by ElevenLabs; no person performing).
 * Made once, by an admin pressing the button, paid from the admins' pool like the readings; kept in the private voice
 * store, keyed by the speech, the voice and the sha256 of the line read (a changed first line is a new sample). Nothing
 * here is about a person: no person's words or audio.
 */
export interface SampleSpec { speech: Speech; presetId: string; candidate: number; name: string; text: string; key: string }

export const firstLine = (s: Speech) => s.sentences[0]?.text ?? '';

/** Every sample the recorder offers: each offered speech × each saved voice. */
export function sampleSpecs(): SampleSpec[] {
  const voices = presetChoices().choices.filter((c) => c.saved);
  return offeredSpeeches().flatMap((speech) =>
    voices.map((v) => {
      const text = firstLine(speech);
      return { speech, presetId: v.presetId, candidate: v.candidate, name: v.name, text, key: sampleKeyFor(speech.id, v.presetId, sha256Hex(new TextEncoder().encode(text))) };
    }),
  );
}

export const sampleCredits = (text: string) => Math.ceil(text.length * VOICE.rates.readingCreditsPerChar);

export async function sampleAudio(speechId: string, presetId: string): Promise<Uint8Array | null> {
  const spec = sampleSpecs().find((x) => x.speech.id === speechId && x.presetId === presetId);
  return spec ? getAudio(spec.key) : null;
}

/** Which samples are made (read from the store), and what the missing ones would cost. */
export async function sampleList() {
  const specs = sampleSpecs();
  const made = await Promise.all(specs.map(async (s) => Boolean(await getAudio(s.key))));
  const missing = specs.filter((_, i) => !made[i]);
  return {
    samples: specs.map((s, i) => ({ speechId: s.speech.id, presetId: s.presetId, ready: made[i] })),
    missing: missing.length,
    missingCredits: missing.reduce((a, s) => a + sampleCredits(s.text), 0),
  };
}

/** Make the missing samples, one call each, every call reserved and settled as a reading's is. Stops at the first refusal. */
export async function makeMissingSamples(sql: postgres.Sql, fid: number): Promise<{ made: number; failed: number; refused: string | null }> {
  let made = 0, failed = 0;
  for (const s of sampleSpecs()) {
    if (await getAudio(s.key)) continue;
    const voiceId = voiceIdFor(s.presetId, s.candidate, elevenLabsBase() !== 'https://api.elevenlabs.io');
    if (!voiceId || !s.text) {
      failed++;
      continue;
    }
    const estimatedCredits = sampleCredits(s.text);
    const no = await refusal(sql, fid, estimatedCredits, false, READINGS_FUNDED);
    if (no) return { made, failed, refused: no };
    const settle = await reserve(sql, fid, VOICE.models.reading, estimatedCredits, false, READINGS_FUNDED);
    let out: Awaited<ReturnType<typeof textToSpeech>>;
    try {
      out = await textToSpeech(s.text, voiceId);
    } catch {
      await settle({ kind: 'reading', ok: false, seconds: 0, characters: s.text.length, estimatedCredits, credits: null });
      failed++;
      continue;
    }
    await settle({ kind: 'reading', ok: true, seconds: 0, characters: s.text.length, estimatedCredits, credits: out.credits });
    await putAudio(s.key, out.audio);
    // As for readings: ElevenLabs writes its history item after answering, so try again while it isn't there yet.
    if (out.historyItemId) {
      for (const wait of [0, 1000, 3000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        if ((await deleteHistoryItem(out.historyItemId).catch(() => 'not-yet' as const)) === 'gone') break;
      }
    }
    made++;
  }
  return { made, failed, refused: null };
}
