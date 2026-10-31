/**
 * Routing C, one small real trial (coding agent, Anthropic's Claude, 2026-10-31). The site's own code, with real
 * model calls and a throwaway in-memory database (PGlite, migrations 0006–0007): nothing is written to production.
 * - The routing call: src/lib/chat/router.ts through src/lib/chat/model.ts. GROQ_API_KEY is removed from this
 *   process, so it goes through Vercel AI Gateway, pinned to Groq with zero retention (the chat's fallback route);
 *   the site's own Groq key is never used.
 * - Make turns: src/lib/chat/make.ts makeTurn with completeMake (the gateway, Baseten only, zero retention, no
 *   fallback) and make mode's real book tools (src/lib/chat/make-tools.ts).
 * Every gateway reply's provider, zero-retention flag and cost are recorded. Stops before any call once $0.40 is spent.
 *
 *   env -u GROQ_API_KEY npx tsx --conditions=react-server --env-file=.env.local docs/trials/routing-c-trial.mts <out.json>
 */
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';

delete process.env.GROQ_API_KEY;
process.env.IMAGES_TICKET_SECRET = 'trial-only-secret-for-make-tokens-0123456789';
const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = process.argv[2] ?? '/tmp/routing-c-trial.json';
const STOP_USD = 0.4;

const { CHAT } = await import('../../src/lib/config');
const { complete, gatewayToken, promptFile } = await import('../../src/lib/chat/model');
const { routeMessage } = await import('../../src/lib/chat/router');
const { completeMake, makeTurn } = await import('../../src/lib/chat/make');
const { makeTools } = await import('../../src/lib/chat/make-tools');
const { makeSpentToday, makeStartedToday, spentToday } = await import('../../src/lib/chat/limits');

const token = gatewayToken();
if (!token) throw new Error('no gateway token in the environment');

// Every gateway reply, as seen on the wire (no message text kept here beyond the answer printed below).
const wire: { model: string; status: number; only: unknown; zdrAsked: unknown; finalProvider: string | null; zdrConfirmed: unknown; cost: number | null; tokensIn: number; tokensOut: number }[] = [];
let spent = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  if (spent >= STOP_USD) throw new Error(`stopped: $${spent.toFixed(4)} spent, the trial's stop is $${STOP_USD}`);
  const res = await realFetch(url, init);
  const body = init?.body ? (JSON.parse(String(init.body)) as { model?: string; providerOptions?: { gateway?: { only?: unknown; zeroDataRetention?: unknown } } }) : {};
  const j = (await res.clone().json().catch(() => ({}))) as { choices?: { message?: { provider_metadata?: { gateway?: { routing?: { finalProvider?: string }; enabledZeroDataRetention?: unknown } } } }[]; usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number } };
  const g = j.choices?.[0]?.message?.provider_metadata?.gateway;
  const cost = typeof j.usage?.cost === 'number' ? j.usage.cost : null;
  spent += cost ?? 0;
  wire.push({ model: String(body.model), status: res.status, only: body.providerOptions?.gateway?.only, zdrAsked: body.providerOptions?.gateway?.zeroDataRetention, finalProvider: g?.routing?.finalProvider ?? null, zdrConfirmed: g?.enabledZeroDataRetention, cost, tokensIn: j.usage?.prompt_tokens ?? 0, tokensOut: j.usage?.completion_tokens ?? 0 });
  return res;
}) as typeof fetch;

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of ['0001_core.sql', '0006_chat.sql', '0007_chat_costs_without_person.sql']) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
const server = new PGLiteSocketServer({ db: pg, port: 54349, host: '127.0.0.1' });
await server.start();
const sql = postgres('postgres://postgres@127.0.0.1:54349/postgres', { prepare: false, max: 1 });

const route = (q: string) => routeMessage((model, messages, opts) => complete(token, model, messages, opts), q);
const make = { sql, fid: 6786, call: completeMake(token), tools: makeTools(32), systemPrompt: promptFile('chat-make.md') };
const log: Record<string, unknown>[] = [];
try {
  const q1 = 'What is a Keeper in the book?';
  const r1 = await route(q1);
  log.push({ turn: 1, message: q1, route: r1.route, route_provider: r1.reply.provider });

  const q2 = "I'd like to make a reference picture of Bai.";
  const r2 = await route(q2);
  log.push({ turn: 2, message: q2, route: r2.route, route_provider: r2.reply.provider });
  const m2 = await makeTurn(make, { question: q2, limit: 32, history: [] });
  log.push({ turn: 2, result: m2.state, text: m2.state === 'made' ? m2.text : null, left: m2.state === 'made' ? m2.left : null });

  if (m2.state === 'made') {
    const q3 = "Use the book's own look where it has one; the edition's invented look for the rest.";
    const m3 = await makeTurn(make, { question: q3, limit: 32, history: [{ role: 'user', text: q2 }, { role: 'assistant', text: m2.text }], make: m2.make });
    log.push({ turn: 3, message: q3, sticky: true, result: m3.state, text: m3.state === 'made' ? m3.text : null, left: m3.state === 'made' ? m3.left : null });
  }
  log.push({ make_conversations_counted: await makeStartedToday(sql, 6786), make_spend_recorded: await makeSpentToday(sql), chat_spend_recorded: await spentToday(sql) });
} catch (e) {
  log.push({ error: (e as Error).message });
} finally {
  await sql.end();
  await server.stop();
}
const summary = { spent_usd: spent, calls: wire.length, wire, log, make_settings: { model: CHAT.make.model, provider: CHAT.make.provider } };
writeFileSync(OUT, JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
