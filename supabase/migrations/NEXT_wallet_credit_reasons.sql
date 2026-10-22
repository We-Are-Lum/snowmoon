-- NEXT_wallet_credit_reasons.sql — credit back every Generate that gives no picture (owner, 2026-10-22: "Credit-back:
-- B."). DRAFT, NOT APPLIED. Named by topic; it gets the next free number at merge, checked against main and
-- production. Written by the coding agent on branch credit-back-b.
--
-- MUST RUN AS postgres, in the Supabase SQL Editor, after 0022. Dry run first: replace the final `commit;` with
-- `rollback;`. Tested only in PGlite (npm run test:wallet).
--
-- studio.wallet_credits.reason, from 'failed' only to:
--   'failed'  the prompt check or the image model didn't answer;
--   'refused' the blocked-names list or the rules check refused the prompt;
--   'dropped' the safety checker dropped the picture.
-- Nothing else changes: still one credit per debit, for exactly that debit, append-only, nothing public.

begin;

alter table studio.wallet_credits drop constraint wallet_credits_reason_check;
alter table studio.wallet_credits add constraint wallet_credits_reason_check check (reason in ('failed', 'refused', 'dropped'));

commit;
