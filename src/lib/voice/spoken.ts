import { VOICE } from '../config';
import { speechById, type Speech } from './speech';
import { passageSentences, recipePassage } from './passage';
import type { TimedWord, Timeline } from './board';

/**
 * Improvising (Nate, 2026-11-24): "People needn't stick word for word to the speech; they may improvise around its
 * theme … the storyboard's spoken words are that transcript: what they actually said."
 *
 * A take is "word for word" when the word check finds every sentence of the speech (after any redone sentence); any
 * other take is improvised on the speech, and its spoken words are the transcript of the converted take (scribe_v3, as
 * the word check), split into sentences here. The person may correct that transcript (their own words; no model edits
 * it): each correction is kept in the recipe, with the words before and after, by whom and when.
 *
 * recipe.spoken:
 *   { kind: 'word-for-word' }                                                     the speech's own sentences
 *   { kind: 'improvised', on: { id, title, version }, sentences: [{ n, text }],   the person's words, by sentence
 *     from: 'transcript', transcribeModel, corrections: [{ at, byFid, sentences }] }
 * A draft kept before this (no recipe.spoken) reads as word for word, as it was then.
 */
export interface SpokenSentence {
  n: number;
  text: string;
}
export type Spoken =
  | { kind: 'word-for-word' }
  | {
      kind: 'improvised';
      on: { id: string; title: string; version: number };
      sentences: SpokenSentence[];
      from: 'transcript';
      transcribeModel: string | null;
      corrections: { at: string; byFid: number; sentences: SpokenSentence[] }[];
      /** Set when the performer's corrected words are the speech's, word for word: labelled and credited so. */
      wordForWord?: boolean;
    };

/** At most this long a whole take may be: 2 minutes (Nate), longer only where VOICE.takeMaxSecondsFor says. */
export const takeMaxSeconds = (speechId: string) => VOICE.takeMaxSecondsFor[speechId] ?? VOICE.takeMaxSeconds;

/**
 * The transcript's sentences: a sentence ends at a word ending in . ! or ? (scribe writes punctuation), at a pause of
 * at least VOICE.sentencePauseSeconds, or after VOICE.sentenceMaxWords words, so an unpunctuated take still splits.
 */
export function transcriptSentences(words: TimedWord[]): { n: number; text: string; start: number; end: number }[] {
  const out: { n: number; text: string; start: number; end: number }[] = [];
  let cur: TimedWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({ n: out.length, text: cur.map((w) => w.text).join(' ').replace(/\s+([,.;:!?])/g, '$1').trim(), start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  words.forEach((w, i) => {
    if (!w.text.trim()) return;
    cur.push(w);
    const next = words[i + 1];
    const pause = next ? next.start - w.end : 0;
    if (/[.!?]["”’)]?$/.test(w.text) || pause >= VOICE.sentencePauseSeconds || cur.length >= VOICE.sentenceMaxWords) flush();
  });
  flush();
  return out;
}

/** An improvised take's timeline: the strip's sentences are the transcript's. */
export function improvisedTimeline(joined: { words: TimedWord[]; seconds: number }): { timeline: Timeline; sentences: SpokenSentence[] } {
  const r = (x: number) => Math.round(x * 100) / 100;
  const words = joined.words.map((w) => ({ text: w.text, start: r(w.start), end: r(w.end) }));
  const length = Math.max(joined.seconds, (words.at(-1)?.end ?? 0) + 0.3);
  const ss = transcriptSentences(words);
  // Each sentence runs from its first word to the next sentence's first word (the last to the end), so the strip has
  // no gaps, as the word-for-word strip's spans don't.
  const sentences = ss.map((s, i) => ({ n: s.n, start: i === 0 ? 0 : r(s.start), end: i === ss.length - 1 ? r(length) : r(ss[i + 1].start) }));
  return { timeline: { seconds: r(length), words, sentences } as Timeline, sentences: ss.map((s) => ({ n: s.n, text: s.text })) };
}

/** The draft's spoken words, by sentence: the person's (improvised, as corrected) or the speech's (word for word). */
export function spokenSentences(recipe: { spoken?: Spoken | null; speech?: { id?: string; passage?: unknown } | null }): SpokenSentence[] {
  if (recipe.spoken?.kind === 'improvised') return recipe.spoken.sentences;
  const sp = recipe.speech?.id ? speechById(recipe.speech.id) : null;
  // A passage's take: only its sentences (passage.ts).
  return passageSentences(sp?.sentences ?? [], recipePassage(recipe.speech)).map((x) => ({ n: x.n, text: x.text }));
}

/** Improvised: the performer's own words (not the speech's, word for word): labelled, credited and published so. */
export const isImprovised = (recipe: { spoken?: Spoken | null }) => recipe.spoken?.kind === 'improvised' && !recipe.spoken.wordForWord;

/** The take's label (Nate): "word for word", or "improvised on 'Doing fine' (version 2)". */
export function takeLabel(recipe: { spoken?: Spoken | null }): string {
  const s = recipe.spoken;
  return s?.kind === 'improvised' && !s.wordForWord ? `improvised on '${s.on.title}' (version ${s.on.version})` : 'word for word';
}

/**
 * The words' credit (Nate): word for word keeps today's credit (the speech's own line, closing.ts); improvised:
 * "Words by @name, improvising on 'Doing fine' · [the speech's credit]". The speech's credit: an invented speech's
 * writers' line, or the book's ("from Snowmoon by Vitalik Buterin (c13-b64)").
 */
export function improvisedCredit(performer: string | null, speech: { title: string; credit: string | null; block: string | null }): string {
  const by = performer ? `@${performer}` : 'a reader (not named, at their wish)';
  const theirs = speech.credit ?? `from Snowmoon by Vitalik Buterin${speech.block ? ` (${speech.block})` : ''}`;
  return `Words by ${by}, improvising on '${speech.title}' · ${theirs}`;
}

/** Normalised words, for "does this match the speech word for word" (as the word check compares them). */
const norm = (t: string) => t.toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

/**
 * Whether corrected words are the speech's, word for word (then the take is word for word again). Compared as the
 * word check compares: case, punctuation and apostrophes aside.
 */
export function matchesSpeech(sentences: SpokenSentence[], speech: Speech): boolean {
  return norm(sentences.map((s) => s.text).join(' ')).join(' ') === norm(speech.sentences.map((s) => s.text).join(' ')).join(' ');
}

/** The spoken record of a take, from its word check. */
export function spokenFor(speech: Speech, wordForWord: boolean, improvised: SpokenSentence[], transcribeModel: string | null): Spoken {
  if (wordForWord) return { kind: 'word-for-word' };
  return { kind: 'improvised', on: { id: speech.id, title: speech.title, version: speech.version }, sentences: improvised, from: 'transcript', transcribeModel, corrections: [] };
}

/** Problems with a correction (empty: it can be kept): one text per sentence, each the person's, none empty or too long. */
export function correctionProblems(before: SpokenSentence[], after: unknown): string[] {
  if (!Array.isArray(after) || after.length !== before.length) return [`Send one text for each of the ${before.length} sentences.`];
  const p: string[] = [];
  after.forEach((t, i) => {
    if (typeof t !== 'string' || !t.trim()) p.push(`Sentence ${i + 1} is empty.`);
    else if (t.length > VOICE.sentenceMaxChars) p.push(`Sentence ${i + 1} is longer than ${VOICE.sentenceMaxChars} characters.`);
  });
  return p;
}
