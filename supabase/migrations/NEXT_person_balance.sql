-- NEXT_person_balance (numbered at merge). Branch person-balance, owner's task of 2026-11-04, "paying per person":
-- a prepaid balance for Farcaster, Lens and Bluesky sign-ins, not only wallet accounts (docs/proposals/person-balance.md).
-- DRAFT, NOT APPLIED. Drafted by a coding agent (Claude, a closed model by Anthropic); the owner pastes it in the
-- Supabase SQL Editor; nothing here is applied by the agent.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0001 and 0011
-- (studio.wallet_payments). Paste it in this order:
--   A. the dry run: the migration, ending in rollback; (nothing is kept);
--   B. the migration: the same, ending in commit;
--   C. the read-back, in two parts: (a) one read-only select whose rows should all be true; (b) one do block that adds
--      realistic rows for a Farcaster person, a Bluesky person and a wallet account, checks them and what must be
--      refused, deletes them, and ends with the notice "READ-BACK PASSED" or stops with "READ-BACK FAILED: …"
--      (nothing is kept either way).
-- Not safe to run twice: a second B stops at its first `create table` and changes nothing.
-- Tested in PGlite only (npm run test:person-balance), after main's migrations and the five of the SQL pack of
-- 2026-11-04 (docs/legal/sql-pack-2026-11-04.md on branch sql-pack), with planted faults that the read-back must catch.
--
-- Safe with today's live code: it only adds. The one change to an existing table is a trigger on
-- studio.wallet_payments that records each new payment's hash in studio.paid_transactions; today's claim
-- (src/lib/wallet/credits.ts, credit) inserts as before, and a hash already credited is skipped, which that code
-- already answers as "already added". Nothing reads the new tables until PERSON_BALANCE.enabled is on
-- (src/lib/config.ts, off). Safe with the SQL pack applied before it: none of the pack's five touches the tables here.
--
-- What it adds (none of it publicly readable; append-only for the app):
-- 1. studio.paid_transactions: every credited transaction hash, once, whichever balance it went to ('wallet' or
--    'person'), filled by a trigger on both payment tables (the first claim wins, the other is skipped). It starts with
--    every hash already in studio.wallet_payments. The app can only read it.
-- 2. studio.person_pay_intents: a wallet's signed statement (Sign-In with Ethereum, checked by our server) that its
--    payments go to one person's balance: a random id, the person, the wallet's address, when. The person is a
--    Farcaster ID (above zero) or a Lens or Bluesky account (at or below -1,000,000,000; src/lib/people.ts), never a
--    wallet account (-1 to -999,999,999), which keeps studio.wallet_payments.
-- 3. studio.person_payments: a payment credited to a person, one per intent, to that intent's person only (a foreign
--    key on the pair), keyed by its transaction hash.
-- 4. studio.person_debits and studio.person_credits: what each paid Generate cost the person, and a charge added back
--    when a Generate gave no picture ('failed', 'refused', 'dropped', as 0027): once per debit, for exactly that
--    debit's person and amount (a foreign key on all three). Never paid out as money.
-- Balance = payments - debits + credits, per person.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept.
begin;

-- ---------------------------------------------------------------------------
-- 1. Every credited transaction, once, whichever balance it went to.
-- ---------------------------------------------------------------------------

create table studio.paid_transactions (
  tx_hash text primary key check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  credited_to text not null check (credited_to in ('wallet', 'person')),
  at timestamptz not null default now()
);
-- The payments already credited to wallet accounts.
insert into studio.paid_transactions (tx_hash, credited_to, at)
  select tx_hash, 'wallet', credited_at from studio.wallet_payments;

alter table studio.paid_transactions enable row level security;
create policy writer_read on studio.paid_transactions for select to studio_writer using (true);
revoke all on studio.paid_transactions from anon, authenticated, studio_writer;
grant select on studio.paid_transactions to studio_writer;

-- Before a payment row is kept: its hash goes into the ledger first. Already there (credited to anyone): the row is
-- skipped, so the insert returns no row and the app says "already added". Runs as its owner (postgres), so the app
-- can't write the ledger directly.
create function studio.claim_paid_transaction() returns trigger
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $fn$
begin
  insert into studio.paid_transactions (tx_hash, credited_to) values (new.tx_hash, tg_argv[0])
    on conflict (tx_hash) do nothing;
  if not found then
    return null;
  end if;
  return new;
end
$fn$;
revoke all on function studio.claim_paid_transaction() from public, anon, authenticated, studio_writer;

create trigger wallet_payments_once before insert on studio.wallet_payments
  for each row execute function studio.claim_paid_transaction('wallet');

-- ---------------------------------------------------------------------------
-- 2. A wallet's signed statement that its payments go to a person's balance.
-- ---------------------------------------------------------------------------

create table studio.person_pay_intents (
  id uuid primary key default gen_random_uuid(),
  -- A Farcaster ID, or a Lens or Bluesky account (src/lib/people.ts). Never a wallet account's number.
  person bigint not null check (person > 0 or person <= -1000000000),
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz not null default now(),
  unique (id, person)
);
create index person_pay_intents_person on studio.person_pay_intents (person);

alter table studio.person_pay_intents enable row level security;
create policy writer_insert on studio.person_pay_intents for insert to studio_writer with check (true);
create policy writer_read on studio.person_pay_intents for select to studio_writer using (true);
revoke all on studio.person_pay_intents from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.person_pay_intents from studio_writer;
grant select, insert on studio.person_pay_intents to studio_writer;

-- ---------------------------------------------------------------------------
-- 3. Payments credited to a person, one per intent, to that intent's person.
-- ---------------------------------------------------------------------------

create table studio.person_payments (
  tx_hash text primary key check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  intent_id uuid not null unique,
  person bigint not null check (person > 0 or person <= -1000000000),
  chain_id int not null,
  token text not null check (token in ('USDC', 'ETH')),
  amount numeric(78, 0) not null check (amount > 0),
  usd numeric(12, 6) not null check (usd > 0),
  block_number bigint not null,
  credited_at timestamptz not null default now(),
  foreign key (intent_id, person) references studio.person_pay_intents (id, person)
);
create index person_payments_person on studio.person_payments (person);

create trigger person_payments_once before insert on studio.person_payments
  for each row execute function studio.claim_paid_transaction('person');

alter table studio.person_payments enable row level security;
create policy writer_insert on studio.person_payments for insert to studio_writer with check (true);
create policy writer_read on studio.person_payments for select to studio_writer using (true);
revoke all on studio.person_payments from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.person_payments from studio_writer;
grant select, insert on studio.person_payments to studio_writer;

-- ---------------------------------------------------------------------------
-- 4. What each paid Generate cost a person, and what came back.
-- ---------------------------------------------------------------------------

create table studio.person_debits (
  id bigint generated always as identity primary key,
  person bigint not null check (person > 0 or person <= -1000000000),
  usd numeric(12, 6) not null check (usd > 0),
  at timestamptz not null default now(),
  unique (id, person, usd)
);
create index person_debits_person on studio.person_debits (person);

alter table studio.person_debits enable row level security;
create policy writer_insert on studio.person_debits for insert to studio_writer with check (true);
create policy writer_read on studio.person_debits for select to studio_writer using (true);
revoke all on studio.person_debits from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.person_debits from studio_writer;
grant select, insert on studio.person_debits to studio_writer;

create table studio.person_credits (
  id bigint generated always as identity primary key,
  debit_id bigint not null unique,
  person bigint not null,
  usd numeric(12, 6) not null,
  reason text not null check (reason in ('failed', 'refused', 'dropped')),
  at timestamptz not null default now(),
  -- Exactly the debit's person and amount, never more and never to someone else.
  foreign key (debit_id, person, usd) references studio.person_debits (id, person, usd)
);
create index person_credits_person on studio.person_credits (person);

alter table studio.person_credits enable row level security;
create policy writer_insert on studio.person_credits for insert to studio_writer with check (true);
create policy writer_read on studio.person_credits for select to studio_writer using (true);
revoke all on studio.person_credits from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.person_credits from studio_writer;
grant select, insert on studio.person_credits to studio_writer;

rollback;

-- B. THE MIGRATION.
begin;

-- ---------------------------------------------------------------------------
-- 1. Every credited transaction, once, whichever balance it went to.
-- ---------------------------------------------------------------------------

create table studio.paid_transactions (
  tx_hash text primary key check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  credited_to text not null check (credited_to in ('wallet', 'person')),
  at timestamptz not null default now()
);
-- The payments already credited to wallet accounts.
insert into studio.paid_transactions (tx_hash, credited_to, at)
  select tx_hash, 'wallet', credited_at from studio.wallet_payments;

alter table studio.paid_transactions enable row level security;
create policy writer_read on studio.paid_transactions for select to studio_writer using (true);
revoke all on studio.paid_transactions from anon, authenticated, studio_writer;
grant select on studio.paid_transactions to studio_writer;

-- Before a payment row is kept: its hash goes into the ledger first. Already there (credited to anyone): the row is
-- skipped, so the insert returns no row and the app says "already added". Runs as its owner (postgres), so the app
-- can't write the ledger directly.
create function studio.claim_paid_transaction() returns trigger
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $fn$
begin
  insert into studio.paid_transactions (tx_hash, credited_to) values (new.tx_hash, tg_argv[0])
    on conflict (tx_hash) do nothing;
  if not found then
    return null;
  end if;
  return new;
end
$fn$;
revoke all on function studio.claim_paid_transaction() from public, anon, authenticated, studio_writer;

create trigger wallet_payments_once before insert on studio.wallet_payments
  for each row execute function studio.claim_paid_transaction('wallet');

-- ---------------------------------------------------------------------------
-- 2. A wallet's signed statement that its payments go to a person's balance.
-- ---------------------------------------------------------------------------

create table studio.person_pay_intents (
  id uuid primary key default gen_random_uuid(),
  -- A Farcaster ID, or a Lens or Bluesky account (src/lib/people.ts). Never a wallet account's number.
  person bigint not null check (person > 0 or person <= -1000000000),
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz not null default now(),
  unique (id, person)
);
create index person_pay_intents_person on studio.person_pay_intents (person);

alter table studio.person_pay_intents enable row level security;
create policy writer_insert on studio.person_pay_intents for insert to studio_writer with check (true);
create policy writer_read on studio.person_pay_intents for select to studio_writer using (true);
revoke all on studio.person_pay_intents from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.person_pay_intents from studio_writer;
grant select, insert on studio.person_pay_intents to studio_writer;

-- ---------------------------------------------------------------------------
-- 3. Payments credited to a person, one per intent, to that intent's person.
-- ---------------------------------------------------------------------------

create table studio.person_payments (
  tx_hash text primary key check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  intent_id uuid not null unique,
  person bigint not null check (person > 0 or person <= -1000000000),
  chain_id int not null,
  token text not null check (token in ('USDC', 'ETH')),
  amount numeric(78, 0) not null check (amount > 0),
  usd numeric(12, 6) not null check (usd > 0),
  block_number bigint not null,
  credited_at timestamptz not null default now(),
  foreign key (intent_id, person) references studio.person_pay_intents (id, person)
);
create index person_payments_person on studio.person_payments (person);

create trigger person_payments_once before insert on studio.person_payments
  for each row execute function studio.claim_paid_transaction('person');

alter table studio.person_payments enable row level security;
create policy writer_insert on studio.person_payments for insert to studio_writer with check (true);
create policy writer_read on studio.person_payments for select to studio_writer using (true);
revoke all on studio.person_payments from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.person_payments from studio_writer;
grant select, insert on studio.person_payments to studio_writer;

-- ---------------------------------------------------------------------------
-- 4. What each paid Generate cost a person, and what came back.
-- ---------------------------------------------------------------------------

create table studio.person_debits (
  id bigint generated always as identity primary key,
  person bigint not null check (person > 0 or person <= -1000000000),
  usd numeric(12, 6) not null check (usd > 0),
  at timestamptz not null default now(),
  unique (id, person, usd)
);
create index person_debits_person on studio.person_debits (person);

alter table studio.person_debits enable row level security;
create policy writer_insert on studio.person_debits for insert to studio_writer with check (true);
create policy writer_read on studio.person_debits for select to studio_writer using (true);
revoke all on studio.person_debits from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.person_debits from studio_writer;
grant select, insert on studio.person_debits to studio_writer;

create table studio.person_credits (
  id bigint generated always as identity primary key,
  debit_id bigint not null unique,
  person bigint not null,
  usd numeric(12, 6) not null,
  reason text not null check (reason in ('failed', 'refused', 'dropped')),
  at timestamptz not null default now(),
  -- Exactly the debit's person and amount, never more and never to someone else.
  foreign key (debit_id, person, usd) references studio.person_debits (id, person, usd)
);
create index person_credits_person on studio.person_credits (person);

alter table studio.person_credits enable row level security;
create policy writer_insert on studio.person_credits for insert to studio_writer with check (true);
create policy writer_read on studio.person_credits for select to studio_writer using (true);
revoke all on studio.person_credits from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.person_credits from studio_writer;
grant select, insert on studio.person_credits to studio_writer;

commit;

-- C. READ-BACK (after B), as postgres. Two parts, nothing is kept:
--   (a) one read-only select: every row's ok should be true;
--   (b) one do block, with realistic rows as the site would write them: a Farcaster person (FID 2147483646) and a
--       Bluesky person (-2147483646, at or below -1,000,000,000) each sign to pay and are credited a payment; a wallet
--       account is credited one through today's table; the same transaction credited a second time, either way, is
--       skipped; a wallet's number, a payment to someone other than its intent's person, a second payment on one
--       intent, a credit-back for more than its debit and a second credit-back are refused; the balances add up; then
--       everything is deleted. The test numbers and addresses belong to no real account (it stops before writing if
--       one is already there). It ends with the notice "READ-BACK PASSED", or stops with "READ-BACK FAILED: …".

-- (a)
select what, ok from (values
  ('the five tables have their columns',
    (select count(*) from information_schema.columns where table_schema = 'studio' and (table_name, column_name) in (
      ('paid_transactions', 'tx_hash'), ('paid_transactions', 'credited_to'), ('paid_transactions', 'at'),
      ('person_pay_intents', 'id'), ('person_pay_intents', 'person'), ('person_pay_intents', 'address'), ('person_pay_intents', 'created_at'),
      ('person_payments', 'tx_hash'), ('person_payments', 'intent_id'), ('person_payments', 'person'), ('person_payments', 'chain_id'),
      ('person_payments', 'token'), ('person_payments', 'amount'), ('person_payments', 'usd'), ('person_payments', 'block_number'),
      ('person_payments', 'credited_at'),
      ('person_debits', 'id'), ('person_debits', 'person'), ('person_debits', 'usd'), ('person_debits', 'at'),
      ('person_credits', 'id'), ('person_credits', 'debit_id'), ('person_credits', 'person'), ('person_credits', 'usd'),
      ('person_credits', 'reason'), ('person_credits', 'at'))) = 26),
  ('person columns are bigint',
    (select count(*) from information_schema.columns where table_schema = 'studio' and column_name = 'person' and data_type = 'bigint'
      and table_name in ('person_pay_intents', 'person_payments', 'person_debits', 'person_credits')) = 4),
  ('row-level security is on for all five',
    (select bool_and(relrowsecurity) and count(*) = 5 from pg_class where oid in ('studio.paid_transactions'::regclass,
      'studio.person_pay_intents'::regclass, 'studio.person_payments'::regclass, 'studio.person_debits'::regclass, 'studio.person_credits'::regclass))),
  ('the nine policies, all for studio_writer, and no others',
    (select count(*) = 9 and bool_and(roles = '{studio_writer}'::name[]) from pg_policies where schemaname = 'studio'
      and tablename in ('paid_transactions', 'person_pay_intents', 'person_payments', 'person_debits', 'person_credits'))
    and (select count(*) from pg_policies where schemaname = 'studio' and policyname in ('writer_insert', 'writer_read')
      and tablename in ('paid_transactions', 'person_pay_intents', 'person_payments', 'person_debits', 'person_credits')) = 9
    and not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'paid_transactions' and policyname <> 'writer_read')),
  ('studio_writer may select and insert on the four person tables',
    (select bool_and(has_table_privilege('studio_writer', t, 'select') and has_table_privilege('studio_writer', t, 'insert'))
      from unnest(array['studio.person_pay_intents', 'studio.person_payments', 'studio.person_debits', 'studio.person_credits']) t)),
  ('studio_writer may only read paid_transactions',
    has_table_privilege('studio_writer', 'studio.paid_transactions', 'select') and not has_table_privilege('studio_writer', 'studio.paid_transactions', 'insert')),
  ('studio_writer may not update, delete or truncate any of the five',
    not (select bool_or(has_table_privilege('studio_writer', t, p))
      from unnest(array['studio.paid_transactions', 'studio.person_pay_intents', 'studio.person_payments', 'studio.person_debits', 'studio.person_credits']) t,
           unnest(array['update', 'delete', 'truncate']) p)),
  ('anon and authenticated have nothing on any of the five',
    not exists (select 1 from information_schema.role_table_grants where table_schema = 'studio' and grantee in ('anon', 'authenticated')
      and table_name in ('paid_transactions', 'person_pay_intents', 'person_payments', 'person_debits', 'person_credits'))),
  ('the ledger trigger is on both payment tables, enabled',
    (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O' and tgfoid = 'studio.claim_paid_transaction()'::regprocedure
      and ((tgrelid = 'studio.wallet_payments'::regclass and tgname = 'wallet_payments_once') or (tgrelid = 'studio.person_payments'::regclass and tgname = 'person_payments_once'))) = 2),
  ('its function runs as its owner and no one else may call it',
    (select prosecdef from pg_proc where oid = 'studio.claim_paid_transaction()'::regprocedure)
    and not has_function_privilege('studio_writer', 'studio.claim_paid_transaction()', 'execute')
    and not has_function_privilege('anon', 'studio.claim_paid_transaction()', 'execute')),
  ('every wallet payment already credited is in the ledger',
    not exists (select 1 from studio.wallet_payments w where not exists (select 1 from studio.paid_transactions t where t.tx_hash = w.tx_hash))),
  ('a payment goes only to its intent''s person; a credit-back only for its debit''s person and amount',
    exists (select 1 from pg_constraint where conrelid = 'studio.person_payments'::regclass and contype = 'f'
      and pg_get_constraintdef(oid) = 'FOREIGN KEY (intent_id, person) REFERENCES studio.person_pay_intents(id, person)')
    and exists (select 1 from pg_constraint where conrelid = 'studio.person_credits'::regclass and contype = 'f'
      and pg_get_constraintdef(oid) = 'FOREIGN KEY (debit_id, person, usd) REFERENCES studio.person_debits(id, person, usd)'))
) as t(what, ok);

-- (b)
do $$
declare
  p_fid constant bigint := 2147483646;
  p_sky constant bigint := -2147483646;
  a_fid constant text := '0x51e24a4b3a171739c4a105147fc2b10a298d73c5';
  a_sky constant text := '0x5a692bd9deb26f7f728bb69caa46f8db75b5a479';
  a_wal constant text := '0x0bb987b0efb3d5024f7027e9a697a00cbebc038d';
  t_fid constant text := '0x3a989546e3a615727beb7217f968b88f6aacc1736528542aa40126c38fd38bf4';
  t_sky constant text := '0x18082ebb1ebfd2f22fc3a7952f8c7c2bcc9a96dd61a32f08459e60ad751a465f';
  t_wal constant text := '0x97807203ffc4bc3284d36ef65d8239ae5689f43f3b3af425037c8275d1ef3c73';
  i_fid uuid; i_sky uuid; i_spare uuid; wal bigint; d bigint; n int; bal numeric;
  refused boolean;
begin
  -- Any error on the way is a failed read-back (a constraint that can't take real data shows up here).
  begin
  if exists (select 1 from studio.person_pay_intents where person in (p_fid, p_sky))
     or exists (select 1 from studio.person_debits where person in (p_fid, p_sky))
     or exists (select 1 from studio.wallet_accounts where address = a_wal)
     or exists (select 1 from studio.paid_transactions where tx_hash in (t_fid, t_sky, t_wal)) then
    raise exception 'READ-BACK FAILED: a test person, address or transaction is already there; nothing was written';
  end if;

  -- A Farcaster person and a Bluesky person sign to pay; each is credited a payment.
  insert into studio.person_pay_intents (person, address) values (p_fid, a_fid) returning id into i_fid;
  insert into studio.person_pay_intents (person, address) values (p_sky, a_sky) returning id into i_sky;
  insert into studio.person_payments (tx_hash, intent_id, person, chain_id, token, amount, usd, block_number)
    values (t_fid, i_fid, p_fid, 8453, 'USDC', 5000000, 5, 38211457);
  insert into studio.person_payments (tx_hash, intent_id, person, chain_id, token, amount, usd, block_number)
    values (t_sky, i_sky, p_sky, 8453, 'ETH', 2000000000000000, 5.12345, 38211460);
  select count(*) into n from studio.paid_transactions where tx_hash in (t_fid, t_sky) and credited_to = 'person';
  if n <> 2 then raise exception 'READ-BACK FAILED: % person payments in the ledger, not 2', n; end if;

  -- A wallet account, as today: credited through wallet_payments, and in the ledger as 'wallet'.
  insert into studio.wallet_accounts (address) values (a_wal) returning id into wal;
  insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number)
    values (t_wal, wal, 8453, 'USDC', 20000000, 20, 38211470);
  select count(*) into n from studio.paid_transactions where tx_hash = t_wal and credited_to = 'wallet';
  if n <> 1 then raise exception 'READ-BACK FAILED: the wallet payment is not in the ledger'; end if;

  -- The same transaction a second time, either way: skipped (no row), as today's claim expects.
  insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number)
    values (t_fid, wal, 8453, 'USDC', 5000000, 5, 38211457) on conflict (tx_hash) do nothing;
  get diagnostics n = row_count;
  if n <> 0 or exists (select 1 from studio.wallet_payments where tx_hash = t_fid) then
    raise exception 'READ-BACK FAILED: a person''s transaction was credited again to a wallet';
  end if;
  insert into studio.person_pay_intents (person, address) values (p_fid, a_wal) returning id into i_spare;
  insert into studio.person_payments (tx_hash, intent_id, person, chain_id, token, amount, usd, block_number)
    values (t_wal, i_spare, p_fid, 8453, 'USDC', 20000000, 20, 38211470) on conflict (tx_hash) do nothing;
  get diagnostics n = row_count;
  if n <> 0 or exists (select 1 from studio.person_payments where tx_hash = t_wal) then
    raise exception 'READ-BACK FAILED: a wallet''s transaction was credited again to a person';
  end if;

  -- Refused: a wallet account's number as a person.
  refused := false;
  begin
    insert into studio.person_pay_intents (person, address) values (-wal, a_wal);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a wallet account''s number was taken as a person'; end if;
  -- Refused: a payment to someone other than its intent's person.
  refused := false;
  begin
    insert into studio.person_payments (tx_hash, intent_id, person, chain_id, token, amount, usd, block_number)
      values ('0x' || repeat('7e', 32), i_spare, p_sky, 8453, 'USDC', 1000000, 1, 38211480);
  exception when foreign_key_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a payment was credited to someone other than its intent''s person'; end if;
  -- Refused: a second payment on one intent.
  refused := false;
  begin
    insert into studio.person_payments (tx_hash, intent_id, person, chain_id, token, amount, usd, block_number)
      values ('0x' || repeat('7f', 32), i_fid, p_fid, 8453, 'USDC', 1000000, 1, 38211481);
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: one intent was credited twice'; end if;

  -- A paid Generate for the Bluesky person, credited back once for exactly its amount.
  insert into studio.person_debits (person, usd) values (p_sky, 0.016) returning id into d;
  insert into studio.person_debits (person, usd) values (p_fid, 0.016);
  refused := false;
  begin
    insert into studio.person_credits (debit_id, person, usd, reason) values (d, p_sky, 0.5, 'failed');
  exception when foreign_key_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a credit-back for more than its debit was accepted'; end if;
  refused := false;
  begin
    insert into studio.person_credits (debit_id, person, usd, reason) values (d, p_fid, 0.016, 'failed');
  exception when foreign_key_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a credit-back to someone else was accepted'; end if;
  insert into studio.person_credits (debit_id, person, usd, reason) select id, person, usd, 'dropped' from studio.person_debits where id = d;
  refused := false;
  begin
    insert into studio.person_credits (debit_id, person, usd, reason) select id, person, usd, 'failed' from studio.person_debits where id = d;
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: one debit was credited back twice'; end if;

  -- Balances: payments - debits + credits.
  select coalesce((select sum(p.usd) from studio.person_payments p where p.person = p_sky), 0)
       - coalesce((select sum(x.usd) from studio.person_debits x where x.person = p_sky), 0)
       + coalesce((select sum(c.usd) from studio.person_credits c where c.person = p_sky), 0) into bal;
  if bal <> 5.12345 then raise exception 'READ-BACK FAILED: the Bluesky person''s balance is %, not 5.12345', bal; end if;
  select coalesce((select sum(p.usd) from studio.person_payments p where p.person = p_fid), 0)
       - coalesce((select sum(x.usd) from studio.person_debits x where x.person = p_fid), 0)
       + coalesce((select sum(c.usd) from studio.person_credits c where c.person = p_fid), 0) into bal;
  if bal <> 4.984 then raise exception 'READ-BACK FAILED: the Farcaster person''s balance is %, not 4.984', bal; end if;

  -- Delete everything this added.
  delete from studio.person_credits where person in (p_fid, p_sky);
  delete from studio.person_debits where person in (p_fid, p_sky);
  delete from studio.person_payments where person in (p_fid, p_sky);
  delete from studio.person_pay_intents where person in (p_fid, p_sky);
  delete from studio.wallet_payments where account_id = wal;
  delete from studio.wallet_accounts where id = wal;
  delete from studio.paid_transactions where tx_hash in (t_fid, t_sky, t_wal);
  if exists (select 1 from studio.person_pay_intents where person in (p_fid, p_sky))
     or exists (select 1 from studio.person_debits where person in (p_fid, p_sky))
     or exists (select 1 from studio.wallet_accounts where address = a_wal)
     or exists (select 1 from studio.paid_transactions where tx_hash in (t_fid, t_sky, t_wal)) then
    raise exception 'READ-BACK FAILED: test rows left after the delete';
  end if;
  exception when others then
    if sqlerrm like 'READ-BACK FAILED%' then raise; end if;
    raise exception 'READ-BACK FAILED: %', sqlerrm;
  end;
  raise notice 'READ-BACK PASSED';
end $$;
