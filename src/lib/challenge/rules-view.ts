import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE } from '../config';
import { designByline } from '../images/byline';
import { bookCharacter } from '../images/designs';
import { entryHref, standing, type Standing } from './entries';
import { entrantCounts, phase } from './rules';
import { CHALLENGE_WORDING as W } from './wording';
import { LANDING_WORDING as L } from './landing-wording';

/**
 * Everything /challenge/rules shows (owner, 2026-11-04: the rules behind /challenge's "Rules" link), as plain data with
 * its words already written: the deadline, who can enter, what you do, what happens next, the rules, the admins line,
 * each character's count of entrants (a count, never a ranking) and the entries so far, newest first. Every date from
 * CHALLENGE.dates. The public page renders it on the server once CHALLENGE.public is on; before that only admins see
 * it, from GET /api/challenge/view?page=rules (admins only), so no challenge words are in what everyone else is served
 * (owner, 2026-11-04: "admins see /challenge/rules and /challenge/remixes too, exactly like /challenge").
 * src/components/challenge-rules-body.tsx draws it. Nothing ordered by anything but time (P5, P7).
 */
type Sql = postgres.Sql;
export interface RulesRow {
  href: string;
  title: string;
  meta: string;
  thumb: string | null;
}
export interface RulesView {
  adminNote: string | null;
  back: string;
  title: string;
  /** A page-wide "Draft wording" line; null since the owner approved the rules (2026-11-06). */
  draft: string | null;
  /** The intro's own "Draft wording" mark: its picture wording isn't approved yet. */
  introDraft: string | null;
  deadline: string;
  deadlineAfter: string | null;
  who: string | null;
  intro: string;
  next: [string, string];
  rulesHead: string;
  rules: string[];
  notAffiliated: string;
  counts: { head: string; rows: { slug: string; name: string; text: string }[] } | null;
  entriesHead: string;
  entriesOff: string | null;
  entriesNote: string | null;
  entries: RulesRow[];
  entriesNone: string;
  badge: string;
  alt: string;
  adminsHead: string | null;
  byAdmins: { href: string; text: string }[];
}

const callName = (name: string) => name.split(' ')[0];

export async function rulesView(sql: Sql | null, now: Date = new Date()): Promise<RulesView> {
  const chars = CHALLENGE.characters.map((s) => bookCharacter(s)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const none: Standing = { entries: [], byAdmins: [], entrants: entrantCounts([]) };
  const st: Standing = sql && CHALLENGE.entries ? await standing(sql).catch(() => none) : none;
  const ph = phase(now);
  const nameOf = (slug: string) => callName(chars.find((c) => c.slug === slug)?.name ?? slug);
  return {
    adminNote: CHALLENGE.public ? null : 'Admins only for now: everyone else gets “not found” here, and nothing opens until the owner opens it (CHALLENGE.public).',
    back: L.back,
    title: L.rulesTitle,
    // The rules, dates and who-can-enter lines were approved (owner, 2026-11-06; "reviewed by the coordinator, approved
    // by the owner"); only the intro's wording is still a draft, so the mark sits beside it alone.
    draft: null,
    introDraft: W.draftShort,
    deadline: ph === 'before' ? W.opensOn() : ph === 'open' ? W.deadline() : W.closed(),
    deadlineAfter: ph === 'before' ? W.deadline() : null,
    who: ph !== 'closed' ? W.whoCanEnter() : null,
    intro: W.intro(),
    next: [W.nextHead, W.next()],
    rulesHead: W.rulesHead,
    rules: [...W.rules(), W.adminsLine],
    notAffiliated: W.notAffiliated,
    counts: CHALLENGE.entries ? { head: L.countsHead, rows: chars.map((c) => ({ slug: c.slug, name: callName(c.name), text: W.entrants(st.entrants.get(c.slug) ?? 0) })) } : null,
    entriesHead: W.entriesHead,
    entriesOff: CHALLENGE.entries ? null : W.entriesOff,
    entriesNote: CHALLENGE.entries && st.entries.length ? W.entriesOrder : null,
    entries: st.entries.map((e) => ({ href: entryHref(e.versionId), title: W.entryLabel(nameOf(e.character), e.title), meta: `${designByline(e.byName, e.maker)} · v${e.versionNo}`, thumb: e.thumb })),
    entriesNone: W.entriesNone,
    badge: W.badge,
    alt: 'AI-generated front view, not by the author',
    adminsHead: CHALLENGE.entries && st.byAdmins.length > 0 ? W.adminsHead : null,
    byAdmins: st.byAdmins.map((v) => ({ href: entryHref(v.versionId), text: `${W.entryLabel(nameOf(v.character), v.title)} · ${designByline(v.byName, v.maker)} · v${v.versionNo}` })),
  };
}
