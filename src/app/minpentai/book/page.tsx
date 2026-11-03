import { AGENTS } from '~/lib/config';
import { BookView } from './book-view';
import './book.css';

export const metadata = { title: 'Minpentai: the book edition (draft)', robots: { index: false } };

/**
 * The book edition's pieces, each in a small sandbox (draft, 2026-10-31). Invite-only (owner, 2026-11-01): shown to the
 * people agent play is open to, signed in; anyone else sees a short note.
 * versions/book-scenarios.ts holds the scenarios; scripts/test-minpentai-book.ts checks each outcome.
 */
export default function MinpentaiBookPage() {
  return (
    <div className="page minpentai">
      <BookView people={[...AGENTS.minpentaiPlay.people]} />
    </div>
  );
}
