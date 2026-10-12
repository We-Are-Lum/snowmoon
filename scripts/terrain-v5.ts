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
import { inflateSync } from 'node:zlib';
import { type XY, type GridSpec, pointInPoly } from './lib/terrain-core';
import { Noise2 } from './lib/noise';
import { rgbPng, rgbaPng, grey8Png, grey16Png, writeTiles, downsample, newRGBA, type RGBA } from './lib/raster-out';
import {
  W, LL, ucLL, nsLL, llToFrame, REGION, DZEGO, MELDAN, PAFOGAI, kmDist, applyPins, softPins, erodeDroplets, carve, dropSpecks, hydrology, climate,
  regionPins, dzegoPins, meldanPinsV4, pafogaiPinsV4, testSeed, render, BIOMES, B, smooth, place, pts, maps, cxy, polySigned,
  BOOK_SEA_BAND, BOOK_SEA_EXCLUDE, clipPoly, type Frame, type CityFrame, type FrameRun, type SeedRun, type Pin,
} from './terrain-v4';

const ROOT = process.cwd();
const REC = 'content/snowmoon/maps/terrain-v5';
const OUT = 'out/maps-v5';
const CACHE = 'data-cache';
// the owner's wording (2026-10-12), with the two things every label on the site carries (owner, 2026-10-09): who made it
// and "not by the author" (src/lib/ai-declared.ts); the short visible label follows the site's "AI image · by …" pattern
const LABEL = 'Map made with AI-written code from real public elevation data, reshaped to fit the book. Sources in the recipe.';
const SHORT_LABEL = 'AI map · by Snowmoon Party';
const LABEL_FULL = `${LABEL} Made by Snowmoon Party, not by the author. (Label accepted by the owner, 2026-10-12.) The heights are real, moved and possibly mirrored, then reshaped by code written by an AI model, Claude (the coding agent, a closed model); no image model. Every book fact is pinned.`;
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
type FrameName = 'region' | 'dzego' | 'northshore' | 'bay';
// the battle map's southern sea (the inner sea) and the land around it, in the battle map's pixels
const BAY_BOX: [number, number, number, number] = [95, 105, 290, 290];
// Northshore: the chapter 29 battle map and what the book places around it (the peninsula, Thaldur, Northglade's
// island), in the battle map's pixels (2.6 km each); its own real patch, blended into the region
const NS_CORE: [number, number, number, number] = [-40, -40, 540, 280]; // includes the open water east of the peninsula and around Thaldur
const nsBox = (() => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const x of [NS_CORE[0], NS_CORE[2]]) for (const y of [NS_CORE[1], NS_CORE[3]]) { const [lo, la] = nsLL([x, y]); a = Math.min(a, lo); c = Math.max(c, lo); b = Math.min(b, la); d = Math.max(d, la); } return [a, b, c, d] as [number, number, number, number]; })();
const bayBox = (() => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const x of [BAY_BOX[0], BAY_BOX[2]]) for (const y of [BAY_BOX[1], BAY_BOX[3]]) { const [lo, la] = nsLL([x, y]); a = Math.min(a, lo); c = Math.max(c, lo); b = Math.min(b, la); d = Math.max(d, la); } return [a, b, c, d] as [number, number, number, number]; })();
const CENTRE: Record<FrameName, XY> = { region: [38, 51], dzego: [149, 23], northshore: [(nsBox[0] + nsBox[2]) / 2, (nsBox[1] + nsBox[3]) / 2], bay: [(bayBox[0] + bayBox[2]) / 2, (bayBox[1] + bayBox[3]) / 2] };
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
const BOUNDS: Record<FrameName, [number, number, number, number]> = { region: [-8, 36, 84, 66], dzego: [138, 15, 160, 31], northshore: nsBox, bay: bayBox };
export function famousIn(frame: FrameName, xf: Xf): { name: string; w: number }[] {
  const [lo0, la0, lo1, la1] = BOUNDS[frame];
  const out: { name: string; w: number }[] = [];
  for (const [name, w, points] of FAMOUS)
    if (points.some(([lon, lat]) => { const [blo, bla] = toBook(frame, xf, lon, lat); return blo >= lo0 && blo <= lo1 && bla >= la0 && bla <= la1; })) out.push({ name, w });
  return out;
}
const penalty = (xf: Xf, hits: { w: number }[]) => 0.035 * hits.reduce((a, h) => a + h.w, 0) * (!xf.mirror && Math.min(xf.rot % 360, 360 - (xf.rot % 360)) <= 45 ? 1 : 0.6);

// ---- what the book asks of the terrain, as sampled targets (from the same pins v4 uses)
type Target = { group: number; d: number; b: number; want: 'land' | 'sea' | 'low' | 'high900' | 'match' | 'hills'; ref?: number };
type Group = { name: string; weight: number; kind: 'frac' | 'max1800' | 'frac03' | 'atleast03' | 'landshare'; provenance: string; cat: 'battle' | 'sea' | 'land' | 'places' | 'relief' | 'blend' };
function targetsFor(frame: FrameName, stride: number, cap = 120, regionXf?: Xf): { targets: Target[]; groups: Group[] } {
  const f: Frame = frame === 'dzego' ? DZEGO : REGION;
  const inNs = (lo: number, la: number) => lo > nsBox[0] && lo < nsBox[2] && la > nsBox[1] && la < nsBox[3];
  // Northshore is scored against v5's own pins (with the open water east of the peninsula), the region against v4's
  const pins = (frame === 'dzego' ? dzegoPins() : frame === 'northshore' ? [openSeaEast(), ...regionPinsV5()] : frame === 'bay' ? regionPinsV5().filter((p) => p.kind === 'land-box' || /battle map's southern sea/.test(p.why)) : regionPins()).filter((p) => p.kind !== 'river' && p.kind !== 'cover');
  const [c0, c1] = CENTRE[frame];
  const targets: Target[] = [], groups: Group[] = [];
  const add = (group: number, x: number, y: number, want: Target['want'], ref?: number) => { const [lo, la] = f.toLL(x, y); const [d, b] = polar(c0, c1, lo, la); targets.push({ group, d, b, want, ref }); };
  const probe = new Float32Array(f.w * f.h);
  for (const p of pins) {
    probe.fill(0);
    if (frame === 'northshore' || frame === 'bay') applyAll(f, probe, [p]); else applyPins(f, probe, [p]);
    const cells: [number, number, Target['want']][] = [];
    for (let j = 0; j < f.h; j += stride) for (let i = 0; i < f.w; i += stride) {
      const v = probe[j * f.w + i];
      if (v === 0 || Math.abs(v) <= 1) continue;
      if (frame === 'northshore') { const [lo, la] = f.toLL(f.x0 + i * f.dx, f.y0 + j * f.dy); if (!inNs(lo, la)) continue; }
      if (frame === 'bay') { const [lo, la] = f.toLL(f.x0 + i * f.dx, f.y0 + j * f.dy), [bx, by] = llToFrame('northshore', lo, la); if (bx < BAY_BOX[0] || bx > BAY_BOX[2] || by < BAY_BOX[1] || by > BAY_BOX[3]) continue; }
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
  if (frame === 'bay') {
    // in this map the inner sea is closed by land beyond the drawing's south and east borders (ours; the book does not say
    // what lies past its edges), so the real match is a gulf, not an open coast
    const ge = groups.push({ name: 'land beyond the drawing closes the inner sea (ours)', weight: 1, kind: 'frac', provenance: 'placed by us', cat: 'battle' }) - 1;
    for (let py = 125; py <= 285; py += 4) for (let px = 125; px <= 285; px += 4) {
      if (!((px >= 250 && py >= 125) || (py >= 250 && px >= 125))) continue;
      const [lo, la] = nsLL([px, py]), [x, y] = f.fromLL(lo, la);
      add(ge, x, y, 'land');
    }
  }
  if (frame === 'northshore') {
    // the battle map's land is snowy hills under pine (Northglade c31-b2, c31-b5; Elenar Forest c29-b2, c29-b19, c29-b38),
    // not high mountains: its interior should stay below about 1,100 m
    const gl = groups.push({ name: 'the battle map\'s land is hills, not high mountains (below 1,100 m)', weight: 2, kind: 'frac', provenance: 'book', cat: 'battle' }) - 1;
    const lb = regionPinsV5().find((p) => p.kind === 'land-box');
    if (lb && 'poly' in lb) for (let j = 0; j < f.h; j += stride) for (let i = 0; i < f.w; i += stride) { const x = f.x0 + i * f.dx, y = f.y0 + j * f.dy; if (pointInPoly(x, y, lb.poly)) add(gl, x, y, 'hills'); }
  }
  if (frame === 'northshore' && regionXf) {
    // the blend ring: up to 250 km outside the patch, where it meets the chosen region window; the patch should have
    // the same kind of ground there (land, shelf, slope or deep sea) as the region, so the blend leaves no seam
    const gb = groups.push({ name: 'the patch matches the region around the blend', weight: 1, kind: 'frac', provenance: 'placed by us', cat: 'blend' }) - 1;
    const eg: Grid16 = { data: etopo(), w: ETOPO.w, h: ETOPO.h, res: ETOPO.res };
    for (let j = 0; j < f.h; j += stride * 2) for (let i = 0; i < f.w; i += stride * 2) {
      const x = f.x0 + i * f.dx, y = f.y0 + j * f.dy, [lo, la] = f.toLL(x, y);
      if (lo < nsBox[0] - 8 || lo > nsBox[2] + 8 || la < nsBox[1] - 4 || la > nsBox[3] + 4) continue;
      const [px, py] = llToFrame('northshore', lo, la);
      const out = Math.max(NS_CORE[0] - px, px - NS_CORE[2], NS_CORE[1] - py, py - NS_CORE[3], 0) * 2.6;
      if (out <= 0 || out > 250) continue;
      const [sx, sy] = toSource('region', regionXf, lo, la);
      add(gb, x, y, 'match', sampleGrid(eg, sx, sy));
    }
  }
  return { targets, groups };
}
const depthClass = (z: number) => (z >= 0 ? 0 : z > -200 ? 1 : z > -1000 ? 2 : 3);

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
    else if (t.want === 'match') ok[g] += depthClass(z) === depthClass(t.ref!) ? 1 : 0;
    else if (t.want === 'hills') ok[g] += z < 1100 ? 1 : 0; // land or sea, but not high mountains
    else { mx[g] = Math.max(mx[g], z); if (z >= 0) { land[g]++; if (z >= 300) hi300[g]++; } if (z >= 900) ok[g]++; }
  }
  const cs = { battle: 0, sea: 0, land: 0, places: 0, relief: 0, blend: 0 }, cw = { battle: 0, sea: 0, land: 0, places: 0, relief: 0, blend: 0 };
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
  // Northshore: the battle map (with the open water east of the peninsula) and, when a region is chosen, how well the
  // patch meets it around the blend
  const share = frame === 'bay' ? { battle: 1, places: 0, sea: 0, land: 0, relief: 0, blend: 0 } : frame === 'northshore' ? { battle: 0.6, places: 0, sea: 0, land: 0, relief: 0, blend: 0.4 } : { battle: 0.05, places: 0.35, sea: 0.15, land: 0.15, relief: 0.3, blend: 0 };
  let fit = 0, used = 0;
  // the battle map counts its seas and its land half and half, whatever the number of pins on each
  const hg = T.groups.findIndex((G) => G.name.startsWith('the battle map\'s land is hills'));
  if (bSeaN && bLandN) { const hf = hg >= 0 && cnt[hg] ? ok[hg] / cnt[hg] : 1; cs.battle = (0.5 * (bSea / bSeaN) + 0.5 * (bLand / bLandN)) * (0.4 + 0.6 * hf); cw.battle = 1; }
  for (const k of ['battle', 'places', 'sea', 'land', 'relief', 'blend'] as const) if (cw[k]) { fit += share[k] * (cs[k] / cw[k]); used += share[k]; }
  fit /= used;
  if (placesN && placesOn / placesN < 0.8) fit *= 0.4;
  if (cw.sea && cs.sea / cw.sea < 0.5) fit *= 0.5;
  if (frame === 'northshore' && bSeaN && bSea / bSeaN < 0.5) fit *= 0.5;
  const mg = T.groups.findIndex((G) => G.name === 'Meldan on a low plain');
  if (mg >= 0 && cnt[mg] && ok[mg] / cnt[mg] < 0.7) fit *= 0.6;
  if (detail) { for (const k of ['battle', 'places', 'sea', 'land', 'relief', 'blend'] as const) if (cw[k]) parts[`(${k}, overall)`] = Number((cs[k] / cw[k]).toFixed(3)); if (placesN) parts['(places on real land)'] = Number((placesOn / placesN).toFixed(3)); }
  const fam = famousIn(frame, xf);
  const score = fit - penalty(xf, fam);
  return detail ? { score, fit, famous: fam.map((x) => x.name), parts } : { score, fit, famous: [] as string[], parts };
}

// ---- the search
/** The share of the bay's box whose real source the region window or the chosen Northshore patch also shows. */
let bayRefs: { region: Xf; ns: Xf } | null = null;
function bayShownElsewhere(bx: Xf): number {
  if (!bayRefs) return 0;
  let n = 0, dup = 0;
  for (let px = BAY_BOX[0]; px <= BAY_BOX[2]; px += 15) for (let py = BAY_BOX[1]; py <= BAY_BOX[3]; py += 15) {
    const [lon, lat] = nsLL([px, py]), [slo, sla] = toSource('bay', bx, lon, lat);
    n++;
    const [rlo, rla] = toBook('region', bayRefs.region, slo, sla);
    if (rlo >= -8 && rlo <= 84 && rla >= 36 && rla <= 66) { dup++; continue; }
    const [nlo, nla] = toBook('northshore', bayRefs.ns, slo, sla), [fx, fy] = llToFrame('northshore', nlo, nla);
    if (Math.max(NS_CORE[0] - fx, fx - NS_CORE[2], NS_CORE[1] - fy, fy - NS_CORE[3], 0) * 2.6 < 250) dup++;
  }
  return dup / n;
}
/** The share of a Northshore patch's core whose real source the region window also shows outside the blend. */
function shownTwice(nx: Xf, rx: Xf): number {
  let n = 0, dup = 0;
  for (let px = NS_CORE[0]; px <= NS_CORE[2]; px += 20) for (let py = NS_CORE[1]; py <= NS_CORE[3]; py += 20) {
    const [lon, lat] = nsLL([px, py]), [slo, sla] = toSource('northshore', nx, lon, lat), [blo, bla] = toBook('region', rx, slo, sla);
    n++;
    if (blo < -8 || blo > 84 || bla < 36 || bla > 66) continue;
    const [fx, fy] = llToFrame('northshore', blo, bla);
    if (Math.max(NS_CORE[0] - fx, fx - NS_CORE[2], NS_CORE[1] - fy, fy - NS_CORE[3], 0) * 2.6 > 250) dup++;
  }
  return dup / n;
}
type Cand = { xf: Xf; score: number; fit: number; famous: string[]; parts: Record<string, number> };
function search(frame: FrameName, top: number, regionXf?: Xf): Cand[] {
  const fine: Grid16 = { data: etopo(), w: ETOPO.w, h: ETOPO.h, res: ETOPO.res };
  const coarse = coarsen(fine, 6); // 6 arc-minutes, about 11 km
  const Tc = targetsFor(frame, 10, 30, regionXf), Tf = targetsFor(frame, 4, 120, regionXf);
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
    // no real coast shown twice: a Northshore patch whose source the region window also shows (outside the blend) is skipped
    if (frame === 'northshore' && regionXf && shownTwice(c.xf, regionXf) > 0.02) continue;
    if (frame === 'bay' && bayShownElsewhere(c.xf) > 0.02) continue;
    if (frame === 'bay' && c.fit < 0.6) continue;
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
// ---- v5's own checks: the seam (no straight runs in coasts or depth contours, no depth step across the blend) and
// no lake in Pafogai Du
type Pt = [number, number];
/** Contour polylines at a level (marching squares on cell centres), in km. */
function contourLines(g: GridSpec, z: Float32Array, level: number): Pt[][] {
  const km = (x: number, y: number): Pt => [x * g.kmx(x, y), y * g.kmy];
  const segs: [string, string, Pt, Pt][] = [];
  const key = (a: number, b: number, c: number) => `${a},${b},${c}`;
  for (let j = 0; j < g.h - 1; j++) for (let i = 0; i < g.w - 1; i++) {
    const v = [z[j * g.w + i], z[j * g.w + i + 1], z[(j + 1) * g.w + i + 1], z[(j + 1) * g.w + i]].map((t) => t - level);
    const idxc = (v[0] > 0 ? 1 : 0) | (v[1] > 0 ? 2 : 0) | (v[2] > 0 ? 4 : 0) | (v[3] > 0 ? 8 : 0);
    if (idxc === 0 || idxc === 15) continue;
    // edges: 0 bottom (0-1), 1 right (1-2), 2 top (3-2), 3 left (0-3); an edge's point is keyed by its cell edge
    const ep = (e: number): [string, Pt] => {
      const [a, b, ia, ja, ib, jb] = e === 0 ? [v[0], v[1], i, j, i + 1, j] : e === 1 ? [v[1], v[2], i + 1, j, i + 1, j + 1] : e === 2 ? [v[3], v[2], i, j + 1, i + 1, j + 1] : [v[0], v[3], i, j, i, j + 1];
      const t = a / (a - b), x = g.x0 + (ia + (ib - ia) * t) * g.dx, y = g.y0 + (ja + (jb - ja) * t) * g.dy;
      return [ja === jb ? key(0, ia, ja) : key(1, ia, ja), km(x, y)];
    };
    const pairs: number[][] = ({ 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 2], [0, 1]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[2, 0]], 10: [[0, 3], [1, 2]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]] } as Record<number, number[][]>)[idxc];
    for (const [e1, e2] of pairs) { const [k1, p1] = ep(e1), [k2, p2] = ep(e2); segs.push([k1, k2, p1, p2]); }
  }
  // chain segments into polylines
  const adj = new Map<string, number[]>();
  segs.forEach((sg, n) => { for (const k of [sg[0], sg[1]]) { const l = adj.get(k); if (l) l.push(n); else adj.set(k, [n]); } });
  const used = new Uint8Array(segs.length), lines: Pt[][] = [];
  for (let n = 0; n < segs.length; n++) {
    if (used[n]) continue;
    used[n] = 1;
    const line: Pt[] = [segs[n][2], segs[n][3]];
    for (const dir of [1, 0]) {
      let k = segs[n][dir] as string;
      for (;;) {
        const next = (adj.get(k) ?? []).find((m) => !used[m]);
        if (next === undefined) break;
        used[next] = 1;
        const sg = segs[next], forward = sg[0] === k;
        const p = forward ? sg[3] : sg[2];
        if (dir === 1) line.push(p); else line.unshift(p);
        k = forward ? sg[1] : sg[0];
      }
    }
    lines.push(line);
  }
  return lines;
}
/** The longest straight run (km) in a set of polylines: every point within 1.5% of the run's length (at least tol km)
 * of the chord, and the chord at least 95% of the path along it. */
function longestStraight(lines: Pt[][], minKm: number, tol: number): { km: number; at: Pt | null; runs: { km: number; from: Pt; to: Pt }[] } {
  let best = 0, at: Pt | null = null;
  const runs: { km: number; from: Pt; to: Pt }[] = [];
  for (const L of lines) {
    const n = L.length;
    if (n < 3) continue;
    const arc = new Float64Array(n);
    for (let i = 1; i < n; i++) arc[i] = arc[i - 1] + Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]);
    if (arc[n - 1] < minKm) continue;
    const straight = (i: number, j: number) => {
      const [ax, ay] = L[i], [bx, by] = L[j], len = Math.hypot(bx - ax, by - ay);
      if (len < 0.95 * (arc[j] - arc[i])) return false;
      const lim = Math.max(tol, 0.015 * len); // what reads as straight on the map: within 1.5% of the run's length
      for (let k = i + 1; k < j; k++) if (Math.abs((bx - ax) * (L[k][1] - ay) - (by - ay) * (L[k][0] - ax)) / len > lim) return false;
      return true;
    };
    let j = 0;
    for (let i = 0; i < n; i++) {
      if (j < i) j = i;
      while (j < n - 1 && arc[j] - arc[i] < minKm) j++;
      if (arc[j] - arc[i] < minKm) break;
      if (!straight(i, j)) continue;
      let e = j;
      while (e < n - 1 && straight(i, e + 1)) e++;
      const len = arc[e] - arc[i];
      runs.push({ km: len, from: L[i], to: L[e] });
      if (len > best) { best = len; at = L[i]; }
      i = e - 1;
    }
  }
  return { km: best, at, runs: runs.sort((a, b) => b.km - a.km) };
}
function seamChecks(fr: FrameRun, W: Float32Array, real0?: Float32Array, touched?: Uint8Array | null) {
  const g = fr.g, z = fr.z, checks: { check: string; ok: boolean; got: string }[] = [], numbers: Record<string, unknown> = {};
  const tol = 0.25 * g.dx; // km: a quarter of a cell
  for (const level of [0, -50, -200, -1000]) {
    const r = longestStraight(contourLines(g, z, level), 80, tol);
    const name = level === 0 ? 'the coastline' : `the ${-level} m depth contour`;
    // the same runs, kept only where they cross terrain this pipeline changed (pins, synthetic seabed, the blend band)
    if (real0) {
      // where this contour was moved: the terrain crosses the level because of the pipeline (it did not before, or the
      // other way round), widened by 2 cells; and the blend band
      const changed = new Uint8Array(z.length);
      // what the pipeline moved: the pins' footprints and the cells v5's rules changed (not the light erosion, which
      // moves every coast a little), plus the blend band
      for (let k = 0; k < z.length; k++) if ((touched ? touched[k] && (real0[k] >= level) !== (z[k] >= level) : (real0[k] >= level) !== (z[k] >= level)) || (W[k] > 0.02 && W[k] < 0.98)) { const i = k % g.w, j = (k / g.w) | 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < g.w && jj < g.h) changed[jj * g.w + ii] = 1; } }
      const touches = (x: { from: Pt; to: Pt }) => { let hit = 0; for (let t = 0; t <= 20; t++) { const px = x.from[0] + ((x.to[0] - x.from[0]) * t) / 20, py = x.from[1] + ((x.to[1] - x.from[1]) * t) / 20, y = py / g.kmy, xx = px / g.kmx(0, y), i = Math.round((xx - g.x0) / g.dx), j = Math.round((y - g.y0) / g.dy); if (i >= 0 && j >= 0 && i < g.w && j < g.h && changed[j * g.w + i]) hit++; } return hit >= 11; }; // at least half of the run
      // straightness that the real terrain already has at this level nearby (a straight run at least 40% as long, its
      // middle within 25 km of the run's span, the same direction) is not a seam
      const realRuns = longestStraight(contourLines(g, real0, level), 48, tol).runs;
      const mid = (x: { from: Pt; to: Pt }): Pt => [(x.from[0] + x.to[0]) / 2, (x.from[1] + x.to[1]) / 2];
      const inReal = (x: { km: number; from: Pt; to: Pt }) => realRuns.some((rr) => rr.km >= 0.4 * x.km && Math.hypot(mid(rr)[0] - mid(x)[0], mid(rr)[1] - mid(x)[1]) < 25 + x.km / 2 && angDiff(rr, x) < 0.35);
      function angDiff(a: { from: Pt; to: Pt }, b: { from: Pt; to: Pt }) { const o = (q: { from: Pt; to: Pt }) => ((Math.atan2(q.to[1] - q.from[1], q.to[0] - q.from[0]) % Math.PI) + Math.PI) % Math.PI; const d = Math.abs(o(a) - o(b)); return Math.min(d, Math.PI - d); }
      const seam = r.runs.filter((x) => touches(x) && !inReal(x));
      checks.push({ check: `Seam: no straight run longer than 80 km in ${name} where the pipeline moved it (half the run or more)`, ok: !seam.length, got: seam.length ? `${seam.length} runs, longest ${Math.round(seam[0].km)} km` : 'none' });
      const ll2 = (q: Pt) => { const y = q[1] / g.kmy, x = q[0] / g.kmx(0, y); return REGION.toLL(x, y).map((v) => Number(v.toFixed(1))); };
      numbers[`seam_runs_over_80km_${level === 0 ? 'coast' : -level + 'm'}`] = seam.map((x) => ({ km: Math.round(x.km), from_lon_lat: ll2(x.from), to_lon_lat: ll2(x.to) }));
    }
    const where = r.at ? (() => { const y = r.at[1] / g.kmy, x = r.at[0] / g.kmx(0, y); const [lo, la] = REGION.toLL(x, y); return ` (starting near ${lo.toFixed(1)}°, ${la.toFixed(1)}° in the book's frame)`; })() : '';
    checks.push({ check: `Anywhere: no straight run longer than 80 km in ${name}`, ok: r.km <= 80, got: `longest straight run ${r.km.toFixed(0)} km${r.km > 80 ? where : ''}` });
    numbers[`longest_straight_km_${level === 0 ? 'coast' : -level + 'm'}`] = Number(r.km.toFixed(1));
    const ll = (p: Pt) => { const y = p[1] / g.kmy, x = p[0] / g.kmx(0, y); return REGION.toLL(x, y).map((v) => Number(v.toFixed(1))); };
    numbers[`straight_runs_over_80km_${level === 0 ? 'coast' : -level + 'm'}`] = r.runs.map((x) => ({ km: Math.round(x.km), from_lon_lat: ll(x.from), to_lon_lat: ll(x.to) }));
  }
  // right-angle corners: both legs straight for 20 km or more, meeting at 70–110°, in the coastline and the contours;
  // counted where the pipeline moved the contour (as for straight runs) and anywhere
  for (const level of [0, -50, -200, -1000]) {
    const lines = contourLines(g, z, level), name = level === 0 ? 'the coastline' : `the ${-level} m depth contour`;
    const corners: Pt[] = [];
    for (const L of lines) {
      const n = L.length;
      if (n < 5) continue;
      const arc = new Float64Array(n);
      for (let i = 1; i < n; i++) arc[i] = arc[i - 1] + Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]);
      const straight = (a: number, b: number) => { const len = Math.hypot(L[b][0] - L[a][0], L[b][1] - L[a][1]); if (len < 0.95 * (arc[b] - arc[a])) return false; const lim = Math.max(tol, 0.015 * len); for (let k = a + 1; k < b; k++) if (Math.abs((L[b][0] - L[a][0]) * (L[k][1] - L[a][1]) - (L[b][1] - L[a][1]) * (L[k][0] - L[a][0])) / len > lim) return false; return true; };
      let a = 0, last = -1e9;
      for (let i = 1; i < n - 1; i++) {
        while (a < i && arc[i] - arc[a + 1] >= 20) a++;
        if (arc[i] - arc[a] < 20) continue;
        let b = i;
        while (b < n - 1 && arc[b] - arc[i] < 20) b++;
        if (arc[b] - arc[i] < 20) break;
        if (arc[i] - last < 20 || !straight(a, i) || !straight(i, b)) continue;
        const v1 = [L[i][0] - L[a][0], L[i][1] - L[a][1]], v2 = [L[b][0] - L[i][0], L[b][1] - L[i][1]];
        const ang = (Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]))))) * 180) / Math.PI;
        if (ang >= 70 && ang <= 110) { corners.push(L[i]); last = arc[i]; }
      }
    }
    const moved = real0 ? (() => { const ch = new Uint8Array(z.length); for (let k = 0; k < z.length; k++) if ((touched ? touched[k] && (real0[k] >= level) !== (z[k] >= level) : (real0[k] >= level) !== (z[k] >= level)) || (W[k] > 0.02 && W[k] < 0.98)) ch[k] = 1; return corners.filter((c) => { const y = c[1] / g.kmy, x = c[0] / g.kmx(0, y), i = Math.round((x - g.x0) / g.dx), j = Math.round((y - g.y0) / g.dy); for (let b = -3; b <= 3; b++) for (let a2 = -3; a2 <= 3; a2++) { const ii = i + a2, jj = j + b; if (ii >= 0 && jj >= 0 && ii < g.w && jj < g.h && ch[jj * g.w + ii]) return true; } return false; }); })() : corners;
    const ll3 = (q: Pt) => { const y = q[1] / g.kmy, x = q[0] / g.kmx(0, y); return REGION.toLL(x, y).map((v) => Number(v.toFixed(1))); };
    checks.push({ check: `Seam: no right-angle corner (both legs straight for 20 km) in ${name} where the pipeline moved it`, ok: moved.length === 0, got: `${moved.length} (${corners.length} anywhere)` });
    numbers[`corners_${level === 0 ? 'coast' : -level + 'm'}`] = { moved: moved.map(ll3), anywhere: corners.length };
  }
  // needles: land or sea one cell (about 3 km) wide, with the other on both opposite sides; and flat stamped areas:
  // terrain the pipeline moved by more than 30 m that has almost no relief (land under 20 m, sea under 5 m, over 15 km)
  if (real0) {
    const opp = [[[1, 0], [-1, 0]], [[0, 1], [0, -1]], [[1, 1], [-1, -1]], [[1, -1], [-1, 1]]];
    let needleMoved = 0, needleAny = 0;
    const flat = new Uint8Array(z.length);
    for (let j = 2; j < g.h - 2; j++) for (let i = 2; i < g.w - 2; i++) {
      const k = j * g.w + i, land = z[k] >= 0;
      if (!fr.carved?.[k] && !fr.hydro.lakes[k] && opp.some(([[a1, b1], [a2, b2]]) => (z[(j + b1) * g.w + i + a1] >= 0) !== land && (z[(j + b2) * g.w + i + a2] >= 0) !== land)) { needleAny++; if (touched ? touched[k] : Math.abs(z[k] - real0[k]) > 10 || (real0[k] >= 0) !== land) needleMoved++; } // the carved river is a named book feature
      if ((touched ? touched[k] : true) && Math.abs(z[k] - real0[k]) > 30 && !(z[k] > real0[k] && land && real0[k] >= 0)) { // raised land over real land is a filled hollow (drainage), not a stamp // a pin or rule moved it (filling a hollow on real, rough ground is drainage, not a stamp)
        let lo = Infinity, hi = -Infinity;
        for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { const v = z[(j + b) * g.w + i + a]; if ((v >= 0) === land) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
        if (hi - lo < (land ? 20 : 5)) flat[k] = 1;
      }
    }
    // flat cells in clusters of 20 or more (about 200 km²)
    const seen = new Uint8Array(z.length), clusters: { cells: number; at: number[] }[] = [];
    for (let s0 = 0; s0 < z.length; s0++) {
      if (!flat[s0] || seen[s0]) continue;
      const q = [s0]; seen[s0] = 1;
      for (let qi = 0; qi < q.length; qi++) { const k = q[qi], i = k % g.w, j = (k / g.w) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (j + b) * g.w + i + a; if (n >= 0 && n < z.length && flat[n] && !seen[n]) { seen[n] = 1; q.push(n); } } }
      if (q.length >= 20) { const [x, y] = cxy(g, q[0]); clusters.push({ cells: q.length, at: REGION.toLL(x, y).map((v) => Number(v.toFixed(1))) }); }
    }
    checks.push({ check: 'Seam: no needles (land or sea one cell, about 3 km, wide) where the pipeline changed the terrain', ok: needleMoved === 0, got: `${needleMoved} cells (${needleAny} anywhere, mostly real coast)` });
    checks.push({ check: 'Seam: no flat stamped areas (moved by more than 30 m, almost no relief, 200 km² or more)', ok: clusters.length === 0, got: clusters.length ? `${clusters.length} areas, largest ${Math.max(...clusters.map((c) => c.cells)) * Math.round(g.dx * g.dx)} km²` : 'none' });
    numbers.needle_cells = { moved: needleMoved, anywhere: needleAny };
    numbers.flat_stamped_areas = clusters.sort((a, b) => b.cells - a.cells);
    writeFileSync('/tmp/geo/flat-areas.json', JSON.stringify(clusters.slice(0, 40)));
  }
  // depth steps across the blend band, against the same measure in the real seabed around it
  const steps = (inBand: boolean) => {
    const out: number[] = [];
    for (let j = 0; j < g.h - 1; j++) for (let i = 0; i < g.w - 1; i++) {
      const k = j * g.w + i;
      if (z[k] >= 0) continue;
      const band = W[k] > 0.02 && W[k] < 0.98;
      if (band !== inBand) continue;
      if (!inBand && W[k] >= 0.98) continue; // the patch itself is not the comparison
      if (!inBand) { const [lo, la] = REGION.toLL(cxy(g, k)[0], cxy(g, k)[1]); if (lo < nsBox[0] - 15 || lo > nsBox[2] + 15 || la < nsBox[1] - 8 || la > nsBox[3] + 8) continue; }
      for (const n of [k + 1, k + g.w]) if (z[n] < 0) out.push(Math.abs(z[n] - z[k]));
    }
    out.sort((a, b) => a - b);
    return { p99: out[Math.floor(out.length * 0.99)] ?? 0, max: out[out.length - 1] ?? 0, n: out.length };
  };
  const inB = steps(true), outB = steps(false);
  numbers.blend_band_depth_step_m = { p99: Math.round(inB.p99), max: Math.round(inB.max), pairs: inB.n };
  numbers.real_seabed_around_depth_step_m = { p99: Math.round(outB.p99), max: Math.round(outB.max), pairs: outB.n };
  checks.push({ check: 'No sharp depth step across the Northshore blend (cell-to-cell steps within the real seabed\'s own range)', ok: inB.p99 <= 1.5 * outB.p99 && inB.max <= outB.max, got: `blend band: 99th percentile ${inB.p99.toFixed(0)} m, largest ${inB.max.toFixed(0)} m; real seabed around it: ${outB.p99.toFixed(0)} m, ${outB.max.toFixed(0)} m` });
  return { checks, numbers };
}
function pafogaiLakes(fr: FrameRun): number {
  let n = 0;
  for (let k = 0; k < fr.z.length; k++) { const [x, y] = cxy(fr.g, k); if (x >= -1 && x <= 4.2 && y >= -1 && y <= 4.2 && fr.hydro.lakes[k]) n++; }
  return n;
}

/** A synthetic seabed where pins made sea out of real land: Laplace between the coast (−5 m) and the real seabed
 * around it, then a 300 km band of real seabed graded toward it, so the depth never steps and no plateau remains. */
function synthSeabed(g: GridSpec, z: Float32Array, synth: number[], bed: Noise2) {
  const N = z.length, inS = new Uint8Array(N);
  for (const k of synth) inS[k] = 1;
  // the 300 km band of real seabed around the synthetic area (distance in cells over sea)
  const band = Math.round(300 / g.dx), dS = new Int32Array(N).fill(-1), cells: number[] = [...synth];
  for (const k of synth) dS[k] = 0;
  for (let qi = 0; qi < cells.length; qi++) {
    const k = cells[qi], i = k % g.w, j = (k / g.w) | 0;
    if (dS[k] >= band) continue;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= g.w || jj >= g.h) continue; const n = jj * g.w + ii; if (dS[n] < 0 && z[n] < 0) { dS[n] = dS[k] + 1; cells.push(n); } }
  }
  const real = Float32Array.from(z), inC = new Uint8Array(N);
  for (const k of cells) inC[k] = 1;
  // one smooth surface over the synthetic area and its band: the coast at −5 m, the band's outer edge at the real
  // depth, and a constant sink so an enclosed sea deepens toward its middle instead of lying flat (Poisson, by SOR)
  const sink = 0.12 * (g.dx / 3.14) ** 2; // metres per cell², scaled to the grid
  const u = new Float32Array(N);
  for (const k of cells) u[k] = inS[k] ? -40 : real[k];
  for (let it = 0; it < 2500; it++)
    for (const k of cells) {
      const i = k % g.w, j = (k / g.w) | 0;
      let s2 = 0, n2 = 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= g.w || jj >= g.h) continue; const n = jj * g.w + ii; s2 += inC[n] ? u[n] : z[n] >= 0 ? -5 : real[n]; n2++; }
      u[k] += 1.85 * ((s2 - sink * n2) / n2 - u[k]);
    }
  for (const k of cells) {
    // natural relief on the synthetic seabed (about ±20% at 30–60 km), so its contours do not copy a drawn shore
    const [x, y] = cxy(g, k), shaped = Math.max(-600, u[k]) * (1 + 0.22 * bed.fbm(x / 45, y / 45, 4) + 0.1 * (bed.ridged(x / 25 + 5, y / 25, 3) - 0.4));
    if (inS[k]) z[k] = Math.min(-2, shaped);
    else { const w = 1 - smooth(dS[k] / band); z[k] = Math.min(-2, real[k] * (1 - w) + Math.min(real[k] * 0.5, shaped) * w); }
  }
}

// ---- Thaldur from a real island: an island of tens of thousands of people (c30-b74, c31-b48), so real relief and a
// real coast rather than a pinned slab
const FAMOUS_ISLANDS: [string, number, number][] = [
  ['Sicily', 14, 37.5], ['Sardinia', 9, 40], ['Corsica', 9.1, 42.1], ['Cyprus', 33.2, 35], ['Crete', 24.9, 35.2], ['Jamaica', -77.3, 18.1], ['Puerto Rico', -66.5, 18.2],
  ['Hawaii', -155.5, 19.6], ['Taiwan', 121, 23.7], ['Hainan', 110, 19.2], ['Sri Lanka', 80.7, 7.8], ['Vancouver Island', -125.5, 49.6], ['Tasmania', 146.6, -42],
  ['Shikoku', 133.5, 33.7], ['Kyushu', 131, 32.7], ['Long Island', -73, 40.8], ['Trinidad', -61.3, 10.4], ['Mallorca', 3, 39.6], ['Bali', 115.1, -8.4], ['Iceland', -19, 65],
  ['Hokkaido', 143, 43.4], ['Sakhalin', 143, 50], ['Svalbard', 17, 78.5], ['Zealand', 11.8, 55.5], ['Isle of Man', -4.5, 54.2], ['Newfoundland', -56, 48.9], ['Cape Breton', -60.8, 46.2],
];
type Island = { lon: number; lat: number; areaKm2: number; maxM: number; rot: number; mirror: boolean; iou: number; score: number };
const thaldurPin = () => regionPinsV5().find((p) => p.kind === 'land' && /Thaldur, an island/.test(p.why)) as Extract<Pin, { kind: 'land' }>;
function findIslands(): Island[] {
  const g = coarsen({ data: etopo(), w: ETOPO.w, h: ETOPO.h, res: ETOPO.res }, 2), w = g.w, h = g.h, d = g.data;
  const T = thaldurPin(), tp = T.poly;
  // Thaldur's outline in km about its centroid
  const tc: XY = [tp.reduce((a, q) => a + q[0], 0) / tp.length, tp.reduce((a, q) => a + q[1], 0) / tp.length];
  const toKm = (q: XY): XY => [(q[0] - tc[0]) * REGION.kmx(tc[0], tc[1]), (q[1] - tc[1]) * REGION.kmy];
  const tk = tp.map(toKm);
  const xs = tk.map((q) => q[0]), ys = tk.map((q) => q[1]);
  const pad = 40, grid: XY[] = [];
  for (let y = Math.min(...ys) - pad; y <= Math.max(...ys) + pad; y += 4) for (let x = Math.min(...xs) - pad; x <= Math.max(...xs) + pad; x += 4) grid.push([x, y]);
  const inT = grid.map((q) => pointInPoly(q[0], q[1], tk));
  const tArea = inT.filter(Boolean).length * 16;
  // label islands on the 2-arc-minute grid
  const lab = new Int32Array(w * h);
  const out: Island[] = [];
  let next = 1;
  const q: number[] = [];
  for (let s0 = 0; s0 < w * h; s0++) {
    if (lab[s0] || d[s0] < 0) continue;
    const id = next++;
    lab[s0] = id; q.length = 0; q.push(s0);
    let area = 0, sx = 0, sy = 0, mx = -1e9, edge = false;
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi], i = k % w, j = (k / w) | 0, lat = 90 - (j + 0.5) * g.res;
      const cell = (g.res * 111.32) ** 2 * Math.cos(rad(lat));
      area += cell; sx += i * cell; sy += j * cell; if (d[k] > mx) mx = d[k];
      if (j <= 0 || j >= h - 1) edge = true;
      if (area > 120000) { edge = true; }
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = (i + a + w) % w, jj = j + b; if (jj < 0 || jj >= h) continue; const n = jj * w + ii; if (!lab[n] && d[n] >= 0) { lab[n] = id; q.push(n); } }
    }
    if (edge || area < tArea * 0.5 || area > tArea * 2) continue;
    const lon = -180 + (sx / area + 0.5) * g.res, lat = 90 - (sy / area + 0.5) * g.res;
    if (lat > 75 || lat < -60) continue;
    if (FAMOUS_ISLANDS.some(([, lo, la]) => Math.abs(lo - lon) < 1.5 && Math.abs(la - lat) < 1.5)) continue;
    // the best rotation and mirror: overlap (intersection over union) of the island with Thaldur's drawn outline
    let best = { rot: 0, mirror: false, iou: -1 };
    for (let rot = 0; rot < 360; rot += 15) for (const mirror of [false, true]) {
      const th = rad(rot);
      let inter = 0, uni = 0;
      grid.forEach(([x, y], n) => {
        const mx2 = mirror ? -x : x, u = mx2 * Math.cos(th) - y * Math.sin(th), v = mx2 * Math.sin(th) + y * Math.cos(th);
        const z2 = sampleGrid(g, lon + u / (111.32 * Math.cos(rad(lat))), lat + v / 110.57), inI = z2 >= 0;
        if (inI && inT[n]) inter++;
        if (inI || inT[n]) uni++;
      });
      const iou = uni ? inter / uni : 0;
      if (iou > best.iou) best = { rot, mirror, iou };
    }
    const relief = mx >= 300 && mx <= 2500 ? 0.1 : mx > 2500 ? 0.03 : 0;
    out.push({ lon, lat, areaKm2: Math.round(area), maxM: mx, ...best, score: best.iou + relief });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 12);
}
/** Carry the chosen island's real heights into Thaldur's place (same rigid motion as the match), feathered over 60 km
 * outside the drawn outline. */
function transplantThaldur(z: Float32Array, isl: Island) {
  const tp = thaldurPin().poly, tc: XY = [tp.reduce((a, q) => a + q[0], 0) / tp.length, tp.reduce((a, q) => a + q[1], 0) / tp.length];
  const g: Grid16 = { data: etopo(), w: ETOPO.w, h: ETOPO.h, res: ETOPO.res }, th = rad(isl.rot);
  const xs = tp.map((q) => q[0]), ys = tp.map((q) => q[1]);
  for (let j = 0; j < REGION.h; j++) for (let i = 0; i < REGION.w; i++) {
    const x = REGION.x0 + i * REGION.dx, y = REGION.y0 + j * REGION.dy;
    if (x < Math.min(...xs) - 120 || x > Math.max(...xs) + 120 || y < Math.min(...ys) - 80 || y > Math.max(...ys) + 80) continue;
    const sd = polySigned(REGION, [x, y], tp), wgt = 1 - smooth((-sd - 20) / 60);
    if (wgt <= 0) continue;
    const dx = (x - tc[0]) * REGION.kmx(tc[0], tc[1]), dy = (y - tc[1]) * REGION.kmy, mx2 = isl.mirror ? -dx : dx;
    const u = mx2 * Math.cos(th) - dy * Math.sin(th), v = mx2 * Math.sin(th) + dy * Math.cos(th);
    const zi = sampleGrid(g, isl.lon + u / (111.32 * Math.cos(rad(isl.lat))), isl.lat + v / 110.57);
    const k = j * REGION.w + i;
    z[k] = wgt * zi + (1 - wgt) * z[k];
  }
}

/** The battle map's drawn shapes, held the v5 way (owner, 2026-10-12: "a sketch, not a survey"): each shape is held only
 * beyond a fractal line that wanders between 1 and 20 km in from its drawn edge (three scales, about 15, 45 and 120 km),
 * so where the rule rather than the real terrain draws the coast, it reads as a coast; where a shape is narrow (the
 * inlet, the strait, the peninsula's tip) the hold drops to half its local width, so the book's narrow features keep
 * their middle. Inside the 20 km band the real terrain decides. */
let narrowHold: Uint8Array | null = null; // cells held because a book shape is narrow there (the inlet, the strait, the peninsula's spine)
function applyFreePins(g: GridSpec, z: Float32Array, pins: Pin[]) {
  const nz = new Noise2(5150), cont = new Noise2(5151);
  if (!narrowHold || narrowHold.length !== z.length) narrowHold = new Uint8Array(z.length);
  for (const p of pins) {
    if (!('poly' in p) || !(p.kind === 'sea' || p.kind === 'land' || p.kind === 'land-box')) continue;
    const band = (p as { band: number }).band, xs = p.poly.map((q) => q[0]), ys = p.poly.map((q) => q[1]);
    const padC = p.kind === 'sea' && p.open ? Math.ceil(230 / g.dx) : 2;
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - g.x0) / g.dx) - padC * 2), i1 = Math.min(g.w - 1, Math.ceil((Math.max(...xs) - g.x0) / g.dx) + padC * 2);
    const j0 = Math.max(0, Math.floor((Math.min(...ys) - g.y0) / g.dy) - padC), j1 = Math.min(g.h - 1, Math.ceil((Math.max(...ys) - g.y0) / g.dy) + padC);
    const bw = i1 - i0 + 1, bh = j1 - j0 + 1, sd = new Float32Array(bw * bh);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const q: XY = [g.x0 + i * g.dx, g.y0 + j * g.dy];
      let v = polySigned(g, q, p.poly, p.kind === 'sea' ? p.open : undefined);
      if (p.kind === 'land-box') for (const sea of p.seas) v = Math.min(v, -polySigned(g, q, sea));
      // the drawing's border is where the picture stops, not a coast: inside, the sea is held right up to it (the test
      // is measured from the drawn coast); beyond it, the sea runs on and fades out along a fractal line 20 to 120 km
      // out, so it ends like water rather than at a ruled edge
      if (p.kind === 'sea' && p.open && v < 0) {
        let dOpen = Infinity, dCoast = Infinity;
        p.poly.forEach((a, e) => { const b2 = p.poly[(e + 1) % p.poly.length]; const ax = (a[0] - q[0]) * REGION.kmx(q[0], q[1]), ay = (a[1] - q[1]) * REGION.kmy, bx = (b2[0] - q[0]) * REGION.kmx(q[0], q[1]), by = (b2[1] - q[1]) * REGION.kmy, dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1))), d2 = Math.hypot(ax + t * dx, ay + t * dy); if (p.open![e]) dOpen = Math.min(dOpen, d2); else dCoast = Math.min(dCoast, d2); });
        // its sides wander too: the line between "nearer the border" and "nearer a drawn coast" is pushed about by noise
        if (dOpen < dCoast + 45 * cont.fbm(q[0] / 35 - 4, q[1] / 35 + 2, 3)) { const reach = 60 + 160 * Math.max(0, Math.min(1, 0.5 + 0.5 * cont.fbm(q[0] / 40, q[1] / 40, 2) + 0.35 * cont.fbm(q[0] / 13 + 9, q[1] / 13, 2))); v = Math.min(reach - dOpen, dCoast + 20); }
      }
      sd[(j - j0) * bw + (i - i0)] = v;
    }
    // the local width: the largest distance to the edge within about 30 km (a separable max filter)
    const r = Math.ceil(30 / g.dx), tmp = new Float32Array(sd.length), near = new Float32Array(sd.length);
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) { let m = -Infinity; for (let a = Math.max(0, i - r); a <= Math.min(bw - 1, i + r); a++) m = Math.max(m, sd[j * bw + a]); tmp[j * bw + i] = m; }
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) { let m = -Infinity; for (let b = Math.max(0, j - r); b <= Math.min(bh - 1, j + r); b++) m = Math.max(m, tmp[b * bw + i]); near[j * bw + i] = m; }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const n = (j - j0) * bw + (i - i0), v = sd[n];
      if (v <= 0) continue;
      if (p.kind === 'sea' && /battle map's northern sea/.test(p.why)) { const [lo2, la2] = REGION.toLL(g.x0 + i * g.dx, g.y0 + j * g.dy), [fx, fy] = llToFrame('northshore', lo2, la2); if (fx < 150 && fy > 45) continue; } // the inlet arm: its role is held by its own strip
      const x = g.x0 + i * g.dx, y = g.y0 + j * g.dy;
      const u = Math.max(0.05, Math.min(1, 0.5 + 0.45 * nz.fbm(x / 15, y / 15, 2) + 0.35 * nz.fbm(x / 45 + 7, y / 45, 2) + 0.25 * nz.fbm(x / 120 - 3, y / 120, 2)));
      // a shape's thin tip (half-width under 8 km) is not held: the terrain decides how it ends
      if (near[n] < 8 && !/strait/.test(p.why)) continue;
      const thr = Math.min(band * u, 0.5 * near[n]);
      if (v <= thr) continue;
      const k = j * g.w + i;
      if (thr < band * u) narrowHold[k] = 1;
      if (p.kind === 'sea') z[k] = Math.min(z[k], -12 - 25 * smooth((v - thr) / 45));
      else z[k] = Math.max(z[k], (p as { min: number }).min);
    }
  }
}
const isFree = (p: Pin) => !!(p as { free?: boolean }).free;
/** Every pin, in the order below. */
function applyAll(g: GridSpec, z: Float32Array, pins: Pin[]) {
  // the battle map's broad shapes first (its seas, then its land), then v4's other pins (Northglade's island and its
  // ring, the places, Redshire's islands), which must win over them, then the strait
  applyFreePins(g, z, pins.filter((p) => isFree(p) && p.kind === 'sea' && !/strait/.test(p.why)));
  applyFreePins(g, z, pins.filter((p) => isFree(p) && p.kind !== 'sea'));
  applyPins(g, z, pins.filter((p) => !isFree(p)));
  applyFreePins(g, z, pins.filter((p) => isFree(p) && /strait/.test(p.why)));
}
/** Spurs and slivers the rules left behind (narrower than about 12 km), removed by an opening of two cells, but only
 * on terrain the pins changed: real coasts and named book features are left alone. */
function openChanged(g: GridSpec, z: Float32Array, before: Float32Array, pins: Pin[]) {
  const named = pins.filter((p) => /Northglade's island|a strait between|Redshire's south islands|Islands: water|is on land|attached to Northshore|peninsula|Thaldur, an island|The inlet/.test(p.why));
  const prot = new Uint8Array(z.length);
  for (const p of named) { const probe = new Float32Array(z.length); applyAll(g, probe, [p]); for (let k = 0; k < z.length; k++) if (probe[k] !== 0) prot[k] = 1; }
  if (narrowHold && narrowHold.length === z.length) for (let k = 0; k < z.length; k++) if (narrowHold[k]) prot[k] = 1;
  for (const landSide of [true, false]) {
    const m = new Uint8Array(z.length);
    for (let k = 0; k < z.length; k++) m[k] = (z[k] >= 0) === landSide ? 1 : 0;
    const R = landSide ? 2 : 4, R2 = landSide ? 5 : 17; // sea pockets the rules made (lagoons) go if under about 25 km across
    const morph = (src: Uint8Array, erode: boolean) => { const out = new Uint8Array(src.length); for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { let v = erode ? 1 : 0; for (let b = -R; b <= R && (erode ? v : !v); b++) for (let a = -R; a <= R; a++) { if (a * a + b * b > R2) continue; const ii = i + a, jj = j + b; const s2 = ii < 0 || jj < 0 || ii >= g.w || jj >= g.h ? src[j * g.w + i] : src[jj * g.w + ii]; if (erode && !s2) { v = 0; break; } if (!erode && s2) { v = 1; break; } } out[j * g.w + i] = v; } return out; };
    const opened = landSide ? morph(morph(m, true), false) : m;
    const inBattle = (k: number) => { if (g !== REGION) return false; const [lo, la] = REGION.toLL(cxy(g, k)[0], cxy(g, k)[1]); return lo > nsBox[0] - 2 && lo < nsBox[2] + 2 && la > nsBox[1] - 1 && la < nsBox[3] + 1; };
    const opened2 = landSide ? opened : morph(morph(m, true), false);
    const small = landSide ? opened : (() => { const R0 = 2, out2 = new Uint8Array(m.length); const er = new Uint8Array(m.length); for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { let v = 1; for (let b = -R0; b <= R0 && v; b++) for (let a = -R0; a <= R0; a++) { if (a * a + b * b > 5) continue; const ii = i + a, jj = j + b; const s2 = ii < 0 || jj < 0 || ii >= g.w || jj >= g.h ? m[j * g.w + i] : m[jj * g.w + ii]; if (!s2) { v = 0; break; } } er[j * g.w + i] = v; } for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { let v = 0; for (let b = -R0; b <= R0 && !v; b++) for (let a = -R0; a <= R0; a++) { if (a * a + b * b > 5) continue; const ii = i + a, jj = j + b; const s2 = ii < 0 || jj < 0 || ii >= g.w || jj >= g.h ? er[j * g.w + i] : er[jj * g.w + ii]; if (s2) { v = 1; break; } } out2[j * g.w + i] = v; } return out2; })();
    for (let k = 0; k < z.length; k++) {
      const op = landSide ? opened2[k] : inBattle(k) ? opened2[k] : small[k]; // the wider sea opening only in the battle map's area
      if (!m[k] || op || prot[k]) continue;
      const changed = (before[k] >= 0) !== landSide || Math.abs(z[k] - before[k]) > 30;
      if (!changed) continue;
      z[k] = landSide ? -3 : 3;
    }
  }
}

/** The inner sea from a real bay: its real shoreline and seabed carried into the bay's box, feathered over about
 * 150 km at the box's edge (an irregular feather), after the Northshore patch is blended in. */
function transplantBay(z: Float32Array, bx: Xf) {
  const nz = new Noise2(8181), g: Grid16 = { data: etopo(), w: ETOPO.w, h: ETOPO.h, res: ETOPO.res };
  for (let k = 0; k < z.length; k++) {
    const [x, y] = cxy(REGION, k), [lo, la] = REGION.toLL(x, y);
    if (lo < bayBox[0] - 3 || lo > bayBox[2] + 3 || la < bayBox[1] - 1.5 || la > bayBox[3] + 1.5) continue;
    const [px, py] = llToFrame('northshore', lo, la);
    const inside = Math.min(px - BAY_BOX[0], BAY_BOX[2] - px, py - BAY_BOX[1], BAY_BOX[3] - py) * 2.6; // km inside the box
    const w = smooth((inside + 40 * nz.fbm(x / 60, y / 60, 3)) / 150);
    if (w <= 0) continue;
    const [slo, sla] = toSource('bay', bx, lo, la);
    z[k] = w * sampleGrid(g, slo, sla) + (1 - w) * z[k];
  }
}

/** No land or sea feature narrower than about 5 km (one cell, 3 km here), unless it is a named book feature: a land
 * cell with sea on both opposite sides becomes sea, a sea cell with land on both opposite sides becomes land.
 * Protected: Northglade's island and its ring, the strait, the peninsula, Thaldur, Redshire's islands and their ring,
 * and every named place. Repeated until nothing changes. */
function removeThin(g: GridSpec, z: Float32Array, pins: Pin[]) {
  const named = pins.filter((p) => /Northglade's island|a strait between|peninsula|Thaldur|Redshire's south islands|Islands: water|is on land|attached to Northshore|The inlet/.test(p.why));
  const prot = new Float32Array(z.length);
  for (const p of named) { const probe = new Float32Array(z.length); applyPins(g, probe, [p]); for (let k = 0; k < z.length; k++) if (probe[k] !== 0) prot[k] = 1; }
  const opp = [[[1, 0], [-1, 0]], [[0, 1], [0, -1]], [[1, 1], [-1, -1]], [[1, -1], [-1, 1]]];
  for (let pass = 0; pass < 6; pass++) {
    let changed = 0;
    for (let j = 1; j < g.h - 1; j++) for (let i = 1; i < g.w - 1; i++) {
      const k = j * g.w + i;
      if (prot[k]) continue;
      const land = z[k] >= 0;
      const thin = opp.some(([[a1, b1], [a2, b2]]) => (z[(j + b1) * g.w + i + a1] >= 0) !== land && (z[(j + b2) * g.w + i + a2] >= 0) !== land);
      if (!thin) continue;
      z[k] = land ? -3 : 3;
      changed++;
    }
    if (!changed) break;
  }
}

/** v4's finishing steps on real heights: soft and hard pins, a light erosion so the pins settle in,
 * the book's river carved, lakes and rivers from the real drainage, climate from the book's latitudes.
 * Unlike v4 the seabed is left as measured (no smoothing, no added noise). */
const FOREST_V5 = new Set<string>(['boreal pine forest', 'temperate forest', 'subtropical forest', 'tropical forest']);
let lastTouched: Uint8Array | null = null; // cells the pins and v5's rules changed in the last finishReal (not erosion)
function finishReal(g: Frame | CityFrame, z: Float32Array, pins: Pin[], seed: number, droplets: number, hScale: number, lake: [number, number, number?, number?, number?], riverKm2: number, latOf: (y: number) => number, toLL: (x: number, y: number) => XY, renderPx: number, noRiver?: (x: number, y: number) => boolean, noLake?: (x: number, y: number) => boolean): FrameRun {
  // where the book's shape and the real terrain disagree, bring the real terrain near sea level first, so the
  // pins reshape a coast rather than build a wall out of deep water (or cut a trench through mountains)
  const wantLand = new Float32Array(z.length), wantSea = new Float32Array(z.length);
  applyAll(g, wantLand, pins.filter((p) => p.kind === 'land' || p.kind === 'land-disk' || p.kind === 'land-box'));
  applyAll(g, wantSea, pins.filter((p) => p.kind === 'sea' || p.kind === 'sea-poly' || p.kind === 'sea-ring'));
  const orig = Float32Array.from(z); // the real terrain as it came in
  for (let k = 0; k < z.length; k++) { if (wantLand[k] > 0) z[k] = Math.max(z[k], -40); if (wantSea[k] < 0) z[k] = Math.min(z[k], 40); }
  const before = Float32Array.from(z);
  softPins(g, z, pins.filter((p) => !(p as { free?: boolean }).free)); // the battle map's coasts: no pull, the real terrain decides
  // soft pulls only where they are needed: real land in a sea's band stays as it was if already low, real sea in a land band likewise
  for (let k = 0; k < z.length; k++) { if (z[k] < before[k] && before[k] < -30) z[k] = before[k]; if (z[k] > before[k] && before[k] > 30) z[k] = before[k]; }
  applyAll(g, z, pins);
  // where a pin had to make land out of real sea, give it real-looking relief (several scales, ridges), not a flat plate
  const hills = new Noise2(seed + 4242);
  for (let k = 0; k < z.length; k++) if (before[k] < 0 && z[k] >= 0) { const [x, y] = cxy(g, k); z[k] = Math.max(z[k], 0) + 30 + 150 * (0.5 + 0.5 * hills.fbm(x / 60, y / 60, 5)) + 160 * Math.max(0, hills.ridged(x / 22, y / 22, 4) - 0.35) + 25 * (0.5 + 0.5 * hills.fbm(x / 6, y / 6, 3)); } // always positive, so the pin's floor never flattens it
  if (droplets) erodeDroplets(g, z, droplets, seed, hScale);
  applyAll(g, z, pins);
  const preRules = Float32Array.from(z);
  openChanged(g, z, before, pins);
  removeThin(g, z, pins);
  if (g.dx < 0.5) {
    // city frames: specks of real ground just below sea level (a few cells) are not water; they lift to 1 m
    const seen = new Uint8Array(z.length);
    for (let s0 = 0; s0 < z.length; s0++) {
      if (seen[s0] || z[s0] >= 0) continue;
      const q = [s0]; seen[s0] = 1;
      for (let qi = 0; qi < q.length && q.length <= 200; qi++) { const k = q[qi], i = k % g.w, j = (k / g.w) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= g.w || jj >= g.h) continue; const n = jj * g.w + ii; if (!seen[n] && z[n] < 0) { seen[n] = 1; q.push(n); } } }
      if (q.length <= 200) for (const k of q) z[k] = 1;
    }
  }
  // where the lift toward land did not end as land (trimmed, opened, sunk), the real depth comes back: no shallow plates
  // stranded in deep water
  for (let k = 0; k < z.length; k++) if (z[k] < 0 && orig[k] < z[k] && wantSea[k] >= 0 && orig[k] < -40) z[k] = orig[k];
  if (g === REGION) {
    // unpinned islets under about 400 km² in the battle map's area (pale dots at this scale) sink to the sea around them
    const seen = new Uint8Array(z.length), probe = new Float32Array(z.length);
    applyAll(g, probe, pins.filter((p) => p.kind === 'land' || p.kind === 'land-disk' || p.kind === 'shape'));
    for (let s0 = 0; s0 < z.length; s0++) {
      if (seen[s0] || z[s0] < 0) continue;
      const q = [s0]; seen[s0] = 1; let pinned = probe[s0] > 0;
      for (let qi = 0; qi < q.length && q.length <= 40; qi++) { const k = q[qi], i = k % g.w, j = (k / g.w) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (j + b) * g.w + i + a; if (n >= 0 && n < z.length && !seen[n] && z[n] >= 0) { seen[n] = 1; q.push(n); if (probe[n] > 0) pinned = true; } } }
      if (pinned || q.length > 40) continue;
      const [lo, la] = REGION.toLL(cxy(g, s0)[0], cxy(g, s0)[1]);
      if (lo < nsBox[0] - 4 || lo > nsBox[2] + 4 || la < nsBox[1] - 2 || la > nsBox[3] + 2) continue;
      for (const k of q) z[k] = -25;
    }
    // isolated shoals and specks (under about 60 m deep, the sea 15 km around them deeper than 300 m) in the battle
    // map's area are pale dots, not features: they take the depth around them
    for (let j = 3; j < g.h - 3; j++) for (let i = 3; i < g.w - 3; i++) {
      const k = j * g.w + i;
      if (z[k] < -60) continue;
      const [lo, la] = REGION.toLL(cxy(g, k)[0], cxy(g, k)[1]);
      if (lo < nsBox[0] - 4 || lo > nsBox[2] + 4 || la < nsBox[1] - 2 || la > nsBox[3] + 2) continue;
      const ring: number[] = [];
      for (let b = -5; b <= 5; b++) for (let a = -5; a <= 5; a++) if (Math.max(Math.abs(a), Math.abs(b)) >= 4) { const n = (j + b) * g.w + i + a; if (n >= 0 && n < z.length) ring.push(z[n]); }
      ring.sort((x, y) => x - y);
      if (ring[ring.length - 1] < -150) z[k] = ring[ring.length >> 1];
    }
  }
  {
    const probe = new Float32Array(z.length);
    applyAll(g, probe, pins.filter((p) => p.kind !== 'cover' && p.kind !== 'river'));
    lastTouched = new Uint8Array(z.length);
    for (let k = 0; k < z.length; k++) if (probe[k] !== 0 || (preRules[k] >= 0) !== (z[k] >= 0) || (before[k] >= 0) !== (z[k] >= 0)) lastTouched[k] = 1;
  }
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
    // real sea keeps its real depth; sea a pin made out of real land gets a synthetic seabed, solved as a smooth surface
    // (Laplace) between the coast (5 m) and the surrounding real seabed, then graded into the real seabed over 300 km
    const synth: number[] = [];
    for (let k = 0; k < z.length; k++) if (made[k]) { if (before[k] < 0) z[k] = Math.min(-2, before[k]); else synth.push(k); }
    if (synth.length) synthSeabed(g, z, synth, bed);
    if (lastTouched) for (const k of synth) lastTouched[k] = 1;
  }
  {
  }
  dropSpecks(g, z, pins, 80);
  const carved = carve(g, z, pins);
  const hydro = hydrology(g, z, lake[0], lake[1], riverKm2, noRiver, noLake, carved, lake[2] ?? 10, lake[3] ?? Infinity, lake[4] ?? 0);
  const clim = climate(g, z, hydro.lakes, latOf);
  // cover pins: forest covers are feathered into the climate's own biome (the edge wanders by up to about a third of the
  // cover's size, at least 25 km in the region and 250 m in a city) and never replace a forest the climate already made;
  // other covers (the built-up grid) keep their edge
  const featherNz = new Noise2(seed + 919);
  for (const p of pins) {
    if (p.kind !== 'cover') continue;
    const biome = B(p.biome as (typeof BIOMES)[number]), forestCover = FOREST_V5.has(p.biome);
    const xs = p.poly.map((q) => q[0]), ys = p.poly.map((q) => q[1]);
    const size = Math.min((Math.max(...xs) - Math.min(...xs)) * g.kmx(0, 0), (Math.max(...ys) - Math.min(...ys)) * g.kmy);
    const F = forestCover ? Math.max(g.dx > 1 ? 25 : 0.25, 0.35 * size) : 0;
    for (let k = 0; k < z.length; k++) {
      if (z[k] < 0 || hydro.lakes[k]) continue;
      const q = cxy(g, k);
      if (q[0] < Math.min(...xs) - F || q[0] > Math.max(...xs) + F || q[1] < Math.min(...ys) - F || q[1] > Math.max(...ys) + F) continue;
      const sd = polySigned(g, q, p.poly);
      // the edge: broad lobes, plus a fine patchy fringe a few cells wide, like the climate's own forest edge
      // (the threshold spreads across the whole band, from 30% of F outside the line to F inside it)
      const u = Math.max(0, Math.min(1, 0.5 + 1.6 * featherNz.fbm(q[0] / (F * 0.6), q[1] / (F * 0.6), 4) + 0.9 * featherNz.fbm(q[0] / (2.5 * g.dx) + 17, q[1] / (2.5 * g.dx), 2)));
      if (sd <= (F ? F * (1.3 * u - 0.3) : 0)) continue;
      if (forestCover && FOREST_V5.has(BIOMES[clim.biome[k]])) continue;
      clim.biome[k] = biome;
    }
  }
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
function cityHeights(cf: CityFrame, c: CityXf, stride = 1, cross = true, heavy?: (x: number, y: number) => number): { z: Float32Array; w: number; h: number; plain: number } {
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
  // With a mask (the builds), the 150 m smoothing applies only where the mask asks for flat ground (Pafogai Du's grid,
  // Meldan's plain inside the city), and about 40 m (SRTM's own pixel) everywhere else, so real ridges stay sharp
  const boxBlur = (src: Float32Array, r: number) => {
    let cur = Float32Array.from(src);
    for (let pass = 0; pass < 2; pass++) {
      const t = new Float32Array(cur.length), o = new Float32Array(cur.length);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s2 = 0, n2 = 0; for (let a = -r; a <= r; a++) { const ii = i + a; if (ii >= 0 && ii < w) { s2 += cur[j * w + ii]; n2++; } } t[j * w + i] = s2 / n2; }
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s2 = 0, n2 = 0; for (let b = -r; b <= r; b++) { const jj = j + b; if (jj >= 0 && jj < h) { s2 += t[jj * w + i]; n2++; } } o[j * w + i] = s2 / n2; }
      cur = o;
    }
    return cur;
  };
  const heavyZ = boxBlur(z, Math.max(1, Math.round(0.15 / dk)));
  if (!heavy) z.set(heavyZ);
  else {
    const lightZ = boxBlur(z, Math.max(1, Math.round(0.02 / dk)));
    for (let k = 0; k < z.length; k++) { const wgt = heavy(cf.x0 + (k % w) * dk, cf.y0 + ((k / w) | 0) * dk); z[k] = wgt * heavyZ[k] + (1 - wgt) * lightZ[k]; }
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
    // the edges beyond the drawing are not ruled lines: each is cut into pieces pushed outward by 15 to 60 px (noise),
    // so where the real terrain beyond is land, the coast there is irregular
    const nz2 = new Noise2(9907), fin: XY[] = [], finOpen: boolean[] = [];
    out.forEach((q, i) => {
      fin.push(q); finOpen.push(open[i]);
      if (!open[i]) return;
      const r = out[(i + 1) % out.length], len = Math.hypot(r[0] - q[0], r[1] - q[1]);
      if (len < 20) return;
      const mx = (q[0] + r[0]) / 2, my = (q[1] + r[1]) / 2;
      let nx = -(r[1] - q[1]) / len, ny = (r[0] - q[0]) / len;
      if (nx * (mx - 120) + ny * (my - 120) < 0) { nx = -nx; ny = -ny; }
      const pieces = Math.ceil(len / 4);
      for (let t = 1; t < pieces; t++) {
        const x = q[0] + ((r[0] - q[0]) * t) / pieces, y = q[1] + ((r[1] - q[1]) * t) / pieces, off = 15 + 45 * (0.5 + 0.5 * nz2.fbm(x / 11, y / 11, 4));
        fin.push([x + nx * off, y + ny * off]); finOpen.push(true);
      }
    });
    return { ...p, poly: fin.map(fromNs), open: finOpen };
  };
  // the battle map's seas: their drawn outlines, clipped just inside the drawing and not extended past it (the hold
  // stops irregularly before the border instead; see applyFreePins); the border edges are open
  const inner: XY[] = [[2, 2], [238, 2], [238, 238], [2, 238]];
  const drawnSea = (id: string): { poly: XY[]; open: boolean[] } => {
    const c = clipPoly(pts(place(W, id)), inner), onB = (q: XY) => q[0] < 2.5 || q[0] > 237.5 || q[1] < 2.5 || q[1] > 237.5;
    return { poly: c.map(fromNs), open: c.map((q, i) => { const r = c[(i + 1) % c.length]; return onB(q) && onB(r) && (Math.abs(q[0] - r[0]) < 0.5 || Math.abs(q[1] - r[1]) < 0.5); }) };
  };
  void extend;
  const all = regionPins().map((p) => (p.kind === 'sea' && /battle map's northern sea/.test(p.why) ? { ...p, ...drawnSea('north_sea') } : p.kind === 'sea' && /battle map's southern sea/.test(p.why) ? { ...p, ...drawnSea('south_sea') } : p));
  const attach = all.find((p) => p.kind === 'land' && /attached to Northshore/.test(p.why));
  const join: XY = attach && 'poly' in attach ? [attach.poly.reduce((a, q) => a + q[0], 0) / attach.poly.length, attach.poly.reduce((a, q) => a + q[1], 0) / attach.poly.length] : [0, 0];
  return all.map((p) => {
    if (p.kind !== 'land-box') return p;
    const c = p.poly, cx = c.reduce((a, q) => a + q[0], 0) / c.length, cy = c.reduce((a, q) => a + q[1], 0) / c.length;
    const out: XY[] = [];
    for (let e = 0; e < c.length; e++) {
      const a = c[e], b = c[(e + 1) % c.length];
      for (let t = 0; t < 120; t++) {
        const x = a[0] + ((b[0] - a[0]) * t) / 120, y = a[1] + ((b[1] - a[1]) * t) / 120;
        // km beyond the original 26 km inset; none where the peninsula joins Northshore, so it stays attached
        const len = Math.hypot(cx - x, cy - y), inset = Math.max(0, 75 + 75 * nz.fbm(x / 140, y / 140, 2) + 45 * nz.fbm(x / 45 + 3, y / 45, 3) + (6 + 10 * (0.5 + 0.5 * nz.fbm(x / 60 + 9, y / 60, 2))) * nz.fbm(x / 11 - 5, y / 11, 4)) * smooth((kmDist(REGION, [x, y], join) - 40) / 50);
        out.push([x + ((cx - x) / len) * inset, y + ((cy - y) / len) * inset]);
      }
    }
    return { ...p, poly: out, why: `${p.why} (held inside an irregular inset from the drawing's border)` };
  })
    // Thaldur's open-water rectangles (ours) are covered by the open sea east of Northshore; their ruled edges went
    .filter((p) => !(p.kind === 'sea' && /open water (north|south) of it/.test(p.why)))
    // the book's strait between Thaldur and the peninsula, and the peninsula's join to Northshore: the same areas,
    // their edges irregular rather than ruled
    .map((p) => {
      if (!((p.kind === 'sea' && /a strait between it and the peninsula/.test(p.why)) || (p.kind === 'land' && /attached to Northshore/.test(p.why)))) return p;
      const nz3 = new Noise2(4401), c = p.poly.map(toNs), cx = c.reduce((a, q) => a + q[0], 0) / c.length, cy = c.reduce((a, q) => a + q[1], 0) / c.length, outS: XY[] = [];
      c.forEach((q, i) => { const r = c[(i + 1) % c.length]; for (let t = 0; t < 10; t++) { const x = q[0] + ((r[0] - q[0]) * t) / 10, y = q[1] + ((r[1] - q[1]) * t) / 10, len = Math.hypot(x - cx, y - cy) || 1, off = 4 * nz3.fbm(x / 6, y / 6, 2); outS.push([x + ((x - cx) / len) * off, y + ((y - cy) / len) * off]); } });
      return { ...p, poly: outS.map(fromNs) };
    })
    // the battle map is a sketch, not a survey (owner, 2026-10-12): its drawn coasts may move within 20 km, the real
    // terrain deciding the line inside the band (no soft pull toward the drawing); only the interior is held
    .map((p) => (BATTLE_COAST.test(p.why) && (p.kind === 'sea' || p.kind === 'land' || p.kind === 'land-box') ? ({ ...p, band: 20, free: true, why: `${p.why} (its drawn coast may move within 20 km)` } as unknown as Pin) : p))
    // the peninsula and the inlet keep their roles, not their drawn outlines (owner, 2026-10-12): the peninsula is a
    // land strip attached to Northshore pointing at Thaldur; the inlet is water from the open northern sea down to the
    // border river's mouth. Each is held only as a narrow, meandering core; the real terrain shapes the rest
    .filter((p) => !(p.kind === 'land' && /peninsula dangling|attached to Northshore/.test(p.why)))
    .concat([
      ribbon('land', [[215, 112], [250, 106], [275, 113], [300, 104], [322, 110], [340, 107]], 12, 55, 'The peninsula: a land strip attached to Northshore\'s eastern end, pointing at Thaldur (its role; its outline is the terrain\'s)', ['wg-375'], toNs, fromNs, 1, 6, 9),
      ribbon('sea', [[124, 22], [112, 44], [120, 62], [101, 80], [104, 97], [86, 110], [84, 120], [78, 124]], 6, 20, 'The inlet: water from the open northern sea down to the border river\'s mouth (its role; its outline is the terrain\'s)', ['wg-366', 'wg-370', 'wg-373'], toNs, fromNs, 2, 8, 4),
      meldanWoods(),
    ]);
}
/** A meandering strip along a spine (battle map pixels), held as land or sea; its half-width varies between lo and hi km. */
function ribbon(kind: 'land' | 'sea', spine: XY[], lo: number, hi: number, why: string, lines: string[], _toNs: (q: XY) => XY, fromNs: (q: XY) => XY, seed: number, amp = 6, edge = 0): Pin {
  const nz = new Noise2(7700 + seed), left: XY[] = [], right: XY[] = [];
  let along = 0, total = 0;
  for (let s3 = 0; s3 < spine.length - 1; s3++) total += Math.hypot(spine[s3 + 1][0] - spine[s3][0], spine[s3 + 1][1] - spine[s3][1]);
  for (let s2 = 0; s2 < spine.length - 1; s2++) {
    const a = spine[s2], b = spine[s2 + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    for (let t = 0; t < Math.ceil(len); t++) {
      const f = t / Math.ceil(len), d = along + len * f, x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
      // the strip narrows to a rounded end over its last 15%; its two edges wander independently (edge, in px)
      const endF = Math.min(1, (along + len * f) / 1) , tail = Math.sqrt(Math.max(0.05, Math.min(1, (total - d) / (0.15 * total))));
      const off = amp * nz.fbm(d / 25, 0.3, 3), hw = ((lo + (hi - lo) * (0.5 + 0.5 * nz.fbm(d / 12 + 5, 1.7, 2))) / 2.6) * tail;
      const eL = edge * (0.5 + 0.5 * nz.fbm(d / 4 + 11, 3.1, 3)), eR = edge * (0.5 + 0.5 * nz.fbm(d / 4 - 7, 5.3, 3));
      void endF;
      left.push([x + nx * (off + hw + eL), y + ny * (off + hw + eL)]); right.push([x + nx * (off - hw - eR), y + ny * (off - hw - eR)]);
    }
    along += len;
  }
  const poly = [...left, ...right.reverse()].map(fromNs);
  return kind === 'land' ? { kind: 'land', poly, band: 0, min: 25, why, provenance: 'book', lines } : { kind: 'sea', poly, band: 0, depth: -40, why, provenance: 'book', lines };
}
const BATTLE_COAST = /battle map's northern sea|battle map's southern sea|battle map's dark ground|peninsula dangling|Thaldur, an island|a strait between it and the peninsula/;
/** Meldan is wooded (c1-b2 "tall trees towering on both sides"; c32-b107 Kalimar is "not too different from a forest"):
 * forest cover about 60 km around it at region scale, so the region agrees with the city frame. The climate rules
 * are unchanged; this is a cover pin like Elenar Forest's. */
function meldanWoods(): Pin {
  const c = REGION.fromLL(8, 52), nz = new Noise2(6060), poly: XY[] = [];
  for (let t = 0; t < 96; t++) { const an = (t / 96) * 2 * Math.PI, r = 65 * (1 + 0.45 * nz.fbm(Math.cos(an) * 2.2, Math.sin(an) * 2.2, 4)); poly.push([c[0] + (r * Math.cos(an)) / REGION.kmx(c[0], c[1]), c[1] + (r * Math.sin(an)) / REGION.kmy]); }
  return { kind: 'cover', poly, biome: 'temperate forest', why: 'Meldan is wooded: "tall trees towering on both sides" (c1-b2); Kalimar is "not too different from a forest" (c32-b107)', provenance: 'book', lines: ['wg-306'] };
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
    // its west side follows the battle map's edge, but wanders (0 to 18 px) rather than running straight
    const x = Math.cos(an) > 0 ? 244 + 235 * r * Math.cos(an) : 244 + 18 * (0.5 + 0.5 * nz.fbm(3.3, an * 4, 3)), y = 115 + 85 * r * Math.sin(an);
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
function blendNorthshore(zr: Float32Array, zp: Float32Array | null, core: [number, number, number, number] = NS_CORE, feather = 250): Float32Array {
  const nz = new Noise2(3131), W = new Float32Array(zr.length);
  for (let k = 0; k < zr.length; k++) {
    const [x, y] = cxy(REGION, k);
    const [lo, la] = REGION.toLL(x, y);
    if (lo < nsBox[0] - 7 || lo > nsBox[2] + 7 || la < nsBox[1] - 4 || la > nsBox[3] + 4) continue;
    const [px, py] = llToFrame('northshore', lo, la);
    const out = Math.max(core[0] - px, px - core[2], core[1] - py, py - core[3], 0) * 2.6;
    const w = 1 - smooth((out + 90 * nz.fbm(x / 110, y / 110, 3)) / feather);
    W[k] = Math.max(0, w);
    if (w > 0 && zp) zr[k] = w * zp[k] + (1 - w) * zr[k];
  }
  return W;
}

export { applyAll as applyAllExport };
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
  // Northshore can be searched for a chosen region candidate (--region=N), to match it around the blend
  const regionXf = frame === 'northshore' && args.region ? (() => { const c = JSON.parse(readFileSync(path.join(ROOT, REC, 'search-region.json'), 'utf8')).candidates[Number(args.region) - 1]; return { lon: c.source_centre_lon_lat[0], lat: c.source_centre_lon_lat[1], rot: c.rotation_deg, mirror: c.mirrored } as Xf; })() : undefined;
  if (frame === 'bay') {
    const R0 = JSON.parse(readFileSync(path.join(ROOT, REC, 'search-region.json'), 'utf8')).candidates[0], N0 = JSON.parse(readFileSync(path.join(ROOT, REC, 'search-northshore.json'), 'utf8')).candidates[Number(args.northshore ?? 1) - 1];
    bayRefs = { region: { lon: R0.source_centre_lon_lat[0], lat: R0.source_centre_lon_lat[1], rot: R0.rotation_deg, mirror: R0.mirrored }, ns: { lon: N0.source_centre_lon_lat[0], lat: N0.source_centre_lon_lat[1], rot: N0.rotation_deg, mirror: N0.mirrored } };
  }
  const picked = search(frame, top, regionXf);
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
  const box2 = frame === 'bay' ? bayBox : nsBox;
  const [i0, j0, i1, j1] = frame === 'northshore' || frame === 'bay' ? (() => { const a = f.fromLL(box2[0] - (frame === 'bay' ? 3 : 0), box2[1] - (frame === 'bay' ? 1.5 : 0)), b2 = f.fromLL(box2[2] + (frame === 'bay' ? 3 : 0), box2[3] + (frame === 'bay' ? 1.5 : 0)); return [Math.floor(a[0] / f.dx), Math.floor(a[1] / f.dy), Math.ceil(b2[0] / f.dx), Math.ceil(b2[1] / f.dy)]; })() : [0, 0, f.w, f.h];
  const S = frame === 'northshore' || frame === 'bay' ? 1 : 3, w = Math.floor((i1 - i0) / S), h = Math.floor((j1 - j0) / S);
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
} else if (step === 'seamfile') {
  // the seam check on a saved region height file (16-bit PNG as written by build), with a given blend:
  // --core=-20,-10,440,250 --feather=220 reproduces the first v5 build's blend
  const buf = readFileSync(args.file);
  const idat: Buffer[] = [];
  for (let o = 8; o < buf.length;) { const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8); if (type === 'IDAT') idat.push(buf.subarray(o + 8, o + 8 + len)); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)), w = REGION.w, h = REGION.h, z = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let i = 0; i < w; i++) z[(h - 1 - r) * w + i] = raw.readUInt16BE(r * (w * 2 + 1) + 1 + i * 2) - 32768;
  const core = (args.core ?? NS_CORE.join(',')).split(',').map(Number) as [number, number, number, number];
  const W = blendNorthshore(new Float32Array(z.length), null, core, Number(args.feather ?? 250));
  const res = seamChecks({ g: REGION, z } as unknown as FrameRun, W);
  for (const c of res.checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.check}: ${c.got}`);
  for (const [k, v] of Object.entries(res.numbers)) if (k.startsWith('straight_runs')) console.log(k, JSON.stringify(v));
} else if (step === 'meldancheck') {
  // every Meldan hill whose search placement met the summit, staircase and parliament checks, built at full resolution
  // and checked as the build checks it
  const list = JSON.parse(readFileSync(path.join(ROOT, REC, 'city-meldan.json'), 'utf8')).results as { screened: Hill; placement: CityXf; fit: Record<string, unknown> }[];
  const city = pts(place(maps.meldan, 'city'));
  for (const [n, r] of list.entries()) {
    if (!(r.fit.okTop && r.fit.okStair && r.fit.okParl)) continue;
    const H = cityHeights(MELDAN, r.placement, 1);
    const M = finishReal(MELDAN, H.z, meldanPinsV4(H.plain, 1).slice(1), 303, 0, 400, [400, 4], 1.5, (y) => 52 + y / 111.2, MELDAN.toLL, MELDAN.render, undefined, () => true);
    const g = M.g, at = (p: XY) => M.z[Math.round((p[1] - g.y0) / g.dy) * g.w + Math.round((p[0] - g.x0) / g.dx)];
    let top = -Infinity, topAt: XY = [0, 0], flat = 0, cells = 0;
    for (let k = 0; k < M.z.length; k++) {
      const [x, y] = cxy(g, k);
      if (M.z[k] > top) { top = M.z[k]; topAt = [x, y]; }
      const i = k % g.w, j = (k / g.w) | 0;
      if (pointInPoly(x, y, city) && Math.hypot(x, y) > 1.8 && i > 0 && j > 0 && i < g.w - 1 && j < g.h - 1) { cells++; if (Math.hypot(M.z[k + 1] - M.z[k - 1], M.z[k + g.w] - M.z[k - g.w]) / (2 * g.dx * 1000) < 0.05) flat++; }
    }
    const parl = at(place(maps.meldan, 'parliament').at as XY) - H.plain, stair = at([0.1, -0.6]) - at([0, -1.3]);
    const ok = Math.hypot(...topAt) < 0.3 && parl >= 25 && parl <= 60 && stair >= 150 && stair <= 250 && flat / cells >= 0.9;
    console.log(`#${n + 1} ${r.screened.lon.toFixed(3)}, ${r.screened.lat.toFixed(3)}: ${ok ? 'passes' : 'fails'}; summit ${(top - H.plain).toFixed(0)} m at ${Math.hypot(...topAt).toFixed(2)} km from the centre, parliament ${parl.toFixed(0)} m, staircase ${stair.toFixed(0)} m, flat ${((100 * flat) / cells).toFixed(1)}%`);
  }
} else if (step === 'islands') {
  const list = findIslands();
  writeFileSync(path.join(ROOT, REC, 'islands-thaldur.json'), JSON.stringify({ made: new Date().toISOString(), note: 'Real islands of about Thaldur\'s size (half to twice its drawn area) on ETOPO 2022 at 2 arc-minutes, each turned (15° steps) and mirrored to overlap Thaldur\'s drawn outline; scored by the overlap, with a bonus for 300 to 2,500 m of relief. Famous islands excluded.', excluded: FAMOUS_ISLANDS.map((x) => x[0]), candidates: list }, null, 2) + '\n');
  for (const c of list) console.log(`${c.lon.toFixed(2)}, ${c.lat.toFixed(2)}: ${c.areaKm2} km², up to ${c.maxM} m, rot ${c.rot}${c.mirror ? ' mirrored' : ''}, overlap ${c.iou.toFixed(2)}`);
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
    save(`${dir}/data/meta.json`, Buffer.from(JSON.stringify({ short_label: SHORT_LABEL, label: LABEL_FULL, license: LICENSE, recipe: `${REC}/recipe.json`, grid: { w: g.w, h: g.h, cell_km: Number(g.dx.toFixed(5)) }, source, height_png: '16-bit grey, meters + 32768, row 0 is the north edge', biome_png: { legend: BIOMES, note: '8-bit grey, the value is an index into the legend; row 0 is the north edge' }, render: { width: L2.w, height: L2.h, vertical_exaggeration: ex } }, null, 2) + '\n'));
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
  // Meldan: the 150 m smoothing on the city's plain (outside the mountain), feathered over 400 m; lighter elsewhere
  const mCity = pts(place(maps.meldan, 'city'));
  const mh = cityHeights(MELDAN, mc, 1, true, (x, y) => { const d = polySigned(MELDAN, [x, y], mCity); return smooth((d + 0.4) / 0.8) * smooth((Math.hypot(x, y) - 1.5) / 0.4); });
  const meldanPins = meldanPinsV4(mh.plain, 1).slice(1);
  const meldan = { ...finishReal(MELDAN, mh.z, meldanPins, 303, 0, 400, [400, 4], 40, (y) => 52 + y / 111.2, MELDAN.toLL, MELDAN.render, undefined, () => true), base: mh.plain };
  // Pafogai Du: a real steep hill behind the city; v4's invented massif is dropped, the grid, the path and the pyramid are kept
  const pc = bestCity(cp, args.pafogai);
  // Pafogai Du: the 150 m smoothing only on the grid and 500 m around it
  const ph = cityHeights(PAFOGAI, pc, 1, true, (x, y) => { const d = Math.max(-0.5 - x, x - 3.7, -0.5 - y, y - 3.7); return 1 - smooth((d + 0.2) / 0.4); });
  const pbase = ph.z[Math.round((0 - PAFOGAI.y0) / PAFOGAI.dx) * PAFOGAI.w + Math.round((0 - PAFOGAI.x0) / PAFOGAI.dx)];
  const pv4 = pafogaiPinsV4(pbase, 1);
  const pathPin: Pin = { kind: 'shape', bbox: [1.6, -0.7, 1.8, 0], f: (x, y) => (y < 0 && y >= -0.62 && Math.abs(x - 1.7) < 0.04 ? { target: pbase + 60 * Math.min(-y, 0.6) / 0.6, weight: 1 } : null), why: 'The path from Dzai Gun climbs at ten percent to the pyramid\'s foot', provenance: 'book', lines: ['wg-341'], detail: '0 m to 60 m over 600 m' };
  const pafogaiPins = [pv4[0], pathPin, pv4[2], pv4[3], pv4[4]];
  const pafogai = { ...finishReal(PAFOGAI, ph.z, pafogaiPins, 404, 0, 400, [400, 4], 6, (y) => PAFOGAI.lat0 + y / 111.2, PAFOGAI.toLL, PAFOGAI.render, (x, y) => x >= -0.02 && x <= 3.22 && y >= -0.02 && y <= 3.22, () => true), base: pbase }; // no lakes: the real floodplain's hollows drain rather than flood the city
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
    const W = blendNorthshore(rz, nsPatch);
    const islands = JSON.parse(readFileSync(path.join(ROOT, REC, 'islands-thaldur.json'), 'utf8')).candidates as Island[];
    const isl = islands[Number(args.thaldur ?? 1) - 1];
    const bays = existsSync(path.join(ROOT, REC, 'search-bay.json')) ? JSON.parse(readFileSync(path.join(ROOT, REC, 'search-bay.json'), 'utf8')).candidates : [];
    const bayC = args.bay && bays[Number(args.bay) - 1];
    const bayXf: Xf | null = bayC ? { lon: bayC.source_centre_lon_lat[0], lat: bayC.source_centre_lon_lat[1], rot: bayC.rotation_deg, mirror: bayC.mirrored } : null;
    if (bayXf) transplantBay(rz, bayXf);
    transplantThaldur(rz, isl);
    const real0 = Float32Array.from(rz); // the real terrain (with the Northshore patch blended in), before any reshaping
    const raised = raiseRedshire(rz);
    const region = finishReal(REGION, rz, regionPinsV5(), 1, 60000, 1000, [40, 50, 4, 700, 22], 5000, REGION.lat, REGION.toLL, REGION.render, undefined, (x, y) => kmDist(REGION, [x, y], meldanXY) < 130);
    const run: SeedRun = { seed: rank, region, dzego, meldan, pafogai };
    // the battle map's seas are tested on their interior: cells more than 20 km from the drawn line (owner, 2026-10-12)
    BOOK_SEA_BAND.north_sea = 20; BOOK_SEA_BAND.south_sea = 20;
    // the inlet arm's role (water from the open sea to the river's mouth) is held by its own strip and tested through
    // Group North's route ending on it (wg-366) and the river reaching the sea; it is left out of the area test
    BOOK_SEA_EXCLUDE.fn = (id, q) => { if (id !== 'north_sea') return false; const [lo, la] = REGION.toLL(q[0], q[1]), [fx, fy] = llToFrame('northshore', lo, la); return fx < 150 && fy > 45; };
    const t = testSeed(run);
    const seam = seamChecks(region, W, real0, lastTouched), lakeP = pafogaiLakes(pafogai);
    const extra = [...seam.checks, { check: 'No lake inside Pafogai Du (the grid and 1 km around it)', ok: lakeP === 0, got: `${lakeP} lake cells` }];
    for (const x of extra) if (!x.ok && !x.check.startsWith('Anywhere')) t.failed.push(`${x.check}: ${x.got}`);
    for (const x of extra) console.log(`  ${x.ok ? 'ok  ' : 'FAIL'} ${x.check}: ${x.got}`);
    for (const [k, v] of Object.entries(seam.numbers)) if (k.startsWith('seam_runs')) console.log(`  ${k} ${JSON.stringify(v)}`);
    writeFileSync(`/tmp/geo/seam-runs-${rank}.json`, JSON.stringify(seam.numbers));
    console.log(`candidate ${rank}: ${t.failed.length ? `fails ${t.failed.length}: ${t.failed.slice(0, 6).join(' | ')}` : 'passes every test'}`);
    results[rank] = { inner_sea_bay: bayXf ? { source_centre_lon_lat: [Number(bayXf.lon.toFixed(2)), Number(bayXf.lat.toFixed(2))], rotation_deg: bayXf.rot, mirrored: bayXf.mirror, scale: 1, fit: bayC.fit, dataset: 'ETOPO 2022 v1, 60 arc-second', source_name: args.bayname ?? null } : null, thaldur_island: { source_name: args.thaldurname ?? null, source_centre_lon_lat: [Number(isl.lon.toFixed(2)), Number(isl.lat.toFixed(2))], area_km2: isl.areaKm2, rotation_deg: isl.rot, mirrored: isl.mirror, scale: 1, overlap_with_drawn_outline: Number(isl.iou.toFixed(2)), dataset: 'ETOPO 2022 v1, 60 arc-second' }, redshire_range_raised_m: raised, seam_checks: extra, seam_numbers: seam.numbers, passes: !t.failed.length, failed: t.failed, map_tests: `${t.mapResults.filter((x) => x.ok).length} of ${t.mapResults.length} hold`, terrain_checks: t.checks.map((x) => ({ check: x.id, ok: x.ok, got: x.got })) };
    const L2 = writeFrame(`candidate-${rank}/region`, region, 6, { dataset: 'ETOPO 2022', centre: c.source_centre_lon_lat, rotation_deg: c.rotation_deg, mirrored: c.mirrored, scale: 1 });
    sheet.push(downsample(L2.composite, 4));
  }
  writeFrame('dzego', dzego, 4, { dataset: 'ETOPO 2022', centre: [dxf.lon, dxf.lat], rotation_deg: dxf.rot, mirrored: dxf.mirror, scale: 1 });
  writeFrame('meldan', meldan, 4, { dataset: 'SRTM GL1 v003', placement: mc });
  writeFrame('pafogai-du', pafogai, 2.5, { dataset: 'SRTM GL1 v003', placement: pc });
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
    short_label: SHORT_LABEL, label: LABEL_FULL, license: LICENSE, made: new Date().toISOString(), code_version: codeVersion(),
    sources: JSON.parse(readFileSync(path.join(ROOT, REC, 'sources.json'), 'utf8')),
    region_candidates: ranks.map((rank) => { const c = sr[rank - 1]; return { rank, dataset: 'ETOPO 2022 v1, 60 arc-second surface elevation', source_centre_lon_lat: c.source_centre_lon_lat, source_box: sourceBox('region', xfOf(c)), rotation_deg: c.rotation_deg, mirrored: c.mirrored, scale: 1, search_score: c.score, constraint_fit: c.fit, famous_coastlines_in_frame: c.famous_coastlines_in_frame, tests: results[rank] }; }),
    northshore: { dataset: 'ETOPO 2022 v1, 60 arc-second surface elevation', note: 'the chapter 29 battle map\'s area (with the peninsula, Thaldur and Northglade\'s island) comes from its own real patch, feathered into each region candidate over about 220 km: no region-scale window matches the book\'s drawn coast there', source_centre_lon_lat: [nxf.lon, nxf.lat], source_box: sourceBox('northshore', nxf), rotation_deg: nxf.rot, mirrored: nxf.mirror, scale: 1 },
    dzego: { dataset: 'ETOPO 2022 v1, 60 arc-second surface elevation', source_centre_lon_lat: [dxf.lon, dxf.lat], source_box: sourceBox('dzego', dxf), rotation_deg: dxf.rot, mirrored: dxf.mirror, scale: 1, sadzu_river: sadzuRiver },
    meldan: { dataset: 'SRTM GL1 v003 (1 arc-second)', hill_lon_lat: [Number(mc.lon.toFixed(5)), Number(mc.lat.toFixed(5))], rotation_deg: mc.rot, mirrored: mc.mirror, scale: mc.hscale, scale_note: 'real km per frame km', vertical_scale: mc.vscale, smoothing: 'a cross of five samples 30 m apart, then two box passes of about 150 m', note: 'v4\'s invented mountain shape is dropped; the hill is real' },
    'pafogai-du': { dataset: 'SRTM GL1 v003 (1 arc-second)', hill_lon_lat: [Number(pc.lon.toFixed(5)), Number(pc.lat.toFixed(5))], hill_placed_at_km: [pc.x0, pc.y0], rotation_deg: pc.rot, mirrored: pc.mirror, scale: pc.hscale, scale_note: 'real km per frame km', vertical_scale: pc.vscale, note: 'v4\'s invented massif is dropped; the grid, the path and the pyramid stay pinned' },
    book_test_changes: [
      'Owner, 2026-10-12: the chapter 29 battle map is a sketch, not a survey. Its drawn coasts (the dark ground, both seas, the peninsula, Thaldur, the strait) may move within a 20 km band, the real terrain deciding the line inside it; only the interior is held, beyond a fractal line 1 to 20 km in from the drawn edge (a shape\'s thin tip, under 8 km half-width, is not held). v4 held these within 4 to 30 km bands with soft pulls toward the drawing.',
      'The book-sea test for the battle map\'s northern and southern seas now counts cells more than 20 km inside the drawn line (v4: 6 km). The Redshire gulf test is unchanged (15 km).',
      'The battle map\'s seas are no longer carried past the drawing\'s borders as fixed polygons: inside the drawing they are held to the border, beyond it they run on along a fractal line 60 to 220 km out.',
      'Thaldur\'s open-water rectangles (ours) are removed; Thaldur is a real island (see thaldur_island).',
      'Meldan has a region-scale forest cover pin (c1-b2, c32-b107), like Elenar Forest\'s; the climate rules are unchanged.',
      'Owner, 2026-10-12 (review 3): the peninsula\'s and the inlet\'s drawn outlines are let go. The peninsula is held only as a meandering land strip 20 to 50 km wide, with irregular edges and a rounded end, from Northshore\'s eastern end toward Thaldur; the inlet only as a meandering water strip 6 to 18 km wide; the inlet arm is left out of the northern sea\'s area test, its role being tested through Group North\'s route ending on it (wg-366) and the river reaching the sea from the open northern sea to the border river\'s mouth. The real terrain shapes the rest. The tests on them (the peninsula attached and between Northshore and Thaldur; Group North\'s route ending on the inlet; the river reaching the sea) are unchanged and run on outlines traced from the terrain.',
      'The inner sea (the battle map\'s southern sea) comes from a real bay, transplanted (see inner_sea_bay); the drawn sea\'s interior is still held.',
    ],
    method: 'Real heights moved by a rigid motion of the sphere (the book frame\'s centre onto a source point, turned in 15° steps, mirrored or not, at true scale); then v4\'s soft and hard pins for every book fact, a light droplet erosion (region 60,000, Dzego 40,000 droplets) so the pins settle into the real relief, the book\'s river carved, priority-flood lakes, rivers from flow accumulation on the real terrain, climate from the book\'s latitudes and the real heights, biomes, and the book\'s forests forced. The seabed is as measured.',
    constraints: [...describe(regionPinsV5(), 'region'), ...describe(dzego.pins, 'dzego'), ...describe(meldanPins, 'meldan'), ...describe(pafogaiPins, 'pafogai-du')],
    outputs: { where: `${OUT}/ (not in the repository; copied to Drive)`, sha256: fileHashes },
  }, null, 2) + '\n');
  console.log('built');
} else throw new Error('step: prepare | search | hills | city | build');
