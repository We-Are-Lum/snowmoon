/**
 * Publish the podcast's MP3s to R2 (media.snowmoon.party) and record each URL in
 * its recipe. Inputs: narration-out/podcast/chapter-N.mp3 and the recipes written
 * by scripts/podcast-audio.py (content/snowmoon/recipes/podcast/chapter-N.json).
 * Keys carry the file's sha256, so re-runs skip what is already there.
 *
 *   npm run publish:podcast              all 32
 *   npm run publish:podcast -- --dry-run  list what would be uploaded
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool, r2, sha256File } from './lib/r2';
import { publishedBy } from './lib/published-by';

const ROOT = path.resolve(import.meta.dirname, '..');
const RECIPES = path.join(ROOT, 'content/snowmoon/recipes/podcast');
const AUDIO = path.join(ROOT, 'narration-out/podcast');
const dryRun = process.argv.includes('--dry-run');

const store = dryRun ? null : r2();
const by = dryRun ? null : publishedBy(ROOT, 'scripts/publish-podcast.ts');
let uploaded = 0;
await pool(
  Array.from({ length: 32 }, (_, i) => i + 1),
  3,
  async (n) => {
    const file = path.join(AUDIO, `chapter-${n}.mp3`);
    const recipePath = path.join(RECIPES, `chapter-${n}.json`);
    const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
    const sha = await sha256File(file);
    if (sha !== recipe.file.sha256) throw new Error(`chapter ${n}: the MP3 does not match its recipe`);
    const key = `podcast/chapter-${n}-${sha.slice(0, 12)}.mp3`;
    if (dryRun) return console.log(`would upload ${key}`);
    const res = await store!.put(key, file, 'audio/mpeg');
    if (res.uploaded) uploaded++;
    recipe.file.url = res.url;
    recipe.published_by = by;
    await writeFile(recipePath, JSON.stringify(recipe, null, 2) + '\n');
  },
);
console.log(dryRun ? 'dry run' : `podcast: ${uploaded} uploaded, ${32 - uploaded} already there`);
