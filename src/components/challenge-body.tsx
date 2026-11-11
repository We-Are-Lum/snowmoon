import Link from 'next/link';
import type { ChallengeView } from '~/lib/challenge/view';
import { ChallengeCard } from './challenge-card';

/**
 * /challenge's page, the hub (owner, 2026-11-05; docs/proposals/challenge-moments.md §1.3 S0), drawn from its data
 * (src/lib/challenge/view.ts), which carries every word: the title and one line, "Rules" (/challenge/rules) and
 * "Every entry", then one card per character in CHALLENGE.characters' order. Nothing else is on the hub (the random
 * remixes block is gone, owner 2026-11-05). Nothing is ordered by likes, payments or anything but time or chance
 * (P5, P7). No hooks, so the public page draws it on the server and the admins' view (challenge-admin.tsx) in the
 * browser.
 */
export function ChallengeBody({ v }: { v: ChallengeView }) {
  return (
    <div className="page prose ch-page">
      {v.adminNote && <p className="dz-note ch-admin-only">{v.adminNote}</p>}
      <h1>{v.title}</h1>
      <p className="ch-line">{v.line}</p>
      <p className="ch-top-links">
        <Link href="/challenge/rules" className="ch-rules-link">
          {v.rulesLink}
        </Link>
        {' · '}
        <Link href="/challenge/entries" className="ch-entries-link">
          {v.entriesLink}
        </Link>
        {v.draftShort && <span className="as-draft ch-draft"> · {v.draftShort}</span>}
      </p>
      {v.rewardsLine && (
        <p className="ch-rewards-line">
          <Link href={v.rewardsLine.href}>{v.rewardsLine.text}</Link>
        </p>
      )}
      <div className="cc-list">
        {v.cards.map(({ c, w }) => (
          <ChallengeCard key={c.slug} c={c} w={w} />
        ))}
      </div>
      <p className="dz-note ch-foot">{v.notAffiliated}</p>
    </div>
  );
}
