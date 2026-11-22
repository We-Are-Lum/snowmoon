import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { IMAGES } from '~/lib/config';
import { whereFrom } from '~/lib/images/countries';
import { addPicture, realDeps } from '~/lib/chapter-pictures/pictures';

/**
 * An admin adds a picture at a passage, from the chapter reader (owner, 2026-11-19): { chapter, after, start, end, note,
 * model, notice, characters } for a new one, or { jobId, note, model, notice, characters } for another draft of one
 * added before. A private draft until an admin keeps it (POST ./show). Admins only: anyone else gets 401 or 404.
 */
export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!IMAGES.enabled) return NextResponse.json({ error: 'Making images is switched off for now' }, { status: 503 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available on this copy of the site' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  // The country decides which closed models are offered, for this request only; it isn't kept.
  const r = await addPicture(sql, fid, request, body, whereFrom(request.headers), await realDeps());
  return NextResponse.json(r.json, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
