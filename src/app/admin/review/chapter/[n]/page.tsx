import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadChapter } from '~/lib/book';
import { AdminReview } from '~/components/admin-review';
import '../../../../dashboard/you.css';
import '../../../../../styles/images.css';

/** The admins' review of one chapter (owner, 2026-10-29). The page holds nothing; the images come from an admins-only API. */
export const metadata: Metadata = { title: 'Admin review', robots: { index: false, follow: false } };

export default async function ChapterReview({ params }: { params: Promise<{ n: string }> }) {
  const n = Number((await params).n);
  if (!Number.isInteger(n) || !loadChapter(n)) notFound();
  return <AdminReview query={`chapter=${n}`} title={`Chapter ${n}`} />;
}
