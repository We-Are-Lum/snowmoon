/**
 * Map geometry and the map tests, shared by scripts/maps.ts (the book layouts) and
 * scripts/terrain.ts (generated terrain, which must pass the same tests; owner, 2026-10-11).
 * Moved here unchanged from scripts/maps.ts.
 */
export type XY = [number, number];
export type Pt = number[]; // [x, y] or [x, y, elevation in meters]
export type Place = {
  id: string; name: string; shape: 'point' | 'polyline' | 'polygon' | 'circle';
  at?: Pt; points?: Pt[]; center?: Pt; r?: number; frame?: string; elevation?: number;
  provenance: 'book' | 'placed by us'; lines: string[]; note?: string; hide_label?: boolean; draw?: boolean;
  rings?: Pt[][]; // a generated outline's rings: the outer one first, then holes (islands in a sea). Distances use every ring; 'inside' uses the outer one, the body's extent
  tap?: string; // the tap sheet's text for design: book quotes with block ids, and what we chose
};
export type Frame = { kind: 'figure' | 'km'; origin: XY; origin_px?: XY; km_per_px?: number; block?: string; provenance: string; note?: string };
export type Test = { line: string; test: string; expect?: 'conflict'; note?: string; [k: string]: unknown };
export type MapFile = {
  map: string; title: string; label: string; license: string; units: string; coords: 'km' | 'deg';
  frames?: Record<string, Frame>; places: Place[]; tests: Test[]; not_tested: { line: string; why: string }[];
  views?: { suffix: string; title: string; bounds: [number, number, number, number]; note?: string }[]; // [west, south, east, north] in the map's own units (km, or lon/lat)
};

// ---- geometry. In a km map, positions are [x, y]. In the world map, [lat, lon] in degrees;
// a place in a local frame is converted to degrees first.
export const R = 6371;
export const rad = (d: number) => (d * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;

export function toDeg(m: MapFile, p: Pt, frame?: string): XY {
  if (m.coords === 'km' || !frame) return [p[0], p[1]];
  const f = m.frames![frame];
  let dx: number, dy: number; // km east, km north of the frame's origin
  if (f.kind === 'figure') { dx = (p[0] - f.origin_px![0]) * f.km_per_px!; dy = -(p[1] - f.origin_px![1]) * f.km_per_px!; }
  else { dx = p[0]; dy = p[1]; }
  const lat = f.origin[0] + dy / 111.2;
  return [lat, f.origin[1] + dx / (111.2 * Math.cos(rad((lat + f.origin[0]) / 2)))];
}
export function pointsOf(m: MapFile, pl: Place): XY[] {
  if (pl.shape === 'point') return [toDeg(m, pl.at!, pl.frame)];
  if (pl.shape === 'circle') {
    const c = toDeg(m, pl.center!, pl.frame);
    return Array.from({ length: 36 }, (_, i) => offset(m, c, pl.r! * Math.cos(rad(i * 10)), pl.r! * Math.sin(rad(i * 10))));
  }
  return pl.points!.map((p) => toDeg(m, p, pl.frame));
}
export function offset(m: MapFile, c: XY, dx: number, dy: number): XY {
  if (m.coords === 'km') return [c[0] + dx, c[1] + dy];
  return [c[0] + dy / 111.2, c[1] + dx / (111.2 * Math.cos(rad(c[0])))];
}
export function centroid(m: MapFile, pl: Place): XY {
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
export function plane(m: MapFile, o: XY, p: XY): XY {
  if (m.coords === 'km') return [p[0] - o[0], p[1] - o[1]];
  return [(p[1] - o[1]) * 111.2 * Math.cos(rad((p[0] + o[0]) / 2)), (p[0] - o[0]) * 111.2];
}
export function dist(m: MapFile, a: XY, b: XY): number {
  if (m.coords === 'km') return Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [la1, lo1, la2, lo2] = [rad(a[0]), rad(a[1]), rad(b[0]), rad(b[1])];
  const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Compass bearing from a to b, 0 = north, 90 = east. */
export function bearing(m: MapFile, a: XY, b: XY): number {
  if (m.coords === 'km') return (deg(Math.atan2(b[0] - a[0], b[1] - a[1])) + 360) % 360;
  const [la1, lo1, la2, lo2] = [rad(a[0]), rad(a[1]), rad(b[0]), rad(b[1])];
  const y = Math.sin(lo2 - lo1) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(lo2 - lo1);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
export const inRange = (v: number, [lo, hi]: number[]) => (lo <= hi ? v >= lo && v <= hi : v >= lo || v <= hi);
export const rel = (b: number, facing: number) => ((b - facing + 540) % 360) - 180; // -180..180, negative = to the left
export function inside(m: MapFile, p: XY, poly: Place): boolean {
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
export function segDist(m: MapFile, p: XY, a: XY, b: XY): number {
  const [ax, ay] = plane(m, p, a), [bx, by] = plane(m, p, b);
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
export function edgeDist(m: MapFile, p: XY, pl: Place): number {
  if (pl.shape === 'circle') return Math.abs(dist(m, p, toDeg(m, pl.center!, pl.frame)) - pl.r!);
  if (pl.rings) return Math.min(...pl.rings.map((ring) => edgeDist(m, p, { ...pl, rings: undefined, points: ring })));
  const ps = pointsOf(m, pl);
  const n = pl.shape === 'polygon' ? ps.length : ps.length - 1;
  let best = Infinity;
  for (let i = 0; i < n; i++) best = Math.min(best, segDist(m, p, ps[i], ps[(i + 1) % ps.length]));
  return best;
}
export function length(m: MapFile, pl: Place): number {
  const ps = pointsOf(m, pl);
  let s = 0;
  for (let i = 1; i < ps.length; i++) s += dist(m, ps[i - 1], ps[i]);
  return pl.shape === 'polygon' ? s + dist(m, ps[ps.length - 1], ps[0]) : s;
}
export function crosses(m: MapFile, a: XY, b: XY, c: XY, d: XY): boolean {
  const o = a;
  const [p1, p2, p3, p4] = [a, b, c, d].map((q) => plane(m, o, q));
  const s = (p: XY, q: XY, r: XY) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return s(p1, p2, p3) * s(p1, p2, p4) < 0 && s(p3, p4, p1) * s(p3, p4, p2) < 0;
}

// ---- tests
export function run(m: MapFile, t: Test): { ok: boolean; got: string } {
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

