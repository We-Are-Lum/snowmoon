import { notFound } from 'next/navigation';
import { signInOpen } from '~/lib/config';
import { BlueskyFinish } from './finish';

/**
 * Where a Bluesky sign-in comes back to (branch signin-lens-bluesky; SOCIAL_SIGN_IN.bluesky.redirectPath). The page
 * finishes it with what it kept in this tab (src/lib/social/client.ts). 404 while Bluesky sign-in is off.
 */
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Signing in with Bluesky', robots: { index: false } };

export default function BlueskySignIn() {
  if (!signInOpen('bluesky')) notFound();
  return (
    <div className="page prose">
      <h1>Signing in with Bluesky</h1>
      <BlueskyFinish />
    </div>
  );
}
