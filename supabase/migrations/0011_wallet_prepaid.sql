-- 0011_wallet_prepaid.sql — wallet sign-in and prepaid generations (owner, 2026-10-13).
-- APPLIED on production by the owner, 2026-10-13 (dry run, then commit; the four tables RLS on, no
-- anon or authenticated reads, columns as expected). Change what it creates in a new migration.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the
-- Supabase SQL Editor. Requires 0001–0010. Dry run first: paste everything, but replace the
-- final `commit;` with `rollback;`.
--
-- What it adds (none of it publicly readable):
-- 1. studio.wallet_accounts: one row per Ethereum address that signed in with a wallet. The
--    account's person number in the image tables (image_asks.fid, elements.created_by_fid,
--    recipes.created_by_fid, contributor_consents.fid) is minus its id, so it can never be a
--    Farcaster FID (those are positive).
-- 2. studio.wallet_payments: one row per onchain payment credited (USDC or ETH on Base), keyed
--    by its transaction hash so a payment is credited once. The amount in USD is fixed when it is
--    credited (USDC 1:1; ETH at Chainlink's ETH/USD price at the payment's block).
-- 3. studio.wallet_debits: what each prepaid Generate cost the account (the estimate plus the
--    markup, IMAGES.prepaid). Payment is final: no refunds (owner, 2026-10-13).
--    Balance = payments - debits: generations paid for and not yet used.
--    Owner's exception, 2026-10-13: for prepaid accounts, money IS linked to a person (it has to be,
--    to keep a balance). image_costs still has no person in it.
-- 4. studio.image_costs gets `funded` ('free' or 'prepaid'), part of its key, so the free daily
--    spend cap counts only free generations and prepaid ones have their own cap.

begin;

-- ---------------------------------------------------------------------------
-- 1. Wallet accounts.
-- ---------------------------------------------------------------------------

create table studio.wallet_accounts (
  id bigint generated always as identity primary key,
  address text not null unique check (address ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz not null default now()
);

alter table studio.wallet_accounts enable row level security;
create policy writer_insert on studio.wallet_accounts for insert to studio_writer with check (true);
create policy writer_read on studio.wallet_accounts for select to studio_writer using (true);
revoke all on studio.wallet_accounts from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.wallet_accounts from studio_writer;
grant select, insert on studio.wallet_accounts to studio_writer;

-- ---------------------------------------------------------------------------
-- 2. Payments credited, once each.
-- ---------------------------------------------------------------------------

create table studio.wallet_payments (
  tx_hash text primary key check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  account_id bigint not null references studio.wallet_accounts(id),
  chain_id int not null,
  token text not null check (token in ('USDC', 'ETH')),
  amount numeric(78, 0) not null check (amount > 0),
  usd numeric(12, 6) not null check (usd > 0),
  block_number bigint not null,
  credited_at timestamptz not null default now()
);
create index wallet_payments_account on studio.wallet_payments (account_id);

alter table studio.wallet_payments enable row level security;
create policy writer_insert on studio.wallet_payments for insert to studio_writer with check (true);
create policy writer_read on studio.wallet_payments for select to studio_writer using (true);
revoke all on studio.wallet_payments from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.wallet_payments from studio_writer;
grant select, insert on studio.wallet_payments to studio_writer;

-- ---------------------------------------------------------------------------
-- 3. What each Generate cost.
-- ---------------------------------------------------------------------------

create table studio.wallet_debits (
  id bigint generated always as identity primary key,
  account_id bigint not null references studio.wallet_accounts(id),
  usd numeric(12, 6) not null check (usd > 0),
  at timestamptz not null default now()
);
create index wallet_debits_account on studio.wallet_debits (account_id);

alter table studio.wallet_debits enable row level security;
create policy writer_insert on studio.wallet_debits for insert to studio_writer with check (true);
create policy writer_read on studio.wallet_debits for select to studio_writer using (true);
revoke all on studio.wallet_debits from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.wallet_debits from studio_writer;
grant select, insert on studio.wallet_debits to studio_writer;

-- ---------------------------------------------------------------------------
-- 4. Free and prepaid costs counted apart (still no person, no row per call).
-- ---------------------------------------------------------------------------

alter table studio.image_costs add column funded text not null default 'free' check (funded in ('free', 'prepaid'));
alter table studio.image_costs drop constraint image_costs_pkey;
alter table studio.image_costs add primary key (day, funded, kind, model, provider, verdict);

commit;

-- Dry run: what would be kept, and that none of it is public.
select c.relname as table, c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'select') as anon_reads,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_reads,
       (select string_agg(a.attname, ', ' order by a.attnum) from pg_attribute a
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'studio' and c.relname in ('wallet_accounts', 'wallet_payments', 'wallet_debits', 'image_costs');
