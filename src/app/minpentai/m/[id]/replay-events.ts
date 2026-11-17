/**
 * What happened between two frames of a replay, for the 3D action's motion and effects (owner, 2026-11-03: "every effect
 * comes only from events in my side's fog frames; nothing reacts to, points at or hints at anything out of sight").
 *
 * Pure, and given only what the 2D board is given: the frame before, this frame and the squares this frame sees (null
 * once the match is over and the whole board shows). An effect happens only on a square in sight; a piece that leaves
 * sight just fades into the cloud, whatever happened to it there. Tested in scripts/test-minpentai-agent-play.ts.
 */
import type { boardOut } from '~/lib/minpentai/agent-play/solo';

type Board = ReturnType<typeof boardOut>;
type Side = 'mine' | 'theirs';
const DIR: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0], NE: [1, -1], NW: [-1, -1], SE: [1, 1], SW: [-1, 1] };
export const dirOf = (d: string): [number, number] => DIR[d] ?? [0, 0];

export type ReplayEvent =
  /** A glider flew from one square to the next (both shown in the frames). */
  | { kind: 'glide'; side: Side; from: [number, number]; to: [number, number]; dir: string; symbol?: boolean }
  /** A glider launched, or came into sight: it fades in. */
  | { kind: 'arrive'; side: Side; at: [number, number] }
  /** A glider gone from a square in sight whose next square is in sight too: it was stopped there. */
  | { kind: 'stopped'; side: Side; at: [number, number] }
  /** A glider that flew on into the dark (or off the board): it fades out. No effect. */
  | { kind: 'leave'; side: Side; at: [number, number]; dir: string }
  /** A piece gone from a square in sight. */
  | { kind: 'destroyed'; piece: 'tower' | 'square' | 'mirror' | 'factory' | 'rock' | 'resting'; side: Side | null; at: [number, number] }
  /** A piece in sight that lost hits. */
  | { kind: 'hit'; piece: 'square' | 'mirror' | 'factory'; side: Side; at: [number, number] }
  /** A symbol formed in sight: a forming tower appeared there. */
  | { kind: 'formed'; side: Side; at: [number, number] };

const key = (x: number, y: number) => `${x},${y}`;

export function replayEvents(prev: Board | null, cur: Board, seen: [number, number][] | null, size: [number, number]): ReplayEvent[] {
  if (!prev) return [];
  const sight = seen ? new Set(seen.map(([x, y]) => key(x, y))) : null;
  const inSight = (x: number, y: number) => !sight || sight.has(key(x, y));
  const out: ReplayEvent[] = [];
  // Gliders: each of this frame's is matched to the one it was a step before (same side, came from one square back on
  // its heading, or from a square next to it if it turned); unmatched ones arrive, unmatched old ones stop or leave.
  const used = new Set<number>();
  const matchAt = (side: string, x: number, y: number, dir?: string) => prev.gliders.findIndex((g, i) => !used.has(i) && g.side === side && g.x === x && g.y === y && (dir === undefined || g.dir === dir));
  for (const g of cur.gliders) {
    const [dx, dy] = dirOf(g.dir);
    let i = matchAt(g.side, g.x - dx, g.y - dy, g.dir);
    if (i < 0) for (const [ax, ay] of Object.values(DIR)) { i = matchAt(g.side, g.x - ax, g.y - ay); if (i >= 0) break; }
    if (i >= 0) { used.add(i); const p = prev.gliders[i]; out.push({ kind: 'glide', side: g.side as Side, from: [p.x, p.y], to: [g.x, g.y], dir: g.dir, ...(g.symbol ? { symbol: true } : {}) }); }
    else out.push({ kind: 'arrive', side: g.side as Side, at: [g.x, g.y] });
  }
  prev.gliders.forEach((g, i) => {
    if (used.has(i)) return;
    const [dx, dy] = dirOf(g.dir);
    const nx = g.x + dx, ny = g.y + dy, onBoard = nx >= 0 && ny >= 0 && nx < size[0] && ny < size[1];
    if (onBoard && inSight(g.x, g.y) && inSight(nx, ny)) out.push({ kind: 'stopped', side: g.side as Side, at: [g.x, g.y] });
    else out.push({ kind: 'leave', side: g.side as Side, at: [g.x, g.y], dir: g.dir });
  });
  // Pieces that stand on a square: gone from a square in sight, or hit there.
  const gone = <P extends { x: number; y: number }>(piece: Extract<ReplayEvent, { kind: 'destroyed' }>['piece'], a: P[] | undefined, b: P[] | undefined, side: (p: P) => Side | null) => {
    const now = new Set((b ?? []).map((p) => key(p.x, p.y)));
    for (const p of a ?? []) if (!now.has(key(p.x, p.y)) && inSight(p.x, p.y)) out.push({ kind: 'destroyed', piece, side: side(p), at: [p.x, p.y] });
  };
  const hits = <P extends { x: number; y: number; side: string; hits_left: number }>(piece: Extract<ReplayEvent, { kind: 'hit' }>['piece'], a: P[] | undefined, b: P[] | undefined) => {
    const was = new Map((a ?? []).map((p) => [key(p.x, p.y), p]));
    for (const p of b ?? []) { const q = was.get(key(p.x, p.y)); if (q && q.side === p.side && p.hits_left < q.hits_left && inSight(p.x, p.y)) out.push({ kind: 'hit', piece, side: p.side as Side, at: [p.x, p.y] }); }
  };
  gone('tower', prev.towers, cur.towers, (p) => p.side as Side);
  gone('square', prev.squares, cur.squares, (p) => p.side as Side);
  gone('mirror', prev.mirrors, cur.mirrors, (p) => p.side as Side);
  gone('factory', prev.factories, cur.factories, (p) => p.side as Side);
  gone('resting', prev.resting_symbol_gliders, cur.resting_symbol_gliders, (p) => p.side as Side);
  gone('rock', prev.rocks, cur.rocks, () => null);
  // A symbol forming: a tower marked forming that wasn't there a step before, on a square in sight.
  const had = new Set(prev.towers.map((t) => key(t.x, t.y)));
  for (const t of cur.towers) if (t.forming && !had.has(key(t.x, t.y)) && inSight(t.x, t.y)) out.push({ kind: 'formed', side: t.side as Side, at: [t.x, t.y] });
  hits('square', prev.squares, cur.squares);
  hits('mirror', prev.mirrors, cur.mirrors);
  hits('factory', prev.factories, cur.factories);
  return out;
}

/**
 * Instant replays (owner, 2026-11-04): the moments of a turn worth seeing again, from the same frames and so only what
 * the side saw. Tiered by drama: 1 a square, mirror, factory or resting symbol broken (a quick close-up); 2 a symbol
 * formed (a short orbit); 3 a tower destroyed, either side's (slow motion, the camera sweeping in); 4 the match's end,
 * the final tower falling (the slowest, then the camera pulls back over the whole board). A square only chipped gets
 * no replay. At most the two biggest, in the order they happened. Each replays a few frames around its own, slower.
 */
export interface Moment { tier: 1 | 2 | 3 | 4; frame: number; at: [number, number]; side: Side | null; from: number; to: number; stepMs: number; holdMs: number; mode: 'close' | 'orbit' | 'sweep' | 'final' }
const SHAPE: Record<Moment['tier'], { before: number; after: number; stepMs: number; holdMs: number; mode: Moment['mode'] }> = {
  1: { before: 1, after: 0, stepMs: 500, holdMs: 100, mode: 'close' },
  2: { before: 2, after: 1, stepMs: 500, holdMs: 200, mode: 'orbit' },
  3: { before: 3, after: 1, stepMs: 560, holdMs: 400, mode: 'sweep' },
  4: { before: 3, after: 0, stepMs: 900, holdMs: 2200, mode: 'final' },
};
export function instantReplays(frames: { board: Board; seen: [number, number][] | null }[], size: [number, number], o: { ended?: boolean; only?: 'big' } = {}): Moment[] {
  const found: Omit<Moment, 'from' | 'to' | 'stepMs' | 'holdMs' | 'mode'>[] = [];
  for (let i = 1; i < frames.length; i++) {
    for (const e of replayEvents(frames[i - 1].board, frames[i].board, frames[i].seen, size)) {
      if (e.kind === 'destroyed' && e.piece === 'tower') found.push({ tier: 3, frame: i, at: e.at, side: e.side });
      else if (e.kind === 'destroyed' && e.piece !== 'rock') found.push({ tier: 1, frame: i, at: e.at, side: e.side });
      else if (e.kind === 'formed') found.push({ tier: 2, frame: i, at: e.at, side: e.side });
    }
  }
  // The end: once the match is over and a side has no tower left, its last tower to fall is the final moment.
  const last = frames.at(-1)?.board;
  if (o.ended && last) {
    const lost = (['mine', 'theirs'] as const).filter((sd) => !last.towers.some((t) => t.side === sd));
    const fin = [...found].reverse().find((m) => m.tier === 3 && m.side !== null && lost.includes(m.side));
    if (fin) fin.tier = 4;
  }
  const picked = found.filter((m) => o.only !== 'big' || m.tier >= 3).sort((a, b) => b.tier - a.tier || a.frame - b.frame).slice(0, 2).sort((a, b) => a.frame - b.frame);
  return picked.map((m) => { const sh = SHAPE[m.tier]; return { ...m, from: Math.max(0, m.frame - sh.before), to: Math.min(frames.length - 1, m.frame + sh.after), stepMs: sh.stepMs, holdMs: sh.holdMs, mode: sh.mode }; });
}

/** Where the camera follows during playback: the middle of this step's events in sight (none: the board's middle). */
export function actionCentre(ev: ReplayEvent[]): [number, number] | null {
  const pts = ev.flatMap((e) => (e.kind === 'glide' ? [e.to] : e.kind === 'leave' ? [] : [e.at]));
  if (!pts.length) return null;
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}
