/**
 * Word for word: does a transcript of the converted audio say the speech? Pure (no imports), used by the server and
 * the tests. Words are compared after a light normalisation only: case, punctuation, apostrophes, dashes, and digits
 * against their spelled-out form ("tier 4" = "tier four"), since a transcription writes numbers either way. Anything
 * else that differs is a mismatch, shown to the performer, who may redo that sentence.
 */
export interface Sentence {
  n: number;
  text: string;
  words: string[];
}
export interface HeardWord {
  text: string;
  start: number;
  end: number;
}
export interface SentenceCheck {
  n: number;
  ok: boolean;
  /** Words of the speech that weren't heard, or were heard as something else. */
  missing: string[];
  /** Words heard that aren't in the speech. */
  extra: string[];
  /** Where the sentence is in the audio, from the words heard in it (seconds), or null if none were. */
  start: number | null;
  end: number | null;
}

const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

/** The form two words are compared in. */
export function norm(word: string): string {
  const w = word.toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
  const i = NUMBERS.indexOf(w);
  return i >= 0 ? String(i) : w;
}

/** A text's words, as spoken: dashes and other punctuation between words are not words. */
export function wordsOf(text: string): string[] {
  return text
    .replace(/[–—]/g, ' ')
    .split(/\s+/)
    .filter((w) => norm(w) !== '');
}

/** A speech's paragraphs, cut into sentences, numbered from 0. */
export function sentencesOf(paragraphs: string[]): Sentence[] {
  const out: Sentence[] = [];
  for (const p of paragraphs) {
    for (const s of p.split(/(?<=[.!?])\s+(?=\S)/)) {
      const text = s.trim();
      if (wordsOf(text).length) out.push({ n: out.length, text, words: wordsOf(text) });
    }
  }
  return out;
}

/**
 * Align the speech's words with the words heard (a word-level edit distance) and report each sentence. A sentence is
 * ok when every one of its words was heard as itself and nothing extra was heard inside it.
 */
export function checkSpeech(sentences: Sentence[], heard: HeardWord[]): SentenceCheck[] {
  const want = sentences.flatMap((s) => s.words.map((w) => ({ s: s.n, w, k: norm(w) })));
  const got = heard.map((h) => ({ ...h, k: norm(h.text) })).filter((h) => h.k !== '');
  const n = want.length;
  const m = got.length;
  // d[i][j]: the cost of aligning want[0..i) with got[0..j).
  const d = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const same = want[i - 1].k === got[j - 1].k ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j - 1] + same, d[i - 1][j] + 1, d[i][j - 1] + 1);
    }
  }
  // Keyed by sentence number: the sentences checked may be any of the speech's (one, when a sentence is redone).
  const out = new Map<number, SentenceCheck>(sentences.map((s) => [s.n, { n: s.n, ok: true, missing: [], extra: [], start: null, end: null }]));
  const of = (sn: number) => out.get(sn)!;
  const at = (sn: number, h: HeardWord) => {
    const c = of(sn);
    c.start = c.start === null ? h.start : Math.min(c.start, h.start);
    c.end = c.end === null ? h.end : Math.max(c.end, h.end);
  };
  let i = n;
  let j = m;
  // An extra word belongs to the sentence of the speech word next to it (the one after, or the last one).
  let nextSentence = sentences.length ? sentences[sentences.length - 1].n : 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (want[i - 1].k === got[j - 1].k ? 0 : 1)) {
      const w = want[i - 1];
      const h = got[j - 1];
      at(w.s, h);
      if (w.k !== h.k) {
        of(w.s).ok = false;
        of(w.s).missing.unshift(w.w);
        of(w.s).extra.unshift(h.text);
      }
      nextSentence = w.s;
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      const w = want[i - 1];
      of(w.s).ok = false;
      of(w.s).missing.unshift(w.w);
      nextSentence = w.s;
      i--;
    } else {
      const h = got[j - 1];
      of(nextSentence).ok = false;
      of(nextSentence).extra.unshift(h.text);
      at(nextSentence, h);
      j--;
    }
  }
  return sentences.map((s) => of(s.n));
}
