'use client';

import Link from 'next/link';
import { useAuth, useWalletSession } from '~/lib/client-auth';

/**
 * For someone arriving from a post (owner, 2026-11-04): signed out, one or two lines saying what this is (the
 * challenge and its dates) and how to remix, linking /challenge. Rendered on the server too, so it is in the page as
 * served; it goes once the person is signed in (Farcaster or a wallet).
 */
export function ChallengeArrival({ text, linkText }: { text: string; linkText: string }) {
  const auth = useAuth();
  const wallet = useWalletSession();
  if (auth.kind === 'signed-in' || wallet) return null;
  return (
    <p className="rl-arrival">
      {text} <Link href="/challenge">{linkText} →</Link>
    </p>
  );
}
