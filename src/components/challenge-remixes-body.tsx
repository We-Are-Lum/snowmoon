import Link from 'next/link';
import type { RemixesView } from '~/lib/challenge/remixes-view';
import { RemixCardView } from './challenge-remix-card';
import { ChallengeEntriesList } from './challenge-entries-list';

/**
 * /challenge/remixes ("See all"), drawn from its data (src/lib/challenge/remixes-view.ts), which carries every word.
 * Newest first, by character, a page at a time; no count on any card (P5i). No hooks, so the public page draws it on
 * the server and the admins' view (challenge-admin.tsx) in the browser.
 */
export function ChallengeRemixesBody({ v }: { v: RemixesView }) {
  return (
    <div className="page prose ch-page ch-feed-page">
      <p className="label ip-crumb">
        <Link href="/challenge">{v.back}</Link>
      </p>
      {v.adminNote && <p className="dz-note ch-admin-only">{v.adminNote}</p>}
      <h1>{v.title}</h1>
      <p className="as-draft ch-draft">{v.draft}</p>
      <nav className="ch-filter" aria-label={v.filterLabel}>
        {v.chips.map((c) => (
          <Link key={c.key} href={c.href} className="ch-chip" data-character={c.key === 'all' ? undefined : c.key} aria-current={c.current ? 'page' : undefined}>
            {c.name}
          </Link>
        ))}
      </nav>
      <p className="dz-note">{v.note}</p>
      {v.cards.length && v.order ? (
        <ChallengeEntriesList all={v.cards} w={{ newest: v.order.newest, shuffled: v.order.shuffled, orderLabel: v.order.label, cards: v.cardWords }} />
      ) : v.cards.length ? (
        <ul className="ch-cards ch-feed" role="list">
          {v.cards.map((r) => (
            <RemixCardView key={r.versionId} r={r} w={v.cardWords[r.character] ?? { name: r.character, untitled: r.character, alt: '' }} />
          ))}
        </ul>
      ) : (
        <p className="dz-muted ch-feed-none">{v.none}</p>
      )}
      {(v.older || v.newest) && (
        <p className="ch-pages">
          {v.newest && <Link href={v.newest.href}>{v.newest.text}</Link>}
          {v.newest && v.older && ' · '}
          {v.older && (
            <Link href={v.older.href} rel="next">
              {v.older.text}
            </Link>
          )}
        </p>
      )}
      <p className="dz-note">{v.notAffiliated}</p>
    </div>
  );
}
