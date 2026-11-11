import { NextResponse } from 'next/server';
import { signInOpen } from '~/lib/config';
import { isAddress, lensAccountsFor } from '~/lib/social/lens';

/**
 * Lens sign-in, step 0 (branch signin-lens-bluesky): the Lens accounts the wallet in this browser owns or manages,
 * from Lens's public API (accountsAvailable), so the person can pick one. Lens receives the wallet's address. Nothing
 * is kept. 404 while Lens sign-in is off.
 */
export async function GET(request: Request) {
  if (!signInOpen('lens')) return new NextResponse('Not found', { status: 404 });
  const wallet = new URL(request.url).searchParams.get('wallet');
  if (!isAddress(wallet)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  try {
    return NextResponse.json({ accounts: await lensAccountsFor(wallet) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('lens accounts: Lens did not answer', (e as Error).name);
    return NextResponse.json({ error: 'Lens isn’t answering. Try again in a moment.' }, { status: 502 });
  }
}
