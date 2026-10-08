/**
 * The broadcast of the recorded four-player match (docs/design/minpentai-study.md, "the match
 * first"). Pure: what is on the board at each turn, read from the engine (match.ts), named the
 * way the broadcast draws it, plus the match's story as events. The 3D view
 * (src/app/minpentai/broadcast.tsx) only draws this; nothing here is scripted by hand.
 *
 * - A tower is a player's site (a recognised symbol, kept for SITE_GRACE turns while it
 *   flickers). Its id is stable while it stands.
 * - A drone is a glider the engine recognises (glider.ts), with the player who owns most of it.
 * - Everything else alive is a block: a square a player put down, or wreckage.
 * - Rocks never change.
 */
import { findGliders } from './glider';
import { PLAYER_COLOURS, advance, isIntervention, newMatch, place, stampCells, type Match, type MatchEvent } from './match';
import { WATCH_SETUP, watchMovesAt } from './matches';

export const PLAYER_NAMES = ['Cyan', 'Amber', 'Pink', 'Violet'] as const;
export { PLAYER_COLOURS };

export interface Tower { id: number; x: number; y: number; player: number }
export interface Drone { x: number; y: number; dx: number; dy: number; player: number | null }
export interface Frame {
  turn: number;
  towers: Tower[];
  drones: Drone[];
  /** Live cells that are neither a tower nor a drone: [x, y, owner (0 = none, else player + 1)]. */
  blocks: [number, number, number][];
  /** Squares put down this turn, for the crews: [x, y, player]. */
  placed: [number, number, number][];
  intervention: boolean;
  /** Towers each player has, in player order; null once a player is out. */
  score: (number | null)[];
}
export interface Story {
  turn: number;
  kind: 'begins' | 'intervention' | 'lost' | 'out' | 'end';
  player?: number;
  /** For 'lost': the tower that fell, and how many that player has left. */
  tower?: Tower;
  left?: number;
}

export interface Broadcast {
  w: number;
  h: number;
  rocks: [number, number][];
  frames: Frame[];
  story: Story[];
  winner: number | null;
}

let cached: Broadcast | null = null;

/** Runs the recorded match once and keeps every turn. About 350 turns. */
export function broadcast(): Broadcast {
  if (cached) return cached;
  let m: Match = newMatch(WATCH_SETUP);
  const { w, h } = m.board;
  const rocks: [number, number][] = [];
  m.board.rocks.forEach((r, i) => r && rocks.push([i % w, Math.floor(i / w)]));
  let nextId = 1;
  // Tower ids follow sites: a site keeps its id while it stands.
  let ids = new Map<string, number>();
  const frames: Frame[] = [];
  const story: Story[] = [{ turn: 0, kind: 'begins' }];

  const snapshot = (mm: Match, placed: [number, number, number][]): Frame => {
    const next = new Map<string, number>();
    const towers: Tower[] = [];
    for (const p of mm.players) {
      if (p.out) continue;
      for (const s of p.sites) {
        // The same site may have moved a cell or two; find its previous id nearby.
        let id: number | undefined;
        for (const [k, v] of ids) {
          const [pp, x, y] = k.split(',').map(Number);
          if (pp === p.id && Math.abs(x - s.x) <= 2 && Math.abs(y - s.y) <= 2 && ![...next.values()].includes(v)) { id = v; break; }
        }
        id ??= nextId++;
        next.set(`${p.id},${s.x},${s.y}`, id);
        towers.push({ id, x: s.x, y: s.y, player: p.id });
      }
    }
    ids = next;
    const gl = findGliders(mm.board);
    const taken = new Uint8Array(w * h);
    const drones: Drone[] = gl.map((g) => {
      const tally = [0, 0, 0, 0];
      for (let y = g.y; y < g.y + 4; y++) for (let x = g.x; x < g.x + 4; x++) {
        const i = (y % h) * w + (x % w);
        if (mm.board.cells[i]) { taken[i] = 1; if (mm.owners[i]) tally[mm.owners[i] - 1]++; }
      }
      const best = tally.indexOf(Math.max(...tally));
      return { x: g.x, y: g.y, dx: g.dx, dy: g.dy, player: tally[best] ? best : null };
    });
    // A tower's own cells are drawn as the tower.
    for (const t of towers) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) taken[(((t.y + dy) % h) + h) % h * w + (((t.x + dx) % w) + w) % w] = 1;
    const blocks: [number, number, number][] = [];
    for (let i = 0; i < w * h; i++) if (mm.board.cells[i] && !taken[i]) blocks.push([i % w, Math.floor(i / w), mm.owners[i]]);
    return {
      turn: mm.board.turn,
      towers,
      drones,
      blocks,
      placed,
      intervention: isIntervention(mm),
      score: mm.players.map((p) => (p.out ? null : p.sites.length)),
    };
  };

  for (let guard = 0; guard < 2000; guard++) {
    const placed: [number, number, number][] = [];
    if (isIntervention(m)) {
      if (m.board.turn > 0) story.push({ turn: m.board.turn, kind: 'intervention' });
      for (const mv of watchMovesAt(m.board.turn)) {
        const before = m;
        m = place(m, mv.player, mv.p);
        if (m !== before) for (const [x, y] of stampCells(m.board, mv.p)) placed.push([x, y, mv.player]);
      }
    }
    const prev = frames.length ? frames[frames.length - 1] : null;
    const f = snapshot(m, placed);
    frames.push(f);
    if (m.winner !== undefined) break;
    const n = m.events.length;
    m = advance(m);
    for (const e of m.events.slice(n) as MatchEvent[]) {
      if (e.kind === 'symbolLost') {
        const t = (prev ?? f).towers.concat(f.towers).find((q) => q.player === e.player && Math.abs(q.x - e.x) <= 2 && Math.abs(q.y - e.y) <= 2);
        story.push({ turn: e.turn, kind: 'lost', player: e.player, tower: t, left: m.players[e.player].sites.length });
      } else if (e.kind === 'out') story.push({ turn: e.turn, kind: 'out', player: e.player });
      else if (e.kind === 'end') story.push({ turn: e.turn, kind: 'end', player: e.winner ?? undefined });
    }
  }
  if (m.winner !== undefined && frames[frames.length - 1].turn !== m.board.turn) frames.push(snapshot(m, []));
  cached = { w, h, rocks, frames, story, winner: m.winner ?? null };
  return cached;
}

/** The commentary line for a story event: what the crowd is told, in plain words. */
export function commentary(s: Story): string {
  const name = s.player !== undefined ? PLAYER_NAMES[s.player] : '';
  switch (s.kind) {
    case 'begins': return 'The battle begins. Each player starts with two towers in a corner.';
    case 'intervention': return 'A turn to act. Everyone may put down a few squares near their towers.';
    case 'lost': return s.left ? `${name} loses a tower. ${s.left} left.` : `${name} loses a tower.`;
    case 'out': return `${name} is out.`;
    case 'end': return s.player !== undefined ? `${name} wins.` : 'A draw.';
  }
}
