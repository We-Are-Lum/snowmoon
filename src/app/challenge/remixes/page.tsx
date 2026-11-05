import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CHALLENGE } from '~/lib/config';
import { db } from '~/lib/db';
import { bookCharacter } from '~/lib/images/designs';
import { remixFeed } from '~/lib/challenge/remixes';
import { CHALLENGE_WORDING as W } from '~/lib/challenge/wording';
import { LANDING_WORDING as L } from '~/lib/challenge/landing-wording';
import { RemixCardView, type RemixCardWords } from '~/components/challenge-remix-card';

/**
 * "See all" (owner, 2026-11-04): every remix of the challenge's characters, newest first, filterable by character
 * (?character=<slug>, one of CHALLENGE.characters), a page of FEED_PAGE at a time (?before=<cursor>, "Older remixes").
 * No other order: no "most remixed" sort while the challenge runs, and no remix or like count on any card (the
 * owner's decision; a viewer's "most remixed" sort may come back after entries close, by the owner's decision then).
 * Read per request; readable signed out once the owner opens the challenge (CHALLENGE.public). Until then it answers
 * "not found" to everyone, admins included (./not-found.tsx is the plain one), and its HTML says nothing of the challenge.
 */
export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  if (!CHALLENGE.public) return { robots: { index: false, follow: false } };
  return { title: 'Every remix', description: 'Every remix in the Snowmoon remix challenge, newest first.' };
}
const cardWords = (name: string): RemixCardWords => ({ name, untitled: L.untitled(name), alt: L.pictureAlt(name) });
type Props = { searchParams: Promise<{ character?: string; before?: string }> };
const callName = (name: string) => name.split(' ')[0];

export default async function ChallengeRemixes({ searchParams }: Props) {
  if (!CHALLENGE.public) notFound();
  const q = await searchParams;
  const chars = CHALLENGE.characters.map((s) => bookCharacter(s)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const names = Object.fromEntries(chars.map((c) => [c.slug, callName(c.name)]));
  const character = q.character && names[q.character] ? q.character : null;
  const sql = db();
  const { cards, next } = sql ? await remixFeed(sql, { character, before: q.before ?? null }).catch(() => ({ cards: [], next: null })) : { cards: [], next: null };
  const href = (c: string | null, before?: string | null) => {
    const p = new URLSearchParams();
    if (c) p.set('character', c);
    if (before) p.set('before', before);
    const s = p.toString();
    return `/challenge/remixes${s ? `?${s}` : ''}`;
  };
  return (
    <div className="page prose ch-page ch-feed-page">
      <p className="label ip-crumb">
        <Link href="/challenge">{L.back}</Link>
      </p>
      <h1>{L.feedTitle}</h1>
      <p className="as-draft ch-draft">{W.draftShort}</p>
      <nav className="ch-filter" aria-label="Filter by character">
        <Link href={href(null)} className="ch-chip" aria-current={character === null ? 'page' : undefined}>
          {L.feedAll}
        </Link>
        {chars.map((c) => (
          <Link key={c.slug} href={href(c.slug)} className="ch-chip" data-character={c.slug} aria-current={character === c.slug ? 'page' : undefined}>
            {names[c.slug]}
          </Link>
        ))}
      </nav>
      <p className="dz-note">{L.feedNote}</p>
      {cards.length ? (
        <ul className="ch-cards ch-feed" role="list">
          {cards.map((r) => (
            <RemixCardView key={r.versionId} r={r} w={cardWords(names[r.character] ?? r.character)} />
          ))}
        </ul>
      ) : (
        <p className="dz-muted ch-feed-none">{character ? L.feedNoneFor(names[character]) : L.feedNone}</p>
      )}
      {(next || q.before) && (
        <p className="ch-pages">
          {q.before && <Link href={href(character)}>{L.feedNewest}</Link>}
          {q.before && next && ' · '}
          {next && (
            <Link href={href(character, next)} rel="next">
              {L.feedOlder} →
            </Link>
          )}
        </p>
      )}
      <p className="dz-note">{W.notAffiliated}</p>
    </div>
  );
}
