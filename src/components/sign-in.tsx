'use client';

import { useEffect, useRef, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { inMiniApp, saveWebSession } from '~/lib/client-auth';

/**
 * "Sign in with Farcaster". Inside a Farcaster app it is Quick Auth, silent. On the plain
 * website it opens a dialog with a QR code (desktop) and an "Open Farcaster" link (phones);
 * our server talks to Farcaster's relay and sign-in server (src/app/api/auth/web/*). The
 * dialog names both outside services before anything starts. Model-drafted wording.
 */
export { SIGN_IN_SERVICES } from '~/lib/sign-in-text';
import { SIGN_IN_SERVICES } from '~/lib/sign-in-text';

type Step = { kind: 'idle' } | { kind: 'starting' } | { kind: 'waiting'; url: string; qr: string } | { kind: 'error'; message: string };

export function SignInButton({ className = 'as-primary', label = 'Sign in with Farcaster' }: { className?: string; label?: string }) {
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  const stop = () => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  };
  useEffect(() => stop, []);
  const close = () => {
    stop();
    setStep({ kind: 'idle' });
    opener.current?.focus();
  };

  useEffect(() => {
    if (step.kind === 'idle') return;
    dialog.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);

  const start = async () => {
    if (await inMiniApp()) {
      await sdk.quickAuth.getToken().catch(() => null);
      window.location.reload();
      return;
    }
    setStep({ kind: 'starting' });
    const res = await fetch('/api/auth/web/start', { method: 'POST' }).catch(() => null);
    if (!res?.ok) return setStep({ kind: 'error', message: 'Farcaster sign-in is not answering. Try again in a moment.' });
    const { channelToken, url, qr } = (await res.json()) as { channelToken: string; url: string; qr: string };
    setStep({ kind: 'waiting', url, qr });
    const started = Date.now();
    poll.current = setInterval(async () => {
      if (Date.now() - started > 5 * 60_000) {
        stop();
        return setStep({ kind: 'error', message: 'That code has run out. Try again.' });
      }
      const r = await fetch(`/api/auth/web/status?c=${encodeURIComponent(channelToken)}`).catch(() => null);
      if (!r) return;
      const s = (await r.json().catch(() => ({}))) as { state?: string; token?: string; username?: string | null };
      if (s.state === 'completed' && s.token) {
        stop();
        saveWebSession(s.token, s.username);
        setStep({ kind: 'idle' });
      } else if (s.state === 'expired' || s.state === 'failed') {
        stop();
        setStep({ kind: 'error', message: s.state === 'failed' ? 'Farcaster could not confirm that sign-in. Try again.' : 'That code has run out. Try again.' });
      }
    }, 1500);
  };

  return (
    <>
      <button ref={opener} type="button" className={className} onClick={() => void start()} disabled={step.kind === 'starting'}>
        {label}
      </button>
      {step.kind !== 'idle' && step.kind !== 'starting' && (
        <div className="as-overlay" onClick={(e) => e.target === e.currentTarget && close()}>
          <div ref={dialog} className="as-sheet sign-in-sheet" role="dialog" aria-modal="true" aria-labelledby="sign-in-title">
            <p className="as-label">Sign in</p>
            <h2 id="sign-in-title">Sign in with Farcaster</h2>
            {step.kind === 'waiting' ? (
              <>
                <p className="sign-in-how sign-in-desktop">Scan this code with your phone&apos;s camera or the Farcaster app, then approve. It works for five minutes.</p>
                <div className="sign-in-qr sign-in-desktop" role="img" aria-label="QR code for signing in with Farcaster" dangerouslySetInnerHTML={{ __html: step.qr }} />
                <p className="sign-in-how sign-in-phone">Open Farcaster, approve, then come back to this tab.</p>
                <a className="as-primary sign-in-open" href={step.url} target="_blank" rel="noopener noreferrer">
                  Open Farcaster
                </a>
                <p className="as-label as-thinking" aria-live="polite">
                  Waiting for your approval…
                </p>
              </>
            ) : (
              <p role="alert">{step.message}</p>
            )}
            <p className="as-note">{SIGN_IN_SERVICES}</p>
            <div className="as-actions">
              <button type="button" className="as-quiet" onClick={close}>
                Cancel
              </button>
            </div>
            <p className="as-draft">Draft wording</p>
          </div>
        </div>
      )}
    </>
  );
}
