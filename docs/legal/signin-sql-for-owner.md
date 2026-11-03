# Sign-in: SQL for the owner (DRAFT)

For the owner, 2026-11-04. Drafted by the coding agent (Anthropic's Claude, a closed model). Branch
`signin-lens-bluesky`. **Nothing here has been applied by the agent.**

**Run as `postgres`, in the Supabase SQL Editor, one block at a time, in this order.** Each migration has four
blocks: the dry run (ends in `rollback;`, keeps nothing), the migration, read-back (a) (one read-only select: every
row's `ok` should be `true`) and read-back (b) (one `do $$` block: it adds a realistic row, checks it, deletes it,
and ends with the notice `READ-BACK passed`, or stops with `READ-BACK FAILED: …`; nothing is kept either way).

## What this branch needs

| # | Migration | From | Status |
|---|-----------|------|--------|
| 1 | `NEXT_check_decisions.sql` | branch `check-decisions` (merged in here; Lens's check stores its decision there) | not applied |
| 2 | `NEXT_signin_lens_bluesky.sql` | this branch: `studio.social_accounts`, `studio.social_links` | not applied |

- **No new migration for unlinking or the 30-day wait.** Unlinking was already in migration 2 (`unlinked_at`,
  `ended_by`, and studio_writer may only end a link, once). The 30-day wait is enforced in code
  (`src/lib/social/accounts.ts`, `relinkWait`) from each link's `unlinked_at`, by the database's clock.
- Not on this branch: `NEXT_social_bluesky_check.sql` (branch `bluesky-check`, which merges this branch in later).
  check-decisions may replace its table; that is for those two branches.
- Both take the next free numbers at merge (main ends at 0033), checked against `origin/main` and production.
- Block 1 is the same SQL as `docs/legal/check-decisions-sql-for-owner.md` on `check-decisions`, copied here so the
  order is in one place. If that branch changes it, its own file wins.

Checked on PGlite (2026-11-04), on a fresh database with 0001–0033: each dry run left no table; each migration made
its tables (1 and 2); read-back (a) was 11/11 and 10/10 true; read-back (b) passed for both. Planted: with the
one-active-link index dropped, migration 2's read-back (b) stopped with "READ-BACK FAILED: a second active link for
one account was accepted" and (a) showed one false row. (Also run by `npm run test:signin-lens-bluesky`, M1, and
`npm run test:check-decisions`.)

## 1. NEXT_check_decisions

### 1a. Dry run

```sql
begin;

create table if not exists studio.check_decisions (
  network text not null check (network in ('farcaster', 'lens', 'bluesky')),
  account text not null check (length(account) between 1 and 2048),
  threshold text not null check (threshold ~ '^[a-z0-9][a-z0-9.:+<>=_-]{0,199}$'),
  passed boolean not null,
  decided_at timestamptz not null default now(),
  primary key (network, account, threshold),
  constraint check_decisions_account_shape check (
    (network = 'farcaster' and account ~ '^[1-9][0-9]{0,18}$')
    or (network = 'lens' and account ~ '^0x[0-9a-f]{40}$')
    or (network = 'bluesky' and account ~ '^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$')
  )
);
create index if not exists check_decisions_decided_at on studio.check_decisions (decided_at);

alter table studio.check_decisions enable row level security;
drop policy if exists writer_read on studio.check_decisions;
create policy writer_read on studio.check_decisions for select to studio_writer using (true);
drop policy if exists writer_insert on studio.check_decisions;
create policy writer_insert on studio.check_decisions for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.check_decisions;
create policy writer_update on studio.check_decisions for update to studio_writer using (true) with check (true);
drop policy if exists writer_delete on studio.check_decisions;
create policy writer_delete on studio.check_decisions for delete to studio_writer using (true);
revoke all on studio.check_decisions from anon, authenticated;
revoke truncate, references, trigger on studio.check_decisions from studio_writer;
grant select, insert, update, delete on studio.check_decisions to studio_writer;

-- No score is kept from here on: the kept ones go, and none can be added or changed.
delete from studio.image_scores;
revoke insert, update on studio.image_scores from studio_writer;

rollback;
```

### 1b. Migration

```sql
begin;

create table if not exists studio.check_decisions (
  network text not null check (network in ('farcaster', 'lens', 'bluesky')),
  account text not null check (length(account) between 1 and 2048),
  threshold text not null check (threshold ~ '^[a-z0-9][a-z0-9.:+<>=_-]{0,199}$'),
  passed boolean not null,
  decided_at timestamptz not null default now(),
  primary key (network, account, threshold),
  constraint check_decisions_account_shape check (
    (network = 'farcaster' and account ~ '^[1-9][0-9]{0,18}$')
    or (network = 'lens' and account ~ '^0x[0-9a-f]{40}$')
    or (network = 'bluesky' and account ~ '^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$')
  )
);
create index if not exists check_decisions_decided_at on studio.check_decisions (decided_at);

alter table studio.check_decisions enable row level security;
drop policy if exists writer_read on studio.check_decisions;
create policy writer_read on studio.check_decisions for select to studio_writer using (true);
drop policy if exists writer_insert on studio.check_decisions;
create policy writer_insert on studio.check_decisions for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.check_decisions;
create policy writer_update on studio.check_decisions for update to studio_writer using (true) with check (true);
drop policy if exists writer_delete on studio.check_decisions;
create policy writer_delete on studio.check_decisions for delete to studio_writer using (true);
revoke all on studio.check_decisions from anon, authenticated;
revoke truncate, references, trigger on studio.check_decisions from studio_writer;
grant select, insert, update, delete on studio.check_decisions to studio_writer;

-- No score is kept from here on: the kept ones go, and none can be added or changed.
delete from studio.image_scores;
revoke insert, update on studio.image_scores from studio_writer;

commit;
```

### 1c. Read-back (a)

```sql
-- Read-back (a): every row must say true.
select what, ok from (
  select 1 as n, 'check_decisions exists' as what, to_regclass('studio.check_decisions') is not null as ok
  union all select 2, 'row level security is on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.check_decisions')), false)
  union all select 3, 'columns: network, account, threshold, passed, decided_at, and nothing else',
    coalesce((select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns where table_schema = 'studio' and table_name = 'check_decisions'), '') = 'network,account,threshold,passed,decided_at'
  union all select 4, 'no column can hold a score or the numbers behind a decision',
    not exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'check_decisions' and (column_name ~ '(^|_)(score|scores|value|age|count|posts|followers)(_|$)' or data_type in ('numeric', 'real', 'double precision', 'integer', 'bigint', 'smallint', 'jsonb', 'json')))
  union all select 5, 'one decision per network, account and rule (the primary key)',
    coalesce((select string_agg(a.attname::text, ',' order by array_position(i.indkey::int2[], a.attnum)) from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = to_regclass('studio.check_decisions') and i.indisprimary), '') = 'network,account,threshold'
  union all select 6, 'anon and authenticated cannot read or write it',
    not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, 'studio.check_decisions', p))
  union all select 7, 'studio_writer: select, insert, update, delete; no truncate',
    has_table_privilege('studio_writer', 'studio.check_decisions', 'SELECT') and has_table_privilege('studio_writer', 'studio.check_decisions', 'INSERT') and has_table_privilege('studio_writer', 'studio.check_decisions', 'UPDATE') and has_table_privilege('studio_writer', 'studio.check_decisions', 'DELETE') and not has_table_privilege('studio_writer', 'studio.check_decisions', 'TRUNCATE')
  union all select 8, 'its four policies are studio_writer''s only',
    (select count(*) from pg_policies where schemaname = 'studio' and tablename = 'check_decisions') = 4 and not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'check_decisions' and roles <> '{studio_writer}')
  union all select 9, 'no Neynar score is kept', not exists (select 1 from studio.image_scores)
  union all select 10, 'studio_writer cannot add or change a score',
    not has_table_privilege('studio_writer', 'studio.image_scores', 'INSERT') and not has_table_privilege('studio_writer', 'studio.image_scores', 'UPDATE')
  union all select 11, 'the decided_at index exists', to_regclass('studio.check_decisions_decided_at') is not null
) t order by n;
```

### 1d. Read-back (b)

```sql
-- Read-back (b): a realistic decision per network goes in, is read back, replaced, refused when malformed, and deleted.
-- It leaves nothing behind. It ends with "READ-BACK PASSED", or stops with an error starting "READ-BACK FAILED".
do $$
declare
  did text := 'did:plc:readback' || repeat('z', 2000);
  n int;
  refused boolean;
begin
  insert into studio.check_decisions (network, account, threshold, passed) values
    ('farcaster', '987654321', 'neynar-score>=0.7', true),
    ('lens', '0x00000000000000000000000000000000000c0de1', 'lens-score>=1000', false),
    ('bluesky', did, 'made-before-2026-11-06+5posts30d', true);
  select count(*) into n from studio.check_decisions
    where (network, account, threshold) in (('farcaster', '987654321', 'neynar-score>=0.7'), ('lens', '0x00000000000000000000000000000000000c0de1', 'lens-score>=1000'), ('bluesky', did, 'made-before-2026-11-06+5posts30d'))
      and decided_at > now() - interval '1 minute';
  if n <> 3 then raise exception 'READ-BACK FAILED: % of 3 decisions read back', n; end if;
  -- A new decision under the same rule replaces the old one.
  insert into studio.check_decisions (network, account, threshold, passed) values ('lens', '0x00000000000000000000000000000000000c0de1', 'lens-score>=1000', true)
    on conflict (network, account, threshold) do update set passed = excluded.passed, decided_at = now();
  select count(*) into n from studio.check_decisions where network = 'lens' and account = '0x00000000000000000000000000000000000c0de1' and passed;
  if n <> 1 then raise exception 'READ-BACK FAILED: the replaced Lens decision reads back % rows', n; end if;
  -- A malformed account is refused.
  refused := false;
  begin
    insert into studio.check_decisions (network, account, threshold, passed) values ('farcaster', 'abc', 'neynar-score>=0.7', true);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a FID that is not digits was accepted'; end if;
  delete from studio.check_decisions where account in ('987654321', '0x00000000000000000000000000000000000c0de1', did);
  select count(*) into n from studio.check_decisions where account in ('987654321', '0x00000000000000000000000000000000000c0de1', did);
  if n <> 0 then raise exception 'READ-BACK FAILED: % rows left after the delete', n; end if;
  raise notice 'READ-BACK PASSED';
end $$;
```

## 2. NEXT_signin_lens_bluesky

### 2a. Dry run

```sql
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
```

### 2b. Migration

```sql
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
```

### 2c. Read-back (a)

```sql
select what, ok from (values
  ('social_accounts has its 6 columns',
    (select count(*) from information_schema.columns where table_schema = 'studio' and table_name = 'social_accounts'
      and column_name in ('id', 'kind', 'subject', 'handle', 'created_at', 'last_sign_in_at')) = 6),
  ('social_links has its 7 columns',
    (select count(*) from information_schema.columns where table_schema = 'studio' and table_name = 'social_links'
      and column_name in ('id', 'account_id', 'fid', 'lens_account_id', 'linked_at', 'unlinked_at', 'ended_by')) = 7),
  ('row-level security is on for both',
    (select bool_and(relrowsecurity) and count(*) = 2 from pg_class where oid in ('studio.social_accounts'::regclass, 'studio.social_links'::regclass))),
  ('the six policies, all for studio_writer',
    (select count(*) from pg_policies where schemaname = 'studio' and roles = '{studio_writer}'
      and (tablename, policyname) in (('social_accounts', 'writer_insert'), ('social_accounts', 'writer_read'), ('social_accounts', 'writer_update'),
                                      ('social_links', 'writer_insert'), ('social_links', 'writer_read'), ('social_links', 'writer_unlink'))) = 6),
  ('no other policies on them',
    (select count(*) from pg_policies where schemaname = 'studio' and tablename in ('social_accounts', 'social_links')) = 6),
  ('studio_writer may select and insert on both',
    has_table_privilege('studio_writer', 'studio.social_accounts', 'select') and has_table_privilege('studio_writer', 'studio.social_accounts', 'insert')
    and has_table_privilege('studio_writer', 'studio.social_links', 'select') and has_table_privilege('studio_writer', 'studio.social_links', 'insert')),
  ('studio_writer may not delete or truncate either',
    not has_table_privilege('studio_writer', 'studio.social_accounts', 'delete') and not has_table_privilege('studio_writer', 'studio.social_accounts', 'truncate')
    and not has_table_privilege('studio_writer', 'studio.social_links', 'delete') and not has_table_privilege('studio_writer', 'studio.social_links', 'truncate')),
  ('studio_writer may update only handle and last_sign_in_at, and only unlinked_at and ended_by',
    has_column_privilege('studio_writer', 'studio.social_accounts', 'handle', 'update') and has_column_privilege('studio_writer', 'studio.social_accounts', 'last_sign_in_at', 'update')
    and not has_column_privilege('studio_writer', 'studio.social_accounts', 'subject', 'update') and not has_column_privilege('studio_writer', 'studio.social_accounts', 'kind', 'update')
    and has_column_privilege('studio_writer', 'studio.social_links', 'unlinked_at', 'update') and has_column_privilege('studio_writer', 'studio.social_links', 'ended_by', 'update')
    and not has_column_privilege('studio_writer', 'studio.social_links', 'fid', 'update') and not has_column_privilege('studio_writer', 'studio.social_links', 'account_id', 'update')),
  ('anon and authenticated have nothing on either',
    not exists (select 1 from information_schema.role_table_grants where table_schema = 'studio'
      and table_name in ('social_accounts', 'social_links') and grantee in ('anon', 'authenticated'))),
  ('one active link per account (the partial unique index)',
    exists (select 1 from pg_indexes where schemaname = 'studio' and indexname = 'social_links_one_active' and indexdef ilike '%unique%where (unlinked_at is null)%'))
) as t(what, ok);
```

### 2d. Read-back (b)

```sql
do $$
declare
  lens_id bigint;
  sky_id bigint;
  n int;
  refused boolean := false;
begin
  insert into studio.social_accounts (kind, subject, handle) values ('lens', '0xad2c0beade60fb9f7ec5c87bde8e4c126145f6e7', 'lens/stani')
    returning id into lens_id;
  insert into studio.social_accounts (kind, subject, handle) values ('bluesky', 'did:plc:z72i7hdynmk6r22z27h6tvur', 'bsky.app')
    returning id into sky_id;
  -- A sign-in again: the handle refreshed, no second row.
  insert into studio.social_accounts (kind, subject, handle) values ('bluesky', 'did:plc:z72i7hdynmk6r22z27h6tvur', 'bsky.app')
    on conflict (kind, subject) do update set handle = excluded.handle, last_sign_in_at = now();
  select count(*) into n from studio.social_accounts where subject in ('0xad2c0beade60fb9f7ec5c87bde8e4c126145f6e7', 'did:plc:z72i7hdynmk6r22z27h6tvur');
  if n <> 2 then raise exception 'READ-BACK FAILED: % account rows after a sign-in again, not 2', n; end if;
  -- A link to a Farcaster ID, then a second active link for the same account, which must be refused.
  insert into studio.social_links (account_id, fid) values (sky_id, 6786);
  begin
    insert into studio.social_links (account_id, lens_account_id) values (sky_id, lens_id);
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a second active link for one account was accepted'; end if;
  update studio.social_links set unlinked_at = now(), ended_by = 'person' where account_id = sky_id and unlinked_at is null;
  select count(*) into n from studio.social_links where account_id = sky_id and ended_by = 'person' and unlinked_at is not null;
  if n <> 1 then raise exception 'READ-BACK FAILED: the link did not end (% ended rows)', n; end if;
  delete from studio.social_links where account_id in (lens_id, sky_id);
  delete from studio.social_accounts where id in (lens_id, sky_id);
  select count(*) into n from studio.social_accounts where id in (lens_id, sky_id);
  if n <> 0 then raise exception 'READ-BACK FAILED: % test rows left after the delete', n; end if;
  raise notice 'READ-BACK passed';
end $$;
```
