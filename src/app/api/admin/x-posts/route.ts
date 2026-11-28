import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { xPostsView } from '~/lib/x-posts/admin';

/** The X posts log for /admin/x-posts (owner, 2026-11-25). Admins only: everyone else gets 404, before anything is read. Never cached. */
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  const a = await xPostsView(db(), await getFid(request));
  return NextResponse.json(a.body, { status: a.status, headers: NO_STORE });
}
