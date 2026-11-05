import type { Engine, Side, World } from './engine';
import type { Settings } from './schema';

/**
 * A side's own pieces as it last saw them (owner, 2026-11-04, after the book-4 playtest: "always list my own pieces;
 * those out of sight appear as last seen, never in their live state", and "give the computer the same memory").
 *
 * The fog view (engine fog) shows a side's own squares, mirrors, factories, resting symbol gliders, walls and gliders
 * only where it sees them: their live state out of sight would tell what the enemy did to them in the dark. So each
 * side keeps this memory instead, updated from its own view after the placements appear and after every step (as
 * engine.updSeen keeps last-seen enemy towers): where it sees a square, the memory takes what is there now (or forgets
 * what was there); where it doesn't, the memory keeps what it last saw. Nothing here reads the real board out of sight.
 *
 * Gliders and moving walls move, so they are kept by their own number (the side knows its own pieces): a glider while
 * it may still be flying where the side can't see (forgotten a turn after it was last seen); a wall until the squares it
 * was last seen on are all in sight without it.
 *
 * Stored as plain JSON in an agent-play match (solo.ts SoloMatch.own).
 */
export interface OwnSeen {
  sq: Record<number, { hp: number; step: number }>;
  mir: Record<number, { d: number; hp: number; step: number }>;
  fa: Record<number, { dx: number; dy: number; hp: number; step: number }>;
  sd: Record<number, { step: number }>;
  /** Gliders by their number on the real board (server-side only; never shown), as last seen in sight. */
  gl: Record<number, { x: number; y: number; dx: number; dy: number; seed?: 1; step: number }>;
  /** Moving walls by their number, as last seen with any square in sight. */
  mw: Record<number, { x: number; y: number; dx: number; dy: number; c: number[]; step: number }>;
}

export const emptyOwnSeen = (): OwnSeen => ({ sq: {}, mir: {}, fa: {}, sd: {}, gl: {}, mw: {} });

/** Updates side o's memory of its own pieces from what it sees on board w now. */
export function updOwnSeen(e: Engine, w: World, s: Settings, o: Side, mem: OwnSeen) {
  const see = e.sees(w, s, o), v = e.fog(w, s, o), step = w.step;
  for (const k of see) {
    const q = v.sq[k];
    if (q && q.o === o) mem.sq[k] = { hp: q.hp, step }; else delete mem.sq[k];
    const m = v.mir?.[k];
    if (m && m.o === o) mem.mir[k] = { d: m.d, hp: m.hp, step }; else delete mem.mir[k];
    const f = v.fa?.[k];
    if (f && f.o === o) mem.fa[k] = { dx: f.dx, dy: f.dy, hp: f.hp, step }; else delete mem.fa[k];
    if (v.sd?.[k] === o) mem.sd[k] = { step }; else delete mem.sd[k];
  }
  // Gliders: refreshed while in sight. One not in sight now is forgotten when it can't be flying in the dark (it sees
  // as it flies, or the square it was flying into is in sight), or a turn after it was last seen.
  const shown = new Set<number>();
  for (const g of w.gl) if (g.o === o && !g.dead && see.has(e.K(g.x, g.y))) { shown.add(g.id); mem.gl[g.id] = { x: g.x, y: g.y, dx: g.dx, dy: g.dy, ...(g.seed ? { seed: 1 as const } : {}), step }; }
  for (const id of Object.keys(mem.gl).map(Number)) {
    if (shown.has(id)) continue;
    const g = mem.gl[id], nx = g.x + g.dx, ny = g.y + g.dy;
    const sees = (g.seed ? s.symbolGliderSight : s.gliderSight) ?? 0;
    if (step - g.step > s.every || (g.step === step - 1 && (sees > 0 || !e.inb(nx, ny) || see.has(e.K(nx, ny))))) delete mem.gl[id];
  }
  // Moving walls: refreshed while any square of theirs is in sight (as the view shows them); forgotten once every square
  // they were last seen on is in sight without them.
  const walls = new Set<number>();
  for (const m of w.mw ?? []) {
    if (m.o !== o || !m.c.some(Boolean)) continue;
    if (!e.wallCells(m).some(([x, y], i) => m.c[i] && e.inb(x, y) && see.has(e.K(x, y)))) continue;
    walls.add(m.id);
    mem.mw[m.id] = { x: m.x, y: m.y, dx: m.dx, dy: m.dy, c: e.wallCells(m).map(([x, y], i) => (e.inb(x, y) && see.has(e.K(x, y)) ? m.c[i] : 1)), step };
  }
  for (const id of Object.keys(mem.mw).map(Number)) {
    if (walls.has(id)) continue;
    const m = mem.mw[id];
    if (e.wallCells(m).every(([x, y], i) => !m.c[i] || !e.inb(x, y) || see.has(e.K(x, y)))) delete mem.mw[id];
  }
}

/** The pieces the memory holds that side o doesn't see on board w now (what a view lists as last seen). */
export function outOfSight(e: Engine, w: World, s: Settings, o: Side, mem: OwnSeen): OwnSeen {
  const see = e.sees(w, s, o), out = emptyOwnSeen(), step = w.step;
  for (const f of ['sq', 'mir', 'fa', 'sd'] as const) for (const k in mem[f]) if (!see.has(+k)) (out[f] as Record<number, unknown>)[+k] = mem[f][+k];
  for (const id in mem.gl) if (mem.gl[id].step < step) out.gl[+id] = mem.gl[id];
  for (const id in mem.mw) if (mem.mw[id].step < step) out.mw[+id] = mem.mw[id];
  return out;
}

/**
 * A belief (search.ts belief()) with side o's pieces that stand still (squares, mirrors, factories, resting symbol
 * gliders) where it last saw them, on squares its view leaves empty: the view has none of its own pieces out of sight.
 * Gliders and walls move, so they are left out.
 */
export function withOwnSeen(e: Engine, b: World, o: Side, mem: OwnSeen | undefined): World {
  if (!mem) return b;
  for (const k in mem.sq) if (e.empty(b, +k)) b.sq[+k] = { o, hp: mem.sq[+k].hp };
  for (const k in mem.mir) if (e.empty(b, +k)) (b.mir ??= {})[+k] = { o, d: mem.mir[+k].d, hp: mem.mir[+k].hp };
  for (const k in mem.fa) if (e.empty(b, +k)) (b.fa ??= {})[+k] = { o, dx: mem.fa[+k].dx, dy: mem.fa[+k].dy, hp: mem.fa[+k].hp };
  for (const k in mem.sd) if (e.empty(b, +k)) (b.sd ??= {})[+k] = o;
  return b;
}
