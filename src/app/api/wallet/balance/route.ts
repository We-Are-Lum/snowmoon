import { NextResponse } from 'next/server';
import { getWallet } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES } from '~/lib/config';
import { balanceUsd, prepaidOpen, priceUsd } from '~/lib/wallet/credits';

/** A wallet account's balance, what an image costs, and where to pay. */
export async function GET(request: Request) {
  const w = getWallet(request);
  if (!w) return NextResponse.json({ error: 'Sign in with a wallet first' }, { status: 401 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not set up on this deployment' }, { status: 503 });
  const P = IMAGES.prepaid;
  const balance = await balanceUsd(sql, w.account);
  const price = priceUsd(IMAGES.reserveUsd);
  return NextResponse.json(
    {
      address: w.address, balanceUsd: balance, priceUsd: price, generations: Math.floor(balance / price), markup: P.markup,
      open: prepaidOpen(), payTo: P.payTo, chainId: P.chainId, usdc: P.usdc, packsUsd: P.packsUsd, minUsd: P.minUsd,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
