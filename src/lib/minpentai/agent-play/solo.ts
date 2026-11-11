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
import { emptyOwnSeen, outOfSight, updOwnSeen, withOwnSeen, type OwnSeen } from '../versions/own-seen';
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
 * A computer revised within a ruleset (owner, 2026-11-04, after the book-4 playtest: "make the computer play properly at
 * every level"): a new match records the revision it is played against (SoloMatch.computer), and a match without one,
 * every match started before, keeps replaying with the ruleset's first computer (COMPUTERS). Revision 2 guards its
 * towers (search.ts Computer.guard): squares in the lanes a glider could come down, at setup and for every new tower,
 * and no tower where a single enemy glider would destroy it at once; and each turn it tries an attack line at one enemy
 * tower it sees or last saw (tuned 2026-11-04: "a computer that only defends is the passive opponent from my first playtest").
 */
export const REVISIONS: Partial<Record<RulesetName, { computer: number; book?: BookPlay; comp?: Computer }>> = {
  'book-4': { computer: 2, comp: { formingSymbols: true, seedScore: 0, spendTies: true, guard: true } },
};
/** How the site computer plays a match: its ruleset's computer, or the revision the match was started with. */
export const computerOf = (m: Pick<SoloMatch, 'ruleset' | 'computer'>): { book?: BookPlay; comp?: Computer } => {
  const r = REVISIONS[m.ruleset];
  if (m.computer === undefined) return COMPUTERS[m.ruleset];
  if (!r || r.computer !== m.computer) throw new SoloError(`no computer revision ${m.computer} for ${m.ruleset}`);
  return { book: r.book, comp: r.comp };
};
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
}
export interface RevealedTurn { turn: number; step: number; C: Omit<Orders, 'final' | 'note'>; A: Omit<Orders, 'final' | 'note'> }

export interface SoloMatch {
  v: 1;
  id: string;
  ruleset: RulesetName;
  level: number;
  /** The computer's revision within the ruleset (REVISIONS), when the match was started with one; absent: COMPUTERS. */
  computer?: number;
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
  /**
   * Each side's own pieces as it last saw them (versions/own-seen.ts; owner, 2026-11-04), updated like `ls`. Matches from
   * before it rebuild it from their record (ownOf).
   */
  own?: Record<Side, OwnSeen>;
  /** 1: the site computer plans with that memory (matches started from 2026-11-04; older records replay without it). */
  remember?: 1;
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
}

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
const turnRng = (m: Pick<SoloMatch, 'seed' | 'turn' | 'cpu'>, who: 1 | 2) => rng(((m.seed * 7919 + m.turn * 31 + who) ^ cpuWord(m.cpu)) >>> 0);
type PlanState = Pick<SoloMatch, 'ruleset' | 'computer' | 'seed' | 'level' | 'cpu' | 'w' | 'ls' | 'turn' | 'own' | 'remember'>;
/** Side o's memory of its own pieces out of sight, for the computer, when the match's computer plans with it. */
const memoryFor = (m: PlanState, o: Side) => (m.remember && m.own ? JSON.parse(JSON.stringify(m.own[o])) as OwnSeen : undefined);
/** What the site computer plays for its own side from this state (its own view only). */
function computerPlan(m: PlanState) {
  const { s, e } = rulesOf(m);
  const o = COMPUTER;
  return searchPlan({ e, s, o, view: e.fog(m.w, s, o), lastSeen: { ...m.ls[o] }, ownSeen: memoryFor(m, o), snap: e.towers(m.w, o), points: pointsOf(m, s), rng: turnRng(m, 1), level: m.level, ...computerOf(m) }).placements;
}
/** What the site computer plays for the person's side when asked to (the fallback, under a preset). */
function fallbackPlan(m: PlanState, preset: Preset) {
  const { s, e } = rulesOf(m);
  return searchPlan({ e, s, o: PERSON, view: e.fog(m.w, s, PERSON), lastSeen: { ...m.ls[PERSON] }, ownSeen: memoryFor(m, PERSON), snap: e.towers(m.w, PERSON), points: pointsOf(m, s), rng: turnRng(m, 2), level: FALLBACK_LEVEL, preset, ...computerOf(m) }).placements;
}

/** Both sides' memory of their own pieces, after the board changed (placements appearing, or a step). */
const updOwn = (e: Engine, w: World, s: Settings, own: Record<Side, OwnSeen>) => { updOwnSeen(e, w, s, 'C', own.C); updOwnSeen(e, w, s, 'A', own.A); };
/**
 * A match's memory of own pieces (SoloMatch.own): stored, or, for a match from before it was kept, rebuilt from its
 * record the same way (every frame since setup).
 */
export function ownOf(m: Pick<SoloMatch, 'ruleset' | 'seed' | 'history' | 'own'>): Record<Side, OwnSeen> {
  if (m.own) return m.own;
  const { s, e } = rulesOf(m);
  const w = e.world(s), kills: Kills = { C: 0, A: 0 }, own = { C: emptyOwnSeen(), A: emptyOwnSeen() };
  for (const h of m.history) {
    e.apply(w, s, { C: h.C.placements, A: h.A.placements });
    updOwn(e, w, s, own);
    const from = w.step;
    do { e.step(w, s, kills); updOwn(e, w, s, own); if (verdict(e, w, s, kills)) return own; } while (w.step - from < s.every);
  }
  return own;
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
    v: 1, id: o.id, ruleset: o.ruleset, level: o.level, ...(REVISIONS[o.ruleset] ? { computer: REVISIONS[o.ruleset]!.computer } : {}), seed: o.seed, person: o.person, agent: o.agent,
    linkHash: sha256(linkSecret), cpu, cpuCommit: sha256(cpu), createdAt: o.now, w, kills: { C: 0, A: 0, ...(s.killReports ? { log: [] } : {}) }, ls, own: { C: emptyOwnSeen(), A: emptyOwnSeen() }, remember: 1, turn: 0,
    pend: { C: null, A: null }, openedAt: Date.parse(o.now) || 0, standing: null, history: [], end: null,
  };
  return { m, linkSecret };
}

export class SoloError extends Error {}

/** Whether a live link's secret opens this match (constant time). */
export function linkOpens(m: SoloMatch, secret: string): boolean {
  if (typeof secret !== 'string' || secret.length < 16 || secret.length > 64) return false;
  const a = Buffer.from(sha256(secret), 'hex'), b = Buffer.from(m.linkHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
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
export function viewFor(m: SoloMatch) {
  const { s, e, rule } = rulesOf(m);
  const me = PERSON, view = e.fog(m.w, s, me), see = e.sees(m.w, s, me);
  // Ore only where the rock and every square beside it are in sight (as fog() keeps it).
  const oreSeen = (k: number) => { const [x, y] = e.XY(k); return see.has(k) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => !e.inb(x + dx, y + dy) || see.has(e.K(x + dx, y + dy))); };
  const can = canPlaceKeys(m);
  const over = !!m.end;
  const lastSeen = Object.entries(m.ls[me]).filter(([k]) => !view.tw[+k]).map(([k, step]) => ({ x: e.XY(+k)[0], y: e.XY(+k)[1], step }));
  const mineOut = outOfSight(e, m.w, s, me, ownOf(m)[me]);
  // The enemy's possible placement area (owner, 2026-11-04: fix 6): within its reach of every enemy tower this side
  // sees or last saw, less squares it sees taken. Only the towers it knows of: one it never saw adds more.
  const theirTowers = [...e.towers(view, other(me)), ...lastSeen.map((t) => e.K(t.x, t.y))];
  const enemyArea = [...e.lit(view, other(me), s.reach, theirTowers)].filter((k) => !see.has(k) || e.empty(view, k));
  return {
    match_id: m.id,
    side: 'Cyan',
    opponent: { kind: 'site computer', level: m.level, random_commitment: m.cpuCommit },
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
    ...(s.killReports ? { towers_destroyed: { by_you: m.kills.C, by_opponent: m.kills.A }, your_kills: (m.kills.log ?? []).filter((x) => x.o === me).map((x) => ({ x: e.XY(x.k)[0], y: e.XY(x.k)[1], step: x.step })) } : {}),
    ...(s.gliderSight || s.symbolGliderSight ? { glider_sight: { plain: s.gliderSight ?? 0, symbol: s.symbolGliderSight ?? 0 } } : {}),
    // book-3's limits, said only where a ruleset sets them (book-1 and book-2 views are unchanged).
    ...(s.maxTowers ? { towers_at_most: s.maxTowers, ...(s.symbolsCapped ? { symbols_count_toward_the_cap: true } : {}) } : {}),
    ...(s.maxSymbolTowers ? { symbol_towers_at_most: s.maxSymbolTowers, symbol_towers_now: e.symbolTowers(m.w, me) } : {}),
    ...(s.factoryEvery ? { factories_fire_every_steps: s.factoryEvery } : {}),
    ...(s.tieBreak ? { tie_break: 'at the last step with towers level, the side that destroyed more enemy towers wins' } : {}),
    board: boardOut(e, view, me, oreSeen),
    // The board as text (owner, 2026-11-04: fix 9): one character a square, row y = 0 first.
    grid: { rows: gridRows(e, view, see, me, lastSeen, mineOut), legend: GRID_LEGEND },
    // The squares this side sees now, as rows (fix 4): a belief in simulate may go anywhere else.
    in_sight: rowRanges(e, see),
    last_seen_enemy_towers: lastSeen,
    // Its own pieces it can't see now, as it last saw them (fix 2): never their state now.
    my_pieces_out_of_sight: piecesOut(e, mineOut),
    enemy_can_place_from_last_seen: { squares: rowRanges(e, enemyArea), how: `the squares within ${s.reach} (the ${2 * s.reach + 1} x ${2 * s.reach + 1} box) of every enemy tower you see or last saw, less squares you see taken: where the enemy could place next turn if those towers still stand. A tower you never saw adds more.` },
    can_place: rowRanges(e, can),
    my_orders: m.pend.C ? { placements: m.pend.C.placements.map(orderOut), source: m.pend.C.source, final: m.pend.C.final, commitment: m.pend.C.commitment, ...(m.pend.C.note ? { note: m.pend.C.note } : {}) } : null,
    standing_order: m.standing,
    my_turns: m.history.map((h) => ({ turn: h.turn, step: h.step, placements: h.C.placements.map(orderOut), source: h.C.source, ...(h.C.preset ? { preset: h.C.preset } : {}), ...(h.C.via === 'page' ? { taken_on_the_live_page: true, drafted_by: h.C.drafted_by } : {}) })),
    end: m.end,
    // Agent help (2026-11-02), kept in their own fields: the rules for this ruleset, and the person's page.
    ...rulesFor(m),
    // What the person's side saw happen in the last turn's steps, in words (summary.ts); empty before the first.
    last_turn_summary: m.summary ? { turn: m.summary.turn, from_step: m.summary.from, lines: m.summary.lines } : null,
  };
}

/** The empty squares the person's side may place on now, within reach of the towers it holds. */
function canPlaceKeys(m: SoloMatch): number[] {
  const { s, e } = rulesOf(m);
  return [...e.lit(m.w, PERSON, s.reach, e.towers(m.w, PERSON))].filter((k) => e.empty(m.w, k)).sort((a, b) => a - b);
}
/** can_place as [x, y] pairs (the live page's board marks them). */
export const canPlaceList = (m: SoloMatch): [number, number][] => { const { e } = rulesOf(m); return canPlaceKeys(m).map((k) => e.XY(k)); };

/**
 * Squares as compact rows (owner, 2026-11-04: fix 9), one string a row, top first: "y=3: x=0-4, 6" is (0,3) to (4,3)
 * and (6,3).
 */
export function rowRanges(e: Engine, ks: Iterable<number>): string[] {
  const rows = new Map<number, number[]>();
  for (const k of ks) { const [x, y] = e.XY(k); rows.set(y, [...(rows.get(y) ?? []), x]); }
  return [...rows.keys()].sort((a, b) => a - b).map((y) => {
    const xs = rows.get(y)!.sort((a, b) => a - b), parts: string[] = [];
    let a = xs[0], b = xs[0];
    for (const x of [...xs.slice(1), Infinity]) { if (x === b + 1) { b = x; continue; } parts.push(a === b ? `${a}` : `${a}-${b}`); a = b = x; }
    return `y=${y}: x=${parts.join(', ')}`;
  });
}
/** rowRanges back to [x, y] pairs. */
export const fromRows = (rows: string[]): [number, number][] => rows.flatMap((r) => {
  const [, y, xs] = r.match(/^y=(\d+): x=(.*)$/)!;
  return xs.split(', ').flatMap((p) => { const [a, b = a] = p.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => [a + i, +y] as [number, number]); });
});

export const GRID_LEGEND = 'One character a square, row y = 0 first, x = 0 at the left. "." empty and in sight; ":" out of sight (as far as you know empty); "#" rock. Yours in capitals, the enemy\'s in small letters: T/t tower, S/s square, G/g glider, E/e symbol glider in flight, R/r resting symbol glider, F/f factory, W/w moving wall square; "/" and "\\" mirrors (either side\'s: see board.mirrors). Out of sight (see in_sight), a letter is where you last saw the piece: "t" an enemy tower in last_seen_enemy_towers, a capital a piece of yours in my_pieces_out_of_sight.';
/** The view as text rows (GRID_LEGEND). */
function gridRows(e: Engine, v: World, see: Set<number>, me: Side, lastSeen: { x: number; y: number }[], mine: OwnSeen): string[] {
  const g: string[][] = Array.from({ length: e.H }, (_, y) => Array.from({ length: e.W }, (_, x) => (see.has(e.K(x, y)) ? '.' : ':')));
  const put = (k: number, c: string, o: Side) => { const [x, y] = e.XY(k); g[y][x] = o === me ? c.toUpperCase() : c; };
  for (const k in v.rock) { const [x, y] = e.XY(+k); g[y][x] = '#'; }
  for (const t of lastSeen) g[t.y][t.x] = 't';
  for (const k in mine.sq) put(+k, 's', me);
  for (const k in mine.mir) { const [x, y] = e.XY(+k); g[y][x] = mine.mir[+k].d > 0 ? '/' : '\\'; }
  for (const k in mine.fa) put(+k, 'f', me);
  for (const k in mine.sd) put(+k, 'r', me);
  for (const k in v.tw) put(+k, 't', v.tw[k]);
  for (const k in v.sq) put(+k, 's', v.sq[k].o);
  for (const k in v.mir ?? {}) { const [x, y] = e.XY(+k); g[y][x] = v.mir![k].d > 0 ? '/' : '\\'; }
  for (const k in v.fa ?? {}) put(+k, 'f', v.fa![k].o);
  for (const k in v.sd ?? {}) put(+k, 'r', v.sd![k]);
  for (const m of v.mw ?? []) e.wallCells(m).forEach(([x, y], i) => { if (m.c[i] && e.inb(x, y)) put(e.K(x, y), 'w', m.o); });
  for (const x of v.gl) put(e.K(x.x, x.y), x.seed ? 'e' : 'g', x.o);
  return g.map((r) => r.join(''));
}
/** Its own pieces out of sight (own-seen.ts outOfSight), as the view lists them. */
function piecesOut(e: Engine, mem: OwnSeen) {
  const xy = (k: number | string) => ({ x: e.XY(+k)[0], y: e.XY(+k)[1] });
  return [
    ...Object.entries(mem.sq).map(([k, q]) => ({ piece: 'square', ...xy(k), hits_left: q.hp, last_seen_step: q.step })),
    ...Object.entries(mem.mir).map(([k, q]) => ({ piece: 'mirror', ...xy(k), slant: q.d > 0 ? '/' : '\\', hits_left: q.hp, last_seen_step: q.step })),
    ...Object.entries(mem.fa).map(([k, q]) => ({ piece: 'factory', ...xy(k), dir: dirName(q.dx, q.dy), hits_left: q.hp, last_seen_step: q.step })),
    ...Object.entries(mem.sd).map(([k, q]) => ({ piece: 'resting_symbol_glider', ...xy(k), last_seen_step: q.step })),
    ...Object.values(mem.gl).map((g) => ({ piece: g.seed ? 'symbol_glider' : 'glider', x: g.x, y: g.y, dir: dirName(g.dx, g.dy), last_seen_step: g.step, flying: true })),
    ...Object.values(mem.mw).map((m) => ({ piece: 'moving_wall', dir: dirName(m.dx, m.dy), squares: e.wallCells(m).filter((_, i) => m.c[i]).map(([x, y]) => ({ x, y })), last_seen_step: m.step })),
  ];
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
export function parseOrders(list: unknown, s: Settings): Placement<AnyPiece>[] {
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
    return { t, o: PERSON, x: q.x, y: q.y, dx, dy };
  });
}

/**
 * The person's side submits orders for the open turn (replacing any earlier ones). Checked by the engine on the
 * real board: placing reads only squares within reach, all of which the side can see (the fog invariant), so a
 * refusal says nothing about the dark. With `final`, the turn resolves at once.
 */
export function submit(m: SoloMatch, o: { turn: number; placements: Placement<AnyPiece>[]; source: Source; final: boolean; note?: string; now: string; preset?: Preset; via?: 'page'; drafted_by?: Source; keepSalt?: string }) {
  if (m.end) throw new SoloError('the match is over');
  if (o.turn !== m.turn) throw new SoloError(`turn ${o.turn} is not open; the open turn is ${m.turn}`);
  const { s, e } = rulesOf(m);
  const why = e.refuse(m.w, s, PERSON, e.towers(m.w, PERSON), pointsOf(m, s), o.placements);
  if (why) throw new SoloError(`not accepted: ${why}`);
  const replaced = !!m.pend.C;
  // Take turn keeps the draft's salt, so its commitment stays the one the AI was given (owner, 2026-11-04: fix 11).
  const salt = o.keepSalt ?? randomBytes(32).toString('hex');
  m.pend.C = { placements: o.placements, source: o.source, ...(o.preset ? { preset: o.preset } : {}), salt, commitment: commit(o.placements, salt), final: o.final, ...(o.note ? { note: o.note } : {}), ...(o.via ? { via: o.via, drafted_by: o.drafted_by } : {}), at: o.now };
  const spent = o.placements.reduce((t, p) => t + e.cost(s, p.t), 0);
  const out = { accepted: true, commitment: m.pend.C.commitment, replaced_previous: replaced, points_left: pointsOf(m, s) - spent };
  if (o.final) return { ...out, resolved: resolve(m, o.now) };
  return out;
}

/**
 * The live page's Take turn (owner, 2026-11-03): the person, signed in, approves the draft their AI sent with
 * submit_orders (final: false). Recorded as the person's ("person"), taken on the page, with who drafted it.
 */
export function takeTurnOnPage(m: SoloMatch, o: { turn: number; now: string }) {
  if (m.end) throw new SoloError('the match is over');
  if (o.turn !== m.turn) throw new SoloError(`turn ${o.turn} is not open; the open turn is ${m.turn}`);
  const d = m.pend.C;
  if (!d) throw new SoloError('there is no draft to take: ask your AI to send this turn\'s orders with final: false first');
  return submit(m, { turn: o.turn, placements: d.placements, source: 'person', final: true, note: d.note, now: o.now, via: 'page', drafted_by: d.source, keepSalt: d.salt });
}

/** The open turn's draft as the live page shows it: the pieces, their cost against the points, and lane warnings. */
export function draftInfo(m: SoloMatch) {
  const d = m.pend.C;
  if (!d || m.end) return null;
  const { s, e } = rulesOf(m), view = e.fog(m.w, s, PERSON);
  const cost = d.placements.reduce((t, p) => t + e.cost(s, p.t), 0);
  return { placements: d.placements.map(orderOut), source: d.source, final: d.final, cost, points: pointsOf(m, s), warnings: laneWarnings(e, view, s, e.towers(view, PERSON), d.placements), ...(d.note ? { note: d.note } : {}) };
}

/**
 * A turn's steps as frames (owner, 2026-11-03: "the page animates the turn's 12 steps, with frames from my side's fog
 * only"), from the engine: the board as the turn's placements appear, then after each step. While the match is on, each
 * frame is the person's side's view (engine.fog: their gliders and squares in sight, enemy pieces while in sight,
 * book-4's symbol-glider sight) and the squares it sees; once it's over, `whole` gives the whole board.
 */
export function turnFrames(m: SoloMatch, turn: number, whole = false) {
  if (whole && !m.end) throw new SoloError('the whole board only once the match is over');
  const { s, e } = rulesOf(m);
  const w = e.world(s), kills: Kills = { C: 0, A: 0 };
  const frame = () => {
    if (whole) return { step: w.step, board: boardOut(e, w, PERSON, () => true), seen: null };
    const see = e.sees(w, s, PERSON), view = e.fog(w, s, PERSON);
    const oreSeen = (k: number) => { const [x, y] = e.XY(k); return see.has(k) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => !e.inb(x + dx, y + dy) || see.has(e.K(x + dx, y + dy))); };
    return { step: w.step, board: boardOut(e, view, PERSON, oreSeen), seen: [...see].sort((a, b) => a - b).map((k) => e.XY(k)) };
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

/**
 * How a finished match ended, in words for the person's live page (owner, 2026-11-04: fix 3): who won and why, e.g. "you
 * won on towers, 5 to 1, at step 144" or "you won at step 126: every enemy tower destroyed". Only once it's over (the
 * tower counts are then the record's).
 */
export function endText(m: SoloMatch): string | null {
  if (!m.end) return null;
  const { s, e } = rulesOf(m), { win, how, step } = m.end;
  const mine = e.towers(m.w, PERSON).length, theirs = e.towers(m.w, COMPUTER).length;
  const who = win === PERSON ? 'you won' : win === COMPUTER ? 'the site computer won' : 'a draw';
  if (how === 'resigned') return `you resigned at step ${step}`;
  if (s.win === 'first-blood') return `${who} at step ${step}: the first tower destroyed decides (towers destroyed ${m.kills.C} to ${m.kills.A})`;
  if (!mine && !theirs) return `a draw at step ${step}: both sides' last towers fell at once`;
  if (!theirs) return `you won at step ${step}: every enemy tower destroyed`;
  if (!mine) return `the site computer won at step ${step}: every tower of yours destroyed`;
  // The winner's count first: "you won on towers, 5 to 1", "the site computer won on towers, 4 to 2".
  if (mine !== theirs) return `${who} on towers, ${Math.max(mine, theirs)} to ${Math.min(mine, theirs)}, at step ${step}`;
  return s.tieBreak && m.kills.C !== m.kills.A ? `${who} at step ${step}: towers level ${mine} to ${theirs}, so towers destroyed decide, ${m.kills.C} to ${m.kills.A}` : `a draw at step ${step}: towers level, ${mine} to ${theirs}`;
}

/**
 * While the match goes on (fix 3): where the enemy's towers are as far as the person's side knows, the ones it sees and
 * those it last saw. The match going on says they have at least one.
 */
export function stillStanding(m: SoloMatch): string | null {
  if (m.end) return null;
  const { s, e } = rulesOf(m), view = e.fog(m.w, s, PERSON);
  const seen = e.towers(view, COMPUTER), last = Object.keys(m.ls[PERSON]).map(Number).filter((k) => !view.tw[k]);
  const at = (ks: number[]) => ks.slice(0, 4).map((k) => `(${e.XY(k)[0]}, ${e.XY(k)[1]})`).join(', ') + (ks.length > 4 ? ` and ${ks.length - 4} more` : '');
  if (!seen.length && !last.length) return 'They still have towers, somewhere out of your sight.';
  return `They still have towers: ${[seen.length ? `in sight at ${at(seen)}` : '', last.length ? `last seen at ${at(last)}` : ''].filter(Boolean).join('; ')}.`;
}

/** The squares the person's side sees now, as a replay frame gives them (the 3D view's cloud covers the rest). */
export function sightOf(m: SoloMatch): [number, number][] {
  const { s, e } = rulesOf(m);
  return [...e.sees(m.w, s, PERSON)].sort((a, b) => a - b).map((k) => e.XY(k));
}

/** The site computer plays the person's own side this turn, under the standing order's preset (the fallback). */
export function autopilot(m: SoloMatch, o: { turn: number; now: string }) {
  if (m.end) throw new SoloError('the match is over');
  if (o.turn !== m.turn) throw new SoloError(`turn ${o.turn} is not open; the open turn is ${m.turn}`);
  const { s, e } = rulesOf(m);
  const preset = m.standing?.preset ?? 'balanced';
  return submit(m, { turn: o.turn, placements: fallbackPlan(m, preset), source: 'site-computer', final: true, now: o.now, preset });
}

/** Plans the site computer's orders for the open turn if they aren't yet. True if it planned them now. */
/** The quiet time T (quiet.ts): above the slowest level-3 planning time measured on Vercel, with margin. */
export const QUIET_MS = 3000;

export function planComputer(m: SoloMatch, now: string): boolean {
  if (m.end || m.pend.A) return false;
  m.pend.A = computerOrders(m, now);
  return true;
}

/** A side's turn summary watcher (summary.ts), from the board before the placements, with the turn's opening lines. */
function watchTurn(e: Engine, s: Settings, me: Side, before: World, kills: Kills, o: Pick<Orders, 'placements' | 'via' | 'drafted_by'>) {
  const watch = new TurnWatch(e, s, me, before, kills, o.placements);
  if (o.via === 'page') watch.say(`Your person took this turn on the live page, approving the orders ${o.drafted_by === 'agent' ? 'you (their AI) drafted' : 'drafted before'}.`);
  return watch;
}

/** A turn as the live page tells it: its summary, towers destroyed and lost, and its big moments (up to 3). */
export interface TurnStory { turn: number; lines: string[]; kills: number; lost: number; big: string[] }

/**
 * Every turn's summary for a side, rebuilt from the record (the same watcher, the same frames the turn ran through):
 * the live page's past turns (owner, 2026-11-03). Index = turn. Also the towers that side's gliders destroyed in it,
 * where the ruleset reports kills (otherwise only those destroyed in its sight), the towers it lost, and the turn's big
 * moments (owner, 2026-11-04).
 */
export function turnSummaries(m: SoloMatch, me: Side = PERSON): TurnStory[] {
  const { s, e } = rulesOf(m);
  const w = e.world(s), kills: Kills = { C: 0, A: 0, ...(s.killReports ? { log: [] } : {}) };
  const out: TurnStory[] = [];
  for (const h of m.history) {
    const watch = watchTurn(e, s, me, e.clone(w), kills, h[me]);
    e.apply(w, s, { C: h.C.placements, A: h.A.placements });
    watch.appear(w);
    const before = kills[me], from = w.step;
    do { e.step(w, s, kills); watch.look(w); if (verdict(e, w, s, kills)) break; } while (w.step - from < s.every);
    const lines = watch.done();
    out.push({ turn: h.turn, lines, kills: s.killReports ? kills[me] - before : watch.killsSeen, lost: watch.lost, big: watch.big(3) });
    if (verdict(e, w, s, kills)) break;
  }
  return out;
}

/** Both sides' orders revealed and applied together; the engine runs to the next turn to act (or the end). */
function resolve(m: SoloMatch, now: string) {
  const { s, e } = rulesOf(m);
  planComputer(m, now);
  const C = m.pend.C!, A = m.pend.A!;
  const strip = ({ final: _f, note: _n, ...x }: Orders) => x;
  m.history.push({ turn: m.turn, step: m.w.step, C: strip(C), A: strip(A) });
  // The person's turn summary, from their side's view at each frame (summary.ts).
  const watch = watchTurn(e, s, PERSON, e.clone(m.w), m.kills, C);
  const own = (m.own = ownOf({ ...m, history: m.history.slice(0, -1) }));
  e.apply(m.w, s, { C: C.placements, A: A.placements });
  e.updSeen(m.w, s, m.ls, m.kills);
  updOwn(e, m.w, s, own);
  watch.appear(m.w);
  const from = m.w.step, turn = m.turn;
  const note = () => { m.summary = { turn, from, lines: watch.done() }; };
  do {
    e.step(m.w, s, m.kills);
    e.updSeen(m.w, s, m.ls, m.kills);
    updOwn(e, m.w, s, own);
    watch.look(m.w);
    const v = verdict(e, m.w, s, m.kills);
    if (v) {
      note();
      m.end = { win: v, how: e.towers(m.w, 'C').length && e.towers(m.w, 'A').length ? 'time' : 'towers', step: m.w.step };
      m.pend = { C: null, A: m.pend.A };
      return { over: true, end: m.end };
    }
  } while (m.w.step - from < s.every);
  note();
  m.turn++;
  m.pend = { C: null, A: null };
  m.openedAt = Date.parse(now) || 0;
  return { over: false, turn: m.turn, step: m.w.step };
}

export function setStanding(m: SoloMatch, text: unknown, preset: unknown) {
  if (m.end) throw new SoloError('the match is over');
  if (typeof text !== 'string' || !text.trim() || text.length > 500) throw new SoloError('text must be 1 to 500 characters');
  if (!PRESETS.includes(preset as Preset)) throw new SoloError(`preset must be one of ${PRESETS.join(', ')}`);
  m.standing = { text: text.trim(), preset: preset as Preset };
  return { ok: true, preset };
}

export function resign(m: SoloMatch) {
  if (m.end) throw new SoloError('the match is over');
  m.end = { win: COMPUTER, how: 'resigned', step: m.w.step };
  m.pend = { C: null, A: m.pend.A };
  return { ok: true, over: true };
}

/** The whole record, for anyone, once the match is over: every turn's orders, sources, commitments and salts. */
export function recordOf(m: SoloMatch) {
  if (!m.end) throw new SoloError('no finished match with that id');
  const { s, e, rule } = rulesOf(m);
  return {
    match_id: m.id, ruleset: m.ruleset, ...(m.computer !== undefined ? { computer_revision: m.computer } : {}), seed: m.seed, computer_random: m.cpu, computer_random_commitment: m.cpuCommit, rule, level: m.level, created_at: m.createdAt,
    // The computer planned with its memory of its own pieces out of sight (own-seen.ts): a verifier replays it so.
    ...(m.remember ? { computer_remembers_own_pieces: true } : {}),
    // Nothing that leads back to the person (owner, 2026-10-31): no Farcaster name or ID, and no agent name, since the
    // site shows agents elsewhere as "<name>, agent of @person". The model, as the agent declared it.
    sides: { C: { kind: 'person', model: m.agent.model ? { ...m.agent.model, label: 'self-reported' } : null }, A: { kind: 'site computer', level: m.level } },
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
export function checkComputer(r: Pick<SoloMatch, 'ruleset' | 'computer' | 'seed' | 'level' | 'cpu' | 'cpuCommit' | 'history' | 'remember'>): string[] {
  const out: string[] = [];
  if (sha256(r.cpu) !== r.cpuCommit) out.push('the revealed computer value does not match its commitment');
  const { s, e } = rulesOf(r);
  const st: PlanState = { ruleset: r.ruleset, computer: r.computer, seed: r.seed, level: r.level, cpu: r.cpu, w: e.world(s), ls: { C: {}, A: {} }, turn: 0, remember: r.remember, own: { C: emptyOwnSeen(), A: emptyOwnSeen() } };
  e.L.towers.A.forEach((k) => (st.ls.C[k] = 0));
  e.L.towers.C.forEach((k) => (st.ls.A[k] = 0));
  const kills: Kills = { C: 0, A: 0, ...(s.killReports ? { log: [] } : {}) };
  for (const h of r.history) {
    st.turn = h.turn;
    if (ordersText(computerPlan(st)) !== ordersText(h.A.placements)) out.push(`turn ${h.turn}: the computer's orders don't follow from the record`);
    if (h.C.source === 'site-computer' && ordersText(fallbackPlan(st, h.C.preset ?? 'balanced')) !== ordersText(h.C.placements)) out.push(`turn ${h.turn}: the site computer's orders for the person don't follow from the record`);
    e.apply(st.w, s, { C: h.C.placements, A: h.A.placements });
    e.updSeen(st.w, s, st.ls, kills);
    updOwn(e, st.w, s, st.own!);
    const from = st.w.step;
    do { e.step(st.w, s, kills); e.updSeen(st.w, s, st.ls, kills); updOwn(e, st.w, s, st.own!); if (verdict(e, st.w, s, kills)) return out; } while (st.w.step - from < s.every);
  }
  return out;
}

// ---------- the sandbox ----------

/**
 * "What happens if I do X, and the enemy is where I think it is?" (section 8). Built only from the side's view
 * and the agent's own belief, never from the real board. A belief piece may only go where the side can't see
 * (where it can see, it already knows); scenario orders are checked on that imagined board.
 */
export function simulate(m: SoloMatch, args: { belief?: Belief; scenarios: { name: string; placements: unknown }[]; steps?: number; use_last_seen?: boolean }) {
  const { s, e } = rulesOf(m);
  const me = PERSON, them = other(me);
  const view = e.fog(m.w, s, me), see = e.sees(view, s, me);
  // The board as this side believes it: its view, its own pieces out of sight where it last saw them (as the site
  // computer believes its own: search.ts belief), enemy towers where it last saw them unless use_last_seen is false
  // (owner, 2026-11-04: fix 4), then the agent's own belief.
  const board = withOwnSeen(e, e.clone(view), me, outOfSight(e, m.w, s, me, ownOf(m)[me]));
  const b = args.belief ?? {};
  if (args.use_last_seen !== undefined && typeof args.use_last_seen !== 'boolean') throw new SoloError('use_last_seen must be true or false');
  if (!Array.isArray(b.towers ?? []) || !Array.isArray(b.squares ?? []) || !Array.isArray(b.gliders ?? [])) throw new SoloError('belief: towers, squares and gliders must be lists');
  if ((b.towers?.length ?? 0) + (b.squares?.length ?? 0) + (b.gliders?.length ?? 0) > 60) throw new SoloError('belief: at most 60 pieces');
  const named = [...(b.towers ?? []), ...(b.squares ?? []), ...(b.gliders ?? [])] as { x: unknown; y: unknown }[];
  for (const p of named) if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || !e.inb(p.x as number, p.y as number)) throw new SoloError(`belief: a piece at ${p?.x},${p?.y} is off the board`);
  // Every square of the belief you can see, named at once (fix 4).
  const seenNamed = [...new Set(named.filter((p) => see.has(e.K(p.x as number, p.y as number))).map((p) => `${p.x},${p.y}`))];
  if (seenNamed.length) throw new SoloError(`belief: you can see ${seenNamed.join(', ')}; a belief is only for squares you can't see (get_view's in_sight lists them)`);
  const mine = new Set(named.map((p) => e.K(p.x as number, p.y as number)));
  const lastSeen = args.use_last_seen === false ? [] : Object.keys(m.ls[me]).map(Number).filter((k) => !view.tw[k] && !mine.has(k) && e.empty(board, k));
  for (const k of lastSeen) board.tw[k] = them;
  const put = (x: unknown, y: unknown) => {
    const k = e.K(x as number, y as number);
    if (!e.empty(board, k)) throw new SoloError(`belief: ${x},${y} already holds a piece in your belief`);
    return k;
  };
  for (const t of b.towers ?? []) board.tw[put(t.x, t.y)] = them;
  for (const q of b.squares ?? []) board.sq[put(q.x, q.y)] = { o: them, hp: q.hits_left === 1 ? 1 : s.squareHits };
  for (const g of b.gliders ?? []) {
    const d = typeof g.dir === 'string' ? DIRS[g.dir.toUpperCase()] : undefined;
    if (!d) throw new SoloError('belief: a glider needs dir N, NE, E, SE, S, SW, W or NW');
    put(g.x, g.y);
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
    based_on: `your view at step ${board.step}, your own pieces out of sight where you last saw them, ${lastSeen.length ? `${lastSeen.length} enemy tower${lastSeen.length === 1 ? '' : 's'} where you last saw ${lastSeen.length === 1 ? 'it' : 'them'} (use_last_seen: false leaves them out), ` : ''}and your belief`,
    ...(lastSeen.length ? { last_seen_towers_assumed: lastSeen.map((k) => ({ x: e.XY(k)[0], y: e.XY(k)[1] })) } : {}),
    scenarios: args.scenarios.map((sc) => {
      const name = typeof sc?.name === 'string' ? sc.name.slice(0, 60) : '';
      let ps: Placement<AnyPiece>[];
      try { ps = parseOrders(sc?.placements, s); } catch (err) { return { name, legal: false, why_not: (err as Error).message }; }
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
export function symbolLaunches(m: SoloMatch, args: { x: unknown; y: unknown }) {
  if (m.end) throw new SoloError('the match is over');
  if (!Number.isInteger(args.x) || !Number.isInteger(args.y)) throw new SoloError('x and y must be whole numbers');
  const { s, e } = rulesOf(m);
  const me = PERSON, view = e.fog(m.w, s, me), x = args.x as number, y = args.y as number;
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
