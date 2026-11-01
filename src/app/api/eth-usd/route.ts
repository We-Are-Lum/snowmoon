import { NextResponse } from 'next/server';
import { chain } from '~/lib/wallet/chain';
import { ethUsdNow } from '~/lib/wallet/eth-usd';

/**
 * GET /api/eth-usd: Chainlink's ETH/USD, read on Base by our server (owner, 2026-10-31: the support page's "≈ $"
 * estimate; no outside price service, P6a). The request carries nothing about the reader and nothing is recorded.
 * Cached for a minute at the edge, so Base is asked at most about once a minute.
 */
export async function GET() {
  const price = await ethUsdNow(chain());
  if (!price) return NextResponse.json({ error: 'No current price' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(price, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } });
}
