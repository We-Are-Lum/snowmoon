'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyBoard, liveCount, step, stepBack, withCell, withRock, type Board } from '~/lib/minpentai/engine';
import { STATES, findSymbols } from '~/lib/minpentai/symbol';
import { c4b5Preset, impactPreset } from '~/lib/minpentai/presets';
import { decodeBoard, encodeBoard } from '~/lib/minpentai/url';

/* Colours from the approved board (docs/design/direction-boards, section 1c). */
const FIELD = '#060608';
const CELL_BG = '#0E0F13';
const GRID = '#16171C';
const LIVE = '#46D7E8';
const ROCK = '#4B4C55';

type Brush = 'cell' | 'rock';
const ZOOMS = [1, 2, 3] as const;

function readUrl(): Board | null {
  if (typeof window === 'undefined') return null;
  const s = new URLSearchParams(window.location.search).get('s');
  return s ? decodeBoard(s) : null;
}

function writeUrl(b: Board) {
  const url = new URL(window.location.href);
  url.searchParams.set('s', encodeBoard(b));
  window.history.replaceState(null, '', url);
}

export function Sandbox() {
  const [board, setBoard] = useState<Board>(() => c4b5Preset());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8);
  const [brush, setBrush] = useState<Brush>('cell');
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(1);
  const [view, setView] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(358);
  const paint = useRef<{ value: boolean } | null>(null);

  // Load state from the URL once, on the client.
  useEffect(() => {
    const fromUrl = readUrl();
    if (fromUrl) setBoard(fromUrl);
  }, []);

  // Keep the URL in step with the board whenever play stops or the board is edited.
  useEffect(() => {
    if (!playing) writeUrl(board);
  }, [board, playing]);

  // Fit the canvas to the available width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx(Math.floor(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Play loop.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setBoard((b) => step(b)), 1000 / speed);
    return () => window.clearInterval(id);
  }, [playing, speed]);

  const symbols = useMemo(() => findSymbols(board), [board]);
  const live = useMemo(() => liveCount(board), [board]);

  // Visible window: the whole board at 1×; a w/zoom × h/zoom window otherwise.
  const cols = board.w / zoom;
  const rows = Math.floor(board.h / zoom);
  const cell = px / cols;

  // Draw.
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
    for (const s of symbols) {
      const st = STATES[s.state];
      for (const [dx, dy] of st.cells) symbolCells.add(((s.y + dy) % board.h) * board.w + ((s.x + dx) % board.w));
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = (view.x + i) % board.w, y = (view.y + j) % board.h, k = y * board.w + x;
        const X = i * cell, Y = j * cell;
        ctx.fillStyle = CELL_BG;
        ctx.fillRect(X, Y, cell, cell);
        if (cell >= 6) {
          ctx.fillStyle = GRID;
          ctx.fillRect(X, Y, cell, 1);
          ctx.fillRect(X, Y, 1, cell);
        }
        if (board.rocks[k]) {
          ctx.fillStyle = ROCK;
          ctx.fillRect(X, Y, cell, cell);
        } else if (board.cells[k]) {
          ctx.fillStyle = LIVE;
          if (symbolCells.has(k)) ctx.fillRect(X, Y, cell, cell); // symbols: full-bleed cells
          else ctx.fillRect(X + cell / 6, Y + cell / 6, cell - cell / 3, cell - cell / 3); // live: inset squares
        }
      }
    }
    // Dashed frame around every recognised symbol, one cell out from its box.
    ctx.strokeStyle = LIVE;
    ctx.lineWidth = Math.max(1.5, cell / 6);
    ctx.setLineDash([Math.max(3, cell / 2), Math.max(2, cell / 3)]);
    for (const s of symbols) {
      const ox = (((s.x - 1 - view.x) % board.w) + board.w) % board.w;
      const oy = (((s.y - 1 - view.y) % board.h) + board.h) % board.h;
      for (const sx of [ox, ox - board.w]) for (const sy of [oy, oy - board.h]) {
        ctx.strokeRect(sx * cell, sy * cell, (s.w + 2) * cell, (s.h + 2) * cell);
      }
    }
    ctx.setLineDash([]);
  }, [board, symbols, px, cell, cols, rows, view]);

  const cellAt = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      const i = Math.floor((e.clientX - r.left) / cell), j = Math.floor((e.clientY - r.top) / cell);
      if (i < 0 || j < 0 || i >= cols || j >= rows) return null;
      return { x: (view.x + i) % board.w, y: (view.y + j) % board.h };
    },
    [cell, cols, rows, view, board.w, board.h],
  );

  const apply = (x: number, y: number, value: boolean) =>
    setBoard((b) => (brush === 'rock' ? withRock(b, x, y, value) : withCell(b, x, y, value)));

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (playing) return;
    const at = cellAt(e);
    if (!at) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const k = at.y * board.w + at.x;
    const value = brush === 'rock' ? !board.rocks[k] : !board.cells[k];
    paint.current = { value };
    apply(at.x, at.y, value);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paint.current || playing) return;
    const at = cellAt(e);
    if (at) apply(at.x, at.y, paint.current.value);
  };
  const onUp = () => { paint.current = null; };

  const load = (b: Board, z: (typeof ZOOMS)[number] = 1) => { setPlaying(false); setBoard(b); setZoom(z); setView({ x: 0, y: 0 }); };
  const pan = (dx: number, dy: number) =>
    setView((v) => ({ x: (v.x + dx + board.w) % board.w, y: (v.y + dy + board.h) % board.h }));

  const copyLink = async () => {
    writeUrl(board);
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* the URL bar still holds it */ }
  };

  return (
    <div className="mp">
      <div className="mp-board">
        <div className="mp-strip" aria-live="polite">
          <span>TURN {board.turn}</span>
          <span>LIVE {live}</span>
          <span>SYMBOLS {symbols.length}<em className="mp-inv"> invented</em></span>
        </div>
        <div ref={wrapRef} className="mp-canvas-wrap">
          <canvas
            ref={canvasRef}
            className={playing ? 'mp-canvas' : 'mp-canvas mp-editing'}
            style={{ width: px, height: Math.round(cell * rows) }}
            role="img"
            aria-label={`Minpentai board, turn ${board.turn}, ${live} live cells, ${symbols.length} symbols`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        </div>
        <p className="mp-hint">
          {playing ? 'Pause to place or remove cells.' : `Tap or drag to ${brush === 'rock' ? 'place or remove rocks' : 'place or remove cells'}.`}
          {zoom > 1 && ` Showing ${cols} × ${rows} of 48 × 32.`}
        </p>
      </div>

      <div className="mp-controls" role="group" aria-label="Time">
        <button type="button" onClick={() => { setPlaying(false); setBoard((b) => stepBack(b)); }} aria-label="Step backward">◀ Step</button>
        <button type="button" className="mp-primary" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
        <button type="button" onClick={() => { setPlaying(false); setBoard((b) => step(b)); }} aria-label="Step forward">Step ▶</button>
      </div>

      <label className="mp-speed">
        <span>Speed · {speed} turns a second</span>
        <input type="range" min={1} max={30} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
      </label>

      <div className="mp-controls" role="group" aria-label="Brush">
        <button type="button" aria-pressed={brush === 'cell'} onClick={() => setBrush('cell')}>Cell</button>
        <button type="button" aria-pressed={brush === 'rock'} onClick={() => setBrush('rock')}>Rock <em className="mp-inv">invented</em></button>
        <button type="button" onClick={() => load({ ...emptyBoard() })}>Clear</button>
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

      <button type="button" className="mp-link" onClick={copyLink}>{copied ? 'Link copied' : 'Copy a link to this board'}</button>

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
