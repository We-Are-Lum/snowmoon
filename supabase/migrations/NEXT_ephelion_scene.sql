-- NEXT_ephelion_scene.sql: the free picture of one's own scene in the Ephelion challenge, one per account (Nate,
-- 2026-11-26: "One free picture per account"; "A refused or failed picture doesn't use up the free one"; "a picture that
-- just came out wrong isn't redone for free"). Branch ephelion-takes. NOT APPLIED. It takes the next free number at
-- merge. Drafted by the coding agent (Claude, a closed model by Anthropic). Tested on in-memory PGlite (npm run
-- test:voice-takes-sql). Requires 0001 only.
--
-- MUST RUN AS postgres, in the Supabase SQL Editor. A. the dry run (ending in `rollback;`), B. the migration (ending in
-- `commit;`), C. the read-back (rights by has_*_privilege; a claim, a refused second, a release, a made picture and a
-- stale claim, then deleted, all in a transaction that ends in `rollback;`; it ends "READ-BACK PASSED"), D. the undo,
-- refused once any free picture has been made.
--
-- What it is for. studio.ephelion_scene_pictures: one row per account (a FID, or minus a wallet account's number, or a
-- Lens or Bluesky account's person number: never 0). The site claims the row before making the picture
-- (claim_free_scene, under the person's lock: a second request while one is being made is refused, not made), records
-- it once the picture has come back (finish_free_scene: made, for good), and gives the claim up if the picture is
-- refused or doesn't come back (release_free_scene: the free picture isn't used). A claim left by a request that never
-- finished frees itself after 10 minutes. It keeps only when and the picture's sha256, never the description.
-- studio_writer may read it and use the three functions; nothing else. The picture's cost counts in the site's daily
-- image budget (studio.image_costs, funded 'free') as every free picture does: that is the site's code, not this file.
--
-- Safe with today's live code: nothing reads or writes it yet.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.ephelion_scene_pictures (
  person bigint primary key check (person <> 0),
  started_at timestamptz not null default now(),
  made_at timestamptz,
  picture_sha256 text check (picture_sha256 ~ '^[0-9a-f]{64}$'),
  check ((made_at is null) = (picture_sha256 is null))
);
alter table studio.ephelion_scene_pictures enable row level security;
drop policy if exists writer_read on studio.ephelion_scene_pictures;
create policy writer_read on studio.ephelion_scene_pictures for select to studio_writer using (true);
revoke all on studio.ephelion_scene_pictures from public, anon, authenticated;
revoke all on studio.ephelion_scene_pictures from studio_writer;
grant select on studio.ephelion_scene_pictures to studio_writer;

-- Claim the free picture before making it: true for the one request that may make it; false if it is made, or another
-- request is making it (a claim younger than 10 minutes). One at a time per person, under that person's lock.
create or replace function studio.claim_free_scene(p_person bigint) returns boolean
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if p_person = 0 then raise exception 'no one' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('snowmoon.ephelion.scene'), p_person::int);
  delete from studio.ephelion_scene_pictures where person = p_person and made_at is null and started_at < now() - interval '10 minutes';
  insert into studio.ephelion_scene_pictures (person) values (p_person) on conflict (person) do nothing;
  return found;
end $fn$;
-- It came back: the free picture is made, for good.
create or replace function studio.finish_free_scene(p_person bigint, p_sha256 text) returns boolean
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  update studio.ephelion_scene_pictures set made_at = now(), picture_sha256 = p_sha256 where person = p_person and made_at is null;
  return found;
end $fn$;
-- Refused or didn't come back: the claim is given up, and the free picture isn't used.
create or replace function studio.release_free_scene(p_person bigint) returns boolean
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  delete from studio.ephelion_scene_pictures where person = p_person and made_at is null;
  return found;
end $fn$;
revoke all on function studio.claim_free_scene(bigint), studio.finish_free_scene(bigint, text), studio.release_free_scene(bigint) from public, anon, authenticated;
grant execute on function studio.claim_free_scene(bigint), studio.finish_free_scene(bigint, text), studio.release_free_scene(bigint) to studio_writer;
rollback;

-- B. MIGRATION.
begin;
create table if not exists studio.ephelion_scene_pictures (
  person bigint primary key check (person <> 0),
  started_at timestamptz not null default now(),
  made_at timestamptz,
  picture_sha256 text check (picture_sha256 ~ '^[0-9a-f]{64}$'),
  check ((made_at is null) = (picture_sha256 is null))
);
alter table studio.ephelion_scene_pictures enable row level security;
drop policy if exists writer_read on studio.ephelion_scene_pictures;
create policy writer_read on studio.ephelion_scene_pictures for select to studio_writer using (true);
revoke all on studio.ephelion_scene_pictures from public, anon, authenticated;
revoke all on studio.ephelion_scene_pictures from studio_writer;
grant select on studio.ephelion_scene_pictures to studio_writer;

-- Claim the free picture before making it: true for the one request that may make it; false if it is made, or another
-- request is making it (a claim younger than 10 minutes). One at a time per person, under that person's lock.
create or replace function studio.claim_free_scene(p_person bigint) returns boolean
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if p_person = 0 then raise exception 'no one' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('snowmoon.ephelion.scene'), p_person::int);
  delete from studio.ephelion_scene_pictures where person = p_person and made_at is null and started_at < now() - interval '10 minutes';
  insert into studio.ephelion_scene_pictures (person) values (p_person) on conflict (person) do nothing;
  return found;
end $fn$;
-- It came back: the free picture is made, for good.
create or replace function studio.finish_free_scene(p_person bigint, p_sha256 text) returns boolean
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  update studio.ephelion_scene_pictures set made_at = now(), picture_sha256 = p_sha256 where person = p_person and made_at is null;
  return found;
end $fn$;
-- Refused or didn't come back: the claim is given up, and the free picture isn't used.
create or replace function studio.release_free_scene(p_person bigint) returns boolean
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  delete from studio.ephelion_scene_pictures where person = p_person and made_at is null;
  return found;
end $fn$;
revoke all on function studio.claim_free_scene(bigint), studio.finish_free_scene(bigint, text), studio.release_free_scene(bigint) from public, anon, authenticated;
grant execute on function studio.claim_free_scene(bigint), studio.finish_free_scene(bigint, text), studio.release_free_scene(bigint) to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Paste the lines below without their "-- ". FID 2147483646 belongs to no one.
--
-- begin;
-- select p, has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', p) as writer, has_table_privilege('anon', 'studio.ephelion_scene_pictures', p) as anon
-- from unnest(array['select', 'insert', 'update', 'delete']) p order by 1;
-- do $$
-- declare p constant bigint := 2147483646;
-- begin
--   if not has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', 'select')
--     or has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', 'insert') or has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', 'update')
--     or has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', 'delete') or has_table_privilege('anon', 'studio.ephelion_scene_pictures', 'select')
--     or not has_function_privilege('studio_writer', 'studio.claim_free_scene(bigint)', 'execute') or has_function_privilege('anon', 'studio.claim_free_scene(bigint)', 'execute')
--     then raise exception 'READ-BACK FAILED: rights (studio_writer reads and uses the three functions; anon nothing)'; end if;
--   -- A claim, then a second request while it is being made: refused.
--   if not studio.claim_free_scene(p) then raise exception 'READ-BACK FAILED: the first claim was refused'; end if;
--   if studio.claim_free_scene(p) then raise exception 'READ-BACK FAILED: a second request was let in while the first was being made'; end if;
--   -- Refused or failed: released, and the free picture can still be made.
--   if not studio.release_free_scene(p) then raise exception 'READ-BACK FAILED: the claim could not be released'; end if;
--   if not studio.claim_free_scene(p) then raise exception 'READ-BACK FAILED: after a refused picture the free one was used'; end if;
--   -- It came back: made, for good; no further claim, and a made one can't be released.
--   if not studio.finish_free_scene(p, repeat('c', 64)) then raise exception 'READ-BACK FAILED: the picture could not be recorded'; end if;
--   if studio.claim_free_scene(p) or studio.release_free_scene(p) then raise exception 'READ-BACK FAILED: a made free picture could be claimed or released again'; end if;
--   -- A stale claim (older than 10 minutes, the request never finished) can be claimed again.
--   delete from studio.ephelion_scene_pictures where person = p;
--   insert into studio.ephelion_scene_pictures (person, started_at) values (p, now() - interval '11 minutes');
--   if not studio.claim_free_scene(p) then raise exception 'READ-BACK FAILED: a stale claim kept the free picture'; end if;
--   delete from studio.ephelion_scene_pictures where person = p;
--   if exists (select 1 from studio.ephelion_scene_pictures where person = p) then raise exception 'READ-BACK FAILED: the test row was not deleted'; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;
-- rollback;

-- D. UNDO, only if the release is withdrawn. Refused once any free picture has been made. Paste without the "-- ".
-- begin;
-- do $$ begin
--   if exists (select 1 from studio.ephelion_scene_pictures where made_at is not null) then raise exception 'UNDO REFUSED: free pictures have been made'; end if;
-- end $$;
-- drop function if exists studio.claim_free_scene(bigint);
-- drop function if exists studio.finish_free_scene(bigint, text);
-- drop function if exists studio.release_free_scene(bigint);
-- drop table if exists studio.ephelion_scene_pictures;
-- commit;
