'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { sdk } from '@farcaster/miniapp-sdk';

type Status = 'loading' | 'signed-in' | 'signed-out' | 'outside-farcaster';

/**
 * Top bar. Tells the Farcaster host the app is ready, and signs in with Quick Auth.
 * The FID lives in client state for this session; the server derives it from the
 * bearer token on every request (see src/lib/auth.ts). Reading never requires it.
 */
export function MiniappBar() {
  const [status, setStatus] = useState<Status>('loading');
  const [fid, setFid] = useState<number | null>(null);

  const signIn = useCallback(async () => {
    // quickAuth.fetch gets (or reuses) a token and sends it as Authorization: Bearer.
    const res = await sdk.quickAuth.fetch('/api/auth/me');
    if (!res.ok) throw new Error(`auth ${res.status}`);
    setFid(((await res.json()) as { fid: number }).fid);
    setStatus('signed-in');
  }, []);

  useEffect(() => {
    (async () => {
      const inMiniApp = await sdk.isInMiniApp().catch(() => false);
      if (!inMiniApp) return setStatus('outside-farcaster');
      sdk.actions.ready().catch(() => {});
      // Inside Farcaster, Quick Auth is silent: sign in automatically.
      signIn().catch(() => setStatus('signed-out'));
    })();
  }, [signIn]);

  return (
    <header className="bar">
      <Link href="/" className="bar-title">
        Snowmoon
      </Link>
      <nav className="bar-links">
        <Link href="/cards">Cards</Link>
        <Link href="/about">About</Link>
        <span className="bar-auth" aria-live="polite">
          {status === 'loading' && '…'}
          {status === 'signed-in' && `fid ${fid}`}
          {status === 'signed-out' && (
            <button type="button" onClick={() => signIn().catch(() => setStatus('signed-out'))}>
              Sign in
            </button>
          )}
          {status === 'outside-farcaster' && <span title="Open in a Farcaster client to sign in">reading</span>}
        </span>
      </nav>
    </header>
  );
}
