import 'server-only';
import type postgres from 'postgres';
import { VOICE } from '../config';
import { joinTimeline } from './board';
import { checkSpeech, type HeardWord } from './match';
import { speechById } from './speech';
import { recipePassage, withPassage } from './passage';
import { refusal, reserve } from './costs';
import { removeDraft, saveDraft } from './drafts';
import { sha256Hex, signTicket } from './ticket';
import type { CheckTicket } from './take-flow';
import { improvisedTimeline, spokenFor } from './spoken';

/**
 * Check the words again on a draft that was kept without its word check (Nate, 2026-11-22: "the no-SQL version"): the
 * transcription failed, or the day's allowance was used up, when the conversion came back. Its own converted audio is
 * read from private storage and transcribed once (never a take: only converted audio is ever stored, and its sha256
 * must be the recipe's convertedSha256), the transcript deleted at ElevenLabs right after, and a new draft is kept with
 * the check and the strip, the same converted audio copied under the new id. The old draft is then removed, audio and
 * all. studio_writer can't update a draft in place, so the id changes; a draft with no check can't be storyboarded or
 * published, so nothing points at the old id.
 */
type Sql = postgres.Sql;
export type Result = { status: number; json: Record<string, unknown> };

export interface RecheckDeps {
  getAudio: (key: string) => Promise<Uint8Array | null>;
  transcribe: (audio: Uint8Array, keyterms: string[]) => Promise<{ words: HeardWord[]; credits: number | null; transcriptionId: string | null }>;
  deleteTranscript: (id: string) => Promise<'gone' | 'not-yet'>;
  sleep: (ms: number) => Promise<void>;
}

interface Recipe {
  check: unknown;
  takes: { role: string; takeSha256: string; convertedSha256: string; seconds: number; transcriptDeleted?: boolean }[];
  [k: string]: unknown;
}

export async function recheckDraft(sql: Sql, fid: number, draftId: string, deps: RecheckDeps): Promise<Result> {
  if (!/^[0-9a-f-]{36}$/.test(draftId)) return { status: 404, json: { error: 'Not found' } };
  // Only the person's own unpublished performance, kept without a check: anything else reads as missing.
  const [d] = await sql`select id, speech_id, preset_id, recipe from studio.voice_drafts where id = ${draftId} and fid = ${fid} and kind = 'performance' and published_at is null`;
  if (!d) return { status: 404, json: { error: 'Not found' } };
  const recipe = d.recipe as Recipe;
  if (recipe.check !== null) return { status: 409, json: { error: 'This draft already has its word check.' } };
  const rows = await sql`select n, role, storage_key, sha256, seconds::float8 as seconds from studio.voice_draft_audio where draft_id = ${draftId} order by n`;
  const take = recipe.takes?.[0];
  if (rows.length !== 1 || rows[0].role !== 'take' || !take || rows[0].sha256 !== take.convertedSha256) return { status: 409, json: { error: 'This draft can\'t be checked again: record and convert it again.' } };
  const found = speechById(d.speech_id as string);
  // A passage's draft is checked again against its passage only (passage.ts).
  const speech = found ? withPassage(found, recipePassage(recipe.speech)) : null;
  if (!speech) return { status: 400, json: { error: 'No such speech' } };
  const seconds = Number(rows[0].seconds ?? take.seconds ?? 0);
  const estimate = Math.ceil(seconds * VOICE.rates.transcribeCreditsPerSecond);
  const no = await refusal(sql, fid, estimate, false);
  if (no) return { status: 429, json: { error: no } };
  const audio = await deps.getAudio(rows[0].storage_key as string);
  // Only the converted speech is sent: the stored file must be the recipe's converted audio, and never its take.
  if (!audio || sha256Hex(audio) !== take.convertedSha256 || take.convertedSha256 === take.takeSha256) return { status: 503, json: { error: 'The draft\'s audio could not be read. Try again in a moment.' } };
  const settle = await reserve(sql, fid, VOICE.models.transcribe, estimate, false);
  let heard: Awaited<ReturnType<RecheckDeps['transcribe']>>;
  try {
    heard = await deps.transcribe(audio, speech.names);
  } catch {
    await settle({ kind: 'transcribe', ok: false, seconds, estimatedCredits: estimate, credits: null, usd: 0 });
    return { status: 502, json: { error: 'The word check failed. Try again.' } };
  }
  await settle({ kind: 'transcribe', ok: true, seconds, estimatedCredits: estimate, credits: heard.credits, usd: (seconds / 3600) * VOICE.rates.transcribeUsdPerHour });
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
        // tried again after the next wait; the recipe says whether it went
      }
    }
  }
  // The check and the strip, made as when a take is kept (keep-converted.ts), with no redone sentences.
  const checks = checkSpeech(speech.sentences, heard.words, speech.names);
  const joined = joinTimeline({ words: heard.words, seconds }, []);
  const spans = checkSpeech(speech.sentences, joined.words, speech.names);
  const length = Math.max(joined.seconds, (joined.words.at(-1)?.end ?? 0) + 0.3);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const timeline = {
    seconds: r2(length),
    words: joined.words.map((w) => ({ text: w.text, start: r2(w.start), end: r2(w.end) })),
    sentences: spans.map((x, i) => ({
      n: x.n,
      start: x.start ?? spans.slice(0, i).reverse().find((y) => y.end !== null)?.end ?? 0,
      end: x.end ?? spans.slice(i + 1).find((y) => y.start !== null)?.start ?? length,
    })),
  };
  const unmatched = checks.filter((x) => !x.ok).map((x) => x.n);
  // Improvising (Nate, 2026-11-24): word for word keeps the speech's strip; otherwise the transcript's (spoken.ts).
  const imp = unmatched.length ? improvisedTimeline(joined) : null;
  const spoken = spokenFor(speech, !imp, imp?.sentences ?? [], VOICE.models.transcribe);
  const check = { sentences: speech.sentences.length, matched: speech.sentences.length - unmatched.length, unmatched, bySound: checks.flatMap((x) => x.bySound.map((b) => ({ sentence: x.n, ...b }))), names: speech.names };
  const next = {
    ...recipe,
    transcribeModel: VOICE.models.transcribe,
    takes: [{ ...take, transcriptDeleted }, ...recipe.takes.slice(1)],
    check,
    timeline: imp ? imp.timeline : timeline,
    spoken,
    kept: 'checked again later, replacing a draft kept without its word check',
    checkedAgain: { from: draftId, at: new Date().toISOString(), credits: heard.credits },
  };
  const id = await saveDraft(sql, {
    fid,
    kind: 'performance',
    speechId: d.speech_id as string,
    presetId: d.preset_id as string,
    recipe: next,
    audio: [{ role: 'take', sentence: null, replacesStart: null, replacesEnd: null, mp3: audio, sha256: take.convertedSha256, seconds }],
  });
  const removed = await removeDraft(sql, fid, draftId).catch(() => false);
  // The check's signed record, as the transcription route gives one, so a page that still has this take open can keep
  // it with redone sentences ("Use this one").
  const now = Date.now();
  const ticket: CheckTicket = { v: 1, kind: 'check', fid, convertedSha256: take.convertedSha256, model: VOICE.models.transcribe, words: heard.words, transcriptDeleted, issuedAt: now, expiresAt: now + VOICE.ticketMinutes * 60_000 };
  return { status: 200, json: { id, replaced: draftId, oldRemoved: removed, matched: check.matched, sentences: check.sentences, checks, check: signTicket(ticket), transcriptDeleted, credits: heard.credits, estimateCredits: estimate } };
}
