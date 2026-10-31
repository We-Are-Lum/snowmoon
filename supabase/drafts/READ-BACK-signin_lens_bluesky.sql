-- READ-BACK for NEXT_signin_lens_bluesky.sql (branch signin-lens-bluesky): block C of that file. Run as postgres in the
-- Supabase SQL Editor after applying it. What each should show is in the comment above it.
-- C. READ-BACK (after B). Statements 1–4 only read; 5 adds realistic rows and ends in rollback.

-- 1. Both tables exist with their columns.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'studio' and table_name in ('social_accounts', 'social_links')
order by table_name, ordinal_position;

-- 2. Row-level security is on for both (two rows, relrowsecurity true).
select relname, relrowsecurity from pg_class where oid in ('studio.social_accounts'::regclass, 'studio.social_links'::regclass);

-- 3. Policies, all for studio_writer: social_accounts writer_insert, writer_read, writer_update; social_links
--    writer_insert, writer_read, writer_unlink.
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'studio' and tablename in ('social_accounts', 'social_links') order by tablename, policyname;

-- 4. Privileges: studio_writer has SELECT and INSERT on both (plus the column UPDATEs); anon and authenticated none.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'studio' and table_name in ('social_accounts', 'social_links') and grantee in ('anon', 'authenticated', 'studio_writer')
order by table_name, grantee, privilege_type;

-- 5. A realistic Lens account, a Bluesky account, a sign-in again (the handle refreshed), and a link to a Farcaster ID
--    then its end, as the site; then deleted again as postgres. Every row should say true. Nothing is kept.
begin;
set local role studio_writer;
insert into studio.social_accounts (kind, subject, handle) values
  ('lens', '0xad2c0beade60fb9f7ec5c87bde8e4c126145f6e7', 'lens/stani'),
  ('bluesky', 'did:plc:z72i7hdynmk6r22z27h6tvur', 'bsky.app');
insert into studio.social_accounts (kind, subject, handle) values ('bluesky', 'did:plc:z72i7hdynmk6r22z27h6tvur', 'bsky.app')
  on conflict (kind, subject) do update set handle = excluded.handle, last_sign_in_at = now();
select 'the site can add a Lens and a Bluesky account, and sign in again' as what,
  (select count(*) from studio.social_accounts where subject in ('0xad2c0beade60fb9f7ec5c87bde8e4c126145f6e7', 'did:plc:z72i7hdynmk6r22z27h6tvur')) = 2 as ok;
insert into studio.social_links (account_id, fid)
  select id, 6786 from studio.social_accounts where subject = 'did:plc:z72i7hdynmk6r22z27h6tvur';
insert into studio.social_links (account_id, lens_account_id)
  select b.id, l.id from studio.social_accounts b, studio.social_accounts l
  where b.subject = 'did:plc:z72i7hdynmk6r22z27h6tvur' and l.subject = '0xad2c0beade60fb9f7ec5c87bde8e4c126145f6e7'
  on conflict do nothing;
select 'one active link per account (the second was refused)' as what,
  (select count(*) from studio.social_links l join studio.social_accounts a on a.id = l.account_id
   where a.subject = 'did:plc:z72i7hdynmk6r22z27h6tvur' and l.unlinked_at is null) = 1 as ok;
update studio.social_links set unlinked_at = now(), ended_by = 'person'
  where account_id = (select id from studio.social_accounts where subject = 'did:plc:z72i7hdynmk6r22z27h6tvur') and unlinked_at is null;
select 'the site can end the link' as what,
  (select count(*) from studio.social_links l join studio.social_accounts a on a.id = l.account_id
   where a.subject = 'did:plc:z72i7hdynmk6r22z27h6tvur' and l.ended_by = 'person') = 1 as ok;
reset role;
delete from studio.social_links where account_id in (select id from studio.social_accounts where subject in ('0xad2c0beade60fb9f7ec5c87bde8e4c126145f6e7', 'did:plc:z72i7hdynmk6r22z27h6tvur'));
delete from studio.social_accounts where subject in ('0xad2c0beade60fb9f7ec5c87bde8e4c126145f6e7', 'did:plc:z72i7hdynmk6r22z27h6tvur');
select 'deleted again, as postgres' as what,
  (select count(*) from studio.social_accounts where subject in ('0xad2c0beade60fb9f7ec5c87bde8e4c126145f6e7', 'did:plc:z72i7hdynmk6r22z27h6tvur')) = 0 as ok;
rollback;
