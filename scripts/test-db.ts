/**
 * Database tests: apply the migrations to an in-memory Postgres (PGlite) set up
 * like a shared studio database, then check isolation, permissions, and rules.
 * Fails (exit 1) on any problem.
 *
 *   npm run test:db
 *   npm run test:db -- --migration=path/to/variant.sql   test a different file (used to plant errors)
 *
 * PGlite runs as a superuser, unlike Supabase's `postgres` role, so role
 * creation and ownership are only approximated. Permission checks use SET ROLE.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ROOT = path.resolve(import.meta.dirname, '..');
const migArg = process.argv.slice(2).find((a) => a.startsWith('--migration='));
const MIGRATION = migArg ? path.resolve(migArg.slice(12)) : path.join(ROOT, 'supabase/migrations/0001_core.sql');

const failures: string[] = [];
let passed = 0;
const db = new PGlite();

async function as<T>(role: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

/** Expect `sql` (run as `role`) to succeed. */
async function ok(label: string, role: string, sql: string) {
  try {
    await as(role, () => db.exec(sql));
    passed++;
  } catch (e) {
    failures.push(`${label}: expected success, got ${(e as Error).message}`);
  }
}

/** Expect `sql` (run as `role`) to fail with an error matching `re`. */
async function denied(label: string, role: string, sql: string, re: RegExp) {
  try {
    await as(role, () => db.exec(sql));
    failures.push(`${label}: expected failure, but it succeeded`);
  } catch (e) {
    if (re.test((e as Error).message)) passed++;
    else failures.push(`${label}: wrong error: ${(e as Error).message}`);
  }
}

async function equal(label: string, role: string, sql: string, expected: unknown) {
  try {
    const r = await as(role, () => db.query<{ v: unknown }>(sql));
    const got = r.rows[0]?.v;
    if (JSON.stringify(got) === JSON.stringify(expected)) passed++;
    else failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  } catch (e) {
    failures.push(`${label}: ${(e as Error).message}`);
  }
}

const PERM = /permission denied/;

// --- A shared studio database, before this app arrives ------------------------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  -- existing tables outside studio: one in public, one in another schema
  create table public.shared_table (id int primary key, secret text);
  insert into public.shared_table values (1, 'outside studio');
  grant select on public.shared_table to anon, authenticated, service_role;
  create schema other_schema;
  create table other_schema.secrets (v text);
  insert into other_schema.secrets values ('outside studio');
  grant usage on schema other_schema to anon, authenticated, service_role;
  grant select on other_schema.secrets to anon, authenticated, service_role;
`);
const publicBefore = (await db.query<{ n: number }>(`
  select (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public')
       + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public')
       + (select count(*) from pg_policies where schemaname = 'public') as n`)).rows[0].n;

// --- Apply ------------------------------------------------------------------
try {
  await db.exec(await readFile(MIGRATION, 'utf8'));
  passed++;
} catch (e) {
  console.error(`migration failed to apply: ${(e as Error).message}`);
  process.exit(1);
}

// --- Isolation: everything in studio, nothing in public ---------------------
await equal('nothing new in public', 'postgres', `
  select (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public')
       + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public')
       + (select count(*) from pg_policies where schemaname = 'public') - ${publicBefore} as v`, 0);
await equal('15 tables in studio', 'postgres', `select count(*)::int as v from pg_tables where schemaname = 'studio'`, 15);
await equal('RLS on every studio table', 'postgres',
  `select count(*)::int as v from pg_tables where schemaname = 'studio' and not rowsecurity`, 0);
await equal('append-only triggers on studio tables', 'postgres', `
  select count(*)::int as v from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'studio' and not t.tgisinternal`, 6);

// --- Seed fixture as the owner ----------------------------------------------
await db.exec(`
  insert into studio.works values ('snowmoon', 'Snowmoon', 'GPL-3.0', 'x');
  insert into studio.elements (id, work_id, element_type, created_by_fid, status) values
    ('00000000-0000-0000-0000-0000000000a1', 'snowmoon', 'image', 1, 'published'),
    ('00000000-0000-0000-0000-0000000000a2', 'snowmoon', 'image', 1, 'hidden');
`);

// --- anon and authenticated: read published rows only, write nothing --------
for (const role of ['anon', 'authenticated']) {
  await equal(`${role} reads works`, role, `select count(*)::int as v from studio.works`, 1);
  await equal(`${role} sees only published elements`, role, `select array_agg(status) as v from studio.elements`, ['published']);
  await denied(`${role} cannot insert`, role, `insert into studio.works values ('x','x','x','x')`, PERM);
  await denied(`${role} cannot update`, role, `update studio.works set title = 'x'`, PERM);
  await denied(`${role} cannot call the trigger function`, role, `select studio.reject_mutation()`, PERM);
}

// --- service_role: no access to studio at all --------------------------------
await denied('service_role has no studio access', 'service_role', `select * from studio.works`, PERM);

// --- studio_writer: rows in studio, nothing else -----------------------------
const W = 'studio_writer';
await ok('writer inserts a text block with data', W, `
  insert into studio.text_blocks (work_id, chapter, idx, kind, content, content_hash, data)
  values ('snowmoon', 1, 18, 'screen', 'x', 'h', '{"setting":"veridia","device_provisional":true}')`);
await ok('writer upserts the same block', W, `
  insert into studio.text_blocks (work_id, chapter, idx, kind, content, content_hash)
  values ('snowmoon', 1, 18, 'screen', 'y', 'h2')
  on conflict (work_id, chapter, idx) do update set content = excluded.content`);
await ok('writer inserts an entity with a setting', W, `
  insert into studio.entities (id, work_id, kind, name, setting)
  values ('00000000-0000-0000-0000-00000000e001', 'snowmoon', 'location', 'Kalimar path', 'veridia')`);
await ok('writer inserts a section with a location', W, `
  insert into studio.sections (work_id, chapter, idx, start_idx, end_idx, location_entity_id, time_of_day, season)
  values ('snowmoon', 1, 0, 0, 9, '00000000-0000-0000-0000-00000000e001', 'morning', 'green')`);
await ok('writer inserts a render element', W, `insert into studio.elements (work_id, element_type, created_by_fid) values ('snowmoon', 'render', 1)`);
await ok('writer inserts a recipe', W, `insert into studio.recipes (source, created_by_fid) values ('in_app', 1)`);
await ok('writer hides an element', W, `update studio.elements set status = 'hidden' where id = '00000000-0000-0000-0000-0000000000a1'`);
await equal('writer sees hidden rows', W, `select count(*)::int as v from studio.elements where status = 'hidden'`, 2);
await denied('append-only binds the writer (update)', W, `update studio.recipes set prompt = 'x'`, /append-only/);
await denied('append-only binds the writer (delete)', W, `delete from studio.recipes`, /append-only/);
await denied('writer cannot create tables in studio', W, `create table studio.x (id int)`, PERM);
await denied('writer cannot create tables in public', W, `create table public.x (id int)`, PERM);
await denied('writer cannot read public tables', W, `select * from public.shared_table`, PERM);
await denied('writer cannot read other schemas', W, `select * from other_schema.secrets`, PERM);
await denied('writer cannot alter studio tables', W, `alter table studio.works add column x int`, /must be owner|permission denied/);
await denied('writer cannot truncate', W, `truncate studio.recipes cascade`, PERM);

// --- Constraints ---------------------------------------------------------------
await denied('table kind is gone', 'postgres', `insert into studio.text_blocks (work_id, chapter, idx, kind, content, content_hash) values ('snowmoon', 1, 0, 'table', 'x', 'h')`, /text_blocks_kind_check/);
await denied('data only on screen and figure', 'postgres', `insert into studio.text_blocks (work_id, chapter, idx, kind, content, content_hash, data) values ('snowmoon', 1, 1, 'paragraph', 'x', 'h', '{}')`, /text_blocks_check/);
await denied('setting must be a slug', 'postgres', `insert into studio.entities (work_id, kind, name, setting) values ('snowmoon', 'location', 'X', 'United Cities')`, /entities_setting_check/);
await denied('entities has no world column', 'postgres', `select world from studio.entities`, /column "world" does not exist/);
await denied('section location must exist', 'postgres', `insert into studio.sections (work_id, chapter, idx, start_idx, end_idx, location_entity_id) values ('snowmoon', 1, 5, 0, 1, gen_random_uuid())`, /foreign key/);

// --- The real seed script, as studio_writer, over the wire --------------------
await db.exec(`delete from studio.text_blocks`);
await db.exec(`set role studio_writer`);
const SEED_PORT = 54329;
const server = new PGLiteSocketServer({ db, port: SEED_PORT, host: '127.0.0.1' });
await server.start();
{
  const probe = postgres(`postgres://studio_writer@127.0.0.1:${SEED_PORT}/postgres`, { prepare: false, max: 1 });
  const [{ u }] = await probe`select current_user as u`;
  await probe.end();
  if (u === 'studio_writer') passed++;
  else failures.push(`seed connection runs as ${u}, not studio_writer`);
}
try {
  // Async: the socket server runs in this process and must keep answering.
  await promisify(execFile)('npx', ['tsx', 'scripts/seed-text.ts'], {
    cwd: ROOT,
    env: { ...process.env, STUDIO_DATABASE_URL: `postgres://studio_writer@127.0.0.1:${SEED_PORT}/postgres` },
  });
  passed++;
} catch (e) {
  failures.push(`seed script as studio_writer: ${String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 400)}`);
}
await server.stop();
await db.exec('reset role');
await equal('seed loaded every block', 'postgres', `select count(*)::int as v from studio.text_blocks`, 4322);
await equal('seed stored data as jsonb', 'postgres',
  `select data->>'setting' as v from studio.text_blocks where chapter = 1 and idx = 18`, 'veridia');

if (failures.length) {
  console.error(`\nDB TESTS FAILED (${failures.length}, ${passed} passed):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`db tests passed: ${passed} checks against ${path.relative(ROOT, MIGRATION)}`);
