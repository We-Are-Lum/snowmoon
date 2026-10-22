import { NextResponse } from 'next/server';
import { getFid, getWallet } from '~/lib/auth';
import { WALLET_LINKS } from '~/lib/config';
import { db } from '~/lib/db';
import { link, unlink, unlinkFromFid } from '~/lib/wallet/links';
import { readSession } from '~/lib/wallet/session';

/**
 * Link this wallet to your Farcaster account, or unlink it (owner, 2026-10-22: "After you are signed in with a
 * wallet you can have an offer to sign in with Farcaster to associate the account with this wallet").
 *
 * POST, the 'signed' link: both proofs in one request, checked here, never taken from the page's word:
 * - the Farcaster sign-in, as the bearer token (Quick Auth, getFid), for the FID being linked;
 * - the wallet sign-in, as its own token in `X-Wallet-Session` (our signature, not expired), for the wallet.
 * The body names the FID the page showed ("Link to @name?"); if the Farcaster sign-in is now another FID, nothing
 * is linked. The payment address is never linked.
 *
 * DELETE, unlink, from either side (owner, 2026-10-22): the wallet's own sign-in (bearer or `X-Wallet-Session`), or
 * the linked Farcaster account's sign-in (bearer) naming the wallet in the body (`{ wallet: address }`); a FID can end
 * only its own link. Sets the link's unlinked_at, ended by the person.
 *
 * Not under /api/wallet/: the client sends a wallet's token as the bearer to every route there, and this one needs
 * the Farcaster token as the bearer.
 */
const noStore = { 'Cache-Control': 'no-store' };
const no = (error: string, status: number, reason?: string) => NextResponse.json({ error, reason }, { status, headers: noStore });

export async function POST(request: Request) {
  if (!WALLET_LINKS.offer) return no('Not found', 404);
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in with Farcaster first' }, { status: 401, headers: noStore });
  const w = readSession(request.headers.get('x-wallet-session'));
  if (!w) return NextResponse.json({ error: 'Sign in with the wallet too' }, { status: 401, headers: noStore });
  const sql = db();
  if (!sql) return no('Not available here', 503);
  const body = (await request.json().catch(() => ({}))) as { fid?: unknown };
  if (body.fid !== fid) return no('You are signed in with a different Farcaster account now. Reload the page and check again.', 409, 'other-fid');
  const r = await link(sql, w.account, w.address, fid, 'signed');
  if (!r.ok) {
    if (r.why === 'payment-address') return no('This address can’t be linked.', 403, r.why);
    if (r.why === 'linked-elsewhere') return no('This wallet is already linked to another Farcaster account. Unlink it there first.', 409, r.why);
    return no('Linking isn’t available yet.', 503, r.why);
  }
  return NextResponse.json({ linked: { fid: r.fid, how: r.how }, created: r.created }, { headers: noStore });
}

export async function DELETE(request: Request) {
  // From the Farcaster side: the linked FID names the wallet.
  const fid = await getFid(request);
  const body = (await request.json().catch(() => ({}))) as { wallet?: unknown };
  if (fid !== null && typeof body.wallet === 'string') {
    const sql = db();
    if (!sql) return no('Not available here', 503);
    const done = await unlinkFromFid(sql, fid, body.wallet);
    if (done === 'not-yet') return no('Unlinking isn’t available yet.', 503, done);
    if (done === 'none') return no('This wallet isn’t linked to this account.', 409, done);
    return NextResponse.json({ unlinked: true }, { headers: noStore });
  }
  const w = getWallet(request) ?? readSession(request.headers.get('x-wallet-session'));
  if (!w) return NextResponse.json({ error: 'Sign in with the wallet or the linked Farcaster account first' }, { status: 401, headers: noStore });
  const sql = db();
  if (!sql) return no('Not available here', 503);
  const done = await unlink(sql, w.account);
  if (done === 'not-yet') return no('Unlinking isn’t available yet.', 503, done);
  if (done === 'none') return no('This wallet isn’t linked.', 409, done);
  return NextResponse.json({ unlinked: true }, { headers: noStore });
}
