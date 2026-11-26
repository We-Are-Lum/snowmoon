import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { readPayment } from '~/lib/wallet/chain';
import { autoLink } from '~/lib/wallet/links';
import { claimVerified } from '~/lib/wallet/paid';

/**
 * Add a payment made from a wallet verified on the signed-in Farcaster account to that wallet's balance (owner,
 * 2026-11-25; src/lib/wallet/paid.ts claimVerified). Body: { txHash, address }. Signed out, 401 (P4a). OFF with
 * EPHELION_PAID: 404.
 */
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const fid = await getPerson(request);
  const body = (await request.json().catch(() => ({}))) as { txHash?: unknown; address?: unknown };
  const a = await claimVerified(db(), fid, body, { read: readPayment, autoLink });
  return NextResponse.json(a.body, { status: a.status, headers: NO_STORE });
}
