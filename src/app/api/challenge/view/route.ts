import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { challengeView } from '~/lib/challenge/view';
import { challengeVisibleTo } from '~/lib/challenge/visibility';

/**
 * /challenge's data, for the admins' view while the challenge is admin-only (CHALLENGE.public off; owner, 2026-11-04).
 * Everyone but an admin gets 404, as /challenge itself answers. Never cached: who asks decides the answer.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const fid = await getFid(request);
  if (!challengeVisibleTo(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(await challengeView(db()), { headers: { 'Cache-Control': 'private, no-store' } });
}
