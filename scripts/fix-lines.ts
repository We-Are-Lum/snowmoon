/**
 * Fix lines (owner, 2026-10-24: "turn each saved finding into a fix line … labelled 'drafted by the image check' … Phrase
 * fix lines as what to draw, not what to avoid"). For every job in an illustration-check run with a problem (first those
 * the check called wrong or reported a double for, then the rest of partly), a cheap text model turns the stored
 * finding into one line saying what to draw. The vision check is not run again.
 *
 * Only through the Vercel AI Gateway (AI_GATEWAY_API_KEY, one line read from --env-file, never printed; zero data
 * retention asked). The fix line is stored next to the finding in the private run file, as result.answer.fix_line, with
 * its recipe (model, prompt file and sha256, date, cost). Saved after every job; a rerun skips jobs that have one.
 *
 *   npx tsx scripts/fix-lines.ts private/illustration-check/<run>.json                       estimate, no call
 *   npx tsx scripts/fix-lines.ts <run>.json --spend --max-usd=0.5 --env-file=<main .env.local> (paid)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkJob, sha256 } from '../src/lib/illustration-check/jobs';
import { hasDouble, type CheckAnswer } from '../src/lib/illustration-check/schema';

const ROOT = process.cwd();
const PROMPT_FILE = 'config/prompts/illustration-fix-line.md';
const ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions';
/** On the allowlist (config/models.json gpt-oss-120b, open weights); USD per million tokens from the gateway list. */
const MODEL = 'openai/gpt-oss-120b';
const PRICE = { input: 0.15, output: 0.6 };
const BANNED = /\b(don'?t|do not|not|no|never|avoid|without|instead of)\b/i;

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const file = process.argv[2];
const spend = process.argv.includes('--spend');
const maxUsd = Number(arg('max-usd') ?? '0.5');
const prompt = readFileSync(path.join(ROOT, PROMPT_FILE), 'utf8');
const system = prompt.replace(/^<!--[\s\S]*?-->\s*/, '');

type FixLine = { text: string; model: string; prompt_file: string; prompt_sha256: string; date: string; cost_usd: number; attempts: number; request_id: string | null };
type R = { job: string; chapter: number; idx: number; answer: (CheckAnswer & { fix_line?: FixLine }) | null };
const run = JSON.parse(readFileSync(file, 'utf8')) as { fix_lines_cost_usd?: number; results: R[] };

const needs = (r: R) => r.answer && (r.answer.verdict !== 'matches' || hasDouble(r.answer.problems));
const first = (r: R) => r.answer!.verdict === 'wrong' || hasDouble(r.answer!.problems);
// A stored line that still names what to avoid is made again (--redo-banned).
if (process.argv.includes('--redo-banned')) for (const r of run.results) if (r.answer?.fix_line && BANNED.test(r.answer.fix_line.text)) delete r.answer.fix_line;
const todo = run.results.filter((r) => needs(r) && !r.answer!.fix_line).sort((a, b) => Number(first(b)) - Number(first(a)) || a.chapter - b.chapter || a.idx - b.idx);

function userText(r: R): string {
  const job = checkJob(r.job)!;
  const passage = job.passage.map((b) => `${b.target ? '>>> ' : ''}${b.text}`).join('\n\n');
  const problems = r.answer!.problems.map((p) => `- ${p.type}: ${p.detail}`).join('\n');
  return `PASSAGE (chapter ${job.chapter}):\n${passage}\n\nPROMPT:\n${job.prompt}\n\nCHARACTERS: ${job.cast.map((c) => c.name).join(', ') || 'none named'}\n\nFINDING: ${r.answer!.why}\n${problems}`;
}

const est = todo.reduce((t, r) => t + (Math.ceil((system.length + userText(r).length) / 3.6) * PRICE.input + 900 * PRICE.output) / 1e6, 0);
console.log(`${todo.length} jobs need a fix line (${todo.filter(first).length} wrong or doubled first); estimate $${est.toFixed(3)} with ${MODEL}`);
if (!spend) process.exit(0);
if (est > maxUsd) {
  console.error(`estimate over --max-usd=${maxUsd}; nothing called`);
  process.exit(1);
}

function key(): string {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  const f = arg('env-file') ?? path.join(ROOT, '.env.local');
  if (!existsSync(f)) throw new Error('no AI_GATEWAY_API_KEY: pass --env-file');
  const line = readFileSync(f, 'utf8').split('\n').find((l) => /^AI_GATEWAY_API_KEY=/.test(l));
  const k = line?.slice('AI_GATEWAY_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
  if (!k) throw new Error('no AI_GATEWAY_API_KEY line');
  return k;
}
const k = key();
let spent = run.fix_lines_cost_usd ?? 0;
const date = new Date().toISOString();
for (const r of todo) {
  if (spent + 0.01 > maxUsd) {
    console.error(`stopped at $${spent.toFixed(4)} (cap $${maxUsd})`);
    break;
  }
  let paid = 0;
  let line = '';
  let id: string | null = null;
  let attempts = 0;
  // A line that names what to avoid is asked for again once (the rule is in the prompt; the check here enforces it).
  for (attempts = 1; attempts <= 3; attempts++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 4000,
        messages: [{ role: 'system', content: system }, { role: 'user', content: userText(r) + (attempts > 1 && line ? `\n\nYour last line was: ${line}\nIt uses "${line.match(BANNED)?.[0] ?? ''}", a forbidden word. Rewrite it so every part says what IS in the picture (for example "a solid stone wall" for "no window", "blank signs" for "no text").` : '') }],
        providerOptions: { gateway: { zeroDataRetention: true } },
      }),
    }).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { id?: string; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number; cost?: number } } | undefined;
    if (!res?.ok || !j) continue;
    paid += j.usage?.cost ?? (j.usage ? (j.usage.prompt_tokens * PRICE.input + j.usage.completion_tokens * PRICE.output) / 1e6 : 0);
    line = (j.choices?.[0]?.message?.content ?? '').trim().replace(/^["“]|["”]$/g, '').replace(/\s+/g, ' ');
    id = j.id ?? null;
    if (line && !BANNED.test(line)) break;
  }
  spent += paid;
  if (!line) {
    console.log(`  ${r.job}: no line`);
    continue;
  }
  r.answer!.fix_line = { text: line, model: MODEL, prompt_file: PROMPT_FILE, prompt_sha256: sha256(prompt), date, cost_usd: Number(paid.toFixed(6)), attempts: Math.min(attempts, 3), request_id: id };
  run.fix_lines_cost_usd = Number(spent.toFixed(6));
  writeFileSync(file, JSON.stringify(run, null, 1) + '\n');
  console.log(`  ${r.job}: ${BANNED.test(line) ? '[still names what to avoid] ' : ''}${line}`);
}
console.log(`fix lines: $${spent.toFixed(4)} spent in total`);
