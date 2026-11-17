'use client';

import Link from 'next/link';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { BookLabel } from './design-sheets';

/**
 * A character sheet's "What the book says" (Design 5a): the book's own words about the character, from the whole book,
 * each linked to its place. Nothing a model wrote. (Until 2026-11-17 only chapters opened on this device; principle 9
 * retired by the owner that day.)
 */
const W = IMAGE_WORDING.designs;

export function BookQuotes({ name, quotes }: { name: string; quotes: { chapter: number; idx: number; quote: string; fact?: string }[] }) {
  const shown = quotes;
  return (
    <section className="dz-book" aria-label={`What the book says about ${name}`}>
      <p className="dz-label">
        {W.page.bookTitle} <BookLabel />
      </p>
      {shown.length ? (
        <ul>
          {shown.map((q) => (
            <li key={`${q.chapter}-${q.idx}`}>
              <q>{q.quote}</q>{' '}
              <Link href={`/chapter/${q.chapter}#c${q.chapter}-b${q.idx}`} className="dz-ref">
                c{q.chapter}-b{q.idx} →
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dz-note">{W.page.bookNone}</p>
      )}
      <p className="dz-note">{W.page.bookNote}</p>
    </section>
  );
}
