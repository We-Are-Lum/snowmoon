/**
 * Tutorial tests. Fails (exit 1) on any problem.
 *
 *   npx tsx scripts/test-minpentai-tutorial.ts
 *
 * For every lesson, a scripted solution reaches the goal, and the goal does not
 * fire before it: not at the start, not on any earlier move, and not on near
 * misses. Also checks the tutorial text file's rules.
 */
import { step, stepBack, withCell, type Board } from '../src/lib/minpentai/engine';
import { BUILD_AT, GLIDER, LESSONS, type GoalContext } from '../src/lib/minpentai/tutorial';
import { TUTORIAL_TEXT } from '../src/lib/minpentai/tutorial-text';

const failures: string[] = [];
const fail = (m: string) => failures.push(m);

function run(n: number, label: string, moves: ((b: Board) => Board)[], playingAt: (i: number) => boolean, expectFirstAt: number) {
  const lesson = LESSONS[n - 1];
  const start = lesson.build();
  const goal = lesson.goal!;
  const ctx = (board: Board, playing: boolean): GoalContext => ({ board, start, playing });
  if (goal(ctx(start, false))) fail(`lesson ${n}: goal fires at the start`);
  let b = start;
  let first = -1;
  moves.forEach((m, i) => {
    b = m(b);
    if (first < 0 && goal(ctx(b, playingAt(i)))) first = i + 1;
  });
  if (first !== expectFirstAt) fail(`lesson ${n} (${label}): goal first fired after move ${first}, expected ${expectFirstAt}`);
  else console.log(`lesson ${n}: ${label} — ${first < 0 ? 'goal never fires' : `goal reached on move ${first}, not before`}`);
}
const times = (k: number, f: (b: Board) => Board) => Array.from({ length: k }, () => f);

// 1. Step forward four times.
run(1, 'four steps forward', times(4, step), () => false, 4);

// 2. Step back to turn 0 (starts at turn 8). Stepping forward first never counts.
run(2, 'eight steps back', times(8, stepBack), () => false, 8);
run(2, 'forward does not count', times(20, step), () => false, -1);

// 3. Play: sixteen turns while playing.
run(3, 'play sixteen turns', times(16, step), () => true, 16);

// 4. Tap the four outlined cells. Wrong cells, or only three, never count.
const ghost = LESSONS[3].ghost!;
run(4, 'tap the outline', ghost.map(([x, y]) => (b: Board) => withCell(b, x, y, true)), () => false, 4);
run(4, 'three of four', ghost.slice(0, 3).map(([x, y]) => (b: Board) => withCell(b, x, y, true)), () => false, -1);
run(4, 'outline shifted one cell', ghost.map(([x, y]) => (b: Board) => withCell(b, x + 1, y + 1, true)), () => false, -1);
if (ghost.length !== 4 || ghost[0][0] < BUILD_AT[0] || GLIDER.length !== 2) fail('lesson 4: outline is not the glider');

// 5. Fire at the rock: done once the glider travels back (turn 29), not before.
run(5, 'play until it bounces', times(40, step), () => true, 29);

// 6. Paused on a framed turn. Starts at turn 14; framed on turns 22, 23, 26, 27.
run(6, 'step to the first framed turn', times(8, step), () => false, 8);
run(6, 'playing through never counts', times(40, step), () => true, -1);
{
  // Pausing on each turn in turn: exactly the framed turns count.
  const lesson = LESSONS[5];
  const start = lesson.build();
  let b = start;
  const hits: number[] = [];
  for (let i = 0; i < 40; i++) {
    if (lesson.goal!({ board: b, start, playing: false })) hits.push(b.turn);
    b = step(b);
  }
  if (hits.join(',') !== '22,23,26,27') fail(`lesson 6: paused-goal turns ${hits.join(',')}, expected 22,23,26,27`);
  else console.log('lesson 6: paused on each turn, the goal holds on turns 22, 23, 26, 27 only');
  // At two turns a second each framed window lasts a full second.
  if (lesson.speed > 2) fail('lesson 6: should play at two turns a second or slower');
}

// 7. Hands over to free play.
if (LESSONS[6].goal !== null) fail('lesson 7: should have no goal');

// Text rules.
if (TUTORIAL_TEXT.lessons.length !== 7 || LESSONS.length !== 7) fail('there must be seven lessons, with text for each');
TUTORIAL_TEXT.lessons.forEach((l, i) => {
  const sentences = l.text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  if (sentences.length > 2) fail(`lesson ${i + 1}: ${sentences.length} sentences, at most 2`);
  for (const m of l.text.matchAll(/chapter (\d+)/gi)) if (Number(m[1]) > 4) fail(`lesson ${i + 1}: mentions chapter ${m[1]}`);
});
if (!('modelDrafted' in TUTORIAL_TEXT)) fail('tutorial text must say whether it is model-drafted');
console.log('text: seven lessons, at most two sentences each, nothing past chapter 4');

if (failures.length) {
  console.error(`FAIL (${failures.length})`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('OK');
