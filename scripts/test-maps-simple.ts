/**
 * The simple map at /maps (scripts/maps-simple.ts, src/components/simple-map.tsx). Fails (exit 1) on any problem.
 *
 *   npm run test:maps-simple
 *
 * Land and sea are read from what the page draws: the land outline in public/maps/simple/region.svg (its
 * "land" clip path, less its lakes), rasterised at one pixel per region pixel. Checks:
 * - The served files are what the build makes from the committed sources (nothing hand-edited).
 * - No city sits in the sea, Hapton by name; each city's dot is on land with land all round it. Hapton in
 *   world.json lands where this map draws it.
 * - The hidden Group Center start stays hidden: not in the page's data, nor any point Design marked hidden.
 * - The Redshire gulf and its islands: the islands are land, cut off from the mainland, inside the gulf,
 *   135–225° from Redshire, with sea all round them; there is sea between Redshire and Arturia; the gulf's
 *   water reaches the open sea; Redshire and Arturia are on land.
 * - Nothing is hidden by chapter (owner, 2026-10-15); the ⓘ "About this map" says the map is invented, not
 *   by the author, and subject to change, names the book's two figures, and links the recipe.
 * - Only the terrain grid is drawn; "Suggest a change" opens a new GitHub issue with the place filled in.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { REPO_URL } from '../src/lib/config';
import { edgeText, suggestUrl, type SimpleView } from '../src/lib/maps/simple';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
type Pt = [number, number];

// --- The served files are the build's --------------------------------------------------
const before = { view: read('content/snowmoon/maps/simple-view.json'), svg: read('public/maps/simple/region.svg') };
const { build } = await import('./maps-simple');
build();
check('simple-view.json is what the build makes', read('content/snowmoon/maps/simple-view.json') === before.view, 'run npx tsx scripts/maps-simple.ts build and commit');
check('region.svg is what the build makes', read('public/maps/simple/region.svg') === before.svg, 'run npx tsx scripts/maps-simple.ts build and commit');

const view = JSON.parse(before.view) as SimpleView;
const svg = before.svg;
const { w: W, h: H } = view.grid;

// --- Land and sea, as drawn ---------------------------------------------------------------
const landD = svg.match(/<clipPath id="land"><path d="([^"]+)"/)?.[1];
const lakeD = svg.match(/<path d="([^"]+)" fill="#C3D3D5"/)?.[1];
check('the drawing has a land outline and lakes', Boolean(landD && lakeD));
const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><path d="${landD}" fill="#000" fill-rule="evenodd"/><path d="${lakeD}" fill="#fff" fill-rule="evenodd"/></svg>`))
  .greyscale().raw().toBuffer({ resolveWithObject: true });
const land = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && mask.data[Math.floor(y) * mask.info.width + Math.floor(x)] < 128;
const solid = ([x, y]: Pt, r: number) => land(x, y) && Array.from({ length: 16 }, (_, i) => [x + r * Math.cos((i * Math.PI) / 8), y + r * Math.sin((i * Math.PI) / 8)]).every(([a, b]) => land(a, b));

// --- No city in the sea -------------------------------------------------------------------------
const cities = view.places.filter((p) => p.kind === 'city' && p.id !== 'redshire_islands');
const wet = cities.filter((p) => !solid(p.at, 3));
check('no city sits in the sea (its dot on land, land 3 px all round)', wet.length === 0, wet.map((p) => `${p.id} at ${p.at}`).join(', '));
const hapton = view.places.find((p) => p.id === 'hapton');
check('Hapton is on the map and on land', Boolean(hapton && solid(hapton.at, 4)), JSON.stringify(hapton?.at));
check('Hapton is no longer where it sat in the sea (1198.9, 481.7)', Boolean(hapton && Math.hypot(hapton.at[0] - 1198.9, hapton.at[1] - 481.7) > 10));
check('no stray land disk is left where Hapton sat', !land(1198.9, 481.7) && !land(1192, 478) && !land(1205, 486));
const world = JSON.parse(read('content/snowmoon/maps/world.json')).places as { id: string; at?: number[] }[];
const hw = world.find((p) => p.id === 'hapton')!.at!;
check('Hapton in world.json maps to where this map draws it', Boolean(hapton && Math.hypot(1856.008 + 0.4941 * hw[0] - hapton.at[0], 422.38 - 0.4941 * hw[1] - hapton.at[1]) < 1), `${hw} → ${hapton?.at}`);

// --- Hidden stays hidden -------------------------------------------------------------------------
const design = JSON.parse(read('docs/maps/simple/region-places.json')).places as { id: string; hide: boolean; shape: string; pts: Pt[] }[];
const hiddenIds = design.filter((p) => p.hide).map((p) => p.id);
check('the Group Center start is marked hidden in the design', hiddenIds.includes('center_start'));
check('the hidden Group Center start is not in the page\'s data', !view.places.some((p) => p.id === 'center_start') && !before.view.includes('center_start'));
check('no point the design marks hidden is in the page\'s data', !view.places.some((p) => hiddenIds.includes(p.id)), view.places.filter((p) => hiddenIds.includes(p.id)).map((p) => p.id).join(', '));
check('no route, link or route end is drawn as a place', !view.places.some((p) => /_route$|_start$|_end$|^link_|^rail_/.test(p.id)));

// --- The Redshire gulf and its islands ---------------------------------------------------------------
const at = (id: string) => view.places.find((p) => p.id === id)!.at;
const rs = at('redshire'), ar = at('arturia'), isl = at('redshire_islands');
// the islands' land: every land pixel within 30 px of the islands' point, and the component each belongs to
const comp = (seed: Pt, limit = 200_000) => {
  const seen = new Set<number>(), q: number[] = [];
  const k0 = Math.floor(seed[1]) * W + Math.floor(seed[0]);
  if (!land(seed[0], seed[1])) return seen;
  q.push(k0); seen.add(k0);
  while (q.length && seen.size < limit) {
    const k = q.pop()!, x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, nk = ny * W + nx;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && !seen.has(nk) && land(nx, ny)) { seen.add(nk); q.push(nk); }
    }
  }
  return seen;
};
// the islands: land pieces inside the gulf that are not the mainland, each found by flooding its land
const gulf = design.find((p) => p.id === 'redshire_gulf')!.pts;
const inPoly = ([x, y]: Pt, P: Pt[]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const mainland = comp(rs);
check('Redshire and Arturia are on the same mainland', mainland.has(Math.floor(ar[1]) * W + Math.floor(ar[0])));
const gx = gulf.map((p) => p[0]), gy = gulf.map((p) => p[1]);
const islands: Set<number>[] = [];
const claimed = new Set<number>();
for (let y = Math.floor(Math.min(...gy)); y <= Math.max(...gy); y++) for (let x = Math.floor(Math.min(...gx)); x <= Math.max(...gx); x++) {
  const k = y * W + x;
  if (!land(x, y) || mainland.has(k) || claimed.has(k) || !inPoly([x, y], gulf)) continue;
  const c = comp([x, y], 20_000);
  c.forEach((q) => claimed.add(q));
  if (c.size >= 20 && c.size < 20_000) islands.push(c);
}
const centre = (c: Set<number>): Pt => { let sx = 0, sy = 0; c.forEach((k) => { sx += k % W; sy += (k / W) | 0; }); return [sx / c.size, sy / c.size]; };
check('at least two islands are drawn inside the gulf, apart from the mainland (wg-386)', islands.length >= 2, `${islands.length} island(s): ${islands.map((c) => `${c.size} px at ${centre(c).map((v) => v.toFixed(0))}`).join('; ')}`);
const islHome = islands.find((c) => c.has(Math.floor(isl[1]) * W + Math.floor(isl[0])) || [...c].some((k) => Math.hypot((k % W) - isl[0], ((k / W) | 0) - isl[1]) < 6));
check('the "Redshire\'s south islands" dot is on one of them', Boolean(islHome));
const ic: Pt = islHome ? centre(islHome) : isl;
check('the islands lie inside the gulf', islands.every((c) => inPoly(centre(c), gulf)));
// sea all round each island: every pixel 2 px outside its outline is sea
const seaRound = islands.map((c) => {
  let edge = 0, wetEdge = 0;
  c.forEach((k) => { const x = k % W, y = (k / W) | 0; for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [2, -2], [-2, 2]]) { const nk = (y + dy) * W + x + dx; if (c.has(nk)) continue; edge++; if (!land(x + dx, y + dy)) wetEdge++; } });
  return edge ? wetEdge / edge : 0;
});
check('there is sea all round each island (2 px out is sea)', seaRound.every((r) => r === 1), seaRound.map((r) => `${(r * 100).toFixed(0)}%`).join(', '));
const bearing = (from: Pt, to: Pt) => ((Math.atan2(to[0] - from[0], -(to[1] - from[1])) * 180) / Math.PI + 360) % 360;
const b = bearing(rs, ic);
check('the islands are 135–225° from Redshire (south; c4-b73)', b >= 135 && b <= 225, `${b.toFixed(0)}°`);
const seg = Array.from({ length: 200 }, (_, i) => [rs[0] + ((ar[0] - rs[0]) * i) / 199, rs[1] + ((ar[1] - rs[1]) * i) / 199] as Pt);
check('there is sea between Redshire and Arturia (wg-388)', seg.some(([x, y]) => !land(x, y)));
check('Redshire and Arturia are on land', solid(rs, 3) && solid(ar, 3));
// the gulf's water reaches the open sea: flood the sea from a point between the islands and Redshire
const seaFrom = (seed: Pt) => {
  const seen = new Uint8Array(W * H), q: number[] = [];
  const k0 = Math.floor(seed[1]) * W + Math.floor(seed[0]);
  if (land(seed[0], seed[1])) return { open: false, n: 0 };
  q.push(k0); seen[k0] = 1; let n = 0, open = false;
  while (q.length) {
    const k = q.pop()!, x = k % W, y = (k / W) | 0; n++;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) open = true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, nk = ny * W + nx;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && !seen[nk] && !land(nx, ny)) { seen[nk] = 1; q.push(nk); }
    }
  }
  return { open, n };
};
const gulfSea = seg.find(([x, y]) => !land(x, y))!;
const flood = gulfSea ? seaFrom(gulfSea) : { open: false, n: 0 };
check('the gulf\'s water reaches the open sea (not a lake)', flood.open, `${flood.n} sea px reached`);

// --- Nothing hidden; the map says what it is (owner, 2026-10-15) -----------------------------------------
const comp2 = read('src/components/simple-map.tsx');
check('nothing is hidden by chapter: the page reads no reading progress and has no "?" placeholder', !/openedChapters|read-to|Show anyway|later chapter/.test(comp2) && !before.view.includes('"first"'));
check('every place is shown by its own name', /aria-label=\{p\.name\}/.test(comp2) && /name: \(p\) => p\.name/.test(comp2));
check('Glasscrown and Dzego\'s edge labels name them', edgeText(view.edges.find((e) => e.id === 'glasscrown')!).includes('Glasscrown') && edgeText(view.edges.find((e) => e.id === 'dzego')!).includes('Dzego'));
check('no book-vs-ours key or tags on the page', !/sm-key|From the book|Placed by us|sm-tag/.test(comp2));
check('the ⓘ "About this map" says it is invented, not by the author, and subject to change', /About this map/.test(comp2) && /Invented by Snowmoon Party, not by the author\./.test(comp2) && /It will change/.test(comp2));
check('it names the book\'s two figures (c29-b34, c5-b46) instead of claiming the book has none', /battle map in chapter 29/.test(comp2) && /United Cities connect in chapter 5/.test(comp2));
const page = read('src/app/maps/page.tsx');
check('it links the terrain\'s recipe, which exists in the repository', /terrain-v5\/recipe\.json/.test(page) && /data\.links\.recipe/.test(comp2) && Boolean(read('content/snowmoon/maps/terrain-v5/recipe.json')));
check('the AI label is on the map and opens the same panel', /data\.shortLabel\} ⓘ/.test(comp2) && /toggleAbout/.test(comp2));

// --- Only the grid; the issue link -------------------------------------------------------------------------
check('the base is cropped to the terrain grid', svg.slice(0, 400).includes(`viewBox="0 0 ${W} ${H}"`));
check('every place is inside the grid', view.places.every((p) => p.at[0] >= 0 && p.at[0] <= W && p.at[1] >= 0 && p.at[1] <= H));
check('nothing from outside the grid is a place (Glasscrown, Messalia, Haragmir, the Arctic, Dzego)', !view.places.some((p) => ['glasscrown', 'messalia', 'haragmir', 'arctic', 'dzego', 'pafogai', 'sadzu'].includes(p.id)));
check('the C2PA manifest of Design\'s drawing is dropped, since the drawing is changed', !svg.includes('c2pa:manifest'));
const u = new URL(suggestUrl(REPO_URL, { id: 'hapton', name: 'Hapton' }));
check('"Suggest a change" opens a new issue on the project\'s repository', u.origin + u.pathname === `${REPO_URL}/issues/new`);
check('the issue\'s title and body name the place', u.searchParams.get('title') === 'Map: Hapton' && (u.searchParams.get('body') ?? '').includes('Hapton [hapton]'));
check('the link opens GitHub in a new tab and the page sends nothing itself', /target="_blank" rel="noopener noreferrer"/.test(comp2) && !/fetch\(/.test(comp2));

if (failures.length) {
  console.error(`SIMPLE MAP TESTS FAILED (${failures.length}, ${passed} passed):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`simple map tests passed: ${passed} checks (built files, cities on land, Hapton, hidden stays hidden, the Redshire gulf and islands, nothing hidden, the About panel, grid only, the issue link)`);
