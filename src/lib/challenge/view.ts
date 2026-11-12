import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE } from '../config';
import { bookCharacter } from '../images/designs';
import type { CardData, CardTile, CardWords, CharacterData } from '~/components/challenge-card';
import { startingSheets } from './entries';
import { challengePictures } from './pictures';
import { cardOf } from './cards';
import { basesOf, baseCountOf, firstRemixesOf, phase, shortDateText, windowText } from './rules';
import { FEED_PAGE, cursorOf } from './remixes';
import { homeOf } from './homes';
import { CHALLENGE_WORDING as W } from './wording';
import { CHALLENGE_LINKS, LANDING_WORDING as L } from './landing-wording';
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
  cards: { c: CardData; w: CardWords; home: { place: string; block: string; from: string } | null }[];
  /** The redesigned home (owner-approved 2026-11-11): the pitch, the window, the ways, the details and who joins later. */
  pitch: string;
  window: string;
  closes: string | null;
  ways: { n: string; title: string; tag: string; body: string; href: string | null; pending: string | null }[];
  details: { title: string; body: string[]; link?: { href: string; text: string } }[];
  joining: { slug: string; name: string; text: string; note: string }[];
}

export interface CharacterView {
  adminNote: string | null;
  back: string;
  c: CharacterData;
  w: CardWords;
  notAffiliated: string;
  /** "Read where {Name} first appears" (owner, 2026-11-09): the reader at the character's first block. */
  firstAppears?: { href: string; words: string };
  /**
   * The redesigned page (Claude Design's handoff, screen 2; owner-approved 2026-11-11). Every word is written here.
   * - `more`: "Read more about {name}": for now only the line that the look is this edition's. The prototype also puts
   *   the card's facts and description there; P9g keeps a card's one line the only words the pages carry (owner,
   *   2026-11-08), so that waits for the owner's decision.
   * - `remix`: "Remix {name}", to the remix screen of one of its bases, drawn afresh in the browser (P5g).
   * - `picked`: the owner's first remixes of the character (CHALLENGE.firstRemixes), under "First remixes by @naaate".
   * - the grid: the newest FEED_PAGE remixes; "Older remixes" opens the rest in the feed (/challenge/remixes), a page at
   *   a time. No count of remixes (P5i).
   */
  page: {
    more: { title: string; looks: string };
    remix: string;
    remixThis: string;
    remixShort: string;
    startHead: string;
    basesCount: string;
    everyHead: string;
    everyShort: string;
    newestFirst: string;
    pickedHead: string;
    picked: CardTile[];
    older: { href: string; text: string } | null;
  };
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
/** A published challenge picture: its picture opens its page (/challenge/p/<id>), and "Remix this" its remix screen. */
const pictureTile = (r: Tileable): CardTile => ({ ...tile(r, null), page: `/challenge/p/${r.versionId}` });

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
      const h = homeOf(slug);
      return { c, w: cardWords(c.name), home: h ? { place: h.place, block: h.block, from: L.home.homeFrom(h.block) } : null };
    }),
  );
  const H = L.home;
  const ph = phase();
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
    pitch: H.pitch,
    window: windowText(),
    closes: ph === 'closed' ? null : H.closes(shortDateText('closes')),
    ways: H.ways.map((w) => {
      const x = w as { link?: keyof typeof CHALLENGE_LINKS; pending?: string };
      const href = x.link ? CHALLENGE_LINKS[x.link] : null;
      return { n: w.n, title: w.title, tag: w.tag, body: w.body, href, pending: x.link && !href ? (x.pending ?? null) : null };
    }),
    details: [
      { title: H.newTitle, body: [W.intro()] },
      { title: H.rulesTitle, body: [L.line()], link: { href: '/challenge/rules', text: L.rulesTitle } },
      { title: H.aboutTitle, body: [H.about] },
    ],
    // Characters still to join (CHALLENGE.joining) that aren't challenge characters yet: a tile with no picture.
    joining: Object.keys(CHALLENGE.joining)
      .filter((s) => !CHALLENGE.characters.includes(s) && bookCharacter(s))
      .map((s) => {
        const name = bookCharacter(s)!.name;
        return { slug: s, name, text: H.joins(name), note: H.joinsNote };
      }),
  };
}

/** A character's page, or null for a slug that isn't one of CHALLENGE.characters (the page then answers 404). */
export async function characterView(sql: Sql | null, slug: string): Promise<CharacterView | null> {
  if (!CHALLENGE.characters.includes(slug) || !bookCharacter(slug)) return null;
  const { bases, note } = await basesTiles(sql, slug);
  // Every published challenge picture (no filter, limit or order beyond the database's newest first), then this
  // character's: its remixes, the viewer's own and the owner's first remixes included.
  const all = sql ? await challengePictures(sql).catch(() => []) : [];
  const mine = all.filter((p) => p.character === slug);
  const remixes = mine.slice(0, FEED_PAGE).map(pictureTile);
  const c: CharacterData = { ...cardFor(slug, bases, note), remixes };
  const P = L.character;
  // The owner's first remixes, in the configured order, by element or version id (as entries.ts reads them).
  const firsts = firstRemixesOf(slug);
  const picked = firsts.map((id) => mine.find((p) => p.versionId === id || p.elementId === id)).filter((p): p is NonNullable<typeof p> => Boolean(p)).map(pictureTile);
  const older = mine.length > FEED_PAGE ? { href: `/challenge/remixes?character=${slug}&before=${encodeURIComponent(cursorOf(mine[FEED_PAGE - 1]))}`, text: L.feedOlder } : null;
  // "Read where {Name} first appears" (owner, 2026-11-09): the reader at the character's first block.
  return {
    adminNote: adminNote(),
    back: L.back,
    c,
    w: cardWords(c.name),
    notAffiliated: W.notAffiliated,
    firstAppears: { href: firstAppearsHref(slug), words: firstAppearsWords(c.name) },
    page: {
      more: { title: P.readMore(c.name), looks: P.looks(c.name) },
      remix: P.remix(c.name),
      remixThis: P.remixThis,
      remixShort: L.remix,
      startHead: P.startHead,
      basesCount: P.basesCount(bases.length),
      everyHead: P.everyHead(c.name),
      everyShort: L.feedTitle,
      newestFirst: P.newestFirst,
      pickedHead: L.firstRemixesHead,
      picked,
      older,
    },
  };
}
