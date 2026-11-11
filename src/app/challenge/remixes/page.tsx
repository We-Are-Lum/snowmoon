import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CHALLENGE } from '~/lib/config';
import { db } from '~/lib/db';
import { remixesView } from '~/lib/challenge/remixes-view';
import { ChallengeRemixesBody } from '~/components/challenge-remixes-body';

/**
 * "See all" (owner, 2026-11-04): every remix of the challenge's characters, newest first, filterable by character
 * (?character=<slug>, one of CHALLENGE.characters), a page of FEED_PAGE at a time (?before=<cursor>, "Older remixes").
 * No other order: no "most remixed" sort while the challenge runs, and no remix or like count on any card (the
 * owner's decision; a viewer's "most remixed" sort may come back after entries close, by the owner's decision then).
 * Read per request (its data and words in src/lib/challenge/remixes-view.ts); readable signed out once the owner opens
 * the challenge (CHALLENGE.public). Until then it answers "not found" to everyone, and its HTML says nothing of the
 * challenge; ./not-found.tsx then shows admins the page in the browser, from GET /api/challenge/view?page=remixes
 * (admins only), exactly like /challenge (owner, 2026-11-04).
 */
export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  if (!CHALLENGE.public) return { robots: { index: false, follow: false } };
  return { title: 'Every remix', description: 'Every remix in the Snowmoon remix challenge, newest first.' };
}
type Props = { searchParams: Promise<{ character?: string; before?: string }> };

export default async function ChallengeRemixes({ searchParams }: Props) {
  if (!CHALLENGE.public) notFound();
  const q = await searchParams;
  return <ChallengeRemixesBody v={await remixesView(db(), { character: q.character ?? null, before: q.before ?? null })} />;
}
