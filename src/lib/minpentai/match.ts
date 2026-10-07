/**
 * Matches: players, ownership, sight, intervention turns, elimination. Pure.
 * Tests: scripts/test-minpentai-match.ts. Rules written up in docs/minpentai-sandbox.md.
 *
 * Everything in this file is INVENTED. The book (chapters 2–4) describes how a match
 * goes: a dark board, symbols that let their owner see around them (c4-b93), setup in
 * a home corner (c4-b94), the battle running on its own (c4-b106–b108), intervention
 * turns when players "put down more squares near any copy of their symbols" (c4-b110),
 * and a player being out once all their symbols are destroyed (c4-b136–b138). It gives
 * no numbers and no exact procedure. Every number and procedure here is ours:
 *
 * - Cells have owners. Each turn applies the book's rule exactly (the live cells match
 *   engine.step); owners travel with their cells by a fixed pairing inside each block.
 * - A player's symbol is a recognised symbol (symbol.ts) with at least three of its
 *   four cells theirs. Where one has been seen is a "site". A site lasts SITE_GRACE
 *   turns after its symbol was last recognised, so a symbol that flickers while a
 *   glider passes is not lost at once.
 * - You see everything within `sight` cells of your sites (the book: thirty squares on
 *   a far bigger board). Everything else is dark to you.
 * - Every `interval` turns is an intervention turn. Each player may put down up to
 *   `budget` squares, each within `reach` cells of one of their sites, on empty cells
 *   with an empty cell around the new shape.
 * - A player with no sites left is out. The last player in wins. At `maxTurns`, the
 *   player with the most sites wins; equal counts are a draw.
 */
import { emptyBoard, phase, stamp, type Board } from './engine';
import { SYMBOL_ROWS, findSymbols, type FoundSymbol } from './symbol';

export const PLAYER_COLOURS = ['#46D7E8', '#FFB43A', '#FF5C8A', '#A98BFF'] as const;
export const NEUTRAL = '#8A8C96';

export interface MatchRules {
  interval: number;
  budget: number;
  reach: number;
  sight: number;
  maxTurns: number;
}
export const DEFAULT_RULES: MatchRules = { interval: 24, budget: 8, reach: 7, sight: 10, maxTurns: 480 };
/** Turns a site lasts after its symbol was last recognised. */
export const SITE_GRACE = 8;

export interface Site { x: number; y: number; lastSeen: number }
export interface PlayerState {
  /** Index into PLAYER_COLOURS; owner value on the board is id + 1. */
  id: number;
  sites: Site[];
  out: boolean;
  outAt?: number;
}

export type MatchEvent =
  | { kind: 'placed'; turn: number; player: number; what: StampKind; x: number; y: number }
  | { kind: 'symbolLost'; turn: number; player: number; x: number; y: number }
  | { kind: 'symbolGained'; turn: number; player: number; x: number; y: number }
  | { kind: 'out'; turn: number; player: number }
  | { kind: 'end'; turn: number; winner: number | null };

export interface Match {
  rules: MatchRules;
  board: Board;
  /** 0 = nobody, otherwise player id + 1. Same indexing as board.cells. */
  owners: Uint8Array;
  players: PlayerState[];
  /** Squares each player may still put down this intervention turn. */
  left: number[];
  events: MatchEvent[];
  winner: number | null | undefined; // undefined while playing; null for a draw
}

/* ---------------- stepping with owners ---------------- */

/**
 * Where each cell of a block goes, for the book's block rule (engine.blockRule).
 * Rotation moves cell i to 3 - i. Complementing a pair moves each live cell to an
 * empty one: a side pair rotates (the result is the opposite side), a diagonal pair
 * swaps left and right. Each mapping is its own inverse, like the rule.
 */
function blockMove(ph: number, b: readonly number[]): readonly number[] | null {
  const n = b[0] + b[1] + b[2] + b[3];
  const rot = [3, 2, 1, 0];
  if (n === 2) return (b[0] && b[3]) || (b[1] && b[2]) ? [1, 0, 3, 2] : rot;
  if (ph === 0) return n === 3 ? rot : null;
  return n === 1 ? rot : null;
}

/** One turn forward, carrying owners. The live cells equal engine.step(board). */
export function stepOwned(board: Board, owners: Uint8Array): { board: Board; owners: Uint8Array } {
  const { w, h, cells, rocks } = board;
  const ph = phase(board.turn);
  const oc = new Uint8Array(cells);
  const oo = new Uint8Array(owners);
  for (let y0 = ph; y0 < h + ph; y0 += 2) {
    for (let x0 = ph; x0 < w + ph; x0 += 2) {
      const xa = x0 % w, xb = (x0 + 1) % w, ya = y0 % h, yb = (y0 + 1) % h;
      const idx = [ya * w + xa, ya * w + xb, yb * w + xa, yb * w + xb];
      if (rocks[idx[0]] || rocks[idx[1]] || rocks[idx[2]] || rocks[idx[3]]) continue;
      const b = [cells[idx[0]], cells[idx[1]], cells[idx[2]], cells[idx[3]]];
      const mv = blockMove(ph, b);
      if (!mv) continue;
      for (let i = 0; i < 4; i++) { oc[idx[i]] = 0; oo[idx[i]] = 0; }
      for (let i = 0; i < 4; i++) if (b[i]) { oc[idx[mv[i]]] = 1; oo[idx[mv[i]]] = owners[idx[i]]; }
    }
  }
  return { board: { ...board, cells: oc, turn: board.turn + 1 }, owners: oo };
}

/* ---------------- symbols, sites, sight ---------------- */

const wrapD = (d: number, m: number) => { const v = ((d % m) + m) % m; return Math.min(v, m - v); };
/** Chebyshev distance on the wrapping board. */
export const dist = (b: Board, x1: number, y1: number, x2: number, y2: number) => Math.max(wrapD(x1 - x2, b.w), wrapD(y1 - y2, b.h));

export interface OwnedSymbol extends FoundSymbol { owner: number | null; cx: number; cy: number }

/** Recognised symbols with their owner (a player id, or null if no player has three of its cells). */
export function ownedSymbols(board: Board, owners: Uint8Array): OwnedSymbol[] {
  return findSymbols(board).map((s) => {
    const count = new Map<number, number>();
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
      const i = (y % board.h) * board.w + (x % board.w);
      if (board.cells[i] && owners[i]) count.set(owners[i] - 1, (count.get(owners[i] - 1) ?? 0) + 1);
    }
    const best = [...count.entries()].find(([, n]) => n >= 3);
    return { ...s, owner: best ? best[0] : null, cx: (s.x + Math.floor(s.w / 2)) % board.w, cy: (s.y + Math.floor(s.h / 2)) % board.h };
  });
}

/** Updates sites from what is recognised now; returns events for gained and lost sites. */
function refreshSites(m: Match): MatchEvent[] {
  const ev: MatchEvent[] = [];
  const t = m.board.turn;
  const syms = ownedSymbols(m.board, m.owners);
  for (const p of m.players) {
    if (p.out) continue;
    for (const s of syms) {
      if (s.owner !== p.id) continue;
      const site = p.sites.find((q) => dist(m.board, q.x, q.y, s.cx, s.cy) <= 2);
      if (site) { site.x = s.cx; site.y = s.cy; site.lastSeen = t; }
      else { p.sites.push({ x: s.cx, y: s.cy, lastSeen: t }); ev.push({ kind: 'symbolGained', turn: t, player: p.id, x: s.cx, y: s.cy }); }
    }
    const kept: Site[] = [];
    for (const q of p.sites) {
      if (t - q.lastSeen > SITE_GRACE) ev.push({ kind: 'symbolLost', turn: t, player: p.id, x: q.x, y: q.y });
      else kept.push(q);
    }
    p.sites = kept;
    if (!kept.length) { p.out = true; p.outAt = t; ev.push({ kind: 'out', turn: t, player: p.id }); }
  }
  return ev;
}

/** What player `id` can see: 1 where visible. Out players and spectators (id null) see everything. */
export function sightMask(m: Match, id: number | null): Uint8Array {
  const { w, h } = m.board;
  const mask = new Uint8Array(w * h);
  if (id === null || m.players[id].out || m.winner !== undefined) return mask.fill(1);
  const r = m.rules.sight;
  for (const s of m.players[id].sites) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      mask[(((s.y + dy) % h) + h) % h * w + (((s.x + dx) % w) + w) % w] = 1;
    }
  }
  return mask;
}

/* ---------------- placing ---------------- */

export type StampKind = 'glider' | 'mirror' | 'symbol';
export type Dir = 'up' | 'down' | 'left' | 'right';
export interface Placement { kind: StampKind; x: number; y: number; dir?: Dir }

/** The glider facing each way, as drawn on an even turn (scripts/test-minpentai-match.ts checks each). */
export const GLIDERS: Record<Dir, readonly string[]> = {
  up: ['.##.', '#..#'],
  down: ['#..#', '.##.'],
  right: ['#.', '.#', '.#', '#.'],
  left: ['.#', '#.', '#.', '.#'],
};
export const stampRows = (p: Placement): readonly string[] =>
  p.kind === 'glider' ? GLIDERS[p.dir ?? 'up'] : p.kind === 'symbol' ? SYMBOL_ROWS : ['#'];

/**
 * Snaps a tap to where the stamp works, centred on the tap. A glider only travels from
 * a top-left on odd coordinates on the even turns interventions fall on.
 */
export function snap(b: Board, p: Placement): Placement {
  const rows = stampRows(p);
  let x = p.x - Math.floor((rows[0].length - 1) / 2), y = p.y - Math.floor((rows.length - 1) / 2);
  if (p.kind === 'glider') { x += (x & 1) ? 0 : 1; y += (y & 1) ? 0 : 1; }
  return { ...p, x: ((x % b.w) + b.w) % b.w, y: ((y % b.h) + b.h) % b.h };
}

export const stampCells = (b: Board, p: Placement): [number, number][] =>
  stampRows(p).flatMap((r, j) => [...r].flatMap((c, i) => (c === '#' ? [[(p.x + i) % b.w, (p.y + j) % b.h] as [number, number]] : [])));

export type PlaceProblem = 'not-intervention' | 'budget' | 'reach' | 'crowded' | 'out';

/** Why player `id` cannot put this down now, or null if they can. */
export function placeProblem(m: Match, id: number, p: Placement): PlaceProblem | null {
  const pl = m.players[id];
  if (pl.out || m.winner !== undefined) return 'out';
  if (!isIntervention(m)) return 'not-intervention';
  const cells = stampCells(m.board, p);
  if (cells.length > m.left[id]) return 'budget';
  const { w, h } = m.board;
  for (const [x, y] of cells) if (!pl.sites.some((s) => dist(m.board, s.x, s.y, x, y) <= m.rules.reach)) return 'reach';
  const mine = new Set(cells.map(([x, y]) => y * w + x));
  for (const [x, y] of cells) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const i = (((y + dy) % h) + h) % h * w + (((x + dx) % w) + w) % w;
    if (mine.has(i)) { if (m.board.rocks[i]) return 'crowded'; continue; }
    if (m.board.cells[i]) return 'crowded';
  }
  return null;
}

export const isIntervention = (m: Match) => m.winner === undefined && m.board.turn % m.rules.interval === 0;

/** Puts a stamp down for player `id`. Returns the match unchanged if it is not allowed. */
export function place(m: Match, id: number, p: Placement): Match {
  if (placeProblem(m, id, p)) return m;
  const cells = new Uint8Array(m.board.cells);
  const owners = new Uint8Array(m.owners);
  const xy = stampCells(m.board, p);
  for (const [x, y] of xy) { const i = y * m.board.w + x; cells[i] = 1; owners[i] = id + 1; }
  const left = [...m.left];
  left[id] -= xy.length;
  return { ...m, board: { ...m.board, cells }, owners, left, events: [...m.events, { kind: 'placed', turn: m.board.turn, player: id, what: p.kind, x: p.x, y: p.y }] };
}

/* ---------------- running ---------------- */

/** One turn forward. Refills budgets when the next turn is an intervention turn. */
export function advance(m: Match): Match {
  if (m.winner !== undefined) return m;
  const s = stepOwned(m.board, m.owners);
  const next: Match = { ...m, board: s.board, owners: s.owners, players: m.players.map((p) => ({ ...p, sites: p.sites.map((q) => ({ ...q })) })) };
  const ev = refreshSites(next);
  const alive = next.players.filter((p) => !p.out);
  if (alive.length <= 1) next.winner = alive.length ? alive[0].id : null;
  else if (next.board.turn >= m.rules.maxTurns) {
    const best = Math.max(...alive.map((p) => p.sites.length));
    const top = alive.filter((p) => p.sites.length === best);
    next.winner = top.length === 1 ? top[0].id : null;
  }
  if (next.winner !== undefined) ev.push({ kind: 'end', turn: next.board.turn, winner: next.winner });
  next.left = isIntervention(next) ? next.players.map((p) => (p.out ? 0 : m.rules.budget)) : next.players.map(() => 0);
  next.events = ev.length ? [...m.events, ...ev] : m.events;
  return next;
}

export interface MatchSetup {
  w: number;
  h: number;
  rules?: Partial<MatchRules>;
  rocks: [number, number][];
  /** Each player's starting symbols (top-left corners). */
  symbols: [number, number][][];
  /** Extra starting cells, owned: [player, rows, x, y]. */
  extra?: [number, readonly string[], number, number][];
}

export function newMatch(setup: MatchSetup): Match {
  let b = emptyBoard(setup.w, setup.h);
  for (const [x, y] of setup.rocks) b = stamp(b, ['#'], x, y, 'rock');
  const owners = new Uint8Array(b.w * b.h);
  const put = (id: number, rows: readonly string[], x: number, y: number) => {
    b = stamp(b, rows, x, y);
    rows.forEach((r, j) => [...r].forEach((c, i) => { if (c === '#') owners[((y + j) % b.h) * b.w + ((x + i) % b.w)] = id + 1; }));
  };
  setup.symbols.forEach((list, id) => list.forEach(([x, y]) => put(id, SYMBOL_ROWS, x, y)));
  for (const [id, rows, x, y] of setup.extra ?? []) put(id, rows, x, y);
  const rules = { ...DEFAULT_RULES, ...setup.rules };
  const m: Match = {
    rules, board: b, owners,
    players: setup.symbols.map((_, id) => ({ id, sites: [], out: false })),
    left: setup.symbols.map(() => rules.budget), events: [], winner: undefined,
  };
  refreshSites(m);
  m.events = [];
  return m;
}

/** Runs until the next intervention turn or the end. */
export function runToIntervention(m: Match): Match {
  let x = advance(m);
  while (x.winner === undefined && !isIntervention(x)) x = advance(x);
  return x;
}
