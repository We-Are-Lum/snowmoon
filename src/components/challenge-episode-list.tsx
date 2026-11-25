'use client';

import { ShuffledEntries } from './challenge-entries-list';
import { OutlineSummary, type ShownOutline } from './challenge-episode-views';
import { EPISODE_WORDING as W } from '~/lib/challenge/episode/wording';

/**
 * Everyone's outlines (owner, 2026-11-24): newest first as the server gives them, or the viewer's own fresh shuffle
 * (ShuffledEntries, P5g). No like, view or any other count, and no other order (P5i).
 */
export function EpisodeOutlinesList({ all }: { all: ShownOutline[] }) {
  return (
    <ShuffledEntries all={all} w={{ newest: W.newest, shuffled: W.shuffled, orderLabel: W.orderLabel }}>
      {(shown, shuffled) => (
        <ul className="ep-list" role="list" data-shuffled={shuffled ? 'true' : undefined}>
          {shown.map((o) => (
            <li key={o.id}>
              <OutlineSummary o={o} />
            </li>
          ))}
        </ul>
      )}
    </ShuffledEntries>
  );
}
