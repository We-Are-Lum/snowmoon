import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CHALLENGE } from '~/lib/config';
import { db } from '~/lib/db';
import { challengeView } from '~/lib/challenge/view';
import { ChallengeBody } from '~/components/challenge-body';

/**
 * The remix challenge (owner, 2026-10-31; docs/proposals/remix-challenge-plan.md, build list item 1). Readable signed
 * out once the owner opens it (CHALLENGE.public). Until then (owner, 2026-11-04: "/challenge is admin-only for now")
 * it answers "not found" to everyone, as agent pages do while AGENTS.public is off, and its HTML says nothing of the
 * challenge; ./not-found.tsx then shows admins the page in the browser, from GET /api/challenge/view (admins only).
 */
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  if (!CHALLENGE.public) return { robots: { index: false, follow: false } };
  return { title: 'Remix the cast', description: 'The remix challenge on Snowmoon Party: draft rules.' };
}

export default async function ChallengePage() {
  if (!CHALLENGE.public) notFound();
  return <ChallengeBody v={await challengeView(db())} />;
}
