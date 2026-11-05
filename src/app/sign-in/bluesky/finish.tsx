'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { finishBlueskySignIn, SocialError, SOCIAL_WORDING } from '~/lib/social/client';

/** Finishes the sign-in once, then offers the way back. Wording: DRAFT, for the owner's reread. */
export function BlueskyFinish() {
  const [state, setState] = useState<{ kind: 'working' } | { kind: 'done'; name: string } | { kind: 'error'; message: string }>({ kind: 'working' });
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const params = new URLSearchParams(window.location.search);
    // The code leaves the address bar at once (it is single-use, but needn't sit in history).
    window.history.replaceState(null, '', window.location.pathname);
    finishBlueskySignIn(params).then(
      (handle) => setState({ kind: 'done', name: handle ?? 'your Bluesky account' }),
      (e) => setState({ kind: 'error', message: e instanceof SocialError ? e.message : SOCIAL_WORDING.server }),
    );
  }, []);
  if (state.kind === 'working') return <p aria-busy="true">Checking with your Bluesky server…</p>;
  if (state.kind === 'error') return <p role="alert">{state.message}</p>;
  return (
    <p>
      Signed in as {state.name}. <Link href="/you">Go to your page</Link> or <Link href="/">back to the book</Link>.
    </p>
  );
}
