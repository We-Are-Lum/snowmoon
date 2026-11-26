'use client';

import { useEffect, useState } from 'react';
import type { PaidItem } from '~/lib/config';
import { connectedAddress, payUsdc, topUpQuote, WalletError } from '~/lib/wallet/client';
import { PAID_WORDING as W } from '~/lib/wallet/paid-wording';
import { topUpPlan, type TopUpQuote } from '~/lib/wallet/top-up-plan';

/**
 * The top-up panel inside the page (owner, 2026-11-25; EPHELION_PAID, off; PR A, not yet shown anywhere): opens when a
 * paid generation's button finds the balance short. It asks the server about the wallet connected now first: a wallet
 * this person can't pay from is refused here and nothing is sent. Otherwise it shows the price and that wallet's
 * balance, and offers exactly what's missing, or that plus more for later, in USDC on Base. Once the payment is added,
 * `onPaid` runs and the caller makes the thing straight away; the page stays put. `verified`: the person is signed in
 * with Farcaster and pays from a wallet verified on their account.
 */
type Q = TopUpQuote & { payTo: `0x${string}` | null; usdc: `0x${string}` };

export function TopUp({ item, verified, onPaid, onClose }: { item: PaidItem; verified: boolean; onPaid: () => void; onClose?: () => void }) {
  const [address, setAddress] = useState<string | null>(null);
  const [q, setQ] = useState<Q | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const a = await connectedAddress();
        setAddress(a);
        setQ((await topUpQuote(item, a)) as Q | null);
      } catch (e) {
        setNote((e as Error).message);
      }
    })();
  }, [item]);
  if (!q || !q.payTo || !address) return note ? <p role="status" className="ic-note">{note}</p> : null;
  const payTo = q.payTo;
  const refused = topUpPlan(q, 0);
  const go = async (extraUsd: number) => {
    setBusy(true);
    setNote(W.waiting);
    try {
      await payUsdc({ item, extraUsd, payTo, usdc: q.usdc, verified, onWaiting: () => setNote(W.checking) });
      setNote(W.paid);
      onPaid();
    } catch (e) {
      setNote(e instanceof WalletError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const more = Math.round((q.payUsd + q.extraUsd) * 1e6) / 1e6;
  return (
    <div className="top-up" role="dialog" aria-label={W.costs(q.priceUsd, q.balanceUsd)}>
      {!refused.send ? (
        <p role="status">{refused.note}</p>
      ) : (
        <>
          <p>{W.costs(q.priceUsd, q.balanceUsd)}</p>
          <p className="ic-note">{W.forWallet(`${address.slice(0, 6)}…${address.slice(-4)}`)}</p>
          <div className="top-up-choices">
            <button type="button" className="ic-primary" disabled={busy} onClick={() => void go(0)}>
              {W.payMissing(q.payUsd)}
            </button>
            <button type="button" className="ic-secondary" disabled={busy} onClick={() => void go(q.extraUsd)}>
              {W.payMore(q.extraUsd, more)}
            </button>
          </div>
          <p className="ic-note">{W.how}</p>
        </>
      )}
      <p className="ic-note">{W.whichWallet}</p>
      {note && <p role="status" className="ic-note">{note}</p>}
      {onClose && (
        <button type="button" className="as-quiet" disabled={busy} onClick={onClose}>
          Close
        </button>
      )}
    </div>
  );
}
