-- READ-BACK-deep_funding_jurors.sql — after supabase/migrations/NEXT_deep_funding_jurors.sql. Run as postgres in the
-- Supabase SQL Editor. Two statements; run each on its own (the SQL Editor runs each statement by itself, and postgres
-- there can't SET ROLE studio_writer, so studio_writer's rights are read from the catalogue, not tried).
--
-- (a) One read-only SELECT. Every row's `ok` must be true.
-- (b) One DO block: adds a realistic juror (as the owner does, as postgres) and two realistic answers (a comparison and an originality answer, on two
--     real published versions), reads them back, checks that malformed answers are refused, and deletes them. It
--     raises 'READ-BACK FAILED: …' if anything is off; if it finishes with no error, it passed. Its rows are deleted at
--     the end (and a failure rolls the whole block back).

-- (a) ---------------------------------------------------------------------------------------------------------------
select c.what, c.ok from (
  select 'deep_funding_jurors exists' as what, to_regclass('studio.deep_funding_jurors') is not null as ok
  union all select 'juror_answers exists', to_regclass('studio.juror_answers') is not null
  union all select 'deep_funding_jurors has RLS on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.deep_funding_jurors')), false)
  union all select 'juror_answers has RLS on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.juror_answers')), false)
  union all select 'studio_writer can select deep_funding_jurors', coalesce(has_table_privilege('studio_writer', to_regclass('studio.deep_funding_jurors'), 'SELECT'), false)
  union all select 'studio_writer cannot insert, update, delete or truncate deep_funding_jurors (the owner adds jurors)', coalesce(not (has_table_privilege('studio_writer', to_regclass('studio.deep_funding_jurors'), 'INSERT') or has_table_privilege('studio_writer', to_regclass('studio.deep_funding_jurors'), 'UPDATE') or has_table_privilege('studio_writer', to_regclass('studio.deep_funding_jurors'), 'DELETE') or has_table_privilege('studio_writer', to_regclass('studio.deep_funding_jurors'), 'TRUNCATE')), false)
  union all select 'studio_writer can select and insert juror_answers', coalesce(has_table_privilege('studio_writer', to_regclass('studio.juror_answers'), 'SELECT') and has_table_privilege('studio_writer', to_regclass('studio.juror_answers'), 'INSERT'), false)
  union all select 'studio_writer cannot update, delete or truncate juror_answers', coalesce(not (has_table_privilege('studio_writer', to_regclass('studio.juror_answers'), 'UPDATE') or has_table_privilege('studio_writer', to_regclass('studio.juror_answers'), 'DELETE') or has_table_privilege('studio_writer', to_regclass('studio.juror_answers'), 'TRUNCATE')), false)
  union all select 'anon and authenticated have no privilege on either', coalesce(not exists (
      select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['studio.deep_funding_jurors', 'studio.juror_answers']) t, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
      where to_regclass(t) is null or has_table_privilege(r, to_regclass(t), p)), false)
  union all select 'only studio_writer policies on either', not exists (
      select 1 from pg_policies where schemaname = 'studio' and tablename in ('deep_funding_jurors', 'juror_answers') and roles <> '{studio_writer}'::name[])
  union all select 'the expected policies exist (3)', (select count(*) from pg_policies where schemaname = 'studio' and tablename in ('deep_funding_jurors', 'juror_answers')) = 3
  union all select 'two published design versions exist to test with', (select count(*) from studio.element_versions v join studio.elements e on e.id = v.element_id where e.status = 'published' and e.element_type = 'design') >= 2
) c;

-- (b) ---------------------------------------------------------------------------------------------------------------
do $$
declare
  v1 uuid;
  v2 uuid;
  juror_id bigint;
  a1 bigint;
  a2 bigint;
  n int;
  refused boolean;
begin
  select v.id into v1 from studio.element_versions v join studio.elements e on e.id = v.element_id
    where e.status = 'published' and e.element_type = 'design' order by v.created_at, v.id limit 1;
  select v.id into v2 from studio.element_versions v join studio.elements e on e.id = v.element_id
    where e.status = 'published' and e.element_type = 'design' and v.id <> v1 order by v.created_at, v.id limit 1;
  if v1 is null or v2 is null then raise exception 'READ-BACK FAILED: two published design versions are needed to test with'; end if;

  -- A realistic juror: FID 500 for Bai, added by the owner (6786).
  insert into studio.deep_funding_jurors (challenge, character, fid, added_by) values ('remix-2026-11', 'bai', 500, 6786) returning id into juror_id;
  select count(*) into n from studio.deep_funding_jurors where id = juror_id and fid = 500 and character = 'bai' and added_by = 6786 and added_at > now() - interval '1 minute';
  if n <> 1 then raise exception 'READ-BACK FAILED: the juror did not read back'; end if;

  -- The same juror twice for the same character is refused.
  refused := false;
  begin
    insert into studio.deep_funding_jurors (challenge, character, fid, added_by) values ('remix-2026-11', 'bai', 500, 6786);
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a juror was added twice for one character'; end if;

  -- A realistic comparison: for the final (v1), v2 mattered more than v1, 2.5 times more.
  insert into studio.juror_answers (challenge, character, final_version_id, fid, question_no, kind, version_a, version_b, choice, times)
    values ('remix-2026-11', 'bai', v1, 500, 1, 'compare', v1, v2, 'b', 2.5) returning id into a1;
  -- A realistic originality answer: 35% of v2 is new.
  insert into studio.juror_answers (challenge, character, final_version_id, fid, question_no, kind, version_a, share)
    values ('remix-2026-11', 'bai', v1, 500, 5, 'originality', v2, 0.35) returning id into a2;
  select count(*) into n from studio.juror_answers where id in (a1, a2) and fid = 500
    and ((id = a1 and choice = 'b' and times = 2.50 and share is null) or (id = a2 and share = 0.350 and choice is null))
    and answered_at > now() - interval '1 minute';
  if n <> 2 then raise exception 'READ-BACK FAILED: the answers did not read back'; end if;

  -- Malformed answers are refused: a comparison of a version with itself, a share above 1, more than 100 times.
  refused := false;
  begin
    insert into studio.juror_answers (challenge, character, final_version_id, fid, question_no, kind, version_a, version_b, choice, times)
      values ('remix-2026-11', 'bai', v1, 500, 2, 'compare', v2, v2, 'a', 2);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a comparison of a version with itself was kept'; end if;
  refused := false;
  begin
    insert into studio.juror_answers (challenge, character, final_version_id, fid, question_no, kind, version_a, share)
      values ('remix-2026-11', 'bai', v1, 500, 6, 'originality', v2, 1.5);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a share above 1 was kept'; end if;
  refused := false;
  begin
    insert into studio.juror_answers (challenge, character, final_version_id, fid, question_no, kind, version_a, version_b, choice, times)
      values ('remix-2026-11', 'bai', v1, 500, 3, 'compare', v1, v2, 'a', 101);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: more than 100 times was kept'; end if;

  delete from studio.juror_answers where id in (a1, a2);
  delete from studio.deep_funding_jurors where id = juror_id;
  select (select count(*) from studio.juror_answers where id in (a1, a2)) + (select count(*) from studio.deep_funding_jurors where id = juror_id) into n;
  if n <> 0 then raise exception 'READ-BACK FAILED: the test rows were not deleted'; end if;
end $$;
