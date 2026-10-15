/**
 * The simple map at /maps (Claude Design's "SimpleMap v2", 2026-10-15; docs/maps/simple/): the
 * whole layout on the frozen v5 region terrain, traced and simplified by Design, with the book's places
 * on top. Read-only. This script turns Design's handoff into what the page serves:
 *
 *   npx tsx scripts/maps-simple.ts build
 *
 * - public/maps/simple/region.svg: Design's base (docs/maps/simple/region-ext.svg), cropped to the
 *   terrain grid (2048 × 1061 region pixels; the Arctic coast and the land south of the grid are left
 *   out), its C2PA manifest removed because the drawing is changed, and the small land disk Design put
 *   under Hapton removed (Hapton is moved onto the coast in world.json instead; see below).
 * - content/snowmoon/maps/simple-view.json: the places the page draws, in region pixels. Positions are
 *   Design's (docs/maps/simple/region-places.json), except the United Cities' points, which are
 *   recomputed from world.json's "uc" frame (km) by the exact linear map Design used, so a layout change
 *   there (Hapton, 2026-10-15) reaches this map. Hidden points (the Group Center start, the routes' ends)
 *   and everything outside the grid are left out; Glasscrown (north) and Dzego (far east) become edge
 *   labels. Nothing is hidden by chapter (owner, 2026-10-15).
 *
 * Checked by scripts/test-maps-simple.ts (npm run test:maps-simple). No image model; no network.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const W = 2048, H = 1061;
type Pt = [number, number];

type DesignPlace = { id: string; name: string; shape: string; prov: 'book' | 'placed'; hide: boolean; pts: Pt[]; note?: string };
type WorldPlace = { id: string; shape: string; frame?: string; at?: number[] };

export type SimplePlace = {
  id: string; name: string; kind: 'city' | 'area'; prov: 'book' | 'placed';
  /** Region pixels: a city's point, or an area label's anchor. */
  at: Pt;
  note: string;
  /** Label tier: 1 shows at every size, 3 only on the desktop's whole layout or zoomed views. */
  tier: number;
};
export type SimpleView = {
  about: string;
  grid: { w: number; h: number; km_per_px: number };
  image: string;
  places: SimplePlace[];
  edges: { id: string; name: string; text: string; side: 'top' | 'right'; at: number; prov: 'placed'; note: string }[];
};

// Design's tiers (SimpleMap v2: TIER and AREAS); areas: 1 = country, 2 = smaller region
const TIER: Record<string, number> = { meldan: 1, redshire: 1, northglade: 1, eldil: 2, arturia: 2, freetown: 2, telten: 2, redshire_islands: 2, petersvil: 3 };
const AREAS: { id: string; t: string; k: number; nudge?: Pt }[] = [
  { id: 'veridia', t: 'VERIDIA', k: 1, nudge: [40, 120] },
  { id: 'uc_continent', t: 'UNITED CITIES', k: 1, nudge: [60, 40] },
  { id: 'northshore', t: 'NORTHSHORE', k: 2 },
  { id: 'thaldur', t: 'THALDUR', k: 2 },
];
const HAPTON_DESIGN: Pt = [1198.9, 481.7];

/** Least-squares px = a + b·x, py = c + d·y over the pairs, dropping the worst pair while any is more than 1 px off (a city moved since Design drew it). */
function fitUc(pairs: { km: number[]; px: Pt }[]) {
  const once = (ps: typeof pairs) => {
    const n = ps.length, mean = (f: (p: (typeof ps)[number]) => number) => ps.reduce((s, p) => s + f(p), 0) / n;
    const lin = (u: (p: (typeof ps)[number]) => number, v: (p: (typeof ps)[number]) => number) => {
      const mu = mean(u), mv = mean(v);
      const b = ps.reduce((s, p) => s + (u(p) - mu) * (v(p) - mv), 0) / ps.reduce((s, p) => s + (u(p) - mu) ** 2, 0);
      return [mv - b * mu, b] as const;
    };
    const [a, b] = lin((p) => p.km[0], (p) => p.px[0]), [c, d] = lin((p) => p.km[1], (p) => p.px[1]);
    return { a, b, c, d, off: (p: (typeof ps)[number]) => Math.max(Math.abs(a + b * p.km[0] - p.px[0]), Math.abs(c + d * p.km[1] - p.px[1])) };
  };
  let kept = pairs, f = once(kept);
  while (kept.length > 3 && Math.max(...kept.map(f.off)) > 1) {
    const worst = kept.reduce((w, p) => (f.off(p) > f.off(w) ? p : w));
    kept = kept.filter((p) => p !== worst);
    f = once(kept);
  }
  return { ...f, used: kept.length, max: Math.max(...kept.map(f.off)) };
}

export function build() {
  const design = JSON.parse(read('docs/maps/simple/region-places.json')).places as DesignPlace[];
  const world = JSON.parse(read('content/snowmoon/maps/world.json')).places as WorldPlace[];
  // the United Cities: Design's pixels came from world.json's km frame by one linear map
  const uc = world.filter((p) => p.frame === 'uc' && p.shape === 'point' && p.at);
  const fit = fitUc(uc.flatMap((p) => { const d = design.find((q) => q.id === p.id); return d ? [{ km: p.at!, px: d.pts[0] }] : []; }));
  const ucPx = new Map(uc.map((p) => [p.id, [fit.a + fit.b * p.at![0], fit.c + fit.d * p.at![1]] as Pt]));

  const inGrid = ([x, y]: Pt) => x >= 0 && x <= W && y >= 0 && y <= H;
  const places: SimplePlace[] = [];
  for (const p of design.filter((q) => q.shape === 'point' && !q.hide)) {
    const at = ucPx.get(p.id) ?? p.pts[0];
    if (!inGrid(at)) continue;
    const note = (p.note ?? '') + (p.id === 'redshire_islands' ? ' The gulf and the islands are drawn by us on top of the terrain, south-west of Redshire.' : '') + (p.id === 'hapton' ? ' Moved about 50 km onto the coast on this layout (2026-10-15); it had sat in the sea.' : '');
    places.push({ id: p.id, name: p.name, kind: 'city', prov: p.prov, at: [round(at[0]), round(at[1])], note: note.trim(), tier: TIER[p.id] ?? 3 });
  }
  for (const a of AREAS) {
    const p = design.find((q) => q.id === a.id)!;
    const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
    const c: Pt = [(Math.min(...xs) + Math.max(...xs)) / 2 + (a.nudge?.[0] ?? 0), (Math.min(...ys) + Math.max(...ys)) / 2 + (a.nudge?.[1] ?? 0)];
    places.push({ id: a.id, name: a.t, kind: 'area', prov: p.prov, at: [round(c[0]), round(c[1])], note: (p.note ?? '').trim(), tier: a.k });
  }
  const gl = design.find((q) => q.id === 'glasscrown')!;
  const edges: SimpleView['edges'] = [
    { id: 'glasscrown', name: 'Glasscrown', text: 'Glasscrown, far north', side: 'top', at: round(gl.pts[0][0]), prov: 'placed', note: (gl.note ?? '').trim() },
    // Design's phone chip; its note is the one under Design's Dzego inset (draft)
    { id: 'dzego', name: 'Dzego', text: 'Dzego, half the world away', side: 'right', at: round(H * 0.18), prov: 'placed', note: 'The book doesn’t say where Dzego lies relative to the United Cities. Off this map.' },
  ];
  const out: SimpleView = {
    about: 'Generated by scripts/maps-simple.ts from Claude Design\'s SimpleMap v2 (docs/maps/simple/) and world.json. Region pixels: 2048 × 1061 at 3.14365 km per px, y down.',
    grid: { w: W, h: H, km_per_px: 3.14365 },
    image: '/maps/simple/region.svg',
    places,
    edges,
  };
  writeFileSync(path.join(ROOT, 'content/snowmoon/maps/simple-view.json'), JSON.stringify(out, null, 1) + '\n');

  // the base: crop to the grid, drop the manifest, drop Hapton's disk
  let svg = read('docs/maps/simple/region-ext.svg');
  svg = svg.replace(/<metadata>[\s\S]*?<\/metadata>/, '');
  svg = svg.replace(/^<svg ([^>]*?)viewBox="0 -780 2048 2340" width="2048" height="2340"([^>]*)>/, `<svg $1viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"$2>`);
  if (!svg.includes(`viewBox="0 0 ${W} ${H}"`)) throw new Error('region-ext.svg: viewBox not as expected');
  let removed = 0;
  svg = svg.replace(/(<path[^>]*?\sd=")([^"]*)(")/g, (_, a: string, d: string, z: string) => {
    const subs = d.match(/M[^M]*/g) ?? [];
    const keep = subs.filter((sp) => {
      const n = (sp.match(/-?\d+\.?\d*/g) ?? []).map(Number), xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
      const cx = xs.reduce((s, v) => s + v, 0) / xs.length, cy = ys.reduce((s, v) => s + v, 0) / ys.length;
      const ext = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      const disk = Math.abs(cx - HAPTON_DESIGN[0]) < 14 && Math.abs(cy - HAPTON_DESIGN[1]) < 14 && ext < 40;
      if (disk) removed++;
      return !disk;
    });
    return a + keep.join('') + z;
  });
  if (!removed) throw new Error('region-ext.svg: Hapton\'s land disk not found');
  svg = svg.replace('<svg ', '<svg aria-hidden="true" ');
  mkdirSync(path.join(ROOT, 'public/maps/simple'), { recursive: true });
  writeFileSync(path.join(ROOT, 'public/maps/simple/region.svg'), svg);
  return { places: places.length, edges: edges.length, fit, removed };
}

const round = (v: number) => Math.round(v * 10) / 10;

if (process.argv[2] === 'build') {
  const r = build();
  console.log(`simple map built: ${r.places} places, ${r.edges} edge labels; United Cities fit from ${r.fit.used} cities (worst ${r.fit.max.toFixed(2)} px); Hapton's disk removed from ${r.removed} paths`);
}
