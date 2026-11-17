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
 * - Every computer plans from its own fog view only (owner, 2026-11-03: option 3). Twins: the same position with
 *   everything hidden from the planning side changed (the enemy's towers, squares, gliders and book pieces out of
 *   sight; its own squares and gliders out of sight damaged, destroyed or gone; rocks and ore out of sight), the
 *   side's fog view unchanged, and the plan must be the same: the old computer (engine botPlan, levels 0–5, both
 *   seats, every ruleset), the search computer (every level, handed the real board itself), and at the call sites
 *   (Play's controller, the snap's game.botPlan, agent play's computer and its fallback for the person).
 */
import { execFileSync } from 'node:child_process';
import { PlayController, type Env } from '../src/lib/minpentai/play-game/controller';
import { H, K, W, apply, botPlan, clone, lit, rng, step, towers, updLS, world, type Placement, type Side, type World } from '../src/lib/minpentai/play-game/game';
import { PlayerError, fogView, playMatch, rung, tally, turnKey, turned, type Player } from '../src/lib/minpentai/play-game/players';
import first from './minpentai-players/first-player';
import { PLAY, RULESETS as PLAY_RULESETS, type RulesetId } from '../src/lib/minpentai/versions/solo-v1';
import { isDeepStrictEqual } from 'node:util';
import { drawRules, engine, layout, other, rng as vrng, verdict, type AnyPiece, type Engine, type Kills, type Placement as VPlacement, type World as VWorld } from '../src/lib/minpentai/versions/engine';
import type { Settings } from '../src/lib/minpentai/versions/schema';
import { LADDER_LEVELS, SEARCH_LEVELS, TOP_LEVEL, searchPlan } from '../src/lib/minpentai/versions/search';
import { COMPUTERS, FALLBACK_LEVEL, REVISIONS, RULESETS as SOLO_RULESETS, autopilot, newSolo, planComputer, rulesOf, type RulesetName, type SoloMatch } from '../src/lib/minpentai/agent-play/solo';
import { settings as snapSettings } from '../src/lib/minpentai/snap/versions';

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
    ctl.openStart('ladder', lvl, { version: PLAY });
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
    // The positions come from Play's matches, which run under Play today's ruleset (2); a view without a ruleset is Play today's too.
    const full = botPlan({ w: p.w, lvl, R: p.R, rng: rng(s), cost: p.cost, every: p.every, rule: p.rule, snap: p.snap, lsA: p.lsA, ruleset: 2 });
    const viewed = rung(lvl)({ w: fogView(p.w, 'A', p.R), R: p.R, cost: p.cost, every: p.every, rule: p.rule, points: 8, mine: p.snap.A, lastSeen: { ...p.lsA }, rng: rng(s) });
    if (!same(full, viewed)) return `level ${lvl} at step ${p.w.step} (Amber's seat): ${JSON.stringify(full)} on the board, ${JSON.stringify(viewed)} on the view`;
    const tw = turned(p.w), snapT = { A: p.snap.C.map(turnKey), C: p.snap.A.map(turnKey) };
    const lsT = Object.fromEntries(Object.entries(p.lsC).map(([k, v]) => [turnKey(+k), v]));
    const fullT = botPlan({ w: tw, lvl, R: p.R, rng: rng(s), cost: p.cost, every: p.every, rule: p.rule, snap: snapT, lsA: lsT, ruleset: 2 });
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

// ---------- Every computer plans from its own fog view only (owner, 2026-11-03: option 3) ----------

/**
 * A twin of board w for side o: everything o can't see changed, everything it can see left as it is. Enemy towers,
 * squares and gliders out of sight go or appear, cracked or not; o's own squares out of sight are cracked or destroyed
 * and its own gliders out of sight go; rocks out of sight crumble or lose hits, and their ore changes; book pieces out
 * of sight go. twinsAgree fails if the twin's fog view isn't the same (the twin would then not be hidden-only).
 */
const viewKey = (e: Engine, s: Settings, w: VWorld, o: Side) => JSON.parse(JSON.stringify(e.fog(w, s, o)));
function twin(e: Engine, s: Settings, w: VWorld, o: Side, r: () => number): { x: VWorld; changed: { enemy: number; own: number; rock: number } } {
  const see = e.sees(w, s, o), x = e.clone(w), them = other(o), hid = (k: number | string) => !see.has(+k);
  const changed = { enemy: 0, own: 0, rock: 0 };
  for (const k in x.tw) if (x.tw[k] === them && hid(k) && r() < 0.5) { delete x.tw[k]; changed.enemy++; }
  for (const k in x.sq) if (hid(k)) {
    const q = x.sq[k];
    if (q.o === o) changed.own++; else changed.enemy++;
    if (q.hp > 1 && r() < 0.5) q.hp--; else delete x.sq[k];
  }
  for (const g of x.gl) if (hid(e.K(g.x, g.y))) { if (g.o === o) changed.own++; else changed.enemy++; }
  x.gl = x.gl.filter((g) => !hid(e.K(g.x, g.y)) || r() < 0.3);
  for (const k in x.rock) if (hid(k)) { if (r() < 0.5) delete x.rock[k]; else x.rock[k] = Math.max(1, x.rock[k] - 1); changed.rock++; }
  if (x.ore) for (const k in x.ore) if (hid(k)) x.ore[k] = Math.max(0, x.ore[k] - 1);
  for (const f of ['mir', 'fa', 'sd', 'fs'] as const) { const o2 = x[f] as Record<number, unknown> | undefined; if (o2) for (const k in o2) if (hid(k)) { delete o2[k]; changed.enemy++; } }
  if (x.mw) x.mw = x.mw.filter((m) => e.wallCells(m).some(([cx, cy], i) => m.c[i] && e.inb(cx, cy) && see.has(e.K(cx, cy))));
  // New hidden pieces on empty squares out of sight: an enemy tower, square and glider; and squares of the side's own
  // and fresh rocks (debris), where it can't see them either: if it read the board, they would block its lines.
  const free = [...Array(e.W * e.H).keys()].filter((k) => hid(k) && e.empty(x, k));
  const pick = () => free.splice(Math.floor(r() * free.length), 1)[0];
  if (free.length) { x.tw[pick()] = them; changed.enemy++; }
  if (free.length) { x.sq[pick()] = { o: them, hp: s.squareHits }; changed.enemy++; }
  if (free.length) { const [gx, gy] = e.XY(pick()); x.gl.push({ id: x.nid++, o: them, x: gx, y: gy, dx: them === 'A' ? -1 : 1, dy: 0 }); changed.enemy++; }
  for (let i = 0; i < 6 && free.length; i++) { x.sq[pick()] = { o, hp: 1 + Math.floor(r() * s.squareHits) }; changed.own++; }
  for (let i = 0; i < 4 && free.length; i++) { x.rock[pick()] = 1; changed.rock++; }
  return { x, changed };
}

/** Positions from real matches under a ruleset (the search computer at level 1 for both sides), at each turn to act. */
type AnyRules = Parameters<typeof drawRules>[0] & Parameters<typeof layout>[0];
interface TPos { e: Engine; s: Settings; w: VWorld; ls: Record<Side, Record<number, number>>; saved: Record<Side, number>; seed: number; turn: number }
function tPositions(v: AnyRules, seeds: number[], turns: number): TPos[] {
  const out: TPos[] = [];
  for (const seed of seeds) {
    const { s1, s2 } = drawRules(v, vrng(seed)), e = engine(layout(v, s1));
    let s = s1;
    const w = e.world(s), ls: TPos['ls'] = { C: {}, A: {} }, saved = { C: 0, A: 0 }, kills: Kills = { C: 0, A: 0, ...(s1.killReports ? { log: [] } : {}) };
    e.L.towers.A.forEach((k) => (ls.C[k] = 0));
    e.L.towers.C.forEach((k) => (ls.A[k] = 0));
    for (let turn = 0; turn < turns; turn++) {
      if (s2 && s === s1 && w.step >= s1.switchAt) s = s2;
      out.push({ e, s, w: e.clone(w), ls: { C: { ...ls.C }, A: { ...ls.A } }, saved: { ...saved }, seed, turn });
      const pend: Record<Side, VPlacement<AnyPiece>[]> = { C: [], A: [] };
      for (const o of ['C', 'A'] as const) {
        const pts = (w.step === 0 ? s.setupPoints : s.points) + saved[o];
        const ps = searchPlan({ e, s, o, view: e.fog(w, s, o), lastSeen: { ...ls[o] }, snap: e.towers(w, o), points: pts, rng: vrng(seed * 1009 + turn * 2 + (o === 'A' ? 1 : 0)), level: 1 }).placements;
        pend[o] = e.refuse(w, s, o, e.towers(w, o), pts, ps) ? [] : ps;
        saved[o] = Math.min(s.carryOver, pts - pend[o].reduce((t, p) => t + e.cost(s, p.t), 0));
      }
      e.apply(w, s, pend);
      e.updSeen(w, s, ls, kills);
      const from = w.step;
      let over = false;
      do { e.step(w, s, kills); e.updSeen(w, s, ls, kills); if (verdict(e, w, s, kills)) { over = true; break; } } while (w.step - from < s.every);
      if (over) break;
    }
  }
  return out;
}
const ALL_RULESETS: [string, AnyRules][] = [
  ...([1, 2, 3] as RulesetId[]).map((n) => [`Play ruleset ${n}`, PLAY_RULESETS[n]] as [string, AnyRules]),
  ...(Object.keys(SOLO_RULESETS) as RulesetName[]).filter((n) => n !== 'play-3').map((n) => [n, SOLO_RULESETS[n]] as [string, AnyRules]),
];
const POS = new Map(ALL_RULESETS.map(([name, v]) => [name, tPositions(v, [1, 2, 3, 4], 9)]));
const twinStats = { enemy: 0, own: 0, rock: 0 };
/** Plans the same on a board and on its hidden-only twin, for side o; returns why not, or null. */
function twinsAgree(p: TPos, o: Side, k: number, plan: (w: VWorld) => unknown): string | null {
  const { x, changed } = twin(p.e, p.s, p.w, o, vrng(p.seed * 7 + p.turn * 13 + k));
  if (!isDeepStrictEqual(viewKey(p.e, p.s, p.w, o), viewKey(p.e, p.s, x, o))) return `the twin at seed ${p.seed}, turn ${p.turn} is not hidden-only (a test bug)`;
  twinStats.enemy += changed.enemy; twinStats.own += changed.own; twinStats.rock += changed.rock;
  const a = plan(p.w), b = plan(x);
  return same(a, b) ? null : `seed ${p.seed}, turn ${p.turn}, step ${p.w.step}, ${o === 'A' ? 'Amber' : 'Cyan'}: ${JSON.stringify(a)} on the board, ${JSON.stringify(b)} on its twin`;
}
/** The old computer for side o, as its callers call it (Cyan's seat on the turned board). */
const bot = (p: TPos, o: Side, lvl: number) => (w: VWorld) => {
  const { e, s } = p, pts = (w.step === 0 ? s.setupPoints : s.points) + p.saved[o], diag = s.directions === 8, rk = (k: number) => e.W * e.H - 1 - k;
  if (o === 'A') return e.botPlan({ w, s, lvl, rng: vrng(p.seed + lvl), budget: pts, snap: { A: e.towers(w, 'A'), C: e.towers(w, 'C') }, lsA: p.ls.A, diag });
  return e.botPlan({ w: e.turned(w), s, lvl, rng: vrng(p.seed + lvl), budget: pts, snap: { A: e.towers(w, 'C').map(rk), C: [] }, lsA: e.turnedKeys(p.ls.C), diag }).map(e.unturn);
};

check('twins: the old computer (engine botPlan, levels 0-5, both seats) plans the same whatever is hidden from it, in every ruleset', () => {
  let n = 0;
  for (const [name] of ALL_RULESETS) for (const p of POS.get(name)!) for (const o of ['A', 'C'] as const) for (let lvl = 0; lvl <= 5; lvl++) {
    const why = twinsAgree(p, o, lvl, bot(p, o, lvl));
    if (why) return `${name}, level ${lvl}: ${why}`;
    n++;
  }
  if (!twinStats.own) return 'no twin changed the planning side\'s own pieces out of sight (the positions are too easy)';
  console.log(`  (${n} plans in ${ALL_RULESETS.length} rulesets; the twins changed ${twinStats.enemy} hidden enemy pieces, ${twinStats.own} of the side's own pieces out of sight, ${twinStats.rock} rocks out of sight)`);
});

check('twins: the search computer, every level (0-3, and Play\'s Easy and Fair), handed the real board itself, plans the same whatever is hidden', () => {
  const levels: [string, { level: number; config?: (typeof LADDER_LEVELS)[number] }][] = [
    ...Object.keys(SEARCH_LEVELS).map((l) => [`level ${l}`, { level: +l }] as [string, { level: number }]),
    ['Easy', { level: -1, config: LADDER_LEVELS[1] }], ['Fair', { level: -1, config: LADDER_LEVELS[2] }],
  ];
  let n = 0;
  // Each ruleset's computer, and its revised computer where it has one (REVISIONS: book-4's guarding computer).
  const comps = ALL_RULESETS.flatMap(([name]) => [
    [name, name, name in COMPUTERS ? COMPUTERS[name as RulesetName] : {}] as const,
    ...(REVISIONS[name as RulesetName] ? [[`${name} revision ${REVISIONS[name as RulesetName]!.computer}`, name, { book: REVISIONS[name as RulesetName]!.book, comp: REVISIONS[name as RulesetName]!.comp }] as const] : []),
  ]);
  for (const [label, name, comp] of comps) {
    const ps = POS.get(name)!;
    for (const [lname, lv] of levels) {
      // The deepest levels are slow: fewer positions for them.
      const some = lv.level >= 2 ? ps.filter((_, i) => i % 6 === 1) : ps.filter((_, i) => i % 2 === 0);
      for (const p of some) for (const o of ['A', 'C'] as const) {
        const pts = (p.w.step === 0 ? p.s.setupPoints : p.s.points) + p.saved[o];
        const why = twinsAgree(p, o, 100 + n, (w) => searchPlan({ e: p.e, s: p.s, o, view: w, lastSeen: { ...p.ls[o] }, snap: p.e.towers(w, o), points: pts, rng: vrng(p.seed * 3 + p.turn), ...lv, ...comp }).placements);
        if (why) return `${label}, ${lname}: ${why}`;
        n++;
      }
    }
  }
  console.log(`  (${n} plans)`);
});

check('twins at the call sites: Play (PlayController, rulesets 1-3, every level), the snap (game.botPlan), agent play (the computer and its fallback for the person)', () => {
  // Play: two controllers in step; before each turn's plan, the second one's board is a hidden-only twin.
  let n = 0;
  for (const rs of [1, 2, 3] as RulesetId[]) for (let lvl = rs === 3 ? 1 : 0; lvl <= (rs === 3 ? 6 : 5); lvl++) for (const seed of [11, 12]) {
    const env: Env = { now: () => seed, setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {}, copy: () => {}, href: () => '' };
    const a = new PlayController(env), b = new PlayController(env);
    for (const c of [a, b]) { c.openStart('practice', undefined, { version: PLAY_RULESETS[rs], lvl }); c.begin(); }
    const r = vrng(seed * 5 + lvl);
    for (let turn = 0; turn < 8 && a.m!.phase === 'act'; turn++) {
      const ma = a.m!, mb = b.m!;
      const { x } = twin(ma.e, ma.s, ma.w, 'A', r);
      if (!isDeepStrictEqual(viewKey(ma.e, ma.s, ma.w, 'A'), viewKey(ma.e, ma.s, x, 'A'))) return 'a twin that is not hidden-only (a test bug)';
      mb.w = x;
      a.beginAct(); b.beginAct();
      if (!same(ma.pend.A, mb.pend.A)) return `ruleset ${rs}, level ${lvl}, seed ${seed}, step ${ma.w.step}: Play's computer planned differently on the twin`;
      n++;
      mb.w = ma.e.clone(ma.w);
      // The person places one glider somewhere it may, when it can afford one.
      const zone = [...ma.e.lit(ma.w, 'C', ma.s.reach, ma.snap.C)].filter((k) => ma.e.empty(ma.w, k));
      const k = zone[Math.floor(r() * zone.length)];
      const mine: Placement[] = k === undefined || a.budget('C') < ma.s.costGlider ? [] : [{ t: 'g', o: 'C', x: k % ma.e.W, y: Math.floor(k / ma.e.W), dx: 1, dy: 0 }];
      for (const c of [a, b]) { c.m!.pend.C = mine.map((q) => ({ ...q })); c.endTurn(); for (let g = 0; g < 400 && (c.m!.phase as string) === 'run'; g++) c.runTick(); }
    }
  }
  // The snap: game.botPlan, as snap/match.ts calls it (Play's board, the snap's numbers for the match's rule, ruleset 1 or 2).
  for (const rs of [1, 2] as const) for (const p of POS.get(`Play ruleset ${rs}`)!) for (let lvl = 0; lvl <= 5; lvl++) {
    const set = snapSettings(p.s.directions === 8 ? 'diag' : p.s.costGlider === 3 ? 'cost3' : p.s.sight === 2 ? 'sight2' : 'every8', null);
    const why = twinsAgree(p, 'A', 200 + lvl, (w) => botPlan({ lvl, ...set, ruleset: rs, rng: rng(p.seed * 11 + lvl), w: w as World, snap: { C: towers(w as World, 'C'), A: towers(w as World, 'A') }, lsA: p.ls.A }));
    if (why) return `the snap, ruleset ${rs}, level ${lvl}: ${why}`;
    n++;
  }
  // Agent play: the site computer's orders (planComputer), and its fallback for the person's side (autopilot).
  const json = (m: SoloMatch) => JSON.parse(JSON.stringify(m)) as SoloMatch;
  for (const ruleset of Object.keys(SOLO_RULESETS) as RulesetName[]) for (let level = 0; level <= TOP_LEVEL; level += level === 0 ? 1 : 2) {
    const { m } = newSolo({ id: `twin-${ruleset}-${level}`, ruleset, level, seed: 31 + level, person: 1, agent: { id: null, name: 't', model: null }, now: '2026-11-03T00:00:00Z' });
    const r = vrng(level + 77);
    for (let turn = 0; turn < 5 && !m.end; turn++) {
      const { s, e } = rulesOf(m);
      const ta = json(m);
      ta.w = twin(e, s, m.w, 'A', r).x;
      planComputer(m, '2026-11-03T00:00:01Z'); planComputer(ta, '2026-11-03T00:00:01Z');
      if (!same(m.pend.A!.placements, ta.pend.A!.placements)) return `agent play ${ruleset}, level ${level}, turn ${turn}: the computer planned differently on the twin`;
      const tc = json(m);
      tc.w = twin(e, s, m.w, 'C', r).x;
      autopilot(m, { turn: m.turn, now: '2026-11-03T00:00:02Z' }); autopilot(tc, { turn: tc.turn, now: '2026-11-03T00:00:02Z' });
      if (!same(m.history.at(-1)!.C.placements, tc.history.at(-1)!.C.placements)) return `agent play ${ruleset}, turn ${turn}: the fallback (level ${FALLBACK_LEVEL}) planned the person's side differently on the twin`;
      n += 2;
    }
  }
  console.log(`  (${n} plans at the call sites)`);
});

if (failures.length) {
  console.error(`\nFAILED (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`minpentai players: ${pass} checks passed`);
