-- NEXT_signin_lens_bluesky DRY RUN: block A of supabase/migrations/NEXT_signin_lens_bluesky.sql (the migration, ending
-- in rollback; nothing is kept). Run as postgres in the Supabase SQL Editor. DRAFT, NOT APPLIED.

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
