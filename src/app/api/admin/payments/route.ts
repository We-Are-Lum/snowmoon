import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { isAdmin } from '~/lib/admins';
import { db } from '~/lib/db';
import { ledger } from '~/lib/wallet/paid';

/**
 * /admin/payments' data (owner, 2026-11-25; branch ephelion-paid): every payment into a prepaid balance, every charge
 * with what it bought, what was added back and what was refunded, and the totals by UTC day. Admins only: everyone else
 * gets 404 before anything is read. Never cached; never public; never used to order or score anything (P7).
 */
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  const fid = await getFid(request);
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'No database' }, { status: 503, headers: NO_STORE });
  const days = Number(new URL(request.url).searchParams.get('days') ?? 30);
  return NextResponse.json(await ledger(sql, Number.isFinite(days) ? days : 30), { headers: NO_STORE });
}
