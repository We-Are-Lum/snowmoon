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
  /**
   * The fix line (owner, 2026-10-24): the finding turned into what to draw, by a text model (scripts/fix-lines.ts), with
   * its recipe. Added after the check; it is what pre-fills a Regenerate note.
   */
  fix_line?: { text: string; model: string; prompt_file: string; prompt_sha256: string; date: string; cost_usd?: number };
}

/** Who drafted a pre-filled note, short enough for illustration_reviews.drafted_by (120 characters). */
export const draftedByOf = (checkModel: string, fixModel: string | null) => (fixModel ? `${checkModel} finding; ${fixModel} fix line` : `${checkModel} finding`).slice(0, 120);

/** Model ids as the page names them. */
export const MODEL_NAMES: Record<string, string> = { 'google/gemini-4-argon': 'Argon', 'openai/gpt-oss-120b': 'gpt-oss-120b' };

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
  // Placeholder answers (seen once in the pilot: every field "x") fit the schema but say nothing.
  for (const k of ['setting', 'action', 'time_of_day', 'why'] as const) if (a[k].trim().length < 4) return `${k} is a placeholder`;
  if (a.verdict !== 'matches' && a.problems.length === 0) return `verdict ${a.verdict} with no problem listed`;
  return a;
}

/**
 * The order of the review page (owner, 2026-10-24): wrong first; then partly with a double; then the rest of partly;
 * then matches; then not checked. Within each group, more problems first.
 */
export const hasDouble = (problems: { type: string }[] | undefined) => (problems ?? []).some((p) => p.type === 'reference_copy_in_crowd');
export function reviewGroup(verdict: string | null, double: boolean): number {
  if (verdict === 'wrong') return 0;
  if (verdict === 'partly') return double ? 1 : 2;
  if (verdict === 'matches') return 3;
  return 4;
}
export const GROUP_NAMES = ['wrong', 'partly-double', 'partly', 'matches', 'unchecked'] as const;
export function worstFirst<T extends { verdict: string | null; double?: boolean; problems: number; chapter: number; idx: number }>(a: T, b: T): number {
  return reviewGroup(a.verdict, !!a.double) - reviewGroup(b.verdict, !!b.double) || b.problems - a.problems || a.chapter - b.chapter || a.idx - b.idx;
}

/** How a note is credited, in the decision and in the redo's recipe (owner, 2026-10-24). */
export function noteCredit(d: { draftedNote: string | null; noteEdited: boolean | null; byFid: number }): string {
  if (!d.draftedNote) return `written by FID ${d.byFid}`;
  return d.noteEdited ? `drafted by the image check, edited and approved by FID ${d.byFid}` : `drafted by the image check, approved by FID ${d.byFid}`;
}
