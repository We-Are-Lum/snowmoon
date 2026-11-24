import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { reviewView } from '~/lib/review/review';

/**
 * /admin/bounty's data (owner, 2026-11-23; branch bounty-review): the poidh bounty's claims, read on Base, and the
 * challenge's entries, each with the admins' private labels. Admins only: everyone else gets 404 before anything is
 * read (src/lib/review/review.ts). Never cached: who asks decides the answer. ?fresh=1 reads Base again now.
 */
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  const fid = await getFid(request);
  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  const a = await reviewView(db(), fid, { fresh });
  return NextResponse.json(a.body, { status: a.status, headers: NO_STORE });
}
