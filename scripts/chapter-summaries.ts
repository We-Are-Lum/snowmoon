/**
 * Short, spoiler-safe summaries for each chapter page, taken from the spoken
 * summary's checked script (content/snowmoon/recipes/summary/summary-35min.json)
 * with the edits in config/chapter-summaries-edits.json (owner, 2026-10-10: a
 * collapsed summary per chapter, so nobody sees spoilers unless they choose to).
 *
 *   npx tsx scripts/chapter-summaries.ts build   writes content/snowmoon/chapter-summaries.json
 *   npx tsx scripts/chapter-summaries.ts check   fails (exit 1) on any problem
 *
 * Checks: every chapter has a summary; every cited block exists; no summary cites
 * a block from a later chapter (it may spoil only what the reader has reached);
 * no digits, brackets or ids in the text; and the committed file is exactly what
 * build makes from the script and the edits, so it cannot drift by hand.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RECIPE = 'content/snowmoon/recipes/summary/summary-35min.json';
const EDITS = 'config/chapter-summaries-edits.json';
const OUT = 'content/snowmoon/chapter-summaries.json';
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const chapterOf = (id: string) => Number(id.slice(1).split('-')[0]);

type Para = { n: number; text: string; sources: string[] };
type Edit = { para: number; replace: [string, string][]; drop_sources?: string[]; add_sources?: string[]; why: string };

function build() {
  const recipeRaw = read(RECIPE);
  const editsRaw = read(EDITS);
  const paras = JSON.parse(recipeRaw).script.paragraphs as Para[];
  const edits = (JSON.parse(editsRaw).edits as Edit[]);
  const chapters: Record<string, { from_paragraph: number; text: string; sources: string[] }[]> = {};
  for (const p of paras) {
    // A paragraph belongs to the chapter most of its sources come from (decided before edits).
    const counts = new Map<number, number>();
    for (const s of p.sources) counts.set(chapterOf(s), (counts.get(chapterOf(s)) ?? 0) + 1);
    const ch = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    let text = p.text;
    let sources = [...p.sources];
    for (const e of edits.filter((x) => x.para === p.n)) {
      for (const [a, b] of e.replace) {
        if (!text.includes(a)) throw new Error(`edit for paragraph ${p.n}: text not found: ${a.slice(0, 60)}`);
        text = text.replace(a, b);
      }
      sources = sources.filter((s) => !(e.drop_sources ?? []).includes(s)).concat((e.add_sources ?? []).filter((s) => !sources.includes(s)));
    }
    (chapters[ch] ??= []).push({ from_paragraph: p.n, text: text.trim(), sources });
  }
  return {
    about:
      "Each chapter's summary, shown collapsed under the chapter. Written by the coding agent (Claude, a closed model) as part of the spoken summary, checked against the book by gpt-oss-120b and by the coding agent, then edited so that no chapter's summary rests on a later chapter.",
    written_by: 'claude-coding-agent',
    from: { recipe: RECIPE, recipe_sha256: sha256(recipeRaw), edits: EDITS, edits_sha256: sha256(editsRaw) },
    chapters,
  };
}

function problems(out: ReturnType<typeof build>): string[] {
  const found: string[] = [];
  const blocks = new Set<string>();
  for (let n = 1; n <= 32; n++) {
    for (const b of JSON.parse(read(`content/snowmoon/text/chapter-${n}.json`)).blocks as { idx: number }[]) blocks.add(`c${n}-b${b.idx}`);
  }
  for (let n = 1; n <= 32; n++) {
    const list = out.chapters[n];
    if (!list?.length) found.push(`chapter ${n} has no summary`);
    for (const p of list ?? []) {
      for (const s of p.sources) {
        if (!blocks.has(s)) found.push(`chapter ${n}: cites ${s}, which is not a block of the book`);
        if (chapterOf(s) > n) found.push(`chapter ${n}: cites ${s}, from a later chapter (a spoiler)`);
      }
      if (!p.sources.length) found.push(`chapter ${n}: a paragraph cites nothing`);
      if (/\d|[()[\]]|c\d+-b\d+/.test(p.text)) found.push(`chapter ${n}: digits, brackets or an id in the text`);
    }
  }
  return found;
}

const step = process.argv[2];
if (step === 'build') {
  const out = build();
  const bad = problems(out);
  if (bad.length) throw new Error(bad.join('\n'));
  writeFileSync(path.join(ROOT, OUT), JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${OUT}: ${Object.values(out.chapters).flat().length} paragraphs across ${Object.keys(out.chapters).length} chapters`);
} else if (step === 'check') {
  const committed = read(OUT);
  const fresh = JSON.stringify(build(), null, 2) + '\n';
  const bad = problems(JSON.parse(committed));
  if (committed !== fresh) bad.push(`${OUT} is not what build makes from the script and the edits; run build`);
  // Planted violation: a later-chapter citation must be caught.
  const planted = JSON.parse(committed);
  planted.chapters[1][0].sources.push('c32-b1');
  if (!problems(planted).some((x) => x.includes('later chapter'))) bad.push('the spoiler rule did not catch a planted later-chapter citation');
  if (bad.length) {
    console.error(`chapter summaries check FAILED (${bad.length}):\n- ` + bad.join('\n- '));
    process.exit(1);
  }
  const words = Object.values(planted.chapters as Record<string, { text: string }[]>).flat().reduce((a, p) => a + p.text.split(/\s+/).length, 0);
  console.log(`chapter summaries check passed: 32 chapters, ${words} words, no later-chapter citations, planted spoiler caught`);
} else throw new Error('step: build | check');
