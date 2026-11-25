import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EPISODE } from '~/lib/config';
import { db } from '~/lib/db';
import { listOutlines } from '~/lib/challenge/episode/outlines';
import { EPISODE_WORDING as W } from '~/lib/challenge/episode/wording';
import { EpisodeOutlinesList } from '~/components/challenge-episode-list';

/**
 * Everyone's outlines (mock P5): newest first, or the viewer's own fresh shuffle; no like, view or any other count
 * (P5g, P5i). A withdrawn or hidden outline is not here. Read per request.
 */
export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  if (!EPISODE.public) return { robots: { index: false, follow: false } };
  return { title: W.listTitle, description: `${W.listTitle}: ${W.title}` };
}

export default async function EpisodeOutlinesPage() {
  if (!EPISODE.public) notFound();
  const sql = db();
  const all = sql ? await listOutlines(sql).catch(() => []) : [];
  return (
    <div className="page ep-page ep-list-page">
      <p className="ep-crumb">
        <Link href="/challenge/episode-1">{W.back}</Link>
      </p>
      <h1 className="ep-title">{W.listTitle}</h1>
      {all.length ? <EpisodeOutlinesList all={all} /> : <p className="ep-small">{W.listNone}</p>}
      <p className="ep-small">{W.listNote}</p>
    </div>
  );
}
