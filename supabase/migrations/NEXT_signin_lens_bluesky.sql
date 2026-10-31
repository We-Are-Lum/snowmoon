-- NEXT_signin_lens_bluesky (numbered at merge). Branch signin-lens-bluesky, owner's item 5 of 2026-10-31: "Sign-in,
-- Phase 5": Lens (wallet-based, Lens's own authentication) and Bluesky (AT Protocol OAuth). DRAFT, NOT APPLIED: the
-- owner pastes it in the Supabase SQL Editor; nothing here is applied by the coding agent (Anthropic's Claude).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0001.
-- Paste it whole, or block by block, in this order:
--   A. the dry run: the migration, ending in rollback; (nothing is kept);
--   B. the migration: the same, ending in commit;
--   C. the read-back: reads, then a realistic Lens account, Bluesky account and link added as the site
--      (studio_writer), checked, deleted again as postgres, ending in rollback; (nothing is kept).
-- The same three are in supabase/drafts/ as NEXT_signin_lens_bluesky.DRY-RUN.sql and
-- READ-BACK-signin_lens_bluesky.sql, the pattern of the other NEXT_ migrations. Tested in PGlite only
-- (npm run test:signin-lens-bluesky, and check:principles P6b, which runs every migration).
--
-- Until it is applied, a Lens or Bluesky sign-in answers "isn't available yet" and keeps nothing (the sign-in routes
-- need the account row), and Lens and Bluesky sign-in are off anyway (SIGN_IN_METHODS) until the owner's reread.
--
-- What it adds (none of it publicly readable):
-- 1. studio.social_accounts: one row per Lens account (its address) or Bluesky account (its DID) that signed in, with
--    its handle as checked at the last sign-in, when it was made and when it last signed in. Its person number
--    in the image, Remix, scene and agent tables is minus (1,000,000,000 + its id) (src/lib/people.ts), so it is
--    never a Farcaster ID (positive) or a wallet account (minus its id). No token of Lens's or of the person's
--    Bluesky server is kept, anywhere.
-- 2. studio.social_links: a Lens or Bluesky account linked to a Farcaster ID, or a Bluesky account linked to a Lens
--    account, made only when the person was signed in with both in one request. While linked, signing in with the
--    linked account is signing in as the Farcaster ID (or the Lens account), which is how a Bluesky account gets free
--    generations (src/lib/social/free.ts). Unlinking sets unlinked_at and ended_by ('person') once; linking again is a
--    new row. At most one active link per account.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept.
begin;

-- ---------------------------------------------------------------------------
-- 1. Lens and Bluesky accounts.
-- ---------------------------------------------------------------------------

create table studio.social_accounts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('lens', 'bluesky')),
  -- Lens: the account's address, lowercase. Bluesky: the DID (did:plc or did:web).
  subject text not null check (
    (kind = 'lens' and subject ~ '^0x[0-9a-f]{40}$')
    or (kind = 'bluesky' and subject ~ '^did:(plc:[a-z2-7]{24}|web:[a-z0-9.-]{1,253})$')
  ),
  -- Lens: "lens/<name>"; Bluesky: the handle, only if it resolved back to the DID. Refreshed at each sign-in.
  handle text check (handle is null or char_length(handle) between 1 and 253),
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz not null default now(),
  unique (kind, subject)
);

alter table studio.social_accounts enable row level security;
create policy writer_insert on studio.social_accounts for insert to studio_writer with check (true);
create policy writer_read on studio.social_accounts for select to studio_writer using (true);
-- Sign-in refreshes the handle and the time (insert … on conflict do update); nothing else can change (column grant below).
create policy writer_update on studio.social_accounts for update to studio_writer using (true) with check (true);
revoke all on studio.social_accounts from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.social_accounts from studio_writer;
grant select, insert on studio.social_accounts to studio_writer;
grant update (handle, last_sign_in_at) on studio.social_accounts to studio_writer;

-- ---------------------------------------------------------------------------
-- 2. Links: a Lens or Bluesky account to a Farcaster ID, or a Bluesky account to a Lens account.
-- ---------------------------------------------------------------------------

create table studio.social_links (
  id bigint generated always as identity primary key,
  account_id bigint not null references studio.social_accounts(id),
  fid bigint check (fid > 0),
  lens_account_id bigint references studio.social_accounts(id),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  ended_by text check (ended_by in ('person')),
  check ((fid is null) <> (lens_account_id is null)),
  check (lens_account_id is distinct from account_id),
  check (unlinked_at is null or unlinked_at >= linked_at),
  check ((unlinked_at is null) = (ended_by is null))
);
-- One active link per account.
create unique index social_links_one_active on studio.social_links (account_id) where unlinked_at is null;
create index social_links_fid on studio.social_links (fid) where fid is not null;
create index social_links_lens on studio.social_links (lens_account_id) where lens_account_id is not null;

alter table studio.social_links enable row level security;
create policy writer_insert on studio.social_links for insert to studio_writer with check (unlinked_at is null and ended_by is null);
create policy writer_read on studio.social_links for select to studio_writer using (true);
-- Ending only: an active row may be given its unlinked_at and ended_by, once; nothing else can change (column grant below).
create policy writer_unlink on studio.social_links for update to studio_writer using (unlinked_at is null) with check (unlinked_at is not null and ended_by is not null);
revoke all on studio.social_links from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.social_links from studio_writer;
grant select, insert on studio.social_links to studio_writer;
grant update (unlinked_at, ended_by) on studio.social_links to studio_writer;

rollback;

-- B. THE MIGRATION.
begin;

-- ---------------------------------------------------------------------------
-- 1. Lens and Bluesky accounts.
-- ---------------------------------------------------------------------------

create table studio.social_accounts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('lens', 'bluesky')),
  -- Lens: the account's address, lowercase. Bluesky: the DID (did:plc or did:web).
  subject text not null check (
    (kind = 'lens' and subject ~ '^0x[0-9a-f]{40}$')
    or (kind = 'bluesky' and subject ~ '^did:(plc:[a-z2-7]{24}|web:[a-z0-9.-]{1,253})$')
  ),
  -- Lens: "lens/<name>"; Bluesky: the handle, only if it resolved back to the DID. Refreshed at each sign-in.
  handle text check (handle is null or char_length(handle) between 1 and 253),
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz not null default now(),
  unique (kind, subject)
);

alter table studio.social_accounts enable row level security;
create policy writer_insert on studio.social_accounts for insert to studio_writer with check (true);
create policy writer_read on studio.social_accounts for select to studio_writer using (true);
-- Sign-in refreshes the handle and the time (insert … on conflict do update); nothing else can change (column grant below).
create policy writer_update on studio.social_accounts for update to studio_writer using (true) with check (true);
revoke all on studio.social_accounts from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.social_accounts from studio_writer;
grant select, insert on studio.social_accounts to studio_writer;
grant update (handle, last_sign_in_at) on studio.social_accounts to studio_writer;

-- ---------------------------------------------------------------------------
-- 2. Links: a Lens or Bluesky account to a Farcaster ID, or a Bluesky account to a Lens account.
-- ---------------------------------------------------------------------------

create table studio.social_links (
  id bigint generated always as identity primary key,
  account_id bigint not null references studio.social_accounts(id),
  fid bigint check (fid > 0),
  lens_account_id bigint references studio.social_accounts(id),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  ended_by text check (ended_by in ('person')),
  check ((fid is null) <> (lens_account_id is null)),
  check (lens_account_id is distinct from account_id),
  check (unlinked_at is null or unlinked_at >= linked_at),
  check ((unlinked_at is null) = (ended_by is null))
);
-- One active link per account.
create unique index social_links_one_active on studio.social_links (account_id) where unlinked_at is null;
create index social_links_fid on studio.social_links (fid) where fid is not null;
create index social_links_lens on studio.social_links (lens_account_id) where lens_account_id is not null;

alter table studio.social_links enable row level security;
create policy writer_insert on studio.social_links for insert to studio_writer with check (unlinked_at is null and ended_by is null);
create policy writer_read on studio.social_links for select to studio_writer using (true);
-- Ending only: an active row may be given its unlinked_at and ended_by, once; nothing else can change (column grant below).
create policy writer_unlink on studio.social_links for update to studio_writer using (unlinked_at is null) with check (unlinked_at is not null and ended_by is not null);
revoke all on studio.social_links from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.social_links from studio_writer;
grant select, insert on studio.social_links to studio_writer;
grant update (unlinked_at, ended_by) on studio.social_links to studio_writer;

commit;

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
