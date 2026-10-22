-- 0022: credit back a prepaid Generate that failed (owner, 2026-10-21: "credit the balance for anything charged but
-- not made. 'Payments are final' means no cash refunds."). DRAFT, NOT APPLIED.
--
-- MUST RUN AS postgres, in the Supabase SQL Editor, after 0011. Dry run first: replace the final `commit;` with
-- `rollback;`. Tested only in PGlite (npm run test:wallet). The code reads this table only once
-- IMAGES.prepaid.creditBack is true (src/lib/config.ts), which waits for this migration and for the Terms
-- (section 6a, docs/legal/credits-draft.md) to be reread and changed in the same deploy.
--
-- studio.wallet_credits: a debit credited back to the same account's balance, never paid out as money.
--   At most one credit per debit (debit_id is unique), for exactly that debit's amount and account: the app
--   inserts it by copying the debit row (src/lib/wallet/credits.ts, creditBack), so it can't credit more
--   than was taken, or to someone else. Append-only for the app; nothing public.
--   Balance = payments - debits + credits.
--   reason: 'failed' (the prompt check or the image model didn't answer, so nothing was made). Other
--   outcomes (a refused prompt, a picture the safety checker drops) stay charged until the owner decides.

begin;

create table studio.wallet_credits (
  id bigint generated always as identity primary key,
  debit_id bigint not null unique references studio.wallet_debits(id),
  account_id bigint not null references studio.wallet_accounts(id),
  usd numeric(12, 6) not null check (usd > 0),
  reason text not null check (reason in ('failed')),
  at timestamptz not null default now()
);
create index wallet_credits_account on studio.wallet_credits (account_id);

alter table studio.wallet_credits enable row level security;
create policy writer_insert on studio.wallet_credits for insert to studio_writer with check (true);
create policy writer_read on studio.wallet_credits for select to studio_writer using (true);
revoke all on studio.wallet_credits from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.wallet_credits from studio_writer;
grant select, insert on studio.wallet_credits to studio_writer;

commit;

-- Dry run: nothing public, nothing changeable by the app.
-- select c.relname, has_table_privilege('anon', c.oid, 'select') as anon_reads,
--        has_table_privilege('studio_writer', c.oid, 'update') as writer_updates
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'studio' and c.relname = 'wallet_credits';
