import Link from 'next/link';
import type { Metadata } from 'next';
import { APP_NAME, appUrl } from '~/lib/config';
import { PAPER } from '~/lib/tokens';
import { parseResult, resultPath } from '~/lib/minpentai/share-result';

/**
 * Where a shared ladder win points (owner, 2026-10-19). Everything on it comes from its link; nothing
 * is stored and nothing ranks. Not offered to search engines.
 */
type Props = { searchParams: Promise<{ r?: string; s?: string; g?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = await searchParams;
  const x = parseResult(q.r, q.s, null, q.g);
  if (!x) return { title: 'Minpentai', robots: { index: false } };
  const url = `${appUrl()}${resultPath(x)}`;
  const card = `${appUrl()}/api/minpentai-card?r=${x.rung}&s=${x.steps}`;
  const title = `Beat ${x.name} · Minpentai`;
  const embed = JSON.stringify({
    version: '1',
    imageUrl: `${card}&shape=embed`,
    button: {
      title: 'Play Minpentai',
      action: { type: 'launch_frame', name: APP_NAME, url: `${appUrl()}/minpentai`, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER },
    },
  });
  return {
    title,
    robots: { index: false },
    openGraph: { title, url, images: [{ url: card, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, images: [card] },
    other: { 'fc:miniapp': embed, 'fc:frame': embed },
  };
}

export default async function MinpentaiResultPage({ searchParams }: Props) {
  const q = await searchParams;
  const x = parseResult(q.r, q.s, null, q.g);
  return (
    <div className="page prose">
      {x ? (
        <>
          <p className="label">Minpentai · the ladder</p>
          <h1>Beat {x.name}</h1>
          <p>
            Rung {x.rung} of 5, in {x.steps} steps. Someone shared this result; it isn&rsquo;t checked, saved or ranked.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/minpentai-card?r=${x.rung}&s=${x.steps}`} alt={`Minpentai: beat ${x.name}, rung ${x.rung} of 5, in ${x.steps} steps`} width={1200} height={630} style={{ width: '100%', height: 'auto' }} />
        </>
      ) : (
        <h1>Minpentai</h1>
      )}
      <p>
        <Link href="/minpentai">Play Minpentai</Link>, a game from the book with rules invented for this edition.
      </p>
    </div>
  );
}
