import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { CHALLENGE } from '~/lib/config';
import { ChallengeMake } from '~/components/challenge-make';

/**
 * The remix screen, /challenge/make?from=<version>&moment=<id> (branch challenge-moments, 2026-11-05;
 * docs/proposals/challenge-moments.md §1.3 S2). A shell: the screen asks GET /api/challenge/make for its picture,
 * moments and words. Until the owner opens the challenge (CHALLENGE.public) it answers "not found", and ./not-found.tsx
 * shows admins the screen in the browser.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ChallengeMakePage() {
  if (!CHALLENGE.public) notFound();
  return (
    <div className="page prose ch-page">
      <Suspense>
        <ChallengeMake />
      </Suspense>
    </div>
  );
}
