import { DEEP_FUNDING } from '../config';
import { BOOK, askedNodes, makersIn, type CreditGraph } from './graph';

/**
 * The deep funding test's jurors (the plan: 5 to 9 people with no entries for that character; each answers about six
 * questions on the site, without seeing the model answers). Pure functions; the page and API are behind
 * DEEP_FUNDING.jurors (off), and the answers live in studio.juror_answers (NEXT_deep_funding_jurors.sql).
 *
 * - Who may be a juror for a character: a FID (> 0) that made no version in its graph and has no entry for it
 *   (`entrants`: everyone with a stored eligibility decision for that character, eligible or not).
 * - Their questions: DEEP_FUNDING.questions.compare comparisons ("for the final, which mattered more, A or B, and how
 *   many times more?"; A and B are versions other than the final) and DEEP_FUNDING.questions.originality originality
 *   questions ("how much of this version is new?"), drawn from the graph by a fixed shuffle seeded with the character
 *   and the juror's FID, so a juror always sees the same questions, and different jurors cover different pairs.
 * - Answers carry no model output: the questions are built from the graph alone.
 */

export interface CompareQuestion {
  no: number;
  kind: 'compare';
  a: string;
  b: string;
}
export interface OriginalityQuestion {
  no: number;
  kind: 'originality';
  node: string;
}
export type JurorQuestion = CompareQuestion | OriginalityQuestion;

export function jurorAllowed(fid: number, g: CreditGraph, entrants: ReadonlySet<number>): { ok: true } | { ok: false; why: string } {
  if (!(fid > 0)) return { ok: false, why: 'Jurors sign in with Farcaster' };
  if (makersIn(g).has(fid)) return { ok: false, why: 'You made a version this character’s final is built on, so you can’t judge it' };
  if (entrants.has(fid)) return { ok: false, why: 'You have an entry for this character, so you can’t judge it' };
  return { ok: true };
}

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function jurorQuestions(g: CreditGraph, fid: number, counts = DEEP_FUNDING.questions): JurorQuestion[] {
  const rnd = seeded(`${g.character}:${g.final}:${fid}`);
  const versions = askedNodes(g).map((n) => n.id).sort();
  const others = versions.filter((id) => id !== g.final && id !== BOOK);
  const pairs: [string, string][] = [];
  for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) pairs.push([others[i], others[j]]);
  const out: JurorQuestion[] = [];
  for (const [a, b] of shuffle(pairs, rnd).slice(0, counts.compare)) {
    const flip = rnd() < 0.5;
    out.push({ no: out.length + 1, kind: 'compare', a: flip ? b : a, b: flip ? a : b });
  }
  for (const node of shuffle(versions, rnd).slice(0, counts.originality)) out.push({ no: out.length + 1, kind: 'originality', node });
  return out;
}

export type AnswerInput =
  | { no: number; choice: 'a' | 'b'; times: number }
  | { no: number; share: number };

/** Checks one answer against the juror's question list. Times: 1 (the same) up to DEEP_FUNDING.maxRatio; share: 0..1. */
export function checkAnswer(qs: JurorQuestion[], body: unknown): { ok: true; q: JurorQuestion; answer: AnswerInput } | { ok: false; why: string } {
  const o = (body ?? {}) as { no?: unknown; choice?: unknown; times?: unknown; share?: unknown };
  const q = qs.find((x) => x.no === o.no);
  if (!q) return { ok: false, why: 'No such question' };
  if (q.kind === 'compare') {
    if (o.choice !== 'a' && o.choice !== 'b') return { ok: false, why: 'Choose A or B' };
    if (typeof o.times !== 'number' || !Number.isFinite(o.times) || o.times < 1 || o.times > DEEP_FUNDING.maxRatio) return { ok: false, why: `How many times more: 1 to ${DEEP_FUNDING.maxRatio}` };
    return { ok: true, q, answer: { no: q.no, choice: o.choice, times: Math.round(o.times * 100) / 100 } };
  }
  if (typeof o.share !== 'number' || !Number.isFinite(o.share) || o.share < 0 || o.share > 1) return { ok: false, why: 'How much is new: 0 to 100%' };
  return { ok: true, q, answer: { no: q.no, share: Math.round(o.share * 1000) / 1000 } };
}
