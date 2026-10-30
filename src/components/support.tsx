'use client';

import { useState } from 'react';
import { SUPPORT } from '~/lib/config';
import { SUPPORT_WORDING as W } from '~/lib/support-wording';
import { give, hasWallet, WalletError } from '~/lib/wallet/client';

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

const BASE = SUPPORT.networks.find((n) => n.chainId === SUPPORT.send.chainId)!;

/**
 * "Send with your wallet" (owner, 2026-10-30): on Base, in ETH or USDC, $5, $20, $50 or the sender's own amount, from
 * the wallet in this browser (the site's own wallet code; no outside script). Afterwards the transaction's link and a
 * thank-you. Nothing is sent to our server.
 */
export function SupportSend() {
  const [token, setToken] = useState<'USDC' | 'ETH'>('USDC');
  const [own, setOwn] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'waiting' | 'done' | 'error'; note?: string; hash?: `0x${string}` }>({ kind: 'idle' });
  const busy = state.kind === 'busy' || state.kind === 'waiting';
  const send = async (usd: number) => {
    if (!(usd >= SUPPORT.send.minUsd && usd <= SUPPORT.send.maxUsd)) return setState({ kind: 'error', note: W.badAmount(SUPPORT.send.minUsd, SUPPORT.send.maxUsd) });
    if (!hasWallet()) return setState({ kind: 'error', note: W.noWallet });
    setState({ kind: 'busy', note: W.sending });
    try {
      const hash = await give({ usd, token, onSent: (h) => setState({ kind: 'waiting', note: W.waiting, hash: h }) });
      setState({ kind: 'done', note: W.thanks, hash });
    } catch (e) {
      const why = e instanceof WalletError ? e.why : null;
      setState({ kind: 'error', note: why === 'no-wallet' ? W.noWallet : why === 'pay-failed' ? W.failed : W.declined });
    }
  };
  return (
    <div className="support-send">
      <p className="ic-note">{W.sendLine}</p>
      <div className="wallet-tokens" role="radiogroup" aria-label="Send in">
        {(['USDC', 'ETH'] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={token === t} className={token === t ? 'ic-primary' : 'ic-secondary'} disabled={busy} onClick={() => setToken(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="wallet-packs">
        {SUPPORT.send.presetsUsd.map((usd) => (
          <button key={usd} type="button" className="ic-secondary" disabled={busy} onClick={() => void send(usd)}>
            {W.send(usd, token)}
          </button>
        ))}
      </div>
      <form
        className="support-own"
        onSubmit={(e) => {
          e.preventDefault();
          void send(Number(own));
        }}
      >
        <label>
          {W.other} ($)
          <input type="number" inputMode="decimal" min={SUPPORT.send.minUsd} max={SUPPORT.send.maxUsd} step="0.01" value={own} onChange={(e) => setOwn(e.target.value)} disabled={busy} />
        </label>
        <button type="submit" className="ic-secondary" disabled={busy || !own}>
          {own ? W.send(Number(own), token) : W.send(0, token).replace('$0 ', '')}
        </button>
      </form>
      {state.note && (
        <p className={`ic-note${state.kind === 'error' ? ' support-error' : ''}`} role={state.kind === 'error' ? 'alert' : 'status'}>
          {state.note}
          {state.hash && (
            <>
              {' '}
              <a href={`${BASE.explorer}/tx/${state.hash}`} rel="noopener noreferrer" data-tx={state.hash}>
                {W.tx}
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
