/**
 * The search computer's five levels, spaced by self-play (2026-10-31): every pair of levels (and each level
 * against the old Planner, rung 5) plays N seeds with seats swapped, on Play's ruleset and on the book edition.
 * Prints each pairing's score (wins + half the draws, for the first named) and the time and simulated steps
 * per turn. Timing is measured only to report it; no player ever reads a clock.
 *
 *   npm run minpentai:search-ladder -- --n 20            (all pairings, both rulesets, in parallel)
 *   npm run minpentai:search-ladder -- --pair 3,4 --ruleset book --n 5   (one pairing, as JSON)
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { playSearchMatch, rungPlayer, searchPlayer, type Planner } from '../src/lib/minpentai/versions/search';
import { SOLO_V1, type VersionRules } from '../src/lib/minpentai/versions/solo-v1';
import { BOOK_EDITION } from '../src/lib/minpentai/versions/book-edition';
import type { World } from '../src/lib/minpentai/versions/engine';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('n', '10');
const RULESETS: Record<string, VersionRules> = { play: SOLO_V1, book: BOOK_EDITION };

interface PairResult { ruleset: string; a: string; b: string; w: number; d: number; l: number; ms: number[]; steps: number[]; illegal: number }

function player(name: string, real: () => World, ms: number[], steps: number[]): Planner {
  const p = name.startsWith('r') ? rungPlayer(+name.slice(1), real) : searchPlayer(+name);
  return (m) => {
    const t0 = performance.now();
    const out = p(m);
    if (!name.startsWith('r')) { ms.push(performance.now() - t0); steps.push(out.steps ?? 0); }
    return out;
  };
}

function runPair(ruleset: string, a: string, b: string): PairResult {
  const r: PairResult = { ruleset, a, b, w: 0, d: 0, l: 0, ms: [], steps: [], illegal: 0 };
  for (let seed = 1; seed <= N; seed++) {
    for (const aSide of ['C', 'A'] as const) {
      const m = playSearchMatch(RULESETS[ruleset], (real) => aSide === 'C'
        ? { C: player(a, real, r.ms, r.steps), A: player(b, real, r.ms, r.steps) }
        : { C: player(b, real, r.ms, r.steps), A: player(a, real, r.ms, r.steps) }, seed);
      r.illegal += m.illegal;
      if (m.win === aSide) r.w++; else if (m.win === 'D') r.d++; else r.l++;
    }
  }
  return r;
}

const pct = (xs: number[], q: number) => { const s = [...xs].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; };

async function main() {
  const pair = arg('pair', '');
  if (pair) {
    const [a, b] = pair.split(',');
    process.stdout.write(JSON.stringify(runPair(arg('ruleset', 'play'), a, b)) + '\n');
    return;
  }
  const levels = ['1', '2', '3', '4', '5'];
  const jobs: [string, string, string][] = [];
  for (const rs of Object.keys(RULESETS)) {
    for (let i = 0; i < levels.length; i++) for (let j = i + 1; j < levels.length; j++) jobs.push([rs, levels[j], levels[i]]);
    for (const l of levels) jobs.push([rs, l, 'r5']);
  }
  const results: PairResult[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const [rs, a, b] = jobs[next++];
      const out = await new Promise<string>((done, fail) => {
        const c = spawn(process.execPath, [...process.execArgv, process.argv[1], '--pair', `${a},${b}`, '--ruleset', rs, '--n', String(N)], { stdio: ['ignore', 'pipe', 'inherit'] });
        let s = '';
        c.stdout.on('data', (x) => (s += x));
        c.on('exit', (code) => (code ? fail(new Error(`${rs} ${a},${b} exited ${code}`)) : done(s)));
      });
      const r = JSON.parse(out) as PairResult;
      results.push(r);
      console.error(`${rs.padEnd(4)} ${a} vs ${b}: ${r.w}/${r.d}/${r.l}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, cpus().length - 2) }, worker));
  const order = (x: PairResult) => `${x.ruleset}${x.b}${x.a}`;
  results.sort((x, y) => order(x).localeCompare(order(y)));
  console.log(`\nSearch levels, ${N} seeds a pairing, seats swapped (${2 * N} matches). Score = wins + half the draws, for the first named.\n`);
  console.log('| Ruleset | Pairing | Won / drawn / lost | Score |');
  console.log('|---|---|---|---|');
  for (const r of results) console.log(`| ${r.ruleset === 'play' ? 'Play' : 'Book edition'} | ${r.b === 'r5' ? `Search ${r.a} vs Planner (rung 5)` : `Search ${r.a} vs Search ${r.b}`} | ${r.w} / ${r.d} / ${r.l} | ${Math.round((100 * (r.w + r.d / 2)) / (2 * N))}% |`);
  console.log('\nTime and simulated steps per turn (this machine, Node):\n');
  console.log('| Ruleset | Level | Median ms | 95th pct ms | Slowest ms | Most steps |');
  console.log('|---|---|---|---|---|---|');
  for (const rs of Object.keys(RULESETS)) for (const l of levels) {
    const ms: number[] = [], st: number[] = [];
    // A level's own turns: in a pairing a,b both sides' turns are pooled, so take pairings against the Planner only.
    for (const r of results) if (r.ruleset === rs && r.a === l && r.b === 'r5') { ms.push(...r.ms); st.push(...r.steps); }
    console.log(`| ${rs === 'play' ? 'Play' : 'Book edition'} | ${l} | ${pct(ms, 0.5).toFixed(0)} | ${pct(ms, 0.95).toFixed(0)} | ${Math.max(0, ...ms).toFixed(0)} | ${Math.max(0, ...st)} |`);
  }
  const illegal = results.reduce((t, r) => t + r.illegal, 0);
  console.log(`\nIllegal turns: ${illegal}`);
  if (illegal) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
