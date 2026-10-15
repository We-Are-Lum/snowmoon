-- 0013: a wallet's Generate is credited back when the failure is ours (owner, 2026-10-14).
--
-- NOT APPLIED. The owner applies migrations by hand. Until it is applied, paidPicture's refund
-- fails and is logged; the Generate's error is returned as before (src/lib/images/paid.ts).
--
-- A Generate is debited when it is pressed (0011, studio.wallet_debits, append-only, usd > 0). When
-- the prompt check or the image model doesn't answer, the whole debit is credited back here, once.
-- Blocked prompts and images the safety checker drops stay charged, as the payment screen says.
-- Balance = payments - debits + refunds (src/lib/wallet/credits.ts, balanceUsd).

begin;

create table studio.wallet_refunds (
  id bigint generated always as identity primary key,
  debit_id bigint not null unique references studio.wallet_debits(id),
  account_id bigint not null references studio.wallet_accounts(id),
  usd numeric(12, 6) not null check (usd > 0),
  reason text not null check (reason in ('check-unavailable', 'model-unavailable')),
  at timestamptz not null default now()
);
create index wallet_refunds_account on studio.wallet_refunds (account_id);

alter table studio.wallet_refunds enable row level security;
create policy writer_insert on studio.wallet_refunds for insert to studio_writer with check (true);
create policy writer_read on studio.wallet_refunds for select to studio_writer using (true);
revoke all on studio.wallet_refunds from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.wallet_refunds from studio_writer;
grant select, insert on studio.wallet_refunds to studio_writer;

commit;
