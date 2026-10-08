'use client';

/**
 * The lesson and practice board: a real match (match.ts) drawn as pieces, after Design's
 * lesson board (docs/design/minpentai-study.md): towers as rings, gliders as arrows with a
 * short trail, squares as tiles, rocks grey; CELLS shows the cells underneath instead. The grid
 * is drawn every two cells, the size of the rule's blocks.
 *
 * Taps and the keyboard both put pieces down: arrow keys move a cursor, Enter or Space puts the
 * piece down at it. The strip (turn, towers, points) is text over the board, not paint.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PLAYER_COLOURS, sightMask, dist, type Match } from '~/lib/minpentai/match';
import { piecesOf } from '~/lib/minpentai/pieces';
import { LEARN_TEXT as T } from '~/lib/minpentai/learn-text';

const FIELD = '#0E0F13';
const DARK = '#060608';
const ROCK = '#4B4C55';
const NEUTRAL = '#8A8C96';
const LIT = 'rgba(70, 215, 232, 0.12)';
const FOG = 'rgba(4, 4, 6, 0.88)';
/** Turns a lost tower's ring and "−1" show: 1.6 s at the lessons' 12 turns a second. */
export const FLASH_TURNS = 19;
const NAMES = ['Cyan', 'Amber', 'Pink', 'Violet'];


export function PiecesBoard(props: {
  match: Match;
  /** Draw what this player sees (fog); null shows everything. */
  viewer: number | null;
  /** Light up where player 0 may build. */
  lit?: boolean;
  hints?: [number, number][];
  /** Called with the cell tapped, or chosen with the keyboard. */
  onPick?: (x: number, y: number) => void;
  points?: number | null;
  label: string;
  /** Earlier turns, newest last, for the gliders' trails. */
  trail?: Match[];
  /** How the strip shows the turn (practice: "n/384"). */
  stripTurn?: string;
}) {
  const { match: m, viewer, lit = false, hints = [], onPick, points = null, label, trail = [], stripTurn } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [px, setPx] = useState(390);
  const [cells, setCells] = useState(false);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const { w, h } = m.board;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx(Math.floor(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pieces = useMemo(() => piecesOf(m), [m]);
  const mask = useMemo(() => sightMask(m, viewer), [m, viewer]);
  const reachMask = useMemo(() => {
    if (!lit) return null;
    const r = new Uint8Array(w * h);
    const me = m.players[0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (me.sites.some((s) => dist(m.board, s.x, s.y, x, y) <= m.rules.reach)) r[y * w + x] = 1;
    return r;
  }, [m, lit, w, h]);
  const trails = useMemo(() => trail.slice(-13, -1).map((t) => piecesOf(t).gliders), [trail]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const k = px / w;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(px * dpr);
    c.height = Math.round(k * h * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const seen = (x: number, y: number) => mask[(((y % h) + h) % h) * w + (((x % w) + w) % w)] === 1;
    // One of Design's squares is two cells (the rule's block), so its sizes are in units of cp = 2 cells.
    const cp = 2 * k;
    g.fillStyle = DARK;
    g.fillRect(0, 0, w * k, h * k);
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      g.fillStyle = FIELD;
      g.fillRect(x * k + 1, y * k + 1, cp - 2, cp - 2);
      if (reachMask?.[y * w + x]) { g.fillStyle = LIT; g.fillRect(x * k + 1, y * k + 1, cp - 2, cp - 2); }
    }
    for (let i = 0; i < w * h; i++) if (m.board.rocks[i]) {
      const x = i % w, y = Math.floor(i / w);
      g.fillStyle = ROCK;
      g.fillRect(x * k + 1, y * k + 1, k - 2, k - 2);
    }
    // Your own pieces always show; anyone else's only where you can see.
    const shows = (x: number, y: number, owner: number | null) => owner === viewer || seen(x, y);
    const colour = (o: number | null) => (o === null || o < 0 ? NEUTRAL : PLAYER_COLOURS[o]);
    if (cells) {
      for (let i = 0; i < w * h; i++) if (m.board.cells[i]) {
        const x = i % w, y = Math.floor(i / w);
        if (!shows(x, y, m.owners[i] - 1)) continue;
        g.fillStyle = colour(m.owners[i] - 1);
        g.fillRect(x * k + 1, y * k + 1, k - 2, k - 2);
      }
    } else {
      // Squares and wreckage: a tile in the owner's colour at alpha .45, stroked.
      for (const [x, y, o] of pieces.blocks) {
        if (!shows(x, y, o - 1)) continue;
        const c0 = colour(o - 1);
        g.fillStyle = c0 + '73';
        g.fillRect(x * k + 1.5, y * k + 1.5, k - 3, k - 3);
        g.strokeStyle = c0;
        g.lineWidth = 1.5;
        g.strokeRect(x * k + 1.5, y * k + 1.5, k - 3, k - 3);
      }
      // Gliders: an arrowhead, and small squares where it was 4, 8 and 12 turns ago.
      const centre = (q: { x: number; y: number; dx: number }) => [q.x + (q.dx ? 1 : 2), q.y + (q.dx ? 2 : 1)] as const;
      [12, 8, 4].forEach((ago, n) => {
        const list = trails[trails.length - ago];
        if (!list) return;
        for (const q of list) {
          const [cx, cy] = centre(q);
          if (!shows(Math.floor(cx), Math.floor(cy), q.player)) continue;
          if (!pieces.gliders.some((p) => p.dx === q.dx && p.dy === q.dy && Math.abs(p.x - q.x) + Math.abs(p.y - q.y) <= 8)) continue;
          g.globalAlpha = [0.14, 0.23, 0.32][n];
          g.fillStyle = colour(q.player);
          g.fillRect(cx * k - cp * 0.11, cy * k - cp * 0.11, cp * 0.22, cp * 0.22);
        }
      });
      g.globalAlpha = 1;
      for (const q of pieces.gliders) {
        const [cx, cy] = centre(q);
        if (!shows(Math.floor(cx), Math.floor(cy), q.player)) continue;
        g.save();
        g.translate(cx * k, cy * k);
        g.rotate(Math.atan2(q.dy, q.dx));
        g.fillStyle = colour(q.player);
        g.beginPath();
        g.moveTo(cp * 0.36, 0);
        g.lineTo(-cp * 0.26, -cp * 0.28);
        g.lineTo(-cp * 0.12, 0);
        g.lineTo(-cp * 0.26, cp * 0.28);
        g.closePath();
        g.fill();
        g.restore();
      }
      // Towers: a ring with a dot. A tower that has been hit fades inside a white ring until it goes.
      for (const t of pieces.towers) {
        if (!shows(t.x, t.y, t.player)) continue;
        const cx = (t.x + 0.5) * k, cy = (t.y + 0.5) * k;
        g.globalAlpha = t.breaking ? 0.45 : 1;
        g.fillStyle = PLAYER_COLOURS[t.player];
        g.beginPath(); g.arc(cx, cy, cp * 0.36, 0, Math.PI * 2); g.fill();
        g.fillStyle = FIELD;
        g.beginPath(); g.arc(cx, cy, cp * 0.17, 0, Math.PI * 2); g.fill();
        g.fillStyle = PLAYER_COLOURS[t.player];
        g.fillRect(cx - cp * 0.06, cy - cp * 0.06, cp * 0.12, cp * 0.12);
        g.globalAlpha = 1;
        if (t.breaking) {
          g.strokeStyle = '#FFFFFF';
          g.lineWidth = 2;
          g.beginPath(); g.arc(cx, cy, cp * 0.5, 0, Math.PI * 2); g.stroke();
        }
      }
    }
    // Fog over what you cannot see (rocks stay visible).
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (seen(x, y) || m.board.rocks[y * w + x]) continue;
      g.fillStyle = FOG;
      g.fillRect(x * k, y * k, k, k);
    }
    // Where a tower was just lost: a widening ring in its owner's colour.
    for (const e of m.events) {
      if (e.kind !== 'symbolLost') continue;
      const a = (m.board.turn - e.turn) / FLASH_TURNS;
      if (a < 0 || a >= 1) continue;
      g.strokeStyle = PLAYER_COLOURS[e.player];
      g.globalAlpha = 1 - a;
      g.lineWidth = 3;
      g.beginPath(); g.arc((e.x + 0.5) * k, (e.y + 0.5) * k, cp * (0.4 + 1.8 * a), 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
    // Spots to tap, and the keyboard cursor.
    g.setLineDash([3.5, 2.5]);
    g.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    g.lineWidth = 1.25;
    for (const [x, y] of hints) if (!m.board.cells[y * w + x]) g.strokeRect(x * k + 1.5, y * k + 1.5, k - 3, k - 3);
    g.setLineDash([]);
    if (cursor && onPick) {
      g.strokeStyle = '#FFFFFF';
      g.lineWidth = 2;
      g.strokeRect(cursor[0] * k, cursor[1] * k, k, k);
    }
  }, [px, m, cells, pieces, mask, reachMask, hints, cursor, onPick, trails, w, h]);

  const cellAt = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = r.width / w;
    return [Math.min(w - 1, Math.max(0, Math.floor((e.clientX - r.left) / k))), Math.min(h - 1, Math.max(0, Math.floor((e.clientY - r.top) / k)))];
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!onPick) return;
    const [x, y] = cursor ?? [hints[0]?.[0] ?? 8, hints[0]?.[1] ?? 9];
    const move: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (move[e.key]) {
      e.preventDefault();
      setCursor([(x + move[e.key][0] + w) % w, (y + move[e.key][1] + h) % h]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick(x, y);
    }
  };

  const lost = [...m.events].reverse().find((e) => e.kind === 'symbolLost' && m.board.turn - e.turn < FLASH_TURNS);
  const minus = lost && lost.kind === 'symbolLost' ? lost : null;
  // Under fog you count only the towers you can see; a "?" says some may be hidden.
  const score = m.players.map((p, i) => {
    if (p.out) return `${NAMES[i].toUpperCase()} OUT`;
    const shown = viewer === null || i === viewer ? p.sites : p.sites.filter((q) => mask[q.y * w + q.x]);
    return `${NAMES[i].toUpperCase()} ${'●'.repeat(shown.length)}${shown.length < p.sites.length ? '?' : ''}`;
  });
  return (
    <div className="mp-pboard" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={onPick ? 'mp-pcanvas mp-editing' : 'mp-pcanvas'}
        style={{ width: px, height: (px / w) * h }}
        role="img"
        aria-label={onPick ? `${label}. ${T.board.keys}` : label}
        tabIndex={onPick ? 0 : undefined}
        onKeyDown={onKey}
        onFocus={() => { if (onPick && !cursor) setCursor(hints[0] ?? [8, 9]); }}
        onPointerDown={(e) => {
          if (!onPick) return;
          const [x, y] = cellAt(e);
          setCursor([x, y]);
          onPick(x, y);
        }}
      />
      <p className="mp-pstrip">
        {stripTurn ?? T.board.strip(m.board.turn)} · {score.join(' · ')}
        {points !== null && <> · {T.board.points(points)}</>}
      </p>
      <button type="button" className="mp-cells" aria-pressed={cells} aria-label={T.board.cellsLabel} onClick={() => setCells((v) => !v)}>
        {T.board.cells}
      </button>
      {minus && <p className="mp-minus" aria-hidden="true" style={{ color: PLAYER_COLOURS[minus.player] }}>−1 {NAMES[minus.player].toUpperCase()}</p>}
    </div>
  );
}
