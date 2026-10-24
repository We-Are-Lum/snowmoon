/**
 * The redo after the owner's image review (owner, 2026-10-23: "The actual redo happens Sunday, with illustrate.py,
 * appending the owner's note to the job's prompt and crediting it to the owner in the recipe"). Built, not run.
 *
 * Step 1 (this script): copy the owner's latest decision per job from studio.illustration_reviews (or from a JSON
 * export, --decisions=FILE: [{ job_id, decision, note, by_fid, decided_at, image_sha256, check_run }]) into the job
 * files, so the review is saved with each job and shows a person reviewed it:
 *   - every decision: the job gets "review": { decision, note, by_fid, at, image_sha256, check };
 *   - regenerate: the job also gets "redo": { note, by_fid, at } (a new one only if the note or date changed);
 *   - drop: published.json lists the job under "excluded" with the owner's reason, and its image leaves "images".
 * Without --write it only prints what it would change. Writing the job files and committing them makes the decisions
 * and notes public in the repository: run it only when the owner has said so.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/illustration-redo.ts            the plan, nothing written
 *   npx tsx --env-file-if-exists=.env.local scripts/illustration-redo.ts --write    write the job files
 *
 * Step 2 (scripts/redo-c2.py; owner, 2026-10-24: "Redos use (c) v2"): render only the jobs with a redo not yet done
 * with Qwen-Image-Edit-2511, the front-view crop of each character's sheet and the location plate, the note appended
 * to the prompt, the recipe crediting the note as the owner approved it ("owner_note"). Step 3: the owner looks at
 * the new pictures. (scripts/illustrate.py --redo still works for the local klein model.)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkJob, type JobReview } from '../src/lib/illustration-check/jobs';
import { noteCredit } from '../src/lib/illustration-check/schema';

const ROOT = process.cwd();
const write = process.argv.includes('--write');
const decisionsFile = process.argv.find((a) => a.startsWith('--decisions='))?.slice('--decisions='.length);

interface Row {
  job_id: string;
  decision: 'keep' | 'regenerate' | 'drop';
  note: string | null;
  by_fid: number | string;
  decided_at: string | Date;
  image_sha256: string | null;
  check_run: string | null;
  drafted_note?: string | null;
  drafted_by?: string | null;
  note_edited?: boolean | null;
}

async function latest(): Promise<Row[]> {
  if (decisionsFile) {
    const rows = JSON.parse(readFileSync(decisionsFile, 'utf8')) as Row[];
    const byJob = new Map<string, Row>();
    for (const r of rows.sort((a, b) => new Date(a.decided_at).getTime() - new Date(b.decided_at).getTime())) byJob.set(r.job_id, r);
    return [...byJob.values()];
  }
  const url = process.env.STUDIO_DATABASE_URL;
  if (!url) throw new Error('STUDIO_DATABASE_URL is not set (or pass --decisions=FILE)');
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { prepare: false, max: 1 });
  const rows = await sql<Row[]>`select distinct on (job_id) job_id, decision, note, by_fid, decided_at, image_sha256, check_run, drafted_note, drafted_by, note_edited
    from studio.illustration_reviews order by job_id, decided_at desc, id desc`;
  await sql.end();
  return [...rows];
}

const rows = await latest();
type Redo = { note: string; by_fid: number; at: string; credit: string; drafted_note: string | null; drafted_by: string | null; edited: boolean | null; done?: string };
const files = new Map<string, { jobs: { id: string; review?: JobReview; redo?: Redo }[] }>();
const load = (f: string) => {
  if (!files.has(f)) files.set(f, JSON.parse(readFileSync(path.join(ROOT, f), 'utf8')));
  return files.get(f)!;
};
const publishedFile = 'content/snowmoon/illustrations/published.json';
const published = JSON.parse(readFileSync(path.join(ROOT, publishedFile), 'utf8')) as { excluded: Record<string, string>; images: { id: string }[] };
let publishedChanged = false;
const redoChapters = new Set<number>();

for (const r of rows) {
  const job = checkJob(r.job_id);
  if (!job) {
    console.log(`  ${r.job_id}: no such job, skipped`);
    continue;
  }
  const at = new Date(r.decided_at).toISOString();
  const review: JobReview = { decision: r.decision, note: r.note, by_fid: Number(r.by_fid), at, image_sha256: r.image_sha256, check: r.check_run };
  if (job.image && r.image_sha256 && r.image_sha256 !== job.image.sha256) {
    console.log(`  ${r.job_id}: the decision was about an earlier picture (${r.image_sha256.slice(0, 12)}); recorded, but nothing redone`);
  }
  const spec = load(job.jobFile);
  const entry = spec.jobs.find((j) => j.id === job.id)!;
  entry.review = review;
  let what: string = r.decision;
  if (r.decision === 'regenerate' && r.note) {
    if (!entry.redo || entry.redo.note !== r.note || entry.redo.at !== at) {
      // The note's provenance (owner, 2026-10-24): drafted by the image check and approved (or edited and approved) by the
      // owner, or written by the owner. The redo's recipe repeats it.
      const credit = noteCredit({ draftedNote: r.drafted_note ?? null, noteEdited: r.note_edited ?? null, byFid: Number(r.by_fid) });
      entry.redo = { note: r.note, by_fid: Number(r.by_fid), at, credit, drafted_note: r.drafted_note ?? null, drafted_by: r.drafted_by ?? null, edited: r.note_edited ?? null };
      redoChapters.add(job.chapter);
      what = `regenerate with "${r.note}"`;
    } else what = 'regenerate (already recorded)';
  }
  if (r.decision === 'drop' && !(job.id in published.excluded)) {
    published.excluded[job.id] = `dropped on review by FID ${r.by_fid} (${at.slice(0, 10)})${r.note ? `: "${r.note}"` : ''}`;
    published.images = published.images.filter((i) => i.id !== job.id);
    publishedChanged = true;
  }
  console.log(`  ${job.id}: ${what}`);
}

if (!write) {
  console.log(`\n${rows.length} decisions. Nothing written (add --write).`);
  process.exit(0);
}
for (const [f, spec] of files) writeFileSync(path.join(ROOT, f), JSON.stringify(spec, null, 2) + '\n');
if (publishedChanged) writeFileSync(path.join(ROOT, publishedFile), JSON.stringify(published, null, 2) + '\n');
console.log(`\nwrote ${files.size} job file(s)${publishedChanged ? ' and published.json' : ''}.`);
if (redoChapters.size) console.log('  then: .venv-image/bin/python scripts/redo-c2.py   (the plan; --run renders with Qwen-Image-Edit-2511, way (c) v2)');
