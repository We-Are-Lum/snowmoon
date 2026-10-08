/**
 * What the pieces do, in the engine (match.ts): the facts a pieces-level lesson may teach.
 * Each case sets up a small match, runs it, and reports what happened to every piece.
 * Read-only; prints a table. Used to write docs/minpentai-pieces.md and the lessons.
 *
 *   npx tsx scripts/probe-minpentai-pieces.ts
 */
import { advance, newMatch, ownedSymbols, type Match, type MatchSetup } from '../src/lib/minpentai/match';
import { findGliders } from '../src/lib/minpentai/glider';
import { GLIDERS } from '../src/lib/minpentai/match';

type Case = { name: string; setup: MatchSetup; turns: number };
const W = 48, H = 32;
const rules = { interval: 10_000, maxTurns: 10_000 };

const live = (m: Match) => m.board.cells.reduce((a, b) => a + b, 0);
function describe(m: Match) {
  const g = findGliders(m.board).map((x) => `glider@${x.x},${x.y}→${x.dx},${x.dy}`);
  const s = ownedSymbols(m.board, m.owners).map((x) => `sym(p${x.owner})@${x.cx},${x.cy}`);
  const sites = m.players.map((p) => `p${p.id}:${p.sites.length}${p.out ? ' OUT' : ''}`);
  return `t${m.board.turn} cells=${live(m)} ${[...g, ...s].join(' ')} | sites ${sites.join(' ')}`;
}
function run(c: Case) {
  let m = newMatch(c.setup);
  console.log(`\n== ${c.name}\n  ${describe(m)}`);
  const marks = new Set([8, 16, 24, 32, 40, 48, 64, 80, 96, 128, c.turns]);
  for (let t = 1; t <= c.turns; t++) {
    m = advance(m);
    if (marks.has(t)) console.log(`  ${describe(m)}`);
  }
  return m;
}

// A glider flying up (rows '.##.', '#..#'), placed on odd coordinates (match.snap).
const up = GLIDERS.up, down = GLIDERS.down;

run({ name: 'glider alone (speed)', turns: 32, setup: { w: W, h: H, rules, rocks: [], symbols: [[[1, 1]]], extra: [[0, up, 21, 21]] } });
run({ name: 'glider (p0) up into p1 tower', turns: 96, setup: { w: W, h: H, rules, rocks: [], symbols: [[[1, 1]], [[21, 7]]], extra: [[0, up, 21, 21]] } });
run({ name: 'glider (p0) up into own tower', turns: 96, setup: { w: W, h: H, rules, rocks: [], symbols: [[[1, 1], [21, 7]], [[40, 26]]], extra: [[0, up, 21, 21]] } });
run({ name: 'glider up into a rock', turns: 96, setup: { w: W, h: H, rules, rocks: [[22, 9]], symbols: [[[1, 1]], [[40, 26]]], extra: [[0, up, 21, 21]] } });
run({ name: 'glider up into a single square (p1)', turns: 96, setup: { w: W, h: H, rules, rocks: [], symbols: [[[1, 1]], [[40, 26]]], extra: [[0, up, 21, 21], [1, ['#'], 22, 9]] } });
run({ name: 'two gliders head-on', turns: 96, setup: { w: W, h: H, rules, rocks: [], symbols: [[[1, 1]], [[40, 26]]], extra: [[0, up, 21, 21], [1, down, 21, 5]] } });

// ---- Close-ups: the cells around a collision, every 2 turns.
function window(m: Match, x0: number, y0: number, w: number, h: number): string[] {
  const rows: string[] = [];
  for (let y = y0; y < y0 + h; y++) {
    let r = '';
    for (let x = x0; x < x0 + w; x++) {
      const i = ((y + H) % H) * W + ((x + W) % W);
      r += m.board.rocks[i] ? 'R' : m.board.cells[i] ? String(m.owners[i] || '+') : '.';
    }
    rows.push(r);
  }
  return rows;
}
function film(name: string, setup: MatchSetup, from: number, to: number, x0: number, y0: number, w = 10, h = 12) {
  let m = newMatch(setup);
  for (let t = 0; t < from; t++) m = advance(m);
  console.log(`\n== film: ${name} (cells: 1 = p0, 2 = p1, R = rock)`);
  const frames: string[][] = [];
  for (let t = from; t <= to; t += 2) {
    frames.push([`t${m.board.turn}`.padEnd(w), ...window(m, x0, y0, w, h)]);
    m = advance(advance(m));
  }
  for (let i = 0; i < frames.length; i += 8) {
    const chunk = frames.slice(i, i + 8);
    for (let r = 0; r < chunk[0].length; r++) console.log('  ' + chunk.map((f) => f[r]).join('  '));
    console.log('');
  }
  console.log(`  after: ${describe(m)}`);
}
if (process.argv.includes('--film')) {
  film('single square, first hit', { w: W, h: H, rules, rocks: [], symbols: [[[1, 1]], [[40, 26]]], extra: [[0, up, 21, 21], [1, ['#'], 22, 9]] }, 14, 40, 18, 5);
  film('glider into enemy tower from below', { w: W, h: H, rules, rocks: [], symbols: [[[1, 1]], [[21, 7]]], extra: [[0, up, 21, 21]] }, 14, 34, 18, 4);
}

// ---- Sweep: every direction and offset of a glider fired at each kind of target.
type Target = 'tower' | 'square' | 'rock' | 'glider';
function outcome(target: Target, dir: 'up' | 'down' | 'left' | 'right', off: number, gap: number) {
  // Target near the middle; the glider starts `gap` cells away on the side it comes from, shifted `off` across.
  const tx = 22, ty = 14;
  const vec = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  let gx = tx - vec[0] * gap + (vec[0] === 0 ? off : 0), gy = ty - vec[1] * gap + (vec[1] === 0 ? off : 0);
  gx += gx & 1 ? 0 : 1; gy += gy & 1 ? 0 : 1; // gliders travel from odd coordinates on even turns
  const extra: [number, readonly string[], number, number][] = [[0, GLIDERS[dir], gx, gy]];
  const rocks: [number, number][] = [];
  const symbols: [number, number][][] = [[[2, 2]], [[40, 26]]];
  if (target === 'tower') symbols[1].push([tx - 1, ty - 1]);
  if (target === 'square') extra.push([1, ['#'], tx, ty]);
  if (target === 'rock') rocks.push([tx, ty]);
  if (target === 'glider') extra.push([1, GLIDERS[({ up: 'down', down: 'up', left: 'right', right: 'left' } as const)[dir]], tx - 1 + (tx & 1 ? 0 : 1), ty - 1 + (ty & 1 ? 0 : 1)]);
  let m = newMatch({ w: W, h: H, rules, rocks, symbols, extra });
  const sitesBefore = m.players[1].sites.length;
  // Long enough to reach and leave the target, short of wrapping round the board.
  for (let t = 0; t < gap * 2 + 24; t++) m = advance(m);
  const gl = findGliders(m.board);
  const mine = gl.filter((g) => g.dx === vec[0] && g.dy === vec[1]).length;
  const back = gl.filter((g) => g.dx === -vec[0] && g.dy === -vec[1]).length;
  const side = gl.length - mine - back;
  const towerLost = target === 'tower' ? m.players[1].sites.length < sitesBefore : null;
  return { mine, back, side, gliders: gl.length, towerLost };
}
if (process.argv.includes('--sweep')) {
  for (const target of ['tower', 'square', 'rock', 'glider'] as Target[]) {
    const tally = new Map<string, number>();
    let n = 0;
    for (const dir of ['up', 'down', 'left', 'right'] as const) for (let off = -3; off <= 3; off++) for (const gap of [10, 11, 12, 13]) {
      const o = outcome(target, dir, off, gap);
      const k = `through ${o.mine} · back ${o.back} · sideways ${o.side}${o.towerLost === null ? '' : o.towerLost ? ' · tower lost' : ' · tower stands'}`;
      tally.set(k, (tally.get(k) ?? 0) + 1);
      n++;
    }
    console.log(`\n== ${target} (${n} shots)`);
    for (const [k, v] of [...tally.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
  }
}
