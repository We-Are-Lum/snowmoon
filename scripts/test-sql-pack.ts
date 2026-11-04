/**
 * The SQL pack of 2026-11-04 (docs/legal/sql-pack-2026-11-04.md), tested on an in-memory Postgres (PGlite). The blocks
 * are read from the doc itself, so what is tested is what the owner pastes. Never a production database.
 *
 *   npm run test:sql-pack
 *
 * On a fresh database with main's migrations, 0001..0033 (supabase/migrations on this branch), for each migration in
 * apply order:
 * - its blocks have the shape the owner was promised (A is B ending in rollback; C is one select; D is one do block,
 *   with no `set role` and no temporary table, raising "READ-BACK FAILED");
 * - B is the branch's migration, word for word (read with `git show origin/<branch>:…`, when git can);
 * - the dry run (A) leaves nothing: the schema, the grants, the policies and every row are as before;
 * - the migration (B) applies; read-back (a) (C), run in a read-only transaction, is all true; read-back (b) (D) passes
 *   and leaves every row as it was;
 * - running B twice is safe where the doc says so (and, for 2, fails and changes nothing);
 * - planted faults (a missing grant, a missing policy, a dropped constraint, a wrong column type, …), each inside a
 *   transaction that is rolled back: (a) shows a false row or (b) raises READ-BACK FAILED, or the plant fails the test.
 * Then the conflicts between migrations: re-running 0033 after 4, re-running 1, and every read-back (a) at the end.
 *
 * PGlite runs as a superuser, unlike Supabase's postgres role: the blocks use nothing a superuser alone may do.
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOC = path.join(ROOT, 'docs/legal/sql-pack-2026-11-04.md');

const failures: string[] = [];
let passed = 0;
const log: string[] = [];
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  log.push(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};

// ---------------------------------------------------------------------------------------------------------------------
// The blocks, from the doc: "### 1A. …" followed by one ```sql block.
// ---------------------------------------------------------------------------------------------------------------------
const doc = readFileSync(DOC, 'utf8');
const blocks = new Map<string, string>();
for (const m of doc.matchAll(/^### (\d[A-D])\. [^\n]*\n[\s\S]*?```sql\n([\s\S]*?)\n```/gm)) blocks.set(m[1], m[2]);
const ORDER = ['1', '2', '3', '4', '5'] as const;
type K = (typeof ORDER)[number];
const SOURCE: Record<K, { branch: string; file: string; name: string; twiceSafe: boolean }> = {
  '1': { branch: 'check-decisions', file: 'supabase/migrations/NEXT_check_decisions.sql', name: 'NEXT_check_decisions', twiceSafe: true },
  '2': { branch: 'signin-lens-bluesky', file: 'supabase/migrations/NEXT_signin_lens_bluesky.sql', name: 'NEXT_signin_lens_bluesky', twiceSafe: false },
  '3': { branch: 'remix-submit', file: 'supabase/migrations/NEXT_remix_count.sql', name: 'NEXT_remix_count', twiceSafe: true },
  '4': { branch: 'remix-submit', file: 'supabase/migrations/NEXT_challenge_submit.sql', name: 'NEXT_challenge_submit', twiceSafe: true },
  '5': { branch: 'bluesky-check', file: 'supabase/migrations/NEXT_social_bluesky_check.sql', name: 'NEXT_social_bluesky_check', twiceSafe: true },
};
const get = (id: string) => {
  const b = blocks.get(id);
  if (!b) throw new Error(`the doc has no block ${id}`);
  return b;
};
check('the doc has 20 blocks, 1A to 5D, in order', [...blocks.keys()].join() === ORDER.flatMap((k) => ['A', 'B', 'C', 'D'].map((x) => k + x)).join(), [...blocks.keys()].join());

const stripComments = (s: string) => s.replace(/--[^\n]*/g, '').trim();
const body = (s: string, end: 'commit;' | 'rollback;') => {
  const t = stripComments(s);
  return t.startsWith('begin;') && t.endsWith(end) ? t.slice('begin;'.length, -end.length).trim() : null;
};

// ---------------------------------------------------------------------------------------------------------------------
// The database: 0001..0033, as main has them, and a little realistic data.
// ---------------------------------------------------------------------------------------------------------------------
const numbered = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
// Main's migrations end at 0033 (0016 and 0017 were never files here: 0017 is in supabase/drafts).
check('main has its numbered migrations up to 0033 and nothing unnumbered', numbered.length === 31 && numbered.at(-1)!.startsWith('0033_') && !readdirSync(path.join(ROOT, 'supabase/migrations')).some((f) => f.startsWith('NEXT_')), `${numbered.length} files, last ${numbered.at(-1)}`);
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of numbered) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(`
  insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing;
  insert into studio.elements (id, work_id, element_type, created_by_fid) values ('71111111-1111-4111-8111-111111111111','snowmoon','text',6786);
  insert into studio.element_versions (element_id, version_no, body) values ('71111111-1111-4111-8111-111111111111', 1, '{}'), ('71111111-1111-4111-8111-111111111111', 2, '{}');
  insert into studio.image_scores (fid, score) values (6786, 0.91);
  insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible)
    select id, 'remix-2026-11', 6786, 'invited', true from studio.element_versions where version_no = 1;`);
// A third version, so that 5D still finds two without a decision after the one above.
await pg.exec(`insert into studio.element_versions (element_id, version_no, body) values ('71111111-1111-4111-8111-111111111111', 3, '{}');`);

/** Everything a migration could change: tables, columns, constraints, indexes, policies, grants, and each table's rows. */
async function snapshot(): Promise<string> {
  const q = async (s: string) => JSON.stringify((await pg.query(s)).rows);
  const parts = [
    await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'studio' order by 1, 2`),
    await q(`select conrelid::regclass::text as t, conname, pg_get_constraintdef(oid) as d from pg_constraint where connamespace = 'studio'::regnamespace order by 1, 2`),
    await q(`select indexname, indexdef from pg_indexes where schemaname = 'studio' order by 1`),
    await q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'studio' order by 1, 2`),
    await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'studio' order by 1, 2, 3`),
    await q(`select table_name, column_name, grantee, privilege_type from information_schema.column_privileges where table_schema = 'studio' order by 1, 2, 3, 4`),
    await q(`select relname, relrowsecurity from pg_class where relnamespace = 'studio'::regnamespace and relkind = 'r' order by 1`),
  ];
  const tables = (await pg.query<{ t: string }>(`select tablename as t from pg_tables where schemaname = 'studio' order by 1`)).rows.map((r) => r.t);
  for (const t of tables) parts.push(`${t}:${await q(`select * from studio.${t} order by 1`)}`);
  return parts.join('\n');
}
const diff = (a: string, b: string) => {
  const x = a.split('\n');
  const y = b.split('\n');
  const i = x.findIndex((l, n) => l !== y[n]);
  return i < 0 ? '' : `first difference: ${(x[i] ?? '').slice(0, 200)} → ${(y[i] ?? '').slice(0, 200)}`;
};

/** Read-back (a), in a read-only transaction: its rows, or an error. */
async function readBackA(k: K, readOnly = true): Promise<{ rows: { n?: number; what: string; ok: boolean | null }[]; error?: string }> {
  try {
    if (readOnly) await pg.exec('begin read only;');
    const r = await pg.query<{ n?: number; what: string; ok: boolean | null }>(get(`${k}C`));
    return { rows: r.rows };
  } catch (e) {
    return { rows: [], error: (e as Error).message };
  } finally {
    if (readOnly) await pg.exec('rollback;');
  }
}
/** Read-back (b): null if it passed, else its error. */
async function readBackB(k: K): Promise<string | null> {
  try {
    await pg.exec(get(`${k}D`));
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
const allTrue = (r: { rows: { ok: boolean | null }[]; error?: string }) => !r.error && r.rows.length > 0 && r.rows.every((x) => x.ok === true);
const falseRows = (r: { rows: { n?: number; what: string; ok: boolean | null }[]; error?: string }) => (r.error ? [`error: ${r.error}`] : r.rows.filter((x) => x.ok !== true).map((x) => `${x.n ?? ''} ${x.what}`.trim()));

/** A planted fault, inside a transaction that is rolled back: caught if (a) shows a false row or (b) raises READ-BACK FAILED. */
async function plant(k: K, label: string, sql: string) {
  const before = await snapshot();
  await pg.exec('begin;');
  let a: string[] = [];
  let b: string | null = null;
  try {
    await pg.exec(sql);
    a = falseRows(await readBackA(k, false));
    await pg.exec('savepoint before_b;');
    b = await readBackB(k);
    await pg.exec('rollback to savepoint before_b;');
  } catch (e) {
    a = [`the plant itself failed: ${(e as Error).message}`];
  }
  await pg.exec('rollback;');
  const byB = b !== null && /READ-BACK FAILED/.test(b);
  const byA = a.length > 0 && !a[0].startsWith('the plant itself failed');
  const how = [byA ? `(a) false: ${a.join('; ')}` : '', byB ? `(b) ${b!.replace(/^.*?(READ-BACK FAILED)/s, '$1')}` : ''].filter(Boolean).join(' | ');
  check(`${k} planted: ${label} — caught`, byA || byB, a.join('; ') || b || 'neither read-back noticed');
  log.push(`       caught by ${how || 'nothing'}`);
  check(`${k} planted: ${label} — rolled back, nothing left`, (await snapshot()) === before);
}

// ---------------------------------------------------------------------------------------------------------------------
// Each migration, in apply order.
// ---------------------------------------------------------------------------------------------------------------------
const PLANTS: Record<K, [string, string][]> = {
  '1': [
    ['missing grant: studio_writer loses delete on check_decisions', `revoke delete on studio.check_decisions from studio_writer;`],
    ['missing policy: writer_update dropped', `drop policy writer_update on studio.check_decisions;`],
    ['constraint dropped: the account-shape check', `alter table studio.check_decisions drop constraint check_decisions_account_shape;`],
    ['wrong column type: passed as text', `alter table studio.check_decisions alter column passed type text;`],
    ['a kept score left behind', `insert into studio.image_scores (fid, score) values (6852, 0.8);`],
  ],
  '2': [
    ['constraint dropped: the one-active-link index', `drop index studio.social_links_one_active;`],
    ['missing grant: no update of handle', `revoke update (handle) on studio.social_accounts from studio_writer;`],
    ['missing policy: writer_unlink dropped', `drop policy writer_unlink on studio.social_links;`],
    ['wrong column type: social_links.fid as integer', `alter table studio.social_links alter column fid type integer;`],
    ['constraint dropped: ended_by may be anything', `alter table studio.social_links drop constraint social_links_ended_by_check;`],
  ],
  '3': [
    ['constraint dropped: units may be anything', `alter table studio.sheet_remix_asks drop constraint sheet_remix_asks_units_check;`],
    ['missing grant: studio_writer loses insert', `revoke insert on studio.sheet_remix_asks from studio_writer;`],
    ['extra grant: studio_writer may delete', `grant delete on studio.sheet_remix_asks to studio_writer;`],
    ['wrong column type: units as integer', `alter table studio.sheet_remix_asks alter column units type integer;`],
    ['missing policy: writer_insert dropped', `drop policy writer_insert on studio.sheet_remix_asks;`],
  ],
  '4': [
    ['missing policy: writer_delete dropped', `drop policy writer_delete on studio.challenge_marks;`],
    ['missing grant: 0033 re-run, which revokes delete', stripComments(readFileSync(path.join(ROOT, 'supabase/migrations/0033_remix_challenge.sql'), 'utf8')).replace(/^begin;/, '').replace(/commit;$/, '')],
    ['constraint dropped: the character check', `alter table studio.challenge_marks drop constraint challenge_marks_character_check;`],
    ['public access: anon may read the marks', `grant select on studio.challenge_marks to anon;`],
  ],
  '5': [
    ['constraint dropped: account must match the number', `alter table studio.challenge_eligibility drop constraint challenge_eligibility_account_matches;`],
    ['wrong column type: account as varchar(20)', `alter table studio.challenge_eligibility alter column account type varchar(20);`],
    ['fid check not widened (0033\'s, FIDs only)', `alter table studio.challenge_eligibility drop constraint challenge_eligibility_fid_check; alter table studio.challenge_eligibility add constraint challenge_eligibility_fid_check check (fid > 0);`],
    ['challenge_marks takes a wallet\'s number', `alter table studio.challenge_marks drop constraint challenge_marks_fid_check; alter table studio.challenge_marks add constraint challenge_marks_fid_check check (fid <> 0);`],
    ['its own table kept (the branch\'s old bluesky_checks)', `create table studio.bluesky_checks (account_id bigint primary key references studio.social_accounts(id), decision text not null, checked_at timestamptz not null default now(), threshold text not null);`],
  ],
};

const gitShow = (branch: string, file: string) => {
  try {
    return execFileSync('git', ['show', `origin/${branch}:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};

for (const k of ORDER) {
  const src = SOURCE[k];
  const A = get(`${k}A`);
  const B = get(`${k}B`);
  const C = get(`${k}C`);
  const D = get(`${k}D`);
  // The shape of the blocks.
  check(`${k} A is B with rollback in place of commit`, body(A, 'rollback;') !== null && body(A, 'rollback;') === body(B, 'commit;'));
  const c = stripComments(C).replace(/'(?:[^']|'')*'/g, "''");
  check(`${k} C is one read-only select`, /^select\b/i.test(c) && c.endsWith(';') && c.slice(0, -1).split(';').length === 1 && !/\b(insert|update|delete|create|alter|drop|grant|revoke)\b/i.test(c));
  const d = stripComments(D);
  check(`${k} D is one do block: no set role, no temp table, raises READ-BACK FAILED`, /^do \$\$/.test(d) && d.endsWith('end $$;') && d.split('$$').length === 3 && !/set\s+role/i.test(d) && !/\btemp(orary)?\b/i.test(d) && /READ-BACK FAILED/.test(d) && /READ-BACK PASSED/.test(d));
  // B is the branch's migration, word for word.
  const file = gitShow(src.branch, src.file);
  if (file === null) log.push(`skip ${k} B against origin/${src.branch}: git show unavailable`);
  else {
    const from = k === '2' || k === '5' ? file.slice(file.indexOf('-- B. THE MIGRATION')) : file;
    const m = /^begin;$[\s\S]*?^commit;$/m.exec(from);
    const migration = m ? m[0] : '';
    check(`${k} B is origin/${src.branch}'s ${src.name}, word for word`, migration.trim() === B.trim());
  }

  // A: the dry run leaves nothing.
  const s0 = await snapshot();
  let err: string | null = null;
  await pg.exec(A).catch((e: Error) => (err = e.message));
  check(`${k} A (dry run) runs without an error`, err === null, err ?? '');
  const s1 = await snapshot();
  check(`${k} A (dry run) leaves nothing`, s0 === s1, diff(s0, s1));

  // B: the migration applies.
  err = null;
  await pg.exec(B).catch((e: Error) => (err = e.message));
  check(`${k} B (migration) applies`, err === null, err ?? '');
  if (k === '1') {
    const n = (await pg.query<{ n: number }>(`select count(*)::int as n from studio.image_scores`)).rows[0].n;
    check('1 A kept the planted score; B deleted it', s1.includes('0.91') && n === 0);
  }

  // C: all true, in a read-only transaction.
  const a = await readBackA(k);
  check(`${k} C (read-back a) is all true (${a.rows.length} rows), read only`, allTrue(a), falseRows(a).join('; '));
  // D: passes and leaves every row as it was.
  const before = await snapshot();
  const b = await readBackB(k);
  check(`${k} D (read-back b) passes`, b === null, b ?? '');
  const after = await snapshot();
  check(`${k} D (read-back b) leaves nothing`, before === after, diff(before, after));

  // Twice.
  err = null;
  await pg.exec(B).catch((e: Error) => (err = e.message));
  if (src.twiceSafe) {
    const again = await snapshot();
    check(`${k} B run twice: no error, nothing changes`, err === null && again === after, err ?? diff(after, again));
  } else {
    await pg.exec('rollback;').catch(() => {});
    const again = await snapshot();
    check(`${k} B run twice: stops with an error and changes nothing (not safe to re-run, as the doc says)`, err !== null && again === after, err ?? 'no error');
    log.push(`       second run: ${err}`);
  }
  check(`${k} C still all true after the second run`, allTrue(await readBackA(k)));
  check(`${k} D still passes after the second run`, (await readBackB(k)) === null);

  // Planted faults.
  for (const [label, sql] of PLANTS[k]) await plant(k, label, sql);
}

// ---------------------------------------------------------------------------------------------------------------------
// Conflicts between migrations.
// ---------------------------------------------------------------------------------------------------------------------
{
  const done = await snapshot();
  // Every read-back (a) of 1..5 is still all true with all five applied (4 and 5 both change challenge_marks).
  for (const k of ORDER) check(`after all five: ${k}C still all true`, allTrue(await readBackA(k)), falseRows(await readBackA(k)).join('; '));
  for (const k of ORDER) check(`after all five: ${k}D still passes`, (await readBackB(k)) === null);

  // Re-running 0033 after 4 removes 4's delete grant; running 4B again restores it. 0033 doesn't undo 5.
  await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations/0033_remix_challenge.sql'), 'utf8'));
  const r4 = await readBackA('4');
  check('conflict: re-running 0033 after 4 turns Withdraw off (4C row 1 false)', falseRows(r4).length === 1 && /select, insert and delete/.test(falseRows(r4)[0]), falseRows(r4).join('; '));
  check('conflict: re-running 0033 does not undo 5 (5C all true)', allTrue(await readBackA('5')));
  await pg.exec(get('4B'));
  check('conflict: running 4B again restores it (4C all true)', allTrue(await readBackA('4')));
  check('conflict: and the database is as it was', (await snapshot()) === done, diff(done, await snapshot()));

  // Re-running 1 after the rest changes nothing (it deletes kept scores, of which there are none).
  await pg.exec(get('1B'));
  check('re-running 1 after 2..5 changes nothing', (await snapshot()) === done, diff(done, await snapshot()));

  // A finding for the owner, not a fault: 3's fid check refuses a Bluesky account's person number.
  let refused = false;
  await pg
    .exec(`begin; insert into studio.sheet_remix_asks (remix, fid, units, slot) values (gen_random_uuid(), -1000000001, 1, 'front'); rollback;`)
    .catch(() => (refused = true));
  await pg.exec('rollback;').catch(() => {});
  check('finding: sheet_remix_asks (3) refuses a Bluesky account\'s person number (owner\'s decision; see the doc)', refused);
  check('the database is as it was at the end', (await snapshot()) === done);
}

await pg.close();
for (const l of log) console.log(l);
console.log(`\ntest:sql-pack: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const x of failures) console.log(`  FAIL ${x}`);
  process.exit(1);
}
process.exit(0);
