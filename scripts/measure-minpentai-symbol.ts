/**
 * How often the symbol counting rule matches by chance on random boards.
 *
 *   npx tsx scripts/measure-minpentai-symbol.ts
 *
 * Random 48 × 32 boards at several densities are run for 400 turns (after 100 turns
 * of mixing) and every recognised symbol is counted, under both rules: every state
 * of the symbol's cycle, and only its connected states. For scale, a symbol drawn
 * alone is also checked: on what share of turns each rule recognises it.
 */
import { emptyBoard, step, type Board } from '../src/lib/minpentai/engine';
import { STATES, boardWithSymbol, countSymbols, type CountMode } from '../src/lib/minpentai/symbol';

let seed = 99;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const modes: CountMode[] = ['all-states', 'connected-states'];

console.log(`symbol states over its cycle: ${STATES.length} (${STATES.filter((s) => s.connected).length} connected)`);
for (const s of STATES) console.log(`  ${s.rows.join('/').padEnd(18)} ${s.connected ? 'connected' : 'in pieces'}`);

console.log('\nchance matches on random boards (48 × 32), per turn, mean over 4 boards × 400 turns:');
for (const density of [0.02, 0.05, 0.1, 0.25, 0.4]) {
  const sums: Record<CountMode, number> = { 'all-states': 0, 'connected-states': 0 };
  let turns = 0;
  for (let k = 0; k < 4; k++) {
    let b: Board = emptyBoard();
    for (let i = 0; i < b.cells.length; i++) if (rnd() < density) b.cells[i] = 1;
    for (let t = 0; t < 100; t++) b = step(b);
    for (let t = 0; t < 400; t++) {
      for (const m of modes) sums[m] += countSymbols(b, m);
      turns++;
      b = step(b);
    }
  }
  console.log(`  density ${String(density).padEnd(4)}  all states ${(sums['all-states'] / turns).toFixed(3)}   connected only ${(sums['connected-states'] / turns).toFixed(3)}`);
}

console.log('\na symbol drawn alone: share of turns it is recognised (8 starts × 64 turns):');
for (const m of modes) {
  let hit = 0, n = 0;
  for (const turn of [0, 1]) for (const px of [0, 1]) for (const py of [0, 1]) {
    let b = boardWithSymbol(20 + px, 14 + py, turn);
    for (let t = 0; t < 64; t++) { hit += countSymbols(b, m) > 0 ? 1 : 0; n++; b = step(b); }
  }
  console.log(`  ${m.padEnd(17)} ${((100 * hit) / n).toFixed(0)}% of turns`);
}
