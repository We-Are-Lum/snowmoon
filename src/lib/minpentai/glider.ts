/**
 * Glider detection. Pure. The rule has one glider (scripts/search-minpentai-symbol.ts):
 * 4 cells, moving 2 cells every 4 turns in a straight line. A cluster counts as a
 * glider when it is 4 live cells with nothing else within two cells of it, and,
 * run on its own for 4 turns, it reappears 2 cells away in the same shape.
 */
import { emptyBoard, step, type Board } from './engine';

export interface FoundGlider {
  /** Top-left of the cluster's bounding box. */
  x: number;
  y: number;
  /** Direction of travel: one of (0,-1), (0,1), (-1,0), (1,0). */
  dx: number;
  dy: number;
}

const wrap = (v: number, m: number) => ((v % m) + m) % m;

function clusters(board: Board): [number, number][][] {
  const { w, h, cells } = board;
  const seen = new Uint8Array(w * h);
  const out: [number, number][][] = [];
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i] || seen[i]) continue;
    const comp: [number, number][] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % w, y = (j - x) / w;
      comp.push([x, y]);
      // Two-cell reach: a glider's cells are not all touching.
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const k = wrap(y + dy, h) * w + wrap(x + dx, w);
        if (cells[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    out.push(comp);
  }
  return out;
}

const shapeKey = (pts: [number, number][], w: number, h: number) => {
  // Unwrap around the first point so shapes that straddle an edge compare correctly.
  const [ax, ay] = pts[0];
  const rel = pts.map(([x, y]) => [wrap(x - ax + w / 2, w) - w / 2, wrap(y - ay + h / 2, h) - h / 2] as [number, number]);
  const mx = Math.min(...rel.map((p) => p[0])), my = Math.min(...rel.map((p) => p[1]));
  return {
    key: rel.map(([x, y]) => `${x - mx},${y - my}`).sort().join(' '),
    x: wrap(ax + mx, w),
    y: wrap(ay + my, h),
  };
};

export function findGliders(board: Board): FoundGlider[] {
  const out: FoundGlider[] = [];
  for (const comp of clusters(board)) {
    if (comp.length !== 4) continue;
    // No rock within two cells: a glider beside a rock is mid-collision, not travelling.
    const nearRock = comp.some(([x, y]) => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (board.rocks[wrap(y + dy, board.h) * board.w + wrap(x + dx, board.w)]) return true;
      return false;
    });
    if (nearRock) continue;
    let alone: Board = { ...emptyBoard(board.w, board.h), turn: board.turn };
    for (const [x, y] of comp) alone.cells[y * board.w + x] = 1;
    const before = shapeKey(comp, board.w, board.h);
    for (let i = 0; i < 4; i++) alone = step(alone);
    const pts: [number, number][] = [];
    for (let i = 0; i < alone.cells.length; i++) if (alone.cells[i]) pts.push([i % board.w, Math.floor(i / board.w)]);
    if (pts.length !== 4) continue;
    const after = shapeKey(pts, board.w, board.h);
    if (after.key !== before.key) continue;
    const ddx = wrap(after.x - before.x + board.w / 2, board.w) - board.w / 2;
    const ddy = wrap(after.y - before.y + board.h / 2, board.h) - board.h / 2;
    if (Math.abs(ddx) + Math.abs(ddy) !== 2 || (ddx && ddy)) continue;
    out.push({ x: before.x, y: before.y, dx: Math.sign(ddx), dy: Math.sign(ddy) });
  }
  return out;
}
