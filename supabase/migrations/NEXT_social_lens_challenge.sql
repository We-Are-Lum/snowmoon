-- NEXT_social_lens_challenge (numbered at merge; named to sort after NEXT_social_bluesky_check). Branch contest, overnight run
-- 2026-11-05, item 4: a Lens account's remix can have a challenge decision, made by its Lens check at publish (its Lens
-- score against 1,000, kept only as a decision in studio.check_decisions, network 'lens', rule 'lens-score>=1000';
-- src/lib/challenge/record.ts). DRAFT, NOT APPLIED: the owner pastes it in the Supabase SQL Editor; nothing here is
-- applied by the coding agent (Anthropic's Claude).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. One transaction. Safe to
-- run twice. Requires, in this order: 0033_remix_challenge, 0034_check_decisions, NEXT_signin_lens_bluesky (Lens
-- accounts; the read-back adds a made-up one), NEXT_social_bluesky_check (the `account` column this widens).
--
-- What it changes (none of it publicly readable): studio.challenge_eligibility.account may also be 'lens'. Its other
-- checks stay: the person number is a FID exactly when the account is 'farcaster', and never a wallet's.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept.
begin;

alter table studio.challenge_eligibility drop constraint if exists challenge_eligibility_account_check;
alter table studio.challenge_eligibility add constraint challenge_eligibility_account_check check (account in ('farcaster', 'bluesky', 'lens'));

rollback;

-- B. THE MIGRATION.
begin;

alter table studio.challenge_eligibility drop constraint if exists challenge_eligibility_account_check;
alter table studio.challenge_eligibility add constraint challenge_eligibility_account_check check (account in ('farcaster', 'bluesky', 'lens'));

commit;

-- C. READ-BACK (after B), as postgres: supabase/drafts/READ-BACK-social_lens_challenge.sql, two parts ((a) one read-only
-- select, every row's ok true; (b) one do block with a made-up Lens account, ending "READ-BACK PASSED"); nothing is kept.
