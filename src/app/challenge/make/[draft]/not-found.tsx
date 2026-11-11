'use client';

import { useParams } from 'next/navigation';
import NotFound from 'next/dist/client/components/builtin/not-found';
import { ChallengeFlowGate } from '~/components/challenge-flow-gate';
import { ChallengePreview } from '~/components/challenge-preview';

/** The preview while the challenge is admin-only: "not found" to everyone, the preview for a signed-in admin. */
export default function ChallengePreviewNotFound() {
  const { draft } = useParams<{ draft: string }>();
  return (
    <ChallengeFlowGate fallback={<NotFound />}>
      <div className="page prose ch-page">
        <ChallengePreview id={draft} />
      </div>
    </ChallengeFlowGate>
  );
}
