'use client';

/**
 * Matches on the page: the recorded four-player match (watched), the guided practice
 * match, and the easy match against the computer. Rules: src/lib/minpentai/match.ts
 * (all invented). Wording: tutorial-text.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATES } from '~/lib/minpentai/symbol';
import {
  NEUTRAL, PLAYER_COLOURS, advance, dist, isIntervention, newMatch, ownedSymbols, place, placeProblem, runToIntervention,
  sightMask, snap, stampCells, stepOwned, type Dir, type Match, type Placement, type StampKind,
} from '~/lib/minpentai/match';
import { knowledge, playTurn, rng } from '~/lib/minpentai/ai';
import { PLAY_SETUP, PRACTICE, PRACTICE_SETUP, WATCH_SETUP, practiceMove, watchMovesAt } from '~/lib/minpentai/matches';
import { TUTORIAL_TEXT as T } from '~/lib/minpentai/tutorial-text';

const FIELD = '#060608';
const CELL_BG = '#0E0F13';
const GRID = '#16171C';
const ROCK = '#4B4C55';
const FOG_DOT = '#17181D';
const BAD = '#FF5C8A';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- the board ---------------- */

export interface Ghost { cells: [number, number][]; tone: 'hint' | 'ok' | 'bad' }

/**
 * A match board. `viewer` null shows everything (the crowd's view); a player id shows
 * only what that player can see. Rocks are shown everywhere: the map is known.
 */
export function MatchCanvas({ match, viewer, ghosts = [], reach = false, onTap, label }: {
  match: Match;
  viewer: number | null;
  ghosts?: Ghost[];
  /** Tint the cells the viewer may put squares on. */
  reach?: boolean;
  onTap?: (x: number, y: number) => void;
  label: string;
}) {
  const { board, owners } = match;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(358);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx(Math.floor(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cell = px / board.w;
  const mask = useMemo(() => sightMask(match, viewer), [match, viewer]);
  const symbols = useMemo(() => ownedSymbols(board, owners), [board, owners]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const H = cell * board.h;
    c.width = Math.round(px * dpr);
    c.height = Math.round(H * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = FIELD;
    ctx.fillRect(0, 0, px, H);
    const symCells = new Map<number, string>();
    for (const s of symbols) {
      const colour = s.owner === null ? NEUTRAL : PLAYER_COLOURS[s.owner];
      for (const [dx, dy] of STATES[s.state].cells) symCells.set(((s.y + dy) % board.h) * board.w + ((s.x + dx) % board.w), colour);
    }
    const inReach = new Uint8Array(board.w * board.h);
    if (reach && viewer !== null) {
      const r = match.rules.reach;
      for (const s of match.players[viewer].sites) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        inReach[(((s.y + dy) % board.h) + board.h) % board.h * board.w + (((s.x + dx) % board.w) + board.w) % board.w] = 1;
      }
    }
    for (let y = 0; y < board.h; y++) for (let x = 0; x < board.w; x++) {
      const k = y * board.w + x, X = x * cell, Y = y * cell;
      if (!mask[k]) {
        if (board.rocks[k]) { ctx.fillStyle = ROCK; ctx.globalAlpha = 0.5; ctx.fillRect(X, Y, cell, cell); ctx.globalAlpha = 1; }
        else if ((x + y) % 2 === 0) { ctx.fillStyle = FOG_DOT; ctx.fillRect(X + cell / 2 - 1, Y + cell / 2 - 1, 2, 2); }
        continue;
      }
      ctx.fillStyle = CELL_BG;
      ctx.fillRect(X, Y, cell, cell);
      if (inReach[k]) { ctx.fillStyle = 'rgba(70, 215, 232, 0.10)'; ctx.fillRect(X, Y, cell, cell); }
      if (cell >= 6) { ctx.fillStyle = GRID; ctx.fillRect(X, Y, cell, 1); ctx.fillRect(X, Y, 1, cell); }
      if (board.rocks[k]) { ctx.fillStyle = ROCK; ctx.fillRect(X, Y, cell, cell); continue; }
      if (!board.cells[k]) continue;
      const sym = symCells.get(k);
      if (sym) { ctx.fillStyle = sym; ctx.fillRect(X, Y, cell, cell); }
      else {
        ctx.fillStyle = owners[k] ? PLAYER_COLOURS[owners[k] - 1] : NEUTRAL;
        ctx.fillRect(X + cell / 6, Y + cell / 6, cell - cell / 3, cell - cell / 3);
      }
    }
    ctx.lineWidth = Math.max(1.5, cell / 6);
    ctx.setLineDash([Math.max(3, cell / 2), Math.max(2, cell / 3)]);
    for (const s of symbols) {
      if (!mask[s.cy * board.w + s.cx]) continue;
      ctx.strokeStyle = s.owner === null ? NEUTRAL : PLAYER_COLOURS[s.owner];
      for (const ox of [s.x - 1, s.x - 1 - board.w]) for (const oy of [s.y - 1, s.y - 1 - board.h]) ctx.strokeRect(ox * cell, oy * cell, (s.w + 2) * cell, (s.h + 2) * cell);
    }
    ctx.setLineDash([]);
    for (const g of ghosts) {
      ctx.strokeStyle = g.tone === 'bad' ? BAD : g.tone === 'ok' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = Math.max(1, cell / 8);
      if (g.tone === 'hint') ctx.setLineDash([Math.max(2, cell / 3), Math.max(2, cell / 4)]);
      for (const [x, y] of g.cells) ctx.strokeRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
      ctx.setLineDash([]);
    }
  }, [board, owners, mask, symbols, px, cell, ghosts, reach, viewer, match.rules.reach, match.players]);

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onTap) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / cell), y = Math.floor((e.clientY - r.top) / cell);
    if (x >= 0 && y >= 0 && x < board.w && y < board.h) onTap(x, y);
  };

  return (
    <div ref={wrapRef} className="mp-canvas-wrap">
      <canvas
        ref={canvasRef}
        className={onTap ? 'mp-canvas mp-editing' : 'mp-canvas'}
        style={{ width: px, height: Math.round(cell * board.h) }}
        role="img"
        aria-label={label}
        onPointerDown={onDown}
      />
    </div>
  );
}

/** Sites per player for the strip: everyone's for the crowd, otherwise yours and a question mark for anyone you cannot see. */
function Counts({ match, viewer }: { match: Match; viewer: number | null }) {
  const mask = sightMask(match, viewer);
  return (
    <span className="mp-counts">
      {match.players.map((p) => {
        const visible = viewer === null || p.id === viewer || match.winner !== undefined || p.sites.some((s) => mask[s.y * match.board.w + s.x]);
        const n = viewer === null || p.id === viewer || match.winner !== undefined ? p.sites.length : p.sites.filter((s) => mask[s.y * match.board.w + s.x]).length;
        return (
          <span key={p.id} style={{ color: PLAYER_COLOURS[p.id], opacity: p.out ? 0.45 : 1 }}>
            {visible ? T.match.symbols(T.players[p.id], n) : T.match.hidden(T.players[p.id])}
          </span>
        );
      })}
    </span>
  );
}

/* ---------------- watching the recorded match ---------------- */

const withWatchMoves = (m: Match) => {
  let x = m;
  if (isIntervention(x)) for (const { player, p } of watchMovesAt(x.board.turn)) x = place(x, player, p);
  return x;
};

/** The latest thing worth saying about the match. */
function headline(m: Match): string {
  const last = [...m.events].reverse().find((e) => e.kind === 'out' || e.kind === 'end');
  if (m.winner !== undefined) return m.winner === null ? T.watch.draw : T.watch.wins(T.players[m.winner]);
  if (last && last.kind === 'out' && m.board.turn - last.turn < 40) return T.watch.out(T.players[last.player]);
  if (m.board.turn < 30) return T.watch.start;
  if (m.board.turn % m.rules.interval < 6) return T.watch.intervention;
  return '';
}

export function WatchMatch({ viewer }: { viewer: number | null }) {
  const start = useMemo(() => withWatchMoves(newMatch(WATCH_SETUP)), []);
  const [m, setM] = useState(start);
  const [playing, setPlaying] = useState(false);
  useEffect(() => setPlaying(!reducedMotion()), []);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setM((x) => (x.winner !== undefined ? x : withWatchMoves(advance(x)))), 1000 / 16);
    return () => window.clearInterval(id);
  }, [playing]);
  const over = m.winner !== undefined;
  const line = headline(m);
  return (
    <div className="mp-watch">
      <div className="mp-board">
        <div className="mp-strip">
          <span>{T.match.turn(m.board.turn)}</span>
          <Counts match={m} viewer={viewer} />
        </div>
        <MatchCanvas match={m} viewer={viewer} label={`${T.match.turn(m.board.turn)}. ${line}`} />
      </div>
      <p className="mp-caption mp-frame-caption" aria-live="polite">{line}</p>
      <div className="mp-controls">
        {over
          ? <button type="button" onClick={() => { setM(start); setPlaying(true); }}>{T.watch.again}</button>
          : <button type="button" onClick={() => setPlaying((p) => !p)}>{playing ? T.watch.pause : T.watch.play}</button>}
      </div>
    </div>
  );
}

/* ---------------- your turn: tools, ghosts, test ---------------- */

type Tool = StampKind;
const TOOLS: Tool[] = ['glider', 'mirror', 'symbol'];
const COST: Record<Tool, number> = { glider: 4, mirror: 1, symbol: 4 };
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const ARROW: Record<Dir, string> = { up: '↑', down: '↓', left: '←', right: '→' };

/** Your side of a match: what you are holding, where it would go, undo, and a private test run. */
function useYourTurn(m: Match, setM: (f: (m: Match) => Match) => void) {
  const [tool, setTool] = useState<Tool>('glider');
  const [dir, setDir] = useState<Dir>('up');
  const [pending, setPending] = useState<Placement | null>(null);
  const [history, setHistory] = useState<Match[]>([]);
  const [test, setTest] = useState<Match[] | null>(null);
  const [testAt, setTestAt] = useState(0);
  const yourTurn = isIntervention(m) && !m.players[0].out;

  // A new turn to act clears the last turn's undo list and preview.
  useEffect(() => { setHistory([]); setPending(null); }, [m.board.turn]);
  useEffect(() => {
    if (!test) return;
    if (testAt >= test.length - 1) return;
    const id = window.setTimeout(() => setTestAt((i) => i + 1), reducedMotion() ? 0 : 1000 / 16);
    return () => window.clearTimeout(id);
  }, [test, testAt]);

  const put = useCallback((p: Placement) => {
    setHistory((h) => [...h, m]);
    setM((x) => place(x, 0, p));
    setPending(null);
  }, [m, setM]);

  const onTap = (x: number, y: number) => {
    if (!yourTurn || test) return;
    const p = snap(m.board, { kind: tool, dir, x, y });
    if (pending && pending.kind === p.kind && pending.dir === p.dir && dist(m.board, pending.x, pending.y, p.x, p.y) <= 1 && !placeProblem(m, 0, pending)) put(pending);
    else setPending(p);
  };
  const problem = pending ? placeProblem(m, 0, pending) : null;
  const undo = () => { const prev = history[history.length - 1]; if (prev) { setHistory((h) => h.slice(0, -1)); setM(() => prev); setPending(null); } };
  const runTest = () => {
    if (test) { setTest(null); return; }
    // Only what you can see, with your squares this turn, 48 turns on.
    const k = knowledge(m, 0);
    const frames: Match[] = [k];
    let b = k.board, o = k.owners;
    for (let i = 0; i < 48; i++) { ({ board: b, owners: o } = stepOwned(b, o)); frames.push({ ...k, board: b, owners: o }); }
    setTest(frames);
    setTestAt(0);
  };
  const ghosts: Ghost[] = pending ? [{ cells: stampCells(m.board, pending), tone: problem ? 'bad' : 'ok' }] : [];
  const message = !yourTurn ? '' : test ? '' : pending ? (problem ? T.match.problems[problem] : T.match.tapAgain) : T.match.tapToPlace;
  return { tool, setTool, dir, setDir, pending, setPending, put, onTap, undo, canUndo: history.length > 0, startOfTurn: history[0] ?? null, runTest, test, testFrame: test ? test[testAt] : null, ghosts, message, yourTurn, setHistory };
}

function Tools({ t, m }: { t: ReturnType<typeof useYourTurn>; m: Match }) {
  if (!t.yourTurn) return null;
  return (
    <>
      <div className="mp-controls" role="group" aria-label={T.match.toolsLabel}>
        {TOOLS.map((k) => (
          <button key={k} type="button" aria-pressed={t.tool === k} disabled={!!t.test} onClick={() => { t.setTool(k); t.setPending(null); }}>
            {T.match.tools[k]} <span className="mp-cost">{T.match.toolCost(COST[k])}</span>
          </button>
        ))}
      </div>
      {t.tool === 'glider' && (
        <div className="mp-controls mp-pan" role="group" aria-label={T.match.dirsLabel}>
          {DIRS.map((d) => (
            <button key={d} type="button" aria-pressed={t.dir === d} aria-label={T.match.dirs[d]} disabled={!!t.test}
              onClick={() => { t.setDir(d); t.setPending((p) => (p && p.kind === 'glider' ? snap(m.board, { ...p, dir: d, x: p.x + 1, y: p.y + 1 }) : p)); }}>
              {ARROW[d]}
            </button>
          ))}
        </div>
      )}
      <div className="mp-controls">
        <button type="button" onClick={t.undo} disabled={!t.canUndo || !!t.test}>{T.match.undo}</button>
        <button type="button" onClick={t.runTest} aria-pressed={!!t.test}>{t.test ? T.match.stopTest : T.match.test}</button>
      </div>
    </>
  );
}

/** Runs the match until the next turn to act (or the end), at a watchable pace; a second call finishes at once. */
function useRunner(setM: (f: (m: Match) => Match) => void, onArrive: (m: Match) => Match) {
  const [running, setRunning] = useState<null | 'turn' | 'end'>(null);
  const from = useRef(0);
  const arrive = useRef(onArrive);
  arrive.current = onArrive;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setM((x) => {
        if (x.winner !== undefined) return x;
        const n = advance(x);
        return n;
      });
    }, reducedMotion() ? 10 : 1000 / 12);
    return () => window.clearInterval(id);
  }, [running, setM]);
  const check = (m: Match) => {
    if (!running) return;
    const done = m.winner !== undefined || (running === 'turn' && m.board.turn > from.current && isIntervention(m));
    if (done) { setRunning(null); setM((x) => arrive.current(x)); }
  };
  const start = (m: Match, until: 'turn' | 'end') => {
    if (running) {
      // Skip ahead.
      setRunning(null);
      setM((x) => {
        let n = x;
        if (until === 'end') { while (n.winner === undefined && n.board.turn < x.board.turn + 200) n = advance(n); }
        else n = runToIntervention(n);
        return arrive.current(n);
      });
      return;
    }
    from.current = m.board.turn;
    setRunning(until);
  };
  return { running, start, check };
}

function Dock({ label, onPrimary, children }: { label: string; onPrimary: () => void; children?: React.ReactNode }) {
  return (
    <div className="mp-dock">
      <button type="button" className="mp-one" onClick={onPrimary}>{label}</button>
      {children && <div className="mp-dock-row">{children}</div>}
    </div>
  );
}

function Strip({ m, t, running }: { m: Match; t: ReturnType<typeof useYourTurn>; running: boolean }) {
  const toAct = m.rules.interval - (m.board.turn % m.rules.interval);
  return (
    <div className="mp-strip" aria-live="polite">
      <span>{T.match.turn(m.board.turn)}</span>
      <Counts match={m} viewer={0} />
      <span className="mp-strip-full">
        {t.test ? T.match.testing : m.winner !== undefined ? '' : t.yourTurn && !running ? T.match.yourTurn(m.left[0]) : T.match.actIn(toAct)}
      </span>
    </div>
  );
}

/* ---------------- the practice match ---------------- */

export function PracticeMatch({ onDone, onSandbox }: { onDone: () => void; onSandbox: () => void }) {
  const [m, setM] = useState(() => newMatch(PRACTICE_SETUP));
  const [stepIndex, setStepIndex] = useState(0);
  const step = PRACTICE[stepIndex];
  const text = T.practice.steps[step.id];
  const t = useYourTurn(m, setM);
  const [met, setMet] = useState<null | 'you' | 'demo'>(null);
  const demo = useRef(false);
  // The rival follows its script: nothing after its setup.
  const r = useRunner(setM, (x) => x);
  useEffect(() => r.check(m), [m]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hand the visitor the right tool for each step.
  useEffect(() => {
    if (step.move) { t.setTool(step.move.kind); if (step.move.dir) t.setDir(step.move.dir); }
  }, [stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step.kind === 'do' && !met && m.board.turn === step.turn && step.goal!(m)) setMet(demo.current ? 'demo' : 'you');
  }, [m, step, met]);
  // When a run reaches the next step's turn, or the end, go on.
  useEffect(() => {
    if (r.running) return;
    const next = PRACTICE[stepIndex + 1];
    if (!next || !met) return;
    if ((next.kind === 'end' && m.winner !== undefined) || (next.kind !== 'end' && m.board.turn === next.turn)) {
      setStepIndex(stepIndex + 1); setMet(null); demo.current = false;
    }
  }, [m, r.running, stepIndex, met]);

  // Each new step brings its text and board to the top of the screen.
  const top = useRef<HTMLElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    top.current?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [stepIndex]);

  const lastDo = stepIndex === PRACTICE.length - 2;
  const onPrimary = () => {
    if (step.kind === 'end') return onDone();
    if (step.kind === 'read') { setStepIndex(stepIndex + 1); return; }
    if (r.running) return r.start(m, lastDo ? 'end' : 'turn');
    if (!met) {
      demo.current = true;
      // If the visitor's own squares are in the way, start the turn again first.
      const base = placeProblem(m, 0, step.move!) && t.startOfTurn ? t.startOfTurn : m;
      t.setHistory((h) => [...h, m]);
      setM(() => practiceMove(base, step));
      t.setPending(null);
      return;
    }
    if (t.test) t.runTest();
    r.start(m, lastDo ? 'end' : 'turn');
  };
  const label = step.kind === 'end' ? text.button : step.kind === 'read' ? T.next : r.running ? T.match.skip : met ? T.match.run : text.button;
  const shown = t.test ? t.testFrame! : m;
  const hint: Ghost[] = step.move && !met && !r.running && m.board.turn === step.turn ? [{ cells: stampCells(m.board, step.move), tone: 'hint' }] : [];

  return (
    <section ref={top} className="mp-tutorial" aria-label={T.practice.heading}>
      <div className="mp-lesson">
        <p className="mp-lesson-meta">
          {T.practice.heading} · {T.stepOf(stepIndex + 1, PRACTICE.length)} · <em className="mp-inv">{T.inventedRules}</em>
          {T.modelDrafted && <span className="mp-draft"> · {T.draftNote}</span>}
        </p>
        <h2>{text.title}</h2>
        <p className="mp-lesson-text">{text.text}</p>
      </div>
      <div className="mp-board">
        <Strip m={m} t={t} running={!!r.running} />
        <MatchCanvas
          match={shown}
          viewer={0}
          ghosts={t.test ? [] : [...hint, ...t.ghosts]}
          reach={t.yourTurn && !r.running && !t.test && step.kind === 'do'}
          onTap={step.kind === 'do' && !met ? t.onTap : undefined}
          label={`${T.match.turn(m.board.turn)}. ${text.title}`}
        />
        {step.kind === 'do' && !met && <p className="mp-hint">{t.message}</p>}
      </div>
      {step.kind === 'do' && !met && !r.running && <Tools t={t} m={m} />}
      <p className="mp-status" aria-live="polite">{met === 'you' ? T.youDidIt : met === 'demo' ? T.shown : ''}</p>
      <Dock label={label} onPrimary={onPrimary}>
        <span className="mp-dots" aria-hidden="true">
          {PRACTICE.map((s, i) => <span key={s.id} className={i === stepIndex ? 'dot on' : i < stepIndex ? 'dot past' : 'dot'} />)}
        </span>
        <button type="button" className="mp-quiet" onClick={onSandbox}>{T.freePlay}</button>
      </Dock>
    </section>
  );
}

/* ---------------- playing the computer ---------------- */

export function PlayComputer({ onSandbox }: { onSandbox: () => void }) {
  const [seed, setSeed] = useState(1);
  const random = useMemo(() => rng(seed), [seed]);
  const computer = useCallback((x: Match) => (isIntervention(x) && !x.players[1].out ? playTurn(x, 1, 'easy', random) : x), [random]);
  const [m, setM] = useState(() => newMatch(PLAY_SETUP));
  // The computer takes its first turn at the start, and each later one as a run arrives.
  useEffect(() => { setM(computer(newMatch(PLAY_SETUP))); }, [computer]);
  const t = useYourTurn(m, setM);
  const r = useRunner(setM, computer);
  useEffect(() => r.check(m), [m]); // eslint-disable-line react-hooks/exhaustive-deps

  const over = m.winner !== undefined;
  // The first run brings the board to the top of the screen.
  const top = useRef<HTMLElement>(null);
  const onPrimary = () => {
    if (m.board.turn === 0 && !r.running) top.current?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    if (over) { setSeed((s) => s + 1); return; }
    if (t.test) t.runTest();
    r.start(m, 'turn');
  };
  const result = !over ? '' : m.winner === 0 ? T.play.youWin : m.winner === 1 ? T.play.youLose : T.play.draw;
  const shown = t.test ? t.testFrame! : m;
  return (
    <section ref={top} className="mp-tutorial" aria-label={T.play.heading}>
      <div className="mp-lesson">
        <p className="mp-lesson-meta">
          {T.play.heading} · {T.play.level} · <em className="mp-inv">{T.inventedRules}</em>
          {T.modelDrafted && <span className="mp-draft"> · {T.draftNote}</span>}
        </p>
        <p className="mp-lesson-text">{T.play.intro}</p>
      </div>
      <div className="mp-board">
        <Strip m={m} t={t} running={!!r.running} />
        <MatchCanvas
          match={shown}
          viewer={0}
          ghosts={t.test ? [] : t.ghosts}
          reach={t.yourTurn && !r.running && !t.test}
          onTap={t.yourTurn && !r.running ? t.onTap : undefined}
          label={`${T.match.turn(m.board.turn)}. ${result}`}
        />
        {t.yourTurn && !r.running && <p className="mp-hint">{t.message}</p>}
      </div>
      {!r.running && <Tools t={t} m={m} />}
      <p className="mp-status" aria-live="polite">{result}</p>
      <Dock label={over ? T.play.again : r.running ? T.match.skip : T.match.run} onPrimary={onPrimary}>
        <button type="button" className="mp-quiet" onClick={onSandbox}>{T.play.sandbox}</button>
      </Dock>
    </section>
  );
}
