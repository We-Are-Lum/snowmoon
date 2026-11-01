-- READ-BACK-remix_challenge.sql — after supabase/migrations/NEXT_remix_challenge.sql. Run as postgres in the Supabase
-- SQL Editor. Two statements; run each on its own (the SQL Editor runs each statement by itself, and postgres there
-- can't SET ROLE studio_writer, so studio_writer's rights are read from the catalogue, not tried).
--
-- (a) One read-only SELECT. Every row's `ok` must be true.
-- (b) One DO block: inserts a realistic eligibility decision, mark and posts (on a real version), reads them back,
--     checks that bad rows are refused, and deletes them. It raises 'READ-BACK FAILED: …' if anything is off; if it finishes with
--     no error, it passed. Its rows are deleted at the end (and a failure rolls the whole block back).

-- (a) ---------------------------------------------------------------------------------------------------------------
select c.what, c.ok from (
  select 'challenge_marks exists' as what, to_regclass('studio.challenge_marks') is not null as ok
  union all select 'version_posts exists', to_regclass('studio.version_posts') is not null
  union all select 'challenge_eligibility exists', to_regclass('studio.challenge_eligibility') is not null
  union all select 'challenge_eligibility has RLS on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.challenge_eligibility')), false)
  union all select 'studio_writer can select and insert challenge_eligibility', coalesce(has_table_privilege('studio_writer', to_regclass('studio.challenge_eligibility'), 'SELECT') and has_table_privilege('studio_writer', to_regclass('studio.challenge_eligibility'), 'INSERT'), false)
  union all select 'studio_writer cannot update, delete or truncate challenge_eligibility', coalesce(not (has_table_privilege('studio_writer', to_regclass('studio.challenge_eligibility'), 'UPDATE') or has_table_privilege('studio_writer', to_regclass('studio.challenge_eligibility'), 'DELETE') or has_table_privilege('studio_writer', to_regclass('studio.challenge_eligibility'), 'TRUNCATE')), false)
  union all select 'challenge_marks has RLS on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.challenge_marks')), false)
  union all select 'version_posts has RLS on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.version_posts')), false)
  union all select 'studio_writer can select and insert challenge_marks', coalesce(has_table_privilege('studio_writer', to_regclass('studio.challenge_marks'), 'SELECT') and has_table_privilege('studio_writer', to_regclass('studio.challenge_marks'), 'INSERT'), false)
  union all select 'studio_writer cannot update, delete or truncate challenge_marks', coalesce(not (has_table_privilege('studio_writer', to_regclass('studio.challenge_marks'), 'UPDATE') or has_table_privilege('studio_writer', to_regclass('studio.challenge_marks'), 'DELETE') or has_table_privilege('studio_writer', to_regclass('studio.challenge_marks'), 'TRUNCATE')), false)
  union all select 'studio_writer can select, insert and delete version_posts', coalesce(has_table_privilege('studio_writer', to_regclass('studio.version_posts'), 'SELECT') and has_table_privilege('studio_writer', to_regclass('studio.version_posts'), 'INSERT') and has_table_privilege('studio_writer', to_regclass('studio.version_posts'), 'DELETE'), false)
  union all select 'studio_writer cannot update or truncate version_posts', coalesce(not (has_table_privilege('studio_writer', to_regclass('studio.version_posts'), 'UPDATE') or has_table_privilege('studio_writer', to_regclass('studio.version_posts'), 'TRUNCATE')), false)
  union all select 'anon and authenticated have no privilege on either', coalesce(not exists (
      select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['studio.challenge_marks', 'studio.version_posts', 'studio.challenge_eligibility']) t, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
      where to_regclass(t) is null or has_table_privilege(r, to_regclass(t), p)), false)
  union all select 'only studio_writer policies on either', not exists (
      select 1 from pg_policies where schemaname = 'studio' and tablename in ('challenge_marks', 'version_posts', 'challenge_eligibility') and roles <> '{studio_writer}'::name[])
  union all select 'the expected policies exist (7)', (select count(*) from pg_policies where schemaname = 'studio' and tablename in ('challenge_marks', 'version_posts', 'challenge_eligibility')) = 7
  union all select 'a published version exists to test with', exists (select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id where e.status = 'published')
) c;

-- (b) ---------------------------------------------------------------------------------------------------------------
do $$
declare
  v uuid;
  mark_id bigint;
  post_id bigint;
  n int;
  refused boolean;
begin
  select v0.id into v from studio.element_versions v0 join studio.elements e on e.id = v0.element_id
    where e.status = 'published' and not exists (select 1 from studio.challenge_eligibility x where x.version_id = v0.id) order by v0.created_at limit 1;
  if v is null then raise exception 'READ-BACK FAILED: no published version to test with'; end if;

  -- A decision that contradicts itself (a score below the threshold marked eligible) is refused.
  refused := false;
  begin
    insert into studio.challenge_eligibility (version_id, challenge, fid, decision, score, eligible) values (v, 'remix-2026-11', 500, 'below', 0.42, true);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a contradictory eligibility decision was kept'; end if;

  -- A realistic eligibility decision, as the publish route stores it: FID 500, Neynar score 0.81 at publish.
  insert into studio.challenge_eligibility (version_id, challenge, fid, decision, score, eligible) values (v, 'remix-2026-11', 500, 'score', 0.81, true);
  select count(*) into n from studio.challenge_eligibility where version_id = v and fid = 500 and decision = 'score' and score = 0.81 and eligible and checked_at > now() - interval '1 minute';
  if n <> 1 then raise exception 'READ-BACK FAILED: the eligibility decision did not read back'; end if;

  -- A realistic mark: FID 6786 marks this version as their Zei entry.
  insert into studio.challenge_marks (challenge, fid, character, version_id) values ('remix-2026-11', 6786, 'zei', v) returning id into mark_id;
  select count(*) into n from studio.challenge_marks where id = mark_id and fid = 6786 and character = 'zei' and version_id = v and marked_at > now() - interval '1 minute';
  if n <> 1 then raise exception 'READ-BACK FAILED: the mark did not read back'; end if;

  -- A realistic post on each network.
  insert into studio.version_posts (version_id, network, post_id, handle, posted_at, url, fid)
    values (v, 'farcaster', '0x0a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 'naaate', now() - interval '1 hour', 'https://farcaster.xyz/naaate/0x0a1b2c3d', 6786) returning id into post_id;
  insert into studio.version_posts (version_id, network, post_id, handle, posted_at, url, fid)
    values (v, 'bluesky', 'at://did:plc:abcdefghijklmnopqrstuvwx/app.bsky.feed.post/3mz6hon3w6c2h', 'someone.bsky.social', now() - interval '2 hours', 'https://bsky.app/profile/did:plc:abcdefghijklmnopqrstuvwx/post/3mz6hon3w6c2h', -12);
  insert into studio.version_posts (version_id, network, post_id, handle, posted_at, url, fid)
    values (v, 'lens', '25371949111464640548176823129788244947682797056317189597818095179944227075316', 'someone', now() - interval '3 hours', 'https://hey.xyz/posts/1q4tkta5f47sz8032wm', 6786);
  select count(*) into n from studio.version_posts where version_id = v and fid in (6786, -12) and added_at > now() - interval '1 minute';
  if n <> 3 then raise exception 'READ-BACK FAILED: % of 3 posts read back', n; end if;

  -- The same post twice on one version is refused.
  refused := false;
  begin
    insert into studio.version_posts (version_id, network, post_id, handle, posted_at, url, fid)
      values (v, 'farcaster', '0x0a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 'naaate', now(), 'https://farcaster.xyz/naaate/0x0a1b2c3d', 6786);
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: the same post was kept twice'; end if;

  -- An address that isn't the network's own post address is refused.
  refused := false;
  begin
    insert into studio.version_posts (version_id, network, post_id, handle, posted_at, url, fid)
      values (v, 'farcaster', '0xffff', 'naaate', now(), 'https://evil.example/naaate/0x0a1b2c3d', 6786);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a post address on another host was kept'; end if;

  -- A mark with a wallet number (not a FID) is refused.
  refused := false;
  begin
    insert into studio.challenge_marks (challenge, fid, character, version_id) values ('remix-2026-11', -12, 'bai', v);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a mark without a FID was kept'; end if;

  delete from studio.version_posts where version_id = v and fid in (6786, -12) and added_at > now() - interval '1 minute';
  delete from studio.challenge_eligibility where version_id = v and fid = 500 and checked_at > now() - interval '1 minute';
  select count(*) into n from studio.challenge_eligibility where version_id = v and fid = 500;
  if n <> 0 then raise exception 'READ-BACK FAILED: the test eligibility decision was left behind'; end if;
  delete from studio.challenge_marks where id = mark_id;
  select count(*) into n from studio.version_posts where version_id = v and added_at > now() - interval '1 minute';
  if n <> 0 then raise exception 'READ-BACK FAILED: test posts left behind'; end if;
  select count(*) into n from studio.challenge_marks where id = mark_id;
  if n <> 0 then raise exception 'READ-BACK FAILED: the test mark was left behind'; end if;
  raise notice 'READ-BACK PASSED: an eligibility decision, a mark and three posts inserted, read back, bad rows refused, all deleted';
end $$;
