/**
 * The terrain generator's machinery (owner, 2026-10-11: "generate natural geography in code,
 * constrained by the book"; no image model). scripts/terrain.ts sets up each map's grid and pins;
 * this file does the work:
 *   layered noise → soft biases → hard pins → erosion (stream power and slope collapse, pins
 *   re-applied every pass) → carved rivers from the book → depression filling, so every land
 *   cell drains to the sea or the map edge → flow, accumulation and river lines → climate.
 * Grids are regular: x = x0 + i·dx, y = y0 + j·dy, in the map's own units (degrees, battle-map
 * pixels or km). Heights are meters above sea level; below 0 is sea.
 */
import { deflateSync } from 'node:zlib';
import { Noise2 } from './noise';

export type XY = [number, number];
export type GridSpec = {
  name: string;
  w: number;
  h: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  /** km per unit along x and along y (for slopes, cell areas and distances). */
  kmx: (x: number, y: number) => number;
  kmy: number;
  /** Map-edge cells drain out of the map (inland maps); the world map drains only to the sea. */
  edgeOutlet: boolean;
};
export type Grid = GridSpec & { z: Float32Array };

export type Pin =
  | { kind: 'sea'; poly: XY[]; band: number; depth: number; why: string; provenance: 'book' | 'placed by us'; lines: string[] }
  | { kind: 'land'; poly: XY[]; band: number; min: number; why: string; provenance: 'book' | 'placed by us'; lines: string[] }
  | { kind: 'land-disk'; c: XY; r: number; min: number; why: string; provenance: 'book' | 'placed by us'; lines: string[] }
  | { kind: 'sea-ring'; c: XY; r1: number; r2: number; depth: number; why: string; provenance: 'book' | 'placed by us'; lines: string[] }
  | { kind: 'sea-poly'; poly: XY[]; depth: number; why: string; provenance: 'book' | 'placed by us'; lines: string[] }
  | { kind: 'shape'; f: (x: number, y: number) => { target: number; weight: number } | null; why: string; provenance: 'book' | 'placed by us'; lines: string[]; describe: string }
  | { kind: 'bias'; f: (x: number, y: number) => number; why: string; provenance: 'book' | 'placed by us'; lines: string[]; describe: string }
  | { kind: 'river'; path: XY[]; width: number; why: string; provenance: 'book' | 'placed by us'; lines: string[] }
  | { kind: 'land-box'; poly: XY[]; seas: XY[][]; band: number; min: number; why: string; provenance: 'book' | 'placed by us'; lines: string[] };

export const cx = (g: GridSpec, i: number) => g.x0 + i * g.dx;
export const cy = (g: GridSpec, j: number) => g.y0 + j * g.dy;
const idx = (g: GridSpec, i: number, j: number) => j * g.w + i;

export function pointInPoly(x: number, y: number, poly: XY[]): boolean {
  let c = false;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
    const [xi, yi] = poly[i], [xk, yk] = poly[k];
    if (yi > y !== yk > y && x < ((xk - xi) * (y - yi)) / (yk - yi) + xi) c = !c;
  }
  return c;
}
function segDist(x: number, y: number, a: XY, b: XY, sx: number, sy: number): number {
  const ax = (a[0] - x) * sx, ay = (a[1] - y) * sy, bx = (b[0] - x) * sx, by = (b[1] - y) * sy;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
/** Distance in km from (x, y) to a polygon's outline; positive inside, negative outside. */
export function signedKm(g: GridSpec, x: number, y: number, poly: XY[]): number {
  const sx = g.kmx(x, y), sy = g.kmy;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(x, y, poly[i], poly[(i + 1) % poly.length], sx, sy));
  return pointInPoly(x, y, poly) ? d : -d;
}
export function kmBetween(g: GridSpec, a: XY, b: XY): number {
  return Math.hypot((a[0] - b[0]) * g.kmx((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), (a[1] - b[1]) * g.kmy);
}
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function sample(g: Grid, x: number, y: number): number {
  const fi = (x - g.x0) / g.dx, fj = (y - g.y0) / g.dy;
  const i0 = Math.max(0, Math.min(g.w - 2, Math.floor(fi))), j0 = Math.max(0, Math.min(g.h - 2, Math.floor(fj)));
  const tx = Math.max(0, Math.min(1, fi - i0)), ty = Math.max(0, Math.min(1, fj - j0));
  const z = g.z;
  const a = z[idx(g, i0, j0)], b = z[idx(g, i0 + 1, j0)], c = z[idx(g, i0, j0 + 1)], d = z[idx(g, i0 + 1, j0 + 1)];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

// ---- pins
/** Hard pins: applied after the noise and again after every erosion pass. */
function applyHard(g: Grid, pins: Pin[]) {
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const x = cx(g, i), y = cy(g, j), k = idx(g, i, j);
      for (const p of pins) {
        if (p.kind === 'sea' || p.kind === 'land') {
          const s = signedKm(g, x, y, p.poly);
          if (p.kind === 'sea' && s > p.band) g.z[k] = Math.min(g.z[k], p.depth);
          if (p.kind === 'land' && s > p.band) g.z[k] = Math.max(g.z[k], p.min);
        } else if (p.kind === 'land-box') {
          if (pointInPoly(x, y, p.poly) && p.seas.every((sea) => signedKm(g, x, y, sea) < -p.band)) g.z[k] = Math.max(g.z[k], p.min);
        } else if (p.kind === 'sea-poly') {
          if (pointInPoly(x, y, p.poly)) g.z[k] = Math.min(g.z[k], p.depth);
        } else if (p.kind === 'land-disk') {
          if (kmBetween(g, [x, y], p.c) <= p.r) g.z[k] = Math.max(g.z[k], p.min);
        } else if (p.kind === 'sea-ring') {
          const d = kmBetween(g, [x, y], p.c);
          if (d >= p.r1 && d <= p.r2) g.z[k] = Math.min(g.z[k], p.depth);
        } else if (p.kind === 'shape') {
          const s = p.f(x, y);
          if (s) g.z[k] = g.z[k] * (1 - s.weight) + s.target * s.weight;
        }
      }
    }
}
/** Soft pins: coasts drawn by the book become a pull toward land or sea in a band around them. */
function applySoft(g: Grid, pins: Pin[]) {
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const x = cx(g, i), y = cy(g, j), k = idx(g, i, j);
      for (const p of pins) {
        if (p.kind === 'bias') g.z[k] += p.f(x, y);
        else if (p.kind === 'sea' || p.kind === 'land') {
          // Inside the polygon, pull toward the pinned side, fading out over the band.
          const s = signedKm(g, x, y, p.poly);
          if (s > -p.band && s <= p.band) {
            const t = smooth((s + p.band) / (2 * p.band));
            g.z[k] += p.kind === 'sea' ? -220 * t : 220 * t;
          }
        }
      }
    }
}

// ---- drainage
const N8: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Priority-flood with a small epsilon: returns filled heights where every land cell can drain. */
export function fill(g: Grid): Float32Array {
  const F = new Float32Array(g.z);
  const done = new Uint8Array(g.w * g.h);
  // a binary heap of [height, index]
  const hz: number[] = [], hk: number[] = [];
  const push = (z: number, k: number) => {
    hz.push(z); hk.push(k);
    let c = hz.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (hz[p] <= hz[c]) break;
      [hz[p], hz[c]] = [hz[c], hz[p]];
      [hk[p], hk[c]] = [hk[c], hk[p]];
      c = p;
    }
  };
  const pop = (): [number, number] => {
    const top: [number, number] = [hz[0], hk[0]];
    const lz = hz.pop()!, lk = hk.pop()!;
    if (hz.length) {
      hz[0] = lz; hk[0] = lk;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1, r = l + 1;
        let m = c;
        if (l < hz.length && hz[l] < hz[m]) m = l;
        if (r < hz.length && hz[r] < hz[m]) m = r;
        if (m === c) break;
        [hz[m], hz[c]] = [hz[c], hz[m]];
        [hk[m], hk[c]] = [hk[c], hk[m]];
        c = m;
      }
    }
    return top;
  };
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const k = idx(g, i, j);
      const edge = i === 0 || j === 0 || i === g.w - 1 || j === g.h - 1;
      if (g.z[k] < 0 || (g.edgeOutlet && edge)) {
        done[k] = 1;
        push(F[k], k);
      }
    }
  while (hz.length) {
    const [z, k] = pop();
    const i = k % g.w, j = (k / g.w) | 0;
    for (const [di, dj] of N8) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= g.w || nj >= g.h) continue;
      const n = idx(g, ni, nj);
      if (done[n]) continue;
      done[n] = 1;
      F[n] = Math.max(F[n], z + 0.01);
      push(F[n], n);
    }
  }
  return F;
}

/** Steepest-descent receiver of each cell on heights H (-1 for outlets: sea, or the edge when allowed). */
export function receivers(g: GridSpec, H: Float32Array): Int32Array {
  const rec = new Int32Array(g.w * g.h).fill(-1);
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const k = idx(g, i, j);
      if (H[k] < 0) continue;
      let best = -1, bestS = 0;
      for (const [di, dj] of N8) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= g.w || nj >= g.h) continue;
        const n = idx(g, ni, nj);
        const d = Math.hypot(di * g.kmx(cx(g, i), cy(g, j)) * Math.abs(g.dx), dj * g.kmy * Math.abs(g.dy));
        const s = (H[k] - H[n]) / d;
        if (s > bestS) { bestS = s; best = n; }
      }
      rec[k] = best;
    }
  return rec;
}

export function accumulation(g: GridSpec, H: Float32Array, rec: Int32Array): Float32Array {
  const order = Array.from({ length: g.w * g.h }, (_, k) => k).sort((a, b) => H[b] - H[a]);
  const A = new Float32Array(g.w * g.h);
  for (const k of order) {
    const j = (k / g.w) | 0;
    A[k] += g.kmx(cx(g, k % g.w), cy(g, j)) * Math.abs(g.dx) * g.kmy * Math.abs(g.dy); // km² of this cell
    if (rec[k] >= 0) A[rec[k]] += A[k];
  }
  return A;
}

// ---- erosion
function erode(g: Grid, pins: Pin[], passes: number, k: number, talusPerKm: number) {
  for (let pass = 0; pass < passes; pass++) {
    const rec = receivers(g, g.z);
    const A = accumulation(g, g.z, rec);
    const next = new Float32Array(g.z);
    for (let c = 0; c < g.z.length; c++) {
      const r = rec[c];
      if (r < 0 || g.z[c] <= 0) continue;
      const i = c % g.w, j = (c / g.w) | 0, ri = r % g.w, rj = (r / g.w) | 0;
      const d = Math.hypot((ri - i) * g.kmx(cx(g, i), cy(g, j)) * Math.abs(g.dx), (rj - j) * g.kmy * Math.abs(g.dy));
      const drop = g.z[c] - g.z[r];
      // stream power: cut in proportion to sqrt(drainage area) times slope, never below the receiver
      const cut = Math.min(0.45 * drop, k * Math.sqrt(A[c]) * (drop / d));
      next[c] -= cut;
      // slope collapse: anything steeper than the talus slope sheds half the excess downhill
      const excess = drop - talusPerKm * d;
      if (excess > 0) { next[c] -= excess * 0.25; next[r] += excess * 0.25; }
    }
    g.z.set(next);
    applyHard(g, pins);
  }
}

function carveRivers(g: Grid, pins: Pin[]) {
  for (const p of pins) {
    if (p.kind !== 'river') continue;
    // walk the path in small steps, never rising; cells within the width take that height
    let level = Infinity;
    for (let s = 0; s < p.path.length - 1; s++) {
      const a = p.path[s], b = p.path[s + 1];
      const steps = Math.max(2, Math.ceil(kmBetween(g, a, b) / (0.5 * Math.min(g.kmy * Math.abs(g.dy), g.kmx(a[0], a[1]) * Math.abs(g.dx)))));
      for (let t = 0; t <= steps; t++) {
        const x = a[0] + ((b[0] - a[0]) * t) / steps, y = a[1] + ((b[1] - a[1]) * t) / steps;
        const here = sample(g, x, y);
        level = Math.min(level === Infinity ? here : level - 0.05, here);
        // the river ends in the sea: its last stretch is cut below sea level
        if (s === p.path.length - 2) level = Math.min(level, t === steps ? -5 : -2);
        const i = Math.round((x - g.x0) / g.dx), j = Math.round((y - g.y0) / g.dy);
        const ri = Math.ceil(p.width / (g.kmx(x, y) * Math.abs(g.dx))), rj = Math.ceil(p.width / (g.kmy * Math.abs(g.dy)));
        for (let jj = j - rj; jj <= j + rj; jj++)
          for (let ii = i - ri; ii <= i + ri; ii++) {
            if (ii < 0 || jj < 0 || ii >= g.w || jj >= g.h) continue;
            if (kmBetween(g, [cx(g, ii), cy(g, jj)], [x, y]) <= p.width) g.z[idx(g, ii, jj)] = Math.min(g.z[idx(g, ii, jj)], level);
          }
      }
    }
  }
}

// ---- the whole pipeline
export type NoiseSpec = { seed: number; scale: number; amp: number; octaves: number; ridgeAmp: number; ridgeScale: number; offset: number };
export type Generated = { grid: Grid; filled: Float32Array; rec: Int32Array; acc: Float32Array; rivers: { points: XY[]; flow_km2: number }[]; lakes: Uint8Array };

export function generate(spec: GridSpec, base: (x: number, y: number) => number, noise: NoiseSpec, pins: Pin[], erosion: { passes: number; k: number; talusPerKm: number }, riverKm2: number, pitFillM = 3, noRiver?: (x: number, y: number) => boolean): Generated {
  const g: Grid = { ...spec, z: new Float32Array(spec.w * spec.h) };
  const n = new Noise2(noise.seed);
  const ridge = new Noise2(noise.seed * 7919 + 13);
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      const x = cx(g, i), y = cy(g, j);
      // noise coordinates in km, so features keep their size whatever the units
      const kx = x * g.kmx(x, y), ky = y * g.kmy;
      const v = n.fbm(kx / noise.scale + noise.offset, ky / noise.scale - noise.offset, noise.octaves);
      const r = ridge.ridged(kx / noise.ridgeScale + 3.1, ky / noise.ridgeScale - 7.7, 5);
      g.z[idx(g, i, j)] = base(x, y) + noise.amp * v + noise.ridgeAmp * r * Math.max(0, v + 0.2);
    }
  applySoft(g, pins);
  applyHard(g, pins);
  erode(g, pins, erosion.passes, erosion.k, erosion.talusPerKm);
  carveRivers(g, pins);
  // shallow hollows fill with sediment; only basins deeper than pitFillM stay as lakes
  const pre = fill(g);
  for (let k = 0; k < g.z.length; k++) if (g.z[k] >= 0 && pre[k] - g.z[k] < pitFillM) g.z[k] = Math.max(g.z[k], pre[k]);
  const filled = fill(g);
  const rec = receivers(g, filled);
  const acc = accumulation(g, filled, rec);
  const lakes = new Uint8Array(g.w * g.h);
  for (let k = 0; k < lakes.length; k++) if (g.z[k] >= 0 && filled[k] - g.z[k] > 0.5) lakes[k] = 1;
  return { grid: g, filled, rec, acc, rivers: traceRivers(g, filled, rec, acc, riverKm2, noRiver), lakes };
}

function traceRivers(g: Grid, H: Float32Array, rec: Int32Array, A: Float32Array, minKm2: number, noRiver?: (x: number, y: number) => boolean) {
  const isRiver = (k: number) => H[k] >= 0 && A[k] >= minKm2 && !(noRiver && noRiver(cx(g, k % g.w), cy(g, (k / g.w) | 0)));
  const hasUpstream = new Uint8Array(g.w * g.h);
  for (let k = 0; k < rec.length; k++) if (isRiver(k) && rec[k] >= 0) hasUpstream[rec[k]] = 1;
  const used = new Uint8Array(g.w * g.h);
  const out: { points: XY[]; flow_km2: number }[] = [];
  for (let k = 0; k < rec.length; k++) {
    if (!isRiver(k) || hasUpstream[k]) continue;
    const pts: XY[] = [];
    let c = k, flow = 0;
    for (;;) {
      pts.push([cx(g, c % g.w), cy(g, (c / g.w) | 0)]);
      flow = A[c];
      if (used[c] && pts.length > 1) break; // joined a river already traced
      used[c] = 1;
      const r = rec[c];
      if (r < 0 || !isRiver(r)) { if (r >= 0 && !isRiver(r)) pts.push([cx(g, r % g.w), cy(g, (r / g.w) | 0)]); break; } // reached the sea, the map edge, or ground with no river (a city's own drains)
      if (H[r] < 0) { pts.push([cx(g, r % g.w), cy(g, (r / g.w) | 0)]); break; }
      c = r;
    }
    if (pts.length > 2) out.push({ points: pts, flow_km2: Math.round(flow) });
  }
  return out;
}

// ---- outlines: a connected region of a mask, traced along cell edges, as a polygon
export function outline(g: GridSpec, mask: (k: number) => boolean, seed: XY, simplifyCells = 0.75): XY[] | null {
  return outlineRings(g, mask, seed, simplifyCells)?.[0] ?? null;
}
/** The outer ring first, then every hole of at least minHoleCells cells. */
export function outlineRings(g: GridSpec, mask: (k: number) => boolean, seed: XY, simplifyCells = 0.75, minHoleCells = 4): XY[][] | null {
  const si = Math.round((seed[0] - g.x0) / g.dx), sj = Math.round((seed[1] - g.y0) / g.dy);
  if (si < 0 || sj < 0 || si >= g.w || sj >= g.h || !mask(idx(g, si, sj))) return null;
  const comp = new Uint8Array(g.w * g.h);
  const stack = [idx(g, si, sj)];
  comp[stack[0]] = 1;
  while (stack.length) {
    const k = stack.pop()!;
    const i = k % g.w, j = (k / g.w) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= g.w || nj >= g.h) continue;
      const n = idx(g, ni, nj);
      if (!comp[n] && mask(n)) { comp[n] = 1; stack.push(n); }
    }
  }
  const inC = (i: number, j: number) => i >= 0 && j >= 0 && i < g.w && j < g.h && comp[idx(g, i, j)] === 1;
  // directed boundary edges with the region on the left, between cell-corner lattice points
  const next = new Map<string, string[]>();
  const add = (a: XY, b: XY) => {
    const ka = `${a[0]},${a[1]}`;
    (next.get(ka) ?? next.set(ka, []).get(ka)!).push(`${b[0]},${b[1]}`);
  };
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < g.w; i++) {
      if (!inC(i, j)) continue;
      if (!inC(i, j - 1)) add([i, j], [i + 1, j]);
      if (!inC(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
      if (!inC(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
      if (!inC(i - 1, j)) add([i, j + 1], [i, j]);
    }
  const loops: XY[][] = [];
  for (const start of [...next.keys()]) {
    while ((next.get(start) ?? []).length) {
      const loop: XY[] = [];
      let cur = start;
      do {
        const outs = next.get(cur)!;
        const nxt = outs.pop()!;
        const [a, b] = cur.split(',').map(Number);
        loop.push([a, b]);
        cur = nxt;
      } while (cur !== start && (next.get(cur) ?? []).length);
      if (loop.length > 3) loops.push(loop);
    }
  }
  // the outer loop is the one with the largest area; the others are holes
  const area = (l: XY[]) => Math.abs(l.reduce((s, p, i) => s + p[0] * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * p[1], 0)) / 2;
  const sorted = loops.sort((a, b) => area(b) - area(a)).filter((l, n) => n === 0 || area(l) >= minHoleCells);
  if (!sorted.length) return null;
  // lattice point (i, j) is the corner at the low-index side of cell (i, j)
  return sorted.map((l) => douglasPeucker(l, simplifyCells).map(([i, j]) => [g.x0 + (i - 0.5) * g.dx, g.y0 + (j - 0.5) * g.dy] as XY));
}
function douglasPeucker(pts: XY[], tol: number): XY[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1, bd = tol;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i], [x1, y1] = pts[a], [x2, y2] = pts[b];
      const d = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / (Math.hypot(x2 - x1, y2 - y1) || 1);
      if (d > bd) { bd = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** The cells of the connected region containing the seed, as a mask. */
export function component(g: GridSpec, mask: (k: number) => boolean, seed: XY): Uint8Array {
  const comp = new Uint8Array(g.w * g.h);
  const si = Math.round((seed[0] - g.x0) / g.dx), sj = Math.round((seed[1] - g.y0) / g.dy);
  if (si < 0 || sj < 0 || si >= g.w || sj >= g.h || !mask(idx(g, si, sj))) return comp;
  const stack = [idx(g, si, sj)];
  comp[stack[0]] = 1;
  while (stack.length) {
    const k = stack.pop()!;
    const i = k % g.w, j = (k / g.w) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= g.w || nj >= g.h) continue;
      const n = idx(g, ni, nj);
      if (!comp[n] && mask(n)) { comp[n] = 1; stack.push(n); }
    }
  }
  return comp;
}

// ---- climate (world grid only): temperature from latitude and height; rain from wind and terrain
export const ZONES = ['sea', 'sea ice', 'ice', 'tundra', 'boreal forest', 'temperate', 'steppe', 'desert', 'subtropical', 'tropical'] as const;
export function climate(g: Grid): { zone: Uint8Array; tempC: Float32Array; rain: Float32Array } {
  const zone = new Uint8Array(g.w * g.h), tempC = new Float32Array(g.w * g.h), rain = new Float32Array(g.w * g.h);
  // x = longitude, y = latitude. Winds: easterly trades below 30°, westerlies 30-65°, polar easterlies above.
  for (let j = 0; j < g.h; j++) {
    const lat = cy(g, j);
    const westerly = lat >= 30 && lat < 65;
    let moisture = 1;
    for (let s = 0; s < g.w; s++) {
      const i = westerly ? s : g.w - 1 - s;
      const k = idx(g, i, j), z = g.z[k];
      const t = 27 - 0.55 * (lat - 14) - 0.0065 * Math.max(0, z);
      tempC[k] = t;
      if (z < 0) {
        moisture = Math.min(1, moisture + 0.12);
        rain[k] = moisture;
        zone[k] = t < -4 ? 1 : 0;
        continue;
      }
      const prev = idx(g, westerly ? Math.max(0, i - 1) : Math.min(g.w - 1, i + 1), j);
      const rise = Math.max(0, z - Math.max(0, g.z[prev]));
      const lift = moisture * Math.min(0.6, rise / 2500); // rain falls where air climbs, and is lost to the far side
      moisture = Math.max(0, moisture - lift - 0.006);
      const r = Math.min(1, 0.35 * moisture + 2.5 * lift + 0.08);
      rain[k] = r;
      zone[k] = t < -8 ? 2 : t < -1 ? 3 : t < 4 ? 4 : r < 0.1 && t > 12 ? 7 : r < 0.16 ? 6 : t < 14 ? 5 : t < 21 ? 8 : 9;
    }
  }
  return { zone, tempC, rain };
}

// ---- data and pictures
export const b64i16 = (z: Float32Array) => Buffer.from(new Int16Array(Array.from(z, (v) => Math.max(-32768, Math.min(32767, Math.round(v))))).buffer).toString('base64');
export const b64u8 = (a: Uint8Array) => Buffer.from(a).toString('base64');

export function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = rgb[y * w * 3 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
