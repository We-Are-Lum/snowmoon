'use client';

import { useState } from 'react';
import { shuffleFresh } from '~/lib/challenge/shuffle';
import { RemixCardView, type RemixCardData, type RemixCardWords } from './challenge-remix-card';

/**
 * Every submission on /challenge/entries (branch contest, 2026-11-04): newest first as the server gives them, or, on
 * the viewer's tap, in a fresh unweighted random order (shuffleFresh on the whole list, P5g), drawn again on each tap.
 * Never ordered by a count, and no like, recast or reply count anywhere (P5i). No challenge words live here (it is in
 * scripts everyone is served): they come in `w`, from the page (src/lib/challenge/landing-wording.ts).
 */
export type EntriesWords = { newest: string; shuffled: string; orderLabel: string; cards: Record<string, RemixCardWords>; pictures?: boolean };

export function ChallengeEntriesList({ all, w }: { all: RemixCardData[]; w: EntriesWords }) {
  const [shown, setShown] = useState<RemixCardData[] | null>(null);
  return (
    <>
      <div className="ch-filter ch-order" role="group" aria-label={w.orderLabel}>
        <button type="button" className="ch-chip" aria-pressed={shown === null} onClick={() => setShown(null)}>
          {w.newest}
        </button>
        <button type="button" className="ch-chip" aria-pressed={shown !== null} onClick={() => setShown(shuffleFresh(all))}>
          {w.shuffled}
        </button>
      </div>
      <ul className={w.pictures ? 'ch-cards ch-entries-list ch-pics' : 'ch-cards ch-entries-list'} role="list" data-shuffled={shown ? 'true' : undefined}>
        {(shown ?? all).map((r) => (
          <RemixCardView key={r.versionId} r={r} w={w.cards[r.character] ?? { name: r.character, untitled: r.character, alt: '' }} />
        ))}
      </ul>
    </>
  );
}
