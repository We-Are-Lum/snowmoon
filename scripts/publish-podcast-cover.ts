/**
 * Publish the podcast cover (content/snowmoon/podcast/cover.png) to R2 under a name that
 * carries its sha256 (Apple: change the file name when the art changes), and write its
 * recipe. The art is drawn in code by scripts/make_channel_art.py (owner-supplied).
 *
 *   npm run publish:podcast-cover -- --evidence=docs/prompts/010-pronunciation-reports.md
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { r2, sha256File } from './lib/r2';
import { publishedBy } from './lib/published-by';

const ROOT = path.resolve(import.meta.dirname, '..');
const file = path.join(ROOT, 'content/snowmoon/podcast/cover.png');
const sha = await sha256File(file);
const { url } = await r2().put(`podcast/cover-${sha.slice(0, 12)}.png`, file, 'image/png');
const fonts = [
  'node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-500-normal.woff2',
  'node_modules/@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2',
];
const pkg = async (name: string) => JSON.parse(await readFile(path.join(ROOT, `node_modules/${name}/package.json`), 'utf8')).version as string;
const recipe = {
  work_id: 'snowmoon',
  what: 'The podcast cover, 3000 × 3000, RGB, drawn in code (no image model).',
  made_by: {
    script: 'scripts/make_channel_art.py',
    function: 'podcast_cover_svg',
    supplied_by: 'FID 6786, 2026-10-08 (the script and the PNG); in the repo only the script\'s paths changed',
    renderer: 'Playwright Chromium screenshot of the SVG, device scale 1',
    fonts: await Promise.all(fonts.map(async (f) => ({ file: f, sha256: await sha256File(path.join(ROOT, f)) }))),
    font_packages: { '@fontsource/crimson-pro': await pkg('@fontsource/crimson-pro'), '@fontsource/dm-mono': await pkg('@fontsource/dm-mono') },
    seed: 3724,
  },
  checked: 'Re-rendered with the committed script on 2026-10-08: pixel-identical to this file (no differing pixel); the PNG bytes differ only in encoding.',
  assist: null,
  file: { path: 'content/snowmoon/podcast/cover.png', sha256: sha, width: 3000, height: 3000, mode: 'RGB', url },
  published_by: publishedBy(ROOT, 'scripts/publish-podcast-cover.ts'),
};
await writeFile(path.join(ROOT, 'content/snowmoon/recipes/podcast/cover.json'), JSON.stringify(recipe, null, 2) + '\n');
console.log(`cover: ${url}`);
