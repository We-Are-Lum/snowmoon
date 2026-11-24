-- NEXT_voice_three_ways.sql: three ways in (Nate, 2026-11-24, branch voice-three-ways; docs/branch-reports/voice-three-ways.md).
-- Not numbered until merge: it takes the next free number then, checked against origin/main and production. NOT APPLIED
-- until Nate applies it; the branch merges only after he says "applied". Drafted by the coding agent (Claude, a closed
-- model by Anthropic); tested in PGlite by the agent (npm run test:voice, every migration in order). Requires
-- 0046_ephelion_voice_publish.sql and 0049_storyboard_guide.sql (both applied).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (ending in `rollback;`), B. the migration (ending in `commit;`), C. the read-back (a realistic draft,
-- boards and a timing message made, read and removed inside a transaction that ends in `rollback;`; it ends "READ-BACK
-- PASSED"; studio_writer's rights are read by definition, as the SQL Editor can't SET ROLE), and D. the undo, only if
-- the release is withdrawn. Safe to run twice.
--
-- What it changes. Nothing is readable by anon or authenticated; studio_writer's table rights are unchanged.
-- 1. studio.voice_boards.source: on a storyboard that reuses another (your voice over an existing storyboard), where it
--    came from: its kind ('team' or 'published'), its draft and maker, the version reused, the publication if any, the
--    maker's name as shown and its title. Null on every other board. Each version of a reused board carries it.
-- 2. studio.voice_guide_messages.step may be 'timing': the guide proposes making one shot longer or shorter, and the
--    person accepts it (the guide never writes words).
-- 3. studio.publish_voice_board, replaced: someone may publish their own storyboard on another person's take only while
--    that take's performer has their own storyboard of it published, live and named (new pictures for an existing
--    recording, credited to its performer). Only the performer's own publishing marks their take published.
-- 4. studio.take_down_voice_publication, replaced: taking down one's own storyboard on another person's take leaves that
--    take as it is (only the performer's own take-down clears their take's published mark).

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
alter table studio.voice_boards add column if not exists source jsonb;
alter table studio.voice_boards drop constraint if exists voice_boards_source_check;
alter table studio.voice_boards add constraint voice_boards_source_check check (
  source is null or (
    jsonb_typeof(source) = 'object'
    and coalesce(source ->> 'kind' in ('team', 'published'), false)
    and coalesce((source ->> 'draftId') ~ '^[0-9a-f-]{36}$', false)
    and coalesce(jsonb_typeof(source -> 'fid') = 'number', false)
    and coalesce(jsonb_typeof(source -> 'version') = 'number', false)
  )
);
alter table studio.voice_guide_messages drop constraint if exists voice_guide_messages_step_check;
alter table studio.voice_guide_messages add constraint voice_guide_messages_step_check check (step in ('setting', 'clothing', 'plan', 'shot', 'fix', 'timing'));
create or replace function studio.publish_voice_board(p_id uuid, p_draft uuid, p_fid bigint, p_version int, p_named boolean, p_recipe jsonb, p_files jsonb) returns uuid
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare k text; owner bigint;
begin
  select kind, fid into k, owner from studio.voice_drafts where id = p_draft for update;
  if k is null or (k = 'performance' and not (
       (owner = p_fid and exists (select 1 from studio.voice_drafts where id = p_draft and published_at is null))
       or (owner <> p_fid and exists (select 1 from studio.voice_publications where draft_id = p_draft and fid = owner and taken_down_at is null and named)))) then
    raise exception 'not a draft this person can publish a board of' using errcode = 'P0002';
  end if;
  if not exists (select 1 from studio.voice_boards where draft_id = p_draft and fid = p_fid and version = p_version
                 and version = (select max(version) from studio.voice_boards where draft_id = p_draft and fid = p_fid)) then
    raise exception 'not the latest storyboard' using errcode = 'P0002';
  end if;
  if exists (select 1 from studio.voice_publications where draft_id = p_draft and fid = p_fid and taken_down_at is null) then
    raise exception 'already published' using errcode = 'P0002';
  end if;
  if exists (select 1 from jsonb_array_elements(p_files) f where not (f->>'key' like 'storyboards/' || p_id::text || '/%' and f->>'key' ~ '^storyboards/[0-9a-f-]{36}/[a-z0-9-]{1,40}-[0-9a-f]{64}\.(mp3|png|jpg)$' and f->>'sha256' ~ '^[0-9a-f]{64}$')) then
    raise exception 'a file is not under this publication' using errcode = '22023';
  end if;
  insert into studio.voice_publications (id, draft_id, fid, board_version, named, recipe, files) values (p_id, p_draft, p_fid, p_version, p_named, p_recipe, p_files);
  -- The performer's own take is then published (they can't remove it while public); someone else's board on it, or a
  -- shared reading, changes nothing of the take.
  if k = 'performance' and owner = p_fid then update studio.voice_drafts set published_at = now() where id = p_draft; end if;
  return p_id;
end $fn$;
revoke all on function studio.publish_voice_board(uuid, uuid, bigint, int, boolean, jsonb, jsonb) from public, anon, authenticated;
grant execute on function studio.publish_voice_board(uuid, uuid, bigint, int, boolean, jsonb, jsonb) to studio_writer;
create or replace function studio.take_down_voice_publication(p_id uuid, p_fid bigint) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare d uuid;
begin
  update studio.voice_publications set taken_down_at = now() where id = p_id and fid = p_fid and taken_down_at is null returning draft_id into d;
  if d is null then return; end if;
  update studio.voice_drafts set published_at = null where id = d and kind = 'performance' and fid = p_fid;
  return query select f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = p_id;
end $fn$;
revoke all on function studio.take_down_voice_publication(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.take_down_voice_publication(uuid, bigint) to studio_writer;
rollback;

-- B. MIGRATION. Expect COMMIT.
begin;
alter table studio.voice_boards add column if not exists source jsonb;
alter table studio.voice_boards drop constraint if exists voice_boards_source_check;
alter table studio.voice_boards add constraint voice_boards_source_check check (
  source is null or (
    jsonb_typeof(source) = 'object'
    and coalesce(source ->> 'kind' in ('team', 'published'), false)
    and coalesce((source ->> 'draftId') ~ '^[0-9a-f-]{36}$', false)
    and coalesce(jsonb_typeof(source -> 'fid') = 'number', false)
    and coalesce(jsonb_typeof(source -> 'version') = 'number', false)
  )
);
alter table studio.voice_guide_messages drop constraint if exists voice_guide_messages_step_check;
alter table studio.voice_guide_messages add constraint voice_guide_messages_step_check check (step in ('setting', 'clothing', 'plan', 'shot', 'fix', 'timing'));
create or replace function studio.publish_voice_board(p_id uuid, p_draft uuid, p_fid bigint, p_version int, p_named boolean, p_recipe jsonb, p_files jsonb) returns uuid
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare k text; owner bigint;
begin
  select kind, fid into k, owner from studio.voice_drafts where id = p_draft for update;
  if k is null or (k = 'performance' and not (
       (owner = p_fid and exists (select 1 from studio.voice_drafts where id = p_draft and published_at is null))
       or (owner <> p_fid and exists (select 1 from studio.voice_publications where draft_id = p_draft and fid = owner and taken_down_at is null and named)))) then
    raise exception 'not a draft this person can publish a board of' using errcode = 'P0002';
  end if;
  if not exists (select 1 from studio.voice_boards where draft_id = p_draft and fid = p_fid and version = p_version
                 and version = (select max(version) from studio.voice_boards where draft_id = p_draft and fid = p_fid)) then
    raise exception 'not the latest storyboard' using errcode = 'P0002';
  end if;
  if exists (select 1 from studio.voice_publications where draft_id = p_draft and fid = p_fid and taken_down_at is null) then
    raise exception 'already published' using errcode = 'P0002';
  end if;
  if exists (select 1 from jsonb_array_elements(p_files) f where not (f->>'key' like 'storyboards/' || p_id::text || '/%' and f->>'key' ~ '^storyboards/[0-9a-f-]{36}/[a-z0-9-]{1,40}-[0-9a-f]{64}\.(mp3|png|jpg)$' and f->>'sha256' ~ '^[0-9a-f]{64}$')) then
    raise exception 'a file is not under this publication' using errcode = '22023';
  end if;
  insert into studio.voice_publications (id, draft_id, fid, board_version, named, recipe, files) values (p_id, p_draft, p_fid, p_version, p_named, p_recipe, p_files);
  -- The performer's own take is then published (they can't remove it while public); someone else's board on it, or a
  -- shared reading, changes nothing of the take.
  if k = 'performance' and owner = p_fid then update studio.voice_drafts set published_at = now() where id = p_draft; end if;
  return p_id;
end $fn$;
revoke all on function studio.publish_voice_board(uuid, uuid, bigint, int, boolean, jsonb, jsonb) from public, anon, authenticated;
grant execute on function studio.publish_voice_board(uuid, uuid, bigint, int, boolean, jsonb, jsonb) to studio_writer;
create or replace function studio.take_down_voice_publication(p_id uuid, p_fid bigint) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare d uuid;
begin
  update studio.voice_publications set taken_down_at = now() where id = p_id and fid = p_fid and taken_down_at is null returning draft_id into d;
  if d is null then return; end if;
  update studio.voice_drafts set published_at = null where id = d and kind = 'performance' and fid = p_fid;
  return query select f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = p_id;
end $fn$;
revoke all on function studio.take_down_voice_publication(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.take_down_voice_publication(uuid, bigint) to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Expect "READ-BACK PASSED".
begin;
do $$
declare d uuid; t uuid; p uuid; q uuid; n int;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'voice_boards' and column_name = 'source' and data_type = 'jsonb') then
    raise exception 'studio.voice_boards.source is missing'; end if;
  if not has_table_privilege('studio_writer', 'studio.voice_boards', 'insert') or not has_table_privilege('studio_writer', 'studio.voice_boards', 'select') then raise exception 'studio_writer lost a right on voice_boards'; end if;
  if has_table_privilege('studio_writer', 'studio.voice_boards', 'update') or has_table_privilege('studio_writer', 'studio.voice_boards', 'delete') then raise exception 'studio_writer can change or delete a board'; end if;
  if has_table_privilege('anon', 'studio.voice_boards', 'select') or has_table_privilege('authenticated', 'studio.voice_boards', 'select') then raise exception 'anon or authenticated can read boards'; end if;
  if not has_function_privilege('studio_writer', 'studio.publish_voice_board(uuid, uuid, bigint, int, boolean, jsonb, jsonb)', 'execute') or has_function_privilege('anon', 'studio.publish_voice_board(uuid, uuid, bigint, int, boolean, jsonb, jsonb)', 'execute') then raise exception 'publish_voice_board rights changed'; end if;
  if not has_function_privilege('studio_writer', 'studio.take_down_voice_publication(uuid, bigint)', 'execute') or has_function_privilege('anon', 'studio.take_down_voice_publication(uuid, bigint)', 'execute') then raise exception 'take_down_voice_publication rights changed'; end if;

  -- A performer's take (Nate) with his own storyboard, published and named; then someone else's take (Garance's).
  insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (6786, 'performance', 'ephelion-c13-b64', 'ephelion-warm-lecturer',
    jsonb_build_object('provider', 'ElevenLabs', 'model', 'eleven_multilingual_sts_v2', 'takes', jsonb_build_array(jsonb_build_object('role', 'take', 'takeSha256', repeat('a', 64), 'convertedSha256', repeat('e', 64))))) returning id into d;
  insert into studio.voice_boards (draft_id, fid, version, cuts, shots) values (d, 6786, 1, '[8.2]', '[{"key":"s1","start":0,"end":8.2,"description":"He looks up.","angle":"wide","styleId":null,"characterIds":[],"kept":null},{"key":"s2","start":8.2,"end":16,"description":"Close on his hands.","angle":"close","styleId":null,"characterIds":[],"kept":null}]');
  p := gen_random_uuid();
  perform studio.publish_voice_board(p, d, 6786, 1, true, '{"voice":{},"shots":[],"closing":{}}', jsonb_build_array(jsonb_build_object('key', 'storyboards/' || p || '/audio-0-' || repeat('1', 64) || '.mp3', 'sha256', repeat('1', 64)), jsonb_build_object('key', 'storyboards/' || p || '/s1-' || repeat('2', 64) || '.png', 'sha256', repeat('2', 64))));
  if (select published_at from studio.voice_drafts where id = d) is null then raise exception 'the performer''s own publishing did not mark the take'; end if;
  -- Garance's new pictures for Nate's published take: her own board on his take, published; his take is unchanged.
  insert into studio.voice_boards (draft_id, fid, version, cuts, shots) values (d, 193912, 1, '[6.1]', '[{"key":"s1","start":0,"end":6.1,"description":"A harbour at dawn.","angle":"wide","styleId":null,"characterIds":[],"kept":null},{"key":"s2","start":6.1,"end":16,"description":"A lectern.","angle":"medium","styleId":null,"characterIds":[],"kept":null}]');
  q := gen_random_uuid();
  perform studio.publish_voice_board(q, d, 193912, 1, true, '{"voice":{},"shots":[],"closing":{}}', jsonb_build_array(jsonb_build_object('key', 'storyboards/' || q || '/audio-0-' || repeat('1', 64) || '.mp3', 'sha256', repeat('1', 64)), jsonb_build_object('key', 'storyboards/' || q || '/s1-' || repeat('3', 64) || '.png', 'sha256', repeat('3', 64))));
  perform * from studio.take_down_voice_publication(q, 193912);
  if (select published_at from studio.voice_drafts where id = d) is null then raise exception 'taking down someone else''s board unmarked the performer''s take'; end if;
  -- Once the performer takes his down, no one else may publish on his take.
  perform * from studio.take_down_voice_publication(p, 6786);
  if (select published_at from studio.voice_drafts where id = d) is not null then raise exception 'the performer''s take-down did not clear his take'; end if;
  begin
    perform studio.publish_voice_board(gen_random_uuid(), d, 193912, 1, true, '{"voice":{},"shots":[],"closing":{}}', '[]');
    raise exception 'someone published on a take that is no longer published';
  exception when sqlstate 'P0002' then null; end;

  -- Garance's voice over Nate's storyboard: her own take, a board that carries its source.
  insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (193912, 'performance', 'ephelion-c13-b64', 'ephelion-warm-lecturer',
    jsonb_build_object('provider', 'ElevenLabs', 'model', 'eleven_multilingual_sts_v2', 'takes', jsonb_build_array(jsonb_build_object('role', 'take', 'takeSha256', repeat('b', 64), 'convertedSha256', repeat('f', 64))))) returning id into t;
  insert into studio.voice_boards (draft_id, fid, version, cuts, shots, source) values (t, 193912, 1, '[7.4]', '[]',
    jsonb_build_object('kind', 'team', 'draftId', d, 'fid', 6786, 'version', 1, 'publicationId', null, 'by', 'naaate', 'title', 'The Dead Hand of Egalitarianism, and the Path of Strength'));
  if (select source ->> 'by' from studio.voice_boards where draft_id = t and version = 1) <> 'naaate' then raise exception 'the source did not read back'; end if;
  begin insert into studio.voice_boards (draft_id, fid, version, cuts, shots, source) values (t, 193912, 2, '[]', '[]', '{"kind":"elsewhere","draftId":"x"}'); raise exception 'a source of an unknown kind was accepted'; exception when check_violation then null; end;
  begin insert into studio.voice_boards (draft_id, fid, version, cuts, shots, source) values (t, 193912, 2, '[]', '[]', '"a string"'); raise exception 'a non-object source was accepted'; exception when check_violation then null; end;
  -- The guide's timing step.
  insert into studio.voice_guide_messages (draft_id, fid, n, role, step, text) values (t, 193912, 1, 'person', 'timing', 'Make shot 2 longer.');
  insert into studio.voice_guide_messages (draft_id, fid, n, role, step, text, draft, model, cost_usd) values (t, 193912, 2, 'guide', 'timing', 'Shot 2 longer, by about 1.5 seconds.', '{"timing":{"shot":2,"change":"longer","seconds":1.5}}', 'openai/gpt-oss-120b', 0.0002);
  begin insert into studio.voice_guide_messages (draft_id, fid, n, role, step, text) values (t, 193912, 3, 'person', 'elsewhere', 'x'); raise exception 'an unknown step was accepted'; exception when check_violation then null; end;
  select count(*) into n from studio.voice_guide_messages where draft_id = t;
  if n <> 2 then raise exception 'expected 2 timing messages, found %', n; end if;

  -- Removed again, as the site removes them (0049's delete functions, unchanged), then the publications as postgres.
  perform * from studio.delete_voice_draft(t, 193912);
  if exists (select 1 from studio.voice_drafts where id = t) or exists (select 1 from studio.voice_guide_messages where draft_id = t) then raise exception 'the reused board''s draft was not removed'; end if;
  perform * from studio.delete_voice_board(d, 193912);
  perform * from studio.delete_voice_draft(d, 6786);
  delete from studio.voice_publications where draft_id = d;
  delete from studio.voice_boards where draft_id = d;
  delete from studio.voice_drafts where id = d;
  if exists (select 1 from studio.voice_drafts where id in (d, t)) then raise exception 'the read-back rows were not removed'; end if;
  raise notice 'READ-BACK PASSED';
end $$;
rollback;

-- D. UNDO (only if the release is withdrawn), as postgres. Paste the lines below without their "-- ". It refuses once
--    any board carries a source or any timing message exists (export and ask the owner first); otherwise it puts back
--    0046's two functions word for word, the guide's five steps (0049) and drops the column.
-- begin;
-- do $$ begin
--   if exists (select 1 from studio.voice_boards where source is not null) then raise exception 'UNDO REFUSED: reused storyboards exist; nothing is changed'; end if;
--   if exists (select 1 from studio.voice_guide_messages where step = 'timing') then raise exception 'UNDO REFUSED: timing messages exist; nothing is changed'; end if;
--   if exists (select 1 from studio.voice_publications p join studio.voice_drafts d on d.id = p.draft_id where d.kind = 'performance' and p.fid <> d.fid) then raise exception 'UNDO REFUSED: storyboards on others'' takes exist; nothing is changed'; end if;
-- end $$;
-- create or replace function studio.publish_voice_board(p_id uuid, p_draft uuid, p_fid bigint, p_version int, p_named boolean, p_recipe jsonb, p_files jsonb) returns uuid
-- language plpgsql security definer set search_path = studio, pg_temp as $fn$
-- declare k text;
-- begin
--   select kind into k from studio.voice_drafts where id = p_draft for update;
--   if k is null or (k = 'performance' and not exists (select 1 from studio.voice_drafts where id = p_draft and fid = p_fid and published_at is null)) then
--     raise exception 'not a draft this person can publish a board of' using errcode = 'P0002';
--   end if;
--   if not exists (select 1 from studio.voice_boards where draft_id = p_draft and fid = p_fid and version = p_version
--                  and version = (select max(version) from studio.voice_boards where draft_id = p_draft and fid = p_fid)) then
--     raise exception 'not the latest storyboard' using errcode = 'P0002';
--   end if;
--   if exists (select 1 from studio.voice_publications where draft_id = p_draft and fid = p_fid and taken_down_at is null) then
--     raise exception 'already published' using errcode = 'P0002';
--   end if;
--   if exists (select 1 from jsonb_array_elements(p_files) f where not (f->>'key' like 'storyboards/' || p_id::text || '/%' and f->>'key' ~ '^storyboards/[0-9a-f-]{36}/[a-z0-9-]{1,40}-[0-9a-f]{64}\.(mp3|png|jpg)$' and f->>'sha256' ~ '^[0-9a-f]{64}$')) then
--     raise exception 'a file is not under this publication' using errcode = '22023';
--   end if;
--   insert into studio.voice_publications (id, draft_id, fid, board_version, named, recipe, files) values (p_id, p_draft, p_fid, p_version, p_named, p_recipe, p_files);
--   -- A performance is then published (its person can't remove it while public); a shared reading isn't changed.
--   if k = 'performance' then update studio.voice_drafts set published_at = now() where id = p_draft; end if;
--   return p_id;
-- end $fn$;
-- revoke all on function studio.publish_voice_board(uuid, uuid, bigint, int, boolean, jsonb, jsonb) from public, anon, authenticated;
-- grant execute on function studio.publish_voice_board(uuid, uuid, bigint, int, boolean, jsonb, jsonb) to studio_writer;
-- create or replace function studio.take_down_voice_publication(p_id uuid, p_fid bigint) returns setof text
-- language plpgsql security definer set search_path = studio, pg_temp as $fn$
-- declare d uuid;
-- begin
--   update studio.voice_publications set taken_down_at = now() where id = p_id and fid = p_fid and taken_down_at is null returning draft_id into d;
--   if d is null then return; end if;
--   update studio.voice_drafts set published_at = null where id = d and kind = 'performance';
--   return query select f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = p_id;
-- end $fn$;
-- revoke all on function studio.take_down_voice_publication(uuid, bigint) from public, anon, authenticated;
-- grant execute on function studio.take_down_voice_publication(uuid, bigint) to studio_writer;
-- alter table studio.voice_guide_messages drop constraint if exists voice_guide_messages_step_check;
-- alter table studio.voice_guide_messages add constraint voice_guide_messages_step_check check (step in ('setting', 'clothing', 'plan', 'shot', 'fix'));
-- alter table studio.voice_boards drop constraint if exists voice_boards_source_check;
-- alter table studio.voice_boards drop column if exists source;
-- commit;
