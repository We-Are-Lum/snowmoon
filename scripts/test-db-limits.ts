/**
 * The database connection's time limits (owner, 2026-10-30: "time limits and keepalive on every connection … so a
 * dropped connection fails fast and reconnects instead of hanging"; src/lib/db.ts). A local Postgres (PGlite) sits
 * behind a small proxy that this test can freeze: it keeps the connection open but passes nothing back, as a dropped
 * network connection does. With the query limit set to 3 s for the test (DB_SILENT_MS):
 *  L1  a query answers normally;
 *  L2  a query on a frozen connection fails within the limit instead of hanging, and the server log says why;
 *  L3  the next query, sent at once (as the next request would be), opens a new connection and answers;
 *  L4  a slow query that keeps under the limit still answers;
 *  L5  every connection the site opens uses these options (db() and the agent reader), with keepalive, idle,
 *      connect and lifetime limits set, six connections per instance and one query at a time on each (a query that
 *      waited for the only connection was often never answered through the pooler; see src/lib/db.ts).
 */
import net from 'node:net';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

process.env.DB_SILENT_MS = '3000';
const ROOT = path.resolve(import.meta.dirname, '..');
let passed = 0;
const failed: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failed.push(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` (${detail})` : ''}`);
};

const pg = new PGlite();
const srv = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
await srv.start();
const pgPort = (srv as unknown as { port: number }).port;

// The proxy: forwards both ways until frozen; frozen, it swallows everything and answers nothing.
let frozen = false;
const proxy = net.createServer((client) => {
  const up = net.connect({ host: '127.0.0.1', port: pgPort });
  client.on('data', (b) => !frozen && up.write(b));
  up.on('data', (b) => !frozen && client.write(b));
  const end = () => (client.destroy(), up.destroy());
  client.on('close', end);
  up.on('close', end);
  client.on('error', end);
  up.on('error', end);
});
await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
const proxyPort = (proxy.address() as net.AddressInfo).port;
process.env.STUDIO_DATABASE_URL = `postgres://postgres@127.0.0.1:${proxyPort}/postgres`;

const { db, dbOptions, DB_LIMITS } = await import('../src/lib/db');
const sql = db()!;
const keep = setInterval(() => {}, 1000); // a server process is never idle; neither is this test

const [one] = await sql`select 1 as n`;
check('L1 a query answers normally', one?.n === 1);

frozen = true;
const t = Date.now();
let err = '';
const logged: string[] = [];
const origError = console.error;
console.error = (...a: unknown[]) => (logged.push(a.join(' ')), undefined);
try {
  await sql`select 2 as n`;
} catch (e) {
  err = `${(e as { code?: string }).code ?? ''} ${(e as Error).message}`;
}
console.error = origError;
const took = Date.now() - t;
check('L2 a query on a frozen connection fails within the limit, and the server log says why', /CONNECTION_CLOSED/.test(err) && logged.some((l) => /silent for 3 s/.test(l)) && took < 3000 + 1500, `${took} ms, "${err}", log: ${logged.join(' | ')}`);

frozen = false;
// At once, as the next request to a server would: no pause to let the old connection finish closing.
const t2 = Date.now();
const again = await Promise.race([sql`select 3 as n`.then((r) => r[0]?.n), new Promise((r) => setTimeout(() => r('no answer'), 10000))]);
check('L3 the next query opens a new connection and answers', again === 3, `${again} after ${Date.now() - t2} ms`);

const [slow] = await sql`select pg_sleep(1), 4 as n`;
check('L4 a slow query under the limit still answers', slow?.n === 4);

const o = dbOptions('postgres://studio_writer@pooler.example.com:6543/postgres') as Record<string, unknown>;
const local = dbOptions('postgres://postgres@127.0.0.1:5432/postgres') as Record<string, unknown>;
const src = readFileSync(path.join(ROOT, 'src/lib/db.ts'), 'utf8');
const calls = [...src.matchAll(/postgres\(url, (\w+\(url\))\)/g)].map((m) => m[1]);
check(
  'L5 every connection uses the limits: keepalive, idle, connect, lifetime, the silent-socket limit, six connections (one for a local test database), one query at a time on each',
  calls.length === 2 && calls.every((c) => c === 'dbOptions(url)') && o.keep_alive === DB_LIMITS.keepAliveSeconds && o.idle_timeout === DB_LIMITS.idleSeconds && o.connect_timeout === DB_LIMITS.connectSeconds && o.max_lifetime === DB_LIMITS.lifetimeSeconds && typeof o.socket === 'function' && o.max === 6 && local.max === 1 && o.max_pipeline === 1,
  JSON.stringify({ calls, keep_alive: o.keep_alive, idle: o.idle_timeout, connect: o.connect_timeout, life: o.max_lifetime }),
);

clearInterval(keep);
await sql.end({ timeout: 1 });
proxy.close();
await srv.stop();
if (failed.length) {
  console.error(`\nDB LIMITS TEST FAILED (${failed.length}):\n- ${failed.join('\n- ')}`);
  process.exit(1);
}
console.log(`test:db-limits: all ${passed} checks pass`);
process.exit(0);
