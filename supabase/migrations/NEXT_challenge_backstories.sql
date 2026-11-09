-- NEXT_challenge_backstories.sql: backstories added later to pictures already published (branch challenge-models,
-- owner, 2026-11-09). NOT APPLIED. Unnumbered until merge: it takes the next free number then, checked against
-- origin/main and production (CLAUDE.md). Requires 0001_core (studio.element_versions). Drafted by the coding agent
-- (Claude, a closed model by Anthropic). Tested by `npm run test:challenge-backstories-sql` (in-memory Postgres, the
-- parts read from this file).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: a read-only select, then a do block that checks studio_writer's privileges and
-- inserts and deletes a realistic row as postgres; it sets no role, since postgres can't switch roles in the SQL Editor;
-- it ends "READ-BACK PASSED"), and D. the undo, only if the release is withdrawn. Safe to run twice.
--
-- What it is for. A challenge picture's backstory (its maker's own words, at most 400 characters) goes in its version's
-- body when it is published. A picture already published can't take one there: element_versions is append-only. So an
-- admin's "Add backstory" on their own published challenge picture or first remix writes one row here, keyed by the
-- version: the picture's page, id, version and lineage (links, recipe) stay exactly as they are. The site writes and
-- reads rows as studio_writer; it never changes or deletes one (a new row replaces an older one on the page). Nothing is
-- public: the page reads it through the site.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.challenge_backstories (
  id bigserial primary key,
  version_id uuid not null references studio.element_versions (id),
  text text not null check (char_length(btrim(text)) between 1 and 400),
  spoils boolean not null default false,
  added_by bigint not null,
  added_at timestamptz not null default now()
);
create index if not exists challenge_backstories_version on studio.challenge_backstories (version_id, added_at);
alter table studio.challenge_backstories enable row level security;
drop policy if exists writer_insert on studio.challenge_backstories;
create policy writer_insert on studio.challenge_backstories for insert to studio_writer with check (true);
drop policy if exists writer_read on studio.challenge_backstories;
create policy writer_read on studio.challenge_backstories for select to studio_writer using (true);
revoke all on studio.challenge_backstories from anon, authenticated;
grant select, insert on studio.challenge_backstories to studio_writer;
revoke update, delete, truncate on studio.challenge_backstories from studio_writer;
grant usage on sequence studio.challenge_backstories_id_seq to studio_writer;
rollback;

-- B. THE MIGRATION.
begin;
create table if not exists studio.challenge_backstories (
  id bigserial primary key,
  version_id uuid not null references studio.element_versions (id),
  text text not null check (char_length(btrim(text)) between 1 and 400),
  spoils boolean not null default false,
  added_by bigint not null,
  added_at timestamptz not null default now()
);
create index if not exists challenge_backstories_version on studio.challenge_backstories (version_id, added_at);
alter table studio.challenge_backstories enable row level security;
drop policy if exists writer_insert on studio.challenge_backstories;
create policy writer_insert on studio.challenge_backstories for insert to studio_writer with check (true);
drop policy if exists writer_read on studio.challenge_backstories;
create policy writer_read on studio.challenge_backstories for select to studio_writer using (true);
revoke all on studio.challenge_backstories from anon, authenticated;
grant select, insert on studio.challenge_backstories to studio_writer;
revoke update, delete, truncate on studio.challenge_backstories from studio_writer;
grant usage on sequence studio.challenge_backstories_id_seq to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Two parts, nothing is kept. Paste the lines below without their "-- ".
-- (a) one read-only select: every row's ok must be true (4 rows).
-- select n, what, ok from (values
--   (1, 'challenge_backstories exists, keyed by a version',
--     exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'challenge_backstories' and column_name = 'version_id' and data_type = 'uuid' and is_nullable = 'NO')),
--   (2, 'a backstory is 1 to 400 characters',
--     coalesce((select string_agg(pg_get_constraintdef(oid), ' ') from pg_constraint where conrelid = 'studio.challenge_backstories'::regclass and contype = 'c'), '') ~ '400'),
--   (3, 'studio_writer can insert and read, not update or delete',
--     has_table_privilege('studio_writer', 'studio.challenge_backstories', 'insert') and has_table_privilege('studio_writer', 'studio.challenge_backstories', 'select')
--     and not has_table_privilege('studio_writer', 'studio.challenge_backstories', 'update') and not has_table_privilege('studio_writer', 'studio.challenge_backstories', 'delete')),
--   (4, 'anon and authenticated have nothing on challenge_backstories',
--     not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, 'studio.challenge_backstories', p)))
-- ) as t(n, what, ok) order by n;
-- (b) one do block: studio_writer's privileges checked; a realistic backstory on an existing version inserted as
--     postgres, read back, a too-long one refused, then deleted. Ends "READ-BACK PASSED"; each check raises
--     "READ-BACK FAILED: …" on failure.
-- do $$
-- declare
--   v uuid;
--   n int;
--   refused boolean;
-- begin
--   if not has_table_privilege('studio_writer', 'studio.challenge_backstories', 'insert') then raise exception 'READ-BACK FAILED: studio_writer cannot add a backstory'; end if;
--   if has_table_privilege('studio_writer', 'studio.challenge_backstories', 'update') or has_table_privilege('studio_writer', 'studio.challenge_backstories', 'delete') then raise exception 'READ-BACK FAILED: studio_writer can change or delete backstories'; end if;
--   select id into v from studio.element_versions order by created_at limit 1;
--   if v is null then raise exception 'READ-BACK FAILED: needs a version to test on'; end if;
--   insert into studio.challenge_backstories (version_id, text, spoils, added_by) values (v, 'She left the tower at dawn and never looked back.', true, 2147483646);
--   select count(*) into n from studio.challenge_backstories where version_id = v and added_by = 2147483646 and spoils;
--   if n <> 1 then raise exception 'READ-BACK FAILED: the backstory read back % rows', n; end if;
--   refused := false;
--   begin insert into studio.challenge_backstories (version_id, text, added_by) values (v, repeat('x', 401), 2147483646);
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a backstory over 400 characters was accepted'; end if;
--   delete from studio.challenge_backstories where added_by = 2147483646;
--   select count(*) into n from studio.challenge_backstories where added_by = 2147483646;
--   if n <> 0 then raise exception 'READ-BACK FAILED: % test rows left after the delete', n; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;

-- D. UNDO (only if this release is withdrawn, after the site no longer reads the table). Paste without the "-- ".
-- Every backstory added later is lost (backstories written at publish stay in their versions' bodies).
-- begin;
-- drop table if exists studio.challenge_backstories;
-- commit;
