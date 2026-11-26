-- NEXT_ephelion_scene.sql: the free picture of one's own scene in the Ephelion challenge, one per account (Nate,
-- 2026-11-26: "One free picture per account"; "A refused or failed picture doesn't use up the free one"). Branch
-- ephelion-takes. NOT APPLIED. It takes the next free number at merge, checked against origin/main and production.
-- Drafted by the coding agent (Claude, a closed model by Anthropic). Tested on in-memory PGlite against the branch's
-- migrations (npm run test:voice-takes-sql). Requires 0001 only.
--
-- MUST RUN AS postgres, in the Supabase SQL Editor. A. the dry run (ending in `rollback;`), B. the migration (ending in
-- `commit;`), C. the read-back (rights by has_table_privilege; a realistic row kept, a second refused, then deleted, all in
-- a transaction that ends in `rollback;`; it ends "READ-BACK PASSED"), D. the undo, refused once any free picture exists.
--
-- What it is for. studio.ephelion_scene_pictures: one row per account (a FID, or minus a wallet account's number, or a
-- Lens or Bluesky account's person number: never 0) that has made its free picture, written only once the picture has
-- come back, so a refused or failed one never counts; the primary key makes a second impossible. It keeps only when and
-- the picture's sha256, never the description. studio_writer may select and insert; nothing else. Not a pool in
-- studio.image_asks: those rows are written before the picture is made and given back per day (0041), which can't say
-- "one, ever, only if it came back". The cost still counts in studio.image_costs as every picture does.
--
-- Safe with today's live code: nothing reads or writes it yet.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.ephelion_scene_pictures (
  person bigint primary key check (person <> 0),
  made_at timestamptz not null default now(),
  picture_sha256 text not null check (picture_sha256 ~ '^[0-9a-f]{64}$')
);
alter table studio.ephelion_scene_pictures enable row level security;
drop policy if exists writer_read on studio.ephelion_scene_pictures;
create policy writer_read on studio.ephelion_scene_pictures for select to studio_writer using (true);
drop policy if exists writer_insert on studio.ephelion_scene_pictures;
create policy writer_insert on studio.ephelion_scene_pictures for insert to studio_writer with check (true);
revoke all on studio.ephelion_scene_pictures from public, anon, authenticated;
revoke all on studio.ephelion_scene_pictures from studio_writer;
grant select, insert on studio.ephelion_scene_pictures to studio_writer;
rollback;

-- B. MIGRATION.
begin;
create table if not exists studio.ephelion_scene_pictures (
  person bigint primary key check (person <> 0),
  made_at timestamptz not null default now(),
  picture_sha256 text not null check (picture_sha256 ~ '^[0-9a-f]{64}$')
);
alter table studio.ephelion_scene_pictures enable row level security;
drop policy if exists writer_read on studio.ephelion_scene_pictures;
create policy writer_read on studio.ephelion_scene_pictures for select to studio_writer using (true);
drop policy if exists writer_insert on studio.ephelion_scene_pictures;
create policy writer_insert on studio.ephelion_scene_pictures for insert to studio_writer with check (true);
revoke all on studio.ephelion_scene_pictures from public, anon, authenticated;
revoke all on studio.ephelion_scene_pictures from studio_writer;
grant select, insert on studio.ephelion_scene_pictures to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Paste the lines below without their "-- ". FID 2147483646 belongs to no one.
--
-- begin;
-- select p, has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', p) as writer, has_table_privilege('anon', 'studio.ephelion_scene_pictures', p) as anon
-- from unnest(array['select', 'insert', 'update', 'delete']) p order by 1;
-- do $$
-- declare refused boolean;
-- begin
--   if not (has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', 'select') and has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', 'insert'))
--     or has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', 'update') or has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', 'delete')
--     or has_table_privilege('anon', 'studio.ephelion_scene_pictures', 'select')
--     then raise exception 'READ-BACK FAILED: rights on ephelion_scene_pictures (studio_writer select and insert only, anon nothing)'; end if;
--   -- A person's free picture came back: kept once. A second is refused.
--   insert into studio.ephelion_scene_pictures (person, picture_sha256) values (2147483646, repeat('c', 64));
--   begin insert into studio.ephelion_scene_pictures (person, picture_sha256) values (2147483646, repeat('d', 64)); refused := false; exception when unique_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a second free picture for one account was accepted'; end if;
--   begin insert into studio.ephelion_scene_pictures (person, picture_sha256) values (0, repeat('c', 64)); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: person 0 was accepted'; end if;
--   delete from studio.ephelion_scene_pictures where person = 2147483646;
--   if exists (select 1 from studio.ephelion_scene_pictures where person = 2147483646) then raise exception 'READ-BACK FAILED: the test row was not deleted'; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;
-- rollback;

-- D. UNDO, only if the release is withdrawn. Refused once any free picture has been made. Paste without the "-- ".
-- begin;
-- do $$ begin
--   if exists (select 1 from studio.ephelion_scene_pictures) then raise exception 'UNDO REFUSED: free pictures have been made'; end if;
-- end $$;
-- drop table if exists studio.ephelion_scene_pictures;
-- commit;
