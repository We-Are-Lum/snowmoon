/**
 * Player-made versions (spike): the version engine plays exactly as Play does under Play's own
 * settings, and the version checks catch what they should.
 *
 *   - whole matches: every pair of computer players (practice and rungs 1–5, both seats) on many
 *     seeds, played by the ladder test's loop on game.ts and by versions/engine.ts's playVersion
 *     with an empty version: the same placements every turn, the same result and end step;
 *   - step() on random boards (every piece, every direction, edges, meetings) under each of
 *     Play's four drawn rules: the same board after each step;
 *   - every book quote in the inventory is in the blocks it cites;
 *   - check() refuses broken versions and accepts good ones; jsonSchema() lists every setting.
 *
 *   npx tsx scripts/test-minpentai-versions.ts
 */
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as G from '../src/lib/minpentai/play-game/game';
import { engine, layout, playVersion, type World } from '../src/lib/minpentai/versions/engine';
import { BASE, BASE_DRAWN, PIECES, PIECE_IDS, SETTINGS, SETTING_IDS, asciiEscape, check, jsonSchema, type Version } from '../src/lib/minpentai/versions/schema';
import { quoteFound } from '../src/lib/minpentai/versions/book';
import { ReplayError, replayVersion } from '../src/lib/minpentai/versions/replay';
import { rulesetId, versionManifest } from '../src/lib/minpentai/versions/manifest';
import { readVersionLink, versionLink } from '../src/lib/minpentai/versions/link';

const ROOT = path.resolve(import.meta.dirname, '..');
let failed = 0;
const ok = (cond: boolean, what: string) => { if (!cond) { failed++; console.error('FAIL ' + what); } };

// --- whole matches: the ladder test's loop on game.ts, recording every turn ---
const { W, H, K, XY } = G;
const rx = (x: number) => W - 1 - x, ry = (y: number) => H - 1 - y, swap = (o: G.Side): G.Side => (o === 'C' ? 'A' : 'C');
const rk = (k: number) => { const [x, y] = XY(k); return K(rx(x), ry(y)); };
function turned(w: G.World): G.World {
  const m = G.clone(w);
  m.tw = {}; m.sq = {}; m.rock = {};
  for (const k in w.tw) m.tw[rk(+k)] = swap(w.tw[k]);
  for (const k in w.sq) m.sq[rk(+k)] = { ...w.sq[k], o: swap(w.sq[k].o) };
  for (const k in w.rock) m.rock[rk(+k)] = 1;
  m.gl = w.gl.map((g) => ({ ...g, o: swap(g.o), x: rx(g.x), y: ry(g.y), dx: -g.dx, dy: -g.dy }));
  return m;
}
const turnedKeys = (o: Record<number, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [rk(+k), v]));
function playGame(lvlC: number, lvlA: number, seed: number) {
  const r = G.rng(seed), rule: G.RuleId = G.RULE_IDS[Math.floor(r() * G.RULE_IDS.length)];
  const R = rule === 'sight2' ? 2 : 3, every = rule === 'every8' ? 8 : 12, cost = rule === 'cost3' ? 3 : 4;
  const m = { w: G.world(), R, lsC: { [K(13, 2)]: 0, [K(13, 7)]: 0 } as Record<number, number>, lsA: { [K(1, 2)]: 0, [K(1, 7)]: 0 } as Record<number, number>, pend: { C: [] as G.Placement[], A: [] as G.Placement[] } };
  const rA = G.rng(seed * 7 + 1), rC = G.rng(seed * 13 + 5);
  const turns: { C: G.Placement[]; A: G.Placement[] }[] = [];
  for (;;) {
    const w = m.w, snap = { C: G.towers(w, 'C'), A: G.towers(w, 'A') };
    const a = G.botPlan({ w, lvl: lvlA, R, rng: rA, cost, every, rule, snap, lsA: m.lsA });
    const c = G.botPlan({ w: turned(w), lvl: lvlC, R, rng: rC, cost, every, rule, snap: { C: snap.A.map(rk), A: snap.C.map(rk) }, lsA: turnedKeys(m.lsC) });
    m.pend = { C: c.map((p) => ({ ...p, o: 'C' as G.Side, x: rx(p.x), y: ry(p.y), dx: -p.dx, dy: -p.dy })), A: a };
    turns.push(m.pend);
    G.apply(m); G.updLS(m);
    do {
      G.step(m.w); G.updLS(m);
      const nc = G.towers(m.w, 'C').length, na = G.towers(m.w, 'A').length;
      const end = !nc && !na ? 'D' : !nc ? 'A' : !na ? 'C' : m.w.step >= G.MAXS ? (nc > na ? 'C' : na > nc ? 'A' : 'D') : null;
      if (end) return { rule, win: end, step: m.w.step, turns };
    } while (m.w.step % every !== 0);
  }
}
const SEEDS = Number(process.argv[process.argv.indexOf('--seeds') + 1]) || 12;
let matches = 0;
for (let c = 0; c <= 5; c++) for (let a = 0; a <= 5; a++) for (let i = 0; i < SEEDS; i++) {
  const seed = 31 * i + 7 * c + a + 1;
  const g = playGame(c, a, seed), v = playVersion({ set: {} }, c, a, seed);
  const same = g.rule === v.first && g.win === v.win && g.step === v.step && v.illegal === 0
    && g.turns.length === v.turns.length && g.turns.every((t, j) => isDeepStrictEqual(t.C, v.turns[j].C) && isDeepStrictEqual(t.A, v.turns[j].A));
  ok(same, `match C${c} v A${a} seed ${seed}: game.ts ${g.rule} ${g.win}@${g.step}, versions ${v.first} ${v.win}@${v.step} (illegal ${v.illegal})`);
  matches++;
}
console.log(`whole matches: ${matches} compared`);

// --- step() on random boards ---
const toG = (w: World): G.World => ({ step: w.step, rock: Object.fromEntries(Object.keys(w.rock).map((k) => [k, 1])) as Record<number, 1>, sq: structuredClone(w.sq), tw: { ...w.tw }, gl: w.gl.map((g) => ({ id: g.id, o: g.o, x: g.x, y: g.y, dx: g.dx, dy: g.dy })), nid: w.nid, flash: [] });
const strip = (w: G.World | World) => ({ step: w.step, rock: Object.keys(w.rock).map(Number), sq: w.sq, tw: w.tw, gl: w.gl.map((g) => [g.id, g.o, g.x, g.y, g.dx, g.dy]), flash: w.flash });
for (const rule of BASE_DRAWN) {
  const s = { ...BASE, ...rule.set }, e = engine(layout({}, s)), r = G.rng(99);
  for (let t = 0; t < 400; t++) {
    const w = e.world(s, true);
    for (let k = 0; k < W * H; k++) {
      const x = r();
      if (x < 0.06) w.rock[k] = 1; else if (x < 0.14) w.sq[k] = { o: r() < 0.5 ? 'C' : 'A', hp: r() < 0.5 ? 1 : 2 }; else if (x < 0.18) w.tw[k] = r() < 0.5 ? 'C' : 'A';
    }
    const dirs = s.directions === 8 ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[-1, 0], [0, -1], [0, 1], [1, 0]];
    for (let i = 0; i < 25; i++) {
      const k = Math.floor(r() * W * H);
      if (w.rock[k] || w.sq[k] || w.tw[k]) continue;
      const [dx, dy] = dirs[Math.floor(r() * dirs.length)];
      w.gl.push({ id: w.nid++, o: r() < 0.5 ? 'C' : 'A', x: k % W, y: (k / W) | 0, dx, dy });
    }
    const g = toG(w);
    for (let n = 0; n < 12; n++) { G.step(g); e.step(w, s); ok(isDeepStrictEqual(strip(g), strip(w)), `step: rule ${rule.id} board ${t} step ${n}`); }
  }
}
console.log('step: 1,600 random boards, 12 steps each, under each drawn rule');

// --- book quotes ---
const quotes: { where: string; says: string; blocks: string[] }[] = [];
for (const k of SETTING_IDS) { const s = SETTINGS[k] as { book?: { says: string; blocks: string[] } }; if (s.book) quotes.push({ where: k, ...s.book }); }
for (const p of PIECE_IDS) for (const [o, spec] of Object.entries(PIECES[p].options) as [string, { book?: { says: string; blocks: string[] } }][]) if (spec.book) quotes.push({ where: `${p}.${o}`, ...spec.book });
for (const q of quotes) ok(quoteFound(ROOT, q.says, q.blocks), `book quote for ${q.where} not found in ${q.blocks.join(', ')}`);
ok(!quoteFound(ROOT, 'Gliders may fly backwards through time.', ['c4-b108']), 'an invented quote is refused');
console.log(`book: ${quotes.length} quotes found in their blocks`);

// --- check() and the schema ---
const good: Version = {
  format: 'snowmoon.minpentai.version/1', title: 'Thirty squares', different: 'You see and place within 6 squares, closer to the book.', parent: 'solo-v1', author: '@test',
  prompt: { text: 'let us see further, like the book', model: 'openai/gpt-oss-120b', date: '2026-10-21' },
  set: { sight: 6, reach: 6 },
  changes: [{ what: 'sight', basis: 'book', says: SETTINGS.sight.book.says, blocks: ['c4-b93'] }, { what: 'reach', basis: 'invented' }],
};
ok(check(good).length === 0, `good version refused: ${check(good).join('; ')}`);
const bad = (patch: object, expect: RegExp) => { const errs = check({ ...good, ...patch }); ok(errs.some((x) => expect.test(x)), `expected ${expect} from ${JSON.stringify(patch)}, got ${errs.join('; ') || 'nothing'}`); };
bad({ set: { sight: 99, reach: 6 } }, /sight must be 1 to 30/);
bad({ set: { sight: 6, reach: 6, teleport: 1 } }, /teleport is not a setting/);
bad({ set: { sight: 6, reach: 6, edges: 'portal' } }, /edges must be one of/);
bad({ set: { sight: 6, reach: 6, directions: 6 } }, /directions must be one of 4, 8/);
bad({ changes: [good.changes[0]] }, /reach is not tied/);
bad({ changes: [...good.changes, { what: 'every', basis: 'invented' }] }, /every, which this version does not change/);
bad({ changes: [{ what: 'sight', basis: 'book', says: 'x', blocks: ['chapter four'] }, good.changes[1]] }, /without blocks/);
bad({ set: {}, changes: [] }, /changes nothing/);
bad({ set: { switchAt: 40 }, drawn: [], changes: [{ what: 'switchAt', basis: 'invented' }, { what: 'drawn', basis: 'invented' }] }, /switchAt needs at least 2/);
bad({ title: 'Café' }, /title must be printable ASCII/);
bad({ set: { maxTowers: 1, startTowers: 3 }, changes: [{ what: 'maxTowers', basis: 'invented' }, { what: 'startTowers', basis: 'invented' }] }, /maxTowers is below/);
bad({ rocksAt: [[20, 3]], changes: [...good.changes, { what: 'rocksAt', basis: 'invented' }] }, /off the board/);
bad({ set: { sight: 6, reach: 3 } }, /set.reach is already 3/);
bad({ drawn: [{ id: 'x', text: 'You see 6.', set: { sight: 6 } }, { id: 'y', text: 'Gliders cost 3.', set: { costGlider: 3 } }], changes: [...good.changes, { what: 'drawn', basis: 'invented' }] }, /drawn\[0\].set.sight is already 6/);
bad({ set: { costGlider: 12 }, changes: [{ what: 'costGlider', basis: 'invented' }] }, /no turn has enough points for a glider/);
const schema = jsonSchema() as { properties: { set: { properties: Record<string, unknown> } } };
ok(Object.keys(schema.properties.set.properties).length === SETTING_IDS.length + PIECE_IDS.length, 'schema lists every setting and piece');
console.log('check: good accepted, 15 kinds of bad refused');

// --- every version ends; nothing breaks at the limits ---
for (const k of SETTING_IDS) for (const val of [SETTINGS[k].min, SETTINGS[k].max]) {
  if (k === 'switchAt' && val > 0) continue;
  const v = { set: { [k]: val } };
  for (let i = 0; i < 3; i++) { const m = playVersion(v, 5, 3, 500 + i); ok(m.step > 0 && m.illegal === 0, `${k}=${val}: ended at ${m.step}, illegal ${m.illegal}`); }
}
for (const p of PIECE_IDS) for (const o of Object.keys(PIECES[p].options)) for (let i = 0; i < 3; i++) { const m = playVersion({ set: { [p]: o } }, 4, 5, 700 + i); ok(m.step > 0 && m.illegal === 0, `${p}=${o}: illegal ${m.illegal}`); }
console.log('limits: every setting at its min and max, every piece option, plays to an end with no illegal move');

// --- replay: a person's match under the empty version replays as game.ts plays it (one rng) ---
function soloGame(level: number, seed: number) {
  const r = G.rng(seed), rule = G.RULE_IDS[Math.floor(r() * G.RULE_IDS.length)];
  const R = rule === 'sight2' ? 2 : 3, every = rule === 'every8' ? 8 : 12, cost = rule === 'cost3' ? 3 : 4;
  const m = { w: G.world(), R, lsC: { [K(13, 2)]: 0, [K(13, 7)]: 0 } as Record<number, number>, lsA: { [K(1, 2)]: 0, [K(1, 7)]: 0 } as Record<number, number>, pend: { C: [] as G.Placement[], A: [] as G.Placement[] } };
  const person = G.rng(seed ^ 0x5bd1e995), turns: G.Placement[][] = [], amber: G.Placement[][] = [];
  for (;;) {
    const w = m.w, snap = { C: G.towers(w, 'C'), A: G.towers(w, 'A') };
    const a = G.botPlan({ w, lvl: level, R, rng: r, cost, every, rule, snap, lsA: m.lsA });
    const c = G.botPlan({ w: turned(w), lvl: 3, R, rng: person, cost, every, rule, snap: { C: snap.A.map(rk), A: snap.C.map(rk) }, lsA: turnedKeys(m.lsC) }).map((p) => ({ ...p, o: 'C' as G.Side, x: rx(p.x), y: ry(p.y), dx: -p.dx, dy: -p.dy }));
    m.pend = { C: c, A: a }; turns.push(c); amber.push(a);
    G.apply(m); G.updLS(m);
    do {
      G.step(m.w); G.updLS(m);
      const nc = G.towers(m.w, 'C').length, na = G.towers(m.w, 'A').length;
      const end = !nc && !na ? 'D' : !nc ? 'A' : !na ? 'C' : m.w.step >= G.MAXS ? (nc > na ? 'C' : na > nc ? 'A' : 'D') : null;
      if (end) return { rule, win: end, step: m.w.step, turns, amber };
    } while (m.w.step % every !== 0);
  }
}
let replays = 0;
for (let level = 0; level <= 5; level++) for (let i = 0; i < SEEDS * 3; i++) {
  const seed = 0x9e3779b9 + 977 * i + level, g = soloGame(level, seed >>> 0);
  const rp = replayVersion({ set: {} }, { seed: seed >>> 0, level, turns: g.turns, end: { kind: 'end' } });
  ok(rp.first === g.rule && rp.win === g.win && rp.step === g.step && isDeepStrictEqual(rp.amber, g.amber), `replay level ${level} seed ${seed >>> 0}`);
  replays++;
}
let refused = false;
try { const g = soloGame(2, 4242); g.turns[0] = [{ t: 'g', o: 'C', x: 9, y: 5, dx: 1, dy: 0 }]; replayVersion({ set: {} }, { seed: 4242, level: 2, turns: g.turns, end: { kind: 'end' } }); } catch (e) { refused = e instanceof ReplayError; }
ok(refused, 'replay refuses a placement out of reach');
console.log(`replay: ${replays} solo matches replay as game.ts plays them; an illegal placement is refused`);

// --- manifest ---
const pin = { commit: 'a'.repeat(40), files: { 'src/lib/minpentai/versions/replay.ts': 'x' } };
const man = versionManifest({ ...good, prompt: { ...good.prompt, text: asciiEscape('see further \u2014 like the book — 山') } }, pin);
ok(/^0x[0-9a-f]{64}$/.test(rulesetId(man)), 'manifest has a ruleset ID');
ok(rulesetId(man) !== rulesetId(versionManifest({ ...good, set: { sight: 7, reach: 6 } }, pin)), 'a different setting gives a different ID');
ok(man.rules.find((r) => r.id === 'sight')!.book!.blocks[0] === 'c4-b93' && /Invented/.test(man.rules.find((r) => r.id === 'reach')!.edition!), 'manifest rules carry the version\'s sources');
ok(isDeepStrictEqual(man.board.towers, { C: [[1, 2], [1, 7]], A: [[13, 7], [13, 2]] }) && man.board.rocks.length === 6, 'manifest board is Play\'s');
console.log('manifest: sorted JSON, ID changes with the rules, sources carried');

// --- link ---
const link = versionLink(good);
const back = readVersionLink(link);
ok('version' in back && isDeepStrictEqual(back.version, good), 'a link reads back as the same version');
ok('refused' in readVersionLink(link.slice(0, -12)), 'a cut link is refused');
const evil = versionLink({ ...good, set: { sight: 99 } } as Version);
ok('refused' in readVersionLink(evil), 'a link with an out-of-range setting is refused');
console.log(`link: ${link.length} characters, reads back; damaged or out-of-range links refused`);

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('versions: all passed');
