/**
 * The Learn flow (docs/design/minpentai-study.md): eight "watch" screens over the recorded
 * match, then seven lessons on a small board, then the optional "under the hood" lesson and
 * the practice match. Pure. Wording lives in learn-text.ts, keyed by id.
 *
 * Design's mockup taught the lessons on a toy model (one square per step, squares that crack).
 * Here every lesson is a real match (match.ts) on a 30 × 20 board, so what the lesson shows is
 * what the engine does. The setups were found with scripts/search-minpentai-lessons.ts and are
 * checked by scripts/test-minpentai-lessons.ts: each goal is reached by its demo, the square
 * lesson's tower falls without a square and stands with one on any outlined spot, and so on.
 * Where Design's lesson said something the engine does differently, the lesson says what the
 * engine does; docs/design/minpentai-study.md lists each difference.
 */
import { emptyBoard, stamp, type Board } from './engine';
import { GLIDERS, newMatch, type Match, type MatchRules, type MatchSetup, type Placement } from './match';
import type { Segment } from './segment';

export const LESSON_W = 30;
export const LESSON_H = 20;
/** Invented, like every match rule: a smaller board than a match, so sight and reach are smaller too. */
export const LESSON_RULES: MatchRules = { interval: 10_000, budget: 8, reach: 6, sight: 6, maxTurns: 10_000 };

/* ---------------- watch ---------------- */

export type WatchId = 'country' | 'alone' | 'runs' | 'act' | 'out' | 'last' | 'season' | 'try';
export interface WatchScreen { id: WatchId; segment: Segment }

/** Turns of the recorded match (broadcast.ts) each screen replays, and its shots. */
export const WATCH: WatchScreen[] = [
  { id: 'country', segment: { from: 0, to: 24, speed: 4, shots: ['crane'], countdown: true } },
  { id: 'alone', segment: { from: 24, to: 96, speed: 8, shots: ['wide'], cams: true } },
  { id: 'runs', segment: { from: 24, to: 110, speed: 8, shots: ['follow', 'low'] } },
  { id: 'act', segment: { from: 44, to: 62, speed: 3, shots: ['corner'] } },
  { id: 'out', segment: { from: 150, to: 190, speed: 6, shots: ['wide', 'tower'] } },
  { id: 'last', segment: { from: 250, to: 346, speed: 8, shots: ['wide', 'tower', 'crane'], hold: true } },
  { id: 'season', segment: { from: 300, to: 346, speed: 5, shots: ['low'] } },
  { id: 'try', segment: { from: 322, to: 346, speed: 4, shots: ['top'], hold: true, flatten: true } },
];

/* ---------------- lessons ---------------- */

export type LessonId = 'goal' | 'glider' | 'hit' | 'square' | 'turn' | 'sight' | 'rule';

export interface Lesson {
  id: LessonId;
  /** read: the button goes on. do: a goal, and a demo the button runs. */
  kind: 'read' | 'do';
  setup: () => Match;
  /** You see only near your towers. */
  fog?: boolean;
  /** What a tap puts down: a square only, or a choice of glider, square and tower. */
  place?: 'square' | 'palette';
  /** Spots outlined for the visitor to tap. */
  hints?: [number, number][];
  goal?: (m: Match) => boolean;
  fail?: (m: Match) => boolean;
  /** The move the big button makes (then it plays), or just play. */
  demo?: { kind: 'play' } | { kind: 'place'; moves: Placement[] };
}

const CYAN_TOWERS: [number, number][] = [[3, 4], [3, 13]];
const lessonMatch = (s: Omit<MatchSetup, 'w' | 'h' | 'rules'>, rules: Partial<MatchRules> = {}): Match =>
  newMatch({ w: LESSON_W, h: LESSON_H, rules: { ...LESSON_RULES, ...rules }, ...s });
const towersOf = (m: Match, p: number) => (m.players[p].out ? 0 : m.players[p].sites.length);
const placedBy = (m: Match, p: number) => m.events.some((e) => e.kind === 'placed' && e.player === p);

export const SQUARE_SPOTS: [number, number][] = [[9, 14], [10, 14], [9, 15], [10, 15]];

export const LESSONS: Lesson[] = [
  { id: 'goal', kind: 'read', setup: () => lessonMatch({ rocks: [], symbols: [CYAN_TOWERS, [[23, 4], [23, 13]]] }) },
  {
    // A glider between the towers, flying right: 8 cells in 16 turns.
    id: 'glider', kind: 'do',
    setup: () => lessonMatch({ rocks: [], symbols: [CYAN_TOWERS, [[23, 4], [23, 13]]], extra: [[0, GLIDERS.right, 9, 9]] }),
    goal: (m) => m.board.turn >= 16,
    demo: { kind: 'play' },
  },
  {
    // Aimed at Amber's upper tower: it falls (the site goes 8 turns after the symbol breaks).
    id: 'hit', kind: 'do',
    setup: () => lessonMatch({ rocks: [], symbols: [CYAN_TOWERS, [[23, 4], [23, 13]]], extra: [[0, GLIDERS.right, 9, 3]] }),
    goal: (m) => towersOf(m, 1) < 2,
    demo: { kind: 'play' },
  },
  {
    // An Amber glider that, unblocked, destroys your lower tower (turn 30). A square on any
    // outlined spot bounces it back.
    id: 'square', kind: 'do', place: 'square', hints: SQUARE_SPOTS,
    setup: () => lessonMatch({ rocks: [], symbols: [CYAN_TOWERS, [[23, 4]]], extra: [[1, GLIDERS.left, 19, 13]] }),
    goal: (m) => m.board.turn >= 44 && towersOf(m, 0) === 2 && placedBy(m, 0),
    fail: (m) => towersOf(m, 0) < 2,
    demo: { kind: 'place', moves: [{ kind: 'mirror', x: 9, y: 14 }] },
  },
  {
    // Amber's last tower, guarded by squares above and below. Two rows get through.
    id: 'turn', kind: 'do', place: 'palette',
    setup: () => lessonMatch({ rocks: [], symbols: [CYAN_TOWERS, [[23, 8]]], extra: [[1, ['#'], 20, 4], [1, ['#'], 20, 6], [1, ['#'], 20, 13], [1, ['#'], 20, 15]] }),
    goal: (m) => towersOf(m, 1) === 0,
    fail: (m) => towersOf(m, 0) < 2 || m.board.turn >= 64,
    demo: { kind: 'place', moves: [{ kind: 'glider', dir: 'right', x: 9, y: 7 }] },
  },
  {
    // An Amber glider out of the dark takes your lower tower; your view shrinks with it.
    id: 'sight', kind: 'do', fog: true,
    setup: () => lessonMatch({ rocks: [], symbols: [CYAN_TOWERS, [[23, 4]]], extra: [[1, GLIDERS.left, 21, 15]] }),
    goal: (m) => towersOf(m, 0) < 2,
    demo: { kind: 'play' },
  },
  { id: 'rule', kind: 'read', setup: () => lessonMatch({ rocks: [], symbols: [CYAN_TOWERS, [[23, 4], [23, 13]]] }) },
];

/** Under the hood: one glider, cell by cell, on the full board. */
export const hoodBoard = (): Board => stamp(emptyBoard(), ['.##.', '#..#'], 23, 25);

/* ---------------- practice ---------------- */

/** One new rule per practice match, chosen at random. Only rules the engine can express. */
export type NewRule = { id: 'interval' | 'sight' | 'budget' | 'reach'; rules: Partial<MatchRules> };
export const NEW_RULES: NewRule[] = [
  { id: 'interval', rules: { interval: 16 } },
  { id: 'sight', rules: { sight: 4 } },
  { id: 'budget', rules: { budget: 12 } },
  { id: 'reach', rules: { reach: 9 } },
];
/** Invented: towers mirrored across the middle, a few rocks, a turn to act every 24 turns, 384 turns in all. */
export const PRACTICE_RULES: MatchRules = { interval: 24, budget: 8, reach: 6, sight: 6, maxTurns: 384 };
export const practiceMatch = (rule: NewRule): Match =>
  newMatch({
    w: LESSON_W, h: LESSON_H,
    rules: { ...PRACTICE_RULES, ...rule.rules },
    rocks: [[14, 8], [14, 10], [12, 0], [16, 18], [10, 12], [18, 6]],
    symbols: [CYAN_TOWERS, [[24, 4], [24, 13]]],
  });
