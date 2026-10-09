/**
 * Design's lesson list LS (docs/design/minpentai-intro-v3.dc.html, script lines 372–395): each
 * lesson's start, goal, failure, demo, hints and placing rules. The words are in learn-text.ts.
 * The order is Design's: seven lessons, then Under the hood (optional) and the practice match.
 */
import { BASE, G_, P_, Q_, T_, pNew, towers, type PState, type Tool } from './pieces';
import { GL, bEmpty, bStamp, type CBoard } from './cells';

export type LessonId = 'goal' | 'glider' | 'hit' | 'square' | 'turn' | 'sight' | 'rule' | 'hood' | 'practice';
interface Common {
  id: LessonId;
  read?: true;
  hood?: true;
  optional?: true;
  reasons?: true;
  place?: 'square' | 'palette';
  hints?: [number, number][];
  zone?: number;
  budget?: number;
  fog?: number;
  demo?: 'play' | 'place';
  demoCells?: [number, number][];
  demoTool?: Tool;
  speed?: number;
}
/** A lesson on the pieces board. */
export interface PiecesLesson extends Common {
  ca?: undefined;
  practice?: true;
  build: () => PState;
  goal?: (s: PState) => boolean;
  fail?: (s: PState) => boolean;
}
/** Under the hood: the cell rule. */
export interface CellsLesson extends Common {
  ca: true;
  rule: true;
  zoom: number;
  view: [number, number];
  build: () => CBoard;
  goal: (b: CBoard, start: CBoard) => boolean;
}
export type LessonDef = PiecesLesson | CellsLesson;

export const LS: LessonDef[] = [
  { id: 'goal', read: true, build: () => pNew(BASE()) },
  { id: 'glider', build: () => pNew([...BASE(), G_(4, 5, 0, 1, 0)]), goal: (s) => s.turn >= 8, demo: 'play' },
  { id: 'hit', build: () => pNew([...BASE(), G_(4, 3, 0, 1, 0)]), goal: (s) => towers(s, 1) < 2, demo: 'play' },
  {
    id: 'square', build: () => pNew([...BASE(), G_(10, 7, 1, -1, 0)]), place: 'square', hints: [[4, 7], [5, 7], [6, 7]],
    goal: (s) => s.turn >= 10 && towers(s, 0) === 2, fail: (s) => towers(s, 0) < 2, demo: 'place', demoCells: [[5, 7]],
  },
  {
    id: 'turn', build: () => pNew([T_(2, 3, 0), T_(2, 7, 0), T_(12, 5, 1), Q_(10, 2, 1), Q_(10, 3, 1), Q_(10, 7, 1), Q_(10, 8, 1)]), place: 'palette', zone: 3, budget: 8,
    goal: (s) => towers(s, 1) === 0, fail: (s) => s.turn >= 24, demo: 'place', demoCells: [[4, 5]], demoTool: 'glider',
  },
  { id: 'sight', build: () => pNew([T_(2, 2, 0), T_(3, 7, 0), T_(12, 4, 1), G_(13, 7, 1, -1, 0)]), fog: 3, goal: (s) => towers(s, 0) < 2, demo: 'play' },
  { id: 'rule', read: true, hood: true, build: () => pNew(BASE()), reasons: true },
  { id: 'hood', ca: true, optional: true, rule: true, build: () => bStamp(bEmpty(), GL, 23, 25), zoom: 2, view: [12, 16], speed: 6, goal: (b, st) => b.turn - st.turn >= 16, demo: 'play' },
  {
    id: 'practice', practice: true, optional: true, place: 'palette', zone: 3, budget: 8, fog: 3,
    build: () => pNew([T_(1, 2, 0), T_(1, 7, 0), T_(13, 2, 1), T_(13, 7, 1), P_('rock', 7, 4), P_('rock', 7, 5), P_('rock', 6, 0), P_('rock', 8, 9), P_('rock', 5, 6), P_('rock', 9, 3)]),
  },
];
export const MAIN = LS.filter((x) => !x.optional);
export const indexOf = (id: LessonId) => LS.findIndex((x) => x.id === id);
