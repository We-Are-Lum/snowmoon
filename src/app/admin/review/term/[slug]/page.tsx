import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { glossaryTerm } from '~/lib/glossary';
import { AdminReview } from '~/components/admin-review';
import '../../../../dashboard/you.css';
import '../../../../../styles/images.css';

/** The admins' review of one glossary word (owner, 2026-10-29). The page holds nothing; the images come from an admins-only API. */
export const metadata: Metadata = { title: 'Admin review', robots: { index: false, follow: false } };

export default async function TermReview({ params }: { params: Promise<{ slug: string }> }) {
  const t = glossaryTerm((await params).slug);
  if (!t) notFound();
  return <AdminReview query={`term=${t.slug}`} title={t.term} />;
}
