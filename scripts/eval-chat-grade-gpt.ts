/**
 * A third grader for the 50-question check that isn't Claude (owner, 2026-10-24): openai/gpt-5.6-sol through
 * Vercel AI Gateway, the checker used for the glossary (reasoning effort low, OpenAI only). It grades a blind
 * pack made by eval-chat-compare.ts (shuffled letters; it never sees the key) with the same rubric as graders A
 * and B, one call per question, and writes grades-GPT.json beside the pack.
 *
 *   TRIAL_LEDGER=…/spend.json TRIAL_CAP_USD=3 npx tsx --env-file=/Users/nathan/snowmoon/.env.local \
 *     scripts/eval-chat-grade-gpt.ts PACK_DIR
 *
 * Answers the app didn't show, or that only say "The passages don't say.", are graded without a call: 0 claims, `cant`.
 * The ledger's cap is checked before every call with that call's worst case.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Ledger } from './lib/claude-trial';

const MODEL = 'openai/gpt-5.6-sol';
/** USD per token, the gateway's published list (read 2026-10-24). */
const PRICE = { input: 4e-6, output: 20e-6 };
const MAX_TOKENS = 6000;
const dir = process.argv[2];
const token = process.env.AI_GATEWAY_API_KEY;
if (!token) throw new Error('AI_GATEWAY_API_KEY is not set');
if (!process.env.TRIAL_LEDGER) throw new Error('TRIAL_LEDGER is required (the cap)');
const ledger = new Ledger(process.env.TRIAL_LEDGER, Number(process.env.TRIAL_CAP_USD || 3));
if (existsSync(path.join(dir, 'key.json'))) throw new Error('the key is in the pack directory; move it out before grading');

interface Answer { label: string; answer: string; cited: string[] }
interface Item { id: string; question: string; gold: string[]; answer_fact: string; blocks: Record<string, string>; answers: Answer[] }
interface Grade { id: string; label: string; claims: number; supported: number; unsupported_but_true: number; unsupported: number; correct: string; note: string }
const pack = (JSON.parse(readFileSync(path.join(dir, 'pack.json'), 'utf8')) as Item[]).slice(0, Number(process.env.FIRST) || undefined);
const rubric = readFileSync(path.join(dir, 'RUBRIC.md'), 'utf8');
const outFile = path.join(dir, 'grades-GPT.json');
const done: Grade[] = existsSync(outFile) ? (JSON.parse(readFileSync(outFile, 'utf8')) as { items: Grade[] }).items : [];
const usage = { calls: 0, input: 0, output: 0, reasoning: 0, usd: 0 };

const system = `${rubric}

You are grading through an API, not with files: the question, the book's blocks and the lettered answers come in the
message. Reply with JSON only, no prose around it:
{"items":[{"label":"K","claims":0,"supported":0,"unsupported_but_true":0,"unsupported":0,"correct":"yes|partly|cant|no|wrong","note":""}]}
one item per answer you are given, with supported + unsupported_but_true + unsupported = claims.`;

for (const q of pack) {
  const todo = q.answers.filter((a) => !done.some((d) => d.id === q.id && d.label === a.label));
  if (!todo.length) continue;
  // Not shown, or only "the passages don't say" with nothing cited: no claims, graded without a call.
  const bare = (x: Answer) => x.answer.startsWith('(not shown') || x.answer.startsWith('(not asked') || (/^the passages don.t say\.?$/i.test(x.answer.trim()));
  for (const a of todo.filter(bare))
    done.push({ id: q.id, label: a.label, claims: 0, supported: 0, unsupported_but_true: 0, unsupported: 0, correct: 'cant', note: 'not shown or "the passages don\'t say" only (no call)' });
  const ask = todo.filter((x) => !bare(x));
  if (ask.length) {
    const user = JSON.stringify({ id: q.id, question: q.question, gold: q.gold, answer_fact: q.answer_fact, blocks: q.blocks, answers: ask.map(({ label, answer, cited }) => ({ label, answer, cited })) });
    const worst = Math.ceil((system.length + user.length) / 2.5) * PRICE.input + MAX_TOKENS * PRICE.output;
    ledger.check(worst, `${q.id} GPT grading`);
    const res = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, max_tokens: MAX_TOKENS, reasoning: { effort: 'low' }, response_format: { type: 'json_object' },
        providerOptions: { gateway: { only: ['openai'] } },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; completion_tokens_details?: { reasoning_tokens?: number } } };
    if (!res.ok) throw new Error(`gateway ${res.status} ${JSON.stringify(j).slice(0, 300)}`);
    const pt = j.usage?.prompt_tokens ?? 0;
    const ct = j.usage?.completion_tokens ?? 0;
    const usd = typeof j.usage?.cost === 'number' ? j.usage.cost : pt * PRICE.input + ct * PRICE.output;
    ledger.add(MODEL, usd);
    Object.assign(usage, { calls: usage.calls + 1, input: usage.input + pt, output: usage.output + ct, reasoning: usage.reasoning + (j.usage?.completion_tokens_details?.reasoning_tokens ?? 0), usd: usage.usd + usd });
    const text = j.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { items: Omit<Grade, 'id'>[] };
    for (const a of ask) {
      const g = parsed.items.find((x) => x.label === a.label);
      if (!g) throw new Error(`${q.id} ${a.label}: no grade in the reply`);
      const n = (k: keyof Grade) => Math.max(0, Math.round(Number(g[k as keyof typeof g]) || 0));
      const item: Grade = { id: q.id, label: a.label, claims: n('claims'), supported: n('supported'), unsupported_but_true: n('unsupported_but_true'), unsupported: n('unsupported'), correct: String(g.correct), note: String(g.note ?? '') };
      // Keep the counts consistent: the claim total is the sum of its parts.
      item.claims = item.supported + item.unsupported_but_true + item.unsupported;
      if (!['yes', 'partly', 'cant', 'no', 'wrong'].includes(item.correct)) throw new Error(`${q.id} ${a.label}: bad grade ${item.correct}`);
      done.push(item);
    }
  }
  writeFileSync(outFile, JSON.stringify({ grader: `GPT (${MODEL}, reasoning effort low, via Vercel AI Gateway)`, items: done }, null, 1) + '\n');
  console.log(`${q.id} graded; $${usage.usd.toFixed(4)} this run; ledger $${ledger.spentUsd.toFixed(4)} of $${ledger.capUsd}`);
}
console.log(`GPT grading: ${usage.calls} calls, ${usage.input} input and ${usage.output} output tokens (${usage.reasoning} reasoning), $${usage.usd.toFixed(5)}`);
