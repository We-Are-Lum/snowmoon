import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE } from '../config';
import { bookCharacter } from '../images/designs';
import type { BaseTile, BaseWords } from '~/components/challenge-bases';
import type { RemixCardData } from '~/components/challenge-remix-card';
import type { PickWords } from '~/components/challenge-remix-pick';
import { startingSheets } from './entries';
import { PICK_SIZE, remixes } from './remixes';
import { baseCountOf, basesOf, firstRemixesOf } from './rules';
import { CHALLENGE_WORDING as W } from './wording';
import { LANDING_WORDING as L } from './landing-wording';

/**
 * Everything /challenge shows, the short landing page (owner, 2026-11-04: "a title, one line on what to do, the
 * characters' bases, and a Remix button, with the rules behind a 'Rules' link"), as plain data with its words already
 * written. The public page renders it on the server once CHALLENGE.public is on; before that, only admins see it, from
 * GET /api/challenge/view (admins only) in the browser, so no challenge words are in the HTML or the scripts that
 * everyone else is served. src/components/challenge-body.tsx draws it. What was cut, and where it went (the rules and
 * the entries are at /challenge/rules), is in docs/proposals/challenge-short-page.md.
 *
 * - The title and one line (what to do, and the deadline, built from CHALLENGE.dates), and "Rules".
 * - Each character (CHALLENGE.characters, in that order) with its bases (CHALLENGE.bases, up to CHALLENGE.baseCount:
 *   three for Deluin and Gladias, one for the rest; the browser shows several in a fresh random order on each visit),
 *   then the owner's first remixes of it under "First remixes by @naaate" (CHALLENGE.firstRemixes, up to
 *   CHALLENGE.firstRemixesShown; an empty slot for each one that doesn't exist yet). Before the bases are picked, the
 *   row holds the character's newest published sheet.
 * - A random few remixes, shuffled afresh in the browser on each visit from every published remix (P5g's exception:
 *   unweighted, no counts, no featuring), and "See all" (/challenge/remixes). No remix or like count anywhere (P5i).
 */
type Sql = postgres.Sql;

export interface ChallengeView {
  /** "Admins only for now": shown above the page while CHALLENGE.public is off. */
  adminNote: string | null;
  title: string;
  line: string;
  rulesLink: string;
  entriesLink: string;
  draftShort: string;
  notAffiliated: string;
  characters: { slug: string; name: string; callName: string; note: string | null; bases: BaseTile[]; firsts: BaseTile[]; emptySlots: number; firstsHead: string; w: BaseWords }[];
  remixesHead: string;
  remixesNote: string | null;
  remixes: RemixCardData[];
  pickSize: number;
  pick: PickWords;
}

const callName = (name: string) => name.split(' ')[0];

export async function challengeView(sql: Sql | null): Promise<ChallengeView> {
  const chars = CHALLENGE.characters.map((s) => bookCharacter(s)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const sheets = await Promise.all(chars.map(async (c) => ({ c, list: sql ? await startingSheets(sql, c.slug).catch(() => []) : [] })));
  const all = sql ? await remixes(sql).catch(() => []) : [];
  const cardWords = Object.fromEntries(chars.map((c) => [c.slug, { name: callName(c.name), untitled: L.untitled(callName(c.name)), alt: L.pictureAlt(callName(c.name)) }]));
  return {
    adminNote: CHALLENGE.public ? null : 'Admins only for now: everyone else gets “not found” here, and nothing opens until the owner opens it (CHALLENGE.public).',
    title: W.title,
    line: L.line(),
    rulesLink: L.rulesLink,
    entriesLink: L.entriesLink,
    draftShort: W.draftShort,
    notAffiliated: W.notAffiliated,
    characters: sheets.map(({ c, list }) => {
      const name = callName(c.name);
      const picked = basesOf(c.slug).length > 0;
      // The bases, every one of them (the browser shuffles them); before the picks, the newest published sheet.
      const bases: BaseTile[] = list.slice(0, picked ? baseCountOf(c.slug) : 1).map((s) => ({ kind: picked ? 'base' : 'sheet', versionId: s.versionId, title: s.title, byName: s.byName, byFid: s.byFid, thumb: s.thumb, style: picked ? s.style : null }));
      // The owner's first remixes, in CHALLENGE.firstRemixes' order, each found among the published remixes of this
      // character by its element or version id; one that isn't published (or isn't this character's) is left out.
      const firsts: BaseTile[] = firstRemixesOf(c.slug)
        .map((id) => all.find((r) => r.character === c.slug && (r.versionId.toLowerCase() === id || r.elementId.toLowerCase() === id)))
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .map((r) => ({ kind: 'remix', versionId: r.versionId, title: r.title, byName: r.byName, byFid: r.byFid, thumb: r.thumb, style: null }));
      return {
        slug: c.slug,
        name: c.name,
        callName: name,
        note: picked ? null : bases.length ? L.noBasesYet(name) : L.noBasesNoSheet(name),
        bases,
        firsts,
        emptySlots: bases.length ? Math.max(0, CHALLENGE.firstRemixesShown - firsts.length) : 0,
        firstsHead: L.firstRemixesHead,
        w: { baseLabel: L.baseLabel, sheetLabel: L.sheetLabel, firstRemixEmpty: L.firstRemixEmpty, pickFirst: L.pickFirst, remix: L.remix, seeBase: L.seeBase, seeSheet: L.seeSheet, seeRemix: L.seeRemix, pictureAlt: L.pictureAlt(name) },
      };
    }),
    remixesHead: L.remixesHead,
    remixesNote: all.length ? L.remixesNote : null,
    remixes: all.map((r) => ({ versionId: r.versionId, character: r.character, title: r.title, byName: r.byName, byFid: r.byFid, thumb: r.thumb })),
    pickSize: PICK_SIZE,
    pick: { none: L.remixesNone, noScript: L.remixesNoScript, seeAll: L.seeAll, cards: cardWords },
  };
}
