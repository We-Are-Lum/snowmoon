/**
 * 0054_voice_takes.sql, 0055_ephelion_scene.sql and 0056_ephelion_scene_reset.sql on an in-memory Postgres (PGlite) with every numbered migration on this
 * branch applied first (0001-0052). No network, no production database. For each file: A (the dry run) is B word for word
 * and changes nothing; B applies, and applies again; C (the read-back) passes and keeps nothing; planted faults C must
 * catch; D (the undo) is refused once a take (a free picture) exists, and puts back the shape when there is none.
 * Drafted by the coding agent (Claude, a closed model by Anthropic).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(import.meta.dirname, '..');
let failed = 0;
const check = (label: string, ok: boolean, why = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !why ? '' : ` (${why})`}`);
  if (!ok) failed++;
};
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const parts = (file: string) => {
  const text = read(file);
  const at = (h: string) => text.indexOf(`\n-- ${h}`);
  const between = (a: string, b: string | null) => text.slice(text.indexOf('\n', at(a) + 1) + 1, b ? at(b) : text.length);
  const strip = (s: string) => s.replace(/^--[^\n]*$/gm, '').trim();
  const uncomment = (s: string) => {
    const lines = s.split('\n');
    const i = lines.findIndex((l) => l === '-- begin;');
    const j = lines.map((l, k) => (/^-- (rollback|commit);$/.test(l) ? k : -1)).filter((k) => k > i).pop() ?? -1;
    return i < 0 || j < 0 ? '' : lines.slice(i, j + 1).map((l) => l.replace(/^-- ?/, '')).join('\n');
  };
  return { text, dry: strip(between('A. DRY RUN', 'B. MIGRATION')), mig: strip(between('B. MIGRATION', 'C. READ-BACK')), readBack: uncomment(between('C. READ-BACK', 'D. UNDO')), undo: uncomment(between('D. UNDO', null)) };
};
async function fresh() {
  const pg = new PGlite();
  await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  // Every migration before the three under test (numbered 0054-0056 at merge, 2026-11-27): each is applied here as new.
  for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f) && f < '0054').sort()) await pg.exec(read(`supabase/migrations/${f}`));
  await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
  return pg;
}
const tryExec = async (pg: PGlite, sql: string) => {
  try {
    await pg.exec(sql);
    return { ok: true, why: '' };
  } catch (e) {
    await pg.exec('rollback;').catch(() => {});
    return { ok: false, why: String((e as Error).message) };
  }
};
const shape = async (pg: PGlite, tables: string[]) =>
  JSON.stringify((await pg.query(`select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema = 'studio' and table_name = any($1) order by 1, 2`, [tables])).rows)
  + JSON.stringify((await pg.query(`select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid::regclass::text = any($1) order by 1`, [tables.map((t) => `studio.${t}`)])).rows);

for (const [file, tables, plant] of [
  ['supabase/migrations/0054_voice_takes.sql', ['voice_publications'], [
    ['studio_writer may insert publications', 'grant insert on studio.voice_publications to studio_writer;', 'revoke insert on studio.voice_publications from studio_writer;'],
    ['anon may enter a take', 'grant execute on function studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb, boolean) to anon;', 'revoke execute on function studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb, boolean) from anon;'],
    ['one live take per speech is gone', 'drop index studio.voice_publications_live_take;', `create unique index voice_publications_live_take on studio.voice_publications (fid, speech_id) where kind = 'take' and taken_down_at is null;`],
    ['the Ephelion check accepts any picture', `create or replace function studio.picture_is_of(p_version uuid, p_character text) returns boolean language sql stable security definer set search_path = studio, pg_temp as $f$ select true $f$;`, ''],
    ['unhiding a picture brings back a take with its own report', `create or replace function studio.unhide_takes_using_picture(p_version uuid, p_by bigint, p_role text) returns table (publication_id uuid, key text) language plpgsql security definer set search_path = studio, pg_temp as $f$ declare t uuid; begin for t in select id from studio.voice_publications where kind = 'take' and picture->>'version' = p_version::text and hidden_at is not null and taken_down_at is null loop update studio.voice_publications set hidden_at = null, hidden_by = null, hidden_role = null where id = t; insert into studio.voice_publication_log (publication_id, step, by_fid, role, note) values (t, 'unhidden', p_by, p_role, 'its picture was restored'); return query select t, f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = t; end loop; end $f$;`, ''],
    ['unhiding a picture brings back nothing', `create or replace function studio.unhide_takes_using_picture(p_version uuid, p_by bigint, p_role text) returns table (publication_id uuid, key text) language plpgsql security definer set search_path = studio, pg_temp as $f$ begin return; end $f$;`, ''],
    ['the picture shape lets a missing scene or version through (a null check passes)', `alter table studio.voice_publications drop constraint voice_publications_kind_shape; alter table studio.voice_publications add constraint voice_publications_kind_shape check ((kind = 'storyboard' and board_version is not null and speech_id is null and picture is null) or (kind = 'take' and board_version is null and speech_id ~ '^[a-z0-9-]{1,80}$' and jsonb_typeof(picture) = 'object' and picture->>'source' in ('set', 'own', 'preset', 'own-scene') and picture->>'key' ~ '^takes/[0-9a-f-]{36}/[a-z0-9-]{1,40}-[0-9a-f]{64}\\.(png|jpg)$' and picture->>'sha256' ~ '^[0-9a-f]{64}$' and ((picture->>'source' in ('set', 'own')) = (picture->>'version' ~ '^[0-9a-f-]{36}$')) and ((picture->>'source' = 'preset') = (picture->>'scene' ~ '^[a-z0-9-]{1,80}$'))));`, `alter table studio.voice_publications drop constraint voice_publications_kind_shape; alter table studio.voice_publications add constraint voice_publications_kind_shape check ((kind = 'storyboard' and board_version is not null and speech_id is null and picture is null) or (kind = 'take' and board_version is null and speech_id ~ '^[a-z0-9-]{1,80}$' and jsonb_typeof(picture) = 'object' and picture->>'source' in ('set', 'own', 'preset', 'own-scene') and picture->>'key' ~ '^takes/[0-9a-f-]{36}/[a-z0-9-]{1,40}-[0-9a-f]{64}\\.(png|jpg)$' and picture->>'sha256' ~ '^[0-9a-f]{64}$' and ((picture->>'source' in ('set', 'own')) = coalesce(picture->>'version' ~ '^[0-9a-f-]{36}$', false)) and ((picture->>'source' = 'preset') = coalesce(picture->>'scene' ~ '^[a-z0-9-]{1,80}$', false))));`],
    ['hiding a picture no longer hides its takes', `create or replace function studio.hide_takes_using_picture(p_version uuid, p_by bigint, p_role text) returns table (publication_id uuid, key text) language plpgsql security definer set search_path = studio, pg_temp as $f$ begin return; end $f$;`, ''],
  ]],
  ['supabase/migrations/0055_ephelion_scene.sql', ['ephelion_scene_pictures'], [
    ['studio_writer may delete', 'grant delete on studio.ephelion_scene_pictures to studio_writer;', 'revoke delete on studio.ephelion_scene_pictures from studio_writer;'],
    ['one per account is gone', 'alter table studio.ephelion_scene_pictures drop constraint ephelion_scene_pictures_pkey;', 'alter table studio.ephelion_scene_pictures add primary key (person);'],
    ['a claim lets a second request in', `create or replace function studio.claim_free_scene(p_person bigint) returns boolean language plpgsql security definer set search_path = studio, pg_temp as $f$ begin insert into studio.ephelion_scene_pictures (person) values (p_person) on conflict (person) do nothing; return true; end $f$;`, ''],
  ]],
  ['supabase/migrations/0056_ephelion_scene_reset.sql', ['ephelion_scene_resets'], [
    ['studio_writer may write the log itself', 'grant insert on studio.ephelion_scene_resets to studio_writer;', 'revoke insert on studio.ephelion_scene_resets from studio_writer;'],
    ['anon may reset', 'grant execute on function studio.reset_free_scene(bigint, bigint) to anon;', 'revoke execute on function studio.reset_free_scene(bigint, bigint) from anon;'],
    ['the reset is not logged', `create or replace function studio.reset_free_scene(p_person bigint, p_by bigint) returns boolean language plpgsql security definer set search_path = studio, pg_temp as $f$ begin if p_person = 0 or p_by is null or p_by <= 0 then raise exception 'no one' using errcode = '22023'; end if; delete from studio.ephelion_scene_pictures where person = p_person; return found; end $f$;`, ''],
    ['the reset leaves a made picture (only a claim goes, as release does)', `create or replace function studio.reset_free_scene(p_person bigint, p_by bigint) returns boolean language plpgsql security definer set search_path = studio, pg_temp as $f$ declare r record; begin if p_person = 0 or p_by is null or p_by <= 0 then raise exception 'no one' using errcode = '22023'; end if; delete from studio.ephelion_scene_pictures where person = p_person and made_at is null returning made_at, picture_sha256 into r; if not found then return false; end if; insert into studio.ephelion_scene_resets (person, by_fid, was_made, picture_sha256) values (p_person, p_by, false, null); return true; end $f$;`, ''],
    ['the log forgets who reset it', `create or replace function studio.reset_free_scene(p_person bigint, p_by bigint) returns boolean language plpgsql security definer set search_path = studio, pg_temp as $f$ declare r record; begin if p_person = 0 or p_by is null or p_by <= 0 then raise exception 'no one' using errcode = '22023'; end if; delete from studio.ephelion_scene_pictures where person = p_person returning made_at, picture_sha256 into r; if not found then return false; end if; insert into studio.ephelion_scene_resets (person, by_fid, was_made, picture_sha256) values (p_person, 1, r.made_at is not null, r.picture_sha256); return true; end $f$;`, ''],
    ['studio_writer may delete free pictures directly', 'grant delete on studio.ephelion_scene_pictures to studio_writer;', 'revoke delete on studio.ephelion_scene_pictures from studio_writer;'],
  ]],
] as const) {
  const f = parts(file);
  const name = path.basename(file);
  check(`${name}: says who runs it; A ends in rollback, B in commit; C ends READ-BACK PASSED and rolls back; D is an undo`, /MUST RUN AS postgres/.test(f.text) && /Supabase SQL Editor/.test(f.text) && f.dry.startsWith('begin;') && f.dry.endsWith('rollback;') && f.mig.startsWith('begin;') && f.mig.endsWith('commit;') && /READ-BACK PASSED/.test(f.readBack) && f.readBack.trim().endsWith('rollback;') && /UNDO REFUSED/.test(f.undo));
  check(`${name}: the dry run is the migration word for word`, f.dry.slice(0, -'rollback;'.length) === f.mig.slice(0, -'commit;'.length));
  check(`${name}: the read-back inserts and deletes realistic rows, and sets no role`, /insert into studio\./.test(f.readBack) && /delete from studio\./.test(f.readBack) && !/set role/i.test(f.readBack));
  const pg = await fresh();
  // The reset needs the free picture's table (0055_ephelion_scene.sql, applied in production).
  if (name === '0056_ephelion_scene_reset.sql') await pg.exec(parts('supabase/migrations/0055_ephelion_scene.sql').mig);
  // An existing storyboard publication, as production may hold by then.
  if (name === '0054_voice_takes.sql') {
    await pg.exec(`insert into studio.voice_drafts (id, fid, kind, speech_id, preset_id, recipe) values ('11111111-1111-4111-8111-111111111111', 6786, 'reading', 'doing-fine-v2', 'ephelion-warm-lecturer', '{"provider":"elevenlabs","model":"m"}');
      insert into studio.voice_publications (draft_id, fid, board_version, recipe, files) values ('11111111-1111-4111-8111-111111111111', 6786, 1, '{"voice":{},"shots":[],"closing":{}}', '[{"key":"storyboards/x/a","sha256":"a"},{"key":"storyboards/x/b","sha256":"b"}]');`).catch((e) => check('setup: a storyboard row', false, String(e)));
  }
  const before = await shape(pg, [...tables]);
  await pg.exec(f.dry);
  check(`${name}: the dry run leaves everything as it was`, (await shape(pg, [...tables])) === before);
  const b1 = await tryExec(pg, f.mig);
  const b2 = await tryExec(pg, f.mig);
  check(`${name}: the migration applies, and applies again`, b1.ok && b2.ok, b1.why || b2.why);
  if (name === '0054_voice_takes.sql') {
    const old = (await pg.query<{ kind: string; n: number }>(`select kind, count(*)::int n from studio.voice_publications group by kind`)).rows;
    check(`${name}: the existing storyboard is a storyboard, untouched`, old.length === 1 && old[0].kind === 'storyboard' && old[0].n === 1);
  }
  const count = async () => JSON.stringify((await pg.query(`select (select count(*) from studio.voice_publications)::int p, (select count(*) from studio.voice_drafts)::int d${tables[0] !== 'voice_publications' ? ', (select count(*) from studio.ephelion_scene_pictures)::int s' : ''}${tables[0] === 'ephelion_scene_resets' ? ', (select count(*) from studio.ephelion_scene_resets)::int r' : ''}`)).rows[0]);
  const c0 = await count();
  const rb = await tryExec(pg, f.readBack);
  check(`${name}: the read-back passes and keeps nothing`, rb.ok && (await count()) === c0, rb.why || `${c0} -> ${await count()}`);
  for (const [label, fault, heal] of plant) {
    await pg.exec(fault);
    const r = await tryExec(pg, f.readBack);
    await pg.exec(heal || f.mig);
    check(`${name}: proof: the read-back catches it when ${label}`, !r.ok);
  }
  // The undo: refused once a take (a free picture) exists; otherwise the shape before.
  if (name === '0054_voice_takes.sql') {
    await pg.exec(`insert into studio.voice_drafts (id, fid, kind, speech_id, preset_id, recipe) values ('22222222-2222-4222-8222-222222222222', 6786, 'performance', 'doing-fine-v2', 'ephelion-warm-lecturer', '{"provider":"elevenlabs","model":"m","takes":[{"takeSha256":"c"}]}');`);
    const id = '33333333-3333-4333-8333-333333333333';
    const a = 'a'.repeat(64), b = 'b'.repeat(64);
    await pg.exec(`select studio.publish_voice_take('${id}', '22222222-2222-4222-8222-222222222222', 6786, true, '{"voice":{},"speech":{"id":"doing-fine-v2"},"spoken":{}}', '{"source":"preset","scene":"study","key":"takes/${id}/picture-${b}.jpg","sha256":"${b}"}', '[{"key":"takes/${id}/speech-${a}.mp3","sha256":"${a}"},{"key":"takes/${id}/picture-${b}.jpg","sha256":"${b}"}]', false);`);
    const refused = !(await tryExec(pg, f.undo)).ok;
    check(`${name}: the undo is refused once a take has been entered`, refused);
    await pg.exec(`delete from studio.voice_publications where kind = 'take';`);
  } else if (name === '0056_ephelion_scene_reset.sql') {
    await pg.exec(`insert into studio.ephelion_scene_pictures (person, made_at, picture_sha256) values (6786, now(), '${'c'.repeat(64)}'); select studio.reset_free_scene(6786, 6786);`);
    check(`${name}: the undo is refused once a free picture has been reset`, !(await tryExec(pg, f.undo)).ok);
    await pg.exec(`delete from studio.ephelion_scene_resets;`);
  } else {
    await pg.exec(`insert into studio.ephelion_scene_pictures (person, made_at, picture_sha256) values (6786, now(), '${'c'.repeat(64)}');`);
    check(`${name}: the undo is refused once a free picture has been made`, !(await tryExec(pg, f.undo)).ok);
    await pg.exec(`delete from studio.ephelion_scene_pictures;`);
  }
  const u = await tryExec(pg, f.undo);
  check(`${name}: the undo puts back the shape before`, u.ok && (await shape(pg, [...tables])) === before, u.why);
}
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
