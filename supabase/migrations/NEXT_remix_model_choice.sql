-- NEXT_remix_model_choice.sql — closed models' own daily count per person (branch remix-model-choice, DRAFT,
-- 2026-11-04). NOT APPLIED. Unnumbered until merge: it takes the next free number then, checked against origin/main
-- and production (CLAUDE.md). Requires 0008 (studio.image_asks).
--
-- Why: a remixer may choose a closed model for a sheet's views (IMAGES.designs.modelChoice, off). A closed model's
-- picture counts in its own daily count (CLOSED_IMAGES.perPersonPerDay, 6), not in the open 10 a day. studio.image_asks
-- holds one row per Generate (the FID and the time, nothing else); this adds which pool the row counts in. Every row
-- already there, and every row the site writes without naming a pool, is 'open', so the site works the same before
-- and after this runs. The site-wide closed cap needs no change: it sums studio.image_costs by model, which it
-- already records.
--
-- MUST RUN AS postgres (the owner of the `studio` schema), in the Supabase SQL Editor. One transaction. Safe to run
-- twice. Dry run first: paste everything, but replace the final `commit;` with `rollback;`.
-- Must be applied before remix-model-choice merges: from then on the site reads the column while the switch is on.

begin;

alter table studio.image_asks
  add column if not exists pool text not null default 'open';
alter table studio.image_asks drop constraint if exists image_asks_pool;
alter table studio.image_asks add constraint image_asks_pool check (pool in ('open', 'closed'));
create index if not exists image_asks_fid_pool_at on studio.image_asks (fid, pool, at);

commit;

-- Read-back, two parts (after commit).
-- (a) the column, its default and its check; expect one row: pool | text | 'open'::text | NO | true
-- select c.column_name, c.data_type, c.column_default, c.is_nullable,
--   exists (select 1 from pg_constraint where conname = 'image_asks_pool' and conrelid = 'studio.image_asks'::regclass) as checked
--   from information_schema.columns c where c.table_schema = 'studio' and c.table_name = 'image_asks' and c.column_name = 'pool';
-- (b) realistic rows, as the site writes them (a closed view, an open one written without a pool), read back, a bad
--     pool refused, then deleted. The test fid 2147483646 fits fid's type (bigint); no real account has it.
--     Expect: closed | open, then "refused", then 0.
-- begin;
-- insert into studio.image_asks (fid, pool) values (2147483646, 'closed');
-- insert into studio.image_asks (fid) values (2147483646);
-- select string_agg(pool, ' | ' order by pool) from studio.image_asks where fid = 2147483646;
-- do $$ begin insert into studio.image_asks (fid, pool) values (2147483646, 'other'); raise exception 'accepted a bad pool';
--   exception when check_violation then raise notice 'refused'; end $$;
-- delete from studio.image_asks where fid = 2147483646;
-- commit;
-- select count(*) from studio.image_asks where fid = 2147483646;
