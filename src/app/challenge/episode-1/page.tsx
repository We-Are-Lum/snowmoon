import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EPISODE } from '~/lib/config';
import { episodePhase } from '~/lib/challenge/episode/rules';
import { EPISODE_WORDING as W } from '~/lib/challenge/episode/wording';
import { EpisodeLanding, episodeHasSample } from '~/components/challenge-episode-views';

/**
 * Episode 1: the opening (owner, 2026-11-24; docs/proposals/episode-1-opening.md, mock P1). The goals first, the
 * owner's example card, then the two ways to start. While EPISODE.public is off, "not found" to everyone (its HTML
 * says nothing of it); ./not-found.tsx then shows admins the page in the browser.
 */
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  if (!EPISODE.public) return { robots: { index: false, follow: false } };
  return { title: W.title, description: W.pitch };
}

export default function EpisodePage() {
  if (!EPISODE.public) notFound();
  return <EpisodeLanding phase={episodePhase()} hasSample={episodeHasSample()} />;
}
