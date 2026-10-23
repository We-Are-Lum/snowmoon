/**
 * The glossary's written explanations (rules in scripts/lib/glossary-explain.ts), with no model and no network:
 *
 *   - the book as the models read it is deterministic and holds every block (but headings and breaks) by its id;
 *   - the verifier catches each kind of planted violation: a sentence citing nothing, a block that does not exist,
 *     a quote changed by one word, a quote from a block the sentence doesn't cite, quoted words that are not one of
 *     its quotes, a block id in the text, a gate that is not the latest citation's chapter;
 *   - its quote check agrees with verifyGlossary's: every quote the glossary itself carries passes;
 *   - spoiler gating: a sentence citing a later chapter is not shown before it;
 *   - the committed files, when they exist, pass: content/snowmoon/glossary-explanations.json (with its `assist`)
 *     and the bake-off's page data (labels only: no model id or maker in it);
 *   - the bake-off's key is git-ignored, and nothing the site serves names it.
 *
 *   npm run test:glossary-explanations
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Glossary } from './lib/glossary';
import {
  BAKEOFF_FILE,
  BAKEOFF_KEY_FILE,
  BAKEOFF_MODELS,
  BAKEOFF_SLUGS,
  CHECK_MODEL,
  EXPLANATIONS_FILE,
  PROMPT_FILE,
  CHECK_PROMPT_FILE,
  blocksOf,
  estimateTokens,
  parseAnswer,
  quoteInBlock,
  serializeBook,
  shownThrough,
  verifyExplanations,
  type Entry,
} from './lib/glossary-explain';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const failures: string[] = [];
let checks = 0;
const ok = (cond: boolean, what: string) => {
  checks++;
  if (!cond) failures.push(what);
};

const glossary = JSON.parse(read('content/snowmoon/glossary.json')) as Glossary;
const blocks = blocksOf(ROOT);

// ---- The book as the models read it ----
const a = serializeBook(ROOT);
ok(serializeBook(ROOT).text === a.text, 'two serialisations differ');
const ids = new Set([...a.text.matchAll(/^\[(c\d+-b\d+)[ \]]/gm)].map((m) => m[1]));
const expected = [...blocks].filter(([, b]) => b.kind !== 'heading' && b.kind !== 'break').map(([id]) => id);
ok(expected.every((id) => ids.has(id)) && ids.size === expected.length, `the book holds ${ids.size} block ids, expected ${expected.length}`);
ok(!/<span|<\/span>/.test(a.text), 'speaker-colour span tags left in the book');
ok(a.text.includes('[c9-b39] "Yeah, at some point we want to replace the meter with the lightfoot.'), 'c9-b39 is not as quoted');

// ---- Every slug of the bake-off exists ----
for (const s of BAKEOFF_SLUGS) ok(glossary.terms.some((t) => t.slug === s), `bake-off slug ${s} is not in the glossary`);
ok(new Set(BAKEOFF_MODELS.map((m) => m.maker)).size === 3 && !BAKEOFF_MODELS.some((m) => m.maker === CHECK_MODEL.maker), 'the check model shares a maker with a bake-off model');
ok(existsSync(path.join(ROOT, PROMPT_FILE)) && existsSync(path.join(ROOT, CHECK_PROMPT_FILE)), 'a prompt file is missing');

// ---- A valid entry passes ----
const good: Entry = {
  slug: 'lightfoot',
  term: 'Lightfoot',
  sentences: [
    { text: 'A lightfoot is a unit of length that some characters want to use instead of the meter.', cites: ['c9-b39'], quotes: [], gate: 9 },
    { text: 'Light travels "at one billion lightfeet per tick", which is how the unit is defined.', cites: ['c9-b39'], quotes: [{ block: 'c9-b39', text: 'at one billion lightfeet per tick' }], gate: 9 },
    { text: 'Late in the book, the switch from meters to lightfeet is still talked about but not a priority.', cites: ['c32-b23', 'c32-b26'], quotes: [], gate: 32 },
  ],
};
const goodProblems = verifyExplanations([good], blocks, glossary);
ok(goodProblems.length === 0, `a valid entry fails: ${goodProblems.join('; ')}`);

// ---- Planted violations ----
const plant = (f: (e: Entry) => void, what: string) => {
  const e = structuredClone(good);
  f(e);
  ok(verifyExplanations([e], blocks, glossary).length > 0, `plant not caught: ${what}`);
};
plant((e) => (e.sentences[0].cites = []), 'a sentence citing nothing');
plant((e) => (e.sentences[0].cites = ['c40-b1']), 'a block in no chapter');
plant((e) => (e.sentences[0].cites = ['c9-b99999']), 'a block that does not exist');
plant((e) => (e.sentences[1].quotes[0].text = 'at one million lightfeet per tick'), 'a quote with one word changed');
plant((e) => (e.sentences[1].quotes[0].block = 'c32-b23'), 'a quote from a block the sentence does not cite');
plant((e) => (e.sentences[1].quotes = []), 'quoted words that are not one of its quotes');
plant((e) => (e.sentences[0].text += ' (c9-b39)'), 'a block id in the text');
plant((e) => (e.sentences[2].gate = 9), 'a gate earlier than the latest citation (a spoiler)');
plant((e) => (e.slug = 'not-a-word'), 'a slug that is not in the glossary');

// ---- The quote check agrees with verifyGlossary's ----
const glossaryQuotes = glossary.terms.flatMap((t) => [t.first_sentence, ...t.explanations]);
ok(glossaryQuotes.every((q) => quoteInBlock(blocks.get(q.block)!, q.text)), 'a quote verifyGlossary accepts fails quoteInBlock');
// Marks aside: the same quote without its Markdown emphasis still matches; a changed word does not.
const marked = glossaryQuotes.find((q) => /\*[^*]+\*/.test(q.text) && /\b[a-z]{4,}\b/.test(q.text));
if (marked) {
  ok(quoteInBlock(blocks.get(marked.block)!, marked.text.replace(/\*/g, '')), 'a quote without its Markdown marks fails');
  ok(!quoteInBlock(blocks.get(marked.block)!, marked.text.replace(/\b[a-z]{4,}\b/, 'zzzz')), 'a quote with a changed word passes');
}

// ---- Spoiler gating ----
ok(shownThrough(good, 9).shown.length === 2 && shownThrough(good, 9).hidden === 1, 'a chapter 32 sentence shows at chapter 9');
ok(shownThrough(good, 8).shown.length === 0, 'a chapter 9 sentence shows at chapter 8');
ok(shownThrough(good, 32).hidden === 0, 'a sentence hides at chapter 32');

// ---- Parsing a model's answer: the gate is computed, never taken from the model ----
const parsed = parseAnswer('```json\n{"sentences":[{"text":"x","cites":["[c9-b39]","c32-b23"],"quotes":[],"gate":1}]}\n```');
ok(parsed.sentences[0].gate === 32 && parsed.sentences[0].cites[0] === 'c9-b39', 'parseAnswer took the gate from the model or kept brackets');

// ---- The committed files, when they exist ----
if (existsSync(path.join(ROOT, EXPLANATIONS_FILE))) {
  const f = JSON.parse(read(EXPLANATIONS_FILE));
  const p = verifyExplanations(f.entries, blocks, glossary);
  ok(p.length === 0, `${EXPLANATIONS_FILE}: ${p.slice(0, 5).join('; ')}`);
  for (const k of ['model', 'maker', 'open_weights', 'version', 'prompt_file', 'prompt_sha256', 'book_sha256', 'date']) ok(f.assist?.[k] !== undefined, `${EXPLANATIONS_FILE}: assist has no ${k}`);
}
if (existsSync(path.join(ROOT, BAKEOFF_FILE))) {
  const raw = read(BAKEOFF_FILE);
  const names = [...BAKEOFF_MODELS.flatMap((m) => [m.id, m.maker, m.id.split('/')[1]]), 'claude', 'opus', 'deepseek', 'kimi', 'moonshot', 'anthropic'];
  ok(!names.some((n) => raw.toLowerCase().includes(n.toLowerCase())), `${BAKEOFF_FILE} names a model`);
  const labels = JSON.parse(raw).labels as Record<string, { entries: Entry[] }>;
  ok(Object.keys(labels).sort().join() === 'A,B,C', `${BAKEOFF_FILE}: labels are not A, B, C`);
}

// ---- The key stays out of the repository and the site ----
ok(BAKEOFF_KEY_FILE.startsWith('private/') && /^private\/$/m.test(read('.gitignore')), 'the bake-off key is not in a git-ignored folder');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? walk(path.join(dir, f)) : [path.join(dir, f)]));
const naming = walk(path.join(ROOT, 'src')).filter((f) => /key\.json|glossary-bakeoff\/key|private\//.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
ok(naming.length === 0, `site code names the key: ${naming.map((f) => path.relative(ROOT, f)).join(', ')}`);
// Owner-only: both routes check the FID before reading anything.
for (const r of ['src/app/api/glossary/written/[slug]/route.ts', 'src/app/api/glossary/bakeoff/route.ts']) {
  const s = read(r);
  ok(/if \(!mayRead(Bakeoff)?\(await getFid\(request\)\)\) return new NextResponse\('Not found', \{ status: 404/.test(s), `${r}: not owner-only first`);
}
ok(/fids: \[SYSTEM_FID\] as readonly number\[\],\s*public: false/.test(read('src/lib/config.ts')), 'GLOSSARY_WRITTEN is not owner-only');

console.log(`book: ${a.blocks} blocks, ${a.text.length.toLocaleString()} characters, ~${estimateTokens(a.text).toLocaleString()} tokens (characters / 4)`);
if (failures.length) {
  console.error(`test:glossary-explanations FAILED (${failures.length} of ${checks}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`test:glossary-explanations passed: ${checks} checks`);
