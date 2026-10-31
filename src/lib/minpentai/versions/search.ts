/**
 * The search computer (2026-10-31; design: docs/proposals/minpentai-stronger-computer.md, built on the one
 * engine). It picks placements by playing the engine forward: every placement the engine allows (engine
 * legal()), each tried on a copy of the board as this side believes it is, run to the next turn to act and a
 * little further, scored with the engine's score(). Because legality, physics and the score come from the
 * engine, it plays any ruleset the engine plays, the book edition's pieces included.
 *
 * What it sees: only its side's view (engine fog()), plus the enemy towers where it last saw them. It never
 * reads the real board; the match runner below hands it the view, nothing else.
 *
 * Deterministic: no clock and no Math.random. Its only randomness is its own seeded rng (the order it tries
 * placements in, and a level's deliberate mistakes). Its budget is a number of simulated engine steps, the
 * same on every machine, so Node, the browser and a replay all choose the same moves.
 */
import { drawRules, engine, layout, other, rng, verdict, type AnyPiece, type Engine, type Kills, type Placement, type Side, type World } from './engine';
import type { Settings } from './schema';
import type { VersionRules } from './solo-v1';

export interface SearchLevel {
  /** Steps simulated past the next turn to act. */
  horizon: number;
  /** Chance a decision is a slip: any option it tried, drawn at random, instead of the best (a deliberate mistake). */
  mistake: number;
  /** Try every n-th single placement (1: all). */
  sample: number;
  /** After the first piece, only the best this many options are tried again. */
  beam: number;
  /** Most simulated engine steps a turn may use. */
  steps: number;
}

/** The five levels. Spaced by self-play (scripts/minpentai-search-ladder.ts): each beats the one below most of the time. */
export const SEARCH_LEVELS: Record<number, SearchLevel> = {
  1: { horizon: 0, mistake: 0.5, sample: 4, beam: 8, steps: 3_000 },
  2: { horizon: 0, mistake: 0.3, sample: 2, beam: 16, steps: 8_000 },
  3: { horizon: 6, mistake: 0.12, sample: 1, beam: 24, steps: 20_000 },
  4: { horizon: 12, mistake: 0.05, sample: 1, beam: 32, steps: 40_000 },
  5: { horizon: 18, mistake: 0, sample: 1, beam: 48, steps: 80_000 },
};
export const SEARCH_NAMES = ['', 'Search 1', 'Search 2', 'Search 3', 'Search 4', 'Search 5'];

/**
 * A standing order's preset (agent play, docs/proposals/minpentai-agent-play.md section 9): what the search
 * weighs on top of the engine's score when it plays a side for a person. "balanced" is the score alone.
 */
export const PRESETS = ['balanced', 'defend', 'attack', 'expand'] as const;
export type Preset = (typeof PRESETS)[number];
const presetTerm = (e: Engine, w: World, s: Settings, o: Side, p: Preset): number =>
  p === 'defend' ? -25 * e.open(w, s, o)
    : p === 'attack' ? -60 * e.towers(w, other(o)).length
      : p === 'expand' ? e.lit(w, o, s.sight).size
        : 0;

/** What a player is given at a turn to act, and nothing more. */
export interface TurnInput {
  e: Engine;
  s: Settings;
  o: Side;
  /** This side's view of the board (engine fog()): a copy. */
  view: World;
  /** Where this side last saw each enemy tower: square → step. */
  lastSeen: Record<number, number>;
  /** This side's towers when the turn began: it places within reach of these. */
  snap: number[];
  points: number;
  rng: () => number;
}
export interface Plan { placements: Placement<AnyPiece>[]; steps?: number; sims?: number }
export type Planner = (m: TurnInput) => Plan;

/** The board as this side believes it is: its view, plus enemy towers where it last saw them. */
export function belief(m: Pick<TurnInput, 'view' | 'lastSeen' | 'o' | 'e'>): World {
  const b = m.e.clone(m.view);
  for (const k in m.lastSeen) if (!b.tw[+k] && m.e.empty(b, +k)) b.tw[+k] = other(m.o);
  return b;
}

/** A turn for side m.o at the given level. */
export function searchPlan(m: TurnInput & { level: number; preset?: Preset }): Required<Plan> {
  const { e, s, o } = m, L = SEARCH_LEVELS[m.level];
  const base = belief(m);
  const per = s.every + L.horizon;
  let steps = 0, sims = 0;
  const simulate = (ours: Placement<AnyPiece>[]): number => {
    sims++;
    const sw = e.clone(base);
    e.apply(sw, s, o === 'C' ? { C: ours, A: [] } : { C: [], A: ours });
    const until = Math.min(s.maxSteps, sw.step + per);
    while (sw.step < until) {
      e.step(sw, s);
      steps++;
      if (!e.towers(sw, 'C').length || !e.towers(sw, 'A').length) break;
    }
    return e.score(sw, s, o) + (m.preset && m.preset !== 'balanced' ? presetTerm(e, sw, s, o, m.preset) : 0);
  };

  // Options: every single legal placement (in an order drawn from this side's own numbers, so a budget
  // that runs out doesn't always favour one corner), plus moves that only work as a group.
  const singles = e.legal(base, s, o, m.snap, m.points);
  for (let i = singles.length - 1; i > 0; i--) { const j = Math.floor(m.rng() * (i + 1)); [singles[i], singles[j]] = [singles[j], singles[i]]; }
  let pool: Placement<AnyPiece>[][] = singles.filter((_, i) => i % L.sample === 0).map((p) => [p]);
  pool.push(...groups(e, base, s, o, m.snap, m.points, singles));

  const chosen: Placement<AnyPiece>[] = [];
  let points = m.points, current = simulate([]), first = true;
  const costOf = (ps: Placement<AnyPiece>[]) => ps.reduce((t, p) => t + e.cost(s, p.t), 0);
  for (;;) {
    const options: { ps: Placement<AnyPiece>[]; v: number }[] = [];
    for (const ps of pool) {
      if (steps + per > L.steps) break;
      if (costOf(ps) > points) continue;
      if (e.refuse(base, s, o, m.snap, m.points, [...chosen, ...ps])) continue;
      options.push({ ps, v: simulate([...chosen, ...ps]) });
    }
    if (!options.length) break;
    options.sort((a, b) => b.v - a.v); // stable: ties keep the order tried
    if (first) { pool = options.slice(0, L.beam).map((x) => x.ps); first = false; }
    let pick = options[0];
    if (L.mistake > 0 && options.length > 1 && m.rng() < L.mistake) pick = options[Math.floor(m.rng() * options.length)];
    if (pick.v <= current && pick === options[0]) break; // nothing helps
    chosen.push(...pick.ps);
    current = pick.v;
    points -= costOf(pick.ps);
    pool = pool.filter((ps) => ps !== pick.ps);
  }
  return { placements: chosen, steps, sims };
}

/**
 * Moves worth trying only together: three symbol gliders flying side by side (they rest together and form a
 * symbol), and walling in a symbol of its own that is still forming (squares on every open side).
 */
function groups(e: Engine, w: World, s: Settings, o: Side, snap: number[], points: number, singles: Placement<AnyPiece>[]): Placement<AnyPiece>[][] {
  const out: Placement<AnyPiece>[][] = [];
  const ok = (ps: Placement<AnyPiece>[]) => !e.refuse(w, s, o, snap, points, ps);
  for (const p of singles) {
    if (p.t !== 'e' || (p.dx && p.dy)) continue;
    const side = (n: number): Placement<AnyPiece> => ({ ...p, x: p.x - n * p.dy, y: p.y + n * p.dx });
    const three = [side(-1), p, side(1)];
    if (ok(three)) out.push(three);
  }
  for (const k in w.fs ?? {}) {
    if (w.fs![+k].o !== o) continue;
    const [x, y] = e.XY(+k), ring: Placement<AnyPiece>[] = [];
    for (const [dx, dy] of s.directions === 8 ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[-1, 0], [0, -1], [0, 1], [1, 0]]) {
      if (e.inb(x + dx, y + dy) && !e.solid(w, e.K(x + dx, y + dy))) ring.push({ t: 's', o, x: x + dx, y: y + dy, dx: 0, dy: 0 });
    }
    if (ring.length && ok(ring)) out.push(ring);
  }
  return out;
}

export const searchPlayer = (level: number): Planner => (m) => searchPlan({ ...m, level });

/**
 * One of the ladder's old players (botPlan rung 0–5). It reads the board itself (as it always has; it only uses
 * what its towers light), so the runner gives it the real board turned for Cyan's seat. For comparison only.
 */
export const rungPlayer = (lvl: number, real: () => World): Planner => (m) => {
  const { e, s } = m, w = real(), diag = s.directions === 8;
  if (m.o === 'A') return { placements: e.botPlan({ w, s, lvl, rng: m.rng, budget: m.points, snap: { A: m.snap, C: [] }, lsA: m.lastSeen, diag }) };
  const rk = (k: number) => e.W * e.H - 1 - k;
  return { placements: e.botPlan({ w: e.turned(w), s, lvl, rng: m.rng, budget: m.points, snap: { A: m.snap.map(rk), C: [] }, lsA: e.turnedKeys(m.lastSeen), diag }).map(e.unturn) };
};

export interface SearchMatch {
  win: Side | 'D';
  step: number;
  /** Turns where a player's placements broke the rules (dropped). */
  illegal: number;
  /** Per turn and side: simulated steps used. */
  turns: { step: number; side: Side; steps: number; placed: string }[];
  /** How many of each piece each side placed. */
  placed: Record<Side, Record<string, number>>;
}

/**
 * A whole match between two planners under a ruleset, the way a match is served: both sides plan from their
 * own view at the same time, the real board's placement check decides, then the engine runs to the next turn.
 * `planners` gets the real board only for the old rungs (rungPlayer); search players get their view.
 */
export function playSearchMatch(v: VersionRules, planners: (real: () => World) => Record<Side, Planner>, seed: number): SearchMatch {
  const r = rng(seed);
  const { s1, s2 } = drawRules(v, r);
  const L = layout(v, s1), e = engine(L);
  let s = s1;
  const w = e.world(s);
  const ls: Record<Side, Record<number, number>> = { C: {}, A: {} };
  L.towers.A.forEach((k) => (ls.C[k] = 0));
  L.towers.C.forEach((k) => (ls.A[k] = 0));
  const rs: Record<Side, () => number> = { C: rng(seed * 13 + 5), A: rng(seed * 7 + 1) };
  const P = planners(() => w);
  const out: SearchMatch = { win: 'D', step: 0, illegal: 0, turns: [], placed: { C: {}, A: {} } };
  const saved: Record<Side, number> = { C: 0, A: 0 }, kills: Kills = { C: 0, A: 0 };
  for (;;) {
    if (s2 && s === s1 && w.step >= s1.switchAt) s = s2;
    const snap = { C: e.towers(w, 'C'), A: e.towers(w, 'A') };
    const pts = (o: Side) => (w.step === 0 ? s.setupPoints : s.points) + saved[o];
    const pend: Record<Side, Placement<AnyPiece>[]> = { C: [], A: [] };
    for (const o of ['C', 'A'] as const) {
      const plan = P[o]({ e, s, o, view: e.fog(w, s, o), lastSeen: { ...ls[o] }, snap: snap[o], points: pts(o), rng: rs[o] });
      let ps = plan.placements;
      if (e.refuse(w, s, o, snap[o], pts(o), ps)) { out.illegal++; ps = []; }
      pend[o] = ps;
      for (const p of ps) out.placed[o][p.t] = (out.placed[o][p.t] ?? 0) + 1;
      out.turns.push({ step: w.step, side: o, steps: plan.steps ?? 0, placed: ps.map((p) => p.t).join('') });
    }
    for (const o of ['C', 'A'] as const) saved[o] = Math.min(s.carryOver, pts(o) - pend[o].reduce((t, p) => t + e.cost(s, p.t), 0));
    e.apply(w, s, pend);
    e.updLS(w, s.sight, ls);
    const from = w.step;
    do {
      e.step(w, s, kills);
      e.updLS(w, s.sight, ls);
      const end = verdict(e, w, s, kills);
      if (end) { out.win = end; out.step = w.step; return out; }
    } while (w.step - from < s.every);
  }
}
