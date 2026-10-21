import { NextResponse } from 'next/server';
import { getWallet } from '~/lib/auth';
import { db } from '~/lib/db';
import { readPayment } from '~/lib/wallet/chain';
import { balanceUsd, credit, prepaidOpen } from '~/lib/wallet/credits';
import { IMAGE_WORDING } from '~/lib/images/wording';

/**
 * Add a payment to the signed-in wallet's balance: { txHash } of a USDC or ETH payment on Base to
 * IMAGES.prepaid.payTo, from this wallet. Read onchain (src/lib/wallet/chain.ts) and credited once.
 */
const W = IMAGE_WORDING.prepaid;
export async function POST(request: Request) {
  const w = getWallet(request);
  if (!w) return NextResponse.json({ error: 'Sign in with a wallet first' }, { status: 401 });
  const sql = db();
  if (!sql || !prepaidOpen()) return NextResponse.json({ error: W.notOpen }, { status: 503 });
  const { txHash } = (await request.json().catch(() => ({}))) as { txHash?: unknown };
  if (typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const p = await readPayment(txHash as `0x${string}`, w.address).catch((e) => {
    console.error('wallet claim: Base read failed', (e as Error).name);
    return null;
  });
  if (!p) return NextResponse.json({ error: W.claim['not-found'], retry: true }, { status: 503 });
  // A refusal is logged (the transaction is public; the account is our number, no address), so a payment our
  // reading of Base got wrong can be found and added later (2026-10-19, the owner's first ETH payment).
  if (!p.ok && p.why !== 'pending' && p.why !== 'not-found') console.warn(`wallet claim refused: ${p.why}`); // the reason only: no transaction, no account (owner, 2026-10-19)
  if (!p.ok) return NextResponse.json({ error: W.claim[p.why], reason: p.why, retry: p.why === 'pending' || p.why === 'not-found' }, { status: p.why === 'pending' || p.why === 'not-found' ? 409 : 422 });
  const added = await credit(sql, w.account, { txHash, token: p.token, amount: p.amount, usd: p.usd, blockNumber: p.blockNumber });
  if (!added) return NextResponse.json({ error: W.claim.already, reason: 'already' }, { status: 409 });
  return NextResponse.json({ added: p.usd, token: p.token, balanceUsd: await balanceUsd(sql, w.account) }, { headers: { 'Cache-Control': 'no-store' } });
}
