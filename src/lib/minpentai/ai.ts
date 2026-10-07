/**
 * Computer players for matches. Pure and deterministic for a given seed. Invented,
 * like everything about matches (see match.ts).
 *
 * A computer player plays fair: it knows the rocks and only the cells it can see.
 * - 'normal' tries its options in a private copy of what it sees (as players test
 *   designs in a private sandbox first, c4-b96): it blocks gliders that would destroy
 *   its symbols, fires at symbols it can see when a test shows the shot lands, and
 *   spreads new symbols to see further.
 * - 'easy' tests only that a shot will not hit its own symbols. It spreads slowly,
 *   fires roughly in your direction without checking its aim, and never defends.
 */
import { stepOwned, ownedSymbols, sightMask, placeProblem, place, dist, snap, stampCells, type Match, type Placement, type Dir } from './match';

export type Level = 'easy' | 'normal';

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const VEC: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** What player `id` knows: the match with every cell it cannot see removed. */
export function knowledge(m: Match, id: number): Match {
  const mask = sightMask(m, id);
  const cells = new Uint8Array(m.board.cells.length);
  const owners = new Uint8Array(m.owners.length);
  for (let i = 0; i < cells.length; i++) if (mask[i]) { cells[i] = m.board.cells[i]; owners[i] = m.owners[i]; }
  return {
    ...m, board: { ...m.board, cells }, owners,
    players: m.players.map((p) => (p.id === id ? p : { ...p, sites: p.sites.filter((s) => mask[s.y * m.board.w + s.x]) })),
  };
}

/** Sites of each player still standing after `turns` turns with these placements and nothing else. */
export function forecast(m: Match, id: number, plan: Placement[], turns: number): { mine: number; theirs: number } {
  let x = m;
  for (const p of plan) x = place(x, id, p);
  let b = x.board, o = x.owners;
  const seen = x.players.map((p) => p.sites.map(() => false));
  for (let t = 1; t <= turns; t++) {
    ({ board: b, owners: o } = stepOwned(b, o));
    if (t <= turns - 8) continue;
    for (const s of ownedSymbols(b, o)) {
      if (s.owner === null) continue;
      x.players[s.owner].sites.forEach((q, k) => { if (dist(b, q.x, q.y, s.cx, s.cy) <= 3) seen[s.owner!][k] = true; });
    }
  }
  let mine = 0, theirs = 0;
  seen.forEach((list, pid) => list.forEach((ok) => { if (ok) { if (pid === id) mine++; else theirs++; } }));
  return { mine, theirs };
}

/** Every glider spot on the working grid within reach of player `id`'s sites. */
function gliderSpots(m: Match, id: number): Placement[] {
  const out: Placement[] = [];
  const seen = new Set<string>();
  for (const s of m.players[id].sites) {
    const r = m.rules.reach;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) for (const dir of DIRS) {
      const p = snap(m.board, { kind: 'glider', dir, x: s.x + dx, y: s.y + dy });
      const k = `${p.x},${p.y},${dir}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!placeProblem(m, id, p)) out.push(p);
    }
  }
  return out;
}

/** Whether a glider's lane passes over a point (on the wrapping board), heading toward it. */
function laneHits(m: Match, p: Placement, x: number, y: number): boolean {
  const [vx, vy] = VEC[p.dir!];
  const cells = stampCells(m.board, p);
  const cx = cells.reduce((a, c) => a + c[0], 0) / 4, cy = cells.reduce((a, c) => a + c[1], 0) / 4;
  const lat = vx ? Math.abs(((y - cy + m.board.h * 1.5) % m.board.h) - m.board.h / 2) : Math.abs(((x - cx + m.board.w * 1.5) % m.board.w) - m.board.w / 2);
  return lat <= 2.5 && dist(m.board, cx, cy, x, y) > 2;
}

export function plan(m: Match, id: number, level: Level, random: () => number): Placement[] {
  const k = knowledge(m, id);
  const me = k.players[id];
  if (me.out) return [];
  const enemies = k.players.filter((p) => p.id !== id && !p.out).flatMap((p) => p.sites);
  const chosen: Placement[] = [];
  let km = k;
  const take = (p: Placement) => { chosen.push(p); km = place(km, id, p); };
  const horizon = m.rules.interval * 2;

  if (level === 'normal') {
    // Defend: if doing nothing loses a symbol, try single mirror cells near it.
    const base = forecast(km, id, [], horizon);
    if (base.mine < me.sites.length) {
      let best: Placement | null = null, bestMine = base.mine;
      for (const s of me.sites) for (let dy = -m.rules.reach; dy <= m.rules.reach; dy++) for (let dx = -m.rules.reach; dx <= m.rules.reach; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 3) continue;
        const p: Placement = { kind: 'mirror', x: (s.x + dx + m.board.w) % m.board.w, y: (s.y + dy + m.board.h) % m.board.h };
        if (placeProblem(km, id, p) || random() > 0.5) continue;
        const f = forecast(km, id, [p], horizon);
        if (f.mine > bestMine) { best = p; bestMine = f.mine; }
      }
      if (best) take(best);
    }
    // Attack: test aimed shots at symbols it can see.
    if (enemies.length) {
      const before = forecast(km, id, [], horizon);
      let best: Placement | null = null, bestScore = 0;
      for (const p of gliderSpots(km, id)) {
        if (!enemies.some((e) => laneHits(km, p, e.x, e.y))) continue;
        const f = forecast(km, id, [p], horizon);
        const score = (before.theirs - f.theirs) * 10 - (before.mine - f.mine) * 12;
        if (score > bestScore) { best = p; bestScore = score; }
      }
      if (best) take(best);
    }
  } else if (enemies.length && random() < 0.5) {
    // Easy: a rough shot at a symbol it can see, untested.
    const aimed = gliderSpots(km, id).filter((p) => enemies.some((e) => laneHits(km, p, e.x, e.y)));
    const shot = pickSafe(km, id, aimed, random, horizon);
    if (shot) take(shot);
  }

  // Spread: a new symbol at the edge of reach, toward the middle of the board or the enemy.
  const spreadChance = level === 'easy' ? 0.5 : 1;
  if (km.left[id] >= 4 && random() < spreadChance) {
    const target = enemies[0] ?? { x: m.board.w / 2, y: m.board.h / 2 };
    const mask = sightMask(km, id);
    let best: Placement | null = null, bestScore = -Infinity;
    for (const s of km.players[id].sites) for (let dy = -m.rules.reach; dy <= m.rules.reach; dy++) for (let dx = -m.rules.reach; dx <= m.rules.reach; dx++) {
      const p: Placement = { kind: 'symbol', x: (s.x + dx - 1 + m.board.w) % m.board.w, y: (s.y + dy - 1 + m.board.h) % m.board.h };
      if (placeProblem(km, id, p)) continue;
      if (km.players[id].sites.some((q) => dist(m.board, q.x, q.y, p.x + 1, p.y + 1) < 4)) continue;
      let dark = 0;
      const r = m.rules.sight;
      for (let yy = -r; yy <= r; yy += 2) for (let xx = -r; xx <= r; xx += 2) {
        if (!mask[(((p.y + 1 + yy) % m.board.h) + m.board.h) % m.board.h * m.board.w + (((p.x + 1 + xx) % m.board.w) + m.board.w) % m.board.w]) dark++;
      }
      const score = dark - dist(m.board, p.x + 1, p.y + 1, target.x, target.y) * 0.5 + random();
      if (score > bestScore) { best = p; bestScore = score; }
    }
    if (best && (level === 'easy' || forecast(km, id, [best], horizon).mine >= forecast(km, id, [], horizon).mine)) take(best);
  }

  // Use what is left: a glider sent out toward the target, unaimed.
  if (km.left[id] >= 4 && random() < (level === 'easy' ? 0.4 : 0.7)) {
    const spots = gliderSpots(km, id);
    const target = enemies[0] ?? { x: (me.sites[0].x + m.board.w / 2) % m.board.w, y: (me.sites[0].y + m.board.h / 2) % m.board.h };
    const toward = spots.filter((p) => {
      const [vx, vy] = VEC[p.dir!];
      const d0 = dist(m.board, p.x, p.y, target.x, target.y), d1 = dist(m.board, p.x + vx * 4, p.y + vy * 4, target.x, target.y);
      return d1 < d0;
    });
    const shot = pickSafe(km, id, toward, random, horizon);
    if (shot) take(shot);
  }
  return chosen;
}

/** A random choice among up to five tries that a test shows will not cost the player a symbol of its own. */
function pickSafe(m: Match, id: number, options: Placement[], random: () => number, horizon: number): Placement | null {
  const base = forecast(m, id, [], horizon).mine;
  for (let i = 0; i < 5 && options.length; i++) {
    const p = options[Math.floor(random() * options.length)];
    if (forecast(m, id, [p], horizon).mine >= base) return p;
  }
  return null;
}

/** Lets a computer player take its intervention turn on the real match. */
export function playTurn(m: Match, id: number, level: Level, random: () => number): Match {
  let x = m;
  for (const p of plan(m, id, level, random)) x = place(x, id, p);
  return x;
}
