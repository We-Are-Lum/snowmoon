'use client';

import { useId, useState } from 'react';
import { SIGN_IN_CHOICES } from '~/lib/sign-in-text';
import { HandleField } from './handle-field';
import { lastBlueskyHandle, lensAccounts, signInWithLens, SocialError, startBlueskySignIn, SOCIAL_WORDING, type LensChoice } from '~/lib/social/client';

/**
 * "Sign in with Lens" and "Sign in with Bluesky" (branch signin-lens-bluesky), shown only where SIGN_IN_METHODS turns
 * them on. The same button as Farcaster's and the wallet's; what each needs next (pick a Lens account, or, for
 * Bluesky, another server's handle) opens under it, with the same button. Wording: DRAFT, for the owner's reread.
 */
const say = (e: unknown) => (e instanceof SocialError ? e.message : SOCIAL_WORDING.server);

/** DRAFT wording (coding agent, 2026-11-05), for the owner. */
export const SOCIAL_BUTTON_WORDING = {
  chooseLens: 'Choose your Lens account',
  otherServer: 'Use another server or handle',
  handleLabel: 'Your Bluesky handle',
  continue: 'Continue',
} as const;

export function LensSignInButton({ className, label, onDone }: { className: string; label?: string; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<{ wallet: `0x${string}`; accounts: LensChoice[] } | null>(null);
  const titleId = useId();
  const go = async (wallet: `0x${string}`, a: LensChoice) => {
    setBusy(true);
    setError(null);
    try {
      await signInWithLens(wallet, a.address);
      setChoosing(null);
      onDone?.();
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
        {busy ? '…' : (label ?? SIGN_IN_CHOICES.lens.label)}
      </button>
      {choosing && (
        <div className="social-pick-wrap">
          <p className="social-pick-title" id={titleId}>{SOCIAL_BUTTON_WORDING.chooseLens}</p>
          {/* The same button as the one above (2026-11-05: one button style). */}
          <ul className="social-pick" aria-labelledby={titleId}>
            {choosing.accounts.map((a) => (
              <li key={a.address}>
                <button type="button" className={className} disabled={busy} onClick={() => void go(choosing.wallet, a)}>
                  {a.username ?? `${a.address.slice(0, 6)}…${a.address.slice(-4)}`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="ic-note" role="alert">{error}</p>}
    </div>
  );
}

/**
 * "Sign in with Bluesky" (2026-11-05): starts at Bluesky's own sign-in page (bsky.social), which asks which account; the
 * browser may remember it. "Use another server or handle" opens the handle box, for an account whose server isn't
 * Bluesky's, filled in with the handle last signed in with on this device (never required).
 */
export function BlueskySignInButton({ className, forLink = false, label }: { className: string; forLink?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = `bluesky-handle${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const go = async (h: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await startBlueskySignIn(h, { forLink });
    } catch (e) {
      setError(say(e));
      setBusy(false);
    }
  };
  const toggle = () => {
    if (!open && !handle) setHandle(lastBlueskyHandle());
    setOpen((o) => !o);
  };
  return (
    <div className="social-sign-in">
      <button type="button" className={className} onClick={() => void go(null)} disabled={busy}>
        {busy && !open ? '…' : (label ?? SIGN_IN_CHOICES.bluesky.label)}
      </button>
      <button type="button" className="social-other" onClick={toggle} aria-expanded={open}>
        {SOCIAL_BUTTON_WORDING.otherServer}
      </button>
      {open && (
        <form className="social-handle" onSubmit={(e) => { e.preventDefault(); void go(handle); }}>
          <HandleField id={fieldId} label={SOCIAL_BUTTON_WORDING.handleLabel} value={handle} onChange={setHandle} />
          <button type="submit" className={className} disabled={busy || !handle.trim()}>{busy ? '…' : SOCIAL_BUTTON_WORDING.continue}</button>
        </form>
      )}
      {error && <p className="ic-note" role="alert">{error}</p>}
    </div>
  );
}
