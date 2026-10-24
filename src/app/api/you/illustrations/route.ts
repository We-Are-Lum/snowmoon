import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { ILLUSTRATION_CHECK } from '~/lib/config';
import { checkJob } from '~/lib/illustration-check/jobs';
import { DECISIONS, NOTE_MAX, reviewItems, saveDecision, type Decision } from '~/lib/illustration-check/review';

/**
 * The owner's review of the seeded images (owner, 2026-10-23), behind /you/illustrations. Owner only
 * (ILLUSTRATION_CHECK.owners): everyone else gets 401 or 403 and nothing about the check. GET: every job worst first,
 * with its passage, image, the check's fields and the latest decision. POST: a decision (keep, regenerate with a
 * note, or drop), saved as a new row with who decided and when. Nothing here changes a job, a picture or the site;
 * the redo (scripts/illustration-redo.ts) reads the decisions when the owner runs it.
 */
const noStore = { 'Cache-Control': 'no-store' };

async function owner(request: Request): Promise<number | NextResponse> {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!ILLUSTRATION_CHECK.owners.includes(fid)) return NextResponse.json({ error: 'Owner only' }, { status: 403 });
  return fid;
}

export async function GET(request: Request) {
  const fid = await owner(request);
  if (typeof fid !== 'number') return fid;
  const { items, canSave } = await reviewItems(db());
  return NextResponse.json({ items, canSave }, { headers: noStore });
}

export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!ILLUSTRATION_CHECK.owners.includes(fid)) return NextResponse.json({ error: 'Owner only' }, { status: 403 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Decisions can’t be saved on this copy of the site' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { jobId?: unknown; decision?: unknown; note?: unknown; checkRun?: unknown };
  const job = typeof body.jobId === 'string' ? checkJob(body.jobId) : null;
  if (!job) return NextResponse.json({ error: 'No such job' }, { status: 404 });
  if (!DECISIONS.includes(body.decision as Decision)) return NextResponse.json({ error: 'Keep, regenerate or drop' }, { status: 400 });
  const decision = body.decision as Decision;
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
  if (note && note.length > NOTE_MAX) return NextResponse.json({ error: `A note is at most ${NOTE_MAX} characters` }, { status: 400 });
  if (decision === 'regenerate' && !note) return NextResponse.json({ error: 'Regenerate needs your note: it goes into the prompt' }, { status: 400 });
  const checkRun = typeof body.checkRun === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(body.checkRun) ? body.checkRun : null;
  try {
    await saveDecision(sql, { jobId: job.id, decision, note, byFid: fid, imageSha256: job.image?.sha256 ?? null, checkRun });
  } catch (e) {
    if (/does not exist/.test(String((e as Error).message))) return NextResponse.json({ error: 'Decisions can’t be saved until NEXT_illustration_review is applied' }, { status: 503 });
    throw e;
  }
  return NextResponse.json({ saved: decision }, { headers: noStore });
}
