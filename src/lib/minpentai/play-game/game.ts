/**
 * The Play game: RULES INVENTED FOR THIS EDITION, as Claude Design's rules page sets them
 * (docs/design/minpentai-rules.dc.html, draft 1), ported line for line from Design's working
 * mockup (docs/design/minpentai-play-prototype.dc.html, the `<script type="text/x-dc">` block,
 * lines 1–117). It is not the book's rule (engine.ts, from figure c4-b5 / c4-b7) and not Learn's
 * game (learn-game/, Design's v3, which this page will replace once Design updates the lessons).
 *
 * Pure: no DOM, no clock. The server runs it for one-on-one; the page runs it for practice, the
 * computer ladder and free play. scripts/test-minpentai-play.ts runs Design's functions beside
 * these and compares.
 *
 * Names are Design's: W, H, MAXS, ROCKS, D4, D8, RULES, RUNGS, COST, K, XY, inb, rng, world,
 * clone, towers, lit, empty, step, botPlan, apply, updLS.
 */

export const W = 15;
export const H = 10;
/** The match stops at this step; most towers wins. */
export const MAXS = 96;
export const ROCKS: [number, number][] = [[6, 0], [9, 3], [7, 4], [7, 5], [5, 6], [8, 9]];
export type Side = 'C' | 'A';
export const COL: Record<Side, string> = { C: '#46D7E8', A: '#FFB43A' };
export const AR: Record<string, string> = { '1,0': '→', '-1,0': '←', '0,-1': '↑', '0,1': '↓', '1,-1': '↗', '1,1': '↘', '-1,1': '↙', '-1,-1': '↖' };
/** An arrow turned a quarter left: the board drawn upright (full screen on a phone). */
export const ROT: Record<string, string> = { '→': '↑', '↑': '←', '←': '↓', '↓': '→', '↗': '↖', '↖': '↙', '↙': '↘', '↘': '↗' };
export const D4: [number, number][] = [[-1, 0], [0, -1], [0, 1], [1, 0]];
export const D8: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
export type RuleId = 'diag' | 'cost3' | 'sight2' | 'every8';
/** The four new rules; one is drawn at the start of every practice, ladder and one-on-one match. */
export const RULES: Record<RuleId, string> = {
  diag: 'Gliders may also fly diagonally.',
  cost3: 'Gliders cost 3 points.',
  sight2: 'You see only 2 squares around your towers.',
  every8: 'Turns to act come every 8 steps.',
};
export const RULE_IDS = Object.keys(RULES) as RuleId[];
/** The computer ladder's five rungs (index 1–5). Names, behaviours and order are Design's. */
export const RUNGS: ({ n: string; d: string } | null)[] = [
  null,
  { n: 'Rival', d: 'Fires one glider a turn at a tower it can see. Never defends.' },
  { n: 'Blocker', d: 'Also puts squares in front of gliders it sees coming.' },
  { n: 'Builder', d: 'Also builds towers to see and reach further, and aims off rocks.' },
  { n: 'Opportunist', d: "Also uses the match's new rule against you." },
  { n: 'Planner', d: 'Tests its moves ahead on what it can see, and fires twice when it can.' },
];
export type Piece = 'g' | 's' | 't';
/** Square 1, tower 4; a glider's cost is the match's (4, or 3 under the cost rule). */
export const COST = { s: 1, t: 4 } as const;

export const K = (x: number, y: number) => y * W + x;
export const XY = (k: number): [number, number] => [k % W, (k / W) | 0];
export const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
/** Milliseconds left as m:ss, rounded up. */
export const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

/** Design's seeded random numbers (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Glider {
  id: number;
  o: Side;
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Working fields of a step. */
  tx?: number;
  ty?: number;
  stay?: number;
  dead?: boolean;
}
export interface Square { o: Side; hp: number }
export interface World {
  step: number;
  rock: Record<number, 1>;
  sq: Record<number, Square>;
  tw: Record<number, Side>;
  gl: Glider[];
  nid: number;
  /** Squares where something broke this step (drawn white for a moment). */
  flash: number[];
}

/** The practice board (rocks, two towers each, mirrored), or an empty one. */
export function world(empty?: boolean): World {
  const w: World = { step: 0, rock: {}, sq: {}, tw: {}, gl: [], nid: 1, flash: [] };
  if (!empty) {
    ROCKS.forEach(([x, y]) => (w.rock[K(x, y)] = 1));
    [[1, 2], [1, 7]].forEach(([x, y]) => (w.tw[K(x, y)] = 'C'));
    [[13, 2], [13, 7]].forEach(([x, y]) => (w.tw[K(x, y)] = 'A'));
  }
  return w;
}
export function clone(w: World): World {
  const sq: Record<number, Square> = {};
  for (const k in w.sq) sq[k] = { ...w.sq[k] };
  return { step: w.step, rock: { ...w.rock }, sq, tw: { ...w.tw }, gl: w.gl.map((g) => ({ ...g })), nid: w.nid, flash: (w.flash || []).slice() };
}
export function towers(w: World, o: Side): number[] {
  return Object.keys(w.tw).filter((k) => w.tw[+k] === o).map(Number);
}
/** Squares within R (counting diagonals) of player o's towers, or of the towers given. */
export function lit(w: World, o: Side, R: number, tws?: number[]): Set<number> {
  const s = new Set<number>();
  (tws || towers(w, o)).forEach((k) => {
    const [x, y] = XY(k);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (inb(x + dx, y + dy)) s.add(K(x + dx, y + dy));
  });
  return s;
}
export function empty(w: World, k: number): boolean {
  return !w.rock[k] && !w.sq[k] && !w.tw[k] && !w.gl.some((g) => K(g.x, g.y) === k);
}

/** One step, rules page §3: all gliders at once. Mutates and returns w. */
export function step(w: World): World {
  const gl = w.gl;
  w.flash = [];
  for (const g of gl) {
    g.dead = false;
    const tx = g.x + g.dx, ty = g.y + g.dy, bx = tx < 0 || tx >= W, by = ty < 0 || ty >= H;
    if (bx) g.dx = -g.dx;
    if (by) g.dy = -g.dy;
    if (bx || by) { g.tx = g.x; g.ty = g.y; g.stay = 1; } else { g.tx = tx; g.ty = ty; g.stay = 0; }
  }
  for (let i = 0; i < gl.length; i++) for (let j = i + 1; j < gl.length; j++) {
    const a = gl[i], b = gl[j];
    if (a.o === b.o) continue;
    if ((a.tx === b.tx && a.ty === b.ty) || (a.x + a.tx! === b.x + b.tx! && a.y + a.ty! === b.y + b.ty!)) {
      a.dead = b.dead = true;
      w.flash.push(K(a.tx!, a.ty!));
    }
  }
  for (const g of gl.filter((g) => !g.dead).sort((a, b) => a.id - b.id)) {
    if (g.stay) continue;
    const k = K(g.tx!, g.ty!);
    if (w.rock[k]) { g.dx = -g.dx; g.dy = -g.dy; continue; }
    const s = w.sq[k];
    if (s) {
      if (s.hp > 1) { s.hp = 1; g.dx = -g.dx; g.dy = -g.dy; } else { delete w.sq[k]; g.dead = true; w.flash.push(k); }
      continue;
    }
    const t = w.tw[k];
    if (t) {
      if (t !== g.o) { delete w.tw[k]; g.dead = true; w.flash.push(k); } else { g.dx = -g.dx; g.dy = -g.dy; }
      continue;
    }
    g.x = g.tx!;
    g.y = g.ty!;
  }
  w.gl = gl.filter((g) => !g.dead);
  w.step++;
  return w;
}

/** A piece placed on a turn to act. */
export interface Placement { t: Piece; o: Side; x: number; y: number; dx: number; dy: number }

/** What botPlan and apply need of a match. */
export interface PlanInput {
  w: World;
  /** 0 practice, 1–5 the ladder's rungs, 3 Design's stand-in opponent. */
  lvl: number;
  R: number;
  rng: () => number;
  cost: number;
  every: number;
  rule: RuleId;
  /** Each side's towers when the turn to act began (where it may place). */
  snap: Record<Side, number[]>;
  /** Where Amber last saw each of Cyan's towers (square → step). */
  lsA: Record<number, number>;
}

/** The computer player (Amber): sees only what its towers light (rules page §8). */
export function botPlan(m: PlanInput): Placement[] {
  const w = m.w, o: Side = 'A', e: Side = 'C', L = m.lvl, R = m.R, r = m.rng, cost = m.cost;
  const used = new Set<number>(), out: Placement[] = [];
  let pts = 8;
  const zoneAll = [...lit(w, o, R, m.snap.A)].filter((k) => empty(w, k));
  const zone = () => zoneAll.filter((k) => !used.has(k));
  const see = lit(w, o, R);
  const b = world(true);
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
    pts -= t === 'g' ? cost : COST[t];
    if (t === 's') b.sq[k] = { o, hp: 2 };
    if (t === 't') b.tw[k] = o;
  };
  const cnt = (s: World, who: Side) => Object.values(s.tw).filter((t) => t === who).length;
  const dirs = m.rule === 'diag' && L >= 4 ? D8 : D4;
  if (L >= 2) {
    let n = 0;
    for (const g of b.gl) {
      if (g.o !== e || n >= 2 || pts < 1) continue;
      const sw = clone(b);
      sw.gl = [{ ...g }];
      const base = cnt(sw, o), path: number[] = [];
      for (let i = 0; i < m.every + 6; i++) {
        const q = sw.gl[0];
        if (!q) break;
        if (inb(q.x + q.dx, q.y + q.dy)) path.push(K(q.x + q.dx, q.y + q.dy));
        step(sw);
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
        if (L <= 2) {
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
          const lim = Math.min(40, MAXS - b.step);
          for (let n = 1; n <= lim; n++) {
            step(sw);
            if (!sw.gl.some((g) => g.id === 1e6)) { if (cnt(sw, e) < base) cs.push({ k, dx, dy, s: 100 - n }); break; }
          }
        }
      }
    }
    return cs.sort((a, c) => c.s - a.s);
  };
  const c = pts >= cost ? shots() : [];
  if (c.length) {
    const p = L <= 1 ? c[Math.floor(r() * Math.min(c.length, 5))] : c[0];
    add('g', p.k, p.dx, p.dy);
  } else if (pts >= cost && (L > 0 || r() < 0.85)) {
    const rows = Object.keys(m.lsA).map((k) => XY(+k)[1]);
    let z = zone().filter((k) => rows.includes(XY(k)[1]));
    if (!z.length) z = zone();
    if (z.length) add('g', z[Math.floor(r() * z.length)], -1, 0);
  }
  if (L >= 3 && pts >= 4 && cnt(b, o) < (L >= 5 ? 3 : 5)) {
    const z = zone();
    if (z.length) {
      const mx = Math.min(...z.map((k) => XY(k)[0]));
      const f = z.filter((k) => XY(k)[0] === mx);
      add('t', f[Math.floor(r() * f.length)]);
    }
  }
  if (L >= 5 && pts >= cost) {
    const c2 = shots().filter((s) => !used.has(s.k));
    if (c2.length) add('g', c2[0].k, c2[0].dx, c2[0].dy);
  }
  if (L >= 2) {
    let n = 0;
    for (const tk of towers(w, o)) {
      const [tx, ty] = XY(tk);
      for (const [dx, dy] of [[-1, 0], [-1, -1], [-1, 1]]) {
        if (pts < 1 || n >= 3) break;
        const x = tx + dx, y = ty + dy;
        if (!inb(x, y)) continue;
        const k = K(x, y);
        if (zoneAll.includes(k) && !used.has(k)) { add('s', k); n++; }
      }
    }
  }
  return out;
}

/** Both sides' placements appear at once; two on one square cancel each other (rules page §4). */
export function apply(m: { w: World; pend: Record<Side, Placement[]> }) {
  const w = m.w, all = [...m.pend.C, ...m.pend.A], n: Record<number, number> = {};
  all.forEach((p) => { const k = K(p.x, p.y); n[k] = (n[k] || 0) + 1; });
  all.forEach((p) => {
    const k = K(p.x, p.y);
    if (n[k] > 1) return;
    if (p.t === 'g') w.gl.push({ id: w.nid++, o: p.o, x: p.x, y: p.y, dx: p.dx, dy: p.dy });
    else if (p.t === 's') w.sq[k] = { o: p.o, hp: 2 };
    else w.tw[k] = p.o;
  });
}

/** "Last seen": where each side last saw the other's towers (rules page §5). */
export function updLS(m: { w: World; R: number; lsC: Record<number, number>; lsA: Record<number, number> }) {
  lit(m.w, 'C', m.R).forEach((k) => { if (m.w.tw[k] === 'A') m.lsC[k] = m.w.step; else delete m.lsC[k]; });
  lit(m.w, 'A', m.R).forEach((k) => { if (m.w.tw[k] === 'C') m.lsA[k] = m.w.step; else delete m.lsA[k]; });
}
