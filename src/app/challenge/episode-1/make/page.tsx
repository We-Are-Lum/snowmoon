import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EPISODE } from '~/lib/config';
import { EPISODE_WORDING as W } from '~/lib/challenge/episode/wording';
import { EpisodeMake } from '~/components/challenge-episode-make';

/** Episode 1's deck (mocks P2, P3, P4, D1): all in the browser; the draft stays on the device until Submit. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: W.title, robots: { index: false, follow: false } };
}

export default function EpisodeMakePage() {
  if (!EPISODE.public) notFound();
  return <EpisodeMake />;
}
