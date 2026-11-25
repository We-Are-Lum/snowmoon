import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CHALLENGE } from '~/lib/config';
import { db } from '~/lib/db';
import { challengeView } from '~/lib/challenge/view';
import { ChallengeBody } from '~/components/challenge-body';

/**
 * The remix challenge's home at its own address (owner, 2026-11-24, answer 6): /challenge becomes the list of
 * challenges once the remix challenge has closed, and links here. The same page /challenge showed (ChallengeBody).
 */
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  if (!CHALLENGE.public) return { robots: { index: false, follow: false } };
  return { title: 'Remix challenge', description: 'The remix challenge on Snowmoon Party: pick a character, remix one of its bases.' };
}

export default async function RemixChallengePage() {
  if (!CHALLENGE.public) notFound();
  return <ChallengeBody v={await challengeView(db())} />;
}
