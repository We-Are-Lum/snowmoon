/**
 * The search computer (2026-10-31; design: docs/proposals/minpentai-stronger-computer.md, built on the one
 * engine). It picks placements by playing the engine forward: every placement the engine allows (engine
 * legal()), each tried on a copy of the board as this side believes it is, run to the next turn to act and a
 * little further, scored with the engine's score(). Because legality, physics and the score come from the
 * engine, it plays any ruleset the engine plays, the book edition's pieces included.
 *
 * What it sees: only its side's view (engine fog()), plus the enemy towers where it last saw them. It never
 * reads the real board: every caller hands it the view, and searchPlan takes the view of what it is given again
 * itself, so a caller can't hand it more (owner, 2026-11-03: every computer plans from its own fog view).
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
  /** At most this many pieces a turn (absent: as many as the points buy). The beginner's handicap. */
  pieces?: number;
}

/**
 * The levels, weakest first (owner, 2026-10-31: one definition for Play's ladder and agent play). Spaced by
 * self-play at 200 matches a pairing, seats swapped, under ruleset 3 (scripts/minpentai-search-ladder.ts --ladder):
 * each beats the one below by about 65%. Above level 3, two mistake-free searches only draw. 0 is the beginner.
 * Easy and Fair, Play's ladder rungs between the beginner and level 1, are LADDER_LEVELS.
 */
export const SEARCH_LEVELS: Record<number, SearchLevel> = {
  // The beginner: one piece a turn, nine decisions in ten a slip. 40.5% against the old Practice player (200 matches).
  0: { horizon: 0, mistake: 0.9, sample: 8, beam: 4, steps: 800, pieces: 1 },
  // Up to three pieces a turn, no look-ahead past the next turn, slips 12%: 63% against Fair.
  1: { horizon: 0, mistake: 0.12, sample: 2, beam: 12, steps: 6_000, pieces: 3 },
  // Six steps past the next turn, slips 5%: 67% against level 1.
  2: { horizon: 6, mistake: 0.05, sample: 1, beam: 24, steps: 20_000 },
  // Eighteen steps past, never slips: 65% against level 2.
  3: { horizon: 18, mistake: 0, sample: 1, beam: 48, steps: 80_000 },
};
/** The highest level. */
export const TOP_LEVEL = 3;
/**
 * Play's ladder (ruleset 3), weakest first (owner, 2026-10-31: no wall between the beginner and level 1): the beginner,
 * then two rungs measured against the old ladder's players under ruleset 3's rules, 200 matches, seats swapped:
 * "Easy" scores 46% against the old Builder, "Fair" 62% against the old Planner (the top of the old ladder).
 */
export const LADDER_LEVELS: SearchLevel[] = [
  SEARCH_LEVELS[0],
  { horizon: 0, mistake: 0.4, sample: 2, beam: 8, steps: 3_000, pieces: 2 },
  { horizon: 0, mistake: 0.2, sample: 2, beam: 10, steps: 4_000, pieces: 3 },
];
export const SEARCH_NAMES = ['Beginner', 'Level 1', 'Level 2', 'Level 3'];

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
  /** This side's view of the board (engine fog()): a copy. searchPlan takes the view of whatever it is given, so
   * even the real board passed here by mistake is seen only as the side's view. */
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
/**
 * A computer that uses the book edition's pieces (ruleset book-2, owner 2026-11-01: "so a match uses all four pieces on
 * both sides"). Each turn, before its usual search, it considers one book piece it has none of standing, in this order:
 * a glider factory, a moving wall, a mirror wall, three symbol gliders together. It takes the best placement of that
 * kind if it scores no worse than `variety` below placing nothing; then the usual search spends the rest.
 */
export interface BookPlay { variety: number; kinds?: ('f' | 'w' | 'm' | 'e')[]; /** No book piece before this turn to act (setup is 0): towers come first. */ from?: number }
/**
 * book-4's computer (owner, 2026-11-02, after the book-3 playtest: level 2 sent symbol gliders that could never meet,
 * and left most of its points unspent). Off unless a ruleset's computer sets them, so every other computer, and every
 * record it made, plays exactly as before.
 * - formingSymbols: three symbol gliders are tried only where a sandbox run from its own view shows them forming a
 *   symbol, side by side or staggered.
 * - seedScore: what a symbol glider of its own in flight is worth to its score (plain gliders stay at 2).
 * - spendTies: when points it doesn't spend would be lost, it also takes a placement that scores no worse.
 */
export interface Computer {
  formingSymbols?: boolean; seedScore?: number; spendTies?: boolean;
  /**
   * Guards its towers (owner, 2026-11-04, after the book-4 playtest: an AI's symbol gliders down open rows won every
   * level). Off unless a computer sets it. Where the enemy could launch a glider this turn is its belief: every empty
   * square within the enemy's reach of the enemy towers it sees or last saw. Then, at every level:
   * - walls first: before anything else, squares on its towers' lanes, one at a time, each where it closes the most
   *   lanes a glider launched there could fly down into a tower within a turn (these squares don't count against a
   *   level's piece limit, so level 1 guards its tower rows at setup too);
   * - weighs open lanes: in the search, each such lane still open after its placements costs LANE points of score,
   *   and a new tower is tried together with the squares that close its lanes;
   * - checks every new tower: its own engine runs, on its belief with its placements, every single glider the enemy
   *   could launch there this turn; a new tower one of them destroys gets a square where that glider comes in, or,
   *   when none can be placed, isn't placed (its points go to guarding the rest).
   */
  guard?: boolean;
}
/** What an open lane into one of its towers costs a guarding computer's score (a tower is worth 100). */
const LANE = 40;
export function searchPlan(m: TurnInput & { level: number; preset?: Preset; config?: SearchLevel; book?: BookPlay; comp?: Computer }): Required<Plan> {
  const { e, s, o } = m, L = m.config ?? SEARCH_LEVELS[m.level];
  // Its own view of what it was given, first (owner, 2026-11-03: every computer plans from its own fog view). fog is
  // idempotent, so a caller that passes the view (all of them) plans exactly as before.
  const base = belief({ ...m, view: e.fog(m.view, s, o) });
  const per = s.every + L.horizon;
  let steps = 0, sims = 0;
  const G = !!m.comp?.guard, them = other(o);
  // Guard: where the enemy could place this turn, as this side believes it: empty, within reach of the enemy towers it
  // sees or last saw, and of the enemy's resting symbol gliders it sees (where a symbol of theirs, a tower, can form).
  const zone = G ? new Set([...e.lit(base, them, s.reach, [...e.towers(base, them), ...Object.keys(base.sd ?? {}).map(Number).filter((k) => base.sd![k] === them)])].filter((k) => e.empty(base, k))) : new Set<number>();
  /** Lanes into its towers that a glider launched in the enemy's zone could fly down within a turn (straight lines). */
  const lanes = (w: World): number => {
    let n = 0;
    for (const k of e.towers(w, o)) {
      const [x, y] = e.XY(k);
      for (const [dx, dy] of D4) {
        for (let d = 1; d <= s.every; d++) {
          const cx = x + d * dx, cy = y + d * dy;
          if (!e.inb(cx, cy) || e.solid(w, e.K(cx, cy))) break;
          if (zone.has(e.K(cx, cy))) { n++; break; }
        }
      }
    }
    return n;
  };
  const withOurs = (ours: Placement<AnyPiece>[]) => { const w = e.clone(base); e.apply(w, s, o === 'C' ? { C: ours, A: [] } : { C: [], A: ours }); return w; };
  const simulate = (ours: Placement<AnyPiece>[]): number => {
    sims++;
    const sw = withOurs(ours);
    const open = G ? LANE * lanes(sw) : 0;
    const until = Math.min(s.maxSteps, sw.step + per);
    while (sw.step < until) {
      e.step(sw, s);
      steps++;
      if (!e.towers(sw, 'C').length || !e.towers(sw, 'A').length) break;
    }
    const seeds = m.comp?.seedScore !== undefined ? sw.gl.filter((g) => g.o === o && g.seed && !g.dead).length * (m.comp.seedScore - 2) : 0;
    return e.score(sw, s, o) + seeds - open + (m.preset && m.preset !== 'balanced' ? presetTerm(e, sw, s, o, m.preset) : 0);
  };

  // Options: every single legal placement (in an order drawn from this side's own numbers, so a budget
  // that runs out doesn't always favour one corner), plus moves that only work as a group.
  const singles = e.legal(base, s, o, m.snap, m.points);
  for (let i = singles.length - 1; i > 0; i--) { const j = Math.floor(m.rng() * (i + 1)); [singles[i], singles[j]] = [singles[j], singles[i]]; }
  let pool: Placement<AnyPiece>[][] = singles.filter((_, i) => i % L.sample === 0).map((p) => [p]);
  pool.push(...groups(e, base, s, o, m.snap, m.points, singles, m.comp?.formingSymbols ? s.every * 2 : 0));
  if (G) pool.push(...guardedTowers(e, base, s, o, m.snap, m.points, singles, lanes, withOurs));

  const chosen: Placement<AnyPiece>[] = [];
  let points = m.points, first = true;
  const costOf = (ps: Placement<AnyPiece>[]) => ps.reduce((t, p) => t + e.cost(s, p.t), 0);
  // Guard, walls first: squares on its towers' open lanes, each where it closes the most, while one helps.
  if (G) for (const p of wallUp(e, base, s, o, m.snap, singles, chosen, points, lanes, withOurs)) { chosen.push(p); points -= e.cost(s, p.t); }
  let current = simulate(chosen);
  if (m.book && base.step >= (m.book.from ?? 0) * s.every) {
    const has = { f: Object.values(base.fa ?? {}).some((f) => f.o === o), w: (base.mw ?? []).some((w) => w.o === o && w.c.some(Boolean)), m: Object.values(base.mir ?? {}).some((x) => x.o === o), e: base.gl.some((g) => g.o === o && g.seed) || Object.values(base.sd ?? {}).some((x) => x === o) };
    const seedGroups = pool.filter((ps) => ps.length === 3 && ps.every((p) => p.t === 'e'));
    for (const kind of m.book.kinds ?? (['f', 'w', 'm', 'e'] as const)) {
      if (has[kind] || !(e.cost(s, kind) > 0)) continue;
      const cands = kind === 'e' ? seedGroups : singles.filter((p) => p.t === kind).map((p) => [p]);
      let best: { ps: Placement<AnyPiece>[]; v: number } | null = null;
      for (const ps of cands) {
        if (steps + per > L.steps) break;
        if (costOf(ps) > points || e.refuse(base, s, o, m.snap, m.points, ps)) continue;
        const v = simulate(ps);
        if (!best || v > best.v) best = { ps, v };
      }
      if (best && best.v >= current - m.book.variety) {
        chosen.push(...best.ps);
        current = best.v;
        points -= costOf(best.ps);
        break; // one book piece a turn
      }
    }
  }
  const bookPieces = chosen.length; // the book piece and the walls, if any, don't count against a level's piece limit
  for (;;) {
    // A guarding computer counts a tower with its squares as one piece.
    if (L.pieces !== undefined && (G ? chosen.slice(bookPieces).filter((p) => p.t !== 's').length : chosen.length - bookPieces) >= L.pieces) break;
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
    // Nothing helps. (spendTies: points it would lose are spent on a placement that does no harm.)
    if (pick === options[0] && (pick.v < current || (pick.v === current && !(m.comp?.spendTies && points - costOf(pick.ps) >= 0 && points > s.carryOver)))) break;
    chosen.push(...pick.ps);
    current = pick.v;
    points -= costOf(pick.ps);
    pool = pool.filter((ps) => ps !== pick.ps);
  }
  if (G) {
    // Every new tower checked with its own engine against every single glider the enemy could launch this turn.
    const kept = checkTowers(e, base, s, o, m.snap, m.points, chosen, zone, withOurs, () => steps++);
    chosen.length = 0;
    chosen.push(...kept);
    points = m.points - costOf(chosen);
    // Points a dropped tower left: more walls.
    for (const p of wallUp(e, base, s, o, m.snap, singles, chosen, points, lanes, withOurs)) { chosen.push(p); points -= e.cost(s, p.t); }
  }
  return { placements: chosen, steps, sims };
}

const D4: [number, number][] = [[-1, 0], [0, -1], [0, 1], [1, 0]];

/**
 * Guard, walls first: squares that close lanes into its towers (lanes()), one at a time, each the legal square that
 * closes the most (ties: the first in board order), while one closes any and the points allow. No slips.
 */
function wallUp(e: Engine, base: World, s: Settings, o: Side, snap: number[], singles: Placement<AnyPiece>[], chosen: Placement<AnyPiece>[], points: number, lanes: (w: World) => number, withOurs: (ps: Placement<AnyPiece>[]) => World): Placement<AnyPiece>[] {
  const out: Placement<AnyPiece>[] = [];
  // Nearest its towers first (a wall far out leaves room in front of it for the enemy's symbol gliders to gather).
  const tws = [...e.towers(base, o), ...chosen.filter((p) => p.t === 't').map((p) => e.K(p.x, p.y))].map(e.XY);
  const near = (p: Placement<AnyPiece>) => Math.min(...tws.map(([x, y]) => Math.abs(p.x - x) + Math.abs(p.y - y)));
  const squares = singles.filter((p) => p.t === 's').sort((a, b) => near(a) - near(b) || e.K(a.x, a.y) - e.K(b.x, b.y));
  let now = lanes(withOurs(chosen)), left = points;
  while (now > 0 && left >= s.costSquare) {
    let best: { p: Placement<AnyPiece>; n: number } | null = null;
    for (const p of squares) {
      if (out.includes(p) || e.refuse(base, s, o, snap, Number.MAX_SAFE_INTEGER, [...chosen, ...out, p])) continue;
      const n = lanes(withOurs([...chosen, ...out, p]));
      if (n < now && (!best || n < best.n)) best = { p, n };
    }
    if (!best) break;
    out.push(best.p);
    left -= s.costSquare;
    now = best.n;
  }
  return out;
}

/** Guard: each legal tower that opens lanes, together with the squares that close them again (as wallUp). */
function guardedTowers(e: Engine, base: World, s: Settings, o: Side, snap: number[], points: number, singles: Placement<AnyPiece>[], lanes: (w: World) => number, withOurs: (ps: Placement<AnyPiece>[]) => World): Placement<AnyPiece>[][] {
  const out: Placement<AnyPiece>[][] = [];
  const before = lanes(withOurs([]));
  for (const t of singles) {
    if (t.t !== 't' || lanes(withOurs([t])) <= before) continue; // nothing to close: the tower alone is already an option
    const walls = wallUp(e, base, s, o, snap, singles, [t], points - e.cost(s, 't'), lanes, withOurs);
    if (walls.length && lanes(withOurs([t, ...walls])) <= before) out.push([t, ...walls]);
  }
  return out;
}

/**
 * Guard: its own engine, on its belief with its placements, runs every single glider (a symbol glider where the rules
 * have them) the enemy could launch from its zone this turn, in each direction, for one turn. A new tower one of them
 * destroys gets a square on the square that glider came in from, if it can place one there; if not, the tower is
 * dropped, with the squares beside it placed this turn that guard no other tower. Returns the placements kept.
 */
function checkTowers(e: Engine, base: World, s: Settings, o: Side, snap: number[], points: number, chosen: Placement<AnyPiece>[], zone: Set<number>, withOurs: (ps: Placement<AnyPiece>[]) => World, count: () => void): Placement<AnyPiece>[] {
  let ps = chosen.slice();
  const spent = () => ps.reduce((t, p) => t + e.cost(s, p.t), 0);
  /** New towers a single enemy launch destroys within a turn, each with the square that glider came in from. */
  const killers = (): Map<number, number> => {
    const w0 = withOurs(ps), mine = ps.filter((p) => p.t === 't').map((p) => e.K(p.x, p.y)).filter((k) => w0.tw[k] === o);
    const hit = new Map<number, number>();
    if (!mine.length) return hit;
    // Without mirrors or factories a glider keeps to its line: only lines through a new tower can matter.
    const bent = !!(w0.mir && Object.keys(w0.mir).length) || !!(w0.fa && Object.keys(w0.fa).length);
    const rows = new Set(mine.map((k) => e.XY(k)[1])), cols = new Set(mine.map((k) => e.XY(k)[0]));
    for (const z of zone) {
      if (!e.empty(w0, z)) continue;
      const [zx, zy] = e.XY(z);
      for (const [dx, dy] of D4) {
        if (!bent && !(dy === 0 ? rows.has(zy) : cols.has(zx))) continue;
        const w = e.clone(w0), id = w.nid++;
        w.gl.push({ id, o: other(o), x: zx, y: zy, dx, dy, ...(s.costSeed ? { seed: 1 as const } : {}) });
        let at = z;
        for (let i = 0; i < s.every; i++) {
          const g = w.gl.find((q) => q.id === id);
          if (!g) break;
          at = e.K(g.x, g.y);
          e.step(w, s);
          count();
          const dead = mine.find((k) => !hit.has(k) && w.tw[k] !== o);
          if (dead !== undefined) { hit.set(dead, at); break; }
        }
      }
    }
    return hit;
  };
  for (let round = 0; round < 8; round++) {
    const hit = killers();
    if (!hit.size) break;
    for (const [k, from] of hit) {
      const [fx, fy] = e.XY(from), sq: Placement<AnyPiece> = { t: 's', o, x: fx, y: fy, dx: 0, dy: 0 };
      if (from !== k && spent() + s.costSquare <= points && !e.refuse(base, s, o, snap, points, [...ps, sq])) { ps.push(sq); continue; }
      const [tx, ty] = e.XY(k);
      ps = ps.filter((p) => !(p.t === 't' && p.x === tx && p.y === ty));
      const others = [...e.towers(base, o), ...ps.filter((p) => p.t === 't').map((p) => e.K(p.x, p.y))].map(e.XY);
      const beside = (p: Placement<AnyPiece>, x: number, y: number) => Math.abs(p.x - x) + Math.abs(p.y - y) === 1;
      ps = ps.filter((p) => p.t !== 's' || !beside(p, tx, ty) || others.some(([x, y]) => beside(p, x, y)));
    }
  }
  return ps;
}

/**
 * Moves worth trying only together: three symbol gliders flying side by side (they rest together and form a
 * symbol), and walling in a symbol of its own that is still forming (squares on every open side).
 */
function groups(e: Engine, w: World, s: Settings, o: Side, snap: number[], points: number, singles: Placement<AnyPiece>[], forming = 0): Placement<AnyPiece>[][] {
  const out: Placement<AnyPiece>[][] = [];
  const ok = (ps: Placement<AnyPiece>[]) => !e.refuse(w, s, o, snap, points, ps);
  /** forming > 0: a sandbox run of `forming` steps from this view, these three alone, forms a symbol of o's. */
  const forms = (ps: Placement<AnyPiece>[]) => {
    const sw = e.clone(w);
    e.apply(sw, s, o === 'C' ? { C: ps, A: [] } : { C: [], A: ps });
    for (let i = 0; i < forming; i++) { e.step(sw, s); if (Object.values(sw.fs ?? {}).some((f) => f.o === o)) return true; if (!sw.gl.some((g) => g.seed && g.o === o)) return false; }
    return false;
  };
  const seen = new Set<string>();
  for (const p of singles) {
    if (p.t !== 'e' || (p.dx && p.dy)) continue;
    const side = (n: number, fwd = 0): Placement<AnyPiece> => ({ ...p, x: p.x - n * p.dy + fwd * p.dx, y: p.y + n * p.dx + fwd * p.dy });
    // Side by side; with forming, also staggered (the outer two a square ahead or behind), kept only if they form.
    const shapes = forming ? [[side(-1), p, side(1)], [side(-1, 1), p, side(1, 1)], [side(-1, -1), p, side(1, -1)], [side(-1), p, side(1, 1)], [side(-1, 1), p, side(1)]] : [[side(-1), p, side(1)]];
    for (const three of shapes) {
      const id = three.map((q) => `${q.x},${q.y},${q.dx},${q.dy}`).sort().join('|');
      if (seen.has(id)) continue;
      seen.add(id);
      if (ok(three) && (!forming || forms(three))) out.push(three);
    }
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
/** Play's ladder rung n (1–6): the beginner, Easy, Fair, then levels 1–3. */
export const ladderLevel = (rung: number): SearchLevel => (rung <= LADDER_LEVELS.length ? LADDER_LEVELS[rung - 1] : SEARCH_LEVELS[rung - LADDER_LEVELS.length]);
export const ladderPlayer = (rung: number): Planner => (m) => searchPlan({ ...m, level: -1, config: ladderLevel(rung) });

/**
 * One of the ladder's old players (botPlan rung 0–5), given its side's view like any other player (the view turned
 * for Cyan's seat). botPlan takes Amber's view of whatever board it gets, so it sees only what its towers light.
 */
export const rungPlayer = (lvl: number): Planner => (m) => {
  const { e, s } = m, diag = s.directions === 8;
  if (m.o === 'A') return { placements: e.botPlan({ w: m.view, s, lvl, rng: m.rng, budget: m.points, snap: { A: m.snap, C: [] }, lsA: m.lastSeen, diag }) };
  const rk = (k: number) => e.W * e.H - 1 - k;
  return { placements: e.botPlan({ w: e.turned(m.view), s, lvl, rng: m.rng, budget: m.points, snap: { A: m.snap.map(rk), C: [] }, lsA: e.turnedKeys(m.lastSeen), diag }).map(e.unturn) };
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
  /** Towers left at the end, and towers each side destroyed. */
  towersLeft?: Record<Side, number>;
  kills?: Kills;
  /** The first step each side saw any enemy piece (absent: never). */
  firstSight?: Partial<Record<Side, number>>;
  /** Points each side spent, turn by turn, and the points it had. */
  spent?: Record<Side, number[]>;
  had?: Record<Side, number[]>;
  /** Symbols each side formed (three symbol gliders coming to rest together). */
  formed?: Record<Side, number>;
}

/**
 * A whole match between two planners under a ruleset, the way a match is served: both sides plan from their
 * own view at the same time, the real board's placement check decides, then the engine runs to the next turn.
 * Every player, the old rungs (rungPlayer) too, gets only its view. `onTurn` (tests and measures only) is shown a copy
 * of the real board at each turn to act, before anyone plans; it never reaches a player.
 */
export function playSearchMatch(v: VersionRules, planners: () => Record<Side, Planner>, seed: number, onTurn?: (real: World, s: Settings) => void): SearchMatch {
  const r = rng(seed);
  const { s1, s2 } = drawRules(v, r);
  const L = layout(v, s1), e = engine(L);
  let s = s1;
  const w = e.world(s);
  const ls: Record<Side, Record<number, number>> = { C: {}, A: {} };
  L.towers.A.forEach((k) => (ls.C[k] = 0));
  L.towers.C.forEach((k) => (ls.A[k] = 0));
  const rs: Record<Side, () => number> = { C: rng(seed * 13 + 5), A: rng(seed * 7 + 1) };
  const P = planners();
  const out: SearchMatch = { win: 'D', step: 0, illegal: 0, turns: [], placed: { C: {}, A: {} }, firstSight: {}, spent: { C: [], A: [] }, had: { C: [], A: [] }, formed: { C: 0, A: 0 } };
  const saved: Record<Side, number> = { C: 0, A: 0 }, kills: Kills = { C: 0, A: 0, ...(s1.killReports ? { log: [] } : {}) };
  // Measures for the balance runs (nothing here changes the match).
  const enemyPieces = (o: Side) => { const x = o === 'C' ? 'A' : 'C', ks: number[] = []; for (const k in w.tw) if (w.tw[k] === x) ks.push(+k); for (const k in w.sq) if (w.sq[k].o === x) ks.push(+k); for (const g of w.gl) if (g.o === x) ks.push(e.K(g.x, g.y)); for (const f of ['mir', 'fa', 'sd'] as const) for (const k in w[f] ?? {}) { const v = (w[f] as Record<number, unknown>)[+k]; if ((typeof v === 'string' ? v : (v as { o: Side }).o) === x) ks.push(+k); } return ks; };
  const look = () => { for (const o of ['C', 'A'] as const) if (out.firstSight![o] === undefined) { const see = e.sees(w, s, o); if (enemyPieces(o).some((k) => see.has(k))) out.firstSight![o] = w.step; } };
  const seenFs = new Set<string>();
  const countFormed = () => { for (const k in w.fs ?? {}) { const id = `${k}@${w.fs![+k].at}`; if (!seenFs.has(id)) { seenFs.add(id); out.formed![w.fs![+k].o]++; } } };
  for (;;) {
    if (s2 && s === s1 && w.step >= s1.switchAt) s = s2;
    const snap = { C: e.towers(w, 'C'), A: e.towers(w, 'A') };
    const pts = (o: Side) => (w.step === 0 ? s.setupPoints : s.points) + saved[o];
    const pend: Record<Side, Placement<AnyPiece>[]> = { C: [], A: [] };
    onTurn?.(e.clone(w), s);
    for (const o of ['C', 'A'] as const) {
      const plan = P[o]({ e, s, o, view: e.fog(w, s, o), lastSeen: { ...ls[o] }, snap: snap[o], points: pts(o), rng: rs[o] });
      let ps = plan.placements;
      if (e.refuse(w, s, o, snap[o], pts(o), ps)) { out.illegal++; ps = []; }
      pend[o] = ps;
      for (const p of ps) out.placed[o][p.t] = (out.placed[o][p.t] ?? 0) + 1;
      out.turns.push({ step: w.step, side: o, steps: plan.steps ?? 0, placed: ps.map((p) => p.t).join('') });
    }
    for (const o of ['C', 'A'] as const) { const sp = pend[o].reduce((t, p) => t + e.cost(s, p.t), 0); out.spent![o].push(sp); out.had![o].push(pts(o)); }
    for (const o of ['C', 'A'] as const) saved[o] = Math.min(s.carryOver, pts(o) - pend[o].reduce((t, p) => t + e.cost(s, p.t), 0));
    e.apply(w, s, pend);
    e.updSeen(w, s, ls, kills);
    look();
    const from = w.step;
    do {
      e.step(w, s, kills);
      e.updSeen(w, s, ls, kills);
      look();
      countFormed();
      const end = verdict(e, w, s, kills);
      if (end) { out.win = end; out.step = w.step; out.towersLeft = { C: e.towers(w, 'C').length, A: e.towers(w, 'A').length }; out.kills = { ...kills }; return out; }
    } while (w.step - from < s.every);
  }
}
