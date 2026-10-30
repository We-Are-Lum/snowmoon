-- READ-BACK for NEXT_social_read.sql (branch social-read). Run as postgres in the Supabase SQL Editor after applying it.
-- Statements 1–5 only read. Statement 6 adds a realistic hide of each kind as the site (studio_writer), checks them,
-- deletes them as postgres, and ends in rollback, so nothing is kept (CLAUDE.md: every read-back inserts and deletes a
-- real row). What each should show is in the comment above it.

-- 1. The table exists with its five columns: network, post_id, by_fid, reason, hidden_at.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'studio' and table_name = 'social_hidden'
order by ordinal_position;

-- 2. Row-level security is on.
select relname, relrowsecurity from pg_class where oid = 'studio.social_hidden'::regclass;

-- 3. Two policies, both for studio_writer: writer_read (SELECT) and writer_insert (INSERT).
select policyname, cmd, roles from pg_policies where schemaname = 'studio' and tablename = 'social_hidden' order by policyname;

-- 4. Privileges: studio_writer has SELECT and INSERT only; anon and authenticated have none (no rows for them).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'studio' and table_name = 'social_hidden' and grantee in ('anon', 'authenticated', 'studio_writer')
order by grantee, privilege_type;

-- 5. Hidden posts so far (none until a moderator hides one on /moderate).
select network, post_id, by_fid, reason, hidden_at from studio.social_hidden;

-- 6. A realistic hide of a Farcaster cast (its writer asked) and of a Bluesky post (it breaks the Terms), as the site,
--    then deleted again as postgres. Both rows should say true.
begin;
set local role studio_writer;
insert into studio.social_hidden (network, post_id, by_fid, reason) values
  ('farcaster', '0x6a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 6786, 'writer_asked'),
  ('bluesky', 'at://did:plc:abcdefghij1234567890klmn/app.bsky.feed.post/3lxyzabc123de', 193912, 'terms');
select 'the site can add a hide of each kind' as what,
  (select count(*) from studio.social_hidden where post_id in ('0x6a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 'at://did:plc:abcdefghij1234567890klmn/app.bsky.feed.post/3lxyzabc123de')) = 2 as ok;
reset role;
delete from studio.social_hidden where post_id in ('0x6a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 'at://did:plc:abcdefghij1234567890klmn/app.bsky.feed.post/3lxyzabc123de');
select 'deleted again, as postgres' as what,
  (select count(*) from studio.social_hidden where post_id in ('0x6a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 'at://did:plc:abcdefghij1234567890klmn/app.bsky.feed.post/3lxyzabc123de')) = 0 as ok;
rollback;
