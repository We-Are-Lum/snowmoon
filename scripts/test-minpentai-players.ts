/**
 * Computer players outside the page (src/lib/minpentai/play-game/players.ts) and
 * npm run minpentai:vs-rungs. Fails (exit 1) on any problem. No server, no network.
 *
 *   npm run test:minpentai-players
 *
 * Checks:
 * - The same game as the site: a ladder match driven through the page's own PlayController (each
 *   rung as Amber, the seed as its clock) ends exactly as playMatch does with the same seed, turn by
 *   turn: the same placements, the same end step and winner.
 * - The view hides what it should: over real positions, a view holds no piece of the opponent's
 *   outside the lit squares, and every rock; every piece within R of the player's towers is in it.
 * - The five rungs plan the same on the view as on the whole board (botPlan reads only what its
 *   towers light), in both seats, at every turn of every match played.
 * - Refused turns: off the lit area, a taken square, too many points, a diagonal glider without the
 *   'diag' rule, a player that throws: each is refused, named, and counted as a loss.
 * - A player cannot change the match by changing its view. The same seed gives the same match.
 * - The example (scripts/minpentai-players/first-player.ts) plays the five rungs with no refused turn,
 *   and the script runs it, a rung, and the round robin.
 */
import { execFileSync } from 'node:child_process';
import { PlayController, type Env } from '../src/lib/minpentai/play-game/controller';
import { H, K, W, apply, botPlan, clone, lit, rng, step, towers, updLS, world, type Placement, type Side, type World } from '../src/lib/minpentai/play-game/game';
import { PlayerError, fogView, playMatch, rung, tally, turnKey, turned, type Player } from '../src/lib/minpentai/play-game/players';
import first from './minpentai-players/first-player';

let pass = 0;
const failures: string[] = [];
const check = (name: string, f: () => string | void) => {
  try {
    const why = f();
    if (why) failures.push(`${name}: ${why}`); else { pass++; console.log(`  ok   ${name}`); }
  } catch (e) { failures.push(`${name}: threw ${(e as Error).stack}`); }
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// 1. The same game as the site.
check('a ladder match on the page (PlayController) ends as playMatch does, for every rung, seeds 1–6', () => {
  for (let lvl = 1; lvl <= 5; lvl++) for (let seed = 1; seed <= 6; seed++) {
    const cyanLvl = ((lvl + seed) % 5) + 1;
    let tick: () => void = () => {};
    const env: Env = { now: () => seed, setInterval: (f) => { tick = f; return 1; }, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {}, copy: () => {}, href: () => '' };
    const ctl = new PlayController(env);
    ctl.openStart('ladder', lvl);
    ctl.begin();
    const m = ctl.m!;
    const rC = rng((seed ^ 0x5eed) >>> 0);
    const moves: { step: number; C: Placement[]; A: Placement[] }[] = [];
    while (m.phase === 'act') {
      const tw = turned(m.w);
      const c = rung(cyanLvl)({ w: fogView(tw, 'A', m.R), R: m.R, cost: m.cost, every: m.every, rule: m.rule, points: 8, mine: m.snap.C.map(turnKey), lastSeen: Object.fromEntries(Object.entries(m.lsC).map(([k, v]) => [turnKey(+k), v])), rng: rC });
      m.pend.C = c.map((p) => ({ ...p, o: 'C', x: W - 1 - p.x, y: H - 1 - p.y, dx: -p.dx || 0, dy: -p.dy || 0 }));
      moves.push({ step: m.w.step, C: m.pend.C.map((p) => ({ ...p })), A: m.pend.A.map((p) => ({ ...p })) });
      ctl.endTurn();
      for (let guard = 0; (m.phase as string) === 'run' && guard < 200; guard++) tick();
    }
    const r = playMatch(rung(cyanLvl), rung(lvl), seed);
    if (m.phase !== 'over' || !m.res) return `rung ${lvl}, seed ${seed}: the page's match did not end`;
    if (m.rule !== r.rule) return `rung ${lvl}, seed ${seed}: rule ${m.rule} on the page, ${r.rule} here`;
    if (!same(moves, r.moves)) return `rung ${lvl}, seed ${seed}: the placements differ`;
    if (m.res.win !== r.win || m.res.step !== r.step) return `rung ${lvl}, seed ${seed}: the page ended ${m.res.win} at ${m.res.step}, playMatch ${r.win} at ${r.step}`;
  }
});

// Real positions: replay matches between rungs and keep the board at every turn to act.
interface Pos { w: World; R: number; cost: number; every: number; rule: ReturnType<typeof playMatch>['rule']; snap: Record<Side, number[]>; lsC: Record<number, number>; lsA: Record<number, number> }
const positions: Pos[] = [];
for (let seed = 1; seed <= 24; seed++) {
  const r = playMatch(rung((seed % 5) + 1), rung(((seed + 2) % 5) + 1), seed);
  const R = r.rule === 'sight2' ? 2 : 3, every = r.rule === 'every8' ? 8 : 12, cost = r.rule === 'cost3' ? 3 : 4;
  const m = { w: world(), R, lsC: { [K(13, 2)]: 0, [K(13, 7)]: 0 } as Record<number, number>, lsA: { [K(1, 2)]: 0, [K(1, 7)]: 0 } as Record<number, number>, pend: { C: [] as Placement[], A: [] as Placement[] } };
  for (const mv of r.moves) {
    positions.push({ w: clone(m.w), R, cost, every, rule: r.rule, snap: { C: towers(m.w, 'C'), A: towers(m.w, 'A') }, lsC: { ...m.lsC }, lsA: { ...m.lsA } });
    m.pend = { C: mv.C, A: mv.A };
    apply(m); updLS(m);
    do { step(m.w); updLS(m); } while (m.w.step % every !== 0 && towers(m.w, 'C').length && towers(m.w, 'A').length && m.w.step < 96);
  }
}

check(`the view: no opponent piece outside the lit squares, every rock, everything lit (${positions.length} positions, both seats)`, () => {
  for (const p of positions) for (const [w, me] of [[p.w, 'A'], [turned(p.w), 'A']] as [World, Side][]) {
    const v = fogView(w, me, p.R), see = lit(w, me, p.R);
    for (const k in v.tw) if (v.tw[k] !== me && !see.has(+k)) return `step ${w.step}: a tower in the dark`;
    for (const k in v.sq) if (v.sq[k].o !== me && !see.has(+k)) return `step ${w.step}: a square in the dark`;
    for (const g of v.gl) if (!see.has(K(g.x, g.y))) return `step ${w.step}: a glider in the dark`;
    if (Object.keys(v.rock).length !== Object.keys(w.rock).length) return 'a rock is missing';
    for (const k of see) {
      if (w.tw[k] && v.tw[k] !== w.tw[k]) return `step ${w.step}: a lit tower is missing`;
      if (w.sq[k] && !same(v.sq[k], w.sq[k])) return `step ${w.step}: a lit square is missing`;
    }
    if (v.gl.length !== w.gl.filter((g) => see.has(K(g.x, g.y))).length) return `step ${w.step}: a lit glider is missing`;
  }
});

check(`the five rungs (and practice's level 0) plan the same on the view as on the whole board (${positions.length} positions × 6 levels × 2 seats)`, () => {
  for (const p of positions) for (let lvl = 0; lvl <= 5; lvl++) {
    const s = p.w.step * 31 + lvl;
    const full = botPlan({ w: p.w, lvl, R: p.R, rng: rng(s), cost: p.cost, every: p.every, rule: p.rule, snap: p.snap, lsA: p.lsA });
    const viewed = rung(lvl)({ w: fogView(p.w, 'A', p.R), R: p.R, cost: p.cost, every: p.every, rule: p.rule, points: 8, mine: p.snap.A, lastSeen: { ...p.lsA }, rng: rng(s) });
    if (!same(full, viewed)) return `level ${lvl} at step ${p.w.step} (Amber's seat): ${JSON.stringify(full)} on the board, ${JSON.stringify(viewed)} on the view`;
    const tw = turned(p.w), snapT = { A: p.snap.C.map(turnKey), C: p.snap.A.map(turnKey) };
    const lsT = Object.fromEntries(Object.entries(p.lsC).map(([k, v]) => [turnKey(+k), v]));
    const fullT = botPlan({ w: tw, lvl, R: p.R, rng: rng(s), cost: p.cost, every: p.every, rule: p.rule, snap: snapT, lsA: lsT });
    const viewedT = rung(lvl)({ w: fogView(tw, 'A', p.R), R: p.R, cost: p.cost, every: p.every, rule: p.rule, points: 8, mine: snapT.A, lastSeen: lsT, rng: rng(s) });
    if (!same(fullT, viewedT)) return `level ${lvl} at step ${p.w.step} (Cyan's seat): differs`;
  }
});

// Refused turns.
const zoneOf = (v: Parameters<Player>[0]) => [...lit(v.w, 'A', v.R, v.mine)].filter((k) => !v.w.rock[k] && !v.w.sq[k] && !v.w.tw[k] && !v.w.gl.some((g) => K(g.x, g.y) === k));
const bad: [string, Player, RegExp][] = [
  ['off the lit area', () => [{ t: 's', o: 'A', x: 0, y: 0, dx: 0, dy: 0 }], /lit area/],
  ['a taken square', (v) => [{ t: 's', o: 'A', x: v.mine[0] % W, y: Math.floor(v.mine[0] / W), dx: 0, dy: 0 }], /taken/],
  ['too many points', (v) => zoneOf(v).slice(0, 9).map((k) => ({ t: 's', o: 'A', x: k % W, y: Math.floor(k / W), dx: 0, dy: 0 })), /points/],
  ['a diagonal glider without the diag rule', (v) => { const k = zoneOf(v)[0]; return [{ t: 'g', o: 'A', x: k % W, y: Math.floor(k / W), dx: v.rule === 'diag' ? 2 : 1, dy: 1 }]; }, /Gliders fly/],
  ['a player that throws', () => { throw new Error('oops'); }, /oops/],
];
for (const [what, p, re] of bad) check(`refused: ${what}, in either seat, counted as a loss`, () => {
  for (const seat of ['A', 'C'] as Side[]) {
    try { if (seat === 'A') playMatch(rung(1), p, 3); else playMatch(p, rung(1), 3); return `${seat}: not refused`; } catch (e) {
      if (!(e instanceof PlayerError) || e.side !== seat || !re.test(e.message)) return `${seat}: ${(e as Error).message}`;
    }
  }
  const t = tally(p, rung(1), 2);
  if (t.loss !== 4 || t.refused.length !== 4) return `tally: ${JSON.stringify(t)}`;
});

check('a player changing its view changes nothing; the same seed gives the same match', () => {
  const vandal: Player = (v) => { const out = rung(3)(v); v.w.tw = {}; v.w.rock = {}; v.mine.length = 0; v.lastSeen[0] = 0; return out; };
  for (let seed = 1; seed <= 5; seed++) {
    const a = playMatch(rung(2), rung(3), seed), b = playMatch(rung(2), vandal, seed), c = playMatch(rung(2), rung(3), seed);
    if (!same(a, b)) return `seed ${seed}: changing the view changed the match`;
    if (!same(a, c)) return `seed ${seed}: not the same twice`;
  }
});

check('the example player plays every rung, both seats, with no refused turn', () => {
  for (let l = 1; l <= 5; l++) { const t = tally(first, rung(l), 3); if (t.refused.length) return t.refused[0]; }
});

check('npm run minpentai:vs-rungs runs the example (--n 2), a rung and the round robin, and refuses a bad spec', () => {
  const run = (...a: string[]) => execFileSync('npx', ['tsx', 'scripts/minpentai-vs-rungs.ts', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const out = run('scripts/minpentai-players/first-player.ts', '--n', '2');
  for (const n of ['1 Rival', '2 Blocker', '3 Builder', '4 Opportunist', '5 Planner']) if (!out.includes(n)) return `no line for ${n}:\n${out}`;
  if (!run('rung:2', '--n', '1').includes('5 Planner')) return 'rung:2 printed no table';
  if (!/^5 Planner .*—/m.test(run('--round-robin', '--n', '1'))) return '--round-robin printed no table';
  try { run('rung:9'); return 'rung:9 was accepted'; } catch { /* refused, as it should be */ }
});

if (failures.length) {
  console.error(`\nFAILED (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`minpentai players: ${pass} checks passed`);
