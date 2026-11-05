import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE } from '../config';
import { bookCharacter } from '../images/designs';
import type { CardData, CardFactView, CardTile, CardWords } from '~/components/challenge-card';
import { startingSheets } from './entries';
import { challengePictures } from './pictures';
import { cardOf } from './cards';
import { chapterChip, momentsWith, readerHref } from './moments';
import { basesOf, baseCountOf, firstRemixesOf } from './rules';
import { spoilerExceptionOn } from './spoilers';
import { CHALLENGE_WORDING as W } from './wording';
import { LANDING_WORDING as L } from './landing-wording';

/**
 * Everything /challenge shows, the hub (owner, 2026-11-05; docs/proposals/challenge-moments.md §1.3 S0–S1), as plain
 * data with its words already written. The public page renders it on the server once CHALLENGE.public is on; before
 * that, only admins see it, from GET /api/challenge/view (admins only) in the browser, so no challenge words are in the
 * HTML or the scripts that everyone else is served. src/components/challenge-body.tsx draws it.
 *
 * - The title, one line (what to do, and the deadline, from CHALLENGE.dates), "Rules" and "Every entry".
 * - One card per character, in CHALLENGE.characters' order (P5h): its card's words (src/lib/challenge/cards.ts, DRAFT
 *   until CHALLENGE.cardsApproved), its moments (src/lib/challenge/moments.ts, book order), its bases (the browser
 *   shows them in a fresh random order per visit), the owner's first remixes under "First remixes by @naaate"
 *   (CHALLENGE.firstRemixes, owner 2026-11-05 answer 9; hidden when there are none), and every published remix of the
 *   character, which the browser shuffles afresh and shows three of (P5g; owner, answer 8). No count anywhere (P5i).
 * - The hub's old random block is gone (owner, answer 9: "drop the separate random-remixes block").
 * "Where they appear" is not in this data: GET /api/challenge/appears sends it when a reader opens it.
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
  cards: { c: CardData; w: CardWords }[];
}

const callName = (name: string) => name.split(' ')[0];

/** Where tapping a picture goes: its remix screen (R2), with the moment kept when the picture has one. */
export const remixHref = (versionId: string, moment?: string | null) => `/challenge/make?from=${versionId}${moment ? `&moment=${encodeURIComponent(moment)}` : ''}`;

const fact = (f: { text: string; block: string; quote: string }): CardFactView => ({ ...f, href: readerHref(f.block) });

export function cardWords(name: string): CardWords {
  const C = L.cards;
  return {
    bases: C.bases, firsts: L.firstRemixesHead, remixes: C.remixes, showMore: C.showMore, moments: C.moments,
    more: C.more(name), less: C.less(name), spoil: C.spoil, summary: C.summary, look: C.look, appears: C.appears(name),
    appearsCount: C.appearsCount, loading: C.loading, failed: C.failed, readIt: C.readIt, chapter: C.chapter,
    alt: L.pictureAltMoment(name), tapToRemix: C.tapToRemix,
  };
}

export async function challengeView(sql: Sql | null): Promise<ChallengeView> {
  const chars = CHALLENGE.characters.map((s) => bookCharacter(s)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const sheets = await Promise.all(chars.map(async (c) => ({ c, list: sql ? await startingSheets(sql, c.slug).catch(() => []) : [] })));
  // Every published challenge picture of the six (no filter, limit or order beyond the database's newest first): each
  // card gets all of its character's, and the browser shuffles them (P5g). Since R2 a remix is a picture at a moment.
  const all = sql ? await challengePictures(sql).catch(() => []) : [];
  // P9's challenge exception ends when entries close: no deeper layer and no moments after that (P9g).
  const spoilers = spoilerExceptionOn();
  return {
    adminNote: CHALLENGE.public ? null : 'Admins only for now: everyone else gets “not found” here, and nothing opens until the owner opens it (CHALLENGE.public).',
    title: W.title,
    line: L.line(),
    rulesLink: L.rulesLink,
    entriesLink: L.entriesLink,
    draftShort: W.draftShort,
    notAffiliated: W.notAffiliated,
    cards: sheets.map(({ c, list }) => {
      const name = callName(c.name);
      const card = cardOf(c.slug);
      const picked = basesOf(c.slug).length > 0;
      const tile = (r: { versionId: string; thumb: string | null; title?: string; byName: string | null; byFid: number }, label: string | null, moment?: string | null): CardTile => ({
        versionId: r.versionId, thumb: r.thumb, title: r.title ?? '', byName: r.byName, byFid: r.byFid, href: remixHref(r.versionId, moment), label,
      });
      // The bases, every one of them (the browser shuffles them); before the picks, the newest published sheet.
      const bases = list.slice(0, picked ? baseCountOf(c.slug) : 1).map((s) => tile(s, picked ? s.style || L.baseLabel : L.sheetLabel));
      const firstIds = firstRemixesOf(c.slug);
      const mine = all.filter((r) => r.character === c.slug);
      const isFirst = (r: { versionId: string; elementId: string }) => firstIds.includes(r.versionId.toLowerCase()) || firstIds.includes(r.elementId.toLowerCase());
      // The owner's first remixes, in CHALLENGE.firstRemixes' order; one that isn't published is left out.
      const firsts = firstIds.map((id) => mine.find((r) => r.versionId.toLowerCase() === id || r.elementId.toLowerCase() === id)).filter((r): r is NonNullable<typeof r> => Boolean(r)).map((r) => tile(r, null, r.moment));
      const data: CardData = {
        slug: c.slug,
        name,
        draft: CHALLENGE.cardsApproved ? null : W.draftShort,
        line: card?.line ?? '',
        facts: (card?.facts ?? []).map(fact),
        more: spoilers ? { description: card?.more.description ?? '', facts: (card?.more.facts ?? []).map(fact) } : null,
        // A moment chip opens the remix screen for one of the character's bases at that moment.
        moments: (spoilers ? momentsWith(c.slug) : []).map((m) => ({ id: m.id, title: m.title, chip: chapterChip(m), href: bases[0] ? remixHref(bases[0].versionId, m.id) : null })),
        bases,
        firsts,
        remixes: mine.filter((r) => !isFirst(r)).map((r) => tile(r, null, r.moment)),
        note: picked ? null : bases.length ? L.noBasesYet(name) : L.noBasesNoSheet(name),
      };
      return { c: data, w: cardWords(name) };
    }),
  };
}
