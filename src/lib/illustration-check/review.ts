import 'server-only';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';
import { checkJobs, type CheckJob } from './jobs';
import { worstFirst, type CheckAnswer } from './schema';

/**
 * The owner's review of the seeded images (/you/illustrations; owner, 2026-10-23). Each item is a job with its
 * passage, its image, the vision check's latest answer and the owner's latest decision, worst first: wrong, then
 * partly, then matches, then not checked; within each, more problems first.
 *
 * Where things are kept (NEXT_illustration_review): the check's answers in studio.illustration_checks (uploaded by
 * scripts/check-illustrations.ts --upload), the decisions in studio.illustration_reviews (append-only; the latest
 * per job counts). Neither is public. Without a database (a local build), the answers are read from the newest file
 * in private/illustration-check/ (gitignored), and decisions can't be saved.
 */
type Sql = postgres.Sql;

export type Decision = 'keep' | 'regenerate' | 'drop';
export const DECISIONS: readonly Decision[] = ['keep', 'regenerate', 'drop'];
export const NOTE_MAX = 1000;

export interface ReviewDecision {
  decision: Decision;
  note: string | null;
  byFid: number;
  at: string;
  imageSha256: string | null;
  checkRun: string | null;
}

export interface ReviewItem {
  id: string;
  chapter: number;
  idx: number;
  passage: { idx: number; text: string; target: boolean }[];
  dateline: string | null;
  image: { url: string; width: number; height: number; sha256: string } | null;
  excluded: string | null;
  recipe: string;
  prompt: string;
  cast: string[];
  check: { run: string; model: string; answer: CheckAnswer } | null;
  verdict: string | null;
  problems: number;
  decision: ReviewDecision | null;
  /** The decision the redo already wrote into the job file, if any. */
  inJobFile: CheckJob['review'];
}

type CheckRow = { run: string; job_id: string; model: string; answer: CheckAnswer };

const missingTable = (e: unknown) => /does not exist/.test(String((e as Error)?.message ?? e));

/** The latest check answer per job: the database, or the newest local result file without one. */
async function latestChecks(sql: Sql | null): Promise<Map<string, CheckRow>> {
  if (sql) {
    try {
      const rows = await sql<CheckRow[]>`select distinct on (job_id) run, job_id, model, answer from studio.illustration_checks order by job_id, created_at desc`;
      return new Map(rows.map((r) => [r.job_id, r]));
    } catch (e) {
      if (!missingTable(e)) throw e;
      return new Map();
    }
  }
  const dir = path.join(process.cwd(), 'private', 'illustration-check');
  if (!existsSync(dir)) return new Map();
  const out = new Map<string, CheckRow>();
  // Oldest first, so a newer run's answer replaces an older one.
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const rec = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { run: string; recipe: { model: { gateway_id: string } }; results: { job: string; answer: CheckAnswer | null }[] };
    for (const r of rec.results ?? []) if (r.answer) out.set(r.job, { run: rec.run, job_id: r.job, model: rec.recipe.model.gateway_id, answer: r.answer });
  }
  return out;
}

async function latestDecisions(sql: Sql | null): Promise<{ stored: boolean; byJob: Map<string, ReviewDecision> }> {
  if (!sql) return { stored: false, byJob: new Map() };
  try {
    const rows = await sql<{ job_id: string; decision: Decision; note: string | null; by_fid: string; decided_at: Date; image_sha256: string | null; check_run: string | null }[]>`
      select distinct on (job_id) job_id, decision, note, by_fid, decided_at, image_sha256, check_run
      from studio.illustration_reviews order by job_id, decided_at desc, id desc`;
    return {
      stored: true,
      byJob: new Map(rows.map((r) => [r.job_id, { decision: r.decision, note: r.note, byFid: Number(r.by_fid), at: new Date(r.decided_at).toISOString(), imageSha256: r.image_sha256, checkRun: r.check_run }])),
    };
  } catch (e) {
    if (!missingTable(e)) throw e;
    return { stored: false, byJob: new Map() };
  }
}

export async function reviewItems(sql: Sql | null): Promise<{ items: ReviewItem[]; canSave: boolean }> {
  const [checks, decisions] = await Promise.all([latestChecks(sql), latestDecisions(sql)]);
  const items = checkJobs().map((j): ReviewItem => {
    const c = checks.get(j.id) ?? null;
    return {
      id: j.id,
      chapter: j.chapter,
      idx: j.idx,
      passage: j.passage.map((b) => ({ idx: b.idx, text: b.text, target: b.target })),
      dateline: j.dateline,
      image: j.image ? { url: j.image.url, width: j.image.width, height: j.image.height, sha256: j.image.sha256 } : null,
      excluded: j.excluded,
      recipe: j.recipeFile,
      prompt: j.prompt,
      cast: j.cast.map((m) => m.name),
      check: c ? { run: c.run, model: c.model, answer: c.answer } : null,
      verdict: c?.answer.verdict ?? null,
      problems: c?.answer.problems.length ?? 0,
      decision: decisions.byJob.get(j.id) ?? null,
      inJobFile: j.review,
    };
  });
  return { items: items.sort(worstFirst), canSave: decisions.stored };
}

/** Adds the owner's decision (a new row; earlier ones stay). The caller has checked the owner. */
export async function saveDecision(sql: Sql, d: { jobId: string; decision: Decision; note: string | null; byFid: number; imageSha256: string | null; checkRun: string | null }) {
  await sql`insert into studio.illustration_reviews ${sql({ job_id: d.jobId, decision: d.decision, note: d.note, by_fid: d.byFid, image_sha256: d.imageSha256, check_run: d.checkRun })}`;
}
