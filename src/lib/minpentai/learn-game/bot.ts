/**
 * The practice match's computer player (Design's bot, docs/design/minpentai-intro-v3.dc.html), moved
 * out of LearnController.botTurn unchanged so the home page's board can use it too. RULES INVENTED
 * FOR THIS EDITION, like everything in learn-game/.
 *
 * It plays Amber (player 1), reading the whole board (it ignores fog): it blocks a Cyan glider
 * heading for one of its towers with a square, fires gliders along its targets' rows, and spends
 * what is left on squares. botTurn(s, 0, …) plays Cyan with the same bot, on the board mirrored left
 * to right (the home page's board playing itself).
 */
import { G_, PH, PW, Q_, near, pClone, type Costs, type PState } from './pieces';

/** Amber's turn, exactly as Design wrote it. */
function amber(s0: PState, cost: Costs, rnd: () => number): PState {
  const s = pClone(s0);
  let pts = 8;
  const occ = (x: number, y: number) => s.pieces.some((q) => q.x === x && q.y === y), zoneB = (x: number, y: number) => near(s, x, y, 3, 1);
  const add = (q: ReturnType<typeof Q_>) => s.pieces.push({ ...q, id: s.nid++, trail: [] });
  for (const tw of s.pieces.filter((q) => q.k === 'tower' && q.p === 1)) {
    const threat = s.pieces.some((q) => q.k === 'glider' && q.p === 0 && q.y === tw.y && q.dx === 1 && q.x < tw.x && !s.pieces.some((o) => o.k !== 'glider' && o.y === tw.y && o.x > q.x && o.x < tw.x));
    if (threat && pts >= cost.square) for (let x = tw.x - 1; x >= tw.x - 3; x--) if (!occ(x, tw.y) && zoneB(x, tw.y)) { add(Q_(x, tw.y, 1)); pts -= cost.square; break; }
  }
  const targets = s.pieces.filter((q) => q.k === 'tower' && q.p === 0);
  let tries = 0;
  while (targets.length && pts >= cost.glider && tries++ < 24) {
    const tg = targets[Math.floor(rnd() * targets.length)], y = tries < 6 ? tg.y : Math.floor(rnd() * PH);
    for (let x = 12; x >= 10; x--) if (!occ(x, y) && zoneB(x, y)) { add(G_(x, y, 1, -1, 0)); pts -= cost.glider; break; }
  }
  while (pts >= cost.square && tries++ < 40) {
    const x = 10 + Math.floor(rnd() * 3), y = Math.floor(rnd() * PH);
    if (!occ(x, y) && zoneB(x, y)) { add(Q_(x, y, 1)); pts -= cost.square; }
  }
  return s;
}

/** The board seen from the other side: left and right swapped, and the two players. */
function mirror(s: PState): PState {
  const m = pClone(s);
  for (const q of m.pieces) {
    q.x = PW - 1 - q.x;
    q.dx = -q.dx;
    q.trail = q.trail.map(([x, y]) => [PW - 1 - x, y]);
    if (q.p === 0 || q.p === 1) q.p = 1 - q.p;
  }
  return m;
}

/** Player p's turn: places its pieces and returns the new state. */
export function botTurn(s: PState, p: 0 | 1, cost: Costs, rnd: () => number): PState {
  return p === 1 ? amber(s, cost, rnd) : mirror(amber(mirror(s), cost, rnd));
}
