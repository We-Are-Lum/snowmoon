-- READ-BACK for NEXT_social_read.sql (branch social-read). Run as postgres in the Supabase SQL Editor after applying it.
-- Read only: every statement is a select. What each should show is in the comment above it.

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
