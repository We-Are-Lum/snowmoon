import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE } from '../config';
import { bookCharacter } from '../images/designs';
import type { CardData, CardTile, CardWords, CharacterData } from '~/components/challenge-card';
import { startingSheets } from './entries';
import { challengePictures } from './pictures';
import { cardOf } from './cards';
import { basesOf, baseCountOf } from './rules';
import { CHALLENGE_WORDING as W } from './wording';
import { LANDING_WORDING as L } from './landing-wording';
import { firstAppearsHref, firstAppearsWords } from './first-appears';

/**
 * What /challenge and a character's page (/challenge/<slug>) show, as plain data with their words already written
 * (owner, 2026-11-08, the simpler challenge; it replaces the hub's cards of 2026-11-05). The public pages render it on
 * the server once CHALLENGE.public is on; before that, only admins see it, from GET /api/challenge/view (admins only)
 * in the browser, so no challenge words are in the HTML or the scripts that everyone else is served.
 * src/components/challenge-body.tsx and challenge-character.tsx draw it.
 *
 * - /challenge: the title, one line (what to do, and the deadline, from CHALLENGE.dates), "Rules" and "Every entry";
 *   then each character in CHALLENGE.characters' order (P5h): its name (a link to its page), its approved one line
 *   (src/lib/challenge/cards.ts, `line`, verbatim) and its bases (the browser shows them in a fresh random order per
 *   visit, P5g). Nothing else: no facts, "More about", "Where they appear", remixes or moments.
 * - /challenge/<slug>: the name, the one line, "Bases", then "Remixes": every published challenge picture of the
 *   character, the viewer's own and the owner's first remixes included, newest first (the database's order; no
 *   shuffle, no count: P5, P5i). Tapping any picture opens its remix screen.
 */
type Sql = postgres.Sql;

export interface ChallengeView {
  /** "Admins only for now": shown above the page while CHALLENGE.public is off. */
  adminNote: string | null;
  title: string;
  line: string;
  rulesLink: string;
  entriesLink: string;
  /** The hub's "Draft wording" mark: none since the owner approved its words (2026-11-06). */
  draftShort: string | null;
  notAffiliated: string;
  cards: { c: CardData; w: CardWords }[];
}

export interface CharacterView {
  adminNote: string | null;
  back: string;
  c: CharacterData;
  w: CardWords;
  notAffiliated: string;
  /** "Read where {Name} first appears" (owner, 2026-11-09): the reader at the character's first block. */
  firstAppears?: { href: string; words: string };
}

const callName = (name: string) => name.split(' ')[0];

/** Where tapping a picture goes: its remix screen (R2), with the moment kept only while the moments are on. */
export const remixHref = (versionId: string, moment?: string | null) => `/challenge/make?from=${versionId}${CHALLENGE.moments && moment ? `&moment=${encodeURIComponent(moment)}` : ''}`;

/** A character's page. */
export const characterHref = (slug: string) => `/challenge/${slug}`;

export function cardWords(name: string): CardWords {
  const C = L.cards;
  return { bases: C.bases, remixes: C.remixes, summary: C.summary, look: C.look, alt: L.pictureAltMoment(name), tapToRemix: C.tapToRemix, none: L.feedNoneFor(name) };
}

const adminNote = () => (CHALLENGE.public ? null : 'Admins only for now: everyone else gets “not found” here, and nothing opens until the owner opens it (CHALLENGE.public).');

type Tileable = { versionId: string; thumb: string | null; title?: string; byName: string | null; byFid: number };
const tile = (r: Tileable, label: string | null): CardTile => ({ versionId: r.versionId, thumb: r.thumb, title: r.title ?? '', byName: r.byName, byFid: r.byFid, href: remixHref(r.versionId), label });

/** A character's bases as tiles (every one; the browser shuffles them); before the picks, its newest published sheet. */
async function basesTiles(sql: Sql | null, slug: string): Promise<{ bases: CardTile[]; note: string | null }> {
  const list = sql ? await startingSheets(sql, slug).catch(() => []) : [];
  const picked = basesOf(slug).length > 0;
  const name = callName(bookCharacter(slug)?.name ?? slug);
  const bases = list.slice(0, picked ? baseCountOf(slug) : 1).map((s) => tile(s, picked ? s.style || L.baseLabel : L.sheetLabel));
  return { bases, note: picked ? null : bases.length ? L.noBasesYet(name) : L.noBasesNoSheet(name) };
}

function cardFor(slug: string, bases: CardTile[], note: string | null): CardData {
  const name = callName(bookCharacter(slug)?.name ?? slug);
  return { slug, name, href: characterHref(slug), draft: CHALLENGE.cardsApproved ? null : W.draftShort, line: cardOf(slug)?.line ?? '', bases, note };
}

export async function challengeView(sql: Sql | null): Promise<ChallengeView> {
  const chars = CHALLENGE.characters.filter((s) => bookCharacter(s));
  const cards = await Promise.all(
    chars.map(async (slug) => {
      const { bases, note } = await basesTiles(sql, slug);
      const c = cardFor(slug, bases, note);
      return { c, w: cardWords(c.name) };
    }),
  );
  return {
    adminNote: adminNote(),
    title: W.title,
    line: L.line(),
    rulesLink: L.rulesLink,
    entriesLink: L.entriesLink,
    // Approved (owner, 2026-11-06; "reviewed by the coordinator, approved by the owner"): the hub's line and cards.
    draftShort: CHALLENGE.cardsApproved ? null : W.draftShort,
    notAffiliated: W.notAffiliated,
    cards,
  };
}

/** A character's page, or null for a slug that isn't one of CHALLENGE.characters (the page then answers 404). */
export async function characterView(sql: Sql | null, slug: string): Promise<CharacterView | null> {
  if (!CHALLENGE.characters.includes(slug) || !bookCharacter(slug)) return null;
  const { bases, note } = await basesTiles(sql, slug);
  // Every published challenge picture (no filter, limit or order beyond the database's newest first), then this
  // character's: its remixes, the viewer's own and the owner's first remixes included.
  const all = sql ? await challengePictures(sql).catch(() => []) : [];
  const remixes = all.filter((p) => p.character === slug).map((p) => tile(p, null));
  const c: CharacterData = { ...cardFor(slug, bases, note), remixes };
  // "Read where {Name} first appears" (owner, 2026-11-09): the reader at the character's first block.
  return { adminNote: adminNote(), back: L.back, c, w: cardWords(c.name), notAffiliated: W.notAffiliated, firstAppears: { href: firstAppearsHref(slug), words: firstAppearsWords(c.name) } };
}
