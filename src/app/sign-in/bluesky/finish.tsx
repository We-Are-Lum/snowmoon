'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { finishBlueskySignIn, SocialError, SOCIAL_WORDING } from '~/lib/social/client';
import { SignInChoices } from '~/components/sign-in-choices';

/**
 * Finishes the sign-in once, then offers the way back. Wording: DRAFT, for the owner's reread.
 *
 * When it fails (2026-11-06: the error must show where the person is): the page says so at the top, in an alert, and
 * offers the ways to sign in right under it, so trying again is one tap; the rail and the menu don't repeat them on this
 * page (src/components/app-shell.tsx), so each button, and any error a new try shows, is on the screen once.
 */
export type FinishState = { kind: 'working' } | { kind: 'done'; name: string } | { kind: 'error'; message: string };

export const FINISH_WORDING = {
  working: 'Checking with your Bluesky server…',
  failed: 'You’re not signed in.',
  again: 'Try again:',
} as const;

/** What the page shows for each state (no hooks, so a test can render it). */
export function BlueskyFinishView({ state }: { state: FinishState }) {
  if (state.kind === 'working') return <p aria-busy="true">{FINISH_WORDING.working}</p>;
  if (state.kind === 'error')
    return (
      <div className="signin-failed">
        <p role="alert" className="signin-error">
          <strong>{FINISH_WORDING.failed}</strong> {state.message}
        </p>
        <p className="dz-label">{FINISH_WORDING.again}</p>
        <SignInChoices wallet />
      </div>
    );
  return (
    <p>
      Signed in as {state.name}. <Link href="/you">Go to your page</Link> or <Link href="/">back to the book</Link>.
    </p>
  );
}

export function BlueskyFinish() {
  const [state, setState] = useState<FinishState>({ kind: 'working' });
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
  return <BlueskyFinishView state={state} />;
}
