import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE } from '../config';
import { designByline } from '../images/byline';
import { bookCharacter } from '../images/designs';
import { sheetCharacter } from '../images/sheets';
import { standing, startingSheets, type Standing } from './entries';
import { basesOf, entrantCounts, phase } from './rules';
import { CHALLENGE_WORDING as W } from './wording';

/**
 * Everything /challenge shows, as plain data with its words already written (owner, 2026-10-31; admin-only since
 * 2026-11-04). The public page renders it on the server once CHALLENGE.public is on; before that, only admins see it,
 * from GET /api/challenge/view (admins only) in the browser, so no challenge words are in the HTML or the scripts that
 * everyone else is served. src/components/challenge-body.tsx draws it.
 */
type Sql = postgres.Sql;

export interface ChallengeRow {
  href: string;
  title: string;
  meta: string;
  thumb: string | null;
  alt: string;
  badge?: string;
}
export interface ChallengeView {
  /** "Admins only for now": shown above the page while CHALLENGE.public is off. */
  adminNote: string | null;
  title: string;
  draft: string;
  deadline: string;
  deadlineAfter: string | null;
  who: string | null;
  intro: string;
  next: [string, string];
  bounty: [string, string];
  rulesHead: string;
  rules: string[];
  notAffiliated: string;
  characters: {
    slug: string;
    name: string;
    count: string | null;
    about: string | null;
    bounty: string;
    bountyLink: { href: string; text: string } | null;
    readBook: string;
    startLabel: string;
    sheets: ChallengeRow[];
    none: string;
  }[];
  entriesHead: string;
  entriesNote: string | null;
  entries: ChallengeRow[];
  entriesEmpty: string;
  adminsHead: string | null;
  byAdmins: { href: string; text: string }[];
}

const callName = (name: string) => name.split(' ')[0];

/** A character's poidh bounty, only once its address is set (CHALLENGE.bounties) and it is on poidh.xyz over https. */
const bountyUrl = (slug: string): string | null => {
  const u = CHALLENGE.bounties[slug];
  if (!u) return null;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' && (p.hostname === 'poidh.xyz' || p.hostname === 'www.poidh.xyz') ? p.toString() : null;
  } catch {
    return null;
  }
};

export async function challengeView(sql: Sql | null, now: Date = new Date()): Promise<ChallengeView> {
  const chars = CHALLENGE.characters.map((s) => bookCharacter(s)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const sheets = await Promise.all(chars.map(async (c) => ({ c, about: sheetCharacter(c.slug)?.about ?? null, list: sql ? await startingSheets(sql, c.slug).catch(() => []) : [] })));
  const none: Standing = { entries: [], byAdmins: [], entrants: entrantCounts([]) };
  const st: Standing = sql && CHALLENGE.entries ? await standing(sql).catch(() => none) : none;
  // The page's phase is the dates' only once the owner has opened it; before, it reads as before the open.
  const ph = CHALLENGE.public ? phase(now) : 'before';
  const nameOf = (slug: string) => callName(chars.find((c) => c.slug === slug)?.name ?? slug);
  return {
    adminNote: CHALLENGE.public ? null : 'Admins only for now: everyone else gets “not found” here, and nothing opens until the owner opens it (CHALLENGE.public).',
    title: W.title,
    draft: W.draft,
    deadline: ph === 'before' ? W.opensOn() : ph === 'open' ? W.deadline() : W.closed(),
    deadlineAfter: ph === 'before' ? W.deadline() : null,
    who: ph !== 'closed' ? W.whoCanEnter() : null,
    intro: W.intro(),
    next: [W.nextHead, W.next()],
    bounty: [W.bountyHead, W.bounty()],
    rulesHead: W.rulesHead,
    rules: [...W.rules(), W.adminsLine],
    notAffiliated: W.notAffiliated,
    characters: sheets.map(({ c, about, list }) => {
      const n = st.entrants.get(c.slug) ?? 0;
      const link = bountyUrl(c.slug);
      return {
        slug: c.slug,
        name: c.name,
        count: CHALLENGE.entries ? `${W.entrants(n)} · ${W.entrantsNeeded(n)}` : null,
        about,
        bounty: W.bountyFor(callName(c.name)),
        bountyLink: link ? { href: link, text: `${W.bountyLink(callName(c.name))} →` } : null,
        readBook: `${W.readBook(callName(c.name))} →`,
        startLabel: basesOf(c.slug).length ? W.startFromBases : W.startFrom,
        sheets: list.map((s) => ({ href: `/references/designs/${s.versionId}`, title: s.title || callName(c.name), meta: designByline(s.byName, s.byFid), thumb: s.thumb, alt: `AI-generated front view of ${c.name}, not by the author` })),
        none: W.noSheetYet(callName(c.name)),
      };
    }),
    entriesHead: W.entriesHead,
    entriesNote: CHALLENGE.entries && st.entries.length ? W.entriesOrder : null,
    entries: st.entries.map((e) => ({ href: `/references/designs/${e.versionId}`, title: W.entryLabel(nameOf(e.character), e.title), meta: `${designByline(e.byName, e.maker)} · v${e.versionNo}`, thumb: e.thumb, alt: 'AI-generated front view, not by the author', badge: W.badge })),
    entriesEmpty: CHALLENGE.entries ? W.entriesNone : W.entriesOff,
    adminsHead: CHALLENGE.entries && st.byAdmins.length > 0 ? W.adminsHead : null,
    byAdmins: st.byAdmins.map((v) => ({ href: `/references/designs/${v.versionId}`, text: `${W.entryLabel(nameOf(v.character), v.title)} · ${designByline(v.byName, v.maker)} · v${v.versionNo}` })),
  };
}
