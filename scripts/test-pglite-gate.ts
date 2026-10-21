/**
 * The test database's one session, interleaved (2026-10-19, docs/db-interleave.md): proves the fault and the gate.
 *   npm run test:pglite-gate
 * A postgres.js client (prepare: false, as the site's) runs `select $1::int as v` through pglite-socket while this
 * script queries PGlite directly with `select $1::int + 1000000 as v`. Same parameter type (int), so a Bind landing
 * on the wrong unnamed statement is NOT refused: the site silently reads value + 1000000.
 *  1. Without the gate: counts silent wrong reads and protocol errors (expected: some, else the probe proves nothing).
 *  2. With scripts/lib/pglite-gate.ts: both must be 0 over the same work.
 *  3. The site's client alone (as production: its own session), many overlapping queries of two shapes with the
 *     same parameter type, inside and outside transactions: every value must come back as sent.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { gatePglite } from './lib/pglite-gate';

async function round(gated: boolean, n = 400) {
  const pg = new PGlite();
  const gate = gated ? gatePglite(pg) : null;
  const srv = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
  await srv.start();
  const site = postgres(`postgres://postgres@127.0.0.1:${(srv as unknown as { port: number }).port}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
  let wrong = 0, errors = 0, ok = 0;
  const siteWork = (async () => {
    for (let i = 0; i < n; i++) {
      // A fresh query text each time, so postgres.js describes first (Parse+Describe+Flush, then Bind+Execute+Sync).
      await site.unsafe(`select $1::int as v /* ${i} */`, [i]).then(
        (r) => (r[0].v === i ? ok++ : wrong++),
        () => errors++,
      );
    }
  })();
  const testWork = (async () => {
    for (let i = 0; i < n; i++) {
      await pg.query('select $1::int + 1000000 as v', [i]).catch(() => {});
      await new Promise((r) => setImmediate(r));
    }
  })();
  await Promise.all([siteWork, testWork]);
  await site.end({ timeout: 1 });
  await srv.stop();
  await pg.close();
  return { ok, wrong, errors, protocolErrors: gate?.protocolErrors().length ?? null, waits: gate?.waits() ?? null };
}

async function siteAlone(n = 600) {
  const pg = new PGlite();
  const srv = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1' });
  await srv.start();
  const site = postgres(`postgres://postgres@127.0.0.1:${(srv as unknown as { port: number }).port}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
  let wrong = 0, errors = 0, ok = 0;
  const check = (p: Promise<{ v: number }[]>, want: number) => p.then((r) => (r[0].v === want ? ok++ : wrong++), () => errors++);
  const jobs: Promise<unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const k = i % 3;
    jobs.push(
      k === 0 ? check(site.unsafe(`select $1::int as v /* a${i} */`, [i]), i)
      : k === 1 ? check(site.unsafe(`select $1::int + 1000000 as v /* b${i} */`, [i]), i + 1000000)
      : site.begin(async (tx) => { await check(tx.unsafe(`select $1::int + 2000000 as v /* c${i} */`, [i]), i + 2000000); await check(tx.unsafe(`select $1::int as v /* d${i} */`, [i]), i); }),
    );
    if (i % 7 === 0) await new Promise((r) => setImmediate(r));
  }
  await Promise.all(jobs);
  await site.end({ timeout: 1 });
  await srv.stop();
  await pg.close();
  return { ok, wrong, errors };
}

const alone = await siteAlone();
console.log('site alone:      ', JSON.stringify(alone));
const before = await round(false);
const after = await round(true);
console.log('without the gate:', JSON.stringify(before));
console.log('with the gate:   ', JSON.stringify(after));
const failures: string[] = [];
if (alone.wrong !== 0 || alone.errors !== 0) failures.push(`the site's own client mixed up ${alone.wrong} values (${alone.errors} errors) with no test queries: a client-side fault, production would be affected`);
if (before.wrong + before.errors === 0) failures.push('the probe did not reproduce the fault without the gate (it proves nothing this run; rerun)');
if (after.wrong !== 0) failures.push(`${after.wrong} silent wrong reads with the gate`);
if (after.errors !== 0 || after.protocolErrors !== 0) failures.push(`${after.errors} errors (${after.protocolErrors} protocol) with the gate`);
if (failures.length) {
  console.log('PGLITE-GATE TEST FAILED:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`pglite-gate: the site alone ${alone.ok} queries, 0 wrong; without the gate ${before.wrong} silent wrong reads and ${before.errors} errors in ${before.ok + before.wrong + before.errors} site queries; with it 0 and 0`);
