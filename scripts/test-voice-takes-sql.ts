/**
 * NEXT_voice_takes.sql and NEXT_ephelion_scene.sql on an in-memory Postgres (PGlite) with every numbered migration on this
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
  for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await pg.exec(read(`supabase/migrations/${f}`));
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
  ['supabase/migrations/NEXT_voice_takes.sql', ['voice_publications'], [
    ['studio_writer may insert publications', 'grant insert on studio.voice_publications to studio_writer;', 'revoke insert on studio.voice_publications from studio_writer;'],
    ['anon may enter a take', 'grant execute on function studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb, boolean) to anon;', 'revoke execute on function studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb, boolean) from anon;'],
    ['one live take per speech is gone', 'drop index studio.voice_publications_live_take;', `create unique index voice_publications_live_take on studio.voice_publications (fid, speech_id) where kind = 'take' and taken_down_at is null;`],
    ['the Ephelion check accepts any picture', `create or replace function studio.picture_is_of(p_version uuid, p_character text) returns boolean language sql stable security definer set search_path = studio, pg_temp as $f$ select true $f$;`, ''],
    ['hiding a picture no longer hides its takes', `create or replace function studio.hide_takes_using_picture(p_version uuid, p_by bigint, p_role text) returns table (publication_id uuid, key text) language plpgsql security definer set search_path = studio, pg_temp as $f$ begin return; end $f$;`, ''],
  ]],
  ['supabase/migrations/NEXT_ephelion_scene.sql', ['ephelion_scene_pictures'], [
    ['studio_writer may delete', 'grant delete on studio.ephelion_scene_pictures to studio_writer;', 'revoke delete on studio.ephelion_scene_pictures from studio_writer;'],
    ['one per account is gone', 'alter table studio.ephelion_scene_pictures drop constraint ephelion_scene_pictures_pkey;', 'alter table studio.ephelion_scene_pictures add primary key (person);'],
    ['a claim lets a second request in', `create or replace function studio.claim_free_scene(p_person bigint) returns boolean language plpgsql security definer set search_path = studio, pg_temp as $f$ begin insert into studio.ephelion_scene_pictures (person) values (p_person) on conflict (person) do nothing; return true; end $f$;`, ''],
  ]],
] as const) {
  const f = parts(file);
  const name = path.basename(file);
  check(`${name}: says who runs it; A ends in rollback, B in commit; C ends READ-BACK PASSED and rolls back; D is an undo`, /MUST RUN AS postgres/.test(f.text) && /Supabase SQL Editor/.test(f.text) && f.dry.startsWith('begin;') && f.dry.endsWith('rollback;') && f.mig.startsWith('begin;') && f.mig.endsWith('commit;') && /READ-BACK PASSED/.test(f.readBack) && f.readBack.trim().endsWith('rollback;') && /UNDO REFUSED/.test(f.undo));
  check(`${name}: the dry run is the migration word for word`, f.dry.slice(0, -'rollback;'.length) === f.mig.slice(0, -'commit;'.length));
  check(`${name}: the read-back inserts and deletes realistic rows, and sets no role`, /insert into studio\./.test(f.readBack) && /delete from studio\./.test(f.readBack) && !/set role/i.test(f.readBack));
  const pg = await fresh();
  // An existing storyboard publication, as production may hold by then.
  if (name === 'NEXT_voice_takes.sql') {
    await pg.exec(`insert into studio.voice_drafts (id, fid, kind, speech_id, preset_id, recipe) values ('11111111-1111-4111-8111-111111111111', 6786, 'reading', 'doing-fine-v2', 'ephelion-warm-lecturer', '{"provider":"elevenlabs","model":"m"}');
      insert into studio.voice_publications (draft_id, fid, board_version, recipe, files) values ('11111111-1111-4111-8111-111111111111', 6786, 1, '{"voice":{},"shots":[],"closing":{}}', '[{"key":"storyboards/x/a","sha256":"a"},{"key":"storyboards/x/b","sha256":"b"}]');`).catch((e) => check('setup: a storyboard row', false, String(e)));
  }
  const before = await shape(pg, [...tables]);
  await pg.exec(f.dry);
  check(`${name}: the dry run leaves everything as it was`, (await shape(pg, [...tables])) === before);
  const b1 = await tryExec(pg, f.mig);
  const b2 = await tryExec(pg, f.mig);
  check(`${name}: the migration applies, and applies again`, b1.ok && b2.ok, b1.why || b2.why);
  if (name === 'NEXT_voice_takes.sql') {
    const old = (await pg.query<{ kind: string; n: number }>(`select kind, count(*)::int n from studio.voice_publications group by kind`)).rows;
    check(`${name}: the existing storyboard is a storyboard, untouched`, old.length === 1 && old[0].kind === 'storyboard' && old[0].n === 1);
  }
  const count = async () => JSON.stringify((await pg.query(`select (select count(*) from studio.voice_publications)::int p, (select count(*) from studio.voice_drafts)::int d${tables[0] === 'ephelion_scene_pictures' ? ', (select count(*) from studio.ephelion_scene_pictures)::int s' : ''}`)).rows[0]);
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
  if (name === 'NEXT_voice_takes.sql') {
    await pg.exec(`insert into studio.voice_drafts (id, fid, kind, speech_id, preset_id, recipe) values ('22222222-2222-4222-8222-222222222222', 6786, 'performance', 'doing-fine-v2', 'ephelion-warm-lecturer', '{"provider":"elevenlabs","model":"m","takes":[{"takeSha256":"c"}]}');`);
    const id = '33333333-3333-4333-8333-333333333333';
    const a = 'a'.repeat(64), b = 'b'.repeat(64);
    await pg.exec(`select studio.publish_voice_take('${id}', '22222222-2222-4222-8222-222222222222', 6786, true, '{"voice":{},"speech":{"id":"doing-fine-v2"},"spoken":{}}', '{"source":"preset","scene":"study","key":"takes/${id}/picture-${b}.jpg","sha256":"${b}"}', '[{"key":"takes/${id}/speech-${a}.mp3","sha256":"${a}"},{"key":"takes/${id}/picture-${b}.jpg","sha256":"${b}"}]', false);`);
    const refused = !(await tryExec(pg, f.undo)).ok;
    check(`${name}: the undo is refused once a take has been entered`, refused);
    await pg.exec(`delete from studio.voice_publications where kind = 'take';`);
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
