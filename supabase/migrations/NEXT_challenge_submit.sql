-- NEXT_challenge_submit.sql — withdrawing a remix challenge submission (branch remix-submit, owner 2026-11-04, item 5).
-- NOT APPLIED. Unnumbered until merge: it takes the next free number then, checked against origin/main and production
-- (CLAUDE.md). Requires 0033_remix_challenge.sql (studio.challenge_marks).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. One transaction. Safe to
-- run twice. Dry run first: paste everything, but replace the final `commit;` with `rollback;`.
--
-- Submit itself needs no migration: each Submit is one row of studio.challenge_marks (0033), the maker's FID, the
-- character and the version, written under a per-person lock after the post link was read and checked; the post is
-- listed in studio.version_posts as "Add where you posted it" lists it. Only withdrawing needs this: until entries
-- close, a maker may withdraw a submission, which frees its slot, and the row is deleted. 0033 gave studio_writer
-- select and insert only on challenge_marks (it was append-only: "the latest mark counts"); this adds delete, and the
-- RLS policy that lets studio_writer delete. Nothing else changes: no update or truncate, no public access. Until
-- this runs, Withdraw answers "Withdrawing isn't available yet." and Submit works.

begin;

drop policy if exists writer_delete on studio.challenge_marks;
create policy writer_delete on studio.challenge_marks for delete to studio_writer using (true);
grant delete on studio.challenge_marks to studio_writer;
revoke update, truncate on studio.challenge_marks from studio_writer;

commit;

-- Read-back, two parts (after commit), as postgres.
-- (a) one read-only SELECT; expect every row's ok to be true (4 rows):
-- select what, ok from (
--   select 'writer: select, insert, delete' as what, has_table_privilege('studio_writer', 'studio.challenge_marks', 'SELECT') and has_table_privilege('studio_writer', 'studio.challenge_marks', 'INSERT') and has_table_privilege('studio_writer', 'studio.challenge_marks', 'DELETE') as ok
--   union all select 'writer: no update or truncate', not (has_table_privilege('studio_writer', 'studio.challenge_marks', 'UPDATE') or has_table_privilege('studio_writer', 'studio.challenge_marks', 'TRUNCATE'))
--   union all select 'the delete policy, for studio_writer only', exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'challenge_marks' and policyname = 'writer_delete' and cmd = 'DELETE' and roles = '{studio_writer}'::name[])
--   union all select 'no public access', not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, 'studio.challenge_marks', p))
-- ) c;
-- (b) a realistic submission (on any published version; the test fid 2147483646 fits fid's type and no real account
--     has it), read back, deleted as Withdraw deletes it, and gone. Expect "NOTICE: read-back passed".
-- do $$
-- declare v uuid; n int;
-- begin
--   select id into v from studio.element_versions order by created_at desc limit 1;
--   insert into studio.challenge_marks (challenge, fid, character, version_id) values ('remix-2026-11', 2147483646, 'bai', v);
--   select count(*) into n from studio.challenge_marks where fid = 2147483646 and version_id = v and character = 'bai';
--   delete from studio.challenge_marks where challenge = 'remix-2026-11' and fid = 2147483646 and version_id = v;
--   if v is null or n <> 1 or exists (select 1 from studio.challenge_marks where fid = 2147483646) then raise exception 'READ-BACK FAILED'; end if;
--   raise notice 'read-back passed';
-- end $$;
