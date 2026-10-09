/**
 * Learn Minpentai's logic, without React or three.js: Design's `Component` (docs/design/
 * minpentai-intro-v3.dc.html, script lines 487–953) ported method for method, with the clock, the
 * random numbers and the timers passed in so the same steps can run beside Design's own code
 * (scripts/test-minpentai-learn.ts). The page (src/app/minpentai/learn.tsx) draws what this holds.
 *
 *   state, constructor            -> Component.state, componentDidMount (488–494)
 *   seekTo, go, tick, camera      -> 560–579, and the camera part of draw (649–653)
 *   hudTick                       -> 670–681
 *   startLesson … boardTap        -> 683–806 (tap(x, y) is boardTap after the pixel-to-square step)
 *   view                          -> renderVals, learnVals, practiceVals (849–952), as data
 */
import { COL, DT, NAME, SEG, SEGS_LEN, hudAt, newSim, shotAt, slowAt, stepSim, type CamState, type Hud, type Sim } from './broadcast';
import { COST, DIAG, DIRS, G_, PH, Q_, RULES, T_, near, pClone, pStep, towers, type Costs, type Hit, type NewRule, type PState, type Tool } from './pieces';
import { bBack, bStep, live, type CBoard } from './cells';
import { LS, MAIN, indexOf, type CellsLesson, type LessonDef, type PiecesLesson } from './lessons';
import { LEARN_TEXT as T, type TagKey } from '../learn-text';

export interface Env {
  now(): number;
  random(): number;
  setTimeout(f: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}
export const browserEnv = (): Env => ({
  now: () => performance.now(),
  random: () => Math.random(),
  setTimeout: (f, ms) => window.setTimeout(f, ms),
  clearTimeout: (h) => window.clearTimeout(h as number),
});

export interface Lt { strip: string; hasMinus: boolean; minus: string; minusC: string }
export interface CState {
  dir: string;
  mode: 'watch' | 'learn';
  li: number;
  lphase: 'act' | 'run' | 'over';
  lresult: 'win' | 'lose' | 'draw' | null;
  cellsOn: boolean;
  pick: Tool;
  spent: number;
  lfail: boolean;
  lt: Lt;
  lplaying: boolean;
  lmet: 'you' | 'demo' | null;
  ruleOpen: boolean;
  i: number;
  paused: boolean;
  src: boolean;
  reduced: boolean;
  toast: string | null;
  hud: Hud;
}
export interface FlashHit extends Hit { t0: number }
interface LBase { acc: number; playing: boolean; dirty?: boolean; met: 'you' | 'demo' | null; failed: boolean; flash: FlashHit[] }
export interface PiecesL extends LBase {
  def: PiecesLesson;
  dir: [number, number];
  s: PState;
  start: PState;
  hist: PState[];
  demo: { k: 'play' } | { k: 'place'; cells: [number, number][]; next: number } | null;
  tool: Tool;
  spent: number;
  rule?: NewRule;
  cost?: Costs;
  fogR?: number;
  every?: number;
  limit?: number;
  phase?: 'act' | 'run' | 'over';
  result?: 'win' | 'lose' | 'draw';
}
export interface CellsL extends LBase {
  def: CellsLesson;
  s: CBoard;
  start: CBoard;
  demo: { k: 'play' } | null;
}
export type LState = PiecesL | CellsL;
export const isCells = (L: LState): L is CellsL => !!L.def.ca;

export class LearnController {
  state: CState;
  S: Sim = newSim();
  acc = 0;
  L: LState | null = null;
  last = 0;
  lastHud = 0;
  hudKey = '';
  lastL = 0;
  tt: unknown = null;
  camLabel: string | undefined;
  cam: CamState & { pos: number[] | null; look: number[] | null; fov: number } = { follow: 0, lastShot: -1, pos: null, look: null, fov: 50 };
  private listeners = new Set<() => void>();
  constructor(private env: Env, opts: { reduced?: boolean } = {}) {
    this.state = {
      dir: '1,0', mode: 'watch', li: 0, lphase: 'act', lresult: null, cellsOn: false, pick: 'glider', spent: 0, lfail: false,
      lt: { strip: '', hasMinus: false, minus: '', minusC: '#fff' }, lplaying: false, lmet: null, ruleOpen: false, i: 0, paused: false,
      src: false, reduced: !!opts.reduced, toast: null,
      hud: { minus: '', minusC: '#fff', eyes: [0, 1, 2, 3].map(() => ({ ex: 0, ey: 0, eh: 7, op: 1 })), react: -1, reactWin: false, turn: 'TURN 0', cam: T.cams.crane, comment: '', banner: '', bannerC: '#E7E4DD', countdown: true, counts: [] },
    };
    this.last = env.now();
  }
  subscribe(f: () => void) { this.listeners.add(f); return () => { this.listeners.delete(f); }; }
  setState(p: Partial<CState>) { Object.assign(this.state, p); this.listeners.forEach((f) => f()); }

  /* ---------- watch ---------- */
  seekTo(target: number) {
    if (target < this.S.t - 1e-6) this.S = newSim();
    while (this.S.t < target) stepSim(this.S);
    this.cam.lastShot = -1;
  }
  go(i: number) {
    i = (i + SEGS_LEN) % SEGS_LEN;
    const [a] = SEG[i];
    this.setState({ i, src: false });
    this.acc = 0;
    if (this.S.t < a || this.S.t > SEG[i][1]) this.seekTo(a);
  }
  /** One frame: steps the sim (or the lesson), moves the camera, refreshes the HUD. Returns dt. */
  tick(now = this.env.now()): number {
    const dt = Math.min(.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state.mode === 'learn') { this.lessonTick(dt, now); return dt; }
    const i = this.state.i, [a, b] = SEG[i], hold = i >= 7;
    if (!this.state.paused) {
      this.acc += dt * (this.state.reduced ? 1 : slowAt(this.S.t));
      let guard = 0;
      while (this.acc >= DT && guard++ < 10) {
        this.acc -= DT;
        if (this.S.t >= b) { if (hold) { this.acc = 0; break; } this.seekTo(a); }
        stepSim(this.S);
      }
    }
    this.camera(dt);
    this.hudTick(now);
    return dt;
  }
  /** The camera part of Design's draw(): hard cut on a new shot, else ease toward it. */
  camera(dt: number) {
    const sh = shotAt(this.S.t, this.state.reduced, this.S, this.cam), c = this.cam, k = 1 - Math.exp(-dt * 7);
    if (sh.si !== c.lastShot || !c.pos || !c.look) { c.pos = sh.pos.slice(); c.look = sh.look.slice(); c.lastShot = sh.si; c.follow = 0; }
    else { for (let q = 0; q < 3; q++) { c.pos[q] += (sh.pos[q] - c.pos[q]) * k; c.look[q] += (sh.look[q] - c.look[q]) * k; } }
    if (Math.abs(c.fov - sh.fov) > .01) c.fov = sh.fov;
    this.camLabel = sh.label;
  }
  hudTick(now: number) {
    if (now - (this.lastHud || 0) < 150) return;
    this.lastHud = now;
    const hud = hudAt(this.S, this.camLabel);
    const key = JSON.stringify(hud);
    if (key !== this.hudKey) { this.hudKey = key; this.setState({ hud }); }
  }
  togglePause() { this.setState({ paused: !this.state.paused }); }
  setReduced(v: boolean) { this.setState({ reduced: v }); this.cam.lastShot = -1; }

  /* ---------- learn ---------- */
  startLesson(li: number) {
    const d = LS[li];
    if (d.ca) {
      const s = d.build();
      this.L = { s, start: s, playing: false, acc: 0, demo: null, met: null, failed: false, def: d, flash: [] };
    } else {
      const s = d.build();
      const L: PiecesL = { dir: [1, 0], s, start: s, hist: [], playing: false, acc: 0, demo: null, met: null, failed: false, def: d, tool: 'glider', spent: 0, flash: [] };
      if (d.practice) { const r = RULES[Math.floor(this.env.random() * RULES.length)]; Object.assign(L, { rule: r, cost: r.cost || COST, fogR: r.fog || d.fog, every: r.every || 12, limit: 96, phase: 'act' }); }
      this.L = L;
    }
    this.setState({ dir: '1,0', mode: 'learn', li, src: false, lmet: null, lfail: false, lplaying: false, ruleOpen: false, pick: 'glider', spent: 0, lphase: 'act', lresult: null });
    this.lchange(true);
  }
  backToWatch() { this.L = null; this.setState({ mode: 'watch' }); this.go(7); }
  ltoast(m: string) {
    this.setState({ toast: m });
    this.env.clearTimeout(this.tt);
    this.tt = this.env.setTimeout(() => this.setState({ toast: null }), 2400);
  }
  lstep(dir: number) {
    const L = this.L!;
    if (isCells(L)) { if (dir < 0) { if (L.s.turn > L.start.turn) L.s = bBack(L.s); } else L.s = bStep(L.s); return; }
    if (dir < 0) { if (L.hist.length) L.s = L.hist.pop()!; return; }
    L.hist.push(L.s);
    if (L.hist.length > 300) L.hist.shift();
    L.s = pStep(L.s);
    const now = this.env.now();
    L.s.hits.forEach((h) => L.flash.push({ ...h, t0: now }));
  }
  lchange(force?: boolean) {
    const L = this.L;
    if (!L) return;
    const d = L.def;
    const goal = isCells(L) ? L.def.goal(L.s, L.start) : (L.def.goal ? L.def.goal(L.s) : false);
    if (!L.met && goal) { L.met = L.demo ? 'demo' : 'you'; L.demo = null; this.setState({ lmet: L.met }); }
    const fl = !L.met && !isCells(L) && L.def.fail ? L.def.fail(L.s) : false;
    if (fl !== L.failed) { L.failed = fl; if (fl) L.playing = false; this.setState({ lfail: fl, lplaying: L.playing }); }
    void d;
    L.dirty = true;
    this.lhud(force);
  }
  lhud(force?: boolean) {
    const now = this.env.now();
    if (!force && now - (this.lastL || 0) < 120) return;
    this.lastL = now;
    const L = this.L!;
    let lt: Lt;
    if (isCells(L)) lt = { strip: T.board.stripCells(L.s.turn, live(L.s)), hasMinus: false, minus: '', minusC: '#fff' };
    else {
      const s = L.s, d = L.def;
      const pip = (p: number) => { const n = towers(s, p); return n ? '●'.repeat(n) : T.board.out; };
      const fl = L.flash.find((h) => h.k === 'tower' && now - h.t0 < 1600);
      lt = {
        strip: T.board.strip(d.practice ? s.turn + '/' + L.limit : T.board.stripTurn(s.turn), pip(0), pip(1), d.place === 'palette' && (d.practice ? L.phase === 'act' : s.turn === 0) ? T.board.stripPts(d.budget! - L.spent) : ''),
        hasMinus: !!fl, minus: fl ? T.hud.minus(NAME[fl.p!]) : '', minusC: fl ? COL[fl.p!] : '#fff',
      };
    }
    if (JSON.stringify(lt) !== JSON.stringify(this.state.lt)) this.setState({ lt });
  }
  lessonTick(dt: number, now: number) {
    const L = this.L;
    if (!L) return;
    if (!isCells(L) && L.def.practice) {
      if (L.playing && L.phase === 'run') {
        L.acc += dt * 4;
        let g = 0;
        while (L.acc >= 1 && g++ < 10) { L.acc -= 1; this.lstep(1); if (this.pCheck()) break; }
        L.dirty = true;
      }
      if (L.flash.length) { L.flash = L.flash.filter((h) => now - h.t0 < 1600); L.dirty = true; }
      this.lhud();
      return;
    }
    const dm = L.demo;
    if (!isCells(L) && dm && dm.k === 'place' && now >= dm.next) {
      if (dm.cells.length) { const [x, y] = dm.cells.shift()!; this.place(x, y); dm.next = now + 550; }
      else { L.demo = { k: 'play' }; L.playing = true; this.setState({ lplaying: true }); }
    }
    if (L.playing) {
      L.acc += dt * (L.def.speed || 3);
      let g = 0;
      while (L.acc >= 1 && g++ < 10) { L.acc -= 1; this.lstep(1); this.lchange(); if (!L.playing) break; }
    }
    if (L.flash.length) { L.flash = L.flash.filter((h) => now - h.t0 < 1600); L.dirty = true; }
    this.lhud();
  }
  pCheck() {
    const L = this.L as PiecesL, s = L.s, a = towers(s, 0), b = towers(s, 1);
    if (!a || !b || s.turn >= L.limit!) {
      L.phase = 'over'; L.playing = false;
      L.result = !a && !b ? 'draw' : !a ? 'lose' : !b ? 'win' : a > b ? 'win' : b > a ? 'lose' : 'draw';
      this.setState({ lphase: 'over', lresult: L.result, lplaying: false });
      return true;
    }
    if (s.turn % L.every! === 0) { L.phase = 'act'; L.playing = false; L.spent = 0; this.setState({ lphase: 'act', spent: 0, lplaying: false }); return true; }
    return false;
  }
  endTurn() {
    const L = this.L as PiecesL;
    this.botTurn();
    L.s.pieces.forEach((q) => { q.mine = false; });
    L.phase = 'run'; L.playing = true; L.acc = 0;
    this.setState({ lphase: 'run', lplaying: true });
    L.dirty = true;
  }
  /** Amber's turn: Design's bot, which reads the whole board (it ignores fog). */
  botTurn() {
    const L = this.L as PiecesL, s = pClone(L.s), cost = L.cost!, rnd = () => this.env.random();
    let pts = 8;
    const occ = (x: number, y: number) => s.pieces.some((q) => q.x === x && q.y === y), zoneB = (x: number, y: number) => near(s, x, y, 3, 1);
    const add = (q: ReturnType<typeof Q_>) => s.pieces.push({ ...q, id: s.nid++, trail: [] });
    for (const tw of s.pieces.filter((q) => q.k === 'tower' && q.p === 1)) {
      const threat = s.pieces.some((q) => q.k === 'glider' && q.p === 0 && q.y === tw.y && q.dx === 1 && q.x < tw.x && !s.pieces.some((o) => o.k !== 'glider' && o.y === tw.y && o.x > q.x && o.x < tw.x));
      if (threat && pts >= cost.square) for (let x = tw.x - 1; x >= tw.x - 3; x--) if (!occ(x, tw.y) && zoneB(x, tw.y)) { add(Q_(x, tw.y, 1)); pts -= cost.square; break; }
    }
    const targets = s.pieces.filter((q) => q.k === 'tower' && q.p === 0);
    let tries = 0;
    while (targets.length && pts >= cost.glider && tries++ < 24) {
      const tg = targets[Math.floor(rnd() * targets.length)], y = tries < 6 ? tg.y : Math.floor(rnd() * PH);
      for (let x = 12; x >= 10; x--) if (!occ(x, y) && zoneB(x, y)) { add(G_(x, y, 1, -1, 0)); pts -= cost.glider; break; }
    }
    while (pts >= cost.square && tries++ < 40) {
      const x = 10 + Math.floor(rnd() * 3), y = Math.floor(rnd() * PH);
      if (!occ(x, y) && zoneB(x, y)) { add(Q_(x, y, 1)); pts -= cost.square; }
    }
    L.s = s;
  }
  lreset() {
    const L = this.L!;
    if (isCells(L)) { L.s = L.def.build(); L.start = L.s; }
    else { L.s = L.def.build(); L.start = L.s; L.hist = []; L.spent = 0; }
    L.playing = false; L.demo = null; L.flash = []; L.failed = false;
    this.setState({ lplaying: false, spent: 0, lfail: false });
  }
  /** The big button. */
  lessonPrimary() {
    const L = this.L!, d = L.def, li = this.state.li;
    if (!isCells(L) && L.def.practice) {
      if (L.phase === 'act') this.endTurn();
      else if (L.phase === 'run') { L.playing = !L.playing; this.setState({ lplaying: L.playing }); }
      else this.startLesson(li);
      return;
    }
    if (d.read || L.met) {
      if (d.id === 'rule' || d.id === 'hood') { this.startLesson(indexOf('practice')); return; }
      this.startLesson(li + 1);
      return;
    }
    if (L.demo) return;
    this.lreset();
    if (d.demo === 'play') { L.demo = { k: 'play' }; L.playing = true; this.setState({ lplaying: true }); }
    else if (!isCells(L)) { L.tool = d.demoTool || 'glider'; this.setState({ pick: L.tool }); L.demo = { k: 'place', cells: d.demoCells!.map((c) => c.slice() as [number, number]), next: this.env.now() + 300 }; }
    this.lchange(true);
  }
  /** The four board controls. */
  ltool(k: 'back' | 'play' | 'step' | 'reset') {
    const L = this.L;
    if (!L) return;
    if (k === 'play') { L.playing = !L.playing; L.demo = null; }
    else { L.playing = false; L.demo = null; if (k === 'back') this.lstep(-1); if (k === 'step') this.lstep(1); if (k === 'reset') this.lreset(); }
    this.setState({ lplaying: L.playing });
    this.lchange(true);
  }
  place(x: number, y: number): 'no' | 'locked' | 'zone' | 'cost' | 'ok' {
    const L = this.L as PiecesL, d = L.def, s = L.s;
    if (!d.place) return 'no';
    if (d.practice ? L.phase !== 'act' : s.turn !== 0) return 'locked';
    const occ = s.pieces.find((q) => q.x === x && q.y === y), ns = pClone(s);
    if (d.place === 'square') {
      if (!d.hints!.some(([a, b]) => a === x && b === y)) return 'no';
      if (occ && occ.k === 'square') ns.pieces = ns.pieces.filter((q) => q.id !== occ.id);
      else if (!occ) ns.pieces.push({ ...Q_(x, y, 0), id: ns.nid++, trail: [] });
      else return 'no';
    } else {
      if (occ) { if (!occ.mine) return 'no'; ns.pieces = ns.pieces.filter((q) => q.id !== occ.id); L.spent -= (L.cost || COST)[occ.k as Tool]; }
      else {
        if (!near(s, x, y, d.zone!)) return 'zone';
        const k = L.tool, C = L.cost || COST;
        if (L.spent + C[k] > d.budget!) return 'cost';
        ns.pieces.push({ ...(k === 'glider' ? G_(x, y, 0, L.dir[0], L.dir[1]) : k === 'tower' ? T_(x, y, 0) : Q_(x, y, 0)), mine: true, id: ns.nid++, trail: [] });
        L.spent += C[k];
      }
      this.setState({ spent: L.spent });
    }
    L.s = ns; L.start = ns;
    this.lchange(true);
    return 'ok';
  }
  /** A tap (or Enter) on square (x, y) of the lesson board. */
  tap(x: number, y: number) {
    const L = this.L;
    if (!L || isCells(L) || !L.def.place || L.demo) return;
    const res = this.place(x, y);
    if (res === 'locked') this.ltoast(T.toasts.locked);
    else if (res === 'zone') this.ltoast(T.toasts.zone);
    else if (res === 'cost') this.ltoast(T.toasts.cost);
  }
  pickTool(k: Tool) { const L = this.L; if (L && !isCells(L)) L.tool = k; this.setState({ pick: k }); }
  pickDir(dx: number, dy: number) { const L = this.L; if (L && !isCells(L)) L.dir = [dx, dy]; this.setState({ dir: dx + ',' + dy }); }
  toggleCells() { this.setState({ cellsOn: !this.state.cellsOn }); if (this.L) this.L.dirty = true; }
  toggleRule() { this.setState({ ruleOpen: !this.state.ruleOpen }); }
  toggleSrc() { this.setState({ src: !this.state.src }); }
  next() {
    if (this.state.mode === 'learn') { this.lessonPrimary(); return; }
    const i = this.state.i;
    if (i >= T.watch.length - 1) this.startLesson(0); else this.go(i + 1);
  }
  back() {
    if (this.state.mode === 'learn') {
      const L = this.L!, li = this.state.li;
      if (!isCells(L) && L.def.practice) { this.startLesson(indexOf('rule')); return; }
      if (li === 0) this.backToWatch(); else this.startLesson(li - 1);
      return;
    }
    this.go(this.state.i - 1);
  }

  /** What the screen shows (Design's renderVals, learnVals, practiceVals), as data. */
  view(): View {
    const S = this.state;
    if (S.mode === 'learn' && this.L) return this.learnView();
    const i = S.i, scr = T.watch[i];
    return {
      mode: 'watch',
      title: scr.title, text: scr.text, caption: scr.caption ?? null, button: scr.button, sources: scr.sources, tags: scr.tags,
      rulesNote: false,
      srcLabel: T.sources(S.src, scr.sources.length),
      stageLabel: T.stageWatch + (S.hud.comment || ''),
      status: '', hasTools: false, playLabel: T.board.play, lplaying: false, hasReasons: false, hasRule: false, ruleOpen: false, ruleLabel: '',
      dots: T.watch.map((_, k) => (k === i ? 'current' : k < i ? 'past' : 'future')),
      stepOf: T.watchOf(i + 1, T.watch.length),
      backHidden: i === 0,
      hasCellsBtn: false, cellsOn: false, hasPalette: false, palette: [], hasDirs: false, dirs: [], hasHood: false,
      showCams: i === 1, commentShown: i !== 1, boardPlaceable: false,
      hasReact: S.hud.react >= 0 && i !== 1 && !S.hud.countdown,
    };
  }
  private learnView(): View {
    const S = this.state, li = S.li, d: LessonDef = LS[li], met = S.lmet, words = T.lessons[d.id];
    const label = d.read ? words.button : met ? (d.id === 'hood' ? T.startPractice : T.next) : words.button;
    const pal = (C: Costs) => (['glider', 'square', 'tower'] as Tool[]).map((k) => ({ k, t: T.board.tool(k, C[k]), on: S.pick === k }));
    const dirsFor = (diag: boolean) => [...DIRS, ...(diag ? DIAG : [])].map(([dx, dy, t, lab]) => ({ dx, dy, t, label: T.board.dir(lab), on: S.dir === dx + ',' + dy }));
    const v: View = {
      mode: 'learn',
      title: words.title, text: words.text, caption: ('caption' in words ? words.caption : undefined) ?? null, button: label, sources: words.sources, tags: words.tags,
      rulesNote: !!('rulesNote' in words && words.rulesNote),
      srcLabel: T.sources(S.src, words.sources.length),
      stageLabel: T.stageLearn + S.lt.strip,
      status: met ? (('metText' in words && words.metText) || (met === 'you' ? T.status.you : T.status.demo)) : S.lfail ? (('failText' in words && words.failText) || '') : '',
      hasTools: !d.read, playLabel: S.lplaying ? T.board.pause : T.board.play, lplaying: S.lplaying,
      hasReasons: !!d.reasons, hasRule: !!d.ca, ruleOpen: S.ruleOpen, ruleLabel: S.ruleOpen ? T.rule.hide : T.rule.show,
      dots: MAIN.map((_, k) => (d.optional || k < li ? 'past' : k === li ? 'current' : 'future')),
      stepOf: d.optional ? T.learnOptional : T.learnOf(li + 1, MAIN.length),
      backHidden: false,
      hasCellsBtn: !d.ca, cellsOn: S.cellsOn,
      hasPalette: d.place === 'palette', palette: pal(COST), hasDirs: S.pick === 'glider', dirs: dirsFor(false),
      hasHood: !!d.hood, showCams: false, commentShown: false, hasReact: false,
      boardPlaceable: !!d.place,
    };
    const L = this.L;
    if (L && !isCells(L) && L.def.practice && L.rule) {
      const ph = S.lphase, s = L.s, res = S.lresult, nextAt = Math.min(L.limit!, Math.ceil((s.turn + 1) / L.every!) * L.every!), P = T.practice;
      Object.assign(v, {
        title: ph === 'over' ? (res === 'win' ? P.titles.win : res === 'lose' ? P.titles.lose : P.titles.draw) : words.title,
        text: ph === 'act' ? (s.turn === 0 ? P.act0 : P.act) : ph === 'run' ? P.run : res === 'win' ? P.over.win : res === 'lose' ? P.over.lose : P.over.draw,
        caption: P.rule(P.rules[L.rule.id]),
        button: ph === 'act' ? P.buttons.act : ph === 'run' ? (S.lplaying ? P.buttons.pause : P.buttons.resume) : P.buttons.again,
        hasTools: false, hasPalette: ph === 'act', boardPlaceable: ph === 'act',
        status: ph === 'act' ? P.status.act(s.turn) : ph === 'run' ? P.status.run(nextAt) : res === 'win' ? P.status.win : res === 'lose' ? P.status.lose : P.status.draw,
        stepOf: T.practiceLabel,
        hasDirs: S.pick === 'glider', dirs: dirsFor(!!L.rule.diag), palette: pal(L.cost!),
      });
    }
    return v;
  }
}

export interface View {
  mode: 'watch' | 'learn';
  title: string;
  text: string;
  caption: string | null;
  button: string;
  sources: [string, string][];
  tags: TagKey[];
  rulesNote: boolean;
  srcLabel: string;
  stageLabel: string;
  status: string;
  hasTools: boolean;
  playLabel: string;
  lplaying: boolean;
  hasReasons: boolean;
  hasRule: boolean;
  ruleOpen: boolean;
  ruleLabel: string;
  dots: ('past' | 'current' | 'future')[];
  stepOf: string;
  backHidden: boolean;
  hasCellsBtn: boolean;
  cellsOn: boolean;
  hasPalette: boolean;
  palette: { k: Tool; t: string; on: boolean }[];
  hasDirs: boolean;
  dirs: { dx: number; dy: number; t: string; label: string; on: boolean }[];
  hasHood: boolean;
  showCams: boolean;
  commentShown: boolean;
  hasReact: boolean;
  boardPlaceable: boolean;
}
