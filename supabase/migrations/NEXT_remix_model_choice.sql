-- NEXT_remix_model_choice.sql: which pool each daily picture counts in (branches remix-model-choice, 2026-11-04, and
-- challenge-models, 2026-11-08).
-- APPLIED on production by the owner on 2026-11-08 (part B run once, ok; read-back (a) all true). The do block of part C
-- first drafted failed there ("permission denied to set role studio_writer": postgres can't SET ROLE in the SQL Editor,
-- as 0030 notes); the coordinator's replacement (studio_writer's privileges checked, rows inserted and deleted as
-- postgres) is what ran, and is part C (b) below since 2026-11-09, word for word.
-- Was NOT APPLIED before 2026-11-08. Unnumbered until merge: it takes the next free number then, checked
-- against origin/main and production (CLAUDE.md). Requires 0008_images (studio.image_asks). Drafted by the coding agent
-- (Claude, a closed model by Anthropic). Tested by `npm run test:remix-model-choice-sql` (in-memory Postgres, the parts
-- read from this file).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: a read-only select, then a do block that inserts realistic rows as the site
-- writes them and deletes them; it ends "READ-BACK PASSED"), and D. the undo, only if the release is withdrawn. Safe
-- to run twice.
--
-- What it is for. The challenge's remix screen offers closed models (CHALLENGE.modelChoice). A closed model's picture
-- counts as 3 of the person's free pictures that day (CLOSED_IMAGES.countsAs; owner, 2026-11-08: the separate 6 a day
-- is gone): it is one row of studio.image_asks in pool 'closed', and the site counts it as 3. studio.image_asks holds
-- one row per Generate (the person number and the time, nothing else); this adds which pool the row counts in. Every
-- row already there, and every row the site writes without naming a pool, is 'open', so the site works the same before
-- and after this runs. The closed site-wide cap ($5) needs no change: it sums studio.image_costs by model.
-- Must be applied before challenge-models merges: from then on the site reads the column while the switch is on.
-- Nothing public changes: image_asks stays unreadable to anon and authenticated.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
alter table studio.image_asks add column if not exists pool text not null default 'open';
alter table studio.image_asks drop constraint if exists image_asks_pool;
alter table studio.image_asks add constraint image_asks_pool check (pool in ('open', 'closed'));
create index if not exists image_asks_fid_pool_at on studio.image_asks (fid, pool, at);
rollback;

-- B. THE MIGRATION.
begin;
alter table studio.image_asks add column if not exists pool text not null default 'open';
alter table studio.image_asks drop constraint if exists image_asks_pool;
alter table studio.image_asks add constraint image_asks_pool check (pool in ('open', 'closed'));
create index if not exists image_asks_fid_pool_at on studio.image_asks (fid, pool, at);
commit;

-- C. READ-BACK (after B), as postgres. Two parts, nothing is kept. Paste the lines below without their "-- ".
-- (a) one read-only select: every row's ok must be true (4 rows).
-- select n, what, ok from (values
--   (1, 'image_asks.pool is text, not null, default open',
--     exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'image_asks' and column_name = 'pool' and data_type = 'text' and is_nullable = 'NO' and column_default like '''open''%')),
--   (2, 'image_asks.pool is open or closed, nothing else',
--     coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'studio.image_asks'::regclass and conname = 'image_asks_pool'), '') ~ 'open.*closed'),
--   (3, 'the index for the day''s count by pool',
--     exists (select 1 from pg_indexes where schemaname = 'studio' and tablename = 'image_asks' and indexname = 'image_asks_fid_pool_at')),
--   (4, 'anon and authenticated have nothing on image_asks',
--     not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, 'studio.image_asks', p)))
-- ) as t(n, what, ok) order by n;
-- (b) one do block (the owner's, 2026-11-09, word for word; it is what ran on production on 2026-11-08): studio_writer's
--     privileges checked (it can write and read the pool, and can't update or delete rows); a closed picture and an open
--     one inserted as postgres, as the site writes them, read back with the site's weighted count (a closed row counts
--     3: 4 in all); a bad pool refused; then deleted. The person number 2147483646 fits the column and belongs to no
--     account. Ends "READ-BACK PASSED"; each check raises "READ-BACK FAILED: …" on failure. It sets no role (postgres
--     can't SET ROLE in the SQL Editor).
-- do $$
-- declare
--   n int;
--   refused boolean;
-- begin
--   if not has_column_privilege('studio_writer', 'studio.image_asks', 'pool', 'insert') then raise exception 'READ-BACK FAILED: studio_writer cannot write a pool'; end if;
--   if not has_column_privilege('studio_writer', 'studio.image_asks', 'pool', 'select') then raise exception 'READ-BACK FAILED: studio_writer cannot read the pool'; end if;
--   if has_table_privilege('studio_writer', 'studio.image_asks', 'update') or has_table_privilege('studio_writer', 'studio.image_asks', 'delete') then raise exception 'READ-BACK FAILED: studio_writer can change or delete rows'; end if;
--   insert into studio.image_asks (fid, pool) values (2147483646, 'closed');
--   insert into studio.image_asks (fid) values (2147483646);
--   select coalesce(sum(case when pool = 'closed' then 3 else 1 end), 0)::int into n from studio.image_asks
--     where fid = 2147483646 and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
--   if n <> 4 then raise exception 'READ-BACK FAILED: the weighted count is %, not 4', n; end if;
--   select count(*) into n from studio.image_asks where fid = 2147483646 and pool = 'open';
--   if n <> 1 then raise exception 'READ-BACK FAILED: a row written without a pool is not open (% open rows)', n; end if;
--   refused := false;
--   begin insert into studio.image_asks (fid, pool) values (2147483646, 'other');
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a pool other than open or closed was accepted'; end if;
--   delete from studio.image_asks where fid = 2147483646;
--   select count(*) into n from studio.image_asks where fid = 2147483646;
--   if n <> 0 then raise exception 'READ-BACK FAILED: % test rows left after the delete', n; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;

-- D. UNDO (only if this release is withdrawn, after the site no longer reads the column). Paste without the "-- ".
-- Every count goes back to one row per picture; the pool of rows already written is lost.
-- begin;
-- drop index if exists studio.image_asks_fid_pool_at;
-- alter table studio.image_asks drop constraint if exists image_asks_pool;
-- alter table studio.image_asks drop column if exists pool;
-- commit;
