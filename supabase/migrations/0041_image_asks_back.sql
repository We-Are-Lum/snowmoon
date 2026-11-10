-- 0041_image_asks_back.sql: pictures given back to the day's count (branch challenge-models, owner, 2026-11-09).
-- APPLIED on production by the owner on 2026-11-09 (parts B and C: the migration, the read-back's select all true and
-- "READ-BACK PASSED"); confirmed read-only by the coding agent the same evening as studio_writer: studio.image_asks_back
-- exists (2 columns), studio_writer can insert and select, not update or delete. Numbered 0041 at merge (#137).
-- Requires 0008_images (studio.image_asks). Drafted by the coding agent (Claude, a closed model by
-- Anthropic). Tested by `npm run test:image-asks-back-sql` (in-memory Postgres, the parts read from this file).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: a read-only select, then a do block that inserts a realistic row as the site
-- writes it and deletes it; it ends "READ-BACK PASSED"), and D. the undo, only if the release is withdrawn. Safe to
-- run twice.
--
-- What it is for. When fal's safety checker blocks a challenge picture made with the open model (FLUX), the owner
-- decided it uses none of the person's free pictures that day; its cost still counts against the spending caps.
-- studio.image_asks is append-only for the site (studio_writer can't update or delete it), so the picture can't be
-- taken off it: this adds studio.image_asks_back, one row per picture given back (the person number and the time,
-- nothing else, as image_asks keeps), and the site subtracts today's rows from today's count
-- (src/lib/images/limits.ts generationsLeft). Append-only for the site too. Privacy §4 already covers it ("How many
-- images ... you make each day, to count the daily limits"). Until this is applied the site doesn't read or write the
-- table, and a blocked picture counts, as before: nothing breaks, but the give-back only works once this is applied.
-- Nothing public changes: the table is unreadable to anon and authenticated.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.image_asks_back (
  fid bigint not null,
  at timestamptz not null default now()
);
create index if not exists image_asks_back_fid_at on studio.image_asks_back (fid, at);
alter table studio.image_asks_back enable row level security;
drop policy if exists writer_insert on studio.image_asks_back;
create policy writer_insert on studio.image_asks_back for insert to studio_writer with check (true);
drop policy if exists writer_read on studio.image_asks_back;
create policy writer_read on studio.image_asks_back for select to studio_writer using (true);
grant select, insert on studio.image_asks_back to studio_writer;
revoke update, delete, truncate on studio.image_asks_back from studio_writer;
revoke all on studio.image_asks_back from anon, authenticated;
rollback;

-- B. THE MIGRATION.
begin;
create table if not exists studio.image_asks_back (
  fid bigint not null,
  at timestamptz not null default now()
);
create index if not exists image_asks_back_fid_at on studio.image_asks_back (fid, at);
alter table studio.image_asks_back enable row level security;
drop policy if exists writer_insert on studio.image_asks_back;
create policy writer_insert on studio.image_asks_back for insert to studio_writer with check (true);
drop policy if exists writer_read on studio.image_asks_back;
create policy writer_read on studio.image_asks_back for select to studio_writer using (true);
grant select, insert on studio.image_asks_back to studio_writer;
revoke update, delete, truncate on studio.image_asks_back from studio_writer;
revoke all on studio.image_asks_back from anon, authenticated;
commit;

-- C. READ-BACK (after B), as postgres. Two parts, nothing is kept. Paste the lines below without their "-- ".
-- (a) one read-only select: every row's ok must be true (4 rows).
-- select n, what, ok from (values
--   (1, 'image_asks_back has fid (bigint, not null) and at (timestamptz, not null, default now())',
--     (select count(*) from information_schema.columns where table_schema = 'studio' and table_name = 'image_asks_back'
--       and ((column_name = 'fid' and data_type = 'bigint' and is_nullable = 'NO') or (column_name = 'at' and data_type like 'timestamp with time zone' and is_nullable = 'NO' and column_default like 'now()%'))) = 2),
--   (2, 'row level security is on, and the index for the day''s count is there',
--     (select relrowsecurity from pg_class where oid = 'studio.image_asks_back'::regclass) and exists (select 1 from pg_indexes where schemaname = 'studio' and tablename = 'image_asks_back' and indexname = 'image_asks_back_fid_at')),
--   (3, 'studio_writer can insert and read, and can''t update, delete or truncate',
--     has_table_privilege('studio_writer', 'studio.image_asks_back', 'INSERT') and has_table_privilege('studio_writer', 'studio.image_asks_back', 'SELECT')
--       and not has_table_privilege('studio_writer', 'studio.image_asks_back', 'UPDATE') and not has_table_privilege('studio_writer', 'studio.image_asks_back', 'DELETE') and not has_table_privilege('studio_writer', 'studio.image_asks_back', 'TRUNCATE')),
--   (4, 'anon and authenticated have nothing on image_asks_back',
--     not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, 'studio.image_asks_back', p)))
-- ) as t(n, what, ok) order by n;
-- (b) one do block: two pictures today and one given back, inserted as postgres as the site writes them, read back with
--     the site's count (2 made, 1 given back: 1 used); then deleted. The person number 2147483646 fits the column and
--     belongs to no account. Ends "READ-BACK PASSED"; each check raises "READ-BACK FAILED: …" on failure. It sets no
--     role (postgres can't switch roles in the SQL Editor).
-- do $$
-- declare
--   n int;
-- begin
--   insert into studio.image_asks (fid) values (2147483646), (2147483646);
--   insert into studio.image_asks_back (fid) values (2147483646);
--   select (select count(*)::int from studio.image_asks where fid = 2147483646 and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')
--        - (select count(*)::int from studio.image_asks_back where fid = 2147483646 and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc') into n;
--   if n <> 1 then raise exception 'READ-BACK FAILED: the count after one given back is %, not 1', n; end if;
--   delete from studio.image_asks_back where fid = 2147483646;
--   delete from studio.image_asks where fid = 2147483646;
--   select (select count(*)::int from studio.image_asks where fid = 2147483646) + (select count(*)::int from studio.image_asks_back where fid = 2147483646) into n;
--   if n <> 0 then raise exception 'READ-BACK FAILED: % test rows left after the delete', n; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;

-- D. UNDO (only if this release is withdrawn). Paste without the "-- ".
-- The site stops giving pictures back by itself once the table is gone (it checks for it).
-- The rows given back are lost, so today's blocked pictures count again.
-- begin;
-- drop table if exists studio.image_asks_back;
-- commit;
