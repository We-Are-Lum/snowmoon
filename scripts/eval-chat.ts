/**
 * The 50-question check for the reading assistant (owner's condition for merging chat).
 *
 *   npx tsx scripts/eval-chat.ts --retrieval            free: is the answering block sent to the model?
 *   VERCEL_OIDC_TOKEN=… npx tsx scripts/eval-chat.ts --full OUT.json   paid: answers, citations, guard
 *   QUESTIONS=fresh-questions.json …                    the held-out set (nothing was tuned on it)
 *   npx tsx scripts/eval-chat.ts --estimate             free: what a Claude answer model would cost (the trial)
 *   ANSWER_MODEL=claude-opus-5-5 TRIAL_LEDGER=… SEARCH_WORDS=… npx tsx --env-file-if-exists=…/.env.anthropic.local … --full OUT.json
 *       (the key is SNOWMOON_ANTHROPIC_KEY in /Users/nathan/snowmoon/.env.anthropic.local, owner 2026-10-24)
 *       the Claude trial (2026-10-23): a Claude model answers; search words and guards as before. See
 *       docs/proposals/chat-eval/claude-trial/ for the exact commands and the $5 cap.
 *
 * Questions and their answering blocks: docs/proposals/chat-eval/questions.json (chapters 1–15,
 * written by the coding agent with the blocks checked by hand). Every question is asked with the
 * thread limit at chapter 15. Runs on PGlite with migrations 0001–0007 and every block, like test:chat.
 * --full spends money (well under a cent a question); its total is printed and goes in chat-spend.md.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
import { CapReached, CLAUDE_PRICES, callClaude, isClaude, Ledger, refuseAmbientAnthropicKey, worstCaseClaudeUsd } from './lib/claude-trial';

const ROOT = path.resolve(import.meta.dirname, '..');
// The trial's key is read from SNOWMOON_ANTHROPIC_KEY only, then removed from the environment so no child
// process (the seed step) inherits it; the site's Groq key is removed too: the check never uses it.
refuseAmbientAnthropicKey();
const trialKey = process.env.SNOWMOON_ANTHROPIC_KEY || undefined;
delete process.env.SNOWMOON_ANTHROPIC_KEY;
delete process.env.GROQ_API_KEY;
const mode = process.argv[2];
const out = process.argv[3];
const LIMIT = 15;
/** DENSE=path: block ids ranked per question by an embedding model (made offline), fused with the word search. */
const DENSE = process.env.DENSE ? (JSON.parse(await readFile(process.env.DENSE, 'utf8')) as { model: string; ranks: Record<string, string[]> }) : null;
interface Q { id: string; chapter: number; question: string; gold: string[]; answer_fact: string; type: string }
// QUESTIONS=fresh-questions.json for the held-out set (2026-10-07); the tuning set by default.
const allQuestions = JSON.parse(await readFile(path.join(ROOT, 'docs/proposals/chat-eval', process.env.QUESTIONS ?? 'questions.json'), 'utf8')) as Q[];
// FIRST=n: only the first n questions (a smoke test before a paid run).
const questions = process.env.FIRST ? allQuestions.slice(0, Number(process.env.FIRST)) : allQuestions;

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of ['0001_core.sql', '0002_v5.sql', '0003_likes.sql', '0004_private_ratings_and_likes.sql', '0005_public_prompts_and_consent.sql', '0006_chat.sql', '0007_chat_costs_without_person.sql'])
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
    const r = await retrieve(sql, q.question, LIMIT, [], DENSE ? { dense: DENSE.ranks[q.id] } : {});
    const sent = new Set(r.passages.map((p) => p.id));
    const hit = q.gold.some((g) => sent.has(g));
    any += hit ? 1 : 0;
    first += sent.has(q.gold[0]) ? 1 : 0;
    if (!hit) misses.push(`${q.id} ${q.gold.join(',')}  ${q.question}`);
  }
  console.log(`retrieval${DENSE ? ` + ${DENSE.model}` : ''}: an answering block sent for ${any}/${questions.length}; the best one for ${first}/${questions.length}`);
  console.log(`missed:\n  ${misses.join('\n  ')}`);

  const prompt = async (f: string) => (await readFile(path.join(ROOT, 'config/prompts', f), 'utf8')).replace(/^<!--[\s\S]*?-->\s*/, '');
  const systemPrompt = await prompt('chat-ask.md');
  const guardPolicy = await prompt('chat-guard.md');
  const reminder = await prompt('chat-reminder.md');
  const searchPrompt = await prompt('chat-search-terms.md');
  const supportPolicy = await prompt('chat-support.md');
  /** Which answer model this run uses: the app's by default, or a Claude model for the trial (ANSWER_MODEL). */
  const answerModel = process.env.ANSWER_MODEL || CHAT.model;
  if (answerModel !== CHAT.model && !isClaude(answerModel)) throw new Error(`ANSWER_MODEL: ${CHAT.model} or one of ${Object.keys(CLAUDE_PRICES).join(', ')}`);
  const effort = process.env.EFFORT || 'medium';
  /** Room for adaptive thinking plus the answer (the app gives gpt-oss 1,200). */
  const claudeMaxTokens = Number(process.env.CLAUDE_MAX_TOKENS || 4000);

  if (mode === '--estimate') {
    // Free: the answer prompt each question would send (retrieval on the question alone; the search words
    // add a little), priced for each Claude model at an assumed output, and at the worst case the cap checks.
    const outTokens = Number(process.env.ASSUMED_OUTPUT_TOKENS || 900);
    let chars = 0;
    for (const q of questions) {
      const r = await retrieve(sql, q.question, LIMIT, [], {});
      chars += systemPrompt.length + q.question.length + r.passages.reduce((n, p) => n + p.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').length + p.id.length + 3, 0);
    }
    const tokens = chars / questions.length / 4; // about 4 characters a token in English prose
    console.log(`answer prompt: about ${Math.round(tokens)} tokens a question (${Math.round(chars / questions.length)} characters)`);
    for (const m of Object.keys(CLAUDE_PRICES)) {
      const p = CLAUDE_PRICES[m];
      const each = tokens * p.input + outTokens * p.output;
      const worst = worstCaseClaudeUsd(m, chars / questions.length, claudeMaxTokens);
      console.log(`${m}: ~$${each.toFixed(4)} a question at ${outTokens} output tokens (thinking included) → ~$${(each * questions.length).toFixed(2)} for ${questions.length}; worst case $${worst.toFixed(4)} a question → $${(worst * questions.length).toFixed(2)}`);
    }
  }

  if (mode === '--full') {
    const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
    if (!token) throw new Error('no gateway token');
    const anthropicKey = isClaude(answerModel) ? trialKey : undefined;
    if (isClaude(answerModel) && !anthropicKey) throw new Error('ANSWER_MODEL is a Claude model and SNOWMOON_ANTHROPIC_KEY is not set (/Users/nathan/snowmoon/.env.anthropic.local)');
    /** The trial's spend across runs, checked before every paid call (TRIAL_LEDGER, TRIAL_CAP_USD). */
    const ledger = process.env.TRIAL_LEDGER ? new Ledger(process.env.TRIAL_LEDGER, Number(process.env.TRIAL_CAP_USD || 5)) : null;
    /** Search words shared across runs (SEARCH_WORDS file), so every answer model gets the same passages. */
    const wordsFile = process.env.SEARCH_WORDS;
    const savedWords: Record<string, string> = wordsFile && existsSync(wordsFile) ? JSON.parse(await readFile(wordsFile, 'utf8')) : {};
    // The app's own daily cap (CHAT.dailySpendCapUsd, summed in this run's throwaway database) would turn
    // questions into "spend" refusals partway through a Claude run; the trial's ledger is the cap here.
    if (ledger) (CHAT as { dailySpendCapUsd: number }).dailySpendCapUsd = 1e9;
    // Every call is kept here in full for grading (this script only; the app keeps no text).
    type Call = { q: string; kind: string; model: string; text: string; provider: string | null; usd: number; promptTokens: number; completionTokens: number; cacheRead?: number; cacheWrite?: number; stopReason?: string | null; reused?: boolean };
    const log: Call[] = [];
    let current = '';
    let busy = 0;
    const kindOf = (first: string) => (first === searchPrompt ? 'search' : first === guardPolicy ? 'guard' : first === supportPolicy ? 'support' : 'answer');
    const complete: Complete = async (model, messages, opts) => {
      const kind = kindOf(messages[0]?.content ?? '');
      const chars = messages.reduce((n, m) => n + m.content.length, 0);
      if (kind === 'search' && savedWords[messages[1].content] !== undefined) {
        const text = savedWords[messages[1].content];
        log.push({ q: current, kind, model, text, provider: null, usd: 0, promptTokens: 0, completionTokens: 0, reused: true });
        return { text, promptTokens: 0, completionTokens: 0, costUsd: 0, requestId: null, provider: null, model };
      }
      if (kind === 'answer' && isClaude(answerModel)) {
        ledger?.check(worstCaseClaudeUsd(answerModel, chars, claudeMaxTokens), `${current} answer`);
        const r = await callClaude({ key: anthropicKey!, model: answerModel, messages, maxTokens: claudeMaxTokens, effort, onBusy: () => busy++ });
        ledger?.add(answerModel, r.costUsd);
        const cacheRead = r.usage.cache_read_input_tokens ?? 0;
        const cacheWrite = r.usage.cache_creation_input_tokens ?? 0;
        const promptTokens = r.usage.input_tokens + cacheRead + cacheWrite;
        log.push({ q: current, kind, model: r.model, text: r.text, provider: 'anthropic', usd: r.costUsd, promptTokens, completionTokens: r.usage.output_tokens, cacheRead, cacheWrite, stopReason: r.stopReason });
        return { text: r.text, promptTokens, completionTokens: r.usage.output_tokens, costUsd: r.costUsd, requestId: r.id, provider: 'anthropic', model: r.model };
      }
      const p = CHAT.prices[model];
      ledger?.check(Math.ceil(chars / 2.5) * p.input + opts.maxTokens * p.output, `${current} ${kind}`);
      const send = () =>
        fetch(CHAT.endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens, temperature: opts.temperature, providerOptions: providerOptions() }),
        });
      let res = await send();
      // The pinned provider may be busy; the app retries once, the check waits longer so a run isn't cut short.
      for (let wait = 2000; [429, 498, 503].includes(res.status) && wait <= 32000; wait *= 2) {
        busy++;
        await new Promise((r) => setTimeout(r, wait));
        res = await send();
      }
      const j = (await res.json()) as { id?: string; model?: string; provider?: string; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }; provider_metadata?: { gateway?: { routing?: { finalProvider?: string } } } };
      if (!res.ok) throw new Error(`gateway ${res.status} ${JSON.stringify(j).slice(0, 300)}`);
      const pt = j.usage?.prompt_tokens ?? 0;
      const ct = j.usage?.completion_tokens ?? 0;
      const provider = servedBy(j);
      const text = j.choices?.[0]?.message?.content ?? '';
      const usd = typeof j.usage?.cost === 'number' ? j.usage.cost : pt * p.input + ct * p.output;
      ledger?.add(model, usd);
      log.push({ q: current, kind, model, text, provider, usd, promptTokens: pt, completionTokens: ct });
      if (kind === 'search' && wordsFile) {
        savedWords[messages[1].content] = text;
        await writeFile(wordsFile, JSON.stringify(savedWords, null, 1) + '\n');
      }
      return { text, promptTokens: pt, completionTokens: ct, costUsd: usd, requestId: j.id ?? null, provider, model: j.model ?? model };
    };

    const deps = (fid: number) => ({
      sql, fid, complete, systemPrompt, guardPolicy, reminder, searchPrompt, supportPolicy,
      ...(DENSE ? { dense: async () => DENSE.ranks[current] } : {}),
    });
    const results = [];
    let stopped: string | null = null;
    for (const [i, q] of questions.entries()) {
      current = q.id;
      let result;
      try {
        // A fresh fid per question keeps the 30-a-day limit out of the way.
        result = await ask(deps(90000 + i), { question: q.question, limit: LIMIT });
      } catch (e) {
        if (!(e instanceof CapReached || (e as Error).message?.includes('spend cap'))) throw e;
        stopped = (e as Error).message;
        console.log(`${q.id} not asked: ${stopped}`);
        break;
      }
      // What was searched and sent: the search words are the first call's text.
      const words = log.find((l) => l.q === q.id && l.kind === 'search')?.text ?? '';
      const passages = (await retrieve(sql, `${q.question} ${(words.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []).slice(0, 20).join(' ')}`, LIMIT, [], DENSE ? { dense: DENSE.ranks[q.id] } : {})).passages.map((p) => p.id);
      const calls = log.filter((l) => l.q === q.id);
      results.push({
        ...q,
        passages_sent: passages,
        hit: q.gold.some((g) => passages.includes(g)),
        state: result.state,
        regenerated: result.state === 'answer' ? result.regenerated : calls.filter((c) => c.kind === 'answer').length > 1,
        answer_as_shown: result.state === 'answer' ? result.parts.map((p) => (p.type === 'text' ? p.text : `[${p.id}]`)).join('') : '',
        quoted: result.state === 'answer' ? result.quotes.map((x) => x.id) : [],
        cost_usd: calls.reduce((n, c) => n + c.usd, 0),
        calls,
      });
      console.log(`${q.id} ${result.state}${result.state === 'answer' && result.regenerated ? ' (regenerated)' : ''}`);
      if (process.env.EVAL_SPEND_CAP && (await spent()) > Number(process.env.EVAL_SPEND_CAP)) { stopped = 'EVAL_SPEND_CAP reached'; console.log('spend cap reached, stopping'); break; }
    }
    const usd = log.reduce((n, c) => n + c.usd, 0);
    const providers = [...new Set(log.map((l) => l.provider).filter(Boolean))];
    const served = [...new Set(log.filter((l) => l.kind === 'answer').map((l) => l.model))];
    console.log(`spend: $${usd.toFixed(5)} ($${(usd / Math.max(results.length, 1)).toFixed(5)} a question); providers seen: ${providers.join(', ')}; busy retries: ${busy}${ledger ? `; trial total $${ledger.spentUsd.toFixed(5)} of $${ledger.capUsd}` : ''}`);
    if (out) {
      const sha = async (f: string) => createHash('sha256').update(await readFile(path.join(ROOT, 'config/prompts', f))).digest('hex').slice(0, 12);
      const git = await promisify(execFile)('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).then((r) => r.stdout.trim(), () => null);
      await writeFile(out, JSON.stringify({
        note: `Model output (answers: ${answerModel}${isClaude(answerModel) ? ', Anthropic API direct' : ' on Groq via Vercel AI Gateway'}; search words ${CHAT.model} and guard ${CHAT.guardModel} on Groq via Vercel AI Gateway, zero data retention), kept as evidence.`,
        answer_model: answerModel,
        served_models: served,
        effort: isClaude(answerModel) ? effort : null,
        max_tokens: isClaude(answerModel) ? claudeMaxTokens : 1200,
        search_model: CHAT.model,
        guard_model: CHAT.guardModel,
        date: new Date().toISOString(),
        git,
        prompt_sha256: Object.fromEntries(await Promise.all(['chat-ask.md', 'chat-guard.md', 'chat-reminder.md', 'chat-search-terms.md', 'chat-support.md'].map(async (f) => [f, await sha(f)]))),
        retrieval: { limit_chapter: LIMIT, hits: CHAT.passages, neighbours: CHAT.neighbours, search_words: CHAT.searchTerms, dense: DENSE?.model ?? null, search_words_file: wordsFile ?? null },
        questions: process.env.QUESTIONS ?? 'questions.json',
        spend_usd: usd,
        cost_per_question_usd: usd / Math.max(results.length, 1),
        stopped_at_cap: stopped,
        providers,
        busy_retries: busy,
        results,
      }, null, 1) + '\n');
    }
  }
} finally {
  await sql.end();
  await server.stop();
}

async function spent(): Promise<number> {
  const [{ usd }] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.chat_costs`;
  return Number(usd);
}
