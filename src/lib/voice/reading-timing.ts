import 'server-only';
import type postgres from 'postgres';
import { VOICE } from '../config';
import type { Timeline } from './board';
import { checkSpeech, type HeardWord } from './match';
import { speechById } from './speech';
import { refusal, reserve } from './costs';

/**
 * A ready-made reading's word timings (Nate, 2026-11-21: "word timings for a reading … one transcription of the existing
 * reading"): made once, by transcribing the reading's own audio with the speech's names as key terms, the first time
 * someone storyboards it. The same allowance as every voice call (the daily cap, and the stop once today's calls ran more
 * than 20% over their estimates), the transcript deleted at ElevenLabs right after (with retries), and the result kept in
 * studio.voice_reading_timings. Measured on 2026-11-21: 55 credits for a 144 s reading (0.4 a second estimated).
 */
type Sql = postgres.Sql;
export type Result = { status: number; json: Record<string, unknown> };

/** A reading's length from its MP3 (128 kb/s, as VOICE.outputFormat asks) and the credits one transcription is estimated at. */
export function readingEstimate(audio: { bytes?: number | null; seconds?: number | null }[]) {
  const a = audio[0];
  const seconds = a?.seconds ?? (a?.bytes ? (a.bytes * 8) / 128_000 : 0);
  return { seconds: Math.round(seconds * 10) / 10, credits: Math.ceil(seconds * VOICE.rates.transcribeCreditsPerSecond) };
}

export interface TimingDeps {
  getAudio: (key: string) => Promise<Uint8Array | null>;
  transcribe: (audio: Uint8Array, keyterms: string[]) => Promise<{ words: HeardWord[]; credits: number | null; transcriptionId: string | null }>;
  deleteTranscript: (id: string) => Promise<'gone' | 'not-yet'>;
  sleep: (ms: number) => Promise<void>;
}

/** The strip from heard words: each sentence's span, falling back to its neighbours' where none of its words were heard. */
export function timelineFrom(words: HeardWord[], seconds: number, sentences: Parameters<typeof checkSpeech>[0], names: string[]) {
  const checks = checkSpeech(sentences, words, names);
  const length = Math.max(seconds, (words.at(-1)?.end ?? 0) + 0.3);
  const r = (x: number) => Math.round(x * 100) / 100;
  const timeline: Timeline = {
    seconds: r(length),
    words: words.map((w) => ({ text: w.text, start: r(w.start), end: r(w.end) })),
    sentences: checks.map((x, i) => ({
      n: x.n,
      start: x.start ?? checks.slice(0, i).reverse().find((y) => y.end !== null)?.end ?? 0,
      end: x.end ?? checks.slice(i + 1).find((y) => y.start !== null)?.start ?? length,
    })),
  };
  const unmatched = checks.filter((x) => !x.ok).map((x) => x.n);
  return { timeline, check: { sentences: checks.length, matched: checks.length - unmatched.length, unmatched } };
}

export async function timeReading(sql: Sql, fid: number, draftId: string, deps: TimingDeps): Promise<Result> {
  if (!/^[0-9a-f-]{36}$/.test(draftId)) return { status: 404, json: { error: 'Not found' } };
  const [d] = await sql`select id, kind, speech_id from studio.voice_drafts where id = ${draftId}`;
  if (!d || d.kind !== 'reading') return { status: 404, json: { error: 'Not found' } };
  const [done] = await sql`select 1 from studio.voice_reading_timings where draft_id = ${draftId}`;
  if (done) return { status: 200, json: { ok: true, already: true } };
  const speech = speechById(d.speech_id as string);
  if (!speech) return { status: 400, json: { error: 'No such speech' } };
  const audio = await sql`select storage_key as key, bytes, seconds::float8 as seconds from studio.voice_draft_audio where draft_id = ${draftId} order by n limit 1`;
  if (!audio[0]) return { status: 404, json: { error: 'The reading has no audio' } };
  const est = readingEstimate(audio as unknown as { bytes: number; seconds: number | null }[]);
  const no = await refusal(sql, fid, est.credits, false);
  if (no) return { status: 429, json: { error: no } };
  const bytes = await deps.getAudio(audio[0].key as string);
  if (!bytes) return { status: 503, json: { error: 'The reading could not be read. Try again in a moment.' } };
  const settle = await reserve(sql, fid, VOICE.models.transcribe, est.credits, false);
  let heard: Awaited<ReturnType<TimingDeps['transcribe']>>;
  try {
    heard = await deps.transcribe(bytes, speech.names);
  } catch {
    await settle({ kind: 'transcribe', ok: false, seconds: est.seconds, estimatedCredits: est.credits, credits: null });
    return { status: 502, json: { error: 'The timing failed. Try again.' } };
  }
  await settle({ kind: 'transcribe', ok: true, seconds: est.seconds, estimatedCredits: est.credits, credits: heard.credits });
  // ElevenLabs keeps each transcript by its id: deleted right after, with the same waits as a history item.
  let transcriptDeleted = false;
  if (heard.transcriptionId) {
    for (const wait of [0, 1000, 3000, 6000]) {
      if (wait) await deps.sleep(wait);
      try {
        if ((await deps.deleteTranscript(heard.transcriptionId)) === 'gone') {
          transcriptDeleted = true;
          break;
        }
      } catch {
        // tried again after the next wait; the row says whether it went
      }
    }
  }
  const { timeline, check } = timelineFrom(heard.words, est.seconds, speech.sentences, speech.names);
  await sql`insert into studio.voice_reading_timings (draft_id, made_by, model, timeline, check_result, credits, transcript_deleted)
    values (${draftId}, ${fid}, ${VOICE.models.transcribe}, ${sql.json(timeline as unknown as postgres.JSONValue)}, ${sql.json(check)}, ${heard.credits}, ${transcriptDeleted})
    on conflict (draft_id) do nothing`;
  return { status: 200, json: { ok: true, credits: heard.credits, estimateCredits: est.credits, matched: check.matched, sentences: check.sentences, transcriptDeleted } };
}
