/**
 * The characters in the order of how often the book names them (owner, 2026-11-04), written to
 * content/snowmoon/characters-by-mentions.json. The counting rules are in scripts/lib/character-mentions.ts and in the
 * file itself.
 *
 *   npx tsx scripts/characters-by-mentions.ts           check: exit 1 if the file is out of date with the text
 *   npx tsx scripts/characters-by-mentions.ts --write   write the file
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MENTIONS_FILE, mentionsFile } from './lib/character-mentions';

const ROOT = path.resolve(import.meta.dirname, '..');
const file = path.join(ROOT, MENTIONS_FILE);
const next = mentionsFile(ROOT);
const now = existsSync(file) ? readFileSync(file, 'utf8') : '';
for (const c of (JSON.parse(next) as { characters: { slug: string; mentions: number; blocks: number }[] }).characters)
  console.log(`${c.slug.padEnd(10)} ${String(c.mentions).padStart(5)} mentions in ${String(c.blocks).padStart(4)} blocks`);
if (process.argv.includes('--write')) {
  writeFileSync(file, next);
  console.log(now === next ? `${MENTIONS_FILE}: unchanged` : `${MENTIONS_FILE}: written`);
} else if (now !== next) {
  console.error(`${MENTIONS_FILE} is out of date with the book text or the character files; run: npm run characters:mentions -- --write`);
  process.exit(1);
} else console.log(`${MENTIONS_FILE}: up to date`);
