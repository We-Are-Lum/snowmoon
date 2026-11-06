import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CHALLENGE } from '~/lib/config';
import { db } from '~/lib/db';
import { rulesView } from '~/lib/challenge/rules-view';
import { ChallengeRulesBody } from '~/components/challenge-rules-body';

/**
 * The remix challenge's rules, behind /challenge's "Rules" link (owner, 2026-11-04: "When it goes public, the page says
 * much less … with the rules behind a 'Rules' link"). Everything /challenge said before it became the short page lives
 * here: the deadline, who can enter, what you do, what happens next, the rules, the admins line, each character's
 * count of entrants (a count, never a ranking) and the entries so far, newest first (docs/proposals/challenge-short-page.md
 * lists what moved; its data and words in src/lib/challenge/rules-view.ts). Readable signed out once the owner opens
 * the challenge (CHALLENGE.public). Until then it answers "not found" to everyone, and its HTML says nothing of the
 * challenge; ./not-found.tsx then shows admins the page in the browser, from GET /api/challenge/view?page=rules (admins
 * only), exactly like /challenge (owner, 2026-11-04). Nothing ordered by anything but time (P5, P7).
 */
export const revalidate = 60;
export async function generateMetadata(): Promise<Metadata> {
  if (!CHALLENGE.public) return { robots: { index: false, follow: false } };
  return { title: 'The rules: remix the cast', description: 'The remix challenge on Snowmoon Party: the rules.' };
}

export default async function ChallengeRules() {
  if (!CHALLENGE.public) notFound();
  return <ChallengeRulesBody v={await rulesView(db())} />;
}
