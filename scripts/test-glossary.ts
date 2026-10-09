/**
 * The glossary data file is the book's, and only the book's:
 *
 *   - reproducible: rebuilding from the committed sources gives the committed file byte for byte;
 *   - every quoted sentence is verbatim in its block, every block id exists (verifyGlossary);
 *   - no definition text: a term carries only the fields the build writes (no "meaning",
 *     "definition", "summary"…), and the only prose is book quotes;
 *   - each of those checks fails on a planted violation;
 *   - the page helpers: reading places, quote rendering (escaped, Markdown marks only).
 *
 *   npm run test:glossary
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GLOSSARY_FILE, buildGlossary, loadBlocks, serialize, verifyGlossary, type Glossary } from './lib/glossary';
import { blockHref, parsePlace, quoteHtml } from '../src/lib/glossary-view';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let checks = 0;
const ok = (cond: boolean, what: string) => {
  checks++;
  if (!cond) failures.push(what);
};

const committed = readFileSync(path.join(ROOT, GLOSSARY_FILE), 'utf8');
const rebuilt = serialize(buildGlossary(ROOT));
ok(rebuilt === committed, `${GLOSSARY_FILE} is not what the sources build (run npm run build:glossary)`);
ok(serialize(buildGlossary(ROOT)) === rebuilt, 'two builds differ');

const g = JSON.parse(committed) as Glossary;
const blocks = loadBlocks(ROOT);
const problems = verifyGlossary(g, blocks);
ok(problems.length === 0, `verify: ${problems.slice(0, 5).join('; ')}`);

// No definition text anywhere: keys that would hold one, at any depth.
const BANNED = /^(meaning|definition|define|gloss|summary|description|explanation_text|note)$/i;
const banned: string[] = [];
const walk = (v: unknown, at: string): void => {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (BANNED.test(k) && banned.push(`${at}.${k}`), walk(x, `${at}.${k}`));
};
walk(g.terms, 'terms');
ok(!banned.length, `definition fields: ${banned.slice(0, 3).join(', ')}`);
ok(g.terms.every((t) => t.explanations.every((e) => e.text.length > 0)), 'an empty explanation');
ok(g.terms.every((t) => t.explanations.length <= 5), 'more than five explanations on a term');
ok(new Set(g.terms.map((t) => t.slug)).size === g.terms.length, 'slugs are not unique');
ok(g.terms.every((t) => /^[a-z0-9-]+$/.test(t.slug)), 'a slug is not URL-safe');
ok(g.terms.every((t) => t.first === `c${t.first_chapter}-b${t.mentions[String(t.first_chapter)][0]}`), 'a first block is not the first mention');
ok(g.terms.every((t) => !t.clip || t.mentions[String(t.clip.chapter)]?.includes(t.clip.idx)), 'a clip is not a block that mentions the term');
ok(g.terms.every((t) => !t.clip || t.clip.url.startsWith('https://media.snowmoon.party/narration/')), 'a clip is not on the site\'s media host');
ok(g.counts.terms === g.terms.length, 'counts.terms is wrong');

// Planted violations must fail.
const planted = (f: (c: Glossary) => void) => {
  const c = structuredClone(g);
  f(c);
  return verifyGlossary(c, blocks).length > 0;
};
const withQuote = g.terms.find((t) => t.explanations.length)!;
ok(planted((c) => (c.terms.find((t) => t.slug === withQuote.slug)!.explanations[0].text += ' (edited)')), 'plant: an edited quote is not caught');
ok(planted((c) => c.terms[0].explanations.push({ block: 'c1-b9', chapter: 1, idx: 9, text: 'A word the book uses for a thing.' })), 'plant: a written definition is not caught');
ok(planted((c) => (c.terms[0].mentions['1'] = [99999])), 'plant: a missing block id is not caught');
ok(planted((c) => ((c.terms[0] as unknown as Record<string, unknown>).meaning = 'water')), 'plant: a meaning field is not caught');
ok(planted((c) => (c.terms.find((t) => t.slug === withQuote.slug)!.explanations[0].block = 'c40-b1')), 'plant: a block in no chapter is not caught');

// Page helpers.
ok(parsePlace('c3-b42')?.block === 'c3-b42', 'parsePlace c3-b42');
ok(parsePlace('c33-b1') === null && parsePlace('c0-b1') === null && parsePlace('/evil') === null && parsePlace('c3-b4x') === null, 'parsePlace accepts a bad place');
ok(blockHref('c12-b5') === '/chapter/12#c12-b5', 'blockHref');
ok(quoteHtml('<b>*min*</b> \\*x') === '&lt;b&gt;<em>min</em>&lt;/b&gt; *x', `quoteHtml: ${quoteHtml('<b>*min*</b> \\*x')}`);

if (failures.length) {
  console.error(`GLOSSARY TEST FAILED (${failures.length} of ${checks}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`glossary test passed: ${checks} checks; ${g.counts.terms} terms, ${g.counts.with_explanation} explained, ${g.counts.with_clip} with a clip`);
