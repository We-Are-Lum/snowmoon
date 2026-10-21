import { NextResponse } from 'next/server';
import { getPerson, getWallet } from '~/lib/auth';
import { IMAGES, REMIX } from '~/lib/config';
import { priceUsd } from '~/lib/wallet/credits';
import { readSession } from '~/lib/wallet/session';
import { isMaintainer } from '~/lib/remix/frames';
import { ownWork, whoIs } from '~/lib/you';

/**
 * The You page's data (owner, 2026-10-18): who is signed in and everything they made, hidden things
 * too. Private: the person is the one the request's session names (a Farcaster sign-in, or a wallet
 * sign-in, as the wallet routes take it), never one named in the URL, so nobody can read another
 * person's page. Signed out: 401 and nothing else. Never cached.
 *
 * Signed in with Farcaster AND a wallet on the same device (owner, 2026-10-18: show both): the page
 * also sends the wallet session's own token in `X-Wallet-Session`. It is checked like any wallet
 * sign-in (our signature, not expired), and then that account's rows are added as `wallet`. Each
 * token answers only for itself; nothing links the two accounts on the server, and nothing is stored.
 *
 * The balance itself comes from /api/wallet/balance (the WalletPanel reads it), as on the shot editor.
 */
const noStore = { 'Cache-Control': 'no-store' };
const prices = () => ({ imageUsd: priceUsd(IMAGES.reserveUsd), frameUsd: priceUsd(REMIX.reserveUsd(REMIX.maxPictures)) });

export async function GET(request: Request) {
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
  const wallet = person < 0 ? getWallet(request) : null;
  const who = await whoIs(person, wallet?.address);
  const work = await ownWork(person, who.handle);
  // A second, wallet session alongside a Farcaster one.
  const also = person > 0 ? readSession(request.headers.get('x-wallet-session')) : null;
  const alongside = also ? await (async () => {
    const w = await whoIs(-also.account, also.address);
    return { who: w, work: await ownWork(-also.account, w.handle), prices: prices() };
  })() : null;
  return NextResponse.json(
    {
      who,
      work,
      maintainer: isMaintainer(person),
      // What a Remix frame costs a wallet account at most (every picture the edit model takes), as Remix's status says it.
      prices: person < 0 ? prices() : null,
      wallet: alongside,
    },
    { headers: noStore },
  );
}
