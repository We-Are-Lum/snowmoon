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
import { type XY, type Place, type MapFile, toDeg, pointsOf, offset, centroid, plane, dist, rad, inside, length, run } from './lib/map-tests';

const ROOT = process.cwd();
const DIR = 'content/snowmoon/maps';
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

const guide = JSON.parse(read('content/snowmoon/world-guide.json')) as { lines: { id: string; section: string; text: string }[] };
const geo = guide.lines.filter((l) => l.section === 'geography');
const maps: MapFile[] = readdirSync(path.join(ROOT, DIR)).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(read(`${DIR}/${f}`))).filter((m) => Array.isArray(m.tests)); // world-view.json is the page's view data, not a map

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
