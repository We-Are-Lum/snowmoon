import type { Metadata } from 'next';
import Link from 'next/link';
import { chapterDateline, chapterNumbers, loadChapter } from '~/lib/book';
import { glossaryIndex } from '~/lib/glossary';
import { referenceSheets } from '~/lib/references';
import '../../you/you.css';
import '../../../styles/images.css';

/**
 * The admins' review (owner, 2026-10-29): one page per chapter and per glossary term with images. This index holds only
 * links; each page reads its images from /api/admin/picks/review, which answers admins only.
 */
export const metadata: Metadata = { title: 'Admin review', robots: { index: false, follow: false } };

export default function AdminReviewIndex() {
  const terms = glossaryIndex().filter((t) => referenceSheets(t.slug).length > 0);
  return (
    <main className="you admin-review">
      <p className="you-kicker label">Admin</p>
      <h1 className="you-title">Review</h1>
      <p className="you-lede">Every image each moment or word can show, with Hide and Pick. For admins; the pages say so to anyone else.</p>
      <h2 className="you-section">Chapters</h2>
      <ul className="ar-index">
        {chapterNumbers().map((n) => (
          <li key={n}>
            <Link href={`/admin/review/chapter/${n}`}>Chapter {n}</Link> <span className="you-note">{chapterDateline(loadChapter(n)!)}</span>
          </li>
        ))}
      </ul>
      <h2 className="you-section">Words with images</h2>
      <ul className="ar-index">
        {terms.map((t) => (
          <li key={t.slug}>
            <Link href={`/admin/review/term/${t.slug}`}>{t.term}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
