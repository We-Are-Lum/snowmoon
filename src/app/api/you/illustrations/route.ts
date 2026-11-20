import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { decide, reviewItems } from '~/lib/illustration-check/review';
import { whereFrom } from '~/lib/images/countries';
import { adminView, redoable } from '~/lib/chapter-pictures/pictures';
import { pictureHistory, readAdditions, readReplacements } from '~/lib/chapter-pictures/read';
import { waitingDrafts } from '~/lib/chapter-pictures/waiting';
import { checkJob } from '~/lib/illustration-check/jobs';

/**
 * The admins' review of the edition's chapter pictures (owner, 2026-10-23; admins since 2026-10-29), behind
 * /you/illustrations. Admins only (ADMINS): anyone else gets 401 signed out, or 404, and nothing about the review.
 * GET: every job worst first, with its passage, image, the check's fields and the latest decision; since 2026-11-18
 * (owner, option B) also each job's redone versions, which one the chapter shows, the looks, the models offered here
 * and the admins' daily cap. POST: a review decision (keep, regenerate with a note, or drop), saved as a new row with
 * who decided and when; it changes nothing public. Redo, keep and the look have their own routes beside this one.
 */
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  const { items, canSave } = await reviewItems(sql);
  if (!sql) return NextResponse.json({ items, canSave, pictures: null }, { headers: noStore });
  // The country decides which closed models are offered, for this answer only; it isn't kept.
  const pictures = await adminView(sql, whereFrom(request.headers));
  const history = pictures.ready ? await pictureHistory(sql) : { versions: new Map(), decisions: new Map() };
  const shown = pictures.ready ? await readReplacements(sql) : new Map();
  const withPictures = items.map((i) => {
    const job = checkJob(i.id);
    return { ...i, redoable: job ? redoable(job) : false, shown: shown.get(i.id)?.versionId ?? null, versions: history.versions.get(i.id) ?? [], decisions: history.decisions.get(i.id) ?? [] };
  });
  // Pictures admins added while reading (owner, 2026-11-19), and every draft not kept yet, with where each sits.
  const additions = pictures.adding ? await readAdditions(sql) : [];
  const added = additions.map((a) => ({ id: a.jobId, chapter: a.chapter, added: { after: a.after, start: a.start, end: a.end }, byFid: a.byFid, at: a.at, redoable: true, shown: shown.get(a.jobId)?.versionId ?? null, versions: history.versions.get(a.jobId) ?? [], decisions: history.decisions.get(a.jobId) ?? [], image: null }));
  const waiting = waitingDrafts(history, additions);
  return NextResponse.json({ items: withPictures, canSave, pictures, added, waiting }, { headers: noStore });
}

export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Decisions can’t be saved on this copy of the site' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const r = await decide(sql, fid, body);
  return NextResponse.json(r.json, { status: r.status, headers: noStore });
}
