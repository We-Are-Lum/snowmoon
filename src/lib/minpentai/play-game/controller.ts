/**
 * Minpentai Play's logic, without React: Design's `Component` (docs/design/
 * minpentai-play-prototype.dc.html, script lines 120–402) ported method for method, with the clock,
 * the timers and the outside world passed in, so the same steps can run beside Design's own code
 * (scripts/test-minpentai-play.ts). The page (src/app/minpentai/play.tsx) draws what view() returns.
 *
 * What is Design's and what changed:
 * - Practice, the computer ladder, the rung start, the match, resign, leave, the result, "watch it
 *   again", free play and its board options, full screen: Design's, line for line.
 * - Ladder progress (Design keeps it in localStorage) comes from the server, readable only by the
 *   signed-in person (owner, 2026-10-09: a new private table); `onLadderResult` sends each result.
 * - Signed in or not is the site's real sign-in, not the mockup's toggle.
 * - One-on-one ("duel") is not simulated here: the live match runs on the server
 *   (src/lib/minpentai/play-game/live-types.ts, play-live.tsx). Design's mockup controls (device,
 *   sign-in toggle, sample progress, "opponent loses connection") are left out.
 * - The device ('phone', 'frame', 'desk') is the real one: 'frame' inside the Farcaster mini app,
 *   'desk' at 768 px and wider outside it, else 'phone'.
 */
import {
  AR, COL, COST, D4, D8, MAXS, RULES, RUNGS, K, apply, botPlan, clone, empty, fmt, inb, lit, rng, step, towers, updLS, world,
  type Piece, type Placement, type RuleId, type Side, type World,
} from './game';
import { board, type BoardOpts, type BoardView } from './board';
import type { LadderProgress } from './live-types';

export interface Env {
  now(): number;
  setInterval(f: () => void, ms: number): unknown;
  clearInterval(h: unknown): void;
  setTimeout(f: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
  /** Copy text (the free play link). */
  copy(text: string): void;
  /** The page's address without its hash. */
  href(): string;
}
export const browserEnv = (): Env => ({
  now: () => Date.now(),
  setInterval: (f, ms) => window.setInterval(f, ms),
  clearInterval: (h) => window.clearInterval(h as number),
  setTimeout: (f, ms) => window.setTimeout(f, ms),
  clearTimeout: (h) => window.clearTimeout(h as number),
  copy: (t) => { try { void navigator.clipboard.writeText(t); } catch { /* the address bar still holds it */ } },
  href: () => window.location.href.split('#')[0],
});

export type Dev = 'phone' | 'frame' | 'desk';
export type Screen = 'home' | 'ladder' | 'person' | 'start' | 'match' | 'result' | 'replay' | 'free';
export type Sheet = null | 'menu' | 'resign' | 'leave' | 'opts';
export type Tab = 'learn' | 'play' | 'free';
export type Mode = 'practice' | 'ladder';

export interface PState {
  dev: Dev;
  signed: boolean;
  scr: Screen;
  tab: Tab;
  fs: boolean;
  panel: boolean;
  sheet: Sheet;
  toast: string | null;
  prog: LadderProgress & { sample?: boolean };
  rungSel: number | null;
  piece: Piece;
  dir: [number, number];
  aim: boolean;
  v: number;
}

export interface Match {
  mode: Mode;
  rung?: number;
  lvl: number;
  rule: RuleId;
  R: number;
  every: number;
  cost: number;
  rng: () => number;
  w: World;
  hist: World[];
  phase: 'pre' | 'act' | 'run' | 'over';
  pend: Record<Side, Placement[]>;
  snap: Record<Side, number[]>;
  lsC: Record<number, number>;
  lsA: Record<number, number>;
  ended: boolean;
  oppEnded: boolean;
  clock: null;
  res: null | { win: Side | 'D'; why: string; kind: string; step: number };
  lastG?: Placement | null;
  ff?: boolean;
  newOpen?: boolean;
  paused?: null;
}

export interface Free {
  w0: World;
  hist: World[];
  i: number;
  playing: boolean;
  side: Side | 'R';
  piece: Piece | 'e';
  see: 'all' | Side;
  diag: boolean;
  sight2: boolean;
  lastG: { x: number; y: number; dx: number; dy: number; id: number; o: Side } | null;
}
/** What a free play link holds (Design's #fp=…). */
export interface FreeLink {
  w?: { r?: number[]; t?: [number, Side][]; s?: [number, Side, number][]; g?: [number, number, number, number, Side][] };
  see?: 'all' | Side;
  diag?: boolean;
  sight2?: boolean;
}

export interface Hooks {
  /** A ladder match ended: the server records it (the page sends it signed in). */
  onLadderResult?(r: { rung: number; win: Side | 'D'; step: number }): void;
  /** Open sign-in (the ladder's "SIGN IN WITH FARCASTER"). */
  signIn?(): void;
  /** The tab bar's LEARN and the Play hub's lessons: open Learn (v3). */
  openLearn?(): void;
  /** Any change worth redrawing. */
  changed?(): void;
}

export class PlayController {
  state: PState = { dev: 'phone', signed: false, scr: 'home', tab: 'play', fs: false, panel: true, sheet: null, toast: null, prog: { opened: 1, rec: {} }, rungSel: null, piece: 'g', dir: [1, 0], aim: false, v: 0 };
  m: Match | null = null;
  fp: Free | null = null;
  rp: { hist: World[]; i: number; playing: boolean } | null = null;
  lastStart: World | null = null;
  private rt: unknown = null;
  private ft: unknown = null;
  private pt: unknown = null;
  private tt: unknown = null;

  constructor(private env: Env, private hooks: Hooks = {}) {}

  setState(p: Partial<PState>) { Object.assign(this.state, p); this.hooks.changed?.(); }
  set(p: Partial<PState>) { this.setState(p); }
  bump() { this.state.v++; this.hooks.changed?.(); }
  say(t: string) { this.env.clearTimeout(this.tt); this.setState({ toast: t }); this.tt = this.env.setTimeout(() => this.setState({ toast: null }), 2800); }
  portrait() { return this.state.fs && this.state.dev !== 'desk'; }
  dispose() { [this.rt, this.ft, this.pt].forEach((h) => this.env.clearInterval(h)); this.env.clearTimeout(this.tt); }

  /** Design's componentDidMount, the parts that are not the mockup: a free play link in the hash. */
  mount(hash: string) {
    if (hash.startsWith('#fp=')) {
      try { this.loadFree(JSON.parse(atob(decodeURIComponent(hash.slice(4)))) as FreeLink); this.setState({ scr: 'free' }); } catch { /* not a board */ }
    }
  }
  /** Escape: close a sheet, else leave full screen. */
  escape() { if (this.state.sheet) this.setState({ sheet: null }); else if (this.state.fs) this.setState({ fs: false, aim: false }); }

  mk(mode: Mode, rung?: number): Match {
    const seed = (this.env.now() % 1e6) | 0, r = rng(seed), ids = Object.keys(RULES) as RuleId[], rule = ids[Math.floor(r() * ids.length)];
    const m: Match = { mode, rung, lvl: mode === 'practice' ? 0 : mode === 'ladder' ? rung! : 3, rule, R: rule === 'sight2' ? 2 : 3, every: rule === 'every8' ? 8 : 12, cost: rule === 'cost3' ? 3 : 4, rng: r, w: world(), hist: [], phase: 'pre', pend: { C: [], A: [] }, snap: { C: [], A: [] }, lsC: {}, lsA: {}, ended: false, oppEnded: false, clock: null, res: null };
    m.lsC[K(13, 2)] = 0; m.lsC[K(13, 7)] = 0; m.lsA[K(1, 2)] = 0; m.lsA[K(1, 7)] = 0;
    m.hist.push(clone(m.w));
    return m;
  }
  openStart(mode: Mode, rung?: number) { this.env.clearInterval(this.rt); this.m = this.mk(mode, rung); this.setState({ scr: 'start', fs: false, sheet: null }); }
  begin() { this.beginAct(); this.setState({ scr: 'match', piece: 'g', dir: [1, 0], aim: false }); }
  beginAct() {
    const m = this.m!, w = m.w;
    m.phase = 'act'; m.snap = { C: towers(w, 'C'), A: towers(w, 'A') }; m.pend = { C: [], A: [] }; m.ended = m.oppEnded = false; m.lastG = null; m.ff = false;
    m.pend.A = botPlan(m);
    this.setState({ aim: false });
  }
  startRun() { const m = this.m; if (!m || m.phase !== 'act') return; apply(m); updLS(m); m.hist[m.hist.length - 1] = clone(m.w); m.phase = 'run'; m.clock = null; this.setState({ aim: false }); this.runT(); }
  runT() { this.env.clearInterval(this.rt); this.rt = this.env.setInterval(() => this.runTick(), this.m!.ff ? 40 : 170); }
  runTick() {
    const m = this.m; if (!m || m.phase !== 'run') { this.env.clearInterval(this.rt); return; } if (m.paused) return;
    step(m.w); updLS(m); m.hist.push(clone(m.w));
    if (this.checkEnd()) return;
    if (m.w.step % m.every === 0) { this.env.clearInterval(this.rt); this.beginAct(); }
    this.bump();
  }
  checkEnd() {
    const m = this.m!, w = m.w, c = towers(w, 'C').length, a = towers(w, 'A').length, n = w.step; let win: Side | 'D', why: string;
    if (!c && !a) { win = 'D'; why = `Both sides lost their last tower at step ${n}.`; }
    else if (!c) { win = 'A'; why = `Your last tower fell at step ${n}.`; }
    else if (!a) { win = 'C'; why = `Amber's last tower fell at step ${n}.`; }
    else if (n >= MAXS) { win = c > a ? 'C' : a > c ? 'A' : 'D'; why = `Time ran out at step ${MAXS}. Amber had ${a} tower${a === 1 ? '' : 's'}, you had ${c}.`; }
    else return false;
    this.finish(win, why); return true;
  }
  finish(win: Side | 'D', why: string, kind?: string) {
    const m = this.m!; this.env.clearInterval(this.rt); m.phase = 'over'; m.paused = null; m.res = { win, why, kind: kind || 'end', step: m.w.step };
    let prog = this.state.prog; m.newOpen = false;
    if (m.mode === 'ladder') {
      const rung = m.rung!, rec = { ...prog.rec }, r: { tries: number; won?: number; s?: number } = { ...(rec[rung] || { tries: 0 }) };
      r.tries = (r.tries || 0) + 1;
      if (win === 'C' && !r.won) { r.won = m.w.step; delete r.s; }
      rec[rung] = r;
      const opened = win === 'C' ? Math.max(prog.opened, Math.min(5, rung + 1)) : prog.opened;
      m.newOpen = opened > prog.opened; prog = { ...prog, rec, opened };
      this.hooks.onLadderResult?.({ rung, win, step: m.w.step });
    }
    this.lastStart = m.hist[0];
    this.set({ scr: 'result', fs: false, sheet: null, aim: false, prog });
  }
  resign() { this.finish('A', `You resigned at step ${this.m!.w.step}. It counts as a loss.`, 'resign'); }
  leave() {
    const m = this.m!;
    if (m.mode === 'practice') { this.env.clearInterval(this.rt); this.m = null; this.setState({ scr: 'home', tab: 'play', sheet: null, fs: false }); return; }
    this.finish('A', `You left at step ${m.w.step}. Leaving counts as resigning.`, 'left');
  }
  pts() { const m = this.m!; return 8 - m.pend.C.reduce((s, p) => s + (p.t === 'g' ? m.cost : COST[p.t]), 0); }
  next() { const m = this.m!; return (Math.floor(m.w.step / m.every) + 1) * m.every; }
  cellMatch(x: number, y: number) {
    const m = this.m; if (!m) return; const k = K(x, y);
    if (m.paused) return;
    if (m.phase === 'run') { const n = this.next(); this.say(n >= MAXS ? 'Your last turn to act is over. The match ends at step 96.' : `Your turn to act is over. The next one is at step ${n}.`); return; }
    if (m.phase !== 'act') return;
    const i = m.pend.C.findIndex((p) => K(p.x, p.y) === k);
    if (i >= 0) { const p = m.pend.C.splice(i, 1)[0]; if (p === m.lastG) m.lastG = null; m.ended = false; this.setState({ aim: false }); this.bump(); return; }
    if (m.ended) { this.say('Tap CHANGE MY TURN to place more.'); return; }
    if (!lit(m.w, 'C', m.R, m.snap.C).has(k)) { this.say(`Place in the lit area: within ${m.R} squares of a tower you had when this turn began.`); return; }
    if (!empty(m.w, k)) { this.say('That square is taken.'); return; }
    const pc = this.state.piece, c = pc === 'g' ? m.cost : COST[pc];
    if (this.pts() < c) { this.say('Not enough points left this turn.'); return; }
    const p: Placement = { t: pc, o: 'C', x, y, dx: this.state.dir[0], dy: this.state.dir[1] }; m.pend.C.push(p); if (pc === 'g') m.lastG = p;
    this.setState({ aim: pc === 'g' && this.portrait() }); this.bump();
  }
  endTurn() { const m = this.m; if (!m || m.phase !== 'act') return; this.setState({ aim: false }); this.startRun(); }
  setDir(d: [number, number]) {
    this.setState({ dir: d }); const sc = this.state.scr;
    const g = sc === 'match' && this.m ? this.m.lastG : sc === 'free' && this.fp && this.fp.i === 0 ? this.fp.lastG : null;
    if (g) { g.dx = d[0]; g.dy = d[1]; if (sc === 'free') this.fpReset(); }
    this.bump();
  }

  // Free play
  openFree() { if (!this.fp) this.loadFree(null); this.setState({ scr: 'free', fs: false, sheet: null, dir: [1, 0], aim: false }); }
  loadFree(d: FreeLink | 'empty' | null, w0?: World) {
    this.env.clearInterval(this.ft); let w: World;
    if (w0) w = clone(w0);
    else if (d && d !== 'empty' && d.w) {
      w = world(true);
      (d.w.r || []).forEach((k) => (w.rock[k] = 1));
      (d.w.t || []).forEach(([k, o]) => (w.tw[k] = o));
      (d.w.s || []).forEach(([k, o, hp]) => (w.sq[k] = { o, hp }));
      (d.w.g || []).forEach(([x, y, dx, dy, o]) => w.gl.push({ id: w.nid++, o, x, y, dx, dy }));
    } else w = d === 'empty' ? world(true) : world();
    w.step = 0; w.flash = [];
    const old: Partial<Free> = this.fp || {};
    const link = d && d !== 'empty' ? d : null;
    this.fp = { w0: w, hist: [clone(w)], i: 0, playing: false, side: old.side || 'C', piece: old.piece || 'g', see: (link && link.see) || old.see || 'all', diag: link && link.w ? !!link.diag : !!old.diag, sight2: link && link.w ? !!link.sight2 : !!old.sight2, lastG: null };
  }
  fpReset() { const f = this.fp!; f.hist = [clone(f.w0)]; f.i = 0; }
  cellFree(x: number, y: number) {
    const f = this.fp!, k = K(x, y), w = f.w0;
    if (f.i !== 0) { this.say('Placing is allowed at step 0 only. Step back to 0 to change the board.'); return; }
    const gi = w.gl.findIndex((g) => K(g.x, g.y) === k);
    if (f.piece === 'e') { delete w.rock[k]; delete w.sq[k]; delete w.tw[k]; w.gl = w.gl.filter((g) => K(g.x, g.y) !== k); }
    else if (f.side === 'R') { if (w.rock[k]) delete w.rock[k]; else if (empty(w, k)) w.rock[k] = 1; else { this.say('That square is taken. Erase it first.'); return; } }
    else {
      const side = f.side;
      const same = (f.piece === 't' && w.tw[k] === side) || (f.piece === 's' && w.sq[k] && w.sq[k].o === side) || (f.piece === 'g' && gi >= 0 && w.gl[gi].o === side);
      if (same) { delete w.tw[k]; delete w.sq[k]; if (gi >= 0) { if (w.gl[gi] === f.lastG) f.lastG = null; w.gl.splice(gi, 1); } }
      else if (!empty(w, k)) { this.say('That square is taken. Erase it first.'); return; }
      else if (f.piece === 't') w.tw[k] = side;
      else if (f.piece === 's') w.sq[k] = { o: side, hp: 2 };
      else { const g = { id: w.nid++, o: side, x, y, dx: this.state.dir[0], dy: this.state.dir[1] }; w.gl.push(g); f.lastG = g; this.setState({ aim: this.portrait() }); }
    }
    this.fpReset(); this.bump();
  }
  fpFwd() { const f = this.fp!; if (f.i + 1 < f.hist.length) f.i++; else { if (!f.hist[f.i].gl.length || f.i >= 200) { this.fpStop(); return; } f.hist.push(step(clone(f.hist[f.i]))); f.i++; } this.bump(); }
  fpStop() { this.env.clearInterval(this.ft); if (this.fp) this.fp.playing = false; this.bump(); }
  fpPlay() { const f = this.fp!; if (f.playing) { this.fpStop(); return; } f.playing = true; this.setState({ aim: false }); this.env.clearInterval(this.ft); this.ft = this.env.setInterval(() => this.fpFwd(), 170); this.bump(); }
  /** Design's link: the board in the address's hash. Nothing is stored on our side. */
  freeLink(): string {
    const f = this.fp!, w = f.w0;
    const d: FreeLink = { w: { r: Object.keys(w.rock).map(Number), t: Object.entries(w.tw).map(([k, o]) => [+k, o]), s: Object.entries(w.sq).map(([k, v]) => [+k, v.o, v.hp]), g: w.gl.map((g) => [g.x, g.y, g.dx, g.dy, g.o]) }, see: f.see, diag: f.diag, sight2: f.sight2 };
    return this.env.href() + '#fp=' + encodeURIComponent(btoa(JSON.stringify(d)));
  }
  copyLink() { this.env.copy(this.freeLink()); this.say('Link copied. Opening it loads this board in free play.'); }
  openReplay() { this.rp = { hist: this.m!.hist, i: 0, playing: true }; this.setState({ scr: 'replay' }); this.rpT(); }
  rpT() {
    this.env.clearInterval(this.pt);
    this.pt = this.env.setInterval(() => {
      const r = this.rp; if (!r || !r.playing || this.state.scr !== 'replay') { this.env.clearInterval(this.pt); return; }
      if (r.i < r.hist.length - 1) r.i++; else r.playing = false;
      this.bump();
    }, 110);
  }

  /** Design's renderVals, as data (the mockup's own controls left out). */
  view(): PlayView {
    const s = this.state, m = this.m, f = this.fp, scr = s.scr;
    const desk = s.dev === 'desk';
    const boardScr = ['start', 'match', 'result', 'replay', 'free'].includes(scr);
    const fsAble = scr === 'match' || scr === 'free', fs = s.fs && fsAble, port = fs && !desk;
    const L = desk
      ? (fs ? { dir: 'row', cs: 60, bflex: '1', bpad: '20px', pflex: 'none', pw: '340px', pbl: '1px solid var(--mp-rule)', colMax: '100%', colBd: '0' } : { dir: 'row', cs: 44, bflex: '1', bpad: '24px', pflex: 'none', pw: '380px', pbl: '1px solid var(--mp-rule)', colMax: '640px', colBd: '1px solid var(--mp-rule)' })
      : { dir: 'column', cs: 26, bflex: 'none', bpad: '0', pflex: '1', pw: '100%', pbl: '0', colMax: '100%', colBd: '0' };
    const cs = port ? (s.dev === 'frame' ? 40 : 36) : L.cs, P: Pick<BoardOpts, 'cs' | 'portrait'> = { cs, portrait: port };
    const go = (p: Partial<PState>) => () => { this.env.clearInterval(this.rt); this.setState({ sheet: null, fs: false, ...p }); };
    const prog = s.prog;
    const v: PlayView = {
      L, signed: s.signed, signedOut: !s.signed, port, desk,
      sHome: scr === 'home', tPlay: s.tab === 'play', tLearn: s.tab === 'learn', sLadder: scr === 'ladder', sPerson: scr === 'person', sBoard: boardScr,
      tabs: ([['LEARN', 'learn'], ['PLAY', 'play'], ['FREE PLAY', 'free']] as [string, Tab][]).map(([label, id]) => ({ label, on: s.tab === id, click: () => (id === 'free' ? this.openFree() : this.setState({ tab: id })) })),
      openLearn: () => this.hooks.openLearn?.(),
      openPractice: () => this.openStart('practice'), openLadder: go({ scr: 'ladder' }), openPerson: go({ scr: 'person' }), goHome: go({ scr: 'home', tab: 'play' }),
      ladTag: s.signed ? (prog.rec[5] && prog.rec[5].won ? 'ALL 5 BEATEN' : `RUNG ${prog.opened} OF 5`) : 'SIGN IN',
      signIn: () => this.hooks.signIn?.(),
      toastOn: !!s.toast, toast: s.toast || '',
      closeSheet: () => this.setState({ sheet: null }),
      sheetOn: !!s.sheet, shMenu: s.sheet === 'menu', shResign: s.sheet === 'resign', shLeave: s.sheet === 'leave', shOpts: s.sheet === 'opts',
      enterFS: () => this.setState({ fs: true, aim: false }), exitFS: () => this.setState({ fs: false, aim: false }), togglePanel: () => this.setState({ panel: !s.panel }), panelLabel: s.panel ? 'HIDE PANEL' : 'SHOW PANEL',
      fs, fsBtn: fsAble && !fs, hdrLight: !(desk && fs), hdrDark: desk && fs, panelOn: !(desk && fs && !s.panel),
      pStart: scr === 'start', pAct: false, pRun: false, pResult: scr === 'result', pReplay: scr === 'replay', pFree: scr === 'free',
      hasBack: false, hasRight: false, hPad: '12px', hTitle: '', hTitleCaps: '', hRight: '', hRightClick: () => {}, fsRight: '···', strip: '', bd: { cells: [], cols: 15, cs: 26, tap: () => {} },
      arrows: [], pieces: [], begin: () => this.begin(), rungs: [], playRungLabel: '', playRung: () => {},
    };
    // ladder
    const sel = s.rungSel || prog.opened;
    v.rungs = [5, 4, 3, 2, 1].map((n) => {
      const rec = prog.rec[n] || { tries: 0 }, open = n <= prog.opened, won = !!rec.won, isSel = open && n === sel;
      return { n, name: `${n} · ${RUNGS[n]!.n}`, desc: RUNGS[n]!.d, icon: won ? '✓' : String(n), open, won, sel: isSel,
        r1: won ? 'WON IN' : open ? (rec.tries ? `${rec.tries} TR${rec.tries === 1 ? 'Y' : 'IES'}` : '') : 'CLOSED', r2: won ? `${rec.won} STEPS` : open ? 'PLAY →' : '',
        click: () => (open ? this.setState({ rungSel: n }) : this.say(`Win rung ${n - 1} to open this one.`)) };
    });
    v.playRungLabel = `PLAY RUNG ${sel}`; v.playRung = () => this.openStart('ladder', sel);
    const title = (mm: Match): [string, string] => (mm.mode === 'practice' ? ['Practice match', ''] : [`Rung ${mm.rung} · ${RUNGS[mm.rung!]!.n}`, '']);
    if (m && ['start', 'match', 'result', 'replay'].includes(scr)) { const [a, b] = title(m); v.hTitle = a + b; v.hTitleCaps = (a + b).toUpperCase(); v.ruleText = RULES[m.rule]; }
    if (scr === 'start' && m) {
      const w = m.w; v.bd = board({ w, fog: 'C', R: m.R, zone: new Set([...lit(w, 'C', m.R)].filter((k) => empty(w, k))), ls: m.lsC, ...P });
      v.strip = 'SETUP · CYAN 2 · AMBER 0 SEEN';
      v.hasBack = true; v.hPad = '0'; v.hBack = m.mode === 'ladder' ? go({ scr: 'ladder' }) : go({ scr: 'home', tab: 'play' });
      v.stDesc = m.mode === 'practice' ? 'A simple rival. It fires gliders at towers it has seen and never defends. Nothing is saved.' : RUNGS[m.rung!]!.d + ' It sees only what its towers light.';
      const rec = prog.rec[m.rung!] || { tries: 0 };
      v.stNote = m.mode === 'practice' ? 'The outlines on the right are where Amber starts. Starts are mirrored, so you know them.' : (m.rung! >= 4 ? 'This rung uses the new rule too. ' : 'This rung ignores the new rule; you can use it. ') + (rec.tries ? `Tries so far: ${rec.tries}.` : 'Win once to open the next rung.');
    }
    if (scr === 'match' && m) {
      const w = m.w, act = m.phase === 'act', vis = lit(w, 'C', m.R), pend = act ? m.pend.C : [], dots = new Set<number>();
      pend.forEach((p) => { if (p.t !== 'g') return; let x = p.x + p.dx, y = p.y + p.dy, n = 0; while (inb(x, y) && n < 14 && vis.has(K(x, y)) && empty(w, K(x, y)) && !pend.some((q) => q.x === x && q.y === y)) { dots.add(K(x, y)); x += p.dx; y += p.dy; n++; } });
      const zone = act && !m.ended ? new Set([...lit(w, 'C', m.R, m.snap.C)].filter((k) => empty(w, k))) : null, dirs = m.rule === 'diag' ? D8 : D4;
      v.bd = board({ w, fog: 'C', R: m.R, zone, pend, dots, ls: m.lsC, flash: m.phase === 'run', aim: s.aim && port && m.lastG && act ? m.lastG : null, dirs, ...P, onCell: (x, y) => this.cellMatch(x, y), onAim: (dx, dy) => { this.setDir([dx, dy]); this.setState({ aim: false }); } });
      const seen = towers(w, 'A').filter((k) => vis.has(k)).length, mine = towers(w, 'C').length;
      v.strip = `STEP ${w.step} · CYAN ${mine} · AMBER ${seen} SEEN`;
      v.hasRight = true; v.hRight = '···'; v.hRightClick = () => this.setState({ sheet: 'menu' });
      const left = this.pts(), n = this.next();
      v.pAct = act && !m.ended; v.pRun = m.phase === 'run';
      v.pieces = ([['g', 'GLIDER', 'GLIDER', m.cost], ['s', 'SQUARE', 'SQ', 1], ['t', 'TOWER', 'TWR', 4]] as [Piece, string, string, number][]).map(([id, n1, sh, c]) => ({ label: `${n1} · ${c}`, short: sh, on: s.piece === id, click: () => this.setState({ piece: id, aim: false }) }));
      const order: [number, number][] = dirs === D8 ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[-1, 0], [0, -1], [0, 1], [1, 0]];
      v.arrows = order.map((d) => ({ t: AR[d[0] + ',' + d[1]], d, on: s.dir[0] === d[0] && s.dir[1] === d[1], click: () => this.setDir(d) }));
      const first = w.step === 0, rulesLine = `NEW RULE THIS MATCH: ${RULES[m.rule].toUpperCase().replace(/\.$/, '')}`;
      v.msg = first ? 'Setup. Spend 8 points in the lit area near your towers. Nothing moves until you end your turn; then both sides\' pieces appear at once.' : (seen ? 'Your turn. ' : "Your turn. You can't see Amber's towers now; the outlines are where you last saw them. ") + 'Spend 8 points in the lit area, then end your turn. Tap a piece you placed to take it back.';
      if (pend.length && !first) v.msg = `Placed: ${pend.map((p) => (p.t === 'g' ? 'glider' : p.t === 's' ? 'square' : 'tower')).join(', ')}. The dotted line is your glider's path until it leaves your sight. Tap a piece to take it back.`;
      v.ruleLine = rulesLine;
      v.ptsTxt = `${left} OF 8 PTS LEFT`; v.ptsShort = `${left} PTS`; v.endLabel = 'END TURN'; v.endTurn = () => this.endTurn();
      v.runHead = n >= MAXS ? 'NO MORE TURNS · ENDS AT STEP 96' : `NEXT TURN AT STEP ${n}`;
      v.runMsg = 'Steps move on their own. You see only what your towers light; a white flash is a hit.';
      v.ffLabel = m.ff ? 'FAST-FORWARDING…' : n >= MAXS ? 'FAST-FORWARD TO THE END' : `FAST-FORWARD TO STEP ${n}`; v.ffShort = m.ff ? '▸▸ …' : '▸▸ FAST'; v.ffDim = false;
      v.ffClick = () => { if (!m.ff) { m.ff = true; this.runT(); this.bump(); } };
      v.leaveLabel = m.mode === 'practice' ? 'Back to Play' : 'Leave';
      v.askResign = () => this.setState({ sheet: 'resign' }); v.askLeave = () => (m.mode === 'practice' ? this.leave() : this.setState({ sheet: 'leave' }));
      v.resignText = m.mode === 'ladder' ? `It counts as a loss on rung ${m.rung}. You keep every rung you've already opened. In the book, players resign when they see the end coming (c4-b141).` : 'It counts as a loss. Nothing is saved.';
      v.resign = () => this.resign(); v.leave = () => this.leave();
      v.leaveTitle = 'Leave this match?'; v.leaveText = 'Leaving counts as resigning.';
    }
    if (scr === 'result' && m && m.res) {
      const r = m.res;
      v.bd = board({ w: m.w, ...P }); v.strip = `STEP ${m.w.step} · WHOLE BOARD SHOWN`;
      v.resB = r.win === 'C' ? 'You win' : r.win === 'D' ? 'Draw' : 'Amber wins'; v.resWhy = r.why;
      v.resNote = m.mode === 'ladder' && r.win !== 'C' ? (r.win === 'D' ? "Draws don't open the next rung." : '') : '';
      v.resCard = m.mode === 'ladder' && r.win === 'C' && (!!m.newOpen || m.rung === 5);
      if (v.resCard) { if (m.rung! < 5) { v.resCardN = String(m.rung! + 1); v.resCardT = `Rung ${m.rung! + 1} · ${RUNGS[m.rung! + 1]!.n} is open`; v.resCardD = RUNGS[m.rung! + 1]!.d; } else { v.resCardN = '✓'; v.resCardT = "You've beaten every rung"; v.resCardD = 'Replay any of them from the ladder.'; } }
      const P1 = (label: string, click: () => void): Btn => ({ label, click, primary: true }), S1 = (label: string, click: () => void): Btn => ({ label, click });
      const watch = S1('WATCH IT AGAIN', () => this.openReplay()), done = S1('DONE', go({ scr: 'home', tab: 'play' }));
      if (m.mode === 'practice') v.resBtns = [P1('PLAY AGAIN', () => this.openStart('practice')), watch, done];
      else v.resBtns = [r.win === 'C' && m.rung! < 5 ? P1(`PLAY RUNG ${m.rung! + 1}`, () => { this.setState({ rungSel: m.rung! + 1 }); this.openStart('ladder', m.rung! + 1); }) : P1(r.win === 'C' ? 'PLAY RUNG 5 AGAIN' : `TRY RUNG ${m.rung} AGAIN`, () => this.openStart('ladder', m.rung)), watch, S1('THE LADDER', go({ scr: 'ladder' }))];
    }
    if (scr === 'replay' && this.rp) {
      const r = this.rp, w = r.hist[r.i]; v.bd = board({ w, flash: true, ...P }); v.strip = `REPLAY · STEP ${w.step} OF ${r.hist[r.hist.length - 1].step} · WHOLE BOARD`;
      v.rpEnd = r.hist[r.hist.length - 1].step; v.hasBack = true; v.hPad = '0'; v.hBack = go({ scr: 'result' }); v.hTitle = 'Watch it again';
      v.rpBtns = ([['◁ STEP', () => { r.playing = false; r.i = Math.max(0, r.i - 1); this.bump(); }], [r.playing ? 'PAUSE' : 'PLAY', () => { if (r.i >= r.hist.length - 1) r.i = 0; r.playing = !r.playing; if (r.playing) this.rpT(); this.bump(); }], ['STEP ▷', () => { r.playing = false; r.i = Math.min(r.hist.length - 1, r.i + 1); this.bump(); }], ['TO STEP 0', () => { r.playing = false; r.i = 0; this.bump(); }]] as [string, () => void][]).map(([label, click]) => ({ label, click }));
      v.rpDone = go({ scr: 'result' });
    }
    if (scr === 'free' && f) {
      const w = f.hist[f.i], R = f.sight2 ? 2 : 3, dirs = f.diag ? D8 : D4;
      v.bd = board({ w, fog: f.see === 'all' ? null : f.see, R, flash: f.i > 0, aim: s.aim && port && f.lastG && f.i === 0 ? f.lastG : null, dirs, ...P, onCell: (x, y) => this.cellFree(x, y), onAim: (dx, dy) => { this.setDir([dx, dy]); this.setState({ aim: false }); } });
      v.strip = `STEP ${w.step} · SEE ${f.see === 'all' ? 'ALL' : f.see === 'C' ? 'AS CYAN' : 'AS AMBER'}`;
      v.hasBack = true; v.hPad = '0'; v.hBack = go({ scr: 'home', tab: 'play' }); v.hTitle = 'Free play'; v.hTitleCaps = 'FREE PLAY'; v.hasRight = true; v.hRight = s.sheet === 'opts' ? 'BOARD ▴' : 'BOARD ▾'; v.fsRight = '▾';
      v.hRightClick = () => { this.fpStop(); this.setState({ sheet: 'opts' }); };
      const ctl: [string, () => void][] = [['◁ STEP', () => { this.fpStop(); f.i = Math.max(0, f.i - 1); this.bump(); }], [f.playing ? 'PAUSE' : 'PLAY', () => this.fpPlay()], ['STEP ▷', () => { this.fpStop(); this.fpFwd(); }], ['TO STEP 0', () => { this.fpStop(); f.i = 0; this.bump(); }]];
      v.fpBtns = ctl.map(([label, click]) => ({ label, click }));
      const sideN: Record<string, string> = { C: 'CYAN', A: 'AMBER', R: 'ROCK' }, pieceN: Record<string, string> = { g: 'GLIDER', s: 'SQUARE', t: 'TOWER', e: 'ERASE' };
      const nextSide: Record<string, Side | 'R'> = { C: 'A', A: 'R', R: 'C' }, nextPiece: Record<string, Piece | 'e'> = { g: 's', s: 't', t: 'e', e: 'g' };
      v.fpBtnsFS = ([['◁', ctl[0][1]], [f.playing ? '❚❚' : '▶', ctl[1][1]], ['▷', ctl[2][1]], ['0', ctl[3][1]], [sideN[f.side], () => { f.side = nextSide[f.side]; this.bump(); }], [pieceN[f.piece].slice(0, 4), () => { f.piece = nextPiece[f.piece]; this.bump(); }]] as [string, () => void][]).map(([label, click]) => ({ label, click }));
      v.fpSides = ([['C', 'CYAN', COL.C], ['A', 'AMBER', COL.A], ['R', 'ROCK', '#3A3B42']] as [Side | 'R', string, string][]).map(([id, label, sw]) => ({ label, sw, on: f.side === id, click: () => { f.side = id; this.bump(); } }));
      v.fpPieces = (['g', 's', 't', 'e'] as (Piece | 'e')[]).map((id) => ({ label: pieceN[id], on: f.piece === id, click: () => { f.piece = id; this.bump(); } }));
      const order: [number, number][] = f.diag ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[-1, 0], [0, -1], [0, 1], [1, 0]];
      v.arrows = order.map((d) => ({ t: AR[d[0] + ',' + d[1]], d, on: s.dir[0] === d[0] && s.dir[1] === d[1], click: () => this.setDir(d) }));
      v.fpStarts = ([['Empty board', () => { this.loadFree('empty'); this.setState({ sheet: null }); }, true], ['Practice start', () => { this.loadFree(null); this.setState({ sheet: null }); }, true], ['My last match', () => { if (this.lastStart) { this.loadFree(null, this.lastStart); this.setState({ sheet: null }); } else this.say('Play a match first.'); }, !!this.lastStart]] as [string, () => void, boolean][]).map(([label, click, ok]) => ({ label, click, ok }));
      v.fpRules = ([['Gliders may also fly diagonally', 'diag'], ['Sight of 2 squares', 'sight2']] as [string, 'diag' | 'sight2'][]).map(([label, id]) => ({ label, on: f[id], v: f[id] ? 'ON' : 'OFF', click: () => { f[id] = !f[id]; if (id === 'diag' && !f.diag && s.dir[0] && s.dir[1]) this.setState({ dir: [1, 0] }); this.bump(); } }));
      v.fpSee = ([['ALL', 'all'], ['CYAN', 'C'], ['AMBER', 'A']] as [string, 'all' | Side][]).map(([label, id]) => ({ label, on: f.see === id, click: () => { f.see = id; this.bump(); } }));
      v.copyLink = () => this.copyLink();
    }
    return v;
  }
}

export interface Btn { label: string; click: () => void; primary?: boolean }
export interface PlayView {
  L: { dir: string; cs: number; bflex: string; bpad: string; pflex: string; pw: string; pbl: string; colMax: string; colBd: string };
  signed: boolean; signedOut: boolean; port: boolean; desk: boolean; fs: boolean;
  sHome: boolean; tPlay: boolean; tLearn: boolean; sLadder: boolean; sPerson: boolean; sBoard: boolean;
  tabs: { label: string; on: boolean; click: () => void }[];
  openLearn: () => void;
  openPractice: () => void; openLadder: () => void; openPerson: () => void; goHome: () => void;
  ladTag: string; signIn: () => void;
  toastOn: boolean; toast: string; closeSheet: () => void;
  sheetOn: boolean; shMenu: boolean; shResign: boolean; shLeave: boolean; shOpts: boolean;
  enterFS: () => void; exitFS: () => void; togglePanel: () => void; panelLabel: string;
  fsBtn: boolean; hdrLight: boolean; hdrDark: boolean; panelOn: boolean;
  pStart: boolean; pAct: boolean; pRun: boolean; pResult: boolean; pReplay: boolean; pFree: boolean;
  hasBack: boolean; hBack?: () => void; hasRight: boolean; hPad: string; hTitle: string; hTitleCaps: string; hRight: string; hRightClick: () => void; fsRight: string; strip: string;
  bd: BoardView;
  arrows: { t: string; d: [number, number]; on: boolean; click: () => void }[];
  pieces: { label: string; short: string; on: boolean; click: () => void }[];
  begin: () => void;
  rungs: { n: number; name: string; desc: string; icon: string; open: boolean; won: boolean; sel: boolean; r1: string; r2: string; click: () => void }[];
  playRungLabel: string; playRung: () => void;
  ruleText?: string; stDesc?: string; stNote?: string;
  msg?: string; ruleLine?: string; ptsTxt?: string; ptsShort?: string; endLabel?: string; endTurn?: () => void;
  runHead?: string; runMsg?: string; ffLabel?: string; ffShort?: string; ffDim?: boolean; ffClick?: () => void;
  leaveLabel?: string; askResign?: () => void; askLeave?: () => void; resignText?: string; resign?: () => void; leave?: () => void; leaveTitle?: string; leaveText?: string;
  resA?: string; resB?: string; resWhy?: string; resNote?: string; resCard?: boolean; resCardN?: string; resCardT?: string; resCardD?: string; resBtns?: Btn[];
  rmShow?: boolean; rmText?: string; rmTime?: string;
  rpEnd?: number; rpBtns?: Btn[]; rpDone?: () => void;
  fpBtns?: Btn[]; fpBtnsFS?: Btn[]; fpSides?: { label: string; sw: string; on: boolean; click: () => void }[]; fpPieces?: { label: string; on: boolean; click: () => void }[];
  fpStarts?: { label: string; click: () => void; ok: boolean }[]; fpRules?: { label: string; on: boolean; v: string; click: () => void }[]; fpSee?: { label: string; on: boolean; click: () => void }[]; copyLink?: () => void;
}
export { fmt };
