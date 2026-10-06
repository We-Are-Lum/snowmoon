/**
 * Tutorial screens. Pure. Wording lives in tutorial-text.ts, keyed by screen id.
 * Tests: scripts/test-minpentai-tutorial.ts.
 *
 * One button moves the visitor through every screen. On "read" screens it goes to
 * the next screen. On "do" screens it runs the screen's demo (the scripted
 * solution) at a watchable pace if the visitor has not met the goal, and then goes
 * on. On the last screen it starts free play.
 */
import { emptyBoard, stamp, step, stepBack, type Board } from './engine';
import { findGliders } from './glider';
import { SYMBOL_ROWS, findSymbols } from './symbol';
import { c4b5Preset, impactPreset } from './presets';

export const GLIDER = ['.##.', '#..#'] as const;
/** Where the build screen's outline sits: a position where this shape is a working glider at turn 0. */
export const BUILD_AT = [23, 15] as const;

export interface GoalContext {
  board: Board;
  /** The screen's starting board. */
  start: Board;
  playing: boolean;
}

/** The scripted solution the one button runs on a "do" screen. */
export type Demo =
  | { kind: 'step'; dir: 1 | -1; count: number; ms: number }
  | { kind: 'play' }
  | { kind: 'tap'; cells: [number, number][]; ms: number };

export type ScreenId = 'arena' | 'you' | 'alive' | 'backward' | 'glider' | 'build' | 'rock' | 'symbol' | 'match' | 'hard' | 'book';

export interface Screen {
  id: ScreenId;
  /** read: Next at once. do: a goal, and a demo the button runs. handover: starts free play. */
  kind: 'read' | 'do' | 'handover';
  /** What sits in the board slot: the live board, or the full-match illustration. */
  stage: 'board' | 'illustration';
  build: () => Board;
  zoom: 1 | 2 | 3;
  /** Top-left cell of the view when zoomed. */
  view: { x: number; y: number };
  /** Turns per second while playing. */
  speed: number;
  autoplay?: boolean;
  /** Faint outline of cells to tap. */
  ghost?: [number, number][];
  editable: boolean;
  goal?: (c: GoalContext) => boolean;
  demo?: Demo;
}

const ghostOf = (rows: readonly string[], x: number, y: number) =>
  rows.flatMap((r, j) => [...r].flatMap((ch, i) => (ch === '#' ? [[x + i, y + j] as [number, number]] : [])));
const buildGhost = ghostOf(GLIDER, BUILD_AT[0], BUILD_AT[1]);

export const SCREENS: Screen[] = [
  // The hook: the book's board plays, as it would on the stadium screen.
  { id: 'arena', kind: 'read', stage: 'board', build: () => c4b5Preset(), zoom: 2, view: { x: 0, y: 0 }, speed: 6, autoplay: true, editable: false },
  // Your motive: your symbol alone, quietly cycling and staying framed.
  { id: 'you', kind: 'read', stage: 'board', build: () => stamp(emptyBoard(), SYMBOL_ROWS, 23, 14), zoom: 3, view: { x: 16, y: 10 }, speed: 2, autoplay: true, editable: false },
  // The board is alive: a lone cell hops and comes home in four turns.
  {
    id: 'alive', kind: 'do', stage: 'board', build: () => stamp(emptyBoard(), ['#'], 24, 16),
    zoom: 3, view: { x: 16, y: 11 }, speed: 2, editable: false,
    goal: ({ board, start }) => board.turn - start.turn >= 4,
    demo: { kind: 'step', dir: 1, count: 4, ms: 550 },
  },
  // Time runs both ways: starts four turns in; back to turn 0 (stepping back stops there).
  {
    id: 'backward', kind: 'do', stage: 'board',
    build: () => {
      let b = stamp(emptyBoard(), ['#.#', '.##', '#..'], 22, 14);
      for (let i = 0; i < 4; i++) b = step(b);
      return b;
    },
    zoom: 3, view: { x: 16, y: 11 }, speed: 4, editable: false,
    goal: ({ board }) => board.turn === 0,
    demo: { kind: 'step', dir: -1, count: 4, ms: 550 },
  },
  // The glider: sixteen turns of travel.
  {
    id: 'glider', kind: 'do', stage: 'board', build: () => stamp(emptyBoard(), GLIDER, 23, 25),
    zoom: 1, view: { x: 0, y: 0 }, speed: 8, editable: false,
    goal: ({ board, start }) => board.turn - start.turn >= 16 && findGliders(board).length > 0,
    demo: { kind: 'play' },
  },
  // Build one: tap the outlined cells.
  {
    id: 'build', kind: 'do', stage: 'board', build: () => emptyBoard(),
    zoom: 3, view: { x: BUILD_AT[0] + 2 - 8, y: BUILD_AT[1] + 1 - 5 }, speed: 8, editable: true,
    ghost: buildGhost,
    goal: ({ board }) => findGliders(board).length > 0,
    demo: { kind: 'tap', cells: buildGhost, ms: 380 },
  },
  // Rocks (invented): done once the glider is travelling back down.
  {
    id: 'rock', kind: 'do', stage: 'board', build: () => stamp(stamp(emptyBoard(), ['#'], 24, 12, 'rock'), GLIDER, 23, 25),
    zoom: 1, view: { x: 0, y: 0 }, speed: 8, editable: false,
    goal: ({ board }) => findGliders(board).some((g) => g.dy === 1),
    demo: { kind: 'play' },
  },
  // Your symbol (invented shape): paused or stepped onto a framed turn. Starts at
  // turn 14; framed on 22–23 and 26–27; two turns a second; the demo steps to 22.
  {
    id: 'symbol', kind: 'do', stage: 'board',
    build: () => {
      let b = impactPreset();
      for (let i = 0; i < 14; i++) b = step(b);
      return b;
    },
    zoom: 2, view: { x: 12, y: 13 }, speed: 2, editable: false,
    goal: ({ board, playing }) => !playing && findSymbols(board).length > 0,
    demo: { kind: 'step', dir: 1, count: 8, ms: 350 },
  },
  // A full match, illustrated (not playable here).
  { id: 'match', kind: 'read', stage: 'illustration', build: () => emptyBoard(), zoom: 1, view: { x: 0, y: 0 }, speed: 1, editable: false },
  // Why it's hard: four short reasons over the fogged illustration.
  { id: 'hard', kind: 'read', stage: 'illustration', build: () => emptyBoard(), zoom: 1, view: { x: 0, y: 0 }, speed: 1, editable: false },
  // The book's own board, playing; then free play.
  { id: 'book', kind: 'handover', stage: 'board', build: () => c4b5Preset(), zoom: 2, view: { x: 0, y: 0 }, speed: 8, autoplay: true, editable: false },
];

export const screenIndex = (id: ScreenId) => SCREENS.findIndex((s) => s.id === id);

/** Applies a demo to a board without timing: the list of boards after each action. For tests. */
export function demoBoards(screen: Screen, from: Board): { board: Board; playing: boolean }[] {
  const d = screen.demo!;
  const out: { board: Board; playing: boolean }[] = [];
  let b = from;
  if (d.kind === 'step') for (let i = 0; i < d.count; i++) { b = d.dir === 1 ? step(b) : stepBackSafe(b); out.push({ board: b, playing: false }); }
  if (d.kind === 'tap') for (const [x, y] of d.cells) { b = stamp(b, ['#'], x, y); out.push({ board: b, playing: false }); }
  if (d.kind === 'play') for (let i = 0; i < 200; i++) { b = step(b); out.push({ board: b, playing: true }); }
  return out;
}

const stepBackSafe = (b: Board) => (b.turn <= 0 ? b : stepBack(b));
