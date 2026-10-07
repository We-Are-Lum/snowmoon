/**
 * The three matches: the four-player match the tutorial shows, the guided practice
 * match, and the easy match against the computer. Pure data and checks. Invented,
 * like everything about matches (match.ts). Wording lives in tutorial-text.ts.
 * Tests: scripts/test-minpentai-match.ts.
 */
import { forecast } from './ai';
import { dist, place, type Match, type MatchSetup, type Placement } from './match';
import { WATCH_MOVES } from './watch-moves';

/* ---------------- watching: four computer players ---------------- */

/** Four players in four corners, rocks between them. Played by computer players ('normal'). */
export const WATCH_SETUP: MatchSetup = {
  w: 56, h: 56,
  rocks: [[28, 10], [28, 45], [10, 28], [45, 28], [20, 20], [35, 35], [20, 35], [35, 20]],
  symbols: [[[6, 6], [12, 4]], [[47, 6], [41, 4]], [[47, 47], [41, 49]], [[6, 47], [12, 49]]],
};
export const WATCH_SEED = WATCH_MOVES.seed;

/** The recorded placements of the watched match, by turn (scripts/record-minpentai-match.ts). */
export function watchMovesAt(turn: number): { player: number; p: Placement }[] {
  return WATCH_MOVES.moves.filter((m) => m.turn === turn).map((m) => ({ player: m.player, p: m.p }));
}

/* ---------------- practice: a scripted rival ---------------- */

/**
 * You (cyan) against a practice rival (amber) with one symbol. The rival's whole
 * plan is its setup: one glider fired down at your nearest symbol. It does nothing
 * after that. Checked by scripts/test-minpentai-match.ts: doing nothing loses that
 * symbol; each step's scripted move works; the rival is out soon after the shot.
 */
export const PRACTICE_SETUP: MatchSetup = {
  w: 48, h: 32,
  rocks: [[12, 22], [41, 9], [8, 26], [44, 30], [6, 12]],
  symbols: [[[31, 19], [38, 24]], [[26, 4]]],
  extra: [[1, ['#..#', '.##.'], 31, 1]],
};

export type PracticeStepId = 'dark' | 'spread' | 'block' | 'attack' | 'won';
export interface PracticeStep {
  id: PracticeStepId;
  /** read: the button goes on. do: a goal on this intervention turn, and the move the button makes. */
  kind: 'read' | 'do' | 'end';
  /** The intervention turn the step happens on. */
  turn: number;
  /** The move "Show me" makes, drawn as an outline to copy. */
  move?: Placement;
  /** Met once the visitor's moves this turn do the job. */
  goal?: (m: Match) => boolean;
}

/** Your own sites still standing after `turns`, and the rival's, with everyone's moves so far. */
const outlook = (m: Match, turns = 48) => forecast(m, 0, [], turns);
const allMineSurvive = (m: Match) => outlook(m).mine === m.players[0].sites.length;

export const PRACTICE: PracticeStep[] = [
  { id: 'dark', kind: 'read', turn: 0 },
  {
    id: 'spread', kind: 'do', turn: 0, move: { kind: 'symbol', x: 26, y: 13 },
    // A symbol of yours put down on the outline (within a cell of it).
    goal: (m) => m.events.some((e) => e.kind === 'placed' && e.player === 0 && e.what === 'symbol' && dist(m.board, e.x, e.y, 26, 13) <= 1),
  },
  {
    id: 'block', kind: 'do', turn: 24, move: { kind: 'mirror', x: 33, y: 16 },
    // Every one of your symbols would still stand 48 turns from now.
    goal: (m) => m.events.some((e) => e.kind === 'placed' && e.player === 0 && e.turn === 24) && allMineSurvive(m),
  },
  {
    id: 'attack', kind: 'do', turn: 48, move: { kind: 'glider', dir: 'up', x: 25, y: 9 },
    // The rival's symbol would be gone, and none of yours.
    goal: (m) => m.events.some((e) => e.kind === 'placed' && e.player === 0 && e.turn === 48) && outlook(m).theirs === 0 && allMineSurvive(m),
  },
  { id: 'won', kind: 'end', turn: -1 },
];

/** Applies a step's scripted move. */
export const practiceMove = (m: Match, s: PracticeStep): Match => (s.move ? place(m, 0, s.move) : m);

/* ---------------- playing the computer ---------------- */

/** You (cyan) in the lower right, the computer (amber, 'easy') in the upper left. */
export const PLAY_SETUP: MatchSetup = {
  w: 48, h: 32,
  rocks: [[12, 22], [35, 9], [24, 4], [23, 27], [6, 16], [41, 15]],
  symbols: [[[34, 22], [40, 26]], [[11, 7], [5, 3]]],
};
