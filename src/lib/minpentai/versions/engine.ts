/**
 * Play's engine for any version (design spike, 2026-10-21): play-game/game.ts's world, step,
 * apply, updLS and botPlan, with every constant and rule switch read from a version's settings
 * instead. Under Play's own settings it plays exactly as game.ts does, move for move
 * (scripts/test-minpentai-versions.ts compares whole matches). game.ts itself is unchanged.
 *
 * Pure: no DOM, no clock. Settings are data; nothing here runs code from a version.
 */
import { rng } from '../play-game/rng';
import { BASE, BASE_DRAWN, assertFog, type DrawnRule, type Settings, type Version } from './schema';

export { rng };
export type Side = 'C' | 'A';
export type Piece = 'g' | 's' | 't';
export const other = (s: Side): Side => (s === 'C' ? 'A' : 'C');
const D4: [number, number][] = [[-1, 0], [0, -1], [0, 1], [1, 0]];
const D8: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
/** Under rocks "split", no new glider once this many are on the board. */
export const SPLIT_CAP = 60;
/** The most towers a computer player builds (rungs 3-5). */
export const BOT_TOWER_CAP = 10;
/** Play's rocks on its 15 x 10 board (game.ts ROCKS); scaled for other sizes. */
const PLAY_ROCKS: [number, number][] = [[6, 0], [9, 3], [7, 4], [7, 5], [5, 6], [8, 9]];

export interface Glider { id: number; o: Side; x: number; y: number; dx: number; dy: number; tx?: number; ty?: number; stay?: number; dead?: boolean }
export interface Square { o: Side; hp: number }
export interface World {
  step: number;
  /** A rock's hits left (under "breakable"; otherwise 1 and unused). */
  rock: Record<number, number>;
  sq: Record<number, Square>;
  tw: Record<number, Side>;
  gl: Glider[];
  nid: number;
  flash: number[];
}
/** Towers each side has destroyed this match (for "first-blood"). Kept beside the world, not in it,
 * so a world has exactly the shape Play has always saved. */
export type Kills = Record<Side, number>;
export interface Placement { t: Piece; o: Side; x: number; y: number; dx: number; dy: number }

/** The board a version starts from: size, rocks, towers. Fixed for the match. */
export interface Layout { W: number; H: number; rocks: number[]; towers: Record<Side, number[]> }

/** Cyan's start rows: Play's 2 and 7 on 10 rows, spread evenly for other counts and heights. */
function startRows(H: number, n: number): number[] {
  if (n === 1) return [Math.floor((H - 1) / 2)];
  const m = Math.round(H / 5);
  return Array.from({ length: n }, (_, i) => m + Math.round((i * (H - 1 - 2 * m)) / (n - 1)));
}

export function layout(v: Pick<Version, 'rocksAt'>, s: Settings): Layout {
  const W = s.width, H = s.height, K = (x: number, y: number) => y * W + x;
  const turn = (k: number) => W * H - 1 - k;
  const twC = startRows(H, s.startTowers).map((y) => K(1, y));
  const twA = twC.map(turn);
  const taken = new Set([...twC, ...twA]);
  const half = v.rocksAt ?? (W === 15 && H === 10 ? PLAY_ROCKS : PLAY_ROCKS.map(([x, y]) => [Math.round((x * (W - 1)) / 14), Math.round((y * (H - 1)) / 9)] as [number, number]));
  const rocks = new Set<number>();
  for (const [x, y] of half) for (const k of [K(x, y), turn(K(x, y))]) if (!taken.has(k)) rocks.add(k);
  return { W, H, rocks: [...rocks].sort((a, b) => a - b), towers: { C: twC, A: twA } };
}

/** The settings for each part of a match: before the switch, and after it (if any). */
export function drawRules(v: Pick<Version, 'set' | 'drawn'>, r: () => number): { first: DrawnRule | null; second: DrawnRule | null; s1: Settings; s2: Settings | null } {
  const s0: Settings = { ...BASE, ...v.set };
  const pool = v.drawn ?? BASE_DRAWN;
  // The first random number always draws (as the page does), even with no list, so the computer
  // players' numbers are the same whatever the list holds.
  const a = r();
  const first = pool.length ? pool[Math.floor(a * pool.length)] : null;
  const s1 = { ...s0, ...(first?.set ?? {}) };
  assertFog(s1);
  if (!s0.switchAt) return { first, second: null, s1, s2: null };
  const rest = pool.filter((d) => d !== first);
  const second = rest[Math.floor(r() * rest.length)];
  const s2 = { ...s0, ...second.set };
  assertFog(s2);
  return { first, second, s1, s2 };
}

/** The engine for one board size; the rules in force are passed to each call. */
export function engine(L: Layout) {
  const { W, H } = L;
  const K = (x: number, y: number) => y * W + x;
  const XY = (k: number): [number, number] => [k % W, (k / W) | 0];
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

  function world(s: Settings, blank?: boolean): World {
    const w: World = { step: 0, rock: {}, sq: {}, tw: {}, gl: [], nid: 1, flash: [] };
    if (!blank) {
      L.rocks.forEach((k) => (w.rock[k] = s.rocks === 'breakable' ? s.rockHits : 1));
      L.towers.C.forEach((k) => (w.tw[k] = 'C'));
      L.towers.A.forEach((k) => (w.tw[k] = 'A'));
    }
    return w;
  }
  function clone(w: World): World {
    const sq: Record<number, Square> = {};
    for (const k in w.sq) sq[k] = { ...w.sq[k] };
    return { step: w.step, rock: { ...w.rock }, sq, tw: { ...w.tw }, gl: w.gl.map((g) => ({ ...g })), nid: w.nid, flash: (w.flash || []).slice() };
  }
  const towers = (w: World, o: Side) => Object.keys(w.tw).filter((k) => w.tw[+k] === o).map(Number);
  function lit(w: World, o: Side, R: number, tws?: number[]): Set<number> {
    const s = new Set<number>();
    (tws || towers(w, o)).forEach((k) => {
      const [x, y] = XY(k);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (inb(x + dx, y + dy)) s.add(K(x + dx, y + dy));
    });
    return s;
  }
  const empty = (w: World, k: number) => !w.rock[k] && !w.sq[k] && !w.tw[k] && !w.gl.some((g) => K(g.x, g.y) === k);

  /** One step (game.ts step), with the version's edges, rocks, square hits, own towers, same-side meetings and debris. */
  function step(w: World, s: Settings, kills?: Kills): World {
    const gl = w.gl;
    w.flash = [];
    const wrap = s.edges === 'wrap', vanish = s.edges === 'vanish', gone = new Set<Glider>();
    for (const g of gl) {
      g.dead = false;
      let tx = g.x + g.dx, ty = g.y + g.dy;
      const bx = tx < 0 || tx >= W, by = ty < 0 || ty >= H;
      if ((bx || by) && wrap) { tx = (tx + W) % W; ty = (ty + H) % H; g.tx = tx; g.ty = ty; g.stay = 0; continue; }
      if ((bx || by) && vanish) { g.tx = g.x; g.ty = g.y; g.stay = 1; g.dead = true; gone.add(g); continue; }
      if (bx) g.dx = -g.dx;
      if (by) g.dy = -g.dy;
      if (bx || by) { g.tx = g.x; g.ty = g.y; g.stay = 1; } else { g.tx = tx; g.ty = ty; g.stay = 0; }
    }
    // Meeting: the same target, or the same midpoint (swapping or crossing). Midpoints are doubled
    // and compared modulo the board, so a wrapped move meets as it should; off a wrapping board
    // this is game.ts's test exactly.
    const mid = (g: Glider, ax: 'x' | 'y') => {
      const n = ax === 'x' ? W : H, from = g[ax], d = g.stay ? 0 : ax === 'x' ? g.dx : g.dy;
      return (((2 * from + d) % (2 * n)) + 2 * n) % (2 * n);
    };
    for (let i = 0; i < gl.length; i++) for (let j = i + 1; j < gl.length; j++) {
      const a = gl[i], b = gl[j];
      if (a.o === b.o && s.sameSide === 'pass') continue;
      // A glider flying off the board under "vanish" meets nothing.
      if (gone.has(a) || gone.has(b)) continue;
      if ((a.tx === b.tx && a.ty === b.ty) || (mid(a, 'x') === mid(b, 'x') && mid(a, 'y') === mid(b, 'y'))) {
        a.dead = b.dead = true;
        w.flash.push(K(a.tx!, a.ty!));
      }
    }
    const born: Glider[] = [];
    const bounce = (g: Glider) => { g.dx = -g.dx; g.dy = -g.dy; };
    const broke = (k: number) => { w.flash.push(k); if (s.debris === 'rock') w.rock[k] = s.rocks === 'breakable' ? s.rockHits : 1; };
    for (const g of gl.filter((g) => !g.dead).sort((a, b) => a.id - b.id)) {
      if (g.stay) continue;
      const k = K(g.tx!, g.ty!);
      if (w.rock[k]) {
        if (s.rocks === 'absorb') { g.dead = true; w.flash.push(k); }
        else if (s.rocks === 'breakable' && w.rock[k] <= 1) { delete w.rock[k]; g.dead = true; w.flash.push(k); }
        else {
          if (s.rocks === 'breakable') w.rock[k]--;
          if (s.rocks === 'split' && gl.length + born.length < SPLIT_CAP) born.push({ id: 0, o: g.o, x: g.x, y: g.y, dx: -g.dy, dy: g.dx });
          bounce(g);
        }
        continue;
      }
      const q = w.sq[k];
      if (q) {
        if (q.hp > 1) { q.hp--; bounce(g); } else { delete w.sq[k]; g.dead = true; broke(k); }
        continue;
      }
      const t = w.tw[k];
      if (t) {
        if (t !== g.o || s.ownTower === 'destroy') { delete w.tw[k]; g.dead = true; if (kills) kills[g.o]++; broke(k); } else bounce(g);
        continue;
      }
      g.x = g.tx!;
      g.y = g.ty!;
    }
    w.gl = gl.filter((g) => !g.dead);
    for (const b of born) { b.id = w.nid++; w.gl.push(b); }
    w.step++;
    return w;
  }

  /** Both sides' placements appear at once; two on one square cancel (game.ts apply). */
  function apply(w: World, s: Settings, pend: Record<Side, Placement[]>) {
    const all = [...pend.C, ...pend.A], n: Record<number, number> = {};
    all.forEach((p) => { const k = K(p.x, p.y); n[k] = (n[k] || 0) + 1; });
    all.forEach((p) => {
      const k = K(p.x, p.y);
      if (n[k] > 1) return;
      if (p.t === 'g') w.gl.push({ id: w.nid++, o: p.o, x: p.x, y: p.y, dx: p.dx, dy: p.dy });
      else if (p.t === 's') w.sq[k] = { o: p.o, hp: s.squareHits };
      else w.tw[k] = p.o;
    });
  }

  function updLS(w: World, R: number, ls: Record<Side, Record<number, number>>) {
    lit(w, 'C', R).forEach((k) => { if (w.tw[k] === 'A') ls.C[k] = w.step; else delete ls.C[k]; });
    lit(w, 'A', R).forEach((k) => { if (w.tw[k] === 'C') ls.A[k] = w.step; else delete ls.A[k]; });
  }

  const cost = (s: Settings, t: Piece) => (t === 'g' ? s.costGlider : t === 's' ? s.costSquare : s.costTower);

  /** Why a side's placements break the rules, or null (the server's checkPlacements, for any version). */
  function refuse(w: World, s: Settings, o: Side, snap: number[], budget: number, ps: Placement[]): string | null {
    const zone = lit(w, o, s.reach, snap), seen = new Set<number>(), dirs = s.directions === 8 ? D8 : D4;
    let spent = 0, tw = towers(w, o).length;
    for (const p of ps) {
      if (p.o !== o) return 'wrong side';
      if (!inb(p.x, p.y)) return 'off the board';
      const k = K(p.x, p.y);
      if (!zone.has(k)) return `out of reach at ${p.x},${p.y}`;
      if (!empty(w, k)) return `not empty at ${p.x},${p.y}`;
      if (seen.has(k)) return 'two on one square';
      seen.add(k);
      if (p.t === 'g' && !dirs.some(([dx, dy]) => dx === p.dx && dy === p.dy)) return 'a direction the rules do not allow';
      if (p.t === 't' && s.maxTowers && ++tw > s.maxTowers) return 'more towers than allowed';
      spent += cost(s, p.t);
    }
    return spent > budget ? `spent ${spent} of ${budget}` : null;
  }

  /**
   * The computer player (Amber), game.ts botPlan with the version's numbers: its budget, costs,
   * reach, sight, directions, tower cap and step limit. It sees only what its towers light.
   */
  function botPlan(m: { w: World; s: Settings; lvl: number; rng: () => number; budget: number; snap: Record<Side, number[]>; lsA: Record<number, number>; diag: boolean }): Placement[] {
    const w = m.w, s = m.s, o: Side = 'A', e: Side = 'C', Lv = m.lvl, r = m.rng, gc = s.costGlider, sc = s.costSquare, tc = s.costTower;
    const used = new Set<number>(), out: Placement[] = [];
    let pts = m.budget;
    const zoneAll = [...lit(w, o, s.reach, m.snap.A)].filter((k) => empty(w, k));
    const zone = () => zoneAll.filter((k) => !used.has(k));
    const see = lit(w, o, s.sight);
    const b = world(s, true);
    Object.assign(b.rock, w.rock);
    b.step = w.step;
    for (const k in w.tw) if (w.tw[k] === o) b.tw[k] = o;
    for (const k in m.lsA) b.tw[k] = e;
    for (const k in w.sq) if (w.sq[k].o === o || see.has(+k)) b.sq[k] = { ...w.sq[k] };
    b.gl = w.gl.filter((g) => see.has(K(g.x, g.y))).map((g) => ({ ...g }));
    const add = (t: Piece, k: number, dx = 0, dy = 0) => {
      const [x, y] = XY(k);
      out.push({ t, o, x, y, dx, dy });
      used.add(k);
      pts -= cost(s, t);
      if (t === 's') b.sq[k] = { o, hp: s.squareHits };
      if (t === 't') b.tw[k] = o;
    };
    const cnt = (sw: World, who: Side) => Object.values(sw.tw).filter((t) => t === who).length;
    // Rungs 4 and 5 aim diagonally when the rules allow it (game.ts: under the "diag" rule only).
    const dirs = m.diag && Lv >= 4 ? D8 : D4;
    if (Lv >= 2) {
      let n = 0;
      for (const g of b.gl) {
        if (g.o !== e || n >= 2 || pts < sc) continue;
        const sw = clone(b);
        sw.gl = [{ ...g }];
        const base = cnt(sw, o), path: number[] = [];
        for (let i = 0; i < s.every + 6; i++) {
          const q = sw.gl[0];
          if (!q) break;
          if (inb(q.x + q.dx, q.y + q.dy)) path.push(K(q.x + q.dx, q.y + q.dy));
          step(sw, s);
          if (!sw.gl.length) {
            if (cnt(sw, o) < base) {
              const c = path.find((k) => zoneAll.includes(k) && !used.has(k));
              if (c !== undefined) { add('s', c); n++; }
            }
            break;
          }
        }
      }
    }
    const shots = () => {
      const cs: { k: number; dx: number; dy: number; s: number }[] = [], base = cnt(b, e);
      for (const k of zone()) {
        const [x, y] = XY(k);
        for (const [dx, dy] of dirs) {
          if (Lv <= 2) {
            let cx = x + dx, cy = y + dy, n = 1;
            while (inb(cx, cy)) {
              const kk = K(cx, cy);
              if (b.rock[kk] || b.sq[kk]) break;
              if (b.tw[kk]) { if (b.tw[kk] === e) cs.push({ k, dx, dy, s: 100 - n }); break; }
              cx += dx; cy += dy; n++;
            }
          } else {
            const sw = clone(b);
            sw.gl.push({ id: 1e6, o, x, y, dx, dy });
            const lim = Math.min(40, s.maxSteps - b.step);
            for (let n = 1; n <= lim; n++) {
              step(sw, s);
              if (!sw.gl.some((g) => g.id === 1e6)) { if (cnt(sw, e) < base) cs.push({ k, dx, dy, s: 100 - n }); break; }
            }
          }
        }
      }
      return cs.sort((a, c) => c.s - a.s);
    };
    const c = pts >= gc ? shots() : [];
    if (c.length) {
      const p = Lv <= 1 ? c[Math.floor(r() * Math.min(c.length, 5))] : c[0];
      add('g', p.k, p.dx, p.dy);
    } else if (pts >= gc && (Lv > 0 || r() < 0.85)) {
      const rows = Object.keys(m.lsA).map((k) => XY(+k)[1]);
      let z = zone().filter((k) => rows.includes(XY(k)[1]));
      if (!z.length) z = zone();
      if (z.length) add('g', z[Math.floor(r() * z.length)], -1, 0);
    }
    // Builders stop at 10 towers, or at the version's limit if lower. It was 5 until 2026-10-22: Luis's
    // play tests showed the computer needs room to be aggressive (owner, 2026-10-22, with 120 steps).
    const cap = s.maxTowers ? Math.min(BOT_TOWER_CAP, s.maxTowers) : BOT_TOWER_CAP;
    if (Lv >= 3 && pts >= tc && cnt(b, o) < cap) {
      const z = zone();
      if (z.length) {
        const mx = Math.min(...z.map((k) => XY(k)[0]));
        const f = z.filter((k) => XY(k)[0] === mx);
        add('t', f[Math.floor(r() * f.length)]);
      }
    }
    if (Lv >= 5 && pts >= gc) {
      const c2 = shots().filter((sh) => !used.has(sh.k));
      if (c2.length) add('g', c2[0].k, c2[0].dx, c2[0].dy);
    }
    if (Lv >= 2) {
      let n = 0;
      for (const tk of towers(w, o)) {
        const [tx, ty] = XY(tk);
        for (const [dx, dy] of [[-1, 0], [-1, -1], [-1, 1]]) {
          if (pts < sc || n >= 3) break;
          const x = tx + dx, y = ty + dy;
          if (!inb(x, y)) continue;
          const k = K(x, y);
          if (zoneAll.includes(k) && !used.has(k)) { add('s', k); n++; }
        }
      }
    }
    return out;
  }

  /** The board turned 180 degrees with the colours swapped, so Amber's player can play Cyan. */
  const rk = (k: number) => W * H - 1 - k;
  function turned(w: World): World {
    const m = clone(w);
    m.tw = {}; m.sq = {}; m.rock = {};
    for (const k in w.tw) m.tw[rk(+k)] = other(w.tw[k]);
    for (const k in w.sq) m.sq[rk(+k)] = { ...w.sq[k], o: other(w.sq[k].o) };
    for (const k in w.rock) m.rock[rk(+k)] = w.rock[k];
    m.gl = w.gl.map((g) => ({ ...g, o: other(g.o), x: W - 1 - g.x, y: H - 1 - g.y, dx: -g.dx, dy: -g.dy }));
    return m;
  }
  const turnedKeys = (o: Record<number, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [rk(+k), v]));
  const unturn = (p: Placement): Placement => ({ ...p, o: 'C', x: W - 1 - p.x, y: H - 1 - p.y, dx: -p.dx, dy: -p.dy });

  return { L, W, H, K, XY, inb, world, clone, towers, lit, empty, step, apply, updLS, refuse, botPlan, turned, turnedKeys, unturn, cost };
}

export type Engine = ReturnType<typeof engine>;

/** The result of a side's tower count, the version's way. */
export function verdict(e: Engine, w: World, s: Settings, kills: Kills = { C: 0, A: 0 }): Side | 'D' | null {
  const nc = e.towers(w, 'C').length, na = e.towers(w, 'A').length;
  if (s.win === 'first-blood' && (kills.C || kills.A || !nc || !na)) {
    const c = kills.C + (na ? 0 : 1), a = kills.A + (nc ? 0 : 1);
    return c > a ? 'C' : a > c ? 'A' : 'D';
  }
  if (!nc && !na) return 'D';
  if (!nc) return 'A';
  if (!na) return 'C';
  if (w.step >= s.maxSteps) return nc > na ? 'C' : na > nc ? 'A' : 'D';
  return null;
}

export interface TurnLog { step: number; C: Placement[]; A: Placement[]; budget: Record<Side, number>; refused: Record<Side, string | null> }
export interface MatchLog {
  win: Side | 'D';
  step: number;
  first: string | null;
  second: string | null;
  turns: TurnLog[];
  towersAt: { step: number; C: number; A: number }[];
  maxGliders: number;
  /** Turns where a computer player's placements broke the rules (dropped, never applied). */
  illegal: number;
  /** How it ended: a side lost its towers, the step limit, or first blood. */
  how: 'towers' | 'time' | 'first-blood';
}

/**
 * A computer-against-computer match, as the ladder test plays one (scripts/test-minpentai-ladder.ts):
 * Amber is botPlan; Cyan is botPlan on the turned board. `pass` makes both sides place nothing after
 * setup (the "first move decides it" check).
 */
export function playVersion(v: Pick<Version, 'set' | 'drawn' | 'rocksAt'>, lvlC: number, lvlA: number, seed: number, opts: { pass?: boolean } = {}): MatchLog {
  const r = rng(seed);
  const { first, second, s1, s2 } = drawRules(v, r);
  const L = layout(v, s1);
  const e = engine(L);
  let s = s1;
  const w0 = e.world(s);
  const ls: Record<Side, Record<number, number>> = { C: {}, A: {} };
  L.towers.A.forEach((k) => (ls.C[k] = 0));
  L.towers.C.forEach((k) => (ls.A[k] = 0));
  const m = { w: w0 };
  const rA = rng(seed * 7 + 1), rC = rng(seed * 13 + 5);
  const log: MatchLog = { how: 'towers', win: 'D', step: 0, first: first?.id ?? null, second: second?.id ?? null, turns: [], towersAt: [], maxGliders: 0, illegal: 0 };
  const saved: Record<Side, number> = { C: 0, A: 0 }, kills: Kills = { C: 0, A: 0 };
  for (;;) {
    if (s2 && s === s1 && m.w.step >= s1.switchAt) s = s2;
    const w = m.w, snap = { C: e.towers(w, 'C'), A: e.towers(w, 'A') };
    const setup = w.step === 0;
    const budget = { C: (setup ? s.setupPoints : s.points) + saved.C, A: (setup ? s.setupPoints : s.points) + saved.A };
    const diag = s.directions === 8;
    let a = e.botPlan({ w, s, lvl: lvlA, rng: rA, budget: budget.A, snap, lsA: ls.A, diag });
    let c = e.botPlan({ w: e.turned(w), s, lvl: lvlC, rng: rC, budget: budget.C, snap: { C: snap.A.map((k) => W1(L) - k), A: snap.C.map((k) => W1(L) - k) }, lsA: e.turnedKeys(ls.C), diag }).map(e.unturn);
    if (opts.pass && !setup) { a = []; c = []; }
    const refused = { C: e.refuse(w, s, 'C', snap.C, budget.C, c), A: e.refuse(w, s, 'A', snap.A, budget.A, a) };
    if (refused.C) { log.illegal++; c = []; }
    if (refused.A) { log.illegal++; a = []; }
    for (const [o, ps] of [['C', c], ['A', a]] as const) saved[o] = Math.min(s.carryOver, budget[o] - ps.reduce((t, p) => t + e.cost(s, p.t), 0));
    log.turns.push({ step: w.step, C: c, A: a, budget, refused });
    e.apply(m.w, s, { C: c, A: a });
    e.updLS(m.w, s.sight, ls);
    log.towersAt.push({ step: w.step, C: e.towers(m.w, 'C').length, A: e.towers(m.w, 'A').length });
    const from = m.w.step;
    do {
      e.step(m.w, s, kills);
      e.updLS(m.w, s.sight, ls);
      log.maxGliders = Math.max(log.maxGliders, m.w.gl.length);
      const v2 = verdict(e, m.w, s, kills);
      if (v2) {
        log.win = v2; log.step = m.w.step;
        const alive = e.towers(m.w, 'C').length && e.towers(m.w, 'A').length;
        log.how = s.win === 'first-blood' && (kills.C || kills.A) ? 'first-blood' : alive ? 'time' : 'towers';
        return log;
      }
    } while (m.w.step - from < s.every);
  }
}
const W1 = (L: Layout) => L.W * L.H - 1;
