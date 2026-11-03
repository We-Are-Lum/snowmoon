import { checkMomentQuote, firstSentence, momentSource, type MomentQuoteRefusal } from './quote';
import { SPEAKER_LINE, checkNote } from '../sheet-help/no-story';
import { pronounSlips } from '../make/cast';

/**
 * "Find a moment"'s checks on the model's picks (docs/proposals/remix-moments.md 2.2, 2.3 and 3.3). Pure: the passages
 * are passed in as read from the database by book search, never the model's or the device's copy. The flow that calls
 * the model is src/lib/sheet-help/find-moment.ts; check:principles P2k, P2l and P9a and test:find-moment run these.
 *
 * A pick line is `c<ch>-b<idx> | <the exact sentence or sentences> | <why, or nothing>`. It is dropped unless:
 * - its id was among the passages search returned (the model can't bring in a passage from memory);
 * - its chapter is within the limit (the person's furthest chapter, or 32 only when they turned on "include later
 *   chapters");
 * - its quote passes checkMomentQuote against that block (one changed word, a quote across two blocks, half a
 *   sentence, a heading: all dropped);
 * - it isn't a repeat of a passage already picked.
 * The quote shown is the block's own text cut at the checked offsets, not the model's string.
 * At most `max` are kept, in the model's order; the rest are counted as extra and never shown.
 *
 * The "why" is the model's words, so it is held apart from the book's: at most whyMaxWords words, no quote marks, no
 * run of copyRunWords words that appears in any passage it was sent, no story text (checkNote), no pronoun the book
 * doesn't use. A "why" that fails is dropped (the quote, already checked, is still shown); it is never stored.
 */
export interface SearchedBlock {
  id: string;
  chapter: number;
  idx: number;
  kind: string;
  content: string;
}

export interface Moment {
  id: string;
  chapter: number;
  idx: number;
  /** The book's words: the block's text at the checked offsets. */
  quote: string;
  /** The model's short reason, in its own words, or null. Shown labelled as AI, outside the quote; never stored. */
  why: string | null;
  /** 'pick': the model chose it from search; 'search': a top search hit's first sentence, used when picks fell short. */
  from: 'pick' | 'search';
  /** Past the furthest chapter the person has opened (only when they chose to include later chapters). */
  pastRead: boolean;
}

export type DropReason = 'bad-line' | 'not-in-search' | 'past-limit' | 'repeat' | MomentQuoteRefusal;
export type WhyRefusal = 'too-long' | 'quoted' | 'copies-book' | 'story' | 'pronouns';

export interface PickLine {
  id: string;
  quote: string;
  why: string;
}

const LINE = /^\s*\[?(c\d{1,2}-b\d{1,4})\]?\s*\|\s*(.*?)\s*\|\s*(.*?)\s*$/;
const LINE_NO_WHY = /^\s*\[?(c\d{1,2}-b\d{1,4})\]?\s*\|\s*(.*?)\s*$/;

/** The model's reply, one pick per line. Lines that aren't picks are counted, never guessed at. */
export function parsePicks(text: string): { lines: PickLine[]; bad: number } {
  const lines: PickLine[] = [];
  let bad = 0;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    if (!raw.trim()) continue;
    const m = raw.match(LINE) ?? raw.match(LINE_NO_WHY);
    if (!m) {
      bad++;
      continue;
    }
    lines.push({ id: m[1], quote: m[2], why: (m[3] ?? '').trim() });
  }
  return { lines, bad };
}

const chapterOf = (id: string) => Number(id.slice(1, id.indexOf('-b')));

export interface PickOptions {
  /** The search limit: the furthest chapter opened, or 32 with "include later chapters". */
  limit: number;
  /** The furthest chapter the person has opened (for the "past where you've read" mark). */
  upTo: number;
  max: number;
}

/** Check each line against the block search returned for it. Whys are not checked here (see checkWhy). */
export function checkPicks(lines: PickLine[], passages: Map<string, SearchedBlock>, o: PickOptions): { moments: Moment[]; dropped: { id: string; reason: DropReason }[]; extra: number } {
  const moments: Moment[] = [];
  const dropped: { id: string; reason: DropReason }[] = [];
  let extra = 0;
  const seen = new Set<string>();
  for (const l of lines) {
    const b = passages.get(l.id);
    if (!b) {
      dropped.push({ id: l.id, reason: 'not-in-search' });
      continue;
    }
    if (b.chapter > o.limit || chapterOf(l.id) > o.limit) {
      dropped.push({ id: l.id, reason: 'past-limit' });
      continue;
    }
    if (seen.has(l.id)) {
      dropped.push({ id: l.id, reason: 'repeat' });
      continue;
    }
    const c = checkMomentQuote(b, l.quote);
    if (!c.ok) {
      dropped.push({ id: l.id, reason: c.reason });
      continue;
    }
    seen.add(l.id);
    if (moments.length >= o.max) {
      extra++;
      continue;
    }
    moments.push({ id: b.id, chapter: b.chapter, idx: b.idx, quote: c.text, why: l.why || null, from: 'pick', pastRead: b.chapter > o.upTo });
  }
  return { moments, dropped, extra };
}

const QUOTE_MARK = /["“”«»„‹›]|(?:^|[\s(])['‘][^'’]+['’](?=[\s.,;:!?)]|$)/;
const words = (s: string) => (momentSource(s).replace(/<[^>]+>/g, ' ').toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).map((w) => w.replace(/’/g, "'"));

/** The first run of `n` words the two texts share (case and punctuation ignored), or null. */
export function sharedRun(a: string, b: string, n: number): string | null {
  const wa = words(a);
  if (wa.length < n) return null;
  const wb = words(b);
  const runs = new Set<string>();
  for (let i = 0; i + n <= wb.length; i++) runs.add(wb.slice(i, i + n).join(' '));
  for (let i = 0; i + n <= wa.length; i++) {
    const r = wa.slice(i, i + n).join(' ');
    if (runs.has(r)) return r;
  }
  return null;
}

/** A "why": the model's own words, apart from the book's. `own` is what the person wrote (they may be quoted back). */
export function checkWhy(why: string, sent: string[], own: string, o: { maxWords: number; runWords: number }): { ok: true } | { ok: false; reason: WhyRefusal; detail: string } {
  const n = words(why).length;
  if (n > o.maxWords) return { ok: false, reason: 'too-long', detail: `${n} words` };
  if (QUOTE_MARK.test(why)) return { ok: false, reason: 'quoted', detail: why.slice(0, 80) };
  for (const s of sent) {
    const r = sharedRun(why, s, o.runWords);
    if (r) return { ok: false, reason: 'copies-book', detail: r };
  }
  // A line for a character ("Bai: see you in battle") is dialogue, whatever the coach's note check allows.
  if (SPEAKER_LINE.test(why)) return { ok: false, reason: 'story', detail: 'a speaker line' };
  const note = checkNote(why, own);
  if (!note.ok) return { ok: false, reason: 'story', detail: note.reasons.map((r) => r.reason).join(', ') };
  const slips = pronounSlips(why);
  if (slips.length) return { ok: false, reason: 'pronouns', detail: slips.map((s) => `${s.name}: ${s.wrote}`).join('; ') };
  return { ok: true };
}

/** Too few picks survived: fill from the top search hits' first whole sentence, labelled "From search", with no why. */
export function fillFromSearch(moments: Moment[], ranked: SearchedBlock[], o: PickOptions & { min: number }): Moment[] {
  const out = [...moments];
  const have = new Set(out.map((m) => m.id));
  for (const b of ranked) {
    if (out.length >= o.min) break;
    if (have.has(b.id) || b.chapter > o.limit) continue;
    const s = firstSentence(b);
    if (!s) continue;
    have.add(b.id);
    out.push({ id: b.id, chapter: b.chapter, idx: b.idx, quote: s, why: null, from: 'search', pastRead: b.chapter > o.upTo });
  }
  return out;
}

/**
 * The rule every shown result must keep, whatever the flow did (test:find-moment, check:principles P2k, P2l, P9a):
 * each quote is exactly its block's words at a block that search returned within the limit; each why passes checkWhy.
 */
export function momentResultProblems(moments: Moment[], passages: Map<string, SearchedBlock>, o: PickOptions & { min: number; maxWords: number; runWords: number; pastLimit: boolean }): string[] {
  const problems: string[] = [];
  if (moments.length > o.max) problems.push(`${moments.length} moments shown, more than ${o.max}`);
  const ids = new Set<string>();
  for (const m of moments) {
    const b = passages.get(m.id);
    if (!b) {
      problems.push(`${m.id}: not a passage search returned`);
      continue;
    }
    if (ids.has(m.id)) problems.push(`${m.id}: shown twice`);
    ids.add(m.id);
    const c = checkMomentQuote(b, m.quote);
    if (!c.ok) problems.push(`${m.id}: the quote is not the book's exact words (${c.reason})`);
    if (m.chapter > o.limit || b.chapter > o.limit) problems.push(`${m.id}: past the chapter limit (${o.limit})`);
    if (!o.pastLimit && m.chapter > o.upTo) problems.push(`${m.id}: past the furthest chapter opened (${o.upTo}) without "include later chapters"`);
    if (m.pastRead !== m.chapter > o.upTo) problems.push(`${m.id}: "past where you've read" mark is wrong`);
    if (m.why !== null) {
      if (m.from !== 'pick') problems.push(`${m.id}: a "From search" result carries model words`);
      const w = checkWhy(m.why, [...passages.values()].map((p) => p.content), '', { maxWords: o.maxWords, runWords: o.runWords });
      if (!w.ok) problems.push(`${m.id}: its why fails (${w.reason}: ${w.detail})`);
    }
  }
  return problems;
}

/**
 * One reply, screened: parsed, each pick checked against its block, each why checked (a failed why is dropped, its
 * quote kept). What the flow (src/lib/sheet-help/find-moment.ts) does with every model reply before the guard; also
 * what check:principles P2k, P2l and P9a run on their recorded reply.
 */
export function screenPicks(
  text: string,
  passages: Map<string, SearchedBlock>,
  o: PickOptions & { maxWords: number; runWords: number },
  own: string,
): { moments: Moment[]; dropped: { id: string; reason: DropReason }[]; whyDropped: { id: string; reason: WhyRefusal }[]; bad: number; extra: number } {
  const { lines, bad } = parsePicks(text);
  const c = checkPicks(lines, passages, o);
  const sent = [...passages.values()].map((p) => p.content);
  const whyDropped: { id: string; reason: WhyRefusal }[] = [];
  const moments = c.moments.map((m) => {
    if (m.why === null) return m;
    const w = checkWhy(m.why, sent, own, { maxWords: o.maxWords, runWords: o.runWords });
    if (w.ok) return m;
    whyDropped.push({ id: m.id, reason: w.reason });
    return { ...m, why: null };
  });
  return { moments, dropped: c.dropped, whyDropped, bad, extra: c.extra };
}
