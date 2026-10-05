/**
 * Minpentai sandbox engine tests. Fails (exit 1) on any problem.
 *
 *   npx tsx scripts/test-minpentai.ts
 *
 * 1. The engine's block rule reproduces every interior update in all 120 frames of
 *    figure c4-b5 (blocks wholly inside its 24 × 16 crop; cells can enter from
 *    outside the crop, so edge blocks cannot be judged).
 * 2. Forward then backward restores any random board, with and without rocks.
 * 3. The live-cell count never changes, with and without rocks.
 * 4. Rocks (invented) keep each turn's map a bijection: every one of the 2^16
 *    states of a 4 × 4 wrapping board with a rock maps to a distinct state.
 * 5. The c4-b5 preset: its opening frame is the figure's t=0, and its crop replays
 *    all 120 frames exactly.
 * 6. The symbol: recognised on every turn when drawn alone; the impact preset
 *    recognises it on turns 22, 23, 26 and 27 and nowhere else in 80 turns.
 * 7. URL state round-trips.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { blockRule, emptyBoard, liveCount, phase, step, stepBack, type Block, type Board } from '../src/lib/minpentai/engine';
import { FIGURE_H, FIGURE_W, frameRows, parseFigureFrames } from '../src/lib/minpentai/figure';
import { C4B5_OPENING, c4b5Preset, impactPreset } from '../src/lib/minpentai/presets';
import { SYMBOL_ROWS, STATES, boardWithSymbol, countSymbols, findSymbols } from '../src/lib/minpentai/symbol';
import { decodeBoard, encodeBoard } from '../src/lib/minpentai/url';

const failures: string[] = [];
const fail = (m: string) => failures.push(m);

// 1. Figure c4-b5.
const svg = readFileSync(path.join(process.cwd(), 'docs', 'source-figures', 'c4-b5.svg'), 'utf8');
const frames = parseFigureFrames(svg);
if (frames.length !== 120) fail(`c4-b5: expected 120 frames, parsed ${frames.length}`);
let checked = 0;
for (let t = 0; t + 1 < frames.length; t++) {
  const ph = phase(t);
  for (let y0 = ph; y0 + 1 < FIGURE_H; y0 += 2) {
    for (let x0 = ph; x0 + 1 < FIGURE_W; x0 += 2) {
      const get = (f: number, x: number, y: number) => (frames[f].live.has(`${x},${y}`) ? 1 : 0);
      const before: Block = [get(t, x0, y0), get(t, x0 + 1, y0), get(t, x0, y0 + 1), get(t, x0 + 1, y0 + 1)];
      const after: Block = [get(t + 1, x0, y0), get(t + 1, x0 + 1, y0), get(t + 1, x0, y0 + 1), get(t + 1, x0 + 1, y0 + 1)];
      const got = blockRule(ph, before);
      checked++;
      if (got.join('') !== after.join('')) fail(`c4-b5 t=${t} block (${x0},${y0}): ${before.join('')} -> ${got.join('')}, figure ${after.join('')}`);
    }
  }
}
console.log(`1. c4-b5: ${checked} interior block updates across ${frames.length - 1} transitions`);

// Deterministic random boards.
let seed = 20261005;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
function randomBoard(density: number, rockDensity: number): Board {
  const b = emptyBoard();
  for (let i = 0; i < b.cells.length; i++) {
    if (rnd() < rockDensity) b.rocks[i] = 1;
    else if (rnd() < density) b.cells[i] = 1;
  }
  b.turn = Math.floor(rnd() * 7) - 3;
  return b;
}
const same = (a: Board, b: Board) => a.turn === b.turn && a.cells.every((v, i) => v === b.cells[i]);

// 2 and 3.
let runs = 0;
for (const rocks of [0, 0.05]) {
  for (let trial = 0; trial < 40; trial++) {
    const start = randomBoard(0.1 + rnd() * 0.5, rocks);
    const n0 = liveCount(start);
    const steps = 1 + Math.floor(rnd() * 200);
    let b = start;
    for (let i = 0; i < steps; i++) {
      b = step(b);
      if (liveCount(b) !== n0) { fail(`count changed at turn ${b.turn} (rocks ${rocks})`); break; }
      if (b.cells.some((v, j) => v && b.rocks[j])) { fail('a live cell sits on a rock'); break; }
    }
    for (let i = 0; i < steps; i++) b = stepBack(b);
    if (!same(b, start)) fail(`forward ${steps} then back did not restore the board (rocks ${rocks})`);
    // Backward first, then forward.
    let c = start;
    for (let i = 0; i < steps; i++) c = stepBack(c);
    if (liveCount(c) !== n0) fail('count changed stepping back');
    for (let i = 0; i < steps; i++) c = step(c);
    if (!same(c, start)) fail(`back ${steps} then forward did not restore the board (rocks ${rocks})`);
    runs++;
  }
}
console.log(`2–3. ${runs} random boards: forward/back restores, live count constant`);

// 4. Exhaustive bijection with a rock on a 4 × 4 wrapping board.
for (const ph of [0, 1]) {
  const seen = new Set<string>();
  const rockAt = 5;
  let states = 0;
  for (let s = 0; s < 1 << 16; s++) {
    if (s & (1 << rockAt)) continue; // no live cell on the rock
    const b = emptyBoard(4, 4);
    b.rocks[rockAt] = 1;
    b.turn = ph;
    for (let i = 0; i < 16; i++) b.cells[i] = (s >> i) & 1;
    const key = step(b).cells.join('');
    if (seen.has(key)) fail(`rocks: two states collide at phase ${ph}`);
    seen.add(key);
    states++;
  }
  if (seen.size !== states) fail(`rocks: phase ${ph} map is not one-to-one`);
}
console.log('4. rocks: each phase map is one-to-one on all 4 × 4 states with a rock');

// 5. c4-b5 preset.
if (frameRows(frames[0]).join('/') !== C4B5_OPENING.join('/')) fail('preset: opening frame differs from the figure at t=0');
{
  let b = c4b5Preset();
  let bad = 0;
  for (let t = 0; t < frames.length; t++) {
    for (let y = 0; y < FIGURE_H; y++) for (let x = 0; x < FIGURE_W; x++) {
      const want = frames[t].live.has(`${x},${y}`) ? 1 : 0;
      if (b.cells[y * b.w + x] !== want || b.cells[(y + 16) * b.w + x] !== want) bad++;
    }
    b = step(b);
  }
  if (bad) fail(`preset: crop differs from the figure in ${bad} cell-turns`);
  console.log(`5. c4-b5 preset replays all ${frames.length} frames in its crop`);
}

// 6. Symbol.
if (STATES[0].rows.join('/') !== SYMBOL_ROWS.join('/')) fail('symbol: first state is not the drawn shape');
for (const turn of [0, 1]) for (const px of [0, 1]) for (const py of [0, 1]) {
  let b = boardWithSymbol(20 + px, 14 + py, turn);
  for (let t = 0; t < 64; t++) {
    if (countSymbols(b) !== 1) { fail(`symbol drawn alone not recognised exactly once at turn ${b.turn} (start ${turn}${px}${py})`); break; }
    b = step(b);
  }
}
{
  let b = impactPreset();
  const hits: number[] = [];
  for (let t = 0; t < 80; t++) { if (findSymbols(b).length) hits.push(t); b = step(b); }
  if (hits.join(',') !== '22,23,26,27') fail(`impact preset: symbol recognised on turns ${hits.join(',')}`);
  console.log(`6. symbol: ${STATES.length} cycle states, recognised alone on every turn; impact preset on turns ${hits.join(', ')}`);
}

// 7. URL.
for (const b of [c4b5Preset(), impactPreset(), randomBoard(0.3, 0.05)]) {
  const d = decodeBoard(encodeBoard(b));
  if (!d || !same(d, b) || !d.rocks.every((v, i) => v === b.rocks[i])) fail('url: state does not round-trip');
}
if (decodeBoard('nonsense') !== null || decodeBoard('1.x..') !== null) fail('url: accepts malformed state');
console.log('7. url state round-trips');

if (failures.length) {
  console.error(`FAIL (${failures.length})`);
  for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
  process.exit(1);
}
console.log('OK');
