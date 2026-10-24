/**
 * The fix pass (owner, 2026-10-24): every sentence the support check marks unsupported is re-cited to blocks that
 * support it, or cut, by the model that wrote it; then the program's checks run again (citations exist, quotes word
 * for word, the gate recomputed from the new citations) and the support check runs again, with context. Readers see
 * only sentences that pass; the rest stay in private/, marked, never shown.
 *
 * The pure steps live here (no model, no network) so they are tested with a stub (npm run test:glossary-explanations):
 *
 *   flagged(entry, verdicts)            the sentences to fix, with the checker's reason
 *   fixRequest(entries)                 the fix request after the cached book (the prompt is config/prompts/glossary-fix.md)
 *   parseFixes(answer)                  the model's answer: per sentence RECITE (new cites, quotes) or CUT, and why
 *   applyFixes(entry, verdicts, fixes)  each sentence with its status so far, the words never changed, and the log
 *   settle(record, recheck)             the final status: pass, cut or fail
 *   readable(record)                    what readers may see: passing sentences only
 */
import { CHAPTERS, chapterOf, gateOf, verifyExplanations, type Entry, type Quote, type Sentence } from './glossary-explain';
import type { Verdict } from './glossary-check';

export const FIX_PROMPT_FILE = 'config/prompts/glossary-fix.md';

export type Status = 'pass' | 'cut' | 'fail' | 'recheck';
export interface FixedSentence extends Sentence {
  n: number;
  status: Status;
  /** Present when the sentence was fixed or cut: what it was, what was done, and why. */
  fix?: {
    original: { cites: string[]; quotes: Quote[]; gate: number };
    checker_said: string;
    action: 'RECITE' | 'CUT' | 'NONE';
    why: string;
    /** Problems the program found with the new citations or quotes (a fix that fails them is not shown). */
    program: string[];
    recheck?: { supported: boolean; why: string };
  };
}
export interface FixedEntry {
  slug: string;
  term: string;
  sentences: FixedSentence[];
}
export interface Fix {
  slug: string;
  n: number;
  action: 'RECITE' | 'CUT';
  cites: string[];
  quotes: Quote[];
  why: string;
}

/** Sentences to fix: those the check marked unsupported (by n, 1-based), with its reason. */
export function flagged(e: Entry, verdicts: { n: number; supported: boolean; why: string }[]): { n: number; why: string }[] {
  return verdicts.filter((v) => !v.supported && v.n >= 1 && v.n <= e.sentences.length).map((v) => ({ n: v.n, why: v.why }));
}

/** The fix request: each entry's whole explanation (so the model sees the sentence in its place) and the ones to fix. */
export function fixRequest(items: { entry: Entry; fix: { n: number; why: string }[] }[]): string {
  const body = items.map(({ entry, fix }) => ({
    slug: entry.slug,
    term: entry.term,
    sentences: entry.sentences.map((s, i) => ({ n: i + 1, text: s.text, cites: s.cites })),
    fix: fix.map((f) => ({ n: f.n, checker_said: f.why })),
  }));
  return `ENTRIES TO FIX:\n${JSON.stringify(body, null, 1)}\n\nAnswer with the JSON object described above.`;
}

const id = (x: unknown) => String(x ?? '').trim().replace(/^\[|\]$/g, '');
export function parseFixes(raw: string): Fix[] {
  const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { fixes?: Record<string, unknown>[] };
  if (!Array.isArray(j.fixes)) throw new Error('no "fixes" list in the answer');
  return j.fixes.map((f) => ({
    slug: String(f.slug ?? ''),
    n: Number(f.n),
    action: /^RECITE$/i.test(String(f.action ?? '').trim()) ? 'RECITE' : 'CUT',
    cites: [...new Set((Array.isArray(f.cites) ? f.cites : []).map(id))].filter(Boolean),
    quotes: (Array.isArray(f.quotes) ? f.quotes : []).map((q) => ({ block: id((q as Quote).block), text: String((q as Quote).text ?? '') })),
    why: String(f.why ?? ''),
  }));
}

/**
 * Apply the fixes. A sentence the check supported passes as it is (if the program's checks pass). A flagged sentence:
 * CUT -> cut; RECITE -> new cites and quotes, gate recomputed, the program's checks again: a failure -> fail, else
 * "recheck" (it waits for the support check); no fix given -> fail. The words are never taken from the model.
 */
export function applyFixes(e: Entry, verdicts: Verdict[], fixes: Fix[], blocks: Map<string, { kind: string; content: string }>): FixedEntry {
  const flags = new Map(flagged(e, verdicts).map((f) => [f.n, f.why]));
  const sentences = e.sentences.map((s, i): FixedSentence => {
    const n = i + 1;
    const base: FixedSentence = { ...s, n, status: 'pass' };
    const programOf = (x: Sentence) => verifyExplanations([{ slug: e.slug, term: e.term, sentences: [x] }], blocks).map((p) => p.replace(/^.*?sentence 1: /, ''));
    if (!flags.has(n)) {
      const program = programOf(s);
      return program.length ? { ...base, status: 'fail', fix: { original: { cites: s.cites, quotes: s.quotes, gate: s.gate }, checker_said: '', action: 'NONE', why: 'fails the program checks', program } } : base;
    }
    const original = { cites: s.cites, quotes: s.quotes, gate: s.gate };
    const checker_said = flags.get(n)!;
    const f = fixes.find((x) => x.slug === e.slug && x.n === n);
    if (!f) return { ...base, status: 'fail', fix: { original, checker_said, action: 'NONE', why: 'no fix was given', program: [] } };
    if (f.action === 'CUT' || !f.cites.length) return { ...base, status: 'cut', fix: { original, checker_said, action: 'CUT', why: f.why, program: [] } };
    const valid = f.cites.filter((c) => Number.isFinite(chapterOf(c)));
    const next: Sentence = { text: s.text, cites: f.cites, quotes: f.quotes, gate: valid.length ? gateOf(valid) : CHAPTERS };
    const program = programOf(next);
    return { ...next, n, status: program.length ? 'fail' : 'recheck', fix: { original, checker_said, action: 'RECITE', why: f.why, program } };
  });
  return { slug: e.slug, term: e.term, sentences };
}

/** The sentences waiting for the support check, numbered as in the entry. */
export const toRecheck = (e: FixedEntry) => e.sentences.filter((s) => s.status === 'recheck');

/** Record the re-check: supported -> pass, otherwise (or no verdict) -> fail. */
export function settle(e: FixedEntry, verdicts: Verdict[]): FixedEntry {
  return {
    ...e,
    sentences: e.sentences.map((s) => {
      if (s.status !== 'recheck') return s;
      const v = verdicts.find((x) => x.n === s.n);
      const recheck = { supported: !!v?.supported, why: v ? v.why : 'no verdict returned' };
      return { ...s, status: recheck.supported ? 'pass' : 'fail', fix: { ...s.fix!, recheck } };
    }),
  };
}

/** What readers may see: the passing sentences only, as plain sentences (the record stays in private/). */
export function readable(e: FixedEntry): Entry {
  if (e.sentences.some((s) => s.status === 'recheck')) throw new Error(`${e.slug}: sentences still wait for the re-check`);
  return { slug: e.slug, term: e.term, sentences: e.sentences.filter((s) => s.status === 'pass').map(({ text, cites, quotes, gate }) => ({ text, cites, quotes, gate })) };
}

export const tally = (entries: FixedEntry[]) => {
  const all = entries.flatMap((e) => e.sentences);
  return {
    sentences: all.length,
    pass: all.filter((s) => s.status === 'pass').length,
    recited: all.filter((s) => s.fix?.action === 'RECITE' && s.status === 'pass').length,
    cut: all.filter((s) => s.status === 'cut').length,
    fail: all.filter((s) => s.status === 'fail').length,
    waiting: all.filter((s) => s.status === 'recheck').length,
  };
};
