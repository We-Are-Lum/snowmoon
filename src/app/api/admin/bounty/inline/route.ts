import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { inlineView } from '~/lib/review/review';

/**
 * /admin/bounty's live part (owner, 2026-11-27; the principle 6 exception for this page): claimers' Farcaster profiles
 * and the posts linked by claims and entries, read from their networks now (src/lib/review/inline.ts), never stored.
 * Admins only: everyone else gets 404 before anything is read. Never cached: who asks decides the answer.
 */
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  const fid = await getFid(request);
  const a = await inlineView(db(), fid);
  return NextResponse.json(a.body, { status: a.status, headers: NO_STORE });
}
