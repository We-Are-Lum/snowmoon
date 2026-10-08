'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyBoard, liveCount, step, stepBack, withCell, withRock, type Board } from '~/lib/minpentai/engine';
import { STATES, findSymbols } from '~/lib/minpentai/symbol';
import { c4b5Preset, impactPreset } from '~/lib/minpentai/presets';
import { decodeBoard, encodeBoard } from '~/lib/minpentai/url';
import { PlayComputer } from './match-view';
import { Learn, LEARN_SCREENS, PracticeScreen } from './learn';
import { TUTORIAL_TEXT as T } from '~/lib/minpentai/tutorial-text';

/* Colours from the approved board (docs/design/direction-boards, section 1c). */
const FIELD = '#060608';
const CELL_BG = '#0E0F13';
const GRID = '#16171C';
const LIVE = '#46D7E8';
const ROCK = '#4B4C55';
const GHOST = 'rgba(70, 215, 232, 0.45)';

type Brush = 'cell' | 'rock';
type Zoom = 1 | 2 | 3;
const ZOOMS: Zoom[] = [1, 2, 3];
/** Set once the tutorial is finished or skipped; later bare visits open free play. */
const DONE_KEY = 'minpentai-tutorial-done';

type Mode = { kind: 'tutorial'; lesson: number } | { kind: 'practice' } | { kind: 'play' } | { kind: 'free' };

function setQuery(params: Record<string, string | null>) {
  const url = new URL(window.location.href);
  url.search = '';
  for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, v);
  window.history.replaceState(null, '', url);
}

/** The board, the play loop, and the speed, shared by both modes. */
function usePlayer(initial: () => Board, autoplay = false) {
  const [board, setBoard] = useState<Board>(initial);
  const [playing, setPlaying] = useState(autoplay);
  const [speed, setSpeed] = useState(8);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setBoard((b) => step(b)), 1000 / speed);
    return () => window.clearInterval(id);
  }, [playing, speed]);
  return { board, setBoard, playing, setPlaying, speed, setSpeed };
}

export function Sandbox() {
  const [mode, setMode] = useState<Mode>({ kind: 'tutorial', lesson: 0 });
  const [handover, setHandover] = useState<Board | null>(null);
  const noBody = useRef<HTMLDivElement>(null);

  // Choose the mode on the client: a lesson link, a shared board, a returning visitor, or Learn.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const lesson = Number(q.get('lesson'));
    if (Number.isInteger(lesson) && lesson >= 1 && lesson <= LEARN_SCREENS) setMode({ kind: 'tutorial', lesson: lesson - 1 });
    else if (q.get('mode') === 'practice') setMode({ kind: 'practice' });
    else if (q.get('mode') === 'play') setMode({ kind: 'play' });
    else if (q.get('s') || q.get('mode') === 'free') setMode({ kind: 'free' });
    else if (window.localStorage.getItem(DONE_KEY)) setMode({ kind: 'free' });
  }, []);

  const goLesson = (i: number) => { setMode({ kind: 'tutorial', lesson: i }); setQuery({ lesson: String(i + 1) }); };
  const goFree = (from?: Board) => {
    try { window.localStorage.setItem(DONE_KEY, '1'); } catch { /* private mode: Learn opens again next time */ }
    setHandover(from ?? null);
    setMode({ kind: 'free' });
    setQuery({ mode: 'free' });
  };

  const goMatch = (kind: 'practice' | 'play') => { try { window.localStorage.setItem(DONE_KEY, '1'); } catch { /* as above */ } setMode({ kind }); setQuery({ mode: kind }); };
  const tabs: [Mode['kind'], string, () => void][] = [
    ['tutorial', T.nav.learn, () => goLesson(0)],
    ['practice', T.nav.practice, () => goMatch('practice')],
    ['play', T.nav.play, () => goMatch('play')],
    ['free', T.nav.sandbox, () => goFree()],
  ];

  // Learn and the practice match fill the screen in Design's phone frame; the other modes keep the page.
  if (mode.kind === 'tutorial') return <Learn index={mode.lesson} onScreen={goLesson} onFree={() => goFree()} />;
  if (mode.kind === 'practice') return <PracticeScreen back={() => goLesson(LEARN_SCREENS - 3)} onFree={() => goFree()} bodyRef={noBody} />;
  return (
    <div className="mp-page">
      <p className="mp-provenance">
        <strong>An unofficial reconstruction.</strong> The rule and the chapter 4 board come from the book; anything
        marked <em>invented</em> does not.
      </p>
      <h1>Minpentai</h1>
      <nav className="mp-nav" aria-label={T.nav.label}>
        {tabs.map(([kind, label, go]) => (
          <button key={kind} type="button" aria-current={mode.kind === kind ? 'page' : undefined} onClick={go}>{label}</button>
        ))}
      </nav>
      {mode.kind === 'play' && <PlayComputer onSandbox={() => goFree()} />}
      {mode.kind === 'free' && <FreePlay initial={handover} onTutorial={() => goLesson(0)} />}
      <p className="mp-note">
        From the book: the rule, recovered from the animated board in chapter 4 (figure c4-b5, the &ldquo;rotate one
        eighty if three&rdquo; rule), and that figure&rsquo;s opening frame. Invented: the 48 × 32 wrapping board,
        rocks, the symbol and how it is counted, the hidden side of the figure preset, the glider-and-rock preset, and
        every rule of the matches (owners, sight, turns to act, squares, elimination) and the computer players.
        How the rule was recovered is written up in <code>docs/minpentai-rules.md</code>; the sandbox&rsquo;s own
        choices are in <code>docs/minpentai-sandbox.md</code>.
      </p>
    </div>
  );
}

/* ---------------- board ---------------- */

function BoardView(props: {
  board: Board;
  setBoard: (f: (b: Board) => Board) => void;
  playing: boolean;
  zoom: Zoom;
  view: { x: number; y: number };
  editable: boolean;
  brush?: Brush;
  ghost?: [number, number][];
}) {
  const { board, setBoard, playing, zoom, view, editable, brush = 'cell', ghost } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(358);
  const paint = useRef<{ value: boolean } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx(Math.floor(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const symbols = useMemo(() => findSymbols(board), [board]);
  const live = useMemo(() => liveCount(board), [board]);
  const cols = board.w / zoom;
  const rows = Math.floor(board.h / zoom);
  const cell = px / cols;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(px * dpr);
    c.height = Math.round(cell * rows * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = FIELD;
    ctx.fillRect(0, 0, px, cell * rows);
    const symbolCells = new Set<number>();
    for (const s of symbols) for (const [dx, dy] of STATES[s.state].cells) symbolCells.add(((s.y + dy) % board.h) * board.w + ((s.x + dx) % board.w));
    const ghostSet = new Set((ghost ?? []).map(([x, y]) => y * board.w + x));
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = (view.x + i) % board.w, y = (view.y + j) % board.h, k = y * board.w + x;
        const X = i * cell, Y = j * cell;
        ctx.fillStyle = CELL_BG;
        ctx.fillRect(X, Y, cell, cell);
        if (cell >= 6) { ctx.fillStyle = GRID; ctx.fillRect(X, Y, cell, 1); ctx.fillRect(X, Y, 1, cell); }
        if (board.rocks[k]) { ctx.fillStyle = ROCK; ctx.fillRect(X, Y, cell, cell); }
        else if (board.cells[k]) {
          ctx.fillStyle = LIVE;
          if (symbolCells.has(k)) ctx.fillRect(X, Y, cell, cell);
          else ctx.fillRect(X + cell / 6, Y + cell / 6, cell - cell / 3, cell - cell / 3);
        } else if (ghostSet.has(k)) {
          // Faint outline: where to tap.
          ctx.strokeStyle = GHOST;
          ctx.lineWidth = Math.max(1, cell / 12);
          ctx.setLineDash([]);
          ctx.strokeRect(X + cell / 6, Y + cell / 6, cell - cell / 3, cell - cell / 3);
        }
      }
    }
    ctx.strokeStyle = LIVE;
    ctx.lineWidth = Math.max(1.5, cell / 6);
    ctx.setLineDash([Math.max(3, cell / 2), Math.max(2, cell / 3)]);
    for (const s of symbols) {
      const ox = (((s.x - 1 - view.x) % board.w) + board.w) % board.w;
      const oy = (((s.y - 1 - view.y) % board.h) + board.h) % board.h;
      for (const sx of [ox, ox - board.w]) for (const sy of [oy, oy - board.h]) ctx.strokeRect(sx * cell, sy * cell, (s.w + 2) * cell, (s.h + 2) * cell);
    }
    ctx.setLineDash([]);
  }, [board, symbols, px, cell, cols, rows, view, ghost]);

  const cellAt = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      const i = Math.floor((e.clientX - r.left) / cell), j = Math.floor((e.clientY - r.top) / cell);
      if (i < 0 || j < 0 || i >= cols || j >= rows) return null;
      return { x: (view.x + i) % board.w, y: (view.y + j) % board.h };
    },
    [cell, cols, rows, view, board.w, board.h],
  );
  const canEdit = editable && !playing;
  const apply = (x: number, y: number, value: boolean) => setBoard((b) => (brush === 'rock' ? withRock(b, x, y, value) : withCell(b, x, y, value)));
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEdit) return;
    const at = cellAt(e);
    if (!at) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const k = at.y * board.w + at.x;
    const value = brush === 'rock' ? !board.rocks[k] : !board.cells[k];
    paint.current = { value };
    apply(at.x, at.y, value);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paint.current || !canEdit) return;
    const at = cellAt(e);
    if (at) apply(at.x, at.y, paint.current.value);
  };
  const onUp = () => { paint.current = null; };

  return (
    <div className="mp-board">
      <div className="mp-strip" aria-live="polite">
        <span>TURN {board.turn}</span>
        <span>LIVE {live}</span>
        <span>SYMBOLS {symbols.length}<em className="mp-inv"> invented</em></span>
      </div>
      <div ref={wrapRef} className="mp-canvas-wrap">
        <canvas
          ref={canvasRef}
          className={canEdit ? 'mp-canvas mp-editing' : 'mp-canvas'}
          style={{ width: px, height: Math.round(cell * rows) }}
          role="img"
          aria-label={`Minpentai board, turn ${board.turn}, ${live} live cells, ${symbols.length} symbols`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>
      {editable && (
        <p className="mp-hint">
          {playing ? 'Pause to place or remove cells.' : `Tap or drag to ${brush === 'rock' ? 'place or remove rocks' : 'place or remove cells'}.`}
          {zoom > 1 && ` Showing ${cols} × ${rows} of 48 × 32.`}
        </p>
      )}
    </div>
  );
}

function TimeControls({ playing, setPlaying, setBoard, turn, minTurn }: {
  playing: boolean;
  setPlaying: (f: (p: boolean) => boolean) => void;
  setBoard: (f: (b: Board) => Board) => void;
  turn: number;
  /** Stepping back stops here (the tutorial stops at turn 0). */
  minTurn?: number;
}) {
  const atFloor = minTurn !== undefined && turn <= minTurn;
  return (
    <div className="mp-controls mp-transport" role="group" aria-label="Time">
      <button
        type="button"
        disabled={atFloor}
        onClick={() => { setPlaying(() => false); setBoard((b) => (minTurn !== undefined && b.turn <= minTurn ? b : stepBack(b))); }}
        aria-label="Step backward"
      >◁|</button>
      <button type="button" className="mp-primary" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
      <button type="button" onClick={() => { setPlaying(() => false); setBoard((b) => step(b)); }} aria-label="Step forward">|▷</button>
    </div>
  );
}

/* ---------------- free play ---------------- */

function FreePlay({ initial, onTutorial }: { initial: Board | null; onTutorial: () => void }) {
  const p = usePlayer(() => initial ?? c4b5Preset());
  const { board, setBoard, playing, setPlaying, speed, setSpeed } = p;
  const [brush, setBrush] = useState<Brush>('cell');
  const [zoom, setZoom] = useState<Zoom>(initial ? 2 : 1);
  const [view, setView] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('s');
    const fromUrl = s ? decodeBoard(s) : null;
    if (fromUrl) { setBoard(() => fromUrl); setZoom(1); }
  }, [setBoard]);
  // Keep the URL in step with the board whenever play stops or the board is edited.
  useEffect(() => { if (!playing) setQuery({ s: encodeBoard(board) }); }, [board, playing]);

  const load = (b: Board, z: Zoom = 1) => { setPlaying(false); setBoard(() => b); setZoom(z); setView({ x: 0, y: 0 }); };
  const pan = (dx: number, dy: number) => setView((v) => ({ x: (v.x + dx + board.w) % board.w, y: (v.y + dy + board.h) % board.h }));
  const copyLink = async () => {
    setQuery({ s: encodeBoard(board) });
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* the URL bar still holds it */ }
  };

  return (
    <div className="mp">
      <BoardView board={board} setBoard={setBoard} playing={playing} zoom={zoom} view={view} editable brush={brush} />
      <TimeControls playing={playing} setPlaying={setPlaying} setBoard={setBoard} turn={board.turn} />

      <label className="mp-speed">
        <span>Speed · {speed} turns a second</span>
        <input type="range" min={1} max={30} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
      </label>

      <div className="mp-controls" role="group" aria-label="Brush">
        <button type="button" aria-pressed={brush === 'cell'} onClick={() => setBrush('cell')}>Cell</button>
        <button type="button" aria-pressed={brush === 'rock'} onClick={() => setBrush('rock')}>Rock <em className="mp-inv">invented</em></button>
        <button type="button" onClick={() => load(emptyBoard())}>Clear</button>
      </div>

      <div className="mp-controls" role="group" aria-label="Zoom">
        {ZOOMS.map((z) => (
          <button key={z} type="button" aria-pressed={zoom === z} onClick={() => { setZoom(z); setView({ x: 0, y: 0 }); }}>
            {z === 1 ? 'Whole board' : `Zoom ${z}×`}
          </button>
        ))}
      </div>
      {zoom > 1 && (
        <div className="mp-controls mp-pan" role="group" aria-label="Pan">
          <button type="button" onClick={() => pan(-4, 0)} aria-label="Pan left">←</button>
          <button type="button" onClick={() => pan(0, -4)} aria-label="Pan up">↑</button>
          <button type="button" onClick={() => pan(0, 4)} aria-label="Pan down">↓</button>
          <button type="button" onClick={() => pan(4, 0)} aria-label="Pan right">→</button>
        </div>
      )}

      <h2>Presets</h2>
      <div className="mp-presets">
        <button type="button" onClick={() => load(c4b5Preset(), 2)}>
          <span className="mp-preset-title">The book&rsquo;s figure, chapter 4</span>
          <span className="mp-preset-line">
            The opening frame of figure c4-b5, top left. Its right-hand side is <em>invented</em>: one reconstruction of
            what lies off the figure&rsquo;s edge, chosen so the top-left 24 × 16 replays all 120 of the book&rsquo;s
            frames. It opens at 2× zoom, which shows exactly the figure&rsquo;s area.
          </span>
        </button>
        <button type="button" onClick={() => load(impactPreset())}>
          <span className="mp-preset-title">A glider meets a rock</span>
          <span className="mp-preset-line">
            <em>Invented.</em> The rule&rsquo;s only glider strikes a rock; the symbol forms on impact, on turns 22–23
            and 26–27, and the glider bounces back.
          </span>
        </button>
      </div>

      <div className="mp-controls">
        <button type="button" onClick={copyLink}>{copied ? 'Link copied' : 'Copy a link to this board'}</button>
        <button type="button" onClick={onTutorial}>{T.backToTutorial}</button>
      </div>

      <h2>Symbol <em className="mp-inv">invented</em></h2>
      <SymbolLegend />
    </div>
  );
}

/** The symbol, then every arrangement it takes when drawn alone (its cycle). */
function SymbolLegend() {
  return (
    <div className="mp-legend">
      <p>
        The book never shows a symbol, so this one is invented. It is a shape the rule&rsquo;s glider can make by
        striking a rock. Drawn alone, it stays in place but cycles through {STATES.length} arrangements, some in
        pieces. Each arrangement is recognised and framed when it has an empty margin around it.
      </p>
      <div className="mp-legend-grid">
        {STATES.map((s, i) => (
          <figure key={s.rows.join('/')} className={i === 0 ? 'mp-state mp-state-main' : 'mp-state'}>
            <div className="mp-mini" style={{ gridTemplateColumns: `repeat(${s.w}, 1fr)`, aspectRatio: `${s.w} / ${s.h}` }}>
              {s.rows.join('').split('').map((ch, k) => <span key={k} className={ch === '#' ? 'on' : ''} />)}
            </div>
            <figcaption>{i === 0 ? 'Symbol' : `${i + 1}`}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
