-- 0053_storyboard_pictures.sql (was NEXT_storyboard_pictures.sql; numbered at merge, 2026-11-26: the next free number
-- after main's 0052, and no unmerged branch holds 0053): storyboard pictures' own allowance and pool (Nate, 2026-11-23,
-- branch voice-picture-allowance: "20 storyboard pictures a person a day on any model, a GPT picture counting as 1, in
-- their own allowance, and a $20-a-day storyboard pool"). APPLIED on production by Nate on 2026-11-24 (A, B and C at
-- once: Success; checked read-only on 2026-11-26: image_asks_pool accepts 'storyboard'). Drafted by the coding agent (Claude, a closed model by Anthropic); tested in PGlite by the
-- agent (npm run test:voice, every migration in order). Requires 0040_remix_model_choice.sql (studio.image_asks.pool)
-- and 0042_chapter_picture_versions.sql (studio.image_costs.funded with 'admin').
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (ending in `rollback;`), B. the migration (ending in `commit;`), C. the read-back (realistic rows
-- inserted, read and removed inside a transaction that ends in `rollback;`; it ends "READ-BACK PASSED"; studio_writer's
-- rights are read by definition, as the SQL Editor can't SET ROLE), and D. the undo, only if the release is withdrawn.
-- Safe to run twice.
--
-- What it changes. Two allowed-value lists, nothing else: no new table, no new right, nothing readable by anon or
-- authenticated.
-- 1. studio.image_asks.pool may also be 'storyboard': one row per storyboard picture by someone who isn't an admin
--    (the person number and the time, as every row). The site counts these apart (VOICE.pictures.perPersonPerDay, each
--    1, any model) and leaves them out of the images' daily count; images are never in the storyboard count.
-- 2. studio.image_costs.funded may also be 'storyboard': the day's totals for storyboard pictures (no person, no row per
--    call, as every cost row), capped by VOICE.pictures.dailyPoolUsd, apart from the images' free cap, the closed cap,
--    the admins' pool and the remix challenge's.
-- Every row already there keeps its pool and its funding, so the site works the same before and after this runs.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
alter table studio.image_asks drop constraint if exists image_asks_pool;
alter table studio.image_asks add constraint image_asks_pool check (pool in ('open', 'closed', 'storyboard'));
alter table studio.image_costs drop constraint if exists image_costs_funded_check;
alter table studio.image_costs add constraint image_costs_funded_check check (funded in ('free', 'prepaid', 'admin', 'storyboard'));
rollback;

-- B. MIGRATION. Expect COMMIT.
begin;
alter table studio.image_asks drop constraint if exists image_asks_pool;
alter table studio.image_asks add constraint image_asks_pool check (pool in ('open', 'closed', 'storyboard'));
alter table studio.image_costs drop constraint if exists image_costs_funded_check;
alter table studio.image_costs add constraint image_costs_funded_check check (funded in ('free', 'prepaid', 'admin', 'storyboard'));
commit;

-- C. READ-BACK (after B), as postgres. Expect "READ-BACK PASSED".
begin;
do $$
declare n int; usd float8;
begin
  -- The two lists.
  if coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'studio.image_asks'::regclass and conname = 'image_asks_pool'), '') !~ 'open.*closed.*storyboard' then
    raise exception 'READ-BACK FAILED: image_asks.pool does not allow storyboard'; end if;
  if coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'studio.image_costs'::regclass and conname = 'image_costs_funded_check'), '') !~ 'free.*prepaid.*admin.*storyboard' then
    raise exception 'READ-BACK FAILED: image_costs.funded does not allow storyboard'; end if;
  -- Rights unchanged: studio_writer adds and reads asks (never changes or deletes them), and keeps the cost totals.
  if not has_table_privilege('studio_writer', 'studio.image_asks', 'insert') or not has_table_privilege('studio_writer', 'studio.image_asks', 'select') then
    raise exception 'READ-BACK FAILED: studio_writer lost a right on image_asks'; end if;
  if has_table_privilege('studio_writer', 'studio.image_asks', 'update') or has_table_privilege('studio_writer', 'studio.image_asks', 'delete') then
    raise exception 'READ-BACK FAILED: studio_writer can change or delete an ask'; end if;
  if not has_table_privilege('studio_writer', 'studio.image_costs', 'insert') or not has_table_privilege('studio_writer', 'studio.image_costs', 'update') then
    raise exception 'READ-BACK FAILED: studio_writer cannot keep the cost totals'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['studio.image_asks', 'studio.image_costs']) t where has_table_privilege(r, t, 'select') or has_table_privilege(r, t, 'insert')) then
    raise exception 'READ-BACK FAILED: anon or authenticated can read or write asks or costs'; end if;

  -- Realistic rows, as the site writes them: two storyboard pictures and an open image by one person (2147483646 fits
  -- the column and belongs to no account), and the storyboard pool's reserved and real costs.
  insert into studio.image_asks (fid, pool) values (2147483646, 'storyboard'), (2147483646, 'storyboard'), (2147483646, 'open');
  select count(*) into n from studio.image_asks where fid = 2147483646 and pool = 'storyboard' and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  if n <> 2 then raise exception 'READ-BACK FAILED: % storyboard asks counted, expected 2', n; end if;
  select count(*) into n from studio.image_asks where fid = 2147483646 and pool <> 'storyboard' and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  if n <> 1 then raise exception 'READ-BACK FAILED: % image asks counted, expected 1 (storyboard rows left out)', n; end if;
  insert into studio.image_costs (funded, kind, model, provider, verdict, calls, cost_usd) values
    ('storyboard', 'reserved', 'read-back-test-model', '', '', 1, 0.083),
    ('storyboard', 'image', 'read-back-test-model', 'vercel-ai-gateway', 'ok', 1, 0.073);
  select coalesce(sum(cost_usd), 0)::float8 into usd from studio.image_costs where day = (now() at time zone 'utc')::date and funded = 'storyboard' and model = 'read-back-test-model';
  if abs(usd - 0.156) > 0.0001 then raise exception 'READ-BACK FAILED: storyboard spend read back as %', usd; end if;
  -- Refused shapes: an unknown pool, an unknown funding.
  begin insert into studio.image_asks (fid, pool) values (2147483646, 'elsewhere'); raise exception 'READ-BACK FAILED: an unknown pool was accepted'; exception when check_violation then null; end;
  begin insert into studio.image_costs (funded, kind, model, provider, verdict, calls, cost_usd) values ('nobody', 'image', 'read-back-test-model', '', 'ok', 1, 0); raise exception 'READ-BACK FAILED: an unknown funding was accepted'; exception when check_violation then null; end;
  -- Removed (as postgres; the transaction also ends in rollback).
  delete from studio.image_asks where fid = 2147483646;
  delete from studio.image_costs where model = 'read-back-test-model';
  if exists (select 1 from studio.image_asks where fid = 2147483646) or exists (select 1 from studio.image_costs where model = 'read-back-test-model') then
    raise exception 'READ-BACK FAILED: the test rows were not removed'; end if;
  raise notice 'READ-BACK PASSED';
end $$;
rollback;

-- D. UNDO (only if the release is withdrawn, after the site no longer writes 'storyboard'), as postgres. Paste the lines
--    below without their "-- ". It refuses once any storyboard row exists (export and ask the owner first); otherwise it
--    puts both lists back as 0040 and 0042 left them.
-- begin;
-- do $$ begin
--   if exists (select 1 from studio.image_asks where pool = 'storyboard') or exists (select 1 from studio.image_costs where funded = 'storyboard') then
--     raise exception 'UNDO REFUSED: storyboard rows exist; nothing is changed'; end if;
-- end $$;
-- alter table studio.image_asks drop constraint if exists image_asks_pool;
-- alter table studio.image_asks add constraint image_asks_pool check (pool in ('open', 'closed'));
-- alter table studio.image_costs drop constraint if exists image_costs_funded_check;
-- alter table studio.image_costs add constraint image_costs_funded_check check (funded in ('free', 'prepaid', 'admin'));
-- commit;
