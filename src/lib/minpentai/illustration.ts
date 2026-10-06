/**
 * The tutorial's "full match" illustration. Scripted frames, not a simulation:
 * the sandbox cannot play a match (no opponents, fog or intervention turns), so
 * this shows what one looks like, drawn in the approved board's language. The UI
 * labels it as an illustration. Pure data.
 *
 * Grounding (chapter 4): the board starts dark and each player sees only near
 * copies of their symbol (c4-b93); setup happens in a home corner (c4-b94); the
 * battle then runs on its own while gliders and spaceships spread and leave new
 * symbols (c4-b106–b108); intervention turns let a player add squares near their
 * symbols (c4-b110); gliders wreck structures and debris piles up (c4-b109,
 * c4-b140); a player whose symbols are all destroyed is out (c4-b136–b138).
 */
import { SYMBOL_ROWS } from './symbol';

export const ILLO_W = 48;
export const ILLO_H = 32;
/** How far a symbol lets its owner see in the illustration (the book says thirty squares on a far bigger board). */
export const ILLO_SIGHT = 8;

export type IlloKind = 'live' | 'wall' | 'sym' | 'debris';
export interface IlloCell { x: number; y: number; kind: IlloKind; owner: 0 | 1 }
export interface IlloFrame {
  /** Key into TUTORIAL_TEXT.match.frames. */
  caption: 'setup' | 'spread' | 'intervene' | 'clash' | 'out';
  cells: IlloCell[];
  /** Symbol positions (top-left), for frames and for the owner's sight. */
  symbols: { x: number; y: number; owner: 0 | 1 }[];
  /** Area where the player may add squares this turn. */
  zone?: { x: number; y: number; w: number; h: number };
  /** Show only what player 0 can see. */
  fog: boolean;
}

const glider = (x: number, y: number, dir: 'nw' | 'ne' | 'sw' | 'se', owner: 0 | 1): IlloCell[] => {
  // Drawn as the rule's real glider shape, turned to face its way.
  const shapes = { nw: ['#.', '.#', '.#', '#.'], ne: ['.#', '#.', '#.', '.#'], sw: ['.##.', '#..#'], se: ['#..#', '.##.'] };
  return shapes[dir].flatMap((r, j) => [...r].flatMap((c, i) => (c === '#' ? [{ x: x + i, y: y + j, kind: 'live' as const, owner }] : [])));
};
const wall = (x0: number, y0: number, x1: number, y1: number, owner: 0 | 1, gaps: number[] = []): IlloCell[] => {
  const out: IlloCell[] = [];
  let k = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if (!gaps.includes(k)) out.push({ x, y, kind: 'wall', owner }); k++; }
  return out;
};
const symbolCells = (x: number, y: number, owner: 0 | 1): IlloCell[] =>
  SYMBOL_ROWS.flatMap((r, j) => [...r].flatMap((c, i) => (c === '#' ? [{ x: x + i, y: y + j, kind: 'sym' as const, owner }] : [])));
const debris = (seed: number, x0: number, y0: number, w: number, h: number, density: number): IlloCell[] => {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: IlloCell[] = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (rnd() < density) out.push({ x, y, kind: 'debris', owner: 0 });
  return out;
};

const you = [{ x: 40, y: 25, owner: 0 as const }, { x: 34, y: 27, owner: 0 as const }];
const youSpread = [...you, { x: 27, y: 19, owner: 0 as const }];
const youForward = [...youSpread, { x: 19, y: 13, owner: 0 as const }];
const them = [{ x: 6, y: 4, owner: 1 as const }, { x: 13, y: 6, owner: 1 as const }, { x: 9, y: 11, owner: 1 as const }];

const yourBase = [...wall(31, 22, 47, 22, 0, [3, 4, 11]), ...wall(31, 22, 31, 31, 0, [5])];
const theirBase = [...wall(0, 15, 17, 15, 1, [6, 7]), ...wall(17, 0, 17, 15, 1, [9])];
const withSymbols = (cells: IlloCell[], syms: { x: number; y: number; owner: 0 | 1 }[]) => [...cells, ...syms.flatMap((s) => symbolCells(s.x, s.y, s.owner))];

export const MATCH_FRAMES: IlloFrame[] = [
  {
    caption: 'setup', fog: true, symbols: you,
    cells: withSymbols([...yourBase, ...glider(36, 18, 'nw', 0)], you),
  },
  {
    caption: 'spread', fog: true, symbols: youSpread,
    cells: withSymbols([...yourBase, ...glider(29, 13, 'nw', 0), ...glider(23, 25, 'sw', 0), ...glider(37, 12, 'ne', 0)], youSpread),
  },
  {
    caption: 'intervene', fog: true, symbols: youSpread, zone: { x: 22, y: 14, w: 13, h: 13 },
    cells: withSymbols([...yourBase, ...wall(24, 16, 32, 16, 0, [4]), ...glider(25, 13, 'nw', 0), ...glider(21, 25, 'sw', 0)], youSpread),
  },
  {
    caption: 'clash', fog: false, symbols: [...youForward, ...them],
    cells: withSymbols([
      ...yourBase, ...theirBase, ...wall(24, 16, 32, 16, 0, [4]),
      ...glider(14, 9, 'nw', 0), ...glider(20, 4, 'nw', 0), ...glider(22, 19, 'se', 1), ...glider(10, 20, 'se', 1),
      ...debris(7, 12, 10, 16, 12, 0.08),
    ], [...youForward, ...them]),
  },
  {
    caption: 'out', fog: false, symbols: youForward,
    cells: withSymbols([
      ...yourBase, ...wall(24, 16, 32, 16, 0, [4]), ...wall(0, 15, 9, 15, 1, [2, 3, 6]),
      ...debris(11, 0, 0, 18, 15, 0.14), ...debris(7, 12, 10, 16, 12, 0.08),
    ], youForward),
  },
];

/** Whether player 0 can see a cell in a fogged frame. */
export function illoVisible(frame: IlloFrame, x: number, y: number): boolean {
  if (!frame.fog) return true;
  return frame.symbols.some((s) => s.owner === 0 && Math.max(Math.abs(x - (s.x + 1)), Math.abs(y - (s.y + 1))) <= ILLO_SIGHT);
}
