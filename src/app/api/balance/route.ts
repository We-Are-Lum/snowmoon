import { NextResponse } from 'next/server';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES } from '~/lib/config';
import { holdsPersonBalance, personBalanceOn, personBalanceUsd } from '~/lib/balance/person';
import { priceUsd } from '~/lib/wallet/credits';
import { paysFor } from '~/lib/images/price';

/**
 * The signed-in Farcaster, Lens or Bluesky person's own prepaid balance (paying per person, PERSON_BALANCE; DRAFT;
 * drafted by a coding agent, Claude, a closed model by Anthropic): the balance, what an image costs, and where to pay.
 * Wallet accounts read /api/wallet/balance. Off: 404.
 */
export async function GET(request: Request) {
  if (!personBalanceOn()) return NextResponse.json({ error: 'Not available' }, { status: 404 });
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  if (!holdsPersonBalance(person)) return NextResponse.json({ error: 'A wallet account reads its balance on its wallet panel' }, { status: 409 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not set up on this deployment' }, { status: 503 });
  let balance: number;
  try {
    balance = await personBalanceUsd(sql, person);
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') return NextResponse.json({ error: 'Not available yet' }, { status: 503 });
    throw e;
  }
  const P = IMAGES.prepaid;
  const price = priceUsd(IMAGES.reserveUsd);
  return NextResponse.json(
    { balanceUsd: balance, priceUsd: price, generations: paysFor(balance, price), markup: P.markup, open: personBalanceOn(), payTo: P.payTo, chainId: P.chainId, usdc: P.usdc, packsUsd: P.packsUsd, minUsd: P.minUsd },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
