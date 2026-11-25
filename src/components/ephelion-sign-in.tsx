'use client';

import { SignInChoices } from '~/components/sign-in-choices';
import { useAuth } from '~/lib/client-auth';
import '../styles/voice.css';

/** /ephelion's line to a signed-out visitor (Nate, 2026-11-24; reread as written). */
export const EPHELION_SIGN_IN_LINE = 'Sign in to try the Lord Ephelion challenge.';

/**
 * A signed-out visitor to /ephelion: one line and the site's sign-in, in the page, so signing in leaves them on
 * /ephelion, which then shows the challenge to those the switch lets in (and the usual not-found to anyone else).
 */
export function EphelionSignIn() {
  const auth = useAuth();
  return (
    <main className="vr vr-signin">
      <p className="vr-note">{EPHELION_SIGN_IN_LINE}</p>
      <SignInChoices size="small" wallet={auth.kind === 'signed-out' && !auth.inApp} />
    </main>
  );
}
