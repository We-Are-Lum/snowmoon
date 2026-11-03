/**
 * Sandbox scenarios for the book edition's pieces (2026-10-31): small boards set up by hand, each showing
 * one piece doing what versions/book-edition.ts says it does. /minpentai/book plays them step by step;
 * scripts/test-minpentai-book.ts runs the same scenarios and checks each outcome.
 *
 * The starting pieces are set down directly (a sandbox, not a match); any later turn's placements go
 * through the engine's own placement check, as a match's would.
 */
import { BASE, type Settings } from './schema';
import { engine, type AnyPiece, type Engine, type Layout, type Placement, type Side, type World } from './engine';
import { BOOK_EDITION } from './book-edition';

type P = Omit<Placement<AnyPiece>, 'o'> & { o: Side };
const g = (o: Side, x: number, y: number, dx: number, dy: number): P => ({ t: 'g', o, x, y, dx, dy });
const piece = (t: AnyPiece, o: Side, x: number, y: number, dx = 0, dy = 0): P => ({ t, o, x, y, dx, dy });

export interface Scenario {
  id: string;
  piece: 'm' | 'e' | 'w' | 'f';
  title: string;
  /** What to watch for, in plain words. */
  watch: string;
  W: number;
  H: number;
  rocks: [number, number][];
  towers: { C: [number, number][]; A: [number, number][] };
  /** Pieces on the board at step 0. */
  start: P[];
  /** Turns to act after the start: placements checked by the engine against the rules. */
  turns?: { step: number; C?: P[]; A?: P[] }[];
  steps: number;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'mirror', piece: 'm', title: 'A mirror wall turns a glider into a tower',
    watch: 'Cyan\'s glider flies east into the "/" mirror, turns north and destroys Amber\'s tower. The mirror has taken one of its three hits.',
    W: 12, H: 7, rocks: [], towers: { C: [[1, 5]], A: [[7, 1], [10, 3]] },
    start: [g('C', 2, 5, 1, 0), piece('m', 'C', 8, 5, 1)],
    steps: 14,
  },
  {
    id: 'mirror-back', piece: 'm', title: 'A mirror sends a diagonal glider straight back',
    watch: 'Amber\'s glider flies diagonally at Cyan\'s tower; the "/" mirror in its way sends it straight back at Amber\'s own corner.',
    W: 12, H: 7, rocks: [], towers: { C: [[1, 5]], A: [[10, 1]] },
    start: [g('A', 8, 0, -1, 1), piece('m', 'C', 4, 4, 1)],
    steps: 10,
  },
  {
    id: 'symbol', piece: 'e', title: 'Three symbol gliders become a symbol, walled in for good',
    watch: 'Three Cyan symbol gliders hit Amber\'s wall and come together into a Cyan tower. At Cyan\'s next turn to act (step 12) Cyan walls it in with three squares, so it stays: a base inside Amber\'s side of the board.',
    W: 16, H: 9, rocks: [], towers: { C: [[1, 4]], A: [[14, 4]] },
    start: [
      piece('e', 'C', 2, 3, 1, 0), piece('e', 'C', 2, 4, 1, 0), piece('e', 'C', 2, 5, 1, 0),
      ...[2, 3, 4, 5, 6].map((y) => piece('s', 'A', 11, y)),
    ],
    turns: [{ step: 12, C: [piece('s', 'C', 9, 3), piece('s', 'C', 10, 2), piece('s', 'C', 10, 4)] }],
    steps: 20,
  },
  {
    id: 'symbol-lost', piece: 'e', title: 'A symbol not walled in lasts one turn',
    watch: 'The same three symbol gliders form a Cyan tower, but Cyan places nothing around it at step 12, so it is gone as that turn ends.',
    W: 16, H: 9, rocks: [], towers: { C: [[1, 4]], A: [[14, 4]] },
    start: [
      piece('e', 'C', 2, 3, 1, 0), piece('e', 'C', 2, 4, 1, 0), piece('e', 'C', 2, 5, 1, 0),
      ...[2, 3, 4, 5, 6].map((y) => piece('s', 'A', 11, y)),
    ],
    turns: [{ step: 12, C: [] }],
    steps: 16,
  },
  {
    id: 'wall', piece: 'w', title: 'A moving wall sends gliders back at the sender',
    watch: 'Cyan\'s moving wall flies east at half a glider\'s speed. Amber\'s two gliders hit its front and are sent straight back; the wall is unharmed and stops for good at the rock.',
    W: 16, H: 9, rocks: [[11, 4]], towers: { C: [[1, 4]], A: [[14, 1]] },
    start: [piece('w', 'C', 4, 4, 1, 0), g('A', 12, 3, -1, 0), g('A', 13, 5, -1, 0)],
    steps: 18,
  },
  {
    id: 'wall-behind', piece: 'w', title: 'A glider from behind breaks a moving wall\'s square',
    watch: 'Amber\'s glider catches the moving wall from behind (only its front sends gliders back): the square it hits breaks, and the wall flies on two squares wide.',
    W: 14, H: 9, rocks: [], towers: { C: [[1, 6]], A: [[12, 4]] },
    start: [piece('w', 'C', 3, 4, 1, 0), g('A', 0, 3, 1, 0)],
    steps: 10,
  },
  {
    id: 'factory', piece: 'f', title: 'A glider factory fed by a rock',
    watch: 'Cyan\'s glider bounces between the rock and the board\'s edge. Each time it hits the rock, the rock spends one ore and Cyan\'s factory fires a glider north; the first one destroys Amber\'s tower. After three, the rock crumbles and the bouncing glider flies on. Fired gliders that bounce back off the far edge wear the factory down: two hits break it.',
    W: 12, H: 9, rocks: [[6, 7]], towers: { C: [[1, 4]], A: [[6, 1]] },
    start: [piece('f', 'C', 6, 6, 0, -1), g('C', 3, 7, 1, 0)],
    steps: 56,
  },
];

export function scenarioSettings(sc: Pick<Scenario, 'W' | 'H'>): Settings {
  return { ...BASE, ...BOOK_EDITION.set, width: sc.W, height: sc.H };
}

export interface Run { e: Engine; s: Settings; frames: World[]; refused: string[] }

/** Plays a scenario: frames[i] is the board after i steps. */
export function runScenario(sc: Scenario): Run {
  const s = scenarioSettings(sc);
  const K = (x: number, y: number) => y * sc.W + x;
  const L: Layout = { W: sc.W, H: sc.H, rocks: sc.rocks.map(([x, y]) => K(x, y)), towers: { C: sc.towers.C.map(([x, y]) => K(x, y)), A: sc.towers.A.map(([x, y]) => K(x, y)) } };
  const e = engine(L);
  const w = e.world(s);
  e.apply(w, s, { C: sc.start.filter((p) => p.o === 'C'), A: sc.start.filter((p) => p.o === 'A') });
  const frames = [e.clone(w)], refused: string[] = [];
  for (let i = 0; i < sc.steps; i++) {
    const turn = sc.turns?.find((t) => t.step === w.step);
    if (turn) {
      const pend: Record<Side, Placement<AnyPiece>[]> = { C: turn.C ?? [], A: turn.A ?? [] };
      for (const o of ['C', 'A'] as const) {
        const why = e.refuse(w, s, o, e.towers(w, o), s.points, pend[o]);
        if (why) { refused.push(`${o} at step ${w.step}: ${why}`); pend[o] = []; }
      }
      e.apply(w, s, pend);
      frames[frames.length - 1] = e.clone(w);
    }
    e.step(w, s);
    frames.push(e.clone(w));
  }
  return { e, s, frames, refused };
}

/** A frame as text (tests and debugging): T/t towers, #/= squares, / \ mirrors, @ rocks, w walls, F factories, * resting symbol gliders, > < ^ v gliders. */
export function ascii(e: Engine, w: World): string {
  const rows: string[] = [];
  for (let y = 0; y < e.H; y++) {
    let r = '';
    for (let x = 0; x < e.W; x++) {
      const k = e.K(x, y), gl = w.gl.find((q) => q.x === x && q.y === y), at = e.wallAt(w, k);
      r += w.tw[k] ? (w.tw[k] === 'C' ? 'T' : 't')
        : w.rock[k] ? '@'
        : w.sq[k] ? (w.sq[k].o === 'C' ? '#' : '=')
        : w.mir?.[k] ? (w.mir[k].d > 0 ? '/' : '\\')
        : w.fa?.[k] ? 'F'
        : w.sd?.[k] ? '*'
        : at ? 'w'
        : gl ? (gl.dx > 0 ? '>' : gl.dx < 0 ? '<' : gl.dy > 0 ? 'v' : '^')
        : '.';
    }
    rows.push(r);
  }
  return rows.join('\n');
}
