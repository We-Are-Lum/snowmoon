/**
 * Tutorial tests. Fails (exit 1) on any problem.
 *
 *   npx tsx scripts/test-minpentai-tutorial.ts
 *
 * - Every "do" screen's demo (what the one button runs) reaches its goal, and the
 *   goal does not fire before: not at the start, not on any earlier move.
 * - The visitor's own solutions work too, and near misses never count.
 * - The full-match illustration's frames show what their captions say.
 * - The tutorial text follows its rules.
 */
import { step, withCell, type Board } from '../src/lib/minpentai/engine';
import { MATCH_FRAMES, illoVisible } from '../src/lib/minpentai/illustration';
import { SCREENS, demoBoards, screenIndex, type GoalContext, type ScreenId } from '../src/lib/minpentai/tutorial';
import { TUTORIAL_TEXT } from '../src/lib/minpentai/tutorial-text';

const failures: string[] = [];
const fail = (m: string) => failures.push(m);
const screenOf = (id: ScreenId) => SCREENS[screenIndex(id)];

function firstHit(id: ScreenId, steps: { board: Board; playing: boolean }[]): number {
  const s = screenOf(id);
  const start = s.build();
  const ctx = (board: Board, playing: boolean): GoalContext => ({ board, start, playing });
  if (s.goal!(ctx(start, false))) { fail(`${id}: goal fires at the start`); return 0; }
  return steps.findIndex((x) => s.goal!(ctx(x.board, x.playing))) + 1;
}
function moves(id: ScreenId, fs: ((b: Board) => Board)[], playing: boolean) {
  let b = screenOf(id).build();
  return fs.map((f) => ({ board: (b = f(b)), playing }));
}
const times = (k: number, f: (b: Board) => Board) => Array.from({ length: k }, () => f);
function expect(id: ScreenId, label: string, got: number, want: number) {
  if (got !== want) fail(`${id} (${label}): goal first met on move ${got || 'never'}, expected ${want || 'never'}`);
  else console.log(`${id}: ${label} — ${want ? `goal met on move ${want}, not before` : 'goal never met'}`);
}

// Order, kinds, demos.
const ids = SCREENS.map((s) => s.id).join(',');
if (ids !== 'arena,you,alive,backward,glider,build,rock,symbol,match,hard,book') fail(`screen order is ${ids}`);
for (const s of SCREENS) {
  if (s.kind === 'do' && (!s.goal || !s.demo)) fail(`${s.id}: a "do" screen needs a goal and a demo`);
  if (s.kind !== 'do' && (s.goal || s.demo)) fail(`${s.id}: only "do" screens have goals and demos`);
}
if (SCREENS[SCREENS.length - 1].kind !== 'handover') fail('the last screen must hand over to free play');

// The one button's demos.
const demoExpect: Partial<Record<ScreenId, number>> = { alive: 4, backward: 4, glider: 16, build: 4, rock: 29, symbol: 8 };
for (const s of SCREENS.filter((x) => x.kind === 'do')) {
  expect(s.id, 'the demo', firstHit(s.id, demoBoards(s, s.build())), demoExpect[s.id]!);
}

// The visitor's own way, and near misses.
expect('backward', 'stepping forward instead', firstHit('backward', moves('backward', times(20, step), false)), 0);
if (screenOf('backward').build().turn !== 4) fail('backward: should start at turn 4');
const ghost = screenOf('build').ghost!;
expect('build', 'three of four cells', firstHit('build', moves('build', ghost.slice(0, 3).map(([x, y]) => (b: Board) => withCell(b, x, y, true)), false)), 0);
expect('build', 'outline shifted one cell', firstHit('build', moves('build', ghost.map(([x, y]) => (b: Board) => withCell(b, x + 1, y + 1, true)), false)), 0);
expect('symbol', 'playing straight through', firstHit('symbol', moves('symbol', times(40, step), true)), 0);
{
  const s = screenOf('symbol');
  const start = s.build();
  let b = start;
  const hits: number[] = [];
  for (let i = 0; i < 40; i++) { if (s.goal!({ board: b, start, playing: false })) hits.push(b.turn); b = step(b); }
  if (hits.join(',') !== '22,23,26,27') fail(`symbol: paused-goal turns ${hits.join(',')}`);
  if (s.speed > 2) fail('symbol: should play at two turns a second or slower');
}
// Stepping back never passes turn 0 in the demo.
if (demoBoards(screenOf('backward'), screenOf('backward').build()).some((x) => x.board.turn < 0)) fail('backward: demo went below turn 0');

// Illustration: fog in the first three frames, rival symbols gone in the last.
const [setup, , , clash, out] = MATCH_FRAMES;
if (!setup.fog || illoVisible(setup, 2, 2)) fail('illustration: setup should hide the far corner');
if (!clash.symbols.some((s) => s.owner === 1)) fail('illustration: clash should show the rival');
if (out.symbols.some((s) => s.owner === 1) || out.cells.some((c) => c.kind === 'sym' && c.owner === 1)) fail('illustration: rival symbols should be gone in the last frame');
if (MATCH_FRAMES.some((f) => !(f.caption in TUTORIAL_TEXT.matchFrames))) fail('illustration: a frame has no caption');
console.log(`illustration: ${MATCH_FRAMES.length} frames, fog and elimination as captioned`);

// Text rules.
const sentenceCount = (t: string) => t.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length;
for (const s of SCREENS) {
  const t: { text: string; button: string; caption?: string } = TUTORIAL_TEXT.screens[s.id];
  if (!t) { fail(`${s.id}: no text`); continue; }
  if (sentenceCount(t.text) > 2) fail(`${s.id}: ${sentenceCount(t.text)} sentences, at most 2`);
  if (!t.button) fail(`${s.id}: no button label`);
  for (const m of `${t.text} ${t.caption ?? ''}`.matchAll(/chapter (\d+)/gi)) if (Number(m[1]) > 4) fail(`${s.id}: mentions chapter ${m[1]}`);
}
if (!('modelDrafted' in TUTORIAL_TEXT)) fail('tutorial text must say whether it is model-drafted');
console.log(`text: ${SCREENS.length} screens, at most two sentences each, nothing past chapter 4`);

if (failures.length) {
  console.error(`FAIL (${failures.length})`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('OK');
