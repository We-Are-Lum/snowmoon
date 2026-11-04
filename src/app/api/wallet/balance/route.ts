import { NextResponse } from 'next/server';
import { getWallet } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES, WALLET_LINKS } from '~/lib/config';
import { isPayTo, linkedFidFor, linkOf } from '~/lib/wallet/links';
import { whoIs } from '~/lib/you';
import { balanceUsd, prepaidOpen, priceUsd } from '~/lib/wallet/credits';
import { paysFor } from '~/lib/images/price';

/** A wallet account's balance, what an image costs, and where to pay. */
export async function GET(request: Request) {
  const w = getWallet(request);
  if (!w) return NextResponse.json({ error: 'Sign in with a wallet first' }, { status: 401 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not set up on this deployment' }, { status: 503 });
  const P = IMAGES.prepaid;
  const balance = await balanceUsd(sql, w.account);
  const price = priceUsd(IMAGES.reserveUsd);
  // A wallet signed in on its own is its linked FID everywhere (getPerson); this is often the first request after the
  // sign-in, so the automatic link is tried here as there (2026-11-04: the panel offered to link a wallet that was
  // being linked automatically, and the menu kept showing the address). Then the offer, once the table is there.
  const fid = isPayTo(w.address) ? null : await linkedFidFor(sql, w.account, w.address);
  const l = WALLET_LINKS.offer && !isPayTo(w.address) ? await linkOf(sql, w.account, w.address) : null;
  const linked = fid ? { fid, name: (await whoIs(fid).catch(() => null))?.name ?? `FID ${fid}` } : null;
  return NextResponse.json(
    {
      address: w.address, balanceUsd: balance, priceUsd: price, generations: paysFor(balance, price), markup: P.markup,
      open: prepaidOpen(), payTo: P.payTo, chainId: P.chainId, usdc: P.usdc, packsUsd: P.packsUsd, minUsd: P.minUsd,
      linkOffer: !!l && l.table && !l.link && !linked,
      // The Farcaster account this wallet signs in as, for the menu's name (null: the wallet's own account).
      linked,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
