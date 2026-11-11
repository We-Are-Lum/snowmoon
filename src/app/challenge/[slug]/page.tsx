import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CHALLENGE } from '~/lib/config';
import { db } from '~/lib/db';
import { bookCharacter } from '~/lib/images/designs';
import { characterView } from '~/lib/challenge/view';
import { ChallengeCharacterBody } from '~/components/challenge-character';

/**
 * A character's page in the remix challenge, /challenge/<slug> (owner, 2026-11-08, the simpler challenge): its name,
 * one line, bases and every published remix of it, newest first (src/lib/challenge/view.ts, characterView). The slug is
 * one of CHALLENGE.characters; anything else is "not found" (dynamicParams off: only the six are pages). The fixed
 * challenge pages (/challenge/entries, /remixes, /rules, /make, /p) are their own routes and win over this one.
 * Gated and cached as /challenge is: readable signed out once the owner opens it (CHALLENGE.public); until then it
 * answers "not found", and ./not-found.tsx shows admins the page from GET /api/challenge/view?page=character.
 */
export const revalidate = 60;
export const dynamicParams = false;
export const generateStaticParams = () => CHALLENGE.characters.map((slug) => ({ slug }));

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!CHALLENGE.public) return { robots: { index: false, follow: false } };
  const { slug } = await params;
  const name = (bookCharacter(slug)?.name ?? slug).split(' ')[0];
  return { title: `${name}: Remix challenge`, description: `The remix challenge on Snowmoon Party: ${name}'s bases and every remix.` };
}

export default async function ChallengeCharacterPage({ params }: Props) {
  if (!CHALLENGE.public) notFound();
  const { slug } = await params;
  const v = await characterView(db(), slug);
  if (!v) notFound();
  return <ChallengeCharacterBody v={v} />;
}
