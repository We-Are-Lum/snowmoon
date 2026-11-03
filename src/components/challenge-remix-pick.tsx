'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { shuffleFresh } from '~/lib/challenge/shuffle';
import { LANDING_WORDING as L } from '~/lib/challenge/landing-wording';
import { RemixCardView, type RemixCardData } from './challenge-remix-card';

/**
 * The random selection on /challenge (owner, 2026-11-04; P5g's one exception for it): every published remix of the
 * six characters comes from the server, and this browser shuffles them afresh on each visit (shuffleFresh: unweighted,
 * no counts, no featuring) and shows the first few. The page itself stays cached, so a busy launch call doesn't make
 * a database read per visit, and still no two visits share an order. Until the shuffle runs (the server's HTML, or
 * with JavaScript off) nothing is shown in any order: empty frames, and "See all".
 */
export function ChallengeRemixPick({ all, size, names }: { all: RemixCardData[]; size: number; names: Record<string, string> }) {
  const [shown, setShown] = useState<RemixCardData[] | null>(null);
  useEffect(() => {
    setShown(shuffleFresh(all).slice(0, size));
  }, [all, size]);
  if (!all.length) return <p className="dz-muted ch-pick-none">{L.remixesNone}</p>;
  return (
    <>
      {shown ? (
        <ul className="ch-cards ch-pick" role="list" data-shuffled="true">
          {shown.map((r) => (
            <RemixCardView key={r.versionId} r={r} name={names[r.character] ?? r.character} />
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
            <p className="dz-muted">{L.remixesNoScript}</p>
          </noscript>
        </>
      )}
      <p className="ch-see-all">
        <Link href="/challenge/remixes">{L.seeAll} →</Link>
      </p>
    </>
  );
}
