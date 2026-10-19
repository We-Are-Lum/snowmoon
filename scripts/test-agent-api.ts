/**
 * The agent read API (owner, 2026-10-19), as MCP (/api/mcp) and as REST (/api/agent/v1/<tool>), against an in-memory
 * Postgres (PGlite, every migration including the DRAFT 0018).
 *   npm run test:agent-api
 * Checks: switched off answers nothing; the MCP handshake, tool list and every tool; bad arguments are the tool's own
 * errors; hidden versions are never served; the REST twin; 20 a minute per caller, counted under a daily-keyed hash
 * and never the address; nothing but the rate counter is written.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { failOnProtocolErrors, gatePglite } from './lib/pglite-gate';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));

process.env.IMAGES_TICKET_SECRET = 'x'.repeat(48);
process.env.NEXT_PUBLIC_URL = 'https://snowmoon.party';
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await db.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await db.exec(`insert into studio.account_names (fname, person) values ('naaate', 6786) on conflict do nothing`);
// A hidden version that must never be served.
await db.exec(`insert into studio.adaptation_versions (id, adaptation_id, author_person, recipe, hidden) values (3, 1, 6786, '{"video_url": null, "ai_label": "SECRET HIDDEN"}', true)`);
await db.exec('set role studio_writer');
const PORT = 54381;
failOnProtocolErrors(gatePglite(db), 'test:agent-api');
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
process.env.STUDIO_DATABASE_URL = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;
process.env.AGENT_DATABASE_URL = process.env.STUDIO_DATABASE_URL;
// PGlite's socket takes one connection: the test reads through the agent connection too (the session is studio_writer here).
const { db: siteDb, asAgentReader } = await import('../src/lib/db');
const S = (await asAgentReader(async () => siteDb()))!;

const counts = async () => {
  const t = await S<{ table_name: string }[]>`select table_name from information_schema.tables where table_schema = 'studio' and table_type = 'BASE TABLE' and table_name <> 'api_rate' order by 1`;
  const out: Record<string, number> = {};
  for (const { table_name } of t) out[table_name] = Number((await S.unsafe(`select count(*)::int as n from studio."${table_name}"`))[0].n);
  return out;
};
const before = await counts();

const { POST: MCP } = await import('../src/app/api/mcp/route');
const { GET: REST } = await import('../src/app/api/agent/v1/[tool]/route');
let ip = 1;
const from = () => `203.0.113.${ip}`;
const rpc = async (method: string, params?: unknown, id: number | null = 1) => {
  const res = await MCP(new Request('https://snowmoon.party/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': from() }, body: JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, ...(params ? { params } : {}) }) }));
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body };
};
const call = async (name: string, args: Record<string, unknown>) => (await rpc('tools/call', { name, arguments: args })).body?.result;
const rest = async (tool: string, q = '') => REST(new Request(`https://snowmoon.party/api/agent/v1/${tool}${q}`, { headers: { 'x-forwarded-for': from() } }), { params: Promise.resolve({ tool }) });

delete process.env.AGENT_API_TEST;
check('switched off (AGENT_API.enabled false): nothing is answered', (await rpc('initialize')).status === 404 && (await rest('tools')).status === 404);
process.env.AGENT_API_TEST = '1';

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
check('initialize answers the protocol, the server and its instructions', init.body?.result?.protocolVersion === '2025-06-18' && init.body?.result?.capabilities?.tools && /read-only/i.test(init.body?.result?.instructions ?? '') && /not affiliated/i.test(init.body?.result?.instructions ?? ''));
check('an unknown protocol version gets the newest', (await rpc('initialize', { protocolVersion: '1999-01-01' })).body?.result?.protocolVersion === '2025-06-18');
check('a notification gets no answer (202)', (await rpc('notifications/initialized', undefined, null)).status === 202);
const list = (await rpc('tools/list')).body?.result?.tools ?? [];
const names = list.map((t: any) => t.name).sort().join(',');
check('tools/list: the seven read tools, each with a schema, all read only', names === 'get_moment,get_passage,get_recipe,get_scene,get_shot,list_scenes,search_book' && list.every((t: any) => t.inputSchema?.type === 'object' && t.annotations?.readOnlyHint === true), names);

const sb = await call('search_book', { query: 'Minpentai', limit: 3 });
check('search_book: hits with block ids and links, the book and its licence', !sb.isError && sb.structuredContent.hits.length === 3 && /^c\d+-b\d+$/.test(sb.structuredContent.hits[0].block_id) && sb.structuredContent.book.licence === 'GPL-3.0', JSON.stringify(sb).slice(0, 200));
const gp = await call('get_passage', { chapter: 14, from: 1, to: 5 });
check('get_passage: the blocks asked for, plain text with ids', !gp.isError && gp.structuredContent.blocks.length >= 1 && gp.structuredContent.blocks.every((b: any) => /^c14-b[1-5]$/.test(b.id) && typeof b.text === 'string'));
check('get_passage: more than 40 blocks is refused as the tool\'s own error', (await call('get_passage', { chapter: 14, from: 0, to: 500 })).isError === true);
const ls = await call('list_scenes', {});
const v = ls.structuredContent.scenes.find((s: any) => s.adaptation === 1)?.versions.map((x: any) => x.version) ?? [];
check('list_scenes: Fifteen Days with versions 2 and 1, never the hidden one', JSON.stringify(v) === '[2,1]' && !JSON.stringify(ls).includes('SECRET HIDDEN'), JSON.stringify(v));
check('list_scenes: each version names a closed model when it has one', ls.structuredContent.scenes[0].versions[0].closed_model?.closed === true && ls.structuredContent.scenes[0].versions[1].closed_model === null);
const gs = await call('get_scene', { adaptation: 1, version: 2 });
check('get_scene: version 2 and its 85 shots in order', !gs.isError && gs.structuredContent.shots.length === 85 && gs.structuredContent.shots[0].n === 1 && /closed model/i.test(gs.structuredContent.ai_label ?? ''));
check('get_scene: a hidden version is not served', (await call('get_scene', { adaptation: 1, version: 3 })).isError === true);
const sh = await call('get_shot', { adaptation: 1, version: 2, shot: '11-b1-4' });
check("get_shot: camera, people, the line with whose words it is and its voice's label", !sh.isError && sh.structuredContent.camera && sh.structuredContent.lines[0].speaker === 'Zei' && sh.structuredContent.lines[0].by.kind === 'person' && /AI-converted/.test(sh.structuredContent.lines[0].voice?.label ?? '') && sh.structuredContent.editor === 'https://snowmoon.party/@naaate/1/v/2/shot/11-b1-4');
const rc = await call('get_recipe', { adaptation: 1, version: 2, shot: '11-b1-4' });
check('get_recipe: the prompt and the model, named closed with its maker', !rc.isError && typeof rc.structuredContent.recipe.prompt === 'string' && rc.structuredContent.recipe.chain?.[0]?.model?.closed === true && rc.structuredContent.recipe.chain[0].model.maker === 'OpenAI');
const mo = await call('get_moment', { adaptation: 1, shot: '11-b1-4' });
check('get_moment: versions 2 then 1, each with its own frame and label', !mo.isError && mo.structuredContent.versions.map((x: any) => x.version).join() === '2,1' && mo.structuredContent.versions[0].frame.includes('/editor/1/v2/') && mo.structuredContent.versions[1].frame.includes('/editor/1/v1/'));
check('a bad argument is the tool\'s own error (the agent can correct it)', (await call('get_shot', { adaptation: 'x', version: 2, shot: '11-b1-4' })).isError === true && (await call('get_shot', { adaptation: 1, version: 2, shot: '../etc' })).isError === true && (await call('list_scenes', { extra: 1 })).isError === true);
const unknown = await rpc('tools/call', { name: 'publish_note', arguments: {} });
check('an unknown tool (there is no write tool) is refused', unknown.body?.error?.code === -32602);
check('an unknown method is refused', (await rpc('resources/list')).body?.error?.code === -32601);

ip = 2;
const rt = await rest('tools');
check('REST: the same tools listed', rt.ok && ((await rt.json()) as any).tools.length === 7);
const rs = await rest('get_shot', '?adaptation=1&version=2&shot=11-b1-4');
check('REST: get_shot answers the same shot', rs.ok && ((await rs.json()) as any).shot === '11-b1-4');
check('REST: a bad argument is 400, an unknown tool 404', (await rest('get_shot', '?adaptation=1&version=2&shot=nope')).status === 400 && (await rest('write_line')).status === 404);

ip = 3;
let last = 0;
for (let i = 0; i < 21; i++) last = (await rest('list_scenes')).status;
const mcpOver = await rpc('ping');
check('21 requests in a minute from one caller: the 21st is refused (429), MCP too', last === 429 && mcpOver.status === 429 && mcpOver.body?.error?.code === -32000);
ip = 4;
check('another caller is not affected', (await rest('list_scenes')).ok);
const rows = await S<{ caller: string }[]>`select caller from studio.api_rate`;
check('the counter keeps a 32-hex hash per caller, never the address', rows.length >= 4 && rows.every((r) => /^[0-9a-f]{32}$/.test(r.caller)) && !JSON.stringify(rows).includes('203.0.113'));
const after = await counts();
check('nothing but the rate counter is written', JSON.stringify(after) === JSON.stringify(before), JSON.stringify(Object.entries(after).filter(([k, n]) => before[k] !== n)));

await S.end({ timeout: 1 });
await server.stop();
await db.close();
if (failures.length) {
  console.error(`AGENT API TESTS FAILED (${failures.length}, ${passed} passed):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`test:agent-api: all ${passed} checks pass`);
