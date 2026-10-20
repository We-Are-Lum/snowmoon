import { NextResponse } from 'next/server';
import { domain } from '~/lib/auth';
import { IMAGES } from '~/lib/config';
import { newNonce } from '~/lib/wallet/session';

/**
 * What the wallet's sign-in message must say (EIP-4361): our domain, Base, and a fresh nonce. Nothing is stored.
 * The statement is general, since a wallet now signs in for more than images (owner, 2026-10-19). DRAFT wording,
 * drafted by the coding agent, for the owner's reread.
 */
const STATEMENT = 'Sign in to Snowmoon with your wallet. Paid features use a prepaid balance.';
export async function GET(request: Request) {
  const nonce = newNonce();
  if (!nonce) return NextResponse.json({ error: 'Wallet sign-in is not set up on this deployment' }, { status: 503 });
  const host = domain(request);
  return NextResponse.json(
    { nonce, domain: host, uri: `https://${host}`, chainId: IMAGES.prepaid.chainId, statement: STATEMENT },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
