import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EPISODE } from '~/lib/config';
import { db } from '~/lib/db';
import { getOutline } from '~/lib/challenge/episode/outlines';
import { EPISODE_WORDING as W } from '~/lib/challenge/episode/wording';
import { byline } from '~/lib/images/byline';
import { OutlineFull } from '~/components/challenge-episode-views';
import { EpisodeOutlineActions } from '~/components/challenge-episode-actions';

/**
 * One outline (mock D2): the whole deck with the first-minute line, "Words by …; no AI wrote them", the pictures'
 * credits, and Share (Withdraw for its maker, Hide for a moderator). A withdrawn or hidden outline is "not found".
 */
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  const sql = db();
  const o = sql ? await getOutline(sql, id).catch(() => null) : null;
  return o && !o.withdrawn && !o.hidden ? o : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!EPISODE.public) return { robots: { index: false, follow: false } };
  const o = await load((await params).id);
  if (!o) return { title: 'Not found' };
  const title = o.title ?? W.untitled;
  const description = `${W.outlineFor}, ${W.pictureBy(byline(o.byName, o.byFid))}. ${o.cards[0]?.happens ?? ''}`;
  return { title, description, openGraph: { title, description }, twitter: { card: 'summary', title, description } };
}

export default async function EpisodeOutlinePage({ params }: Props) {
  if (!EPISODE.public) notFound();
  const o = await load((await params).id);
  if (!o) notFound();
  return (
    <div className="page ep-page">
      <OutlineFull o={o} />
      <EpisodeOutlineActions id={o.id} byFid={o.byFid} />
    </div>
  );
}
