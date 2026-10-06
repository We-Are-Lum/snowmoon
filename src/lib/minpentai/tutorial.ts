/**
 * Tutorial lessons: a tiny preset, a view, and either a goal the engine detects
 * ("do"), nothing to do but read ("read"), or the hand-over to free play. Pure.
 * Wording lives in tutorial-text.ts, keyed by lesson id.
 * Tests: scripts/test-minpentai-tutorial.ts.
 */
import { emptyBoard, stamp, step, type Board } from './engine';
import { findGliders } from './glider';
import { SYMBOL_ROWS, findSymbols } from './symbol';
import { c4b5Preset, impactPreset } from './presets';

export const GLIDER = ['.##.', '#..#'] as const;
/** Where the build lesson's outline sits: a position where this shape is a working glider at turn 0. */
export const BUILD_AT = [23, 15] as const;

export interface GoalContext {
  board: Board;
  /** The lesson's starting board. */
  start: Board;
  playing: boolean;
}

export type LessonId = 'what' | 'one-cell' | 'backward' | 'glider' | 'build' | 'rock' | 'symbol' | 'match' | 'win' | 'book';

export interface Lesson {
  id: LessonId;
  /** read: nothing to do, Next is shown at once. do: Next appears when the goal is met. handover: ends the tutorial. */
  kind: 'read' | 'do' | 'handover';
  build: () => Board;
  zoom: 1 | 2 | 3;
  /** Top-left cell of the view when zoomed. */
  view: { x: number; y: number };
  /** Turns per second while playing. */
  speed: number;
  /** Start playing as soon as the lesson opens. */
  autoplay?: boolean;
  /** Faint outline of cells to tap. */
  ghost?: [number, number][];
  /** Editing allowed while paused. */
  editable: boolean;
  goal?: (c: GoalContext) => boolean;
}

const ghostOf = (rows: readonly string[], x: number, y: number) =>
  rows.flatMap((r, j) => [...r].flatMap((ch, i) => (ch === '#' ? [[x + i, y + j] as [number, number]] : [])));

/** A symbol and a glider that strikes it head on: the symbol is gone from turn 18, for good. */
export function destroyPreset(): Board {
  return stamp(stamp(emptyBoard(), SYMBOL_ROWS, 24, 14), GLIDER, 23, 27);
}

/** Copies of the symbol, each framed: what a player starts a match with. */
export function symbolsPreset(): Board {
  let b = emptyBoard();
  for (const [x, y] of [[8, 8], [36, 6], [20, 22], [40, 24]] as const) b = stamp(b, SYMBOL_ROWS, x, y);
  return b;
}

export const LESSONS: Lesson[] = [
  // What Minpentai is. The book's board plays while you read.
  { id: 'what', kind: 'read', build: () => c4b5Preset(), zoom: 2, view: { x: 0, y: 0 }, speed: 6, autoplay: true, editable: false },
  // One cell: step forward four times.
  {
    id: 'one-cell', kind: 'do', build: () => stamp(emptyBoard(), ['#'], 24, 16),
    zoom: 3, view: { x: 16, y: 11 }, speed: 2, editable: false,
    goal: ({ board, start }) => board.turn - start.turn >= 4,
  },
  // Time runs backward: step back to turn 0. Starts four turns in; the tutorial stops at turn 0.
  {
    id: 'backward', kind: 'do',
    build: () => {
      let b = stamp(emptyBoard(), ['#.#', '.##', '#..'], 22, 14);
      for (let i = 0; i < 4; i++) b = step(b);
      return b;
    },
    zoom: 3, view: { x: 16, y: 11 }, speed: 4, editable: false,
    goal: ({ board }) => board.turn === 0,
  },
  // A glider: let it travel sixteen turns, which moves it eight cells.
  {
    id: 'glider', kind: 'do', build: () => stamp(emptyBoard(), GLIDER, 23, 25),
    zoom: 1, view: { x: 0, y: 0 }, speed: 8, editable: false,
    goal: ({ board, start }) => board.turn - start.turn >= 16 && findGliders(board).length > 0,
  },
  // Build one: tap the outlined cells; done when a glider is detected.
  {
    id: 'build', kind: 'do', build: () => emptyBoard(),
    zoom: 3, view: { x: BUILD_AT[0] + 2 - 8, y: BUILD_AT[1] + 1 - 5 }, speed: 8, editable: true,
    ghost: ghostOf(GLIDER, BUILD_AT[0], BUILD_AT[1]),
    goal: ({ board }) => findGliders(board).length > 0,
  },
  // A rock: fire the glider at it; done once it is travelling back the other way.
  {
    id: 'rock', kind: 'do', build: () => stamp(stamp(emptyBoard(), ['#'], 24, 12, 'rock'), GLIDER, 23, 25),
    zoom: 1, view: { x: 0, y: 0 }, speed: 8, editable: false,
    goal: ({ board }) => findGliders(board).some((g) => g.dy === 1),
  },
  // Your symbol: paused (or stepped) on a turn where the symbol is framed.
  //   Starts at turn 14, eight turns before the symbol first forms (turns 22–23 and
  //   26–27). Slowed to two turns a second so a thumb can catch it; stepping counts too.
  {
    id: 'symbol', kind: 'do',
    build: () => {
      let b = impactPreset();
      for (let i = 0; i < 14; i++) b = step(b);
      return b;
    },
    zoom: 2, view: { x: 12, y: 13 }, speed: 2, editable: false,
    goal: ({ board, playing }) => !playing && findSymbols(board).length > 0,
  },
  // How a match is played: copies of the symbol on the board.
  { id: 'match', kind: 'read', build: () => symbolsPreset(), zoom: 1, view: { x: 0, y: 0 }, speed: 4, editable: false },
  // How you win: send a glider into a symbol; done when no symbol is left.
  {
    id: 'win', kind: 'do', build: () => destroyPreset(),
    zoom: 2, view: { x: 12, y: 12 }, speed: 6, editable: false,
    goal: ({ board }) => findSymbols(board).length === 0,
  },
  // The book's board: hand over to free play.
  { id: 'book', kind: 'handover', build: () => c4b5Preset(), zoom: 2, view: { x: 0, y: 0 }, speed: 8, editable: false },
];

export const lessonIndex = (id: LessonId) => LESSONS.findIndex((l) => l.id === id);
