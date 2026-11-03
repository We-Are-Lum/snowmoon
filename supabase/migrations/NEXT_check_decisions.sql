-- NEXT_check_decisions.sql (numbered at merge; main ends at 0033). Branch check-decisions, owner 2026-11-04:
-- "look each account up as rarely as possible". DRAFT, written by a coding agent (Claude, a closed model made by
-- Anthropic); nothing here is applied by the agent. docs/legal/check-decisions-sql-for-owner.md has it in copy blocks:
-- dry run, migration, read-back (a), read-back (b).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0010
-- (image_scores). One transaction: all of it or none. Safe to run twice. Dry run first: the same SQL with the final
-- `commit;` replaced by `rollback;`.
--
-- What it does (nothing here is publicly readable):
-- 1. studio.check_decisions: whether an account passed a sign-in check, when that was decided, and the rule it was
--    decided under; never the score or the numbers behind it. One row per (network, account, rule). network is
--    'farcaster' (account: the FID, in digits), 'lens' (the account's address, 0x and 40 lowercase hex) or 'bluesky'
--    (the DID, up to 2048 characters). threshold is the rule as text ('neynar-score>=0.7',
--    'made-before-2026-11-06+5posts30d'): a decision made under another rule than today's is not used. The site keeps a
--    pass for 90 days and a fail for 24 hours (src/lib/config.ts, CHECKS), and deletes a pass early when the account is
--    reported or one of its pictures is hidden by a moderator, an admin or a rule. Only the Neynar check writes here
--    today; the Lens and Bluesky checks (branches signin-lens-bluesky and bluesky-check) use the same table.
-- 2. studio.image_scores (0010): every kept Neynar score is deleted, and studio_writer can no longer add or change one,
--    so from the moment this runs no score is kept. The site as deployed before this branch still works (it finds no
--    score, asks Neynar, and its attempt to keep the value fails quietly, as 0010's code already allows); the empty
--    table is dropped by a later migration once this branch is live.
--
-- studio_writer's privileges on check_decisions: select, insert, update (a new decision replaces the old one for the
-- same rule) and delete (expired decisions, and passes withdrawn after a report or hide). No truncate.

begin;

create table if not exists studio.check_decisions (
  network text not null check (network in ('farcaster', 'lens', 'bluesky')),
  account text not null check (length(account) between 1 and 2048),
  threshold text not null check (threshold ~ '^[a-z0-9][a-z0-9.:+<>=_-]{0,199}$'),
  passed boolean not null,
  decided_at timestamptz not null default now(),
  primary key (network, account, threshold),
  constraint check_decisions_account_shape check (
    (network = 'farcaster' and account ~ '^[1-9][0-9]{0,18}$')
    or (network = 'lens' and account ~ '^0x[0-9a-f]{40}$')
    or (network = 'bluesky' and account ~ '^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$')
  )
);
create index if not exists check_decisions_decided_at on studio.check_decisions (decided_at);

alter table studio.check_decisions enable row level security;
drop policy if exists writer_read on studio.check_decisions;
create policy writer_read on studio.check_decisions for select to studio_writer using (true);
drop policy if exists writer_insert on studio.check_decisions;
create policy writer_insert on studio.check_decisions for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.check_decisions;
create policy writer_update on studio.check_decisions for update to studio_writer using (true) with check (true);
drop policy if exists writer_delete on studio.check_decisions;
create policy writer_delete on studio.check_decisions for delete to studio_writer using (true);
revoke all on studio.check_decisions from anon, authenticated;
revoke truncate, references, trigger on studio.check_decisions from studio_writer;
grant select, insert, update, delete on studio.check_decisions to studio_writer;

-- No score is kept from here on: the kept ones go, and none can be added or changed.
delete from studio.image_scores;
revoke insert, update on studio.image_scores from studio_writer;

commit;
