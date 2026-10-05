/**
 * Adaptation docs cite real blocks. Fails (exit 1) on any problem.
 *
 *   npx tsx scripts/check-adaptations.ts
 *   npx tsx scripts/check-adaptations.ts --dir=/tmp/planted   check another folder; a planted bad ID must fail
 *
 * - Every block ID cited in any .md file under adaptations/ exists in the
 *   committed text (content/snowmoon/text/).
 * - Every seed in config/adaptations.json has a folder with brief.md, and every
 *   folder with a brief.md is listed as a seed.
 * - The open-threads file the config names exists, and the bounty has a URL and
 *   a valid closing date.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { findCites } from '../src/lib/adaptation-cites';

const ROOT = process.cwd();
const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const DIR = path.resolve(arg('dir') ?? path.join(ROOT, 'adaptations'));
const TEXT_DIR = path.join(ROOT, 'content', 'snowmoon', 'text');

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);

// Every block that exists, as "c{chapter}-b{idx}".
const blocks = new Set<string>();
for (const f of readdirSync(TEXT_DIR).filter((f) => /^chapter-\d+\.json$/.test(f))) {
  const ch = JSON.parse(readFileSync(path.join(TEXT_DIR, f), 'utf8')) as { chapter: number; blocks: { idx: number }[] };
  for (const b of ch.blocks) blocks.add(`c${ch.chapter}-b${b.idx}`);
}

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return markdownFiles(p);
    return name.endsWith('.md') ? [p] : [];
  });
}

if (!existsSync(DIR)) {
  fail(`no folder at ${DIR}`);
} else {
  let total = 0;
  for (const file of markdownFiles(DIR)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const c of findCites(line)) {
        total++;
        if (!blocks.has(c.id)) fail(`${path.relative(ROOT, file)}:${i + 1}: ${c.id} is not a block in the committed text`);
      }
    });
  }
  console.log(`${total} citations checked in ${path.relative(ROOT, DIR) || DIR}`);
}

// Config and folders agree. Skipped with --dir, which checks citations only.
if (!arg('dir')) {
  type Seed = { slug: string; title: string; line: string; spoilers_through: number; video_url: string | null };
  const config = JSON.parse(readFileSync(path.join(ROOT, 'config', 'adaptations.json'), 'utf8')) as {
    bounty: { url: string; closes: string };
    open_threads: string;
    seeds: Seed[];
  };
  const slugs = new Set(config.seeds.map((s) => s.slug));
  for (const s of config.seeds) {
    if (!existsSync(path.join(DIR, s.slug, 'brief.md'))) fail(`seed ${s.slug}: no adaptations/${s.slug}/brief.md`);
    if (!s.title || !s.line) fail(`seed ${s.slug}: title and line are required`);
    if (!Number.isInteger(s.spoilers_through) || s.spoilers_through < 1 || s.spoilers_through > 32)
      fail(`seed ${s.slug}: spoilers_through must be a chapter number`);
    if (s.video_url !== null && !/^https:\/\//.test(s.video_url)) fail(`seed ${s.slug}: video_url must be https or null`);
  }
  for (const name of readdirSync(DIR)) {
    if (existsSync(path.join(DIR, name, 'brief.md')) && !slugs.has(name)) fail(`adaptations/${name} has a brief but is not in config/adaptations.json`);
  }
  if (!existsSync(path.join(ROOT, config.open_threads))) fail(`open_threads file missing: ${config.open_threads}`);
  if (!/^https:\/\//.test(config.bounty.url)) fail('bounty.url must be an https URL');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.bounty.closes) || Number.isNaN(Date.parse(config.bounty.closes)))
    fail('bounty.closes must be a YYYY-MM-DD date');
}

if (failures.length) {
  console.error(`FAIL (${failures.length})`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('OK');
