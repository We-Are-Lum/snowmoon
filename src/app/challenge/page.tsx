import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { APP_NAME, CHALLENGE, appUrl } from '~/lib/config';
import { db } from '~/lib/db';
import { challengeView } from '~/lib/challenge/view';
import { ChallengeBody } from '~/components/challenge-body';
import { PAPER } from '~/lib/tokens';

/**
 * The remix challenge's landing page, the short version (owner, 2026-11-04; docs/proposals/challenge-short-page.md;
 * its data and words in src/lib/challenge/view.ts). Readable signed out once the owner opens it (CHALLENGE.public).
 * Until then (owner, 2026-11-04: "/challenge is admin-only for now") it answers "not found" to everyone, as agent pages
 * do while AGENTS.public is off, and its HTML says nothing of the challenge; ./not-found.tsx then shows admins the page
 * in the browser, from GET /api/challenge/view (admins only).
 *
 * Why the random parts (the remixes, and a character's several bases) are shuffled in the browser, not on the server
 * per request: the page stays cached (revalidate below), so a launch-call crowd doesn't make a database read per
 * visit, and every visit still gets its own order; a server shuffle on a cached page would show everyone the same
 * order for a minute.
 */
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  if (!CHALLENGE.public) return { robots: { index: false, follow: false } };
  // Cast in Farcaster (pre-flight 2026-11-07): the button opens /challenge, not the home page (the site's card otherwise).
  const embed = JSON.stringify({
    version: '1',
    imageUrl: `${appUrl()}/embed.png`,
    button: { title: 'Remix challenge', action: { type: 'launch_frame', name: APP_NAME, url: `${appUrl()}/challenge`, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER } },
  });
  return { title: 'Remix challenge', description: 'The remix challenge on Snowmoon Party: pick a character, remix one of its bases.', other: { 'fc:miniapp': embed, 'fc:frame': embed } };
}

export default async function ChallengePage() {
  if (!CHALLENGE.public) notFound();
  return <ChallengeBody v={await challengeView(db())} />;
}
