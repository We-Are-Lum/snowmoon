'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import type { PaidItem } from '~/lib/config';
import { payUsdc, WalletError } from '~/lib/wallet/client';
import { PAID_WORDING as W } from '~/lib/wallet/paid-wording';

/**
 * The top-up panel inside the page (owner, 2026-11-25; EPHELION_PAID, off; PR A, not yet shown anywhere): opens when a
 * paid generation's button finds the balance short. It shows the price and the balance first, then offers to pay
 * exactly what's missing (at least the smallest payment the balance takes) or that plus more for later, in USDC on
 * Base. Once the payment is added, `onPaid` runs and the caller makes the thing straight away; the page stays put.
 * `verified`: the person is signed in with Farcaster and pays from a wallet verified on their account.
 */
type Quote = { priceUsd: number; balanceUsd: number; shortUsd: number; payUsd: number; extraUsd: number; payTo: `0x${string}` | null; usdc: `0x${string}` };

export function TopUp({ item, verified, onPaid, onClose }: { item: PaidItem; verified: boolean; onPaid: () => void; onClose?: () => void }) {
  const [q, setQ] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    void authFetch(`/api/paid/quote?item=${item}`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Quote>) : null))
      .then(setQ, () => setQ(null));
  }, [item]);
  if (!q || !q.payTo) return null;
  const payTo = q.payTo;
  const go = async (usd: number) => {
    setBusy(true);
    setNote(W.waiting);
    try {
      await payUsdc({ usd, payTo, usdc: q.usdc, verified, onWaiting: () => setNote(W.checking) });
      setNote(W.paid);
      onPaid();
    } catch (e) {
      setNote(e instanceof WalletError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const more = Math.round((q.payUsd + q.extraUsd) * 100) / 100;
  return (
    <div className="top-up" role="dialog" aria-label={W.costs(q.priceUsd, q.balanceUsd)}>
      <p>{W.costs(q.priceUsd, q.balanceUsd)}</p>
      {q.payUsd > q.shortUsd && <p className="ic-note">{W.smallest(q.payUsd)}</p>}
      <div className="top-up-choices">
        <button type="button" className="ic-primary" disabled={busy} onClick={() => void go(q.payUsd)}>
          {W.payMissing(q.payUsd)}
        </button>
        <button type="button" className="ic-secondary" disabled={busy} onClick={() => void go(more)}>
          {W.payMore(q.extraUsd, more)}
        </button>
      </div>
      <p className="ic-note">{W.how}</p>
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
