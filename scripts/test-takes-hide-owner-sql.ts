/**
 * NEXT_takes_hide_owner.sql on an in-memory Postgres (PGlite) with every numbered migration applied first (0001-0056).
 * No network, no production database. Checks: A (the dry run) is B word for word and changes nothing; B applies, and
 * applies again; C (the read-back) passes and keeps nothing; planted faults C must catch; D (the undo) is refused once a
 * maker's hide is on record, and puts back the shape before otherwise. Drafted by the coding agent (Claude, a closed
 * model by Anthropic).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = 'supabase/migrations/NEXT_takes_hide_owner.sql';
let failed = 0;
const check = (label: string, ok: boolean, why = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !why ? '' : ` (${why})`}`);
  if (!ok) failed++;
};
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const text = read(FILE);
const at = (h: string) => text.indexOf(`\n-- ${h}`);
const between = (a: string, b: string | null) => text.slice(text.indexOf('\n', at(a) + 1) + 1, b ? at(b) : text.length);
const strip = (s: string) => s.replace(/^--[^\n]*$/gm, '').trim();
const uncomment = (s: string) => {
  const lines = s.split('\n');
  const i = lines.findIndex((l) => l === '-- begin;');
  const j = lines.map((l, k) => (/^-- (rollback|commit);$/.test(l) ? k : -1)).filter((k) => k > i).pop() ?? -1;
  return i < 0 || j < 0 ? '' : lines.slice(i, j + 1).map((l) => l.replace(/^-- ?/, '')).join('\n');
};
const dry = strip(between('A. DRY RUN', 'B. MIGRATION'));
const mig = strip(between('B. MIGRATION', 'C. READ-BACK'));
const readBack = uncomment(between('C. READ-BACK', 'D. UNDO'));
const undo = uncomment(between('D. UNDO', null));
check('the file says who runs it; A ends in rollback, B in commit; C ends READ-BACK PASSED and rolls back; D is an undo', /MUST RUN AS postgres/.test(text) && /Supabase SQL Editor/.test(text) && dry.startsWith('begin;') && dry.endsWith('rollback;') && mig.startsWith('begin;') && mig.endsWith('commit;') && /READ-BACK PASSED/.test(readBack) && readBack.trim().endsWith('rollback;') && /UNDO REFUSED/.test(undo));
check('the dry run is the migration word for word', dry.slice(0, -'rollback;'.length) === mig.slice(0, -'commit;'.length));
check('the read-back inserts and deletes realistic rows, and sets no role', /insert into studio\./.test(readBack) && /delete from studio\./.test(readBack) && !/set role/i.test(readBack));

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await pg.exec(read(`supabase/migrations/${f}`));
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const tryExec = async (sql: string) => {
  try {
    await pg.exec(sql);
    return { ok: true, why: '' };
  } catch (e) {
    await pg.exec('rollback;').catch(() => {});
    return { ok: false, why: String((e as Error).message) };
  }
};
const shape = async () =>
  JSON.stringify((await pg.query(`select conrelid::regclass::text as t, conname, pg_get_constraintdef(oid) as d from pg_constraint where conrelid in ('studio.voice_publication_log'::regclass, 'studio.voice_publications'::regclass) order by 1, 2`)).rows)
  + JSON.stringify((await pg.query(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'studio' and proname in ('made_picture', 'hide_takes_using_own_picture', 'unhide_takes_using_own_picture') order by 1`)).rows);
const before = await shape();
await pg.exec(dry);
check('the dry run leaves everything as it was', (await shape()) === before);
const b1 = await tryExec(mig);
const b2 = await tryExec(mig);
check('the migration applies, and applies again', b1.ok && b2.ok, b1.why || b2.why);
const count = async () => JSON.stringify((await pg.query(`select (select count(*) from studio.voice_publications)::int p, (select count(*) from studio.voice_publication_log)::int l, (select count(*) from studio.wallet_links)::int w`)).rows[0]);
const c0 = await count();
const rb = await tryExec(readBack);
check('the read-back passes and keeps nothing', rb.ok && (await count()) === c0, rb.why || `${c0} -> ${await count()}`);
for (const [label, fault] of [
  ['anyone counts as the picture\'s maker', `create or replace function studio.made_picture(p_version uuid, p_by bigint) returns boolean language sql stable security definer set search_path = studio, pg_temp as $f$ select true $f$;`],
  ['a linked wallet\'s picture is not its FID\'s', `create or replace function studio.made_picture(p_version uuid, p_by bigint) returns boolean language sql stable security definer set search_path = studio, pg_temp as $f$ select exists (select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id where v.id = p_version and e.created_by_fid = p_by) $f$;`],
  ['the maker\'s unhide brings back a take with its own report', `create or replace function studio.unhide_takes_using_own_picture(p_version uuid, p_by bigint) returns table (publication_id uuid, key text) language plpgsql security definer set search_path = studio, pg_temp as $f$ declare t uuid; begin if not studio.made_picture(p_version, p_by) then raise exception 'no' using errcode = 'P0002'; end if; for t in select id from studio.voice_publications where kind = 'take' and picture->>'version' = p_version::text and hidden_at is not null and taken_down_at is null loop update studio.voice_publications set hidden_at = null, hidden_by = null, hidden_role = null where id = t; insert into studio.voice_publication_log (publication_id, step, by_fid, role, note) values (t, 'unhidden', p_by, 'author', 'its picture was restored'); return query select t, f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = t; end loop; end $f$;`],
  ['the log refuses the author', `alter table studio.voice_publication_log drop constraint voice_publication_log_role_check; alter table studio.voice_publication_log add constraint voice_publication_log_role_check check (role in ('reader', 'moderator', 'maintainer', 'rule'));`],
  ['anon may hide takes', 'grant execute on function studio.hide_takes_using_own_picture(uuid, bigint) to anon;'],
  ['the maker\'s unhide also brings back a take a moderator hid', `create or replace function studio.unhide_takes_using_own_picture(p_version uuid, p_by bigint) returns table (publication_id uuid, key text) language plpgsql security definer set search_path = studio, pg_temp as $f$ declare t uuid; begin if not studio.made_picture(p_version, p_by) then raise exception 'no' using errcode = 'P0002'; end if; for t in select p.id from studio.voice_publications p where p.kind = 'take' and p.picture->>'version' = p_version::text and p.taken_down_at is null and p.hidden_at is not null and not exists (select 1 from studio.voice_publication_log r where r.publication_id = p.id and r.step = 'reported' and r.at > coalesce((select max(x.at) from studio.voice_publication_log x where x.publication_id = p.id and x.step = 'dismissed'), '-infinity')) loop update studio.voice_publications set hidden_at = null, hidden_by = null, hidden_role = null where id = t; insert into studio.voice_publication_log (publication_id, step, by_fid, role, note) values (t, 'unhidden', p_by, 'author', 'its picture was restored'); return query select t, f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = t; end loop; end $f$;`],
] as const) {
  await pg.exec(fault);
  const r = await tryExec(readBack);
  await pg.exec('revoke execute on function studio.hide_takes_using_own_picture(uuid, bigint) from anon;');
  await pg.exec(mig);
  check(`proof: the read-back catches it when ${label}`, !r.ok);
}
await pg.exec(`insert into studio.voice_drafts (id, fid, kind, speech_id, preset_id, recipe) values ('44444444-4444-4444-8444-444444444444', 6786, 'reading', 'doing-fine-v2', 'ephelion-warm-lecturer', '{"provider":"elevenlabs","model":"m"}');
  insert into studio.voice_publications (id, draft_id, fid, board_version, recipe, files) values ('55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444', 6786, 1, '{"voice":{},"shots":[],"closing":{}}', '[{"key":"storyboards/x/a","sha256":"a"},{"key":"storyboards/x/b","sha256":"b"}]');
  insert into studio.voice_publication_log (publication_id, step, by_fid, role) values ('55555555-5555-4555-8555-555555555555', 'hidden', -7, 'author');`);
check('the undo is refused once a maker\'s hide is on record', !(await tryExec(undo)).ok);
await pg.exec(`delete from studio.voice_publication_log; delete from studio.voice_publications; delete from studio.voice_drafts;`);
const u = await tryExec(undo);
check('the undo puts back the shape before', u.ok && (await shape()) === before, u.why);
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
