'use client';

import { useParams } from 'next/navigation';
import NotFound from 'next/dist/client/components/builtin/not-found';
import { ChallengeFlowGate } from '~/components/challenge-flow-gate';
import { ChallengePicture } from '~/components/challenge-picture';

/** A challenge picture's page while the challenge is admin-only: "not found" to everyone, the page for a signed-in admin. */
export default function ChallengePictureNotFound() {
  const { id } = useParams<{ id: string }>();
  return (
    <ChallengeFlowGate fallback={<NotFound />}>
      <div className="page prose ch-page">
        <ChallengePicture id={id} />
      </div>
    </ChallengeFlowGate>
  );
}
