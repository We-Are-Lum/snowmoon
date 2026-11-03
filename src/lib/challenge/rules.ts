import { CHALLENGE } from '../config';
import { CHALLENGE_LISTS } from './who';

/**
 * The remix challenge's rules, as pure functions (no network, no database), so scripts/test-challenge.ts can prove
 * each one on stand-ins (docs/proposals/remix-challenge-plan.md; owner, 2026-10-31).
 *
 * - The window: from CHALLENGE.dates.opens (in) to CHALLENGE.dates.closes (out), instants in UTC; shown in Pacific.
 * - What counts (forks only): a published fork of a challenge character's sheet (or of another entry: a fork of any of its sheets is a fork on the
 *   same character), one of its versions made inside the window, by an eligible person.
 * - Who is eligible: the maker (a Farcaster ID; wallets can't make sheets yet) is on IMAGES.invited, or has a
 *   Neynar score of at least IMAGES.neynarMinScore. Admins (the config's admin list) can make versions but are never eligible.
 * - One entry per person per character: their latest version in the window, unless they marked another.
 *
 * Every date shown anywhere comes from dateText() over CHALLENGE.dates; nothing writes a date itself (owner,
 * 2026-10-31; scripts/test-challenge.ts fails on a page or wording file that does).
 */

export type DateKey = keyof typeof CHALLENGE.dates;
const ms = (iso: string) => Date.parse(iso);

/** Inside the entry window: from opens (included) to closes (excluded; 23:59 Pacific on the last day is still in). */
export function inWindow(at: Date | string, dates: { opens: string; closes: string } = CHALLENGE.dates): boolean {
  const t = typeof at === 'string' ? Date.parse(at) : at.getTime();
  return Number.isFinite(t) && t >= ms(dates.opens) && t < ms(dates.closes);
}

/** Where we are: before the window, in it, or after. */
export function phase(now: Date = new Date(), dates: { opens: string; closes: string } = CHALLENGE.dates): 'before' | 'open' | 'closed' {
  const t = now.getTime();
  return t < ms(dates.opens) ? 'before' : t < ms(dates.closes) ? 'open' : 'closed';
}

/**
 * A date of the challenge as people read it, in Pacific time, built from CHALLENGE.dates only. A closing instant
 * (closes, mintCloses) is shown as its last minute: "Sunday 22 November, 23:59 Pacific".
 */
export function dateText(key: DateKey, opts: { time?: boolean } = {}, dates: Record<DateKey, string> = CHALLENGE.dates): string {
  // A window that ends at midnight is shown as its last minute; one that ends at a call (09:00) as that time.
  const closing = (key === 'closes' || key === 'mintCloses' || key === 'shortlistCloses') && pacificWallTime(dates[key]).endsWith(' 00:00');
  const at = new Date(ms(dates[key]) - (closing ? 60_000 : 0));
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: CHALLENGE.timeZone, weekday: 'long', day: 'numeric', month: 'long' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = `${get('weekday')} ${get('day')} ${get('month')}`;
  if (!opts.time) return day;
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: CHALLENGE.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  return `${day}, ${hm} Pacific`;
}

/** "6 to 22 November": the window as a span, from the config. */
export function windowText(dates: Record<DateKey, string> = CHALLENGE.dates): string {
  const d = (k: DateKey) => dateText(k, {}, dates).split(' ').slice(1); // [day, month]
  const [a, am] = d('opens');
  const [b, bm] = d('closes');
  return am === bm ? `${a} to ${b} ${bm}` : `${a} ${am} to ${b} ${bm}`;
}

/** The Pacific wall time of an instant, "YYYY-MM-DD HH:MM" (for the tests and the owner's report). */
export function pacificWallTime(iso: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: CHALLENGE.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

// ---------------------------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------------------------
export type Eligibility =
  | { eligible: true; person: number; why: 'invited' | 'passed' }
  | { eligible: false; person: number | null; why: 'admin' | 'not-a-farcaster-account' | 'below' | 'unchecked' };

/**
 * Whether a maker's versions can be entries, decided once, when the version is published (the decision is stored;
 * pages only read it). `maker` is the record's maker: a FID. `score` is the person's Neynar score at publish (null:
 * not known, e.g. Neynar didn't answer; such a version doesn't count). The score is compared with
 * CHALLENGE.neynarMinScore and then forgotten: only the decision ('passed' or 'below') is stored (owner, 2026-11-01).
 *
 * Wallets (owner, 2026-10-31: drop "or a wallet linked to either" until wallets can make sheets): a maker that isn't a
 * FID is never eligible. To restore the wallet path later, resolve a wallet maker to the FID it is linked to before
 * calling this (src/lib/wallet/credit.ts, linkedTo) and pass that FID as `maker`.
 */
export function eligibility(p: { maker: number; score: number | null }, lists: { admins: readonly number[]; invited: readonly number[]; min: number } = CHALLENGE_LISTS): Eligibility {
  if (!(p.maker > 0)) return { eligible: false, person: null, why: 'not-a-farcaster-account' };
  const person = p.maker;
  if (lists.admins.includes(person)) return { eligible: false, person, why: 'admin' };
  if (lists.invited.includes(person)) return { eligible: true, person, why: 'invited' };
  if (p.score === null || !Number.isFinite(p.score)) return { eligible: false, person, why: 'unchecked' };
  return p.score >= lists.min ? { eligible: true, person, why: 'passed' } : { eligible: false, person, why: 'below' };
}

export type Decision = 'admin' | 'invited' | 'passed' | 'below' | 'unchecked';

/**
 * A stored decision, read back for a page. The lists are applied again (an admin is never eligible, an invited person
 * always is); otherwise the decision made at publish stands. No score is involved.
 */
export function fromDecision(maker: number, decision: Decision | null, lists: { admins: readonly number[]; invited: readonly number[] } = CHALLENGE_LISTS): Eligibility {
  if (!(maker > 0)) return { eligible: false, person: null, why: 'not-a-farcaster-account' };
  if (lists.admins.includes(maker)) return { eligible: false, person: maker, why: 'admin' };
  if (lists.invited.includes(maker)) return { eligible: true, person: maker, why: 'invited' };
  if (decision === 'passed') return { eligible: true, person: maker, why: 'passed' };
  return { eligible: false, person: maker, why: decision === 'below' ? 'below' : 'unchecked' };
}

/** Whether a FID needs a score lookup at all (admins and invited people never do). */
export const needsScore = (fid: number) => !CHALLENGE_LISTS.admins.includes(fid) && !CHALLENGE_LISTS.invited.includes(fid);

// ---------------------------------------------------------------------------------------------
// Entries: one per person per character
// ---------------------------------------------------------------------------------------------
export interface Candidate {
  versionId: string;
  elementId: string;
  /** The character's slug (CHALLENGE.characters). */
  character: string;
  /** The person it counts for: the maker's FID. */
  person: number;
  createdAt: string;
  /** The design's first version has a remixed_from link (a fork). */
  forked: boolean;
}

/** A version that could be an entry, before eligibility: a fork's version made inside the window, for a challenge character. */
export const isCandidate = (c: Pick<Candidate, 'createdAt' | 'forked' | 'character'>, dates: { opens: string; closes: string } = CHALLENGE.dates) =>
  c.forked && CHALLENGE.characters.includes(c.character) && inWindow(c.createdAt, dates);

export const markKey = (person: number, character: string) => `${person} ${character}`;

/** Newest first (the only order entries are ever shown in), then by id so the order never changes between views. */
export const newestFirst = (a: { createdAt: string; versionId: string }, b: { createdAt: string; versionId: string }) =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.versionId < b.versionId ? -1 : a.versionId > b.versionId ? 1 : 0;

/**
 * The entries: for each person and character, the version they marked if it is still one of their candidates, else
 * their latest. `eligible` says whose count. Returned newest first.
 */
export function chooseEntries<C extends Candidate>(candidates: C[], marks: ReadonlyMap<string, string>, eligible: (person: number) => boolean): C[] {
  const groups = new Map<string, C[]>();
  for (const c of candidates) {
    if (!isCandidate(c) || !eligible(c.person)) continue;
    const k = markKey(c.person, c.character);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const out: C[] = [];
  for (const [k, list] of groups) {
    const marked = marks.get(k);
    out.push(list.find((c) => c.versionId === marked) ?? [...list].sort(newestFirst)[0]);
  }
  return out.sort(newestFirst);
}

/** For each character, how many different people have an entry (a count shown as is, never a ranking). */
export function entrantCounts(entries: Pick<Candidate, 'person' | 'character'>[], characters: readonly string[] = CHALLENGE.characters): Map<string, number> {
  return new Map(characters.map((c) => [c, new Set(entries.filter((e) => e.character === c).map((e) => e.person)).size]));
}

/** Whether a character has enough entrants for a final version, a credit test and a token (CHALLENGE.minEntrants). */
export const enoughEntrants = (count: number, min: number = CHALLENGE.minEntrants) => count >= min;
