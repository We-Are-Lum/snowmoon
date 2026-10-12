/**
 * Maps v5 (proposal): real terrain, disguised. The procedural base of maps v4 is replaced by real
 * elevation data, moved somewhere else on the globe by a rigid motion of the sphere (a rotation in 15°
 * steps, optionally mirrored, at true scale), then reshaped to fit the book by the same pins as v4.
 * Climate, forests and rivers are recomputed from the book's latitudes and the real heights.
 *
 * Sources (public domain; licence lines in content/snowmoon/maps/terrain-v5/sources.json):
 * - region and Dzego: NOAA ETOPO 2022, 60 arc-second surface elevation (land and bathymetry), CC0-1.0;
 * - city patches: NASA SRTM GL1 v003 (1 arc-second), CC0 under NASA's data policy, via OpenTopography.
 *
 * Steps:
 *   npx tsx scripts/terrain-v5.ts prepare                 decode ETOPO once into a 16-bit cache
 *   npx tsx scripts/terrain-v5.ts search [--frame=region|dzego] [--top=5]
 *   npx tsx scripts/terrain-v5.ts hills                    find lone hills for the two cities in ETOPO
 *   npx tsx scripts/terrain-v5.ts city --tiles=…          score SRTM patches for Meldan and Pafogai Du
 *   npx tsx scripts/terrain-v5.ts build --region=N [--candidates=1,2,3,4,5]
 * No image model. Large data stays in data-cache/ and out/ (both gitignored).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readGeoTiff } from './lib/geotiff-lite';
import { type XY, pointInPoly } from './lib/terrain-core';
import { Noise2 } from './lib/noise';
import { rgbPng, rgbaPng, grey8Png, grey16Png, writeTiles, downsample, newRGBA, type RGBA } from './lib/raster-out';
import {
  W, LL, ucLL, nsLL, llToFrame, REGION, DZEGO, MELDAN, PAFOGAI, kmDist, applyPins, softPins, erodeDroplets, carve, dropSpecks, hydrology, climate,
  regionPins, dzegoPins, meldanPinsV4, pafogaiPinsV4, testSeed, render, BIOMES, B, smooth, place, pts, maps, cxy, polySigned,
  type Frame, type CityFrame, type FrameRun, type SeedRun, type Pin,
} from './terrain-v4';

const ROOT = process.cwd();
const REC = 'content/snowmoon/maps/terrain-v5';
const OUT = 'out/maps-v5';
const CACHE = 'data-cache';
const LABEL = 'Terrain adapted from real elevation data (source in the recipe), reshaped to fit the book.';
const LABEL_FULL = `${LABEL} (Draft label.) The heights are real, moved and possibly mirrored, then reshaped by code written by an AI model, Claude (the coding agent, a closed model); no image model. Every book fact is pinned. Not by the author.`;
const LICENSE = 'Terrain for Snowmoon, the book by Vitalik Buterin, adapted from public-domain elevation data (see the recipe), 2026-10-12. GPL-3.0, like the book.';
const SOURCES = ['scripts/terrain-v5.ts', 'scripts/terrain-v4.ts', 'scripts/lib/geotiff-lite.ts', 'scripts/lib/terrain-core.ts', 'scripts/lib/noise.ts', 'scripts/lib/raster-out.ts', 'scripts/lib/map-tests.ts'];
const codeVersion = () => Object.fromEntries(SOURCES.map((f) => [f, createHash('sha256').update(readFileSync(path.join(ROOT, f))).digest('hex')]));
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;
const RE = 6371;

// ---- ETOPO 2022, 60 arc-seconds: 21600 × 10800, row 0 at 90°N, column 0 at 180°W, pixel centres
export const ETOPO = {
  tif: `${CACHE}/etopo/ETOPO_2022_v1_60s_N90W180_surface.tif`,
  i16: `${CACHE}/etopo/etopo60s.i16`,
  w: 21600, h: 10800, res: 1 / 60,
};
let ET: Int16Array | null = null;
export function etopo(): Int16Array {
  if (ET) return ET;
  const b = readFileSync(path.join(ROOT, ETOPO.i16));
  ET = new Int16Array(b.buffer, b.byteOffset, b.length / 2);
  return ET;
}
type Grid16 = { data: Int16Array; w: number; h: number; res: number };
/** Bilinear sample at a longitude and latitude (longitude wraps). */
export function sampleGrid(g: Grid16, lon: number, lat: number): number {
  let x = (lon + 180) / g.res - 0.5;
  const y = (90 - lat) / g.res - 0.5;
  x = ((x % g.w) + g.w) % g.w;
  const yc = Math.max(0, Math.min(g.h - 1.001, y));
  const i0 = Math.floor(x), j0 = Math.floor(yc), u = x - i0, v = yc - j0, i1 = (i0 + 1) % g.w;
  const d = g.data;
  return d[j0 * g.w + i0] * (1 - u) * (1 - v) + d[j0 * g.w + i1] * u * (1 - v) + d[(j0 + 1) * g.w + i0] * (1 - u) * v + d[(j0 + 1) * g.w + i1] * u * v;
}
/** A box-averaged copy at f times the pixel size, for the search. */
function coarsen(g: Grid16, f: number): Grid16 {
  const w = Math.floor(g.w / f), h = Math.floor(g.h / f), out = new Int16Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let s = 0;
      for (let b = 0; b < f; b++) for (let a = 0; a < f; a++) s += g.data[(j * f + b) * g.w + i * f + a];
      out[j * w + i] = Math.round(s / (f * f));
    }
  return { data: out, w, h, res: g.res * f };
}

// ---- the rigid motion: book points by distance and bearing from the frame's centre, placed around a source centre
export type Xf = { lon: number; lat: number; rot: number; mirror: boolean };
/** Great-circle distance (radians) and initial bearing (radians, clockwise from north) from a to b. */
export function polar(lon0: number, lat0: number, lon: number, lat: number): [number, number] {
  const p1 = rad(lat0), p2 = rad(lat), dl = rad(lon - lon0);
  const d = Math.acos(Math.max(-1, Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl))));
  const b = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
  return [d, b];
}
export function dest(lon0: number, lat0: number, d: number, b: number): XY {
  const p1 = rad(lat0);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = rad(lon0) + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [((deg(l2) + 540) % 360) - 180, deg(p2)];
}
type FrameName = 'region' | 'dzego' | 'northshore';
// Northshore: the chapter 29 battle map and what the book places around it (the peninsula, Thaldur, Northglade's
// island), in the battle map's pixels (2.6 km each); its own real patch, blended into the region
const NS_CORE: [number, number, number, number] = [-20, -10, 440, 250];
const nsBox = (() => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const x of [NS_CORE[0], NS_CORE[2]]) for (const y of [NS_CORE[1], NS_CORE[3]]) { const [lo, la] = nsLL([x, y]); a = Math.min(a, lo); c = Math.max(c, lo); b = Math.min(b, la); d = Math.max(d, la); } return [a, b, c, d] as [number, number, number, number]; })();
const CENTRE: Record<FrameName, XY> = { region: [38, 51], dzego: [149, 23], northshore: [(nsBox[0] + nsBox[2]) / 2, (nsBox[1] + nsBox[3]) / 2] };
/** Where a book point (lon, lat) of a frame comes from on the real globe. */
export function toSource(frame: FrameName, xf: Xf, lon: number, lat: number): XY {
  const [c0, c1] = CENTRE[frame];
  const [d, b] = polar(c0, c1, lon, lat);
  return dest(xf.lon, xf.lat, d, (xf.mirror ? -b : b) + rad(xf.rot));
}
/** And back: where a real point lands in the book's frame. */
export function toBook(frame: FrameName, xf: Xf, lon: number, lat: number): XY {
  const [c0, c1] = CENTRE[frame];
  const [d, b] = polar(xf.lon, xf.lat, lon, lat);
  const bb = b - rad(xf.rot);
  return dest(c0, c1, d, xf.mirror ? -bb : bb);
}

// ---- famous, recognisable coastlines: a candidate showing one is penalised
// (centre lon, lat; weight). A feature counts when its centre lands inside the frame.
const FAMOUS: [string, number, [number, number][]][] = [
  ['Great Britain', 2, [[-2, 54], [-4, 57.5], [0.5, 51.5], [-5, 50.2], [-3, 58.6]]], ['Ireland', 1, [[-8, 53], [-10, 52], [-6, 55]]],
  ['Italian peninsula', 2, [[12.5, 42], [16, 40], [9, 44.3], [15.6, 38]]], ['Sicily', 1, [[14, 37.5]]], ['Iberian peninsula', 2, [[-4, 40], [-9, 39], [-1, 37], [-8.5, 43], [3, 42]]],
  ['Jutland', 1, [[9.3, 56]]], ['Scandinavia', 2, [[7, 61], [15, 68], [18, 60], [24, 70], [10, 59]]], ['Gulf of Bothnia', 1, [[21, 63]]], ['Peloponnese', 1, [[22, 37.5]]],
  ['Crimea', 1.5, [[34, 45]]], ['Black Sea', 1.5, [[34, 43], [30, 44], [40, 42]]], ['Caspian Sea', 1.5, [[51, 42], [50, 46], [52, 38]]], ['Mediterranean Sea', 1.5, [[15, 38], [5, 40], [25, 34], [32, 34]]],
  ['Strait of Gibraltar', 1, [[-5.5, 36]]], ['Bosporus', 1, [[29, 41]]], ['Nile delta', 1, [[31, 31]]], ['Red Sea', 1.5, [[38, 20], [34, 27], [42, 14]]], ['Persian Gulf', 1.5, [[51, 27], [49, 29], [55, 25]]],
  ['Horn of Africa', 1.5, [[49, 10], [51, 11.5]]], ['Cape of Good Hope', 1, [[19, -34]]], ['Madagascar', 2, [[47, -19], [44, -23], [49, -14]]], ['Sri Lanka', 1.5, [[81, 7.5]]],
  ['Indian subcontinent', 1.5, [[78, 10], [73, 18], [80, 15], [70, 22]]], ['Arabian peninsula', 1.5, [[45, 23], [55, 20], [40, 15], [57, 23]]], ['Malay peninsula', 1.5, [[101, 4], [100, 8]]],
  ['Sumatra', 1.5, [[100, 0], [96, 4], [104, -4]]], ['Java', 1.5, [[110, -7.5], [107, -7], [114, -8]]], ['Borneo', 1.5, [[114, 1], [117, 5], [110, -2], [116, -3]]], ['Sulawesi', 1.5, [[120, -2], [122, 1], [121, -5]]],
  ['Philippines', 1.5, [[122, 12], [121, 17], [125, 8]]], ['Korean peninsula', 1.5, [[127.5, 36.5], [126.5, 34.5]]], ['Japan', 2, [[138, 36], [141, 40], [131, 33], [142, 43.5]]],
  ['Kamchatka', 1.5, [[159, 56], [160, 53]]], ['Taiwan', 1.5, [[121, 23.7]]], ['Hainan', 1, [[110, 19]]], ['Sakhalin', 1, [[143, 50]]],
  ['Australia', 2, [[134, -25], [115, -30], [150, -30], [130, -12], [145, -38], [141, -12], [123, -17], [136.5, -12.5], [139.5, -17], [142.5, -11]]], ['Tasmania', 1, [[146.5, -42]]], ['New Zealand', 2, [[174, -41], [172, -44], [175, -37]]],
  ['New Guinea', 1, [[143, -6], [138, -4]]], ['Florida', 2, [[-81.5, 28], [-80.5, 26]]], ['Gulf of Mexico', 1.5, [[-90, 25], [-95, 28], [-97, 22]]], ['Baja California', 2, [[-112, 27], [-115, 31], [-110, 24]]],
  ['Cuba', 1.5, [[-79, 21.5], [-76, 20.2], [-83, 22.5]]], ['Great Lakes', 2, [[-84, 45], [-87, 43], [-79, 43.5]]], ['Hudson Bay', 1.5, [[-85, 59], [-80, 55], [-90, 60]]], ['Cape Cod', 1, [[-70, 41.8]]],
  ['Chesapeake Bay', 1, [[-76, 38]]], ['San Francisco Bay', 1, [[-122.3, 37.8]]], ['Isthmus of Panama', 1, [[-80, 8.8]]], ['Yucatán', 1, [[-89, 20]]], ['Iceland', 2, [[-19, 65]]],
  ['Greenland', 2, [[-42, 72], [-50, 64], [-53, 70], [-60, 76], [-22, 70], [-35, 81], [-43, 60]]], ['Alaska', 2, [[-150, 61], [-160, 58], [-156, 71], [-165, 64]]], ['Aleutian Islands', 1.5, [[-175, 52], [178, 52], [-168, 53.5]]],
  ['Canadian Arctic islands', 1.5, [[-100, 73], [-85, 70], [-110, 75], [-80, 75], [-90, 79]]], ['Tierra del Fuego', 1.5, [[-69, -54]]], ['Río de la Plata', 1, [[-57, -35]]], ['Svalbard', 1, [[17, 78]]],
  ['Newfoundland', 1, [[-56, 49]]], ['Nova Scotia', 1, [[-63, 45]]], ['Vancouver Island', 1, [[-125.5, 49.6]]], ['Antarctic Peninsula', 1.5, [[-63, -66], [-60, -63]]], ['Kola peninsula', 1, [[36, 67.5]]],
  ['Tibetan Plateau and the Himalaya', 2, [[88, 31], [80, 34], [95, 31], [86, 28], [76, 36]]], ['Alps', 1.5, [[10, 46.5], [7, 45.8]]], ['Gulf of Guinea', 1.5, [[3, 4], [8, 4.3], [-2, 5], [9.5, 2]]],
  ['East African rift lakes', 1.5, [[30, -6], [34.5, -11], [29.5, -1]]], ['Lake Victoria', 1.5, [[33, -1]]], ['Bering Strait and Chukotka', 1.5, [[-169, 65.8], [-172, 64.5], [-175, 67]]], ['Gulf of Finland', 1, [[26, 60]]], ['Adriatic Sea', 1.5, [[15, 43]]], ['Aegean Sea', 1.5, [[25, 38.5]]], ['Gulf of California', 1.5, [[-111, 28]]], ['Lake Baikal', 1.5, [[108, 53.5]]],
];
const BOUNDS: Record<FrameName, [number, number, number, number]> = { region: [-8, 36, 84, 66], dzego: [138, 15, 160, 31], northshore: nsBox };
export function famousIn(frame: FrameName, xf: Xf): { name: string; w: number }[] {
  const [lo0, la0, lo1, la1] = BOUNDS[frame];
  const out: { name: string; w: number }[] = [];
  for (const [name, w, points] of FAMOUS)
    if (points.some(([lon, lat]) => { const [blo, bla] = toBook(frame, xf, lon, lat); return blo >= lo0 && blo <= lo1 && bla >= la0 && bla <= la1; })) out.push({ name, w });
  return out;
}
const penalty = (xf: Xf, hits: { w: number }[]) => 0.035 * hits.reduce((a, h) => a + h.w, 0) * (!xf.mirror && Math.min(xf.rot % 360, 360 - (xf.rot % 360)) <= 45 ? 1 : 0.6);

// ---- what the book asks of the terrain, as sampled targets (from the same pins v4 uses)
type Target = { group: number; d: number; b: number; want: 'land' | 'sea' | 'low' | 'high900' };
type Group = { name: string; weight: number; kind: 'frac' | 'max1800' | 'frac03' | 'atleast03' | 'landshare'; provenance: string; cat: 'battle' | 'sea' | 'land' | 'places' | 'relief' };
function targetsFor(frame: FrameName, stride: number, cap = 120): { targets: Target[]; groups: Group[] } {
  const f: Frame = frame === 'dzego' ? DZEGO : REGION;
  const inNs = (lo: number, la: number) => lo > nsBox[0] && lo < nsBox[2] && la > nsBox[1] && la < nsBox[3];
  const pins = (frame === 'dzego' ? dzegoPins() : regionPins()).filter((p) => p.kind !== 'river' && p.kind !== 'cover');
  const [c0, c1] = CENTRE[frame];
  const targets: Target[] = [], groups: Group[] = [];
  const add = (group: number, x: number, y: number, want: Target['want']) => { const [lo, la] = f.toLL(x, y); const [d, b] = polar(c0, c1, lo, la); targets.push({ group, d, b, want }); };
  const probe = new Float32Array(f.w * f.h);
  for (const p of pins) {
    probe.fill(0);
    applyPins(f, probe, [p]);
    const cells: [number, number, Target['want']][] = [];
    for (let j = 0; j < f.h; j += stride) for (let i = 0; i < f.w; i += stride) {
      const v = probe[j * f.w + i];
      if (v === 0 || Math.abs(v) <= 1) continue;
      if (frame === 'northshore') { const [lo, la] = f.toLL(f.x0 + i * f.dx, f.y0 + j * f.dy); if (!inNs(lo, la)) continue; }
      cells.push([i, j, v > 0 ? 'land' : 'sea']);
    }
    if (!cells.length) continue;
    const seaCells = cells.filter((c) => c[2] === 'sea').length;
    // the chapter 29 battle map (Northshore, its seas, the peninsula, Thaldur, Northglade's island): its own category
    const mid = cells[cells.length >> 1], [mlo, mla] = f.toLL(f.x0 + mid[0] * f.dx, f.y0 + mid[1] * f.dy);
    const inBattle = frame !== 'dzego' && inNs(mlo, mla);
    const cat: Group['cat'] = inBattle ? 'battle' : p.kind === 'land-disk' ? 'places' : seaCells > cells.length / 2 ? 'sea' : 'land';
    const g = groups.push({ name: p.why, weight: cat === 'places' ? 1 : p.provenance === 'book' ? 2 : 1, kind: 'frac', provenance: p.provenance, cat }) - 1;
    const step = Math.max(1, Math.floor(cells.length / (inBattle ? cap * 3 : cap)));
    for (let n = 0; n < cells.length; n += step) add(g, f.x0 + cells[n][0] * f.dx, f.y0 + cells[n][1] * f.dy, cells[n][2]);
  }
  if (frame === 'region') {
    // (Northshore's pins are scored again here, lightly: its own patch replaces this window's terrain there)
    // the border river (its course is ours): land along it, sea at its mouth
    const river = regionPins().find((p) => p.kind === 'river');
    if (river && river.kind === 'river') {
      const g = groups.push({ name: 'the river on the Veridia–Arctic line runs over land to the sea', weight: 2, kind: 'frac', provenance: 'book', cat: 'land' }) - 1;
      const path2 = river.path;
      for (let s = 0; s < path2.length - 1; s++) for (let t = 0; t < 8; t++) { const a = path2[s], b2 = path2[s + 1]; add(g, a[0] + ((b2[0] - a[0]) * t) / 8, a[1] + ((b2[1] - a[1]) * t) / 8, s === path2.length - 2 && t > 5 ? 'sea' : 'land'); }
    }
    // Meldan on a low plain (green, temperate: below about 350 m), within 80 km
    const m = REGION.fromLL(8, 52);
    const gm = groups.push({ name: 'Meldan on a low plain', weight: 2, kind: 'frac', provenance: 'book', cat: 'places' }) - 1;
    for (let a = 0; a < 24; a++) for (const r of [0, 30, 60, 80]) { const [lo, la] = [m[0] + r * Math.cos((a * Math.PI) / 12), m[1] + r * Math.sin((a * Math.PI) / 12)]; add(gm, lo, la, 'low'); if (r === 0) break; }
    // Redshire's red, snowy mountains: some peak of 1,800 m within 90 km of the range we placed
    const gr = groups.push({ name: 'Redshire has snowy mountains (a peak of 1,800 m)', weight: 2, kind: 'max1800', provenance: 'book', cat: 'relief' }) - 1;
    const line = ([[20, 140], [120, 100], [220, 40]] as XY[]).map(ucLL).map(([lo, la]) => REGION.fromLL(lo, la));
    for (let s = 0; s < line.length - 1; s++) for (let t = 0; t <= 10; t++) for (const off of [-60, -30, 0, 30, 60]) add(gr, line[s][0] + ((line[s + 1][0] - line[s][0]) * t) / 10, line[s][1] + ((line[s + 1][1] - line[s][1]) * t) / 10 + off, 'high900');
    // the United Cities' continent has many mountains: at least 3% of it above 900 m
    const uc = pts(place(W, 'uc_continent')).map(ucLL).map(([lo, la]) => REGION.fromLL(lo, la));
    const gu = groups.push({ name: 'the United Cities\' continent has many mountains', weight: 1, kind: 'frac03', provenance: 'book', cat: 'relief' }) - 1;
    for (let j = 0; j < f.h; j += stride * 3) for (let i = 0; i < f.w; i += stride * 3) { const q: XY = [f.x0 + i * f.dx, f.y0 + j * f.dy]; if (pointInPoly(q[0], q[1], uc)) add(gu, q[0], q[1], 'high900'); }
  } else {
    // Dzego is hilly: at least 30% of its land above 300 m
    const gh = groups.push({ name: 'Dzego is hilly (mountain pyramids)', weight: 2, kind: 'atleast03', provenance: 'book', cat: 'relief' }) - 1;
    for (let j = 0; j < f.h; j += stride * 3) for (let i = 0; i < f.w; i += stride * 3) add(gh, f.x0 + i * f.dx, f.y0 + j * f.dy, 'high900');
    // a country with coasts, as v4 drew it: between 35% and 80% of the frame is land (ours)
    const gc = groups.push({ name: 'Dzego has coasts: 35–80% of the frame is land', weight: 1, kind: 'landshare', provenance: 'placed by us', cat: 'relief' }) - 1;
    for (let j = 0; j < f.h; j += stride * 3) for (let i = 0; i < f.w; i += stride * 3) add(gc, f.x0 + i * f.dx, f.y0 + j * f.dy, 'high900');
  }
  return { targets, groups };
}

/** Score one placement: the weighted share of the book's constraints the real terrain already meets. */
function scoreXf(frame: FrameName, xf: Xf, T: { targets: Target[]; groups: Group[] }, grid: Grid16, detail = false) {
  const n = T.groups.length, ok = new Float64Array(n), cnt = new Float64Array(n), mx = new Float64Array(n).fill(-1e9), hi300 = new Float64Array(n), land = new Float64Array(n);
  const p1 = rad(xf.lat), sp1 = Math.sin(p1), cp1 = Math.cos(p1), th = rad(xf.rot);
  let placesOn = 0, placesN = 0, bSea = 0, bSeaN = 0, bLand = 0, bLandN = 0;
  for (const t of T.targets) {
    const b = (xf.mirror ? -t.b : t.b) + th;
    const sd = Math.sin(t.d), cd = Math.cos(t.d);
    const sp2 = sp1 * cd + cp1 * sd * Math.cos(b);
    const lat = deg(Math.asin(sp2));
    const lon = xf.lon + deg(Math.atan2(Math.sin(b) * sd * cp1, cd - sp1 * sp2));
    const z = sampleGrid(grid, lon, lat);
    const g = t.group;
    cnt[g]++;
    if (T.groups[g].cat === 'battle') { if (t.want === 'sea') { bSeaN++; if (z < 0) bSea++; } else if (t.want === 'land') { bLandN++; if (z >= 0) bLand++; } }
    if (t.want === 'land') ok[g] += z >= 0 ? 1 : 0;
    else if (t.want === 'sea') ok[g] += z < 0 ? 1 : 0;
    else if (t.want === 'low') ok[g] += z >= 0 && z < 350 ? 1 : 0;
    else { mx[g] = Math.max(mx[g], z); if (z >= 0) { land[g]++; if (z >= 300) hi300[g]++; } if (z >= 900) ok[g]++; }
  }
  const cs = { battle: 0, sea: 0, land: 0, places: 0, relief: 0 }, cw = { battle: 0, sea: 0, land: 0, places: 0, relief: 0 };
  const parts: Record<string, number> = {};
  for (let g = 0; g < n; g++) {
    const G = T.groups[g];
    let f = 0;
    if (G.kind === 'frac') f = cnt[g] ? ok[g] / cnt[g] : 0;
    else if (G.kind === 'max1800') f = Math.max(0, Math.min(1, (mx[g] - 600) / 1200));
    else if (G.kind === 'frac03') f = cnt[g] ? Math.min(1, ok[g] / cnt[g] / 0.03) : 0;
    else if (G.kind === 'atleast03') f = land[g] ? Math.min(1, hi300[g] / land[g] / 0.4) * Math.min(1, land[g] / cnt[g] / 0.35) : 0;
    else { const share = cnt[g] ? land[g] / cnt[g] : 0; f = share < 0.35 ? share / 0.35 : share > 0.8 ? Math.max(0, 1 - (share - 0.8) / 0.2) : 1; }
    cs[G.cat] += G.weight * f;
    cw[G.cat] += G.weight;
    if (G.cat === 'places') { placesN++; if (f >= 0.5) placesOn++; }
    if (detail) parts[G.name] = Number(f.toFixed(3));
  }
  // seas, land and relief each count for a fixed share, so a window with no sea cannot win on its many land pins;
  // a window that misses most of the book's seas is halved
  // named places on real land count as much as the book's seas, so no city ends up a pinned speck in open water
  // the battle map's coasts and the named places on real land weigh most; places count one each, and a placement with
  // fewer than 80% of them on real land is cut to 40%
  const share = frame === 'northshore' ? { battle: 1, places: 0, sea: 0, land: 0, relief: 0 } : { battle: 0.05, places: 0.35, sea: 0.15, land: 0.15, relief: 0.3 };
  let fit = 0, used = 0;
  // the battle map counts its seas and its land half and half, whatever the number of pins on each
  if (bSeaN && bLandN) { cs.battle = 0.5 * (bSea / bSeaN) + 0.5 * (bLand / bLandN); cw.battle = 1; }
  for (const k of ['battle', 'places', 'sea', 'land', 'relief'] as const) if (cw[k]) { fit += share[k] * (cs[k] / cw[k]); used += share[k]; }
  fit /= used;
  if (placesN && placesOn / placesN < 0.8) fit *= 0.4;
  if (cw.sea && cs.sea / cw.sea < 0.5) fit *= 0.5;
  if (frame === 'northshore' && bSeaN && bSea / bSeaN < 0.5) fit *= 0.5;
  const mg = T.groups.findIndex((G) => G.name === 'Meldan on a low plain');
  if (mg >= 0 && cnt[mg] && ok[mg] / cnt[mg] < 0.7) fit *= 0.6;
  if (detail) { for (const k of ['battle', 'places', 'sea', 'land', 'relief'] as const) if (cw[k]) parts[`(${k}, overall)`] = Number((cs[k] / cw[k]).toFixed(3)); if (placesN) parts['(places on real land)'] = Number((placesOn / placesN).toFixed(3)); }
  const fam = famousIn(frame, xf);
  const score = fit - penalty(xf, fam);
  return detail ? { score, fit, famous: fam.map((x) => x.name), parts } : { score, fit, famous: [] as string[], parts };
}

// ---- the search
type Cand = { xf: Xf; score: number; fit: number; famous: string[]; parts: Record<string, number> };
function search(frame: FrameName, top: number): Cand[] {
  const fine: Grid16 = { data: etopo(), w: ETOPO.w, h: ETOPO.h, res: ETOPO.res };
  const coarse = coarsen(fine, 6); // 6 arc-minutes, about 11 km
  const Tc = targetsFor(frame, 10, 30), Tf = targetsFor(frame, 4, 120);
  console.log(`${frame}: ${Tc.targets.length} coarse targets, ${Tf.targets.length} fine targets, ${Tc.groups.length} constraint groups`);
  const keep: Cand[] = [];
  let worst = -Infinity, tried = 0;
  const t0 = Date.now();
  for (let lat = -58; lat <= 76; lat += 1.5) {
    const step = Math.min(6, 1.5 / Math.max(0.25, Math.cos(rad(lat))));
    for (let lon = -180; lon < 180; lon += step)
      for (let rot = 0; rot < 360; rot += 15)
        for (const mirror of [false, true]) {
          const xf = { lon, lat, rot, mirror };
          const r = scoreXf(frame, xf, Tc, coarse);
          tried++;
          if (keep.length < 4000 || r.score > worst) {
            keep.push({ xf, ...r });
            if (keep.length > 6000) { keep.sort((a, b) => b.score - a.score); keep.length = 4000; worst = keep[keep.length - 1].score; }
          }
        }
    if (Math.round(lat * 2) % 20 === 0) console.log(`  lat ${lat}: ${tried} placements, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  keep.sort((a, b) => b.score - a.score);
  keep.length = Math.min(keep.length, 1500);
  // refine on the 1-arc-minute grid with every target, and nudge the centre by half a degree
  const refined: Cand[] = [];
  for (const c of keep) {
    let best = { xf: c.xf, ...scoreXf(frame, c.xf, Tf, fine, true) };
    for (const dla of [-0.5, 0, 0.5]) for (const dlo of [-0.5, 0, 0.5]) {
      if (!dla && !dlo) continue;
      const xf = { ...c.xf, lat: c.xf.lat + dla, lon: c.xf.lon + dlo / Math.max(0.3, Math.cos(rad(c.xf.lat))) };
      const r = scoreXf(frame, xf, Tf, fine, true);
      if (r.score > best.score) best = { xf, ...r };
    }
    refined.push(best);
  }
  refined.sort((a, b) => b.score - a.score);
  // distinct places: source centres at least 1,500 km apart
  const picked: Cand[] = [];
  for (const c of refined) {
    if (picked.some((p) => polar(p.xf.lon, p.xf.lat, c.xf.lon, c.xf.lat)[0] * RE < (frame === 'northshore' ? 600 : 1500))) continue;
    picked.push(c);
    if (picked.length >= Math.max(top, 30)) break;
  }
  console.log(`${frame}: ${tried} placements scored in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return picked;
}

// ---- building a frame from real heights
function realFrame(frame: FrameName, xf: Xf): Float32Array {
  const f: Frame = frame === 'dzego' ? DZEGO : REGION;
  const g: Grid16 = { data: etopo(), w: ETOPO.w, h: ETOPO.h, res: ETOPO.res };
  const z = new Float32Array(f.w * f.h);
  for (let k = 0; k < z.length; k++) {
    const [x, y] = cxy(f, k);
    const [lo, la] = f.toLL(x, y);
    const [slo, sla] = toSource(frame, xf, lo, la);
    z[k] = sampleGrid(g, slo, sla);
  }
  return z;
}
/** v4's finishing steps on real heights: soft and hard pins, a light erosion so the pins settle in,
 * the book's river carved, lakes and rivers from the real drainage, climate from the book's latitudes.
 * Unlike v4 the seabed is left as measured (no smoothing, no added noise). */
function finishReal(g: Frame | CityFrame, z: Float32Array, pins: Pin[], seed: number, droplets: number, hScale: number, lake: [number, number, number?, number?, number?], riverKm2: number, latOf: (y: number) => number, toLL: (x: number, y: number) => XY, renderPx: number, noRiver?: (x: number, y: number) => boolean, noLake?: (x: number, y: number) => boolean): FrameRun {
  // where the book's shape and the real terrain disagree, bring the real terrain near sea level first, so the
  // pins reshape a coast rather than build a wall out of deep water (or cut a trench through mountains)
  const wantLand = new Float32Array(z.length), wantSea = new Float32Array(z.length);
  applyPins(g, wantLand, pins.filter((p) => p.kind === 'land' || p.kind === 'land-disk' || p.kind === 'land-box'));
  applyPins(g, wantSea, pins.filter((p) => p.kind === 'sea' || p.kind === 'sea-poly' || p.kind === 'sea-ring'));
  for (let k = 0; k < z.length; k++) { if (wantLand[k] > 0) z[k] = Math.max(z[k], -40); if (wantSea[k] < 0) z[k] = Math.min(z[k], 40); }
  const before = Float32Array.from(z);
  softPins(g, z, pins);
  // soft pulls only where they are needed: real land in a sea's band stays as it was if already low, real sea in a land band likewise
  for (let k = 0; k < z.length; k++) { if (z[k] < before[k] && before[k] < -30) z[k] = before[k]; if (z[k] > before[k] && before[k] > 30) z[k] = before[k]; }
  applyPins(g, z, pins);
  // where a pin had to make land out of real sea, give it gentle hills rather than a flat plate
  const hills = new Noise2(seed + 4242);
  for (let k = 0; k < z.length; k++) if (before[k] < 0 && z[k] >= 0 && wantLand[k] > 0) { const [x, y] = cxy(g, k); z[k] += Math.max(0, 140 * (0.45 + hills.fbm(x / 70, y / 70, 4)) + 35 * hills.ridged(x / 18, y / 18, 3)); }
  if (droplets) erodeDroplets(g, z, droplets, seed, hScale);
  applyPins(g, z, pins);
  // where a pin made sea out of real land (or pulled the real sea about), give it a natural seabed: shallow at the
  // coast, deepening over about 60 km, with some relief; this also removes the soft pins' trenches along the bands
  {
    const made = new Uint8Array(z.length);
    for (let k = 0; k < z.length; k++) if (z[k] < 0 && (before[k] >= 0 || wantSea[k] < 0)) made[k] = 1;
    const dist = new Float32Array(z.length).fill(Infinity), queue: number[] = [];
    for (let k = 0; k < z.length; k++) if (z[k] >= 0) { dist[k] = 0; queue.push(k); }
    for (let qi = 0; qi < queue.length; qi++) {
      const k = queue[qi], i = k % g.w, j = (k / g.w) | 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= g.w || jj >= g.h) continue; const n = jj * g.w + ii; if (dist[n] === Infinity) { dist[n] = dist[k] + 1; queue.push(n); } }
    }
    const bed = new Noise2(seed + 777);
    for (let k = 0; k < z.length; k++) if (made[k]) { const [x, y] = cxy(g, k), dk = dist[k] * g.dx; const natural = -(6 + 150 * smooth(dk / 60)) * (0.85 + 0.3 * (0.5 + 0.5 * bed.fbm(x / 40, y / 40, 3))); z[k] = before[k] < 0 ? Math.min(-2, before[k]) : Math.min(-2, natural); } // real sea keeps its real depth
  }
  dropSpecks(g, z, pins, 80);
  const carved = carve(g, z, pins);
  const hydro = hydrology(g, z, lake[0], lake[1], riverKm2, noRiver, noLake, carved, lake[2] ?? 10, lake[3] ?? Infinity, lake[4] ?? 0);
  const clim = climate(g, z, hydro.lakes, latOf);
  for (const p of pins) if (p.kind === 'cover') for (let k = 0; k < z.length; k++) { const q = cxy(g, k); if (z[k] >= 0 && !hydro.lakes[k] && pointInPoly(q[0], q[1], p.poly)) clim.biome[k] = B(p.biome as (typeof BIOMES)[number]); }
  return { g, z, hydro, clim, pins, latOf, toLL, render: renderPx, carved };
}

// ---- city patches: lone hills
/** Lone hills that are famous or sacred, never used. */
const EXCLUDED_HILLS: [string, number, number][] = [
  ['Uluru', 131.036, -25.345], ['Kata Tjuta', 130.73, -25.3], ['Sugarloaf Mountain, Rio de Janeiro', -43.157, -22.949], ['Table Mountain', 18.403, -33.963],
  ['Bear Butte', -103.45, 44.476], ['Devils Tower', -104.715, 44.59], ['Stone Mountain', -84.145, 33.806], ['Sigiriya', 80.76, 7.957],
  ['Mount Tabor', 35.39, 32.687], ['Ayers Rock region', 131, -25.3], ['Mount Kailash', 81.31, 31.067], ['Mount Fuji', 138.727, 35.361],
];
type Hill = { lon: number; lat: number; top: number; plain: number; prominence: number; ringRange: number; lowNear: number; lowLon?: number; lowLat?: number };
/** Pafogai Du: flat lowland (the grid) with steep high ground rising right behind it in one direction. */
function findSteepBehind(): Hill[] {
  const e = etopo(), w = ETOPO.w, out: Hill[] = [];
  const dirs = Array.from({ length: 8 }, (_, t) => [Math.cos((t * Math.PI) / 4), Math.sin((t * Math.PI) / 4)]);
  for (let j = 34 * 60; j < 146 * 60; j++) {
    const lat = 90 - (j + 0.5) / 60, cl = Math.cos(rad(lat));
    for (let i = 4; i < w - 4; i += 1) {
      const h = e[j * w + i];
      if (h < 1 || h > 120) continue;
      // the grid: this pixel and its neighbours within about 2 km, flat
      let lo = h, hi = h;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const v = e[(j + b) * w + i + a]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (lo < 0 || hi - lo > 25) continue;
      for (const [dx, dy] of dirs) {
        // high ground 2 to 3 pixels (3.5 to 5.5 km) away in this direction
        let top = -Infinity, at2: XY = [0, 0];
        for (const r of [2, 3]) { const ii = i + Math.round((r * dx) / cl), jj = j + Math.round(r * dy); const v = e[jj * w + ii]; if (v > top) { top = v; at2 = [ii, jj]; } }
        const rise = top - h;
        if (rise < 380 || rise > 800) continue;
        // and the side away from the hill stays low
        const back = e[(j - Math.round(2 * dy)) * w + i - Math.round((2 * dx) / cl)];
        if (back < 0 || back - h > 40) continue;
        out.push({ lon: -180 + (at2[0] + 0.5) / 60, lat: 90 - (at2[1] + 0.5) / 60, top, plain: h, prominence: rise, ringRange: hi - lo, lowNear: back, lowLon: -180 + (i + 0.5) / 60, lowLat: lat });
        break;
      }
    }
  }
  const good = out.filter((hh) => !EXCLUDED_HILLS.some(([, lo, la]) => Math.abs(lo - hh.lon) < 0.3 && Math.abs(la - hh.lat) < 0.3));
  good.sort((a, b) => Math.abs(a.prominence - 520) + a.plain - (Math.abs(b.prominence - 520) + b.plain));
  const picked: Hill[] = [];
  for (const hh of good) { if (picked.some((p) => Math.abs(p.lat - hh.lat) < 1 && Math.abs(p.lon - hh.lon) < 1)) continue; picked.push(hh); if (picked.length >= 40) break; }
  return picked;
}
/** Screen ETOPO's 1-arc-minute grid (about 1.8 km) for lone hills; the city search then checks each on SRTM. */
function findHills(kind: 'meldan' | 'pafogai'): Hill[] {
  const e = etopo(), w = ETOPO.w;
  const out: Hill[] = [];
  const ring: number[] = [];
  for (let j = 30 * 60 + 5; j < 146 * 60 - 5; j++) {
    const lat = 90 - (j + 0.5) / 60;
    const cl = Math.cos(rad(lat));
    const rx = Math.max(3, Math.round(4 / cl));
    for (let i = rx + 1; i < w - rx - 1; i++) {
      const h = e[j * w + i];
      if (h < 60 || h > 1600) continue;
      // a local maximum within about 3.5 km
      let isMax = true;
      for (let b = -2; b <= 2 && isMax; b++) for (let a = -2; a <= 2; a++) if ((a || b) && e[(j + b) * w + i + a] > h) { isMax = false; break; }
      if (!isMax) continue;
      ring.length = 0;
      let low = Infinity;
      for (let t = 0; t < 24; t++) {
        const an = (t * Math.PI) / 12;
        for (const r of [3, 4, 5]) { const v = e[(j + Math.round(r * Math.sin(an))) * w + i + Math.round((r * Math.cos(an)) / cl)]; ring.push(v); low = Math.min(low, v); }
      }
      ring.sort((x, y) => x - y);
      const med = ring[ring.length >> 1], range = ring[Math.floor(ring.length * 0.9)] - ring[Math.floor(ring.length * 0.1)], prom = h - med;
      if (low < 0) continue; // the city frame stays on land
      if (range < 3) continue; // a ring this flat is a lake's surface, not a plain
      if (kind === 'meldan' ? prom < 150 || prom > 430 || range > 70 || med > 450 : prom < 280 || prom > 760 || med > 300) continue;
      out.push({ lon: -180 + (i + 0.5) / 60, lat, top: h, plain: med, prominence: prom, ringRange: range, lowNear: low });
    }
  }
  const good = out.filter((hh) => !EXCLUDED_HILLS.some(([, lo, la]) => Math.abs(lo - hh.lon) < 0.3 && Math.abs(la - hh.lat) < 0.3));
  const target = kind === 'meldan' ? 260 : 480;
  good.sort((a, b) => (kind === 'meldan' ? a.ringRange + Math.abs(a.prominence - target) * 0.3 - (b.ringRange + Math.abs(b.prominence - target) * 0.3) : Math.abs(a.prominence - target) + a.lowNear * 0.5 - (Math.abs(b.prominence - target) + b.lowNear * 0.5)));
  const picked: Hill[] = [];
  for (const hh of good) { if (picked.some((p) => Math.abs(p.lat - hh.lat) < 1 && Math.abs(p.lon - hh.lon) < 1)) continue; picked.push(hh); if (picked.length >= 40) break; }
  return picked;
}

// ---- SRTM GL1 (1 arc-second), via OpenTopography's public bucket, cached in data-cache/srtm
const SRTM_URL = 'https://opentopography.s3.sdsc.edu/raster/SRTM_GL1/SRTM_GL1_srtm';
const tileName = (lon: number, lat: number) => { const la = Math.floor(lat), lo = Math.floor(lon); return `${la >= 0 ? 'N' : 'S'}${String(Math.abs(la)).padStart(2, '0')}${lo >= 0 ? 'E' : 'W'}${String(Math.abs(lo)).padStart(3, '0')}`; };
const tiles = new Map<string, { w: number; h: number; geo: [number, number, number, number]; data: Float32Array } | null>();
function srtmTile(name: string) {
  if (tiles.has(name)) return tiles.get(name)!;
  const file = path.join(ROOT, CACHE, 'srtm', `${name}.tif`);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    console.log(`  fetching SRTM ${name}`);
    try { execFileSync('curl', ['-sf', '-m', '1800', '-o', file, `${SRTM_URL}/${name}.tif`]); } catch { tiles.set(name, null); return null; }
  }
  const r = readGeoTiff(file);
  const t = { w: r.w, h: r.h, geo: r.geo, data: r.data };
  for (let k = 0; k < t.data.length; k++) if (r.nodata !== null && t.data[k] === r.nodata) t.data[k] = NaN;
  tiles.set(name, t);
  return t;
}
/** SRTM height at a point (bilinear), NaN in voids or off the data. */
function srtmAt(lon: number, lat: number): number {
  const t = srtmTile(tileName(lon, lat));
  if (!t) return NaN;
  const x = (lon - t.geo[0]) / t.geo[2] - 0.5, y = (t.geo[1] - lat) / t.geo[3] - 0.5;
  const i0 = Math.max(0, Math.min(t.w - 2, Math.floor(x))), j0 = Math.max(0, Math.min(t.h - 2, Math.floor(y))), u = x - i0, v = y - j0, d = t.data;
  return d[j0 * t.w + i0] * (1 - u) * (1 - v) + d[j0 * t.w + i0 + 1] * u * (1 - v) + d[(j0 + 1) * t.w + i0] * (1 - u) * v + d[(j0 + 1) * t.w + i0 + 1] * u * v;
}
type CityXf = { lon: number; lat: number; rot: number; mirror: boolean; vscale: number; hscale: number; x0: number; y0: number };
/** City-frame km (x east, y north) to a real point: the frame's (x0, y0) sits on (lon, lat), turned and possibly mirrored. */
function citySource(c: CityXf, x: number, y: number): XY {
  const k = c.hscale ?? 1, dx = k * (c.mirror ? -1 : 1) * (x - c.x0), dy = k * (y - c.y0), th = rad(c.rot);
  const e = dx * Math.cos(th) + dy * Math.sin(th), n = -dx * Math.sin(th) + dy * Math.cos(th);
  return [c.lon + e / (111.32 * Math.cos(rad(c.lat))), c.lat + n / 110.57];
}
/** Sample a city frame from SRTM, smoothed (SRTM carries a few metres of noise per pixel), heights
 * scaled about the plain by c.vscale. Returns the heights and the plain's level. */
function cityHeights(cf: CityFrame, c: CityXf, stride = 1, cross = true): { z: Float32Array; w: number; h: number; plain: number } {
  const w = Math.ceil(cf.w / stride), h = Math.ceil(cf.h / stride), z = new Float32Array(w * h);
  const dk = cf.dx * stride;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = cf.x0 + i * dk, y = cf.y0 + j * dk;
    // average a small cross of samples about 30 m apart (a light smoothing)
    let sum = 0, n = 0;
    for (const [ox, oy] of cross ? [[0, 0], [0.03, 0], [-0.03, 0], [0, 0.03], [0, -0.03]] : [[0, 0]]) { const [lo, la] = citySource(c, x + ox, y + oy); const v = srtmAt(lo, la); if (!Number.isNaN(v)) { sum += v; n++; } }
    z[j * w + i] = n ? sum / n : NaN;
  }
  // fill voids from neighbours
  for (let pass = 0; pass < 20; pass++) { let left = 0; for (let k = 0; k < z.length; k++) if (Number.isNaN(z[k])) { const i = k % w, j = (k / w) | 0; let s2 = 0, n2 = 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < w && jj < h && !Number.isNaN(z[jj * w + ii])) { s2 += z[jj * w + ii]; n2++; } } if (n2) z[k] = s2 / n2; else left++; } if (!left) break; }
  // smoothing in km, the same at any stride (two box passes of about 150 m): SRTM carries a few metres of
  // noise per pixel, which at 27 m cells would read as slopes of more than 5% on flat ground
  const r = Math.max(1, Math.round(0.15 / dk));
  for (let pass = 0; pass < 2; pass++) {
    const t = new Float32Array(z.length);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s2 = 0, n2 = 0; for (let a = -r; a <= r; a++) { const ii = i + a; if (ii >= 0 && ii < w) { s2 += z[j * w + ii]; n2++; } } t[j * w + i] = s2 / n2; }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s2 = 0, n2 = 0; for (let b = -r; b <= r; b++) { const jj = j + b; if (jj >= 0 && jj < h) { s2 += t[jj * w + i]; n2++; } } z[j * w + i] = s2 / n2; }
  }
  // the plain: the median height between 3 and 10 km from the frame's anchor
  const ring: number[] = [];
  for (let k = 0; k < z.length; k++) { const x = cf.x0 + (k % w) * dk, y = cf.y0 + ((k / w) | 0) * dk, rr = Math.hypot(x - c.x0, y - c.y0); if (rr > 3 && rr < 10) ring.push(z[k]); }
  ring.sort((a, b) => a - b);
  const plain = ring[ring.length >> 1] ?? 0;
  for (let k = 0; k < z.length; k++) z[k] = plain + (z[k] - plain) * c.vscale;
  return { z, w, h, plain };
}
/** How well a Meldan placement already meets the city checks (before any pin). */
function meldanFit(c: CityXf, stride = 6) {
  const H = cityHeights(MELDAN, c, stride, false), dk = MELDAN.dx * stride;
  const at = (x: number, y: number) => { const i = Math.round((x - MELDAN.x0) / dk), j = Math.round((y - MELDAN.y0) / dk); return H.z[Math.max(0, Math.min(H.h - 1, j)) * H.w + Math.max(0, Math.min(H.w - 1, i))]; };
  let top = -Infinity, topAt: XY = [0, 0];
  for (let k = 0; k < H.z.length; k++) if (H.z[k] > top) { top = H.z[k]; topAt = [MELDAN.x0 + (k % H.w) * dk, MELDAN.y0 + ((k / H.w) | 0) * dk]; }
  const city = pts(place(maps.meldan, 'city'));
  let flat = 0, cells = 0;
  for (let j = 1; j < H.h - 1; j++) for (let i = 1; i < H.w - 1; i++) {
    const x = MELDAN.x0 + i * dk, y = MELDAN.y0 + j * dk;
    if (Math.hypot(x, y) <= 1.8 || !pointInPoly(x, y, city)) continue;
    const k = j * H.w + i;
    cells++;
    if (Math.hypot(H.z[k + 1] - H.z[k - 1], H.z[k + H.w] - H.z[k - H.w]) / (2 * dk * 1000) < 0.05) flat++;
  }
  const stair = at(0.1, -0.6) - at(0, -1.3), parl = at(...(place(maps.meldan, 'parliament').at as XY)) - H.plain;
  const okTop = Math.hypot(...topAt) < 0.3, okStair = stair >= 150 && stair <= 250, okParl = parl >= 25 && parl <= 60, flatF = cells ? flat / cells : 0;
  const score = (okTop ? 1 : 0) + (okStair ? 1 : Math.max(0, 1 - Math.abs(stair - 200) / 200)) + (okParl ? 1 : Math.max(0, 1 - Math.abs(parl - 42) / 60)) + Math.min(1, flatF / 0.9) * 1.5 - Math.abs(c.vscale - 1) - 0.5 * Math.abs(Math.log(c.hscale));
  return { score, top: top - H.plain, stair, parl, flat: flatF, okTop, okStair, okParl, plain: H.plain };
}
/** Pafogai Du: a flat, low grid (0–3.2 km) with a massif behind it, its summit placed south of the pyramid. */
function pafogaiFit(c: CityXf, stride = 6) {
  const H = cityHeights(PAFOGAI, c, stride, false), dk = PAFOGAI.dx * stride;
  const at = (x: number, y: number) => { const i = Math.round((x - PAFOGAI.x0) / dk), j = Math.round((y - PAFOGAI.y0) / dk); return H.z[Math.max(0, Math.min(H.h - 1, j)) * H.w + Math.max(0, Math.min(H.w - 1, i))]; };
  const base = at(0, 0);
  const grid: number[] = [];
  for (let j = 0; j < H.h; j++) for (let i = 0; i < H.w; i++) { const x = PAFOGAI.x0 + i * dk, y = PAFOGAI.y0 + j * dk; if (x >= 0 && x <= 3.2 && y >= 0 && y <= 3.2) grid.push(H.z[j * H.w + i] - base); }
  grid.sort((a, b) => a - b);
  const spread = grid[Math.floor(grid.length * 0.95)] - grid[Math.floor(grid.length * 0.05)];
  let massif = -Infinity;
  for (let y = -3.6; y <= -1.4; y += 0.1) for (let x = 0.4; x <= 3.0; x += 0.1) massif = Math.max(massif, at(x, y) - base);
  const score = Math.max(0, 1 - spread / 60) * 2 + Math.max(0, 1 - Math.abs(massif - 480) / 300) * 2 - Math.abs(c.vscale - 1) - 0.5 * Math.abs(Math.log(c.hscale));
  return { score, spread, massif, base };
}
/** Try rotations (15° steps), mirroring and a small vertical scale for one hill. */
function placeCity(kind: 'meldan' | 'pafogai', hill: { lon: number; lat: number; lowLon?: number; lowLat?: number }) {
  // find the real summit within 2 km of the screened point
  let best = { lon: hill.lon, lat: hill.lat, z: -Infinity };
  if (kind === 'meldan') for (let a = -2; a <= 2; a += 0.05) for (let b = -2; b <= 2; b += 0.05) { const lo = hill.lon + a / (111.32 * Math.cos(rad(hill.lat))), la = hill.lat + b / 110.57, v = srtmAt(lo, la); if (v > best.z) best = { lon: lo, lat: la, z: v }; }
  let top: { c: CityXf; fit: ReturnType<typeof meldanFit> | ReturnType<typeof pafogaiFit> } | null = null;
  for (let rot = 0; rot < 360; rot += 15) for (const mirror of [false, true]) for (const vscale of [0.9, 1, 1.1, 1.2]) for (const hscale of [0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2]) {
    // Meldan: the summit at the centre. Pafogai Du: the grid's centre on the flat land, the high ground turned to lie behind the pyramid
    const c: CityXf = kind === 'meldan' ? { lon: best.lon, lat: best.lat, rot, mirror, vscale, hscale, x0: 0, y0: 0 } : { lon: hill.lowLon!, lat: hill.lowLat!, rot, mirror, vscale, hscale, x0: 1.6, y0: 1.6 };
    const fit = kind === 'meldan' ? meldanFit(c) : pafogaiFit(c);
    if (!top || fit.score > top.fit.score) top = { c, fit };
  }
  return top!;
}

/** v4's region pins, with one change for real terrain: the battle map's dark ground is held only inside an irregular
 * inset 26 to 100 km from the drawing's border (the border is where the picture stops, not a coast), so where the real
 * terrain beyond is sea the land meets it along a natural coast rather than a square edge. */
function regionPinsV5(): Pin[] {
  const nz = new Noise2(7151);
  // the battle map's seas run on past its north and south borders as well as its east one (v4 already carries them
  // 25 px past the east border): border vertices move 25 px outward, the drawn coast keeps its end points
  const toNs = (q: XY): XY => { const [lo, la] = REGION.toLL(q[0], q[1]); return llToFrame('northshore', lo, la); };
  const fromNs = (q: XY): XY => { const [lo, la] = nsLL(q); return REGION.fromLL(lo, la); };
  const extend = (p: Pin): Pin => {
    if (p.kind !== 'sea' || !p.open) return p;
    const ns = p.poly.map(toNs), out: XY[] = [], open: boolean[] = [];
    const onY = (q: XY) => q[1] < 3 ? -25 : q[1] > 237 ? 265 : null;
    ns.forEach((q, i) => {
      const y2 = onY(q), prev = ns[(i + ns.length - 1) % ns.length], next = ns[(i + 1) % ns.length];
      if (y2 === null) { out.push(q); open.push(p.open![i]); return; }
      if (onY(prev) === null) { out.push(q); open.push(true); }
      out.push([q[0], y2]); open.push(onY(next) !== null || p.open![i]);
      if (onY(next) === null) { out.push(q); open.push(p.open![i]); }
    });
    return { ...p, poly: out.map(fromNs), open };
  };
  const all = regionPins().map(extend);
  const attach = all.find((p) => p.kind === 'land' && /attached to Northshore/.test(p.why));
  const join: XY = attach && 'poly' in attach ? [attach.poly.reduce((a, q) => a + q[0], 0) / attach.poly.length, attach.poly.reduce((a, q) => a + q[1], 0) / attach.poly.length] : [0, 0];
  return all.map((p) => {
    if (p.kind !== 'land-box') return p;
    const c = p.poly, cx = c.reduce((a, q) => a + q[0], 0) / c.length, cy = c.reduce((a, q) => a + q[1], 0) / c.length;
    const out: XY[] = [];
    for (let e = 0; e < c.length; e++) {
      const a = c[e], b = c[(e + 1) % c.length];
      for (let t = 0; t < 24; t++) {
        const x = a[0] + ((b[0] - a[0]) * t) / 24, y = a[1] + ((b[1] - a[1]) * t) / 24;
        // km beyond the original 26 km inset; none where the peninsula joins Northshore, so it stays attached
        const len = Math.hypot(cx - x, cy - y), inset = 75 * (0.5 + 0.5 * nz.fbm(x / 90, y / 90, 3)) * smooth((kmDist(REGION, [x, y], join) - 40) / 50);
        out.push([x + ((cx - x) / len) * inset, y + ((cy - y) / len) * inset]);
      }
    }
    return { ...p, poly: out, why: `${p.why} (held inside an irregular inset from the drawing's border)` };
  }).flatMap((p, n) => (n === 0 ? [openSeaEast(), p] : [p]));
}
/** Thaldur is an island east of Northshore, and the peninsula dangles toward it: the sea east of the battle map is
 * open water around both (as the battle map shows), whatever the real patch has there. The peninsula's and Thaldur's
 * own land pins come after this one and keep their land. */
function openSeaEast(): Pin {
  // an irregular, rounded outline (not a box), so its edge reads as a coast where the real patch has land beyond it
  const nz = new Noise2(2718), out: XY[] = [];
  for (let t = 0; t < 72; t++) {
    const an = (t / 72) * 2 * Math.PI, r = 1 + 0.18 * nz.fbm(Math.cos(an) * 1.7 + 3, Math.sin(an) * 1.7 - 2, 3);
    // a half-ellipse east of the battle map's edge: its west side runs along the edge (x = 244)
    const x = 244 + Math.max(0, 235 * r * Math.cos(an)), y = 115 + 85 * r * Math.sin(an);
    out.push([x, y]);
  }
  const box = out.map((q) => { const [lo, la] = nsLL(q); return REGION.fromLL(lo, la); });
  return { kind: 'sea', poly: box, band: 25, depth: -80, why: 'Open water east of Northshore, around the peninsula and Thaldur (the battle map\'s seas run on past its edge)', provenance: 'placed by us', lines: ['wg-374', 'wg-375'] };
}

/** The book's Redshire has red mountains with snowy tops. Where the real relief along the range we placed (v4's spine)
 * peaks below 2,300 m, raise it by the shortfall along the range, fading over about 60 km. Returns the metres added. */
function raiseRedshire(z: Float32Array): number {
  const line = ([[20, 140], [120, 100], [220, 40]] as XY[]).map(ucLL).map(([lo, la]) => REGION.fromLL(lo, la));
  const dist = (q: XY) => { let d = Infinity; for (let s2 = 0; s2 < line.length - 1; s2++) { const a = line[s2], b = line[s2 + 1]; for (let t = 0; t <= 20; t++) d = Math.min(d, kmDist(REGION, q, [a[0] + ((b[0] - a[0]) * t) / 20, a[1] + ((b[1] - a[1]) * t) / 20])); } return d; };
  const near: number[] = [], dd: number[] = [];
  let mx = -Infinity;
  for (let k = 0; k < z.length; k++) { const q = cxy(REGION, k); if (Math.abs(q[0] - line[1][0]) > 400 || Math.abs(q[1] - line[1][1]) > 300) continue; const d = dist(q); if (d < 150) { near.push(k); dd.push(d); if (d < 60) mx = Math.max(mx, z[k]); } }
  const lift = Math.max(0, 2300 - mx);
  if (!lift) return 0;
  const nz = new Noise2(911);
  near.forEach((k, n) => { if (z[k] < 0) return; const q = cxy(REGION, k); z[k] = z[k] + lift * Math.exp(-((dd[n] / 60) ** 2)) * (0.75 + 0.5 * Math.max(0, nz.ridged(q[0] / 40, q[1] / 40, 4) - 0.2)); });
  return Math.round(lift);
}

/** Northshore's own real patch, feathered into the region: the battle map's core (and the peninsula, Thaldur and
 * Northglade's island) takes the patch; over about 220 km outside it, with an irregular edge, the two blend. */
function blendNorthshore(zr: Float32Array, zp: Float32Array) {
  const nz = new Noise2(3131);
  for (let k = 0; k < zr.length; k++) {
    const [x, y] = cxy(REGION, k);
    const [lo, la] = REGION.toLL(x, y);
    if (lo < nsBox[0] - 7 || lo > nsBox[2] + 7 || la < nsBox[1] - 4 || la > nsBox[3] + 4) continue;
    const [px, py] = llToFrame('northshore', lo, la);
    const out = Math.max(NS_CORE[0] - px, px - NS_CORE[2], NS_CORE[1] - py, py - NS_CORE[3], 0) * 2.6;
    const w = 1 - smooth((out + 90 * nz.fbm(x / 110, y / 110, 3)) / 220);
    if (w > 0) zr[k] = w * zp[k] + (1 - w) * zr[k];
  }
}

export { search, scoreXf, targetsFor, realFrame, finishReal, coarsen, findHills, placeCity, cityHeights, srtmTile, tileName, regionPinsV5 };

// ---- commands
const isMain = /terrain-v5\.ts$/.test(process.argv[1] ?? '');
const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')) as [string, string][]);
const step = isMain ? process.argv[2] : '';
if (isMain) mkdirSync(path.join(ROOT, REC), { recursive: true });

if (!isMain) {
  // imported
} else if (step === 'prepare') {
  const t0 = Date.now();
  const r = readGeoTiff(path.join(ROOT, ETOPO.tif));
  if (r.w !== ETOPO.w || r.h !== ETOPO.h) throw new Error(`unexpected size ${r.w}×${r.h}`);
  console.log('decoded', r.w, r.h, 'geo', r.geo, 'nodata', r.nodata, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const out = new Int16Array(r.w * r.h);
  let nod = 0, mn = Infinity, mxv = -Infinity;
  for (let k = 0; k < out.length; k++) {
    const v = r.data[k];
    if (r.nodata !== null && v === r.nodata) { nod++; out[k] = 0; continue; }
    out[k] = Math.max(-32000, Math.min(32000, Math.round(v)));
    if (v < mn) mn = v;
    if (v > mxv) mxv = v;
  }
  writeFileSync(path.join(ROOT, ETOPO.i16), Buffer.from(out.buffer));
  console.log(`wrote ${ETOPO.i16}: min ${mn.toFixed(0)} m, max ${mxv.toFixed(0)} m, ${nod} nodata`);
  // sanity: a few known heights
  const g: Grid16 = { data: out, w: ETOPO.w, h: ETOPO.h, res: ETOPO.res };
  for (const [name, lo, la] of [['Mount Everest area', 86.925, 27.988], ['Challenger Deep area', 142.2, 11.35], ['Dead Sea', 35.5, 31.5], ['Amsterdam', 4.9, 52.37]] as [string, number, number][]) console.log(`  ${name}: ${sampleGrid(g, lo, la).toFixed(0)} m`);
} else if (step === 'search') {
  const frame = (args.frame ?? 'region') as FrameName, top = Number(args.top ?? 5);
  const picked = search(frame, top);
  const file = path.join(ROOT, REC, `search-${frame}.json`);
  writeFileSync(file, JSON.stringify({
    made: new Date().toISOString(), code_version: codeVersion(), frame,
    method: 'Every source centre on a 1.5° grid (−58° to 76° latitude), every rotation in 15° steps, mirrored and not, at true scale; each placement scored by the weighted share of the book\'s constraints the real terrain already meets (each pin a group; book facts weigh twice what we placed), minus a penalty for famous coastlines in the frame. The best 1,500 are re-scored on the 1-arc-minute grid with denser targets and nudged by half a degree; the list keeps source centres at least 1,500 km apart.',
    candidates: picked.map((c, n) => ({ rank: n + 1, score: Number(c.score.toFixed(4)), fit: Number(c.fit.toFixed(4)), source_centre_lon_lat: [Number(c.xf.lon.toFixed(3)), Number(c.xf.lat.toFixed(3))], rotation_deg: c.xf.rot, mirrored: c.xf.mirror, scale: 1, famous_coastlines_in_frame: c.famous, constraint_fit: c.parts })),
  }, null, 2) + '\n');
  for (const [n, c] of picked.entries()) console.log(`#${n + 1} score ${c.score.toFixed(3)} fit ${c.fit.toFixed(3)} centre ${c.xf.lon.toFixed(2)}, ${c.xf.lat.toFixed(2)} rot ${c.xf.rot} ${c.xf.mirror ? 'mirrored' : ''} famous: ${c.famous.join(', ') || 'none'}`);
} else if (step === 'hills') {
  const res: Record<string, Hill[]> = { meldan: findHills('meldan'), pafogai: findSteepBehind() };
  writeFileSync(path.join(ROOT, REC, 'hills.json'), JSON.stringify({ made: new Date().toISOString(), note: 'Candidate lone hills screened on ETOPO 2022 at 1 arc-minute; each is checked on SRTM GL1 before use. Famous or sacred hills are excluded.', excluded: EXCLUDED_HILLS.map((x) => x[0]), ...res }, null, 2) + '\n');
  for (const k of ['meldan', 'pafogai']) { console.log(k); for (const hh of res[k].slice(0, 12)) console.log(`  ${hh.lon.toFixed(3)}, ${hh.lat.toFixed(3)} top ${hh.top} plain ${hh.plain} prominence ${hh.prominence} ring range ${hh.ringRange} low ${hh.lowNear}`); }
} else if (step === 'peek') {
  // raw real heights under each listed placement, before any pin (for the reviewer)
  const frame = (args.frame ?? 'region') as FrameName;
  const list = JSON.parse(readFileSync(path.join(ROOT, REC, `search-${frame}.json`), 'utf8')).candidates as { rank: number; source_centre_lon_lat: XY; rotation_deg: number; mirrored: boolean }[];
  const f: Frame = frame === 'dzego' ? DZEGO : REGION;
  // Northshore: only its box, at full resolution
  const [i0, j0, i1, j1] = frame === 'northshore' ? (() => { const a = f.fromLL(nsBox[0], nsBox[1]), b2 = f.fromLL(nsBox[2], nsBox[3]); return [Math.floor(a[0] / f.dx), Math.floor(a[1] / f.dy), Math.ceil(b2[0] / f.dx), Math.ceil(b2[1] / f.dy)]; })() : [0, 0, f.w, f.h];
  const S = frame === 'northshore' ? 1 : 3, w = Math.floor((i1 - i0) / S), h = Math.floor((j1 - j0) / S);
  const g: Grid16 = { data: etopo(), w: ETOPO.w, h: ETOPO.h, res: ETOPO.res };
  for (const c of list.slice(0, Number(args.n ?? 10))) {
    const xf: Xf = { lon: c.source_centre_lon_lat[0], lat: c.source_centre_lon_lat[1], rot: c.rotation_deg, mirror: c.mirrored };
    const z = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const [lo, la] = f.toLL(f.x0 + (i0 + i * S) * f.dx, f.y0 + (j0 + j * S) * f.dy); const [a2, b2] = toSource(frame, xf, lo, la); z[j * w + i] = sampleGrid(g, a2, b2); }
    const img = newRGBA(w, h);
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
      const k = j * w + i, v = z[k], sh = Math.max(0.35, Math.min(1.25, 0.85 + (Math.max(0, z[k - 1]) - Math.max(0, z[k + 1]) + Math.max(0, z[k + w]) - Math.max(0, z[k - w])) / 900));
      const col = v < 0 ? [70 + 90 * Math.max(0, 1 + v / 4000), 110 + 80 * Math.max(0, 1 + v / 4000), 150 + 50 * Math.max(0, 1 + v / 4000)] : v < 300 ? [150, 170, 120] : v < 1200 ? [170, 160, 120] : v < 2500 ? [160, 140, 120] : [235, 235, 235];
      const o = ((h - 1 - j) * w + i) * 4;
      img.px[o] = v < 0 ? col[0] : col[0] * sh; img.px[o + 1] = v < 0 ? col[1] : col[1] * sh; img.px[o + 2] = v < 0 ? col[2] : col[2] * sh; img.px[o + 3] = 255;
    }
    writeFileSync(`/tmp/geo/peek-${frame}-${c.rank}.png`, rgbPng(img));
  }
  console.log('peeks in /tmp/geo');
} else if (step === 'city') {
  const kind = (args.kind ?? 'meldan') as 'meldan' | 'pafogai', n = Number(args.n ?? 4);
  const hills = JSON.parse(readFileSync(path.join(ROOT, REC, 'hills.json'), 'utf8'))[kind] as Hill[];
  const results: unknown[] = [];
  for (const hill of hills.slice(0, n)) {
    const t0 = Date.now();
    const r = placeCity(kind, hill);
    results.push({ screened: hill, placement: r.c, fit: r.fit });
    console.log(`${kind} ${hill.lon.toFixed(3)}, ${hill.lat.toFixed(3)}: score ${r.fit.score.toFixed(2)} rot ${r.c.rot}${r.c.mirror ? ' mirrored' : ''} vscale ${r.c.vscale} hscale ${r.c.hscale}`, JSON.stringify(r.fit, (k, v) => (typeof v === 'number' ? Number(v.toFixed(2)) : v)), `${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  writeFileSync(path.join(ROOT, REC, `city-${kind}.json`), JSON.stringify({ made: new Date().toISOString(), kind, results }, null, 2) + '\n');
} else if (step === 'build') {
  const ranks = (args.candidates ?? '1,2,3,4,5').split(',').map(Number);
  const sr = JSON.parse(readFileSync(path.join(ROOT, REC, 'search-region.json'), 'utf8')).candidates as { rank: number; source_centre_lon_lat: XY; rotation_deg: number; mirrored: boolean; score: number; fit: number; famous_coastlines_in_frame: string[] }[];
  const sd = JSON.parse(readFileSync(path.join(ROOT, REC, 'search-dzego.json'), 'utf8')).candidates as typeof sr;
  const cm = JSON.parse(readFileSync(path.join(ROOT, REC, 'city-meldan.json'), 'utf8')).results as { placement: CityXf; fit: { score: number } & Record<string, unknown> }[];
  const cp = JSON.parse(readFileSync(path.join(ROOT, REC, 'city-pafogai.json'), 'utf8')).results as typeof cm;
  const xfOf = (c: (typeof sr)[number]): Xf => ({ lon: c.source_centre_lon_lat[0], lat: c.source_centre_lon_lat[1], rot: c.rotation_deg, mirror: c.mirrored });
  // a city patch is chosen by how many of the city's checks it already meets, then by score (or by --meldan=N / --pafogai=N)
  const oks = (f: Record<string, unknown>) => Object.entries(f).filter(([k, v]) => k.startsWith('ok') && v === true).length;
  const bestCity = (list: typeof cm, pick?: string) => (pick ? list[Number(pick) - 1] : [...list].sort((a, b) => oks(b.fit) - oks(a.fit) || b.fit.score - a.fit.score)[0]).placement;
  const fileHashes: Record<string, string> = {};
  const save = (rel: string, buf: Buffer) => { const p2 = path.join(ROOT, OUT, rel); mkdirSync(path.dirname(p2), { recursive: true }); writeFileSync(p2, buf); fileHashes[`${OUT}/${rel}`] = createHash('sha256').update(buf).digest('hex'); };
  const writeFrame = (dir: string, fr: FrameRun, ex: number, source: unknown) => {
    const L2 = render(fr, ex, 1);
    save(`${dir}/composite.png`, rgbPng(L2.composite));
    save(`${dir}/layers/hillshade.png`, grey8Png(L2.w, L2.h, L2.hillshade));
    save(`${dir}/layers/tint.png`, rgbaPng(L2.tint));
    save(`${dir}/layers/water.png`, rgbaPng(L2.water));
    save(`${dir}/layers/rivers.png`, rgbaPng(L2.rivers));
    save(`${dir}/layers/forest.png`, rgbaPng(L2.forest));
    writeTiles(L2.composite, path.join(ROOT, OUT, dir, 'tiles'), 512);
    const g = fr.g;
    save(`${dir}/data/height.png`, grey16Png(g.w, g.h, Uint16Array.from({ length: g.w * g.h }, (_, k) => { const j = g.h - 1 - Math.floor(k / g.w), i = k % g.w; return Math.max(0, Math.min(65535, Math.round(fr.z[j * g.w + i] + 32768))); })));
    save(`${dir}/data/biome.png`, grey8Png(g.w, g.h, Uint8Array.from({ length: g.w * g.h }, (_, k) => { const j = g.h - 1 - Math.floor(k / g.w), i = k % g.w; return fr.clim.biome[j * g.w + i]; })));
    const toOut = (q: XY) => { const [lo, la] = fr.toLL(q[0], q[1]); return [Number(lo.toFixed(5)), Number(la.toFixed(5))]; };
    save(`${dir}/data/rivers.json`, Buffer.from(JSON.stringify({ coordinates: '[longitude, latitude] in the book\'s frame', rivers: fr.hydro.rivers.map((rv) => ({ flow_km2: rv.flow_km2, flows_km2: rv.flows, points: rv.points.map(toOut) })) }) + '\n'));
    save(`${dir}/data/meta.json`, Buffer.from(JSON.stringify({ label: LABEL_FULL, license: LICENSE, recipe: `${REC}/recipe.json`, grid: { w: g.w, h: g.h, cell_km: Number(g.dx.toFixed(5)) }, source, height_png: '16-bit grey, meters + 32768, row 0 is the north edge', biome_png: { legend: BIOMES, note: '8-bit grey, the value is an index into the legend; row 0 is the north edge' }, render: { width: L2.w, height: L2.h, vertical_exaggeration: ex } }, null, 2) + '\n'));
    return L2;
  };
  // Dzego: the best placement; Sadzu Du's river comes from the real drainage if there is one within 12 km, otherwise the book's pin is carved
  const dxf = xfOf(sd[Number(args.dzego ?? 1) - 1]);
  const dPinsAll = dzegoPins();
  let dzego = finishReal(DZEGO, realFrame('dzego', dxf), dPinsAll.filter((p) => p.kind !== 'river'), 51, 40000, 1000, [40, 50, 3, 500, 22], 3500, DZEGO.lat, DZEGO.toLL, DZEGO.render);
  const [sl, sa] = LL(place(W, 'sadzu').at!), sadzu = DZEGO.fromLL(sl, sa);
  let sadzuRiver = 'real drainage';
  if (!dzego.hydro.rivers.some((rv) => rv.points.some((q) => kmDist(DZEGO, q, sadzu) < 12))) { dzego = finishReal(DZEGO, realFrame('dzego', dxf), dPinsAll, 51, 40000, 1000, [40, 50, 3, 500, 22], 3500, DZEGO.lat, DZEGO.toLL, DZEGO.render); sadzuRiver = 'the book\'s pin, carved'; }
  console.log('dzego built; Sadzu Du\'s river from', sadzuRiver);
  // Meldan: a real lone hill; v4's invented mountain shape is dropped, the rest of its pins kept
  const mc = bestCity(cm, args.meldan);
  const mh = cityHeights(MELDAN, mc, 1);
  const meldanPins = meldanPinsV4(mh.plain, 1).slice(1);
  const meldan = { ...finishReal(MELDAN, mh.z, meldanPins, 303, 0, 400, [400, 4], 1.5, (y) => 52 + y / 111.2, MELDAN.toLL, MELDAN.render, undefined, () => true), base: mh.plain };
  // Pafogai Du: a real steep hill behind the city; v4's invented massif is dropped, the grid, the path and the pyramid are kept
  const pc = bestCity(cp, args.pafogai);
  const ph = cityHeights(PAFOGAI, pc, 1);
  const pbase = ph.z[Math.round((0 - PAFOGAI.y0) / PAFOGAI.dx) * PAFOGAI.w + Math.round((0 - PAFOGAI.x0) / PAFOGAI.dx)];
  const pv4 = pafogaiPinsV4(pbase, 1);
  const pathPin: Pin = { kind: 'shape', bbox: [1.6, -0.7, 1.8, 0], f: (x, y) => (y < 0 && y >= -0.62 && Math.abs(x - 1.7) < 0.04 ? { target: pbase + 60 * Math.min(-y, 0.6) / 0.6, weight: 1 } : null), why: 'The path from Dzai Gun climbs at ten percent to the pyramid\'s foot', provenance: 'book', lines: ['wg-341'], detail: '0 m to 60 m over 600 m' };
  const pafogaiPins = [pv4[0], pathPin, pv4[2], pv4[3], pv4[4]];
  const pafogai = { ...finishReal(PAFOGAI, ph.z, pafogaiPins, 404, 0, 400, [400, 4], 1.5, (y) => PAFOGAI.lat0 + y / 111.2, PAFOGAI.toLL, PAFOGAI.render, (x, y) => x >= -0.02 && x <= 3.22 && y >= -0.02 && y <= 3.22, () => true), base: pbase }; // no lakes: the real floodplain's hollows drain rather than flood the city
  console.log('cities built');
  const sn = JSON.parse(readFileSync(path.join(ROOT, REC, 'search-northshore.json'), 'utf8')).candidates as typeof sr;
  const nxf = xfOf(sn[Number(args.northshore ?? 1) - 1]);
  const nsPatch = realFrame('northshore', nxf);
  const results: Record<string, unknown> = {};
  const sheet: RGBA[] = [];
  for (const rank of ranks) {
    const c = sr[rank - 1], xf = xfOf(c);
    const meldanXY = REGION.fromLL(8, 52);
    const rz = realFrame('region', xf);
    blendNorthshore(rz, nsPatch);
    const raised = raiseRedshire(rz);
    const region = finishReal(REGION, rz, regionPinsV5(), 1, 60000, 1000, [40, 50, 4, 700, 22], 5000, REGION.lat, REGION.toLL, REGION.render, undefined, (x, y) => kmDist(REGION, [x, y], meldanXY) < 130);
    const run: SeedRun = { seed: rank, region, dzego, meldan, pafogai };
    const t = testSeed(run);
    console.log(`candidate ${rank}: ${t.failed.length ? `fails ${t.failed.length}: ${t.failed.slice(0, 6).join(' | ')}` : 'passes every test'}`);
    results[rank] = { redshire_range_raised_m: raised, passes: !t.failed.length, failed: t.failed, map_tests: `${t.mapResults.filter((x) => x.ok).length} of ${t.mapResults.length} hold`, terrain_checks: t.checks.map((x) => ({ check: x.id, ok: x.ok, got: x.got })) };
    const L2 = writeFrame(`candidate-${rank}/region`, region, 6, { dataset: 'ETOPO 2022', centre: c.source_centre_lon_lat, rotation_deg: c.rotation_deg, mirrored: c.mirrored, scale: 1 });
    sheet.push(downsample(L2.composite, 4));
  }
  writeFrame('dzego', dzego, 4, { dataset: 'ETOPO 2022', centre: [dxf.lon, dxf.lat], rotation_deg: dxf.rot, mirrored: dxf.mirror, scale: 1 });
  writeFrame('meldan', meldan, 1.6, { dataset: 'SRTM GL1 v003', placement: mc });
  writeFrame('pafogai-du', pafogai, 1.4, { dataset: 'SRTM GL1 v003', placement: pc });
  // the candidates on one sheet, two across, no source named
  const pw = sheet[0].w, phh = sheet[0].h, gap = 16, cols = 2, rows = Math.ceil(sheet.length / cols);
  const sh = newRGBA(pw * cols + gap, phh * rows + gap * (rows - 1));
  sh.px.fill(255);
  sheet.forEach((img, n) => { const ox = (n % cols) * (pw + gap), oy = Math.floor(n / cols) * (phh + gap); for (let y = 0; y < phh; y++) sh.px.set(img.px.subarray(y * pw * 4, (y + 1) * pw * 4), ((oy + y) * sh.w + ox) * 4); });
  mkdirSync(path.join(ROOT, 'docs/maps/terrain-v5'), { recursive: true });
  writeFileSync(path.join(ROOT, 'docs/maps/terrain-v5/candidates-region.png'), rgbPng(sh));
  // the source box of each placement (the frame's outline carried to the real globe)
  const sourceBox = (frame: FrameName, xf: Xf) => { const [lo0, la0, lo1, la1] = BOUNDS[frame]; let a = Infinity, b2 = Infinity, c2 = -Infinity, d2 = -Infinity; for (let t = 0; t <= 40; t++) for (const [lo, la] of [[lo0 + ((lo1 - lo0) * t) / 40, la0], [lo0 + ((lo1 - lo0) * t) / 40, la1], [lo0, la0 + ((la1 - la0) * t) / 40], [lo1, la0 + ((la1 - la0) * t) / 40]]) { const [x, y] = toSource(frame, xf, lo, la); a = Math.min(a, x); c2 = Math.max(c2, x); b2 = Math.min(b2, y); d2 = Math.max(d2, y); } return { west: Number(a.toFixed(3)), south: Number(b2.toFixed(3)), east: Number(c2.toFixed(3)), north: Number(d2.toFixed(3)), note: 'the box around the frame\'s outline on the real globe (longitudes may wrap)' }; };
  const describe = (ps: Pin[], frame: string) => ps.map((p) => ({ frame, kind: p.kind, why: p.why, provenance: p.provenance, lines: p.lines, ...('detail' in p ? { detail: p.detail } : {}), ...('band' in p ? { band_km: p.band } : {}) }));
  writeFileSync(path.join(ROOT, REC, 'recipe.json'), JSON.stringify({
    label: LABEL_FULL, license: LICENSE, made: new Date().toISOString(), code_version: codeVersion(),
    sources: JSON.parse(readFileSync(path.join(ROOT, REC, 'sources.json'), 'utf8')),
    region_candidates: ranks.map((rank) => { const c = sr[rank - 1]; return { rank, dataset: 'ETOPO 2022 v1, 60 arc-second surface elevation', source_centre_lon_lat: c.source_centre_lon_lat, source_box: sourceBox('region', xfOf(c)), rotation_deg: c.rotation_deg, mirrored: c.mirrored, scale: 1, search_score: c.score, constraint_fit: c.fit, famous_coastlines_in_frame: c.famous_coastlines_in_frame, tests: results[rank] }; }),
    northshore: { dataset: 'ETOPO 2022 v1, 60 arc-second surface elevation', note: 'the chapter 29 battle map\'s area (with the peninsula, Thaldur and Northglade\'s island) comes from its own real patch, feathered into each region candidate over about 220 km: no region-scale window matches the book\'s drawn coast there', source_centre_lon_lat: [nxf.lon, nxf.lat], source_box: sourceBox('northshore', nxf), rotation_deg: nxf.rot, mirrored: nxf.mirror, scale: 1 },
    dzego: { dataset: 'ETOPO 2022 v1, 60 arc-second surface elevation', source_centre_lon_lat: [dxf.lon, dxf.lat], source_box: sourceBox('dzego', dxf), rotation_deg: dxf.rot, mirrored: dxf.mirror, scale: 1, sadzu_river: sadzuRiver },
    meldan: { dataset: 'SRTM GL1 v003 (1 arc-second)', hill_lon_lat: [Number(mc.lon.toFixed(5)), Number(mc.lat.toFixed(5))], rotation_deg: mc.rot, mirrored: mc.mirror, scale: mc.hscale, scale_note: 'real km per frame km', vertical_scale: mc.vscale, smoothing: 'a cross of five samples 30 m apart, then two box passes of about 150 m', note: 'v4\'s invented mountain shape is dropped; the hill is real' },
    'pafogai-du': { dataset: 'SRTM GL1 v003 (1 arc-second)', hill_lon_lat: [Number(pc.lon.toFixed(5)), Number(pc.lat.toFixed(5))], hill_placed_at_km: [pc.x0, pc.y0], rotation_deg: pc.rot, mirrored: pc.mirror, scale: pc.hscale, scale_note: 'real km per frame km', vertical_scale: pc.vscale, note: 'v4\'s invented massif is dropped; the grid, the path and the pyramid stay pinned' },
    method: 'Real heights moved by a rigid motion of the sphere (the book frame\'s centre onto a source point, turned in 15° steps, mirrored or not, at true scale); then v4\'s soft and hard pins for every book fact, a light droplet erosion (region 60,000, Dzego 40,000 droplets) so the pins settle into the real relief, the book\'s river carved, priority-flood lakes, rivers from flow accumulation on the real terrain, climate from the book\'s latitudes and the real heights, biomes, and the book\'s forests forced. The seabed is as measured.',
    constraints: [...describe(regionPinsV5(), 'region'), ...describe(dzego.pins, 'dzego'), ...describe(meldanPins, 'meldan'), ...describe(pafogaiPins, 'pafogai-du')],
    outputs: { where: `${OUT}/ (not in the repository; copied to Drive)`, sha256: fileHashes },
  }, null, 2) + '\n');
  console.log('built');
} else throw new Error('step: prepare | search | hills | city | build');
