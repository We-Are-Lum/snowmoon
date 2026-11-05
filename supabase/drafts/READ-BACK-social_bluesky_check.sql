-- READ-BACK for NEXT_social_bluesky_check (branch bluesky-check), after its migration, as postgres in the Supabase SQL
-- Editor. Two parts, nothing is kept: (a) one read-only select whose rows must all be true; (b) one do block. The same
-- as blocks 5C and 5D of docs/legal/sql-pack-2026-11-04.md (branch sql-pack). DRAFT, by a coding agent (Anthropic's
-- Claude, a closed model); not applied.

-- Read-back (a): every row's ok must be true (11 rows). Read only.
select n, what, ok from (values
  (1, 'there is no studio.bluesky_checks: Bluesky decisions go to the shared store, studio.check_decisions',
    to_regclass('studio.bluesky_checks') is null and to_regclass('studio.check_decisions') is not null),
  (2, 'check_decisions takes a Bluesky account (its DID) under the rule ''age30d+5posts30d''',
    coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('studio.check_decisions') and conname = 'check_decisions_account_shape'), '') like '%bluesky%did:%'),
  (3, 'challenge_eligibility.account: text, not null, default ''farcaster''',
    exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'challenge_eligibility' and column_name = 'account'
      and data_type = 'text' and is_nullable = 'NO' and column_default like '''farcaster''%')),
  (4, 'challenge_eligibility.account is farcaster or bluesky, nothing else',
    coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('studio.challenge_eligibility') and conname = 'challenge_eligibility_account_check'), '') ~ 'farcaster.*bluesky'),
  (5, 'challenge_eligibility''s fid check takes FIDs and Bluesky accounts (at or below -1,000,000,000), not wallets',
    coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('studio.challenge_eligibility') and conname = 'challenge_eligibility_fid_check'), '') like '%fid > 0%fid <= ''-1000000000''%'),
  (6, 'challenge_eligibility: account farcaster exactly when the fid is a FID',
    coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('studio.challenge_eligibility') and conname = 'challenge_eligibility_account_matches'), '') like '%account = ''farcaster''%= (fid > 0)%'),
  (7, 'challenge_eligibility keeps 0033''s decision and eligible checks',
    (select count(*) from pg_constraint where conrelid = to_regclass('studio.challenge_eligibility') and conname in ('challenge_eligibility_decision_check', 'eligible_follows_decision')) = 2),
  (8, 'challenge_marks'' fid check takes FIDs and Bluesky accounts, not wallets',
    coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('studio.challenge_marks') and conname = 'challenge_marks_fid_check'), '') like '%fid > 0%fid <= ''-1000000000''%'),
  (9, 'every existing eligibility row is a Farcaster account''s',
    not exists (select 1 from studio.challenge_eligibility where account <> 'farcaster' or fid <= 0)),
  (10, 'studio_writer: select and insert on challenge_eligibility, no update, delete or truncate',
    has_table_privilege('studio_writer', 'studio.challenge_eligibility', 'SELECT') and has_table_privilege('studio_writer', 'studio.challenge_eligibility', 'INSERT')
    and not has_table_privilege('studio_writer', 'studio.challenge_eligibility', 'UPDATE') and not has_table_privilege('studio_writer', 'studio.challenge_eligibility', 'DELETE')
    and not has_table_privilege('studio_writer', 'studio.challenge_eligibility', 'TRUNCATE')),
  (11, 'anon and authenticated have nothing on challenge_eligibility, challenge_marks or check_decisions',
    not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['studio.challenge_eligibility', 'studio.challenge_marks', 'studio.check_decisions']) t,
      unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, t, p)))
) as t(n, what, ok) order by n;

-- Read-back (b): a Bluesky account's check decision, entry decision and mark go in as the site writes them, are read
-- back, bad rows are refused, and everything is deleted. It uses two existing versions that have no entry decision
-- yet; nothing about them changes. Ends with "READ-BACK PASSED", or stops with "READ-BACK FAILED: …"; either way
-- nothing is kept.
do $$
declare
  did constant text := 'did:plc:readbackbskycheckaaa2345';
  rule constant text := 'age30d+5posts30d';
  sky bigint;
  person bigint;
  v1 uuid;
  v2 uuid;
  n int;
  refused boolean;
begin
  select id into v1 from studio.element_versions x where not exists (select 1 from studio.challenge_eligibility e where e.version_id = x.id) order by id limit 1;
  select id into v2 from studio.element_versions x where not exists (select 1 from studio.challenge_eligibility e where e.version_id = x.id) and id <> v1 order by id limit 1;
  if v1 is null or v2 is null then raise exception 'READ-BACK FAILED: needs two versions with no entry decision to test on'; end if;

  -- The sign-in (NEXT_signin_lens_bluesky) and the check (NEXT_check_decisions), as the site writes them.
  insert into studio.social_accounts (kind, subject, handle) values ('bluesky', did, 'readback.bsky.social') returning id into sky;
  person := -(1000000000 + sky);
  insert into studio.check_decisions (network, account, threshold, passed) values ('bluesky', did, rule, true);

  -- Its entry decision, with account 'bluesky'; and a Farcaster row as today's site writes it (no account given).
  insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible, account) values (v1, 'remix-2026-11', person, 'passed', true, 'bluesky');
  insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible) values (v2, 'remix-2026-11', 2147483646, 'below', false);
  select count(*) into n from studio.challenge_eligibility
    where (version_id = v1 and fid = person and account = 'bluesky' and eligible) or (version_id = v2 and fid = 2147483646 and account = 'farcaster' and not eligible);
  if n <> 2 then raise exception 'READ-BACK FAILED: % of 2 entry decisions read back', n; end if;

  -- Its mark ("Mark as my entry" / Submit).
  insert into studio.challenge_marks (challenge, fid, character, version_id) values ('remix-2026-11', person, 'bai', v1);
  select count(*) into n from studio.challenge_marks where fid = person and version_id = v1;
  if n <> 1 then raise exception 'READ-BACK FAILED: the Bluesky account''s mark read back % rows', n; end if;

  -- Refused: a wallet account's number (minus its id) in either table; a FID marked as a Bluesky account; a Bluesky
  -- number marked as a Farcaster account; an account kind other than farcaster or bluesky.
  delete from studio.challenge_eligibility where version_id = v1;
  refused := false;
  begin insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible, account) values (v1, 'remix-2026-11', -5, 'passed', true, 'bluesky');
  exception when check_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: a wallet account''s number was accepted in challenge_eligibility'; end if;
  refused := false;
  begin insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible, account) values (v1, 'remix-2026-11', 2147483646, 'passed', true, 'bluesky');
  exception when check_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: a FID marked as a Bluesky account was accepted'; end if;
  refused := false;
  begin insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible) values (v1, 'remix-2026-11', person, 'passed', true);
  exception when check_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: a Bluesky account''s number was accepted as a Farcaster account'; end if;
  refused := false;
  begin insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible, account) values (v1, 'remix-2026-11', person, 'passed', true, 'x');
  exception when check_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: an account kind other than farcaster or bluesky was accepted'; end if;
  refused := false;
  begin insert into studio.challenge_marks (challenge, fid, character, version_id) values ('remix-2026-11', -5, 'bai', v1);
  exception when check_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: a wallet account''s number was accepted in challenge_marks'; end if;

  -- Everything goes.
  delete from studio.challenge_marks where fid = person;
  delete from studio.challenge_eligibility where version_id in (v1, v2) and fid in (person, 2147483646);
  delete from studio.check_decisions where network = 'bluesky' and account = did;
  delete from studio.social_accounts where id = sky;
  select (select count(*) from studio.challenge_marks where fid = person) + (select count(*) from studio.challenge_eligibility where version_id in (v1, v2))
    + (select count(*) from studio.check_decisions where account = did) + (select count(*) from studio.social_accounts where id = sky) into n;
  if n <> 0 then raise exception 'READ-BACK FAILED: % test rows left after the delete', n; end if;
  raise notice 'READ-BACK PASSED';
end $$;
