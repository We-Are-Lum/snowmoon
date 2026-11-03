-- NEXT_social_bluesky_check (numbered at merge; named to sort after NEXT_signin_lens_bluesky, which it needs). Branch bluesky-check, owner 2026-11-04: Bluesky accounts get an
-- eligibility check, Bluesky's counterpart of Neynar's score (src/lib/social/bluesky-check.ts). DRAFT, NOT APPLIED:
-- the owner pastes it in the Supabase SQL Editor; nothing here is applied by the coding agent (Anthropic's Claude).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor.
-- Requires 0033_remix_challenge and NEXT_signin_lens_bluesky (studio.social_accounts), in that order.
-- Paste it whole, or block by block, in this order:
--   A. the dry run: the migration, ending in rollback; (nothing is kept);
--   B. the migration: the same, ending in commit;
--   C. the read-back, in two parts: (a) one read-only select whose rows should all be true; (b) one do block that
--      adds a realistic Bluesky account, its check and a challenge decision for it, checks them, deletes them, and
--      raises "READ-BACK FAILED" if anything is wrong (nothing is kept either way).
-- Tested in PGlite only (npm run test:bluesky-check, which runs every migration and then this one).
--
-- What it changes (none of it publicly readable):
-- 1. studio.bluesky_checks: one row per Bluesky account (studio.social_accounts), its latest decision ('passed',
--    'new': made on or after the cut-off date, 'idle': too few recent posts), when it was made, and the threshold it
--    was made under (owner, 2026-11-04: store the decision, not the numbers). Never the account's creation date, its
--    posts, or any count: those are compared in memory and forgotten. A pass lasts 90 days; a fail is asked again no
--    sooner than 24 hours later; a changed threshold asks again at once (SOCIAL_SIGN_IN.bluesky.check).
-- 2. studio.challenge_eligibility: a version made by a Bluesky account (person number at or below -1,000,000,000,
--    src/lib/people.ts) can now have a decision, and a new column `account` says whose check made it ('farcaster':
--    Neynar's score or the invited and admin lists, as before; 'bluesky': the Bluesky check). Existing rows are
--    'farcaster'. Wallet accounts (-1 to -999,999,999) still can't.
-- 3. studio.challenge_marks: a Bluesky account can mark its own entry (same person numbers).

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept.
begin;

create table studio.bluesky_checks (
  account_id bigint primary key references studio.social_accounts(id),
  decision text not null check (decision in ('passed', 'new', 'idle')),
  checked_at timestamptz not null default now(),
  -- The rules it was decided under (src/lib/social/bluesky-check.ts, thresholdKey): never a count or a date of the account's.
  threshold text not null check (threshold ~ '^made<[0-9T:.Z-]{10,30};posts>=[0-9]{1,3}/[0-9]{1,3}d$')
);
alter table studio.bluesky_checks enable row level security;
create policy writer_insert on studio.bluesky_checks for insert to studio_writer with check (true);
create policy writer_read on studio.bluesky_checks for select to studio_writer using (true);
create policy writer_update on studio.bluesky_checks for update to studio_writer using (true) with check (true);
revoke all on studio.bluesky_checks from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.bluesky_checks from studio_writer;
grant select, insert on studio.bluesky_checks to studio_writer;
grant update (decision, checked_at, threshold) on studio.bluesky_checks to studio_writer;

alter table studio.challenge_eligibility drop constraint challenge_eligibility_fid_check;
alter table studio.challenge_eligibility add constraint challenge_eligibility_fid_check check (fid > 0 or fid <= -1000000000);
alter table studio.challenge_eligibility add column account text not null default 'farcaster' check (account in ('farcaster', 'bluesky'));
alter table studio.challenge_eligibility add constraint challenge_eligibility_account_matches check ((account = 'farcaster') = (fid > 0));
alter table studio.challenge_marks drop constraint challenge_marks_fid_check;
alter table studio.challenge_marks add constraint challenge_marks_fid_check check (fid > 0 or fid <= -1000000000);

rollback;

-- B. THE MIGRATION.
begin;

create table studio.bluesky_checks (
  account_id bigint primary key references studio.social_accounts(id),
  decision text not null check (decision in ('passed', 'new', 'idle')),
  checked_at timestamptz not null default now(),
  -- The rules it was decided under (src/lib/social/bluesky-check.ts, thresholdKey): never a count or a date of the account's.
  threshold text not null check (threshold ~ '^made<[0-9T:.Z-]{10,30};posts>=[0-9]{1,3}/[0-9]{1,3}d$')
);
alter table studio.bluesky_checks enable row level security;
create policy writer_insert on studio.bluesky_checks for insert to studio_writer with check (true);
create policy writer_read on studio.bluesky_checks for select to studio_writer using (true);
create policy writer_update on studio.bluesky_checks for update to studio_writer using (true) with check (true);
revoke all on studio.bluesky_checks from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.bluesky_checks from studio_writer;
grant select, insert on studio.bluesky_checks to studio_writer;
grant update (decision, checked_at, threshold) on studio.bluesky_checks to studio_writer;

alter table studio.challenge_eligibility drop constraint challenge_eligibility_fid_check;
alter table studio.challenge_eligibility add constraint challenge_eligibility_fid_check check (fid > 0 or fid <= -1000000000);
alter table studio.challenge_eligibility add column account text not null default 'farcaster' check (account in ('farcaster', 'bluesky'));
alter table studio.challenge_eligibility add constraint challenge_eligibility_account_matches check ((account = 'farcaster') = (fid > 0));
alter table studio.challenge_marks drop constraint challenge_marks_fid_check;
alter table studio.challenge_marks add constraint challenge_marks_fid_check check (fid > 0 or fid <= -1000000000);

commit;

-- C. READ-BACK (after B), as postgres. Two parts, nothing is kept.

-- (a) one read-only select: every row's ok should be true.
select what, ok from (values
  ('bluesky_checks has exactly its 4 columns (no date, post or count column)',
    (select count(*) from information_schema.columns where table_schema = 'studio' and table_name = 'bluesky_checks') = 4
    and (select count(*) from information_schema.columns where table_schema = 'studio' and table_name = 'bluesky_checks'
      and column_name in ('account_id', 'decision', 'checked_at', 'threshold')) = 4),
  ('row-level security is on',
    (select relrowsecurity from pg_class where oid = 'studio.bluesky_checks'::regclass)),
  ('its three policies, all for studio_writer, and no others',
    (select count(*) from pg_policies where schemaname = 'studio' and tablename = 'bluesky_checks' and roles = '{studio_writer}'
      and policyname in ('writer_insert', 'writer_read', 'writer_update')) = 3
    and (select count(*) from pg_policies where schemaname = 'studio' and tablename = 'bluesky_checks') = 3),
  ('studio_writer may select, insert and update the decision, its time and threshold, not delete or truncate',
    has_table_privilege('studio_writer', 'studio.bluesky_checks', 'select') and has_table_privilege('studio_writer', 'studio.bluesky_checks', 'insert')
    and has_column_privilege('studio_writer', 'studio.bluesky_checks', 'decision', 'update') and has_column_privilege('studio_writer', 'studio.bluesky_checks', 'checked_at', 'update')
    and not has_column_privilege('studio_writer', 'studio.bluesky_checks', 'account_id', 'update')
    and not has_table_privilege('studio_writer', 'studio.bluesky_checks', 'delete') and not has_table_privilege('studio_writer', 'studio.bluesky_checks', 'truncate')),
  ('anon and authenticated have nothing on it',
    not exists (select 1 from information_schema.role_table_grants where table_schema = 'studio' and table_name = 'bluesky_checks' and grantee in ('anon', 'authenticated'))),
  ('challenge_eligibility has the account column, and its fid check takes Bluesky accounts',
    exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'challenge_eligibility' and column_name = 'account')
    and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'challenge_eligibility_fid_check') ilike '%-1000000000%'),
  ('challenge_marks'' fid check takes Bluesky accounts',
    (select pg_get_constraintdef(oid) from pg_constraint where conname = 'challenge_marks_fid_check') ilike '%-1000000000%'),
  ('every existing eligibility row is a Farcaster account''s',
    not exists (select 1 from studio.challenge_eligibility where account <> 'farcaster' or fid <= 0))
) as t(what, ok);

-- (b) one do block: a realistic Bluesky account, its check, a decision again (the row updated, no second row), a bad
-- decision refused, a challenge decision for a version it made (on an existing version with none yet), a wallet
-- number refused there; each checked, then deleted.
do $$
declare
  sky bigint;
  v uuid;
  n int;
  refused boolean;
begin
  insert into studio.social_accounts (kind, subject, handle) values ('bluesky', 'did:plc:readbackcheckaaaaaaaaaaa', 'readback.bsky.social') returning id into sky;
  insert into studio.bluesky_checks (account_id, decision, threshold) values (sky, 'idle', 'made<2026-11-06T08:00:00Z;posts>=5/30d');
  insert into studio.bluesky_checks (account_id, decision, checked_at, threshold) values (sky, 'passed', now(), 'made<2026-11-06T08:00:00Z;posts>=5/30d')
    on conflict (account_id) do update set decision = excluded.decision, checked_at = excluded.checked_at, threshold = excluded.threshold;
  select count(*) into n from studio.bluesky_checks where account_id = sky and decision = 'passed';
  if n <> 1 then raise exception 'READ-BACK FAILED: % rows for the account after a second decision, not 1 passed', n; end if;
  refused := false;
  begin
    update studio.bluesky_checks set threshold = '412 posts' where account_id = sky;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a threshold that isn''t the rules'' key was accepted'; end if;
  refused := false;
  begin
    update studio.bluesky_checks set decision = 'maybe' where account_id = sky;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a decision other than passed, new or idle was accepted'; end if;
  select id into v from studio.element_versions x where not exists (select 1 from studio.challenge_eligibility e where e.version_id = x.id) limit 1;
  if v is not null then
    insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible, account)
      values (v, 'readback-check', -(1000000000 + sky), 'passed', true, 'bluesky');
    select count(*) into n from studio.challenge_eligibility where version_id = v and account = 'bluesky' and eligible;
    if n <> 1 then raise exception 'READ-BACK FAILED: the Bluesky account''s decision was not kept'; end if;
    delete from studio.challenge_eligibility where version_id = v and challenge = 'readback-check';
    refused := false;
    begin
      insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible, account) values (v, 'readback-check', -5, 'passed', true, 'bluesky');
    exception when check_violation then refused := true;
    end;
    if not refused then raise exception 'READ-BACK FAILED: a wallet account''s number was accepted in challenge_eligibility'; end if;
  end if;
  delete from studio.bluesky_checks where account_id = sky;
  delete from studio.social_accounts where id = sky;
  select count(*) into n from studio.social_accounts where id = sky;
  if n <> 0 then raise exception 'READ-BACK FAILED: % test rows left after the delete', n; end if;
  raise notice 'READ-BACK passed';
end $$;
