-- Read-back for 0039_social_lens_challenge (branch contest), after its migration, as postgres. Nothing is kept.
-- C. READ-BACK (after B), as postgres. Two parts, nothing is kept.

-- (a) one read-only select: every row's ok must be true (3 rows).
select n, what, ok from (values
  (1, 'challenge_eligibility.account is farcaster, bluesky or lens, nothing else',
    coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('studio.challenge_eligibility') and conname = 'challenge_eligibility_account_check'), '') ~ 'farcaster.*bluesky.*lens'),
  (2, 'challenge_eligibility: account farcaster exactly when the fid is a FID (kept)',
    coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('studio.challenge_eligibility') and conname = 'challenge_eligibility_account_matches'), '') like '%account = ''farcaster''%= (fid > 0)%'),
  (3, 'anon and authenticated have nothing on challenge_eligibility',
    not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, 'studio.challenge_eligibility', p)))
) as t(n, what, ok) order by n;

-- (b) one do block: a made-up Lens account's decision goes in as the site writes it, is read back, bad rows are refused,
-- and everything is deleted. Ends with "READ-BACK PASSED", or stops with "READ-BACK FAILED: …".
do $$
declare
  lens_addr constant text := '0x0000000000000000000000000000000000c0de03';
  acc bigint;
  person bigint;
  v1 uuid;
  n int;
  refused boolean;
begin
  select id into v1 from studio.element_versions x where not exists (select 1 from studio.challenge_eligibility e where e.version_id = x.id) order by id limit 1;
  if v1 is null then raise exception 'READ-BACK FAILED: needs a version with no entry decision to test on'; end if;
  insert into studio.social_accounts (kind, subject, handle) values ('lens', lens_addr, 'lens/readback') returning id into acc;
  person := -(1000000000 + acc);
  insert into studio.check_decisions (network, account, threshold, passed) values ('lens', lens_addr, 'lens-score>=1000', true);
  insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible, account) values (v1, 'remix-2026-11', person, 'passed', true, 'lens');
  select count(*) into n from studio.challenge_eligibility where version_id = v1 and fid = person and account = 'lens' and eligible;
  if n <> 1 then raise exception 'READ-BACK FAILED: the Lens decision read back % rows', n; end if;
  delete from studio.challenge_eligibility where version_id = v1;
  refused := false;
  begin insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible, account) values (v1, 'remix-2026-11', 2147483646, 'passed', true, 'lens');
  exception when check_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: a FID marked as a Lens account was accepted'; end if;
  refused := false;
  begin insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible, account) values (v1, 'remix-2026-11', person, 'passed', true, 'x');
  exception when check_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: an account kind other than farcaster, bluesky or lens was accepted'; end if;
  delete from studio.check_decisions where network = 'lens' and account = lens_addr;
  delete from studio.social_accounts where id = acc;
  select (select count(*) from studio.challenge_eligibility where version_id = v1) + (select count(*) from studio.check_decisions where account = lens_addr)
    + (select count(*) from studio.social_accounts where id = acc) into n;
  if n <> 0 then raise exception 'READ-BACK FAILED: % test rows left after the delete', n; end if;
  raise notice 'READ-BACK PASSED';
end $$;
