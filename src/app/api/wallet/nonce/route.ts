import { NextResponse } from 'next/server';
import { domain } from '~/lib/auth';
import { IMAGES } from '~/lib/config';
import { newNonce } from '~/lib/wallet/session';

/** What the wallet's sign-in message must say (EIP-4361): our domain, Base, and a fresh nonce. Nothing is stored. */
export async function GET(request: Request) {
  const nonce = newNonce();
  if (!nonce) return NextResponse.json({ error: 'Wallet sign-in is not set up on this deployment' }, { status: 503 });
  const host = domain(request);
  return NextResponse.json(
    { nonce, domain: host, uri: `https://${host}`, chainId: IMAGES.prepaid.chainId, statement: 'Sign in to Snowmoon to make images with a prepaid balance.' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
