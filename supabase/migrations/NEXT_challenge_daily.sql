-- NEXT_challenge_daily.sql — one remix challenge submission per person per Pacific day (branch contest, 2026-11-04).
-- NOT APPLIED. Unnumbered until merge: it takes the next free number then, checked against origin/main and production
-- (CLAUDE.md). Requires 0033_remix_challenge.sql (studio.challenge_marks). Drafted by the coding agent (Claude, a
-- closed model by Anthropic); DRAFT until the owner approves it.
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

-- 3. The read-back (after commit), as postgres. Expect "NOTICE: read-back passed" and no row left behind.
-- It submits as studio_writer would (the test FID 2147483646 fits fid's type and no real account has it), on the newest
-- published version, withdraws it as Withdraw does, checks the day's count still sees it, that a second withdraw
-- changes nothing, that the writer can't change another column or delete, then deletes the row as postgres.
-- do $$
-- declare v uuid; m bigint; n int; denied boolean;
-- begin
--   select id into v from studio.element_versions order by created_at desc limit 1;
--   if v is null then raise exception 'READ-BACK FAILED: no version to submit'; end if;
--   if not has_column_privilege('studio_writer', 'studio.challenge_marks', 'withdrawn_at', 'UPDATE') then raise exception 'READ-BACK FAILED: studio_writer cannot withdraw'; end if;
--   if has_column_privilege('studio_writer', 'studio.challenge_marks', 'version_id', 'UPDATE') or has_table_privilege('studio_writer', 'studio.challenge_marks', 'DELETE') then raise exception 'READ-BACK FAILED: studio_writer can change or delete a submission'; end if;
--   if has_table_privilege('anon', 'studio.challenge_marks', 'SELECT') or has_table_privilege('authenticated', 'studio.challenge_marks', 'SELECT') then raise exception 'READ-BACK FAILED: public access'; end if;
--   insert into studio.challenge_marks (challenge, fid, character, version_id) values ('remix-2026-11', 2147483646, 'bai', v) returning id into m;
--   update studio.challenge_marks set withdrawn_at = now() where id = m and withdrawn_at is null;
--   select count(*) into n from studio.challenge_marks where challenge = 'remix-2026-11' and fid = 2147483646
--     and (marked_at at time zone 'America/Los_Angeles')::date = (now() at time zone 'America/Los_Angeles')::date;
--   if n <> 1 or not exists (select 1 from studio.challenge_marks where id = m and withdrawn_at is not null) then raise exception 'READ-BACK FAILED: the withdrawn submission is not on record for the day'; end if;
--   begin
--     update studio.challenge_marks set withdrawn_at = marked_at - interval '1 day' where id = m;
--     denied := false;
--   exception when check_violation then denied := true;
--   end;
--   if not denied then raise exception 'READ-BACK FAILED: a withdrawal before the submission was accepted'; end if;
--   delete from studio.challenge_marks where id = m;
--   if exists (select 1 from studio.challenge_marks where fid = 2147483646) then raise exception 'READ-BACK FAILED: the test row is still there'; end if;
--   raise notice 'read-back passed';
-- end $$;
