/**
 * The support check (owner, 2026-10-23: "have a different model check each sentence against its cited blocks, and
 * show the count of unsupported sentences per model"). A fourth model (CHECK_MODEL, not one of the three that
 * wrote) reads each entry's sentences with the text of every block they cite, and says SUPPORTED or UNSUPPORTED
 * for each. It is never told which model wrote them. Through the Vercel AI Gateway only, with AI_GATEWAY_API_KEY
 * from .env.local (never printed). Prompt: config/prompts/glossary-support-check.md.
 *
 *   npx tsx scripts/glossary-support-check.ts                       how many calls, and the estimate; nothing sent
 *   npx tsx --env-file-if-exists=.env.local scripts/glossary-support-check.ts --run --cap <usd>
 *       checks the bake-off (content/snowmoon/glossary-bakeoff/explanations.json) and writes
 *       content/snowmoon/glossary-bakeoff/support.json: per label, each sentence's verdict, and the counts.
 *   ... --file content/snowmoon/glossary-explanations.json --run --cap <usd>
 *       checks the full file instead, and writes private/glossary-explanations/support.json.
 *
 * A sentence that fails the program's own checks (a citation that isn't a block, a quote that isn't word for
 * word) is counted as unsupported without asking the model.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Glossary } from './lib/glossary';
import { BAKEOFF_FILE, BAKEOFF_SUPPORT_FILE, CHECK_MODEL, CHECK_PROMPT_FILE, GATEWAY, blocksOf, estimateTokens, priceOf, seenText, sha256, verifyExplanations, type Entry, type Price } from './lib/glossary-explain';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const args = process.argv.slice(2);
const flag = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const RUN = args.includes('--run');
const CAP = Number(flag('cap') ?? NaN);
const FILE = flag('file') ?? BAKEOFF_FILE;
const MAX_TOKENS = 4000;
const prompt = read(CHECK_PROMPT_FILE).replace(/^<!--[\s\S]*?-->\s*/, '');
const blocks = blocksOf(ROOT);
const glossary = JSON.parse(read('content/snowmoon/glossary.json')) as Glossary;

/** The labels to check: A/B/C of the bake-off, or the one model of the full file (labelled by its model). */
function load(): Record<string, Entry[]> {
  if (!existsSync(path.join(ROOT, FILE))) throw new Error(`${FILE} does not exist yet: run scripts/glossary-explain.ts first`);
  const j = JSON.parse(read(FILE));
  if (j.labels) return Object.fromEntries(Object.entries(j.labels as Record<string, { entries: Entry[] }>).map(([k, v]) => [k, v.entries]));
  return { [j.assist.model]: j.entries };
}

function request(e: Entry): string {
  const cited = [...new Set(e.sentences.flatMap((s) => s.cites))].filter((c) => blocks.has(c));
  return [
    `ENTRY: ${e.term}`,
    '',
    'SENTENCES:',
    ...e.sentences.map((s, i) => `${i + 1}. ${s.text}\n   cites: ${s.cites.join(', ')}`),
    '',
    'PASSAGES:',
    ...cited.map((c) => `[${c}] ${seenText(blocks.get(c)!)}`),
  ].join('\n');
}

async function check(key: string, p: Price, e: Entry) {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHECK_MODEL.id,
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: request(e) }],
      max_tokens: MAX_TOKENS,
      reasoning: { effort: CHECK_MODEL.effort },
      providerOptions: { gateway: { only: [CHECK_MODEL.provider] } },
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { id?: string; model?: string; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } };
  if (!res.ok) throw new Error(`${CHECK_MODEL.id}: gateway ${res.status}`);
  const u = j.usage ?? {};
  const cost = typeof u.cost === 'number' ? u.cost : (u.prompt_tokens ?? 0) * p.input + (u.completion_tokens ?? 0) * p.output;
  const text = j.choices?.[0]?.message?.content ?? '';
  const raw = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const verdicts = (JSON.parse(raw).verdicts as { n: number; verdict: string; why?: string }[]).map((v) => ({ n: Number(v.n), supported: /^SUPPORTED$/i.test(v.verdict.trim()), why: v.why ?? '' }));
  return { verdicts, cost, requestId: j.id ?? null, model: j.model ?? CHECK_MODEL.id };
}

const labels = existsSync(path.join(ROOT, FILE)) ? load() : null;
const p = await priceOf(CHECK_MODEL);
if (!RUN || !labels) {
  const entries = labels ? Object.values(labels).flat() : [];
  const calls = entries.length || 15;
  const tokens = entries.length ? entries.reduce((a, e) => a + estimateTokens(prompt + request(e)), 0) : calls * 2500;
  console.log(`${CHECK_MODEL.id}: ${calls} calls, ~${tokens.toLocaleString()} input tokens, ~${(calls * 1200).toLocaleString()} output; about $${(tokens * p.input + calls * 1200 * p.output).toFixed(3)}. ${labels ? 'Add --run --cap <usd> to send.' : `${FILE} does not exist yet.`}`);
  process.exit(0);
}
if (!Number.isFinite(CAP) || CAP <= 0) throw new Error('--cap <usd> is required with --run');
const key = process.env.AI_GATEWAY_API_KEY;
if (!key) throw new Error('AI_GATEWAY_API_KEY not set (run with --env-file-if-exists=.env.local)');

let spent = 0;
const results: Record<string, Record<string, { n: number; text: string; supported: boolean; why: string; by: 'program' | 'model' }[]>> = {};
const counts: Record<string, { sentences: number; unsupported: number; by_program: number }> = {};
let served = '';
for (const [label, entries] of Object.entries(labels)) {
  results[label] = {};
  counts[label] = { sentences: 0, unsupported: 0, by_program: 0 };
  for (const e of entries) {
    if (!e.sentences.length) continue;
    const worst = estimateTokens(prompt + request(e)) * p.input * 1.5 + MAX_TOKENS * p.output;
    if (spent + worst > CAP) throw new Error(`stopping: spent $${spent.toFixed(3)}; the next call could pass the cap $${CAP}`);
    const r = await check(key, p, e);
    spent += r.cost;
    served ||= r.model;
    const failing = new Set(verifyExplanations([e], blocks, glossary).map((x) => Number(x.match(/sentence (\d+)/)?.[1] ?? 0)).filter(Boolean));
    results[label][e.slug] = e.sentences.map((s, i) => {
      const v = r.verdicts.find((x) => x.n === i + 1);
      const program = failing.has(i + 1);
      return { n: i + 1, text: s.text, supported: !program && !!v?.supported, why: program ? 'fails the program check (citation or quote)' : v ? v.why : 'no verdict returned', by: program ? 'program' : 'model' };
    });
    for (const s of results[label][e.slug]) {
      counts[label].sentences++;
      if (!s.supported) counts[label].unsupported++;
      if (s.by === 'program') counts[label].by_program++;
    }
    console.log(`${label} ${e.slug}: ${results[label][e.slug].filter((s) => !s.supported).length} unsupported of ${e.sentences.length}; total $${spent.toFixed(3)}`);
  }
}
const out = { about: 'Each sentence checked against the blocks it cites by a model that did not write it, and by the program (citations exist, quotes word for word).', checker: { model: CHECK_MODEL.id, maker: CHECK_MODEL.maker, open_weights: CHECK_MODEL.open_weights, served, prompt_file: CHECK_PROMPT_FILE, prompt_sha256: sha256(read(CHECK_PROMPT_FILE)), date: new Date().toISOString().slice(0, 10) }, spent_usd: spent, counts, results };
const target = FILE === BAKEOFF_FILE ? BAKEOFF_SUPPORT_FILE : 'private/glossary-explanations/support.json';
mkdirSync(path.dirname(path.join(ROOT, target)), { recursive: true });
writeFileSync(path.join(ROOT, target), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${target}; spent $${spent.toFixed(3)}`);
