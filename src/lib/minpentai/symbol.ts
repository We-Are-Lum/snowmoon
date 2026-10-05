/**
 * The sandbox symbol. Invented: the book never gives a symbol's shape.
 *
 * Chosen by scripts/search-minpentai-symbol.ts: the skew tetromino forms when the
 * rule's only glider strikes a rock (every rock shape tried, in 208 of 672 shots across
 * orientations), rarely forms by chance in random debris, and stays in place when
 * drawn on an empty board. Like the book's, it can form "for exactly one turn"
 * (c4-b113) on impact.
 *
 * When drawn alone it does not keep its shape: it cycles through other arrangements
 * in place, some of them in pieces. Each arrangement is a "state" here.
 *
 * Counting rule (invented): a symbol is counted wherever the live cells inside a
 * state's bounding box match that state exactly and the one-cell margin around the
 * box holds no live cells (rocks are allowed in the margin). Only this orientation
 * counts. `COUNT_MODE` picks whether every state of the cycle counts or only the
 * connected ones; see docs/minpentai-sandbox.md for why.
 */
import { emptyBoard, step, stamp, type Board } from './engine';

export const SYMBOL_ROWS = ['#..', '.##', '.#.'] as const;

export interface SymbolState {
  /** Live cells relative to the state's bounding box. */
  cells: [number, number][];
  w: number;
  h: number;
  connected: boolean;
  /** Pattern rows, for the legend. */
  rows: string[];
}

export type CountMode = 'all-states' | 'connected-states';
/** Set from the chance-match measurement (scripts/measure-minpentai-symbol.ts). */
export const COUNT_MODE: CountMode = 'all-states';

function isConnected(cells: [number, number][]): boolean {
  if (cells.length <= 1) return true;
  const key = (x: number, y: number) => `${x},${y}`;
  const set = new Set(cells.map(([x, y]) => key(x, y)));
  const seen = new Set([key(...cells[0])]);
  const stack = [cells[0]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const k = key(x + dx, y + dy);
      if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); }
    }
  }
  return seen.size === cells.length;
}

function normalise(cells: [number, number][]): SymbolState {
  const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
  const rel = cells.map(([x, y]) => [x - mx, y - my] as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const w = Math.max(...rel.map((c) => c[0])) + 1, h = Math.max(...rel.map((c) => c[1])) + 1;
  const rows = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (rel.some((c) => c[0] === x && c[1] === y) ? '#' : '.')).join(''));
  return { cells: rel, w, h, connected: isConnected(rel), rows };
}

/**
 * Every arrangement the symbol takes when drawn alone on an empty board, from either
 * turn parity and any position relative to the 2×2 block grid, over its full cycle.
 */
export function cycleStates(): SymbolState[] {
  const seen = new Map<string, SymbolState>();
  for (const turn of [0, 1]) for (const px of [0, 1]) for (const py of [0, 1]) {
    let b = stamp({ ...emptyBoard(32, 32), turn }, SYMBOL_ROWS, 12 + px, 12 + py);
    for (let t = 0; t < 16; t++) {
      const cells: [number, number][] = [];
      for (let i = 0; i < b.cells.length; i++) if (b.cells[i]) cells.push([i % b.w, Math.floor(i / b.w)]);
      const s = normalise(cells);
      seen.set(s.rows.join('/'), s);
      b = step(b);
    }
  }
  // The drawn shape first, then connected states, then the rest.
  const first = SYMBOL_ROWS.join('/');
  return [...seen.values()].sort(
    (a, b) => Number(b.rows.join('/') === first) - Number(a.rows.join('/') === first) || Number(b.connected) - Number(a.connected) || a.w * a.h - b.w * b.h,
  );
}

export const STATES = cycleStates();

export interface FoundSymbol {
  x: number;
  y: number;
  w: number;
  h: number;
  state: number;
}

/** Every recognised symbol on the board under `mode`. Wraps on all edges. */
export function findSymbols(board: Board, mode: CountMode = COUNT_MODE): FoundSymbol[] {
  const { w, h, cells } = board;
  const live = (x: number, y: number) => cells[(((y % h) + h) % h) * w + (((x % w) + w) % w)];
  const states = STATES.map((s, i) => ({ s, i })).filter(({ s }) => mode === 'all-states' || s.connected);
  const out: FoundSymbol[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!live(x, y)) continue;
      for (const { s, i } of states) {
        // Anchor the state's first cell (top row, leftmost) on this live cell.
        const ax = x - s.cells[0][0], ay = y - s.cells[0][1];
        let ok = true;
        for (let yy = -1; yy <= s.h && ok; yy++) {
          for (let xx = -1; xx <= s.w && ok; xx++) {
            const want = s.cells.some((c) => c[0] === xx && c[1] === yy) ? 1 : 0;
            if (live(ax + xx, ay + yy) !== want) ok = false;
          }
        }
        if (ok) out.push({ x: ((ax % w) + w) % w, y: ((ay % h) + h) % h, w: s.w, h: s.h, state: i });
      }
    }
  }
  return out;
}

export const countSymbols = (board: Board, mode: CountMode = COUNT_MODE) => findSymbols(board, mode).length;

/** For tests and presets: an empty board with the symbol drawn at (x, y). */
export function boardWithSymbol(x: number, y: number, turn = 0): Board {
  return stamp({ ...emptyBoard(), turn }, SYMBOL_ROWS, x, y);
}
