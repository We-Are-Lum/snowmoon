/** SCRATCH: time per turn and simulations per turn for each search level, over a few matches against rung 5. */
import { playMatch, rung, type Player } from '../../src/lib/minpentai/play-game/players';
import { LEVELS, lastSims, searchPlayer } from './search-player';
import * as sp from './search-player';
for (const lvl of [1, 2, 3, 4, 5]) {
  const inner = searchPlayer(lvl);
  const times: number[] = [], sims: number[] = [];
  const timed: Player = (v) => { const t = performance.now(); const out = inner(v); times.push(performance.now() - t); sims.push(sp.lastSims); return out; };
  let wins = 0;
  for (let seed = 1; seed <= 6; seed++) { const r = playMatch(rung(5), timed, seed); if (r.win === 'A') wins++; }
  times.sort((a, b) => a - b); sims.sort((a, b) => a - b);
  console.log(`level ${lvl} (${JSON.stringify(LEVELS[lvl])}): ${times.length} turns, median ${times[times.length >> 1].toFixed(0)} ms, p95 ${times[Math.floor(times.length * 0.95)].toFixed(0)} ms, max ${times[times.length - 1].toFixed(0)} ms; sims median ${sims[sims.length >> 1]}, max ${sims[sims.length - 1]}; won ${wins}/6 vs rung 5 as Amber`);
}
void lastSims;
