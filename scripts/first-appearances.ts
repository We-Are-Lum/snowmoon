/**
 * Where the book first names each character (step 4, decision 19 of 2026-10-09), recorded in
 * content/snowmoon/designs/characters/*.json as first_appearance: { chapter, idx, as }. Used to cover
 * characters (and their sheets) past where a reader has got to, instead of the earliest fact.
 *
 * Derived from the book text (content/snowmoon/text/chapter-*.json): the earliest block that names
 * them, by their full name, a word of it they are called by (titles like "General" left out), or an
 * alias listed in the file's "aliases". Whole words, case kept. Phrases in the file's
 * "name_exclusions" are not them (e.g. "Hun Min" street is not Min).
 *
 *   npx tsx scripts/first-appearances.ts           check: exit 1 if a file is out of date
 *   npx tsx scripts/first-appearances.ts --write   write first_appearance into the files
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'content/snowmoon/designs/characters');
const write = process.argv.includes('--write');
const TITLES = /^(Lord|Lady|General|Senator|Doctor|Dr\.?)$/;

const chapters = readdirSync(path.join(ROOT, 'content/snowmoon/text'))
  .filter((f) => /^chapter-\d+\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/text', f), 'utf8')) as { chapter: number; blocks: { idx: number; content: string }[] })
  .sort((a, b) => a.chapter - b.chapter);

export function namesFor(c: { name: string; aliases?: string[] }): string[] {
  return [...new Set([c.name, ...c.name.split(/\s+/).filter((w) => !TITLES.test(w) && w.length > 1), ...(c.aliases ?? [])])];
}

export function firstNamed(names: string[], exclusions: string[] = []): { chapter: number; idx: number; as: string } | null {
  const res = names.map((n) => ({ n, re: new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u') }));
  for (const ch of chapters) for (const b of ch.blocks) {
    const text = exclusions.reduce((t, x) => t.split(x).join(' '), b.content);
    const hit = res.find((r) => r.re.test(text));
    if (hit) return { chapter: ch.chapter, idx: b.idx, as: hit.n };
  }
  return null;
}

let stale = 0;
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  const file = path.join(DIR, f);
  const raw = readFileSync(file, 'utf8');
  const c = JSON.parse(raw) as { name: string; aliases?: string[]; name_exclusions?: string[]; first_appearance?: unknown; facts?: { chapter: number }[] };
  const found = firstNamed(namesFor(c), c.name_exclusions);
  const earliestFact = Math.min(...(c.facts ?? []).map((x) => x.chapter));
  console.log(`${f.padEnd(16)} ${found ? `ch ${found.chapter} b${found.idx} as "${found.as}"` : 'not named in the text'}  (earliest fact: ch ${earliestFact})`);
  if (JSON.stringify(c.first_appearance ?? null) !== JSON.stringify(found)) {
    stale++;
    if (write) {
      const next = { ...c, first_appearance: found };
      writeFileSync(file, JSON.stringify(next, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
    }
  }
}
if (stale && !write) {
  console.error(`${stale} character files have no up-to-date first_appearance; run with --write`);
  process.exit(1);
}
console.log(write ? `written: ${stale} files` : 'first appearances up to date');
