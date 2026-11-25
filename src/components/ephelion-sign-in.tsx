'use client';

import { SignInChoices } from '~/components/sign-in-choices';
import { useAuth } from '~/lib/client-auth';
import { EPHELION_SIGN_IN_LINE } from '~/lib/voice/ephelion-sign-in-line';

/**
 * A signed-out visitor to /ephelion: one line and the site's sign-in, in the page, so signing in leaves them on
 * /ephelion, which then shows the challenge to those the switch lets in (and the usual not-found to anyone else).
 */
export function EphelionSignIn() {
  const auth = useAuth();
  return (
    <main className="vr vr-signin">
      <p className="vr-note">{EPHELION_SIGN_IN_LINE}</p>
      <SignInChoices note={false} wallet={auth.kind === 'signed-out' && !auth.inApp} />
    </main>
  );
}
