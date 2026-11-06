import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CHALLENGE } from '~/lib/config';
import { db } from '~/lib/db';
import { bookCharacter } from '~/lib/images/designs';
import { entryHref, standing } from '~/lib/challenge/entries';
import { CHALLENGE_WORDING as W } from '~/lib/challenge/wording';
import { LANDING_WORDING as L } from '~/lib/challenge/landing-wording';
import { ChallengeEntriesList } from '~/components/challenge-entries-list';
import type { RemixCardWords } from '~/components/challenge-remix-card';

/**
 * Every submission (branch contest, 2026-11-04): the entries so far, newest first, filterable by character
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
const callName = (name: string) => name.split(' ')[0];

export default async function ChallengeEntries({ searchParams }: Props) {
  if (!CHALLENGE.public) notFound();
  const q = await searchParams;
  const chars = CHALLENGE.characters.map((s) => bookCharacter(s)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const names = Object.fromEntries(chars.map((c) => [c.slug, callName(c.name)]));
  const character = q.character && names[q.character] ? q.character : null;
  const sql = db();
  const st = sql ? await standing(sql).catch(() => null) : null;
  const all = (st?.entries ?? []).filter((e) => !character || e.character === character);
  const cards: Record<string, RemixCardWords> = Object.fromEntries(chars.map((c) => [c.slug, { name: names[c.slug], untitled: L.untitled(names[c.slug]), alt: CHALLENGE.pictureEntries ? L.pictureAltMoment(names[c.slug]) : L.pictureAlt(names[c.slug]) }]));
  const href = (c: string | null) => `/challenge/entries${c ? `?character=${c}` : ''}`;
  return (
    <div className="page prose ch-page ch-feed-page">
      <p className="label ip-crumb">
        <Link href="/challenge">{L.back}</Link>
      </p>
      <h1>{L.entriesTitle}</h1>
      <p className="as-draft ch-draft">{W.draftShort}</p>
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
        <ChallengeEntriesList all={all.map((e) => ({ versionId: e.versionId, character: e.character, title: e.title, byName: e.byName, byFid: e.maker, thumb: e.thumb, href: entryHref(e.versionId) }))} w={{ newest: L.entriesNewest, shuffled: L.entriesShuffled, orderLabel: L.entriesOrderLabel, cards }} />
      ) : (
        <p className="dz-muted ch-feed-none">{character ? L.entriesNoneFor(names[character]) : L.entriesNone}</p>
      )}
    </div>
  );
}
