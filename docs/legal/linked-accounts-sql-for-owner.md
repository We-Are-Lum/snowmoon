# Linked accounts: the SQL for the owner (DRAFT)

Written by a coding agent (Claude, a closed model made by Anthropic) on the owner's overnight run of 2026-11-05,
Lane B, item 7. Branch `linked-accounts`. **Nothing here has been applied by the agent**, and no production database
was connected to. Tested on PGlite only: `npm run test:linked-accounts-sql`.

**What it is:** `supabase/migrations/NEXT_linked_accounts.sql`, for one person with many linked accounts
(`docs/proposals/linked-accounts.md`). It takes the next free number at merge, checked against `origin/main` and
production.

**When:** not before the owner decides to ship linking (the code is behind `LINKED_ACCOUNTS.enabled`, off). Never
merge the branch until this is applied and the read-backs pass.

**Who runs it:** the owner, as `postgres`, in the Supabase SQL Editor, one block at a time, in the order below.

**Needs first:** 0001..0034 (production has them), and the SQL pack of 2026-11-04's pending items, applied in the
pack's own order (2, 5, 3, 4; `docs/legal/sql-pack-2026-11-04.md` on branch `sql-pack`). Only item 2 matters to this
migration (today's Lens and Bluesky links are copied from its `social_links`); none of the pack's read-backs change.
Read-back (a)'s first row is false if item 2 isn't applied yet: then stop and apply item 2 first.

**What it keeps:** who is linked to whom (`studio.people`, `studio.person_accounts`), link attempts
(`studio.person_link_attempts`, the person and when), and a person column on the image and Remix counts and the
challenge tables. No new data about anyone: it reorganises links that are already kept (`wallet_links`,
`social_links`, both left in place). Nothing is publicly readable.

If any block does not give what it says, stop there.

## A. Dry run

Expected: no error (a notice only if an account would break a per-person limit); it keeps nothing.

```sql
-- A. DRY RUN: the migration below, ending in rollback; nothing is kept.
begin;

-- ---------------------------------------------------------------------------
-- 1. People.
-- ---------------------------------------------------------------------------

create table studio.people (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Which accounts belong to which person, and when.
-- ---------------------------------------------------------------------------

create table studio.person_accounts (
  id bigint generated always as identity primary key,
  person_id bigint not null references studio.people(id),
  kind text not null check (kind in ('farcaster', 'wallet', 'lens', 'bluesky')),
  account bigint not null,
  how text not null check (how in ('first', 'signed', 'verified')),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  ended_by text check (ended_by in ('person', 'unverified')),
  constraint person_accounts_kind_range check (
    (kind = 'farcaster' and account > 0)
    or (kind = 'wallet' and account < 0 and account > -1000000000)
    or (kind in ('lens', 'bluesky') and account <= -1000000000)
  ),
  check (unlinked_at is null or unlinked_at >= linked_at),
  check ((unlinked_at is null) = (ended_by is null)),
  -- Only the automatic wallet link is ended automatically, and only a wallet is linked automatically.
  check (ended_by is distinct from 'unverified' or how = 'verified'),
  check (how <> 'verified' or kind = 'wallet')
);
-- A1: one person per account at a time.
create unique index person_accounts_one_active on studio.person_accounts (account) where unlinked_at is null;
-- A6: one Farcaster, one Lens and one Bluesky account per person (wallets: the trigger below).
create unique index person_accounts_one_of_kind on studio.person_accounts (person_id, kind) where unlinked_at is null and kind <> 'wallet';
create index person_accounts_person on studio.person_accounts (person_id) where unlinked_at is null;
-- A2 and A5: an account's history.
create index person_accounts_history on studio.person_accounts (account, linked_at desc);

-- A6: at most 3 active wallets per person (owner, 2026-11-04).
create function studio.person_accounts_wallet_limit() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
begin
  if new.kind = 'wallet' and new.unlinked_at is null and (
    select count(*) from studio.person_accounts
    where person_id = new.person_id and kind = 'wallet' and unlinked_at is null
  ) >= 3 then
    raise exception 'a person can have at most 3 wallets' using errcode = '23514';
  end if;
  return new;
end $fn$;
create trigger person_accounts_wallets before insert on studio.person_accounts
  for each row execute function studio.person_accounts_wallet_limit();
revoke all on function studio.person_accounts_wallet_limit() from public;

-- ---------------------------------------------------------------------------
-- 3. Link attempts (A8). The person only, and when.
-- ---------------------------------------------------------------------------

create table studio.person_link_attempts (
  person_id bigint not null references studio.people(id),
  at timestamptz not null default now()
);
create index person_link_attempts_person_at on studio.person_link_attempts (person_id, at);

-- ---------------------------------------------------------------------------
-- 4. Counts and the challenge, per person.
-- ---------------------------------------------------------------------------

alter table studio.image_asks add column person_id bigint references studio.people(id);
create index image_asks_person_at on studio.image_asks (person_id, at) where person_id is not null;
alter table studio.remix_asks add column person_id bigint references studio.people(id);
create index remix_asks_person_id_at on studio.remix_asks (person_id, at) where person_id is not null;

-- challenge_eligibility.fid and challenge_marks.fid stay the account the version was published or submitted with (the
-- SQL pack's item 5 lets them be a Bluesky or Lens account's number): the challenge record names it by its public id.
alter table studio.challenge_eligibility add column person_id bigint references studio.people(id);
alter table studio.challenge_eligibility add column via text check (via in ('farcaster', 'lens', 'bluesky'));
alter table studio.challenge_eligibility add column via_account bigint check (via_account <> 0);
alter table studio.challenge_eligibility add constraint challenge_eligibility_via_pair check ((via is null) = (via_account is null));
create index challenge_eligibility_person_id on studio.challenge_eligibility (challenge, person_id) where person_id is not null;
create index challenge_eligibility_via_account on studio.challenge_eligibility (challenge, via_account) where via_account is not null;

alter table studio.challenge_marks add column person_id bigint references studio.people(id);
create index challenge_marks_person_id on studio.challenge_marks (challenge, person_id, marked_at) where person_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Row-level security and grants: studio_writer reads, adds, and only ends links; nothing for anon or authenticated.
-- ---------------------------------------------------------------------------

alter table studio.people enable row level security;
create policy writer_insert on studio.people for insert to studio_writer with check (true);
create policy writer_read on studio.people for select to studio_writer using (true);
revoke all on studio.people from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.people from studio_writer;
grant select, insert on studio.people to studio_writer;

alter table studio.person_accounts enable row level security;
create policy writer_insert on studio.person_accounts for insert to studio_writer with check (unlinked_at is null and ended_by is null);
create policy writer_read on studio.person_accounts for select to studio_writer using (true);
create policy writer_unlink on studio.person_accounts for update to studio_writer using (unlinked_at is null) with check (unlinked_at is not null and ended_by is not null);
revoke all on studio.person_accounts from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.person_accounts from studio_writer;
grant select, insert on studio.person_accounts to studio_writer;
grant update (unlinked_at, ended_by) on studio.person_accounts to studio_writer;

alter table studio.person_link_attempts enable row level security;
create policy writer_insert on studio.person_link_attempts for insert to studio_writer with check (true);
create policy writer_read on studio.person_link_attempts for select to studio_writer using (true);
revoke all on studio.person_link_attempts from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.person_link_attempts from studio_writer;
grant select, insert on studio.person_link_attempts to studio_writer;

-- ---------------------------------------------------------------------------
-- 6. The backfill, from today's links.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  p bigint;
  skipped int := 0;
  has_social boolean := to_regclass('studio.social_links') is not null;
begin
  -- 6a. A person for each Farcaster ID that a wallet, Lens or Bluesky account is (or was) linked to.
  for r in execute
    'select fid from studio.wallet_links'
    || case when has_social then ' union select fid from studio.social_links where fid is not null' else '' end
    || ' order by 1'
  loop
    insert into studio.people default values returning id into p;
    insert into studio.person_accounts (person_id, kind, account, how) values (p, 'farcaster', r.fid, 'first');
  end loop;

  if has_social then
    -- 6b. Lens accounts with an active link to a Farcaster ID join its person; other Lens accounts in a link (either
    --     side) get one of their own.
    for r in
      select a.id, -(1000000000 + a.id) as account,
        (select l.fid from studio.social_links l where l.account_id = a.id and l.unlinked_at is null and l.fid is not null) as fid
      from studio.social_accounts a
      where a.kind = 'lens' and (exists (select 1 from studio.social_links l where l.account_id = a.id or l.lens_account_id = a.id))
      order by a.id
    loop
      p := (select person_id from studio.person_accounts where account = r.fid and unlinked_at is null);
      if p is not null and exists (select 1 from studio.person_accounts where person_id = p and kind = 'lens' and unlinked_at is null) then
        skipped := skipped + 1; p := null;
      end if;
      if p is null then
        insert into studio.people default values returning id into p;
        insert into studio.person_accounts (person_id, kind, account, how) values (p, 'lens', r.account, 'first');
      else
        insert into studio.person_accounts (person_id, kind, account, how, linked_at)
        select p, 'lens', r.account, 'signed', l.linked_at from studio.social_links l where l.account_id = r.id and l.unlinked_at is null;
      end if;
    end loop;

    -- 6c. Bluesky accounts: an active link to a Farcaster ID joins its person; to a Lens account, that account's person.
    for r in
      select a.id, -(1000000000 + a.id) as account, l.linked_at,
        coalesce(l.fid, -(1000000000 + l.lens_account_id)) as target
      from studio.social_accounts a
      left join studio.social_links l on l.account_id = a.id and l.unlinked_at is null
      where a.kind = 'bluesky' and exists (select 1 from studio.social_links x where x.account_id = a.id)
      order by a.id
    loop
      p := (select person_id from studio.person_accounts where account = r.target and unlinked_at is null);
      if p is not null and exists (select 1 from studio.person_accounts where person_id = p and kind = 'bluesky' and unlinked_at is null) then
        skipped := skipped + 1; p := null;
      end if;
      if p is null then
        insert into studio.people default values returning id into p;
        insert into studio.person_accounts (person_id, kind, account, how) values (p, 'bluesky', r.account, 'first');
      else
        insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, 'bluesky', r.account, 'signed', r.linked_at);
      end if;
    end loop;

    -- 6d. Ended Lens and Bluesky links, as ended rows under the person of what they were linked to.
    insert into studio.person_accounts (person_id, kind, account, how, linked_at, unlinked_at, ended_by)
    select t.person_id, a.kind, -(1000000000 + a.id), 'signed', l.linked_at, l.unlinked_at, l.ended_by
    from studio.social_links l
    join studio.social_accounts a on a.id = l.account_id
    join studio.person_accounts t on t.account = coalesce(l.fid, -(1000000000 + l.lens_account_id)) and t.unlinked_at is null
    where l.unlinked_at is not null;
  end if;

  -- 6e. Wallets: an active link joins its Farcaster ID's person (oldest first, at most 3); the rest get their own.
  for r in
    select l.account_id, l.fid, l.how, l.linked_at from studio.wallet_links l where l.unlinked_at is null order by l.linked_at, l.id
  loop
    p := (select person_id from studio.person_accounts where account = r.fid and unlinked_at is null);
    if (select count(*) from studio.person_accounts where person_id = p and kind = 'wallet' and unlinked_at is null) >= 3 then
      skipped := skipped + 1;
      insert into studio.people default values returning id into p;
      insert into studio.person_accounts (person_id, kind, account, how) values (p, 'wallet', -r.account_id, 'first');
    else
      insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, 'wallet', -r.account_id, r.how, r.linked_at);
    end if;
  end loop;
  insert into studio.person_accounts (person_id, kind, account, how, linked_at, unlinked_at, ended_by)
  select t.person_id, 'wallet', -l.account_id, l.how, l.linked_at, l.unlinked_at, l.ended_by
  from studio.wallet_links l join studio.person_accounts t on t.account = l.fid and t.unlinked_at is null
  where l.unlinked_at is not null;

  -- 6f. Any wallet, Lens or Bluesky account in a link that has no active row now: a person of its own, from when its
  --     last link ended (the 30-day wait and the move limit then read its history).
  for r in
    select x.account, x.kind, max(x.unlinked_at) as since from studio.person_accounts x
    where x.unlinked_at is not null and not exists (select 1 from studio.person_accounts y where y.account = x.account and y.unlinked_at is null)
    group by x.account, x.kind order by x.account
  loop
    insert into studio.people default values returning id into p;
    insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, r.kind, r.account, 'first', r.since);
  end loop;

  if skipped > 0 then
    raise notice 'linked accounts: % account(s) would have passed a per-person limit and got a person of their own', skipped;
  end if;
end $$;

rollback;
```

## B. Migration

Expected: `COMMIT`. Not safe to run twice: a second run stops at its first `create table` and changes nothing.

```sql
-- B. THE MIGRATION. The same, ending in commit.
begin;

-- ---------------------------------------------------------------------------
-- 1. People.
-- ---------------------------------------------------------------------------

create table studio.people (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Which accounts belong to which person, and when.
-- ---------------------------------------------------------------------------

create table studio.person_accounts (
  id bigint generated always as identity primary key,
  person_id bigint not null references studio.people(id),
  kind text not null check (kind in ('farcaster', 'wallet', 'lens', 'bluesky')),
  account bigint not null,
  how text not null check (how in ('first', 'signed', 'verified')),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  ended_by text check (ended_by in ('person', 'unverified')),
  constraint person_accounts_kind_range check (
    (kind = 'farcaster' and account > 0)
    or (kind = 'wallet' and account < 0 and account > -1000000000)
    or (kind in ('lens', 'bluesky') and account <= -1000000000)
  ),
  check (unlinked_at is null or unlinked_at >= linked_at),
  check ((unlinked_at is null) = (ended_by is null)),
  -- Only the automatic wallet link is ended automatically, and only a wallet is linked automatically.
  check (ended_by is distinct from 'unverified' or how = 'verified'),
  check (how <> 'verified' or kind = 'wallet')
);
-- A1: one person per account at a time.
create unique index person_accounts_one_active on studio.person_accounts (account) where unlinked_at is null;
-- A6: one Farcaster, one Lens and one Bluesky account per person (wallets: the trigger below).
create unique index person_accounts_one_of_kind on studio.person_accounts (person_id, kind) where unlinked_at is null and kind <> 'wallet';
create index person_accounts_person on studio.person_accounts (person_id) where unlinked_at is null;
-- A2 and A5: an account's history.
create index person_accounts_history on studio.person_accounts (account, linked_at desc);

-- A6: at most 3 active wallets per person (owner, 2026-11-04).
create function studio.person_accounts_wallet_limit() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
begin
  if new.kind = 'wallet' and new.unlinked_at is null and (
    select count(*) from studio.person_accounts
    where person_id = new.person_id and kind = 'wallet' and unlinked_at is null
  ) >= 3 then
    raise exception 'a person can have at most 3 wallets' using errcode = '23514';
  end if;
  return new;
end $fn$;
create trigger person_accounts_wallets before insert on studio.person_accounts
  for each row execute function studio.person_accounts_wallet_limit();
revoke all on function studio.person_accounts_wallet_limit() from public;

-- ---------------------------------------------------------------------------
-- 3. Link attempts (A8). The person only, and when.
-- ---------------------------------------------------------------------------

create table studio.person_link_attempts (
  person_id bigint not null references studio.people(id),
  at timestamptz not null default now()
);
create index person_link_attempts_person_at on studio.person_link_attempts (person_id, at);

-- ---------------------------------------------------------------------------
-- 4. Counts and the challenge, per person.
-- ---------------------------------------------------------------------------

alter table studio.image_asks add column person_id bigint references studio.people(id);
create index image_asks_person_at on studio.image_asks (person_id, at) where person_id is not null;
alter table studio.remix_asks add column person_id bigint references studio.people(id);
create index remix_asks_person_id_at on studio.remix_asks (person_id, at) where person_id is not null;

-- challenge_eligibility.fid and challenge_marks.fid stay the account the version was published or submitted with (the
-- SQL pack's item 5 lets them be a Bluesky or Lens account's number): the challenge record names it by its public id.
alter table studio.challenge_eligibility add column person_id bigint references studio.people(id);
alter table studio.challenge_eligibility add column via text check (via in ('farcaster', 'lens', 'bluesky'));
alter table studio.challenge_eligibility add column via_account bigint check (via_account <> 0);
alter table studio.challenge_eligibility add constraint challenge_eligibility_via_pair check ((via is null) = (via_account is null));
create index challenge_eligibility_person_id on studio.challenge_eligibility (challenge, person_id) where person_id is not null;
create index challenge_eligibility_via_account on studio.challenge_eligibility (challenge, via_account) where via_account is not null;

alter table studio.challenge_marks add column person_id bigint references studio.people(id);
create index challenge_marks_person_id on studio.challenge_marks (challenge, person_id, marked_at) where person_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Row-level security and grants: studio_writer reads, adds, and only ends links; nothing for anon or authenticated.
-- ---------------------------------------------------------------------------

alter table studio.people enable row level security;
create policy writer_insert on studio.people for insert to studio_writer with check (true);
create policy writer_read on studio.people for select to studio_writer using (true);
revoke all on studio.people from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.people from studio_writer;
grant select, insert on studio.people to studio_writer;

alter table studio.person_accounts enable row level security;
create policy writer_insert on studio.person_accounts for insert to studio_writer with check (unlinked_at is null and ended_by is null);
create policy writer_read on studio.person_accounts for select to studio_writer using (true);
create policy writer_unlink on studio.person_accounts for update to studio_writer using (unlinked_at is null) with check (unlinked_at is not null and ended_by is not null);
revoke all on studio.person_accounts from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.person_accounts from studio_writer;
grant select, insert on studio.person_accounts to studio_writer;
grant update (unlinked_at, ended_by) on studio.person_accounts to studio_writer;

alter table studio.person_link_attempts enable row level security;
create policy writer_insert on studio.person_link_attempts for insert to studio_writer with check (true);
create policy writer_read on studio.person_link_attempts for select to studio_writer using (true);
revoke all on studio.person_link_attempts from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.person_link_attempts from studio_writer;
grant select, insert on studio.person_link_attempts to studio_writer;

-- ---------------------------------------------------------------------------
-- 6. The backfill, from today's links.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  p bigint;
  skipped int := 0;
  has_social boolean := to_regclass('studio.social_links') is not null;
begin
  -- 6a. A person for each Farcaster ID that a wallet, Lens or Bluesky account is (or was) linked to.
  for r in execute
    'select fid from studio.wallet_links'
    || case when has_social then ' union select fid from studio.social_links where fid is not null' else '' end
    || ' order by 1'
  loop
    insert into studio.people default values returning id into p;
    insert into studio.person_accounts (person_id, kind, account, how) values (p, 'farcaster', r.fid, 'first');
  end loop;

  if has_social then
    -- 6b. Lens accounts with an active link to a Farcaster ID join its person; other Lens accounts in a link (either
    --     side) get one of their own.
    for r in
      select a.id, -(1000000000 + a.id) as account,
        (select l.fid from studio.social_links l where l.account_id = a.id and l.unlinked_at is null and l.fid is not null) as fid
      from studio.social_accounts a
      where a.kind = 'lens' and (exists (select 1 from studio.social_links l where l.account_id = a.id or l.lens_account_id = a.id))
      order by a.id
    loop
      p := (select person_id from studio.person_accounts where account = r.fid and unlinked_at is null);
      if p is not null and exists (select 1 from studio.person_accounts where person_id = p and kind = 'lens' and unlinked_at is null) then
        skipped := skipped + 1; p := null;
      end if;
      if p is null then
        insert into studio.people default values returning id into p;
        insert into studio.person_accounts (person_id, kind, account, how) values (p, 'lens', r.account, 'first');
      else
        insert into studio.person_accounts (person_id, kind, account, how, linked_at)
        select p, 'lens', r.account, 'signed', l.linked_at from studio.social_links l where l.account_id = r.id and l.unlinked_at is null;
      end if;
    end loop;

    -- 6c. Bluesky accounts: an active link to a Farcaster ID joins its person; to a Lens account, that account's person.
    for r in
      select a.id, -(1000000000 + a.id) as account, l.linked_at,
        coalesce(l.fid, -(1000000000 + l.lens_account_id)) as target
      from studio.social_accounts a
      left join studio.social_links l on l.account_id = a.id and l.unlinked_at is null
      where a.kind = 'bluesky' and exists (select 1 from studio.social_links x where x.account_id = a.id)
      order by a.id
    loop
      p := (select person_id from studio.person_accounts where account = r.target and unlinked_at is null);
      if p is not null and exists (select 1 from studio.person_accounts where person_id = p and kind = 'bluesky' and unlinked_at is null) then
        skipped := skipped + 1; p := null;
      end if;
      if p is null then
        insert into studio.people default values returning id into p;
        insert into studio.person_accounts (person_id, kind, account, how) values (p, 'bluesky', r.account, 'first');
      else
        insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, 'bluesky', r.account, 'signed', r.linked_at);
      end if;
    end loop;

    -- 6d. Ended Lens and Bluesky links, as ended rows under the person of what they were linked to.
    insert into studio.person_accounts (person_id, kind, account, how, linked_at, unlinked_at, ended_by)
    select t.person_id, a.kind, -(1000000000 + a.id), 'signed', l.linked_at, l.unlinked_at, l.ended_by
    from studio.social_links l
    join studio.social_accounts a on a.id = l.account_id
    join studio.person_accounts t on t.account = coalesce(l.fid, -(1000000000 + l.lens_account_id)) and t.unlinked_at is null
    where l.unlinked_at is not null;
  end if;

  -- 6e. Wallets: an active link joins its Farcaster ID's person (oldest first, at most 3); the rest get their own.
  for r in
    select l.account_id, l.fid, l.how, l.linked_at from studio.wallet_links l where l.unlinked_at is null order by l.linked_at, l.id
  loop
    p := (select person_id from studio.person_accounts where account = r.fid and unlinked_at is null);
    if (select count(*) from studio.person_accounts where person_id = p and kind = 'wallet' and unlinked_at is null) >= 3 then
      skipped := skipped + 1;
      insert into studio.people default values returning id into p;
      insert into studio.person_accounts (person_id, kind, account, how) values (p, 'wallet', -r.account_id, 'first');
    else
      insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, 'wallet', -r.account_id, r.how, r.linked_at);
    end if;
  end loop;
  insert into studio.person_accounts (person_id, kind, account, how, linked_at, unlinked_at, ended_by)
  select t.person_id, 'wallet', -l.account_id, l.how, l.linked_at, l.unlinked_at, l.ended_by
  from studio.wallet_links l join studio.person_accounts t on t.account = l.fid and t.unlinked_at is null
  where l.unlinked_at is not null;

  -- 6f. Any wallet, Lens or Bluesky account in a link that has no active row now: a person of its own, from when its
  --     last link ended (the 30-day wait and the move limit then read its history).
  for r in
    select x.account, x.kind, max(x.unlinked_at) as since from studio.person_accounts x
    where x.unlinked_at is not null and not exists (select 1 from studio.person_accounts y where y.account = x.account and y.unlinked_at is null)
    group by x.account, x.kind order by x.account
  loop
    insert into studio.people default values returning id into p;
    insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, r.kind, r.account, 'first', r.since);
  end loop;

  if skipped > 0 then
    raise notice 'linked accounts: % account(s) would have passed a per-person limit and got a person of their own', skipped;
  end if;
end $$;

commit;
```

## C. Read-back (a)

One read-only select. Every row's `ok` must be `true`. To run it read-only: `begin read only;`, the select, `rollback;`.

```sql
select what, ok from (values
  ('the SQL pack''s item 2 was applied first (social_links), so Lens and Bluesky links were copied', to_regclass('studio.social_links') is not null),
  ('people, person_accounts and person_link_attempts exist, row-level security on', (select count(*) = 3 and bool_and(relrowsecurity) from pg_class where relnamespace = 'studio'::regnamespace and relname in ('people', 'person_accounts', 'person_link_attempts'))),
  ('A1: one active row per account (unique, partial)', exists (select 1 from pg_indexes where schemaname = 'studio' and indexname = 'person_accounts_one_active' and indexdef ilike 'create unique index%(account) where (unlinked_at is null)')),
  ('A6: one Farcaster, Lens and Bluesky account per person (unique, partial)', exists (select 1 from pg_indexes where schemaname = 'studio' and indexname = 'person_accounts_one_of_kind' and indexdef ilike 'create unique index%(person_id, kind)%unlinked_at is null%wallet%')),
  ('A6: the 3-wallet trigger is on', exists (select 1 from pg_trigger where tgname = 'person_accounts_wallets' and tgrelid = 'studio.person_accounts'::regclass and tgenabled = 'O')),
  ('the account numbers match their kind', exists (select 1 from pg_constraint where conname = 'person_accounts_kind_range' and conrelid = 'studio.person_accounts'::regclass)),
  ('studio_writer: select and insert on people, person_accounts and person_link_attempts', (select bool_and(has_table_privilege('studio_writer', 'studio.' || t, 'select') and has_table_privilege('studio_writer', 'studio.' || t, 'insert')) from unnest(array['people', 'person_accounts', 'person_link_attempts']) t)),
  ('studio_writer: no delete or table-wide update on them', (select not bool_or(has_table_privilege('studio_writer', 'studio.' || t, 'delete') or has_table_privilege('studio_writer', 'studio.' || t, 'update') or has_table_privilege('studio_writer', 'studio.' || t, 'truncate')) from unnest(array['people', 'person_accounts', 'person_link_attempts']) t)),
  ('studio_writer: may only end a link (update of unlinked_at and ended_by)', has_column_privilege('studio_writer', 'studio.person_accounts', 'unlinked_at', 'update') and has_column_privilege('studio_writer', 'studio.person_accounts', 'ended_by', 'update') and not has_column_privilege('studio_writer', 'studio.person_accounts', 'person_id', 'update') and not has_column_privilege('studio_writer', 'studio.person_accounts', 'account', 'update')),
  ('the ending policy: an active row may only be ended', exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'person_accounts' and policyname = 'writer_unlink' and cmd = 'UPDATE')),
  ('anon and authenticated: nothing on the new tables', (select not bool_or(has_table_privilege(r, 'studio.' || t, 'select') or has_table_privilege(r, 'studio.' || t, 'insert')) from unnest(array['people', 'person_accounts', 'person_link_attempts']) t, unnest(array['anon', 'authenticated']) r)),
  ('person_id on image_asks, remix_asks, challenge_eligibility and challenge_marks', (select count(*) = 4 from information_schema.columns where table_schema = 'studio' and column_name = 'person_id' and data_type = 'bigint' and table_name in ('image_asks', 'remix_asks', 'challenge_eligibility', 'challenge_marks'))),
  ('challenge_eligibility keeps via and via_account, both or neither', (select count(*) = 2 from information_schema.columns where table_schema = 'studio' and table_name = 'challenge_eligibility' and column_name in ('via', 'via_account')) and exists (select 1 from pg_constraint where conname = 'challenge_eligibility_via_pair')),
  ('the backfill: every active wallet link is an active row under its FID''s person (or its own, past 3)', not exists (select 1 from studio.wallet_links l where l.unlinked_at is null and not exists (select 1 from studio.person_accounts a where a.account = -l.account_id and a.unlinked_at is null))),
  ('the backfill: every account has at most one active row, and every person''s rows fit A6', not exists (select 1 from studio.person_accounts where unlinked_at is null and kind = 'wallet' group by person_id having count(*) > 3)),
  ('the backfill: every ended wallet link is copied', (select count(*) from studio.wallet_links where unlinked_at is not null) <= (select count(*) from studio.person_accounts where kind = 'wallet' and unlinked_at is not null)),
  ('every person has had an account (no empty person made)', not exists (select 1 from studio.people p where not exists (select 1 from studio.person_accounts a where a.person_id = p.id))),
  ('the challenge record''s public tables are untouched: no person_id anywhere anon can read', not exists (select 1 from information_schema.columns c where c.table_schema = 'studio' and c.column_name = 'person_id' and has_table_privilege('anon', 'studio.' || c.table_name, 'select')))
) as t(what, ok);
```

## D. Read-back (b)

One `do $$` block with made-up accounts (FID 990001, four made-up wallets, a made-up Bluesky number). It adds them,
checks what must be refused (an account under two people, a second Farcaster account, a fourth wallet, a wallet
number as another kind), unlinks one, adds realistic count and challenge rows, deletes everything, and ends with the
notice `READ-BACK PASSED`, or stops with an error that starts `READ-BACK FAILED:`. Nothing is kept either way. No
`set role`, no temporary tables.

```sql
do $$
declare
  p bigint;
  q bigint;
  w1 bigint;
  w2 bigint;
  w3 bigint;
  w4 bigint;
  sky bigint;
  v uuid;
  n int;
begin
  -- A made-up person: FID 990001 with two wallets and a Bluesky account. No real account is used.
  insert into studio.wallet_accounts (address) values ('0x99000000000000000000000000000000000000a1') returning id into w1;
  insert into studio.wallet_accounts (address) values ('0x99000000000000000000000000000000000000a2') returning id into w2;
  insert into studio.wallet_accounts (address) values ('0x99000000000000000000000000000000000000a3') returning id into w3;
  insert into studio.wallet_accounts (address) values ('0x99000000000000000000000000000000000000a4') returning id into w4;
  sky := -1000990001;
  insert into studio.people default values returning id into p;
  insert into studio.person_accounts (person_id, kind, account, how) values (p, 'farcaster', 990001, 'first');
  insert into studio.person_accounts (person_id, kind, account, how) values (p, 'wallet', -w1, 'signed');
  insert into studio.person_accounts (person_id, kind, account, how) values (p, 'wallet', -w2, 'verified');
  insert into studio.person_accounts (person_id, kind, account, how) values (p, 'bluesky', sky, 'signed');
  if (select count(*) from studio.person_accounts where person_id = p and unlinked_at is null) <> 4 then
    raise exception 'READ-BACK FAILED: the made-up person''s four accounts did not all go in';
  end if;

  -- A1: the same wallet can't be active under a second person.
  insert into studio.people default values returning id into q;
  begin
    insert into studio.person_accounts (person_id, kind, account, how) values (q, 'wallet', -w1, 'signed');
    raise exception 'READ-BACK FAILED: a wallet went in under two people at once (A1)';
  exception when unique_violation then null;
  end;
  -- A6: a second Farcaster account is refused; a third wallet goes in, a fourth is refused.
  begin
    insert into studio.person_accounts (person_id, kind, account, how) values (p, 'farcaster', 990002, 'signed');
    raise exception 'READ-BACK FAILED: a person took a second Farcaster account (A6)';
  exception when unique_violation then null;
  end;
  insert into studio.person_accounts (person_id, kind, account, how) values (p, 'wallet', -w3, 'signed');
  begin
    insert into studio.person_accounts (person_id, kind, account, how) values (p, 'wallet', -w4, 'signed');
    raise exception 'READ-BACK FAILED: a person took a fourth wallet (A6)';
  exception when check_violation then null;
  end;
  -- A wallet number in a Farcaster row is refused.
  begin
    insert into studio.person_accounts (person_id, kind, account, how) values (q, 'farcaster', -w4, 'first');
    raise exception 'READ-BACK FAILED: a wallet number went in as a Farcaster account';
  exception when check_violation then null;
  end;
  begin
    insert into studio.person_accounts (person_id, kind, account, how) values (q, 'bluesky', -w4, 'first');
    raise exception 'READ-BACK FAILED: a wallet number went in as a Bluesky account';
  exception when check_violation then null;
  end;

  -- Unlink the third wallet; it gets a person of its own (q), and may then be active there.
  update studio.person_accounts set unlinked_at = now(), ended_by = 'person' where account = -w3 and unlinked_at is null;
  insert into studio.person_accounts (person_id, kind, account, how) values (q, 'wallet', -w3, 'first');
  if (select count(*) from studio.person_accounts where account = -w3) <> 2 or (select person_id from studio.person_accounts where account = -w3 and unlinked_at is null) <> q then
    raise exception 'READ-BACK FAILED: the unlinked wallet''s history is not two rows ending under its own person';
  end if;

  -- Realistic rows with the person: a Generate, a Remix frame, a challenge decision and a submission.
  insert into studio.image_asks (fid, person_id) values (990001, p);
  insert into studio.remix_asks (person, person_id) values (990001, p);
  -- A version to hang the challenge rows on: any existing one without a decision (versions are append-only, so the
  -- read-back adds none). The rows use the challenge id 'readback-linked', which no challenge has, and are deleted.
  v := (select x.id from studio.element_versions x where not exists (select 1 from studio.challenge_eligibility e where e.version_id = x.id) order by x.created_at limit 1);
  -- (A database with no version at all, as a test runner's empty one, skips the two challenge rows.)
  if v is not null then
    insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible, person_id, via, via_account)
      values (v, 'readback-linked', 990001, 'passed', true, p, 'bluesky', sky);
    insert into studio.challenge_marks (challenge, fid, character, version_id, person_id) values ('readback-linked', 990001, 'zei', v, p);
    begin
      update studio.challenge_eligibility set via_account = null where version_id = v;
      raise exception 'READ-BACK FAILED: a decision kept a kind of account without the account';
    exception when check_violation then null;
    end;
  end if;
  n := (select count(*) from studio.image_asks where person_id = p) + (select count(*) from studio.remix_asks where person_id = p)
     + (select count(*) from studio.challenge_eligibility where person_id = p) + (select count(*) from studio.challenge_marks where person_id = p);
  if n <> (case when v is null then 2 else 4 end) then
    raise exception 'READ-BACK FAILED: the per-person rows did not all go in (%)', n;
  end if;
  insert into studio.person_link_attempts (person_id) values (p);

  -- Clean up, in order.
  delete from studio.challenge_marks where challenge = 'readback-linked';
  delete from studio.challenge_eligibility where challenge = 'readback-linked';
  delete from studio.image_asks where person_id = p;
  delete from studio.remix_asks where person_id = p;
  delete from studio.person_link_attempts where person_id in (p, q);
  delete from studio.person_accounts where person_id in (p, q);
  delete from studio.people where id in (p, q);
  delete from studio.wallet_accounts where id in (w1, w2, w3, w4);
  raise notice 'READ-BACK PASSED';
end $$;
```

## Tested on PGlite

`npm run test:linked-accounts-sql`: on 0001..0034 (main's, word for word), made-up links of today's kinds, then the
pack's items 2, 5, 3, 4 from its doc, then this file: A leaves nothing; B applies and the backfill puts each link
where it belongs; (a) is all true read-only; (b) passes and leaves nothing; B twice fails and changes nothing;
studio_writer can add and only end rows; anon reads nothing; 19 planted faults are each caught by (a) or (b); every
pack read-back still passes; and the whole folder applies in name order (as the other test runners apply it).
The copy blocks above are checked against the migration file word for word.
