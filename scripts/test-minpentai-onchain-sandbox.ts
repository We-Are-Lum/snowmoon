/**
 * The verifier's engine sandbox (review finding 3, 2026-10-21): a ruleset's engine runs bundled in
 * its own vm context. Hostile or nondeterministic engines must fail without touching the host: no
 * process, no files, no eval or new Function, no Math.random or Date, no endless loop. The real
 * pinned engine must still give the same results as the working tree's.
 *
 *   npm run test:minpentai-onchain-sandbox
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { REPLAY_ENTRY } from '../src/lib/minpentai/onchain/ruleset';
import { replaySolo } from '../src/lib/minpentai/onchain/replay';
import { fullRangeSet } from '../src/lib/minpentai/onchain/sample';
import { loadRuleset, sandboxEngine } from '../src/lib/minpentai/onchain/verify';

let failed = 0, passed = 0;
const check = (name: string, bad: string | void | undefined) => { if (bad) { failed++; console.log(`FAIL ${name}: ${bad}`); } else passed++; };
const marker = path.join(tmpdir(), `minpentai-sandbox-marker-${process.pid}`);
const tail = `export class ReplayError extends Error {}
export const engineSeed = (s: string) => parseInt(s.slice(58), 16);
export function replaySolo(input: any): any { return run(input); }`;
const hostile: [string, string][] = [
  ['reach process through globalThis (the reviewer\'s proof)', `function run(_: any) { const g = globalThis as any; const p = g['pro' + 'cess']; p.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x'); return {}; }`],
  ['reach process through the constructor chain', `function run(_: any) { const F = ({} as any).constructor.constructor; const p = F('return pro' + 'cess')(); p.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x'); return {}; }`],
  ['use eval', `function run(_: any) { return (0, (globalThis as any)['ev' + 'al'])('1+1'); }`],
  ['use Math.random', `function run(_: any) { return { rule: 'diag', win: Math.random() < 0.5 ? 'C' : 'A', step: 1, board: { tw: {}, sq: {}, gl: [] } }; }`],
  ['use Date.now', `function run(_: any) { return { rule: 'diag', win: Date.now() % 2 ? 'C' : 'A', step: 1, board: { tw: {}, sq: {}, gl: [] } }; }`],
  ['use new Date()', `function run(_: any) { return { rule: 'diag', win: new Date().getSeconds() % 2 ? 'C' : 'A', step: 1, board: { tw: {}, sq: {}, gl: [] } }; }`],
  ['loop forever', `function run(_: any) { for (;;) {} }`],
  ['reach require', `function run(_: any) { const r = (globalThis as any)['requ' + 'ire']; r('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x'); return {}; }`],
];

const main = async () => {
  for (const [what, body] of hostile) {
    const dir = mkdtempSync(path.join(tmpdir(), 'minpentai-hostile-'));
    rmSync(marker, { force: true });
    try {
      mkdirSync(path.dirname(path.join(dir, REPLAY_ENTRY)), { recursive: true });
      writeFileSync(path.join(dir, REPLAY_ENTRY), `${body}\n${tail}\n`);
      const t0 = Date.now();
      let refused = false, detail = '';
      try {
        const e = await sandboxEngine(dir);
        const r = e.replay({ seed: 1, level: 1, turns: [], end: { kind: 'end' } });
        refused = !r.ok && !r.replayError;
        detail = r.ok ? 'ran and returned a result' : r.message;
      } catch (err) { refused = true; detail = (err as Error).message; }
      const took = Date.now() - t0;
      check(`an engine that tries to ${what} fails, without touching the host`, refused && !existsSync(marker) && took < 30_000 ? undefined : `refused ${refused}, marker ${existsSync(marker)}, ${took} ms: ${detail}`);
      console.log(`  ${what}: ${detail.slice(0, 90)} (${took} ms)`);
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(marker, { force: true }); }
  }
  // The real engine, sandboxed, gives exactly what the working tree's replay gives.
  const m = JSON.parse(readFileSync('docs/minpentai/rulesets/solo-v1.json', 'utf8'));
  const rs = await loadRuleset(m);
  const set = fullRangeSet().slice(0, 60);
  const diffs = set.filter((x) => {
    const a = replaySolo(x), b = rs.engine.replay(x as never);
    if (!b.ok) return true;
    return a.win !== b.win || a.step !== b.step || a.rule !== b.rule || JSON.stringify(a.board.tw) !== JSON.stringify(b.board.tw) || JSON.stringify(a.board.sq) !== JSON.stringify(b.board.sq) || a.board.gl.length !== b.board.gl.length;
  });
  check('the real pinned engine, sandboxed, matches the working tree on 60 full-range matches', diffs.length ? `${diffs.length} differ` : undefined);
  console.log(failed ? `sandbox: ${failed} failed, ${passed} passed` : `sandbox: ${passed} checks passed`);
  process.exit(failed ? 1 : 0);
};
void main();
