-- NEXT_linked_accounts (numbered at merge). Branch linked-accounts: linked accounts v2, the owner's model of
-- 2026-11-05 (docs/proposals/linked-accounts-v2.md on branch designs-2026-11-05): one Snowmoon account OWNS its work,
-- challenge entries, balance and chosen name; social accounts and wallets are ways in; a main sign-in manages them.
-- DRAFT, NOT APPLIED. Drafted by a coding agent (Claude, a closed model by Anthropic); the owner pastes it in the
-- Supabase SQL Editor; nothing here is applied by the agent.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0001..0036
-- (main, with the sign-in release's 0035 and 0036). Apply it after the SQL pack's other pending items (3
-- NEXT_remix_count, 4 NEXT_challenge_daily, 6 NEXT_social_lens_challenge; docs/legal/sql-pack-2026-11-04.md on branch
-- sql-pack) and after NEXT_person_balance if that goes first; it needs none of them, and their read-backs still pass
-- after it. Apply NEXT_person_balance BEFORE it: the person-balance ledgers get their owner stamp only if they exist
-- when this runs (on a database without them it stamps the tables that exist, and stamp_unowned skips the others).
-- Paste it in this order:
--   A. the dry run: the migration, ending in rollback; (nothing is kept);
--   B. the migration: the same, ending in commit;
--   C. the read-back, in two parts: (a) one read-only select whose rows should all be true; (b) one do block that adds
--      a realistic made-up Snowmoon account (a Farcaster ID, a wallet and a Bluesky account), its main, a recovery
--      request, a join and a prize claim, checks what must be refused, deletes them all, and ends with the notice
--      "READ-BACK PASSED" or stops with "READ-BACK FAILED: …" (nothing is kept either way).
-- Not safe to run twice: a second B stops at its first `create` and changes nothing.
-- Tested in PGlite only (npm run test:linked-accounts-sql), on 0001..0036, the pack's pending items and
-- NEXT_person_balance, with planted faults that the read-back must catch.
--
-- SAFE WITH TODAY'S LIVE CODE, because:
-- - it only adds tables, functions, nullable columns and triggers; no column live code writes changes type, no
--   constraint is added to a table live code writes except on the new columns, and nothing is dropped or renamed;
-- - the owner-stamp triggers (section 9) only fill the new person_id when the code leaves it null (as all of today's
--   code does) and catch every error, so they never fail a live insert; the side-table trigger is the same;
-- - studio.wallet_links and studio.social_links stay as they are and live code keeps reading them: nothing reads the
--   new tables until LINKED_ACCOUNTS.enabled is on (src/lib/config.ts, off);
-- - no new column is on a table anon can read: the public tables' owners are in the private studio.row_owners.
--
-- What it adds (none of it publicly readable):
-- 1. studio.people: one row per Snowmoon account, with its stable public_id (8 characters, no look-alikes, never changed).
-- 2. studio.person_accounts: one row each time a sign-in is a way into a Snowmoon account; ended once, with who did it
--    (ended_by 'self', 'main', 'joined'; ended_via, the sign-in). A1, A6 (index and trigger), and A2 (a trigger: a
--    sign-in unlinked less than 30 days ago can't join another Snowmoon account or start one; it may rejoin its own).
-- 3. studio.person_link_attempts (A8).
-- 4. studio.person_mains and studio.person_names: append-only logs of the main sign-in and the chosen name; each must
--    be an active sign-in; the main can't be unlinked without a new main (checked at commit).
-- 5. studio.main_requests: requests for a new main; one open per account; effective 30 days after; 'done' never sooner.
-- 6. studio.person_joins: a join of two Snowmoon accounts by both mains (the join audit); studio.owner_of follows it.
-- 7. studio.prize_claims: insert-only, only by the main sign-in at the time (payout address changes are new rows).
-- 8. studio.person_notices: the one-time existing-wallet notice.
-- 9. The owner stamp: person_id on 26 private tables (those that exist), filled by a trigger when code leaves it null;
--    studio.row_owners for elements, recipes, takes, adaptations and sheet_remix_asks.
-- 10. The backfill: v1's (today's wallet and Lens/Bluesky links become Snowmoon accounts), then a Snowmoon account of
--    its own for every other sign-in with rows, a main and a name for each, the wallet notice, and the owner stamp on
--    every existing row.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept.
begin;

-- ---------------------------------------------------------------------------
-- 1. Snowmoon accounts (studio.people). The id is private: never shown, never in a URL or a public record. public_id
--    is the stable page address (snowmoon.party/u/<public_id>): random, 8 characters from 31 with no look-alikes
--    (lowercase letters and digits without 0, o, 1, l and i: abcdefghjkmnpqrstuvwxyz23456789; owner, 2026-11-05),
--    unique, and never changed or reused (studio_writer can't update or delete a row here).
-- ---------------------------------------------------------------------------

create function studio.new_public_id() returns text
language sql volatile set search_path = pg_catalog, pg_temp as $fn$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', (get_byte(uuid_send(gen_random_uuid()), i) % 31) + 1, 1), '' order by i)
  from generate_series(0, 7) as i
$fn$;
revoke all on function studio.new_public_id() from public;
grant execute on function studio.new_public_id() to studio_writer;

create table studio.people (
  id bigint generated always as identity primary key,
  public_id text not null default studio.new_public_id() constraint people_public_id_format check (public_id ~ '^[a-hjkmnp-z2-9]{8}$'),
  created_at timestamptz not null default now(),
  constraint people_public_id_unique unique (public_id)
);

-- ---------------------------------------------------------------------------
-- 2. Sign-ins: which sign-in (a Farcaster ID, a wallet, a Lens or a Bluesky account, named by its sign-in number,
--    src/lib/people.ts) is a way into which Snowmoon account, and when. Ending one sets unlinked_at, ended_by and
--    ended_via (the sign-in that did it) once. how 'joined' and ended_by 'joined': moved by a join of two accounts.
-- ---------------------------------------------------------------------------

create table studio.person_accounts (
  id bigint generated always as identity primary key,
  person_id bigint not null references studio.people(id),
  kind text not null check (kind in ('farcaster', 'wallet', 'lens', 'bluesky')),
  account bigint not null,
  how text not null check (how in ('first', 'signed', 'verified', 'joined')),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  ended_by text check (ended_by in ('person', 'unverified', 'main', 'self', 'joined')),
  ended_via bigint check (ended_via <> 0),
  constraint person_accounts_kind_range check (
    (kind = 'farcaster' and account > 0)
    or (kind = 'wallet' and account < 0 and account > -1000000000)
    or (kind in ('lens', 'bluesky') and account <= -1000000000)
  ),
  check (unlinked_at is null or unlinked_at >= linked_at),
  check ((unlinked_at is null) = (ended_by is null)),
  check (unlinked_at is not null or ended_via is null),
  -- Only the automatic wallet link is ended automatically, and only a wallet is linked automatically.
  check (ended_by is distinct from 'unverified' or how = 'verified'),
  check (how <> 'verified' or kind = 'wallet')
);
-- A1: one Snowmoon account per sign-in at a time.
create unique index person_accounts_one_active on studio.person_accounts (account) where unlinked_at is null;
-- A6: one Farcaster, one Lens and one Bluesky account per Snowmoon account (wallets: the trigger below).
create unique index person_accounts_one_of_kind on studio.person_accounts (person_id, kind) where unlinked_at is null and kind <> 'wallet';
create index person_accounts_person on studio.person_accounts (person_id) where unlinked_at is null;
-- A2 and A5: a sign-in's history.
create index person_accounts_history on studio.person_accounts (account, linked_at desc);

-- A6: at most 3 active wallets per Snowmoon account (owner, 2026-11-04).
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

-- A2, the 30-day wait (owner, 2026-11-05): a sign-in that was unlinked (by itself, by the main, or before v2 by the
-- person) can neither join another Snowmoon account nor start a new one until 30 days after it left; it may rejoin the
-- one it left at once. Read from its last ended row, at the new row's linked_at. A row moved by a join ('joined') has
-- no wait. The migration's own backfill (below) is exempt: it copies history made under the old rules.
create function studio.person_accounts_wait() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
declare
  last record;
begin
  if coalesce(current_setting('studio.linked_backfill', true), '') = 'on' then
    return new;
  end if;
  select person_id, unlinked_at, ended_by into last from studio.person_accounts
  where account = new.account and unlinked_at is not null
  order by unlinked_at desc, id desc limit 1;
  if found and last.ended_by <> 'joined' and last.person_id <> new.person_id
     and new.linked_at < last.unlinked_at + interval '30 days' then
    raise exception 'this sign-in left a Snowmoon account less than 30 days ago (A2)' using errcode = '23514';
  end if;
  return new;
end $fn$;
create trigger person_accounts_wait before insert on studio.person_accounts
  for each row execute function studio.person_accounts_wait();
revoke all on function studio.person_accounts_wait() from public;

-- ---------------------------------------------------------------------------
-- 3. Link attempts (A8). The Snowmoon account only, and when.
-- ---------------------------------------------------------------------------

create table studio.person_link_attempts (
  person_id bigint not null references studio.people(id),
  at timestamptz not null default now()
);
create index person_link_attempts_person_at on studio.person_link_attempts (person_id, at);

-- ---------------------------------------------------------------------------
-- 4. The main sign-in, and the chosen name: each an append-only log; the current one is the latest row. Each row's
--    account must be an active sign-in of that Snowmoon account. A main set by recovery needs that request done.
-- ---------------------------------------------------------------------------

create table studio.person_mains (
  id bigint generated always as identity primary key,
  person_id bigint not null references studio.people(id),
  account bigint not null check (account <> 0),
  how text not null check (how in ('first', 'chosen', 'next', 'recovery', 'joined')),
  by_account bigint check (by_account <> 0),
  at timestamptz not null default now(),
  check ((how in ('first', 'recovery')) = (by_account is null))
);
create index person_mains_person on studio.person_mains (person_id, at desc, id desc);

create table studio.person_names (
  id bigint generated always as identity primary key,
  person_id bigint not null references studio.people(id),
  account bigint not null check (account <> 0),
  by_account bigint check (by_account <> 0),
  at timestamptz not null default now()
);
create index person_names_person on studio.person_names (person_id, at desc, id desc);

-- The Snowmoon account's main now (null if it has none).
create function studio.main_of(p bigint) returns bigint
language sql stable set search_path = pg_catalog, pg_temp as $fn$
  select account from studio.person_mains where person_id = p order by at desc, id desc limit 1
$fn$;
revoke all on function studio.main_of(bigint) from public;
grant execute on function studio.main_of(bigint) to studio_writer;

create function studio.person_member_check() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
begin
  if not exists (select 1 from studio.person_accounts where person_id = new.person_id and account = new.account and unlinked_at is null) then
    raise exception 'not an active sign-in of this Snowmoon account' using errcode = '23514';
  end if;
  if tg_table_name = 'person_mains' then
    if (to_jsonb(new) ->> 'how') = 'recovery' and not exists (
      select 1 from studio.main_requests r where r.person_id = new.person_id and r.new_main = new.account
        and r.ended_how = 'done' and new.at >= r.effective_at
    ) then
      raise exception 'a main set by recovery needs its request done, 30 days after it was made' using errcode = '23514';
    end if;
  end if;
  return new;
end $fn$;
revoke all on function studio.person_member_check() from public;
create trigger person_mains_member before insert on studio.person_mains
  for each row execute function studio.person_member_check();
create trigger person_names_member before insert on studio.person_names
  for each row execute function studio.person_member_check();

-- The main stays an active sign-in: ending the main's row needs a new main in the same transaction (checked at commit),
-- unless no sign-in is left.
create function studio.person_main_still_active() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
declare
  m bigint := studio.main_of(new.person_id);
begin
  if m is not null and exists (select 1 from studio.person_accounts where person_id = new.person_id and unlinked_at is null)
     and not exists (select 1 from studio.person_accounts where person_id = new.person_id and account = m and unlinked_at is null) then
    raise exception 'the main sign-in was unlinked without a new main' using errcode = '23514';
  end if;
  return null;
end $fn$;
revoke all on function studio.person_main_still_active() from public;
create constraint trigger person_accounts_main_active after update on studio.person_accounts
  deferrable initially deferred for each row execute function studio.person_main_still_active();

-- ---------------------------------------------------------------------------
-- 5. Requests for a new main (a lost main sign-in). One open request per Snowmoon account. It takes effect 30 days
--    after it was made; only the main cancels it; unlinking the requester ends it. 'done' only from effective_at.
-- ---------------------------------------------------------------------------

create table studio.main_requests (
  id bigint generated always as identity primary key,
  person_id bigint not null references studio.people(id),
  requested_by bigint not null check (requested_by <> 0),
  new_main bigint not null check (new_main <> 0),
  requested_at timestamptz not null default now(),
  effective_at timestamptz not null,
  ended_at timestamptz,
  ended_how text check (ended_how in ('cancelled', 'unlinked', 'done')),
  ended_by bigint check (ended_by <> 0),
  constraint main_requests_thirty_days check (effective_at = requested_at + interval '30 days'),
  constraint main_requests_ended_pair check ((ended_at is null) = (ended_how is null)),
  constraint main_requests_done_on_time check (ended_how is distinct from 'done' or ended_at >= effective_at),
  check (ended_at is null or ended_at >= requested_at)
);
create unique index main_requests_one_open on studio.main_requests (person_id) where ended_at is null;

create function studio.main_request_check() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
begin
  if not exists (select 1 from studio.person_accounts where person_id = new.person_id and account = new.requested_by and unlinked_at is null)
     or not exists (select 1 from studio.person_accounts where person_id = new.person_id and account = new.new_main and unlinked_at is null) then
    raise exception 'a request needs two active sign-ins of this Snowmoon account' using errcode = '23514';
  end if;
  if studio.main_of(new.person_id) = new.requested_by then
    raise exception 'the main sign-in does not request itself' using errcode = '23514';
  end if;
  return new;
end $fn$;
revoke all on function studio.main_request_check() from public;
create trigger main_requests_check before insert on studio.main_requests
  for each row execute function studio.main_request_check();

-- ---------------------------------------------------------------------------
-- 6. Joins of two Snowmoon accounts (both mains, in one request), and who did it. Insert-only; an account is joined
--    into another at most once. Rows keep their stamp and resolve through studio.owner_of.
-- ---------------------------------------------------------------------------

create table studio.person_joins (
  from_person bigint primary key references studio.people(id),
  into_person bigint not null references studio.people(id),
  from_main bigint not null check (from_main <> 0),
  into_main bigint not null check (into_main <> 0),
  at timestamptz not null default now(),
  check (from_person <> into_person)
);

create function studio.person_join_check() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
begin
  if studio.main_of(new.from_person) is distinct from new.from_main or studio.main_of(new.into_person) is distinct from new.into_main then
    raise exception 'a join needs the main sign-in of each Snowmoon account' using errcode = '23514';
  end if;
  if exists (select 1 from studio.person_joins where from_person = new.into_person) then
    raise exception 'that Snowmoon account was already joined into another' using errcode = '23514';
  end if;
  return new;
end $fn$;
revoke all on function studio.person_join_check() from public;
create trigger person_joins_check before insert on studio.person_joins
  for each row execute function studio.person_join_check();

-- The Snowmoon account a stamp belongs to now (through joins).
create function studio.owner_of(p bigint) returns bigint
language sql stable set search_path = pg_catalog, pg_temp as $fn$
  with recursive up(id, depth) as (
    select p, 0
    union all
    select j.into_person, up.depth + 1 from studio.person_joins j join up on j.from_person = up.id where up.depth < 64
  )
  select id from up order by depth desc limit 1
$fn$;
revoke all on function studio.owner_of(bigint) from public;
grant execute on function studio.owner_of(bigint) to studio_writer;

-- ---------------------------------------------------------------------------
-- 7. Prize claims and payout addresses: insert-only; each change is a new row; only the main sign-in at the time.
-- ---------------------------------------------------------------------------

create table studio.prize_claims (
  id bigint generated always as identity primary key,
  challenge text not null,
  version_id uuid not null,
  person_id bigint not null references studio.people(id),
  claimed_via bigint not null check (claimed_via <> 0),
  payout_address text not null check (payout_address ~ '^0x[0-9a-f]{40}$'),
  at timestamptz not null default now()
);
create index prize_claims_entry on studio.prize_claims (challenge, version_id, at desc);

create function studio.prize_claim_check() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
begin
  if studio.main_of(new.person_id) is distinct from new.claimed_via
     or not exists (select 1 from studio.person_accounts where person_id = new.person_id and account = new.claimed_via and unlinked_at is null) then
    raise exception 'only the main sign-in claims a prize or gives its payout address' using errcode = '23514';
  end if;
  return new;
end $fn$;
revoke all on function studio.prize_claim_check() from public;
create trigger prize_claims_check before insert on studio.prize_claims
  for each row execute function studio.prize_claim_check();

-- ---------------------------------------------------------------------------
-- 8. One-time notices (the existing-wallet notice): made at migration, seen once.
-- ---------------------------------------------------------------------------

create table studio.person_notices (
  person_id bigint not null references studio.people(id),
  notice text not null check (notice in ('wallet-owned')),
  account bigint not null check (account <> 0),
  made_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (person_id, notice, account)
);

-- ---------------------------------------------------------------------------
-- 9. The owner stamp: person_id on each owned private table, filled by the app, or, when the code leaves it null (old
--    code during the rollout), by a before-insert trigger from the sign-in's current Snowmoon account. The trigger
--    never fails an insert. Public tables (elements, recipes, takes, adaptations) and sheet_remix_asks (whose
--    read-back fixes its columns) keep their owner in a private side table, studio.row_owners, so no Snowmoon
--    account id is ever publicly readable.
-- ---------------------------------------------------------------------------

create table studio.row_owners (
  tbl text not null check (tbl in ('elements', 'recipes', 'takes', 'adaptations', 'sheet_remix_asks')),
  row_id text not null,
  person_id bigint not null references studio.people(id),
  primary key (tbl, row_id)
);
create index row_owners_person on studio.row_owners (person_id, tbl);

-- The sign-in's Snowmoon account now, or null.
create function studio.person_of(n bigint) returns bigint
language sql stable set search_path = pg_catalog, pg_temp as $fn$
  select person_id from studio.person_accounts where account = n and unlinked_at is null
$fn$;
revoke all on function studio.person_of(bigint) from public;
grant execute on function studio.person_of(bigint) to studio_writer;

-- tg_argv[0]: the sign-in number's column; tg_argv[1]: 'neg' when the column holds a wallet account's id (its number
-- is minus that id).
create function studio.stamp_owner() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
declare
  n bigint;
  p bigint;
begin
  if new.person_id is not null then
    return new;
  end if;
  n := (to_jsonb(new) ->> tg_argv[0])::bigint;
  if tg_argv[1] = 'neg' then n := -n; end if;
  p := studio.person_of(n);
  if p is not null then
    new := jsonb_populate_record(new, jsonb_build_object('person_id', p));
  end if;
  return new;
exception when others then
  return new;
end $fn$;
revoke all on function studio.stamp_owner() from public;

create function studio.stamp_row_owner() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
declare
  p bigint;
begin
  p := studio.person_of((to_jsonb(new) ->> tg_argv[0])::bigint);
  if p is not null then
    insert into studio.row_owners (tbl, row_id, person_id) values (tg_table_name, to_jsonb(new) ->> 'id', p) on conflict do nothing;
  end if;
  return null;
exception when others then
  return null;
end $fn$;
revoke all on function studio.stamp_row_owner() from public;

-- The app's hook for rows made while the switch was off by a sign-in that had no Snowmoon account yet: when it gets
-- one, its unstamped rows are stamped with it. Only null stamps are filled, and only with that sign-in's account now.
create function studio.stamp_unowned(n bigint) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $fn$
declare
  p bigint := studio.person_of(n);
  t record;
begin
  if p is null then
    return;
  end if;
  for t in select * from (values
    ('image_asks', 'fid'), ('remix_asks', 'person'), ('chat_calls', 'fid'), ('remix_frames', 'person'), ('storyboards', 'person'),
    ('agents', 'person'), ('likes', 'fid'), ('take_likes', 'fid'), ('ratings', 'fid'), ('picks', 'fid'), ('notes', 'person'),
    ('suggestions', 'person'), ('version_posts', 'fid'), ('contributor_consents', 'fid'), ('challenge_marks', 'fid'),
    ('challenge_eligibility', 'fid'), ('direction_notes', 'person'), ('line_rewrites', 'person'), ('mp_agent_matches', 'person'),
    ('wallet_payments', '-account_id'), ('wallet_debits', '-account_id'), ('wallet_credits', '-account_id'),
    ('person_pay_intents', 'person'), ('person_payments', 'person'), ('person_debits', 'person'), ('person_credits', 'person')
  ) as x(tbl, num)
  loop
    -- A table made after this migration (NEXT_person_balance applied later) has no stamp column: skipped.
    continue when not exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = t.tbl and column_name = 'person_id');
    execute format('update studio.%I set person_id = $1 where person_id is null and %s = $2', t.tbl,
      case when t.num = '-account_id' then '-account_id' else quote_ident(t.num) end) using p, n;
  end loop;
  for t in select * from (values ('elements', 'created_by_fid'), ('recipes', 'created_by_fid'), ('takes', 'created_by_fid'),
    ('adaptations', 'owner_person'), ('sheet_remix_asks', 'fid')) as x(tbl, num)
  loop
    continue when to_regclass('studio.' || t.tbl) is null;
    execute format('insert into studio.row_owners (tbl, row_id, person_id) select %L, id::text, $1 from studio.%I where %I = $2 on conflict do nothing',
      t.tbl, t.tbl, t.num) using p, n;
  end loop;
end $fn$;
revoke all on function studio.stamp_unowned(bigint) from public;
grant execute on function studio.stamp_unowned(bigint) to studio_writer;

do $$
declare
  t record;
begin
  for t in select * from (values
    ('image_asks', 'fid', ''), ('remix_asks', 'person', ''), ('chat_calls', 'fid', ''), ('remix_frames', 'person', ''),
    ('storyboards', 'person', ''), ('agents', 'person', ''), ('likes', 'fid', ''), ('take_likes', 'fid', ''),
    ('ratings', 'fid', ''), ('picks', 'fid', ''), ('notes', 'person', ''), ('suggestions', 'person', ''),
    ('version_posts', 'fid', ''), ('contributor_consents', 'fid', ''), ('challenge_marks', 'fid', ''),
    ('challenge_eligibility', 'fid', ''), ('direction_notes', 'person', ''), ('line_rewrites', 'person', ''),
    ('mp_agent_matches', 'person', ''), ('wallet_payments', 'account_id', 'neg'), ('wallet_debits', 'account_id', 'neg'),
    ('wallet_credits', 'account_id', 'neg'), ('person_pay_intents', 'person', ''), ('person_payments', 'person', ''),
    ('person_debits', 'person', ''), ('person_credits', 'person', '')
  ) as x(tbl, col, sign)
  loop
    -- Tables of a migration not applied yet (the person-balance ledgers) are skipped: apply NEXT_person_balance first.
    continue when to_regclass('studio.' || t.tbl) is null;
    execute format('alter table studio.%I add column if not exists person_id bigint references studio.people(id)', t.tbl);
    execute format('create index if not exists %I on studio.%I (person_id) where person_id is not null', t.tbl || '_owner', t.tbl);
    execute format('create trigger stamp_owner before insert on studio.%I for each row execute function studio.stamp_owner(%L, %L)', t.tbl, t.col, t.sign);
  end loop;
  for t in select * from (values ('elements', 'created_by_fid'), ('recipes', 'created_by_fid'), ('takes', 'created_by_fid'),
    ('adaptations', 'owner_person'), ('sheet_remix_asks', 'fid')) as x(tbl, col)
  loop
    continue when to_regclass('studio.' || t.tbl) is null;
    execute format('create trigger stamp_row_owner after insert on studio.%I for each row execute function studio.stamp_row_owner(%L)', t.tbl, t.col);
  end loop;
end $$;

-- challenge_eligibility.fid and challenge_marks.fid stay the sign-in the version was published or submitted with: the
-- challenge record names it by its public id. challenge_eligibility also keeps which linked social account passed the
-- check (via, its kind; via_account, its number; A4).
alter table studio.challenge_eligibility add column via text check (via in ('farcaster', 'lens', 'bluesky'));
alter table studio.challenge_eligibility add column via_account bigint check (via_account <> 0);
alter table studio.challenge_eligibility add constraint challenge_eligibility_via_pair check ((via is null) = (via_account is null));
create index challenge_eligibility_via_account on studio.challenge_eligibility (challenge, via_account) where via_account is not null;

-- ---------------------------------------------------------------------------
-- 10. Row-level security and grants: studio_writer reads and adds; it only ends links and requests and marks a notice
--     seen; nothing is deleted or moved; nothing for anon or authenticated.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['people', 'person_accounts', 'person_link_attempts', 'person_mains', 'person_names',
    'main_requests', 'person_joins', 'prize_claims', 'person_notices', 'row_owners']
  loop
    execute format('alter table studio.%I enable row level security', t);
    execute format('create policy writer_read on studio.%I for select to studio_writer using (true)', t);
    execute format('revoke all on studio.%I from anon, authenticated', t);
    execute format('revoke update, delete, truncate, references, trigger on studio.%I from studio_writer', t);
    execute format('grant select, insert on studio.%I to studio_writer', t);
  end loop;
end $$;
create policy writer_insert on studio.people for insert to studio_writer with check (true);
create policy writer_insert on studio.person_accounts for insert to studio_writer with check (unlinked_at is null and ended_by is null);
create policy writer_unlink on studio.person_accounts for update to studio_writer using (unlinked_at is null) with check (unlinked_at is not null and ended_by is not null);
grant update (unlinked_at, ended_by, ended_via) on studio.person_accounts to studio_writer;
create policy writer_insert on studio.person_link_attempts for insert to studio_writer with check (true);
create policy writer_insert on studio.person_mains for insert to studio_writer with check (true);
create policy writer_insert on studio.person_names for insert to studio_writer with check (true);
create policy writer_insert on studio.main_requests for insert to studio_writer with check (ended_at is null);
create policy writer_end on studio.main_requests for update to studio_writer using (ended_at is null) with check (ended_at is not null);
grant update (ended_at, ended_how, ended_by) on studio.main_requests to studio_writer;
create policy writer_insert on studio.person_joins for insert to studio_writer with check (true);
create policy writer_insert on studio.prize_claims for insert to studio_writer with check (true);
create policy writer_insert on studio.person_notices for insert to studio_writer with check (seen_at is null);
create policy writer_seen on studio.person_notices for update to studio_writer using (seen_at is null) with check (seen_at is not null);
grant update (seen_at) on studio.person_notices to studio_writer;
create policy writer_insert on studio.row_owners for insert to studio_writer with check (true);

-- ---------------------------------------------------------------------------
-- 11. The backfill, from today's links (v1's), then a main and a name for each Snowmoon account, the wallet notice,
--     and the owner stamp on every existing row. Exempt from the 30-day trigger (it copies old history).
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  p bigint;
  skipped int := 0;
  has_social boolean := to_regclass('studio.social_links') is not null;
  nums bigint[];
  seen bigint[] := array[]::bigint[];
  n bigint;
  k text;
begin
  perform set_config('studio.linked_backfill', 'on', true);

  -- 11a. A Snowmoon account for each Farcaster ID that a wallet, Lens or Bluesky account is (or was) linked to.
  for r in execute
    'select fid from studio.wallet_links'
    || case when has_social then ' union select fid from studio.social_links where fid is not null' else '' end
    || ' order by 1'
  loop
    insert into studio.people default values returning id into p;
    insert into studio.person_accounts (person_id, kind, account, how) values (p, 'farcaster', r.fid, 'first');
  end loop;

  if has_social then
    -- 11b. Lens accounts with an active link to a Farcaster ID join its account; other Lens accounts in a link get
    --      one of their own.
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

    -- 11c. Bluesky accounts: an active link to a Farcaster ID joins its account; to a Lens account, that one's.
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

    -- 11d. Ended Lens and Bluesky links, as ended rows under the account of what they were linked to.
    insert into studio.person_accounts (person_id, kind, account, how, linked_at, unlinked_at, ended_by)
    select t.person_id, a.kind, -(1000000000 + a.id), 'signed', l.linked_at, l.unlinked_at, l.ended_by
    from studio.social_links l
    join studio.social_accounts a on a.id = l.account_id
    join studio.person_accounts t on t.account = coalesce(l.fid, -(1000000000 + l.lens_account_id)) and t.unlinked_at is null
    where l.unlinked_at is not null;
  end if;

  -- 11e. Wallets: an active link joins its Farcaster ID's account (oldest first, at most 3); the rest get their own.
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

  -- 11f. Any wallet, Lens or Bluesky account in a link that has no active row now: an account of its own, from when
  --      its last link ended (the move limit then reads its history).
  for r in
    select x.account, x.kind, max(x.unlinked_at) as since from studio.person_accounts x
    where x.unlinked_at is not null and not exists (select 1 from studio.person_accounts y where y.account = x.account and y.unlinked_at is null)
    group by x.account, x.kind order by x.account
  loop
    insert into studio.people default values returning id into p;
    insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, r.kind, r.account, 'first', r.since);
  end loop;

  -- 11g. Every other sign-in number with rows in an owned table: a Snowmoon account of its own ('first'), so every
  --      existing row has an owner. Numbers that don't name a sign-in (no Lens or Bluesky row, zero) are left alone.
  for r in select * from (values
    ('image_asks', 'fid'), ('remix_asks', 'person'), ('chat_calls', 'fid'), ('remix_frames', 'person'), ('storyboards', 'person'),
    ('agents', 'person'), ('likes', 'fid'), ('take_likes', 'fid'), ('ratings', 'fid'), ('picks', 'fid'), ('notes', 'person'),
    ('suggestions', 'person'), ('version_posts', 'fid'), ('contributor_consents', 'fid'), ('challenge_marks', 'fid'),
    ('challenge_eligibility', 'fid'), ('direction_notes', 'person'), ('line_rewrites', 'person'), ('mp_agent_matches', 'person'),
    ('wallet_payments', '-account_id'), ('wallet_debits', '-account_id'), ('person_pay_intents', 'person'),
    ('person_payments', 'person'), ('person_debits', 'person'), ('elements', 'created_by_fid'), ('recipes', 'created_by_fid'),
    ('takes', 'created_by_fid'), ('adaptations', 'owner_person'), ('sheet_remix_asks', 'fid')
  ) as x(tbl, num)
  loop
    continue when to_regclass('studio.' || r.tbl) is null;
    execute format('select coalesce(array_agg(distinct %s), array[]::bigint[]) from studio.%I t', case when r.num = '-account_id' then '-t.account_id' else 't.' || quote_ident(r.num) end, r.tbl)
      into nums;
    seen := seen || nums;
  end loop;
  foreach n in array (select coalesce(array_agg(distinct v order by v), array[]::bigint[]) from unnest(seen) v)
  loop
    continue when n is null or n = 0 or exists (select 1 from studio.person_accounts a where a.account = n and a.unlinked_at is null);
    if n > 0 then
      k := 'farcaster';
    elsif n > -1000000000 then
      k := 'wallet';
    else
      -- A Lens or Bluesky number: only with the sign-in release's tables (0035), and only if its row exists.
      continue when not has_social;
      execute 'select kind from studio.social_accounts where -(1000000000 + id) = $1' into k using n;
      continue when k is null;
    end if;
    insert into studio.people default values returning id into p;
    insert into studio.person_accounts (person_id, kind, account, how) values (p, k, n, 'first');
  end loop;

  -- 11h. A main and a name for each Snowmoon account: its Farcaster ID if it has one, else its oldest sign-in (the
  --      main); Farcaster, then Lens, Bluesky, a wallet (the name, as shown today).
  insert into studio.person_mains (person_id, account, how)
  select distinct on (person_id) person_id, account, 'first' from studio.person_accounts where unlinked_at is null
  order by person_id, (kind = 'farcaster') desc, linked_at, id;
  insert into studio.person_names (person_id, account)
  select distinct on (person_id) person_id, account from studio.person_accounts where unlinked_at is null
  order by person_id, array_position(array['farcaster', 'lens', 'bluesky', 'wallet'], kind), linked_at, id;

  -- 11i. The existing-wallet notice: each Snowmoon account with a wallet linked to it now, once per wallet.
  insert into studio.person_notices (person_id, notice, account)
  select person_id, 'wallet-owned', account from studio.person_accounts where kind = 'wallet' and unlinked_at is null and how in ('signed', 'verified');

  -- 11j. The owner stamp on every existing row: its number's Snowmoon account now.
  for r in select * from (values
    ('image_asks', 'fid'), ('remix_asks', 'person'), ('chat_calls', 'fid'), ('remix_frames', 'person'), ('storyboards', 'person'),
    ('agents', 'person'), ('likes', 'fid'), ('take_likes', 'fid'), ('ratings', 'fid'), ('picks', 'fid'), ('notes', 'person'),
    ('suggestions', 'person'), ('version_posts', 'fid'), ('contributor_consents', 'fid'), ('challenge_marks', 'fid'),
    ('challenge_eligibility', 'fid'), ('direction_notes', 'person'), ('line_rewrites', 'person'), ('mp_agent_matches', 'person'),
    ('wallet_payments', '-account_id'), ('wallet_debits', '-account_id'), ('wallet_credits', '-account_id'),
    ('person_pay_intents', 'person'), ('person_payments', 'person'), ('person_debits', 'person'), ('person_credits', 'person')
  ) as x(tbl, num)
  loop
    continue when to_regclass('studio.' || r.tbl) is null;
    execute format('update studio.%I t set person_id = a.person_id from studio.person_accounts a where t.person_id is null and a.unlinked_at is null and a.account = %s',
      r.tbl, case when r.num = '-account_id' then '-t.account_id' else 't.' || quote_ident(r.num) end);
  end loop;
  for r in select * from (values ('elements', 'created_by_fid', 'id'), ('recipes', 'created_by_fid', 'id'), ('takes', 'created_by_fid', 'id'),
    ('adaptations', 'owner_person', 'id'), ('sheet_remix_asks', 'fid', 'id')) as x(tbl, num, idc)
  loop
    continue when to_regclass('studio.' || r.tbl) is null;
    execute format('insert into studio.row_owners (tbl, row_id, person_id) select %L, t.%I::text, a.person_id from studio.%I t join studio.person_accounts a on a.account = t.%I and a.unlinked_at is null on conflict do nothing',
      r.tbl, r.idc, r.tbl, r.num);
  end loop;

  perform set_config('studio.linked_backfill', '', true);
  if skipped > 0 then
    raise notice 'linked accounts: % sign-in(s) would have passed a per-account limit and got a Snowmoon account of their own', skipped;
  end if;
end $$;

rollback;

-- B. THE MIGRATION. The same, ending in commit.
begin;

-- ---------------------------------------------------------------------------
-- 1. Snowmoon accounts (studio.people). The id is private: never shown, never in a URL or a public record. public_id
--    is the stable page address (snowmoon.party/u/<public_id>): random, 8 characters from 31 with no look-alikes
--    (lowercase letters and digits without 0, o, 1, l and i: abcdefghjkmnpqrstuvwxyz23456789; owner, 2026-11-05),
--    unique, and never changed or reused (studio_writer can't update or delete a row here).
-- ---------------------------------------------------------------------------

create function studio.new_public_id() returns text
language sql volatile set search_path = pg_catalog, pg_temp as $fn$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', (get_byte(uuid_send(gen_random_uuid()), i) % 31) + 1, 1), '' order by i)
  from generate_series(0, 7) as i
$fn$;
revoke all on function studio.new_public_id() from public;
grant execute on function studio.new_public_id() to studio_writer;

create table studio.people (
  id bigint generated always as identity primary key,
  public_id text not null default studio.new_public_id() constraint people_public_id_format check (public_id ~ '^[a-hjkmnp-z2-9]{8}$'),
  created_at timestamptz not null default now(),
  constraint people_public_id_unique unique (public_id)
);

-- ---------------------------------------------------------------------------
-- 2. Sign-ins: which sign-in (a Farcaster ID, a wallet, a Lens or a Bluesky account, named by its sign-in number,
--    src/lib/people.ts) is a way into which Snowmoon account, and when. Ending one sets unlinked_at, ended_by and
--    ended_via (the sign-in that did it) once. how 'joined' and ended_by 'joined': moved by a join of two accounts.
-- ---------------------------------------------------------------------------

create table studio.person_accounts (
  id bigint generated always as identity primary key,
  person_id bigint not null references studio.people(id),
  kind text not null check (kind in ('farcaster', 'wallet', 'lens', 'bluesky')),
  account bigint not null,
  how text not null check (how in ('first', 'signed', 'verified', 'joined')),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  ended_by text check (ended_by in ('person', 'unverified', 'main', 'self', 'joined')),
  ended_via bigint check (ended_via <> 0),
  constraint person_accounts_kind_range check (
    (kind = 'farcaster' and account > 0)
    or (kind = 'wallet' and account < 0 and account > -1000000000)
    or (kind in ('lens', 'bluesky') and account <= -1000000000)
  ),
  check (unlinked_at is null or unlinked_at >= linked_at),
  check ((unlinked_at is null) = (ended_by is null)),
  check (unlinked_at is not null or ended_via is null),
  -- Only the automatic wallet link is ended automatically, and only a wallet is linked automatically.
  check (ended_by is distinct from 'unverified' or how = 'verified'),
  check (how <> 'verified' or kind = 'wallet')
);
-- A1: one Snowmoon account per sign-in at a time.
create unique index person_accounts_one_active on studio.person_accounts (account) where unlinked_at is null;
-- A6: one Farcaster, one Lens and one Bluesky account per Snowmoon account (wallets: the trigger below).
create unique index person_accounts_one_of_kind on studio.person_accounts (person_id, kind) where unlinked_at is null and kind <> 'wallet';
create index person_accounts_person on studio.person_accounts (person_id) where unlinked_at is null;
-- A2 and A5: a sign-in's history.
create index person_accounts_history on studio.person_accounts (account, linked_at desc);

-- A6: at most 3 active wallets per Snowmoon account (owner, 2026-11-04).
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

-- A2, the 30-day wait (owner, 2026-11-05): a sign-in that was unlinked (by itself, by the main, or before v2 by the
-- person) can neither join another Snowmoon account nor start a new one until 30 days after it left; it may rejoin the
-- one it left at once. Read from its last ended row, at the new row's linked_at. A row moved by a join ('joined') has
-- no wait. The migration's own backfill (below) is exempt: it copies history made under the old rules.
create function studio.person_accounts_wait() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
declare
  last record;
begin
  if coalesce(current_setting('studio.linked_backfill', true), '') = 'on' then
    return new;
  end if;
  select person_id, unlinked_at, ended_by into last from studio.person_accounts
  where account = new.account and unlinked_at is not null
  order by unlinked_at desc, id desc limit 1;
  if found and last.ended_by <> 'joined' and last.person_id <> new.person_id
     and new.linked_at < last.unlinked_at + interval '30 days' then
    raise exception 'this sign-in left a Snowmoon account less than 30 days ago (A2)' using errcode = '23514';
  end if;
  return new;
end $fn$;
create trigger person_accounts_wait before insert on studio.person_accounts
  for each row execute function studio.person_accounts_wait();
revoke all on function studio.person_accounts_wait() from public;

-- ---------------------------------------------------------------------------
-- 3. Link attempts (A8). The Snowmoon account only, and when.
-- ---------------------------------------------------------------------------

create table studio.person_link_attempts (
  person_id bigint not null references studio.people(id),
  at timestamptz not null default now()
);
create index person_link_attempts_person_at on studio.person_link_attempts (person_id, at);

-- ---------------------------------------------------------------------------
-- 4. The main sign-in, and the chosen name: each an append-only log; the current one is the latest row. Each row's
--    account must be an active sign-in of that Snowmoon account. A main set by recovery needs that request done.
-- ---------------------------------------------------------------------------

create table studio.person_mains (
  id bigint generated always as identity primary key,
  person_id bigint not null references studio.people(id),
  account bigint not null check (account <> 0),
  how text not null check (how in ('first', 'chosen', 'next', 'recovery', 'joined')),
  by_account bigint check (by_account <> 0),
  at timestamptz not null default now(),
  check ((how in ('first', 'recovery')) = (by_account is null))
);
create index person_mains_person on studio.person_mains (person_id, at desc, id desc);

create table studio.person_names (
  id bigint generated always as identity primary key,
  person_id bigint not null references studio.people(id),
  account bigint not null check (account <> 0),
  by_account bigint check (by_account <> 0),
  at timestamptz not null default now()
);
create index person_names_person on studio.person_names (person_id, at desc, id desc);

-- The Snowmoon account's main now (null if it has none).
create function studio.main_of(p bigint) returns bigint
language sql stable set search_path = pg_catalog, pg_temp as $fn$
  select account from studio.person_mains where person_id = p order by at desc, id desc limit 1
$fn$;
revoke all on function studio.main_of(bigint) from public;
grant execute on function studio.main_of(bigint) to studio_writer;

create function studio.person_member_check() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
begin
  if not exists (select 1 from studio.person_accounts where person_id = new.person_id and account = new.account and unlinked_at is null) then
    raise exception 'not an active sign-in of this Snowmoon account' using errcode = '23514';
  end if;
  if tg_table_name = 'person_mains' then
    if (to_jsonb(new) ->> 'how') = 'recovery' and not exists (
      select 1 from studio.main_requests r where r.person_id = new.person_id and r.new_main = new.account
        and r.ended_how = 'done' and new.at >= r.effective_at
    ) then
      raise exception 'a main set by recovery needs its request done, 30 days after it was made' using errcode = '23514';
    end if;
  end if;
  return new;
end $fn$;
revoke all on function studio.person_member_check() from public;
create trigger person_mains_member before insert on studio.person_mains
  for each row execute function studio.person_member_check();
create trigger person_names_member before insert on studio.person_names
  for each row execute function studio.person_member_check();

-- The main stays an active sign-in: ending the main's row needs a new main in the same transaction (checked at commit),
-- unless no sign-in is left.
create function studio.person_main_still_active() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
declare
  m bigint := studio.main_of(new.person_id);
begin
  if m is not null and exists (select 1 from studio.person_accounts where person_id = new.person_id and unlinked_at is null)
     and not exists (select 1 from studio.person_accounts where person_id = new.person_id and account = m and unlinked_at is null) then
    raise exception 'the main sign-in was unlinked without a new main' using errcode = '23514';
  end if;
  return null;
end $fn$;
revoke all on function studio.person_main_still_active() from public;
create constraint trigger person_accounts_main_active after update on studio.person_accounts
  deferrable initially deferred for each row execute function studio.person_main_still_active();

-- ---------------------------------------------------------------------------
-- 5. Requests for a new main (a lost main sign-in). One open request per Snowmoon account. It takes effect 30 days
--    after it was made; only the main cancels it; unlinking the requester ends it. 'done' only from effective_at.
-- ---------------------------------------------------------------------------

create table studio.main_requests (
  id bigint generated always as identity primary key,
  person_id bigint not null references studio.people(id),
  requested_by bigint not null check (requested_by <> 0),
  new_main bigint not null check (new_main <> 0),
  requested_at timestamptz not null default now(),
  effective_at timestamptz not null,
  ended_at timestamptz,
  ended_how text check (ended_how in ('cancelled', 'unlinked', 'done')),
  ended_by bigint check (ended_by <> 0),
  constraint main_requests_thirty_days check (effective_at = requested_at + interval '30 days'),
  constraint main_requests_ended_pair check ((ended_at is null) = (ended_how is null)),
  constraint main_requests_done_on_time check (ended_how is distinct from 'done' or ended_at >= effective_at),
  check (ended_at is null or ended_at >= requested_at)
);
create unique index main_requests_one_open on studio.main_requests (person_id) where ended_at is null;

create function studio.main_request_check() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
begin
  if not exists (select 1 from studio.person_accounts where person_id = new.person_id and account = new.requested_by and unlinked_at is null)
     or not exists (select 1 from studio.person_accounts where person_id = new.person_id and account = new.new_main and unlinked_at is null) then
    raise exception 'a request needs two active sign-ins of this Snowmoon account' using errcode = '23514';
  end if;
  if studio.main_of(new.person_id) = new.requested_by then
    raise exception 'the main sign-in does not request itself' using errcode = '23514';
  end if;
  return new;
end $fn$;
revoke all on function studio.main_request_check() from public;
create trigger main_requests_check before insert on studio.main_requests
  for each row execute function studio.main_request_check();

-- ---------------------------------------------------------------------------
-- 6. Joins of two Snowmoon accounts (both mains, in one request), and who did it. Insert-only; an account is joined
--    into another at most once. Rows keep their stamp and resolve through studio.owner_of.
-- ---------------------------------------------------------------------------

create table studio.person_joins (
  from_person bigint primary key references studio.people(id),
  into_person bigint not null references studio.people(id),
  from_main bigint not null check (from_main <> 0),
  into_main bigint not null check (into_main <> 0),
  at timestamptz not null default now(),
  check (from_person <> into_person)
);

create function studio.person_join_check() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
begin
  if studio.main_of(new.from_person) is distinct from new.from_main or studio.main_of(new.into_person) is distinct from new.into_main then
    raise exception 'a join needs the main sign-in of each Snowmoon account' using errcode = '23514';
  end if;
  if exists (select 1 from studio.person_joins where from_person = new.into_person) then
    raise exception 'that Snowmoon account was already joined into another' using errcode = '23514';
  end if;
  return new;
end $fn$;
revoke all on function studio.person_join_check() from public;
create trigger person_joins_check before insert on studio.person_joins
  for each row execute function studio.person_join_check();

-- The Snowmoon account a stamp belongs to now (through joins).
create function studio.owner_of(p bigint) returns bigint
language sql stable set search_path = pg_catalog, pg_temp as $fn$
  with recursive up(id, depth) as (
    select p, 0
    union all
    select j.into_person, up.depth + 1 from studio.person_joins j join up on j.from_person = up.id where up.depth < 64
  )
  select id from up order by depth desc limit 1
$fn$;
revoke all on function studio.owner_of(bigint) from public;
grant execute on function studio.owner_of(bigint) to studio_writer;

-- ---------------------------------------------------------------------------
-- 7. Prize claims and payout addresses: insert-only; each change is a new row; only the main sign-in at the time.
-- ---------------------------------------------------------------------------

create table studio.prize_claims (
  id bigint generated always as identity primary key,
  challenge text not null,
  version_id uuid not null,
  person_id bigint not null references studio.people(id),
  claimed_via bigint not null check (claimed_via <> 0),
  payout_address text not null check (payout_address ~ '^0x[0-9a-f]{40}$'),
  at timestamptz not null default now()
);
create index prize_claims_entry on studio.prize_claims (challenge, version_id, at desc);

create function studio.prize_claim_check() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
begin
  if studio.main_of(new.person_id) is distinct from new.claimed_via
     or not exists (select 1 from studio.person_accounts where person_id = new.person_id and account = new.claimed_via and unlinked_at is null) then
    raise exception 'only the main sign-in claims a prize or gives its payout address' using errcode = '23514';
  end if;
  return new;
end $fn$;
revoke all on function studio.prize_claim_check() from public;
create trigger prize_claims_check before insert on studio.prize_claims
  for each row execute function studio.prize_claim_check();

-- ---------------------------------------------------------------------------
-- 8. One-time notices (the existing-wallet notice): made at migration, seen once.
-- ---------------------------------------------------------------------------

create table studio.person_notices (
  person_id bigint not null references studio.people(id),
  notice text not null check (notice in ('wallet-owned')),
  account bigint not null check (account <> 0),
  made_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (person_id, notice, account)
);

-- ---------------------------------------------------------------------------
-- 9. The owner stamp: person_id on each owned private table, filled by the app, or, when the code leaves it null (old
--    code during the rollout), by a before-insert trigger from the sign-in's current Snowmoon account. The trigger
--    never fails an insert. Public tables (elements, recipes, takes, adaptations) and sheet_remix_asks (whose
--    read-back fixes its columns) keep their owner in a private side table, studio.row_owners, so no Snowmoon
--    account id is ever publicly readable.
-- ---------------------------------------------------------------------------

create table studio.row_owners (
  tbl text not null check (tbl in ('elements', 'recipes', 'takes', 'adaptations', 'sheet_remix_asks')),
  row_id text not null,
  person_id bigint not null references studio.people(id),
  primary key (tbl, row_id)
);
create index row_owners_person on studio.row_owners (person_id, tbl);

-- The sign-in's Snowmoon account now, or null.
create function studio.person_of(n bigint) returns bigint
language sql stable set search_path = pg_catalog, pg_temp as $fn$
  select person_id from studio.person_accounts where account = n and unlinked_at is null
$fn$;
revoke all on function studio.person_of(bigint) from public;
grant execute on function studio.person_of(bigint) to studio_writer;

-- tg_argv[0]: the sign-in number's column; tg_argv[1]: 'neg' when the column holds a wallet account's id (its number
-- is minus that id).
create function studio.stamp_owner() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
declare
  n bigint;
  p bigint;
begin
  if new.person_id is not null then
    return new;
  end if;
  n := (to_jsonb(new) ->> tg_argv[0])::bigint;
  if tg_argv[1] = 'neg' then n := -n; end if;
  p := studio.person_of(n);
  if p is not null then
    new := jsonb_populate_record(new, jsonb_build_object('person_id', p));
  end if;
  return new;
exception when others then
  return new;
end $fn$;
revoke all on function studio.stamp_owner() from public;

create function studio.stamp_row_owner() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $fn$
declare
  p bigint;
begin
  p := studio.person_of((to_jsonb(new) ->> tg_argv[0])::bigint);
  if p is not null then
    insert into studio.row_owners (tbl, row_id, person_id) values (tg_table_name, to_jsonb(new) ->> 'id', p) on conflict do nothing;
  end if;
  return null;
exception when others then
  return null;
end $fn$;
revoke all on function studio.stamp_row_owner() from public;

-- The app's hook for rows made while the switch was off by a sign-in that had no Snowmoon account yet: when it gets
-- one, its unstamped rows are stamped with it. Only null stamps are filled, and only with that sign-in's account now.
create function studio.stamp_unowned(n bigint) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $fn$
declare
  p bigint := studio.person_of(n);
  t record;
begin
  if p is null then
    return;
  end if;
  for t in select * from (values
    ('image_asks', 'fid'), ('remix_asks', 'person'), ('chat_calls', 'fid'), ('remix_frames', 'person'), ('storyboards', 'person'),
    ('agents', 'person'), ('likes', 'fid'), ('take_likes', 'fid'), ('ratings', 'fid'), ('picks', 'fid'), ('notes', 'person'),
    ('suggestions', 'person'), ('version_posts', 'fid'), ('contributor_consents', 'fid'), ('challenge_marks', 'fid'),
    ('challenge_eligibility', 'fid'), ('direction_notes', 'person'), ('line_rewrites', 'person'), ('mp_agent_matches', 'person'),
    ('wallet_payments', '-account_id'), ('wallet_debits', '-account_id'), ('wallet_credits', '-account_id'),
    ('person_pay_intents', 'person'), ('person_payments', 'person'), ('person_debits', 'person'), ('person_credits', 'person')
  ) as x(tbl, num)
  loop
    -- A table made after this migration (NEXT_person_balance applied later) has no stamp column: skipped.
    continue when not exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = t.tbl and column_name = 'person_id');
    execute format('update studio.%I set person_id = $1 where person_id is null and %s = $2', t.tbl,
      case when t.num = '-account_id' then '-account_id' else quote_ident(t.num) end) using p, n;
  end loop;
  for t in select * from (values ('elements', 'created_by_fid'), ('recipes', 'created_by_fid'), ('takes', 'created_by_fid'),
    ('adaptations', 'owner_person'), ('sheet_remix_asks', 'fid')) as x(tbl, num)
  loop
    continue when to_regclass('studio.' || t.tbl) is null;
    execute format('insert into studio.row_owners (tbl, row_id, person_id) select %L, id::text, $1 from studio.%I where %I = $2 on conflict do nothing',
      t.tbl, t.tbl, t.num) using p, n;
  end loop;
end $fn$;
revoke all on function studio.stamp_unowned(bigint) from public;
grant execute on function studio.stamp_unowned(bigint) to studio_writer;

do $$
declare
  t record;
begin
  for t in select * from (values
    ('image_asks', 'fid', ''), ('remix_asks', 'person', ''), ('chat_calls', 'fid', ''), ('remix_frames', 'person', ''),
    ('storyboards', 'person', ''), ('agents', 'person', ''), ('likes', 'fid', ''), ('take_likes', 'fid', ''),
    ('ratings', 'fid', ''), ('picks', 'fid', ''), ('notes', 'person', ''), ('suggestions', 'person', ''),
    ('version_posts', 'fid', ''), ('contributor_consents', 'fid', ''), ('challenge_marks', 'fid', ''),
    ('challenge_eligibility', 'fid', ''), ('direction_notes', 'person', ''), ('line_rewrites', 'person', ''),
    ('mp_agent_matches', 'person', ''), ('wallet_payments', 'account_id', 'neg'), ('wallet_debits', 'account_id', 'neg'),
    ('wallet_credits', 'account_id', 'neg'), ('person_pay_intents', 'person', ''), ('person_payments', 'person', ''),
    ('person_debits', 'person', ''), ('person_credits', 'person', '')
  ) as x(tbl, col, sign)
  loop
    -- Tables of a migration not applied yet (the person-balance ledgers) are skipped: apply NEXT_person_balance first.
    continue when to_regclass('studio.' || t.tbl) is null;
    execute format('alter table studio.%I add column if not exists person_id bigint references studio.people(id)', t.tbl);
    execute format('create index if not exists %I on studio.%I (person_id) where person_id is not null', t.tbl || '_owner', t.tbl);
    execute format('create trigger stamp_owner before insert on studio.%I for each row execute function studio.stamp_owner(%L, %L)', t.tbl, t.col, t.sign);
  end loop;
  for t in select * from (values ('elements', 'created_by_fid'), ('recipes', 'created_by_fid'), ('takes', 'created_by_fid'),
    ('adaptations', 'owner_person'), ('sheet_remix_asks', 'fid')) as x(tbl, col)
  loop
    continue when to_regclass('studio.' || t.tbl) is null;
    execute format('create trigger stamp_row_owner after insert on studio.%I for each row execute function studio.stamp_row_owner(%L)', t.tbl, t.col);
  end loop;
end $$;

-- challenge_eligibility.fid and challenge_marks.fid stay the sign-in the version was published or submitted with: the
-- challenge record names it by its public id. challenge_eligibility also keeps which linked social account passed the
-- check (via, its kind; via_account, its number; A4).
alter table studio.challenge_eligibility add column via text check (via in ('farcaster', 'lens', 'bluesky'));
alter table studio.challenge_eligibility add column via_account bigint check (via_account <> 0);
alter table studio.challenge_eligibility add constraint challenge_eligibility_via_pair check ((via is null) = (via_account is null));
create index challenge_eligibility_via_account on studio.challenge_eligibility (challenge, via_account) where via_account is not null;

-- ---------------------------------------------------------------------------
-- 10. Row-level security and grants: studio_writer reads and adds; it only ends links and requests and marks a notice
--     seen; nothing is deleted or moved; nothing for anon or authenticated.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['people', 'person_accounts', 'person_link_attempts', 'person_mains', 'person_names',
    'main_requests', 'person_joins', 'prize_claims', 'person_notices', 'row_owners']
  loop
    execute format('alter table studio.%I enable row level security', t);
    execute format('create policy writer_read on studio.%I for select to studio_writer using (true)', t);
    execute format('revoke all on studio.%I from anon, authenticated', t);
    execute format('revoke update, delete, truncate, references, trigger on studio.%I from studio_writer', t);
    execute format('grant select, insert on studio.%I to studio_writer', t);
  end loop;
end $$;
create policy writer_insert on studio.people for insert to studio_writer with check (true);
create policy writer_insert on studio.person_accounts for insert to studio_writer with check (unlinked_at is null and ended_by is null);
create policy writer_unlink on studio.person_accounts for update to studio_writer using (unlinked_at is null) with check (unlinked_at is not null and ended_by is not null);
grant update (unlinked_at, ended_by, ended_via) on studio.person_accounts to studio_writer;
create policy writer_insert on studio.person_link_attempts for insert to studio_writer with check (true);
create policy writer_insert on studio.person_mains for insert to studio_writer with check (true);
create policy writer_insert on studio.person_names for insert to studio_writer with check (true);
create policy writer_insert on studio.main_requests for insert to studio_writer with check (ended_at is null);
create policy writer_end on studio.main_requests for update to studio_writer using (ended_at is null) with check (ended_at is not null);
grant update (ended_at, ended_how, ended_by) on studio.main_requests to studio_writer;
create policy writer_insert on studio.person_joins for insert to studio_writer with check (true);
create policy writer_insert on studio.prize_claims for insert to studio_writer with check (true);
create policy writer_insert on studio.person_notices for insert to studio_writer with check (seen_at is null);
create policy writer_seen on studio.person_notices for update to studio_writer using (seen_at is null) with check (seen_at is not null);
grant update (seen_at) on studio.person_notices to studio_writer;
create policy writer_insert on studio.row_owners for insert to studio_writer with check (true);

-- ---------------------------------------------------------------------------
-- 11. The backfill, from today's links (v1's), then a main and a name for each Snowmoon account, the wallet notice,
--     and the owner stamp on every existing row. Exempt from the 30-day trigger (it copies old history).
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  p bigint;
  skipped int := 0;
  has_social boolean := to_regclass('studio.social_links') is not null;
  nums bigint[];
  seen bigint[] := array[]::bigint[];
  n bigint;
  k text;
begin
  perform set_config('studio.linked_backfill', 'on', true);

  -- 11a. A Snowmoon account for each Farcaster ID that a wallet, Lens or Bluesky account is (or was) linked to.
  for r in execute
    'select fid from studio.wallet_links'
    || case when has_social then ' union select fid from studio.social_links where fid is not null' else '' end
    || ' order by 1'
  loop
    insert into studio.people default values returning id into p;
    insert into studio.person_accounts (person_id, kind, account, how) values (p, 'farcaster', r.fid, 'first');
  end loop;

  if has_social then
    -- 11b. Lens accounts with an active link to a Farcaster ID join its account; other Lens accounts in a link get
    --      one of their own.
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

    -- 11c. Bluesky accounts: an active link to a Farcaster ID joins its account; to a Lens account, that one's.
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

    -- 11d. Ended Lens and Bluesky links, as ended rows under the account of what they were linked to.
    insert into studio.person_accounts (person_id, kind, account, how, linked_at, unlinked_at, ended_by)
    select t.person_id, a.kind, -(1000000000 + a.id), 'signed', l.linked_at, l.unlinked_at, l.ended_by
    from studio.social_links l
    join studio.social_accounts a on a.id = l.account_id
    join studio.person_accounts t on t.account = coalesce(l.fid, -(1000000000 + l.lens_account_id)) and t.unlinked_at is null
    where l.unlinked_at is not null;
  end if;

  -- 11e. Wallets: an active link joins its Farcaster ID's account (oldest first, at most 3); the rest get their own.
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

  -- 11f. Any wallet, Lens or Bluesky account in a link that has no active row now: an account of its own, from when
  --      its last link ended (the move limit then reads its history).
  for r in
    select x.account, x.kind, max(x.unlinked_at) as since from studio.person_accounts x
    where x.unlinked_at is not null and not exists (select 1 from studio.person_accounts y where y.account = x.account and y.unlinked_at is null)
    group by x.account, x.kind order by x.account
  loop
    insert into studio.people default values returning id into p;
    insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, r.kind, r.account, 'first', r.since);
  end loop;

  -- 11g. Every other sign-in number with rows in an owned table: a Snowmoon account of its own ('first'), so every
  --      existing row has an owner. Numbers that don't name a sign-in (no Lens or Bluesky row, zero) are left alone.
  for r in select * from (values
    ('image_asks', 'fid'), ('remix_asks', 'person'), ('chat_calls', 'fid'), ('remix_frames', 'person'), ('storyboards', 'person'),
    ('agents', 'person'), ('likes', 'fid'), ('take_likes', 'fid'), ('ratings', 'fid'), ('picks', 'fid'), ('notes', 'person'),
    ('suggestions', 'person'), ('version_posts', 'fid'), ('contributor_consents', 'fid'), ('challenge_marks', 'fid'),
    ('challenge_eligibility', 'fid'), ('direction_notes', 'person'), ('line_rewrites', 'person'), ('mp_agent_matches', 'person'),
    ('wallet_payments', '-account_id'), ('wallet_debits', '-account_id'), ('person_pay_intents', 'person'),
    ('person_payments', 'person'), ('person_debits', 'person'), ('elements', 'created_by_fid'), ('recipes', 'created_by_fid'),
    ('takes', 'created_by_fid'), ('adaptations', 'owner_person'), ('sheet_remix_asks', 'fid')
  ) as x(tbl, num)
  loop
    continue when to_regclass('studio.' || r.tbl) is null;
    execute format('select coalesce(array_agg(distinct %s), array[]::bigint[]) from studio.%I t', case when r.num = '-account_id' then '-t.account_id' else 't.' || quote_ident(r.num) end, r.tbl)
      into nums;
    seen := seen || nums;
  end loop;
  foreach n in array (select coalesce(array_agg(distinct v order by v), array[]::bigint[]) from unnest(seen) v)
  loop
    continue when n is null or n = 0 or exists (select 1 from studio.person_accounts a where a.account = n and a.unlinked_at is null);
    if n > 0 then
      k := 'farcaster';
    elsif n > -1000000000 then
      k := 'wallet';
    else
      -- A Lens or Bluesky number: only with the sign-in release's tables (0035), and only if its row exists.
      continue when not has_social;
      execute 'select kind from studio.social_accounts where -(1000000000 + id) = $1' into k using n;
      continue when k is null;
    end if;
    insert into studio.people default values returning id into p;
    insert into studio.person_accounts (person_id, kind, account, how) values (p, k, n, 'first');
  end loop;

  -- 11h. A main and a name for each Snowmoon account: its Farcaster ID if it has one, else its oldest sign-in (the
  --      main); Farcaster, then Lens, Bluesky, a wallet (the name, as shown today).
  insert into studio.person_mains (person_id, account, how)
  select distinct on (person_id) person_id, account, 'first' from studio.person_accounts where unlinked_at is null
  order by person_id, (kind = 'farcaster') desc, linked_at, id;
  insert into studio.person_names (person_id, account)
  select distinct on (person_id) person_id, account from studio.person_accounts where unlinked_at is null
  order by person_id, array_position(array['farcaster', 'lens', 'bluesky', 'wallet'], kind), linked_at, id;

  -- 11i. The existing-wallet notice: each Snowmoon account with a wallet linked to it now, once per wallet.
  insert into studio.person_notices (person_id, notice, account)
  select person_id, 'wallet-owned', account from studio.person_accounts where kind = 'wallet' and unlinked_at is null and how in ('signed', 'verified');

  -- 11j. The owner stamp on every existing row: its number's Snowmoon account now.
  for r in select * from (values
    ('image_asks', 'fid'), ('remix_asks', 'person'), ('chat_calls', 'fid'), ('remix_frames', 'person'), ('storyboards', 'person'),
    ('agents', 'person'), ('likes', 'fid'), ('take_likes', 'fid'), ('ratings', 'fid'), ('picks', 'fid'), ('notes', 'person'),
    ('suggestions', 'person'), ('version_posts', 'fid'), ('contributor_consents', 'fid'), ('challenge_marks', 'fid'),
    ('challenge_eligibility', 'fid'), ('direction_notes', 'person'), ('line_rewrites', 'person'), ('mp_agent_matches', 'person'),
    ('wallet_payments', '-account_id'), ('wallet_debits', '-account_id'), ('wallet_credits', '-account_id'),
    ('person_pay_intents', 'person'), ('person_payments', 'person'), ('person_debits', 'person'), ('person_credits', 'person')
  ) as x(tbl, num)
  loop
    continue when to_regclass('studio.' || r.tbl) is null;
    execute format('update studio.%I t set person_id = a.person_id from studio.person_accounts a where t.person_id is null and a.unlinked_at is null and a.account = %s',
      r.tbl, case when r.num = '-account_id' then '-t.account_id' else 't.' || quote_ident(r.num) end);
  end loop;
  for r in select * from (values ('elements', 'created_by_fid', 'id'), ('recipes', 'created_by_fid', 'id'), ('takes', 'created_by_fid', 'id'),
    ('adaptations', 'owner_person', 'id'), ('sheet_remix_asks', 'fid', 'id')) as x(tbl, num, idc)
  loop
    continue when to_regclass('studio.' || r.tbl) is null;
    execute format('insert into studio.row_owners (tbl, row_id, person_id) select %L, t.%I::text, a.person_id from studio.%I t join studio.person_accounts a on a.account = t.%I and a.unlinked_at is null on conflict do nothing',
      r.tbl, r.idc, r.tbl, r.num);
  end loop;

  perform set_config('studio.linked_backfill', '', true);
  if skipped > 0 then
    raise notice 'linked accounts: % sign-in(s) would have passed a per-account limit and got a Snowmoon account of their own', skipped;
  end if;
end $$;

commit;

-- C. READ-BACK (after B), as postgres. Two parts, nothing is kept:
--   (a) one read-only select: every row's ok should be true;
--   (b) one do block: a made-up Snowmoon account (FID 990001, wallets and a Bluesky account; never real people's),
--       its main and name, what A1, A2, A6, the main, the recovery request, the join and the prize claim must refuse,
--       an unlink and a rejoin, and stamped rows; each checked, then deleted. It ends with the notice
--       "READ-BACK PASSED", or stops with "READ-BACK FAILED: …".

-- (a)
select what, ok from (values
  ('the sign-in release (0035) was applied first (social_links), so Lens and Bluesky links were copied', to_regclass('studio.social_links') is not null),
  ('the ten new tables exist, row-level security on', (select count(*) = 10 and bool_and(relrowsecurity) from pg_class where relnamespace = 'studio'::regnamespace and relkind = 'r' and relname in ('people', 'person_accounts', 'person_link_attempts', 'person_mains', 'person_names', 'main_requests', 'person_joins', 'prize_claims', 'person_notices', 'row_owners'))),
  ('stable address: public_id is unique, 8 characters without look-alikes (no 0, o, 1, l, i), with a default', exists (select 1 from pg_constraint where conname = 'people_public_id_unique' and contype = 'u') and exists (select 1 from pg_constraint where conname = 'people_public_id_format') and exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'people' and column_name = 'public_id' and column_default like '%new_public_id%')),
  ('the generator makes only ids without look-alikes (200 samples)', (select bool_and(studio.new_public_id() ~ '^[a-hjkmnp-z2-9]{8}$') from generate_series(1, 200))),
  ('every Snowmoon account has a well-formed, distinct public_id', not exists (select 1 from studio.people where public_id !~ '^[a-hjkmnp-z2-9]{8}$') and (select count(distinct public_id) = count(*) from studio.people)),
  ('A1: one active row per sign-in (unique, partial)', exists (select 1 from pg_indexes where schemaname = 'studio' and indexname = 'person_accounts_one_active' and indexdef ilike 'create unique index%(account) where (unlinked_at is null)')),
  ('A6: one Farcaster, Lens and Bluesky account per Snowmoon account (unique, partial)', exists (select 1 from pg_indexes where schemaname = 'studio' and indexname = 'person_accounts_one_of_kind' and indexdef ilike 'create unique index%(person_id, kind)%unlinked_at is null%wallet%')),
  ('A6: the 3-wallet trigger is on', exists (select 1 from pg_trigger where tgname = 'person_accounts_wallets' and tgrelid = 'studio.person_accounts'::regclass and tgenabled = 'O')),
  ('A2: the 30-day trigger is on', exists (select 1 from pg_trigger where tgname = 'person_accounts_wait' and tgrelid = 'studio.person_accounts'::regclass and tgenabled = 'O')),
  ('the main stays active: the commit-time trigger is on', exists (select 1 from pg_trigger where tgname = 'person_accounts_main_active' and tgrelid = 'studio.person_accounts'::regclass and tgenabled = 'O' and tgdeferrable and tginitdeferred)),
  ('mains, names, requests, joins and claims are checked by their triggers', (select count(*) = 5 from pg_trigger where not tgisinternal and tgenabled = 'O' and tgname in ('person_mains_member', 'person_names_member', 'main_requests_check', 'person_joins_check', 'prize_claims_check'))),
  ('recovery: one open request per account; 30 days; never done before then', exists (select 1 from pg_indexes where schemaname = 'studio' and indexname = 'main_requests_one_open' and indexdef ilike 'create unique index%(person_id) where (ended_at is null)') and exists (select 1 from pg_constraint where conname = 'main_requests_thirty_days') and exists (select 1 from pg_constraint where conname = 'main_requests_done_on_time')),
  ('the sign-in numbers match their kind', exists (select 1 from pg_constraint where conname = 'person_accounts_kind_range' and conrelid = 'studio.person_accounts'::regclass)),
  ('studio_writer: select and insert on the ten tables', (select bool_and(has_table_privilege('studio_writer', 'studio.' || t, 'select') and has_table_privilege('studio_writer', 'studio.' || t, 'insert')) from unnest(array['people', 'person_accounts', 'person_link_attempts', 'person_mains', 'person_names', 'main_requests', 'person_joins', 'prize_claims', 'person_notices', 'row_owners']) t)),
  ('studio_writer: no delete, truncate or table-wide update on them', (select not bool_or(has_table_privilege('studio_writer', 'studio.' || t, 'delete') or has_table_privilege('studio_writer', 'studio.' || t, 'update') or has_table_privilege('studio_writer', 'studio.' || t, 'truncate')) from unnest(array['people', 'person_accounts', 'person_link_attempts', 'person_mains', 'person_names', 'main_requests', 'person_joins', 'prize_claims', 'person_notices', 'row_owners']) t)),
  ('studio_writer: may only end a link, end a request, mark a notice seen', has_column_privilege('studio_writer', 'studio.person_accounts', 'unlinked_at', 'update') and has_column_privilege('studio_writer', 'studio.person_accounts', 'ended_via', 'update') and not has_column_privilege('studio_writer', 'studio.person_accounts', 'person_id', 'update') and not has_column_privilege('studio_writer', 'studio.person_accounts', 'account', 'update') and has_column_privilege('studio_writer', 'studio.main_requests', 'ended_how', 'update') and not has_column_privilege('studio_writer', 'studio.main_requests', 'effective_at', 'update') and not has_column_privilege('studio_writer', 'studio.people', 'public_id', 'update') and has_column_privilege('studio_writer', 'studio.person_notices', 'seen_at', 'update')),
  ('the ending policies: only an active row is ended', (select count(*) = 3 from pg_policies where schemaname = 'studio' and cmd = 'UPDATE' and ((tablename = 'person_accounts' and policyname = 'writer_unlink') or (tablename = 'main_requests' and policyname = 'writer_end') or (tablename = 'person_notices' and policyname = 'writer_seen')))),
  ('anon and authenticated: nothing on the new tables', (select not bool_or(has_table_privilege(r, 'studio.' || t, 'select') or has_table_privilege(r, 'studio.' || t, 'insert')) from unnest(array['people', 'person_accounts', 'person_link_attempts', 'person_mains', 'person_names', 'main_requests', 'person_joins', 'prize_claims', 'person_notices', 'row_owners']) t, unnest(array['anon', 'authenticated']) r)),
  ('owner stamp: person_id (bigint) and its trigger on every owned table that exists', not exists (select 1 from unnest(array['image_asks', 'remix_asks', 'chat_calls', 'remix_frames', 'storyboards', 'agents', 'likes', 'take_likes', 'ratings', 'picks', 'notes', 'suggestions', 'version_posts', 'contributor_consents', 'challenge_marks', 'challenge_eligibility', 'direction_notes', 'line_rewrites', 'mp_agent_matches', 'wallet_payments', 'wallet_debits', 'wallet_credits', 'person_pay_intents', 'person_payments', 'person_debits', 'person_credits']) t where to_regclass('studio.' || t) is not null and (not exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = t and column_name = 'person_id' and data_type = 'bigint') or not exists (select 1 from pg_trigger where tgname = 'stamp_owner' and tgrelid = ('studio.' || t)::regclass and tgenabled = 'O')))),
  ('owner stamp: stamp_unowned is a security definer with a fixed search_path, executable by studio_writer only', exists (select 1 from pg_proc where proname = 'stamp_unowned' and pronamespace = 'studio'::regnamespace and prosecdef and array_to_string(proconfig, ',') like '%search_path=pg_catalog, pg_temp%') and has_function_privilege('studio_writer', 'studio.stamp_unowned(bigint)', 'execute') and not has_function_privilege('anon', 'studio.stamp_unowned(bigint)', 'execute')),
  ('owner stamp: the public tables keep their owner in row_owners, by trigger', (select count(*) = 4 from pg_trigger where tgname = 'stamp_row_owner' and tgenabled = 'O' and tgrelid::regclass::text in ('studio.elements', 'studio.recipes', 'studio.takes', 'studio.adaptations'))),
  ('owner stamp: every existing row of a sign-in with a Snowmoon account is stamped (image_asks, likes, wallet_debits, elements)', not exists (select 1 from studio.image_asks t where t.person_id is null and studio.person_of(t.fid) is not null) and not exists (select 1 from studio.likes t where t.person_id is null and studio.person_of(t.fid) is not null) and not exists (select 1 from studio.wallet_debits t where t.person_id is null and studio.person_of(-t.account_id) is not null) and not exists (select 1 from studio.elements t where studio.person_of(t.created_by_fid) is not null and not exists (select 1 from studio.row_owners o where o.tbl = 'elements' and o.row_id = t.id::text))),
  ('no Snowmoon account id anywhere anon can read', not exists (select 1 from information_schema.columns c where c.table_schema = 'studio' and c.column_name in ('person_id', 'into_person', 'from_person') and has_table_privilege('anon', 'studio.' || c.table_name, 'select'))),
  ('challenge_eligibility keeps via and via_account, both or neither', (select count(*) = 2 from information_schema.columns where table_schema = 'studio' and table_name = 'challenge_eligibility' and column_name in ('via', 'via_account')) and exists (select 1 from pg_constraint where conname = 'challenge_eligibility_via_pair')),
  ('the backfill: every active wallet link is an active row (under its FID''s account, or its own past 3)', not exists (select 1 from studio.wallet_links l where l.unlinked_at is null and not exists (select 1 from studio.person_accounts a where a.account = -l.account_id and a.unlinked_at is null))),
  ('the backfill: every ended wallet link is copied', (select count(*) from studio.wallet_links where unlinked_at is not null) <= (select count(*) from studio.person_accounts where kind = 'wallet' and unlinked_at is not null)),
  ('the backfill: at most 3 wallets per account', not exists (select 1 from studio.person_accounts where unlinked_at is null and kind = 'wallet' group by person_id having count(*) > 3)),
  ('the backfill: every Snowmoon account with a sign-in has a main and a name, both active sign-ins', not exists (select 1 from studio.people p where exists (select 1 from studio.person_accounts a where a.person_id = p.id and a.unlinked_at is null) and (not exists (select 1 from studio.person_accounts a where a.person_id = p.id and a.unlinked_at is null and a.account = studio.main_of(p.id)) or not exists (select 1 from studio.person_names n where n.person_id = p.id)))),
  ('the backfill: a Farcaster ID is the main of its account', not exists (select 1 from studio.person_accounts a where a.kind = 'farcaster' and a.unlinked_at is null and studio.main_of(a.person_id) <> a.account)),
  ('the backfill: each linked wallet''s account has its notice', not exists (select 1 from studio.person_accounts a where a.kind = 'wallet' and a.unlinked_at is null and a.how in ('signed', 'verified') and not exists (select 1 from studio.person_notices n where n.person_id = a.person_id and n.account = a.account and n.notice = 'wallet-owned'))),
  ('every Snowmoon account has had a sign-in (no empty one)', not exists (select 1 from studio.people p where not exists (select 1 from studio.person_accounts a where a.person_id = p.id)))
) as t(what, ok);

-- (b)
do $$
declare
  p bigint;
  q bigint;
  w1 bigint;
  w2 bigint;
  w3 bigint;
  w4 bigint;
  sky bigint := -1000990001;
  v uuid;
  n int;
  req bigint;
  t0 timestamptz := now() - interval '200 days';
begin
  -- A made-up Snowmoon account p: FID 990001 (main), a wallet and a Bluesky account. No real account is used.
  insert into studio.wallet_accounts (address) values ('0x99000000000000000000000000000000000000a1') returning id into w1;
  insert into studio.wallet_accounts (address) values ('0x99000000000000000000000000000000000000a2') returning id into w2;
  insert into studio.wallet_accounts (address) values ('0x99000000000000000000000000000000000000a3') returning id into w3;
  insert into studio.wallet_accounts (address) values ('0x99000000000000000000000000000000000000a4') returning id into w4;
  insert into studio.people default values returning id into p;
  if (select public_id from studio.people where id = p) !~ '^[a-hjkmnp-z2-9]{8}$' then
    raise exception 'READ-BACK FAILED: a new Snowmoon account got no stable address';
  end if;
  begin
    insert into studio.people (public_id) values ('abcd0o1l');
    raise exception 'READ-BACK FAILED: a stable address with look-alikes (0, o, 1, l) went in';
  exception when check_violation then null;
  end;
  insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, 'farcaster', 990001, 'first', t0);
  insert into studio.person_mains (person_id, account, how, at) values (p, 990001, 'first', t0);
  insert into studio.person_names (person_id, account, at) values (p, 990001, t0);
  insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, 'wallet', -w1, 'signed', t0 + interval '1 day');
  insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, 'bluesky', sky, 'signed', t0 + interval '1 day');

  -- A1 and A6.
  insert into studio.people default values returning id into q;
  begin
    insert into studio.person_accounts (person_id, kind, account, how) values (q, 'wallet', -w1, 'signed');
    raise exception 'READ-BACK FAILED: a wallet went into two Snowmoon accounts at once (A1)';
  exception when unique_violation then null;
  end;
  begin
    insert into studio.person_accounts (person_id, kind, account, how) values (p, 'farcaster', 990002, 'signed');
    raise exception 'READ-BACK FAILED: a Snowmoon account took a second Farcaster account (A6)';
  exception when unique_violation then null;
  end;
  insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, 'wallet', -w2, 'signed', t0 + interval '1 day');
  insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, 'wallet', -w3, 'signed', t0 + interval '1 day');
  begin
    insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, 'wallet', -w4, 'signed', t0 + interval '1 day');
    raise exception 'READ-BACK FAILED: a Snowmoon account took a fourth wallet (A6)';
  exception when check_violation then null;
  end;
  begin
    insert into studio.person_accounts (person_id, kind, account, how) values (q, 'bluesky', -w4, 'first');
    raise exception 'READ-BACK FAILED: a wallet number went in as a Bluesky account';
  exception when check_violation then null;
  end;

  -- The main and the name must be active sign-ins; a main set by recovery needs its request done.
  begin
    insert into studio.person_mains (person_id, account, how, by_account) values (p, 990002, 'chosen', 990001);
    raise exception 'READ-BACK FAILED: a main that is not a sign-in of the account went in';
  exception when check_violation then null;
  end;
  begin
    insert into studio.person_mains (person_id, account, how, at) values (p, sky, 'recovery', t0 + interval '2 days');
    raise exception 'READ-BACK FAILED: a recovery main went in without a request done';
  exception when check_violation then null;
  end;

  -- Recovery: the Bluesky account asks; a second request is refused; done before day 30 is refused; done on day 30.
  insert into studio.main_requests (person_id, requested_by, new_main, requested_at, effective_at)
    values (p, sky, sky, t0 + interval '2 days', t0 + interval '32 days') returning id into req;
  begin
    insert into studio.main_requests (person_id, requested_by, new_main, requested_at, effective_at)
      values (p, -w1, -w1, t0 + interval '3 days', t0 + interval '33 days');
    raise exception 'READ-BACK FAILED: a second open request went in';
  exception when unique_violation then null;
  end;
  begin
    update studio.main_requests set ended_at = t0 + interval '20 days', ended_how = 'done' where id = req;
    raise exception 'READ-BACK FAILED: a request took effect before 30 days';
  exception when check_violation then null;
  end;
  update studio.main_requests set ended_at = t0 + interval '32 days', ended_how = 'done' where id = req;
  insert into studio.person_mains (person_id, account, how, at) values (p, sky, 'recovery', t0 + interval '32 days');
  if studio.main_of(p) <> sky then
    raise exception 'READ-BACK FAILED: the recovery did not make the Bluesky account main';
  end if;
  -- A request that takes effect sooner than 30 days is refused (990001 is no longer main, so it may ask).
  begin
    insert into studio.main_requests (person_id, requested_by, new_main, requested_at, effective_at)
      values (p, 990001, 990001, t0 + interval '33 days', t0 + interval '43 days');
    raise exception 'READ-BACK FAILED: a request with less than 30 days went in';
  exception when check_violation then null;
  end;

  -- The main can't be unlinked without a new main (checked at commit; here, at once).
  set constraints studio.person_accounts_main_active immediate;
  begin
    update studio.person_accounts set unlinked_at = t0 + interval '40 days', ended_by = 'self', ended_via = sky where account = sky and unlinked_at is null;
    raise exception 'READ-BACK FAILED: the main was unlinked without a new main';
  exception when check_violation then null;
  end;
  set constraints studio.person_accounts_main_active deferred;

  -- A2: the wallet unlinks itself; it can't start a Snowmoon account (q) for 30 days; it may rejoin p at once.
  update studio.person_accounts set unlinked_at = t0 + interval '40 days', ended_by = 'self', ended_via = -w1 where account = -w1 and unlinked_at is null;
  begin
    insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (q, 'wallet', -w1, 'first', t0 + interval '50 days');
    raise exception 'READ-BACK FAILED: a sign-in started a new Snowmoon account within 30 days of leaving one (A2)';
  exception when check_violation then null;
  end;
  begin
    insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (p, 'wallet', -w1, 'signed', t0 + interval '41 days');
  exception when check_violation then
    raise exception 'READ-BACK FAILED: a sign-in could not rejoin the Snowmoon account it left (A2 allows it at once)';
  end;
  -- q gets its own sign-in (FID 990003, main) for the join.
  insert into studio.person_accounts (person_id, kind, account, how, linked_at) values (q, 'farcaster', 990003, 'first', t0);
  insert into studio.person_mains (person_id, account, how, at) values (q, 990003, 'first', t0);

  -- Stamped rows: old code leaves person_id null and the trigger fills it; an element's owner goes to row_owners.
  insert into studio.image_asks (fid) values (990001);
  insert into studio.wallet_debits (account_id, usd) values (w1, 0.05);
  if (select person_id from studio.image_asks where fid = 990001) is distinct from p or (select person_id from studio.wallet_debits where account_id = w1) is distinct from p then
    raise exception 'READ-BACK FAILED: the owner stamp did not fill person_id from the sign-in''s Snowmoon account';
  end if;
  if exists (select 1 from studio.works where id = 'snowmoon') then
    insert into studio.elements (work_id, element_type, created_by_fid) values ('snowmoon', 'text', 990001) returning id into v;
    if not exists (select 1 from studio.row_owners where tbl = 'elements' and row_id = v::text and person_id = p) then
      raise exception 'READ-BACK FAILED: a new element''s owner is not in row_owners';
    end if;
  end if;

  -- A join needs each account's main; then q's rows resolve to p.
  begin
    insert into studio.person_joins (from_person, into_person, from_main, into_main) values (q, p, 990003, 990001);
    raise exception 'READ-BACK FAILED: a join went in with a sign-in that is not main';
  exception when check_violation then null;
  end;
  insert into studio.person_joins (from_person, into_person, from_main, into_main) values (q, p, 990003, sky);
  if studio.owner_of(q) <> p then
    raise exception 'READ-BACK FAILED: a joined account''s stamp does not resolve to the account it joined';
  end if;

  -- A prize: only the main at the time.
  v := coalesce(v, gen_random_uuid());
  begin
    insert into studio.prize_claims (challenge, version_id, person_id, claimed_via, payout_address) values ('readback-linked', v, p, 990001, '0x99000000000000000000000000000000000000b1');
    raise exception 'READ-BACK FAILED: a sign-in that is not main claimed a prize';
  exception when check_violation then null;
  end;
  insert into studio.prize_claims (challenge, version_id, person_id, claimed_via, payout_address) values ('readback-linked', v, p, sky, '0x99000000000000000000000000000000000000b1');
  insert into studio.person_link_attempts (person_id) values (p);
  insert into studio.person_notices (person_id, notice, account) values (p, 'wallet-owned', -w1);
  update studio.person_notices set seen_at = now() where person_id = p;

  n := (select count(*) from studio.person_accounts where person_id in (p, q));
  if n <> 7 then
    raise exception 'READ-BACK FAILED: the made-up accounts'' sign-in rows are not the seven expected (%)', n;
  end if;

  -- Clean up, in order.
  delete from studio.prize_claims where challenge = 'readback-linked';
  delete from studio.person_joins where from_person = q;
  delete from studio.row_owners where person_id in (p, q);
  if exists (select 1 from studio.works where id = 'snowmoon') then
    delete from studio.elements where created_by_fid = 990001 and id = v;
  end if;
  delete from studio.wallet_debits where account_id = w1;
  delete from studio.image_asks where fid = 990001;
  delete from studio.person_notices where person_id in (p, q);
  delete from studio.person_link_attempts where person_id in (p, q);
  delete from studio.main_requests where person_id in (p, q);
  delete from studio.person_mains where person_id in (p, q);
  delete from studio.person_names where person_id in (p, q);
  set constraints studio.person_accounts_main_active immediate;
  delete from studio.person_accounts where person_id in (p, q);
  delete from studio.people where id in (p, q);
  delete from studio.wallet_accounts where id in (w1, w2, w3, w4);
  raise notice 'READ-BACK PASSED';
end $$;
