'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import { PERSON_WORDING as W } from '~/lib/balance/wording';
import { claimForPerson, hasWallet, payForPerson, WalletError } from '~/lib/wallet/client';
import { txHashFrom } from '~/lib/wallet/hash';
import { exactDollars } from '~/lib/wallet/price-text';
import { TxHashField } from './tx-hash-field';

/**
 * A Farcaster, Lens or Bluesky sign-in's own prepaid balance (paying per person, PERSON_BALANCE; DRAFT; drafted by a
 * coding agent, Claude, a closed model by Anthropic). The same shape as the wallet account's panel (wallet.tsx): the
 * balance and price, Add funds (the wallet signs for the account, then pays on Base), a payment not yet added, and
 * adding one by its hash. Only the hash of a payment not yet added is kept on this device (Privacy §3).
 * Shown only when /api/balance answers (the switch is on and this is a person balance).
 */
const PENDING = 'snowmoon.balance.pending';
const dollars = (usd: number) => (usd >= 1 ? usd.toFixed(2) : usd.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));

interface Balance {
  balanceUsd: number;
  priceUsd: number;
  generations: number;
  markup: number;
  open: boolean;
  payTo: `0x${string}` | null;
  usdc: `0x${string}`;
  packsUsd: number[];
}

export function PersonBalancePanel({ onChange, paidOnly = false }: { onChange?: () => void; paidOnly?: boolean }) {
  const [b, setB] = useState<Balance | null>(null);
  const [adding, setAdding] = useState(false);
  const [token, setToken] = useState<'USDC' | 'ETH'>('USDC');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState('');
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
    const res = await authFetch('/api/balance').catch(() => null);
    if (res?.ok) setB((await res.json()) as Balance);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const done = (r: { added: number }) => {
    keep(null);
    setNote(W.added(dollars(r.added)));
    setAdding(false);
    void load();
    onChange?.();
  };
  const fail = (e: unknown) => {
    if (e instanceof WalletError && e.final) keep(null);
    setNote(e instanceof WalletError && e.why === 'no-wallet' ? W.noWallet : e instanceof WalletError && e.why === 'declined' ? W.wrongSign : (e as Error).message || W.claim.other);
  };
  // A payment this device still remembers is tried again, once, when the panel opens.
  const tried = useRef(false);
  useEffect(() => {
    if (!b?.open || !pending || tried.current) return;
    tried.current = true;
    void claimForPerson(pending, 3).then(done, (e: unknown) => {
      if (e instanceof WalletError && e.final) keep(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.open, pending]);
  if (!b) return null;

  const buy = async (usd: number) => {
    if (!b.payTo) return;
    if (!hasWallet()) return setNote(W.noWallet);
    setBusy(true);
    setNote(null);
    try {
      done(await payForPerson({ usd, token, payTo: b.payTo, usdc: b.usdc, onSigning: () => setNote(W.signing), onSent: keep, onWaiting: () => setNote(W.waiting) }));
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
      done(await claimForPerson(pending));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const recover = async () => {
    const h = txHashFrom(pasted);
    if (!h) return setNote(W.recoverBad);
    setBusy(true);
    setNote(W.waiting);
    try {
      done(await claimForPerson(h, 3));
      setPasted('');
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wallet-panel" data-panel="person-balance">
      <p className="wallet-balance">
        {W.title}: {W.balance(dollars(b.balanceUsd), b.generations)}
      </p>
      <p className="ic-note">{W.price(exactDollars(b.priceUsd), b.markup)}</p>
      <p className="ic-note">{paidOnly ? W.paidOnly : W.freeFirst}</p>
      {!b.open ? (
        <p className="ic-note">{W.notOpen}</p>
      ) : !adding ? (
        <button type="button" className="ic-secondary" onClick={() => setAdding(true)}>
          {W.addFunds}
        </button>
      ) : (
        <div className="wallet-add">
          <p className="ic-note">{W.how}</p>
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
          <p className="ic-note">{W.terms}</p>
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
            <TxHashField id="person-recover-hash" label={W.recoverLabel} value={pasted} onChange={setPasted} />
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
