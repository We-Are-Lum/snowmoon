'use client';

import { useEffect, useState } from 'react';
import { SUPPORT, type SupportNetwork } from '~/lib/config';
import { SUPPORT_WORDING as W } from '~/lib/support-wording';
import { connectWallet, give, giftFits, giftUnits, hasWallet, onWalletChange, switchWallet, walletState, WalletError } from '~/lib/wallet/client';
import { AmountField } from './amount-field';

/** The support address in full, with a copy button. It is always SUPPORT.address, passed from the page. */
export function SupportAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <p className="support-address">
      <code data-address={address}>{address}</code>{' '}
      <button
        type="button"
        className="ic-secondary"
        data-copies={address}
        onClick={() =>
          void navigator.clipboard?.writeText(address).then(
            () => (setCopied(true), setTimeout(() => setCopied(false), 2000)),
            () => {},
          )
        }
      >
        {copied ? W.copied : W.copy}
      </button>
    </p>
  );
}

function Choice<T extends string>({ label, options, value, onChange, disabled }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void; disabled: boolean }) {
  return (
    <div className="support-choice" role="radiogroup" aria-label={label}>
      <span className="label">{label}</span>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? 'ic-primary' : 'ic-secondary'} disabled={disabled} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

type Fit = 'ok' | 'not-enough' | 'no-gas' | 'checking' | null;

/**
 * The send (owner, 2026-10-30): network (Base or Ethereum), token (ETH or USDC), amount, Send. Before offering the
 * transaction it reads the wallet's balances on that network (giftFits) and keeps Send off when they don't cover the
 * amount and the fee; a wallet on the other network is asked to switch first. Afterwards the transaction's link and
 * "Thank you." Every read and the send go through the wallet in this browser; nothing is sent to our server.
 */
export function SupportSend() {
  const [network, setNetwork] = useState<SupportNetwork>(SUPPORT.networks[0]);
  const [token, setToken] = useState<'ETH' | 'USDC'>('ETH');
  const [amount, setAmount] = useState('');
  const [wallet, setWallet] = useState<{ found: boolean; account: `0x${string}` | null; chainId: number | null }>({ found: true, account: null, chainId: null });
  const [fit, setFit] = useState<Fit>(null);
  const [ethUsd, setEthUsd] = useState<number | null>(null);
  const [sent, setSent] = useState<{ kind: 'busy' | 'waiting' | 'done' | 'error'; note: string; hash?: `0x${string}` } | null>(null);

  useEffect(() => {
    if (!hasWallet()) return setWallet({ found: false, account: null, chainId: null });
    const read = () => void walletState().then((s) => setWallet({ found: true, ...s }));
    read();
    return onWalletChange(read);
  }, []);

  // The ETH price, while ETH is chosen: our server reads Chainlink's ETH/USD on Base (GET /api/eth-usd, which carries
  // nothing about the reader), again each minute. No price, no estimate.
  useEffect(() => {
    if (token !== 'ETH') return;
    let live = true;
    const read = () =>
      void fetch('/api/eth-usd')
        .then((r) => (r.ok ? (r.json() as Promise<{ usd: number }>) : null))
        .then((p) => live && setEthUsd(p && p.usd > 0 ? p.usd : null), () => live && setEthUsd(null));
    read();
    const t = setInterval(read, 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [token]);

  const value = giftUnits({ token, amount });
  const estimate = token === 'ETH' && ethUsd !== null && value !== null ? (Number(amount) * ethUsd).toFixed(2) : null;
  const onNetwork = wallet.chainId === network.chainId;
  useEffect(() => {
    if (!wallet.account || !onNetwork || value === null) return setFit(null);
    let live = true;
    setFit('checking');
    const t = setTimeout(() => {
      giftFits({ network, token, amount }, wallet.account!).then(
        (f) => live && setFit(f),
        () => live && setFit(null),
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // value stands for amount and token together.
  }, [wallet.account, onNetwork, network, token, amount, value]);

  const busy = sent?.kind === 'busy' || sent?.kind === 'waiting';
  const send = async () => {
    setSent({ kind: 'busy', note: W.confirm });
    try {
      const hash = await give({ network, token, amount, onSent: (h) => setSent({ kind: 'waiting', note: W.waiting, hash: h }) });
      setSent({ kind: 'done', note: W.thanks, hash });
    } catch (e) {
      const why = e instanceof WalletError ? e.why : null;
      setSent({ kind: 'error', note: why === 'pay-failed' ? W.failed : W.declined });
    }
  };
  const ask = (fn: () => Promise<void>) => void fn().then(() => walletState().then((s) => setWallet({ found: true, ...s })), () => {});

  const note = !wallet.found
    ? W.noWallet
    : fit === 'checking'
      ? W.checking
      : fit === 'not-enough'
        ? W.notEnough(token, network.name)
        : fit === 'no-gas'
          ? W.noGas
          : null;
  return (
    <div className="support-send">
      <Choice label={W.network} options={SUPPORT.networks.map((n) => n.name)} value={network.name} onChange={(n) => (setNetwork(SUPPORT.networks.find((x) => x.name === n)!), setSent(null))} disabled={busy} />
      <Choice label={W.token} options={['ETH', 'USDC'] as const} value={token} onChange={(t) => (setToken(t), setSent(null))} disabled={busy} />
      <AmountField label={W.amount} unit={token} value={amount} onChange={(v) => (setAmount(v), setSent(null))} disabled={busy} />
      {estimate && (
        <p className="ic-note support-estimate" aria-live="polite">
          {W.estimate(estimate)}
        </p>
      )}
      <p className="support-go">
        {wallet.found && !wallet.account ? (
          <button type="button" className="ic-primary" onClick={() => ask(connectWallet)}>
            {W.connect}
          </button>
        ) : wallet.found && !onNetwork ? (
          <button type="button" className="ic-primary" onClick={() => ask(() => switchWallet(network.chainId))}>
            {W.switchTo(network.name)}
          </button>
        ) : (
          <button type="button" className="ic-primary" data-send disabled={!wallet.found || fit !== 'ok' || busy} onClick={() => void send()}>
            {W.send}
          </button>
        )}
      </p>
      {note && !sent && (
        <p className="ic-note support-status" role="status">
          {note}
        </p>
      )}
      {sent && (
        <p className={`ic-note support-status${sent.kind === 'error' ? ' support-error' : ''}`} role={sent.kind === 'error' ? 'alert' : 'status'}>
          {sent.hash && (
            <>
              <a href={`${network.explorer}/tx/${sent.hash}`} rel="noopener noreferrer" data-tx={sent.hash}>
                {W.tx}
              </a>{' '}
            </>
          )}
          {sent.note}
        </p>
      )}
    </div>
  );
}
