import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { APP_NAME, appUrl } from '~/lib/config';
import { quoteQuery, resolveQuote } from '~/lib/quote';

/**
 * The page a quote card links to. Its metadata makes the card the cast's
 * preview on Farcaster, with a button that opens the miniapp at the quoted
 * paragraph. Stateless: the URL says everything, and resolveQuote checks it
 * against the book.
 */
type Props = {
  params: Promise<{ n: string; range: string }>;
  searchParams: Promise<{ q?: string; img?: string }>;
};

async function load({ params, searchParams }: Props) {
  const { n, range } = await params;
  const { q, img } = await searchParams;
  const quote = resolveQuote(Number(n), range, q, img);
  return quote ? { quote, card: `${appUrl()}/api/card/${n}/${range}${quoteQuery(q, img)}` } : null;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const r = await load(props);
  if (!r) return { title: 'Quote not found' };
  const { quote, card } = r;
  const target = `${appUrl()}/chapter/${quote.chapter}#c${quote.chapter}-b${quote.from}`;
  const embed = JSON.stringify({
    version: '1',
    imageUrl: card,
    button: {
      title: 'Read in Snowmoon',
      action: { type: 'launch_frame', name: APP_NAME, url: target, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: '#F4F2ED' },
    },
  });
  const title = `Snowmoon, Chapter ${quote.chapter} ${quote.label}`;
  return {
    title,
    description: quote.text,
    openGraph: { title, description: quote.text, images: [{ url: card, width: 1200, height: 800 }] },
    twitter: { card: 'summary_large_image', title, description: quote.text, images: [card] },
    other: { 'fc:miniapp': embed, 'fc:frame': embed },
  };
}

export default async function SharePage(props: Props) {
  const r = await load(props);
  if (!r) notFound();
  const { quote, card } = r;
  const at = `/chapter/${quote.chapter}#c${quote.chapter}-b${quote.from}`;
  return (
    <article className="page share" data-setting={quote.setting ?? undefined}>
      <p className="label">
        Chapter {quote.chapter} · {quote.label}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="share-card" src={card} alt={`Quote card: “${quote.text}”`} width={1200} height={800} />
      <blockquote className="share-quote">“{quote.text}”</blockquote>
      <nav className="share-actions" aria-label="Continue">
        <Link href={at}>Read it in context</Link>
        <Link href={at}>Listen from here</Link>
        <Link href={`/chapter/${quote.chapter}`}>Make your own card</Link>
      </nav>
      <p className="provenance">
        Snowmoon by Vitalik Buterin, GPL v3. Quote cards are drawn from the book&apos;s own text; images are seeded starting points.
      </p>
    </article>
  );
}
