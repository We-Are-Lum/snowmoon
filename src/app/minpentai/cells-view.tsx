'use client';

/** Under the hood: the real cells of a board, a 24 × 16 window, with the rule's 2 × 2 blocks marked for this turn. */
import { useEffect, useRef, useState } from 'react';
import { phase, type Board } from '~/lib/minpentai/engine';

const VIEW = { x: 12, y: 12, w: 24, h: 16 };

export function CellsView({ board, label }: { board: Board; label: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const [px, setPx] = useState(390);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx(Math.floor(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const k = px / VIEW.w;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(px * dpr);
    c.height = Math.round(k * VIEW.h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#060608';
    g.fillRect(0, 0, px, k * VIEW.h);
    for (let y = 0; y < VIEW.h; y++) for (let x = 0; x < VIEW.w; x++) {
      const on = board.cells[(VIEW.y + y) * board.w + VIEW.x + x];
      g.fillStyle = on ? '#46D7E8' : '#0E0F13';
      g.fillRect(x * k + 1, y * k + 1, k - 2, k - 2);
    }
    // The blocks the rule works on this turn: offset by one cell on odd turns.
    const ph = phase(board.turn);
    g.strokeStyle = 'rgba(244, 242, 237, 0.22)';
    g.lineWidth = 1;
    for (let y = ((ph - VIEW.y) % 2 + 2) % 2; y < VIEW.h; y += 2) for (let x = ((ph - VIEW.x) % 2 + 2) % 2; x < VIEW.w; x += 2) g.strokeRect(x * k + 0.5, y * k + 0.5, 2 * k - 1, 2 * k - 1);
  }, [board, px]);
  return (
    <div className="mp-pboard" ref={wrapRef}>
      <canvas ref={ref} className="mp-pcanvas" style={{ width: px, height: (px / VIEW.w) * VIEW.h }} role="img" aria-label={label} />
      <p className="mp-pstrip">Turn {board.turn}</p>
    </div>
  );
}
