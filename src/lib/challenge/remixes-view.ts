import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE } from '../config';
import { bookCharacter } from '../images/designs';
import type { RemixCardData, RemixCardWords } from '~/components/challenge-remix-card';
import { remixFeed } from './remixes';
import { CHALLENGE_WORDING as W } from './wording';
import { LANDING_WORDING as L } from './landing-wording';

/**
 * Everything /challenge/remixes ("See all") shows, as plain data with its words already written: every remix of the
 * challenge's characters, newest first, filterable by character, a page at a time. No other order and no count (P5i).
 * The public page renders it on the server once CHALLENGE.public is on; before that only admins see it, from
 * GET /api/challenge/view?page=remixes (admins only), exactly like /challenge (owner, 2026-11-04).
 * src/components/challenge-remixes-body.tsx draws it.
 */
type Sql = postgres.Sql;
export interface RemixesView {
  adminNote: string | null;
  back: string;
  title: string;
  draft: string;
  filterLabel: string;
  chips: { key: string; name: string; href: string; current: boolean }[];
  note: string;
  cards: RemixCardData[];
  cardWords: Record<string, RemixCardWords>;
  none: string;
  newest: { href: string; text: string } | null;
  older: { href: string; text: string } | null;
  notAffiliated: string;
}
const callName = (name: string) => name.split(' ')[0];

export async function remixesView(sql: Sql | null, q: { character?: string | null; before?: string | null }): Promise<RemixesView> {
  const chars = CHALLENGE.characters.map((s) => bookCharacter(s)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const names = Object.fromEntries(chars.map((c) => [c.slug, callName(c.name)]));
  const character = q.character && names[q.character] ? q.character : null;
  const { cards, next } = sql ? await remixFeed(sql, { character, before: q.before ?? null }).catch(() => ({ cards: [], next: null })) : { cards: [], next: null };
  const href = (c: string | null, before?: string | null) => {
    const p = new URLSearchParams();
    if (c) p.set('character', c);
    if (before) p.set('before', before);
    const s = p.toString();
    return `/challenge/remixes${s ? `?${s}` : ''}`;
  };
  return {
    adminNote: CHALLENGE.public ? null : 'Admins only for now: everyone else gets “not found” here, and nothing opens until the owner opens it (CHALLENGE.public).',
    back: L.back,
    title: L.feedTitle,
    draft: W.draftShort,
    filterLabel: 'Filter by character',
    chips: [{ key: 'all', name: L.feedAll, href: href(null), current: character === null }, ...chars.map((c) => ({ key: c.slug, name: names[c.slug], href: href(c.slug), current: character === c.slug }))],
    note: L.feedNote,
    cards: cards.map((r) => ({ versionId: r.versionId, character: r.character, title: r.title, byName: r.byName, byFid: r.byFid, thumb: r.thumb })),
    cardWords: Object.fromEntries(chars.map((c) => [c.slug, { name: names[c.slug], untitled: L.untitled(names[c.slug]), alt: L.pictureAlt(names[c.slug]) }])),
    none: character ? L.feedNoneFor(names[character]) : L.feedNone,
    newest: q.before ? { href: href(character), text: L.feedNewest } : null,
    older: next ? { href: href(character, next), text: `${L.feedOlder} →` } : null,
    notAffiliated: W.notAffiliated,
  };
}
