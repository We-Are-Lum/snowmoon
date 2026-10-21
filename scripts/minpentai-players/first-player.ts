// A first computer player for Minpentai Play: a starting point to copy, not a strong player.
// Try it: npm run minpentai:vs-rungs -- scripts/minpentai-players/first-player.ts
import { K, XY, empty, lit, type Placement } from '../../src/lib/minpentai/play-game/game';
import type { Player } from '../../src/lib/minpentai/play-game/players';

const player: Player = (v) => {
  // Where I may place: empty squares within R of the towers I had when this turn began.
  const zone = [...lit(v.w, 'A', v.R, v.mine)].filter((k) => empty(v.w, k));
  const out: Placement[] = [];
  let points = v.points;
  // One glider flying left (towards Cyan's side), on the row of a tower I last saw if I can.
  const rows = Object.keys(v.lastSeen).map((k) => XY(+k)[1]);
  const shot = zone.find((k) => rows.includes(XY(k)[1])) ?? zone[0];
  if (shot !== undefined && points >= v.cost) {
    const [x, y] = XY(shot);
    out.push({ t: 'g', o: 'A', x, y, dx: -1, dy: 0 });
    points -= v.cost;
  }
  // The rest on squares (1 point each) just left of my towers, as a wall.
  for (const t of v.mine) {
    const [x, y] = XY(t);
    for (const k of [K(x - 1, y - 1), K(x - 1, y), K(x - 1, y + 1)]) {
      if (points < 1 || x < 1 || !zone.includes(k) || out.some((p) => K(p.x, p.y) === k)) continue;
      const [sx, sy] = XY(k);
      out.push({ t: 's', o: 'A', x: sx, y: sy, dx: 0, dy: 0 });
      points -= 1;
    }
  }
  return out;
};
export default player;
