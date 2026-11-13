import { Suspense } from 'react';
import NotFound from 'next/dist/client/components/builtin/not-found';
import { ChallengeFlowGate } from '~/components/challenge-flow-gate';
import { ChallengeMake } from '~/components/challenge-make';

/** /challenge/make while the challenge is admin-only: "not found" to everyone, the screen for a signed-in admin. */
export default function ChallengeMakeNotFound() {
  return (
    <ChallengeFlowGate fallback={<NotFound />}>
      <div className="page prose ch-page mk-wrap">
        <Suspense>
          <ChallengeMake />
        </Suspense>
      </div>
    </ChallengeFlowGate>
  );
}
