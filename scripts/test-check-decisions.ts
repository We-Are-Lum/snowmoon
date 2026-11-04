/**
 * Check decisions (owner, 2026-11-04: "look each account up as rarely as possible"): the store and its migration.
 * Fails (exit 1) on any problem. No call leaves the machine.
 *
 *   npm run test:check-decisions
 *
 * - The owner's SQL (docs/legal/check-decisions-sql-for-owner.md), block by block, on an in-memory Postgres (PGlite)
 *   holding every numbered migration: the dry run leaves nothing; the migration applies (twice); read-back (a) is all
 *   true; read-back (b) passes and leaves nothing. Planted violations (a score column, a writer that can still keep a
 *   score) turn read-back (a) false, and a constraint that refuses a real DID fails read-back (b).
 * - The API (src/lib/checks/decisions.ts), as studio_writer: a pass is current for 90 days and a fail for 24 hours; a
 *   decision under another threshold is not current; markForRecheck withdraws passes, never fails; the Lens address
 *   and a long DID fit; anyCurrentPass passes on any linked account; nothing it stores can hold a number.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught, 'the planted violation was not caught');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

const NUMBERED = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const MIGRATION = read('supabase/migrations/NEXT_check_decisions.sql');
const DOC = read('docs/legal/check-decisions-sql-for-owner.md');
const blocks = [...DOC.matchAll(/```sql\n([\s\S]*?)\n```/g)].map((m) => m[1]);
check('the owner\'s doc has four sql blocks: dry run, migration, read-back (a), read-back (b)', blocks.length === 4, String(blocks.length));
const [dry, mig, rbA, rbB] = blocks;
const body = MIGRATION.slice(MIGRATION.indexOf('begin;')).trim();
check('the migration block is the migration file, word for word', mig === body);
check('the dry run is the migration ending in rollback', dry === body.replace(/\ncommit;$/, '\nrollback;') && /rollback;$/.test(dry));
check('read-back (a) is one read-only select', /^-- [^\n]*\nselect /.test(rbA) && !/\b(insert|update|delete|create|drop|alter|grant|revoke)\b/i.test(rbA.replace(/--[^\n]*/g, '').replace(/'[^']*'/g, '')));
check('read-back (b) is one do block that raises READ-BACK FAILED', (rbB.match(/\bdo \$\$/g) ?? []).length === 1 && /READ-BACK FAILED/.test(rbB) && /READ-BACK PASSED/.test(rbB));
check('no set role and no temp table in any block', !blocks.some((b) => /\bset role\b|\btemp(orary)? table\b/i.test(b)));

async function fresh() {
  const pg = new PGlite();
  await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const f of NUMBERED) await pg.exec(read(`supabase/migrations/${f}`));
  return pg;
}
async function readBackA(pg: PGlite) {
  const r = await pg.query<{ what: string; ok: boolean }>(rbA);
  return r.rows;
}
async function readBackB(pg: PGlite): Promise<string> {
  const notices: string[] = [];
  try {
    await pg.query(rbB, [], { onNotice: (n) => notices.push(n.message ?? '') });
  } catch (e) {
    return (e as Error).message;
  }
  return notices.join(' ');
}

// --- The owner's SQL ---------------------------------------------------------------------------------------------------
{
  const pg = await fresh();
  await pg.exec(`insert into studio.image_scores (fid, score) values (42, 0.81), (43, 0.4)`);
  await pg.exec(dry);
  check('the dry run leaves no table and keeps the old scores', (await pg.query(`select to_regclass('studio.check_decisions') as t`)).rows[0] !== undefined && (await pg.query<{ t: string | null }>(`select to_regclass('studio.check_decisions')::text as t`)).rows[0].t === null && (await pg.query<{ n: number }>(`select count(*)::int as n from studio.image_scores`)).rows[0].n === 2);
  await pg.exec(mig);
  await pg.exec(mig);
  check('the migration applies, and again (safe to run twice)', true);
  const a = await readBackA(pg);
  check('read-back (a): 11 rows, every one true', a.length === 11 && a.every((r) => r.ok === true), a.filter((r) => !r.ok).map((r) => r.what).join('; '));
  const b = await readBackB(pg);
  check('read-back (b) passes', b.includes('READ-BACK PASSED'), b);
  check('read-back (b) leaves nothing behind', (await pg.query<{ n: number }>(`select count(*)::int as n from studio.check_decisions`)).rows[0].n === 0);
  await pg.close();
}
{
  const pg = await fresh();
  await pg.exec(mig);
  await pg.exec(`alter table studio.check_decisions add column score numeric`);
  const a = await readBackA(pg);
  proof('a score column planted in the store turns read-back (a) false', a.some((r) => !r.ok && /score/.test(r.what)));
  await pg.close();
}
{
  const pg = await fresh();
  await pg.exec(mig.replace('revoke insert, update on studio.image_scores from studio_writer;', ''));
  const a = await readBackA(pg);
  proof('a writer that can still keep a score turns read-back (a) false', a.some((r) => !r.ok && /cannot add or change a score/.test(r.what)));
  await pg.close();
}
{
  const pg = await fresh();
  await pg.exec(mig.replace("check (length(account) between 1 and 2048)", 'check (length(account) between 1 and 200)'));
  proof('an account column too short for a long DID fails read-back (b)', (await readBackB(pg)).includes('READ-BACK FAILED') || !(await readBackB(pg)).includes('READ-BACK PASSED'));
  await pg.close();
}

// --- The API, as studio_writer -----------------------------------------------------------------------------------------
const pg = await fresh();
await pg.exec(mig);
const PORT = 54341;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
await sql`set role studio_writer`;
const D = await import('../src/lib/checks/decisions');
type Sql = Parameters<typeof D.currentDecision>[0];
const S = sql as unknown as Sql;
const quiet = console.error;
console.error = () => {};
const age = (network: string, account: string, interval: string) => pg.exec(`update studio.check_decisions set decided_at = now() - interval '${interval}' where network = '${network}' and account = '${account}'`);
const rows = async () => (await pg.query<{ n: number }>(`select count(*)::int as n from studio.check_decisions`)).rows[0].n;

const T = 'neynar-score>=0.7';
check('no decision yet: null (look it up)', (await D.currentDecision(S, 'farcaster', '500', T)) === null);
check('decide stores a pass', await D.decide(S, 'farcaster', '500', true, T));
const d1 = await D.currentDecision(S, 'farcaster', '500', T);
check('a pass reads back: passed, when, and the threshold', d1?.passed === true && d1.threshold === T && Math.abs(d1.decidedAt.getTime() - Date.now()) < 60_000, JSON.stringify(d1));
await age('farcaster', '500', '89 days 23 hours');
check('a pass is current at 89 days 23 hours', (await D.currentDecision(S, 'farcaster', '500', T))?.passed === true);
await age('farcaster', '500', '90 days 1 minute');
check('a pass is not current after 90 days', (await D.currentDecision(S, 'farcaster', '500', T)) === null);
check('an expired pass is deleted', (await rows()) === 0);
proof('a pass kept past 90 days would be caught', await (async () => { const real = D.recheckAt({ passed: true, decidedAt: new Date(0) }).getTime(); return real === 90 * 86_400_000; })());

await D.decide(S, 'farcaster', '501', false, T);
await age('farcaster', '501', '23 hours 59 minutes');
check('a fail is current (not asked again) before 24 hours', (await D.currentDecision(S, 'farcaster', '501', T))?.passed === false);
await age('farcaster', '501', '24 hours 1 minute');
check('a fail is asked again after 24 hours', (await D.currentDecision(S, 'farcaster', '501', T)) === null);
check('recheckAt: a fail at +24h, a pass at +90d', D.recheckAt({ passed: false, decidedAt: new Date(0) }).getTime() === 86_400_000 && D.recheckAt({ passed: true, decidedAt: new Date(0) }).getTime() === 90 * 86_400_000);

await D.decide(S, 'farcaster', '502', true, T);
check('a decision under another threshold is not current (the threshold changed)', (await D.currentDecision(S, 'farcaster', '502', 'neynar-score>=0.8')) === null && (await D.currentDecision(S, 'farcaster', '502', T))?.passed === true);
proof('a reader that ignored the threshold would be caught', (await pg.query<{ n: number }>(`select count(*)::int as n from studio.check_decisions where account = '502'`)).rows[0].n === 1 && (await D.currentDecision(S, 'farcaster', '502', 'neynar-score>=0.8')) === null);

await D.decide(S, 'farcaster', '503', true, T);
await D.decide(S, 'farcaster', '503', true, 'neynar-score>=0.5');
await D.decide(S, 'farcaster', '504', false, T);
await D.markForRecheck(S, 'farcaster', 503);
await D.markForRecheck(S, 'farcaster', 504);
check('markForRecheck withdraws every pass of the account', (await D.currentDecision(S, 'farcaster', '503', T)) === null && (await D.currentDecision(S, 'farcaster', '503', 'neynar-score>=0.5')) === null);
check('markForRecheck leaves a fail standing (it still refuses)', (await D.currentDecision(S, 'farcaster', '504', T))?.passed === false);
check('markForRecheck touches only that account', (await D.currentDecision(S, 'farcaster', '502', T))?.passed === true);
await D.recheckMaker(S, 502);
check('recheckMaker withdraws a FID maker\'s pass', (await D.currentDecision(S, 'farcaster', '502', T)) === null);
await D.recheckMaker(S, -7);
check('recheckMaker ignores a wallet maker (no check of its own)', true);

const LENS = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
check('a Lens address is stored lowercase and read back either way', (await D.decide(S, 'lens', LENS, true, 'lens-score>=1000')) && (await D.currentDecision(S, 'lens', LENS.toLowerCase(), 'lens-score>=1000'))?.passed === true);
const DID = `did:plc:${'a'.repeat(2040)}`;
check('a DID of 2048 characters fits', DID.length === 2048 && (await D.decide(S, 'bluesky', DID, true, 'made-before-2026-11-06+5posts30d')) && (await D.currentDecision(S, 'bluesky', DID, 'made-before-2026-11-06+5posts30d'))?.passed === true);
check('a DID over 2048 characters is refused before the database', D.accountKey('bluesky', `${DID}a`) === null);
check('a non-numeric rule is a valid threshold', D.validThreshold('made-before-2026-11-06+5posts30d') && !D.validThreshold('Made Before') && !D.validThreshold(''));
check('a FID that isn\'t digits, or an address that isn\'t one, is not stored', !(await D.decide(S, 'farcaster', 'abc', true, T)) && !(await D.decide(S, 'lens', '0x12', true, 'lens-score>=1000')));
check('the database refuses a malformed account the API let through', await pg.exec(`insert into studio.check_decisions (network, account, threshold, passed) values ('lens', '0xZZ', 'x', true)`).then(() => false, () => true));

check('linked accounts: a person passes while any linked account has a current pass', await D.anyCurrentPass(S, [{ network: 'farcaster', account: '504', threshold: T }, { network: 'lens', account: LENS, threshold: 'lens-score>=1000' }]));
check('linked accounts: no current pass on any, no pass', !(await D.anyCurrentPass(S, [{ network: 'farcaster', account: '504', threshold: T }, { network: 'farcaster', account: '999', threshold: T }])));

// --- No score kept: the store's columns, and the API's code -----------------------------------------------------------
const cols = (await pg.query<{ column_name: string; data_type: string }>(`select column_name, data_type from information_schema.columns where table_schema = 'studio' and table_name = 'check_decisions'`)).rows;
const numberish = (c: { column_name: string; data_type: string }) => /(^|_)(score|scores|value|age|count|posts|followers)(_|$)/.test(c.column_name) || /numeric|real|double|integer|bigint|smallint|json/.test(c.data_type);
check('the store has no column that can hold a score or a count', !cols.some(numberish), cols.map((c) => `${c.column_name}:${c.data_type}`).join());
proof('a planted score column would be caught', numberish({ column_name: 'score', data_type: 'numeric' }));
const api = read('src/lib/checks/decisions.ts');
check('decide() takes passed and a threshold, never a score', /export async function decide\(sql: Sql, network: Network, account: string, passed: boolean, threshold: string\)/.test(api) && !/score\s*[:,)]/.test(api.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/'[^']*'/g, '')));
const neynar = read('src/lib/images/neynar.ts');
check('the Neynar check writes only decisions, and no longer touches image_scores', !/image_scores/.test(neynar.replace(/\/\*\*[\s\S]*?\*\//g, '')) && /decide\(sql, 'farcaster'/.test(neynar));
proof('a Neynar module that still writes scores would be caught', /image_scores/.test("await sql`insert into studio.image_scores (fid, score) values (1, 0.9)`"));

console.error = quiet;
await sql.end();
await server.stop();
await pg.close();
if (failures.length) {
  console.error(`test:check-decisions: ${failures.length} failed, ${passed} passed`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`test:check-decisions: all ${passed} passed`);
process.exit(0);
