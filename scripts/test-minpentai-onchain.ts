/**
 * Onchain Minpentai v1 (spike): determinism. A finished solo match must replay to exactly the same
 * result, computer moves and final board from (ruleset, seed, the person's moves), every run, in
 * Node and in the browser.
 *
 *   npm run test:minpentai-onchain            Node only
 *   npm run test:minpentai-onchain -- --browser   also in Chromium (bundles sample.ts with esbuild)
 */
import { build } from 'esbuild';
import { PlayController, type Env } from '../src/lib/minpentai/play-game/controller';
import { MAXS } from '../src/lib/minpentai/play-game/game';
import { ReplayError, replaySolo } from '../src/lib/minpentai/onchain/replay';
import { digest, fixedSet, sampleMatch } from '../src/lib/minpentai/onchain/sample';

let failed = 0, passed = 0;
const check = (name: string, f: () => string | void | Promise<string | void>) =>
  Promise.resolve()
    .then(f)
    .then((bad) => (bad ? (failed++, console.log(`FAIL ${name}: ${bad}`)) : passed++))
    .catch((e) => (failed++, console.log(`FAIL ${name}: ${(e as Error).stack}`)));

const boardKey = (w: { tw: object; sq: object; gl: { x: number; y: number; dx: number; dy: number; o: string }[]; step: number }) =>
  JSON.stringify([w.step, Object.entries(w.tw), Object.entries(w.sq), w.gl.map((g) => [g.x, g.y, g.dx || 0, g.dy || 0, g.o])]);

const main = async () => {
  // 1. The page's own controller and replaySolo agree, for every level, played out and resigned.
  await check('the page (PlayController) and replaySolo give the same match, levels 0–5, 30 seeds each', () => {
    for (let level = 0; level <= 5; level++) for (let i = 0; i < 30; i++) {
      const seed = (i * 33331 + level * 7) % 1_000_000;
      const s = sampleMatch(seed, level, i % 5 === 4 ? 1 + (i % 4) : undefined);
      let tick: () => void = () => {};
      const env: Env = { now: () => seed, setInterval: (f) => { tick = f; return 1; }, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {}, copy: () => {}, href: () => '' };
      const ctl = new PlayController(env);
      ctl.openStart(level === 0 ? 'practice' : 'ladder', level === 0 ? undefined : level);
      ctl.begin();
      const m = ctl.m!;
      if (m.seed !== seed) return `the page's match keeps seed ${m.seed}, not ${seed}`;
      const amber = [];
      let t = 0;
      while (m.phase === 'act') {
        amber.push(m.pend.A.map((p) => ({ ...p })));
        if (s.end.kind === 'resign' && t === s.turns.length) { ctl.resign(); break; }
        m.pend.C = s.turns[t++].map((p) => ({ ...p }));
        ctl.endTurn();
        for (let g = 0; (m.phase as string) === 'run' && g < MAXS + 2; g++) tick();
      }
      const r = replaySolo(s);
      const where = `level ${level}, seed ${seed}`;
      if (m.phase !== 'over' || !m.res) return `${where}: the page's match did not end`;
      if (m.rule !== r.rule) return `${where}: rule ${m.rule} on the page, ${r.rule} in the replay`;
      if (m.res.win !== r.win || m.res.step !== r.step) return `${where}: the page ended ${m.res.win} at ${m.res.step}, the replay ${r.win} at ${r.step}`;
      if (JSON.stringify(amber) !== JSON.stringify(r.amber)) return `${where}: the computer player's moves differ`;
      if (boardKey(m.w) !== boardKey(r.board)) return `${where}: the final boards differ`;
    }
  });

  // 2. Same inputs, same everything: run twice, and from fresh copies of the inputs.
  const set = fixedSet();
  const d1 = digest(set);
  await check('the fixed set (120 matches) replays to the same digest twice, and from copied inputs', () => {
    const d2 = digest(set);
    const d3 = digest(JSON.parse(JSON.stringify(set)));
    if (d1 !== d2 || d1 !== d3) return `${d1} / ${d2} / ${d3}`;
  });
  await check('the fixed set covers every level, every rule, wins, losses, draws and resigns', () => {
    const rs = set.map((m) => ({ m, r: replaySolo(m) }));
    const has = (f: (x: (typeof rs)[number]) => boolean, what: string) => (rs.some(f) ? '' : `no ${what}; `);
    return (
      [0, 1, 2, 3, 4, 5].map((l) => has((x) => x.m.level === l, `level ${l}`)).join('') +
      ['diag', 'cost3', 'sight2', 'every8'].map((u) => has((x) => x.r.rule === u, `rule ${u}`)).join('') +
      has((x) => x.r.win === 'C', 'win') + has((x) => x.r.win === 'A' && x.m.end.kind === 'end', 'loss') +
      has((x) => x.r.win === 'D', 'draw') + has((x) => x.m.end.kind === 'resign', 'resign')
    ) || undefined;
  });

  // 3. A replay refuses what the page could not have produced.
  await check('a replay refuses a bad seed, level, placement, too few or too many turns, a resign after the end', () => {
    const s = sampleMatch(4242, 3);
    const bad: [string, () => unknown][] = [
      ['seed', () => replaySolo({ ...s, seed: 1_000_000 })],
      ['level', () => replaySolo({ ...s, level: 6 })],
      ['too few turns', () => replaySolo({ ...s, turns: s.turns.slice(0, -1) })],
      ['too many turns', () => replaySolo({ ...s, turns: [...s.turns, []] })],
      ['off the lit area', () => replaySolo({ ...s, turns: [[{ t: 's', o: 'C', x: 14, y: 9, dx: 0, dy: 0 }], ...s.turns.slice(1)] })],
      ['over 8 points', () => replaySolo({ ...s, turns: [[0, 1, 2].map((i) => ({ t: 't' as const, o: 'C' as const, x: 2, y: 1 + i, dx: 0, dy: 0 })), ...s.turns.slice(1)] })],
      ['resign after the end', () => replaySolo({ ...s, end: { kind: 'resign', step: MAXS } })],
    ];
    const missed = bad.filter(([, f]) => { try { f(); return true; } catch (e) { return !(e instanceof ReplayError); } }).map(([n]) => n);
    if (missed.length) return `not refused: ${missed.join(', ')}`;
  });

  // 4. The same digest in Chromium.
  if (process.argv.includes('--browser')) {
    await check('Chromium replays the fixed set to the same digest as Node', async () => {
      const out = await build({
        stdin: { contents: "import { digest, fixedSet } from './src/lib/minpentai/onchain/sample'; (window as any).__d = digest(fixedSet());", resolveDir: process.cwd(), loader: 'ts' },
        bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '~': './src' },
      });
      const { chromium } = await import('playwright-core');
      const b = await chromium.launch({ channel: 'chrome' });
      try {
        const p = await b.newPage();
        await p.setContent(`<script>${out.outputFiles[0].text}</script>`);
        const d = await p.evaluate(() => (window as unknown as { __d: string }).__d);
        if (d !== d1) return `Chromium ${d}, Node ${d1}`;
      } finally {
        await b.close();
      }
    });
  }

  console.log(failed ? `onchain determinism: ${failed} failed, ${passed} passed` : `onchain determinism: ${passed} checks passed (digest ${d1.slice(0, 18)}…)`);
  process.exit(failed ? 1 : 0);
};
void main();
