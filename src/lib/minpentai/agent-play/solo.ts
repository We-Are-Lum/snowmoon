/**
 * Agent play, solo (draft, 2026-10-31; design: docs/proposals/minpentai-agent-play.md): a person, with their own
 * AI as adviser through the Snowmoon connector, plays Cyan against the site's search computer (Amber), on the
 * book edition or on Play's rules. The server is the referee: it alone holds the real board, and everything a
 * side is shown comes from that side's view (engine fog()).
 *
 * Pure: no database and no clock of its own (times come in as arguments). store.ts keeps a match; tools.ts
 * serves it to agents. No clocks yet (solo: a turn resolves when the person's side marks its orders final), no
 * lobby, no second person: those come with PvP.
 *
 * Orders are committed before they're revealed (section 6): each submission gets a fresh 32-byte salt and the
 * commitment sha256(the orders as text + salt). The site computer commits its own orders when the turn opens,
 * from its own view, before it can know the person's; the person's view shows that commitment. Both lists and
 * salts go into the record at reveal; the record opens to anyone when the match ends.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { drawRules, engine, layout, other, rng, verdict, type AnyPiece, type Engine, type Kills, type Placement, type Side, type World } from '../versions/engine';
import type { Settings } from '../versions/schema';
import { SOLO_V3, type VersionRules } from '../versions/solo-v1';
import { TurnWatch } from './summary';
import { BOOK_3_DRAFT, BOOK_4_DRAFT, BOOK_EDITION } from '../versions/book-edition';
import { PRESETS, TOP_LEVEL, searchPlan, type BookPlay, type Computer, type Preset } from '../versions/search';
import { appUrl } from '../../config';
import { PIECES_PAGE, rulesText } from './rules-text';
import { converging, laneWarnings } from './help';

/**
 * The exact rulesets a match can be played under (owner, 2026-10-31: a record names its exact ruleset, so it replays
 * the same after the rules change): play-3 is Play's ruleset 3 (versions/solo-v1.ts), book-1 the book edition as it
 * is today. A rule change adds a new id; an id never changes meaning.
 */
export const RULESETS = { 'book-1': BOOK_EDITION, 'book-2': BOOK_EDITION, 'book-3': BOOK_3_DRAFT, 'book-4': BOOK_4_DRAFT, 'play-3': SOLO_V3 } as const satisfies Record<string, VersionRules>;
/**
 * How the site computer plays under each ruleset. book-2 (owner, 2026-11-01: "a new computer means a new ruleset") is
 * book-1's rules with a computer that uses all four book pieces (search.ts BookPlay); book-1 matches keep replaying with
 * the computer they were played against.
 */
export const COMPUTERS: Record<RulesetName, { book?: BookPlay; comp?: Computer }> = { 'book-1': {}, 'book-2': { book: { variety: 0, kinds: ['f', 'w', 'm', 'e'], from: 2 } }, 'book-3': {}, 'book-4': { comp: { formingSymbols: true, seedScore: 0, spendTies: true } }, 'play-3': {} };
/**
 * Draft rulesets: started only by name, and only by the people in AGENTS.minpentaiPlay.drafts. book-3's computer is the
 * plain search, unforced: under book-3's rules it chooses the pieces on its own (or doesn't), which is what the draft
 * is for.
 */
export const DRAFTS: readonly RulesetName[] = ['book-3', 'book-4'];
export type RulesetName = keyof typeof RULESETS;
/** What a new match under each family is played under now. */
export const CURRENT: Record<'book' | 'play', RulesetName> = { book: 'book-2', play: 'play-3' };
export const PERSON: Side = 'C';
export const COMPUTER: Side = 'A';
/** The search level the site computer uses when it plays the person's own side (the fallback). */
export const FALLBACK_LEVEL = 2;

/** What a person declares about the model their agent runs (as bring_in_image): a label, not checked. */
export interface ModelClaim { name: string; maker: string; weights: 'open' | 'closed' | 'unknown'; version?: string }

export type Source = 'agent' | 'person' | 'autopilot' | 'site-computer';
export interface Orders {
  placements: Placement<AnyPiece>[]; source: Source; preset?: Preset; salt: string; commitment: string; final: boolean; note?: string; at: string;
  /** Taken with the live page's Take turn (owner, 2026-11-03): who drafted the orders the person approved there. */
  via?: 'page'; drafted_by?: Source;
  /** A practice match: the turn's clock ran out, so the site computer played it under the side's standing order. */
  clock?: true;
}
export interface RevealedTurn { turn: number; step: number; C: Omit<Orders, 'final' | 'note'>; A: Omit<Orders, 'final' | 'note'> }

export interface SoloMatch {
  v: 1;
  id: string;
  ruleset: RulesetName;
  level: number;
  seed: number;
  person: number;
  agent: { id: string | null; name: string; model: ModelClaim | null };
  /** sha256 of the live link's secret (the link itself is shown once, to the agent that starts the match). */
  linkHash: string;
  /**
   * 32 server-only random bytes (hex) mixed into the site computer's numbers (fog review, 2026-10-31): with the seed
   * alone, an agent with the open-source engine could sample the computer's exact choices. Committed at the start
   * (cpuCommit, shown to the side from the first view) and revealed in the record, so a replay or the onchain
   * verifier can recompute every computer move (checkComputer) and the server can't choose it afterwards.
   */
  cpu: string;
  cpuCommit: string;
  createdAt: string;
  /** The real board. Server only: never sent to a side while the match is on. */
  w: World;
  kills: Kills;
  /** Where each side last saw each enemy tower. */
  ls: Record<Side, Record<number, number>>;
  /** Turns to act so far (0 is setup). */
  turn: number;
  /**
   * This turn's orders. The computer's (A) are planned just after the turn opens, once the answer that opened it has
   * been sent (tools.ts), and kept here until the reveal; null until then (owner, 2026-11-01). They follow from the
   * board as the turn opened and the committed random value, so when they are planned changes nothing.
   */
  pend: { C: Orders | null; A: Orders | null };
  /** When this turn to act opened (ms since 1970): nothing about the match is answered before openedAt + T (tools.ts). */
  openedAt: number;
  /** The person's summary of the last turn played (summary.ts): what their side saw, in words. */
  summary?: { turn: number; from: number; lines: string[] };
  standing: { text: string; preset: Preset } | null;
  history: RevealedTurn[];
  end: { win: Side | 'D'; how: 'towers' | 'time' | 'resigned'; step: number } | null;
  /** A practice match between two people (owner, 2026-11-03; docs/proposals/minpentai-matches-between-people.md). */
  versus?: Versus;
}
export type Standing = { text: string; preset: Preset };
export type TurnSummary = { turn: number; from: number; lines: string[] };
/**
 * The second person and what belongs to each side. Cyan (C) is the person who created the match (SoloMatch.person,
 * .agent, .standing, .summary, .linkHash); Amber (A) is here. Each side sees only its own fog view; orders stay sealed
 * (a per-turn commitment) until both are in.
 */
export interface Versus {
  players: { C: number; A: number | null };
  /** Shown to the other player while the match is on; in the public record only where showNames says so. */
  names: { C: string; A: string | null };
  showNames: { C: boolean; A: boolean };
  agentA: SoloMatch['agent'] | null;
  /** The turn clock, in seconds, and when the open turn's runs out (ms; null until both have joined). */
  clockSec: number;
  deadline: number | null;
  public: boolean;
  /** A private match's invite: sha256 of its token, single use, and when it expires (ms). */
  invite: { hash: string; expires: number } | null;
  linkHashA: string | null;
  standingA: Standing | null;
  summaryA?: TurnSummary;
  /** Opted-in ntfy topics for "your turn" alerts, per side (random names; null: off). */
  notify: { C: string | null; A: string | null };
}
export const CLOCKS = { '15m': 15 * 60, '4h': 4 * 3600, '24h': 24 * 3600 } as const;
/** Which side a person plays in a match, or null. */
export function sideOf(m: SoloMatch, person: number): Side | null {
  if (m.versus) return m.versus.players.C === person ? 'C' : m.versus.players.A === person ? 'A' : null;
  return m.person === person ? PERSON : null;
}
const standingOf = (m: SoloMatch, me: Side) => (me === 'A' ? m.versus?.standingA ?? null : m.standing);
const summaryOf = (m: SoloMatch, me: Side) => (me === 'A' ? m.versus?.summaryA : m.summary);

// ---------- rules ----------

export function rulesOf(m: Pick<SoloMatch, 'ruleset' | 'seed'>): { s: Settings; e: Engine; rule: string | null } {
  const v = RULESETS[m.ruleset];
  const { first, s1 } = drawRules(v, rng(m.seed));
  return { s: s1, e: engineFor(v, s1), rule: first ? first.text : null };
}
const engines = new Map<string, Engine>();
function engineFor(v: VersionRules, s: Settings): Engine {
  const key = `${v === BOOK_EDITION ? 'book' : 'play'}:${s.width}x${s.height}:${s.startTowers}`;
  if (!engines.has(key)) engines.set(key, engine(layout(v, s)));
  return engines.get(key)!;
}

const sha256 = (x: string | Buffer) => createHash('sha256').update(x).digest('hex');
/** The orders as committed: sorted keys, pieces in the order given. */
export const ordersText = (ps: Placement<AnyPiece>[]) => JSON.stringify(ps.map((p) => ({ t: p.t, x: p.x, y: p.y, dx: p.dx, dy: p.dy })));
export const commit = (ps: Placement<AnyPiece>[], salt: string) => sha256(ordersText(ps) + salt);

/** The computer's random numbers for a turn: the seed, the turn, and the committed server-only value. */
const cpuWord = (cpu: string) => parseInt(cpu.slice(0, 8), 16) >>> 1;
const turnRng = (m: Pick<SoloMatch, 'seed' | 'turn' | 'cpu'>, who: 1 | 2 | 3) => rng(((m.seed * 7919 + m.turn * 31 + who) ^ cpuWord(m.cpu)) >>> 0);
type PlanState = Pick<SoloMatch, 'ruleset' | 'seed' | 'level' | 'cpu' | 'w' | 'ls' | 'turn'>;
/** What the site computer plays for its own side from this state (its own view only). */
function computerPlan(m: PlanState) {
  const { s, e } = rulesOf(m);
  const o = COMPUTER;
  return searchPlan({ e, s, o, view: e.fog(m.w, s, o), lastSeen: { ...m.ls[o] }, snap: e.towers(m.w, o), points: pointsOf(m, s), rng: turnRng(m, 1), level: m.level, ...COMPUTERS[m.ruleset] }).placements;
}
/** What the site computer plays for the person's side when asked to (the fallback, under a preset). */
function fallbackPlan(m: PlanState, preset: Preset, me: Side = PERSON) {
  const { s, e } = rulesOf(m);
  return searchPlan({ e, s, o: me, view: e.fog(m.w, s, me), lastSeen: { ...m.ls[me] }, snap: e.towers(m.w, me), points: pointsOf(m, s), rng: turnRng(m, me === 'A' ? 3 : 2), level: FALLBACK_LEVEL, preset, ...COMPUTERS[m.ruleset] }).placements;
}
/** The site computer's orders for its side this turn: from its own view, committed before the person's are known. */
function computerOrders(m: SoloMatch, at: string): Orders {
  const placements = computerPlan(m);
  const salt = randomBytes(32).toString('hex');
  return { placements, source: 'site-computer', salt, commitment: commit(placements, salt), final: true, at };
}
const pointsOf = (m: Pick<SoloMatch, 'w'>, s: Settings) => (m.w.step === 0 ? s.setupPoints : s.points);

/** A new match. Returns it and the live link's secret (shown once). */
export function newSolo(o: { id: string; ruleset: RulesetName; level: number; seed: number; person: number; agent: SoloMatch['agent']; now: string }): { m: SoloMatch; linkSecret: string } {
  if (!(o.ruleset in RULESETS)) throw new SoloError(`ruleset must be one of ${Object.keys(RULESETS).join(', ')}`);
  if (!Number.isInteger(o.level) || o.level < 0 || o.level > TOP_LEVEL) throw new SoloError(`level must be 0 (the beginner) to ${TOP_LEVEL}`);
  const linkSecret = randomBytes(24).toString('base64url'), cpu = randomBytes(32).toString('hex');
  const base = { ruleset: o.ruleset, seed: o.seed };
  const { s, e } = rulesOf(base);
  const w = e.world(s);
  const ls: SoloMatch['ls'] = { C: {}, A: {} };
  e.L.towers.A.forEach((k) => (ls.C[k] = 0));
  e.L.towers.C.forEach((k) => (ls.A[k] = 0));
  const m: SoloMatch = {
    v: 1, id: o.id, ruleset: o.ruleset, level: o.level, seed: o.seed, person: o.person, agent: o.agent,
    linkHash: sha256(linkSecret), cpu, cpuCommit: sha256(cpu), createdAt: o.now, w, kills: { C: 0, A: 0, ...(s.killReports ? { log: [] } : {}) }, ls, turn: 0,
    pend: { C: null, A: null }, openedAt: Date.parse(o.now) || 0, standing: null, history: [], end: null,
  };
  return { m, linkSecret };
}

export class SoloError extends Error {}

const hashIs = (secret: unknown, hash: string | null | undefined) => {
  if (typeof secret !== 'string' || secret.length < 16 || secret.length > 64 || !hash) return false;
  const a = Buffer.from(sha256(secret), 'hex'), b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
};
/** Whether a live link's secret opens this match (constant time). */
export function linkOpens(m: SoloMatch, secret: string): boolean {
  return linkSide(m, secret) !== null;
}
/** The side a live link's secret opens: each player of a practice match has their own link, showing their side only. */
export function linkSide(m: SoloMatch, secret: string): Side | null {
  if (hashIs(secret, m.linkHash)) return 'C';
  if (m.versus && hashIs(secret, m.versus.linkHashA)) return 'A';
  return null;
}
/** A new live link for a side (the old one stops working). Returns the secret. */
export function newLink(m: SoloMatch, me: Side): string {
  const secret = randomBytes(24).toString('base64url');
  if (me === 'A') m.versus!.linkHashA = sha256(secret); else m.linkHash = sha256(secret);
  return secret;
}

// ---------- practice matches between people (owner, 2026-11-03) ----------

/** The rulesets a practice match may use: the current two, and drafts for the people they're opened to. */
export const PRACTICE_RULESETS: RulesetName[] = ['book-2', 'play-3'];
/**
 * A new practice match. Its creator plays Cyan. A private match comes with an invite (single use, 24 hours); a public
 * one is listed until someone joins. Like a solo match it has a committed random value: it decides only the moves the
 * site computer makes for a side whose clock runs out, so they can be checked from the record.
 */
export function newPractice(o: { id: string; ruleset: RulesetName; seed: number; person: number; name: string; showName: boolean; agent: SoloMatch['agent']; clock: keyof typeof CLOCKS; public: boolean; now: string }): { m: SoloMatch; linkSecret: string; invite: string | null } {
  if (!(o.clock in CLOCKS)) throw new SoloError(`clock must be one of ${Object.keys(CLOCKS).join(', ')}`);
  const { m, linkSecret } = newSolo({ id: o.id, ruleset: o.ruleset, level: 0, seed: o.seed, person: o.person, agent: o.agent, now: o.now });
  const invite = o.public ? null : randomBytes(18).toString('base64url');
  m.versus = {
    players: { C: o.person, A: null }, names: { C: o.name, A: null }, showNames: { C: o.showName, A: false }, agentA: null,
    clockSec: CLOCKS[o.clock], deadline: null, public: o.public,
    invite: invite ? { hash: sha256(invite), expires: (Date.parse(o.now) || 0) + 24 * 3600_000 } : null,
    linkHashA: null, standingA: null, notify: { C: null, A: null },
  };
  return { m, linkSecret, invite };
}
/**
 * The second person joins as Amber: through the private invite (single use, before it expires) or from the open list.
 * The turn clock starts now. Returns Amber's live-link secret.
 */
export function joinPractice(m: SoloMatch, o: { person: number; name: string; showName: boolean; agent: SoloMatch['agent']; invite?: string; now: string }): string {
  const v = m.versus;
  if (!v || m.end) throw new SoloError('no practice match waiting for a player with that id');
  if (v.players.A !== null) throw new SoloError('this match already has two players');
  if (v.players.C === o.person) throw new SoloError('you created this match: send the invite to someone else');
  const now = Date.parse(o.now) || 0;
  if (!v.public) {
    if (!v.invite || !hashIs(o.invite, v.invite.hash)) throw new SoloError('that invite doesn\'t open this match');
    if (now > v.invite.expires) throw new SoloError('that invite has expired: ask for a new one');
  }
  v.players.A = o.person; v.names.A = o.name; v.showNames.A = o.showName; v.agentA = o.agent; v.invite = null;
  m.openedAt = now;
  v.deadline = now + v.clockSec * 1000;
  return newLink(m, 'A');
}
/**
 * The turn clock: if the open turn's clock has run out, the site computer plays it for every side whose final orders
 * aren't in, under that side's standing order (balanced if none), and the turn resolves. Repeats while turns are
 * overdue (both players away). True if anything was played.
 */
export function runClock(m: SoloMatch, now: string): boolean {
  const v = m.versus;
  let played = false;
  for (let i = 0; i < 40 && v && !m.end && v.players.A !== null && v.deadline !== null && (Date.parse(now) || 0) > v.deadline; i++) {
    const at = new Date(v.deadline).toISOString();
    for (const me of ['C', 'A'] as const) {
      if (m.pend[me]?.final) continue;
      const preset = standingOf(m, me)?.preset ?? 'balanced';
      const placements = fallbackPlan(m, preset, me);
      const salt = randomBytes(32).toString('hex');
      m.pend[me] = { placements, source: 'site-computer', preset, salt, commitment: commit(placements, salt), final: true, clock: true, at };
    }
    resolve(m, at);
    played = true;
  }
  return played;
}

// ---------- what a side is shown ----------

const DIRS: Record<string, [number, number]> = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
const dirName = (dx: number, dy: number) => Object.keys(DIRS).find((k) => DIRS[k][0] === dx && DIRS[k][1] === dy) ?? '';
const PIECE_NAMES: Record<AnyPiece, string> = { g: 'glider', s: 'square', t: 'tower', m: 'mirror', e: 'symbol_glider', w: 'moving_wall', f: 'factory' };
const PIECE_OF: Record<string, AnyPiece> = Object.fromEntries(Object.entries(PIECE_NAMES).map(([k, v]) => [v, k as AnyPiece]));

/** A placement as an agent writes it. */
export interface OrderIn { piece: string; x: number; y: number; dir?: string; slant?: string }
export const orderOut = (p: Placement<AnyPiece>) => ({
  piece: PIECE_NAMES[p.t], x: p.x, y: p.y,
  ...(p.t === 'g' || p.t === 'e' || p.t === 'w' || p.t === 'f' ? { dir: dirName(p.dx, p.dy) } : {}),
  ...(p.t === 'm' ? { slant: p.dx > 0 ? '/' : '\\' } : {}),
});

/** A board as plain lists, from one side's point of view: "mine" and "theirs". Ore only where `seeOre` says. */
export function boardOut(e: Engine, w: World, me: Side, seeOre: (k: number) => boolean) {
  const xy = (k: number) => e.XY(+k);
  const who = (o: Side) => (o === me ? 'mine' : 'theirs');
  return {
    rocks: Object.keys(w.rock).map(Number).sort((a, b) => a - b).map((k) => ({ x: xy(k)[0], y: xy(k)[1], ...(w.ore && seeOre(k) && w.ore[k] !== undefined ? { ore: w.ore[k] } : {}) })),
    towers: Object.keys(w.tw).map(Number).sort((a, b) => a - b).map((k) => ({ x: xy(k)[0], y: xy(k)[1], side: who(w.tw[k]), ...(w.fs?.[k] ? { forming: true } : {}) })),
    squares: Object.keys(w.sq).map(Number).sort((a, b) => a - b).map((k) => ({ x: xy(k)[0], y: xy(k)[1], side: who(w.sq[k].o), hits_left: w.sq[k].hp })),
    gliders: w.gl.map((g) => ({ x: g.x, y: g.y, dir: dirName(g.dx, g.dy), side: who(g.o), ...(g.seed ? { symbol: true } : {}) })),
    ...(w.mir ? { mirrors: Object.keys(w.mir).map(Number).sort((a, b) => a - b).map((k) => ({ x: xy(k)[0], y: xy(k)[1], slant: w.mir![k].d > 0 ? '/' : '\\', side: who(w.mir![k].o), hits_left: w.mir![k].hp })) } : {}),
    ...(w.sd ? { resting_symbol_gliders: Object.keys(w.sd).map(Number).sort((a, b) => a - b).map((k) => ({ x: xy(k)[0], y: xy(k)[1], side: who(w.sd![k]) })) } : {}),
    ...(w.mw ? { moving_walls: w.mw.map((m) => ({ side: who(m.o), dir: dirName(m.dx, m.dy), squares: e.wallCells(m).filter((_, i) => m.c[i]).map(([x, y]) => ({ x, y })) })) } : {}),
    ...(w.fa ? { factories: Object.keys(w.fa).map(Number).sort((a, b) => a - b).map((k) => ({ x: xy(k)[0], y: xy(k)[1], dir: dirName(w.fa![k].dx, w.fa![k].dy), side: who(w.fa![k].o), hits_left: w.fa![k].hp })) } : {}),
  };
}

/** The name a view gives the match's ruleset. */
const rulesetName = (r: RulesetName) => (r.startsWith('book') ? `Rocks and Mirrors, the book edition (${r})` : `Play (${r})`);

/**
 * The match's rules as plain lines, generated from its settings (rules-text.ts), and where the person can read how the
 * pieces work (owner, 2026-11-02). Depends only on the ruleset and its drawn rule, never on the board.
 */
export function rulesFor(m: Pick<SoloMatch, 'ruleset' | 'seed'>) {
  const { s, rule } = rulesOf(m);
  return { rules: rulesText(s, { name: rulesetName(m.ruleset), drawn: rule }), how_the_pieces_work: `${appUrl()}${PIECES_PAGE}` };
}

/** Everything the person's side is shown: its view of the board and the turn. Nothing else. */
export function viewFor(m: SoloMatch, me: Side = PERSON) {
  const { s, e, rule } = rulesOf(m);
  const them = other(me), view = e.fog(m.w, s, me), see = e.sees(m.w, s, me), vs = m.versus;
  const mine = m.pend[me], theirs = m.pend[them], summary = summaryOf(m, me);
  // Ore only where the rock and every square beside it are in sight (as fog() keeps it).
  const oreSeen = (k: number) => { const [x, y] = e.XY(k); return see.has(k) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => !e.inb(x + dx, y + dy) || see.has(e.K(x + dx, y + dy))); };
  const snap = e.towers(m.w, me);
  const can = [...e.lit(m.w, me, s.reach, snap)].filter((k) => e.empty(m.w, k)).sort((a, b) => a - b);
  const over = !!m.end;
  return {
    match_id: m.id,
    side: me === 'C' ? 'Cyan' : 'Amber',
    opponent: vs
      ? {
          // A person. Their orders stay sealed: only that they've sent final orders, and the commitment to them.
          kind: 'person', name: vs.names[them], joined: vs.players[them] !== null,
          sent_final_orders: !!theirs?.final, commitment: theirs?.final ? theirs.commitment : null,
          clock: { seconds: vs.clockSec, runs_out_at: vs.deadline ? new Date(vs.deadline).toISOString() : null },
          clock_random_commitment: m.cpuCommit,
        }
      : { kind: 'site computer', level: m.level, random_commitment: m.cpuCommit },
    ...(vs ? { practice: 'a practice match between people: never counted toward any ranking' } : {}),
    ruleset: rulesetName(m.ruleset),
    rule,
    phase: over ? 'over' : m.turn === 0 ? 'setup' : 'act',
    turn: m.turn,
    step: m.w.step,
    max_steps: s.maxSteps,
    every: s.every,
    board_size: { width: e.W, height: e.H },
    sight: s.sight,
    reach: s.reach,
    points: over ? 0 : pointsOf(m, s),
    costs: costsOf(s),
    // book-4's kill reports: every enemy tower this side's gliders destroyed, seen or not, and the count for both
    // sides (the tie-break counts them). Nothing else from the dark.
    ...(s.killReports ? { towers_destroyed: { by_you: m.kills[me], by_opponent: m.kills[them] }, your_kills: (m.kills.log ?? []).filter((x) => x.o === me).map((x) => ({ x: e.XY(x.k)[0], y: e.XY(x.k)[1], step: x.step })) } : {}),
    ...(s.gliderSight || s.symbolGliderSight ? { glider_sight: { plain: s.gliderSight ?? 0, symbol: s.symbolGliderSight ?? 0 } } : {}),
    // book-3's limits, said only where a ruleset sets them (book-1 and book-2 views are unchanged).
    ...(s.maxTowers ? { towers_at_most: s.maxTowers, ...(s.symbolsCapped ? { symbols_count_toward_the_cap: true } : {}) } : {}),
    ...(s.maxSymbolTowers ? { symbol_towers_at_most: s.maxSymbolTowers, symbol_towers_now: e.symbolTowers(m.w, me) } : {}),
    ...(s.factoryEvery ? { factories_fire_every_steps: s.factoryEvery } : {}),
    ...(s.tieBreak ? { tie_break: 'at the last step with towers level, the side that destroyed more enemy towers wins' } : {}),
    board: boardOut(e, view, me, oreSeen),
    last_seen_enemy_towers: Object.entries(m.ls[me]).filter(([k]) => !view.tw[+k]).map(([k, step]) => ({ x: e.XY(+k)[0], y: e.XY(+k)[1], step })),
    can_place: can.map((k) => [e.XY(k)[0], e.XY(k)[1]]),
    my_orders: mine ? { placements: mine.placements.map(orderOut), source: mine.source, final: mine.final, commitment: mine.commitment, ...(mine.note ? { note: mine.note } : {}) } : null,
    standing_order: standingOf(m, me),
    my_turns: m.history.map((h) => ({ turn: h.turn, step: h.step, placements: h[me].placements.map(orderOut), source: h[me].source, ...(h[me].preset ? { preset: h[me].preset } : {}), ...(h[me].via === 'page' ? { taken_on_the_live_page: true, drafted_by: h[me].drafted_by } : {}), ...(h[me].clock ? { clock_ran_out: true } : {}) })),
    end: m.end,
    // Agent help (2026-11-02), kept in their own fields: the rules for this ruleset, and the person's page.
    ...rulesFor(m),
    // What the person's side saw happen in the last turn's steps, in words (summary.ts); empty before the first.
    last_turn_summary: summary ? { turn: summary.turn, from_step: summary.from, lines: summary.lines } : null,
  };
}

export function costsOf(s: Settings) {
  return {
    glider: s.costGlider, square: s.costSquare, tower: s.costTower,
    ...(s.costMirror ? { mirror: s.costMirror } : {}), ...(s.costSeed ? { symbol_glider: s.costSeed } : {}),
    ...(s.costWall ? { moving_wall: s.costWall } : {}), ...(s.costFactory ? { factory: s.costFactory } : {}),
  };
}

// ---------- orders ----------

/** An agent's placements as the engine's, or a plain-words reason they can't be. */
export function parseOrders(list: unknown, s: Settings, me: Side = PERSON): Placement<AnyPiece>[] {
  if (!Array.isArray(list)) throw new SoloError('placements must be a list');
  if (list.length > 40) throw new SoloError('at most 40 placements a turn');
  return list.map((q: OrderIn, i) => {
    if (!q || typeof q !== 'object') throw new SoloError(`placements[${i}] must be an object`);
    const t = PIECE_OF[q.piece];
    if (!t) throw new SoloError(`placements[${i}].piece must be one of ${Object.keys(costsOf(s)).join(', ')}`);
    if (!Number.isInteger(q.x) || !Number.isInteger(q.y)) throw new SoloError(`placements[${i}] needs whole numbers x and y`);
    let dx = 0, dy = 0;
    if (t === 'g' || t === 'e' || t === 'w' || t === 'f') {
      const d = typeof q.dir === 'string' ? DIRS[q.dir.toUpperCase()] : undefined;
      if (!d) throw new SoloError(`placements[${i}].dir must be one of N, NE, E, SE, S, SW, W, NW`);
      [dx, dy] = d;
    }
    if (t === 'm') {
      if (q.slant !== '/' && q.slant !== '\\') throw new SoloError(`placements[${i}].slant must be "/" or "\\"`);
      dx = q.slant === '/' ? 1 : -1;
    }
    return { t, o: me, x: q.x, y: q.y, dx, dy };
  });
}

/**
 * The person's side submits orders for the open turn (replacing any earlier ones). Checked by the engine on the
 * real board: placing reads only squares within reach, all of which the side can see (the fog invariant), so a
 * refusal says nothing about the dark. With `final`, the turn resolves at once.
 */
export function submit(m: SoloMatch, o: { turn: number; placements: Placement<AnyPiece>[]; source: Source; final: boolean; note?: string; now: string; preset?: Preset; via?: 'page'; drafted_by?: Source; clock?: true }, me: Side = PERSON) {
  if (m.end) throw new SoloError('the match is over');
  if (o.turn !== m.turn) throw new SoloError(`turn ${o.turn} is not open; the open turn is ${m.turn}`);
  // A practice match: sealed orders can't be changed once final (the other side has seen the commitment).
  if (m.versus && m.pend[me]?.final) throw new SoloError('your final orders for this turn are in; waiting for the other side');
  const { s, e } = rulesOf(m);
  if (o.placements.some((p) => p.o !== me)) throw new SoloError('placements are for your own side only');
  const why = e.refuse(m.w, s, me, e.towers(m.w, me), pointsOf(m, s), o.placements);
  if (why) throw new SoloError(`not accepted: ${why}`);
  const replaced = !!m.pend[me];
  const salt = randomBytes(32).toString('hex');
  m.pend[me] = { placements: o.placements, source: o.source, ...(o.preset ? { preset: o.preset } : {}), salt, commitment: commit(o.placements, salt), final: o.final, ...(o.note ? { note: o.note } : {}), ...(o.via ? { via: o.via, drafted_by: o.drafted_by } : {}), ...(o.clock ? { clock: true as const } : {}), at: o.now };
  const spent = o.placements.reduce((t, p) => t + e.cost(s, p.t), 0);
  const out = { accepted: true, commitment: m.pend[me]!.commitment, replaced_previous: replaced, points_left: pointsOf(m, s) - spent };
  if (!o.final) return out;
  // Against the site computer the turn resolves now; between people, once both sides' final orders are in.
  if (m.versus && !(m.versus.players.A !== null && m.pend[other(me)]?.final)) return { ...out, waiting_for: 'the other side\'s final orders' };
  return { ...out, resolved: resolve(m, o.now) };
}

/**
 * The live page's Take turn (owner, 2026-11-03): the person, signed in, approves the draft their AI sent with
 * submit_orders (final: false). Recorded as the person's ("person"), taken on the page, with who drafted it.
 */
export function takeTurnOnPage(m: SoloMatch, o: { turn: number; now: string }, me: Side = PERSON) {
  if (m.end) throw new SoloError('the match is over');
  if (o.turn !== m.turn) throw new SoloError(`turn ${o.turn} is not open; the open turn is ${m.turn}`);
  const d = m.pend[me];
  if (!d) throw new SoloError('there is no draft to take: ask your AI to send this turn\'s orders with final: false first');
  if (d.final) throw new SoloError('your final orders for this turn are in; waiting for the other side');
  return submit(m, { turn: o.turn, placements: d.placements, source: 'person', final: true, note: d.note, now: o.now, via: 'page', drafted_by: d.source }, me);
}

/** The open turn's draft as the live page shows it: the pieces, their cost against the points, and lane warnings. */
export function draftInfo(m: SoloMatch, me: Side = PERSON) {
  const d = m.pend[me];
  if (!d || m.end) return null;
  const { s, e } = rulesOf(m), view = e.fog(m.w, s, me);
  const cost = d.placements.reduce((t, p) => t + e.cost(s, p.t), 0);
  return { placements: d.placements.map(orderOut), source: d.source, final: d.final, cost, points: pointsOf(m, s), warnings: laneWarnings(e, view, s, e.towers(view, me), d.placements), ...(d.note ? { note: d.note } : {}) };
}

/**
 * A turn's steps as frames (owner, 2026-11-03: "the page animates the turn's 12 steps, with frames from my side's fog
 * only"), from the engine: the board as the turn's placements appear, then after each step. While the match is on, each
 * frame is the person's side's view (engine.fog: their gliders and squares in sight, enemy pieces while in sight,
 * book-4's symbol-glider sight) and the squares it sees; once it's over, `whole` gives the whole board.
 */
export function turnFrames(m: SoloMatch, turn: number, whole = false, me: Side = PERSON) {
  if (whole && !m.end) throw new SoloError('the whole board only once the match is over');
  const { s, e } = rulesOf(m);
  const w = e.world(s), kills: Kills = { C: 0, A: 0 };
  const frame = () => {
    if (whole) return { step: w.step, board: boardOut(e, w, me, () => true), seen: null };
    const see = e.sees(w, s, me), view = e.fog(w, s, me);
    const oreSeen = (k: number) => { const [x, y] = e.XY(k); return see.has(k) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => !e.inb(x + dx, y + dy) || see.has(e.K(x + dx, y + dy))); };
    return { step: w.step, board: boardOut(e, view, me, oreSeen), seen: [...see].sort((a, b) => a - b).map((k) => e.XY(k)) };
  };
  for (const h of m.history) {
    e.apply(w, s, { C: h.C.placements, A: h.A.placements });
    const from = w.step, out = h.turn === turn ? [frame()] : null;
    let over = false;
    do { e.step(w, s, kills); out?.push(frame()); if (verdict(e, w, s, kills)) { over = true; break; } } while (w.step - from < s.every);
    if (out) return out;
    if (over) break;
  }
  return [];
}

/** The site computer plays the person's own side this turn, under the standing order's preset (the fallback). */
export function autopilot(m: SoloMatch, o: { turn: number; now: string }, me: Side = PERSON) {
  if (m.end) throw new SoloError('the match is over');
  if (o.turn !== m.turn) throw new SoloError(`turn ${o.turn} is not open; the open turn is ${m.turn}`);
  const preset = standingOf(m, me)?.preset ?? 'balanced';
  return submit(m, { turn: o.turn, placements: fallbackPlan(m, preset, me), source: 'site-computer', final: true, now: o.now, preset }, me);
}

/** Plans the site computer's orders for the open turn if they aren't yet. True if it planned them now. */
/** The quiet time T (quiet.ts): above the slowest level-3 planning time measured on Vercel, with margin. */
export const QUIET_MS = 3000;

export function planComputer(m: SoloMatch, now: string): boolean {
  if (m.end || m.pend.A || m.versus) return false; // between people there is no site computer
  m.pend.A = computerOrders(m, now);
  return true;
}

/** Both sides' orders revealed and applied together; the engine runs to the next turn to act (or the end). */
function resolve(m: SoloMatch, now: string) {
  const { s, e } = rulesOf(m);
  planComputer(m, now);
  const C = m.pend.C!, A = m.pend.A!;
  const strip = ({ final: _f, note: _n, ...x }: Orders) => x;
  m.history.push({ turn: m.turn, step: m.w.step, C: strip(C), A: strip(A) });
  e.apply(m.w, s, { C: C.placements, A: A.placements });
  e.updSeen(m.w, s, m.ls, m.kills);
  // The person's turn summary, from their side's view at each step (summary.ts).
  const watch = new TurnWatch(e, s, PERSON, m.w, m.kills, C.placements);
  // Between people, Amber gets her own summary, from her own view.
  const watchA = m.versus ? new TurnWatch(e, s, 'A', m.w, m.kills, A.placements) : null;
  const pageLine = (o: Orders) => `Your person took this turn on the live page, approving the orders ${o.drafted_by === 'agent' ? 'you (their AI) drafted' : 'drafted before'}.`;
  const clockLine = 'The turn\'s clock ran out, so the site computer played it for your side under your standing order.';
  if (C.via === 'page') watch.say(pageLine(C));
  if (C.clock) watch.say(clockLine);
  if (watchA && A.via === 'page') watchA.say(pageLine(A));
  if (watchA && A.clock) watchA.say(clockLine);
  const from = m.w.step, turn = m.turn;
  const note = () => { m.summary = { turn, from, lines: watch.done() }; if (watchA) m.versus!.summaryA = { turn, from, lines: watchA.done() }; };
  do {
    e.step(m.w, s, m.kills);
    e.updSeen(m.w, s, m.ls, m.kills);
    watch.look(m.w);
    watchA?.look(m.w);
    const v = verdict(e, m.w, s, m.kills);
    if (v) {
      note();
      m.end = { win: v, how: e.towers(m.w, 'C').length && e.towers(m.w, 'A').length ? 'time' : 'towers', step: m.w.step };
      m.pend = { C: null, A: m.versus ? null : m.pend.A };
      if (m.versus) m.versus.deadline = null;
      return { over: true, end: m.end };
    }
  } while (m.w.step - from < s.every);
  note();
  m.turn++;
  m.pend = { C: null, A: null };
  m.openedAt = Date.parse(now) || 0;
  if (m.versus) m.versus.deadline = m.openedAt + m.versus.clockSec * 1000;
  return { over: false, turn: m.turn, step: m.w.step };
}

export function setStanding(m: SoloMatch, text: unknown, preset: unknown, me: Side = PERSON) {
  if (m.end) throw new SoloError('the match is over');
  if (typeof text !== 'string' || !text.trim() || text.length > 500) throw new SoloError('text must be 1 to 500 characters');
  if (!PRESETS.includes(preset as Preset)) throw new SoloError(`preset must be one of ${PRESETS.join(', ')}`);
  const st = { text: text.trim(), preset: preset as Preset };
  if (me === 'A') m.versus!.standingA = st; else m.standing = st;
  return { ok: true, preset };
}

export function resign(m: SoloMatch, me: Side = PERSON) {
  if (m.end) throw new SoloError('the match is over');
  m.end = { win: other(me), how: 'resigned', step: m.w.step };
  m.pend = { C: null, A: m.versus ? null : m.pend.A };
  if (m.versus) m.versus.deadline = null;
  return { ok: true, over: true };
}

/** The whole record, for anyone, once the match is over: every turn's orders, sources, commitments and salts. */
export function recordOf(m: SoloMatch) {
  if (!m.end) throw new SoloError('no finished match with that id');
  const { s, e, rule } = rulesOf(m);
  return {
    match_id: m.id, ruleset: m.ruleset, seed: m.seed, computer_random: m.cpu, computer_random_commitment: m.cpuCommit, rule, level: m.level, created_at: m.createdAt,
    // Nothing that leads back to the person (owner, 2026-10-31): no Farcaster name or ID, and no agent name, since the
    // site shows agents elsewhere as "<name>, agent of @person". The model, as the agent declared it.
    sides: m.versus
      ? {
          // Two people. Each side's model as its agent declared it; a name only where that player chose to show it.
          C: { kind: 'person', ...(m.versus.showNames.C ? { name: m.versus.names.C } : {}), model: m.agent.model ? { ...m.agent.model, label: 'self-reported' } : null },
          A: { kind: 'person', ...(m.versus.showNames.A && m.versus.names.A ? { name: m.versus.names.A } : {}), model: m.versus.agentA?.model ? { ...m.versus.agentA.model, label: 'self-reported' } : null },
        }
      : { C: { kind: 'person', model: m.agent.model ? { ...m.agent.model, label: 'self-reported' } : null }, A: { kind: 'site computer', level: m.level } },
    ...(m.versus ? { practice: 'a practice match between people: never counted toward any ranking', clock_seconds: m.versus.clockSec } : {}),
    turns: m.history.map((h) => ({ turn: h.turn, step: h.step, C: { ...h.C, placements: h.C.placements.map(orderOut) }, A: { ...h.A, placements: h.A.placements.map(orderOut) } })),
    end: m.end,
    final_position: boardOut(e, m.w, PERSON, () => true),
    settings: s,
  };
}

/** Replays a record from its seed and orders; returns the final board (for checking a record). */
export function replay(m: Pick<SoloMatch, 'ruleset' | 'seed' | 'history' | 'end'>): World {
  const { s, e } = rulesOf(m);
  const w = e.world(s), kills: Kills = { C: 0, A: 0 };
  for (const h of m.history) {
    if (w.step !== h.step) throw new SoloError(`turn ${h.turn} at step ${h.step}, but the replay is at ${w.step}`);
    e.apply(w, s, { C: h.C.placements, A: h.A.placements });
    const from = w.step;
    do { e.step(w, s, kills); if (verdict(e, w, s, kills)) return w; } while (w.step - from < s.every);
  }
  return w;
}

/**
 * Checks a finished match the way a replay or the onchain verifier would: the revealed value matches its commitment,
 * and from the seed, that value and the revealed orders, every move the site computer made (for its own side, and for
 * the person's side when asked to) comes out the same. Returns the problems found; empty when all agree.
 */
export function checkComputer(r: Pick<SoloMatch, 'ruleset' | 'seed' | 'level' | 'cpu' | 'cpuCommit' | 'history' | 'versus'>): string[] {
  const out: string[] = [];
  if (sha256(r.cpu) !== r.cpuCommit) out.push('the revealed computer value does not match its commitment');
  const { s, e } = rulesOf(r);
  const st: PlanState = { ruleset: r.ruleset, seed: r.seed, level: r.level, cpu: r.cpu, w: e.world(s), ls: { C: {}, A: {} }, turn: 0 };
  e.L.towers.A.forEach((k) => (st.ls.C[k] = 0));
  e.L.towers.C.forEach((k) => (st.ls.A[k] = 0));
  const kills: Kills = { C: 0, A: 0, ...(s.killReports ? { log: [] } : {}) };
  for (const h of r.history) {
    st.turn = h.turn;
    // Between people there is no site computer side; it only plays a side whose clock ran out (or that asked).
    if (!r.versus && ordersText(computerPlan(st)) !== ordersText(h.A.placements)) out.push(`turn ${h.turn}: the computer's orders don't follow from the record`);
    for (const me of r.versus ? (['C', 'A'] as const) : (['C'] as const)) {
      if (h[me].source === 'site-computer' && ordersText(fallbackPlan(st, h[me].preset ?? 'balanced', me)) !== ordersText(h[me].placements)) out.push(`turn ${h.turn}: the site computer's orders for ${me === 'C' ? 'Cyan' : 'Amber'} don't follow from the record`);
    }
    e.apply(st.w, s, { C: h.C.placements, A: h.A.placements });
    e.updSeen(st.w, s, st.ls, kills);
    const from = st.w.step;
    do { e.step(st.w, s, kills); e.updSeen(st.w, s, st.ls, kills); if (verdict(e, st.w, s, kills)) return out; } while (st.w.step - from < s.every);
  }
  return out;
}

// ---------- the sandbox ----------

/**
 * "What happens if I do X, and the enemy is where I think it is?" (section 8). Built only from the side's view
 * and the agent's own belief, never from the real board. A belief piece may only go where the side can't see
 * (where it can see, it already knows); scenario orders are checked on that imagined board.
 */
export function simulate(m: SoloMatch, args: { belief?: Belief; scenarios: { name: string; placements: unknown }[]; steps?: number }, me: Side = PERSON) {
  const { s, e } = rulesOf(m);
  const them = other(me);
  const view = e.fog(m.w, s, me), see = e.sees(view, s, me);
  const board = e.clone(view);
  const b = args.belief ?? {};
  const put = (x: unknown, y: unknown, what: string) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !e.inb(x as number, y as number)) throw new SoloError(`belief: ${what} at ${x},${y} is off the board`);
    const k = e.K(x as number, y as number);
    if (see.has(k)) throw new SoloError(`belief: you can see ${x},${y}; a belief is only for squares you can't see`);
    if (!e.empty(board, k)) throw new SoloError(`belief: ${x},${y} already holds a piece in your belief`);
    return k;
  };
  if (!Array.isArray(b.towers ?? []) || !Array.isArray(b.squares ?? []) || !Array.isArray(b.gliders ?? [])) throw new SoloError('belief: towers, squares and gliders must be lists');
  if ((b.towers?.length ?? 0) + (b.squares?.length ?? 0) + (b.gliders?.length ?? 0) > 60) throw new SoloError('belief: at most 60 pieces');
  for (const t of b.towers ?? []) board.tw[put(t.x, t.y, 'a tower')] = them;
  for (const q of b.squares ?? []) board.sq[put(q.x, q.y, 'a square')] = { o: them, hp: q.hits_left === 1 ? 1 : s.squareHits };
  for (const g of b.gliders ?? []) {
    const d = typeof g.dir === 'string' ? DIRS[g.dir.toUpperCase()] : undefined;
    if (!d) throw new SoloError('belief: a glider needs dir N, NE, E, SE, S, SW, W or NW');
    put(g.x, g.y, 'a glider');
    board.gl.push({ id: board.nid++, o: them, x: g.x, y: g.y, dx: d[0], dy: d[1] });
  }
  if (!Array.isArray(args.scenarios) || args.scenarios.length < 1 || args.scenarios.length > 6) throw new SoloError('scenarios: 1 to 6');
  const remaining = s.maxSteps - board.step;
  const n = args.steps === undefined ? Math.min(s.every, remaining) : args.steps;
  if (!Number.isInteger(n) || n < 1 || n > Math.min(remaining, 96)) throw new SoloError(`steps must be 1 to ${Math.min(remaining, 96)}`);
  const snap = e.towers(board, me), pts = pointsOf(m, s);
  // My symbols formed last turn, still waiting to be walled in (decided when this turn's placements appear).
  const waiting = Object.keys(board.fs ?? {}).map(Number).filter((k) => board.fs![k].o === me && board.tw[k] === me);
  return {
    based_on: `your view at step ${board.step}, and your belief`,
    scenarios: args.scenarios.map((sc) => {
      const name = typeof sc?.name === 'string' ? sc.name.slice(0, 60) : '';
      let ps: Placement<AnyPiece>[];
      try { ps = parseOrders(sc?.placements, s, me); } catch (err) { return { name, legal: false, why_not: (err as Error).message }; }
      const why = e.refuse(board, s, me, snap, pts, ps);
      if (why) return { name, legal: false, why_not: why };
      const w = e.clone(board);
      const mine0 = e.towers(w, me), theirs0 = e.towers(w, them);
      e.apply(w, s, { C: ps, A: [] });
      const walled = waiting.map((k) => ({ x: e.XY(k)[0], y: e.XY(k)[1], stays: w.tw[k] === me }));
      for (let i = 0; i < n && w.step < s.maxSteps; i++) e.step(w, s);
      const lost = (ks: number[], o: Side) => ks.filter((k) => w.tw[k] !== o).map((k) => ({ x: e.XY(k)[0], y: e.XY(k)[1] }));
      // apply() cleared last turn's symbols, so every symbol marked now formed during these steps.
      const formed = Object.keys(w.fs ?? {}).map(Number).filter((k) => w.fs![k].o === me).sort((a, b) => a - b);
      // Lane warnings from the side's view alone (not the belief: launch cells are all in sight anyway).
      const warnings = laneWarnings(e, view, s, e.towers(view, me), ps);
      return {
        name, legal: true, cost: ps.reduce((t, p) => t + e.cost(s, p.t), 0),
        ...(warnings.length ? { warnings } : {}),
        ...(s.costSeed ? {
          symbols: formed.map((k) => ({ x: e.XY(k)[0], y: e.XY(k)[1], step: w.fs![k].at + 1, formed: true, standing_at_end: w.tw[k] === me })),
          symbol_gliders_resting: Object.keys(w.sd ?? {}).map(Number).filter((k) => w.sd![k] === me).sort((a, b) => a - b).map((k) => ({ x: e.XY(k)[0], y: e.XY(k)[1] })),
          ...(walled.length ? { last_turns_symbols: walled } : {}),
        } : {}),
        result: {
          step: w.step,
          my_towers: { now: e.towers(w, me).length, lost: lost(mine0, me) },
          their_towers_in_your_belief: { now: e.towers(w, them).length, lost: lost(theirs0, them) },
          board_end: boardOut(e, w, me, () => true),
        },
      };
    }),
  };
}
export interface Belief { towers?: { x: number; y: number }[]; squares?: { x: number; y: number; hits_left?: number }[]; gliders?: { x: number; y: number; dir: string }[] }


/**
 * Three symbol-glider launches that converge on a target square (owner, 2026-11-02: "a helper that returns three
 * converging launches for a target square"). From the side's view only, with no guesses about the dark: each option
 * is checked by flying its three launches together in the engine (help.ts converging). Stores nothing.
 */
export function symbolLaunches(m: SoloMatch, args: { x: unknown; y: unknown }, me: Side = PERSON) {
  if (m.end) throw new SoloError('the match is over');
  if (!Number.isInteger(args.x) || !Number.isInteger(args.y)) throw new SoloError('x and y must be whole numbers');
  const { s, e } = rulesOf(m);
  const view = e.fog(m.w, s, me), x = args.x as number, y = args.y as number;
  const pts = pointsOf(m, s), cost = 3 * (s.costSeed ?? 0);
  const r = converging(e, e.clone(view), s, me, e.towers(view, me), pts, x, y);
  return {
    target: { x, y },
    based_on: `your view at step ${view.step}, with nothing assumed about what you can't see (an enemy glider or piece in the dark can still stop them)`,
    ...(s.costSeed ? { cost, points: pts, affordable: r.affordable, ...(r.affordable ? {} : { cant_afford: `three symbol gliders cost ${cost}; you have ${pts} points this turn` }) } : {}),
    options: r.options.map((o) => ({ launches: o.launches, rest_at: o.rests, symbol_forms: { ...o.symbol, before_next_turn: o.symbol.step <= view.step + s.every } })),
    ...(r.why_none ? { why_none: r.why_none } : {}),
    ...(r.options.length ? { then: 'List the three launches in the order given (gliders move in the order they were placed; the order was part of the check). The symbol is a tower from the step it forms. It stays past your next turn to act only if every square a glider could reach it from is solid or off the board when that turn\'s placements appear: wall it in then.' } : {}),
  };
}
