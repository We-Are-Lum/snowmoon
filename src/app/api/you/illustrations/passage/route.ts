import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { passageSheets } from '~/lib/chapter-pictures/pictures';

/**
 * For "Add a picture here" (owner, 2026-11-19): the characters this passage names that have a published sheet with a
 * front view, the references an admin may send. ?chapter&start&end. Admins only: anyone else gets 401 or 404.
 */
export async function GET(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sql = db();
  if (!sql) return NextResponse.json({ sheets: [] }, { headers: { 'Cache-Control': 'no-store' } });
  const q = new URL(request.url).searchParams;
  const [chapter, start, end] = ['chapter', 'start', 'end'].map((k) => Number(q.get(k)));
  if (![chapter, start, end].every(Number.isInteger) || start > end) return NextResponse.json({ error: 'Choose a passage' }, { status: 400 });
  const sheets = await passageSheets(sql, chapter, start, end).catch(() => []);
  return NextResponse.json({ sheets: sheets.map(({ slug, name, url }) => ({ slug, name, url })) }, { headers: { 'Cache-Control': 'no-store' } });
}
