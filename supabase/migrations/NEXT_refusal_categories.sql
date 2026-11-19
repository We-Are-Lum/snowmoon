-- NEXT_refusal_categories.sql: the day's count of prompt-check refusals, by category (branch refusal-reasons, owner
-- Nate, 2026-11-18). NOT YET APPLIED. Unnumbered until merge: it takes the next free number then, checked against
-- origin/main and production. Requires 0001 (the studio schema and studio_writer). Drafted by the coding agent (Claude,
-- a closed model by Anthropic). Tested by `npm run test:refusal-reasons` (in-memory Postgres, the parts read from this
-- file).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: a read-only select, then a do block that inserts a realistic row as the site
-- writes it and deletes it; it ends "READ-BACK PASSED"), and D. the undo, only if the release is withdrawn. Safe to
-- run twice. Additive: a new table; nothing that exists changes.
--
-- What it is for. When the prompt check (gpt-oss-safeguard-20b, config/prompts/image-guard.md) refuses a picture's
-- prompt, the site now says which rule (src/lib/images/refusal-wording.ts) and counts the refusal here: one row per
-- UTC day and category, with how many. Nothing about the person or the prompt: no person number, no time of day, no
-- row per refusal, as studio.image_costs keeps the day's costs (0008). The category is one the policy names, or
-- 'unclear' (no clear answer) or 'other' (a word the policy doesn't have); the site never stores the model's own word.
-- studio.image_costs can't hold it: its key has no category, and changing that key would change every row.
-- Until this is applied, the site checks for the table and skips the count; nothing breaks. Not publicly readable:
-- anon and authenticated have nothing on it; studio_writer can insert, read and update (to add one), not delete.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.image_refusals (
  day date not null default ((now() at time zone 'utc')::date),
  category text not null check (category ~ '^[a-z_]{1,40}$'),
  refusals int not null default 0 check (refusals >= 0),
  primary key (day, category)
);
alter table studio.image_refusals enable row level security;
drop policy if exists writer_insert on studio.image_refusals;
create policy writer_insert on studio.image_refusals for insert to studio_writer with check (true);
drop policy if exists writer_read on studio.image_refusals;
create policy writer_read on studio.image_refusals for select to studio_writer using (true);
drop policy if exists writer_update on studio.image_refusals;
create policy writer_update on studio.image_refusals for update to studio_writer using (true) with check (true);
grant select, insert, update on studio.image_refusals to studio_writer;
revoke delete, truncate on studio.image_refusals from studio_writer;
revoke all on studio.image_refusals from anon, authenticated;
rollback;

-- B. THE MIGRATION.
begin;
create table if not exists studio.image_refusals (
  day date not null default ((now() at time zone 'utc')::date),
  category text not null check (category ~ '^[a-z_]{1,40}$'),
  refusals int not null default 0 check (refusals >= 0),
  primary key (day, category)
);
alter table studio.image_refusals enable row level security;
drop policy if exists writer_insert on studio.image_refusals;
create policy writer_insert on studio.image_refusals for insert to studio_writer with check (true);
drop policy if exists writer_read on studio.image_refusals;
create policy writer_read on studio.image_refusals for select to studio_writer using (true);
drop policy if exists writer_update on studio.image_refusals;
create policy writer_update on studio.image_refusals for update to studio_writer using (true) with check (true);
grant select, insert, update on studio.image_refusals to studio_writer;
revoke delete, truncate on studio.image_refusals from studio_writer;
revoke all on studio.image_refusals from anon, authenticated;
commit;

-- C. READ-BACK (after B), as postgres. Two parts, nothing is kept. Paste the lines below without their "-- ".
-- (a) one read-only select: every row's ok must be true (4 rows).
-- select n, what, ok from (values
--   (1, 'image_refusals has day (date, default today in UTC), category (text) and refusals (int), all not null, and no other column',
--     (select count(*) from information_schema.columns where table_schema = 'studio' and table_name = 'image_refusals') = 3
--       and (select count(*) from information_schema.columns where table_schema = 'studio' and table_name = 'image_refusals' and is_nullable = 'NO'
--         and ((column_name = 'day' and data_type = 'date' and column_default like '%utc%') or (column_name = 'category' and data_type = 'text') or (column_name = 'refusals' and data_type = 'integer'))) = 3),
--   (2, 'row level security is on, and the key is (day, category)',
--     (select relrowsecurity from pg_class where oid = 'studio.image_refusals'::regclass)
--       and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'studio.image_refusals'::regclass and contype = 'p') = 'PRIMARY KEY (day, category)'),
--   (3, 'studio_writer can insert, read and update, and can''t delete or truncate',
--     has_table_privilege('studio_writer', 'studio.image_refusals', 'INSERT') and has_table_privilege('studio_writer', 'studio.image_refusals', 'SELECT') and has_table_privilege('studio_writer', 'studio.image_refusals', 'UPDATE')
--       and not has_table_privilege('studio_writer', 'studio.image_refusals', 'DELETE') and not has_table_privilege('studio_writer', 'studio.image_refusals', 'TRUNCATE')),
--   (4, 'anon and authenticated have nothing on image_refusals',
--     not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, 'studio.image_refusals', p)))
-- ) as t(n, what, ok) order by n;
-- (b) one do block: two "words" refusals counted as the site counts them (its insert, then the same insert again,
--     which adds one), read back as 2; a category the site would never write is refused by the check; then deleted.
--     The rows are on 2000-01-01, a day with no real rows, so today's counts are never touched. Ends "READ-BACK
--     PASSED"; each check raises "READ-BACK FAILED: …" on failure. It sets no role (postgres can't switch roles in the
--     SQL Editor).
-- do $$
-- declare
--   n int;
-- begin
--   if exists (select 1 from studio.image_refusals where day = date '2000-01-01') then raise exception 'READ-BACK FAILED: 2000-01-01 already has rows'; end if;
--   insert into studio.image_refusals (day, category, refusals) values (date '2000-01-01', 'words', 1)
--     on conflict (day, category) do update set refusals = studio.image_refusals.refusals + 1;
--   insert into studio.image_refusals (day, category, refusals) values (date '2000-01-01', 'words', 1)
--     on conflict (day, category) do update set refusals = studio.image_refusals.refusals + 1;
--   select refusals into n from studio.image_refusals where day = date '2000-01-01' and category = 'words';
--   if n is distinct from 2 then raise exception 'READ-BACK FAILED: two words refusals read back as %, not 2', n; end if;
--   begin
--     insert into studio.image_refusals (day, category, refusals) values (date '2000-01-01', 'Real person!', 1);
--     raise exception 'READ-BACK FAILED: a category the site never writes was accepted';
--   exception when check_violation then null;
--   end;
--   delete from studio.image_refusals where day = date '2000-01-01';
--   select count(*)::int into n from studio.image_refusals where day = date '2000-01-01';
--   if n <> 0 then raise exception 'READ-BACK FAILED: % test rows left after the delete', n; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;

-- D. UNDO (only if this release is withdrawn). Paste without the "-- ".
-- The site stops counting by itself once the table is gone (it checks for it). The counts are lost.
-- begin;
-- drop table if exists studio.image_refusals;
-- commit;
