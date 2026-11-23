import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { changeMarks, type Change } from '~/lib/review/review';

/**
 * An admin's label or note on a bounty claim or a challenge entry (owner, 2026-11-23; branch bounty-review). Private:
 * kept in studio.review_labels and studio.review_notes, each change in studio.review_log, and read only by
 * GET /api/admin/bounty. Admins only: everyone else gets 404 before anything is read.
 * Body: { kind: 'bounty_claim' | 'challenge_entry', subject, label, on } or { kind, subject, note } ('' clears it).
 */
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function POST(request: Request) {
  const fid = await getFid(request);
  const body = (await request.json().catch(() => ({}))) as Change;
  const a = await changeMarks(db(), fid, body);
  return NextResponse.json(a.body, { status: a.status, headers: NO_STORE });
}
