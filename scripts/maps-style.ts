/**
 * Maps v5, styled: bakes the world map's images from the frozen terrain layers (out/maps-v5) and writes the
 * places in each image's own coordinates. Reads shapes only; never moves terrain.
 *
 *   npx tsx scripts/maps-style.ts [--region=out/maps-v5/candidate-1/region] [--dzego=out/maps-v5/dzego]
 *
 * From Claude Design's "World Map Styled" (2026-10-12, maps/style-terrain.js): the biome grid gives the land
 * colour in the site's paper and sage tones, the hillshade shades it, forest is a dot pattern. Changed here:
 * - the sea is coloured by its real depth (slate to a pale shelf), and the coast is drawn from the heights, so
 *   it is smooth at any zoom rather than following 3 km cells;
 * - rivers are drawn from rivers.json, their width growing slowly with the catchment and capped, so the
 *   largest (about 3.5 million km²) is a strong line, not a band (owner, 2026-10-12: "an intense river");
 * - towns and roads, so the land reads as lived in (owner, 2026-10-12). They are texture, invented by this
 *   code, unnamed, and not from the book; the routes between the United Cities follow the book's links
 *   (chapter 5's figure), their courses ours; the railway to Eldil and Dzego's railway are ours.
 *
 * Outputs (public/maps/v5/): world.jpg and world-2048.jpg (the region), northshore.jpg (the battle map's area
 * at twice the density), dzego.jpg; and content/snowmoon/maps/world-view.json (every place in each image's
 * coordinates, from the map's own frames, not eyeballed; the views' boxes; the towns' and roads' counts).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { toDeg, type MapFile } from './lib/map-tests';
import { mulberry32, Noise2 } from './lib/noise';

const ROOT = process.cwd();
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')) as [string, string][]);
const SRC = { region: args.region ?? 'out/maps-v5/candidate-1/region', dzego: args.dzego ?? 'out/maps-v5/dzego' };
const PUB = 'public/maps/v5';
const W: MapFile = JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/maps/world.json'), 'utf8'));
const rad = (d: number) => (d * Math.PI) / 180;

// the frames, as terrain-v4.ts defines them (projFrame): x = km east along the standard parallel, y = km north
type Fr = { name: 'region' | 'dzego'; lon0: number; lat0: number; kx: number; dx: number; w: number; h: number };
const frame = (name: Fr['name'], lon0: number, lat0: number, lon1: number, phi: number, w: number, h: number): Fr => {
  const kx = 111.2 * Math.cos(rad(phi));
  return { name, lon0, lat0, kx, dx: ((lon1 - lon0) * kx) / w, w, h };
};
/** [lon, lat] → grid image coordinates (cell centres at integers, row 0 the north edge). */
const toGrid = (f: Fr, lon: number, lat: number): [number, number] => [((lon - f.lon0) * f.kx) / f.dx, f.h - 1 - ((lat - f.lat0) * 111.2) / f.dx];

// ---- the layers
type Layers = { f: Fr; z: Float32Array; coast: Float32Array; depth: Float32Array; biome: Uint8Array; hs: Uint8Array; hsW: number; hsH: number; rivers: { flow_km2: number; points: [number, number][] }[] };
async function readLayers(dir: string, name: Fr['name']): Promise<Layers> {
  const meta = JSON.parse(readFileSync(path.join(ROOT, dir, 'data/meta.json'), 'utf8'));
  const gw = meta.grid.w, gh = meta.grid.h;
  const f = name === 'region' ? frame('region', -8, 36, 84, 51, gw, gh) : frame('dzego', 138, 15, 160, 23, gw, gh);
  if (Math.abs(f.dx - meta.grid.cell_km) > 1e-3) throw new Error(`${name}: cell ${f.dx} km, meta says ${meta.grid.cell_km}`);
  // 16-bit grey, meters + 32768, row 0 the north edge; stored here with row 0 at the south edge, as the pipeline's grids
  const hp = await sharp(path.join(ROOT, dir, 'data/height.png')).toColourspace('grey16').raw({ depth: 'ushort' }).toBuffer({ resolveWithObject: true });
  if (hp.info.width !== gw || hp.info.height !== gh) throw new Error(`${name}: height.png is ${hp.info.width}×${hp.info.height}`);
  const d16 = new Uint16Array(hp.data.buffer, hp.data.byteOffset, gw * gh);
  const z = new Float32Array(gw * gh);
  for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) z[(gh - 1 - r) * gw + c] = d16[r * gw + c] - 32768;
  const grey = (f: string) => sharp(path.join(ROOT, dir, f)).toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
  const bp = await grey('data/biome.png');
  const biome = new Uint8Array(gw * gh);
  for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) biome[(gh - 1 - r) * gw + c] = bp.data[r * gw + c];
  const sp = await grey('layers/hillshade.png');
  const hs = new Uint8Array(sp.data.buffer, sp.data.byteOffset, sp.info.width * sp.info.height);
  const sp2 = { width: sp.info.width, height: sp.info.height };
  const rivers = JSON.parse(readFileSync(path.join(ROOT, dir, 'data/rivers.json'), 'utf8')).rivers;
  // "lake" cells below sea level that touch the sea are sea (otherwise they draw as small outlined squares offshore)
  for (let pass = 0; pass < 3; pass++) for (let j = 1; j < gh - 1; j++) for (let i = 1; i < gw - 1; i++) {
    const k = j * gw + i;
    if (biome[k] !== 1 || z[k] >= 0) continue;
    if (biome[k - 1] === 0 || biome[k + 1] === 0 || biome[k - gw] === 0 || biome[k + gw] === 0 || biome[k - gw - 1] === 0 || biome[k - gw + 1] === 0 || biome[k + gw - 1] === 0 || biome[k + gw + 1] === 0) biome[k] = 0;
  }
  // the land–sea field for the coastline (image rows): the heights, clamped to ±60 m and made to agree with the
  // biome's sea (inland cells just below sea level stay land), then blurred once so the coast is round, not a staircase
  const coast0 = new Float32Array(gw * gh), coast = new Float32Array(gw * gh);
  for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) { const k = (gh - 1 - r) * gw + c, sea = biome[k] === 0; coast0[r * gw + c] = sea ? Math.min(-4, Math.max(-60, z[k])) : Math.max(4, Math.min(60, z[k])); }
  for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) { let a = 0, n = 0; for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) { const rr = r + b, cc = c + e; if (rr < 0 || cc < 0 || rr >= gh || cc >= gw) continue; const wt = b === 0 && e === 0 ? 4 : b === 0 || e === 0 ? 2 : 1; a += coast0[rr * gw + cc] * wt; n += wt; } coast[r * gw + c] = a / n; }
  // the depth the sea is coloured by: the heights at sea, smoothed over about four cells (two box passes of radius 2),
  // so small shoals and sunk islets (flat plates at −3 m) blend into the shelf instead of showing as pale squares
  let depth = new Float32Array(gw * gh);
  for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) depth[r * gw + c] = Math.min(0, z[(gh - 1 - r) * gw + c]);
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(gw * gh);
    for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) { let a = 0, n = 0; for (let b = -2; b <= 2; b++) for (let e = -2; e <= 2; e++) { const rr = r + b, cc = c + e; if (rr < 0 || cc < 0 || rr >= gh || cc >= gw) continue; a += depth[rr * gw + cc]; n++; } out[r * gw + c] = a / n; }
    depth = out;
  }
  return { f, z, coast, depth, biome, hs, hsW: sp2.width, hsH: sp2.height, rivers };
}

// ---- the palette (Design's), by biome: sea, lake, ice, tundra, alpine, boreal, temperate forest, grassland, steppe,
// desert, subtropical forest, savanna, tropical forest, built-up
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PAL = ['#8FA7AF', '#9FB8BF', '#F5F4F0', '#DDD9C8', '#D3CDBD', '#B5BFA2', '#BDC7A4', '#E4E0C8', '#E7DDBF', '#EDDFBE', '#C4CCA4', '#E3D7B4', '#AFBD98', '#D6CEC1'].map(hex);
const FOREST = new Set([5, 6, 10, 12]);
const DEEP = hex('#6F8C97'), MID = hex('#8AA4AD'), SHELF = hex('#C3D2D3'), COAST = hex('#4F6D78'), LAKE = hex('#9FB8BF'), DOT = hex('#5A7352'), PAPER = hex('#F4F2ED');
const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Bilinear sample of the smoothed sea depth (image rows). */
function depthAt(L: Layers, c: number, r: number): number {
  const { w, h } = L.f;
  const c0 = Math.max(0, Math.min(w - 2, Math.floor(c))), r0 = Math.max(0, Math.min(h - 2, Math.floor(r))), tx = Math.max(0, Math.min(1, c - c0)), ty = Math.max(0, Math.min(1, r - r0));
  const g = (cc: number, rr: number) => L.depth[rr * w + cc];
  return (g(c0, r0) * (1 - tx) + g(c0 + 1, r0) * tx) * (1 - ty) + (g(c0, r0 + 1) * (1 - tx) + g(c0 + 1, r0 + 1) * tx) * ty;
}
/** Bilinear sample of the land–sea field (positive on land). */
function coastAt(L: Layers, c: number, r: number): number {
  const { w, h } = L.f;
  const c0 = Math.max(0, Math.min(w - 2, Math.floor(c))), r0 = Math.max(0, Math.min(h - 2, Math.floor(r))), tx = Math.max(0, Math.min(1, c - c0)), ty = Math.max(0, Math.min(1, r - r0));
  const g = (cc: number, rr: number) => L.coast[rr * w + cc];
  return (g(c0, r0) * (1 - tx) + g(c0 + 1, r0) * tx) * (1 - ty) + (g(c0, r0 + 1) * (1 - tx) + g(c0 + 1, r0 + 1) * tx) * ty;
}
/** Bilinear sample of the height grid at grid image coordinates. */
function zAt(L: Layers, c: number, r: number): number {
  const { w, h } = L.f;
  const c0 = Math.max(0, Math.min(w - 2, Math.floor(c))), r0 = Math.max(0, Math.min(h - 2, Math.floor(r)));
  const tx = Math.max(0, Math.min(1, c - c0)), ty = Math.max(0, Math.min(1, r - r0));
  // the height grid is stored with row 0 at the south edge; image row r is grid row h-1-r
  const g = (cc: number, rr: number) => L.z[(h - 1 - rr) * w + cc];
  return (g(c0, r0) * (1 - tx) + g(c0 + 1, r0) * tx) * (1 - ty) + (g(c0, r0 + 1) * (1 - tx) + g(c0 + 1, r0 + 1) * tx) * ty;
}
const biomeAt = (L: Layers, c: number, r: number) => { const cc = Math.max(0, Math.min(L.f.w - 1, Math.round(c))), rr = Math.max(0, Math.min(L.f.h - 1, Math.round(r))); return L.biome[(L.f.h - 1 - rr) * L.f.w + cc]; };
function hsAt(L: Layers, c: number, r: number): number {
  const k = L.hsW / L.f.w, x = (c + 0.5) * k - 0.5, y = (r + 0.5) * k - 0.5;
  const x0 = Math.max(0, Math.min(L.hsW - 2, Math.floor(x))), y0 = Math.max(0, Math.min(L.hsH - 2, Math.floor(y))), tx = Math.max(0, Math.min(1, x - x0)), ty = Math.max(0, Math.min(1, y - y0));
  const g = (a: number, b: number) => L.hs[b * L.hsW + a];
  return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
}

/** The land colour blended between the four cells around a point (sea and lake cells count as grassland), and the
 * share of forest there. */
function blendAt(L: Layers, c: number, r: number): [number[], number] {
  const { w, h } = L.f;
  const c0 = Math.max(0, Math.min(w - 2, Math.floor(c))), r0 = Math.max(0, Math.min(h - 2, Math.floor(r))), tx = Math.max(0, Math.min(1, c - c0)), ty = Math.max(0, Math.min(1, r - r0));
  const out = [0, 0, 0];
  let fr = 0;
  for (const [cc, rr, wt] of [[c0, r0, (1 - tx) * (1 - ty)], [c0 + 1, r0, tx * (1 - ty)], [c0, r0 + 1, (1 - tx) * ty], [c0 + 1, r0 + 1, tx * ty]] as [number, number, number][]) {
    const b = L.biome[(h - 1 - rr) * w + cc], col = PAL[b <= 1 ? 7 : b] ?? PAL[7];
    out[0] += col[0] * wt; out[1] += col[1] * wt; out[2] += col[2] * wt;
    if (FOREST.has(b)) fr += wt;
  }
  return [out, fr];
}
/** The terrain, styled: box [c0, r0, c1, r1] in grid image coordinates, outW pixels wide. */
function styleBox(L: Layers, box: [number, number, number, number], outW: number, opt: { relief?: number; dot?: number } = {}) {
  const [c0, r0, c1, r1] = box, s = outW / (c1 - c0), outH = Math.round((r1 - r0) * s);
  const out = Buffer.alloc(outW * outH * 3);
  // the hillshade's neutral level, from land
  let sum = 0, n = 0;
  for (let k = 0; k < L.f.w * L.f.h; k += 7) if (L.z[k] >= 0) { const j = (k / L.f.w) | 0, i = k % L.f.w; sum += hsAt(L, i, L.f.h - 1 - j); n++; }
  const mid = n ? sum / n : 180, relief = opt.relief ?? 1.2;
  const cell = opt.dot ?? Math.max(4, Math.round(s * 1.6)); // forest dot spacing in output pixels
  const e = 0.5 / s; // half an output pixel, in cells
  const warp = new Noise2(L.f.name === 'region' ? 811 : 812);
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const c = c0 + (x + 0.5) / s - 0.5, r = r0 + (y + 0.5) / s - 0.5, o = (y * outW + x) * 3;
    const z = zAt(L, c, r);
    const qc = c + 0.45 * warp.fbm(c / 4 + 7.1, r / 4 + 3.3, 2), qr = r + 0.45 * warp.fbm(c / 4 + 19.9, r / 4 + 41.2, 2);
    const land = coastAt(L, qc, qr);
    // the biome edge: the palette blended between cells at a gently warped point, so edges wander instead of
    // following 3 km cells, and are soft rather than speckled
    const wc = c + 0.9 * warp.fbm(c / 9, r / 9, 3), wr = r + 0.9 * warp.fbm(c / 9 + 31.7, r / 9 + 11.3, 3);
    const b = biomeAt(L, wc, wr);
    let R: number, G: number, B: number;
    // a lake only where the land–sea field says land (single "lake" cells offshore are sea)
    const lake = (b === 1 || biomeAt(L, c, r) === 1) && land > 0;
    if (land < 0 && !lake) {
      // the sea by depth: pale over the shelf, slate beyond the slope
      const dz = Math.min(depthAt(L, c, r), -1), t1 = Math.min(1, -dz / 220), t2 = Math.max(0, Math.min(1, (-dz - 220) / 2800));
      const a = [SHELF[0] + (MID[0] - SHELF[0]) * Math.pow(t1, 0.7), SHELF[1] + (MID[1] - SHELF[1]) * Math.pow(t1, 0.7), SHELF[2] + (MID[2] - SHELF[2]) * Math.pow(t1, 0.7)];
      R = a[0] + (DEEP[0] - a[0]) * t2; G = a[1] + (DEEP[1] - a[1]) * t2; B = a[2] + (DEEP[2] - a[2]) * t2;
    } else if (lake) {
      R = LAKE[0]; G = LAKE[1]; B = LAKE[2];
    } else {
      const [col, fr] = blendAt(L, wc, wr);
      R = col[0]; G = col[1]; B = col[2];
      const f = ((hsAt(L, c, r) - mid) / 255) * relief * (b === 2 ? 0.7 : 1);
      if (f < 0) { const t = Math.max(-0.5, f * 1.4); R *= 1 + t; G *= 1 + t * 0.96; B *= 1 + t * 0.9; }
      else { const t = Math.min(0.45, f * 0.8); R += (PAPER[0] - R) * t; G += (PAPER[1] - G) * t; B += (PAPER[2] - B) * t; }
      if (fr > 0.5) {
        const cx = Math.floor(x / cell), cy = Math.floor(y / cell), px = (cx + 0.25 + hash(cx, cy) * 0.5) * cell, py = (cy + 0.25 + hash(cy, cx + 7) * 0.5) * cell;
        const d = Math.hypot(x - px, y - py), rr = cell * 0.24;
        const a = 0.38 * Math.max(0, Math.min(1, rr + 0.5 - d));
        R = R * (1 - a) + DOT[0] * a; G = G * (1 - a) + DOT[1] * a; B = B * (1 - a) + DOT[2] * a;
      }
    }
    // the coastline: where the height crosses 0, about one output pixel wide, antialiased
    const gx = (coastAt(L, qc + e, qr) - coastAt(L, qc - e, qr)) * s, gy = (coastAt(L, qc, qr + e) - coastAt(L, qc, qr - e)) * s;
    const gl = Math.hypot(gx, gy);
    // only where land and sea actually meet within about a pixel (not where the sea floor merely steepens)
    const e2 = 1.3 / s, meets = [coastAt(L, qc + e2, qr), coastAt(L, qc - e2, qr), coastAt(L, qc, qr + e2), coastAt(L, qc, qr - e2)].some((v) => v > 0 !== land > 0);
    if (gl > 1e-6 && b !== 1 && meets) {
      const d = Math.abs(land) / gl; // distance to the coast, in output pixels
      const a = Math.max(0, Math.min(1, 1.15 - d)) * 0.85;
      if (a > 0) { R += (COAST[0] - R) * a; G += (COAST[1] - G) * a; B += (COAST[2] - B) * a; }
    }
    out[o] = R; out[o + 1] = G; out[o + 2] = B;
  }
  return { buf: out, w: outW, h: outH, s, box };
}

// ---- towns and roads: texture, invented here, unnamed; not from the book
type Town = { c: number; r: number; size: number; named?: string };
type Road = { pts: [number, number][]; kind: 'main' | 'secondary' | 'minor' | 'rail' };
const SUIT: Record<number, number> = { 5: 0.35, 6: 0.85, 7: 1, 8: 0.55, 9: 0.12, 10: 0.85, 11: 0.6, 12: 0.45, 13: 1 };
function suitability(L: Layers) {
  const { w, h } = L.f, s = new Float32Array(w * h);
  // flow near each cell from the river polylines (in image rows)
  const wet = new Float32Array(w * h);
  for (const rv of L.rivers) for (const [lo, la] of rv.points) { const [c, r] = toGrid(L.f, lo, la), i = Math.round(c), j = Math.round(r); if (i >= 0 && j >= 0 && i < w && j < h) wet[j * w + i] = Math.max(wet[j * w + i], rv.flow_km2); }
  const zImg = (i: number, j: number) => L.z[(h - 1 - j) * w + i];
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const z = zImg(i, j), b = L.biome[(h - 1 - j) * w + i];
    if (z < 0 || b <= 4) continue;
    const slope = Math.hypot(zImg(i + 1, j) - zImg(i - 1, j), zImg(i, j + 1) - zImg(i, j - 1)) / (2 * L.f.dx); // m per km
    let v = (SUIT[b] ?? 0.5) * Math.exp(-slope / 22) * (z > 1500 ? 0.3 : z > 800 ? 0.7 : 1);
    let near = 0, coast = false;
    for (let b2 = -2; b2 <= 2; b2++) for (let a = -2; a <= 2; a++) { const k = (j + b2) * w + i + a; if (k < 0 || k >= w * h) continue; near = Math.max(near, wet[k]); if (zImg(Math.min(w - 1, Math.max(0, i + a)), Math.min(h - 1, Math.max(0, j + b2))) < 0) coast = true; }
    if (near > 15000) v *= 1.8; else if (near > 3000) v *= 1.3;
    if (coast) v *= 1.5;
    s[j * w + i] = v;
  }
  return s;
}
function placeTowns(L: Layers, named: Town[], seed: number, spacingKm: number): Town[] {
  const { w, h } = L.f, S = suitability(L), rnd = mulberry32(seed), cellKm = L.f.dx;
  const towns: Town[] = [...named];
  const R = spacingKm / cellKm, bucket = new Map<string, Town[]>(), key = (c: number, r: number) => `${Math.floor(c / R)},${Math.floor(r / R)}`;
  for (const t of towns) { const k = key(t.c, t.r); bucket.set(k, [...(bucket.get(k) ?? []), t]); }
  const far = (c: number, r: number, minC: number) => { const bc = Math.floor(c / R), br = Math.floor(r / R); for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) for (const t of bucket.get(`${bc + a},${br + b}`) ?? []) if (Math.hypot(t.c - c, t.r - r) < minC) return false; return true; };
  // candidates in random order, weighted by suitability; spacing shrinks where the land is best
  const cand: [number, number][] = [];
  for (let k = 0; k < w * h; k++) if (S[k] > 0.05) { const key2 = S[k] * Math.pow(rnd(), 0.6); cand.push([k, key2]); }
  cand.sort((a, b) => b[1] - a[1]);
  for (const [k, v] of cand) {
    if (rnd() > Math.min(1, S[k] * 1.4)) continue;
    const c = k % w, r = (k / w) | 0;
    const minC = R * (1.25 - 0.45 * Math.min(1, S[k] / 1.6));
    if (!far(c, r, minC)) continue;
    const t: Town = { c, r, size: v > 1.4 ? 2 : v > 0.7 ? 1 : 0 };
    towns.push(t);
    const kk = key(c, r); bucket.set(kk, [...(bucket.get(kk) ?? []), t]);
  }
  return towns;
}
/** Least-cost route over the grid: slope and height cost, water impassable, existing roads cheaper. */
function route(L: Layers, a: [number, number], b: [number, number], used: Uint8Array, maxKm: number): [number, number][] | null {
  const { w, h } = L.f, dx = L.f.dx;
  const zImg = (i: number, j: number) => L.z[(h - 1 - j) * w + i];
  const margin = 30;
  const i0 = Math.max(1, Math.min(a[0], b[0]) - margin), i1 = Math.min(w - 2, Math.max(a[0], b[0]) + margin), j0 = Math.max(1, Math.min(a[1], b[1]) - margin), j1 = Math.min(h - 2, Math.max(a[1], b[1]) + margin);
  const bw = i1 - i0 + 1, bh = j1 - j0 + 1, N = bw * bh;
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const idx = (i: number, j: number) => (j - j0) * bw + (i - i0);
  const lake = (i: number, j: number) => L.biome[(h - 1 - j) * w + i] === 1;
  const start = idx(a[0], a[1]), goal = idx(b[0], b[1]);
  // binary heap
  const hk: number[] = [], hv: number[] = [];
  const push = (k: number, v: number) => { hk.push(k); hv.push(v); let n = hk.length - 1; while (n > 0) { const p = (n - 1) >> 1; if (hv[p] <= hv[n]) break; [hk[p], hk[n]] = [hk[n], hk[p]]; [hv[p], hv[n]] = [hv[n], hv[p]]; n = p; } };
  const pop = () => { const k = hk[0], v = hv[0], lk = hk.pop()!, lv = hv.pop()!; if (hk.length) { hk[0] = lk; hv[0] = lv; let n = 0; for (;;) { const l = 2 * n + 1, r2 = l + 1; let m = n; if (l < hk.length && hv[l] < hv[m]) m = l; if (r2 < hk.length && hv[r2] < hv[m]) m = r2; if (m === n) break; [hk[m], hk[n]] = [hk[n], hk[m]]; [hv[m], hv[n]] = [hv[n], hv[m]]; n = m; } } return [k, v]; };
  const hx = (i: number, j: number) => Math.hypot(i - b[0], j - b[1]) * dx * 0.55; // admissible enough (roads cost at least 0.55 per km)
  dist[start] = 0; push(start, hx(a[0], a[1]));
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (hk.length) {
    const [k] = pop();
    if (k === goal) break;
    const i = (k % bw) + i0, j = ((k / bw) | 0) + j0, dk = dist[k];
    if (dk > maxKm * 3) return null;
    const zi = zImg(i, j);
    for (const [di, dj] of D8) {
      const ii = i + di, jj = j + dj;
      if (ii < i0 || ii > i1 || jj < j0 || jj > j1) continue;
      const z2 = zImg(ii, jj);
      if (z2 < 0 || lake(ii, jj)) continue;
      const len = (di && dj ? Math.SQRT2 : 1) * dx, grade = Math.abs(z2 - zi) / (len * 1000);
      let cost = len * (1 + 900 * grade * grade + (z2 > 2200 ? 2 : 0));
      if (used[jj * w + ii]) cost *= 0.55;
      const nk = idx(ii, jj), nd = dk + cost;
      if (nd < dist[nk]) { dist[nk] = nd; prev[nk] = k; push(nk, nd + hx(ii, jj)); }
    }
  }
  if (!isFinite(dist[goal])) return null;
  const out: [number, number][] = [];
  for (let k = goal; k >= 0; k = prev[k]) { out.push([(k % bw) + i0, ((k / bw) | 0) + j0]); if (k === start) break; }
  return out.reverse();
}
function simplify(p: [number, number][], tol: number): [number, number][] {
  if (p.length < 3) return p;
  const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1;
  const st: [number, number][] = [[0, p.length - 1]];
  while (st.length) {
    const [a, b] = st.pop()!; let md = 0, mi = -1;
    const [ax, ay] = p[a], [bx, by] = p[b], L2 = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - p[i][1]) - (ax - p[i][0]) * (by - ay)) / L2; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return p.filter((_, i) => keep[i]);
}
const chaikin = (p: [number, number][], n: number) => { let q = p; for (let t = 0; t < n; t++) { const o: [number, number][] = [q[0]]; for (let i = 0; i < q.length - 1; i++) { const [ax, ay] = q[i], [bx, by] = q[i + 1]; o.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by], [0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]); } o.push(q[q.length - 1]); q = o; } return q; };
function roads(L: Layers, towns: Town[], links: [number, number, Road['kind']][], seed: number): Road[] {
  const { w } = L.f, used = new Uint8Array(L.f.w * L.f.h), out: Road[] = [], rnd = mulberry32(seed);
  const add = (a: Town, b: Town, kind: Road['kind'], maxKm: number) => {
    const p = route(L, [Math.round(a.c), Math.round(a.r)], [Math.round(b.c), Math.round(b.r)], used, maxKm);
    if (!p || p.length < 2) return false;
    for (const [i, j] of p) used[j * w + i] = 1;
    out.push({ pts: chaikin(simplify(p, 0.7), 2), kind });
    return true;
  };
  // the book's links (and our railways) first, so the minor roads join them
  for (const [a, b, kind] of links) add(towns[a], towns[b], kind, 1400);
  // a secondary network between the larger towns and the named places, then minor roads: a spanning tree over
  // every town (pairs within 160 km, shortest first) with a few extra links for loops
  const tree = (ids: number[], maxKm: number, kind: Road['kind'], loops: number) => {
    const pairs: [number, number, number][] = [];
    for (const a of ids) for (const b of ids) if (a < b) { const d = Math.hypot(towns[a].c - towns[b].c, towns[a].r - towns[b].r) * L.f.dx; if (d < maxKm) pairs.push([a, b, d]); }
    pairs.sort((x, y) => x[2] - y[2]);
    const parent = new Map<number, number>(), find = (x: number): number => { const p = parent.get(x) ?? x; if (p === x) return x; const q = find(p); parent.set(x, q); return q; };
    for (const [a, b, d] of pairs) {
      const ra = find(a), rb = find(b);
      if (ra !== rb) { if (add(towns[a], towns[b], kind, d)) parent.set(ra, rb); }
      else if (rnd() < loops && d < maxKm * 0.6) add(towns[a], towns[b], kind, d);
    }
  };
  tree(towns.map((_, i) => i).filter((i) => towns[i].named || towns[i].size === 2), 320, 'secondary', 0.08);
  tree(towns.map((_, i) => i), 160, 'minor', 0.05);  return out;
}
/** Towns and roads as an SVG overlay for a box of the grid, at the box's scale. */
function overlaySvg(o: { w: number; h: number; s: number; box: number[] }, towns: Town[], rds: Road[], rivers: { flow_km2: number; points: [number, number][] }[], L: Layers, seed: number) {
  const [c0, r0] = o.box, s = o.s, X = (c: number) => ((c - c0 + 0.5) * s).toFixed(1), Y = (r: number) => ((r - r0 + 0.5) * s).toFixed(1);
  const k = s / 2; // widths are set for the region at 4,096 px (2 px per cell)
  const path = (p: [number, number][]) => 'M' + p.map(([c, r]) => `${X(c)} ${Y(r)}`).join('L');
  const parts: string[] = [];
  // rivers: the width grows with the log of the catchment and is capped; small ones are lighter
  const rv = [...rivers].sort((a, b) => a.flow_km2 - b.flow_km2);
  for (const r of rv) {
    const lf = Math.log10(Math.max(1, r.flow_km2));
    const wpx = Math.min(2.1, 0.55 + 0.42 * Math.max(0, lf - 3.3)) * k, op = Math.min(0.95, 0.4 + 0.16 * Math.max(0, lf - 3.3));
    const pts = chaikin(r.points.map(([lo, la]) => toGrid(L.f, lo, la)), 1);
    parts.push(`<path d="${path(pts)}" fill="none" stroke="#6E8E9B" stroke-opacity="${op.toFixed(2)}" stroke-width="${wpx.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  // roads: minor under main; a pale casing under main roads
  for (const r of rds.filter((x) => x.kind === 'minor')) parts.push(`<path d="${path(r.pts)}" fill="none" stroke="#8F7E6A" stroke-opacity="0.42" stroke-width="${(0.6 * k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const r of rds.filter((x) => x.kind === 'secondary')) parts.push(`<path d="${path(r.pts)}" fill="none" stroke="#8A6E58" stroke-opacity="0.75" stroke-width="${(0.85 * k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const r of rds.filter((x) => x.kind === 'main')) parts.push(`<path d="${path(r.pts)}" fill="none" stroke="#F4F2ED" stroke-opacity="0.75" stroke-width="${(2.4 * k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${path(r.pts)}" fill="none" stroke="#7A5C45" stroke-width="${(1.2 * k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const r of rds.filter((x) => x.kind === 'rail')) parts.push(`<path d="${path(r.pts)}" fill="none" stroke="#3E3A34" stroke-width="${(1.3 * k).toFixed(2)}" stroke-linecap="butt" stroke-linejoin="round"/><path d="${path(r.pts)}" fill="none" stroke="#F4F2ED" stroke-width="${(0.6 * k).toFixed(2)}" stroke-dasharray="${(3 * k).toFixed(1)} ${(3 * k).toFixed(1)}"/>`);
  // towns: a dark dot on a pale halo (larger for larger towns and the named places); where the image is detailed
  // enough (the battle map's area), a few blocks around it
  const rnd = mulberry32(seed);
  for (const t of towns) {
    const rr = (t.named ? 2.1 : [1.0, 1.3, 1.7][t.size]) * Math.max(1, k * 0.8);
    const cx = Number(X(t.c)), cy = Number(Y(t.r));
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${(rr * 1.9).toFixed(2)}" fill="#F4F2ED" fill-opacity="0.55"/><circle cx="${cx}" cy="${cy}" r="${rr.toFixed(2)}" fill="#5E574E" fill-opacity="0.9"/>`);
    if (k >= 1.5) for (let i = 0; i < (t.named ? 8 : [2, 3, 5][t.size]); i++) {
      const a = rnd() * Math.PI * 2, d = rr * (1.2 + rnd() * 1.4), bw = (0.5 + rnd() * 0.5) * k, bh = (0.4 + rnd() * 0.4) * k, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      parts.push(`<rect x="${(x - bw / 2).toFixed(2)}" y="${(y - bh / 2).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" fill="#6B645B" fill-opacity="0.8" transform="rotate(${(rnd() * 90).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${o.w}" height="${o.h}" viewBox="0 0 ${o.w} ${o.h}">${parts.join('')}</svg>`);
}
async function bake(file: string, L: Layers, box: [number, number, number, number], outW: number, towns: Town[], rds: Road[], seed: number, quality = 82, extra?: { file: string; w: number }) {
  const t0 = Date.now();
  const img = styleBox(L, box, outW);
  const svg = overlaySvg(img, towns.filter((t) => t.c >= box[0] - 5 && t.c <= box[2] + 5 && t.r >= box[1] - 5 && t.r <= box[3] + 5), rds, L.rivers, L, seed);
  const base = sharp(img.buf, { raw: { width: img.w, height: img.h, channels: 3 } }).composite([{ input: svg, top: 0, left: 0 }]);
  const flat = await base.png().toBuffer();
  mkdirSync(path.join(ROOT, PUB), { recursive: true });
  await sharp(flat).jpeg({ quality, mozjpeg: true }).toFile(path.join(ROOT, PUB, file));
  if (extra) await sharp(flat).resize({ width: extra.w }).jpeg({ quality, mozjpeg: true }).toFile(path.join(ROOT, PUB, extra.file));
  console.log(`${file}: ${img.w}×${img.h}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return { w: img.w, h: img.h };
}

// ---- places, from the map's frames
/** A label point for an area: inside it, inside the image (with a margin), as far from its outline as possible. */
function interior(P: number[][], w: number, h: number): number[] | null {
  const xs = P.map((q) => q[0]), ys = P.map((q) => q[1]);
  const x0 = Math.max(Math.min(...xs), 30), x1 = Math.min(Math.max(...xs), w - 30), y0 = Math.max(Math.min(...ys), 20), y1 = Math.min(Math.max(...ys), h - 20);
  if (x0 >= x1 || y0 >= y1) return null;
  const inside = (x: number, y: number) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const edge = (x: number, y: number) => { let m = Infinity; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [ax, ay] = P[j], [bx, by] = P[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0; m = Math.min(m, Math.hypot(x - ax - t * dx, y - ay - t * dy)); } return Math.min(m, x, w - x, y, h - y); };
  let best: number[] | null = null, bd = -1;
  for (let a = 0; a <= 40; a++) for (let b = 0; b <= 40; b++) { const x = x0 + ((x1 - x0) * a) / 40, y = y0 + ((y1 - y0) * b) / 40; if (!inside(x, y)) continue; const d = edge(x, y); if (d > bd) { bd = d; best = [Number(x.toFixed(1)), Number(y.toFixed(1))]; } }
  return best;
}
const ptsOf = (p: MapFile['places'][number]) => (p.points ?? (p.at ? [p.at] : p.center ? [p.center] : [])) as number[][];
function inFrame(f: Fr, lon: number, lat: number) { const [c, r] = toGrid(f, lon, lat); return c >= -0.5 && r >= -0.5 && c <= f.w - 0.5 && r <= f.h - 0.5; }

async function main() {
  const R = await readLayers(SRC.region, 'region'), D = await readLayers(SRC.dzego, 'dzego');
  console.log('layers read');
  // the named places on land become towns (the client draws their marks and labels on top)
  const namedTowns = (L: Layers) => W.places.filter((p) => p.shape === 'point' && !p.hide_label && p.draw !== false).flatMap((p) => {
    const [la, lo] = toDeg(W, p.at!, p.frame);
    if (!inFrame(L.f, lo, la)) return [];
    const [c, r] = toGrid(L.f, lo, la);
    if (zAt(L, c, r) < 0) return [];
    return [{ c, r, size: 2, named: p.id } as Town];
  });
  const rNamed = namedTowns(R), dNamed = namedTowns(D);
  const rTowns = placeTowns(R, rNamed, 51, 85), dTowns = placeTowns(D, dNamed, 52, 60);
  console.log(`towns: region ${rTowns.length} (${rNamed.length} named), dzego ${dTowns.length} (${dNamed.length} named)`);
  // the book's links between the United Cities (chapter 5's figure) as main roads; the railway to Eldil; Dzego's railway
  const at = (T: Town[], id: string) => T.findIndex((t) => t.named === id);
  const rLinks: [number, number, Road['kind']][] = [];
  for (const p of W.places.filter((q) => q.id.startsWith('link_'))) { const [a, b] = p.id.slice(5).split('_'), ia = at(rTowns, a), ib = at(rTowns, b); if (ia >= 0 && ib >= 0) rLinks.push([ia, ib, 'main']); }
  const ie = at(rTowns, 'eldil'), im = at(rTowns, 'meldan'); if (ie >= 0 && im >= 0) rLinks.push([im, ie, 'rail']);
  const dLinks: [number, number, Road['kind']][] = [];
  const ip = at(dTowns, 'pafogai'), is = at(dTowns, 'sadzu'); if (ip >= 0 && is >= 0) dLinks.push([ip, is, 'rail']);
  const rRoads = roads(R, rTowns, rLinks, 61), dRoads = roads(D, dTowns, dLinks, 62);
  console.log(`roads: region ${rRoads.length} (${rLinks.length} main or rail), dzego ${dRoads.length}`);

  // the views: the whole region; the battle map's area, baked at twice the density; Dzego
  const box = (L: Layers, lo0: number, la0: number, lo1: number, la1: number): [number, number, number, number] => { const [a, b] = toGrid(L.f, lo0, la1), [c, d] = toGrid(L.f, lo1, la0); return [Math.max(-0.5, a), Math.max(-0.5, b), Math.min(L.f.w - 0.5, c), Math.min(L.f.h - 0.5, d)]; };
  const full = (L: Layers): [number, number, number, number] => [-0.5, -0.5, L.f.w - 0.5, L.f.h - 0.5];
  const nsV = W.views!.find((v) => v.suffix === '-northshore')!.bounds, ucV = W.views!.find((v) => v.suffix === '-united-cities')!.bounds;
  const nsBox = box(R, nsV[0], nsV[1], nsV[2], nsV[3]), ucBox = box(R, ucV[0], ucV[1], ucV[2], ucV[3]);
  const world = await bake('world.jpg', R, full(R), 4096, rTowns, rRoads, 71, 80, { file: 'world-2048.jpg', w: 2048 });
  const ns = await bake('northshore.jpg', R, nsBox, 2400, rTowns, rRoads, 71, 82);
  const dz = await bake('dzego.jpg', D, full(D), 3072, dTowns, dRoads, 72, 82);

  // places in each image's own pixels (world.jpg, northshore.jpg, dzego.jpg); circles' radii in the same pixels
  const kmPerPx = (L: Layers, imgW: number, b: number[]) => (L.f.dx * (b[2] - b[0])) / imgW;
  const toImg = (L: Layers, b: number[], imgW: number) => (lon: number, lat: number) => { const [c, r] = toGrid(L.f, lon, lat), s = imgW / (b[2] - b[0]); return [Number(((c - b[0]) * s).toFixed(1)), Number(((r - b[1]) * s).toFixed(1))]; };
  const views = {
    world: { image: '/maps/v5/world.jpg', small: '/maps/v5/world-2048.jpg', w: world.w, h: world.h, km_per_px: kmPerPx(R, world.w, full(R)) },
    ns: { image: '/maps/v5/northshore.jpg', w: ns.w, h: ns.h, km_per_px: kmPerPx(R, ns.w, nsBox) },
    uc: { image: '/maps/v5/world.jpg', small: '/maps/v5/world-2048.jpg', w: world.w, h: world.h, km_per_px: kmPerPx(R, world.w, full(R)), crop: ucBox.map((v) => Number(((v + 0.5) * (world.w / R.f.w)).toFixed(1))) },
    dz: { image: '/maps/v5/dzego.jpg', w: dz.w, h: dz.h, km_per_px: kmPerPx(D, dz.w, full(D)) },
  };
  const fWorld = toImg(R, full(R), world.w), fNs = toImg(R, nsBox, ns.w), fDz = toImg(D, full(D), dz.w);
  const places = W.places.filter((p) => p.draw !== false).map((p) => {
    const raw = ptsOf(p).map((q) => { const [la, lo] = toDeg(W, q, p.frame); return [lo, la] as [number, number]; });
    const inR = raw.some(([lo, la]) => inFrame(R.f, lo, la)), inD = raw.some(([lo, la]) => inFrame(D.f, lo, la));
    // a circle's radius: km in the "uc" frame, battle-map pixels (2.6 km) in "northshore", degrees otherwise
    const rKm = p.shape === 'circle' ? (p.frame === 'northshore' ? p.r! * 2.6 : p.frame === 'uc' ? p.r! : p.r! * 111.2) : undefined;
    return {
      id: p.id, name: p.name, shape: p.shape, provenance: p.provenance === 'book' ? 'book' : 'placed', lines: p.lines ?? [], hide_label: !!p.hide_label,
      world: inR ? raw.map(([lo, la]) => fWorld(lo, la)) : null,
      ns: inR ? raw.map(([lo, la]) => fNs(lo, la)) : null,
      dz: inD ? raw.map(([lo, la]) => fDz(lo, la)) : null,
      r_km: rKm,
    };
  }).map((q) => {
    if (q.shape !== 'polygon') return q;
    const c = views.uc.crop, anchor: Record<string, number[] | null> = {};
    if (q.world) { anchor.world = interior(q.world, world.w, world.h); const u = q.world.map(([x, y]) => [x - c[0], y - c[1]]); anchor.uc = interior(u, c[2] - c[0], c[3] - c[1]); }
    if (q.ns) anchor.ns = interior(q.ns, ns.w, ns.h);
    if (q.dz) anchor.dz = interior(q.dz, dz.w, dz.h);
    for (const k of Object.keys(anchor)) if (!anchor[k]) delete anchor[k];
    return { ...q, anchor };
  });
  const out = {
    about: 'Generated by scripts/maps-style.ts from the frozen v5 terrain and content/snowmoon/maps/world.json: every place in each image\'s pixels, from the map\'s own frames. Do not edit by hand.',
    label: 'Map made with AI-written code from real public elevation data, reshaped to fit the book. Sources in the recipe. Made by Snowmoon Party, not by the author.',
    short_label: 'AI map · by Snowmoon Party',
    texture_note: `Towns and roads are texture: invented by the same code, unnamed, not from the book (${rTowns.length - rNamed.length + dTowns.length - dNamed.length} towns, ${rRoads.length + dRoads.length} roads and railways). The main roads between the United Cities follow the book's links (chapter 5's figure); their courses are ours. The railway from Meldan to Eldil and Dzego's railway are ours.`,
    views, places,
  };
  writeFileSync(path.join(ROOT, 'content/snowmoon/maps/world-view.json'), JSON.stringify(out) + '\n');
  console.log('wrote content/snowmoon/maps/world-view.json');
}
main();
