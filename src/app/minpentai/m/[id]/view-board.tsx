import type { boardOut } from '~/lib/minpentai/agent-play/solo';

type Board = ReturnType<typeof boardOut>;
const CYAN = '#46D7E8', AMBER = '#FFB43A', ROCK = '#4B4C55', GRID = '#16171C', CELL = '#0E0F13';
const Z = 24;
const col = (side: string) => (side === 'mine' ? CYAN : AMBER);
const DIR: Record<string, [number, number]> = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };

/** A side's board, drawn from the lists the agent gets (solo.ts boardOut): nothing more is passed in. */
export type Ghost = { piece: string; x: number; y: number; dir?: string; slant?: string };
export function ViewBoard({ board, width, height, canPlace = [], lastSeen = [], marks = [], ghosts = [], seen = null, label = 'Your side\'s view of the board' }: { board: Board; width: number; height: number; canPlace?: number[][]; lastSeen?: { x: number; y: number }[]; /** Squares placed last turn, outlined. */ marks?: { x: number; y: number }[]; /** This turn's draft, not yet taken: drawn faint, with where each flies or faces. */ ghosts?: Ghost[]; /** A replay frame: the squares the side sees (the rest shaded); null: no shading. */ seen?: [number, number][] | null; label?: string }) {
  const at = (x: number, y: number) => ({ cx: x * Z + Z / 2, cy: y * Z + Z / 2 });
  return (
    <svg className="mb-board" viewBox={`0 0 ${width * Z} ${height * Z}`} role="img" aria-label={label}>
      <defs><marker id="mb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={CYAN} /></marker></defs>
      <rect width={width * Z} height={height * Z} fill={GRID} />
      {Array.from({ length: width * height }, (_, k) => <rect key={k} x={(k % width) * Z + 1} y={Math.floor(k / width) * Z + 1} width={Z - 2} height={Z - 2} fill={CELL} />)}
      {canPlace.map(([x, y]) => <rect key={`c${x},${y}`} x={x * Z + 1} y={y * Z + 1} width={Z - 2} height={Z - 2} fill="#1B2A2E" />)}
      {board.rocks.map((r) => <rect key={`r${r.x},${r.y}`} x={r.x * Z + 3} y={r.y * Z + 3} width={Z - 6} height={Z - 6} rx={4} fill={ROCK} />)}
      {board.squares.map((q) => <rect key={`s${q.x},${q.y}`} x={q.x * Z + 5} y={q.y * Z + 5} width={Z - 10} height={Z - 10} fill={col(q.side)} opacity={q.hits_left > 1 ? 1 : 0.5} />)}
      {board.towers.map((t) => <circle key={`t${t.x},${t.y}`} {...at(t.x, t.y)} r={8} fill="none" stroke={col(t.side)} strokeWidth={3} strokeDasharray={t.forming ? '4 3' : undefined} />)}
      {lastSeen.map((t) => <circle key={`l${t.x},${t.y}`} {...at(t.x, t.y)} r={8} fill="none" stroke={AMBER} strokeWidth={1.5} strokeDasharray="2 3" opacity={0.6} />)}
      {(board.mirrors ?? []).map((m) => <line key={`m${m.x},${m.y}`} x1={m.slant === '/' ? m.x * Z + 4 : m.x * Z + Z - 4} y1={m.y * Z + Z - 4} x2={m.slant === '/' ? m.x * Z + Z - 4 : m.x * Z + 4} y2={m.y * Z + 4} stroke={col(m.side)} strokeWidth={3} strokeLinecap="round" />)}
      {(board.factories ?? []).map((f) => <rect key={`f${f.x},${f.y}`} x={f.x * Z + 5} y={f.y * Z + 5} width={Z - 10} height={Z - 10} fill="none" stroke={col(f.side)} strokeWidth={2} />)}
      {(board.resting_symbol_gliders ?? []).map((g) => <circle key={`e${g.x},${g.y}`} {...at(g.x, g.y)} r={4} fill={col(g.side)} />)}
      {(board.moving_walls ?? []).flatMap((w, i) => w.squares.map((q) => <rect key={`w${i}-${q.x},${q.y}`} x={q.x * Z + 2} y={q.y * Z + 2} width={Z - 4} height={Z - 4} rx={2} fill={col(w.side)} opacity={0.75} />))}
      {marks.map((q, i) => <rect key={`k${i}`} x={q.x * Z + 1} y={q.y * Z + 1} width={Z - 2} height={Z - 2} fill="none" stroke="#F4F2ED" strokeWidth={1.5} strokeDasharray="3 2" />)}
      {ghosts.map((p, i) => {
        const { cx, cy } = at(p.x, p.y), [dx, dy] = DIR[p.dir ?? ''] ?? [0, 0];
        return (
          <g key={`d${i}`} className="mb-ghost" opacity={0.55}>
            <rect x={p.x * Z + 2} y={p.y * Z + 2} width={Z - 4} height={Z - 4} rx={4} fill="none" stroke={CYAN} strokeWidth={1.5} strokeDasharray="3 2" />
            {p.piece === 'tower' ? <circle cx={cx} cy={cy} r={7} fill="none" stroke={CYAN} strokeWidth={2.5} /> : null}
            {p.piece === 'square' ? <rect x={p.x * Z + 6} y={p.y * Z + 6} width={Z - 12} height={Z - 12} fill={CYAN} /> : null}
            {p.piece === 'mirror' ? <line x1={p.slant === '/' ? p.x * Z + 5 : p.x * Z + Z - 5} y1={p.y * Z + Z - 5} x2={p.slant === '/' ? p.x * Z + Z - 5 : p.x * Z + 5} y2={p.y * Z + 5} stroke={CYAN} strokeWidth={3} /> : null}
            {dx || dy ? <line x1={cx} y1={cy} x2={cx + dx * (Z * 1.6)} y2={cy + dy * (Z * 1.6)} stroke={CYAN} strokeWidth={2} markerEnd="url(#mb-arrow)" /> : null}
            {p.piece === 'glider' || p.piece === 'symbol_glider' ? <circle cx={cx} cy={cy} r={p.piece === 'symbol_glider' ? 4 : 5} fill={CYAN} /> : null}
          </g>
        );
      })}
      {seen ? (() => { const lit = new Set(seen.map(([x, y]) => y * width + x)); return Array.from({ length: width * height }, (_, k) => (lit.has(k) ? null : <rect key={`f${k}`} x={(k % width) * Z} y={Math.floor(k / width) * Z} width={Z} height={Z} fill="#000" opacity={0.45} />)); })() : null}
      {board.gliders.map((g, i) => {
        const [dx, dy] = DIR[g.dir] ?? [1, 0], { cx, cy } = at(g.x, g.y), n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n;
        return <polygon key={`g${i}`} points={`${cx + ux * 7},${cy + uy * 7} ${cx - ux * 5 - uy * 5},${cy - uy * 5 + ux * 5} ${cx - ux * 5 + uy * 5},${cy - uy * 5 - ux * 5}`} fill={col(g.side)} />;
      })}
    </svg>
  );
}
