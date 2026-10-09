/**
 * The Learn game's pieces model: RULES INVENTED FOR THIS EDITION, ported line for line from
 * Claude Design's "Minpentai Intro v3" (docs/design/minpentai-intro-v3.dc.html, the
 * `<script type="text/x-dc">` block). It is not the book's rule and not the sandbox's engine
 * (src/lib/minpentai/engine.ts, the rule recovered from figure c4-b5 / c4-b7); it is its own game.
 *
 * Map to Design's source (names kept):
 *   PW, PH, COST, P_, T_, G_, Q_, BASE  -> script lines 341–344
 *   pNew, pClone, towers, near          -> 345–348
 *   pStep                               -> 349–369
 *   DIRS, DIAG, RULES                   -> 370–371
 * scripts/test-minpentai-learn.ts runs Design's own functions beside these and compares.
 */

export const PW = 15;
export const PH = 10;
export type Kind = 'tower' | 'glider' | 'square' | 'rock';
export type Tool = 'glider' | 'square' | 'tower';
export type Costs = Record<Tool, number>;
export const COST: Costs = { glider: 4, square: 1, tower: 4 };

export interface Piece {
  k: Kind;
  x: number;
  y: number;
  /** The owner: 0 Cyan, 1 Amber. Rocks have none (undefined, as in Design). */
  p?: number;
  dx: number;
  dy: number;
  id: number;
  /** The glider's last three squares, newest first (for drawing). */
  trail: [number, number][];
  /** A square's hit points: undefined until its first hit, then 1 ("cracked"). */
  hp?: number;
  dead?: boolean;
  /** Placed this turn to act, so it can still be taken back. */
  mine?: boolean;
}
export type NewPiece = Omit<Piece, 'id' | 'trail'>;
export interface Hit { x: number; y: number; p: number | undefined; k: 'tower' | 'break' | 'crash' }
export interface PState { turn: number; pieces: Piece[]; nid: number; hits: Hit[] }

export const P_ = (k: Kind, x: number, y: number, p?: number, dx = 0, dy = 0): NewPiece => ({ k, x, y, p, dx, dy });
export const T_ = (x: number, y: number, p: number) => P_('tower', x, y, p);
export const G_ = (x: number, y: number, p: number, dx: number, dy: number) => P_('glider', x, y, p, dx, dy);
export const Q_ = (x: number, y: number, p: number) => P_('square', x, y, p);
/** Cyan towers at (2, 3) and (2, 7); Amber at (12, 3) and (12, 7). */
export const BASE = () => [T_(2, 3, 0), T_(2, 7, 0), T_(12, 3, 1), T_(12, 7, 1)];

export function pNew(list: NewPiece[]): PState {
  let id = 1;
  return { turn: 0, pieces: list.map((q) => ({ ...q, id: id++, trail: [] })), nid: id, hits: [] };
}
export const pClone = (s: PState): PState => ({ ...s, pieces: s.pieces.map((q) => ({ ...q, trail: q.trail.slice() })), hits: [] });
export const towers = (s: PState, p: number) => s.pieces.filter((q) => q.k === 'tower' && q.p === p).length;
/** Within Chebyshev distance r of one of player p's towers (sight and the build zone). */
export const near = (s: PState, x: number, y: number, r: number, p = 0) =>
  s.pieces.some((q) => q.k === 'tower' && q.p === p && Math.max(Math.abs(q.x - x), Math.abs(q.y - y)) <= r);

/**
 * One step. Each living glider, in list order: keeps its trail; at the edge it turns back on that
 * axis and waits; into an enemy tower, both are destroyed; into a square, the square loses a hit
 * point (2 to start) and at 0 both break, else the glider turns back; into anything else (a rock,
 * its own tower) it turns back; otherwise it moves. Then gliders of different players on one
 * square, or passing through each other, are both destroyed.
 */
export function pStep(s0: PState): PState {
  const s = pClone(s0);
  s.turn++;
  const at = (x: number, y: number) => s.pieces.find((q) => !q.dead && q.k !== 'glider' && q.x === x && q.y === y);
  for (const g of s.pieces) {
    if (g.k !== 'glider' || g.dead) continue;
    g.trail.unshift([g.x, g.y]);
    if (g.trail.length > 3) g.trail.length = 3;
    const nx = g.x + g.dx, ny = g.y + g.dy;
    const ox = nx < 0 || nx >= PW, oy = ny < 0 || ny >= PH;
    if (ox || oy) { if (ox) g.dx = -g.dx; if (oy) g.dy = -g.dy; continue; }
    const o = at(nx, ny);
    if (o && o.k === 'tower' && o.p !== g.p) { o.dead = g.dead = true; s.hits.push({ x: nx, y: ny, p: o.p, k: 'tower' }); continue; }
    if (o && o.k === 'square') {
      o.hp = (o.hp == null ? 2 : o.hp) - 1;
      if (o.hp <= 0) { o.dead = g.dead = true; s.hits.push({ x: nx, y: ny, p: o.p, k: 'break' }); continue; }
    }
    if (o) { g.dx = -g.dx; g.dy = -g.dy; continue; }
    g.x = nx;
    g.y = ny;
  }
  const gs = s.pieces.filter((q) => q.k === 'glider' && !q.dead);
  const swap = (a: Piece, b: Piece) =>
    a.trail[0] && b.trail[0] && a.x === b.trail[0][0] && a.y === b.trail[0][1] && b.x === a.trail[0][0] && b.y === a.trail[0][1];
  for (let i = 0; i < gs.length; i++) {
    for (let j = i + 1; j < gs.length; j++) {
      if (gs[i].p !== gs[j].p && ((gs[i].x === gs[j].x && gs[i].y === gs[j].y) || swap(gs[i], gs[j]))) {
        gs[i].dead = gs[j].dead = true;
        s.hits.push({ x: gs[i].x, y: gs[i].y, p: gs[i].p, k: 'crash' });
      }
    }
  }
  s.pieces = s.pieces.filter((q) => !q.dead);
  return s;
}

/** [dx, dy, arrow, words]; the words complete "Glider flies …". */
export type DirDef = [dx: number, dy: number, arrow: string, words: string];
export const DIRS: DirDef[] = [[-1, 0, '←', 'left'], [0, -1, '↑', 'up'], [0, 1, '↓', 'down'], [1, 0, '→', 'right']];
export const DIAG: DirDef[] = [[-1, -1, '↖', 'up left'], [1, -1, '↗', 'up right'], [-1, 1, '↙', 'down left'], [1, 1, '↘', 'down right']];

/** The practice match's four possible new rules; one is drawn at random per match. */
export interface NewRule { id: 'diag' | 'cost' | 'fog' | 'every'; diag?: true; cost?: Costs; fog?: number; every?: number }
export const RULES: NewRule[] = [
  { id: 'diag', diag: true },
  { id: 'cost', cost: { glider: 3, square: 1, tower: 4 } },
  { id: 'fog', fog: 2 },
  { id: 'every', every: 8 },
];
