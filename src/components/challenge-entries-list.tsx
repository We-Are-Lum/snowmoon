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

/**
 * The Newest / Shuffled toggle over a challenge's whole list of entries (P5g, as the owner reworded it for reread on
 * 2026-11-24: "Shuffled order is allowed in a challenge's list of entries, and nowhere else"). Shared by the remix
 * challenge's entries and Episode 1's outlines (src/components/challenge-episode-list.tsx), so the one shuffle of
 * entries stays here, on every entry shown.
 */
export function ShuffledEntries<T>({ all, w, children }: { all: T[]; w: { newest: string; shuffled: string; orderLabel: string }; children: (shown: T[], shuffled: boolean) => React.ReactNode }) {
  const [shown, setShown] = useState<T[] | null>(null);
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
      {children(shown ?? all, shown !== null)}
    </>
  );
}

export function ChallengeEntriesList({ all, w }: { all: RemixCardData[]; w: EntriesWords }) {
  return (
    <ShuffledEntries all={all} w={w}>
      {(shown, shuffled) => (
        <ul className={w.pictures ? 'ch-cards ch-entries-list ch-pics' : 'ch-cards ch-entries-list'} role="list" data-shuffled={shuffled ? 'true' : undefined}>
          {shown.map((r) => (
            <RemixCardView key={r.versionId} r={r} w={w.cards[r.character] ?? { name: r.character, untitled: r.character, alt: '' }} />
          ))}
        </ul>
      )}
    </ShuffledEntries>
  );
}
