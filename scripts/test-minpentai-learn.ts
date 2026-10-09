/**
 * Learn Minpentai plays out as Design's game does. This runs Design's own script, read at test
 * time from docs/design/minpentai-intro-v3.dc.html (the `<script type="text/x-dc">` block, in a
 * node:vm sandbox with the DOM and three.js stubbed), beside the port in
 * src/lib/minpentai/learn-game/, and asserts identical states:
 *
 *   - constants: towers, strikes, segments, shots, the rock field, walls and crews, lessons, costs;
 *   - the broadcast: the sim (drones, debris, walls, towers, flashes, emitters) at every frame,
 *     the HUD and the camera's shot, across all eight screens, pause, back, looping, the hold on
 *     screen 8, and reduced motion;
 *   - every lesson's start state, its demo (the big button), the visitor's own way through, the
 *     failures, the toasts, stepping back and forward, reset;
 *   - Under the hood (the cell rule) forward and back;
 *   - the practice match under each of the four new rules (fixed seeds), played to its end by a
 *     scripted visitor (gliders, diagonals, squares, towers, taking pieces back, refused taps),
 *     then PLAY AGAIN.
 * The screen's words are compared too; the only differences allowed are the deliberate ones
 * listed in DELIBERATE below (and docs/design/minpentai-learn-port.md).
 *
 *   npm run test:minpentai-learn
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { isDeepStrictEqual } from 'node:util';
import * as B from '../src/lib/minpentai/learn-game/broadcast';
import * as P from '../src/lib/minpentai/learn-game/pieces';
import * as C from '../src/lib/minpentai/learn-game/cells';
import { LS } from '../src/lib/minpentai/learn-game/lessons';
import { LearnController, type Env, type View, isCells } from '../src/lib/minpentai/learn-game/controller';
import { LEARN_TEXT as T } from '../src/lib/minpentai/learn-text';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = readFileSync(path.join(ROOT, 'docs/design/minpentai-intro-v3.dc.html'), 'utf8');
const script = html.split('<script type="text/x-dc" data-dc-script>')[1]?.split('</script>')[0];
if (!script) throw new Error("Design's script block was not found");

let checks = 0;
const failures: string[] = [];
function eq(a: unknown, b: unknown, what: string) {
  checks++;
  // Design's values come from another realm (node:vm): compare them as plain JSON.
  const j = (v: unknown) => (v === undefined ? v : JSON.parse(JSON.stringify(v, (_k, x) => (ArrayBuffer.isView(x) ? Array.from(x as Uint8Array) : x))));
  a = j(a); b = j(b);
  if (!isDeepStrictEqual(a, b)) {
    const at = firstDiff(a, b, '');
    failures.push(`${what}\n    at ${at.path || '(root)'}\n    design: ${JSON.stringify(at.a)?.slice(0, 300)}\n    port:   ${JSON.stringify(at.b)?.slice(0, 300)}`);
    if (failures.length > 40) { report(); }
  }
}
function firstDiff(a: unknown, b: unknown, path: string): { path: string; a: unknown; b: unknown } {
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) {
      const x = (a as Record<string, unknown>)[k], y = (b as Record<string, unknown>)[k];
      if (!isDeepStrictEqual(x, y)) return firstDiff(x, y, path + '.' + k);
    }
  }
  return { path, a, b };
}
function report(): never {
  for (const f of failures.slice(0, 40)) console.log('FAIL ' + f);
  console.log(`\n${failures.length} of ${checks} checks failed`);
  process.exit(1);
}

/* ---------- a clock and timers shared by both sides ---------- */
const clock = { now: 1000 };
function timers() {
  const q: { at: number; f: () => void; id: number }[] = [];
  let n = 1;
  return {
    set: (f: () => void, ms: number) => { const id = n++; q.push({ at: clock.now + ms, f, id }); return id; },
    clear: (id: unknown) => { const k = q.findIndex((t) => t.id === id); if (k >= 0) q.splice(k, 1); },
    run: () => { q.sort((a, b) => a.at - b.at); while (q.length && q[0].at <= clock.now) q.shift()!.f(); },
  };
}

/* ---------- Design's script in a sandbox ---------- */
function design(seed: number) {
  const tm = timers();
  const rand = B.rng(seed);
  const ctx = vm.createContext({
    console,
    performance: { now: () => clock.now },
    window: { matchMedia: () => ({ matches: false }), devicePixelRatio: 1 },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setInterval: () => 0, clearInterval: () => {},
    setTimeout: tm.set, clearTimeout: tm.clear,
    React: { createRef: () => ({ current: null }) },
    __rand: rand,
  });
  vm.runInContext(
    `Math.random = __rand;
     class DCLogic { constructor(props) { this.props = props || {}; } setState(p) { Object.assign(this.state, typeof p === 'function' ? p(this.state) : p); } }
     ${script}
     globalThis.__D = { W, H, DT, COL, NAME, TOWERS, STRIKES, OUT_AT, REACT, EVENTS, SEG, SHOTS, SCREENS, PW, PH, COST, BASE, pNew, pClone, towers, near, pStep, DIRS, DIAG, RULES, LS, REASONS, RULE, BW, BH, bApply, bStep, bBack, bStamp, live, GL, rng, makeWorld, WORLD, newSim, stepSim, towerUp, slowAt, strikePos, Component, SEGS_LEN, SYM, GLIDER, SHIP };`,
    ctx,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const D = (ctx as any).__D;
  const dc = new D.Component({});
  dc.S = D.newSim(); dc.acc = 0; dc.last = clock.now;
  dc.R = { follow: 0, lastShot: -1 }; // what shot() and seekTo() touch; draw() is replaced below
  // Design's draw(): the renderer is stubbed; the camera's cut-or-ease logic is kept.
  dc.draw = function (this: typeof dc) { const sh = this.shot(this.S.t); if (sh.si !== this.R.lastShot) { this.R.lastShot = sh.si; this.R.follow = 0; } this.camLabel = sh.label; this.lastShotOut = sh; };
  dc.drawCams = () => {};
  return { D, dc, tm };
}
function port(seed: number) {
  const tm = timers();
  const rand = B.rng(seed);
  const env: Env = { now: () => clock.now, random: rand, setTimeout: tm.set, clearTimeout: tm.clear };
  const mc = new LearnController(env);
  mc.last = clock.now;
  return { mc, tm };
}

/* ---------- 1. constants and the world ---------- */
{
  const { D } = design(1);
  const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
  eq(plain(D.TOWERS), B.TOWERS, 'TOWERS');
  eq(plain(D.STRIKES), B.STRIKES, 'STRIKES (with launch times and distances)');
  eq(plain(D.OUT_AT), B.OUT_AT, 'OUT_AT');
  eq(plain(D.REACT), B.REACT, 'REACT');
  eq(plain(D.EVENTS), B.EVENTS.map((e) => e.filter((x) => x !== undefined)), 'EVENTS (times, commentary, banners, colours)');
  eq(plain(D.SEG), B.SEG, 'SEG');
  eq(D.SEGS_LEN, B.SEGS_LEN, 'SEGS_LEN');
  eq(plain(D.SHOTS), plain(B.SHOTS), 'SHOTS (times, kinds, parameters, labels)');
  eq([D.W, D.H, D.DT, plain(D.COL), plain(D.NAME), plain(D.SYM), plain(D.GLIDER), plain(D.SHIP)], [B.W, B.H, B.DT, B.COL, B.NAME, B.SYM, B.GLIDER, B.SHIP], 'field, colours, names, shapes');
  eq(Array.from(D.WORLD.rock as Float32Array), Array.from(B.WORLD.rock), 'the rock field (rng 7)');
  eq(plain(D.WORLD.walls), B.WORLD.walls, 'the walls (rng 11)');
  eq(plain(D.WORLD.crews), B.WORLD.crews, 'the crews');
  eq([D.PW, D.PH, plain(D.COST), plain(D.BASE())], [P.PW, P.PH, P.COST, P.BASE()], 'board, costs, BASE');
  eq(plain(D.DIRS), P.DIRS, 'DIRS');
  eq(plain(D.DIAG), P.DIAG, 'DIAG');
  eq(plain(D.RULES).map((r: { t: string }) => { const { t, ...rest } = r; return [t, rest]; }), P.RULES.map((r) => { const { id, ...rest } = r; return [T.practice.rules[id], rest]; }), 'RULES (words and effects)');
  eq(plain(D.REASONS), T.reasons, 'REASONS');
  eq(plain(D.RULE), T.rule.rows, 'the rule card');
  // Each lesson's parameters and start position.
  for (let li = 0; li < D.LS.length; li++) {
    const d = D.LS[li], m = LS[li];
    const keys = ['id', 'read', 'hood', 'optional', 'reasons', 'place', 'hints', 'zone', 'budget', 'fog', 'demo', 'demoCells', 'demoTool', 'speed', 'zoom', 'view', 'ca', 'rule', 'practice'];
    const pick = (o: Record<string, unknown>) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, plain(o[k])]));
    eq(pick(d), pick(m as unknown as Record<string, unknown>), `LS[${li}] (${d.id}) parameters`);
    const a = d.build(), b = m.build();
    if (d.ca) eq(Array.from(a.cells as Uint8Array), Array.from((b as C.CBoard).cells), `LS[${li}] start cells`);
    else eq(plain(a), plain(b), `LS[${li}] (${d.id}) start state`);
  }
  // The cell rule on random boards, both phases, forward and back.
  const r = B.rng(5);
  for (let n = 0; n < 20; n++) {
    let a = D.bEmpty ? D.bEmpty() : { cells: new Uint8Array(48 * 32), rocks: new Uint8Array(48 * 32), turn: 0 };
    a = { ...a, cells: new Uint8Array(48 * 32).map(() => (r() < .3 ? 1 : 0)), rocks: new Uint8Array(48 * 32).map(() => (r() < .02 ? 1 : 0)), turn: n };
    const b = { ...a, cells: new Uint8Array(a.cells), rocks: new Uint8Array(a.rocks) };
    eq(Array.from(D.bStep(a).cells as Uint8Array), Array.from(C.bStep(b).cells), `bStep on a random board (${n})`);
    eq(Array.from(D.bBack(a).cells as Uint8Array), Array.from(C.bBack(b).cells), `bBack on a random board (${n})`);
  }
  // pStep on random positions: every rule (edges, towers, squares, rocks, meetings, diagonals).
  for (let n = 0; n < 300; n++) {
    const list: P.NewPiece[] = [];
    const used = new Set<string>();
    const k = 3 + Math.floor(r() * 14);
    for (let q = 0; q < k; q++) {
      const x = Math.floor(r() * 15), y = Math.floor(r() * 10);
      if (used.has(x + ',' + y)) continue;
      used.add(x + ',' + y);
      const kind = (['tower', 'glider', 'glider', 'square', 'rock'] as const)[Math.floor(r() * 5)];
      const p = Math.floor(r() * 2);
      const dirs = [...P.DIRS, ...P.DIAG];
      const [dx, dy] = dirs[Math.floor(r() * dirs.length)];
      list.push(kind === 'glider' ? P.G_(x, y, p, dx, dy) : kind === 'rock' ? P.P_('rock', x, y) : kind === 'tower' ? P.T_(x, y, p) : P.Q_(x, y, p));
    }
    let a = D.pNew(JSON.parse(JSON.stringify(list))), b = P.pNew(list);
    for (let s = 0; s < 40; s++) { a = D.pStep(a); b = P.pStep(b); eq(plain(a), plain(b), `pStep, random position ${n}, step ${s + 1}`); }
  }
}

/* ---------- comparing the two sides ---------- */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const plain = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (ArrayBuffer.isView(x) ? Array.from(x as Uint8Array) : x)));
function simOf(S: Any) {
  return plain({ t: S.t, drones: S.drones, nid: S.nid, debris: S.debris, flashes: S.flashes, wallAlive: S.wallAlive, towerDead: S.towerDead, emit: S.emit, strikeDone: S.strikeDone });
}
const STATE_KEYS = ['dir', 'mode', 'li', 'lphase', 'lresult', 'cellsOn', 'pick', 'spent', 'lfail', 'lt', 'lplaying', 'lmet', 'ruleOpen', 'i', 'paused', 'src', 'toast'] as const;
function lOf(L: Any, rule?: string) {
  if (!L) return null;
  const o: Any = { s: L.s, start: L.start, playing: L.playing, acc: L.acc, met: L.met, failed: L.failed, demo: L.demo, flash: L.flash };
  if (!L.def.ca) Object.assign(o, { hist: L.hist.length, histTop: L.hist[L.hist.length - 1] ?? null, dir: L.dir, tool: L.tool, spent: L.spent });
  if (L.def.practice) Object.assign(o, { rule: rule ?? L.rule?.t, cost: L.cost, fogR: L.fogR, every: L.every, limit: L.limit, phase: L.phase, result: L.result ?? null });
  return plain(o);
}

/* The deliberate differences in the words (docs/design/minpentai-learn-port.md, "Wording"). */
const ID_FIX: Record<string, string> = {
  'c12-b143': 'c12-b149', 'c4-b79': 'c4-b78', c7: 'c7-b86', 'c7-b13': 'c7-b13–b14', 'c4-b78–b79': 'c4-b58 · c4-b78',
  'src/lib/minpentai/match.ts': 'invented',
};
const BOOK_NEW_RULE = ['In the book, "every game there\'s always some kind of new rule"', 'c4-b84'];
const RECOVERED = ["The sandbox runs the rule recovered from the book's animated board", 'c4-b5 · c4-b7'];
const INVENTED_LINE = ['The rules of the Learn game (towers, gliders, squares, rocks, turns to act, the new rules) are invented for this edition', 'invented'];
const DELIBERATE = {
  tags(where: string, tags: string[]): string[] {
    if (where === 'hood') return tags; // the book's rule: no "invented" tag
    if (where === 'practice') return ['RULES INVENTED FOR THIS EDITION', 'DRAFT WORDING']; // Design: none (study §13.4)
    let out = tags.map((t) => (t === 'GAME SIMPLIFIED' ? 'RULES INVENTED FOR THIS EDITION' : t));
    if (where === 'watch 7' || where === 'watch 8') out = out.flatMap((t) => (t === 'DRAFT WORDING' ? ['BROADCAST IMAGINED', t] : [t])); // study §13.3
    if (!out.includes('RULES INVENTED FOR THIS EDITION')) out = out.flatMap((t) => (t === 'DRAFT WORDING' ? ['RULES INVENTED FOR THIS EDITION', t] : [t]));
    return out;
  },
  sources(where: string, src: string[][]): string[][] {
    const out = src.map(([a, b]) => [a, ID_FIX[b] ?? b]);
    if (where === 'watch 1') out.push(INVENTED_LINE);
    if (where === 'goal' || where === 'rule') out.push(BOOK_NEW_RULE, RECOVERED);
    if (where === 'practice') out.push(RECOVERED);
    return out;
  },
};

function viewOf(dc: Any) {
  const v = dc.renderVals();
  const dotKind = (c: string, th: Any) => (c === th.muted ? 'past' : c === th.ink ? 'current' : 'future');
  return {
    title: v.scr.title, text: v.scr.text, caption: v.hasCaption ? v.scr.caption : null, button: v.scr.button, status: v.status,
    stepOf: v.stepOf, hasTools: v.hasTools, playLabel: v.playLabel, lplaying: v.lplaying, hasReasons: v.hasReasons, hasRule: v.hasRule,
    ruleOpen: v.hasRule ? v.ruleOpen : false, ruleLabel: v.hasRule ? v.ruleLabel : '', hasCellsBtn: v.hasCellsBtn, cellsOn: v.hasCellsBtn ? v.cellsOn : false,
    hasPalette: v.hasPalette, palette: v.hasPalette ? v.palette.map((p: Any) => ({ t: p.t, on: p.on })) : [],
    hasDirs: v.hasPalette && v.hasDirs, dirs: v.hasPalette && v.hasDirs ? v.dirs.map((r: Any) => ({ t: r.t, label: r.label, on: r.on })) : [],
    hasHood: v.hasHood, backHidden: v.backHidden === 'true', dots: v.dots.map((d: Any) => dotKind(d.c, v.th)), showCams: v.showCams,
    hasReact: v.hasReact, stageLabel: v.stageLabel, srcLabel: v.srcLabel, commentShown: v.isLearn ? false : v.commentDisp !== 'none',
    tags: v.tags.map((t: Any) => t.t), sources: v.scr.sources.map((s: Any) => [s.t, s.id]),
  };
}
function myView(v: View, where: string) {
  return {
    title: v.title, text: v.text, caption: v.caption, button: v.button, status: v.status, stepOf: v.stepOf, hasTools: v.hasTools,
    playLabel: v.playLabel, lplaying: v.lplaying, hasReasons: v.hasReasons, hasRule: v.hasRule, ruleOpen: v.hasRule ? v.ruleOpen : false, ruleLabel: v.hasRule ? v.ruleLabel : '',
    hasCellsBtn: v.hasCellsBtn, cellsOn: v.hasCellsBtn ? v.cellsOn : false, hasPalette: v.hasPalette,
    palette: v.hasPalette ? v.palette.map((p) => ({ t: p.t, on: p.on })) : [], hasDirs: v.hasPalette && v.hasDirs,
    dirs: v.hasPalette && v.hasDirs ? v.dirs.map((r) => ({ t: r.t, label: r.label, on: r.on })) : [], hasHood: v.hasHood, backHidden: v.backHidden,
    dots: v.dots, showCams: v.showCams, hasReact: v.hasReact, stageLabel: v.stageLabel, srcLabel: v.srcLabel, commentShown: v.commentShown,
    tags: v.tags.map((k) => T.tags[k]), sources: v.sources, where,
  };
}
function compareView(dc: Any, mc: LearnController, what: string) {
  const a = viewOf(dc);
  const where = mc.state.mode === 'watch' ? `watch ${mc.state.i + 1}` : LS[mc.state.li].id;
  const b = myView(mc.view(), where);
  const sources = DELIBERATE.sources(where, a.sources);
  const want = { ...a, tags: DELIBERATE.tags(where, a.tags), sources, srcLabel: a.srcLabel.replace(/\(\d+\)/, `(${sources.length})`), where };
  eq(want, b, `${what}: the screen (${where})`);
}
function compare(dc: Any, mc: LearnController, what: string, ruleWords?: string) {
  eq(plain(Object.fromEntries(STATE_KEYS.map((k) => [k, dc.state[k]]))), plain(Object.fromEntries(STATE_KEYS.map((k) => [k, mc.state[k]]))), `${what}: state`);
  const myRule = mc.L && !isCells(mc.L) && mc.L.rule ? T.practice.rules[mc.L.rule.id] : undefined;
  eq(lOf(dc.L, ruleWords), lOf(mc.L, myRule), `${what}: the lesson board`);
}

/* ---------- 2. the broadcast, frame by frame ---------- */
function frame(d: Any, m: ReturnType<typeof port>, ms = 1000 / 60) {
  clock.now += ms;
  d.dc.tick();
  m.mc.tick(clock.now);
  d.tm.run(); m.tm.run();
}
{
  clock.now = 1000;
  const d = design(1), m = port(1);
  const cmpWatch = (what: string) => {
    eq(simOf(d.dc.S), simOf(m.mc.S), `${what}: the sim`);
    const hd = plain(d.dc.state.hud), hm = plain(m.mc.state.hud);
    eq(hd, hm, `${what}: the HUD`);
    const sd = d.dc.lastShotOut, sm = B.shotAt(m.mc.S.t, m.mc.state.reduced, m.mc.S, { ...m.mc.cam });
    if (sd) eq(plain({ si: sd.si, pos: sd.pos, look: sd.look, fov: sd.fov, label: sd.label }), plain({ si: sm.si, pos: sm.pos, look: sm.look, fov: sm.fov, label: sm.label }), `${what}: the shot`);
    eq(d.dc.R.follow, m.mc.cam.follow, `${what}: the followed drone`);
    compare(d.dc, m.mc, what);
    compareView(d.dc, m.mc, what);
  };
  const run = (frames: number, label: string, ms?: number) => { for (let f = 0; f < frames; f++) { frame(d, m, ms); if (f % 7 === 0) cmpWatch(`${label}, frame ${f}`); } cmpWatch(`${label}, end`); };
  for (let i = 0; i < 8; i++) {
    run(i === 0 ? 600 : 300, `watch ${i + 1}`);
    if (i === 1) { run(700, 'watch 2, looping past its end'); }
    if (i === 4) {
      d.dc.renderVals().togglePause(); m.mc.togglePause(); run(40, 'watch 5 paused');
      d.dc.renderVals().togglePause(); m.mc.togglePause(); run(60, 'watch 5 resumed');
      d.dc.renderVals().back(); m.mc.back(); run(200, 'watch 4 after BACK');
      d.dc.renderVals().next(); m.mc.next(); run(800, 'watch 5 again, through the slow motion at 44.1–45');
    }
    if (i === 7) run(400, 'watch 8 holds at its end');
    d.dc.renderVals().next(); m.mc.next();
  }
  compare(d.dc, m.mc, 'START THE LESSONS');
  // Reduced motion: still shots, no slow motion.
  d.dc.backToWatch(); m.mc.backToWatch();
  d.dc.go(4); m.mc.go(4);
  d.dc.setState({ reduced: true }); d.dc.R.lastShot = -1; m.mc.setReduced(true);
  run(900, 'watch 5, reduced motion');
  d.dc.go(2); m.mc.go(2); run(400, 'watch 3, reduced motion (the follow shot becomes a wide one)');
  d.dc.go(7); m.mc.go(7); run(300, 'watch 8, reduced motion');
  // Uneven frames (a slow device; dt is clamped at 50 ms).
  d.dc.setState({ reduced: false }); d.dc.R.lastShot = -1; m.mc.setReduced(false);
  d.dc.go(5); m.mc.go(5); run(300, 'watch 6 at uneven frame times', 47);
}

/* ---------- 3. the lessons ---------- */
function lessonRig(seed: number) {
  clock.now = 50_000;
  const d = design(seed), m = port(seed);
  const step = (frames: number, what: string, every = 5) => {
    for (let f = 0; f < frames; f++) { frame(d, m); if (f % every === 0) compare(d.dc, m.mc, `${what}, frame ${f}`); }
    compare(d.dc, m.mc, `${what}, end`);
    compareView(d.dc, m.mc, `${what}, end`);
  };
  const both = (f: (x: Any, mine: LearnController) => void, what: string) => { f(d.dc, m.mc); compare(d.dc, m.mc, what); compareView(d.dc, m.mc, what); };
  const tap = (x: number, y: number, what: string) => {
    // Design's boardTap reads the pointer; the port gets the square.
    const ev = { currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 260 }) }, clientX: (x + .5) * 26, clientY: (y + .5) * 26 };
    both((dc, mc) => { dc.boardTap(ev); mc.tap(x, y); }, what);
  };
  return { d, m, step, both, tap };
}
{
  const { step, both, tap } = lessonRig(3);
  for (let li = 0; li < 7; li++) {
    const id = LS[li].id;
    both((dc, mc) => { dc.startLesson(li); mc.startLesson(li); }, `${id}: start`);
    both((dc, mc) => { dc.toggleCells ? dc.toggleCells() : dc.renderVals().toggleCells(); mc.toggleCells(); }, `${id}: CELLS on`);
    both((dc, mc) => { dc.renderVals().toggleCells(); mc.toggleCells(); }, `${id}: CELLS off`);
    both((dc, mc) => { dc.renderVals().toggleSrc(); mc.toggleSrc(); }, `${id}: sources open`);
    if (LS[li].read) {
      if (id === 'rule') both((dc, mc) => { dc.renderVals().toHood(); mc.startLesson(7); }, 'rule: UNDER THE HOOD');
      continue;
    }
    // The demo, by the big button; a second press while it runs does nothing.
    both((dc, mc) => { dc.lessonPrimary(); mc.lessonPrimary(); }, `${id}: the big button (demo)`);
    step(10, `${id}: the demo starting`);
    both((dc, mc) => { dc.lessonPrimary(); mc.lessonPrimary(); }, `${id}: the big button again during the demo`);
    step(600, `${id}: the demo playing`, 9);
    // Step back and forward, then reset.
    for (let k = 0; k < 4; k++) both((dc, mc) => { dc.ltool('back'); mc.ltool('back'); }, `${id}: ◁ STEP ${k + 1}`);
    for (let k = 0; k < 2; k++) both((dc, mc) => { dc.ltool('step'); mc.ltool('step'); }, `${id}: STEP ▷ ${k + 1}`);
    both((dc, mc) => { dc.ltool('reset'); mc.ltool('reset'); }, `${id}: RESET`);
    // The visitor's own way.
    if (id === 'square') {
      tap(1, 1, 'square: a tap off the hints'); tap(5, 7, 'square: a square on a hint'); tap(5, 7, 'square: taken back'); tap(4, 7, 'square: at the first hint');
    }
    if (id === 'turn') {
      tap(10, 5, 'turn: out of the zone (toast)'); step(160, 'turn: the toast goes after 2400 ms');
      both((dc, mc) => { dc.renderVals().dirs[1].go(); mc.pickDir(0, -1); }, 'turn: ↑'); // the demo then fires up (study §13.6)
      both((dc, mc) => { dc.renderVals().dirs[3].go(); mc.pickDir(1, 0); }, 'turn: →');
      tap(4, 3, 'turn: a glider in row 3'); tap(4, 7, 'turn: a second glider'); tap(5, 5, 'turn: over budget (toast)');
      tap(4, 3, 'turn: the first one taken back');
      both((dc, mc) => { dc.renderVals().palette[1].go(); mc.pickTool('square'); }, 'turn: SQUARE');
      tap(3, 4, 'turn: a square'); tap(3, 5, 'turn: another square');
      both((dc, mc) => { dc.renderVals().palette[2].go(); mc.pickTool('tower'); }, 'turn: TOWER');
      tap(5, 2, 'turn: over budget again');
    }
    both((dc, mc) => { dc.ltool('play'); mc.ltool('play'); }, `${id}: PLAY`);
    step(500, `${id}: the visitor's run`, 9);
    if (id === 'turn') tap(6, 6, 'turn: a tap after the turn to act (toast)');
    both((dc, mc) => { dc.ltool('play'); mc.ltool('play'); }, `${id}: PAUSE`);
    both((dc, mc) => { dc.ltool('reset'); mc.ltool('reset'); }, `${id}: RESET again`);
    if (id === 'square') { both((dc, mc) => { dc.ltool('play'); mc.ltool('play'); }, 'square: PLAY with no square (fails)'); step(200, 'square: the tower falls'); both((dc, mc) => { dc.ltool('reset'); mc.ltool('reset'); }, 'square: RESET after failing'); }
    both((dc, mc) => { dc.lessonPrimary(); mc.lessonPrimary(); }, `${id}: the demo once more`);
    step(500, `${id}: to the goal`, 13);
    both((dc, mc) => { dc.renderVals().back(); mc.back(); }, `${id}: BACK`);
    both((dc, mc) => { dc.startLesson(li); mc.startLesson(li); }, `${id}: again`);
  }
  // BACK from lesson 1 returns to watch screen 8.
  both((dc, mc) => { dc.startLesson(0); mc.startLesson(0); }, 'goal again');
  both((dc, mc) => { dc.renderVals().back(); mc.back(); }, 'goal: BACK to watch 8');
}

/* ---------- 4. Under the hood ---------- */
{
  const { step, both } = lessonRig(4);
  both((dc, mc) => { dc.startLesson(7); mc.startLesson(7); }, 'hood: start');
  both((dc, mc) => { dc.renderVals().toggleRule(); mc.toggleRule(); }, 'hood: the rule card');
  both((dc, mc) => { dc.ltool('back'); mc.ltool('back'); }, 'hood: ◁ STEP at the start does nothing');
  both((dc, mc) => { dc.lessonPrimary(); mc.lessonPrimary(); }, 'hood: PLAY IT');
  step(240, 'hood: playing', 7);
  for (let k = 0; k < 5; k++) both((dc, mc) => { dc.ltool('back'); mc.ltool('back'); }, `hood: ◁ STEP ${k + 1}`);
  both((dc, mc) => { dc.ltool('reset'); mc.ltool('reset'); }, 'hood: RESET');
  for (let k = 0; k < 20; k++) both((dc, mc) => { dc.ltool('step'); mc.ltool('step'); }, `hood: STEP ▷ ${k + 1}`);
  both((dc, mc) => { dc.lessonPrimary(); mc.lessonPrimary(); }, 'hood: START A PRACTICE MATCH');
}

/* ---------- 5. the practice match, under each new rule ---------- */
// The first random draw picks the rule: find a seed for each.
const seedFor = (k: number) => { for (let s = 1; ; s++) if (Math.floor(B.rng(s)() * 4) === k) return s; };
for (let k = 0; k < 4; k++) {
  const seed = seedFor(k);
  const { d, m, step, both, tap } = lessonRig(seed);
  const name = `practice (${T.practice.rules[P.RULES[k].id]})`;
  both((dc, mc) => { dc.startLesson(8); mc.startLesson(8); }, `${name}: start`);
  let turns = 0;
  while (m.mc.state.lphase !== 'over' && turns++ < 20) {
    const L = m.mc.L as Any, s = L.s;
    const mine = s.pieces.filter((q: Any) => q.k === 'tower' && q.p === 0);
    // A scripted visitor: refused taps, then a glider (diagonal under that rule), squares, a tower.
    tap(14, 0, `${name}, turn ${turns}: out of the zone`);
    if (mine.length) {
      const t0 = mine[turns % mine.length];
      // Squares in front of every tower first (two deep), as the practice's own advice says.
      both((dc, mc) => { dc.renderVals().palette[1].go(); mc.pickTool('square'); }, `${name}: SQUARE`);
      for (const tw of mine) for (const dx of [1, 2]) tap(tw.x + dx, tw.y, `${name}, turn ${turns}: a square in front of (${tw.x}, ${tw.y})`);
      tap(t0.x + 1, t0.y, `${name}, turn ${turns}: a square taken back (or refused)`);
      tap(t0.x + 1, t0.y, `${name}, turn ${turns}: and put back`);
      if (P.RULES[k].diag) { both((dc, mc) => { dc.renderVals().dirs[turns % 2 ? 7 : 5].go(); mc.pickDir(1, turns % 2 ? 1 : -1); }, `${name}: a diagonal`); }
      else { both((dc, mc) => { dc.renderVals().dirs[3].go(); mc.pickDir(1, 0); }, `${name}: →`); }
      both((dc, mc) => { dc.renderVals().palette[0].go(); mc.pickTool('glider'); }, `${name}: GLIDER`);
      tap(Math.min(14, t0.x + 1), Math.min(9, t0.y + 1), `${name}, turn ${turns}: a glider`);
      tap(Math.min(14, t0.x + 2), Math.max(0, t0.y - 1), `${name}, turn ${turns}: another glider (often over budget)`);
      both((dc, mc) => { dc.renderVals().palette[2].go(); mc.pickTool('tower'); }, `${name}: TOWER`);
      tap(Math.min(14, t0.x + 3), Math.max(0, t0.y - 2), `${name}, turn ${turns}: a tower (often over budget)`);
      tap(t0.x, t0.y, `${name}, turn ${turns}: a tap on a tower already there`);
    }
    both((dc, mc) => { dc.lessonPrimary(); mc.lessonPrimary(); }, `${name}, turn ${turns}: END TURN (the bot moves)`);
    step(30, `${name}, turn ${turns}: running`, 3);
    if (turns === 2) { both((dc, mc) => { dc.lessonPrimary(); mc.lessonPrimary(); }, `${name}: PAUSE`); tap(5, 5, `${name}: a tap while running`); step(20, `${name}: paused`); both((dc, mc) => { dc.lessonPrimary(); mc.lessonPrimary(); }, `${name}: RESUME`); }
    for (let g = 0; g < 400 && m.mc.state.lphase === 'run'; g++) { frame(d, m); if (g % 4 === 0) compare(d.dc, m.mc, `${name}, turn ${turns}: run frame ${g}`); }
    compare(d.dc, m.mc, `${name}, turn ${turns}: next phase`);
    compareView(d.dc, m.mc, `${name}, turn ${turns}: next phase`);
  }
  eq(true, m.mc.state.lphase === 'over' || turns > 20, `${name}: the match ends`);
  // PLAY AGAIN draws a new rule from the same stream.
  both((dc, mc) => { dc.lessonPrimary(); mc.lessonPrimary(); }, `${name}: PLAY AGAIN`);
  both((dc, mc) => { dc.renderVals().back(); mc.back(); }, `${name}: BACK to lesson 7`);
  console.log(`  ${name}: seed ${seed}, ${turns} turns`);
}

if (failures.length) report();
console.log(`learn: ${checks} checks, all identical to Design's game (docs/design/minpentai-intro-v3.dc.html)`);
