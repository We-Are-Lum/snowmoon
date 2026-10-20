/**
 * live:pronouns: the "Make your own" coach's pronouns against the real models (owner, 2026-10-19: "Live check: go.
 * $0.005 is worth seeing the real model, not just a stand-in"; capped at $0.01). The assistant's own models through
 * Vercel AI Gateway with zero data retention, with AI_GATEWAY_API_KEY from this Mac (never printed). Before every
 * model call, stops if that call's worst case would take the run past CAP, summed from the calls' own reported
 * costs (studio.coach_costs).
 *
 *   npx tsx --conditions=react-server scripts/live-pronouns-make.ts
 *
 * The book is the real seed in a local PGlite; nothing touches the hosted database. Writes
 * docs/make-your-own/pronouns-live.json: each message, every reply the model wrote (shown or not), the slips the
 * check found in each, and what was shown.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createServer as createNet } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { coach } from '../src/lib/make/coach';
import { pronounSlips } from '../src/lib/make/cast';
import type { Draft } from '../src/lib/make/draft';
import { CHAT } from '../src/lib/config';
import { worstCaseUsd } from '../src/lib/chat/limits';
import type { Complete } from '../src/lib/chat/ask';

const ROOT = path.resolve(import.meta.dirname, '..');
const CAP = 0.01;
// One call's worst case, either kind (an answer of 900 tokens or a guard verdict of 1500, on 10,000 tokens in).
const PER_CALL = worstCaseUsd(900, 1500, 10000);
const key = process.env.AI_GATEWAY_API_KEY;
if (!key) throw new Error('AI_GATEWAY_API_KEY not set');
delete process.env[CHAT.direct.keyEnv];
const { complete } = await import('../src/lib/chat/model');
const prompt = (f: string) => readFileSync(path.join(ROOT, 'config/prompts', f), 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '');

const freePort = () => new Promise<number>((res) => { const s = createNet(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(readFileSync(path.join(ROOT, 'supabase/drafts/0017_adaptation_drafts.sql'), 'utf8'));
await pg.exec('set role studio_writer');
const port = await freePort();
const server = new PGLiteSocketServer({ db: pg, port, host: '127.0.0.1' });
await server.start();
const URL = `postgres://studio_writer@127.0.0.1:${port}/postgres`;
await promisify(execFile)('npx', ['tsx', 'scripts/seed-text.ts'], { cwd: ROOT, env: { ...process.env, STUDIO_DATABASE_URL: URL } });
const sql = postgres(URL, { prepare: false, max: 1 });
await sql`set role studio_writer`;

// No pronouns in the person's own idea and beats, so any in the replies are the coach's.
const draft: Draft = {
  title: 'The Long Wall',
  idea: 'Zei wins the match by only defending, and it costs something: Bai thinks Zei has gone soft on Deluin.',
  upTo: 14,
  beats: ['They watch the final from the overlook.', 'Bai calls Deluin a fake; Zei says nothing.', 'Zei wins by defending. Bai walks off.'],
  shots: [],
};
type Case = { stage: 'talk' | 'beats' | 'storyboard'; message: string };
const CASES: Case[] = [
  { stage: 'talk', message: 'What does Bai feel when Zei wins by only defending?' },
  { stage: 'storyboard', message: 'Is a close-up on Bai the right shot for the walk-off?' },
  { stage: 'talk', message: 'What would Mu think of how Zei played?' },
  { stage: 'talk', message: 'Should Min be at the final? What would Zei want from Min there?' },
  { stage: 'beats', message: 'Is Deluin doing enough in my beats? What does Deluin want?' },
  { stage: 'talk', message: 'I think Bai is angry because he lost face. Is that the right reading?' },
];

const spent = async () => Number((await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.coach_costs`)[0].usd);
class OverCap extends Error {}
const results: Record<string, unknown>[] = [];
let fid = 950;
for (const c of CASES) {
  const written: { text: string; slips: ReturnType<typeof pronounSlips> }[] = [];
  const guarded: Complete = async (model, messages, opts) => {
    if ((await spent()) + PER_CALL > CAP) throw new OverCap(`the next call could pass $${CAP}`);
    const r = await complete(key, model, messages, opts);
    if (model === CHAT.model) written.push({ text: r.text, slips: pronounSlips(r.text) });
    return r;
  };
  const r = await coach(
    { sql, person: fid++, complete: guarded, systemPrompt: prompt('make-coach.md'), guardPolicy: prompt('make-guard.md'), reminder: prompt('make-reminder.md'), pronounReminder: prompt('make-pronouns.md') },
    { stage: c.stage, message: c.message, draft, history: [] },
  ).catch((e) => ({ state: e instanceof OverCap ? 'stopped' : 'error', error: (e as Error).message }) as const);
  const shown = r.state === 'note' ? r.parts.map((p) => (p.type === 'text' ? p.text : `[${p.id}]`)).join('') : '';
  results.push({ ...c, state: r.state, why: r.state === 'declined' ? r.why : null, regenerated: r.state === 'note' ? r.regenerated : null, written, shown, shownSlips: shown ? pronounSlips(shown) : [], error: 'error' in r ? r.error : null });
  console.log(`${r.state}${r.state === 'note' && r.regenerated ? ' (after a retry)' : ''}${written.some((w) => w.slips.length) ? ' [slip caught]' : ''}: ${c.message}`);
  if (r.state === 'stopped') break;
}
const total = await spent();
const out = path.join(ROOT, 'docs/make-your-own');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'pronouns-live.json'), JSON.stringify({ date: new Date().toISOString(), models: { coach: CHAT.model, guard: CHAT.guardModel, route: 'Vercel AI Gateway, zero data retention' }, spent_usd: total, cap_usd: CAP, per_call_worst_usd: PER_CALL, results }, null, 1));
console.log(`spent $${total.toFixed(4)} of $${CAP}`);
await sql.end();
await server.stop();
