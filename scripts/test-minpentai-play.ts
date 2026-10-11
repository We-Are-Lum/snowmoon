/**
 * Minpentai Play plays out as Design's mockup does. This runs Design's own script, read at test
 * time from docs/design/minpentai-play-prototype.dc.html (the `<script type="text/x-dc">` block,
 * in a node:vm sandbox with the DOM stubbed), beside the port in src/lib/minpentai/play-game/,
 * and asserts identical results:
 *
 *   - the rules: step() on random boards (rocks, squares, towers, gliders of both sides, every
 *     direction, edges, corners, meetings and crossings), apply() and updLS();
 *   - every computer rung (practice's level 0 and the ladder's 1–5) planning on random positions
 *     under each new rule;
 *   - whole matches, practice and every rung, under every new rule, played by a scripted visitor
 *     (gliders in every direction, squares, towers, taking pieces back, refused taps, fast-forward,
 *     resign), compared turn by turn: the board, the placements, last seen, the history, the
 *     result, the ladder progress, and the screen's words and squares;
 *   - free play: placing and erasing for each side, rocks, stepping, playing, the board options,
 *     the link (written and read back), "my last match";
 *   - full screen on a phone and in the Farcaster frame: the upright board and aiming arrows.
 *
 * The match's seed is Design's (the clock, mod 1e6), so both sides draw the same new rule.
 *
 *   npm run test:minpentai-play
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { isDeepStrictEqual } from 'node:util';
import * as G from '../src/lib/minpentai/play-game/game';
import { PlayController, type Env, type PlayView } from '../src/lib/minpentai/play-game/controller';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = readFileSync(path.join(ROOT, 'docs/design/minpentai-play-prototype.dc.html'), 'utf8');
const script = html.split('<script type="text/x-dc" data-dc-script>')[1]?.split('</script>')[0];
if (!script) throw new Error("Design's script block was not found");

let checks = 0;
const failures: string[] = [];
const j = (v: unknown) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
function eq(a: unknown, b: unknown, what: string) {
  checks++;
  a = j(a); b = j(b);
  if (!isDeepStrictEqual(a, b)) {
    const at = firstDiff(a, b, '');
    failures.push(`${what}\n    at ${at.path || '(root)'}\n    design: ${JSON.stringify(at.a)?.slice(0, 300)}\n    port:   ${JSON.stringify(at.b)?.slice(0, 300)}`);
    if (failures.length > 40) report();
  }
}
function firstDiff(a: unknown, b: unknown, p: string): { path: string; a: unknown; b: unknown } {
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])]) {
      const x = (a as Record<string, unknown>)[k], y = (b as Record<string, unknown>)[k];
      if (!isDeepStrictEqual(x, y)) return firstDiff(x, y, p + '.' + k);
    }
  }
  return { path: p, a, b };
}
function report(): never {
  for (const f of failures.slice(0, 40)) console.log('FAIL ' + f);
  console.log(`\n${failures.length} of ${checks} checks failed`);
  process.exit(1);
}

/* ---------- a clock and timers shared by both sides ---------- */
const clock = { now: 1_000_000 };
function timers() {
  type T = { at: number; f: () => void; id: number; every?: number };
  const q: T[] = [];
  let n = 1;
  return {
    set: (f: () => void, ms: number) => { const id = n++; q.push({ at: clock.now + ms, f, id }); return id; },
    every: (f: () => void, ms: number) => { const id = n++; q.push({ at: clock.now + ms, f, id, every: ms }); return id; },
    clear: (id: unknown) => { const k = q.findIndex((t) => t.id === id); if (k >= 0) q.splice(k, 1); },
    /** Fire everything due by clock.now, in time order (intervals re-armed). */
    run() {
      for (let guard = 0; guard < 100000; guard++) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        if (!q.length || q[0].at > clock.now) return;
        const t = q[0];
        if (t.every) t.at += t.every; else q.shift();
        t.f();
      }
    },
  };
}
function advance(ms: number, ...tms: { run(): void }[]) {
  const end = clock.now + ms;
  while (clock.now < end) { clock.now = Math.min(end, clock.now + 10); tms.forEach((t) => t.run()); }
}

/* ---------- Design's script in a sandbox ---------- */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
function design() {
  const tm = timers();
  const store: Record<string, string> = {};
  const copied: string[] = [];
  const ctx = vm.createContext({
    console, JSON, Math, Object, Array, Set, Number, String, encodeURIComponent, decodeURIComponent,
    atob: (s: string) => Buffer.from(s, 'base64').toString('binary'), btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
    Date: { now: () => clock.now },
    setInterval: tm.every, clearInterval: tm.clear, setTimeout: tm.set, clearTimeout: tm.clear,
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) },
    location: { hash: '', href: 'https://snowmoon.party/minpentai' },
    navigator: { clipboard: { writeText: (t: string) => copied.push(t) } },
    window: { innerWidth: 1200, innerHeight: 900, addEventListener: () => {}, removeEventListener: () => {} },
  });
  vm.runInContext(
    `class DCLogic { constructor(props) { this.props = props || {}; } setState(p) { Object.assign(this.state, typeof p === 'function' ? p(this.state) : p); } }
     ${script}
     globalThis.__D = { W, H, MAXS, ROCKS, RULES, RUNGS, COST, K, XY, rng, world, clone, towers, lit, empty, step, botPlan, apply, updLS, board, Component };`,
    ctx,
  );
  const D = (ctx as Any).__D;
  const dc = new D.Component({});
  dc.componentDidMount();
  return { D, dc, tm, copied };
}
function port() {
  const tm = timers();
  const copied: string[] = [];
  const env: Env = { now: () => clock.now, setInterval: tm.every, clearInterval: tm.clear, setTimeout: tm.set, clearTimeout: tm.clear, copy: (t) => copied.push(t), href: () => 'https://snowmoon.party/minpentai' };
  const pc = new PlayController(env);
  return { pc, tm, copied };
}

/* ---------- 1. the rules ---------- */
{
  const { D } = design();
  eq(D.ROCKS, G.ROCKS, 'rocks'); eq(D.RULES, G.RULES, 'the four new rules'); eq(D.RUNGS, G.RUNGS, 'the rungs'); eq(D.COST, G.COST, 'costs');
  eq([D.W, D.H, D.MAXS], [G.W, G.H, G.MAXS], 'board size and length');
  eq(D.world(), G.world(), 'the practice board'); eq(D.world(true), G.world(true), 'an empty board');
  const r = G.rng(99);
  const dirs = G.D8;
  for (let n = 0; n < 400; n++) {
    const w = G.world(n % 3 === 0);
    for (let i = 0; i < 25; i++) {
      const k = Math.floor(r() * G.W * G.H), [x, y] = G.XY(k), o: G.Side = r() < 0.5 ? 'C' : 'A', z = r();
      if (w.rock[k] || w.sq[k] || w.tw[k]) continue;
      if (z < 0.15) w.rock[k] = 1;
      else if (z < 0.35) w.sq[k] = { o, hp: r() < 0.5 ? 2 : 1 };
      else if (z < 0.5) w.tw[k] = o;
      else { const [dx, dy] = dirs[Math.floor(r() * 8)]; w.gl.push({ id: w.nid++, o, x, y, dx, dy }); }
    }
    const a = D.clone(JSON.parse(JSON.stringify(w))), b = G.clone(w);
    for (let s = 0; s < 40; s++) { D.step(a); G.step(b); eq(a, b, `step() on random board ${n}, step ${s + 1}`); }
  }
  // Planning, every level, every rule, random fogged positions.
  for (let n = 0; n < 240; n++) {
    const rule = G.RULE_IDS[n % 4], lvl = n % 6;
    const w = G.world();
    const rr = G.rng(n + 7);
    for (let i = 0; i < 10; i++) {
      const k = Math.floor(rr() * G.W * G.H), [x, y] = G.XY(k), o: G.Side = rr() < 0.5 ? 'C' : 'A';
      if (!G.empty(w, k)) continue;
      if (rr() < 0.4) w.sq[k] = { o, hp: 2 }; else { const [dx, dy] = G.D4[Math.floor(rr() * 4)]; w.gl.push({ id: w.nid++, o, x, y, dx, dy }); }
    }
    w.step = (n * 12) % 84;
    const mk = (rand: () => number) => ({ w, lvl, rule, R: rule === 'sight2' ? 2 : 3, every: rule === 'every8' ? 8 : 12, cost: rule === 'cost3' ? 3 : 4, rng: rand, snap: { C: G.towers(w, 'C'), A: G.towers(w, 'A') }, lsA: { [G.K(1, 2)]: 0, [G.K(1, 7)]: 0 } as Record<number, number> });
    const a = D.botPlan({ ...mk(D.rng(n)), w: JSON.parse(JSON.stringify(w)) });
    const b = G.botPlan({ ...mk(G.rng(n)), w: G.clone(w) });
    eq(a, b, `botPlan level ${lvl}, rule ${rule}, position ${n}`);
  }
}

/* ---------- 2. whole matches ---------- */
function compareView(dv: Any, pv: PlayView, what: string) {
  const pick = (v: Any) => ({
    strip: v.strip, msg: v.msg, ruleLine: v.ruleLine, ptsTxt: v.ptsTxt, ptsShort: v.ptsShort, runHead: v.runHead, runMsg: v.runMsg, ffLabel: v.ffLabel, ffShort: v.ffShort,
    hTitle: (v.hTitle ?? '') + (v.hSample ?? ''), hRight: v.hRight, ruleText: v.ruleText, stDesc: v.stDesc, stNote: v.stNote,
    resB: v.resB, resWhy: v.resWhy, resNote: v.resNote, resCard: !!v.resCard, resCardN: v.resCardN, resCardT: v.resCardT, resCardD: v.resCardD,
    resBtns: v.resBtns?.map((b: Any) => b.label), leaveLabel: v.leaveLabel, resignText: v.resignText,
    pAct: v.pAct, pRun: v.pRun, pResult: v.pResult, pStart: v.pStart, pReplay: v.pReplay, pFree: v.pFree, port: v.port, fsBtn: v.fsBtn,
    pieces: v.pieces?.map((p: Any) => [p.label, p.short]), arrows: v.arrows?.map((a: Any) => a.t),
    cells: v.bd.cells.map((c: Any) => [c.bg, c.bd, c.sh, c.fg, c.t, c.fs]), cols: v.bd.cols, cs: v.bd.cs,
    rungs: v.rungs?.map((r: Any) => [r.name, r.desc, r.icon, r.r1, r.r2]), playRungLabel: v.playRungLabel, ladTag: v.ladTag,
    rpEnd: v.rpEnd, rpBtns: v.rpBtns?.map((b: Any) => b.label),
    fpBtns: v.fpBtns?.map((b: Any) => b.label), fpBtnsFS: v.fpBtnsFS?.map((b: Any) => b.label), fpSides: v.fpSides?.map((b: Any) => b.label), fpPieces: v.fpPieces?.map((b: Any) => b.label),
    fpStarts: v.fpStarts?.map((b: Any) => b.label), fpRules: v.fpRules?.map((b: Any) => [b.label, b.v]), fpSee: v.fpSee?.map((b: Any) => b.label),
    toast: v.toast,
  });
  eq(pick(dv), pick(pv), what);
}
function compareMatch(dc: Any, pc: PlayController, what: string) {
  const dm = dc.m, pm = pc.m!;
  eq({ w: dm.w, pend: dm.pend, snap: dm.snap, lsC: dm.lsC, lsA: dm.lsA, phase: dm.phase, rule: dm.rule, hist: dm.hist.length, res: dm.res, ended: dm.ended },
    { w: pm.w, pend: pm.pend, snap: pm.snap, lsC: pm.lsC, lsA: pm.lsA, phase: pm.phase, rule: pm.rule, hist: pm.hist.length, res: pm.res, ended: pm.ended }, what);
}
const SIGNED = { signed: true, dev: 'phone' as const };
function both(dev: 'phone' | 'frame' | 'desk' = 'phone') {
  const d = design(), p = port();
  d.dc.setState({ ...SIGNED, dev }); p.pc.setState({ ...SIGNED, dev });
  return { d, p };
}
/** A visitor's move in both: tap a square (a cell, by board x, y), or a control. */
function tapCell(d: Any, p: ReturnType<typeof port>, x: number, y: number) {
  const dv = d.dc.renderVals(), pv = p.pc.view();
  const di = dv.bd.cells.findIndex((_: Any, i: number) => cellXY(dv.bd, i, d.dc.state).x === x && cellXY(dv.bd, i, d.dc.state).y === y);
  const pc = pv.bd.cells.find((c) => c.x === x && c.y === y)!;
  dv.bd.cells[di].click(); pv.bd.tap(pc);
}
function cellXY(bd: Any, i: number, st: Any) {
  const portrait = bd.cols === G.H && st.fs;
  if (portrait) { const r = Math.floor(i / G.H), col = i % G.H; return { x: G.W - 1 - r, y: col }; }
  return { x: i % G.W, y: Math.floor(i / G.W) };
}

let matchesPlayed = 0;
for (const [mode, rung] of [['practice', undefined], ['ladder', 1], ['ladder', 2], ['ladder', 3], ['ladder', 4], ['ladder', 5]] as const) {
  for (let s = 0; s < 8; s++) {
    clock.now = 1_000_000 + s * 7919 + (rung ?? 0) * 104729;
    const { d, p } = both(s % 3 === 0 ? 'desk' : 'phone');
    const prog = { opened: 5, rec: {} };
    d.dc.setState({ prog }); p.pc.setState({ prog: JSON.parse(JSON.stringify(prog)) });
    const tms = [d.tm, p.tm];
    d.dc.openStart(mode, rung); p.pc.openStart(mode, rung);
    compareView(d.dc.renderVals(), p.pc.view(), `${mode} ${rung ?? ''} seed ${s}: the start screen`);
    d.dc.begin(); p.pc.begin();
    const rr = G.rng(s + 31);
    for (let turn = 0; turn < 20 && d.dc.m.phase !== 'over'; turn++) {
      compareMatch(d.dc, p.pc, `${mode} ${rung ?? ''} seed ${s} turn ${turn}: the turn begins`);
      compareView(d.dc.renderVals(), p.pc.view(), `${mode} ${rung ?? ''} seed ${s} turn ${turn}: the screen at the turn`);
      // The visitor: a few taps in and out of the lit area with each piece and direction.
      for (let a = 0; a < 6; a++) {
        const pick = rr();
        if (pick < 0.3) { const id = (['g', 's', 't'] as const)[Math.floor(rr() * 3)]; d.dc.setState({ piece: id }); p.pc.setState({ piece: id }); }
        else if (pick < 0.45) { const dv = d.dc.renderVals(), pv = p.pc.view(); const i = Math.floor(rr() * dv.arrows.length); dv.arrows[i].click(); pv.arrows[i].click(); }
        else { const x = Math.floor(rr() * 6), y = Math.floor(rr() * G.H); tapCell(d, p, x, y); }
        compareView(d.dc.renderVals(), p.pc.view(), `${mode} ${rung ?? ''} seed ${s} turn ${turn} action ${a}`);
      }
      if (s === 5 && turn === 3) {
        d.dc.setState({ sheet: 'resign' }); p.pc.setState({ sheet: 'resign' });
        d.dc.resign(); p.pc.resign();
        break;
      }
      const dv = d.dc.renderVals(), pv = p.pc.view();
      dv.endTurn(); pv.endTurn!();
      if (turn % 3 === 1) { const a = d.dc.renderVals(), b = p.pc.view(); a.ffClick(); b.ffClick!(); }
      advance(170 * 3, ...tms);
      compareView(d.dc.renderVals(), p.pc.view(), `${mode} ${rung ?? ''} seed ${s} turn ${turn}: during the run`);
      // A tap during the run: the toast.
      tapCell(d, p, 2, 2);
      compareView(d.dc.renderVals(), p.pc.view(), `${mode} ${rung ?? ''} seed ${s} turn ${turn}: tapping during the run`);
      for (let g = 0; g < 400 && d.dc.m.phase === 'run'; g++) advance(170, ...tms);
      eq(p.pc.m!.phase, d.dc.m.phase, `${mode} ${rung ?? ''} seed ${s} turn ${turn}: the run ends in step`);
    }
    compareMatch(d.dc, p.pc, `${mode} ${rung ?? ''} seed ${s}: the end`);
    eq(d.dc.state.scr, p.pc.state.scr, `${mode} ${rung ?? ''} seed ${s}: the screen after the end`);
    eq(d.dc.state.prog, p.pc.state.prog, `${mode} ${rung ?? ''} seed ${s}: ladder progress`);
    compareView(d.dc.renderVals(), p.pc.view(), `${mode} ${rung ?? ''} seed ${s}: the result`);
    d.dc.openReplay(); p.pc.openReplay();
    advance(110 * 7, ...tms);
    compareView(d.dc.renderVals(), p.pc.view(), `${mode} ${rung ?? ''} seed ${s}: watching it again`);
    matchesPlayed++;
  }
}

/* ---------- 3. the ladder screen and its progress ---------- */
{
  const { d, p } = both();
  for (const prog of [{ opened: 1, rec: {} }, { opened: 3, rec: { 1: { tries: 1, won: 38 }, 2: { tries: 3, won: 61 }, 3: { tries: 2 } } }, { opened: 5, rec: { 5: { tries: 4, won: 90 } } }]) {
    d.dc.setState({ prog: JSON.parse(JSON.stringify(prog)), scr: 'ladder', rungSel: null }); p.pc.setState({ prog: JSON.parse(JSON.stringify(prog)), scr: 'ladder', rungSel: null });
    compareView(d.dc.renderVals(), p.pc.view(), `the ladder at ${JSON.stringify(prog)}`);
    for (let i = 0; i < 5; i++) { d.dc.renderVals().rungs[i].click(); p.pc.view().rungs[i].click(); compareView(d.dc.renderVals(), p.pc.view(), `the ladder, rung row ${i} tapped`); }
  }
}

/* ---------- 4. free play ---------- */
{
  clock.now = 5_000_000;
  for (const dev of ['phone', 'frame', 'desk'] as const) {
    const { d, p } = both(dev);
    const tms = [d.tm, p.tm];
    d.dc.openFree(); p.pc.openFree();
    compareView(d.dc.renderVals(), p.pc.view(), `free play opens (${dev})`);
    const rr = G.rng(dev.length);
    for (let a = 0; a < 160; a++) {
      const z = rr(), dv = d.dc.renderVals(), pv = p.pc.view();
      if (z < 0.12) { const i = Math.floor(rr() * 3); dv.fpSides[i].click(); pv.fpSides![i].click(); }
      else if (z < 0.24) { const i = Math.floor(rr() * 4); dv.fpPieces[i].click(); pv.fpPieces![i].click(); }
      else if (z < 0.32) { const i = Math.floor(rr() * dv.arrows.length); dv.arrows[i].click(); pv.arrows[i].click(); }
      else if (z < 0.38) { const i = Math.floor(rr() * 4); dv.fpBtns[i].click(); pv.fpBtns![i].click(); advance(170 * 4, ...tms); }
      else if (z < 0.42) { dv.hRightClick(); pv.hRightClick(); const a2 = d.dc.renderVals(), b2 = p.pc.view(); const i = Math.floor(rr() * 2); a2.fpRules[i].click(); b2.fpRules![i].click(); const k = Math.floor(rr() * 3); d.dc.renderVals().fpSee[k].click(); p.pc.view().fpSee![k].click(); d.dc.setState({ sheet: null }); p.pc.setState({ sheet: null }); }
      else if (z < 0.44) { const i = Math.floor(rr() * 2); dv.fpStarts[i].click(); pv.fpStarts![i].click(); }
      else if (z < 0.47) { d.dc.setState({ fs: !d.dc.state.fs }); p.pc.setState({ fs: !p.pc.state.fs }); }
      else { const x = Math.floor(rr() * G.W), y = Math.floor(rr() * G.H); tapCell(d, p, x, y); }
      compareView(d.dc.renderVals(), p.pc.view(), `free play (${dev}) action ${a}`);
      eq(d.dc.fp.w0, p.pc.fp!.w0, `free play (${dev}) action ${a}: the board at step 0`);
    }
    d.dc.copyLink(); p.pc.copyLink();
    eq(d.copied, p.copied, `free play (${dev}): the link`);
    // Read the link back in both.
    const hash = '#' + p.copied[0].split('#')[1];
    const d2 = design(), p2 = port();
    d2.dc.setState(SIGNED); p2.pc.setState(SIGNED);
    d2.dc.loadFree(JSON.parse(Buffer.from(decodeURIComponent(hash.slice(4)), 'base64').toString('binary'))); d2.dc.setState({ scr: 'free' });
    p2.pc.mount(hash);
    compareView(d2.dc.renderVals(), p2.pc.view(), `free play (${dev}): the link opens the same board`);
    eq(d2.dc.fp.w0, p2.pc.fp!.w0, `free play (${dev}): the link's board`);
  }
}

/* ---------- 5. full screen: the upright board and aiming ---------- */
for (const dev of ['phone', 'frame'] as const) {
  clock.now = 7_000_000;
  const { d, p } = both(dev);
  d.dc.openStart('practice'); p.pc.openStart('practice');
  d.dc.begin(); p.pc.begin();
  d.dc.setState({ fs: true }); p.pc.setState({ fs: true });
  compareView(d.dc.renderVals(), p.pc.view(), `full screen (${dev}): the upright board`);
  d.dc.setState({ piece: 'g' }); p.pc.setState({ piece: 'g' });
  tapCell(d, p, 3, 2);
  compareView(d.dc.renderVals(), p.pc.view(), `full screen (${dev}): a new glider shows four arrows`);
  const di = d.dc.renderVals().bd.cells.findIndex((c: Any) => c.bd === '1px dashed #E7E4DD');
  const pcell = p.pc.view().bd.cells.find((c) => c.aim)!;
  d.dc.renderVals().bd.cells[di].click(); p.pc.view().bd.tap(pcell);
  compareView(d.dc.renderVals(), p.pc.view(), `full screen (${dev}): an arrow aims the glider`);
  compareMatch(d.dc, p.pc, `full screen (${dev}): the placement`);
}

if (failures.length) report();
console.log(`play: ${checks} checks, all identical to Design's mockup (${matchesPlayed} matches, practice and every rung, every new rule)`);
