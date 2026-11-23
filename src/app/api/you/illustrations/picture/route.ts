import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { whereFrom } from '~/lib/images/countries';
import { adminView, redoable } from '~/lib/chapter-pictures/pictures';
import { pictureHistory, readAddition, readReplacements } from '~/lib/chapter-pictures/read';
import { isAddedId } from '~/lib/chapter-pictures/shared';
import { checkJob } from '~/lib/illustration-check/jobs';

/**
 * One chapter picture's state for the reader's "Change this picture" sheet (owner, 2026-11-19): what the chapter shows,
 * every version and decision, the models offered here, the looks and the admins' cap. ?job=<id>, an edition picture or
 * one an admin added. Admins only: anyone else gets 401 or 404.
 */
export async function GET(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available on this copy of the site' }, { status: 503 });
  const id = new URL(request.url).searchParams.get('job') ?? '';
  // No picture named ("Add a picture here"): the page's state only (models, the default, the looks, the cap, adding ready).
  if (!id) return NextResponse.json({ item: null, pictures: await adminView(sql, whereFrom(request.headers)) }, { headers: { 'Cache-Control': 'no-store' } });
  const added = isAddedId(id) ? await readAddition(sql, id).catch(() => null) : null;
  const job = added ? null : checkJob(id);
  if (!added && !job) return NextResponse.json({ error: 'No such picture' }, { status: 404 });
  const pictures = await adminView(sql, whereFrom(request.headers));
  const history = pictures.ready ? await pictureHistory(sql) : { versions: new Map(), decisions: new Map() };
  const shown = pictures.ready ? await readReplacements(sql) : new Map();
  const item = {
    id,
    chapter: added?.chapter ?? job!.chapter,
    redoable: added ? true : redoable(job!),
    lettered: job?.lettering.map((l) => l.text) ?? [],
    added: added ? { after: added.after, start: added.start, end: added.end } : null,
    shown: shown.get(id)?.versionId ?? null,
    versions: history.versions.get(id) ?? [],
    decisions: history.decisions.get(id) ?? [],
    image: job?.image ? { url: job.image.url, width: job.image.width, height: job.image.height } : null,
  };
  return NextResponse.json({ item, pictures }, { headers: { 'Cache-Control': 'no-store' } });
}
