import { NextResponse } from 'next/server';
import { getFid, getPerson, getWallet } from '~/lib/auth';
import { IMAGES, REMIX, WALLET_LINKS } from '~/lib/config';
import { db } from '~/lib/db';
import { configLink, isPayTo, linkOf, walletLinksOf } from '~/lib/wallet/links';
import { linkedTo } from '~/lib/wallet/credit';
import { shortAddress } from '~/lib/wallet/session';
import { priceUsd } from '~/lib/wallet/credits';
import { readSession } from '~/lib/wallet/session';
import { isAdmin } from '~/lib/admins';
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
 *
 * Wallet ↔ Farcaster links (owner, 2026-10-22): `link` says whether the wallet on this page is linked, to whom and
 * how, and whether the offer to link it applies. A linked wallet signed in on its own is its FID here (getPerson),
 * and what it made as the wallet before linking is listed in the FID's work (owner, 2026-10-22).
 */
const noStore = { 'Cache-Control': 'no-store' };
const prices = () => ({ imageUsd: priceUsd(IMAGES.reserveUsd), frameUsd: priceUsd(REMIX.reserveUsd(REMIX.maxPictures)) });

export async function GET(request: Request) {
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in first' }, { status: 401, headers: noStore });
  // The wallet in play: this request's own wallet sign-in, or one alongside a Farcaster sign-in.
  const fid = await getFid(request);
  const own = fid === null ? getWallet(request) : null;
  const also = fid !== null ? readSession(request.headers.get('x-wallet-session')) : null;
  const w = own ?? also;
  const wallet = person < 0 ? own : null;
  const who = await whoIs(person, wallet?.address);
  const work = await ownWork(person, who.handle);
  // A wallet's own account shown beside the person, when it is a different account: a wallet alongside a Farcaster
  // sign-in that isn't linked to it. A wallet linked to this FID is already in `work` (ownWork adds linked wallets').
  const merged = w && person > 0 && (await linkedTo(db(), [-w.account])).get(-w.account) === person;
  const side = w && -w.account !== person && !merged ? w : null;
  const alongside = side ? await (async () => {
    const sw = await whoIs(-side.account, side.address);
    return { who: sw, work: await ownWork(-side.account, sw.handle), prices: prices() };
  })() : null;
  return NextResponse.json(
    {
      who,
      work,
      maintainer: isAdmin(person),
      // What a Remix frame costs a wallet account at most (every picture the edit model takes), as Remix's status says it.
      prices: person < 0 ? prices() : null,
      wallet: alongside,
      link: w ? await linkView(w.account, w.address, fid) : null,
      // Signed in with Farcaster: the wallets linked to it (other than the one already on this page), each with Unlink.
      linkedWallets: fid !== null ? await linkedWalletsView(fid, w?.account ?? null) : [],
    },
    { headers: noStore },
  );
}

/** The wallet's link for the You page, and whether the offer applies (only once the table is there). */
async function linkView(account: number, address: string, fid: number | null) {
  const { link, table } = await linkOf(db(), account, address);
  const name = link ? (await whoIs(link.fid)).name : null;
  return {
    wallet: { address, short: shortAddress(address) },
    linked: link ? { fid: link.fid, how: shownHow(link.how, address, link.fid), at: link.linkedAt, name } : null,
    // Unlink works on the table's links only; a LINKED_WALLETS one is the owner's to remove.
    canUnlink: !!link && link.how !== 'config' && table,
    offer: WALLET_LINKS.offer && table && !link && !isPayTo(address),
    // The Farcaster sign-in on this device, if any: who the offer would link to.
    to: fid,
  };
}

/** How a link reads on the page: the maintainer's (LINKED_WALLETS, or seeded from it by 0026 as 'verified') or the person's or Farcaster's. */
const shownHow = (how: 'verified' | 'signed' | 'config', address: string, fid: number) => (how === 'config' || (how === 'verified' && configLink(address) === fid) ? 'maintainer' : how);

async function linkedWalletsView(fid: number, except: number | null) {
  const rows = await walletLinksOf(db(), fid).catch(() => []);
  return rows.filter((r) => r.account !== except).map((r) => ({ address: r.address, short: shortAddress(r.address), how: shownHow(r.how, r.address, fid) }));
}
