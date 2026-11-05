'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { shuffleFresh } from '~/lib/challenge/shuffle';
import { RemixCardView, type RemixCardData, type RemixCardWords } from './challenge-remix-card';

/**
 * The random selection on /challenge (owner, 2026-11-04; P5g's one exception for it): every published remix of the
 * six characters comes from the server, and this browser shuffles them afresh on each visit (shuffleFresh: unweighted,
 * no counts, no featuring) and shows the first few. The page itself stays cached, so a busy launch call doesn't make
 * a database read per visit, and still no two visits share an order. Until the shuffle runs (the server's HTML, or
 * with JavaScript off) nothing is shown in any order: empty frames, and "See all". No challenge words live here (it is
 * in scripts everyone is served): they come in `w`, from the server's view (src/lib/challenge/view.ts).
 */
export type PickWords = { none: string; noScript: string; seeAll: string; cards: Record<string, RemixCardWords> };
export function ChallengeRemixPick({ all, size, w }: { all: RemixCardData[]; size: number; w: PickWords }) {
  const [shown, setShown] = useState<RemixCardData[] | null>(null);
  useEffect(() => {
    setShown(shuffleFresh(all).slice(0, size));
  }, [all, size]);
  if (!all.length) return <p className="dz-muted ch-pick-none">{w.none}</p>;
  return (
    <>
      {shown ? (
        <ul className="ch-cards ch-pick" role="list" data-shuffled="true">
          {shown.map((r) => (
            <RemixCardView key={r.versionId} r={r} w={w.cards[r.character] ?? { name: r.character, untitled: r.character, alt: '' }} />
          ))}
        </ul>
      ) : (
        <>
          <ul className="ch-cards ch-pick" role="list" aria-hidden="true">
            {Array.from({ length: Math.min(size, all.length) }, (_, i) => (
              <li key={i} className="ch-card ch-card-wait">
                <span className="ch-card-img ch-card-empty" />
              </li>
            ))}
          </ul>
          <noscript>
            <p className="dz-muted">{w.noScript}</p>
          </noscript>
        </>
      )}
      <p className="ch-see-all">
        <Link href="/challenge/remixes">{w.seeAll} →</Link>
      </p>
    </>
  );
}
