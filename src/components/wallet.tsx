'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { authFetch, signOutWallet } from '~/lib/client-auth';
import { IMAGES } from '~/lib/config';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { claim, hasWallet, pay, signInWithWallet, WalletError } from '~/lib/wallet/client';
import { txHashFrom } from '~/lib/wallet/hash';
import { TxHashField } from './tx-hash-field';

/**
 * Wallet sign-in and the prepaid balance (owner, 2026-10-13). Wording drafted by the coding agent
 * (src/lib/images/wording.ts, prepaid), for the owner's review.
 */
const W = IMAGE_WORDING.prepaid;
const PENDING = 'snowmoon.wallet.pending';
const dollars = (usd: number) => (usd >= 1 ? usd.toFixed(2) : usd.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));

/** `note: false` leaves out the line under the button (the menu shows one line under both sign-in buttons). */
export function WalletSignInButton({ className = 'ic-secondary', note = true }: { className?: string; note?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setError(null);
    if (!hasWallet()) return setError(W.noWallet);
    setBusy(true);
    try {
      await signInWithWallet();
    } catch (e) {
      setError(e instanceof WalletError && e.why === 'no-wallet' ? W.noWallet : e instanceof WalletError && e.why === 'declined' ? W.wrongSign : (e as Error).message || W.wrongSign);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="wallet-sign-in">
      <button type="button" className={className} onClick={() => void go()} disabled={busy}>
        {busy ? '…' : W.signIn}
      </button>
      {note && <p className="ic-note">{W.signInNote}</p>}
      {error && <p className="ic-note" role="alert">{error}</p>}
    </div>
  );
}

interface Balance {
  address: string;
  balanceUsd: number;
  priceUsd: number;
  generations: number;
  markup: number;
  open: boolean;
  payTo: `0x${string}` | null;
  usdc: `0x${string}`;
  packsUsd: number[];
}

/** Balance, price, and Add funds; `onChange` after a payment is added. */
export function WalletPanel({ onChange }: { onChange?: () => void }) {
  const [b, setB] = useState<Balance | null>(null);
  const [adding, setAdding] = useState(false);
  const [token, setToken] = useState<'USDC' | 'ETH'>('USDC');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState('');
  // A payment sent but not yet added (kept on this device, so a closed tab doesn't lose it).
  const [pending, setPending] = useState<`0x${string}` | null>(null);
  useEffect(() => {
    try {
      setPending((localStorage.getItem(PENDING) as `0x${string}` | null) ?? null);
    } catch {
      /* storage blocked */
    }
  }, []);
  const keep = (h: `0x${string}` | null) => {
    setPending(h);
    try {
      if (h) localStorage.setItem(PENDING, h);
      else localStorage.removeItem(PENDING);
    } catch {
      /* storage blocked */
    }
  };

  const load = useCallback(async () => {
    const res = await authFetch('/api/wallet/balance').catch(() => null);
    if (res?.ok) setB((await res.json()) as Balance);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // A payment this device still remembers is tried again, once, when the panel opens (2026-10-19): a
  // refusal that may have been ours is no longer the end of it.
  const tried = useRef(false);
  useEffect(() => {
    if (!b?.open || !pending || tried.current) return;
    tried.current = true;
    void claim(pending, 3).then(done, (e: unknown) => {
      if (e instanceof WalletError && e.final) keep(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.open, pending]);
  if (!b) return null;

  const done = (r: { added: number }) => {
    keep(null);
    setNote(W.added(dollars(r.added)));
    setAdding(false);
    void load();
    onChange?.();
  };
  const fail = (e: unknown) => {
    if (e instanceof WalletError && e.final) keep(null);
    setNote(e instanceof WalletError && e.why === 'declined' ? W.wrongSign : (e as Error).message);
  };
  const buy = async (usd: number) => {
    if (!b.payTo) return;
    setBusy(true);
    setNote(null);
    try {
      done(await pay({ usd, token, payTo: b.payTo, usdc: b.usdc, onSent: keep, onWaiting: () => setNote(W.waiting) }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const retry = async () => {
    if (!pending) return;
    setBusy(true);
    setNote(W.waiting);
    try {
      done(await claim(pending));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // A payment that reached us but wasn't added (owner, 2026-10-15): the same server check, by its hash.
  const recover = async () => {
    const h = txHashFrom(pasted);
    if (!h) return setNote(W.recoverBad);
    setBusy(true);
    setNote(W.waiting);
    try {
      done(await claim(h, 3));
      setPasted('');
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wallet-panel">
      <p className="wallet-balance">
        {W.balance(dollars(b.balanceUsd), b.generations)} ·{' '}
        <button type="button" className="as-quiet" onClick={signOutWallet}>
          {b.address.slice(0, 6)}…{b.address.slice(-4)} · {W.signOut}
        </button>
      </p>
      <p className="ic-note">{W.price(dollars(b.priceUsd), b.markup)}</p>
      {!b.open ? (
        <p className="ic-note">{W.notOpen}</p>
      ) : !adding ? (
        <button type="button" className="ic-secondary" onClick={() => setAdding(true)}>
          {W.addFunds}
        </button>
      ) : (
        <div className="wallet-add">
          <p className="ic-note">{W.inAdvance}</p>
          <p className="ic-note">{W.payWith}</p>
          <div className="wallet-tokens" role="radiogroup" aria-label="Pay with">
            {(['USDC', 'ETH'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={token === t} className={token === t ? 'ic-primary' : 'ic-secondary'} onClick={() => setToken(t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="wallet-packs">
            {b.packsUsd.map((usd) => (
              <button key={usd} type="button" className="ic-secondary" disabled={busy} onClick={() => void buy(usd)}>
                {W.pay(usd, token)}
              </button>
            ))}
          </div>
          <p className="ic-note">{IMAGES.prepaid.creditBack ? W.termsCreditBack : W.terms}</p>
        </div>
      )}
      {pending && b.open && (
        <p className="ic-note">
          {W.notAddedYet}{' '}
          <button type="button" className="as-quiet" disabled={busy} onClick={() => void retry()}>
            {W.tryAgain}
          </button>
        </p>
      )}
      {b.open && (
        <details className="wallet-recover" open={pending !== null}>
          <summary>{W.recover}</summary>
          <p className="ic-note">{W.recoverNote}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void recover();
            }}
          >
            <TxHashField id="wallet-recover-hash" label={W.recoverLabel} value={pasted} onChange={setPasted} />
            <button type="submit" className="ic-secondary" disabled={busy || !pasted.trim()}>
              {W.recoverButton}
            </button>
          </form>
        </details>
      )}
      {note && (
        <p className="ic-note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
