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
/** Play's pieces: glider, square, tower. */
export type Piece = 'g' | 's' | 't';
/**
 * The book edition's (off unless a ruleset sets their cost): m mirror wall (dx 1 is "/", -1 is "\\"),
 * e symbol glider (flies like a glider), w moving wall (x, y is its middle square; dx, dy where it flies),
 * f glider factory (dx, dy where it fires; its rock is behind it).
 */
export type BookPiece = 'm' | 'e' | 'w' | 'f';
export type AnyPiece = Piece | BookPiece;
export const other = (s: Side): Side => (s === 'C' ? 'A' : 'C');
const D4: [number, number][] = [[-1, 0], [0, -1], [0, 1], [1, 0]];
const D8: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
/** The setting that gives each book-edition piece its cost (0 or absent: off). */
const BOOK_COST: Record<BookPiece, 'costMirror' | 'costSeed' | 'costWall' | 'costFactory'> = { m: 'costMirror', e: 'costSeed', w: 'costWall', f: 'costFactory' };
const copyEach = <T extends object>(o: Record<number, T>): Record<number, T> => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { ...v }]));
/** Under rocks "split", no new glider once this many are on the board. */
export const SPLIT_CAP = 60;
/** Play's rocks on its 15 x 10 board (game.ts ROCKS); scaled for other sizes. */
const PLAY_ROCKS: [number, number][] = [[6, 0], [9, 3], [7, 4], [7, 5], [5, 6], [8, 9]];

export interface Glider { id: number; o: Side; x: number; y: number; dx: number; dy: number; tx?: number; ty?: number; stay?: number; dead?: boolean; /** A symbol glider (book edition). */ seed?: 1 }
/** Book edition: a moving wall, three squares across its line of flight; c[i] is 1 while square i stands. */
export interface MovingWall { id: number; o: Side; x: number; y: number; dx: number; dy: number; c: number[]; stop?: 1 }
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
  // The book edition's pieces. Absent unless one was made, so Play's worlds keep their shape.
  /** Mirror walls: slant 1 "/" or -1 "\\", hits left. */
  mir?: Record<number, { o: Side; d: number; hp: number }>;
  /** Symbol gliders that have come to rest against something solid. */
  sd?: Record<number, Side>;
  /** Symbols formed by three symbol gliders, with the step they formed: they last until the next turn to act. */
  fs?: Record<number, { o: Side; at: number }>;
  mw?: MovingWall[];
  /** Glider factories: where they fire, hits left. The rock that feeds one is behind it. */
  fa?: Record<number, { o: Side; dx: number; dy: number; hp: number }>;
  /** Each rock's ore, when rocks hold ore. */
  ore?: Record<number, number>;
}
/** Towers each side has destroyed this match (for "first-blood"). Kept beside the world, not in it,
 * so a world has exactly the shape Play has always saved. */
export type Kills = Record<Side, number>;
export interface Placement<T extends AnyPiece = Piece> { t: T; o: Side; x: number; y: number; dx: number; dy: number }

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
      if (s.ore) { const ore: Record<number, number> = {}; L.rocks.forEach((k) => (ore[k] = s.ore!)); w.ore = ore; }
    }
    return w;
  }
  function clone(w: World): World {
    const sq: Record<number, Square> = {};
    for (const k in w.sq) sq[k] = { ...w.sq[k] };
    const c: World = { step: w.step, rock: { ...w.rock }, sq, tw: { ...w.tw }, gl: w.gl.map((g) => ({ ...g })), nid: w.nid, flash: (w.flash || []).slice() };
    // The book edition's pieces, only when there are any (Play's worlds keep their shape).
    if (w.mir) c.mir = copyEach(w.mir);
    if (w.sd) c.sd = { ...w.sd };
    if (w.fs) c.fs = copyEach(w.fs);
    if (w.mw) c.mw = w.mw.map((m) => ({ ...m, c: m.c.slice() }));
    if (w.fa) c.fa = copyEach(w.fa);
    if (w.ore) c.ore = { ...w.ore };
    return c;
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
  /** A moving wall's three squares, across its line of flight, from one end to the other. */
  const wallCells = (m: { x: number; y: number; dx: number; dy: number }): [number, number][] => [-1, 0, 1].map((i) => [m.x - i * m.dy, m.y + i * m.dx]);
  /** The moving wall standing on a square, and which of its squares it is. */
  function wallAt(w: World, k: number): { m: MovingWall; i: number } | null {
    for (const m of w.mw ?? []) {
      const cs = wallCells(m);
      for (let i = 0; i < 3; i++) if (m.c[i] && inb(cs[i][0], cs[i][1]) && K(cs[i][0], cs[i][1]) === k) return { m, i };
    }
    return null;
  }
  /** Something a glider can't fly into: a rock, square, tower, or a book-edition piece. */
  const solid = (w: World, k: number) => !!(w.rock[k] || w.sq[k] || w.tw[k] || w.mir?.[k] || w.sd?.[k] || w.fa?.[k] || (w.mw && wallAt(w, k)));
  const empty = (w: World, k: number) => !w.rock[k] && !w.sq[k] && !w.tw[k] && !w.gl.some((g) => K(g.x, g.y) === k) && !(w.mir?.[k] || w.sd?.[k] || w.fa?.[k] || (w.mw && wallAt(w, k)));
  /** Book edition: a forming symbol is walled in when every square a glider could come from is solid or off the board. */
  const walledIn = (w: World, s: Settings, k: number) => {
    const [x, y] = XY(k);
    return (s.directions === 8 ? D8 : D4).every(([dx, dy]) => !inb(x + dx, y + dy) || solid(w, K(x + dx, y + dy)));
  };

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
    // The book edition's pieces (none in Play, so none of this runs there).
    const book = !!(w.mir || w.sd || w.mw || w.fa || w.ore) || gl.some((g) => g.seed), lodged: number[] = [], fed: { k: number; g: Glider }[] = [];
    /** A symbol glider stops where it is, against what it hit (unless another glider is standing there). */
    const lodge = (g: Glider) => {
      g.dead = true;
      const k = K(g.x, g.y);
      if (gl.some((h) => h !== g && !h.dead && h.x === g.x && h.y === g.y)) { w.flash.push(k); return; }
      (w.sd ??= {})[k] = g.o;
      lodged.push(k);
    };
    /** A rock that holds ore feeds each factory standing against it one glider, out of the factory's front (fired once the step's hits are done). */
    const feed = (k: number) => {
      const [rx, ry] = XY(k);
      for (const [dx, dy] of D4) {
        const f = inb(rx + dx, ry + dy) ? w.fa?.[K(rx + dx, ry + dy)] : undefined;
        if (!f || f.dx !== dx || f.dy !== dy || !inb(rx + 2 * dx, ry + 2 * dy)) continue;
        fed.push({ k, g: { id: 0, o: f.o, x: rx + 2 * dx, y: ry + 2 * dy, dx, dy } });
      }
    };
    /** A glider meeting a book-edition piece; false when there is none on the square. */
    const bookHit = (g: Glider, k: number): boolean => {
      const mi = w.mir?.[k];
      if (mi) {
        if (--mi.hp <= 0) { delete w.mir![k]; g.dead = true; w.flash.push(k); return true; }
        // "/" turns east to north, "\\" east to south; a diagonal glider flying along the slant goes straight back.
        const { dx, dy } = g;
        if (mi.d > 0) { g.dx = -dy; g.dy = -dx; } else { g.dx = dy; g.dy = dx; }
        if (g.dx === dx && g.dy === dy) bounce(g);
        return true;
      }
      if (w.sd?.[k]) { if (g.seed) lodge(g); else { delete w.sd[k]; g.dead = true; w.flash.push(k); } return true; }
      const f = w.fa?.[k];
      if (f) {
        if (g.seed) lodge(g);
        else if (f.hp > 1) { f.hp--; bounce(g); } else { delete w.fa![k]; g.dead = true; broke(k); }
        return true;
      }
      const at = w.mw && wallAt(w, k);
      if (at) {
        if (g.seed) lodge(g);
        else if (g.dx * at.m.dx + g.dy * at.m.dy < 0) bounce(g);
        else { at.m.c[at.i] = 0; g.dead = true; broke(k); }
        return true;
      }
      return false;
    };
    for (const g of gl.filter((g) => !g.dead).sort((a, b) => a.id - b.id)) {
      if (g.stay) continue;
      const k = K(g.tx!, g.ty!);
      if (book && bookHit(g, k)) continue;
      if (w.rock[k]) {
        if (w.ore?.[k]) feed(k);
        if (g.seed) { lodge(g); continue; }
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
        if (g.seed) { lodge(g); continue; }
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
    if (book) {
      // A factory fires when its front square is empty and its rock has ore; a rock whose ore is spent crumbles.
      for (const { k, g: b } of fed) {
        if (!w.ore?.[k] || !empty(w, K(b.x, b.y))) continue;
        b.id = w.nid++;
        w.gl.push(b);
        if (!--w.ore[k]) { delete w.rock[k]; delete w.ore[k]; w.flash.push(k); }
      }
      if (w.mw) moveWalls(w);
      if (lodged.length) converge(w, lodged);
    }
    w.step++;
    return w;
  }

  /**
   * Book edition: moving walls go one square every second step. A wall waits while a glider stands
   * where it would go, and stops for good at the edge, a rock, a tower or any other piece.
   */
  function moveWalls(w: World) {
    w.mw = w.mw!.filter((m) => m.c.some(Boolean));
    if (w.step % 2 !== 1) return;
    for (const m of w.mw) {
      if (m.stop) continue;
      let wait = false, stop = false;
      for (const [x, y] of wallCells(m).filter((_, i) => m.c[i])) {
        const tx = x + m.dx, ty = y + m.dy;
        if (!inb(tx, ty) || solid(w, K(tx, ty))) { stop = true; break; }
        if (w.gl.some((g) => g.x === tx && g.y === ty)) wait = true;
      }
      if (stop) m.stop = 1;
      else if (!wait) { m.x += m.dx; m.y += m.dy; }
    }
  }

  /**
   * Book edition: three symbol gliders of one side at rest within one 3 x 3 box come together into
   * that side's symbol, on the square of the one that came to rest last. It is a tower until the next
   * turn to act ends; then it stays only if walled in (apply).
   */
  function converge(w: World, lodged: number[]) {
    for (const k of [...new Set(lodged)].sort((a, b) => a - b)) {
      const o = w.sd?.[k];
      if (!o) continue;
      const [x, y] = XY(k);
      const near = Object.keys(w.sd!).map(Number).filter((j) => j !== k && w.sd![j] === o && Math.abs(XY(j)[0] - x) <= 2 && Math.abs(XY(j)[1] - y) <= 2).sort((a, b) => a - b);
      let pair: number[] | null = null;
      for (let i = 0; i < near.length && !pair; i++) for (let j = i + 1; j < near.length && !pair; j++) {
        const xs = [x, XY(near[i])[0], XY(near[j])[0]], ys = [y, XY(near[i])[1], XY(near[j])[1]];
        if (Math.max(...xs) - Math.min(...xs) <= 2 && Math.max(...ys) - Math.min(...ys) <= 2) pair = [near[i], near[j]];
      }
      if (!pair) continue;
      for (const j of [k, ...pair]) delete w.sd![j];
      w.tw[k] = o;
      (w.fs ??= {})[k] = { o, at: w.step };
      w.flash.push(k);
    }
  }

  /** Both sides' placements appear at once; two on one square cancel (game.ts apply). */
  function apply(w: World, s: Settings, pend: Record<Side, Placement<AnyPiece>[]>) {
    const all = [...pend.C, ...pend.A], n: Record<number, number> = {};
    // A moving wall takes three squares; anything else one.
    const cells = (p: Placement<AnyPiece>) => (p.t === 'w' ? wallCells(p).map(([x, y]) => K(x, y)) : [K(p.x, p.y)]);
    all.forEach((p) => { for (const k of cells(p)) n[k] = (n[k] || 0) + 1; });
    all.forEach((p) => {
      const k = K(p.x, p.y);
      if (cells(p).some((c) => n[c] > 1)) return;
      if (p.t === 'g') w.gl.push({ id: w.nid++, o: p.o, x: p.x, y: p.y, dx: p.dx, dy: p.dy });
      else if (p.t === 's') w.sq[k] = { o: p.o, hp: s.squareHits };
      else if (p.t === 'm') (w.mir ??= {})[k] = { o: p.o, d: p.dx, hp: s.mirrorHits ?? 3 };
      else if (p.t === 'e') w.gl.push({ id: w.nid++, o: p.o, x: p.x, y: p.y, dx: p.dx, dy: p.dy, seed: 1 });
      else if (p.t === 'w') (w.mw ??= []).push({ id: w.nid++, o: p.o, x: p.x, y: p.y, dx: p.dx, dy: p.dy, c: [1, 1, 1] });
      else if (p.t === 'f') (w.fa ??= {})[k] = { o: p.o, dx: p.dx, dy: p.dy, hp: s.factoryHits ?? 2 };
      else w.tw[k] = p.o;
    });
    // Book edition: a symbol formed since the last turn to act stays only if this turn walled it in.
    if (w.fs) for (const k of Object.keys(w.fs).map(Number)) {
      const f = w.fs[k];
      delete w.fs[k];
      if (w.tw[k] === f.o && !walledIn(w, s, k)) { delete w.tw[k]; w.flash.push(k); }
    }
  }

  function updLS(w: World, R: number, ls: Record<Side, Record<number, number>>) {
    lit(w, 'C', R).forEach((k) => { if (w.tw[k] === 'A') ls.C[k] = w.step; else delete ls.C[k]; });
    lit(w, 'A', R).forEach((k) => { if (w.tw[k] === 'C') ls.A[k] = w.step; else delete ls.A[k]; });
  }

  const cost = (s: Settings, t: AnyPiece) => (t === 'g' ? s.costGlider : t === 's' ? s.costSquare : t in BOOK_COST ? s[BOOK_COST[t as BookPiece]] ?? 0 : s.costTower);

  /** Why a side's placements break the rules, or null (the server's checkPlacements, for any version). */
  function refuse(w: World, s: Settings, o: Side, snap: number[], budget: number, ps: Placement<AnyPiece>[]): string | null {
    const zone = lit(w, o, s.reach, snap), seen = new Set<number>(), dirs = s.directions === 8 ? D8 : D4;
    let spent = 0, tw = towers(w, o).length;
    for (const p of ps) {
      if (p.o !== o) return 'wrong side';
      if (!inb(p.x, p.y)) return 'off the board';
      // Book edition pieces exist only where a ruleset gives them a cost.
      const bookPiece = p.t in BOOK_COST;
      if (bookPiece && !(cost(s, p.t) > 0)) return 'not a piece in these rules';
      // Every square a piece takes must be empty and within reach (so, within sight: nothing hidden decides it).
      for (const [x, y] of p.t === 'w' ? wallCells(p) : [[p.x, p.y]]) {
        if (!inb(x, y)) return 'off the board';
        const k = K(x, y);
        if (!zone.has(k)) return `out of reach at ${x},${y}`;
        if (!empty(w, k)) return `not empty at ${x},${y}`;
        if (seen.has(k)) return 'two on one square';
        seen.add(k);
      }
      if ((p.t === 'g' || p.t === 'e') && !dirs.some(([dx, dy]) => dx === p.dx && dy === p.dy)) return 'a direction the rules do not allow';
      if ((p.t === 'w' || p.t === 'f') && !D4.some(([dx, dy]) => dx === p.dx && dy === p.dy)) return 'a direction the rules do not allow';
      if (p.t === 'm' && !((p.dx === 1 || p.dx === -1) && p.dy === 0)) return 'a mirror leans one of two ways';
      if (p.t === 'f') {
        const rx = p.x - p.dx, ry = p.y - p.dy;
        if (!inb(rx, ry) || !w.rock[K(rx, ry)] || !zone.has(K(rx, ry))) return 'a factory needs a rock behind it, within reach';
      }
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
    // Builders stop at the ruleset's botTowers (5 in solo-v1, 10 in solo-v2: Luis's play tests showed the
    // computer needs room to be aggressive; owner, 2026-10-22), or at the version's limit if lower.
    const cap = s.maxTowers ? Math.min(s.botTowers, s.maxTowers) : s.botTowers;
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
    // Book edition: a half turn keeps a mirror's slant and a wall's order of squares.
    const keyed = <T,>(o: Record<number, T>, f: (v: T) => T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [rk(+k), f(v)]));
    if (w.mir) m.mir = keyed(w.mir, (v) => ({ ...v, o: other(v.o) }));
    if (w.sd) m.sd = keyed(w.sd, other);
    if (w.fs) m.fs = keyed(w.fs, (v) => ({ ...v, o: other(v.o) }));
    if (w.fa) m.fa = keyed(w.fa, (v) => ({ ...v, o: other(v.o), dx: -v.dx, dy: -v.dy }));
    if (w.ore) m.ore = keyed(w.ore, (v) => v);
    if (w.mw) m.mw = w.mw.map((v) => ({ ...v, o: other(v.o), x: W - 1 - v.x, y: H - 1 - v.y, dx: -v.dx, dy: -v.dy, c: v.c.slice() }));
    return m;
  }
  const turnedKeys = (o: Record<number, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [rk(+k), v]));
  const unturn = (p: Placement): Placement => ({ ...p, o: 'C', x: W - 1 - p.x, y: H - 1 - p.y, dx: -p.dx, dy: -p.dy });

  /**
   * Every single placement side o may make now, in a fixed order (square, then piece, then direction):
   * each one the placement check accepts on its own, for every piece the rules allow. Placing reads only
   * squares within reach, so this is the same on the side's own view of the board (fog) as on the real one.
   */
  function legal(w: World, s: Settings, o: Side, snap: number[], budget: number): Placement<AnyPiece>[] {
    const dirs = s.directions === 8 ? D8 : D4, none: [number, number][] = [[0, 0]];
    const kinds: [AnyPiece, [number, number][]][] = [['g', dirs], ['s', none], ['t', none]];
    if (s.costMirror) kinds.push(['m', [[1, 0], [-1, 0]]]);
    if (s.costSeed) kinds.push(['e', dirs]);
    if (s.costWall) kinds.push(['w', D4]);
    if (s.costFactory) kinds.push(['f', D4]);
    const out: Placement<AnyPiece>[] = [];
    for (const k of [...lit(w, o, s.reach, snap)].sort((a, b) => a - b)) {
      if (!empty(w, k)) continue;
      const [x, y] = XY(k);
      for (const [t, ds] of kinds) for (const [dx, dy] of ds) {
        const p: Placement<AnyPiece> = { t, o, x, y, dx, dy };
        if (!refuse(w, s, o, snap, budget, [p])) out.push(p);
      }
    }
    return out;
  }

  /**
   * How side o is doing on a board: a side with no towers left first (sooner is better), then 100 a tower
   * ahead, less 15 for each line a glider could fly along into one of its towers (and more for the enemy's),
   * half a point a square it sees, 2 a glider of its own in flight; at the step limit, 5,000 more for the side
   * ahead. Towers are what wins and what gives sight; a symbol still forming counts as the tower it may become.
   */
  function score(w: World, s: Settings, o: Side): number {
    const a = towers(w, o).length, c = towers(w, other(o)).length;
    if (!a && !c) return 0;
    if (!c) return 10_000 - w.step;
    if (!a) return -10_000 + w.step;
    let mine = 0;
    for (const g of w.gl) if (g.o === o) mine++;
    const margin = 100 * (a - c) - 15 * (open(w, s, o) - open(w, s, other(o))) + 0.5 * lit(w, o, s.sight).size + 2 * mine;
    // At the step limit most towers wins; the margin still counts, so a side behind still tries to catch up.
    if (w.step >= s.maxSteps) return margin + (a > c ? 5_000 : a < c ? -5_000 : 0);
    return margin;
  }
  /** Lines a glider could fly along into side o's towers: from each tower, each direction gliders fly, open for at least two squares. */
  function open(w: World, s: Settings, o: Side): number {
    let n = 0;
    for (const k of towers(w, o)) {
      const [x, y] = XY(k);
      for (const [dx, dy] of s.directions === 8 ? D8 : D4) {
        let d = 1;
        while (d <= 2 && inb(x + d * dx, y + d * dy) && !solid(w, K(x + d * dx, y + d * dy))) d++;
        if (d > 2) n++;
      }
    }
    return n;
  }

  /**
   * What side o sees (the same rule as players.ts fogView, with the book edition's pieces): its own pieces,
   * and every piece on a square within sight of its towers. Rocks are shown everywhere as they were at the
   * start; where rocks hold ore (and so can crumble), the real rock and its ore only within sight.
   */
  function fog(w: World, s: Settings, o: Side): World {
    const see = lit(w, o, s.sight), v = world(s, true);
    v.step = w.step;
    // Rocks: out of sight, as they were at the start (a rock can crumble or be hit where nobody sees it); in sight,
    // as they are. A rock's ore only where it and every square beside it are in sight: otherwise a hidden factory's
    // firing would show as ore spent (fog review, 2026-10-31).
    const start = s.rocks === 'breakable' ? s.rockHits : 1;
    for (const k of L.rocks) if (!see.has(k)) v.rock[k] = start;
    for (const k of see) if (w.rock[k]) v.rock[k] = w.rock[k];
    if (w.ore) {
      const ore: Record<number, number> = {};
      const around = (k: number) => { const [x, y] = XY(k); return D4.every(([dx, dy]) => !inb(x + dx, y + dy) || see.has(K(x + dx, y + dy))); };
      for (const k in v.rock) ore[+k] = see.has(+k) && around(+k) && w.ore[+k] !== undefined ? w.ore[+k] : s.ore ?? 0;
      v.ore = ore;
    }
    // Only what is in sight, the side's own pieces too: its towers always are; a square, mirror, factory, resting
    // symbol glider or moving wall out of sight could otherwise sense hidden pieces (where it came to rest, its hits
    // left). The side knows where it placed them (fog review, 2026-10-31).
    const shown = (k: number | string) => see.has(+k);
    for (const k in w.tw) if (w.tw[k] === o || shown(k)) v.tw[k] = w.tw[k];
    for (const k in w.sq) if (shown(k)) v.sq[k] = { ...w.sq[k] };
    // Gliders in sight, numbered afresh in the same order: a real id would count the pieces made out of sight.
    v.gl = w.gl.filter((g) => see.has(K(g.x, g.y))).sort((a, b) => a.id - b.id).map((g, i) => ({ ...g, id: i + 1, tx: undefined, ty: undefined, stay: undefined, dead: undefined }));
    v.nid = v.gl.length + 1;
    const keep = <T extends object>(from: Record<number, T> | undefined) => {
      if (!from) return undefined;
      const out: Record<number, T> = {};
      for (const k in from) if (shown(k)) out[k] = { ...from[k] };
      return out;
    };
    if (w.mir) v.mir = keep(w.mir);
    if (w.fa) v.fa = keep(w.fa);
    if (w.fs) v.fs = keep(w.fs);
    if (w.sd) { v.sd = {}; for (const k in w.sd) if (shown(k)) v.sd[k] = w.sd[k]; }
    // A moving wall with any square in sight: where it is and where it flies; a square out of sight shown standing;
    // never whether it has stopped (that can come from a square out of sight).
    if (w.mw) v.mw = w.mw.filter((m) => wallCells(m).some(([x, y], i) => m.c[i] && inb(x, y) && see.has(K(x, y))))
      .map((m, j) => ({ id: j + 1, o: m.o, x: m.x, y: m.y, dx: m.dx, dy: m.dy, c: m.c.map((c, i) => { const [x, y] = wallCells(m)[i]; return inb(x, y) && see.has(K(x, y)) ? c : 1; }) }));
    // An empty list says nothing; its being there at all would say the enemy has such a piece somewhere.
    for (const f of ['mir', 'fa', 'fs', 'sd', 'mw'] as const) if (v[f] && !Object.keys(v[f]!).length) delete v[f];
    return v;
  }

  return { L, W, H, K, XY, inb, world, clone, towers, lit, empty, step, apply, updLS, refuse, botPlan, turned, turnedKeys, unturn, cost, wallCells, wallAt, solid, walledIn, legal, score, fog, open };
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
