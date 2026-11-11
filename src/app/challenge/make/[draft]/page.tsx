import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CHALLENGE } from '~/lib/config';
import { ChallengePreview } from '~/components/challenge-preview';

/**
 * The preview, /challenge/make/<draft> (branch challenge-moments, 2026-11-05; docs/proposals/challenge-moments.md §1.3
 * S3). The draft lives only in the tab that made it (sessionStorage), so this page is a shell. Admin-only until the
 * owner opens the challenge (./not-found.tsx).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };
type Props = { params: Promise<{ draft: string }> };

export default async function ChallengePreviewPage({ params }: Props) {
  if (!CHALLENGE.public) notFound();
  const { draft } = await params;
  return (
    <div className="page prose ch-page">
      <ChallengePreview id={draft} />
    </div>
  );
}
