/**
 * Publish the spoken summary's MP3 to R2 (media.snowmoon.party) as the podcast's
 * bonus episode, and record its URL in content/snowmoon/recipes/podcast/summary.json
 * (owner, 2026-10-10: "Go ahead. And publish"). Input: narration-out/podcast/summary-35min.mp3,
 * which must match the recipe's sha256. The key carries the sha256, so a re-run skips it.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/publish-podcast-summary.ts [--dry-run]
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { r2, sha256File } from './lib/r2';
import { publishedBy } from './lib/published-by';

const ROOT = path.resolve(import.meta.dirname, '..');
const RECIPE = path.join(ROOT, 'content/snowmoon/recipes/podcast/summary.json');
const FILE = path.join(ROOT, 'narration-out/podcast/summary-35min.mp3');
const recipe = JSON.parse(await readFile(RECIPE, 'utf8'));
const sha = await sha256File(FILE);
if (sha !== recipe.file.sha256) throw new Error('the MP3 does not match its recipe');
const key = `podcast/summary-${sha.slice(0, 12)}.mp3`;
if (process.argv.includes('--dry-run')) {
  console.log(`would upload ${key}`);
} else {
  const res = await r2().put(key, FILE, 'audio/mpeg');
  recipe.file.url = res.url;
  recipe.published_by = publishedBy(ROOT, 'scripts/publish-podcast-summary.ts');
  await writeFile(RECIPE, JSON.stringify(recipe, null, 2) + '\n');
  console.log(`${res.uploaded ? 'uploaded' : 'already there'}: ${res.url}`);
}
