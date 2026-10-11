/**
 * Proposed map layouts (content/snowmoon/maps/*.json) checked against the world guide's
 * geography lines (owner, 2026-10-11: "a layout for each that satisfies every cited relation,
 * marking each placement 'book' or 'placed by us'"). Data and docs only; no UI.
 *
 *   npx tsx scripts/maps.ts check     fails (exit 1) if any test fails, or a geography line is unaccounted for
 *   npx tsx scripts/maps.ts render    writes docs/maps/<map>.svg (book placements solid, ours dashed)
 *
 * Each map has places (points, polylines, polygons, circles) and tests. A test names the
 * geography line it checks and a numeric condition (a bearing, a distance, inside, a view
 * from a point...). A test marked "expect": "conflict" checks a line that contradicts
 * another book statement the layout follows: it must FAIL, so the contradiction stays visible.
 * Every geography line must be tested by some map or listed under not_tested with a reason.
 * Coordinates: Meldan and Pafogai Du in km (x east, y north). The world map in degrees, with
 * two local frames: the battle map's own pixels (c29-b34) and a km frame for the United Cities.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIR = 'content/snowmoon/maps';
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

type XY = [number, number];
type Pt = number[]; // [x, y] or [x, y, elevation in meters]
type Place = {
  id: string; name: string; shape: 'point' | 'polyline' | 'polygon' | 'circle';
  at?: Pt; points?: Pt[]; center?: Pt; r?: number; frame?: string; elevation?: number;
  provenance: 'book' | 'placed by us'; lines: string[]; note?: string; hide_label?: boolean; draw?: boolean;
  tap?: string; // the tap sheet's text for design: book quotes with block ids, and what we chose
};
type Frame = { kind: 'figure' | 'km'; origin: XY; origin_px?: XY; km_per_px?: number; block?: string; provenance: string; note?: string };
type Test = { line: string; test: string; expect?: 'conflict'; note?: string; [k: string]: unknown };
type MapFile = {
  map: string; title: string; label: string; license: string; units: string; coords: 'km' | 'deg';
  frames?: Record<string, Frame>; places: Place[]; tests: Test[]; not_tested: { line: string; why: string }[];
  views?: { suffix: string; title: string; bounds: [number, number, number, number]; note?: string }[]; // [west, south, east, north] in the map's own units (km, or lon/lat)
};

const guide = JSON.parse(read('content/snowmoon/world-guide.json')) as { lines: { id: string; section: string; text: string }[] };
const geo = guide.lines.filter((l) => l.section === 'geography');
const maps: MapFile[] = readdirSync(path.join(ROOT, DIR)).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(read(`${DIR}/${f}`)));

// ---- geometry. In a km map, positions are [x, y]. In the world map, [lat, lon] in degrees;
// a place in a local frame is converted to degrees first.
const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function toDeg(m: MapFile, p: Pt, frame?: string): XY {
  if (m.coords === 'km' || !frame) return [p[0], p[1]];
  const f = m.frames![frame];
  let dx: number, dy: number; // km east, km north of the frame's origin
  if (f.kind === 'figure') { dx = (p[0] - f.origin_px![0]) * f.km_per_px!; dy = -(p[1] - f.origin_px![1]) * f.km_per_px!; }
  else { dx = p[0]; dy = p[1]; }
  const lat = f.origin[0] + dy / 111.2;
  return [lat, f.origin[1] + dx / (111.2 * Math.cos(rad((lat + f.origin[0]) / 2)))];
}
function pointsOf(m: MapFile, pl: Place): XY[] {
  if (pl.shape === 'point') return [toDeg(m, pl.at!, pl.frame)];
  if (pl.shape === 'circle') {
    const c = toDeg(m, pl.center!, pl.frame);
    return Array.from({ length: 36 }, (_, i) => offset(m, c, pl.r! * Math.cos(rad(i * 10)), pl.r! * Math.sin(rad(i * 10))));
  }
  return pl.points!.map((p) => toDeg(m, p, pl.frame));
}
function offset(m: MapFile, c: XY, dx: number, dy: number): XY {
  if (m.coords === 'km') return [c[0] + dx, c[1] + dy];
  return [c[0] + dy / 111.2, c[1] + dx / (111.2 * Math.cos(rad(c[0])))];
}
function centroid(m: MapFile, pl: Place): XY {
  if (pl.shape === 'point') return pointsOf(m, pl)[0];
  if (pl.shape === 'circle') return toDeg(m, pl.center!, pl.frame);
  const ps = pointsOf(m, pl);
  if (pl.shape === 'polyline') return ps[Math.floor(ps.length / 2)];
  // polygon area centroid, computed in a local plane
  const o = ps[0];
  const loc = ps.map((p) => plane(m, o, p));
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < loc.length; i++) {
    const [x1, y1] = loc[i], [x2, y2] = loc[(i + 1) % loc.length];
    const k = x1 * y2 - x2 * y1;
    a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k;
  }
  return offset(m, o, cx / (3 * a), cy / (3 * a));
}
/** p relative to o, in km east and km north. */
function plane(m: MapFile, o: XY, p: XY): XY {
  if (m.coords === 'km') return [p[0] - o[0], p[1] - o[1]];
  return [(p[1] - o[1]) * 111.2 * Math.cos(rad((p[0] + o[0]) / 2)), (p[0] - o[0]) * 111.2];
}
function dist(m: MapFile, a: XY, b: XY): number {
  if (m.coords === 'km') return Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [la1, lo1, la2, lo2] = [rad(a[0]), rad(a[1]), rad(b[0]), rad(b[1])];
  const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Compass bearing from a to b, 0 = north, 90 = east. */
function bearing(m: MapFile, a: XY, b: XY): number {
  if (m.coords === 'km') return (deg(Math.atan2(b[0] - a[0], b[1] - a[1])) + 360) % 360;
  const [la1, lo1, la2, lo2] = [rad(a[0]), rad(a[1]), rad(b[0]), rad(b[1])];
  const y = Math.sin(lo2 - lo1) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(lo2 - lo1);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
const inRange = (v: number, [lo, hi]: number[]) => (lo <= hi ? v >= lo && v <= hi : v >= lo || v <= hi);
const rel = (b: number, facing: number) => ((b - facing + 540) % 360) - 180; // -180..180, negative = to the left
function inside(m: MapFile, p: XY, poly: Place): boolean {
  if (poly.shape === 'circle') return dist(m, p, toDeg(m, poly.center!, poly.frame)) <= poly.r!;
  const o = p;
  const loc = pointsOf(m, poly).map((q) => plane(m, o, q));
  let c = false;
  for (let i = 0, j = loc.length - 1; i < loc.length; j = i++) {
    const [xi, yi] = loc[i], [xj, yj] = loc[j];
    if (yi > 0 !== yj > 0 && 0 < ((xj - xi) * (0 - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segDist(m: MapFile, p: XY, a: XY, b: XY): number {
  const [ax, ay] = plane(m, p, a), [bx, by] = plane(m, p, b);
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
function edgeDist(m: MapFile, p: XY, pl: Place): number {
  if (pl.shape === 'circle') return Math.abs(dist(m, p, toDeg(m, pl.center!, pl.frame)) - pl.r!);
  const ps = pointsOf(m, pl);
  const n = pl.shape === 'polygon' ? ps.length : ps.length - 1;
  let best = Infinity;
  for (let i = 0; i < n; i++) best = Math.min(best, segDist(m, p, ps[i], ps[(i + 1) % ps.length]));
  return best;
}
function length(m: MapFile, pl: Place): number {
  const ps = pointsOf(m, pl);
  let s = 0;
  for (let i = 1; i < ps.length; i++) s += dist(m, ps[i - 1], ps[i]);
  return pl.shape === 'polygon' ? s + dist(m, ps[ps.length - 1], ps[0]) : s;
}
function crosses(m: MapFile, a: XY, b: XY, c: XY, d: XY): boolean {
  const o = a;
  const [p1, p2, p3, p4] = [a, b, c, d].map((q) => plane(m, o, q));
  const s = (p: XY, q: XY, r: XY) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return s(p1, p2, p3) * s(p1, p2, p4) < 0 && s(p3, p4, p1) * s(p3, p4, p2) < 0;
}

// ---- tests
function run(m: MapFile, t: Test): { ok: boolean; got: string } {
  const byId = new Map(m.places.map((p) => [p.id, p]));
  const P = (id: unknown) => {
    const p = byId.get(String(id));
    if (!p) throw new Error(`${m.map}: test for ${t.line} names unknown place ${id}`);
    return p;
  };
  const C = (id: unknown) => centroid(m, P(id));
  const f1 = (x: number) => x.toFixed(m.coords === 'km' ? 2 : 0);
  switch (t.test) {
    case 'bearing': { const b = bearing(m, C(t.from), C(t.to)); return { ok: inRange(b, t.deg as number[]), got: `${b.toFixed(0)}°` }; }
    case 'distance': { const d = dist(m, C(t.a), C(t.b)); return { ok: inRange(d, t.km as number[]), got: `${f1(d)} km` }; }
    case 'edge_distance': { const d = edgeDist(m, C(t.a), P(t.b)); return { ok: inRange(d, t.km as number[]), got: `${f1(d)} km` }; }
    case 'inside': { const ok = inside(m, C(t.a), P(t.b)); return { ok: t.not ? !ok : ok, got: ok ? 'inside' : 'outside' }; }
    case 'view': {
      const from = C(t.from), facing = bearing(m, from, C(t.facing));
      const r = rel(bearing(m, from, C(t.subject)), facing);
      return { ok: inRange(r, t.deg as number[]), got: `${r.toFixed(0)}° (negative = left)` };
    }
    case 'left_of_more': { // subject a appears further left than b, seen from `from` facing `facing`
      const from = C(t.from), facing = bearing(m, from, C(t.facing));
      const ra = rel(bearing(m, from, C(t.a)), facing), rb = rel(bearing(m, from, C(t.b)), facing);
      return { ok: ra < rb, got: `${ra.toFixed(0)}° vs ${rb.toFixed(0)}°` };
    }
    case 'path_length': { const d = length(m, P(t.path)); return { ok: inRange(d, t.km as number[]), got: `${f1(d)} km` }; }
    case 'perimeter': { const d = length(m, P(t.a)); return { ok: inRange(d, t.km as number[]), got: `${f1(d)} km` }; }
    case 'sides': { // a polygon's edge lengths
      const ps = pointsOf(m, P(t.a));
      const s = ps.map((p, i) => dist(m, p, ps[(i + 1) % ps.length]));
      return { ok: s.every((x) => inRange(x, t.km as number[])), got: s.map(f1).join(', ') + ' km' };
    }
    case 'starts_at': { const d = dist(m, pointsOf(m, P(t.path))[0], C(t.a)); return { ok: d <= ((t.tol as number) ?? 0.01), got: `${f1(d)} km from it` }; }
    case 'ends_at': { const ps = pointsOf(m, P(t.path)); const d = dist(m, ps[ps.length - 1], C(t.a)); return { ok: d <= ((t.tol as number) ?? 0.01), got: `${f1(d)} km from it` }; }
    case 'west_of': { const a = C(t.a), b = C(t.b); const ok = m.coords === 'km' ? a[0] < b[0] : a[1] < b[1]; return { ok, got: ok ? 'west' : 'not west' }; }
    case 'north_order': { // places listed north to south, each `step` km apart
      const ys = (t.ids as string[]).map((id) => (m.coords === 'km' ? C(id)[1] : C(id)[0]));
      const steps = ys.slice(1).map((y, i) => ys[i] - y);
      return { ok: steps.every((s) => inRange(s, t.step as number[])), got: steps.map(f1).join(', ') };
    }
    case 'x_equals': { const x = C(t.a)[0]; return { ok: Math.abs(x - (t.x as number)) < 1e-6, got: String(x) }; }
    case 'y_equals': { const y = C(t.a)[1]; return { ok: Math.abs(y - (t.y as number)) < 1e-6, got: String(y) }; }
    case 'dy': { const d = C(t.b)[1] - C(t.a)[1]; return { ok: inRange(d, t.km as number[]), got: `${f1(d)} km` }; }
    case 'grid': {
      const g = P(t.a); // a polygon: the city's outline
      const ps = pointsOf(m, g);
      const w = Math.max(...ps.map((p) => p[0])) - Math.min(...ps.map((p) => p[0]));
      const h = Math.max(...ps.map((p) => p[1])) - Math.min(...ps.map((p) => p[1]));
      const ew = (t.ew_streets as number[]), ns = (t.ns_streets as number[]); // [count, spacing km]
      const ok = Math.abs(h - (ew[0] - 1) * ew[1]) < 1e-6 && Math.abs(w - (ns[0] - 1) * ns[1]) < 1e-6;
      return { ok, got: `${w.toFixed(2)} × ${h.toFixed(2)} km` };
    }
    case 'slope': { // percent slope of a polyline's segment (points carry elevation in meters)
      const ps = P(t.path).points!, i = t.segment as number;
      const run_ = Math.hypot(ps[i + 1][0] - ps[i][0], ps[i + 1][1] - ps[i][1]) * 1000;
      const s = ((ps[i + 1][2] - ps[i][2]) / run_) * 100;
      return { ok: inRange(s, t.pct as number[]), got: `${s.toFixed(1)}%` };
    }
    case 'elevation_after': { // elevation reached after walking `km` along a path
      const ps = P(t.path).points!;
      let left = t.km as number, z = ps[0][2];
      for (let i = 1; i < ps.length && left > 0; i++) {
        const seg = Math.hypot(ps[i][0] - ps[i - 1][0], ps[i][1] - ps[i - 1][1]);
        const f = Math.min(1, left / seg);
        z = ps[i - 1][2] + f * (ps[i][2] - ps[i - 1][2]);
        left -= seg;
      }
      return { ok: inRange(z, t.m as number[]), got: `${z.toFixed(0)} m` };
    }
    case 'elevation': { const z = P(t.a).elevation ?? NaN; return { ok: inRange(z, t.m as number[]), got: `${z} m` }; }
    case 'between': { // b's centroid lies between a and c: along the line a→c, and near it
      const a = C(t.a), b = C(t.b), c = C(t.c);
      const [bx, by] = plane(m, a, b), [cx, cy] = plane(m, a, c);
      const tt = (bx * cx + by * cy) / (cx * cx + cy * cy);
      const off = Math.abs(bx * cy - by * cx) / Math.hypot(cx, cy);
      return { ok: tt > 0.1 && tt < 0.9 && off <= (t.max_off_km as number), got: `t=${tt.toFixed(2)}, ${off.toFixed(0)} km off the line` };
    }
    case 'farther_than': { // c15-b25: from `from`, these are nearer than `subject`, and these farther
      const f = C(t.from), d0 = dist(m, f, C(t.subject));
      const bad = [
        ...(t.nearer as string[]).filter((id) => dist(m, f, C(id)) >= d0),
        ...(t.farther as string[]).filter((id) => dist(m, f, C(id)) <= d0),
      ];
      return { ok: !bad.length, got: bad.length ? `out of order: ${bad.join(', ')}` : `${f1(d0)} km; order holds` };
    }
    case 'closer_share': {
      const f = C(t.from), d0 = dist(m, f, C(t.subject));
      const among = t.among as string[];
      const n = among.filter((id) => dist(m, f, C(id)) < d0).length;
      return { ok: n / among.length >= (t.min_share as number), got: `${n} of ${among.length} closer` };
    }
    case 'planar': {
      const L = (t.links as [string, string][]).map(([a, b]) => [C(a), C(b), `${a}–${b}`] as const);
      const bad: string[] = [];
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        if (new Set([L[i][2].split('–'), L[j][2].split('–')].flat()).size < 4) continue;
        if (crosses(m, L[i][0], L[i][1], L[j][0], L[j][1])) bad.push(`${L[i][2]} × ${L[j][2]}`);
      }
      return { ok: !bad.length, got: bad.length ? `crossing: ${bad.join('; ')}` : `${L.length} links, none cross` };
    }
    case 'none_within_bearing': { // no place in `among` lies within the bearing sector `deg` from `from`
      const f = C(t.from);
      const hit = (t.among as string[]).filter((id) => id !== t.from && inRange(bearing(m, f, C(id)), t.deg as number[]));
      return { ok: !hit.length, got: hit.length ? `in the sector: ${hit.join(', ')}` : 'sector empty' };
    }
    case 'nearest_edge_bearing': { // direction from a to the nearest point of b's outline
      const a = C(t.a), ps = pointsOf(m, P(t.b));
      let best: XY = ps[0], bd = Infinity;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i], q = ps[(i + 1) % ps.length];
        for (let k = 0; k <= 20; k++) { const r: XY = [p[0] + ((q[0] - p[0]) * k) / 20, p[1] + ((q[1] - p[1]) * k) / 20]; const dd = dist(m, a, r); if (dd < bd) { bd = dd; best = r; } }
      }
      const b = bearing(m, a, best);
      return { ok: inRange(b, t.deg as number[]), got: `${b.toFixed(0)}° at ${f1(bd)} km` };
    }
    case 'max_pairwise': {
      const ids = t.ids as string[]; let mx = 0;
      for (const a of ids) for (const b of ids) mx = Math.max(mx, dist(m, C(a), C(b)));
      return { ok: mx <= (t.km as number), got: `${f1(mx)} km` };
    }
    case 'link_lengths': {
      const L = (t.links as [string, string][]).map(([a, b]) => dist(m, C(a), C(b)));
      return { ok: L.every((x) => inRange(x, t.km as number[])), got: `${f1(Math.min(...L))}–${f1(Math.max(...L))} km` };
    }
    case 'angular_distance': { const d = dist(m, C(t.a), C(t.b)); const a = (d / R) * (180 / Math.PI); return { ok: inRange(a, t.deg as number[]), got: `${a.toFixed(0)}° (${d.toFixed(0)} km)` }; }
    default: throw new Error(`${m.map}: unknown test ${t.test}`);
  }
}

function check(): string[] {
  const bad: string[] = [];
  const geoIds = new Set(geo.map((l) => l.id));
  const accounted = new Set<string>();
  for (const m of maps) {
    if (!/AI-made/.test(m.label) || !/not by the author/i.test(m.label)) bad.push(`${m.map}: the label must say AI-made and not by the author`);
    if (!/GPL-3\.0/.test(m.license)) bad.push(`${m.map}: the licence must name GPL-3.0`);
    const listFile = path.join(ROOT, `docs/maps/${m.map}-placed-by-us.md`);
    if (!existsSync(listFile) || readFileSync(listFile, 'utf8') !== placedList(m)) bad.push(`docs/maps/${m.map}-placed-by-us.md does not match the data; run render`);
    const tapFile = path.join(ROOT, `docs/maps/${m.map}-tap-sheets.md`);
    if (!existsSync(tapFile) || readFileSync(tapFile, 'utf8') !== tapSheets(m)) bad.push(`docs/maps/${m.map}-tap-sheets.md does not match the data; run render`);
    const ids = new Set<string>();
    for (const p of m.places) {
      if (ids.has(p.id)) bad.push(`${m.map}: place ${p.id} repeated`);
      ids.add(p.id);
      if (p.provenance !== 'book' && p.provenance !== 'placed by us') bad.push(`${m.map}: ${p.id} provenance must be "book" or "placed by us"`);
      if (p.provenance === 'book' && !p.lines.length) bad.push(`${m.map}: ${p.id} is marked book but cites no line`);
      for (const l of p.lines) if (!geoIds.has(l)) bad.push(`${m.map}: ${p.id} cites ${l}, which is not a geography line`);
      if (p.frame && !m.frames?.[p.frame]) bad.push(`${m.map}: ${p.id} uses unknown frame ${p.frame}`);
    }
    for (const t of m.tests) {
      if (!geoIds.has(t.line)) bad.push(`${m.map}: a test cites ${t.line}, which is not a geography line`);
      accounted.add(t.line);
      const r = run(m, t);
      if (t.expect === 'conflict' ? r.ok : !r.ok) bad.push(`${m.map}: ${t.line} ${t.test}${t.expect ? ' (expected to fail: a contradiction)' : ''}: got ${r.got}`);
    }
    for (const n of m.not_tested) {
      if (!geoIds.has(n.line)) bad.push(`${m.map}: not_tested cites ${n.line}, which is not a geography line`);
      if (!n.why) bad.push(`${m.map}: ${n.line} not tested without a reason`);
      accounted.add(n.line);
    }
  }
  for (const id of geoIds) if (!accounted.has(id)) bad.push(`${id} is in no map's tests or not_tested`);
  // A planted error must be caught: Galanar Square moved north of the community center.
  const meldan = maps.find((m) => m.map === 'meldan');
  if (meldan) {
    const planted = structuredClone(meldan);
    planted.places.find((p) => p.id === 'galanar')!.at = [-2.3, 1.0];
    if (planted.tests.filter((t) => t.line === 'wg-327').every((t) => run(planted, t).ok)) bad.push('the planted error (Galanar Square moved north) was not caught');
  }
  return bad;
}

// ---- render: one SVG per view. Book placements solid, ours dashed and paler.
function render(m: MapFile, view?: { title: string; bounds: [number, number, number, number]; note?: string }): string {
  const drawn = m.places.filter((p) => p.draw !== false);
  // plot x = east, y = north; in degrees, longitude is scaled by cos(mid latitude)
  const all = drawn.flatMap((p) => pointsOf(m, p));
  const midLat = m.coords === 'deg' ? (Math.min(...all.map((p) => p[0])) + Math.max(...all.map((p) => p[0]))) / 2 : 0;
  const xy = (p: XY): XY => (m.coords === 'km' ? [p[0], p[1]] : [p[1] * Math.cos(rad(midLat)), p[0]]);
  let x0: number, x1: number, y0: number, y1: number;
  if (view) {
    const [w, sth, e, n] = view.bounds;
    [x0, y0] = m.coords === 'km' ? [w, sth] : xy([sth, w]);
    [x1, y1] = m.coords === 'km' ? [e, n] : xy([n, e]);
  } else {
    const pts = all.map(xy);
    [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
    [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  }
  const W = 900, pad = 30, s = (W - 2 * pad) / Math.max(x1 - x0, y1 - y0);
  const top = 34, H = Math.round((y1 - y0) * s + 2 * pad + top + 40);
  const X = (p: XY): XY => { const [x, y] = xy(p); return [pad + (x - x0) * s, H - 40 - pad - (y - y0) * s]; };
  const S = (p: XY) => X(p).map((v) => v.toFixed(1)).join(',');
  const fill: Record<string, string> = { sea: '#cfe3f3', water: '#cfe3f3', land: '#e9e4d4', district: '#e3ecd9', region: '#f3efe6' };
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="11">`,
    `<defs><clipPath id="c"><rect x="${pad}" y="${top}" width="${W - 2 * pad}" height="${H - top - 40 - pad + 10}"/></clipPath></defs>`,
    `<rect width="${W}" height="${H}" fill="#fff"/>`,
    `<text x="${pad}" y="22" font-size="14" font-weight="bold">${view?.title ?? m.title}</text>`,
    view?.note ? `<text x="${pad + 8}" y="${top + 18}" font-size="12" fill="#333">${view.note}</text>` : '',
    `<text x="${pad}" y="${H - 22}" fill="#555">Solid outlines, dots and upright labels: placed from the book. Dashed, pale, italic: placed by us.</text>`,
    `<text x="${pad}" y="${H - 8}" fill="#555">Red lines: roads, routes and links; blue: water. AI-made proposal, not by the author.${m.coords === 'km' ? ' Grid: 1 km.' : ''}</text>`,
    '<g clip-path="url(#c)">',
  ];
  if (m.coords === 'km') {
    const grid = (a: XY, b: XY) => { const [p, q] = [X(a), X(b)]; out.push(`<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}" stroke="#eee"/>`); };
    for (let g = Math.ceil(x0); g <= x1; g++) grid([g, y0], [g, y1]);
    for (let g = Math.ceil(y0); g <= y1; g++) grid([x0, g], [x1, g]);
  }
  const labels: [number, number, number, number][] = [];
  const order = (p: Place) => (p.shape === 'polygon' || p.shape === 'circle' ? 0 : p.shape === 'polyline' ? 1 : 2);
  const texts: string[] = [];
  for (const p of [...drawn].sort((a, b) => order(a) - order(b))) {
    const book = p.provenance === 'book';
    const dash = book ? '' : ' stroke-dasharray="5,3"';
    const op = book ? 1 : 0.55;
    const kind = (p.note ?? '').match(/^\[(\w+)\]/)?.[1] ?? '';
    if (p.shape === 'polygon' || p.shape === 'circle') {
      out.push(`<polygon points="${pointsOf(m, p).map(S).join(' ')}" fill="${fill[kind] ?? '#eef0f4'}" fill-opacity="${op}" stroke="#667"${dash}/>`);
    } else if (p.shape === 'polyline') {
      out.push(`<polyline points="${pointsOf(m, p).map(S).join(' ')}" fill="none" stroke="${kind === 'water' ? '#4a86b8' : '#b33'}" stroke-width="${book ? 1.8 : 1.3}"${dash} opacity="${book ? 0.9 : 0.6}"/>`);
    } else {
      const [cx, cy] = X(pointsOf(m, p)[0]);
      out.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5" fill="${book ? '#222' : '#fff'}" stroke="#222"${dash}/>`);
    }
    if (p.hide_label) continue;
    const [cx, cy] = X(centroid(m, p));
    const w = p.name.length * 6, h = 12;
    const free = (x: number, y: number) => !labels.some(([a, b, c, d]) => x < c && x + w > a && y - h < d && y > b);
    // try right-above, right-below, left, then further above and below
    const tries: XY[] = [[5, -4], [5, 14], [-w - 5, -4], [-w - 5, 14], [5, -18], [5, 28], [-w / 2, -10], [-w / 2, 22]];
    let [lx, ly] = [cx + 5, cy - 4];
    for (const [dx, dy] of tries) if (free(cx + dx, cy + dy)) { [lx, ly] = [cx + dx, cy + dy]; break; }
    labels.push([lx, ly - h, lx + w, ly]);
    texts.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${book ? '#111' : '#555'}"${book ? '' : ' font-style="italic"'} stroke="#fff" stroke-width="3" paint-order="stroke">${p.name}</text>`);
  }
  out.push(...texts, '</g>', '</svg>');
  return out.filter(Boolean).join('\n') + '\n';
}

// ---- the published "placed by us" list for each map (owner, 2026-10-11: no author sign-off;
// each map publishes its full list, with a way to report a mistake).
const REPORT_EMAIL = 'snowmoon@wearelum.xyz';
const REPORT_REPO = 'https://github.com/We-Are-Lum/snowmoon';
function placedList(m: MapFile): string {
  const ours = m.places.filter((p) => p.provenance === 'placed by us');
  const out = [
    `# What we placed: ${m.title}`,
    '',
    `> ${m.label}`,
    '',
    `The book does not say where these are, so we chose. Everything else on this map is placed from the book, and its source passages are named in its tap sheet. ${ours.length} placements.`,
    '',
    `**Report a mistake.** Email ${REPORT_EMAIL} with the subject "Map mistake: ${m.map} <id>", or open an issue at ${REPORT_REPO}/issues. Name the id in brackets below, or the place, and the passage you think it contradicts.`,
    '',
  ];
  for (const p of ours) out.push(`- **${p.name}** [${p.id}]: ${(p.note ?? 'Placed by us.').replace(/^\[\w+\]\s*/, '')}${p.lines.length ? ` (lines ${p.lines.join(', ')})` : ''}`);
  if (m.frames) {
    out.push('', 'Also ours, for the whole map:');
    for (const [k, f] of Object.entries(m.frames)) out.push(`- **frame ${k}**: ${f.note ?? ''}`);
  }
  return out.join('\n') + '\n';
}

// ---- tap sheets: what a reader sees on tapping a place (for design). The tap text where one
// is written; otherwise the placement note, with the world guide lines it rests on.
function tapSheets(m: MapFile): string {
  const text = new Map(geo.map((l) => [l.id, l.text]));
  const out = [`# Tap sheets: ${m.title}`, '', `> ${m.label}`, '', 'One entry per labelled place. "Book": the book fixes where it is (its outline may be ours). "Placed by us": the book does not say, so we chose. Lines are from the world guide, with the book passages they cite.', ''];
  for (const p of m.places.filter((q) => !q.hide_label && q.draw !== false)) {
    out.push(`## ${p.name}`, '', `${p.provenance === 'book' ? 'Book' : 'Placed by us'}. ${p.tap ?? (p.note ?? '').replace(/^\[\w+\]\s*/, '')}`.trim());
    const ls = p.lines.filter((l) => text.has(l));
    if (ls.length) out.push('', ...ls.map((l) => `- ${l}: ${text.get(l)} (${guide.lines.find((x) => x.id === l) ? (guide.lines.find((x) => x.id === l) as unknown as { sources: string[] }).sources.join(', ') : ''})`));
    out.push('');
  }
  return out.join('\n');
}

const step = process.argv[2];
if (step === 'check') {
  const bad = check();
  const tests = maps.reduce((a, m) => a + m.tests.length, 0);
  if (bad.length) {
    console.error(`maps check FAILED (${bad.length}):\n- ` + bad.join('\n- '));
    process.exit(1);
  }
  const conflicts = maps.flatMap((m) => m.tests.filter((t) => t.expect === 'conflict').map((t) => t.line));
  console.log(`maps check passed: ${maps.length} maps, ${tests} tests hold (${conflicts.length} contradictions fail as expected: ${conflicts.join(', ')}); all ${geo.length} geography lines accounted for`);
} else if (step === 'render') {
  mkdirSync(path.join(ROOT, 'docs/maps'), { recursive: true });
  for (const m of maps) {
    writeFileSync(path.join(ROOT, `docs/maps/${m.map}-placed-by-us.md`), placedList(m));
    writeFileSync(path.join(ROOT, `docs/maps/${m.map}-tap-sheets.md`), tapSheets(m));
    console.log(`wrote docs/maps/${m.map}-placed-by-us.md`);
    for (const v of m.views ?? [{ suffix: '', title: m.title, bounds: undefined as unknown as [number, number, number, number] }]) {
      writeFileSync(path.join(ROOT, `docs/maps/${m.map}${v.suffix}.svg`), render(m, v.bounds ? v : undefined));
      console.log(`wrote docs/maps/${m.map}${v.suffix}.svg`);
    }
  }
} else if (step === 'report') {
  // every test with its result, for the feasibility note
  for (const m of maps) {
    console.log(`\n## ${m.title}`);
    for (const t of m.tests) { const r = run(m, t); console.log(`- ${t.line} ${t.test}: ${r.got}${t.expect ? ' (contradiction: fails as expected)' : ''}${r.ok === (t.expect !== 'conflict') ? '' : '  <-- PROBLEM'}`); }
  }
} else throw new Error('step: check | render | report');
