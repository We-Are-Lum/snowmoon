'use client';

/**
 * The Play board as Design draws it (docs/design/minpentai-play-prototype.dc.html, markup lines
 * 223–227): a grid of squares, `cs` pixels each, with a 1 px gap. Added for the site's standing
 * rules: the grid is keyboard reachable (one tab stop; arrow keys move between squares; Enter or
 * Space taps), and each square says what is on it.
 */
import { useEffect, useRef, useState } from 'react';
import type { BoardView, Cell } from '~/lib/minpentai/play-game/board';

export function PlayBoard({ bd, label, fitHeight = false, children }: { bd: BoardView; label: string; fitHeight?: boolean; children?: React.ReactNode }) {
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
  const fitH = fitHeight && room && room.h > 40 ? Math.floor(room.h / rows) - 2 : bd.cs;
  const cs = Math.max(12, Math.min(bd.cs, fitW, fitH));
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
                  style={{ background: c.bg, border: c.bd === '0' ? 0 : c.bd, boxShadow: scale(c.sh, k), color: c.fg, fontSize: `${Math.round(parseFloat(c.fs) * k)}px` }}
                >
                  <span aria-hidden="true">{c.t}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

/** Design's inset ring is a fifth of the square: keep it so when the square shrinks. */
function scale(sh: string, k: number) {
  return k === 1 ? sh : sh.replace(/inset 0 0 0 (\d+)px/, (_m, n) => `inset 0 0 0 ${Math.max(1, Math.round(Number(n) * k))}px`);
}
