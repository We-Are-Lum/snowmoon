import 'server-only';
import type postgres from 'postgres';
import { removeDraft, saveDraft, type DraftAudio } from './drafts';
import { getAudio } from './store';
import { speechById } from './speech';
import { correctionProblems, matchesSpeech, type Spoken } from './spoken';
import { sha256Hex } from './ticket';

/**
 * Correct the transcript of one's own improvised words (Nate, 2026-11-24: "The person can correct the transcript of
 * their own words before storyboarding; no model edits it"). The person sends one text per sentence; nothing else is
 * called (no model, no transcription). As "Check the words" does (recheck-draft.ts), the draft is kept again under a
 * new id with the corrected words and the correction in its history (when, by whom, the words before), the same
 * converted audio copied, and the old draft removed: studio_writer can't change a draft in place. Only before
 * storyboarding: a draft with a saved storyboard can't be corrected (its shots follow these sentences). The strip's
 * timings stay the transcript's: each sentence keeps its place in the audio.
 *
 * If the corrected words are the speech's, word for word, the take is labelled and credited word for word again.
 */
type Sql = postgres.Sql;
export type Result = { status: number; json: Record<string, unknown> };

export async function correctWords(sql: Sql, fid: number, draftId: string, raw: unknown, deps: { getAudio: (key: string) => Promise<Uint8Array | null> } = { getAudio }): Promise<Result> {
  if (!/^[0-9a-f-]{36}$/.test(draftId)) return { status: 404, json: { error: 'Not found' } };
  const [d] = await sql`select id, speech_id, preset_id, recipe from studio.voice_drafts where id = ${draftId} and fid = ${fid} and kind = 'performance' and published_at is null`;
  if (!d) return { status: 404, json: { error: 'Not found' } };
  const recipe = d.recipe as { spoken?: Spoken | null; [k: string]: unknown };
  const spoken = recipe.spoken;
  if (spoken?.kind !== 'improvised') return { status: 409, json: { error: 'Only an improvised take has words of your own to correct.' } };
  const [board] = await sql`select 1 from studio.voice_boards where draft_id = ${draftId} limit 1`;
  if (board) return { status: 409, json: { error: 'This take already has a storyboard: correct the words before storyboarding.' } };
  const sentences = (raw as { sentences?: unknown } | null)?.sentences;
  const problems = correctionProblems(spoken.sentences, sentences);
  if (problems.length) return { status: 400, json: { error: problems[0], problems } };
  const after = (sentences as string[]).map((t, i) => ({ n: spoken.sentences[i].n, text: t.replace(/\s+/g, ' ').trim() }));
  if (after.every((s, i) => s.text === spoken.sentences[i].text)) return { status: 400, json: { error: 'Nothing was changed.' } };
  const speech = speechById(d.speech_id as string);
  if (!speech) return { status: 400, json: { error: 'No such speech' } };

  const rows = await sql`select n, role, sentence, replaces_start::float8 as "replacesStart", replaces_end::float8 as "replacesEnd", storage_key, sha256, seconds::float8 as seconds from studio.voice_draft_audio where draft_id = ${draftId} order by n`;
  const audio: DraftAudio[] = [];
  for (const r of rows) {
    const bytes = await deps.getAudio(r.storage_key as string);
    if (!bytes || sha256Hex(bytes) !== r.sha256) return { status: 503, json: { error: 'The draft\'s audio could not be read. Try again in a moment.' } };
    audio.push({ role: r.role as DraftAudio['role'], sentence: (r.sentence as number | null) ?? null, replacesStart: (r.replacesStart as number | null) ?? null, replacesEnd: (r.replacesEnd as number | null) ?? null, mp3: bytes, sha256: r.sha256 as string, seconds: (r.seconds as number | null) ?? null });
  }
  const correction = { at: new Date().toISOString(), byFid: fid, sentences: spoken.sentences };
  const wordForWord = matchesSpeech(after, speech);
  const next = {
    ...recipe,
    // The words stay the strip's sentences, as corrected; if they are now the speech's, the take is word for word (its
    // label and credit), and the speech's own text is what it matches.
    spoken: { ...spoken, sentences: after, corrections: [...spoken.corrections, correction], wordForWord },
    kept: 'kept again with its words corrected by its performer',
    correctedFrom: draftId,
  };
  const id = await saveDraft(sql, { fid, kind: 'performance', speechId: d.speech_id as string, presetId: d.preset_id as string, recipe: next, audio });
  const removed = await removeDraft(sql, fid, draftId).catch(() => false);
  return { status: 200, json: { id, replaced: draftId, oldRemoved: removed, wordForWord, sentences: after } };
}
