/**
 * Recording a passage of a speech (Nate, 2026-11-27: "A passage counts as the person's one live take of that speech, at
 * least 3 sentences, judged the same as a whole take with its "Passage: sentences N–M" label always shown"; the
 * proposal: docs/proposals/ephelion-passages.md). Pure, for the page and the server alike.
 *
 * A passage is a run of the speech's sentences, `from` to `to` inclusive, in the speech's own numbering (`n`, from 0),
 * at least PASSAGE_MIN long. The whole speech is no passage (null). The script, the highlight, the time limit and the
 * word check cover only its sentences; the recipe keeps it beside the speech (`speech.passage`), so a check can be made
 * again; a take of it is that person's one live take of the speech, as a whole take is.
 */
export interface Passage {
  from: number;
  to: number;
}
export const PASSAGE_MIN = 3;

/** The label shown wherever a passage's take is (numbered from 1, as people count). */
export const passageLabel = (p: Passage) => `Passage: sentences ${p.from + 1}–${p.to + 1}`;

/**
 * A passage from what was sent: null for the whole speech (nothing sent, or every sentence), the passage, or 'bad' for
 * anything else (not whole numbers, out of the speech, backwards, or shorter than PASSAGE_MIN).
 */
export function readPassage(from: unknown, to: unknown, count: number): Passage | null | 'bad' {
  const blank = (v: unknown) => v === null || v === undefined || v === '';
  if (blank(from) && blank(to)) return null;
  const f = Number(from);
  const t = Number(to);
  if (!Number.isInteger(f) || !Number.isInteger(t) || f < 0 || t >= count || t < f || t - f + 1 < PASSAGE_MIN) return 'bad';
  if (f === 0 && t === count - 1) return null;
  return { from: f, to: t };
}

/** A recipe's passage, if it has a well-formed one (anything else reads as the whole speech). */
export function recipePassage(speech: unknown): Passage | null {
  const p = (speech as { passage?: unknown } | null | undefined)?.passage as { from?: unknown; to?: unknown } | undefined;
  if (!p || !Number.isInteger(p.from) || !Number.isInteger(p.to)) return null;
  return { from: p.from as number, to: p.to as number };
}

/** The passage's sentences (their own numbers kept), or all of them. */
export function passageSentences<T extends { n: number }>(sentences: T[], p: Passage | null): T[] {
  return p ? sentences.filter((x) => x.n >= p.from && x.n <= p.to) : sentences;
}

/** A speech seen through its passage: only those sentences (the rest of the speech is as it was). */
export function withPassage<S extends { sentences: { n: number }[] }>(speech: S, p: Passage | null): S {
  return p ? { ...speech, sentences: passageSentences(speech.sentences, p) } : speech;
}

/**
 * A passage's time limit: the speech's, scaled to the passage's words, with 15 seconds to spare, and never more than the
 * speech's own limit.
 */
export function passageMaxSeconds(speechMax: number, passageWords: number, speechWords: number): number {
  if (speechWords <= 0 || passageWords >= speechWords) return speechMax;
  return Math.min(speechMax, Math.ceil((speechMax * passageWords) / speechWords) + 15);
}

/** A recipe's passage label ("Passage: sentences N–M"), or null for a whole take. */
export const recipePassageLabel = (speech: unknown): string | null => {
  const p = recipePassage(speech);
  return p ? passageLabel(p) : null;
};

/** Words in a text, as the page counts them. */
export const wordsIn = (t: string) => t.split(/\s+/).filter(Boolean).length;
