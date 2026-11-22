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
  /** The speech's names heard by sound, not spelled the same (for example "Aphelion" for "Ephelion"): shown, not failed. */
  bySound: { expected: string; heard: string }[];
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

/**
 * A rough sound key, for the speech's names only (Nate, 2026-11-21: "Lord Ephelion" came back "Mortifelian"):
 * lower case, letters only, common spellings of one sound folded (ph=f, ck=k, gh silent, c=k, z=s, v=f, d=t, b=p, g=k),
 * vowels and h, w, y dropped, doubled sounds merged. "Ephelion" and "Aphelion" share a key; so do "Dreadknot" and
 * "Dreadnought" within the allowed difference.
 */
export function soundKey(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  w = w.replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/gh/g, '').replace(/q/g, 'k').replace(/x/g, 'ks');
  w = w.replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/z/g, 's').replace(/v/g, 'f').replace(/d/g, 't').replace(/b/g, 'p').replace(/g/g, 'k');
  w = w.replace(/[aeiouhwy]/g, '');
  return w.replace(/(.)\1+/g, '$1');
}
const editDistance = (a: string, b: string) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), d[i - 1][j] + 1, d[i][j - 1] + 1);
  return d[a.length][b.length];
};
/** Whether two spellings sound alike enough: keys at most 2 apart for 6 or more sounds, 1 for 4–5, equal below. */
export function soundsAlike(a: string, b: string): boolean {
  const x = soundKey(a);
  const y = soundKey(b);
  if (!x || !y) return false;
  const n = Math.max(x.length, y.length);
  return editDistance(x, y) <= (n >= 6 ? 2 : n >= 4 ? 1 : 0);
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
export function checkSpeech(sentences: Sentence[], heard: HeardWord[], names: string[] = []): SentenceCheck[] {
  // Which of the speech's words are names: a word of a listed name, with or without a possessive "'s".
  const nameWords = new Set(names.flatMap((n) => wordsOf(n).map(norm)));
  const isName = (w: string) => nameWords.has(norm(w)) || nameWords.has(norm(w).replace(/s$/, ''));
  const want = sentences.flatMap((s) => s.words.map((w) => ({ s: s.n, w, k: norm(w), name: isName(w) })));
  let got: (HeardWord & { k: string; sound?: string })[] = heard.map((h) => ({ ...h, k: norm(h.text) })).filter((h) => h.k !== '');
  // A two-word name heard as one or two other words ("Lord Ephelion" as "Mortifelian"): read as the name, by sound.
  for (const n of names.map(wordsOf).filter((w) => w.length === 2)) {
    const key = n.join('');
    const next: typeof got = [];
    for (let i = 0; i < got.length; i++) {
      const one = got[i];
      const two = got[i + 1];
      const spelled = norm(one.text) === norm(n[0]) && two && norm(two.text) === norm(n[1]);
      const bare = (t: string) => t.replace(/[^\p{L}\p{N}'’ -]/gu, '');
      if (!spelled && norm(one.text) !== norm(n[0]) && norm(one.text) !== norm(n[1]) && soundsAlike(one.text, key)) {
        // One word for the whole name.
        const mid = (one.start + one.end) / 2;
        next.push({ ...one, text: n[0], k: norm(n[0]), end: mid, sound: bare(one.text) }, { ...one, text: n[1], k: norm(n[1]), start: mid, sound: bare(one.text) });
      } else if (!spelled && two && norm(one.text) !== norm(n[0]) && (soundsAlike(one.text, n[0]) || soundsAlike(two.text, n[1])) && soundsAlike(one.text + two.text, key)) {
        // Two words for the name, at least one of them close to its part.
        next.push({ ...one, text: n[0], k: norm(n[0]), sound: bare(`${one.text} ${two.text}`) }, { ...two, text: n[1], k: norm(n[1]), sound: bare(`${one.text} ${two.text}`) });
        i++;
      } else next.push(one);
    }
    got = next;
  }
  const same = (a: (typeof want)[number], b: (typeof got)[number]) => a.k === b.k || (a.name && soundsAlike(a.w, b.text));
  const n = want.length;
  const m = got.length;
  // d[i][j]: the cost of aligning want[0..i) with got[0..j).
  const d = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = same(want[i - 1], got[j - 1]) ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j - 1] + cost, d[i - 1][j] + 1, d[i][j - 1] + 1);
    }
  }
  // Keyed by sentence number: the sentences checked may be any of the speech's (one, when a sentence is redone).
  const out = new Map<number, SentenceCheck>(sentences.map((s) => [s.n, { n: s.n, ok: true, bySound: [], missing: [], extra: [], start: null, end: null }]));
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
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (same(want[i - 1], got[j - 1]) ? 0 : 1)) {
      const w = want[i - 1];
      const h = got[j - 1];
      at(w.s, h);
      const heardAs = h.sound ?? (w.k !== h.k ? h.text.replace(/[^\p{L}\p{N}'’ -]/gu, '') : null);
      if (same(w, h) && heardAs) {
        if (!of(w.s).bySound.some((b) => b.heard === heardAs)) of(w.s).bySound.unshift({ expected: w.w, heard: heardAs });
      } else if (w.k !== h.k) {
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
