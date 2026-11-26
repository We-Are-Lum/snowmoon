import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { EPHELION_PAID, IMAGES, type PaidItem } from '~/lib/config';
import { db } from '~/lib/db';
import { paidOpen, quote } from '~/lib/wallet/paid';

/**
 * What the top-up panel shows before anyone pays (owner, 2026-11-25): the price, the person's balance, what's missing
 * and the smallest payment that covers it, and where to pay (USDC on Base). Read only. OFF with EPHELION_PAID: 404.
 */
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  if (!paidOpen()) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in' }, { status: 401, headers: NO_STORE });
  const item = new URL(request.url).searchParams.get('item') as PaidItem | null;
  if (!item || !(item in EPHELION_PAID.prices)) return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: NO_STORE });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'No database' }, { status: 503, headers: NO_STORE });
  const q = await quote(sql, person, item);
  return NextResponse.json({ ...q, extraUsd: EPHELION_PAID.topUpExtraUsd, payTo: IMAGES.prepaid.payTo, usdc: IMAGES.prepaid.usdc, chainId: IMAGES.prepaid.chainId }, { headers: NO_STORE });
}
