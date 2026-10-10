/**
 * Minpentai Play's server (src/lib/minpentai/play-server/). Fails (exit 1) on any problem.
 *
 *   npm run test:minpentai-play-server
 *
 * Pure logic first, then the store against an in-memory Postgres (PGlite) with every migration
 * applied (0001–0009), talking to it as studio_writer. Checks:
 * - The rule is drawn as Design's mk draws it; a turn resolves exactly as Design's duel flow
 *   (mk, beginAct, startRun, runTick, checkEnd), run beside it with game.ts's own functions.
 * - Views never leak: over random matches, every piece in every view and every frame is the
 *   player's own or within R of their towers in that frame; everything in sight is shown; the
 *   seed and the opponent's placements never appear.
 * - Placements: every refusal; a tower placed this turn does not light more squares this turn.
 * - Clocks: setup 90 s, then 45 s starting after the run's frames (170 ms a step); a player not
 *   heard from for 15 s pauses the match and 60 s more counts as resigning (or cancels setup);
 *   leaving at setup cancels; a rematch needs both within 20 s.
 * - The ladder: open rungs only, tries, first win, a win opens the next rung, draws don't.
 * - The store: lobby, challenges, invites, blocks, matches, 204 on an unchanged version.
 * - Limits: 60 a minute and 3,000 a day per person (429 with retryAfterMs), match views once a
 *   second and lobby views once every 2 s (429), 200,000 a day across everyone (503).
 * - Cleanup: every retention rule, just inside and just past its threshold, 500 rows a run; ladder
 *   progress and blocks are never deleted.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import {
  COST, D4, D8, K, MAXS, RULES, RULE_IDS, XY, apply, clone, empty, inb, lit, rng, step, towers, updLS, world,
  type Placement, type RuleId, type Side, type World,
} from '../src/lib/minpentai/play-game/game';
import type { BoardView, MatchView } from '../src/lib/minpentai/play-game/live-types';
import {
  GONE_MS, PAUSE_MS, REMATCH_MS, SETUP_MS, STEP_MS, TURN_MS, Refused, advance, askRematch, checkPlacements, createMatch,
  drawRule, fullBoard, leave, playTurn, resign, touch, type LiveMatch,
} from '../src/lib/minpentai/play-server/match';
import { fog, sightOf, viewFor, why } from '../src/lib/minpentai/play-server/view';
import { freshProgress, recordResult } from '../src/lib/minpentai/play-server/ladder';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function refused(label: string, fn: () => unknown, status: number, re?: RegExp) {
  try {
    fn();
    failures.push(`${label}: expected a refusal`);
  } catch (e) {
    if (e instanceof Refused && e.status === status && (!re || re.test(e.message))) passed++;
    else failures.push(`${label}: got ${e instanceof Refused ? `${e.status} ${e.message}` : String(e)}`);
  }
}
const META = (m: LiveMatch, side: Side) => ({ id: 'm', version: 1, opponent: { fid: side === 'C' ? 2 : 1, username: side === 'C' ? 'wren' : 'naaate' } });

// --- Design's duel flow, verbatim from the prototype (with the fake opponent removed) ----------
interface Ref { rule: RuleId; R: number; every: number; cost: number; w: World; hist: World[]; pend: Record<Side, Placement[]>; snap: Record<Side, number[]>; lsC: Record<number, number>; lsA: Record<number, number> }
function refMk(seed: number): Ref {
  const r = rng(seed), ids = Object.keys(RULES), rule = ids[Math.floor(r() * ids.length)] as RuleId;
  const m: Ref = { rule, R: rule === 'sight2' ? 2 : 3, every: rule === 'every8' ? 8 : 12, cost: rule === 'cost3' ? 3 : 4, w: world(), hist: [], pend: { C: [], A: [] }, snap: { C: [], A: [] }, lsC: {}, lsA: {} };
  m.lsC[K(13, 2)] = 0; m.lsC[K(13, 7)] = 0; m.lsA[K(1, 2)] = 0; m.lsA[K(1, 7)] = 0;
  m.hist.push(clone(m.w));
  return m;
}
function refBeginAct(m: Ref) { m.snap = { C: towers(m.w, 'C'), A: towers(m.w, 'A') }; m.pend = { C: [], A: [] }; }
function refStartRun(m: Ref) { apply(m); updLS(m); m.hist[m.hist.length - 1] = clone(m.w); }
function refCheckEnd(m: Ref): { win: Side | 'D'; why: string } | null {
  const w = m.w, c = towers(w, 'C').length, a = towers(w, 'A').length, n = w.step;
  if (!c && !a) return { win: 'D', why: `Both sides lost their last tower at step ${n}.` };
  if (!c) return { win: 'A', why: `Your last tower fell at step ${n}.` };
  if (!a) return { win: 'C', why: `Amber's last tower fell at step ${n}.` };
  if (n >= MAXS) return { win: c > a ? 'C' : a > c ? 'A' : 'D', why: `Time ran out at step ${MAXS}. Amber had ${a} tower${a === 1 ? '' : 's'}, you had ${c}.` };
  return null;
}
/** startRun, then runTick until the next beginAct or the end. */
function refRun(m: Ref): { win: Side | 'D'; why: string } | null {
  refStartRun(m);
  for (;;) {
    step(m.w); updLS(m); m.hist.push(clone(m.w));
    const e = refCheckEnd(m);
    if (e) return e;
    if (m.w.step % m.every === 0) { refBeginAct(m); return null; }
  }
}

/** Random legal placements for `side` this turn (a stand-in player). */
function randomPlan(m: LiveMatch, side: Side, r: () => number): { t: 'g' | 's' | 't'; x: number; y: number; dx: number; dy: number }[] {
  const zone = [...lit(m.w, side, m.R, m.snap[side])].filter((k) => empty(m.w, k));
  const dirs = m.rule === 'diag' ? D8 : D4;
  const out: { t: 'g' | 's' | 't'; x: number; y: number; dx: number; dy: number }[] = [];
  const used = new Set<number>();
  let pts = 8;
  for (let i = 0; i < 6 && zone.length; i++) {
    const t = (['g', 'g', 's', 't'] as const)[Math.floor(r() * 4)];
    const c = t === 'g' ? m.cost : COST[t];
    if (c > pts) continue;
    const k = zone[Math.floor(r() * zone.length)];
    if (used.has(k)) continue;
    const [x, y] = XY(k), [dx, dy] = t === 'g' ? dirs[Math.floor(r() * dirs.length)] : [0, 0];
    out.push({ t, x, y, dx, dy });
    used.add(k);
    pts -= c;
  }
  return out;
}

// --- The rule draw --------------------------------------------------------------------------
{
  const drawn = new Set<RuleId>();
  let agree = true;
  for (let seed = 0; seed < 400; seed++) {
    const r = drawRule(seed);
    drawn.add(r);
    if (r !== refMk(seed).rule) agree = false;
    const m = createMatch(seed, 0);
    if (m.rule !== r || m.R !== (r === 'sight2' ? 2 : 3) || m.every !== (r === 'every8' ? 8 : 12) || m.cost !== (r === 'cost3' ? 3 : 4)) agree = false;
  }
  check('the rule is drawn as Design\'s mk draws it, with its R, interval and cost', agree);
  check('all four rules are drawn', drawn.size === RULE_IDS.length, [...drawn].join(','));
  const m = createMatch(1, 1000);
  check('a new match: setup clock 90 s from the start', m.actStart === 1000 && m.deadline === 1000 + SETUP_MS);
  check('a new match: each side has seen the other\'s start towers at step 0', same(m.lsC, { [K(13, 2)]: 0, [K(13, 7)]: 0 }) && same(m.lsA, { [K(1, 2)]: 0, [K(1, 7)]: 0 }));
  const v = viewFor(m, 'C', 1000, META(m, 'C'));
  check('setup view: no frames, act phase, 90 s', v.frames.length === 0 && v.phase === 'act' && v.msLeft === SETUP_MS);
  check('setup view: the opponent\'s towers are only "last seen"', !v.board.tw.some(([, o]) => o === 'A') && same(v.lastSeen, m.lsC));
  check('a view never carries the seed', !('seed' in v) && !JSON.stringify(v).includes('"seed"'));
}

// --- Same flow as Design's, and no view leaks (random matches) --------------------------------
{
  let flowOk = true, flowWhy = true, leaks = 0, missing = 0, frames = 0, matches = 0, mineLeak = 0, endings = new Set<string>();
  let firstBad = '';
  for (let seed = 1; seed <= 60; seed++) {
    const r = rng(seed * 7919);
    let now = 0;
    const m = createMatch(seed, now);
    const ref = refMk(seed);
    refBeginAct(ref);
    let refEnd: { win: Side | 'D'; why: string } | null = null;
    while (!m.over) {
      now = Math.max(now, m.actStart) + 1000;
      touch(m, 'C', now); touch(m, 'A', now);
      const pc = randomPlan(m, 'C', r), pa = randomPlan(m, 'A', r);
      playTurn(m, 'C', { placements: pc, ended: true }, now);
      // Before the second player ends: C's view must not hold A's placements.
      const midA = viewFor(m, 'A', now, META(m, 'A'));
      if (midA.mine.length !== 0 || !midA.oppEnded) mineLeak++;
      playTurn(m, 'A', { placements: pa, ended: true }, now);
      ref.pend = { C: pc.map((p) => ({ ...p, o: 'C' as Side })), A: pa.map((p) => ({ ...p, o: 'A' as Side })) };
      refEnd = refRun(ref);
      if (!same(m.hist, ref.hist.map(fullBoard)) || !same(m.lsC, ref.lsC) || !same(m.lsA, ref.lsA) || !same(m.snap, m.over ? m.snap : ref.snap)) {
        if (flowOk) firstBad = `seed ${seed} step ${m.w.step}`;
        flowOk = false;
      }
      // Every view, every frame.
      for (const side of ['C', 'A'] as Side[]) {
        const v = viewFor(m, side, now, META(m, side));
        const fullFrames = m.hist.slice(m.runFrom!);
        const boards: [BoardView, BoardView][] = [[v.board, m.hist[m.hist.length - 1]], ...v.frames.map((f, i) => [f, fullFrames[i]] as [BoardView, BoardView])];
        for (const [b, full] of boards) {
          frames++;
          const see = sightOf(full, side, m.R);
          const ok = (k: number, o: Side) => o === side || see.has(k);
          for (const [k, o] of b.tw) if (!ok(k, o)) leaks++;
          for (const [k, o] of b.sq) if (!ok(k, o)) leaks++;
          for (const [x, y, , , o] of b.gl) if (!ok(K(x, y), o)) leaks++;
          for (const k of b.flash) if (!see.has(k)) leaks++;
          const want = fog(full, side, m.R);
          if (b.tw.length !== want.tw.length || b.sq.length !== want.sq.length || b.gl.length !== want.gl.length) missing++;
          const ownT = full.tw.filter(([, o]) => o === side).length, ownS = full.sq.filter(([, o]) => o === side).length, ownG = full.gl.filter(([, , , , o]) => o === side).length;
          if (b.tw.filter(([, o]) => o === side).length !== ownT || b.sq.filter(([, o]) => o === side).length !== ownS || b.gl.filter(([, , , , o]) => o === side).length !== ownG) missing++;
        }
        if (JSON.stringify(v).includes('"seed"')) leaks++;
        if (!m.over && v.mine.length !== 0) mineLeak++;
        if (!m.over && v.frames.length !== m.every + 1) missing++;
      }
    }
    matches++;
    endings.add(m.over!.win);
    if (!refEnd || refEnd.win !== m.over!.win || m.over!.kind !== 'end') flowOk = false;
    if (refEnd && why(m.over!, 'C', 'wren').replaceAll('@wren', 'Amber') !== refEnd.why) {
      flowWhy = false;
      firstBad ||= `why: "${why(m.over!, 'C', 'wren')}" vs "${refEnd.why}"`;
    }
    const over = viewFor(m, 'C', now, META(m, 'C'));
    if (!over.result || over.result.replay.length !== m.w.step + 1 || !same(over.result.replay, ref.hist.map(fullBoard))) flowOk = false;
  }
  check('simultaneous turns resolve exactly as Design\'s flow (board, every step, last seen, snapshots, winner)', flowOk, firstBad);
  check('the ending\'s wording is Design\'s (with the opponent\'s name for Amber)', flowWhy, firstBad);
  check(`no view or frame shows a square out of sight (${matches} matches, ${frames} boards)`, leaks === 0, `${leaks} leaks`);
  check('every view shows all the player\'s own pieces and everything in sight; a run has every + 1 frames', missing === 0, `${missing}`);
  check('the opponent\'s placements are never sent before they appear', mineLeak === 0, `${mineLeak}`);
  check('random matches reach different endings', endings.size >= 2, [...endings].join(','));
}

// --- Two placements on one square cancel (rules §4; game.ts apply) --------------------------
{
  const m = createMatch(5, 0);
  m.w.tw[K(6, 3)] = 'C'; m.w.tw[K(8, 3)] = 'A';
  m.snap = { C: towers(m.w, 'C'), A: towers(m.w, 'A') };
  playTurn(m, 'C', { placements: [{ t: 's', x: 7, y: 2, dx: 0, dy: 0 }, { t: 's', x: 5, y: 2, dx: 0, dy: 0 }], ended: true }, 1);
  playTurn(m, 'A', { placements: [{ t: 't', x: 7, y: 2, dx: 0, dy: 0 }], ended: true }, 1);
  const b0 = m.hist[0];
  check('two placements on one square cancel; others stand', !b0.sq.some(([k]) => k === K(7, 2)) && !b0.tw.some(([k]) => k === K(7, 2)) && b0.sq.some(([k]) => k === K(5, 2)));
}

// --- Placements ---------------------------------------------------------------------------------
{
  const pick = (seed: number, rule: RuleId) => { let s = seed; while (drawRule(s) !== rule) s++; return createMatch(s, 0); };
  const m = pick(1, 'every8');
  const P = (t: string, x: number, y: number, dx = 1, dy = 0) => ({ t, x, y, dx, dy });
  refused('placements must be a list', () => checkPlacements(m, 'C', 'x'), 400);
  refused('only gliders, squares and towers', () => checkPlacements(m, 'C', [P('r', 2, 2)]), 400, /gliders, squares and towers/);
  refused('on the board', () => checkPlacements(m, 'C', [P('s', -1, 2)]), 400, /not on the board/);
  refused('whole squares only', () => checkPlacements(m, 'C', [P('s', 1.5, 2)]), 400, /not on the board/);
  refused('within R of a tower you had when the turn began', () => checkPlacements(m, 'C', [P('s', 5, 2)]), 400, /lit area: within 3 squares/);
  refused('not on a tower', () => checkPlacements(m, 'C', [P('s', 1, 2)]), 400, /taken/);
  refused('not on a rock', () => { const r = pick(1, 'every8'); r.w.tw[K(6, 2)] = 'C'; r.snap.C = towers(r.w, 'C'); checkPlacements(r, 'C', [P('s', 6, 0)]); }, 400, /taken/);
  refused('one piece a square', () => checkPlacements(m, 'C', [P('s', 2, 2), P('s', 2, 2)]), 400, /taken/);
  refused('8 points', () => checkPlacements(m, 'C', [P('g', 2, 2), P('g', 3, 2), P('s', 2, 3)]), 400, /Not enough points/);
  check('8 points exactly is fine', checkPlacements(m, 'C', [P('g', 2, 2), P('t', 3, 2)]).length === 2);
  refused('no diagonals without the rule', () => checkPlacements(m, 'C', [P('g', 2, 2, 1, 1)]), 400, /up, down, left or right/);
  refused('a glider must move', () => checkPlacements(m, 'C', [P('g', 2, 2, 0, 0)]), 400);
  refused('a glider moves one square a step', () => checkPlacements(m, 'C', [P('g', 2, 2, 2, 0)]), 400);
  const d = pick(1, 'diag');
  check('diagonals under the diag rule', checkPlacements(d, 'C', [P('g', 2, 2, 1, -1)]).length === 1);
  const c3 = pick(1, 'cost3');
  check('gliders cost 3 under the cost rule (two gliders and two squares)', checkPlacements(c3, 'C', [P('g', 2, 2), P('g', 3, 2), P('s', 2, 3), P('s', 3, 3)]).length === 4);
  refused('…and not three gliders', () => checkPlacements(c3, 'C', [P('g', 2, 2), P('g', 3, 2), P('g', 2, 3)]), 400, /Not enough points/);
  const s2 = pick(1, 'sight2');
  refused('sight 2: 3 squares away is out of the lit area', () => checkPlacements(s2, 'C', [P('s', 4, 2)]), 400, /within 2 squares/);
  refused('a tower placed this turn lights more squares only from the next turn', () => checkPlacements(m, 'C', [P('t', 4, 2), P('s', 5, 2)]), 400, /lit area/);
  check('squares and towers carry no direction', same(checkPlacements(m, 'C', [P('s', 2, 2, 1, 0)])[0], { t: 's', o: 'C', x: 2, y: 2, dx: 0, dy: 0 }));
  check('placements stand as the owner\'s', checkPlacements(m, 'A', [P('s', 12, 2, -1, 0)])[0].o === 'A');
}

// --- Clocks, pauses, leaving, rematch -------------------------------------------------------
/** Both players poll every 2 s from `from` to `to`. */
function both(m: LiveMatch, from: number, to: number) { for (let t = from; t <= to; t += 2000) { touch(m, 'C', t); touch(m, 'A', t); } }
{
  const m = createMatch(3, 0);
  both(m, 0, 88_000);
  check('setup is still open before 90 s', m.w.step === 0 && !m.over);
  touch(m, 'C', 89_999);
  check('…at 89.999 s', m.w.step === 0);
  touch(m, 'C', SETUP_MS);
  const runMs = m.every * STEP_MS;
  check('at 90 s the setup turn resolves and the match runs to the next turn to act', m.w.step === m.every && m.runFrom === 0, `step ${m.w.step}`);
  check('the next clock starts after the frames play at 170 ms a step', m.actStart === SETUP_MS + runMs && m.deadline === SETUP_MS + runMs + TURN_MS, `${m.actStart} ${m.deadline}`);
  const vRun = viewFor(m, 'C', SETUP_MS + 1, META(m, 'C'));
  check('during playback the phase is run', vRun.phase === 'run' && vRun.msLeft === runMs + TURN_MS - 1);
  refused('placing during the run is refused (409)', () => playTurn(m, 'C', { placements: [], ended: false }, SETUP_MS + 1), 409);
  const vAct = viewFor(m, 'C', m.actStart, META(m, 'C'));
  check('after playback: act phase, 45 s', vAct.phase === 'act' && vAct.msLeft === TURN_MS);
  // What you placed stands when the clock runs out, ended or not.
  const ownS = (b: BoardView) => b.sq.filter(([, o]) => o === 'C').length;
  const before = ownS(m.hist[m.hist.length - 1]);
  playTurn(m, 'C', { placements: [{ t: 's', x: 2, y: 2, dx: 0, dy: 0 }], ended: false }, m.actStart + 1000);
  const v1 = viewFor(m, 'C', m.actStart + 1000, META(m, 'C'));
  check('my placements come back in mine; not ended', v1.mine.length === 1 && !v1.ended);
  const dl = m.deadline;
  both(m, m.actStart + 2000, dl - 1);
  check('nothing resolves before the deadline', m.w.step === m.every);
  touch(m, 'A', dl);
  check('at the deadline the turn resolves with what was placed', m.w.step === 2 * m.every && m.moves[1].C.length === 1 && ownS(m.hist[m.every]) === before + 1, JSON.stringify(m.moves[1]));
  // Both ended: resolves at once.
  const t = m.actStart + 500;
  playTurn(m, 'C', { placements: [], ended: true }, t);
  check('one side ending does not resolve', m.w.step === 2 * m.every && viewFor(m, 'A', t, META(m, 'A')).oppEnded);
  playTurn(m, 'C', { placements: [], ended: false }, t + 1);
  check('ending can be taken back', !m.ended.C);
  playTurn(m, 'C', { placements: [], ended: true }, t + 2);
  playTurn(m, 'A', { placements: [], ended: true }, t + 3);
  check('both ended: the turn resolves at once', m.w.step === 3 * m.every && m.actStart === t + 3 + m.every * STEP_MS);
}
{
  // Pause after 15 s of silence; back within 60 s resumes and the clock moves on by the pause.
  const m = createMatch(4, 0);
  both(m, 0, 10_000);
  for (let t = 12_000; t <= 24_000; t += 2000) touch(m, 'C', t);
  check('not paused at 14.999 s of silence', !m.paused);
  touch(m, 'C', 25_000);
  check('paused once A is not heard from for 15 s', m.paused?.who === 'A' && m.paused.since === 10_000 + PAUSE_MS, JSON.stringify(m.paused));
  const vc = viewFor(m, 'C', 40_000, META(m, 'C'));
  check('paused view: phase, who, 60 s to come back, clock frozen', vc.phase === 'paused' && vc.paused?.who === 'opponent' && vc.paused.msLeft === GONE_MS - 15_000 && vc.msLeft === SETUP_MS - 25_000, JSON.stringify([vc.paused, vc.msLeft]));
  check('the paused player sees it is them', viewFor(m, 'A', 40_000, META(m, 'A')).paused?.who === 'you');
  refused('no placing while paused', () => playTurn(m, 'C', { placements: [], ended: true }, 40_000), 409, /paused/);
  for (let t = 26_000; t <= 54_000; t += 2000) touch(m, 'C', t);
  touch(m, 'A', 55_000);
  check('back within 60 s: resumed, the clock moved on by the pause', !m.paused && m.deadline === SETUP_MS + 30_000 && !m.over, `${m.deadline}`);
  both(m, 56_000, SETUP_MS + 29_000);
  check('the setup turn has not resolved yet', m.w.step === 0);
  touch(m, 'C', SETUP_MS + 30_000);
  check('…and resolves at the moved deadline', m.w.step === m.every);
  // A deadline that would fall during a pause waits for it.
  const m2 = createMatch(4, 0);
  both(m2, 0, 60_000);
  for (let t = 62_000; t <= 134_000; t += 2000) touch(m2, 'C', t);
  check('a pause holds the clock: the deadline does not pass while paused', m2.w.step === 0 && m2.paused?.who === 'A');
  touch(m2, 'C', 60_000 + PAUSE_MS + GONE_MS);
  check('gone during setup: cancelled with no result', m2.over?.kind === 'cancelled' && m2.over.win === 'D' && m2.rm === null);
  check('cancelled wording', why(m2.over!, 'C', 'wren') === 'Match cancelled during setup. No result.');
  // Gone after setup counts as resigning.
  const m3 = createMatch(4, 0);
  both(m3, 0, SETUP_MS);
  const last = m3.seen.A;
  for (let t = SETUP_MS + 2000; t <= last + PAUSE_MS + GONE_MS - 1; t += 2000) touch(m3, 'C', t);
  check('not gone at 74.999 s', !m3.over && !!m3.paused);
  touch(m3, 'C', last + PAUSE_MS + GONE_MS);
  check('gone after 15 s + 60 s: counts as resigning', m3.over?.kind === 'gone' && m3.over.win === 'C' && m3.over.by === 'A' && m3.rm === null);
  check('gone wording, both ways', why(m3.over!, 'C', 'wren') === "@wren didn't come back within 60 seconds. That counts as resigning." && why(m3.over!, 'A', 'naaate').startsWith("You didn't come back"));
  // Lazily: nobody polls for a long time, then one request resolves everything in time order.
  const m4 = createMatch(9, 0);
  advance(m4, 10 * 60_000);
  check('one late request resolves in time order (setup cancelled, not played on)', m4.over?.kind === 'cancelled' && m4.w.step === 0);
}
{
  const m = createMatch(6, 0);
  leave(m, 'A', 1000);
  check('leaving during setup cancels with no result', m.over?.kind === 'cancelled' && m.over.win === 'D' && m.rm === null);
  refused('no rematch after a cancelled setup', () => askRematch(m, 'C', 2000), 409);
  const m2 = createMatch(6, 0);
  both(m2, 0, SETUP_MS);
  leave(m2, 'A', SETUP_MS + 1000);
  check('leaving later counts as resigning', m2.over?.kind === 'left' && m2.over.win === 'C');
  check('left wording', why(m2.over!, 'A', 'naaate') === `You left at step ${m2.w.step}. Leaving counts as resigning.`);
  const m3 = createMatch(6, 0);
  resign(m3, 'C', 500);
  check('resigning: the other side wins', m3.over?.kind === 'resign' && m3.over.win === 'A');
  check('resign wording', why(m3.over!, 'C', 'wren') === 'You resigned at step 0. It counts as a loss.');
  refused('nothing after the end', () => resign(m3, 'A', 600), 409);
  refused('no turn after the end', () => playTurn(m3, 'A', { placements: [], ended: true }, 600), 409);
  check('rematch: one asks, not yet', askRematch(m3, 'C', 500 + 5000) === false);
  const v = viewFor(m3, 'A', 6000, META(m3, 'A'));
  check('rematch view: they asked, 20 s window', v.result?.rematch.theirs === true && !v.result.rematch.mine && v.result.rematch.msLeft === REMATCH_MS - 5500);
  check('rematch: both within 20 s', askRematch(m3, 'A', 500 + REMATCH_MS - 1) === true);
  const m4 = createMatch(6, 0);
  resign(m4, 'C', 0);
  askRematch(m4, 'C', 1000);
  refused('rematch: after 20 s the offer has run out', () => askRematch(m4, 'A', REMATCH_MS), 409, /ran out/);
}

// --- The ladder -----------------------------------------------------------------------------
{
  let p = freshProgress();
  refused('a rung not open yet', () => recordResult(p, { rung: 2, win: 'C', step: 40 }), 409);
  refused('a bad rung', () => recordResult(p, { rung: 0, win: 'C', step: 40 }), 400);
  refused('a bad result', () => recordResult(p, { rung: 1, win: 'X', step: 40 }), 400);
  refused('a bad step', () => recordResult(p, { rung: 1, win: 'C', step: 97 }), 400);
  p = recordResult(p, { rung: 1, win: 'A', step: 30 });
  check('a loss: tries + 1, nothing opens', p.opened === 1 && same(p.rec[1], { tries: 1 }));
  p = recordResult(p, { rung: 1, win: 'D', step: 96 });
  check('a draw opens nothing', p.opened === 1 && p.rec[1].tries === 2 && p.rec[1].won === undefined);
  p = recordResult(p, { rung: 1, win: 'C', step: 61 });
  check('a win opens the next rung and records its step', p.opened === 2 && same(p.rec[1], { tries: 3, won: 61 }));
  p = recordResult(p, { rung: 1, win: 'C', step: 20 });
  check('only the first win\'s step is kept', p.rec[1].won === 61 && p.rec[1].tries === 4 && p.opened === 2);
  for (let n = 2; n <= 5; n++) p = recordResult(p, { rung: n, win: 'C', step: 50 + n });
  check('a win on rung 5 keeps 5 open', p.opened === 5 && p.rec[5].won === 55);
  p = recordResult(p, { rung: 3, win: 'A', step: 10 });
  check('a lower rung can be played again', p.rec[3].tries === 2 && p.opened === 5);
}

// --- The store, against PGlite with every migration ---------------------------------------------
{
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  const postgres = (await import('postgres')).default;
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
  }
  const PORT = 54333;
  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await server.start();
  const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
  await sql`set role studio_writer`;
  const S = await import('../src/lib/minpentai/play-server/store');
  const rejects = async (label: string, p: Promise<unknown>, status: number, re?: RegExp) => {
    try {
      await p;
      failures.push(`${label}: expected a refusal`);
    } catch (e) {
      if (e instanceof Refused && e.status === status && (!re || re.test(e.message))) passed++;
      else failures.push(`${label}: got ${e instanceof Refused ? `${e.status} ${e.message}` : String(e)}`);
    }
  };
  try {
    const T0 = Date.UTC(2026, 9, 9, 12);
    // Ladder.
    check('store: fresh ladder', same(await S.getLadder(sql, 7), { opened: 1, rec: {} }));
    await rejects('store: a closed rung', S.postLadder(sql, 7, { rung: 2, win: 'C', step: 3 }), 409);
    await S.postLadder(sql, 7, { rung: 1, win: 'C', step: 44 });
    check('store: a win is recorded and opens rung 2', same(await S.getLadder(sql, 7), { opened: 2, rec: { 1: { tries: 1, won: 44 } } }));
    check('store: progress is per person', same(await S.getLadder(sql, 8), { opened: 1, rec: {} }));

    // Lobby and challenges.
    await rejects('store: challenge without being ready', S.challenge(sql, 7, 8, T0), 409, /ready first/);
    await S.goReady(sql, 7, 'naaate', T0);
    await rejects('store: challenge someone not ready', S.challenge(sql, 7, 8, T0), 409, /no longer ready/);
    await S.goReady(sql, 8, 'wren', T0 + 1000);
    await S.goReady(sql, 9, 'kit', T0 + 2000);
    const l7 = await S.lobbyView(sql, 7, T0 + 3000);
    check('store: the lobby lists other ready players, newest first, by username', same(l7.ready, [{ fid: 9, username: 'kit' }, { fid: 8, username: 'wren' }]) && l7.me.ready && l7.me.username === 'naaate', JSON.stringify(l7));
    await S.goReady(sql, 8, 'wren', T0 + 4000);
    check('store: staying ready keeps your place', same((await S.lobbyView(sql, 7, T0 + 4000)).ready.map((p) => p.fid), [9, 8]));
    check('store: ready lasts 3 minutes', (await S.lobbyView(sql, 7, T0 + 3 * 60_000 + 1)).me.ready === false);
    await rejects('store: challenge yourself', S.challenge(sql, 7, 7, T0), 400);
    const { id: ch } = await S.challenge(sql, 7, 8, T0 + 5000);
    await rejects('store: one open challenge at a time', S.challenge(sql, 7, 9, T0 + 6000), 409, /already have a challenge/);
    const l8 = await S.lobbyView(sql, 8, T0 + 6000);
    check('store: the challenge reaches them, 20 s to accept', l8.incoming.length === 1 && l8.incoming[0].from.username === 'naaate' && l8.incoming[0].msLeft === 19_000);
    check('store: and shows as mine', (await S.lobbyView(sql, 7, T0 + 6000)).outgoing?.to.fid === 8);
    await rejects('store: only they can accept', S.acceptChallenge(sql, 9, ch, T0 + 7000), 404);
    await rejects('store: a challenge expires after 20 s', S.acceptChallenge(sql, 8, ch, T0 + 25_000), 409, /no longer open/);
    const { id: ch2 } = await S.challenge(sql, 7, 8, T0 + 26_000);
    await S.declineChallenge(sql, 8, ch2);
    await rejects('store: a declined challenge cannot be accepted', S.acceptChallenge(sql, 8, ch2, T0 + 27_000), 409);
    const { id: ch3 } = await S.challenge(sql, 7, 8, T0 + 28_000);
    const { matchId } = await S.acceptChallenge(sql, 8, ch3, T0 + 29_000);
    check('store: accepting starts a match and clears both from the lobby', (await S.lobbyView(sql, 9, T0 + 29_000)).ready.every((p) => p.fid === 9 ? false : p.fid !== 7 && p.fid !== 8));
    check('store: both see the match in the lobby', (await S.lobbyView(sql, 7, T0 + 29_500)).match?.id === matchId && (await S.lobbyView(sql, 8, T0 + 29_500)).match?.id === matchId);
    await rejects('store: no ready while in a match', S.goReady(sql, 7, 'naaate', T0 + 30_000), 409, /Finish your match/);

    // The match.
    const v7 = (await S.onMatch(sql, 7, matchId, T0 + 30_000, null)) as MatchView;
    check('store: the challenger is Cyan, the one who accepted Amber', v7.you === 'C' && v7.opponent.username === 'wren' && (await S.onMatch(sql, 8, matchId, T0 + 30_000, null) as MatchView).you === 'A');
    check('store: the same version answers unchanged (204)', (await S.onMatch(sql, 7, matchId, T0 + 31_000, null, undefined, v7.version)) === 'unchanged');
    await rejects('store: someone else cannot see the match', S.onMatch(sql, 9, matchId, T0 + 31_000, null), 404);
    await rejects('store: a bad id', S.onMatch(sql, 7, 'nope', T0, null), 404);
    await rejects('store: a refused placement', S.onMatch(sql, 7, matchId, T0 + 32_000, 'turn', { placements: [{ t: 's', x: 9, y: 9, dx: 0, dy: 0 }], ended: false }), 400, /lit area/);
    const vt = (await S.onMatch(sql, 7, matchId, T0 + 33_000, 'turn', { placements: [{ t: 'g', x: 2, y: 2, dx: 1, dy: 0 }], ended: true })) as MatchView;
    check('store: a turn bumps the version and comes back in mine', vt.version > v7.version && vt.mine.length === 1 && vt.ended);
    const va = (await S.onMatch(sql, 8, matchId, T0 + 34_000, null)) as MatchView;
    check('store: the opponent sees that I ended, not what I placed', va.oppEnded && va.mine.length === 0 && !JSON.stringify(va.board).includes('[2,2,'));
    const vr = (await S.onMatch(sql, 8, matchId, T0 + 35_000, 'turn', { placements: [], ended: true })) as MatchView;
    check('store: both ended → the run, frames and the next turn', vr.phase === 'run' && vr.frames.length === vr.every + 1 && vr.board.step === vr.every);
    const [row] = await sql`select version, status, act_deadline, last_seen_c, last_seen_a from studio.mp_matches where id = ${matchId}`;
    check('store: deadline and seen times are kept in columns', row.status === 'live' && new Date(row.act_deadline as string).getTime() === T0 + 35_000 + vr.every * STEP_MS + TURN_MS && new Date(row.last_seen_a as string).getTime() === T0 + 35_000);
    // Silence: 15 s pauses, 60 s more counts as resigning (resolved by the other's poll).
    const vp = (await S.onMatch(sql, 8, matchId, T0 + 33_000 + PAUSE_MS + 1000, null)) as MatchView;
    check('store: a silent player pauses the match', vp.phase === 'paused' && vp.paused?.who === 'opponent');
    const vg = (await S.onMatch(sql, 8, matchId, T0 + 33_000 + PAUSE_MS + GONE_MS, null)) as MatchView;
    check('store: …and is gone after 60 s more', vg.phase === 'over' && vg.result?.kind === 'gone' && vg.result.win === 'A', JSON.stringify(vg.result?.why));
    const [ended] = await sql`select status, result->>'kind' as kind, ended_at from studio.mp_matches where id = ${matchId}`;
    check('store: the row is over, with its result', ended.status === 'over' && ended.kind === 'gone' && ended.ended_at !== null);
    await rejects('store: no rematch after someone was gone', S.onMatch(sql, 8, matchId, T0 + 200_000, 'rematch'), 409);
    check('store: the lobby no longer offers the match', (await S.lobbyView(sql, 7, T0 + 200_000)).match === null);

    // Invites.
    const T1 = T0 + 300_000;
    const { token } = await S.createInvite(sql, 7, 'naaate', T1);
    check('store: an invite token is 128 random bits', /^[A-Za-z0-9_-]{22}$/.test(token));
    check('store: reading an invite', same(await S.readInvite(sql, 9, token, T1), { from: { fid: 7, username: 'naaate' }, open: true }));
    await rejects('store: not your own invite', S.acceptInvite(sql, 7, 'naaate', token, T1), 400, /your own invite/);
    const { matchId: m2 } = await S.acceptInvite(sql, 9, 'kit', token, T1 + 1000);
    check('store: the invite is used once', (await S.readInvite(sql, 8, token, T1 + 2000)).open === false);
    await rejects('store: a used invite cannot be accepted', S.acceptInvite(sql, 8, 'wren', token, T1 + 2000), 409);
    const vi = (await S.onMatch(sql, 9, m2, T1 + 2000, null)) as MatchView;
    check('store: the inviter is Cyan', vi.you === 'A' && vi.opponent.fid === 7);
    const { token: t2 } = await S.createInvite(sql, 8, 'wren', T1);
    await rejects('store: an invite expires after 24 h', S.acceptInvite(sql, 3, 'ash', t2, T1 + 24 * 3600_000), 409);
    await rejects('store: no second match while one is live', S.acceptInvite(sql, 9, 'kit', (await S.createInvite(sql, 3, 'ash', T1)).token, T1 + 3000), 409, /Finish your match/);
    for (let i = 0; i < 4; i++) await S.createInvite(sql, 3, 'ash', T1);
    await rejects('store: at most 5 open invites', S.createInvite(sql, 3, 'ash', T1), 429);

    // Rematch: resign, both ask within 20 s, a new match.
    await S.onMatch(sql, 9, m2, T1 + 4000, 'resign');
    await S.onMatch(sql, 7, m2, T1 + 5000, 'rematch');
    const vm = (await S.onMatch(sql, 9, m2, T1 + 6000, 'rematch')) as MatchView;
    const m3 = vm.result?.rematch.matchId;
    check('store: both asked → a rematch, same sides', !!m3 && ((await S.onMatch(sql, 7, m3!, T1 + 7000, null)) as MatchView).you === 'C');
    const [rr] = await sql`select rematch_of from studio.mp_matches where id = ${m3!}`;
    check('store: the rematch points at its match', String(rr.rematch_of) === m2);
    await S.onMatch(sql, 7, m3!, T1 + 8000, 'leave');
    check('store: leaving at setup cancels', ((await S.onMatch(sql, 9, m3!, T1 + 9000, null)) as MatchView).result?.kind === 'cancelled');

    // Blocks.
    const T2 = T1 + 600_000;
    await S.goReady(sql, 7, 'naaate', T2);
    await S.goReady(sql, 9, 'kit', T2);
    const { id: ch4 } = await S.challenge(sql, 9, 7, T2 + 1000);
    await S.block(sql, 7, 9);
    check('store: a block hides both from each other\'s lobby', !(await S.lobbyView(sql, 7, T2 + 2000)).ready.some((p) => p.fid === 9) && !(await S.lobbyView(sql, 9, T2 + 2000)).ready.some((p) => p.fid === 7));
    check('store: a block cancels their open challenge', (await S.lobbyView(sql, 7, T2 + 2000)).incoming.length === 0);
    await rejects('store: the blocked challenge cannot be accepted', S.acceptChallenge(sql, 7, ch4, T2 + 3000), 409);
    await rejects('store: a blocked player cannot challenge (reads as not ready)', S.challenge(sql, 9, 7, T2 + 4000), 409, /no longer ready/);
    const { token: t3 } = await S.createInvite(sql, 7, 'naaate', T2);
    check('store: a blocked player sees an invite as closed', (await S.readInvite(sql, 9, t3, T2)).open === false);
    await rejects('store: …and cannot accept it', S.acceptInvite(sql, 9, 'kit', t3, T2 + 5000), 409);
    await rejects('store: no blocking yourself', S.block(sql, 7, 7), 400);
    await S.block(sql, 7, 9);
    check('store: blocking twice is fine', true);
    await S.stopReady(sql, 7, T2 + 6000);
    check('store: stop being ready', (await S.lobbyView(sql, 7, T2 + 6000)).me.ready === false);

    // --- Limits (MINPENTAI_PLAY) ---------------------------------------------------------
    const { MINPENTAI_PLAY: LIM } = await import('../src/lib/config');
    const limitIs = async (label: string, p: Promise<unknown>, status: number, retry?: number) => {
      try {
        await p;
        failures.push(`${label}: expected ${status}`);
      } catch (e) {
        const got = e instanceof Refused ? e.extra?.retryAfterMs : undefined;
        if (e instanceof Refused && e.status === status && (retry === undefined || got === retry)) passed++;
        else failures.push(`${label}: got ${e instanceof Refused ? `${e.status} ${e.message} retryAfterMs=${got}` : String(e)}`);
      }
    };
    const D0 = Date.UTC(2026, 9, 12, 10, 0, 0);
    for (let i = 0; i < LIM.perMinute; i++) await S.limitRequest(sql, 100, 'other', D0 + 1000 + i);
    check(`limits: ${LIM.perMinute} requests in a minute are fine`, true);
    await limitIs(`limits: request ${LIM.perMinute + 1} in the minute is 429, retry at the next minute`, S.limitRequest(sql, 100, 'other', D0 + 20_000), 429, 40_000);
    await S.limitRequest(sql, 100, 'other', D0 + 60_000);
    check('limits: the next minute starts a new count', true);
    await sql`update studio.mp_rate set day_count = ${LIM.perDay} where fid = 100`;
    const toMidnight = Date.UTC(2026, 9, 13) - (D0 + 61_000);
    await limitIs(`limits: request ${LIM.perDay + 1} in the UTC day is 429, retry at midnight`, S.limitRequest(sql, 100, 'other', D0 + 61_000), 429, toMidnight);
    await S.limitRequest(sql, 100, 'other', Date.UTC(2026, 9, 13, 0, 0, 1));
    const [r100] = await sql`select day_count, minute_count from studio.mp_rate where fid = 100`;
    check('limits: a new UTC day starts a new count', r100.day_count === 1 && r100.minute_count === 1, JSON.stringify(r100));
    // Poll intervals: match view once a second, lobby view once every 2 s; writes are only counted.
    const P0 = D0 + 3600_000;
    await S.limitRequest(sql, 101, 'match-view', P0);
    await limitIs('limits: a second match view within 1,000 ms is 429 with the time until allowed', S.limitRequest(sql, 101, 'match-view', P0 + 999), 429, 1);
    await limitIs('limits: …at 400 ms, 600 ms to wait', S.limitRequest(sql, 101, 'match-view', P0 + 400), 429, 600);
    await S.limitRequest(sql, 101, 'other', P0 + 401);
    check('limits: a write right after a view is not interval-limited', true);
    await S.limitRequest(sql, 101, 'match-view', P0 + 1000);
    check('limits: a refused view does not move the interval; at 1,000 ms it is answered', true);
    await S.limitRequest(sql, 101, 'lobby-view', P0 + 1001);
    check('limits: lobby and match views have their own intervals', true);
    await limitIs('limits: a second lobby view within 2,000 ms is 429', S.limitRequest(sql, 101, 'lobby-view', P0 + 2999), 429, 2);
    await S.limitRequest(sql, 101, 'lobby-view', P0 + 3001);
    check('limits: at 2,000 ms the lobby is answered', true);
    for (let i = 0; i < 4; i++) await S.limitRequest(sql, 102, 'match-view', P0 + 1500 * i);
    check('limits: the page\'s 1,500 ms match poll never hits the interval', true);
    for (let i = 0; i < 4; i++) await S.limitRequest(sql, 102, 'lobby-view', P0 + 10_000 + 3000 * i);
    check('limits: the page\'s 3,000 ms lobby poll never hits the interval', true);
    // Sitewide daily total.
    const day = '2026-10-12';
    const [before] = await sql`select requests from studio.mp_daily where day = ${day}`;
    await limitIs('limits: a person over their own limit is refused before the sitewide count', S.limitRequest(sql, 101, 'match-view', P0 + 1500), 429, 500);
    const [afterRefusal] = await sql`select requests from studio.mp_daily where day = ${day}`;
    check('limits: …and does not add to it', afterRefusal.requests === before.requests);
    await sql`update studio.mp_daily set requests = ${LIM.sitewidePerDay - 1} where day = ${day}`;
    await S.limitRequest(sql, 103, 'other', P0 + 5000);
    check(`limits: request ${LIM.sitewidePerDay} of the day across everyone is fine`, true);
    await limitIs(`limits: request ${LIM.sitewidePerDay + 1} across everyone is 503`, S.limitRequest(sql, 104, 'other', P0 + 6000), 503);
    try { await S.limitRequest(sql, 105, 'other', P0 + 7000); } catch (e) {
      check('limits: the sitewide refusal names practice and free play', (e as Error).message === "Play has reached today's limit. Practice and free play still work.");
    }
    await S.limitRequest(sql, 104, 'other', Date.UTC(2026, 9, 13, 1));
    check('limits: the next UTC day is open again', true);
    {
      const R = await import('../src/lib/minpentai/play-server/route');
      const req = (m: string, p: string) => new Request(`https://x.test${p}`, { method: m });
      check('limits: match and lobby GETs are the views; everything else is counted only',
        R.kindOf(req('GET', '/api/minpentai/match/abc')) === 'match-view' && R.kindOf(req('GET', '/api/minpentai/lobby')) === 'lobby-view'
        && R.kindOf(req('POST', '/api/minpentai/match/abc/turn')) === 'other' && R.kindOf(req('GET', '/api/minpentai/ladder')) === 'other'
        && R.kindOf(req('DELETE', '/api/minpentai/lobby')) === 'other');
      const res = await R.play(req('GET', '/api/minpentai/lobby'), async () => ({ ok: true }));
      check('order: no sign-in is 401 before anything else', res.status === 401 && res.headers.get('Cache-Control') === 'private, no-store');
    }

    // --- Cleanup (retention) ------------------------------------------------------------------
    const C = Date.UTC(2026, 10, 20, 12);
    const H1 = LIM.challengeKeepMs, DAYMS = 86_400_000;
    const iso = (t: number) => new Date(t);
    await S.cleanup(sql, C - 30 * DAYMS);
    const stored = (m: ReturnType<typeof createMatch>) => ({ ...m, seen: undefined });
    const addMatch = async (id: string, seenC: number, seenA: number, status = 'live', endedAt: number | null = null) => {
      const m = createMatch(11, seenC);
      await sql`insert into studio.mp_matches ${sql({
        id, fid_c: 201, fid_a: 202, username_c: 'aa', username_a: 'bb', rules_version: 'x', rule: m.rule, seed: 11, status,
        state: sql.json(stored(m) as never), last_seen_c: iso(seenC), last_seen_a: iso(seenA), ended_at: endedAt === null ? null : iso(endedAt), created_at: iso(seenC),
      })}`;
    };
    const U = (n: number) => `00000000-0000-0000-0000-0000000d${String(n).padStart(4, '0')}`;
    await addMatch(U(1), C - LIM.abandonAfterMs - 1, C - LIM.abandonAfterMs - 1);
    await addMatch(U(2), C - LIM.abandonAfterMs - 1, C - LIM.abandonAfterMs + 1);
    await addMatch(U(3), C - 40 * DAYMS, C - 40 * DAYMS, 'over', C - LIM.matchKeepDays * DAYMS - 1);
    await addMatch(U(4), C - 40 * DAYMS, C - 40 * DAYMS, 'over', C - LIM.matchKeepDays * DAYMS + 1);
    const tok = (n: number) => `cleanup${String(n).padStart(15, '0')}`;
    await sql`insert into studio.mp_invites ${sql([
      { token: tok(1), from_fid: 201, from_username: 'aa', created_at: iso(C - DAYMS - 1), expires_at: iso(C - 1) },
      { token: tok(2), from_fid: 201, from_username: 'aa', created_at: iso(C - DAYMS + 1), expires_at: iso(C + 1) },
      { token: tok(3), from_fid: 201, from_username: 'aa', created_at: iso(C - DAYMS - 1), expires_at: iso(C - 1), used_by: 202, used_at: iso(C - DAYMS), match_id: U(3) },
    ])}`;
    await sql`insert into studio.mp_challenges ${sql([
      { id: U(11), from_fid: 201, from_username: 'aa', to_fid: 202, to_username: 'bb', created_at: iso(C - H1 - 30_000), expires_at: iso(C - H1 - 1), status: 'open', closed_at: null },
      { id: U(12), from_fid: 203, from_username: 'cc', to_fid: 202, to_username: 'bb', created_at: iso(C - H1 - 10_000), expires_at: iso(C - H1 + 1), status: 'open', closed_at: null },
      { id: U(13), from_fid: 204, from_username: 'dd', to_fid: 202, to_username: 'bb', created_at: iso(C - H1 - 10_000), expires_at: iso(C - H1 + 10_000), status: 'declined', closed_at: iso(C - H1 - 1) },
      { id: U(14), from_fid: 205, from_username: 'ee', to_fid: 202, to_username: 'bb', created_at: iso(C - H1 - 10_000), expires_at: iso(C - H1 + 10_000), status: 'accepted', closed_at: iso(C - H1 + 1), match_id: U(3) },
    ] as never)}`;
    await sql`insert into studio.mp_lobby ${sql([
      { fid: 211, username: 'old', ready_at: iso(C - 2 * H1), ready_until: iso(C - LIM.lobbyKeepMs - 1) },
      { fid: 212, username: 'recent', ready_at: iso(C - 2 * H1), ready_until: iso(C - LIM.lobbyKeepMs + 1) },
    ])}`;
    await sql`insert into studio.mp_rate ${sql([
      { fid: 221, minute: iso(C - DAYMS), day: '2026-11-19', minute_count: 1, day_count: 1 },
      { fid: 222, minute: iso(C), day: '2026-11-20', minute_count: 1, day_count: 1 },
    ])}`;
    await sql`insert into studio.mp_daily ${sql([{ day: '2026-08-22', requests: 5 }, { day: '2026-08-21', requests: 5 }])}`;
    await sql`insert into studio.mp_progress (fid, updated_at) values (231, ${iso(C - 400 * DAYMS)})`;
    await sql`insert into studio.mp_blocks (fid, blocked_fid, at) values (231, 232, ${iso(C - 400 * DAYMS)})`;
    const progressBefore = (await sql`select count(*)::int as n from studio.mp_progress`)[0].n;
    const blocksBefore = (await sql`select count(*)::int as n from studio.mp_blocks`)[0].n;
    check('cleanup: due on the first request, then not for 10 minutes, then due', S.cleanupDue(C) && !S.cleanupDue(C + LIM.cleanupEveryMs - 1) && S.cleanupDue(C + LIM.cleanupEveryMs));
    await S.cleanup(sql, C);
    const has = async (q: PromiseLike<readonly unknown[]>) => (await q).length > 0;
    check('cleanup: an invite past its expiry is deleted', !(await has(sql`select 1 from studio.mp_invites where token = ${tok(1)}`)));
    check('cleanup: …used or not', !(await has(sql`select 1 from studio.mp_invites where token = ${tok(3)}`)));
    check('cleanup: an invite just inside 24 h is kept', await has(sql`select 1 from studio.mp_invites where token = ${tok(2)}`));
    check('cleanup: a challenge expired just over 1 h ago is deleted', !(await has(sql`select 1 from studio.mp_challenges where id = ${U(11)}`)));
    check('cleanup: one expired just under 1 h ago is kept', await has(sql`select 1 from studio.mp_challenges where id = ${U(12)}`));
    check('cleanup: a challenge answered just over 1 h ago is deleted', !(await has(sql`select 1 from studio.mp_challenges where id = ${U(13)}`)));
    check('cleanup: one answered just under 1 h ago is kept', await has(sql`select 1 from studio.mp_challenges where id = ${U(14)}`));
    check('cleanup: a lobby row whose ready time ended just over 1 h ago is deleted', !(await has(sql`select 1 from studio.mp_lobby where fid = 211`)));
    check('cleanup: one just under 1 h ago is kept', await has(sql`select 1 from studio.mp_lobby where fid = 212`));
    const [ab] = await sql`select status, result, ended_at, version from studio.mp_matches where id = ${U(1)}`;
    check('cleanup: a match nobody polled for just over 24 h ends as abandoned, no result', ab.status === 'abandoned' && ab.result.kind === 'cancelled' && ab.result.win === 'D' && ab.result.abandoned === true && ab.version === 2, JSON.stringify(ab));
    const [live] = await sql`select status from studio.mp_matches where id = ${U(2)}`;
    check('cleanup: one polled just under 24 h ago stays live', live.status === 'live');
    const va2 = (await S.onMatch(sql, 201, U(1), C + 1000, null)) as MatchView;
    check('cleanup: the abandoned match reads as ended with no result', va2.phase === 'over' && va2.result?.kind === 'cancelled' && va2.result.why === 'Nobody came back to this match for a day, so it ended with no result.' && va2.result.rematch.msLeft === 0);
    check('cleanup: a match ended just over 30 days ago is deleted, state, replay and names with it', !(await has(sql`select 1 from studio.mp_matches where id = ${U(3)}`)));
    check('cleanup: one ended just under 30 days ago is kept', await has(sql`select 1 from studio.mp_matches where id = ${U(4)}`));
    const [unlinked] = await sql`select match_id from studio.mp_challenges where id = ${U(14)}`;
    check('cleanup: a kept challenge loses its link to a deleted match', unlinked.match_id === null);
    check('cleanup: yesterday\'s rate row is deleted, today\'s kept', !(await has(sql`select 1 from studio.mp_rate where fid = 221`)) && (await has(sql`select 1 from studio.mp_rate where fid = 222`)));
    check('cleanup: a daily total 91 days old is deleted, 90 days old kept', !(await has(sql`select 1 from studio.mp_daily where day = '2026-08-21'`)) && (await has(sql`select 1 from studio.mp_daily where day = '2026-08-22'`)));
    check('cleanup: ladder progress and blocks are never deleted',
      (await sql`select count(*)::int as n from studio.mp_progress`)[0].n === progressBefore && (await sql`select count(*)::int as n from studio.mp_blocks`)[0].n === blocksBefore);
    // At most 500 rows per table per run.
    await sql`insert into studio.mp_invites ${sql(Array.from({ length: LIM.cleanupBatch + 1 }, (_, i) => ({ token: `bulk${String(i).padStart(18, '0')}`, from_fid: 241, from_username: 'ff', created_at: iso(C - 2 * DAYMS), expires_at: iso(C - DAYMS) })))}`;
    const n1 = await S.cleanup(sql, C + 1);
    const left = (await sql`select count(*)::int as n from studio.mp_invites where token like 'bulk%'`)[0].n;
    check(`cleanup: at most ${LIM.cleanupBatch} rows per table per run`, n1.invites === LIM.cleanupBatch && left === 1, `${n1.invites}, ${left} left`);
    await S.cleanup(sql, C + 2);
    check('cleanup: the rest go on the next run', (await sql`select count(*)::int as n from studio.mp_invites where token like 'bulk%'`)[0].n === 0);
  } catch (e) {
    failures.push(`store: ${(e as Error).stack ?? e}`);
  } finally {
    await sql.end();
    await server.stop();
  }
}

if (failures.length) {
  console.error(`minpentai play server tests FAILED (${failures.length}, ${passed} passed):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`minpentai play server tests passed: ${passed} checks`);
