/**
 * SCRATCH: one search level against every current computer level (0 practice, 1-5 the ladder rungs),
 * 200 matches each: 100 seeds as Amber and 100 as Cyan (players.ts tally; the board is turned for Cyan).
 *   npx tsx scratch/minpentai-stronger/vs-rungs.ts <search level>   -> scratch/minpentai-stronger/results-L<n>.json
 */
import { writeFileSync } from 'node:fs';
import { rung, tally, type Player } from '../../src/lib/minpentai/play-game/players';
import { searchPlayer } from './search-player';
import * as sp from './search-player';
const lvl = Number(process.argv[2]);
const inner = searchPlayer(lvl);
const times: number[] = [], sims: number[] = [];
const timed: Player = (v) => { const t = performance.now(); const out = inner(v); times.push(performance.now() - t); sims.push(sp.lastSims); return out; };
const rows: Record<string, unknown>[] = [];
for (let opp = 0; opp <= 5; opp++) {
  const t0 = performance.now();
  const r = tally(timed, rung(opp), 100, 1);
  rows.push({ opponent: opp, ...r, refused: r.refused.length, winRate: r.win / 200, seconds: Math.round((performance.now() - t0) / 1000) });
  console.log(`search L${lvl} vs level ${opp}: ${r.win} won, ${r.draw} drawn, ${r.loss} lost of 200 (${r.refused.length} refused)`);
}
times.sort((a, b) => a - b); sims.sort((a, b) => a - b);
const q = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
writeFileSync(`scratch/minpentai-stronger/results-L${lvl}.json`, JSON.stringify({ level: lvl, rows, turns: times.length, ms: { median: q(times, 0.5), p95: q(times, 0.95), p99: q(times, 0.99), max: times[times.length - 1] }, sims: { median: q(sims, 0.5), max: sims[sims.length - 1] } }, null, 2));
