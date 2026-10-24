/**
 * The fixed fields of the illustration check (owner, 2026-10-23): who's there (count and identity),
 * setting, action, time of day, what's wrong, and a verdict with one sentence why. Sent as a strict JSON
 * schema (structured output), so every answer has exactly these fields.
 */
export const PROBLEM_TYPES = ['reference_copy_in_crowd', 'contradicts_facts', 'stray_text', 'other'] as const;
export const VERDICTS = ['matches', 'partly', 'wrong'] as const;

export type ProblemType = (typeof PROBLEM_TYPES)[number];
export type Verdict = (typeof VERDICTS)[number];

export interface CheckAnswer {
  who: { count: number; identities: string[]; notes: string };
  setting: string;
  action: string;
  time_of_day: string;
  problems: { type: ProblemType; detail: string }[];
  verdict: Verdict;
  why: string;
}

export const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['who', 'setting', 'action', 'time_of_day', 'problems', 'verdict', 'why'],
  properties: {
    who: {
      type: 'object',
      additionalProperties: false,
      required: ['count', 'identities', 'notes'],
      properties: {
        count: { type: 'integer', description: 'How many people are visible.' },
        identities: { type: 'array', items: { type: 'string' }, description: 'Each named person and what identifies them, then the unnamed ones, grouped.' },
        notes: { type: 'string' },
      },
    },
    setting: { type: 'string' },
    action: { type: 'string' },
    time_of_day: { type: 'string' },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'detail'],
        properties: { type: { type: 'string', enum: [...PROBLEM_TYPES] }, detail: { type: 'string' } },
      },
    },
    verdict: { type: 'string', enum: [...VERDICTS] },
    why: { type: 'string', description: 'One sentence.' },
  },
} as const;

/** A parsed answer, or the reason it doesn't fit the fields. */
export function parseAnswer(text: string): CheckAnswer | string {
  let a: CheckAnswer;
  try {
    a = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return 'not JSON';
  }
  if (!a || typeof a !== 'object') return 'not an object';
  if (!a.who || !Number.isInteger(a.who.count) || !Array.isArray(a.who.identities)) return 'who is missing or malformed';
  for (const k of ['setting', 'action', 'time_of_day', 'why'] as const) if (typeof a[k] !== 'string') return `${k} is missing`;
  if (!Array.isArray(a.problems) || a.problems.some((p) => !PROBLEM_TYPES.includes(p?.type) || typeof p.detail !== 'string')) return 'problems is malformed';
  if (!VERDICTS.includes(a.verdict)) return 'verdict is not matches, partly or wrong';
  return a;
}

/** The order of the review page: wrong, then partly, then matches, then not checked; more problems first. */
export const VERDICT_RANK: Record<string, number> = { wrong: 0, partly: 1, matches: 2 };
export function worstFirst<T extends { verdict: string | null; problems: number; chapter: number; idx: number }>(a: T, b: T): number {
  const ra = a.verdict ? (VERDICT_RANK[a.verdict] ?? 3) : 3;
  const rb = b.verdict ? (VERDICT_RANK[b.verdict] ?? 3) : 3;
  return ra - rb || b.problems - a.problems || a.chapter - b.chapter || a.idx - b.idx;
}
