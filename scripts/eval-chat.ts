/**
 * The 50-question check for the reading assistant (owner's condition for merging chat).
 *
 *   npx tsx scripts/eval-chat.ts --retrieval            free: is the answering block sent to the model?
 *   VERCEL_OIDC_TOKEN=… npx tsx scripts/eval-chat.ts --full OUT.json   paid: answers, citations, guard
 *
 * Questions and their answering blocks: docs/proposals/chat-eval/questions.json (chapters 1–15,
 * written by the coding agent with the blocks checked by hand). Every question is asked with the
 * thread limit at chapter 15. Runs on PGlite with migrations 0001–0006 and every block, like test:chat.
 * --full spends money (well under a cent a question); its total is printed and goes in chat-spend.md.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { ask, type Complete } from '../src/lib/chat/ask';
import { retrieve } from '../src/lib/chat/retrieve';
import { providerOptions, servedBy } from '../src/lib/chat/provider';
import { CHAT } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const mode = process.argv[2];
const out = process.argv[3];
const LIMIT = 15;
interface Q { id: string; chapter: number; question: string; gold: string[]; answer_fact: string; type: string }
const questions = JSON.parse(await readFile(path.join(ROOT, 'docs/proposals/chat-eval/questions.json'), 'utf8')) as Q[];

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of ['0001_core.sql', '0002_v5.sql', '0003_likes.sql', '0004_private_ratings_and_likes.sql', '0005_public_prompts_and_consent.sql', '0006_chat.sql'])
  await pg.exec(await readFile(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(`insert into studio.works values ('snowmoon', 'Snowmoon', 'GPL-3.0', 'x'); set role studio_writer;`);
const server = new PGLiteSocketServer({ db: pg, port: 54334, host: '127.0.0.1' });
await server.start();
const URL = 'postgres://studio_writer@127.0.0.1:54334/postgres';
await promisify(execFile)('npx', ['tsx', 'scripts/seed-text.ts'], { cwd: ROOT, env: { ...process.env, STUDIO_DATABASE_URL: URL } });
const sql = postgres(URL, { prepare: false, max: 1 });
await sql`set role studio_writer`;

try {
  // Retrieval: is any answering block among the passages sent to the model (hits and their neighbours)?
  let any = 0;
  let first = 0;
  const misses: string[] = [];
  for (const q of questions) {
    const r = await retrieve(sql, q.question, LIMIT);
    const sent = new Set(r.passages.map((p) => p.id));
    const hit = q.gold.some((g) => sent.has(g));
    any += hit ? 1 : 0;
    first += sent.has(q.gold[0]) ? 1 : 0;
    if (!hit) misses.push(`${q.id} ${q.gold.join(',')}  ${q.question}`);
  }
  console.log(`retrieval: an answering block sent for ${any}/${questions.length}; the best one for ${first}/${questions.length}`);
  console.log(`missed:\n  ${misses.join('\n  ')}`);

  if (mode === '--full') {
    const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
    if (!token) throw new Error('no gateway token');
    const prompt = async (f: string) => (await readFile(path.join(ROOT, 'config/prompts', f), 'utf8')).replace(/^<!--[\s\S]*?-->\s*/, '');
    // Every call is kept here in full for grading (this script only; the app keeps no text).
    const log: { q: string; model: string; text: string; provider: string | null }[] = [];
    let current = '';
    const complete: Complete = async (model, messages, opts) => {
      const res = await fetch(CHAT.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens, temperature: opts.temperature, providerOptions: providerOptions() }),
      });
      const j = (await res.json()) as { id?: string; model?: string; provider?: string; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }; provider_metadata?: { gateway?: { routing?: { finalProvider?: string } } } };
      if (!res.ok) throw new Error(`gateway ${res.status} ${JSON.stringify(j).slice(0, 300)}`);
      const p = CHAT.prices[model];
      const pt = j.usage?.prompt_tokens ?? 0;
      const ct = j.usage?.completion_tokens ?? 0;
      const provider = servedBy(j);
      const text = j.choices?.[0]?.message?.content ?? '';
      log.push({ q: current, model, text, provider });
      return { text, promptTokens: pt, completionTokens: ct, costUsd: typeof j.usage?.cost === 'number' ? j.usage.cost : pt * p.input + ct * p.output, requestId: j.id ?? null, provider, model: j.model ?? model };
    };
    
    const systemPrompt = await prompt('chat-ask.md');
    const guardPolicy = await prompt('chat-guard.md');
    const reminder = await prompt('chat-reminder.md');
    const searchPrompt = await prompt('chat-search-terms.md');
    const deps = (fid: number) => ({ sql, fid, complete, systemPrompt, guardPolicy, reminder, searchPrompt });
    const results = [];
    for (const [i, q] of questions.entries()) {
      current = q.id;
      // A fresh fid per question keeps the 30-a-day limit out of the way.
      const result = await ask(deps(90000 + i), { question: q.question, limit: LIMIT });
      // What was searched and sent: the search words are the first call's text.
      const words = log.find((l) => l.q === q.id)?.text ?? '';
      const passages = (await retrieve(sql, `${q.question} ${(words.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []).slice(0, 20).join(' ')}`, LIMIT)).passages.map((p) => p.id);
      results.push({ ...q, passages, result, calls: log.filter((l) => l.q === q.id) });
      console.log(`${q.id} ${result.state}${result.state === 'answer' && result.regenerated ? ' (regenerated)' : ''}`);
      if (process.env.EVAL_SPEND_CAP && (await spent()) > Number(process.env.EVAL_SPEND_CAP)) { console.log('spend cap reached, stopping'); break; }
    }
    const usd = await spent();
    const providers = [...new Set(log.map((l) => l.provider))];
    console.log(`spend: $${usd.toFixed(5)}; providers seen: ${providers.join(', ')}`);
    if (out) await writeFile(out, JSON.stringify({ spend_usd: usd, providers, results }, null, 1));
  }
} finally {
  await sql.end();
  await server.stop();
}

async function spent(): Promise<number> {
  const [{ usd }] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.chat_calls where kind <> 'ask'`;
  return Number(usd);
}
