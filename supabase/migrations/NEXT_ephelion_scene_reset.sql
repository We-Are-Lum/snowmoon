-- NEXT_ephelion_scene_reset.sql: an admin resets a person's free picture in the Ephelion challenge, for someone who loses
-- theirs (Nate, 2026-11-27: "an admin action that resets a person's free-picture claim ... admins only, decided on the
-- server ... logged with who and when"). Branch ephelion-takes. NOT YET APPLIED: for Nate to run. It keeps its NEXT_ name
-- until merge, then takes the next free number after NEXT_voice_takes.sql's and NEXT_ephelion_scene.sql's, checked against
-- origin/main and production. Drafted by the coding agent (Claude, a closed model by Anthropic). Tested on in-memory
-- PGlite (npm run test:voice-takes-sql). Requires NEXT_ephelion_scene.sql (applied).
--
-- MUST RUN AS postgres, in the Supabase SQL Editor. A. the dry run (ending in `rollback;`), B. the migration (ending in
-- `commit;`), C. the read-back (rights by has_*_privilege; a made picture reset and claimed again, a claim reset, nothing
-- to reset, a Lens or Bluesky number, refusals, the log's rows checked, then deleted, all in a transaction that ends in
-- `rollback;`; it ends "READ-BACK PASSED"), D. the undo, refused once anything has been reset.
--
-- What it is for. studio_writer can't delete from studio.ephelion_scene_pictures, and release_free_scene only removes a
-- claim not yet made, so a lost free picture can't be given back without this.
-- 1. studio.ephelion_scene_resets: the log, one row per reset: the person, the admin who reset it (by_fid), when, whether
--    the picture had been made, and its sha256 if so. Never the description. Insert-only: studio_writer may read it,
--    and only the function writes it; nothing for anon.
-- 2. studio.reset_free_scene(person, by): removes the person's row, made or not, under the same lock as the claim, and
--    logs it; false, and nothing logged, if there was nothing to reset. Which people may reset is the site's check
--    (admins, on the server, POST /api/voice/free-scene-reset), before it calls this. studio_writer may run it; nothing else.
--
-- Safe with today's live code: nothing calls it yet. Names checked free in production (read-only, 2026-11-27).

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.ephelion_scene_resets (
  id bigint generated always as identity primary key,
  person bigint not null check (person <> 0),
  by_fid bigint not null check (by_fid > 0),
  at timestamptz not null default now(),
  was_made boolean not null,
  picture_sha256 text check (picture_sha256 ~ '^[0-9a-f]{64}$'),
  check (was_made = (picture_sha256 is not null))
);
create index if not exists ephelion_scene_resets_person on studio.ephelion_scene_resets (person, at desc);
alter table studio.ephelion_scene_resets enable row level security;
drop policy if exists writer_read on studio.ephelion_scene_resets;
create policy writer_read on studio.ephelion_scene_resets for select to studio_writer using (true);
revoke all on studio.ephelion_scene_resets from public, anon, authenticated;
revoke all on studio.ephelion_scene_resets from studio_writer;
grant select on studio.ephelion_scene_resets to studio_writer;

-- Reset a person's free picture, made or not: their row goes, so they can claim one again, and the reset is logged with
-- who did it and when (and the picture's sha256 if it was made). False, and nothing logged, if there was nothing to reset.
-- Under the same lock as claim_free_scene. Who may reset (admins) is the site's check, before it calls this.
create or replace function studio.reset_free_scene(p_person bigint, p_by bigint) returns boolean
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare r record;
begin
  if p_person = 0 or p_by is null or p_by <= 0 then raise exception 'no one' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('snowmoon.ephelion.scene:' || p_person::text, 0));
  delete from studio.ephelion_scene_pictures where person = p_person returning made_at, picture_sha256 into r;
  if not found then return false; end if;
  insert into studio.ephelion_scene_resets (person, by_fid, was_made, picture_sha256) values (p_person, p_by, r.made_at is not null, r.picture_sha256);
  return true;
end $fn$;
revoke all on function studio.reset_free_scene(bigint, bigint) from public, anon, authenticated;
grant execute on function studio.reset_free_scene(bigint, bigint) to studio_writer;
rollback;

-- B. MIGRATION.
begin;
create table if not exists studio.ephelion_scene_resets (
  id bigint generated always as identity primary key,
  person bigint not null check (person <> 0),
  by_fid bigint not null check (by_fid > 0),
  at timestamptz not null default now(),
  was_made boolean not null,
  picture_sha256 text check (picture_sha256 ~ '^[0-9a-f]{64}$'),
  check (was_made = (picture_sha256 is not null))
);
create index if not exists ephelion_scene_resets_person on studio.ephelion_scene_resets (person, at desc);
alter table studio.ephelion_scene_resets enable row level security;
drop policy if exists writer_read on studio.ephelion_scene_resets;
create policy writer_read on studio.ephelion_scene_resets for select to studio_writer using (true);
revoke all on studio.ephelion_scene_resets from public, anon, authenticated;
revoke all on studio.ephelion_scene_resets from studio_writer;
grant select on studio.ephelion_scene_resets to studio_writer;

-- Reset a person's free picture, made or not: their row goes, so they can claim one again, and the reset is logged with
-- who did it and when (and the picture's sha256 if it was made). False, and nothing logged, if there was nothing to reset.
-- Under the same lock as claim_free_scene. Who may reset (admins) is the site's check, before it calls this.
create or replace function studio.reset_free_scene(p_person bigint, p_by bigint) returns boolean
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare r record;
begin
  if p_person = 0 or p_by is null or p_by <= 0 then raise exception 'no one' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('snowmoon.ephelion.scene:' || p_person::text, 0));
  delete from studio.ephelion_scene_pictures where person = p_person returning made_at, picture_sha256 into r;
  if not found then return false; end if;
  insert into studio.ephelion_scene_resets (person, by_fid, was_made, picture_sha256) values (p_person, p_by, r.made_at is not null, r.picture_sha256);
  return true;
end $fn$;
revoke all on function studio.reset_free_scene(bigint, bigint) from public, anon, authenticated;
grant execute on function studio.reset_free_scene(bigint, bigint) to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Paste the lines below without their "-- ". FIDs 2147483646 and 2147483645 belong to no one.
--
-- begin;
-- select t, p, has_table_privilege('studio_writer', t, p) as writer, has_table_privilege('anon', t, p) as anon
-- from unnest(array['studio.ephelion_scene_resets', 'studio.ephelion_scene_pictures']) t, unnest(array['select', 'insert', 'update', 'delete']) p order by 1, 2;
-- do $$
-- declare
--   p constant bigint := 2147483646;
--   admin constant bigint := 2147483645;
--   n int;
-- begin
--   if not has_table_privilege('studio_writer', 'studio.ephelion_scene_resets', 'select')
--     or has_table_privilege('studio_writer', 'studio.ephelion_scene_resets', 'insert') or has_table_privilege('studio_writer', 'studio.ephelion_scene_resets', 'update')
--     or has_table_privilege('studio_writer', 'studio.ephelion_scene_resets', 'delete') or has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', 'delete')
--     or has_table_privilege('anon', 'studio.ephelion_scene_resets', 'select')
--     or not has_function_privilege('studio_writer', 'studio.reset_free_scene(bigint, bigint)', 'execute') or has_function_privilege('anon', 'studio.reset_free_scene(bigint, bigint)', 'execute')
--     then raise exception 'READ-BACK FAILED: rights (studio_writer reads the log and can only run the function; anon nothing)'; end if;
--   -- A made free picture: no new claim; reset; a new claim is let in; logged with who, when and its sha256.
--   if not studio.claim_free_scene(p) or not studio.finish_free_scene(p, repeat('c', 64)) then raise exception 'READ-BACK FAILED: the test picture could not be made'; end if;
--   if studio.claim_free_scene(p) then raise exception 'READ-BACK FAILED: a made free picture could be claimed'; end if;
--   if not studio.reset_free_scene(p, admin) then raise exception 'READ-BACK FAILED: a made free picture could not be reset'; end if;
--   if not studio.claim_free_scene(p) then raise exception 'READ-BACK FAILED: after a reset no new claim was let in'; end if;
--   select count(*) into n from studio.ephelion_scene_resets where person = p and by_fid = admin and was_made and picture_sha256 = repeat('c', 64) and at > now() - interval '1 minute';
--   if n <> 1 then raise exception 'READ-BACK FAILED: the reset was not logged with who, when and the picture'; end if;
--   -- A claim still being made can be reset too (logged, not made); nothing to reset: false, nothing logged.
--   if not studio.reset_free_scene(p, admin) then raise exception 'READ-BACK FAILED: a claim being made could not be reset'; end if;
--   if studio.reset_free_scene(p, admin) then raise exception 'READ-BACK FAILED: a reset with nothing to reset said it reset'; end if;
--   select count(*) into n from studio.ephelion_scene_resets where person = p;
--   if n <> 2 then raise exception 'READ-BACK FAILED: % resets logged, expected 2 (the made one and the claim)', n; end if;
--   -- A Lens or Bluesky person number (outside int's range).
--   if not studio.claim_free_scene(-3147483646) or not studio.reset_free_scene(-3147483646, admin) or not studio.claim_free_scene(-3147483646) then raise exception 'READ-BACK FAILED: a Lens or Bluesky account could not be reset'; end if;
--   -- Refused: no one to reset, or no one resetting.
--   begin perform studio.reset_free_scene(0, admin); raise exception 'READ-BACK FAILED: a reset of person 0 was accepted'; exception when invalid_parameter_value then null; end;
--   begin perform studio.reset_free_scene(p, 0); raise exception 'READ-BACK FAILED: a reset by no one was accepted'; exception when invalid_parameter_value then null; end;
--   -- The log refuses a made reset with no picture.
--   begin insert into studio.ephelion_scene_resets (person, by_fid, was_made) values (p, admin, true); raise exception 'READ-BACK FAILED: a made reset with no picture was logged'; exception when check_violation then null; end;
--   delete from studio.ephelion_scene_pictures where person in (p, -3147483646);
--   delete from studio.ephelion_scene_resets where person in (p, -3147483646);
--   if exists (select 1 from studio.ephelion_scene_resets where person in (p, -3147483646)) or exists (select 1 from studio.ephelion_scene_pictures where person in (p, -3147483646))
--     then raise exception 'READ-BACK FAILED: the test rows were not deleted'; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;
-- rollback;

-- D. UNDO, only if the release is withdrawn. Refused once anything has been reset. Paste without the "-- ".
-- begin;
-- do $$ begin
--   if exists (select 1 from studio.ephelion_scene_resets) then raise exception 'UNDO REFUSED: free pictures have been reset'; end if;
-- end $$;
-- drop function if exists studio.reset_free_scene(bigint, bigint);
-- drop table if exists studio.ephelion_scene_resets;
-- commit;
