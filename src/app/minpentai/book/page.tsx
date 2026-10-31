import { BookView } from './book-view';
import './book.css';

export const metadata = { title: 'Minpentai: the book edition (draft)', robots: { index: false } };

/**
 * The book edition's pieces, each in a small sandbox (draft, 2026-10-31; linked from nowhere yet).
 * versions/book-scenarios.ts holds the scenarios; scripts/test-minpentai-book.ts checks each outcome.
 */
export default function MinpentaiBookPage() {
  return (
    <div className="page minpentai">
      <BookView />
    </div>
  );
}
