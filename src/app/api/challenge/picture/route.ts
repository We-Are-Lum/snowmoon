import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { CHALLENGE } from '~/lib/config';
import { db } from '~/lib/db';
import { pictureView } from '~/lib/challenge/picture-view';
import { challengeVisibleTo } from '~/lib/challenge/visibility';

/**
 * A challenge picture's page data, /challenge/p/<version> (branch challenge-moments, 2026-11-05): for whoever may see
 * the challenge (everyone once CHALLENGE.public is on, admins before); 404 otherwise, and for anything that isn't a
 * published challenge picture. Read-only.
 */
export async function GET(request: Request) {
  const fid = CHALLENGE.public ? null : await getFid(request);
  if (!challengeVisibleTo(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const sql = db();
  const v = sql && /^[0-9a-f-]{36}$/i.test(id) ? await pictureView(sql, id.toLowerCase()).catch(() => null) : null;
  if (!v) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(v, { headers: { 'Cache-Control': 'private, no-store' } });
}
