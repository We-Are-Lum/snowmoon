/**
 * Tutorial lessons: a tiny preset, a view, and a goal the engine detects. Pure.
 * Wording lives in tutorial-text.ts. Tests: scripts/test-minpentai-tutorial.ts.
 */
import { emptyBoard, stamp, step, type Board } from './engine';
import { findGliders } from './glider';
import { findSymbols } from './symbol';
import { c4b5Preset, impactPreset } from './presets';

export const GLIDER = ['.##.', '#..#'] as const;
/** Where lesson 4's outline sits: a position where this shape is a working glider at turn 0. */
export const BUILD_AT = [23, 15] as const;

export interface GoalContext {
  board: Board;
  /** The lesson's starting board. */
  start: Board;
  playing: boolean;
}

export interface Lesson {
  build: () => Board;
  zoom: 1 | 2 | 3;
  /** Top-left cell of the view when zoomed. */
  view: { x: number; y: number };
  /** Turns per second while playing. */
  speed: number;
  /** Faint outline of cells to tap (lesson 4). */
  ghost?: [number, number][];
  /** Editing allowed while paused. */
  editable: boolean;
  /** Null for the last lesson, which hands over to free play. */
  goal: ((c: GoalContext) => boolean) | null;
}

const ghostOf = (rows: readonly string[], x: number, y: number) =>
  rows.flatMap((r, j) => [...r].flatMap((ch, i) => (ch === '#' ? [[x + i, y + j] as [number, number]] : [])));

export const LESSONS: Lesson[] = [
  // 1. One cell: step forward four times.
  {
    build: () => stamp(emptyBoard(), ['#'], 24, 16),
    zoom: 3, view: { x: 16, y: 11 }, speed: 2, editable: false,
    goal: ({ board, start }) => board.turn - start.turn >= 4,
  },
  // 2. Time runs backward: step back to turn 0. Starts eight turns in.
  {
    build: () => {
      let b = stamp(emptyBoard(), ['#.#', '.##', '#..'], 22, 14);
      for (let i = 0; i < 8; i++) b = step(b);
      return b;
    },
    zoom: 3, view: { x: 16, y: 11 }, speed: 4, editable: false,
    goal: ({ board }) => board.turn === 0,
  },
  // 3. A glider: let it travel sixteen turns, which moves it eight cells.
  {
    build: () => stamp(emptyBoard(), GLIDER, 23, 25),
    zoom: 1, view: { x: 0, y: 0 }, speed: 8, editable: false,
    goal: ({ board, start }) => board.turn - start.turn >= 16 && findGliders(board).length > 0,
  },
  // 4. Build one: tap the outlined cells; done when a glider is detected.
  {
    build: () => emptyBoard(),
    zoom: 3, view: { x: BUILD_AT[0] + 2 - 8, y: BUILD_AT[1] + 1 - 5 }, speed: 8, editable: true,
    ghost: ghostOf(GLIDER, BUILD_AT[0], BUILD_AT[1]),
    goal: ({ board }) => findGliders(board).length > 0,
  },
  // 5. A rock: fire the glider at it; done once it is travelling back the other way.
  {
    build: () => stamp(stamp(emptyBoard(), ['#'], 24, 12, 'rock'), GLIDER, 23, 25),
    zoom: 1, view: { x: 0, y: 0 }, speed: 8, editable: false,
    goal: ({ board }) => findGliders(board).some((g) => g.dy === 1),
  },
  // 6. Your symbol: paused (or stepped) on a turn where the symbol is framed.
  //    Starts at turn 14, eight turns before the symbol first forms (turns 22–23 and
  //    26–27). Slowed to two turns a second so a thumb can catch it; stepping counts too.
  {
    build: () => {
      let b = impactPreset();
      for (let i = 0; i < 14; i++) b = step(b);
      return b;
    },
    zoom: 2, view: { x: 12, y: 13 }, speed: 2, editable: false,
    goal: ({ board, playing }) => !playing && findSymbols(board).length > 0,
  },
  // 7. The book's board: hand over to free play.
  {
    build: () => c4b5Preset(),
    zoom: 2, view: { x: 0, y: 0 }, speed: 8, editable: false,
    goal: null,
  },
];
