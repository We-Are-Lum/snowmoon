/**
 * Ingest Snowmoon into committed JSON.
 *
 *   npm run ingest              fetch all 32 chapters, refresh snapshots, rewrite JSON
 *   npm run ingest -- --offline parse the committed HTML snapshots only (no network)
 *
 * Outputs:
 *   content/snowmoon/source/chapter-N.html  exact bytes fetched from the source site
 *   content/snowmoon/text/chapter-N.json    ordered blocks with a sha256 per block
 *   docs/source-figures/c{N}-b{idx}.svg     every SVG figure from the source, standalone
 *
 * Deterministic: re-running on an unchanged source produces byte-identical files.
 * `fetched_at` only moves when the source bytes for that chapter change.
 */
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseChapter, sha256 } from './lib/parse-chapter';

export const WORK_ID = 'snowmoon';
export const SOURCE_BASE = 'https://vitalik.eth.limo/snowmoon/html';
export const CHAPTERS = 32;

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const offline = args.includes('--offline');
const outArg = args.find((a) => a.startsWith('--out='));
const SOURCE_DIR = path.join(ROOT, 'content', WORK_ID, 'source');
const TEXT_DIR = outArg ? path.resolve(outArg.slice(6)) : path.join(ROOT, 'content', WORK_ID, 'text');
const FIGURE_DIR = outArg ? path.join(TEXT_DIR, 'source-figures') : path.join(ROOT, 'docs', 'source-figures');

async function fetchChapter(n: number): Promise<string> {
  const url = `${SOURCE_BASE}/chapter-${n}.html`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt >= 3) throw new Error(`Fetching ${url} failed: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function main() {
  await mkdir(SOURCE_DIR, { recursive: true });
  await mkdir(TEXT_DIR, { recursive: true });
  await mkdir(FIGURE_DIR, { recursive: true });
  const figureFiles = new Set<string>();

  for (let n = 1; n <= CHAPTERS; n++) {
    const htmlPath = path.join(SOURCE_DIR, `chapter-${n}.html`);
    const jsonPath = path.join(TEXT_DIR, `chapter-${n}.json`);

    let html: string;
    if (offline) {
      html = await readFile(htmlPath, 'utf8');
    } else {
      html = await fetchChapter(n);
      await writeFile(htmlPath, html);
    }
    const sourceSha = sha256(html);

    // Keep the previous fetch date while the source is unchanged, so output stays byte-identical.
    let fetchedAt = new Date().toISOString().slice(0, 10);
    if (existsSync(jsonPath)) {
      const prev = JSON.parse(await readFile(jsonPath, 'utf8'));
      if (prev.source_sha256 === sourceSha && prev.fetched_at) fetchedAt = prev.fetched_at;
    }

    const { blocks, figures } = parseChapter(html, n);
    if (blocks.length === 0) throw new Error(`Chapter ${n} parsed to zero blocks`);
    for (const f of figures) {
      await writeFile(path.join(FIGURE_DIR, f.file), f.svg);
      figureFiles.add(f.file);
    }

    const doc = {
      work_id: WORK_ID,
      chapter: n,
      source_url: `${SOURCE_BASE}/chapter-${n}.html`,
      source_sha256: sourceSha,
      fetched_at: fetchedAt,
      license: 'GPL-3.0',
      blocks,
    };
    await writeFile(jsonPath, JSON.stringify(doc, null, 2) + '\n');

    const kinds = blocks.reduce<Record<string, number>>((m, b) => ((m[b.kind] = (m[b.kind] ?? 0) + 1), m), {});
    console.log(`chapter ${String(n).padStart(2)}: ${String(blocks.length).padStart(4)} blocks ${JSON.stringify(kinds)}`);
  }

  // Remove figures that no longer exist in the source.
  for (const f of await readdir(FIGURE_DIR)) {
    if (f.endsWith('.svg') && !figureFiles.has(f)) await rm(path.join(FIGURE_DIR, f));
  }
  console.log(`${figureFiles.size} figures in ${path.relative(ROOT, FIGURE_DIR)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
