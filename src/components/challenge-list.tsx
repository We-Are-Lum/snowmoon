import Link from 'next/link';
import type { ChallengeItem } from '~/lib/challenge/episode/challenges';
import { CHALLENGES_WORDING as C, EPISODE_WORDING as W } from '~/lib/challenge/episode/wording';
import { EPISODE } from '~/lib/config';

/** /challenge once the remix challenge has closed (owner, 2026-11-24): open challenges first, then past ones. */
export function ChallengeList({ open, past }: { open: ChallengeItem[]; past: ChallengeItem[] }) {
  const item = (c: ChallengeItem) => (
    <li key={c.id} className="ep-challenge">
      <h3 className="ep-challenge-title">
        <Link href={c.href}>{c.title}</Link>
      </h3>
      <p className="ep-small">
        {c.when}
        {c.state === 'before' ? ` · ${W.opensOn()}` : c.state === 'closed' ? ` · ${C.closed}` : ''}
      </p>
      <p>{c.line}</p>
    </li>
  );
  return (
    <div className="page ep-page ep-challenges" data-page="challenges">
      <h1 className="ep-title">
        {C.title} {!EPISODE.wordingApproved && <span className="as-draft ep-draft">{C.draftMark}</span>}
      </h1>
      {open.length > 0 && (
        <section>
          <h2 className="ep-goals-head">{C.open}</h2>
          <ul className="ep-challenge-list">{open.map(item)}</ul>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="ep-goals-head">{C.past}</h2>
          <ul className="ep-challenge-list">{past.map(item)}</ul>
        </section>
      )}
    </div>
  );
}
