import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_URL, CONTACT_EMAIL } from '~/lib/config';
import { WorldMap, type WorldMapData } from '~/components/world-map';
import './maps.css';

export const metadata = { title: 'Maps' };

const read = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8');

/**
 * The world map (Claude Design's "World Map Styled", 2026-10-12), on the frozen v5 terrain styled by
 * scripts/maps-style.ts. Static: the tap sheets (docs/maps/world-tap-sheets.md), the world guide's chapters
 * and the placed-by-us list are read at build time; the device's furthest chapter limits what shows.
 */
export default function MapsPage() {
  const view = JSON.parse(read('content/snowmoon/maps/world-view.json'));
  const guide = JSON.parse(read('content/snowmoon/world-guide.json')) as { lines: { id: string; from_chapter: number }[] };
  const fromCh = Object.fromEntries(guide.lines.map((l) => [l.id, l.from_chapter]));
  // tap sheets: one "## name" section each; the first paragraph that is not a list is the explanation
  const sheets: WorldMapData['sheets'] = {};
  for (const sec of read('docs/maps/world-tap-sheets.md').split('\n## ').slice(1)) {
    const [head, ...rest] = sec.split('\n');
    const body = rest.join('\n').trim();
    const prov = body.split(/\n\s*\n/).find((x) => !x.trim().startsWith('-')) ?? '';
    const lines = [...body.matchAll(/^- (wg-\d+): (.+?)\s*\(([^()]*)\)\s*$/gm)].map((m) => ({ id: m[1], text: m[2], refs: m[3], ch: fromCh[m[1]] ?? 0 }));
    sheets[head.trim()] = { prov: prov.trim(), lines };
  }
  // the placed-by-us list, with each placement's reason
  const placedWhy: Record<string, string> = {};
  for (const m of read('docs/maps/world-placed-by-us.md').matchAll(/^- \*\*(.+?)\*\* \[([a-z0-9_]+)\]: (.+?)(?: \(lines [^)]*\))?$/gm)) placedWhy[m[2]] = m[3];
  const data: WorldMapData = {
    views: view.views,
    places: view.places.map((p: WorldMapData['places'][number] & { lines: string[] }) => ({ ...p, first: p.lines.length ? Math.min(...p.lines.map((l) => fromCh[l] ?? 99)) : 0 })),
    sheets,
    placedWhy,
    label: view.label,
    shortLabel: view.short_label,
    textureNote: view.texture_note,
    links: {
      errata: `${REPO_URL}/blob/main/docs/maps/errata.md`,
      placed: `${REPO_URL}/blob/main/docs/maps/world-placed-by-us.md`,
      recipe: `${REPO_URL}/blob/main/content/snowmoon/maps/terrain-v5/recipe.json`,
      issues: `${REPO_URL}/issues`,
      email: CONTACT_EMAIL,
    },
  };
  return <WorldMap data={data} />;
}
