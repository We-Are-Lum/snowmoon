/**
 * The book edition's pieces (2026-10-31): mirror wall, symbol glider, moving wall, glider factory.
 *   npm run test:minpentai-book
 * Checks: every piece is off in Play (refused, never made, Play's worlds keep their shape); each sandbox
 * scenario (versions/book-scenarios.ts) ends as /minpentai/book says it does; each piece's rules at their
 * edges; placements never depend on what a side can't see; the half-turned board (used to play Cyan)
 * keeps every piece; the book edition's ruleset plays whole matches between the ladder's computer players.
 */
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { BASE, fogProblems } from '../src/lib/minpentai/versions/schema';
import { engine, layout, playVersion, type AnyPiece, type Layout, type Placement, type Side, type World } from '../src/lib/minpentai/versions/engine';
import { BOOK_EDITION, BOOK_PIECES, EDITION_NAMES } from '../src/lib/minpentai/versions/book-edition';
import { SCENARIOS, runScenario, scenarioSettings, type Scenario } from '../src/lib/minpentai/versions/book-scenarios';
import { SOLO_V1_ENGINE } from '../src/lib/minpentai/versions/solo-v1';

let checks = 0;
const ok = (cond: unknown, what: string) => { checks++; assert.ok(cond, what); };
const sc = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const P = (t: AnyPiece, o: Side, x: number, y: number, dx = 0, dy = 0): Placement<AnyPiece> => ({ t, o, x, y, dx, dy });

// ---------- 1. Off in Play ----------
{
  const e = SOLO_V1_ENGINE, s = BASE, w = e.world(s);
  for (const k of ['costMirror', 'costSeed', 'costWall', 'costFactory', 'ore', 'mirrorHits', 'factoryHits']) ok(!(k in BASE), `Play's settings have no ${k}`);
  ok(isDeepStrictEqual(Object.keys(w).sort(), ['flash', 'gl', 'nid', 'rock', 'sq', 'step', 'tw']), "a Play world has exactly Play's keys");
  const tw = e.towers(w, 'C')[0], [tx, ty] = e.XY(tw);
  for (const t of ['m', 'e', 'w', 'f'] as const) ok(e.refuse(w, s, 'C', e.towers(w, 'C'), 8, [P(t, 'C', tx + 1, ty, 1, 0)]) === 'not a piece in these rules', `Play refuses a ${t}`);
  const r = playVersion({ set: {} }, 5, 5, 7);
  ok(r.turns.length > 1 && r.turns.every((t) => [...t.C, ...t.A].every((p) => 'gst'.includes(p.t))), "a Play match plays with Play's pieces only");
}

// ---------- 2. The scenarios ----------
const last = (s: Scenario) => { const r = runScenario(s); return { ...r, w: r.frames[r.frames.length - 1] }; };
{
  const { e, w, refused } = last(sc('mirror'));
  ok(!refused.length, 'mirror: nothing refused');
  ok(!w.tw[e.K(7, 1)] && w.tw[e.K(10, 3)] === 'A', "mirror: the turned glider destroyed Amber's tower at 7,1, and only that one");
  ok(w.mir?.[e.K(8, 5)]?.hp === 2, 'mirror: one hit taken of three');
}
{
  const r = runScenario(sc('mirror-back'));
  const at4 = r.frames[4].gl[0];
  ok(at4 && at4.dx === 1 && at4.dy === -1, 'mirror-back: the diagonal glider goes straight back');
  ok(r.frames[r.frames.length - 1].tw[r.e.K(1, 5)] === 'C', "mirror-back: Cyan's tower stands");
}
{
  const r = runScenario(sc('symbol')), { e } = r, k = e.K(10, 3);
  const formed = r.frames.findIndex((f) => f.tw[k] === 'C');
  ok(formed > 0 && formed < 12, `symbol: the three symbol gliders formed a Cyan tower at 10,3 (step ${formed})`);
  ok(r.frames[formed].fs?.[k]?.o === 'C' && !Object.keys(r.frames[formed].sd ?? {}).length, 'symbol: it is a forming symbol, and the three resting gliders are used up');
  ok(!r.refused.length, 'symbol: the walling turn was allowed (placing around the forming symbol)');
  const end = r.frames[r.frames.length - 1];
  ok(end.tw[k] === 'C' && !end.fs?.[k], 'symbol: walled in at step 12, it stays as an ordinary tower');
  const lost = runScenario(sc('symbol-lost')), endL = lost.frames[lost.frames.length - 1];
  ok(lost.frames[11].tw[k] === 'C' && !endL.tw[k], 'symbol-lost: not walled in, it is gone when the turn ends');
}
{
  const r = runScenario(sc('wall')), end = r.frames[r.frames.length - 1], m = end.mw![0];
  ok(m.stop === 1 && m.x === 10 && m.c.every(Boolean), 'wall: unharmed, and stopped for good in front of the rock');
  ok(end.gl.length === 2 && end.gl.every((g) => g.o === 'A'), "wall: both of Amber's gliders still fly");
  ok(r.frames.some((f) => f.gl.some((g) => g.o === 'A' && g.dx === 1)), "wall: Amber's gliders were sent back east");
  ok(end.tw[r.e.K(1, 4)] === 'C', "wall: Cyan's tower stands");
  const b = runScenario(sc('wall-behind')), mb = b.frames[b.frames.length - 1].mw![0];
  ok(isDeepStrictEqual(mb.c, [0, 1, 1]) && !b.frames[b.frames.length - 1].gl.length, 'wall-behind: the glider from behind broke the square it hit, and itself');
  ok(mb.x > 3 && !mb.stop, 'wall-behind: the wall flies on');
}
{
  const r = runScenario(sc('factory')), { e } = r, rk = e.K(6, 7);
  const ores = r.frames.map((f) => f.ore?.[rk]);
  ok(ores[0] === 3 && ores.includes(2) && ores.includes(1), 'factory: each hit on the rock spends one ore');
  const crumbled = r.frames.findIndex((f) => !f.rock[rk]);
  ok(crumbled > 0, `factory: the rock crumbles after its third ore (step ${crumbled})`);
  ok(!r.frames[r.frames.length - 1].tw[e.K(6, 1)], "factory: the first fired glider destroyed Amber's tower");
  const fired = new Set(r.frames.flatMap((f) => f.gl.filter((g) => g.id > 1).map((g) => g.id))).size;
  ok(fired === 3, `factory: three gliders fired, one per ore (${fired})`);
  ok(r.frames[r.frames.length - 1].gl.some((g) => g.o === 'C' && g.y === 7 && g.x > 6), 'factory: with the rock gone, the bouncing glider flies on past it');
}

// ---------- 3. The rules at their edges ----------
const L0 = (W: number, H: number, rocks: [number, number][] = [], C: [number, number][] = [[1, 1]], A: [number, number][] = [[W - 2, H - 2]]): Layout =>
  ({ W, H, rocks: rocks.map(([x, y]) => y * W + x), towers: { C: C.map(([x, y]) => y * W + x), A: A.map(([x, y]) => y * W + x) } });
const S = (W: number, H: number) => scenarioSettings({ W, H });
const run = (L: Layout, start: Placement<AnyPiece>[], n: number) => {
  const e = engine(L), s = S(L.W, L.H), w = e.world(s);
  e.apply(w, s, { C: start.filter((p) => p.o === 'C'), A: start.filter((p) => p.o === 'A') });
  for (let i = 0; i < n; i++) e.step(w, s);
  return { e, s, w };
};
{
  // A "\" mirror turns an eastbound glider south; three hits break it, the third glider with it; it turns its owner's gliders too.
  const { w } = run(L0(10, 8), [P('g', 'C', 2, 2, 1, 0), P('m', 'C', 5, 2, -1)], 3);
  ok(w.gl[0].dx === 0 && w.gl[0].dy === 1, '"\\" turns east to south, the owner\'s glider too');
  const t = run(L0(10, 8), [P('g', 'A', 2, 2, 1, 0), P('g', 'A', 2, 4, 1, 0), P('g', 'A', 2, 6, 1, 0), ...[2, 4, 6].map((y) => P('m', 'C', 5, y, 1))], 3);
  ok(Object.values(t.w.mir!).every((m) => m.hp === 2), 'each mirror took one hit');
  const solo = engine(L0(10, 8)), s = S(10, 8), w2 = solo.world(s);
  solo.apply(w2, s, { C: [P('m', 'C', 5, 2, 1)], A: [] });
  for (let i = 0; i < 3; i++) { w2.gl = [{ id: 90 + i, o: 'A', x: 4, y: 2, dx: 1, dy: 0 }]; solo.step(w2, s); }
  ok(!w2.mir?.[solo.K(5, 2)] && !w2.gl.length, 'the third hit breaks the mirror and the glider');
}
{
  // Symbol gliders: one destroys an enemy tower like a glider; a glider hitting a resting one breaks both; two resting don't form.
  const a = run(L0(10, 6, [], [[1, 1]], [[6, 3]]), [P('e', 'C', 2, 3, 1, 0)], 5);
  ok(!a.w.tw[a.e.K(6, 3)], 'a symbol glider destroys an enemy tower it hits');
  const b = run(L0(10, 6, [[6, 3]]), [P('e', 'C', 2, 3, 1, 0), P('e', 'C', 2, 2, 1, 0)], 5);
  ok(Object.keys(b.w.sd ?? {}).length === 1 && b.w.sd![b.e.K(5, 3)] === 'C', 'a symbol glider rests against a rock; one flying past rests nowhere');
  b.w.gl.push({ id: 99, o: 'A', x: 5, y: 0, dx: 0, dy: 1 });
  for (let i = 0; i < 3; i++) b.e.step(b.w, b.s);
  ok(!b.w.sd![b.e.K(5, 3)] && !b.w.gl.some((g) => g.id === 99), 'a glider hitting a resting symbol glider breaks both');
  const c = run(L0(10, 6, [[6, 2], [6, 3]]), [P('e', 'C', 2, 2, 1, 0), P('e', 'C', 2, 3, 1, 0)], 6);
  ok(Object.keys(c.w.sd ?? {}).length === 2 && !c.w.fs, 'two resting symbol gliders form nothing');
  const d = run(L0(12, 8, [[6, 1], [6, 2], [6, 5]]), [P('e', 'C', 2, 1, 1, 0), P('e', 'C', 2, 2, 1, 0), P('e', 'C', 2, 5, 1, 0)], 6);
  ok(!d.w.fs && Object.keys(d.w.sd ?? {}).length === 3, 'three resting too far apart (not in one 3 x 3 box) form nothing');
  const m = run(L0(12, 8, [[7, 1], [7, 2], [7, 3]], [[1, 6]], [[10, 6]]), [P('e', 'C', 2, 1, 1, 0), P('e', 'A', 2, 2, 1, 0), P('e', 'C', 2, 3, 1, 0)], 7);
  ok(!m.w.fs, "three resting of two sides form nobody's symbol");
}
{
  // A moving wall stops for good at a tower and the edge, and never destroys; a diagonal glider into its front goes back.
  const t = run(L0(14, 7, [], [[1, 1]], [[8, 3]]), [P('w', 'C', 3, 3, 1, 0)], 16);
  ok(t.w.mw![0].stop === 1 && t.w.mw![0].x === 7 && t.w.tw[t.e.K(8, 3)] === 'A', 'a moving wall stops in front of a tower and leaves it standing');
  const edge = run(L0(8, 7), [P('w', 'C', 3, 3, 1, 0)], 16);
  ok(edge.w.mw![0].stop === 1 && edge.w.mw![0].x === 7, 'a moving wall stops for good at the edge');
  const dg = run(L0(14, 9), [P('w', 'C', 3, 4, 1, 0), P('g', 'A', 7, 1, -1, 1)], 3);
  ok(dg.w.gl[0].dx === 1 && dg.w.gl[0].dy === -1 && dg.w.mw![0].c.every(Boolean), "a diagonal glider into a wall's front goes straight back; the wall is unharmed");
  const wv = run(L0(14, 7), [P('w', 'C', 3, 3, 1, 0)], 4);
  ok(wv.w.mw![0].x === 5, 'a moving wall moves one square every second step');
}
{
  // Placement: every piece's squares in reach and empty; a factory needs a rock behind it, within reach; a mirror leans "/" or "\".
  const L = L0(14, 9, [[5, 4], [9, 4]], [[2, 4]], [[12, 4]]), e = engine(L), s = S(14, 9), w = e.world(s), snap = e.towers(w, 'C');
  const why = (ps: Placement<AnyPiece>[]) => e.refuse(w, s, 'C', snap, 99, ps);
  ok(why([P('w', 'C', 4, 4, 1, 0)]) === null, 'a moving wall in reach is allowed');
  ok(why([P('w', 'C', 5, 2, 0, 1)])?.startsWith('out of reach at 6,2'), "a moving wall reaching past the lit area is refused at its outside square");
  ok(why([P('w', 'C', 5, 5, 1, 0)]) === 'not empty at 5,4', 'a moving wall over a rock is refused');
  ok(why([P('w', 'C', 3, 4, 1, 1)]) === 'a direction the rules do not allow', 'a moving wall flies straight only');
  ok(why([P('f', 'C', 4, 4, -1, 0)]) === null, 'a factory against a rock, facing away, is allowed');
  ok(why([P('f', 'C', 4, 4, 1, 0)]) === 'a factory needs a rock behind it, within reach', 'a factory facing its rock is refused');
  ok(why([P('f', 'C', 5, 1, 0, -1)]) === 'a factory needs a rock behind it, within reach', 'a factory with no rock behind it is refused');
  // Its rock out of reach (so perhaps out of sight): refused the same whether the rock is there or not.
  const wr = e.clone(w); wr.rock[e.K(6, 5)] = 1;
  ok(why([P('f', 'C', 5, 5, -1, 0)]) === 'a factory needs a rock behind it, within reach' && e.refuse(wr, s, 'C', snap, 99, [P('f', 'C', 5, 5, -1, 0)]) === why([P('f', 'C', 5, 5, -1, 0)]), 'a factory whose rock is out of reach is refused the same with or without the rock');
  ok(why([P('m', 'C', 3, 4, 1, 1)]) === 'a mirror leans one of two ways', 'a mirror leans "/" or "\\" only');
  ok(why([P('w', 'C', 4, 4, 1, 0), P('s', 'C', 4, 3)]) === 'two on one square', "a moving wall's squares count against other placements");
  ok(e.refuse(w, s, 'C', snap, 5, [P('w', 'C', 4, 4, 1, 0)]) === 'spent 6 of 5', 'a moving wall costs 6');
  // Both sides on one square: both cancel, a whole wall too.
  const w3 = e.clone(w);
  e.apply(w3, s, { C: [P('w', 'C', 7, 4, 0, 1)], A: [P('g', 'A', 8, 4, -1, 0)] });
  ok(!w3.mw && !w3.gl.length, "a moving wall and a glider on one of its squares both cancel");
}
{
  // Placing never reads what a side can't see: every square a placement depends on is in reach, and reach never exceeds sight.
  const s = { ...BASE, ...BOOK_EDITION.set };
  ok(fogProblems(BOOK_EDITION.set, BOOK_EDITION.drawn ?? []).length === 0 && s.reach <= s.sight, 'the book edition keeps reach within sight');
  const L = L0(14, 9, [[8, 4]], [[2, 4]], [[12, 4]]), e = engine(L), w = e.world(S(14, 9)), snap = e.towers(w, 'C');
  const hidden = e.clone(w);
  hidden.mir = { [e.K(9, 6)]: { o: 'A', d: 1, hp: 3 } };
  hidden.sd = { [e.K(10, 2)]: 'A' };
  hidden.fa = { [e.K(9, 4)]: { o: 'A', dx: 1, dy: 0, hp: 2 } };
  hidden.mw = [{ id: 50, o: 'A', x: 11, y: 7, dx: -1, dy: 0, c: [1, 1, 1] }];
  const tries = [P('m', 'C', 5, 4, 1), P('e', 'C', 5, 5, 1, 0), P('w', 'C', 4, 4, 1, 0), P('w', 'C', 5, 5, 0, -1), P('f', 'C', 5, 2, 0, -1), P('g', 'C', 5, 6, 1, 0)];
  ok(tries.every((p) => e.refuse(w, S(14, 9), 'C', snap, 99, [p]) === e.refuse(hidden, S(14, 9), 'C', snap, 99, [p])), "Amber's hidden pieces change no answer to Cyan's placements");
}
{
  // The half-turned board keeps every piece: turned twice is the same world.
  const r = runScenario(sc('symbol'));
  const e = r.e, w: World = { ...e.clone(r.frames[11]) };
  w.mir = { [e.K(3, 3)]: { o: 'C', d: -1, hp: 2 } };
  w.fa = { [e.K(5, 5)]: { o: 'A', dx: 0, dy: 1, hp: 1 } };
  w.ore = { [e.K(5, 4)]: 2 };
  w.mw = [{ id: 70, o: 'A', x: 7, y: 4, dx: 0, dy: 1, c: [1, 0, 1] }];
  w.sd = { [e.K(2, 7)]: 'A' };
  ok(isDeepStrictEqual(e.turned(e.turned(w)), w), 'turned twice is the same world, book pieces too');
  const t = e.turned(w), rk = (x: number, y: number) => e.K(e.W - 1 - x, e.H - 1 - y);
  ok(t.mir![rk(3, 3)].d === -1 && t.mir![rk(3, 3)].o === 'A' && t.fs![rk(10, 3)].o === 'A', 'a half turn keeps a mirror\'s slant and swaps sides');
  const cells = (x: World) => x.mw!.flatMap((m) => e.wallCells(m).filter((_, i) => m.c[i]).map(([a, b]) => e.K(a, b))).sort((a, b) => a - b);
  ok(isDeepStrictEqual(cells(t), cells(w).map((k) => e.W * e.H - 1 - k).sort((a, b) => a - b)), "a half turn moves a wall's standing squares with it");
}
{
  // Same start, same steps, same world: the scenarios are deterministic.
  ok(SCENARIOS.every((s) => isDeepStrictEqual(runScenario(s).frames, runScenario(s).frames)), 'every scenario plays the same twice');
}

// ---------- 4. The ruleset ----------
{
  const s = { ...BASE, ...BOOK_EDITION.set };
  const L = layout(BOOK_EDITION, s);
  ok(L.W === 24 && L.H === 14 && L.W <= 32 && L.H <= 16, 'the book edition board is 24 x 14 (within 32 x 16)');
  ok(L.rocks.length === 14, 'fourteen rocks, seven a side');
  ok(engine(L).world(s).ore && Object.values(engine(L).world(s).ore!).every((n) => n === 3), 'every rock starts with 3 ore');
  let illegal = 0, n = 0;
  for (let seed = 1; seed <= 12; seed++) for (const [a, b] of [[1, 5], [3, 3], [5, 2]]) { const r = playVersion(BOOK_EDITION, a, b, seed); illegal += r.illegal; n++; ok(r.step <= s.maxSteps, 'a book-edition match ends'); }
  ok(illegal === 0, `the ladder's players never make an illegal turn on the book edition (${n} matches)`);
  ok(BOOK_PIECES.length === 4 && BOOK_PIECES.every((p) => p.book.length && p.edition.length), 'every piece quotes the book and states this edition\'s rules');
  ok(BOOK_PIECES.every((p) => p.book.every((q) => /^c\d+-b\d+$/.test(q.block))), 'every quote has its block');
  ok(EDITION_NAMES.length === 3, 'three names proposed');
  ok(new Set(SCENARIOS.map((s) => s.piece)).size === 4, 'a scenario for each piece');
}

console.log(`minpentai book edition: ${checks} checks passed`);
