/**
 * Sandbox presets. Pure data and builders.
 */
import { emptyBoard, stamp, type Board } from './engine';

/**
 * From the book: the opening frame (t=0) of figure c4-b5, its 24 × 16 crop.
 * Checked against the SVG by scripts/test-minpentai.ts.
 */
export const C4B5_OPENING = [
  '............#...........',
  '........................',
  '...........#............',
  '........................',
  '............#..........#',
  '.......................#',
  '...........#............',
  '........................',
  '............#...........',
  '........................',
  '...........#............',
  '........................',
  '............#..........#',
  '.......................#',
  '...........#............',
  '........................',
] as const;

/**
 * Invented: what lies to the right of the figure's crop. The figure is cropped, and
 * cells enter from beyond its right edge from the first turns, so the opening frame
 * alone stops matching the book after a few turns. A SAT solver found this right-hand
 * side (one of many possible) such that, on a 48-wide board wrapping every 16 rows,
 * the crop replays all 120 frames of the figure exactly. The book does not show it.
 */
export const C4B5_HIDDEN_SIDE = [
  '........................',
  '........................',
  '........................',
  '#.......................',
  '........................',
  '........................',
  '#.......................',
  '...............#........',
  '................#....#..',
  '................#.......',
  '##.............#........',
  '........................',
  '..#.....................',
  '........................',
  '#.......................',
  '........................',
] as const;

/**
 * The c4-b5 preset: the opening frame at the top-left, the invented side beside it,
 * stacked twice so the 32-row board wraps exactly as the figure's 16 rows do.
 * Turn 0, so the first step uses blocks at (0,0), as in the figure.
 */
export function c4b5Preset(): Board {
  let b = emptyBoard();
  for (const y0 of [0, 16]) {
    b = stamp(b, C4B5_OPENING, 0, y0);
    b = stamp(b, C4B5_HIDDEN_SIDE, 24, y0);
  }
  return b;
}

/**
 * Invented: one glider (the rule's only one, moving up) and one rock. The glider
 * strikes the rock's side; the symbol is recognised on turns 22–23 and 26–27, in its
 * drawn shape on turns 23 and 26, and the glider bounces back down.
 */
export const IMPACT = { rock: [24, 16] as const, glider: ['.##.', '#..#'], gliderAt: [21, 27] as const };

export function impactPreset(): Board {
  let b = emptyBoard();
  b = stamp(b, ['#'], IMPACT.rock[0], IMPACT.rock[1], 'rock');
  b = stamp(b, IMPACT.glider, IMPACT.gliderAt[0], IMPACT.gliderAt[1]);
  return b;
}
