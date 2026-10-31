'use client';

import { useState } from 'react';
import { SIGN_IN_CHOICES } from '~/lib/sign-in-text';
import { HandleField } from './handle-field';
import { lensAccounts, signInWithLens, SocialError, startBlueskySignIn, SOCIAL_WORDING, type LensChoice } from '~/lib/social/client';

/**
 * "Sign in with Lens" and "Sign in with Bluesky" (branch signin-lens-bluesky), shown only where SIGN_IN_METHODS turns
 * them on (off until the owner's reread). The same button as Farcaster's and the wallet's; what each needs next
 * (pick a Lens account, type a Bluesky handle) opens under it. Wording: DRAFT, for the owner's reread.
 */
const say = (e: unknown) => (e instanceof SocialError ? e.message : SOCIAL_WORDING.server);

export function LensSignInButton({ className }: { className: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<{ wallet: `0x${string}`; accounts: LensChoice[] } | null>(null);
  const go = async (wallet: `0x${string}`, a: LensChoice) => {
    setBusy(true);
    setError(null);
    try {
      await signInWithLens(wallet, a.address);
      setChoosing(null);
    } catch (e) {
      setError(say(e));
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await lensAccounts();
      if (r.accounts.length === 1) return await go(r.wallet, r.accounts[0]);
      setChoosing(r);
    } catch (e) {
      setError(say(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="social-sign-in">
      <button type="button" className={className} onClick={() => void start()} disabled={busy}>
        {busy ? '…' : SIGN_IN_CHOICES.lens.label}
      </button>
      {choosing && (
        <ul className="social-pick" aria-label="Your Lens accounts">
          {choosing.accounts.map((a) => (
            <li key={a.address}>
              <button type="button" className="ed-small" disabled={busy} onClick={() => void go(choosing.wallet, a)}>
                {a.username ?? `${a.address.slice(0, 6)}…${a.address.slice(-4)}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="ic-note" role="alert">{error}</p>}
    </div>
  );
}

export function BlueskySignInButton({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await startBlueskySignIn(handle);
    } catch (e) {
      setError(say(e));
      setBusy(false);
    }
  };
  return (
    <div className="social-sign-in">
      <button type="button" className={className} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {SIGN_IN_CHOICES.bluesky.label}
      </button>
      {open && (
        <form className="social-handle" onSubmit={(e) => { e.preventDefault(); void go(); }}>
          <HandleField id="bluesky-handle" label="Your Bluesky handle" value={handle} onChange={setHandle} />
          <button type="submit" className="ed-small" disabled={busy || !handle.trim()}>{busy ? '…' : 'Continue'}</button>
        </form>
      )}
      {error && <p className="ic-note" role="alert">{error}</p>}
    </div>
  );
}
