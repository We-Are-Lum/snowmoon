/**
 * Eval of the planning coach (config/prompts/plan-coach.md) before any UI (owner, 2026-10-11).
 *
 *   npx tsx --conditions=react-server --env-file=.env.summary.local scripts/plan-coach-eval.ts [name ...]
 *
 * For each fixture in scripts/fixtures/plan-coach/ (a draft in labelled fragments, with a
 * chapter limit; the header's "planted" list is for the reviewer and is never sent): one
 * coach turn on gpt-oss-120b through the assistant's route (Groq, zero retention; the
 * gateway when Groq is busy). Context: the world guide up to the limit, the craft guide
 * (a draft the owner has not approved; used here for the eval only) and up to twelve
 * passages up to the limit, chosen by word overlap with the draft.
 *
 * Automatic flags, for the reviewer: cited ids that don't exist or are past the limit;
 * phrases that offer wording ("you could write", "something like", "for example: …");
 * quoted spans of five or more words that are not the person's own words or the book's;
 * and the assistant's guard model (gpt-oss-safeguard-20b, config/prompts/chat-guard.md),
 * asked whether the reply writes for the person. Spending stops at $2.
 * Results: content/snowmoon/recipes/plan-coach-eval.json and docs/craft/plan-coach-eval.md.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { complete, gatewayToken, promptFile } from '../src/lib/chat/model';
import { guideText } from '../src/lib/world-guide';

const ROOT = process.cwd();
const DIR = 'scripts/fixtures/plan-coach';
const RESULTS = 'content/snowmoon/recipes/plan-coach-eval.json';
const REPORT = 'docs/craft/plan-coach-eval.md';
const MODEL = 'openai/gpt-oss-120b';
const GUARD = 'openai/gpt-oss-safeguard-20b';
const CAP_USD = 2;
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

type Block = { id: string; chapter: number; text: string };
const book: Block[] = [];
for (let n = 1; n <= 32; n++) {
  for (const b of JSON.parse(read(`content/snowmoon/text/chapter-${n}.json`)).blocks as { idx: number; content: string; kind: string }[]) {
    const t = b.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (t && b.kind !== 'break') book.push({ id: `c${n}-b${b.idx}`, chapter: n, text: t });
  }
}
const byId = new Map(book.map((b) => [b.id, b]));
const bookNorm = norm(book.map((b) => b.text).join(' '));

function passages(draft: string, limit: number): Block[] {
  const stop = new Set('the a an and or of to in on at for with his her he she they is was are be it its as by from that this into not no one two'.split(' '));
  const words = new Set(norm(draft).split(' ').filter((w) => w.length > 3 && !stop.has(w)));
  return book
    .filter((b) => b.chapter <= limit && b.text.length > 40)
    .map((b) => ({ b, score: norm(b.text).split(' ').filter((w) => words.has(w)).length }))
    .filter((x) => x.score > 1)
    .sort((x, y) => y.score - x.score)
    .slice(0, 12)
    .map((x) => x.b)
    .sort((x, y) => x.chapter - y.chapter || Number(x.id.split('-b')[1]) - Number(y.id.split('-b')[1]));
}

function autoFlags(reply: string, draft: string, limit: number): string[] {
  const out: string[] = [];
  for (const id of reply.match(/c\d+-b\d+/g) ?? []) {
    const b = byId.get(id);
    if (!b) out.push(`cites ${id}, which is not a block of the book`);
    else if (b.chapter > limit) out.push(`cites ${id}, past the chapter limit (${limit})`);
  }
  const offer = reply.match(/(you could (write|say|use)|something like|for (example|instance)[,:]\s*["“]|try (writing|saying)|replace [^.]* with ["“]|change [^.]* to ["“]|e\.g\.,?\s*["“])/gi);
  if (offer) out.push(`offers wording: ${[...new Set(offer.map((x) => x.toLowerCase()))].join('; ')}`);
  const draftNorm = norm(draft);
  for (const q of reply.match(/["“][^"”]{20,}["”]/g) ?? []) {
    const inner = norm(q);
    if (inner.split(' ').length >= 5 && !draftNorm.includes(inner) && !bookNorm.includes(inner)) out.push(`quotes words that are neither the person's nor the book's: ${q.slice(0, 90)}`);
  }
  return [...new Set(out)];
}

const results = existsSync(path.join(ROOT, RESULTS)) ? JSON.parse(read(RESULTS)) : { runs: [] as unknown[] };
let spent = (results.runs as { cost_usd: number }[]).reduce((a, r) => a + r.cost_usd, 0);
const system = promptFile('plan-coach.md');
const craft = read('docs/craft/visual-storytelling.md');
const guardPolicy = promptFile('chat-guard.md');
const only = process.argv.slice(2);

for (const f of readdirSync(path.join(ROOT, DIR)).filter((x) => x.endsWith('.md')).sort()) {
  const name = f.replace(/\.md$/, '');
  if (only.length && !only.includes(name)) continue;
  const raw = read(`${DIR}/${f}`);
  const [, header, body] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!;
  const limit = Number(header.match(/^limit:\s*(\d+)/m)![1]);
  const form = header.match(/^form:\s*(.+)$/m)![1];
  const draft = body.trim();
  const ps = passages(draft, limit);
  const user = [
    `The person has read up to chapter ${limit}. Their piece: ${form}.`,
    '',
    `WORLD GUIDE, UP TO CHAPTER ${limit} (AI-made reference; cite the block ids):`,
    guideText(limit),
    '',
    'CRAFT GUIDE (the principles you apply):',
    craft,
    '',
    `PASSAGES FROM THE BOOK, UP TO CHAPTER ${limit}:`,
    ps.map((b) => `[${b.id}] ${b.text}`).join('\n'),
    '',
    "THE PERSON'S DRAFT, IN FRAGMENTS:",
    draft,
    '',
    'Give your notes on this draft, in the form you were given.',
  ].join('\n');
  if (spent > CAP_USD - 0.05) throw new Error(`stopping: $${spent.toFixed(3)} spent of $${CAP_USD}`);
  const t0 = Date.now();
  const r = await complete(gatewayToken(), MODEL, [{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens: 6000, temperature: 0.3 });
  const g = await complete(gatewayToken(), GUARD, [{ role: 'system', content: guardPolicy }, { role: 'user', content: `USER REQUEST:\nGive me notes on my draft.\n\nREPLY:\n${r.text}` }], { maxTokens: 800, temperature: 0 });
  const cost = r.costUsd + g.costUsd;
  spent += cost;
  results.runs.push({
    fixture: name, limit, at: new Date().toISOString(), cost_usd: cost, ms: Date.now() - t0,
    coach: { model: r.model, route: r.route, provider: r.provider, request_id: r.requestId, prompt_tokens: r.promptTokens, completion_tokens: r.completionTokens, prompt_sha256: sha256(system) },
    guard: { model: g.model, route: g.route, request_id: g.requestId, verdict: g.text.trim().split('\n')[0], reason: g.text.trim().split('\n').slice(1).join(' ') },
    passages: ps.map((b) => b.id),
    auto_flags: autoFlags(r.text, draft, limit),
    user, reply: r.text,
  });
  writeFileSync(path.join(ROOT, RESULTS), JSON.stringify(results, null, 2) + '\n');
  console.log(`${name}: $${cost.toFixed(4)}, guard ${g.text.trim().split('\n')[0]}, ${results.runs.at(-1).auto_flags.length} auto flags; total $${spent.toFixed(4)}`);
}

// The report: each run's reply in full, with the automatic flags; the reviewer's notes are added by hand.
const lines = ['# Planning coach eval', '', `Model ${MODEL}; guard ${GUARD}; cap $${CAP_USD}. Generated by \`scripts/plan-coach-eval.ts\` from \`${RESULTS}\`. The reviewer's flags are in docs/craft/plan-coach-eval-review.md.`];
for (const run of results.runs as { fixture: string; limit: number; cost_usd: number; guard: { verdict: string; reason: string }; auto_flags: string[]; reply: string }[]) {
  lines.push('', `## ${run.fixture} (chapter limit ${run.limit}; $${run.cost_usd.toFixed(4)})`, '', `Guard: ${run.guard.verdict} ${run.guard.reason}`, '', `Automatic flags: ${run.auto_flags.length ? run.auto_flags.join('; ') : 'none'}`, '', '```text', run.reply.trim(), '```');
}
writeFileSync(path.join(ROOT, REPORT), lines.join('\n') + '\n');
console.log(`total spent: $${spent.toFixed(4)} of $${CAP_USD}`);
