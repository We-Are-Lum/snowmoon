/**
 * Minpentai sandbox engine. Pure functions, no UI, no I/O.
 *
 * From the book (docs/minpentai-rules.md, section 3.1): the rule animated in figure
 * c4-b5, "rotate one eighty if three" (c4-b7). The board updates in 2×2 blocks whose
 * partition alternates: on even turns blocks start at (0,0), on odd turns at (1,1).
 * Shown in the cell-conserving form:
 *
 *   live cells in block   even turn            odd turn
 *   0, 4                  unchanged            unchanged
 *   1                     unchanged            rotated 180°
 *   2                     complemented         complemented
 *   3                     rotated 180°         unchanged
 *
 * This is the Critters rule with every odd turn drawn inverted. Each turn's map is
 * its own inverse, so stepping back from turn t applies turn t-1's map again.
 *
 * Invented here, not in the book:
 * - Board size 48 × 32, wrapping on all edges.
 * - Rocks: fixed cells. A block that contains a rock is left unchanged that turn.
 *   That keeps each turn's map a bijection (an involution, even), so the rules
 *   still run backward exactly and live cells are still conserved.
 */

export const WIDTH = 48;
export const HEIGHT = 32;

export interface Board {
  w: number;
  h: number;
  /** 1 = live cell, row-major. Never 1 where `rocks` is 1. */
  cells: Uint8Array;
  /** 1 = rock (invented). Fixed for the whole game. */
  rocks: Uint8Array;
  /** Turns since the start; may go negative when stepping back. */
  turn: number;
}

/** A 2×2 block in reading order: top-left, top-right, bottom-left, bottom-right. */
export type Block = readonly [number, number, number, number];

export function emptyBoard(w = WIDTH, h = HEIGHT): Board {
  if (w % 2 || h % 2) throw new Error('board sides must be even for 2×2 blocks to wrap');
  return { w, h, cells: new Uint8Array(w * h), rocks: new Uint8Array(w * h), turn: 0 };
}

/** 0 on even turns, 1 on odd turns; also the block offset for the step out of that turn. */
export const phase = (turn: number) => ((turn % 2) + 2) % 2;

const rot180 = (b: Block): Block => [b[3], b[2], b[1], b[0]];
const complement = (b: Block): Block => [1 - b[0], 1 - b[1], 1 - b[2], 1 - b[3]];

/** The book's block rule for one phase (cell-conserving form). Each phase map is an involution. */
export function blockRule(ph: number, b: Block): Block {
  const n = b[0] + b[1] + b[2] + b[3];
  if (n === 2) return complement(b);
  if (ph === 0) return n === 3 ? rot180(b) : b;
  return n === 1 ? rot180(b) : b;
}

/** Applies phase `ph`'s block map to the whole board. Blocks holding a rock are skipped. */
function applyPhase(board: Board, ph: number): Uint8Array {
  const { w, h, cells, rocks } = board;
  const out = new Uint8Array(cells);
  for (let y0 = ph; y0 < h + ph; y0 += 2) {
    for (let x0 = ph; x0 < w + ph; x0 += 2) {
      const xa = x0 % w, xb = (x0 + 1) % w, ya = y0 % h, yb = (y0 + 1) % h;
      const idx = [ya * w + xa, ya * w + xb, yb * w + xa, yb * w + xb] as const;
      if (rocks[idx[0]] || rocks[idx[1]] || rocks[idx[2]] || rocks[idx[3]]) continue;
      const nb = blockRule(ph, [cells[idx[0]], cells[idx[1]], cells[idx[2]], cells[idx[3]]]);
      out[idx[0]] = nb[0]; out[idx[1]] = nb[1]; out[idx[2]] = nb[2]; out[idx[3]] = nb[3];
    }
  }
  return out;
}

/** One turn forward: turn t uses blocks at offset (t mod 2). */
export function step(board: Board): Board {
  return { ...board, cells: applyPhase(board, phase(board.turn)), turn: board.turn + 1 };
}

/** One turn back: undoes the step from turn t-1, which is its own inverse. */
export function stepBack(board: Board): Board {
  return { ...board, cells: applyPhase(board, phase(board.turn - 1)), turn: board.turn - 1 };
}

export function liveCount(board: Board): number {
  let n = 0;
  for (const v of board.cells) n += v;
  return n;
}

const wrap = (v: number, m: number) => ((v % m) + m) % m;

export function getCell(board: Board, x: number, y: number): number {
  return board.cells[wrap(y, board.h) * board.w + wrap(x, board.w)];
}

/** Sets a cell (live or empty). Rocks win: a live cell cannot sit on a rock. */
export function withCell(board: Board, x: number, y: number, live: boolean): Board {
  const i = wrap(y, board.h) * board.w + wrap(x, board.w);
  if (board.rocks[i]) return board;
  const cells = new Uint8Array(board.cells);
  cells[i] = live ? 1 : 0;
  return { ...board, cells };
}

/** Sets or clears a rock. Placing a rock removes any live cell under it. */
export function withRock(board: Board, x: number, y: number, rock: boolean): Board {
  const i = wrap(y, board.h) * board.w + wrap(x, board.w);
  const rocks = new Uint8Array(board.rocks);
  const cells = new Uint8Array(board.cells);
  rocks[i] = rock ? 1 : 0;
  if (rock) cells[i] = 0;
  return { ...board, rocks, cells };
}

/** Places a pattern of live cells ("#" live, "." empty) with its top-left at (x, y). */
export function stamp(board: Board, rows: readonly string[], x: number, y: number, kind: 'cell' | 'rock' = 'cell'): Board {
  let b = board;
  rows.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === '#') b = kind === 'cell' ? withCell(b, x + i, y + j, true) : withRock(b, x + i, y + j, true);
    }),
  );
  return b;
}
