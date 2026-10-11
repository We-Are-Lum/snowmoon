'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { openedChapters } from '~/lib/chat/device';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { BookLabel } from './design-sheets';

/**
 * A character sheet's "What the book says" (Design 5a): the book's own words about the character,
 * only from chapters opened on this device, each linked to its place. Nothing a model wrote.
 * And the cover for a character first met past where the reader has got to.
 */
const W = IMAGE_WORDING.designs;

function useFurthest() {
  const [furthest, setFurthest] = useState<number | null>(null);
  useEffect(() => setFurthest(Math.max(1, ...openedChapters())), []);
  return furthest;
}

export function BookQuotes({ name, quotes }: { name: string; quotes: { chapter: number; idx: number; quote: string; fact?: string }[] }) {
  const furthest = useFurthest();
  const shown = furthest === null ? [] : quotes.filter((q) => q.chapter <= furthest);
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

/** A character or a place first met past where the reader has got to is covered until shown. */
export function CharacterGate({ firstChapter, children, covered }: { firstChapter: number; children: ReactNode; covered?: string }) {
  const furthest = useFurthest();
  const [show, setShow] = useState(false);
  if (furthest !== null && (firstChapter <= furthest || show)) return <>{children}</>;
  return (
    <div className="dz-main">
      <div className="pictures-cover dz-cover">
        <p>{covered ?? W.page.coveredPage(firstChapter)}</p>
        <button type="button" className="pictures-show" onClick={() => setShow(true)} disabled={furthest === null}>
          {W.index.showAnyway}
        </button>
      </div>
    </div>
  );
}
