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
  AR, COL, D4, D8, RULES, RUNGS as OLD_RUNGS, SEARCH_RUNGS, K, clone, empty, fmt, lit, rng, step, world,
  type Piece, type RuleId, type Placement, type Side, type World,
} from './game';
import { board, type BoardOpts, type BoardView } from './board';
import { drawRules, verdict, type Engine, type Kills } from '../versions/engine';
import type { Settings } from '../versions/schema';
import { LADDER, PLAY, RULESETS, SOLO_V1_ENGINE, engineFor, rulesetOfRules, settingsFor, usesSearch, type RulesetId, type VersionRules } from '../versions/solo-v1';
import { searchPlan } from '../versions/search';

/** The ladder Play offers (owner, 2026-10-31): the search computer's, six rungs; the old one is kept as history. */
const RUNGS = SEARCH_RUNGS;
/** A match's own ladder: the search computer's under ruleset 3, the old five rungs under the old players. */
const ladderOf = (v: VersionRules) => (usesSearch(v) ? { R: SEARCH_RUNGS, top: 6 } : { R: OLD_RUNGS, top: 5 });
import type { LadderProgress } from './live-types';
import { checkPlacements, type LiveMatch } from '../play-server/match';

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
  /** The drawn rule's id ('' when the version draws none). */
  rule: string;
  /** Sight, turn spacing and glider cost in force (kept as Design named them; `s` has every setting). */
  R: number;
  every: number;
  cost: number;
  /** The version played (Play today unless one was given), its engine, and the settings in force. */
  ver: VersionRules;
  e: Engine;
  s: Settings;
  /** The drawn rule in force, and the version's second one and its settings (from step `s.switchAt`). */
  drawn: { id: string; text: string } | null;
  next2: { drawn: { id: string; text: string }; s: Settings } | null;
  /** The step the latest turn to act began at. */
  turnAt: number;
  /** Points each side kept from earlier turns (a version's carryOver), and towers each side destroyed. */
  saved: Record<Side, number>;
  kills: Kills;
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
  onLadderResult?(r: { rung: number; win: Side | 'D'; step: number; ruleset: number }): void;
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

  /** A new match: Play today (PLAY, the newest ruleset), or the version or ruleset given (and then the computer player's level and the seed, if given). */
  mk(mode: Mode, rung?: number, opts: { version?: VersionRules; lvl?: number; seed?: number } = {}): Match {
    // Practice and the ladder play the search computer (ruleset 3); anything else Play today.
    const ver = opts.version ?? (mode === 'practice' || mode === 'ladder' ? LADDER : PLAY), seed = opts.seed ?? (this.env.now() % 1e6) | 0, r = rng(seed);
    // The match's first random number draws its rule, as Design's mk does; the rest are the computer's.
    const { first, second, s1, s2 } = drawRules(ver, r), e = engineFor(ver, s1);
    const drawn = first && { id: first.id, text: first.text };
    // Under the search computer, rung n plays search level n - 1 (rung 1 is the beginner, level 0; so is practice).
    const lvl = opts.lvl ?? (mode === 'practice' ? 0 : mode === 'ladder' ? (usesSearch(ver) ? rung! - 1 : rung!) : 3);
    const m: Match = {
      mode, rung, lvl, rule: first?.id ?? '', R: s1.sight, every: s1.every, cost: s1.costGlider, ver, e, s: s1, drawn,
      next2: second && s2 ? { drawn: { id: second.id, text: second.text }, s: s2 } : null, turnAt: 0, saved: { C: 0, A: 0 }, kills: { C: 0, A: 0 },
      rng: r, w: e.world(s1), hist: [], phase: 'pre', pend: { C: [], A: [] }, snap: { C: [], A: [] }, lsC: {}, lsA: {}, ended: false, oppEnded: false, clock: null, res: null,
    };
    // Starts are mirrored, so each side knows where the other's towers began.
    e.L.towers.A.forEach((k) => (m.lsC[k] = 0)); e.L.towers.C.forEach((k) => (m.lsA[k] = 0));
    m.hist.push(e.clone(m.w));
    return m;
  }
  openStart(mode: Mode, rung?: number, opts?: { version?: VersionRules; lvl?: number }) { this.env.clearInterval(this.rt); this.m = this.mk(mode, rung, opts); this.setState({ scr: 'start', fs: false, sheet: null }); }
  /** This turn's points for a side: the setup's or a later turn's, plus any kept. */
  budget(o: Side = 'C') { const m = this.m!; return (m.w.step === 0 ? m.s.setupPoints : m.s.points) + m.saved[o]; }
  begin() { this.beginAct(); this.setState({ scr: 'match', piece: 'g', dir: [1, 0], aim: false }); }
  /**
   * Carry on a practice match from elsewhere (the Farcaster snap's "Keep playing in the app",
   * owner 2026-10-21): its seed and Cyan's placements for every finished turn, replayed on this
   * match's own rng exactly as if they had been played here, each turn checked by the server's
   * checkPlacements, against the same computer level (0 Practice, 1–5 the rungs' players; still a
   * practice match, nothing recorded). Lands on the next turn to act (or the result). False if a
   * turn is refused. `numbers`: the match's extra rule and the numbers it sets, from the drawn rule,
   * when the snap's player picked a rule or played a version (snap/versions.ts settings; a challenge
   * link starts here with no turns). The rng is the same either way: mk has drawn its first number.
   * Play's board only (the snap's versions are Play with a rule picked and numbers changed).
   */
  continueMatch(seed: number, turns: { t: Piece; x: number; y: number; dx: number; dy: number }[][], lvl = 0, numbers?: (drawn: RuleId) => { rule: RuleId; R: number; every: number; cost: number }, rs: RulesetId = 1): boolean {
    // A link made before rulesets were numbered carries none: it replays under 1, the rules it was made with.
    this.env.clearInterval(this.rt);
    const m = this.mk('practice', undefined, { seed, lvl, version: RULESETS[rs] });
    if (numbers) {
      const n = numbers(m.rule as RuleId);
      Object.assign(m, n);
      m.s = { ...settingsFor(RULESETS[rs], n.rule), sight: n.R, reach: n.R, every: n.every, costGlider: n.cost };
      m.drawn = { id: n.rule, text: RULES[n.rule] };
    }
    this.m = m;
    this.beginAct();
    for (const turn of turns) {
      try {
        m.pend.C = checkPlacements(m as unknown as LiveMatch, 'C', turn);
      } catch {
        this.m = null;
        return false;
      }
      this.applyTurn();
      while (m.phase === 'run') this.runTick();
      if (m.phase === 'over') return true;
    }
    this.setState({ scr: 'match', piece: 'g', dir: [1, 0], aim: false });
    return true;
  }
  beginAct() {
    const m = this.m!, w = m.w;
    if (m.next2 && w.step >= m.s.switchAt) { m.s = m.next2.s; m.drawn = m.next2.drawn; m.rule = m.drawn.id; m.R = m.s.sight; m.every = m.s.every; m.cost = m.s.costGlider; m.next2 = null; }
    m.phase = 'act'; m.turnAt = w.step; m.snap = { C: m.e.towers(w, 'C'), A: m.e.towers(w, 'A') }; m.pend = { C: [], A: [] }; m.ended = m.oppEnded = false; m.lastG = null; m.ff = false;
    m.pend.A = usesSearch(m.ver)
      // The search computer plans from Amber's view only, with the match's own numbers, so a replay plays the same.
      ? (searchPlan({ e: m.e, s: m.s, o: 'A', view: m.e.fog(w, m.s, 'A'), lastSeen: { ...m.lsA }, snap: m.snap.A, points: this.budget('A'), rng: m.rng, level: m.lvl }).placements as Placement[])
      : m.e.botPlan({ w, s: m.s, lvl: m.lvl, rng: m.rng, budget: this.budget('A'), snap: m.snap, lsA: m.lsA, diag: m.s.directions === 8 });
    this.setState({ aim: false });
  }
  startRun() {
    const m = this.m; if (!m || m.phase !== 'act') return;
    this.applyTurn(); m.clock = null; this.setState({ aim: false }); this.runT();
  }
  /** Both sides' placements appear, and the run begins (points kept for later turns first). */
  private applyTurn() {
    const m = this.m!;
    const left = { C: this.budget('C'), A: this.budget('A') };
    for (const o of ['C', 'A'] as const) m.saved[o] = Math.min(m.s.carryOver, left[o] - m.pend[o].reduce((n, p) => n + m.e.cost(m.s, p.t), 0));
    m.e.apply(m.w, m.s, m.pend); this.updLS(); m.hist[m.hist.length - 1] = m.e.clone(m.w); m.phase = 'run';
  }
  private updLS() { const m = this.m!; m.e.updLS(m.w, m.s.sight, { C: m.lsC, A: m.lsA }); }
  runT() { this.env.clearInterval(this.rt); this.rt = this.env.setInterval(() => this.runTick(), this.m!.ff ? 40 : 170); }
  runTick() {
    const m = this.m; if (!m || m.phase !== 'run') { this.env.clearInterval(this.rt); return; } if (m.paused) return;
    m.e.step(m.w, m.s, m.kills); this.updLS(); m.hist.push(m.e.clone(m.w));
    if (this.checkEnd()) return;
    if (m.w.step - m.turnAt >= m.s.every) { this.env.clearInterval(this.rt); this.beginAct(); }
    this.bump();
  }
  checkEnd() {
    const m = this.m!, w = m.w, c = m.e.towers(w, 'C').length, a = m.e.towers(w, 'A').length, n = w.step, last = m.s.maxSteps; let win: Side | 'D', why: string;
    const v = verdict(m.e, w, m.s, m.kills);
    if (!v) return false;
    if (m.s.win === 'first-blood' && (m.kills.C || m.kills.A)) { win = v; why = v === 'D' ? `Both sides destroyed a tower at step ${n}.` : v === 'C' ? `You destroyed a tower first, at step ${n}.` : `Amber destroyed a tower first, at step ${n}.`; }
    else if (!c && !a) { win = 'D'; why = `Both sides lost their last tower at step ${n}.`; }
    else if (!c) { win = 'A'; why = `Your last tower fell at step ${n}.`; }
    else if (!a) { win = 'C'; why = `Amber's last tower fell at step ${n}.`; }
    else { win = v; why = `Time ran out at step ${last}. Amber had ${a} tower${a === 1 ? '' : 's'}, you had ${c}.`; }
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
      const opened = win === 'C' ? Math.max(prog.opened, Math.min(ladderOf(m.ver).top, rung + 1)) : prog.opened;
      m.newOpen = opened > prog.opened; prog = { ...prog, rec, opened };
      this.hooks.onLadderResult?.({ rung, win, step: m.w.step, ruleset: rulesetOfRules(m.ver) ?? 1 });
    }
    // Free play's "My last match" is Play's board, so only a Play-sized match can be loaded there.
    if (m.e === SOLO_V1_ENGINE) this.lastStart = m.hist[0];
    this.set({ scr: 'result', fs: false, sheet: null, aim: false, prog });
  }
  resign() { this.finish('A', `You resigned at step ${this.m!.w.step}. It counts as a loss.`, 'resign'); }
  leave() {
    const m = this.m!;
    if (m.mode === 'practice') { this.env.clearInterval(this.rt); this.m = null; this.setState({ scr: 'home', tab: 'play', sheet: null, fs: false }); return; }
    this.finish('A', `You left at step ${m.w.step}. Leaving counts as resigning.`, 'left');
  }
  pts() { const m = this.m!; return this.budget('C') - m.pend.C.reduce((s, p) => s + m.e.cost(m.s, p.t), 0); }
  next() { const m = this.m!; return m.turnAt + m.s.every; }
  cellMatch(x: number, y: number) {
    const m = this.m; if (!m) return; const k = K(x, y);
    if (m.paused) return;
    if (m.phase === 'run') { const n = this.next(); this.say(n >= m.s.maxSteps ? `Your last turn to act is over. The match ends at step ${m.s.maxSteps}.` : `Your turn to act is over. The next one is at step ${n}.`); return; }
    if (m.phase !== 'act') return;
    const i = m.pend.C.findIndex((p) => K(p.x, p.y) === k);
    if (i >= 0) { const p = m.pend.C.splice(i, 1)[0]; if (p === m.lastG) m.lastG = null; m.ended = false; this.setState({ aim: false }); this.bump(); return; }
    if (m.ended) { this.say('Tap CHANGE MY TURN to place more.'); return; }
    if (!m.e.lit(m.w, 'C', m.s.reach, m.snap.C).has(k)) { this.say(`Place in the lit area: within ${m.s.reach} squares of a tower you had when this turn began.`); return; }
    if (!m.e.empty(m.w, k)) { this.say('That square is taken.'); return; }
    const pc = this.state.piece, c = m.e.cost(m.s, pc);
    if (this.pts() < c) { this.say('Not enough points left this turn.'); return; }
    if (pc === 't' && m.s.maxTowers && m.e.towers(m.w, 'C').length + m.pend.C.filter((p) => p.t === 't').length >= m.s.maxTowers) { this.say(`This version allows at most ${m.s.maxTowers} towers.`); return; }
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
    v.rungs = [6, 5, 4, 3, 2, 1].map((n) => {
      const rec = prog.rec[n] || { tries: 0 }, open = n <= prog.opened, won = !!rec.won, isSel = open && n === sel;
      return { n, name: `${n} · ${RUNGS[n]!.n}`, desc: RUNGS[n]!.d, icon: won ? '✓' : String(n), open, won, sel: isSel,
        r1: won ? 'WON IN' : open ? (rec.tries ? `${rec.tries} TR${rec.tries === 1 ? 'Y' : 'IES'}` : '') : 'CLOSED', r2: won ? `${rec.won} STEPS` : open ? 'PLAY →' : '',
        click: () => (open ? this.setState({ rungSel: n }) : this.say(`Win rung ${n - 1} (${RUNGS[n - 1]!.n}) to open this one.`)) };
    });
    v.playRungLabel = `PLAY RUNG ${sel}`; v.playRung = () => this.openStart('ladder', sel);
    const title = (mm: Match): [string, string] => (mm.mode === 'practice' ? ['Practice match', ''] : [`Rung ${mm.rung} · ${ladderOf(mm.ver).R[mm.rung!]!.n}`, '']);
    if (m && ['start', 'match', 'result', 'replay'].includes(scr)) { const [a, b] = title(m); v.hTitle = a + b; v.hTitleCaps = (a + b).toUpperCase(); v.ruleText = m.drawn?.text ?? 'No new rule this match.'; }
    if (scr === 'start' && m) {
      const w = m.w; v.bd = board({ w, e: m.e, fog: 'C', R: m.s.sight, zone: new Set([...m.e.lit(w, 'C', m.s.reach)].filter((k) => m.e.empty(w, k))), ls: m.lsC, ...P });
      v.strip = `SETUP · CYAN ${m.e.towers(w, 'C').length} · AMBER 0 SEEN`;
      v.hasBack = true; v.hPad = '0'; v.hBack = m.mode === 'ladder' ? go({ scr: 'ladder' }) : go({ scr: 'home', tab: 'play' });
      v.stDesc = m.mode === 'practice' ? (usesSearch(m.ver) ? `${RUNGS[1]!.d} It sees only what its towers light. Nothing is saved.` : 'A simple rival. It fires gliders at towers it has seen and never defends. Nothing is saved.') : ladderOf(m.ver).R[m.rung!]!.d + ' It sees only what its towers light.';
      const rec = prog.rec[m.rung!] || { tries: 0 };
      v.stNote = m.mode === 'practice' ? 'The dimmed towers on the right are where Amber starts. Starts are mirrored, so you know them.' : ruleNote(m.rule, m.rung!, m.s.directions === 8) + (rec.tries ? `Tries so far: ${rec.tries}.` : 'Win once to open the next rung.');
    }
    if (scr === 'match' && m) {
      const e = m.e, w = m.w, act = m.phase === 'act', vis = e.lit(w, 'C', m.s.sight), pend = act ? m.pend.C : [], dots = new Set<number>();
      pend.forEach((p) => { if (p.t !== 'g') return; let x = p.x + p.dx, y = p.y + p.dy, n = 0; while (e.inb(x, y) && n < 14 && vis.has(e.K(x, y)) && e.empty(w, e.K(x, y)) && !pend.some((q) => q.x === x && q.y === y)) { dots.add(e.K(x, y)); x += p.dx; y += p.dy; n++; } });
      const zone = act && !m.ended ? new Set([...e.lit(w, 'C', m.s.reach, m.snap.C)].filter((k) => e.empty(w, k))) : null, dirs = m.s.directions === 8 ? D8 : D4;
      v.bd = board({ w, e, fog: 'C', R: m.s.sight, zone, pend, dots, ls: m.lsC, flash: m.phase === 'run', aim: s.aim && port && m.lastG && act ? m.lastG : null, dirs, ...P, onCell: (x, y) => this.cellMatch(x, y), onAim: (dx, dy) => { this.setDir([dx, dy]); this.setState({ aim: false }); } });
      const seen = e.towers(w, 'A').filter((k) => vis.has(k)).length, mine = e.towers(w, 'C').length;
      v.strip = `STEP ${w.step} · CYAN ${mine} · AMBER ${seen} SEEN`;
      v.hasRight = true; v.hRight = '···'; v.hRightClick = () => this.setState({ sheet: 'menu' });
      const left = this.pts(), n = this.next(), budget = this.budget('C'), last = m.s.maxSteps;
      v.pAct = act && !m.ended; v.pRun = m.phase === 'run';
      v.pieces = ([['g', 'GLIDER', 'GLIDER', m.s.costGlider], ['s', 'SQUARE', 'SQ', m.s.costSquare], ['t', 'TOWER', 'TWR', m.s.costTower]] as [Piece, string, string, number][]).map(([id, n1, sh, c]) => ({ label: `${n1} · ${c}`, short: sh, on: s.piece === id, click: () => this.setState({ piece: id, aim: false }) }));
      const order: [number, number][] = dirs === D8 ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[-1, 0], [0, -1], [0, 1], [1, 0]];
      v.arrows = order.map((d) => ({ t: AR[d[0] + ',' + d[1]], d, on: s.dir[0] === d[0] && s.dir[1] === d[1], click: () => this.setDir(d) }));
      const first = w.step === 0, rulesLine = m.drawn ? `NEW RULE THIS MATCH: ${m.drawn.text.toUpperCase().replace(/\.$/, '')}` : 'NO NEW RULE THIS MATCH';
      v.msg = first ? `Setup. Spend ${budget} points in the lit area near your towers. Nothing moves until you end your turn; then both sides' pieces appear at once.` : (seen ? 'Your turn. ' : "Your turn. You can't see Amber's towers now; the dimmed ones are where you last saw them. ") + `Spend ${budget} points in the lit area, then end your turn. Tap a piece you placed to take it back.`;
      if (pend.length && !first) v.msg = `Placed: ${pend.map((p) => (p.t === 'g' ? 'glider' : p.t === 's' ? 'square' : 'tower')).join(', ')}. The dotted line is your glider's path until it leaves your sight. Tap a piece to take it back.`;
      v.ruleLine = rulesLine;
      v.ptsTxt = `${left} OF ${budget} PTS LEFT`; v.ptsShort = `${left} PTS`; v.endLabel = 'END TURN'; v.endTurn = () => this.endTurn();
      v.runHead = n >= last ? `NO MORE TURNS · ENDS AT STEP ${last}` : `NEXT TURN AT STEP ${n}`;
      v.runMsg = 'Steps move on their own. You see only what your towers light; a white flash is a hit.';
      v.ffLabel = m.ff ? 'FAST-FORWARDING…' : n >= last ? 'FAST-FORWARD TO THE END' : `FAST-FORWARD TO STEP ${n}`; v.ffShort = m.ff ? '▸▸ …' : '▸▸ FAST'; v.ffDim = false;
      v.ffClick = () => { if (!m.ff) { m.ff = true; this.runT(); this.bump(); } };
      v.leaveLabel = m.mode === 'practice' ? 'Back to Play' : 'Leave';
      v.askResign = () => this.setState({ sheet: 'resign' }); v.askLeave = () => (m.mode === 'practice' ? this.leave() : this.setState({ sheet: 'leave' }));
      v.resignText = m.mode === 'ladder' ? `It counts as a loss on rung ${m.rung}. You keep every rung you've already opened. In the book, players resign when they see the end coming (c4-b141).` : 'It counts as a loss. Nothing is saved.';
      v.resign = () => this.resign(); v.leave = () => this.leave();
      v.leaveTitle = 'Leave this match?'; v.leaveText = 'Leaving counts as resigning.';
    }
    if (scr === 'result' && m && m.res) {
      const r = m.res;
      v.bd = board({ w: m.w, e: m.e, ...P }); v.strip = `STEP ${m.w.step} · WHOLE BOARD SHOWN`;
      v.resB = r.win === 'C' ? 'You win' : r.win === 'D' ? 'Draw' : 'Amber wins'; v.resWhy = r.why;
      v.resNote = m.mode === 'ladder' && r.win !== 'C' ? (r.win === 'D' ? "Draws don't open the next rung." : '') : '';
      const LM = ladderOf(m.ver);
      v.resCard = m.mode === 'ladder' && r.win === 'C' && (!!m.newOpen || m.rung === LM.top);
      // A ladder win can be shared, if the player chooses (owner, 2026-10-19); nothing is sent until they do.
      v.share = m.mode === 'ladder' && r.win === 'C' ? { rung: m.rung!, steps: r.step, rs: rulesetOfRules(m.ver) ?? 1 } : undefined;
      if (v.resCard) { if (m.rung! < LM.top) { v.resCardN = String(m.rung! + 1); v.resCardT = `Rung ${m.rung! + 1} · ${LM.R[m.rung! + 1]!.n} is open`; v.resCardD = LM.R[m.rung! + 1]!.d; } else { v.resCardN = '✓'; v.resCardT = "You've beaten every rung"; v.resCardD = 'Replay any of them from the ladder.'; } }
      const P1 = (label: string, click: () => void): Btn => ({ label, click, primary: true }), S1 = (label: string, click: () => void): Btn => ({ label, click });
      const watch = S1('WATCH IT AGAIN', () => this.openReplay()), done = S1('DONE', go({ scr: 'home', tab: 'play' }));
      if (m.mode === 'practice') v.resBtns = [P1('PLAY AGAIN', () => this.openStart('practice')), watch, done];
      else v.resBtns = [r.win === 'C' && m.rung! < LM.top ? P1(`PLAY RUNG ${m.rung! + 1}`, () => { this.setState({ rungSel: m.rung! + 1 }); this.openStart('ladder', m.rung! + 1); }) : P1(r.win === 'C' ? `PLAY RUNG ${LM.top} AGAIN` : `TRY RUNG ${m.rung} AGAIN`, () => this.openStart('ladder', m.rung)), watch, S1('THE LADDER', go({ scr: 'ladder' }))];
    }
    if (scr === 'replay' && this.rp) {
      const r = this.rp, w = r.hist[r.i]; v.bd = board({ w, e: m?.e, flash: true, ...P }); v.strip = `REPLAY · STEP ${w.step} OF ${r.hist[r.hist.length - 1].step} · WHOLE BOARD`;
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
  resA?: string; resB?: string; resWhy?: string; resNote?: string; resCard?: boolean; resCardN?: string; resCardT?: string; resCardD?: string; resBtns?: Btn[]; share?: { rung: number; steps: number; rs: RulesetId };
  rmShow?: boolean; rmText?: string; rmTime?: string;
  rpEnd?: number; rpBtns?: Btn[]; rpDone?: () => void;
  fpBtns?: Btn[]; fpBtnsFS?: Btn[]; fpSides?: { label: string; sw: string; on: boolean; click: () => void }[]; fpPieces?: { label: string; on: boolean; click: () => void }[];
  fpStarts?: { label: string; click: () => void; ok: boolean }[]; fpRules?: { label: string; on: boolean; v: string; click: () => void }[]; fpSee?: { label: string; on: boolean; click: () => void }[]; copyLink?: () => void;
}
export { fmt };

/**
 * The start screen's word on the new rule, for a ladder rung. Design's mockup said rungs 1–3
 * ignore it, but every rung pays the same glider cost, sees as far, and acts as often as you;
 * only diagonal flight is left to rungs 4 and 5 (game.ts, botPlan). Owner ruling, 2026-10-14:
 * "it never does". Model-drafted wording.
 */
export function ruleNote(rule: string, rung: number, diag = rule === 'diag') {
  return diag && rung < 4 ? 'This rung plays by the new rule too, but never flies diagonally; you can. ' : 'This rung plays by the new rule too. ';
}
