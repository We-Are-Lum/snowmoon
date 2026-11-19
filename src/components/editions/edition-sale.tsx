'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hash } from 'viem';
import { EDITIONS_TEST as T } from '~/lib/editions/config';
import { amountToSend, editionState, formatEth, formatUsd, isBusy, quoteFrom, walletStep, type Amount, type MintProblem } from '~/lib/editions/ladder';
import { connect, freshQuote, mint, onWalletChange, problemFrom, switchToSepolia, walletNow, type WalletNow } from '~/lib/editions/wallet';
import { EW } from '~/lib/editions/wording';
import { Countdown } from './countdown';

type Live = { sold: number; lastMintAt: number | null; now: number };
type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'confirm'; send: bigint }
  | { kind: 'waiting'; hash: Hash }
  | { kind: 'problem'; problem: MintProblem; retryAt?: bigint; hash?: Hash };

/** Polls our API (never the RPC) for how many are sold and whether the edition is busy. */
function useLive(id: number, initial: Live): [Live, () => Promise<Live>] {
  const [live, setLive] = useState(initial);
  const read = useCallback(async () => {
    const r = await fetch(`/api/editions/${id}/live`, { cache: 'no-store' }).catch(() => null);
    const j = r?.ok ? ((await r.json()) as Live) : null;
    if (j) setLive(j);
    return j ?? initial;
  }, [id, initial]);
  useEffect(() => {
    const t = setInterval(() => void read(), 12_000);
    return () => clearInterval(t);
  }, [read]);
  return [live, read];
}

function useEthUsd(): number | null {
  const [usd, setUsd] = useState<number | null>(null);
  useEffect(() => {
    let on = true;
    const read = () =>
      void fetch('/api/eth-usd')
        .then((r) => (r.ok ? (r.json() as Promise<{ usd: number }>) : null))
        .then((p) => on && setUsd(p && p.usd > 0 ? p.usd : null), () => on && setUsd(null));
    read();
    const t = setInterval(read, 60_000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, []);
  return usd;
}

type Ctx = { id: number; size: number; prices: bigint[]; startTime: number; live: Live; readLive: () => Promise<Live> };
const LiveContext = createContext<Ctx | null>(null);
export const useEditionLive = () => {
  const c = useContext(LiveContext);
  if (!c) throw new Error('EditionLive missing');
  return c;
};

/** What's sold and whether it's busy, shared by the mint card and the ladder (polled from our API, never the RPC). */
export function EditionLive(props: { id: number; size: number; prices: string[]; startTime: number; initial: Live; children: React.ReactNode }) {
  const prices = useMemo(() => props.prices.map((p) => BigInt(p)), [props.prices]);
  const [live, readLive] = useLive(props.id, props.initial);
  return <LiveContext.Provider value={{ id: props.id, size: props.size, prices, startTime: props.startTime, live, readLive }}>{props.children}</LiveContext.Provider>;
}

/**
 * The mint card. Quiet and busy (owner, 2026-11-18): the page sends exactly the quoted price, unless someone minted
 * this edition in the last EDITIONS_TEST.busyWindowSeconds; then it sends the cushion and says so, with "at most",
 * before the buyer confirms. The price is read again just before sending.
 */
export function MintCard() {
  const { id, size, prices, startTime, live, readLive } = useEditionLive();
  const router = useRouter();
  const ethUsd = useEthUsd();
  const [wallet, setWallet] = useState<WalletNow>({ found: true, account: null, chainId: null, balance: null });
  const [quantity, setQuantity] = useState(1);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  /** The amount the buyer has been shown and agreed to send (set when the busy note or a new price is shown). */
  const agreed = useRef<bigint | null>(null);
  const [clock, setClock] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setClock(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const refreshWallet = useCallback(() => void walletNow().then(setWallet), []);
  useEffect(() => {
    refreshWallet();
    let off = () => {};
    void onWalletChange(refreshWallet).then((f) => (off = f));
    return () => off();
  }, [refreshWallet]);

  const sold = live.sold;
  const left = size - sold;
  const now = Math.max(clock, live.now);
  const state = editionState({ deployed: true, startTime, sold, size }, now);
  const q = Math.max(1, Math.min(quantity, Math.min(10, Math.max(left, 1))));
  const busy = isBusy(live.lastMintAt, now, T.busyWindowSeconds);
  const total = left > 0 ? quoteFrom(prices, sold, Math.min(q, left)) : 0n;
  const amount: Amount = left > 0 ? amountToSend({ quote: total, prices, sold, quantity: q, busy, cushionPieces: T.cushionPieces }) : { quote: 0n, send: 0n, cushion: false };
  const step = walletStep(wallet, { chainId: T.chainId, value: amount.send });
  const working = phase.kind === 'checking' || phase.kind === 'waiting';

  // A new quantity or a new sale changes the amount: a cushion the buyer agreed to no longer applies. A problem's
  // message stays (a lost race is reported just as the count moves).
  useEffect(() => {
    setPhase((p) => (p.kind === 'confirm' ? ((agreed.current = null), { kind: 'idle' }) : p));
  }, [q, sold]);

  const go = async () => {
    setPhase({ kind: 'checking' });
    let soldAtQuote = sold;
    try {
      // Read the price and the busy signal again, right before sending.
      const [fresh, l] = await Promise.all([freshQuote(id, q), readLive()]);
      soldAtQuote = l.sold;
      const nowBusy = isBusy(l.lastMintAt, Math.max(Math.floor(Date.now() / 1000), l.now), T.busyWindowSeconds);
      const a = amountToSend({ quote: fresh, prices, sold: l.sold, quantity: q, busy: nowBusy, cushionPieces: T.cushionPieces });
      // Anything the buyer hasn't seen yet (a cushion, or a higher price) is shown first; they tap again to send it. What
      // was on screen when they tapped (the total, or the busy note's "at most") counts as seen.
      const shown = amount.cushion ? amount.send : total;
      if (a.send !== shown && a.send !== agreed.current) {
        agreed.current = a.send;
        setPhase(a.cushion ? { kind: 'confirm', send: a.send } : { kind: 'problem', problem: 'price-moved', retryAt: a.send });
        return;
      }
      const w = await walletNow();
      setWallet(w);
      if (w.balance !== null && w.balance < a.send) return setPhase({ kind: 'problem', problem: 'not-enough' });
      const hash = await mint({ id, quantity: q, value: a.send, onSent: (h) => setPhase({ kind: 'waiting', hash: h }) });
      router.push(`/editions/${id}/minted/${hash}`);
    } catch (e) {
      let problem = problemFrom(e);
      const hash = (e as { hash?: Hash }).hash;
      // A wallet that doesn't pass the contract's error on: a sale since the quote means the price moved.
      const l = problem === 'failed' || problem === 'price-moved' ? await readLive() : null;
      if (problem === 'failed' && l && l.sold > soldAtQuote) problem = l.sold >= size ? 'sold-out' : 'price-moved';
      if (problem === 'price-moved' && l) {
        const retry = l.sold < size ? quoteFrom(prices, l.sold, Math.min(q, size - l.sold)) : undefined;
        agreed.current = retry ?? null;
        return setPhase({ kind: 'problem', problem, retryAt: retry, hash });
      }
      agreed.current = null;
      void readLive();
      setPhase({ kind: 'problem', problem, hash });
    }
  };

  const usd = (wei: bigint) => {
    const u = formatUsd(wei, ethUsd);
    return u ? <span className="ed-usd label">{EW.about(u)}</span> : null;
  };

  const action = () => {
    if (step === 'no-wallet') return <p className="ed-note" role="status">{EW.noWallet}</p>;
    if (step === 'connect')
      return (
        <button type="button" className="ic-primary" onClick={() => void connect().then(refreshWallet, () => {})}>
          {EW.connect}
        </button>
      );
    if (step === 'wrong-network')
      return (
        <>
          <p className="ed-note" role="status">{EW.wrongNetwork}</p>
          <button type="button" className="ic-primary" data-switch onClick={() => void switchToSepolia().then(refreshWallet, () => {})}>
            {EW.switchTo}
          </button>
        </>
      );
    const label = phase.kind === 'problem' && phase.problem === 'price-moved' && phase.retryAt ? EW.tryAgain(formatEth(phase.retryAt)) : EW.mint(q);
    return (
      <button type="button" className="ic-primary" data-mint disabled={working || state !== 'open'} onClick={() => void go()}>
        {label}
      </button>
    );
  };

  const status = () => {
    if (step === 'not-enough' || (phase.kind === 'problem' && phase.problem === 'not-enough'))
      return (
        <p className="ed-note" role="status" data-state="not-enough">
          {EW.notEnough(formatEth(amount.send, { up: true }))}{' '}
          <a href={T.faucetUrl} rel="noopener noreferrer" target="_blank">
            {EW.getTestEth}
          </a>
        </p>
      );
    if (phase.kind === 'checking') return <p className="ed-note" role="status">{EW.checking}</p>;
    if (phase.kind === 'waiting')
      return (
        <p className="ed-note" role="status" data-state="waiting">
          {EW.waiting}{' '}
          <a href={`${T.explorer}/tx/${phase.hash}`} rel="noopener noreferrer" target="_blank">
            {EW.viewTx}
          </a>
        </p>
      );
    if (phase.kind === 'problem') {
      const text: Record<MintProblem, string> = {
        'price-moved': EW.priceMoved(phase.retryAt ? formatEth(phase.retryAt) : formatEth(total)),
        'cannot-receive': EW.cannotReceive,
        'sold-out': EW.soldOutNow,
        'not-open': EW.notOpenYet,
        rejected: EW.rejected,
        'not-enough': '',
        failed: EW.failed,
      };
      return (
        <p className="ed-note ed-problem" role="alert" data-problem={phase.problem}>
          {text[phase.problem]}
          {phase.hash && phase.problem !== 'failed' && ` ${EW.feeSpent}`}
          {phase.hash && (
            <>
              {' '}
              <a href={`${T.explorer}/tx/${phase.hash}`} rel="noopener noreferrer" target="_blank">
                {EW.viewTx}
              </a>
            </>
          )}
        </p>
      );
    }
    return null;
  };

  return (
    <section className="ed-card" aria-labelledby="ed-card-title" data-state={state} data-busy={busy ? '1' : '0'}>
      {state === 'sold-out' ? (
        <>
          <h2 id="ed-card-title" className="ed-card-title">{EW.soldOut}</h2>
          <p className="ed-card-line">{EW.soldOutLine(size)}</p>
        </>
      ) : (
        <>
          <p className="label ed-card-pieces">
            <span id="ed-card-title">{EW.pieceOf(sold + 1, size)}</span>
            <span>{EW.left(left)}</span>
          </p>
          {state === 'not-open' && (
            <p className="ed-card-line" data-state="not-open">
              {EW.notOpen} <Countdown target={startTime} />
            </p>
          )}
          <p className="ed-price">
            <span className="ed-price-eth">{formatEth(prices[sold])}</span>
            <span className="ed-price-unit">ETH</span>
            {usd(prices[sold])}
          </p>
          <div className="ed-qty" role="group" aria-label={EW.quantity}>
            <span>{EW.quantity}</span>
            <span className="ed-qty-controls">
              <button type="button" className="ed-step" aria-label={EW.fewer} disabled={q <= 1 || working} onClick={() => setQuantity(q - 1)}>
                −
              </button>
              <output aria-live="polite" data-quantity={q}>{q}</output>
              <button type="button" className="ed-step" aria-label={EW.more} disabled={q >= Math.min(10, left) || working} onClick={() => setQuantity(q + 1)}>
                +
              </button>
            </span>
          </div>
          <p className="ed-total">
            <span>{EW.totalFor(q)}</span>
            <span className="ed-total-eth" data-total={total.toString()}>{formatEth(total)} ETH</span>
          </p>
          <div className="ed-go">{action()}</div>
          {(phase.kind === 'confirm' || amount.cushion) && (
            <p className="ed-busy" role="note" data-cushion={(phase.kind === 'confirm' ? phase.send : amount.send).toString()}>
              {EW.busy(formatEth(phase.kind === 'confirm' ? phase.send : amount.send, { up: true }))}
            </p>
          )}
          {status()}
        </>
      )}
    </section>
  );
}
