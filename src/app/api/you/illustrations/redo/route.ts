import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { IMAGES } from '~/lib/config';
import { whereFrom } from '~/lib/images/countries';
import { realDeps, redoPicture } from '~/lib/chapter-pictures/pictures';

/**
 * An admin's redo of one of the edition's chapter pictures (owner, 2026-11-18, option B): a note, a model (the open one
 * by default; a closed one only where its maker serves, after its notice and the 18+ box, as the challenge asks), and
 * the chapter's look. The picture is a private draft until an admin keeps it (POST ./show). Admins only: anyone else
 * gets 401 or 404. Paid from the admins' own daily cap (CHAPTER_PICTURES.adminDailyCapUsd).
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
  const r = await redoPicture(sql, fid, request, body, whereFrom(request.headers), await realDeps());
  return NextResponse.json(r.json, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
