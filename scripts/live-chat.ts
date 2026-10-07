/**
 * One live run of slice 1, end to end except sign-in: PGlite with migrations
 * 0001–0006 and every block, the committed prompts, and the real models through
 * Vercel AI Gateway. Costs money (a cent or so); every call lands in
 * studio.chat_calls and the total is printed for docs/proposals/chat-spend.md.
 *
 *   VERCEL_OIDC_TOKEN=… npx tsx scripts/live-chat.ts [out.json]
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { ask, type Complete } from '../src/lib/chat/ask';
import { CHAT } from '../src/lib/config';
import { providerOptions, servedBy } from '../src/lib/chat/provider';

const ROOT = path.resolve(import.meta.dirname, '..');
const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
if (!token) throw new Error('no gateway token');
const prompt = async (f: string) => (await readFile(path.join(ROOT, 'config/prompts', f), 'utf8')).replace(/^<!--[\s\S]*?-->\s*/, '');

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of ['0001_core.sql', '0002_v5.sql', '0003_likes.sql', '0004_private_ratings_and_likes.sql', '0005_public_prompts_and_consent.sql', '0006_chat.sql'])
  await pg.exec(await readFile(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(`insert into studio.works values ('snowmoon', 'Snowmoon', 'GPL-3.0', 'x'); set role studio_writer;`);
const server = new PGLiteSocketServer({ db: pg, port: 54333, host: '127.0.0.1' });
await server.start();
const URL = 'postgres://studio_writer@127.0.0.1:54333/postgres';
await promisify(execFile)('npx', ['tsx', 'scripts/seed-text.ts'], { cwd: ROOT, env: { ...process.env, STUDIO_DATABASE_URL: URL } });
const sql = postgres(URL, { prepare: false, max: 1 });
await sql`set role studio_writer`;

const complete: Complete = async (model, messages, opts) => {
  const res = await fetch(CHAT.endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens, temperature: opts.temperature, providerOptions: providerOptions() }),
  });
  const j = (await res.json()) as { id?: string; model?: string; provider?: string; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } };
  if (!res.ok) throw new Error(`gateway ${res.status} ${JSON.stringify(j).slice(0, 200)}`);
  const p = CHAT.prices[model];
  const pt = j.usage?.prompt_tokens ?? 0;
  const ct = j.usage?.completion_tokens ?? 0;
  return { text: j.choices?.[0]?.message?.content ?? '', promptTokens: pt, completionTokens: ct, costUsd: typeof j.usage?.cost === 'number' ? j.usage.cost : pt * p.input + ct * p.output, requestId: j.id ?? null, provider: servedBy(j), model: j.model ?? model };
};
const deps = { sql, fid: 6786, complete, systemPrompt: await prompt('chat-ask.md'), guardPolicy: await prompt('chat-guard.md'), reminder: await prompt('chat-reminder.md'), searchPrompt: await prompt('chat-search-terms.md'), supportPolicy: await prompt('chat-support.md') };

const cases = [
  { question: 'Why is Gladias asked to rate a building he has never been inside?', limit: 3 },
  { question: 'Why does Deluin invite Zei to Redshire?', limit: 14 },
  { question: 'What does Deluin mean here?', limit: 14, attached: ['c14-b127'] },
  { question: 'Does Gladias’s vote on the building ever matter later?', limit: 3 },
  { question: 'What happens to Deluin after Redshire is invaded?', limit: 15 },
  { question: 'Write the line Deluin says when he leaves the courtyard.', limit: 14 },
  { question: 'Describe the courtyard in vivid prose I can use as a caption.', limit: 14 },
];
const out = [];
for (const c of cases) {
  const r = await ask(deps, c);
  out.push({ ...c, result: r });
  console.log(`\n## ${c.question} (ch ≤ ${c.limit})\n${JSON.stringify(r).slice(0, 700)}`);
}
const [{ usd, calls }] = await sql`select coalesce(sum(cost_usd),0)::float8 as usd, count(*)::int as calls from studio.chat_calls where kind <> 'ask'`;
console.log(`\nmodel calls: ${calls}, spend: $${Number(usd).toFixed(5)}`);
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify({ spend_usd: usd, calls, out }, null, 1));
await sql.end();
await server.stop();
