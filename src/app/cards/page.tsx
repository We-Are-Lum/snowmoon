import Link from 'next/link';
import type { Metadata } from 'next';
import { listCards } from '~/lib/cards';
import { db } from '~/lib/db';
import { LikeButton } from '~/components/card-actions';

export const metadata: Metadata = { title: 'Quote cards' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ sort?: string }> };

/** Saved quote cards: most liked or newest. Nothing is marked official (brief rule 3). */
export default async function CardsPage({ searchParams }: Props) {
  const sort = (await searchParams).sort === 'new' ? 'new' : 'top';
  const cards = await listCards(sort);
  return (
    <div className="page cards">
      <h1>Quote cards</h1>
      <p className="cards-intro">
        Passages readers saved from the book. To make one, select text in any chapter, or tap ↗ while listening.
      </p>
      <nav className="cards-sort" aria-label="Sort">
        <Link href="/cards" aria-current={sort === 'top' ? 'page' : undefined}>
          Most liked
        </Link>
        <Link href="/cards?sort=new" aria-current={sort === 'new' ? 'page' : undefined}>
          Newest
        </Link>
      </nav>
      {!db() && <p className="cards-empty">Saved cards are not available on this deployment.</p>}
      {db() && cards.length === 0 && <p className="cards-empty">No saved cards yet. Be the first: open a chapter and share a passage.</p>}
      <ul className="card-list">
        {cards.map((c) => (
          <li key={c.versionId}>
            <Link href={c.sharePath} className="card-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.cardUrl} alt={`Quote card: “${c.quote.text}”`} width={1200} height={800} loading="lazy" />
            </Link>
            <div className="card-meta">
              <LikeButton versionId={c.versionId} initial={c.likes} />
              <Link href={`/chapter/${c.spec.chapter}#c${c.spec.chapter}-b${c.spec.from}`}>
                Chapter {c.spec.chapter} · {c.quote.label}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
