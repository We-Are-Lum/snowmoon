import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_URL } from '~/lib/config';
import { SimpleMap } from '~/components/simple-map';
import type { SimpleView } from '~/lib/maps/simple';
import './simple-map.css';

export const metadata = { title: 'Maps' };

const read = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8');

/**
 * The simple map (Claude Design's "SimpleMap v2", 2026-10-15; docs/maps/simple/), read-only. Built by
 * scripts/maps-simple.ts into content/snowmoon/maps/simple-view.json and public/maps/simple/region.svg;
 * read at build time. The device's furthest chapter limits what is named (src/components/simple-map.tsx).
 */
export default function MapsPage() {
  const view = JSON.parse(read('content/snowmoon/maps/simple-view.json')) as SimpleView;
  const meta = JSON.parse(read('content/snowmoon/maps/world-view.json')) as { label: string; short_label: string };
  return <SimpleMap data={{ ...view, label: meta.label, shortLabel: meta.short_label, repo: REPO_URL }} />;
}
