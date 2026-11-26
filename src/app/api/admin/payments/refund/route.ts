import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { recordRefund } from '~/lib/wallet/paid';

/**
 * An admin records a refund already sent in USDC on Base for a paid charge we couldn't make (owner, 2026-11-25). Body:
 * { debitId, txHash }. A write: signed out, 401 (P4a); signed in but not an admin, 404 before anything is read. The
 * database function (studio.record_wallet_refund) checks the rest under the account's lock.
 */
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => ({}))) as { debitId?: unknown; txHash?: unknown };
  const a = await recordRefund(db(), fid, body);
  return NextResponse.json(a.body, { status: a.status, headers: NO_STORE });
}
