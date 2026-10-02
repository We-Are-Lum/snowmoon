/**
 * Ingest checks. Fails (exit 1) on any problem.
 *
 *   npm run check:ingest                 check the committed snapshot
 *   npm run check:ingest -- --dir=PATH   check another text dir (used to plant errors)
 *
 * 1. 32 chapters parsed, none empty; idx is 0..n-1; every sha256 matches its content.
 * 2. Re-running ingest (offline, on the committed HTML) produces byte-identical JSON.
 * 3. Chapter 1 contains screen, figure, and quote blocks.
 * 4. Coverage: the visible text of each source page equals the text of its blocks
 *    (whitespace ignored), so no text was dropped, duplicated, or reordered.
 * 5. Every block kind is one of the known kinds.
 * 6. screen and figure blocks (and only they) carry `data`; every evidence quote is an
 *    exact substring of the block it cites; every figure's SVG files exist, are
 *    well-formed XML, and no orphan SVGs are left in docs/source-figures/.
 */
import { readFile, readdir, mkdtemp, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as cheerio from 'cheerio';
import { marked } from 'marked';
import { XMLValidator } from 'fast-xml-parser';
import { sha256, type Block } from './lib/parse-chapter';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHAPTERS = 32;
const dirArg = process.argv.slice(2).find((a) => a.startsWith('--dir='));
const TEXT_DIR = dirArg ? path.resolve(dirArg.slice(6)) : path.join(ROOT, 'content/snowmoon/text');
const SOURCE_DIR = path.join(ROOT, 'content/snowmoon/source');
const figArg = process.argv.slice(2).find((a) => a.startsWith('--figures='));
const FIGURE_DIR = figArg ? path.resolve(figArg.slice(10)) : path.join(ROOT, 'docs/source-figures');

const KINDS = new Set(['heading', 'dateline', 'paragraph', 'quote', 'screen', 'figure', 'break']);

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);

const squash = (s: string) => s.replace(/\s+/g, '');

function sourceText(html: string): string {
  const $ = cheerio.load(html);
  const page = $('.document-page');
  page.find('nav, script, style').remove();
  return squash(page.text());
}

function blockText(b: Block): string {
  const html = b.kind === 'break' ? '' : (marked.parse(b.content, { async: false }) as string);
  return squash(cheerio.load(html).root().text());
}

async function loadChapter(dir: string, n: number) {
  return JSON.parse(await readFile(path.join(dir, `chapter-${n}.json`), 'utf8')) as {
    chapter: number;
    blocks: Block[];
  };
}

async function checkStructureAndCoverage() {
  for (let n = 1; n <= CHAPTERS; n++) {
    const file = path.join(TEXT_DIR, `chapter-${n}.json`);
    if (!existsSync(file)) {
      fail(`chapter ${n}: missing ${file}`);
      continue;
    }
    const doc = await loadChapter(TEXT_DIR, n);
    if (doc.chapter !== n) fail(`chapter ${n}: file says chapter ${doc.chapter}`);
    if (!doc.blocks?.length) {
      fail(`chapter ${n}: no blocks`);
      continue;
    }
    if (!doc.blocks.some((b) => b.kind === 'paragraph')) fail(`chapter ${n}: no paragraph blocks`);
    doc.blocks.forEach((b, i) => {
      if (!KINDS.has(b.kind)) fail(`chapter ${n} block ${b.idx}: unknown kind ${b.kind}`);
      if (b.idx !== i) fail(`chapter ${n}: block at position ${i} has idx ${b.idx}`);
      if (b.sha256 !== sha256(b.content)) fail(`chapter ${n} block ${b.idx}: sha256 mismatch`);
    });

    const src = sourceText(await readFile(path.join(SOURCE_DIR, `chapter-${n}.html`), 'utf8'));
    const got = doc.blocks.map(blockText).join('');
    if (src !== got) {
      let i = 0;
      while (i < src.length && src[i] === got[i]) i++;
      fail(
        `chapter ${n}: text coverage differs at char ${i}\n    source: …${src.slice(i - 30, i + 50)}\n    blocks: …${got.slice(i - 30, i + 50)}`,
      );
    }
  }
}

async function checkChapterOne() {
  const doc = await loadChapter(TEXT_DIR, 1).catch(() => null);
  if (!doc) return;
  const count = (k: string) => doc.blocks.filter((b) => b.kind === k).length;
  for (const k of ['screen', 'figure', 'quote']) {
    if (count(k) === 0) fail(`chapter 1: zero ${k} blocks (parser is wrong)`);
  }
  console.log(`chapter 1: ${count('screen')} screen, ${count('figure')} figure, ${count('quote')} quote blocks`);
}

async function checkScreenData() {
  const referenced = new Set<string>();
  let figures = 0;
  for (let n = 1; n <= CHAPTERS; n++) {
    const doc = await loadChapter(TEXT_DIR, n).catch(() => null);
    if (!doc) continue;
    const byIdx = new Map(doc.blocks.map((b) => [b.idx, b]));
    for (const b of doc.blocks) {
      const id = `c${n}-b${b.idx}`;
      const isDevice = b.kind === 'screen' || b.kind === 'figure';
      if (!isDevice) {
        if (b.data) fail(`${id}: ${b.kind} block should not carry data`);
        continue;
      }
      const d = b.data;
      if (!d) {
        fail(`${id}: ${b.kind} block has no data`);
        continue;
      }
      if (!d.world) fail(`${id}: no world`);
      if (d.device_provisional !== true) fail(`${id}: device is not marked provisional`);
      if (!d.fields?.length) fail(`${id}: no fields`);
      for (const [label, ev] of [['world', d.world_evidence], ['device', d.device_evidence]] as const) {
        if (!ev) {
          if (label === 'world' || d.device) fail(`${id}: ${label} has no evidence`);
          continue;
        }
        const cited = byIdx.get(ev.idx);
        if (!cited) fail(`${id}: ${label} evidence cites missing block ${ev.idx}`);
        else if (!ev.quote || !cited.content.includes(ev.quote)) fail(`${id}: ${label} evidence quote is not in block ${ev.idx}`);
      }
      const svgFields = d.fields.filter((f) => f.type === 'svg');
      if ((b.kind === 'figure') !== svgFields.length > 0) fail(`${id}: kind ${b.kind} but ${svgFields.length} svg fields`);
      for (const f of svgFields) {
        if (f.type !== 'svg') continue;
        figures++;
        const name = path.basename(f.file);
        referenced.add(name);
        const file = path.join(FIGURE_DIR, name);
        if (!existsSync(file)) {
          fail(`${id}: missing ${f.file}`);
          continue;
        }
        const ok = XMLValidator.validate(await readFile(file, 'utf8'));
        if (ok !== true) fail(`${name}: not well-formed XML (${ok.err.msg})`);
      }
    }
  }
  if (existsSync(FIGURE_DIR)) {
    for (const f of await readdir(FIGURE_DIR)) {
      if (f.endsWith('.svg') && !referenced.has(f)) fail(`orphan figure ${f}`);
    }
  }
  console.log(`${figures} figures checked`);
}

async function checkDeterminism() {
  if (dirArg) return; // only meaningful for the committed snapshot
  const tmp = await mkdtemp(path.join(tmpdir(), 'snowmoon-ingest-'));
  try {
    // Seed with the committed JSON so fetched_at is carried over exactly as a real re-run would.
    await cp(TEXT_DIR, tmp, { recursive: true });
    execFileSync('npx', ['tsx', 'scripts/ingest.ts', '--offline', `--out=${tmp}`], { cwd: ROOT, stdio: 'ignore' });
    for (const f of (await readdir(TEXT_DIR)).filter((f) => f.endsWith('.json'))) {
      const [a, b] = await Promise.all([readFile(path.join(TEXT_DIR, f)), readFile(path.join(tmp, f))]);
      if (!a.equals(b)) fail(`${f}: re-running ingest is not byte-identical`);
    }
    for (const f of (await readdir(FIGURE_DIR)).filter((f) => f.endsWith('.svg'))) {
      const fresh = path.join(tmp, 'source-figures', f);
      if (!existsSync(fresh) || !(await readFile(path.join(FIGURE_DIR, f))).equals(await readFile(fresh))) {
        fail(`${f}: re-running ingest is not byte-identical`);
      }
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

await checkStructureAndCoverage();
await checkChapterOne();
await checkScreenData();
await checkDeterminism();

if (failures.length) {
  console.error(`\nINGEST CHECK FAILED (${failures.length}):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`ingest check passed: ${CHAPTERS} chapters, coverage exact, screen data verified, re-run byte-identical`);
