/**
 * One engine (2026-10-21): what the Play tests can't see on their own.
 *
 *   1. One-on-one matches saved before the one engine resume exactly as they would have. Matches
 *      are started and played part-way by the frozen server code (scripts/fixtures/minpentai/,
 *      today's match.ts and game.ts), saved as JSON the way store.ts saves them, then finished
 *      both by the frozen code and by today's match.ts with the same placements: every state
 *      after every turn, and the end, must be identical.
 *   2. The page's controller plays a version of another size and other numbers: the board,
 *      the labels and the end follow the version, and the computer's moves are exactly what
 *      replayVersion (the onchain replay) gives for the same seed and moves.
 *   3. The server and the players script under versions: the computer's moves always pass the
 *      server's own placement check, and matches end.
 *   4. The board drawing, the live view's rules and the share link with a version.
 *
 *   npx tsx --conditions=react-server scripts/test-minpentai-one-engine.ts
 */
import { isDeepStrictEqual } from 'node:util';
import * as OldMatch from './fixtures/minpentai/match-2026-10-21';
import * as OldGame from './fixtures/minpentai/game-2026-10-21';
import * as NewMatch from '../src/lib/minpentai/play-server/match';
import { viewFor } from '../src/lib/minpentai/play-server/view';
import { PlayController, type Env } from '../src/lib/minpentai/play-game/controller';
import { board } from '../src/lib/minpentai/play-game/board';
import { playMatch, rung } from '../src/lib/minpentai/play-game/players';
import { parseResult, resultPath } from '../src/lib/minpentai/share-result';
import { replayVersion } from '../src/lib/minpentai/versions/replay';
import { engineForSize } from '../src/lib/minpentai/versions/solo-v1';
import type { VersionRules } from '../src/lib/minpentai/versions/solo-v1';

let failed = 0, checks = 0;
const ok = (cond: boolean, what: string) => { checks++; if (!cond) { failed++; console.error('FAIL ' + what); } };

// ---------- 1. saved one-on-one matches resume as before ----------
const saveLoad = <T>(m: T): T => JSON.parse(JSON.stringify({ ...(m as object), seen: undefined })) as T;
const strip = (m: { seen?: unknown }) => JSON.stringify({ ...m, seen: undefined });
/** Both players' placements for this turn: the frozen computer players, turned for Cyan, as the ladder test plays them. */
function placementsFor(m: OldMatch.LiveMatch, seed: number) {
  const G = OldGame, W = G.W, H = G.H, rk = (k: number) => W * H - 1 - k;
  const sw = (o: OldGame.Side): OldGame.Side => (o === 'C' ? 'A' : 'C');
  const t = G.clone(m.w); t.tw = {}; t.sq = {}; t.rock = {};
  for (const k in m.w.tw) t.tw[rk(+k)] = sw(m.w.tw[k]);
  for (const k in m.w.sq) t.sq[rk(+k)] = { ...m.w.sq[k], o: sw(m.w.sq[k].o) };
  for (const k in m.w.rock) t.rock[rk(+k)] = 1;
  t.gl = m.w.gl.map((g) => ({ ...g, o: sw(g.o), x: W - 1 - g.x, y: H - 1 - g.y, dx: -g.dx, dy: -g.dy }));
  const r = G.rng(seed + m.w.step * 101);
  const a = G.botPlan({ w: m.w, lvl: 2 + (seed % 4), R: m.R, rng: r, cost: m.cost, every: m.every, rule: m.rule as OldGame.RuleId, snap: m.snap, lsA: m.lsA });
  const c = G.botPlan({ w: t, lvl: 1 + (seed % 5), R: m.R, rng: r, cost: m.cost, every: m.every, rule: m.rule as OldGame.RuleId, snap: { C: m.snap.A.map(rk), A: m.snap.C.map(rk) }, lsA: Object.fromEntries(Object.entries(m.lsC).map(([k, v]) => [rk(+k), v])) });
  const strip2 = (p: OldGame.Placement) => ({ t: p.t, x: p.x, y: p.y, dx: p.dx, dy: p.dy });
  return { A: a.map(strip2), C: c.map((p) => ({ t: p.t, x: W - 1 - p.x, y: H - 1 - p.y, dx: -p.dx || 0, dy: -p.dy || 0 })) };
}
let resumed = 0;
for (let i = 0; i < 200; i++) {
  const seed = 7000 + i * 37, t0 = 1_700_000_000_000 + i * 1000;
  // The frozen server starts the match and plays it part-way.
  let old = OldMatch.createMatch(seed, t0), now = t0;
  const playTo = i % 6;
  for (let turn = 0; turn < playTo && !old.over; turn++) {
    const p = placementsFor(old, seed);
    now = old.actStart + 1;
    OldMatch.playTurn(old, 'C', { placements: p.C, ended: true }, now);
    OldMatch.playTurn(old, 'A', { placements: p.A, ended: true }, now);
  }
  // Saved as store.ts saves it; then both continue from the same row.
  const row = saveLoad(old);
  old = saveLoad(row);
  const neu = saveLoad(row) as unknown as NewMatch.LiveMatch;
  old.seen = neu.seen = { C: now, A: now };
  let same = strip(old) === strip(neu);
  for (let turn = 0; turn < 30 && !old.over && same; turn++) {
    const p = placementsFor(old, seed + 1);
    now = Math.max(old.actStart, neu.actStart) + 1;
    OldMatch.playTurn(old, 'C', { placements: p.C, ended: true }, now);
    OldMatch.playTurn(old, 'A', { placements: p.A, ended: true }, now);
    NewMatch.playTurn(neu, 'C', { placements: p.C, ended: true }, now);
    NewMatch.playTurn(neu, 'A', { placements: p.A, ended: true }, now);
    same = strip(old) === strip(neu);
  }
  ok(same && !!old.over && !!neu.over, `saved match ${i} (seed ${seed}, saved after ${playTo} turns) resumes identically to the end`);
  if (same) resumed++;
}
console.log(`resume: ${resumed} of 200 one-on-one matches saved by the frozen server code finish identically under today's (every state, every turn)`);

// ---------- 2. the controller plays a version ----------
const env: Env = { now: () => 123457, setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {}, copy: () => {}, href: () => 'https://snowmoon.party/minpentai' };
const BIG: VersionRules = { set: { width: 21, height: 13, points: 12, setupPoints: 10, costTower: 5, maxSteps: 120, every: 10, startTowers: 3 } };
for (const lvl of [3, 4, 5]) {
  const pc = new PlayController(env);
  pc.setState({ signed: true, dev: 'phone' });
  pc.openStart('practice', undefined, { version: BIG, lvl });
  const m = pc.m!;
  const v0 = pc.view();
  ok(v0.bd.cells.length === 21 * 13 && v0.bd.cols === 21, `controller: the start board is 21 x 13 (${v0.bd.cells.length} cells, ${v0.bd.cols} columns)`);
  ok(v0.strip === 'SETUP · CYAN 3 · AMBER 0 SEEN', `controller: the start strip counts 3 towers (${v0.strip})`);
  pc.begin();
  const v1 = pc.view();
  ok(v1.ptsTxt === '10 OF 10 PTS LEFT' && /Spend 10 points/.test(v1.msg ?? ''), `controller: setup offers 10 points (${v1.ptsTxt})`);
  ok(v1.pieces.map((p) => p.label).join('|') === `GLIDER · ${m.s.costGlider}|SQUARE · 1|TOWER · 5`, `controller: the piece costs are the version's (${v1.pieces.map((p) => p.label).join('|')})`);
  // The person passes every turn; the computer's moves must be exactly the onchain replay's.
  const turns: never[][] = [], amber: unknown[] = [];
  for (let guard = 0; guard < 40 && m.phase === 'act'; guard++) {
    amber.push(m.pend.A.map((p) => ({ ...p })));
    if (guard === 1) { const v = pc.view(); ok(v.ptsTxt === '12 OF 12 PTS LEFT', `controller: later turns offer 12 points (${v.ptsTxt})`); }
    turns.push([]);
    pc.endTurn();
    for (let g = 0; g < 400 && (m.phase as string) === 'run'; g++) pc.runTick();
  }
  ok(m.phase === 'over' && m.res!.step <= 120, `controller: the match ends by step 120 (${m.phase}, step ${m.res?.step})`);
  const rp = replayVersion(BIG, { seed: 123457 % 1e6, level: lvl, turns, end: { kind: 'end' } });
  ok(rp.win === m.res!.win && rp.step === m.res!.step, `controller vs replayVersion, level ${lvl}: ${m.res!.win}@${m.res!.step} vs ${rp.win}@${rp.step}`);
  ok(isDeepStrictEqual(amber, rp.amber.slice(0, amber.length)) && amber.length === rp.amber.length, `controller vs replayVersion, level ${lvl}: the computer's moves, every turn (${amber.length} turns)`);
  const amberPlayed = m.hist.length > 0;
  ok(amberPlayed, 'controller: the match has a history');
  const vr = pc.view();
  ok(vr.bd.cells.length === 21 * 13, 'controller: the result board is the version\'s size');
}

// ---------- 3. the server and the players script under versions ----------
const VERSIONS: [string, VersionRules][] = [
  ['tiny 9 x 6', { set: { width: 9, height: 6 } }],
  ['huge 25 x 16, 240 steps', { set: { width: 25, height: 16, maxSteps: 240 } }],
  ['own drawn rules with a switch', { set: { switchAt: 48 }, drawn: [{ id: 'dear', text: 'Gliders cost 5.', set: { costGlider: 5 } }, { id: 'diag2', text: 'Gliders may also fly diagonally.', set: { directions: 8 } }] }],
  ['wrap, debris, 3-hit squares, 4 towers', { set: { edges: 'wrap', debris: 'rock', squareHits: 3, startTowers: 4, maxTowers: 6 } }],
];
for (const [name, ver] of VERSIONS) {
  let ended = 0;
  for (let seed = 1; seed <= 12; seed++) {
    try {
      const r = playMatch(rung(3 + (seed % 3)), rung(1 + (seed % 5)), seed, ver);
      if (r.step > 0) ended++;
    } catch (e) {
      ok(false, `players under "${name}", seed ${seed}: ${(e as Error).message}`);
    }
  }
  ok(ended === 12, `players under "${name}": 12 matches end, every computer move accepted by the server's check (${ended})`);
  const m = NewMatch.createMatch(5, 1_700_000_000_000, ver);
  const v = viewFor(m, 'C', 1_700_000_000_000, { id: 'x', version: 1, opponent: { fid: 2, username: 'b' } as never });
  const s = { ...{ width: 15, height: 10 }, ...ver.set };
  ok(v.rules.W === s.width && v.rules.H === s.height && v.rules.maxSteps === (ver.set.maxSteps ?? 96), `server view under "${name}": rules say ${v.rules.W} x ${v.rules.H}, ${v.rules.maxSteps} steps`);
}
// A Play-today match saves exactly the fields it always did (no version, no saved points).
const solo = NewMatch.createMatch(9, 1_700_000_000_000);
ok(!('version' in solo) && !('saved' in solo), 'server: a Play match is saved with the same fields as before');
ok(isDeepStrictEqual(Object.keys(solo).sort(), Object.keys(OldMatch.createMatch(9, 1_700_000_000_000)).sort()), 'server: a new Play match has exactly the old match\'s fields');

// ---------- 4. drawing, view, share ----------
const e = engineForSize(25, 16);
const bd = board({ w: e.world({ width: 25, height: 16 } as never, true), e, cs: 20 });
ok(bd.cells.length === 400 && bd.cols === 25, `board: 25 x 16 draws 400 cells in 25 columns (${bd.cells.length}, ${bd.cols})`);
const bdp = board({ w: e.world({} as never, true), e, cs: 20, portrait: true });
ok(bdp.cols === 16 && bdp.cells[0].x === 24 && bdp.cells[0].y === 0, 'board: upright, 16 columns, first cell is the far corner');
ok(parseResult('3', '41') !== null && parseResult('3', '200') === null, 'share: Play links unchanged (steps up to 96)');
ok(parseResult('3', '200', 'k3x9q2m8ab')?.version === 'k3x9q2m8ab', 'share: a version link allows up to 240 steps');
ok(parseResult('3', '41', 'NOT-AN-ID!') === null && parseResult('3', '241', 'k3x9q2m8ab') === null, 'share: a bad version ID or too many steps is refused');
ok(resultPath({ rung: 3, steps: 41 }) === '/minpentai/result?r=3&s=41' && resultPath({ rung: 3, steps: 41, version: 'k3x9q2m8ab' }) === '/minpentai/result?r=3&s=41&v=k3x9q2m8ab', 'share: paths');

if (failed) { console.error(`${failed} of ${checks} failed`); process.exit(1); }
console.log(`one engine: ${checks} checks passed`);
