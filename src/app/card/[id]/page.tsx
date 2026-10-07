import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { APP_NAME, appUrl } from '~/lib/config';
import { getCard } from '~/lib/cards';
import { CastCardButton, LikeButton } from '~/components/card-actions';
import { PAPER } from '~/lib/tokens';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const card = await getCard((await params).id);
  if (!card) return { title: 'Card not found' };
  const target = `${appUrl()}/chapter/${card.spec.chapter}#c${card.spec.chapter}-b${card.spec.from}`;
  const embed = JSON.stringify({
    version: '1',
    imageUrl: card.cardUrl,
    button: {
      title: 'Read in Snowmoon',
      action: { type: 'launch_frame', name: APP_NAME, url: target, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER },
    },
  });
  const title = `Snowmoon, Chapter ${card.spec.chapter} ${card.quote.label}`;
  return {
    title,
    description: card.quote.text,
    openGraph: { title, description: card.quote.text, images: [{ url: card.cardUrl, width: 1200, height: 800 }] },
    twitter: { card: 'summary_large_image', title, description: card.quote.text, images: [card.cardUrl] },
    other: { 'fc:miniapp': embed, 'fc:frame': embed },
  };
}

/** A saved card: like it, cast it, or go to the passage. */
export default async function CardPage({ params }: Props) {
  const card = await getCard((await params).id);
  if (!card) notFound();
  const at = `/chapter/${card.spec.chapter}#c${card.spec.chapter}-b${card.spec.from}`;
  return (
    <article className="page share" data-setting={card.quote.setting ?? undefined}>
      <p className="label">
        Chapter {card.spec.chapter} · {card.quote.label} · saved by FID {card.createdBy}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="share-card" src={card.cardUrl} alt={`Quote card: “${card.quote.text}”`} width={1200} height={800} />
      <div className="card-meta">
        <LikeButton versionId={card.versionId} initial={card.likes} />
        <CastCardButton path={card.sharePath} chapter={card.spec.chapter} />
      </div>
      <blockquote className="share-quote">“{card.quote.text}”</blockquote>
      <nav className="share-actions" aria-label="Continue">
        <Link href={at}>Read it in context</Link>
        <Link href="/cards">More quote cards</Link>
      </nav>
      <p className="provenance">Snowmoon by Vitalik Buterin, GPL v3. The words are the author&apos;s; card images are AI-generated. Saved cards are published under GPL-3.0.</p>
    </article>
  );
}
