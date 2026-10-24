/**
 * The agent read API on a running server, with a read-only database role (owner, 2026-10-19: "before it ships, test
 * it on a running server with a read-only database role, not the production credentials").
 *   npm run test:agent-api-live      (builds first)
 * The server is `next start` on this build, with NO writer credentials: STUDIO_DATABASE_URL is unset and no .env file
 * may be present. Its only database is an in-memory Postgres (PGlite, every migration including the DRAFT 0018)
 * whose session is the role agent_reader. Checks over HTTP: the MCP handshake, every tool, the REST twin, hidden
 * versions never served, 20 a minute per caller. Checks on the role: it can't write any scene table or read wallet,
 * consent or image tables, and row security hides hidden versions from it.
 */
import path from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { failOnProtocolErrors, gatePglite } from './lib/pglite-gate';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const envFiles = ['.env', '.env.local', '.env.production', '.env.production.local'].filter((f) => existsSync(path.join(ROOT, f))); // the files next start loads
if (envFiles.length) {
  console.error(`refusing to run: ${envFiles.join(', ')} present; this test must not see any credentials`);
  process.exit(2);
}
if (!existsSync(path.join(ROOT, '.next', 'BUILD_ID'))) {
  console.error('build first: NEXT_PUBLIC_URL=https://snowmoon.party next build');
  process.exit(2);
}

const db = new PGlite({ extensions: { vector } });
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await db.exec(`insert into studio.account_names (fname, person) values ('naaate', 6786) on conflict do nothing`);
await db.exec(`insert into studio.adaptation_versions (id, adaptation_id, author_person, recipe, hidden) values (3, 1, 6786, '{"video_url": null, "ai_label": "SECRET HIDDEN"}', true)`);
// From here the only session is the read-only agent role.
await db.exec('set role agent_reader');
const who = (await db.query<{ u: string }>('select current_user as u')).rows[0].u;
check('the database session is agent_reader', who === 'agent_reader', who);
const denied = async (q: string) => db.query(q).then(() => false, (e) => /permission denied|row-level security|violates/i.test(String(e)));
check('the role cannot change a scene', (await denied(`update studio.adaptation_versions set recipe = '{}' where id = 2`)) && (await denied(`insert into studio.adaptations (owner_person, title) values (1, 'x')`)));
check('the role cannot read wallets, consents, images or remix frames', (await denied('select * from studio.wallet_payments')) && (await denied('select * from studio.contributor_consents')) && (await denied('select * from studio.elements')) && (await denied('select * from studio.remix_frames')));
check('row security hides hidden versions from the role', (await db.query('select id from studio.adaptation_versions order by id')).rows.map((r: any) => r.id).join() === '1,2');

const PORT = 54391, WEB = 3291;
failOnProtocolErrors(gatePglite(db), 'test:agent-api-live');
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', NODE_ENV: 'production', NEXT_PUBLIC_URL: 'https://snowmoon.party', AGENT_API_TEST: '1', AGENT_RATE_KEY: 'k'.repeat(40), AGENT_DATABASE_URL: `postgres://agent_reader@127.0.0.1:${PORT}/postgres` };
const next = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['start', '-p', String(WEB)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverErr = '';
next.stderr.on('data', (d) => (serverErr += d));
const BASE = `http://127.0.0.1:${WEB}`;
for (let i = 0; i < 60; i++) { if (await fetch(BASE + '/api/agent/v1/tools', { headers: { 'x-forwarded-for': '198.51.100.250' } }).then(() => true, () => false)) break; await new Promise((r) => setTimeout(r, 500)); }

try {
  let ip = 1;
  const rpc = async (method: string, params?: unknown) => {
    const r = await fetch(BASE + '/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ip}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }) });
    return { status: r.status, body: (await r.json().catch(() => null)) as any };
  };
  const call = async (name: string, args: Record<string, unknown>) => (await rpc('tools/call', { name, arguments: args })).body?.result;

  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'live', version: '0' } });
  check('MCP initialize over HTTP', init.status === 200 && init.body?.result?.protocolVersion === '2025-06-18');
  const tools = (await rpc('tools/list')).body?.result?.tools ?? [];
  check('tools/list over HTTP: 7 read-only tools', tools.length === 7 && tools.every((t: any) => t.annotations?.readOnlyHint));
  const ls = await call('list_scenes', {});
  check('list_scenes through the read-only role: versions 2 and 1, never the hidden one', JSON.stringify(ls?.structuredContent?.scenes?.[0]?.versions?.map((v: any) => v.version)) === '[2,1]' && !JSON.stringify(ls).includes('SECRET'), JSON.stringify(ls).slice(0, 300));
  check('bylines come through the role (current name)', ls?.structuredContent?.scenes?.[0]?.versions?.[0]?.by === '@naaate');
  const sh = await call('get_shot', { adaptation: 1, version: 2, shot: '11-b1-4' });
  check('get_shot over HTTP: the line, its author and the editor link', sh?.structuredContent?.lines?.[0]?.speaker === 'Zei' && sh?.structuredContent?.editor === 'https://snowmoon.party/@naaate/1/v/2/shot/11-b1-4');
  const mo = await call('get_moment', { adaptation: 1, shot: '11-b1-4' });
  check('get_moment over HTTP: versions 2 then 1', mo?.structuredContent?.versions?.map((v: any) => v.version).join() === '2,1');
  check('search_book and get_passage over HTTP', (await call('search_book', { query: 'Minpentai' }))?.structuredContent?.hits?.length > 0 && (await call('get_passage', { chapter: 14, from: 1, to: 3 }))?.structuredContent?.blocks?.length > 0);
  check('get_recipe over HTTP names the closed model', (await call('get_recipe', { adaptation: 1, version: 2, shot: '11-b1-4' }))?.structuredContent?.recipe?.chain?.[0]?.model?.closed === true);
  check('a hidden version is refused over HTTP', (await call('get_scene', { adaptation: 1, version: 3 }))?.isError === true);
  ip = 2;
  const rest = await fetch(BASE + '/api/agent/v1/get_scene?adaptation=1&version=2', { headers: { 'x-forwarded-for': '198.51.100.2' } });
  const rj = (await rest.json()) as any;
  check('REST over HTTP: get_scene, 85 shots, open to any origin', rest.ok && rj.shots?.length === 85 && rest.headers.get('access-control-allow-origin') === '*');
  ip = 3;
  let last = 0;
  for (let i = 0; i < 21; i++) last = (await fetch(BASE + '/api/agent/v1/list_scenes', { headers: { 'x-forwarded-for': '198.51.100.3' } })).status;
  check('the 21st request in a minute from one caller is refused (429)', last === 429);
  const rows = (await db.query<{ caller: string }>('select caller from studio.api_rate')).rows;
  check('the counter holds hashes, never an address', rows.length > 0 && rows.every((r) => /^[0-9a-f]{32}$/.test(r.caller)) && !JSON.stringify(rows).includes('198.51.100'));
  check('the server logged no database permission error', !/permission denied|row-level security/i.test(serverErr), serverErr.slice(0, 300));
} finally {
  next.kill();
  await server.stop();
  await db.close();
}
if (failures.length) {
  console.error(`AGENT API LIVE TESTS FAILED (${failures.length}, ${passed} passed):\n- ${failures.join('\n- ')}`);
  if (serverErr) console.error('server stderr:\n' + serverErr.slice(0, 2000));
  process.exit(1);
}
console.log(`test:agent-api-live: all ${passed} checks pass (a running server; the database role agent_reader; no writer credentials)`);
