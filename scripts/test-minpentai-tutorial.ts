/**
 * Tutorial tests. Fails (exit 1) on any problem.
 *
 *   npx tsx scripts/test-minpentai-tutorial.ts
 *
 * For every lesson with a goal, a scripted solution reaches it, and the goal does
 * not fire before: not at the start, not on any earlier move, and not on near
 * misses. Also checks the reading lessons' boards and the tutorial text's rules.
 */
import { step, stepBack, withCell, type Board } from '../src/lib/minpentai/engine';
import { findSymbols } from '../src/lib/minpentai/symbol';
import { LESSONS, lessonIndex, type GoalContext, type LessonId } from '../src/lib/minpentai/tutorial';
import { TUTORIAL_TEXT } from '../src/lib/minpentai/tutorial-text';

const failures: string[] = [];
const fail = (m: string) => failures.push(m);
const lessonOf = (id: LessonId) => LESSONS[lessonIndex(id)];

function run(id: LessonId, label: string, moves: ((b: Board) => Board)[], playingAt: (i: number) => boolean, expectFirstAt: number) {
  const lesson = lessonOf(id);
  const start = lesson.build();
  const goal = lesson.goal!;
  const ctx = (board: Board, playing: boolean): GoalContext => ({ board, start, playing });
  if (goal(ctx(start, false))) fail(`${id}: goal fires at the start`);
  let b = start;
  let first = -1;
  moves.forEach((m, i) => {
    b = m(b);
    if (first < 0 && goal(ctx(b, playingAt(i)))) first = i + 1;
  });
  if (first !== expectFirstAt) fail(`${id} (${label}): goal first fired after move ${first}, expected ${expectFirstAt}`);
  else console.log(`${id}: ${label} — ${first < 0 ? 'goal never fires' : `goal reached on move ${first}, not before`}`);
}
const times = (k: number, f: (b: Board) => Board) => Array.from({ length: k }, () => f);

// Order and kinds.
const ids = LESSONS.map((l) => l.id).join(',');
if (ids !== 'what,one-cell,backward,glider,build,rock,symbol,match,win,book') fail(`lesson order is ${ids}`);
for (const l of LESSONS) {
  if (l.kind === 'do' && !l.goal) fail(`${l.id}: a "do" lesson needs a goal`);
  if (l.kind !== 'do' && l.goal) fail(`${l.id}: only "do" lessons have goals`);
}
if (LESSONS[LESSONS.length - 1].kind !== 'handover') fail('the last lesson must hand over to free play');

// One cell: four steps forward.
run('one-cell', 'four steps forward', times(4, step), () => false, 4);

// Time runs backward: starts at turn 4; back to 0. Forward never counts.
if (lessonOf('backward').build().turn !== 4) fail('backward: should start at turn 4');
run('backward', 'four steps back', times(4, stepBack), () => false, 4);
run('backward', 'forward does not count', times(20, step), () => false, -1);

// A glider: sixteen turns while playing.
run('glider', 'play sixteen turns', times(16, step), () => true, 16);

// Build one: the four outlined cells; wrong cells or three of four never count.
const ghost = lessonOf('build').ghost!;
run('build', 'tap the outline', ghost.map(([x, y]) => (b: Board) => withCell(b, x, y, true)), () => false, 4);
run('build', 'three of four', ghost.slice(0, 3).map(([x, y]) => (b: Board) => withCell(b, x, y, true)), () => false, -1);
run('build', 'outline shifted one cell', ghost.map(([x, y]) => (b: Board) => withCell(b, x + 1, y + 1, true)), () => false, -1);

// A rock: done once the glider travels back (turn 29).
run('rock', 'play until it bounces', times(40, step), () => true, 29);

// Your symbol: paused on a framed turn. Starts at turn 14; framed on 22, 23, 26, 27.
run('symbol', 'step to the first framed turn', times(8, step), () => false, 8);
run('symbol', 'playing through never counts', times(40, step), () => true, -1);
{
  const lesson = lessonOf('symbol');
  const start = lesson.build();
  let b = start;
  const hits: number[] = [];
  for (let i = 0; i < 40; i++) {
    if (lesson.goal!({ board: b, start, playing: false })) hits.push(b.turn);
    b = step(b);
  }
  if (hits.join(',') !== '22,23,26,27') fail(`symbol: paused-goal turns ${hits.join(',')}, expected 22,23,26,27`);
  else console.log('symbol: paused on each turn, the goal holds on turns 22, 23, 26, 27 only');
  if (lesson.speed > 2) fail('symbol: should play at two turns a second or slower');
}

// How a match is played: four framed symbols that stay framed.
{
  let b = lessonOf('match').build();
  for (let t = 0; t < 60; t++) {
    if (findSymbols(b).length !== 4) { fail(`match: ${findSymbols(b).length} symbols at turn ${b.turn}, expected 4`); break; }
    b = step(b);
  }
  console.log('match: four symbols, each recognised on every turn for 60 turns');
}

// How you win: the symbol is there until the glider strikes, then gone (turn 18).
run('win', 'play until the symbol is destroyed', times(18, step), () => true, 18);
{
  let b = lessonOf('win').build();
  for (let t = 0; t < 120; t++) { b = step(b); }
  if (findSymbols(b).length) fail('win: the symbol came back');
}

// Text rules.
for (const l of LESSONS) {
  const t = TUTORIAL_TEXT.lessons[l.id];
  if (!t) { fail(`${l.id}: no text`); continue; }
  const sentences = t.text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  if (sentences.length > 2) fail(`${l.id}: ${sentences.length} sentences, at most 2`);
  for (const m of t.text.matchAll(/chapter (\d+)/gi)) if (Number(m[1]) > 4) fail(`${l.id}: mentions chapter ${m[1]}`);
}
if (!('modelDrafted' in TUTORIAL_TEXT)) fail('tutorial text must say whether it is model-drafted');
console.log(`text: ${LESSONS.length} lessons, at most two sentences each, nothing past chapter 4`);

if (failures.length) {
  console.error(`FAIL (${failures.length})`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('OK');
