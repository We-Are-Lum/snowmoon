/**
 * The poidh bounty's own rules, read from its description on Base (owner, 2026-11-23; branch bounty-review), and the
 * hints /admin/bounty shows beside each claim. Pure and client-safe: no database, no network.
 *
 * Hints are never labels: they are what a reader can check by eye, shown so an admin doesn't have to, and an admin
 * still decides every label. Each hint quotes the rule it is checked against, as the bounty states it. If the bounty's
 * text no longer says a thing in a form read here, that hint says so instead of falling back to a value of ours.
 */

export interface BountyRules {
  /** The numbered directions ("1. Make a picture…"), as written. */
  steps: string[];
  /** The lines under "The rules:", as written. */
  rules: string[];
  /** The close as written ("Entries close Sunday 29 November, 11:59pm PT."), and the first instant that no longer counts. */
  close: { text: string; endsAt: string } | null;
  /** "one to three paragraphs", as written, and the numbers. */
  paragraphs: { text: string; min: number; max: number } | null;
  /** "Up to three entries per person.", as written, and the number. */
  perPerson: { text: string; max: number } | null;
  /** "The picture must be made on snowmoon.party.", as written. */
  madeHere: string | null;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const num = (w: string): number | null => (/^\d+$/.test(w) ? Number(w) : NUMBER_WORDS.indexOf(w.toLowerCase()) >= 0 ? NUMBER_WORDS.indexOf(w.toLowerCase()) : null);
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Minutes east of UTC that a time zone is at this instant (negative for Pacific). */
function offsetMinutes(at: number, tz: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(at)).map((p) => [p.type, p.value]));
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((wall - Math.floor(at / 1000) * 1000) / 60_000);
}
/** The UTC instant of a wall-clock time in a time zone. */
export function zonedInstant(y: number, m: number, d: number, h: number, min: number, tz = 'America/Los_Angeles'): number {
  const guess = Date.UTC(y, m, d, h, min);
  const first = guess - offsetMinutes(guess, tz) * 60_000;
  return guess - offsetMinutes(first, tz) * 60_000;
}

/** The bounty's rules, read from its description. `createdAt` (unix seconds) gives the year the close is in. */
export function readRules(description: string, createdAt: number): BountyRules {
  const lines = description.split('\n').map((l) => l.trim());
  const steps = lines.filter((l) => /^\d+\.\s/.test(l));
  const start = lines.findIndex((l) => /^the rules:?$/i.test(l));
  const rules: string[] = [];
  if (start >= 0) for (const l of lines.slice(start + 1)) {
    if (!l.startsWith('- ')) break;
    rules.push(l.slice(2));
  }
  const all = [...steps, ...rules].join('\n');

  let close: BountyRules['close'] = null;
  const c = /entries close (?:\w+day,? )?(\d{1,2}) (\w+),? (\d{1,2})(?::(\d{2}))?\s*(am|pm) PT\.?/i.exec(all);
  const month = c ? MONTHS.indexOf(c[2].toLowerCase()) : -1;
  if (c && month >= 0) {
    const created = new Date(createdAt * 1000);
    let year = created.getUTCFullYear();
    const hour = (Number(c[3]) % 12) + (c[5].toLowerCase() === 'pm' ? 12 : 0);
    let at = zonedInstant(year, month, Number(c[1]), hour, Number(c[4] ?? 0));
    if (at < createdAt * 1000) at = zonedInstant(++year, month, Number(c[1]), hour, Number(c[4] ?? 0));
    // "11:59pm" means through that minute: the first instant that no longer counts is a minute later.
    close = { text: rules.find((r) => r.includes(c[0])) ?? c[0], endsAt: new Date(at + 60_000).toISOString() };
  }

  let paragraphs: BountyRules['paragraphs'] = null;
  const p = /\b(\w+) to (\w+) paragraphs\b/i.exec(all);
  if (p && num(p[1]) !== null && num(p[2]) !== null) paragraphs = { text: steps.find((s) => s.includes(p[0])) ?? p[0], min: num(p[1])!, max: num(p[2])! };

  let perPerson: BountyRules['perPerson'] = null;
  const q = /up to (\w+) entries per person/i.exec(all);
  if (q && num(q[1]) !== null) perPerson = { text: rules.find((r) => r.includes(q[0])) ?? q[0], max: num(q[1])! };

  const madeHere = rules.find((r) => /picture must be made on snowmoon\.party/i.test(r)) ?? null;
  return { steps, rules, close, paragraphs, perPerson, madeHere };
}

/** A line that is only a link, perhaps with a short label ("Link:", "Picture made on snowmoon.party:"). */
const linkLine = (l: string) => /https?:\/\/\S+/.test(l) && l.replace(/https?:\/\/\S+/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean).length <= 5;

/**
 * The description's paragraphs: blocks separated by a blank line, leaving out blocks that are only links (the picture's
 * page, its image). A heading line such as "**In one breath:** …" is part of its paragraph, as written.
 */
export function paragraphsOf(description: string): string[] {
  return description
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').filter((l) => l.trim() && !linkLine(l.trim())).join('\n').trim())
    .filter(Boolean);
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PAGE = new RegExp(`(?:https?://)?(?:www\\.)?snowmoon\\.party/challenge/p/(${UUID})`, 'gi');
const PICTURE = /https:\/\/(?:pictures|media)\.snowmoon\.party\/[^\s)\]"'<>]+\.(?:jpe?g|png|webp)/gi;

/** The snowmoon.party challenge picture pages a claim links (version ids, in order, no repeats). */
export function linkedPages(description: string): string[] {
  return [...new Set([...description.matchAll(PAGE)].map((m) => m[1].toLowerCase()))];
}
/** snowmoon.party picture files the claim names: in its description, or as its picture (its tokenURI). */
export function linkedFiles(description: string, uri: string | null): string[] {
  return [...new Set([...`${description}\n${uri ?? ''}`.matchAll(PICTURE)].map((m) => m[0]))];
}

export type HintState = 'yes' | 'no' | 'unknown';
export interface Hint {
  key: 'link' | 'paragraphs' | 'onTime' | 'perPerson';
  state: HintState;
  /** What was found, in plain words. */
  text: string;
  /** The bounty's own words it was checked against, quoted; null when the bounty doesn't say. */
  rule: string | null;
}

/** A linked picture as the site knows it. */
export interface LinkedPicture { versionId: string; character: string; characterName: string; byFid: number; byName: string | null; href: string }

const pacific = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/**
 * The hints for one claim. `pictures` are the published challenge pictures its description links or whose file it
 * names (found by the server); `pages` are the challenge page links it has, found or not; `nth` is this claim's place
 * among its address's claims on the bounty, oldest first.
 */
export function hintsFor(rules: BountyRules, claim: { description: string; createdAt: string }, linked: { pages: string[]; pictures: LinkedPicture[] }, nth: { n: number; of: number }): Hint[] {
  const out: Hint[] = [];
  // The link: a published challenge picture on snowmoon.party, and its character.
  const pics = linked.pictures;
  const linkRule = rules.madeHere ?? rules.steps.find((s) => /link/i.test(s)) ?? null;
  if (pics.length) {
    const names = [...new Set(pics.map((p) => p.characterName))];
    out.push({ key: 'link', state: 'yes', text: `Links a published remix on snowmoon.party: ${names.join(', ')}${pics.length > 1 ? ` (${pics.length} pictures)` : ''}.`, rule: linkRule });
  } else if (linked.pages.length) {
    out.push({ key: 'link', state: 'no', text: `Links a snowmoon.party challenge page, but no published picture is there (hidden, or not a challenge picture).`, rule: linkRule });
  } else {
    out.push({ key: 'link', state: 'no', text: 'No link to a published remix on snowmoon.party.', rule: linkRule });
  }
  // Paragraphs.
  const n = paragraphsOf(claim.description).length;
  const pr = rules.paragraphs;
  out.push(pr
    ? { key: 'paragraphs', state: n >= pr.min && n <= pr.max ? 'yes' : 'no', text: `${n} paragraph${n === 1 ? '' : 's'} (links left out).`, rule: pr.text }
    : { key: 'paragraphs', state: 'unknown', text: `${n} paragraph${n === 1 ? '' : 's'} (links left out). The bounty's text doesn't give a number to check against.`, rule: null });
  // On time.
  const cl = rules.close;
  out.push(cl
    ? Date.parse(claim.createdAt) < Date.parse(cl.endsAt)
      ? { key: 'onTime', state: 'yes', text: `Made before the close: ${pacific(claim.createdAt)} PT.`, rule: cl.text }
      : { key: 'onTime', state: 'no', text: `Made after the close: ${pacific(claim.createdAt)} PT.`, rule: cl.text }
    : { key: 'onTime', state: 'unknown', text: `Made ${pacific(claim.createdAt)} PT. The bounty's text doesn't give a close to check against.`, rule: null });
  // Entries per person (by address: one person may use several).
  const pp = rules.perPerson;
  out.push({
    key: 'perPerson',
    state: pp ? (nth.n <= pp.max ? 'yes' : 'no') : 'unknown',
    text: `This address's ${ordinal(nth.n)} claim of ${nth.of} on this bounty.`,
    rule: pp?.text ?? null,
  });
  return out;
}
