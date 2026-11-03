-- READ-BACK-sheet_help.sql — after supabase/migrations/NEXT_sheet_help.sql. Run as postgres in the Supabase SQL Editor.
-- Two statements; run each on its own (the SQL Editor runs each statement by itself, and postgres there can't SET ROLE
-- studio_writer, so studio_writer's rights are read from the catalogue, not tried).
--
-- (a) One read-only SELECT. Every row's `ok` must be true.
-- (b) One DO block: inserts a realistic message count row and a realistic day's cost row, as the site writes them,
--     reads them back, checks that bad rows are refused, and deletes them. It raises 'READ-BACK FAILED: …' if anything
--     is off; if it finishes with no error, it passed. A failure rolls the whole block back. Run it while "Ask for
--     help" is still switched off (SHEET_HELP.on), so no real row for today exists yet.

-- (a) ---------------------------------------------------------------------------------------------------------------
select c.what, c.ok from (
  select 'sheet_help_calls exists' as what, to_regclass('studio.sheet_help_calls') is not null as ok
  union all select 'sheet_help_costs exists', to_regclass('studio.sheet_help_costs') is not null
  union all select 'sheet_help_calls has RLS on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.sheet_help_calls')), false)
  union all select 'sheet_help_costs has RLS on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.sheet_help_costs')), false)
  union all select 'sheet_help_calls keeps only the FID and the time', coalesce((select array_agg(column_name::text order by column_name) from information_schema.columns where table_schema = 'studio' and table_name = 'sheet_help_calls') = array['at', 'fid'], false)
  union all select 'sheet_help_costs keeps no person', not exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'sheet_help_costs' and column_name in ('fid', 'person', 'request_id', 'at'))
  union all select 'studio_writer can select, insert and delete sheet_help_calls', coalesce(has_table_privilege('studio_writer', to_regclass('studio.sheet_help_calls'), 'SELECT') and has_table_privilege('studio_writer', to_regclass('studio.sheet_help_calls'), 'INSERT') and has_table_privilege('studio_writer', to_regclass('studio.sheet_help_calls'), 'DELETE'), false)
  union all select 'studio_writer cannot update or truncate sheet_help_calls', coalesce(not (has_table_privilege('studio_writer', to_regclass('studio.sheet_help_calls'), 'UPDATE') or has_table_privilege('studio_writer', to_regclass('studio.sheet_help_calls'), 'TRUNCATE')), false)
  union all select 'studio_writer can select, insert and update sheet_help_costs', coalesce(has_table_privilege('studio_writer', to_regclass('studio.sheet_help_costs'), 'SELECT') and has_table_privilege('studio_writer', to_regclass('studio.sheet_help_costs'), 'INSERT') and has_table_privilege('studio_writer', to_regclass('studio.sheet_help_costs'), 'UPDATE'), false)
  union all select 'studio_writer cannot delete or truncate sheet_help_costs', coalesce(not (has_table_privilege('studio_writer', to_regclass('studio.sheet_help_costs'), 'DELETE') or has_table_privilege('studio_writer', to_regclass('studio.sheet_help_costs'), 'TRUNCATE')), false)
  union all select 'anon and authenticated have no privilege on either', coalesce(not exists (
      select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['studio.sheet_help_calls', 'studio.sheet_help_costs']) t, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
      where to_regclass(t) is null or has_table_privilege(r, to_regclass(t), p)), false)
  union all select 'only studio_writer policies on either', not exists (
      select 1 from pg_policies where schemaname = 'studio' and tablename in ('sheet_help_calls', 'sheet_help_costs') and roles <> '{studio_writer}'::name[])
  union all select 'the expected policies exist (6)', (select count(*) from pg_policies where schemaname = 'studio' and tablename in ('sheet_help_calls', 'sheet_help_costs')) = 6
  union all select 'count rows can be deleted only when two days old', coalesce((select qual from pg_policies where schemaname = 'studio' and tablename = 'sheet_help_calls' and policyname = 'writer_delete_old') like '%2 days%', false)
) c;

-- (b) ---------------------------------------------------------------------------------------------------------------
do $$
declare
  n int;
  usd numeric;
  refused boolean;
  today date := (now() at time zone 'utc')::date;
begin
  if exists (select 1 from studio.sheet_help_costs where day = today) then
    raise exception 'READ-BACK FAILED: cost rows for today already exist; is "Ask for help" switched on?';
  end if;

  -- A realistic message count row, as reserveHelp writes it: FID 6786, now.
  insert into studio.sheet_help_calls (fid) values (6786);
  select count(*) into n from studio.sheet_help_calls where fid = 6786 and at > now() - interval '1 minute';
  if n <> 1 then raise exception 'READ-BACK FAILED: the count row did not read back (% rows)', n; end if;

  -- A realistic day's totals, as recordHelp writes them: one answer on Groq, then a second added to it.
  insert into studio.sheet_help_costs (kind, model, provider, guard, calls, prompt_tokens, completion_tokens, cost_usd)
    values ('answer', 'openai/gpt-oss-120b', 'groq', '', 1, 4012, 388, 0.00083460);
  insert into studio.sheet_help_costs (kind, model, provider, guard, calls, prompt_tokens, completion_tokens, cost_usd)
    values ('answer', 'openai/gpt-oss-120b', 'groq', '', 1, 3870, 402, 0.00082170)
    on conflict (day, kind, model, provider, guard) do update set
      calls = studio.sheet_help_costs.calls + 1,
      prompt_tokens = studio.sheet_help_costs.prompt_tokens + excluded.prompt_tokens,
      completion_tokens = studio.sheet_help_costs.completion_tokens + excluded.completion_tokens,
      cost_usd = studio.sheet_help_costs.cost_usd + excluded.cost_usd;
  insert into studio.sheet_help_costs (kind, model, provider, guard, calls, prompt_tokens, completion_tokens, cost_usd)
    values ('guard', 'openai/gpt-oss-safeguard-20b', 'groq', 'ok', 1, 1290, 61, 0.00011505);
  select coalesce(sum(cost_usd), 0), coalesce(sum(calls), 0) into usd, n from studio.sheet_help_costs where day = today;
  if n <> 3 or usd <> 0.00177135 then raise exception 'READ-BACK FAILED: the day''s totals read back as % calls, $%', n, usd; end if;

  -- Bad rows are refused: FID 0, a wallet number (sheets are made by FIDs), a kind it never records, a negative cost.
  refused := false;
  begin insert into studio.sheet_help_calls (fid) values (0); exception when check_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: a count row with FID 0 was kept'; end if;
  refused := false;
  begin insert into studio.sheet_help_calls (fid) values (-12); exception when check_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: a count row with a wallet number was kept'; end if;
  refused := false;
  begin insert into studio.sheet_help_costs (kind, model) values ('search', 'openai/gpt-oss-120b'); exception when check_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: a cost row of another kind was kept'; end if;
  refused := false;
  begin insert into studio.sheet_help_costs (kind, model, provider, cost_usd) values ('guard', 'openai/gpt-oss-safeguard-20b', 'gateway', -1); exception when check_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: a negative cost was kept'; end if;

  delete from studio.sheet_help_calls where fid = 6786 and at > now() - interval '1 minute';
  delete from studio.sheet_help_costs where day = today;
  select count(*) into n from studio.sheet_help_calls where fid = 6786 and at > now() - interval '1 minute';
  if n <> 0 then raise exception 'READ-BACK FAILED: the test count row was left behind'; end if;
  select count(*) into n from studio.sheet_help_costs where day = today;
  if n <> 0 then raise exception 'READ-BACK FAILED: the test cost rows were left behind'; end if;
  raise notice 'READ-BACK PASSED: a count row and a day''s cost totals inserted, read back, bad rows refused, all deleted';
end $$;
