/** SCRATCH: per-turn time and simulated engine steps, uncontended, for search levels 3 and 5 over 20 matches against rung 5. Also runs in Chromium (bundled). */
import { playMatch, rung, type Player } from '../../src/lib/minpentai/play-game/players';
import * as sp from './search-player';
export function bench(lvl: number, matches = 20) {
  const inner = sp.searchPlayer(lvl);
  const ms: number[] = [], steps: number[] = [];
  const timed: Player = (v) => { const t = performance.now(); const out = inner(v); ms.push(performance.now() - t); steps.push(sp.lastSteps); return out; };
  for (let seed = 1; seed <= matches; seed++) playMatch(rung(5), timed, seed + (seed % 2 ? 0 : 10000));
  const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
  const usPerStep = ms.reduce((a, b) => a + b, 0) * 1000 / steps.reduce((a, b) => a + b, 0);
  return { lvl, turns: ms.length, msMedian: Math.round(q(ms, 0.5)), msP95: Math.round(q(ms, 0.95)), msMax: Math.round(q(ms, 1)), stepsMedian: q(steps, 0.5), stepsMax: q(steps, 1), usPerStep: +usPerStep.toFixed(2) };
}
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('bench.ts')) for (const l of [3, 5]) console.log('node', JSON.stringify(bench(l)));
