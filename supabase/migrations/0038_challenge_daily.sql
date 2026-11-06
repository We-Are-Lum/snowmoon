-- 0038_challenge_daily.sql (was NEXT_challenge_daily.sql) — one remix challenge submission per person per Pacific day (branch contest, 2026-11-04).
-- APPLIED on production by the owner on 2026-11-06 (SQL pack items 3, 4, 6: dry run clean, applied, read-back (a) all
-- true, read-back (b) passed).
-- Numbered at merge (CLAUDE.md). Requires 0033_remix_challenge.sql (studio.challenge_marks). Drafted by the coding
-- agent (Claude, a closed model by Anthropic).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Three parts, in order:
-- 1. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), 2. the migration (ending in
-- `commit;`), 3. the read-back (after commit; it inserts a realistic submission, withdraws it, checks it, and deletes it).
-- Safe to run twice.
--
-- What it is for. Submit's rule becomes one submission per person per Pacific day (America/Los_Angeles), with no total
-- cap, in place of "up to three in total". Withdrawing doesn't give back that day's submission, so a withdrawn
-- submission must stay on record: a withdraw sets `withdrawn_at` on its row instead of deleting it. The day's count is
-- every row of that person whose `marked_at` falls on today's Pacific date, withdrawn or not.
-- - studio.challenge_marks gets `withdrawn_at` (null while the submission stands), never before `marked_at`.
-- - studio_writer may update that one column, and only on a row not yet withdrawn, to a time (it can't un-withdraw
--   or change anything else). No delete (if NEXT_challenge_submit.sql was run, its delete grant and policy are taken
--   back: the contest's code never deletes a submission).
-- - An index for the day's count.
-- Nothing else changes: no public access; insert and select as 0033 left them.
--
-- Safe with today's live code (main, 2026-11-04): main inserts into and reads studio.challenge_marks ("Mark as my
-- entry", admins only while CHALLENGE.public is off) naming its columns, never deletes or updates; a new nullable
-- column, a column grant, an update policy and an index change none of that. Main doesn't read `withdrawn_at`, but no
-- row is withdrawn until the contest's code runs.

-- 1. The dry run: everything below, then rollback. Expect no error.
begin;
alter table studio.challenge_marks add column if not exists withdrawn_at timestamptz;
alter table studio.challenge_marks drop constraint if exists challenge_marks_withdrawn_after_marked;
alter table studio.challenge_marks add constraint challenge_marks_withdrawn_after_marked check (withdrawn_at is null or withdrawn_at >= marked_at);
create index if not exists challenge_marks_day on studio.challenge_marks (challenge, fid, marked_at);
drop policy if exists writer_delete on studio.challenge_marks;
drop policy if exists writer_withdraw on studio.challenge_marks;
create policy writer_withdraw on studio.challenge_marks for update to studio_writer using (withdrawn_at is null) with check (withdrawn_at is not null);
revoke update, delete, truncate on studio.challenge_marks from studio_writer;
grant update (withdrawn_at) on studio.challenge_marks to studio_writer;
rollback;

-- 2. The migration.
begin;
alter table studio.challenge_marks add column if not exists withdrawn_at timestamptz;
alter table studio.challenge_marks drop constraint if exists challenge_marks_withdrawn_after_marked;
alter table studio.challenge_marks add constraint challenge_marks_withdrawn_after_marked check (withdrawn_at is null or withdrawn_at >= marked_at);
create index if not exists challenge_marks_day on studio.challenge_marks (challenge, fid, marked_at);
drop policy if exists writer_delete on studio.challenge_marks;
drop policy if exists writer_withdraw on studio.challenge_marks;
create policy writer_withdraw on studio.challenge_marks for update to studio_writer using (withdrawn_at is null) with check (withdrawn_at is not null);
revoke update, delete, truncate on studio.challenge_marks from studio_writer;
grant update (withdrawn_at) on studio.challenge_marks to studio_writer;
commit;

-- 3. The read-back (after commit), as postgres. Two parts: (a) one read-only select, every row's ok true; (b) a do block
-- that ends with the notice "READ-BACK PASSED" (or stops with "READ-BACK FAILED: …"), leaving no row behind.
-- (a)
-- select n, what, ok from (
--   select 1 as n, 'studio_writer: select and insert on challenge_marks' as what, has_table_privilege('studio_writer', 'studio.challenge_marks', 'SELECT') and has_table_privilege('studio_writer', 'studio.challenge_marks', 'INSERT') as ok
--   union all select 2, 'studio_writer: update of withdrawn_at only', has_column_privilege('studio_writer', 'studio.challenge_marks', 'withdrawn_at', 'UPDATE') and not has_table_privilege('studio_writer', 'studio.challenge_marks', 'UPDATE') and not has_column_privilege('studio_writer', 'studio.challenge_marks', 'version_id', 'UPDATE') and not has_column_privilege('studio_writer', 'studio.challenge_marks', 'marked_at', 'UPDATE')
--   union all select 3, 'studio_writer: no delete or truncate', not (has_table_privilege('studio_writer', 'studio.challenge_marks', 'DELETE') or has_table_privilege('studio_writer', 'studio.challenge_marks', 'TRUNCATE'))
--   union all select 4, 'the withdraw policy, for studio_writer only', exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'challenge_marks' and policyname = 'writer_withdraw' and cmd = 'UPDATE' and roles = '{studio_writer}')
--   union all select 5, 'challenge_marks'' three policies (read, insert, withdraw) are studio_writer''s only', (select count(*) from pg_policies where schemaname = 'studio' and tablename = 'challenge_marks' and roles = '{studio_writer}' and (policyname, cmd) in (('writer_read', 'SELECT'), ('writer_insert', 'INSERT'), ('writer_withdraw', 'UPDATE'))) = 3 and (select count(*) from pg_policies where schemaname = 'studio' and tablename = 'challenge_marks') = 3
--   union all select 6, 'withdrawn_at: a time, never before marked_at', exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'challenge_marks' and column_name = 'withdrawn_at' and data_type = 'timestamp with time zone' and is_nullable = 'YES') and exists (select 1 from pg_constraint where conrelid = 'studio.challenge_marks'::regclass and conname = 'challenge_marks_withdrawn_after_marked')
--   union all select 7, 'the index for the day''s count', exists (select 1 from pg_indexes where schemaname = 'studio' and tablename = 'challenge_marks' and indexname = 'challenge_marks_day')
--   union all select 8, 'row level security is still on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.challenge_marks')), false)
--   union all select 9, 'anon and authenticated have nothing', not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, 'studio.challenge_marks', p))
-- ) t order by n;
-- (b) A realistic submission (the test FID 2147483646 fits fid's type and no real account has it), on the newest
-- version, withdrawn as Withdraw does; the day's count still sees it; bad rows refused; then deleted.
-- do $$
-- declare v uuid; m bigint; n int; refused boolean;
-- begin
--   select id into v from studio.element_versions order by created_at desc limit 1;
--   if v is null then raise exception 'READ-BACK FAILED: needs one existing version to test on'; end if;
--   insert into studio.challenge_marks (challenge, fid, character, version_id) values ('remix-2026-11', 2147483646, 'bai', v) returning id into m;
--   update studio.challenge_marks set withdrawn_at = now() where id = m and withdrawn_at is null;
--   select count(*) into n from studio.challenge_marks where challenge = 'remix-2026-11' and fid = 2147483646
--     and (marked_at at time zone 'America/Los_Angeles')::date = (now() at time zone 'America/Los_Angeles')::date;
--   if n <> 1 or not exists (select 1 from studio.challenge_marks where id = m and withdrawn_at is not null) then raise exception 'READ-BACK FAILED: the withdrawn submission is not on record for the day'; end if;
--   refused := false;
--   begin update studio.challenge_marks set withdrawn_at = marked_at - interval '1 day' where id = m;
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a withdrawal before the submission was accepted'; end if;
--   refused := false;
--   begin insert into studio.challenge_marks (challenge, fid, character, version_id) values ('remix-2026-11', 2147483646, 'Bai!', v);
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a character that is not a slug was accepted'; end if;
--   delete from studio.challenge_marks where id = m;
--   if exists (select 1 from studio.challenge_marks where fid = 2147483646) then raise exception 'READ-BACK FAILED: test rows left behind'; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;
