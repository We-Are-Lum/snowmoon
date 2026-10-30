import type { Metadata } from 'next';
import { IllustrationReview } from '~/components/illustration-review';
import '../../../styles/images.css';
import '../you.css';

/**
 * /dashboard/illustrations: the owner's review of the seeded images (owner, 2026-10-23: "Review page under /dashboard, owner only,
 * worst first"). The page as served holds nothing: the jobs, the checks and the decisions are read in the browser from
 * /api/you/illustrations, which answers only for the owner (ILLUSTRATION_CHECK.owners).
 */
export const metadata: Metadata = { title: 'Image review', robots: { index: false, follow: false } };

export default function IllustrationReviewPage() {
  return <IllustrationReview />;
}
