/**
 * The board as pieces: what the lessons and the broadcast draw over the cells. Pure.
 * - A tower is a player's site (match.ts). `breaking` while its symbol is not recognised
 *   (it has been hit, or is flickering) and the site is still in its grace turns.
 * - A glider is a cluster glider.ts recognises, owned by whoever owns most of its cells.
 * - Every other live cell is a block: a square someone put down, or wreckage.
 */
import { findGliders } from './glider';
import { ownedSymbols, type Match } from './match';

export interface TowerPiece { x: number; y: number; player: number; breaking: boolean }
export interface GliderPiece { x: number; y: number; dx: number; dy: number; player: number | null }
export interface Pieces {
  towers: TowerPiece[];
  gliders: GliderPiece[];
  /** [x, y, owner (0 = none, else player + 1)] */
  blocks: [number, number, number][];
}

export function piecesOf(m: Match): Pieces {
  const { w, h, cells } = m.board;
  const at = (x: number, y: number) => (((y % h) + h) % h) * w + (((x % w) + w) % w);
  const taken = new Uint8Array(w * h);
  const seen = ownedSymbols(m.board, m.owners);
  const towers: TowerPiece[] = [];
  for (const p of m.players) {
    if (p.out) continue;
    for (const s of p.sites) {
      const live = seen.some((q) => q.owner === p.id && Math.abs(q.cx - s.x) <= 1 && Math.abs(q.cy - s.y) <= 1);
      towers.push({ x: s.x, y: s.y, player: p.id, breaking: !live });
      if (live) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) taken[at(s.x + dx, s.y + dy)] = 1;
    }
  }
  const gliders: GliderPiece[] = findGliders(m.board).map((g) => {
    const tally = [0, 0, 0, 0];
    for (let y = g.y; y < g.y + 4; y++) for (let x = g.x; x < g.x + 4; x++) {
      const i = at(x, y);
      if (cells[i]) { taken[i] = 1; if (m.owners[i]) tally[m.owners[i] - 1]++; }
    }
    const best = tally.indexOf(Math.max(...tally));
    return { x: g.x, y: g.y, dx: g.dx, dy: g.dy, player: tally[best] ? best : null };
  });
  const blocks: [number, number, number][] = [];
  for (let i = 0; i < w * h; i++) if (cells[i] && !taken[i]) blocks.push([i % w, Math.floor(i / w), m.owners[i]]);
  return { towers, gliders, blocks };
}
