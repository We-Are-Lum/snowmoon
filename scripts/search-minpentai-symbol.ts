/**
 * Searches for a candidate Minpentai symbol (invented): a small shape that a glider
 * striking a rock can produce, under the rule recovered from figure c4-b5.
 *
 *   npx tsx scripts/search-minpentai-symbol.ts            gliders, then collisions
 *
 * Step 1 finds gliders: small patterns that reappear translated after an even number
 * of turns. Step 2 fires each small glider, from every phase and lateral offset, at
 * small rock shapes, and records what is left by the rock once the glider debris has
 * left: live cells within a few cells of the rock that repeat with a short period.
 */
import { emptyBoard, step, stamp, type Board } from '../src/lib/minpentai/engine';

const W = 48, H = 32;
type Cells = [number, number][];

function cellsOf(b: Board): Cells {
  const out: Cells = [];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.cells[y * b.w + x]) out.push([x, y]);
  return out;
}
/** Shape key and origin, translation-invariant (no wrap handling; keep tests away from edges). */
function norm(c: Cells): { key: string; x: number; y: number } {
  if (!c.length) return { key: '', x: 0, y: 0 };
  const mx = Math.min(...c.map((p) => p[0])), my = Math.min(...c.map((p) => p[1]));
  const key = c.map(([x, y]) => `${x - mx},${y - my}`).sort().join(' ');
  return { key, x: mx, y: my };
}
export function rowsOf(key: string): string[] {
  if (!key) return [];
  const pts = key.split(' ').map((s) => s.split(',').map(Number));
  const w = Math.max(...pts.map((p) => p[0])) + 1, h = Math.max(...pts.map((p) => p[1])) + 1;
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  pts.forEach(([x, y]) => (g[y][x] = '#'));
  return g.map((r) => r.join(''));
}

// ---------- step 1: gliders ----------
let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
interface Glider { key: string; period: number; dx: number; dy: number; startPhase: number; rows: string[] }
const gliders = new Map<string, Glider>();
for (let trial = 0; trial < 40000; trial++) {
  let b = emptyBoard(64, 64);
  const n = 3 + Math.floor(rnd() * 6);
  for (let k = 0; k < n; k++) b.cells[(29 + Math.floor(rnd() * 6)) * 64 + 29 + Math.floor(rnd() * 6)] = 1;
  b.turn = Math.floor(rnd() * 2);
  const s0 = norm(cellsOf(b));
  for (let t = 2; t <= 80; t += 2) {
    for (let i = 0; i < 2; i++) b = step(b);
    const s = norm(cellsOf(b));
    if (s.key === s0.key && (s.x !== s0.x || s.y !== s0.y)) {
      // Must keep moving: after a second period, the same shape, displaced twice as far.
      let b2 = b;
      for (let i = 0; i < t; i++) b2 = step(b2);
      const s2 = norm(cellsOf(b2));
      if (s2.key !== s0.key || s2.x - s0.x !== 2 * (s.x - s0.x) || s2.y - s0.y !== 2 * (s.y - s0.y)) break;
      const g = { key: s0.key, period: t, dx: s.x - s0.x, dy: s.y - s0.y, startPhase: (b.turn - t + 2) % 2, rows: rowsOf(s0.key) };
      const id = `${g.key}|${g.startPhase}`;
      if (!gliders.has(id)) gliders.set(id, g);
      break;
    }
    if (s.key === s0.key) break; // stationary oscillator
  }
}
const glist = [...gliders.values()].sort((a, b) => a.key.split(' ').length - b.key.split(' ').length || a.period - b.period);
console.log(`STEP 1: ${glist.length} glider shape/phase pairs found`);
const bySize = new Map<number, number>();
glist.forEach((g) => bySize.set(g.key.split(' ').length, (bySize.get(g.key.split(' ').length) ?? 0) + 1));
console.log('  by cell count:', Object.fromEntries(bySize));
for (const g of glist.slice(0, 12)) console.log(`  ${g.rows.join('/')}  cells ${g.key.split(' ').length}  period ${g.period}  moves (${g.dx},${g.dy})  starting phase ${g.startPhase}`);


// ---------- step 2: what a glider striking a rock can make ----------
// One glider is the only one found (4 cells, period 4, two cells per period). A glider
// and a fixed rock cannot leave a product that stays put on its own: run backward,
// a board where everything stays put would stay put forever and never send a glider
// out. So a symbol made this way is a shape that forms during the collision, as in
// the book, where gliders "came together into Zei's symbol for exactly one turn"
// (c4-b113). Step 2 records every such shape, then checks which ones persist in
// place when drawn on an empty board (so a player could also place one).
const BASE = ['.##.', '#..#'];
const rotate = (rows: string[]) => Array.from({ length: rows[0].length }, (_, x) => rows.map((r) => r[r.length - 1 - x]).join(''));
const ROCKS: Record<string, string[]> = { single: ['#'], 'domino-h': ['##'], 'domino-v': ['#', '#'], square: ['##', '##'], diagonal: ['#.', '.#'], 'L': ['#.', '##'] };
const SW = 64, SH = 64;

interface Dir { rows: string[]; dx: number; dy: number; phase: number; px: number; py: number }
function directions(): Dir[] {
  const out: Dir[] = [];
  let rows = BASE;
  for (let r = 0; r < 4; r++) {
    for (const ph of [0, 1]) for (const px of [0, 1]) for (const py of [0, 1]) {
      let b = stamp({ ...emptyBoard(SW, SH), turn: ph }, rows, 30 + px, 30 + py);
      const s0 = norm(cellsOf(b));
      for (let i = 0; i < 4; i++) b = step(b);
      const s = norm(cellsOf(b));
      if (s.key === s0.key && (s.x !== s0.x || s.y !== s0.y)) out.push({ rows, dx: (s.x - s0.x) / 2, dy: (s.y - s0.y) / 2, phase: ph, px, py });
    }
    rows = rotate(rows);
  }
  return out;
}
const dirs = directions();
console.log(`\nSTEP 2: glider directions verified: ${dirs.map((d) => `(${d.dx},${d.dy})`).join(' ')}`);

// Every shape a free glider takes, at any turn: these are not symbols.
const gliderShapes = new Set<string>();
for (const d of dirs) {
  let b = stamp({ ...emptyBoard(SW, SH), turn: d.phase }, d.rows, 30 + d.px, 30 + d.py);
  for (let i = 0; i < 8; i++) { gliderShapes.add(norm(cellsOf(b)).key); b = step(b); }
}

/** 8-connected clusters of live cells. */
function clusters(b: Board): Cells[] {
  const seen = new Uint8Array(b.w * b.h), out: Cells[] = [];
  for (let i = 0; i < b.cells.length; i++) {
    if (!b.cells[i] || seen[i]) continue;
    const comp: Cells = [], stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!, x = j % b.w, y = (j - x) / b.w;
      comp.push([x, y]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k = ((y + dy + b.h) % b.h) * b.w + ((x + dx + b.w) % b.w);
        if (b.cells[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    out.push(comp);
  }
  return out;
}

/** Does this shape, drawn alone on an empty board, stay in place (same cells recur, no drift)? */
function persistsAlone(key: string): { persists: boolean; period: number; phase: number } {
  for (const ph of [0, 1]) for (const px of [0, 1]) for (const py of [0, 1]) {
    let b = stamp({ ...emptyBoard(SW, SH), turn: ph }, rowsOf(key), 30 + px, 30 + py);
    const k0 = cellsOf(b).map((p) => p.join(',')).join(' ');
    for (let t = 1; t <= 16; t++) {
      b = step(b);
      if (cellsOf(b).map((p) => p.join(',')).join(' ') === k0 && t % 2 === 0) return { persists: true, period: t, phase: ph };
    }
  }
  return { persists: false, period: 0, phase: 0 };
}

const seenShapes = new Map<string, { shots: Set<number>; rocks: Set<string>; maxTurns: number; example: string }>();
let shots = 0;
for (const [rockName, rockRows] of Object.entries(ROCKS)) {
  for (const d of dirs) {
    for (let lateral = -6; lateral <= 6; lateral += 2) {
      for (const delay of [0, 2]) {
        const shot = shots++;
        const rx = 32, ry = 32;
        let b = stamp({ ...emptyBoard(SW, SH), turn: d.phase }, rockRows, rx, ry, 'rock');
        const gx = rx - d.dx * 12 + (d.dx === 0 ? lateral : 0) + d.px;
        const gy = ry - d.dy * 12 + (d.dy === 0 ? lateral : 0) + d.py;
        for (let i = 0; i < delay; i++) b = step(b);
        b = stamp(b, d.rows, gx, gy);
        const runLength = new Map<string, number>();
        for (let t = 0; t < 60; t++) {
          b = step(b);
          const now = new Set<string>();
          for (const c of clusters(b)) {
            if (c.length < 3) continue;
            const key = norm(c).key;
            if (gliderShapes.has(key)) continue;
            now.add(key);
            const run = (runLength.get(key) ?? 0) + 1;
            runLength.set(key, run);
            const e = seenShapes.get(key) ?? { shots: new Set(), rocks: new Set(), maxTurns: 0, example: `${rockName} rock, glider (${d.dx},${d.dy}), lateral ${lateral}, delay ${delay}, turn ${b.turn}` };
            e.shots.add(shot); e.rocks.add(rockName); e.maxTurns = Math.max(e.maxTurns, run);
            seenShapes.set(key, e);
          }
          for (const k of [...runLength.keys()]) if (!now.has(k)) runLength.delete(k);
        }
      }
    }
  }
}
const ranked = [...seenShapes.entries()]
  .map(([key, e]) => ({ key, rows: rowsOf(key), cells: key.split(' ').length, shots: e.shots.size, rocks: [...e.rocks], maxTurns: e.maxTurns, example: e.example, alone: persistsAlone(key) }))
  .sort((a, b) => Number(b.alone.persists) - Number(a.alone.persists) || b.shots - a.shots || a.cells - b.cells);
console.log(`  ${shots} shots; ${ranked.length} distinct non-glider shapes of 3+ cells formed during collisions`);
console.log(`  ${ranked.filter((r) => r.alone.persists).length} of them also persist in place when drawn alone`);
for (const r of ranked.slice(0, 20)) {
  console.log(`   ${r.rows.join('/').padEnd(16)} cells ${r.cells}  in ${String(r.shots).padStart(3)} shots  longest run ${r.maxTurns} turn(s)  persists alone: ${r.alone.persists ? `yes, period ${r.alone.period}` : 'no'}  rocks: ${r.rocks.join(',')}`);
}
export { ranked };
