-- NEXT_paid_generations.sql: paid generations for the Ephelion challenge, paid from the prepaid balance (owner,
-- 2026-11-25: "Use one system: the existing prepaid balance (Terms §6a), with a top-up inside the page"). Branch
-- ephelion-paid. APPLIED by the owner in production on 2026-11-25: A, B and C (B run again after the October table
-- below; C's rights table as expected, no error). It takes the next free number at merge, checked against origin/main
-- and production.
-- Drafted by the coding agent (Claude, a closed model by Anthropic). Tested on in-memory PGlite against main's
-- migrations 0001-0051.
-- Requires 0011 (wallet accounts, payments, debits), 0022 and 0027 (credits back) and 0044 (voice costs).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: rights read with has_table_privilege and has_function_privilege, then realistic
-- rows inserted, refunded and deleted, and bad rows refused, all inside a transaction that ends in `rollback;`; it ends
-- "READ-BACK PASSED"), and D. the undo, only if the release is withdrawn. Safe to run twice.
--
-- What it is for. Every paid generation (one more picture, $0.20; one more entry, $1.00) is a charge on the prepaid
-- balance, as images are today; a short balance is topped up inside the page, in USDC on Base, and checked on Base
-- as today. Nothing here takes or checks a payment: that stays studio.wallet_payments (0011), unchanged.
-- 1. studio.wallet_debits gains what a charge bought, for the ledger and the per-person caps (5 entries and 10
--    pictures a day): person (who spent it: a FID, or minus a wallet account's number; it can differ from the account
--    when a Farcaster person spends a balance held by a wallet verified on their account), item ('ephelion-entry' or
--    'ephelion-picture') and ref (the speech, or the take the picture is for). All three are empty on every existing
--    row and on image and remix charges; item and person go together. studio_writer's rights are unchanged (select,
--    insert).
-- 2. studio.wallet_refunds: money paid back in USDC to the wallet a balance belongs to, when we couldn't make what was
--    bought (owner, 2026-11-25: "refund in USDC to the paying wallet when we can't make the thing"). One row per
--    charge, only for a paid-generation charge that was already credited back to the balance (so it is no longer
--    spent), for exactly that charge, to that balance's own address, and only while the balance still holds it; the
--    refund's own transaction on Base is recorded, and who recorded it. Balance = payments - debits + credits -
--    refunds. studio_writer may only read it; a refund is written only through studio.record_wallet_refund, which
--    checks all of the above under the account's lock.
-- 3. studio.voice_costs.funded also accepts 'prepaid', so paid conversions and transcriptions count apart from the
--    free and admin pools (image_costs has had 'prepaid' since 0011).
-- Nothing is public: no rights for anon or authenticated.
--
-- Production, 2026-11-25: A ran clean; B ran, but an empty, unused studio.wallet_refunds of the October shape was
-- already there, so B kept it (and took studio_writer's insert right on it) and C failed on its missing to_address.
-- B now replaces that table when it is empty and has that shape (above); the repair block for production is B run again.
--
-- Safe with today's live code (main at 286891ec, 2026-11-25): the new columns are nullable and nothing reads
-- wallet_refunds yet; the balance is still payments - debits + credits until the code that reads refunds ships, and
-- with no refunds the two are the same.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
alter table studio.wallet_debits add column if not exists person bigint check (person is null or person <> 0);
alter table studio.wallet_debits add column if not exists item text check (item is null or item in ('ephelion-entry', 'ephelion-picture'));
alter table studio.wallet_debits add column if not exists ref text check (ref is null or ref ~ '^[a-z0-9-]{1,80}$');
alter table studio.wallet_debits drop constraint if exists wallet_debits_item_shape;
alter table studio.wallet_debits add constraint wallet_debits_item_shape check ((item is null) = (person is null) and (ref is null or item is not null));
create index if not exists wallet_debits_person_item on studio.wallet_debits (person, item, at) where item is not null;
-- A table of this name from an unmerged October draft (0013_wallet_refunds.sql on branch merge-thursday: debit_id,
-- account_id, usd, reason) was applied in production and never used. It is replaced only if it is empty and still has
-- that shape; anything else stops the migration.
do $g$ begin
  if to_regclass('studio.wallet_refunds') is not null and not exists (select 1 from information_schema.columns
       where table_schema = 'studio' and table_name = 'wallet_refunds' and column_name = 'to_address') then
    if exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'wallet_refunds' and column_name = 'reason')
       and not exists (select 1 from studio.wallet_refunds) then
      drop table studio.wallet_refunds;
    else
      raise exception 'STOP: studio.wallet_refunds exists with another shape, or holds rows; nothing was changed';
    end if;
  end if;
end $g$;
create table if not exists studio.wallet_refunds (
  id bigint generated always as identity primary key,
  debit_id bigint not null unique references studio.wallet_debits(id),
  account_id bigint not null references studio.wallet_accounts(id),
  usd numeric(12, 6) not null check (usd > 0),
  to_address text not null check (to_address ~ '^0x[0-9a-f]{40}$'),
  tx_hash text not null unique check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  by_fid bigint not null check (by_fid > 0),
  at timestamptz not null default now()
);
create index if not exists wallet_refunds_account on studio.wallet_refunds (account_id);
alter table studio.wallet_refunds enable row level security;
drop policy if exists writer_read on studio.wallet_refunds;
create policy writer_read on studio.wallet_refunds for select to studio_writer using (true);
revoke all on studio.wallet_refunds from public, anon, authenticated;
revoke all on studio.wallet_refunds from studio_writer;
grant select on studio.wallet_refunds to studio_writer;
create or replace function studio.record_wallet_refund(p_debit bigint, p_to text, p_tx text, p_by bigint) returns bigint
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare
  d record;
  addr text;
  bal numeric;
  new_id bigint;
begin
  select id, account_id, usd, item into d from studio.wallet_debits where id = p_debit;
  if d.id is null or d.item is null then raise exception 'not a paid-generation charge' using errcode = 'P0002'; end if;
  -- The same lock the site takes before charging this account, so a refund and a charge can't both spend the money.
  perform pg_advisory_xact_lock(hashtext('snowmoon.wallet.account'), d.account_id::int);
  if not exists (select 1 from studio.wallet_credits where debit_id = p_debit) then
    raise exception 'the charge was not credited back, so it is still spent' using errcode = 'P0002';
  end if;
  if exists (select 1 from studio.wallet_refunds where debit_id = p_debit) then raise exception 'already refunded' using errcode = 'P0002'; end if;
  select address into addr from studio.wallet_accounts where id = d.account_id;
  if lower(p_to) is distinct from addr then raise exception 'a refund goes only to the wallet the balance belongs to' using errcode = '22023'; end if;
  select coalesce((select sum(usd) from studio.wallet_payments where account_id = d.account_id), 0)
       - coalesce((select sum(usd) from studio.wallet_debits where account_id = d.account_id), 0)
       + coalesce((select sum(usd) from studio.wallet_credits where account_id = d.account_id), 0)
       - coalesce((select sum(usd) from studio.wallet_refunds where account_id = d.account_id), 0)
    into bal;
  if bal < d.usd then raise exception 'the balance no longer holds it' using errcode = 'P0002'; end if;
  insert into studio.wallet_refunds (debit_id, account_id, usd, to_address, tx_hash, by_fid)
    values (p_debit, d.account_id, d.usd, addr, lower(p_tx), p_by) returning id into new_id;
  return new_id;
end
$fn$;
revoke all on function studio.record_wallet_refund(bigint, text, text, bigint) from public, anon, authenticated;
grant execute on function studio.record_wallet_refund(bigint, text, text, bigint) to studio_writer;
alter table studio.voice_costs drop constraint if exists voice_costs_funded_check;
alter table studio.voice_costs add constraint voice_costs_funded_check check (funded in ('free', 'admin', 'prepaid'));
rollback;

-- B. MIGRATION.
begin;
alter table studio.wallet_debits add column if not exists person bigint check (person is null or person <> 0);
alter table studio.wallet_debits add column if not exists item text check (item is null or item in ('ephelion-entry', 'ephelion-picture'));
alter table studio.wallet_debits add column if not exists ref text check (ref is null or ref ~ '^[a-z0-9-]{1,80}$');
alter table studio.wallet_debits drop constraint if exists wallet_debits_item_shape;
alter table studio.wallet_debits add constraint wallet_debits_item_shape check ((item is null) = (person is null) and (ref is null or item is not null));
create index if not exists wallet_debits_person_item on studio.wallet_debits (person, item, at) where item is not null;
-- A table of this name from an unmerged October draft (0013_wallet_refunds.sql on branch merge-thursday: debit_id,
-- account_id, usd, reason) was applied in production and never used. It is replaced only if it is empty and still has
-- that shape; anything else stops the migration.
do $g$ begin
  if to_regclass('studio.wallet_refunds') is not null and not exists (select 1 from information_schema.columns
       where table_schema = 'studio' and table_name = 'wallet_refunds' and column_name = 'to_address') then
    if exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'wallet_refunds' and column_name = 'reason')
       and not exists (select 1 from studio.wallet_refunds) then
      drop table studio.wallet_refunds;
    else
      raise exception 'STOP: studio.wallet_refunds exists with another shape, or holds rows; nothing was changed';
    end if;
  end if;
end $g$;
create table if not exists studio.wallet_refunds (
  id bigint generated always as identity primary key,
  debit_id bigint not null unique references studio.wallet_debits(id),
  account_id bigint not null references studio.wallet_accounts(id),
  usd numeric(12, 6) not null check (usd > 0),
  to_address text not null check (to_address ~ '^0x[0-9a-f]{40}$'),
  tx_hash text not null unique check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  by_fid bigint not null check (by_fid > 0),
  at timestamptz not null default now()
);
create index if not exists wallet_refunds_account on studio.wallet_refunds (account_id);
alter table studio.wallet_refunds enable row level security;
drop policy if exists writer_read on studio.wallet_refunds;
create policy writer_read on studio.wallet_refunds for select to studio_writer using (true);
revoke all on studio.wallet_refunds from public, anon, authenticated;
revoke all on studio.wallet_refunds from studio_writer;
grant select on studio.wallet_refunds to studio_writer;
create or replace function studio.record_wallet_refund(p_debit bigint, p_to text, p_tx text, p_by bigint) returns bigint
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare
  d record;
  addr text;
  bal numeric;
  new_id bigint;
begin
  select id, account_id, usd, item into d from studio.wallet_debits where id = p_debit;
  if d.id is null or d.item is null then raise exception 'not a paid-generation charge' using errcode = 'P0002'; end if;
  -- The same lock the site takes before charging this account, so a refund and a charge can't both spend the money.
  perform pg_advisory_xact_lock(hashtext('snowmoon.wallet.account'), d.account_id::int);
  if not exists (select 1 from studio.wallet_credits where debit_id = p_debit) then
    raise exception 'the charge was not credited back, so it is still spent' using errcode = 'P0002';
  end if;
  if exists (select 1 from studio.wallet_refunds where debit_id = p_debit) then raise exception 'already refunded' using errcode = 'P0002'; end if;
  select address into addr from studio.wallet_accounts where id = d.account_id;
  if lower(p_to) is distinct from addr then raise exception 'a refund goes only to the wallet the balance belongs to' using errcode = '22023'; end if;
  select coalesce((select sum(usd) from studio.wallet_payments where account_id = d.account_id), 0)
       - coalesce((select sum(usd) from studio.wallet_debits where account_id = d.account_id), 0)
       + coalesce((select sum(usd) from studio.wallet_credits where account_id = d.account_id), 0)
       - coalesce((select sum(usd) from studio.wallet_refunds where account_id = d.account_id), 0)
    into bal;
  if bal < d.usd then raise exception 'the balance no longer holds it' using errcode = 'P0002'; end if;
  insert into studio.wallet_refunds (debit_id, account_id, usd, to_address, tx_hash, by_fid)
    values (p_debit, d.account_id, d.usd, addr, lower(p_tx), p_by) returning id into new_id;
  return new_id;
end
$fn$;
revoke all on function studio.record_wallet_refund(bigint, text, text, bigint) from public, anon, authenticated;
grant execute on function studio.record_wallet_refund(bigint, text, text, bigint) to studio_writer;
alter table studio.voice_costs drop constraint if exists voice_costs_funded_check;
alter table studio.voice_costs add constraint voice_costs_funded_check check (funded in ('free', 'admin', 'prepaid'));
commit;

-- C. READ-BACK (after B), as postgres. Paste the lines below without their "-- ". It sets no role (postgres can't
--    switch roles in the SQL Editor): studio_writer's rights are read with has_table_privilege and
--    has_function_privilege, and the rows are written as postgres, exactly as the site writes them. Everything is
--    inside one transaction that ends in rollback, so nothing is kept even if a check fails part way. The wallet
--    0x00000000000000000000000000000000c0ffee01 and FID 2147483646 belong to no one; the transactions are made up.
--    Ends "READ-BACK PASSED"; each check raises "READ-BACK FAILED: …" on failure.
--
-- begin;
-- select t, p, has_table_privilege('studio_writer', t, p) as writer, has_table_privilege('anon', t, p) as anon
-- from unnest(array['studio.wallet_refunds', 'studio.wallet_debits']) t, unnest(array['select', 'insert', 'update', 'delete']) p order by 1, 2;
-- do $$
-- declare
--   acct bigint;
--   d1 bigint;
--   d2 bigint;
--   n int;
--   bal numeric;
--   refused boolean;
--   addr constant text := '0x00000000000000000000000000000000c0ffee01';
-- begin
--   if not has_table_privilege('studio_writer', 'studio.wallet_refunds', 'select')
--     or has_table_privilege('studio_writer', 'studio.wallet_refunds', 'insert') or has_table_privilege('studio_writer', 'studio.wallet_refunds', 'update')
--     or has_table_privilege('studio_writer', 'studio.wallet_refunds', 'delete')
--     then raise exception 'READ-BACK FAILED: studio_writer''s rights on wallet_refunds (select only)'; end if;
--   if not has_function_privilege('studio_writer', 'studio.record_wallet_refund(bigint, text, text, bigint)', 'execute')
--     or has_function_privilege('anon', 'studio.record_wallet_refund(bigint, text, text, bigint)', 'execute')
--     then raise exception 'READ-BACK FAILED: who may record a refund'; end if;
--   if not (has_table_privilege('studio_writer', 'studio.wallet_debits', 'insert') and has_table_privilege('studio_writer', 'studio.wallet_debits', 'select'))
--     or has_table_privilege('studio_writer', 'studio.wallet_debits', 'update') or has_table_privilege('studio_writer', 'studio.wallet_debits', 'delete')
--     then raise exception 'READ-BACK FAILED: studio_writer''s rights on wallet_debits changed'; end if;
--   select count(*) into n from unnest(array['anon', 'authenticated']) r, unnest(array['select', 'insert', 'update', 'delete']) p where has_table_privilege(r, 'studio.wallet_refunds', p);
--   if n <> 0 then raise exception 'READ-BACK FAILED: anon or authenticated has % rights on wallet_refunds', n; end if;
--   -- A wallet tops up $1.00 in USDC and a Farcaster person who verified it spends it on one more entry.
--   insert into studio.wallet_accounts (address) values (addr) returning id into acct;
--   insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number)
--     values ('0x' || repeat('ab', 32), acct, 8453, 'USDC', 1000000, 1.00, 38000000);
--   insert into studio.wallet_debits (account_id, usd, person, item, ref) values (acct, 1.00, 2147483646, 'ephelion-entry', 'doing-fine') returning id into d1;
--   -- A refund is refused while the charge is still spent (not credited back).
--   begin perform studio.record_wallet_refund(d1, addr, '0x' || repeat('cd', 32), 6786); refused := false; exception when others then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a refund of a charge still spent was accepted'; end if;
--   -- The conversion fails: the charge is credited back, as today. Then we can't make it, and refund it.
--   insert into studio.wallet_credits (debit_id, account_id, usd, reason) select id, account_id, usd, 'failed' from studio.wallet_debits where id = d1;
--   begin perform studio.record_wallet_refund(d1, '0x00000000000000000000000000000000c0ffee02', '0x' || repeat('cd', 32), 6786); refused := false; exception when others then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a refund to another wallet was accepted'; end if;
--   perform studio.record_wallet_refund(d1, upper(addr), '0x' || repeat('cd', 32), 6786);
--   select count(*) into n from studio.wallet_refunds where debit_id = d1 and usd = 1.00 and to_address = addr;
--   if n <> 1 then raise exception 'READ-BACK FAILED: the refund was not kept as one row for $1.00 to the wallet'; end if;
--   begin perform studio.record_wallet_refund(d1, addr, '0x' || repeat('ce', 32), 6786); refused := false; exception when others then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: the same charge was refunded twice'; end if;
--   select (select coalesce(sum(usd), 0) from studio.wallet_payments where account_id = acct) - (select coalesce(sum(usd), 0) from studio.wallet_debits where account_id = acct)
--        + (select coalesce(sum(usd), 0) from studio.wallet_credits where account_id = acct) - (select coalesce(sum(usd), 0) from studio.wallet_refunds where account_id = acct) into bal;
--   if bal <> 0 then raise exception 'READ-BACK FAILED: the balance after the refund is %, not 0', bal; end if;
--   -- A picture charge credited back but already spent again on the retry: the balance no longer holds it.
--   insert into studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number)
--     values ('0x' || repeat('ef', 32), acct, 8453, 'USDC', 200000, 0.20, 38000100);
--   insert into studio.wallet_debits (account_id, usd, person, item, ref) values (acct, 0.20, 2147483646, 'ephelion-picture', 'doing-fine') returning id into d2;
--   insert into studio.wallet_credits (debit_id, account_id, usd, reason) select id, account_id, usd, 'dropped' from studio.wallet_debits where id = d2;
--   insert into studio.wallet_debits (account_id, usd, person, item, ref) values (acct, 0.20, 2147483646, 'ephelion-picture', 'doing-fine');
--   begin perform studio.record_wallet_refund(d2, addr, '0x' || repeat('cf', 32), 6786); refused := false; exception when others then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a refund the balance no longer holds was accepted'; end if;
--   -- Bad charges are refused: an unknown item, an item without its person, and an image charge (no item) still works.
--   begin insert into studio.wallet_debits (account_id, usd, person, item) values (acct, 1, 2147483646, 'free-money'); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: an unknown item was accepted'; end if;
--   begin insert into studio.wallet_debits (account_id, usd, item) values (acct, 1, 'ephelion-entry'); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: an item without its person was accepted'; end if;
--   insert into studio.wallet_debits (account_id, usd) values (acct, 0.028);
--   -- Paid voice costs count apart.
--   insert into studio.voice_costs (day, kind, model, funded, verdict, calls, seconds, credits, estimated_credits, cost_usd)
--     values ('2001-01-01', 'convert', 'eleven_multilingual_sts_v2', 'prepaid', 'ok', 1, 64, 704, 710, 0.128);
--   -- Delete every test row (as postgres; the site can't delete any of them).
--   delete from studio.voice_costs where day = '2001-01-01' and funded = 'prepaid';
--   delete from studio.wallet_refunds where account_id = acct;
--   delete from studio.wallet_credits where account_id = acct;
--   delete from studio.wallet_debits where account_id = acct;
--   delete from studio.wallet_payments where account_id = acct;
--   delete from studio.wallet_accounts where id = acct;
--   if exists (select 1 from studio.wallet_accounts where address = addr) then raise exception 'READ-BACK FAILED: the test rows were not deleted'; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;
-- rollback;

-- D. UNDO, only if the release is withdrawn (after the code that reads these is gone). Refused once any refund or any
--    paid-generation charge exists: those are the ledger, and are never deleted. Paste without the "-- ".
-- begin;
-- do $$ begin
--   if exists (select 1 from studio.wallet_refunds) or exists (select 1 from studio.wallet_debits where item is not null)
--     or exists (select 1 from studio.voice_costs where funded = 'prepaid')
--     then raise exception 'UNDO REFUSED: paid generations or refunds are on record'; end if;
-- end $$;
-- drop function if exists studio.record_wallet_refund(bigint, text, text, bigint);
-- drop table if exists studio.wallet_refunds;
-- drop index if exists studio.wallet_debits_person_item;
-- alter table studio.wallet_debits drop constraint if exists wallet_debits_item_shape;
-- alter table studio.wallet_debits drop column if exists ref, drop column if exists item, drop column if exists person;
-- alter table studio.voice_costs drop constraint if exists voice_costs_funded_check;
-- alter table studio.voice_costs add constraint voice_costs_funded_check check (funded in ('free', 'admin'));
-- commit;
