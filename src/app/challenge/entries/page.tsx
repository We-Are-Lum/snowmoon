import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CHALLENGE } from '~/lib/config';
import { db } from '~/lib/db';
import { bookCharacter } from '~/lib/images/designs';
import { entriesWithExamples, entryHref, standing } from '~/lib/challenge/entries';
import { CHALLENGE_WORDING as CW } from '~/lib/challenge/wording';
import { LANDING_WORDING as L } from '~/lib/challenge/landing-wording';
import { ChallengeEntriesList } from '~/components/challenge-entries-list';
import type { RemixCardWords } from '~/components/challenge-remix-card';
import { callNameOf } from '~/lib/challenge/names';

/**
 * Every submission (branch contest, 2026-11-04): the entries so far and the admin examples (owner, 2026-11-12, each
 * marked "Admin example" with its ⓘ, never counted), newest first, filterable by character
 * (?character=<slug>, one of CHALLENGE.characters), with the viewer's own "Shuffled" order (drawn in the browser on
 * each tap). Never sorted by counts, and no like, recast or reply count on any card (P5i). A withdrawn submission is
 * not here. Read per request. Readable signed out once the owner opens the challenge (CHALLENGE.public); until then
 * "not found" to everyone, admins included (./not-found.tsx is the plain one).
 */
export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  if (!CHALLENGE.public) return { robots: { index: false, follow: false } };
  return { title: 'Every entry', description: 'Every entry in the Snowmoon remix challenge, newest first.' };
}
type Props = { searchParams: Promise<{ character?: string }> };
const callName = callNameOf;

export default async function ChallengeEntries({ searchParams }: Props) {
  if (!CHALLENGE.public) notFound();
  const q = await searchParams;
  const chars = CHALLENGE.characters.map((s) => bookCharacter(s)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const names = Object.fromEntries(chars.map((c) => [c.slug, callName(c.name)]));
  const character = q.character && names[q.character] ? q.character : null;
  const sql = db();
  const st = sql ? await standing(sql).catch(() => null) : null;
  // The entries and the admin examples (owner, 2026-11-12), newest first, each example marked; examples are shown only,
  // never counted (no count here reads this list; standing's entries and entrants leave them out).
  const all = (st ? entriesWithExamples(st) : []).filter((e) => !character || e.character === character);
  const example = { label: CW.exampleLabel, info: CW.exampleInfo };
  const cards: Record<string, RemixCardWords> = Object.fromEntries(chars.map((c) => [c.slug, { name: names[c.slug], untitled: L.untitled(names[c.slug]), alt: CHALLENGE.pictureEntries ? L.pictureAltMoment(names[c.slug]) : L.pictureAlt(names[c.slug]) }]));
  const href = (c: string | null) => `/challenge/entries${c ? `?character=${c}` : ''}`;
  return (
    <div className="page prose ch-page ch-feed-page ch-entries-page">
      <p className="label ip-crumb">
        <Link href="/challenge">{L.back}</Link>
      </p>
      <h1>{L.entriesTitle}</h1>
      <nav className="ch-filter" aria-label={L.filterLabel}>
        <Link href={href(null)} className="ch-chip" aria-current={character === null ? 'page' : undefined}>
          {L.feedAll}
        </Link>
        {chars.map((c) => (
          <Link key={c.slug} href={href(c.slug)} className="ch-chip" data-character={c.slug} aria-current={character === c.slug ? 'page' : undefined}>
            {names[c.slug]}
          </Link>
        ))}
      </nav>
      {all.length ? (
        <ChallengeEntriesList all={all.map((e) => ({ versionId: e.versionId, character: e.character, title: e.title, byName: e.byName, byFid: e.maker, thumb: e.thumb, href: entryHref(e.versionId), ...(e.example ? { example } : {}) }))} w={{ newest: L.entriesNewest, shuffled: L.entriesShuffled, orderLabel: L.entriesOrderLabel, cards, pictures: CHALLENGE.pictureEntries }} />
      ) : (
        <p className="dz-muted ch-feed-none">{character ? L.entriesNoneFor(names[character]) : L.entriesNone}</p>
      )}
    </div>
  );
}
