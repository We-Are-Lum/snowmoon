/**
 * The computer ladder gets harder rung by rung. A round robin: every rung plays every other rung
 * (and practice's level 0, shown for comparison) with game.ts's own botPlan, step, apply and updLS,
 * seeded, from both seats, under the new rule each seed draws the way a match draws it.
 *
 * The computer always plays Amber, so Cyan's player is botPlan run on the board turned 180° with
 * the colours swapped (the board, rocks and starts are symmetric under that turn), and its
 * placements are turned back. Each pair plays N seeds with the lower rung as Cyan and N other
 * seeds with it as Amber. A score is wins + half the draws, from the row's side.
 *
 * Asserts, for every pair of rungs, that the higher rung scores more than half against the lower,
 * by at least MARGIN for neighbours. One pair is OPEN and only asserted "not easier": Builder (3)
 * and Opportunist (4) play the same moves except that Opportunist also aims diagonally under the
 * diagonal rule (owner ruling of 2026-10-14, controller.ts ruleNote), and that wins nothing
 * measurable. Making rung 4 harder needs a new behaviour, which is the owner's decision.
 *
 *   npm run test:minpentai-ladder              (N = 40 seeds a seat, about a minute)
 *   npm run test:minpentai-ladder -- --n 100   (the table in the report)
 */
import { MAXS, RULE_IDS, RUNGS, W, H, K, XY, apply, botPlan, clone, rng, step, towers, updLS, world, type Placement, type RuleId, type Side, type World } from '../src/lib/minpentai/play-game/game';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const N = Number(arg('--n') ?? 40);
const MARGIN = 0.53;
/** Pairs [lower, higher] asserted only "not easier" (see the header). */
const OPEN: [number, number][] = [[3, 4]];

const rx = (x: number) => W - 1 - x, ry = (y: number) => H - 1 - y, swap = (o: Side): Side => (o === 'C' ? 'A' : 'C');
const rk = (k: number) => { const [x, y] = XY(k); return K(rx(x), ry(y)); };
function turned(w: World): World {
  const m = clone(w);
  m.tw = {}; m.sq = {}; m.rock = {};
  for (const k in w.tw) m.tw[rk(+k)] = swap(w.tw[k]);
  for (const k in w.sq) m.sq[rk(+k)] = { ...w.sq[k], o: swap(w.sq[k].o) };
  for (const k in w.rock) m.rock[rk(+k)] = 1;
  m.gl = w.gl.map((g) => ({ ...g, o: swap(g.o), x: rx(g.x), y: ry(g.y), dx: -g.dx, dy: -g.dy }));
  return m;
}
const turnedKeys = (o: Record<number, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [rk(+k), v]));

/** One match, level lvlC as Cyan against lvlA as Amber; the winner, or 'D'. */
export function playMatch(lvlC: number, lvlA: number, seed: number): Side | 'D' {
  const r = rng(seed), rule: RuleId = RULE_IDS[Math.floor(r() * RULE_IDS.length)];
  const R = rule === 'sight2' ? 2 : 3, every = rule === 'every8' ? 8 : 12, cost = rule === 'cost3' ? 3 : 4;
  const m = { w: world(), R, lsC: { [K(13, 2)]: 0, [K(13, 7)]: 0 } as Record<number, number>, lsA: { [K(1, 2)]: 0, [K(1, 7)]: 0 } as Record<number, number>, pend: { C: [] as Placement[], A: [] as Placement[] } };
  const rA = rng(seed * 7 + 1), rC = rng(seed * 13 + 5);
  for (;;) {
    const w = m.w, snap = { C: towers(w, 'C'), A: towers(w, 'A') };
    const a = botPlan({ w, lvl: lvlA, R, rng: rA, cost, every, rule, snap, lsA: m.lsA });
    const c = botPlan({ w: turned(w), lvl: lvlC, R, rng: rC, cost, every, rule, snap: { C: snap.A.map(rk), A: snap.C.map(rk) }, lsA: turnedKeys(m.lsC) });
    m.pend = { C: c.map((p) => ({ ...p, o: 'C', x: rx(p.x), y: ry(p.y), dx: -p.dx, dy: -p.dy })), A: a };
    apply(m); updLS(m);
    do {
      step(m.w); updLS(m);
      const nc = towers(m.w, 'C').length, na = towers(m.w, 'A').length;
      if (!nc && !na) return 'D';
      if (!nc) return 'A';
      if (!na) return 'C';
      if (m.w.step >= MAXS) return nc > na ? 'C' : na > nc ? 'A' : 'D';
    } while (m.w.step % every !== 0);
  }
}

/** Level a's score against level b over 2N matches (N seeds a seat), 0–1. */
function score(a: number, b: number): number {
  let s = 0;
  for (let i = 0; i < N; i++) {
    const r1 = playMatch(a, b, 1000 + i), r2 = playMatch(b, a, 5000 + i);
    s += (r1 === 'C' ? 1 : r1 === 'D' ? 0.5 : 0) + (r2 === 'A' ? 1 : r2 === 'D' ? 0.5 : 0);
  }
  return s / (2 * N);
}

const t0 = Date.now();
const levels = [0, 1, 2, 3, 4, 5];
const name = (l: number) => (l === 0 ? 'practice' : `${l} ${RUNGS[l]!.n}`);
const S: Record<string, number> = {};
for (const a of levels) for (const b of levels) if (a < b) { const x = score(b, a); S[`${b},${a}`] = x; S[`${a},${b}`] = 1 - x; }
const pct = (x: number) => `${Math.round(100 * x)}%`.padStart(5);
console.log(`ladder round robin: the row's score against the column, ${2 * N} matches a pair (both seats, seeds 1000+ and 5000+)`);
console.log(''.padEnd(15) + levels.map((l) => (l === 0 ? 'prac' : String(l)).padStart(5)).join(''));
for (const a of levels) console.log(name(a).padEnd(15) + levels.map((b) => (a === b ? '    —' : pct(S[`${a},${b}`]))).join(''));

const failures: string[] = [];
for (let lo = 1; lo <= 5; lo++) for (let hi = lo + 1; hi <= 5; hi++) {
  const x = S[`${hi},${lo}`], open = OPEN.some(([p, q]) => p === lo && q === hi);
  const need = open ? 0.45 : hi === lo + 1 ? MARGIN : 0.5;
  const ok = open ? x >= need : x > need;
  const line = `${name(hi)} against ${name(lo)}: ${pct(x).trim()}${open ? ' (OPEN: not easier only; the owner decides what makes it harder)' : ''}`;
  if (!ok) failures.push(line + ` — needs ${open ? 'at least' : 'more than'} ${Math.round(100 * need)}%`);
  else console.log('ok   ' + line);
}
console.log(`${Math.round((Date.now() - t0) / 1000)} s`);
if (failures.length) { console.error('FAILED\n' + failures.join('\n')); process.exit(1); }
console.log('ladder: every rung is harder than the one below it (one pair open)');
