/**
 * The "rush" player (2026-11-04, after the book-4 playtest: an AI won every level with one opening). A scripted
 * player for agent play's person side (Cyan), playing only from what the tools give an AI: viewFor (minpentai_get_view)
 * and symbolLaunches (minpentai_symbol_launches). It never reads the real board.
 *
 * Every turn:
 *   1. guards each of its towers with a square on the side facing the enemy (1 point each), if that square is free;
 *   2. sends symbol gliders down open rows (and columns) at the enemy's towers, seen or last seen, two per line,
 *      from the launch squares nearest the target ("open": nothing solid between, as far as its view shows);
 *      with fewer than two such lines (enemy towers out of sight), sweeps open rows nearest its latest kills;
 *   3. if no line to any enemy tower is open, forms a symbol near one with three converging launches
 *      (minpentai_symbol_launches), as the playtester did to get behind the rocks;
 *   4. with points left for a tower and a square, builds a tower as far from the enemy as it can, guarded;
 *   5. spends what is left on a third glider down an open line, then on squares guarding its towers' other sides.
 * It keeps rushing every turn: the gliders come first, a tower only from what they leave.
 */
import { createHash } from 'node:crypto';
import { newSolo, parseOrders, rulesOf, submit, symbolLaunches, viewFor, type OrderIn, type RulesetName, type SoloMatch } from '../../src/lib/minpentai/agent-play/solo';

type XY = { x: number; y: number };
const DIRS: [string, number, number][] = [['E', 1, 0], ['W', -1, 0], ['S', 0, 1], ['N', 0, -1]];

/** The rush player's orders for the open turn, from the person's view alone. */
export function rushOrders(m: SoloMatch): OrderIn[] {
  const v = viewFor(m) as unknown as {
    points: number; costs: Record<string, number>; board_size: { width: number; height: number };
    board: Record<string, (XY & { side?: string; squares?: XY[] })[] | undefined>;
    last_seen_enemy_towers: XY[]; your_kills: (XY & { step: number })[]; can_place: [number, number][]; towers_at_most?: number;
  };
  const key = (x: number, y: number) => `${x},${y}`;
  const W = v.board_size.width, H = v.board_size.height, inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  // Solid as far as the view shows: rocks, squares, towers, mirrors, resting symbol gliders, factories, wall squares.
  const solid = new Set<string>();
  for (const f of ['rocks', 'squares', 'towers', 'mirrors', 'resting_symbol_gliders', 'factories'] as const) for (const p of v.board[f] ?? []) solid.add(key(p.x, p.y));
  for (const w of v.board.moving_walls ?? []) for (const q of w.squares ?? []) solid.add(key(q.x, q.y));
  const can = new Set(v.can_place.map(([x, y]) => key(x, y)));
  const used = new Set<string>(), out: OrderIn[] = [];
  let pts = v.points;
  const sq = v.costs.square, seed = v.costs.symbol_glider ?? Infinity;
  const put = (o: OrderIn, cost: number) => { out.push(o); used.add(key(o.x, o.y)); pts -= cost; if (o.piece === 'square') solid.add(key(o.x, o.y)); };
  const free = (x: number, y: number) => can.has(key(x, y)) && !used.has(key(x, y));

  const mine = (v.board.towers ?? []).filter((t) => t.side === 'mine');
  const theirs: XY[] = [...(v.board.towers ?? []).filter((t) => t.side === 'theirs'), ...v.last_seen_enemy_towers];
  // The enemy's side of the board: where its towers are, on average (Cyan starts west, so east at first).
  const ex = theirs.length ? theirs.reduce((a, t) => a + t.x, 0) / theirs.length : W;
  const meanX = mine.length ? mine.reduce((a, t) => a + t.x, 0) / mine.length : 0;
  const fwd = ex >= meanX ? 1 : -1;

  // 1. A square on each tower's side facing the enemy.
  for (const t of mine) if (pts >= sq && inb(t.x + fwd, t.y) && free(t.x + fwd, t.y) && !solid.has(key(t.x + fwd, t.y))) put({ piece: 'square', x: t.x + fwd, y: t.y }, sq);

  // A tower and its square: on the free square farthest from the enemy, guarded on its enemy side (towers are what
  // wins on time; the playtester won level 3 on towers, 5 to 1).
  const tc = v.costs.tower;
  const buildTower = () => {
    if (pts < tc + sq || mine.length + built >= (v.towers_at_most ?? Infinity)) return;
    const spots = v.can_place.map(([x, y]) => ({ x, y })).filter((p) => free(p.x, p.y) && inb(p.x + fwd, p.y) && free(p.x + fwd, p.y) && !solid.has(key(p.x + fwd, p.y)))
      .sort((a, b) => fwd * (a.x - b.x) || a.y - b.y);
    const t = spots[0];
    if (t) { put({ piece: 'tower', x: t.x, y: t.y }, tc); put({ piece: 'square', x: t.x + fwd, y: t.y }, sq); built++; }
  };
  let built = 0;
  // 1b. After setup, one tower a turn first: the rush still gets the rest (6 points: three symbol gliders).
  if (m.turn > 0) buildTower();

  // 2. Open lines at enemy towers: for each target, launch squares on its row or column with nothing solid between.
  const lanes = (t: XY) => {
    const found: { x: number; y: number; dir: string; d: number }[] = [];
    for (const [dir, dx, dy] of DIRS) {
      // Walk back from the target against the direction of flight; every free launch square passed is a launch.
      let x = t.x - dx, y = t.y - dy, d = 1;
      while (inb(x, y) && !solid.has(key(x, y))) {
        if (free(x, y)) found.push({ x, y, dir, d });
        x -= dx; y -= dy; d++;
      }
    }
    return found.sort((a, b) => a.d - b.d);
  };
  const lineOf = (l: { x: number; y: number; dir: string }) => (l.dir === 'E' || l.dir === 'W' ? `r${l.y}${l.dir}` : `c${l.x}${l.dir}`);
  const sent = new Map<string, number>();
  const targets = [...theirs].sort((a, b) => Math.abs(a.x - meanX) - Math.abs(b.x - meanX));
  for (const t of targets) {
    for (const l of lanes(t)) {
      if (pts < seed) break;
      const n = sent.get(lineOf(l)) ?? 0;
      if (n >= 2 || !free(l.x, l.y)) continue;
      put({ piece: 'symbol_glider', x: l.x, y: l.y, dir: l.dir }, seed);
      sent.set(lineOf(l), n + 1);
    }
  }

  // 2b. Fewer than two lines at known towers (towers out of sight and no longer last seen: the kill reports clear
  //     them): sweep open rows into the dark, the rows nearest its latest kills and known towers first, two gliders
  //     a row, up to two rows in all (the enemy rebuilds within reach of the towers it still has).
  const hints = [...v.your_kills.slice().sort((a, b) => b.step - a.step), ...theirs];
  const rowsBy = [...Array(H).keys()].sort((a, b) => {
    const d = (y: number) => (hints.length ? Math.min(...hints.map((h) => Math.abs(h.y - y))) : Math.abs(y - (H - 1) / 2));
    return d(a) - d(b) || a - b;
  });
  for (const y of rowsBy) {
    if (sent.size >= 2 || pts < 2 * seed) break;
    const dir = fwd > 0 ? 'E' : 'W';
    if ((sent.get(`r${y}${dir}`) ?? 0) > 0) continue;
    // Launch squares on the row, most forward first, with nothing known solid from there to the far edge.
    const launches = v.can_place.filter(([x, yy]) => yy === y && free(x, y)).map(([x]) => x).sort((a, b) => fwd * (b - a));
    const clear = (x0: number) => { for (let x = x0 + fwd; inb(x, y); x += fwd) if (solid.has(key(x, y))) return false; return true; };
    const go = launches.filter(clear).slice(0, 2);
    if (go.length < 2) continue;
    for (const x of go) put({ piece: 'symbol_glider', x, y, dir }, seed);
    sent.set(`r${y}${dir}`, 2);
  }

  // 3. No open line at all: a forward symbol near the nearest enemy tower (minpentai_symbol_launches).
  if (!sent.size && pts >= 3 * seed) {
    search: for (const t of targets) for (let d = 2; d <= 4; d++) for (const dy of [0, -1, 1]) {
      const x = t.x - fwd * d, y = t.y + dy;
      if (!inb(x, y)) continue;
      const r = symbolLaunches(m, { x, y }) as { options?: { launches: { x: number; y: number; dir: string }[] }[] };
      const opt = (r.options ?? []).find((o) => o.launches.every((l) => free(l.x, l.y)));
      if (opt) { for (const l of opt.launches) put({ piece: 'symbol_glider', x: l.x, y: l.y, dir: l.dir }, seed); break search; }
    }
  }

  // 4. Points left for a tower and its square (after setup the tower came first, in 1b).
  buildTower();

  // 5. A third glider down a line already open, then squares on the towers' other open sides.
  for (const t of targets) for (const l of lanes(t)) {
    if (pts < seed) break;
    if ((sent.get(lineOf(l)) ?? 0) >= 3 || !free(l.x, l.y)) continue;
    put({ piece: 'symbol_glider', x: l.x, y: l.y, dir: l.dir }, seed);
    sent.set(lineOf(l), (sent.get(lineOf(l)) ?? 0) + 1);
  }
  for (const t of mine) for (const [, dx, dy] of DIRS) if (pts >= sq && inb(t.x + dx, t.y + dy) && free(t.x + dx, t.y + dy) && !solid.has(key(t.x + dx, t.y + dy))) put({ piece: 'square', x: t.x + dx, y: t.y + dy }, sq);
  return out;
}

export interface RushResult {
  /** From the rush player's side: won, drew or lost, and how. */
  result: 'win' | 'draw' | 'loss'; how: string; step: number; turns: number;
  kills: { rush: number; computer: number };
  /** Towers each side held at the end. */
  towers: { rush: number; computer: number };
  /** Per turn played: towers the computer placed, and computer towers destroyed. */
  perTurn: { placed: number; lost: number }[];
}

/** One match: the rush player (Cyan) against the site computer at `level`, as agent play serves it. */
export function playRush(o: { ruleset: RulesetName; level: number; seed: number; /** A revision (REVISIONS), or 'first': the ruleset's first computer. Absent: what a new match gets. */ computer?: number | 'first'; orders?: (m: SoloMatch) => OrderIn[] }): RushResult {
  const now = new Date(Date.UTC(2026, 10, 4)).toISOString();
  const { m } = newSolo({ id: `rush${o.seed}`, ruleset: o.ruleset, level: o.level, seed: o.seed, person: -1, agent: { id: null, name: 'rush', model: null }, now });
  // The computer's random value, fixed per seed so a run repeats exactly.
  m.cpu = createHash('sha256').update(`rush-${o.seed}`).digest('hex');
  m.cpuCommit = createHash('sha256').update(m.cpu).digest('hex');
  if (o.computer === 'first') delete m.computer;
  else if (o.computer !== undefined) m.computer = o.computer;
  const perTurn: RushResult['perTurn'] = [];
  let guard = 0;
  while (!m.end && guard++ < 40) {
    const { s } = rulesOf(m);
    const before = m.kills.C;
    const orders = (o.orders ?? rushOrders)(m);
    let ps = parseOrders(orders, s);
    try { submit(m, { turn: m.turn, placements: ps, source: 'agent', final: true, now }); }
    catch { ps = []; submit(m, { turn: m.turn, placements: ps, source: 'agent', final: true, now }); }
    const h = m.history[m.history.length - 1];
    perTurn.push({ placed: h.A.placements.filter((p) => p.t === 't').length, lost: m.kills.C - before });
  }
  const end = m.end!;
  return {
    result: end.win === 'C' ? 'win' : end.win === 'D' ? 'draw' : 'loss', how: end.how, step: end.step, turns: m.history.length,
    kills: { rush: m.kills.C, computer: m.kills.A }, towers: { rush: rulesOf(m).e.towers(m.w, 'C').length, computer: rulesOf(m).e.towers(m.w, 'A').length }, perTurn,
  };
}
