import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { realDeps, showPicture } from '~/lib/chapter-pictures/pictures';
import { forgetReplacements } from '~/lib/chapter-pictures/read';

/**
 * Keep a redo, or show an earlier picture again (owner, 2026-11-18: "A keep goes live at once"; "An admin can restore
 * any of them in one step, including the original committed file"). { jobId, versionId } with versionId null (or
 * "original") for the committed file. The chapter page is revalidated here, so its next request rebuilds it; this
 * render reads the database fresh. Admins only: anyone else gets 401 or 404.
 */
export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available on this copy of the site' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const r = await showPicture(sql, fid, body, await realDeps());
  if (r.status === 200 && r.chapter) {
    forgetReplacements();
    revalidatePath(`/chapter/${r.chapter}`);
  }
  return NextResponse.json(r.json, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
