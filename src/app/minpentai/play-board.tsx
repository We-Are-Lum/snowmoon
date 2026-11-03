'use client';

/**
 * The Play board as Design draws it (docs/design/minpentai-play-prototype.dc.html, markup lines
 * 223–227): a grid of squares, `cs` pixels each, with a 1 px gap. Added for the site's standing
 * rules: the grid is keyboard reachable (one tab stop; arrow keys move between squares; Enter or
 * Space taps), and each square says what is on it. Pieces are drawn with Learn's shapes, a ring for a tower,
 * an arrowhead for a glider, a tinted square that cracks (owner, 2026-10-21: "Play uses Learn's shapes"), by
 * Learn's own drawPiece; the rest of each square (rock, dark, lit, hit, aiming arrows, path dots) is Design's.
 */
import { useEffect, useRef, useState } from 'react';
import { COL } from '~/lib/minpentai/play-game/game';
import type { BoardView, Cell, CellPiece } from '~/lib/minpentai/play-game/board';
import { drawPiece } from './learn-draw';

/** Height of the line under the grid (points left, or when the next turn is), inside the black box. */
const FOOT = 32;

export function PlayBoard({ bd, label, fitHeight = false, grow = false, foot, children }: { bd: BoardView; label: string; fitHeight?: boolean; /** Desktop: squares grow past Design's size to fill the room (whole pixels, so crisp). */ grow?: boolean; foot?: React.ReactNode; children?: React.ReactNode }) {
  const [focus, setFocus] = useState(0);
  const grid = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const rows = Math.ceil(bd.cells.length / bd.cols);
  // Design's squares are bd.cs pixels; where the space is smaller (a 390 px phone, the desktop's middle
  // column beside the rail and the assistant), they shrink to fit the space the board is given.
  const [room, setRoom] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const host = wrap.current?.parentElement;
    if (!host) return;
    const measure = () => {
      const cs = getComputedStyle(host);
      setRoom({ w: host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), h: host.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(host);
    return () => ro?.disconnect();
  }, []);
  const fitW = room ? Math.floor(room.w / bd.cols) - 2 : bd.cs;
  const fitH = fitHeight && room && room.h > 40 ? Math.floor((room.h - (foot ? FOOT : 0)) / rows) - 2 : bd.cs;
  const cs = Math.max(12, grow && room ? Math.min(fitW, fitHeight ? fitH : fitW, 96) : Math.min(bd.cs, fitW, fitH));
  const k = cs / bd.cs;
  const move = (i: number) => {
    const n = Math.max(0, Math.min(bd.cells.length - 1, i));
    setFocus(n);
    grid.current?.querySelectorAll<HTMLElement>('[role="gridcell"]')[n]?.focus();
  };
  const onKey = (e: React.KeyboardEvent, i: number, c: Cell) => {
    const col = i % bd.cols, row = Math.floor(i / bd.cols);
    if (e.key === 'ArrowRight' && col < bd.cols - 1) move(i + 1);
    else if (e.key === 'ArrowLeft' && col > 0) move(i - 1);
    else if (e.key === 'ArrowDown' && row < rows - 1) move(i + bd.cols);
    else if (e.key === 'ArrowUp' && row > 0) move(i - bd.cols);
    else if (e.key === 'Enter' || e.key === ' ') bd.tap(c);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div className="mp-board-wrap" ref={wrap}>
      <div
        ref={grid}
        role="grid"
        aria-label={label}
        className="mp-grid"
        style={{ gridTemplateColumns: `repeat(${bd.cols}, ${cs}px)`, gridAutoRows: `${cs}px` }}
      >
        {Array.from({ length: rows }, (_, r) => (
          <div role="row" key={r} style={{ display: 'contents' }}>
            {bd.cells.slice(r * bd.cols, (r + 1) * bd.cols).map((c, j) => {
              const i = r * bd.cols + j;
              return (
                <div
                  key={i}
                  role="gridcell"
                  tabIndex={i === focus ? 0 : -1}
                  aria-label={`${c.label}, column ${c.x + 1}, row ${c.y + 1}`}
                  className="mp-cell"
                  onClick={() => { setFocus(i); bd.tap(c); }}
                  onKeyDown={(e) => onKey(e, i, c)}
                  style={look(c, k)}
                >
                  {c.pc ? <PieceShape pc={c.pc} cs={cs} /> : <span aria-hidden="true">{c.t}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {foot && <div className="mp-board-foot" style={{ height: FOOT }}>{foot}</div>}
      {children}
    </div>
  );
}

/** How a square is painted: Design's colours, except that a piece's square is left empty for its shape (Learn's
 *  board colour, or Design's lit tint under a new glider) and a new placement keeps Design's white outline. */
export function look(c: Cell, k = 1): React.CSSProperties {
  if (c.pc?.dim) return { background: '#050507', border: 0, boxShadow: 'none' }; // out of sight: the dark square, the tower dimmed on it
  if (c.pc) return { background: c.pc.mine && c.pc.k === 'glider' ? c.bg : '#0E0F13', border: 0, boxShadow: c.pc.mine ? '0 0 0 1px #E7E4DD' : 'none' };
  return { background: c.bg, border: c.bd === '0' ? 0 : c.bd, boxShadow: scale(c.sh, k), color: c.fg, fontSize: `${Math.max(12, Math.round(parseFloat(c.fs) * k))}px` };
}

/** One piece in its square, drawn by Learn's drawPiece at the screen's pixels. */
function PieceShape({ pc, cs }: { pc: CellPiece; cs: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [dpr, setDpr] = useState(1);
  useEffect(() => setDpr(window.devicePixelRatio || 1), []);
  const px = Math.round(cs * dpr);
  useEffect(() => {
    const g = ref.current?.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, px, px);
    drawPiece(g, pc.k, px / 2, px / 2, px, COL[pc.side], { dx: pc.dir?.[0], dy: pc.dir?.[1], hp: pc.hp });
  }, [pc.k, pc.side, pc.dir?.[0], pc.dir?.[1], pc.hp, px]);
  return <canvas ref={ref} className="mp-piece" width={px} height={px} style={{ width: cs, height: cs, opacity: pc.dim || pc.faded ? 0.4 : undefined }} aria-hidden="true" />;
}

/** Design's inset ring is a fifth of the square: keep it so when the square shrinks. */
function scale(sh: string, k: number) {
  return k === 1 ? sh : sh.replace(/inset 0 0 0 (\d+)px/, (_m, n) => `inset 0 0 0 ${Math.max(1, Math.round(Number(n) * k))}px`);
}
