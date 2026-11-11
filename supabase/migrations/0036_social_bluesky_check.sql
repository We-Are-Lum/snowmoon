-- 0036_social_bluesky_check (was NEXT_social_bluesky_check; numbered at merge, #117, after 0035_signin_lens_bluesky). Branch bluesky-check,
-- owner 2026-11-04: Bluesky accounts get an eligibility check, Bluesky's counterpart of Neynar's score
-- (src/lib/social/bluesky-check.ts). APPLIED on production by the owner on 2026-11-05 in the Supabase SQL
-- Editor (SQL pack 5A–5D: dry run clean, applied, read-back 11/11 true, 5D passed); nothing here is applied by the coding
-- agent (Anthropic's Claude).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. One transaction. Safe to
-- run twice. Requires, in this order: 0033_remix_challenge (challenge_eligibility, challenge_marks), NEXT_check_decisions
-- (the shared decision store the Bluesky check writes to), NEXT_signin_lens_bluesky (Bluesky accounts and their person
-- numbers; the read-back adds one). docs/legal/sql-pack-2026-11-04.md (branch sql-pack) has every pending migration
-- in apply order, with this one's dry run and read-backs, tested on PGlite (npm run test:sql-pack).
--
-- What it changes (none of it publicly readable):
-- 1. No table of its own (owner, 2026-11-04: ONE shared decision store). The Bluesky check keeps its decision in
--    studio.check_decisions: network 'bluesky', account = the DID, threshold 'age30d+5posts30d',
--    passed or not, and when. Never the account's creation date, its posts or any count.
-- 2. studio.challenge_eligibility: a version made by a Bluesky account (person number at or below -1,000,000,000,
--    src/lib/people.ts) can now have a decision, and a new column `account` says whose check made it ('farcaster':
--    Neynar's check or the invited and admin lists, as before; 'bluesky': the Bluesky check). Existing rows are
--    'farcaster'. Wallet accounts (-1 to -999,999,999) still can't.
-- 3. studio.challenge_marks: a Bluesky account can mark its own entry (same person numbers). Its marks carry no
--    `account` column: the person number already says which kind of account it is.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept.
begin;

-- 1. challenge_eligibility: a Bluesky account's version can have a decision; `account` says whose check made it.
alter table studio.challenge_eligibility drop constraint if exists challenge_eligibility_fid_check;
alter table studio.challenge_eligibility add constraint challenge_eligibility_fid_check check (fid > 0 or fid <= -1000000000);
alter table studio.challenge_eligibility add column if not exists account text not null default 'farcaster';
alter table studio.challenge_eligibility drop constraint if exists challenge_eligibility_account_check;
alter table studio.challenge_eligibility add constraint challenge_eligibility_account_check check (account in ('farcaster', 'bluesky'));
alter table studio.challenge_eligibility drop constraint if exists challenge_eligibility_account_matches;
alter table studio.challenge_eligibility add constraint challenge_eligibility_account_matches check ((account = 'farcaster') = (fid > 0));

-- 2. challenge_marks: a Bluesky account can mark (and, after NEXT_challenge_submit, withdraw) its own entry.
alter table studio.challenge_marks drop constraint if exists challenge_marks_fid_check;
alter table studio.challenge_marks add constraint challenge_marks_fid_check check (fid > 0 or fid <= -1000000000);

rollback;

-- B. THE MIGRATION.
begin;

-- 1. challenge_eligibility: a Bluesky account's version can have a decision; `account` says whose check made it.
alter table studio.challenge_eligibility drop constraint if exists challenge_eligibility_fid_check;
alter table studio.challenge_eligibility add constraint challenge_eligibility_fid_check check (fid > 0 or fid <= -1000000000);
alter table studio.challenge_eligibility add column if not exists account text not null default 'farcaster';
alter table studio.challenge_eligibility drop constraint if exists challenge_eligibility_account_check;
alter table studio.challenge_eligibility add constraint challenge_eligibility_account_check check (account in ('farcaster', 'bluesky'));
alter table studio.challenge_eligibility drop constraint if exists challenge_eligibility_account_matches;
alter table studio.challenge_eligibility add constraint challenge_eligibility_account_matches check ((account = 'farcaster') = (fid > 0));

-- 2. challenge_marks: a Bluesky account can mark (and, after NEXT_challenge_submit, withdraw) its own entry.
alter table studio.challenge_marks drop constraint if exists challenge_marks_fid_check;
alter table studio.challenge_marks add constraint challenge_marks_fid_check check (fid > 0 or fid <= -1000000000);

commit;

-- C. READ-BACK (after B), as postgres: supabase/drafts/READ-BACK-social_bluesky_check.sql, two parts ((a) one read-only
-- select, every row true; (b) one do block that needs two existing versions with no entry decision). Kept out of this
-- file so that running every migration on an empty database (the tests, check:principles P6b) does not need them.
