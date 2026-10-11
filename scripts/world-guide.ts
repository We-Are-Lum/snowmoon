/**
 * The world guide (content/snowmoon/world-guide.json): checks, the readable .md, and
 * a model check of every line against its cited blocks.
 *
 *   npx tsx scripts/world-guide.ts check     fails (exit 1) on any problem
 *   npx tsx scripts/world-guide.ts render    writes content/snowmoon/world-guide.md
 *   npx tsx --conditions=react-server --env-file=.env.summary.local scripts/world-guide.ts verify
 *
 * check: unique line ids; known sections; every cited block exists; from_chapter is
 * the latest chapter the line cites (so filtering by reading progress hides nothing
 * it needs); the AI label, licence and recipe are present; the .md matches the JSON.
 * verify: gpt-oss-120b reads each line against its cited blocks (the assistant's
 * route, zero retention); results and every call go to content/snowmoon/recipes/world-guide.json.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FILE = 'content/snowmoon/world-guide.json';
const MD = 'content/snowmoon/world-guide.md';
const RECIPE = 'content/snowmoon/recipes/world-guide.json';
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const chapterOf = (id: string) => Number(id.slice(1).split('-')[0]);

type Relation = { a: string; rel: string; b: string };
type Line = { id: string; section: string; entity: string; kind: string; text: string; sources: string[]; from_chapter: number; relation?: Relation };
// Geography lines (owner, 2026-10-11): where places are, each also stated as one relation, a → rel → b.
const GEO_KINDS = ['direction', 'distance', 'border', 'adjacency', 'travel', 'terrain', 'layout', 'size'];
type Guide = { about: string; label: string; license: string; recipe: string; sections: string[]; lines: Line[] };

const blocks = new Map<string, string>();
// Figures (the co-governance diagram, the battle maps) are SVG: stripped, only their labels are left,
// so the checker is shown the drawing itself, with coordinates.
const figures = new Map<string, string>();
for (let n = 1; n <= 32; n++) {
  for (const b of JSON.parse(read(`content/snowmoon/text/chapter-${n}.json`)).blocks as { idx: number; content: string; kind: string }[]) {
    const t = b.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (t) blocks.set(`c${n}-b${b.idx}`, t);
    if (b.kind === 'figure' && /<svg/.test(b.content)) figures.set(`c${n}-b${b.idx}`, `[an SVG figure; y grows downward] ${b.content.replace(/\s+/g, ' ').replace(/<\/?(div|defs|marker)[^>]*>/g, '').trim()}`);
  }
}

function render(g: Guide): string {
  const title: Record<string, string> = { characters: 'Characters', places: 'Places', geography: 'Geography', institutions: 'Institutions', technology: 'Technology', minpentai: 'Minpentai', factions: 'Factions', timeline: 'Timeline' };
  const out = [
    '# Snowmoon: a world guide',
    '',
    `> ${g.label}`,
    '>',
    `> ${g.license}`,
    '',
    g.about,
    '',
    `Generated from \`${FILE}\` by \`scripts/world-guide.ts render\`; edit the JSON, not this file. "ch N" is the latest chapter a line depends on. How it was made: \`${g.recipe}\`.`,
  ];
  for (const s of g.sections) {
    const lines = g.lines.filter((l) => l.section === s);
    if (!lines.length) continue;
    out.push('', `## ${title[s] ?? s}`);
    let entity = '';
    for (const l of lines) {
      if (s !== 'timeline' && l.entity !== entity) {
        entity = l.entity;
        out.push('', `### ${entity}`, '');
      }
      const lead = s === 'timeline' ? `**${l.entity}.** ` : l.kind === 'fact' ? '' : `*${l.kind}:* `;
      out.push(`${s === 'timeline' && !out[out.length - 1].startsWith('- ') ? '\n' : ''}- ${lead}${l.text} (ch ${l.from_chapter}; ${l.sources.join(', ')})`);
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

function problems(g: Guide): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  if (!/AI-made/.test(g.label) || !/not by the author/i.test(g.label)) found.push('the label must say AI-made and not by the author');
  if (!/GPL-3\.0/.test(g.license)) found.push('the licence line must name GPL-3.0');
  for (const l of g.lines) {
    if (seen.has(l.id)) found.push(`${l.id}: repeated id`);
    seen.add(l.id);
    if (!g.sections.includes(l.section)) found.push(`${l.id}: unknown section ${l.section}`);
    if (!l.sources.length) found.push(`${l.id}: cites nothing`);
    for (const s of l.sources) if (!blocks.has(s)) found.push(`${l.id}: cites ${s}, which is not a block of the book`);
    const latest = Math.max(...l.sources.map(chapterOf));
    if (l.from_chapter !== latest) found.push(`${l.id}: from_chapter is ${l.from_chapter}, but it cites chapter ${latest}`);
    if (l.section === 'geography') {
      if (!GEO_KINDS.includes(l.kind)) found.push(`${l.id}: geography kind must be one of ${GEO_KINDS.join(', ')}`);
      if (!l.relation?.a || !l.relation.rel || !l.relation.b) found.push(`${l.id}: a geography line needs its relation (a, rel, b)`);
    }
  }
  return found;
}

const step = process.argv[2];
const guide = JSON.parse(read(FILE)) as Guide;
if (step === 'render') {
  writeFileSync(path.join(ROOT, MD), render(guide));
  console.log(`wrote ${MD}: ${guide.lines.length} lines`);
} else if (step === 'check') {
  const bad = problems(guide);
  if (!existsSync(path.join(ROOT, MD)) || read(MD) !== render(guide)) bad.push(`${MD} does not match the JSON; run render`);
  const planted = structuredClone(guide);
  planted.lines[0].from_chapter = 1;
  planted.lines[0].sources = [...planted.lines[0].sources, 'c32-b1'];
  if (!problems(planted).some((x) => x.includes('from_chapter'))) bad.push('the chapter tag rule did not catch a planted later citation');
  if (bad.length) {
    console.error(`world guide check FAILED (${bad.length}):\n- ` + bad.join('\n- '));
    process.exit(1);
  }
  console.log(`world guide check passed: ${guide.lines.length} lines, every block real, chapter tags right, planted violation caught`);
} else if (step === 'verify') {
  const { complete, gatewayToken, promptFile } = await import('../src/lib/chat/model');
  const recipe = existsSync(path.join(ROOT, RECIPE)) ? JSON.parse(read(RECIPE)) : { calls: [], results: {} };
  const system = promptFile('world-guide-check.md');
  recipe.prompt = { file: 'config/prompts/world-guide-check.md', sha256: sha256(read('config/prompts/world-guide-check.md')), text: system };
  recipe.guide_sha256 = sha256(read(FILE));
  let cost = 0;
  for (const l of guide.lines) {
    if (recipe.results[l.id]?.text === l.text && JSON.stringify(recipe.results[l.id]?.sources) === JSON.stringify(l.sources)) continue;
    const user = `LINE:\n${l.entity}: ${l.text}\n\nCITED BLOCKS:\n${l.sources.map((s) => `[${s}] ${figures.get(s) ?? blocks.get(s)}`).join('\n')}`;
    const t0 = Date.now();
    // Groq's free plan allows few tokens a minute; on a refusal, wait and try again before giving up.
    let r: Awaited<ReturnType<typeof complete>> | null = null;
    for (let attempt = 0; attempt < 5 && !r; attempt++) {
      try {
        r = await complete(gatewayToken(), 'openai/gpt-oss-120b', [{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens: 3000, temperature: 0 });
      } catch (e) {
        if (attempt === 4) throw e;
        await new Promise((res) => setTimeout(res, 15_000 * (attempt + 1)));
      }
    }
    if (!r) throw new Error('no answer');
    cost += r.costUsd;
    const flags = r.text.split('\n').map((x) => x.trim()).filter((x) => /^UNSUPPORTED:/i.test(x)).map((x) => x.replace(/^UNSUPPORTED:\s*/i, ''));
    recipe.results[l.id] = { text: l.text, sources: l.sources, verdict: flags.length ? 'flagged' : /SUPPORTED/.test(r.text) ? 'supported' : 'unclear', flags };
    recipe.calls.push({ line: l.id, at: new Date().toISOString(), model: r.model, route: r.route, provider: r.provider, request_id: r.requestId, prompt_tokens: r.promptTokens, completion_tokens: r.completionTokens, cost_usd: r.costUsd, ms: Date.now() - t0, user, reply: r.text });
    writeFileSync(path.join(ROOT, RECIPE), JSON.stringify(recipe, null, 2) + '\n');
    process.stdout.write(flags.length ? 'x' : '.');
  }
  const flagged = Object.entries(recipe.results as Record<string, { verdict: string; flags: string[] }>).filter(([, v]) => v.verdict !== 'supported');
  console.log(`\nverified ${guide.lines.length} lines; ${flagged.length} flagged; this run $${cost.toFixed(4)}`);
} else throw new Error('step: check | render | verify');
