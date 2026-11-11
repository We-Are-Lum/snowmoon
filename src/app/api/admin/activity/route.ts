import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { adminActivity } from '~/lib/admin-activity';

/**
 * The admin activity page's data (owner, 2026-11-05; docs/proposals/admin-activity.md). Admins only: everyone else gets
 * 404, before anything is read (src/lib/admin-activity.ts). Never cached: who asks decides the answer.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  const fid = await getFid(request);
  const q = new URL(request.url).searchParams;
  const a = await adminActivity(db(), fid, { days: Number(q.get('days')), who: q.get('who') });
  return NextResponse.json(a.body, { status: a.status, headers: NO_STORE });
}
