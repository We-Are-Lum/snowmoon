/**
 * Image making for everyone (owner, 2026-10-09): the Neynar gate, the caps, and report alerts.
 * Fails (exit 1) on any problem.
 *
 *   npm run test:images-gate
 *
 * No call leaves the machine. Runs every migration in an in-memory Postgres (PGlite), talks to it
 * as studio_writer, and stands a local HTTP server in for Neynar and for ntfy. Checks:
 * - The gate: a score of 0.7 or more passes; 0.69 is refused with the score shown; Neynar down,
 *   answering 500, too slow, no key, or no score in its answer: refused, nothing kept and nothing
 *   counted. Invited FIDs skip the lookup (the stand-in hears nothing). The lookup carries only
 *   the FID. A second Generate within a day asks again only after the day is over.
 * - The launch order: outside the invited list, refused until the legal pages are built and the
 *   alert is set.
 * - The generate route refuses at the gate before it counts, reserves or calls a model.
 * - The caps: no all-days cap; $2 a day across everyone; 10 Generates and 3 publishes per person.
 * - Alerts: a planted report sends exactly one push, "Snowmoon: 1 reports waiting", with nothing
 *   else in it; a second within the hour sends none; after the hour a hide sends one with the new
 *   count; with SNOWMOON_ALERT_URL unset nothing is sent, and nothing throws.
 */
import path from 'node:path';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { IMAGES } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));

// --- Stand-ins for Neynar and ntfy ------------------------------------------------
type Heard = { method: string; url: string; headers: IncomingHttpHeaders; body: string };
let heard: Heard[] = [];
/** How the Neynar stand-in answers, per FID. */
let neynar: (fid: number) => { status: number; body: unknown; delayMs?: number } = () => ({ status: 500, body: {} });
let ntfyStatus = 200;
const stub = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    heard.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
    if (req.url?.startsWith('/neynar/')) {
      const fid = Number(new URL(req.url, 'http://x').searchParams.get('fids'));
      const a = neynar(fid);
      setTimeout(() => {
        if (res.destroyed) return;
        res.writeHead(a.status, { 'content-type': 'application/json' }).end(JSON.stringify(a.body));
      }, a.delayMs ?? 0);
    } else res.writeHead(ntfyStatus).end('{}');
  });
});
await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
const STUB = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
const user = (fid: number, score: number) => ({ status: 200, body: { users: [{ fid, username: 'x', score, experimental: { neynar_user_score: score } }] } });
const toNeynar = () => heard.filter((h) => h.url.startsWith('/neynar/'));
const toNtfy = () => heard.filter((h) => h.url.startsWith('/ntfy/'));

// Headers Node's fetch adds by itself; anything beyond these (and the key) would be ours.
const DEFAULT_HEADERS = ['host', 'connection', 'accept', 'accept-language', 'sec-fetch-mode', 'user-agent', 'accept-encoding'];

// --- The database -------------------------------------------------------------------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
}
const PORT = 54333;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
await sql`set role studio_writer`;
type Sql = Parameters<typeof import('../src/lib/images/limits').reserve>[0];
const S = sql as unknown as Sql;

const { NEYNAR } = await import('../src/lib/images/neynar');
const { mayGenerate, GATE_WORDING } = await import('../src/lib/images/gate');
const { keptValue } = await import('../src/lib/images/neynar');
const { reserve, settle, generationsLeft, publishesLeft } = await import('../src/lib/images/limits');
const { alertReports, alertBody, reportsWaiting } = await import('../src/lib/images/alert');

NEYNAR.url = `${STUB}/neynar/v2/farcaster/user/bulk`;
NEYNAR.timeoutMs = 400;
process.env.NEYNAR_API_KEY = 'test-neynar-key';
process.env.SNOWMOON_ALERT_URL = `${STUB}/ntfy/snowmoon-test`;
process.env.APP_LEGAL_PAGES = 'terms+privacy';
const quiet = console.error;
console.error = () => {};

const counted = async (fid: number) => {
  const [r] = await sql`select (select count(*)::int from studio.image_asks where fid = ${fid}) as asks,
    (select count(*)::int from studio.image_costs where kind = 'reserved' and calls <> 0) as reserved`;
  return r;
};
const kept = async (fid: number) => (await sql`select count(*)::int as n from studio.image_scores where fid = ${fid}`)[0].n;

/** What the generate route does with the gate: refuse first, or count and reserve. */
async function attempt(fid: number) {
  const g = await mayGenerate(S, fid);
  if (!g.ok) return g;
  const r = await reserve(S, fid);
  if (r.ok) await settle(S, {});
  return { ok: true as const, reserved: r.ok };
}

// --- The gate ------------------------------------------------------------------------
neynar = (fid) => (fid === 100 ? user(100, 0.85) : fid === 101 ? user(101, 0.69) : fid === 103 ? user(103, 0.7) : { status: 500, body: {} });

heard = [];
const pass = await attempt(100);
check('a score of 0.85 passes', pass.ok === true, JSON.stringify(pass));
const asked = toNeynar();
check('one lookup for a first Generate', asked.length === 1, String(asked.length));
if (asked[0]) {
  check('the lookup asks for the FID and nothing else', asked[0].url === '/neynar/v2/farcaster/user/bulk?fids=100', asked[0].url);
  check('the lookup is a GET with no body', asked[0].method === 'GET' && asked[0].body === '');
  check('the lookup carries the key', asked[0].headers['x-api-key'] === 'test-neynar-key');
  const extra = Object.keys(asked[0].headers).filter((h) => h !== 'x-api-key' && !DEFAULT_HEADERS.includes(h));
  check('the lookup carries no other header (no cookie, no token, no name)', extra.length === 0, extra.join(', '));
  check('the lookup sends no cookie or authorization', !asked[0].headers.cookie && !asked[0].headers.authorization);
}
check('the value is kept for a day', (await kept(100)) === 1);

heard = [];
await attempt(100);
check('a second Generate within a day does not ask Neynar again', toNeynar().length === 0, String(toNeynar().length));
await pg.exec(`update studio.image_scores set fetched_at = now() - interval '25 hours' where fid = 100`);
await pg.exec(`insert into studio.image_scores (fid, score, fetched_at) values (555, 0.9, now() - interval '2 days')`);
heard = [];
await attempt(100);
check('after a day it asks again', toNeynar().length === 1, String(toNeynar().length));
check('rows older than a day are deleted', (await kept(555)) === 0);

heard = [];
check('exactly 0.7 passes', (await attempt(103)).ok === true);

const before101 = await counted(101);
const low = await mayGenerate(S, 101);
check('0.69 is refused with 403', !low.ok && low.status === 403 && low.reason === 'score', JSON.stringify(low));
if (!low.ok) {
  check('the refusal says the score and the threshold', low.error === GATE_WORDING.below(0.69) && low.error.includes('Yours is 0.69') && low.error.includes('0.7 or more'), low.error);
  check('the refusal says everything else still works', /Reading, listening, saving cards and everything else still work/.test(low.error));
}
const low2 = await attempt(101);
const after101 = await counted(101);
check('a refused score counts nothing', !low2.ok && after101.asks === 0 && after101.reserved === before101.reserved, JSON.stringify(after101));
check('the status can show a kept low score without asking Neynar', await (async () => { heard = []; const v = await keptValue(S, 101); return v !== null && Math.abs(v - 0.69) < 1e-9 && toNeynar().length === 0; })());
check('a score just under is never shown as 0.70', GATE_WORDING.below(0.6999).includes('Yours is 0.69'));

// Every way Neynar can fail: refused, nothing kept, nothing counted.
const failing: [string, () => void, () => void][] = [
  ['answers 500', () => (neynar = () => ({ status: 500, body: {} })), () => {}],
  ['is too slow', () => (neynar = (f) => ({ ...user(f, 0.9), delayMs: 1500 })), () => {}],
  ['has no score in its answer', () => (neynar = (f) => ({ status: 200, body: { users: [{ fid: f, username: 'x' }] } })), () => {}],
  ['answers with no user', () => (neynar = () => ({ status: 200, body: { users: [] } })), () => {}],
  ['answers for another FID', () => (neynar = () => user(1, 0.9)), () => {}],
  ['is down', () => (NEYNAR.url = 'http://127.0.0.1:9/neynar/v2/farcaster/user/bulk'), () => (NEYNAR.url = `${STUB}/neynar/v2/farcaster/user/bulk`)],
  ['has no key here', () => delete process.env.NEYNAR_API_KEY, () => (process.env.NEYNAR_API_KEY = 'test-neynar-key')],
];
for (const [what, set, unset] of failing) {
  set();
  heard = [];
  const r = await attempt(102);
  const c = await counted(102);
  check(`Neynar ${what}: refused with 503`, !r.ok && r.status === 503 && r.reason === 'unreachable', JSON.stringify(r));
  if (!r.ok) check(`Neynar ${what}: says it can't be reached`, r.error === GATE_WORDING.unreachable);
  check(`Neynar ${what}: nothing kept`, (await kept(102)) === 0);
  check(`Neynar ${what}: nothing counted or reserved`, c.asks === 0 && c.reserved === 0, JSON.stringify(c));
  if (what === 'has no key here') check('with no key, nothing is sent', toNeynar().length === 0);
  unset();
}
await new Promise((r) => setTimeout(r, 1200)); // let the slow answer finish
check(GATE_WORDING.unreachable.slice(0, 40), /Neynar, which scores Farcaster accounts, can’t be reached/.test(GATE_WORDING.unreachable));

// Invited FIDs skip the lookup.
neynar = () => user(6786, 0.1);
heard = [];
const inv = await attempt(IMAGES.invited[0]);
check('an invited FID passes without a lookup', inv.ok === true && toNeynar().length === 0, `${JSON.stringify(inv)} ${toNeynar().length}`);
check('an invited FID gets no kept row', (await kept(IMAGES.invited[0])) === 0);

// The launch order.
neynar = (f) => user(f, 0.95);
for (const [what, name, value] of [['the alert is not set', 'SNOWMOON_ALERT_URL', process.env.SNOWMOON_ALERT_URL], ['the legal pages are not built', 'APP_LEGAL_PAGES', 'terms+privacy']] as const) {
  delete process.env[name];
  heard = [];
  const r = await attempt(104);
  check(`while ${what}: refused with 503`, !r.ok && r.status === 503 && r.reason === 'not-open', JSON.stringify(r));
  check(`while ${what}: Neynar is not asked`, toNeynar().length === 0);
  check(`while ${what}: nothing counted`, (await counted(104)).asks === 0);
  check(`while ${what}: an invited FID still passes`, (await mayGenerate(S, IMAGES.invited[0])).ok === true);
  process.env[name] = value;
}
process.env.APP_LEGAL_PAGES = 'missing';
check('a build without the pages refuses', !(await mayGenerate(S, 104)).ok);
process.env.APP_LEGAL_PAGES = 'terms+privacy';

// The route refuses at the gate before counting, reserving or calling a model.
{
  const src = readFileSync(path.join(ROOT, 'src/app/api/images/generate/route.ts'), 'utf8');
  const at = (s: string) => src.indexOf(s);
  check('the generate route calls the gate', at('await mayGenerate(') > 0);
  check('the gate comes before the count and the reservation', at('await mayGenerate(') < at('await reserve('));
  check('the gate comes before the prompt check and the image model', at('await mayGenerate(') < at('checkPrompt(userPrompt') && at('await mayGenerate(') < at('makeImage(prompt)'));
  check('the gate\'s refusal is returned at once', /if \(!gate\.ok\) return no\(gate\.error, gate\.status/.test(src));
  check('no invited-only refusal is left', !/invited readers only/.test(src));
  const nx = readFileSync(path.join(ROOT, 'next.config.ts'), 'utf8');
  check('next.config.ts derives APP_LEGAL_PAGES from both page files', /APP_LEGAL_PAGES: legalPages\(\)/.test(nx) && /has\('terms'\) && has\('privacy'\)/.test(nx));
}

// --- The caps -------------------------------------------------------------------------
check('no all-days cap in the settings', !('totalSpendCapUsd' in IMAGES));
await pg.exec(`insert into studio.image_costs (day, kind, model, provider, verdict, calls, cost_usd) values ((now() at time zone 'utc')::date - 3, 'image', 'old', 'fal.ai', 'ok', 1, 50)`);
const old = await reserve(S, 200);
check('spending on earlier days does not stop a Generate', old.ok, JSON.stringify(old));
if (old.ok) await settle(S, {});
for (let i = 0; i < IMAGES.generationsPerDay - 1; i++) {
  const r = await reserve(S, 200);
  if (r.ok) await settle(S, {});
}
const eleventh = await reserve(S, 200);
check('10 Generates a day per person, then refused', (await generationsLeft(S, 200)) === 0 && !eleventh.ok && eleventh.refusal === 'limit', JSON.stringify(eleventh));
await sql`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`;
for (let i = 0; i < IMAGES.publishesPerDay; i++) await sql`insert into studio.elements (work_id, element_type, created_by_fid) values ('snowmoon', 'image', 201)`;
check('3 publishes a day per person', (await publishesLeft(S, 201)) === 0 && (await publishesLeft(S, 202)) === IMAGES.publishesPerDay);
const [spentToday] = await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where day = (now() at time zone 'utc')::date`;
await sql`insert into studio.image_costs (kind, model, provider, verdict, calls, cost_usd) values ('image', 'today', 'fal.ai', 'ok', 1, ${IMAGES.dailySpendCapUsd - spentToday.usd - IMAGES.reserveUsd / 2})`;
const capped = await reserve(S, 203);
check('$2 a day across everyone, then refused', !capped.ok && capped.refusal === 'spend', JSON.stringify(capped));
check('the daily cap is $2', IMAGES.dailySpendCapUsd === 2 && IMAGES.generationsPerDay === 10 && IMAGES.publishesPerDay === 3 && IMAGES.label === 'Trial');

// --- Report alerts ----------------------------------------------------------------------
const el = async (by: number) => (await sql`insert into studio.elements (work_id, element_type, created_by_fid, status) values ('snowmoon', 'image', ${by}, 'published') returning id`)[0].id as string;
const log = (element_id: string, step: string, by_fid: number, role: string, reason: string | null = null, note: string | null = null) =>
  sql`insert into studio.removal_log ${sql({ element_id, step, by_fid, role, reason, note })}`;
const A = await el(777001), B = await el(777002), C = await el(777003);
const REPORTER = 424242;

check('nothing waiting at first', (await reportsWaiting(S)) === 0);
heard = [];
check('with nothing waiting, nothing is sent', (await alertReports(S)) === 'none-waiting' && toNtfy().length === 0);

await log(A, 'reported', REPORTER, 'reader', 'spam', 'a private note about the prompt');
heard = [];
const first = await alertReports(S);
const pushes = toNtfy();
check('a planted report sends one push', first === 'sent' && pushes.length === 1, `${first} ${pushes.length}`);
if (pushes[0]) {
  check('the push says only "Snowmoon: 1 reports waiting"', pushes[0].body === 'Snowmoon: 1 reports waiting', pushes[0].body);
  check('the push is a POST', pushes[0].method === 'POST');
  const extra = Object.keys(pushes[0].headers).filter((h) => !['content-type', 'content-length', ...DEFAULT_HEADERS].includes(h));
  check('the push has no header but Content-Type (no title, tags or click link)', extra.length === 0 && pushes[0].headers['content-type'] === 'text/plain', extra.join(', '));
  const b = pushes[0].body + JSON.stringify(pushes[0].headers);
  check('the push carries no FID, image id, reason, note or link', ![String(REPORTER), '777001', A, 'spam', 'note', 'http', 'image'].some((x) => b.includes(x)), b);
}
check('the body has the owner\'s exact form', alertBody(3) === 'Snowmoon: 3 reports waiting');

await log(B, 'reported', REPORTER + 1, 'reader', 'other');
heard = [];
check('a second report within the hour sends none', (await alertReports(S)) === 'too-soon' && toNtfy().length === 0);

// Two servers at once: only one may send.
await pg.exec(`update studio.alert_state set sent_at = now() - interval '61 minutes'`);
heard = [];
const sql2 = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
const both = await Promise.all([alertReports(S), alertReports(sql2 as unknown as Sql)]);
check('two servers at once send one push', toNtfy().length === 1 && both.filter((x) => x === 'sent').length === 1, `${both} ${toNtfy().length}`);
await sql2.end();

// After the hour, a hide sends one, with the new count.
await pg.exec(`update studio.alert_state set sent_at = now() - interval '61 minutes'`);
await sql`update studio.elements set status = 'hidden' where id = ${C}`;
await log(C, 'hidden', 777003, 'author');
await log(A, 'reported', REPORTER + 2, 'reader', 'violence');
heard = [];
const hid = await alertReports(S);
check('after the hour, a hide sends one push with the new count', hid === 'sent' && toNtfy().length === 1 && toNtfy()[0].body === 'Snowmoon: 3 reports waiting', `${hid} ${toNtfy()[0]?.body}`);

// What "waiting" means: a dismissal clears an image's reports; a rule-hide stays until a moderator looks.
await log(A, 'dismissed', 6786, 'moderator');
check('a dismissal clears that image\'s reports', (await reportsWaiting(S)) === 1);
const D = await el(777004);
await log(D, 'reported', REPORTER, 'reader', 'minor');
await log(D, 'hidden', 0, 'rule', 'minor', 'one "minor" report');
check('a rule-hide still waits for a moderator', (await reportsWaiting(S)) === 2);
await log(D, 'hidden', 6786, 'moderator');
check('a moderator\'s hide takes it off the list', (await reportsWaiting(S)) === 1);

// ntfy failing: nothing throws, and the hour is given back.
await pg.exec(`update studio.alert_state set sent_at = now() - interval '61 minutes'`);
ntfyStatus = 500;
check('a failing push does not throw', (await alertReports(S)) === 'failed');
ntfyStatus = 200;
heard = [];
check('after a failed push the next one goes out', (await alertReports(S)) === 'sent' && toNtfy().length === 1);

// Unset: nothing sent, nothing thrown; the report itself was stored.
await pg.exec(`update studio.alert_state set sent_at = now() - interval '61 minutes'`);
delete process.env.SNOWMOON_ALERT_URL;
const E = await el(777005);
await log(E, 'reported', REPORTER, 'reader', 'spam');
heard = [];
check('with SNOWMOON_ALERT_URL unset nothing is sent', (await alertReports(S)) === 'unset' && toNtfy().length === 0);
check('the report is stored all the same', (await sql`select count(*)::int as n from studio.removal_log where element_id = ${E} and step = 'reported'`)[0].n === 1);
process.env.SNOWMOON_ALERT_URL = `${STUB}/ntfy/snowmoon-test`;
{
  const broken = postgres('postgres://nobody@127.0.0.1:9/none', { max: 1, connect_timeout: 1 });
  check('a database failure does not throw', (await alertReports(broken as unknown as Sql)) === 'failed');
  await broken.end({ timeout: 0 });
}
for (const f of ['src/app/api/images/[id]/report/route.ts', 'src/app/api/images/[id]/hide/route.ts']) {
  const src = readFileSync(path.join(ROOT, f), 'utf8');
  check(`${f} sends the alert after the answer, never failing it`, /after\(\(\) => alertReports\(sql\)\.then\(\(\) => undefined, \(\) => undefined\)\)/.test(src));
}

// --- Private, as the other per-person tables -------------------------------------------------
await sql.end();
for (const role of ['anon', 'authenticated']) {
  for (const t of ['image_scores', 'alert_state']) {
    await pg.exec(`set role ${role}`);
    try {
      await pg.query(`select count(*) from studio.${t}`);
      failures.push(`${role} can read studio.${t}`);
    } catch {
      passed++;
    }
    await pg.exec('reset role');
  }
}
await pg.exec('set role studio_writer');
try {
  await pg.exec('delete from studio.alert_state');
  failures.push('studio_writer can delete from alert_state');
} catch {
  passed++;
}
await pg.exec('reset role');
await server.stop();
stub.close();
console.error = quiet;

if (failures.length) {
  console.error(`\nIMAGE GATE TESTS FAILED (${failures.length}, ${passed} passed):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`image gate tests passed: ${passed} checks (Neynar gate, launch order, caps, report alerts, privacy)`);
process.exit(0);
