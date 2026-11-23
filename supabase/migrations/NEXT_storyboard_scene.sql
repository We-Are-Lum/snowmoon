-- NEXT_storyboard_scene.sql: a storyboard is one scene, shot with several cameras (Nate, 2026-11-22, branch
-- storyboard-scene; docs/proposals/storyboard-scene.md v2). Not numbered until merge: it takes the next free number then,
-- checked against origin/main and production. NOT APPLIED until Nate applies it; the branch merges only after he says
-- "applied". Drafted by the coding agent (Claude, a closed model by Anthropic); tested in PGlite by the agent
-- (npm run test:voice, every migration in order). Version 2 (2026-11-23): the check is null-safe (coalesce): version 1
-- let a scene with no setting through, because a NULL check passes; its own read-back caught it.
-- Requires 0046_ephelion_voice_publish.sql (applied on production 2026-11-22).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (ending in `rollback;`), B. the migration (ending in `commit;`), C. the read-back (a realistic draft and
-- board made, read and removed inside a transaction that ends in `rollback;`; it ends "READ-BACK PASSED"; studio_writer's
-- rights are read by definition, as the SQL Editor can't SET ROLE), and D. the undo, only if the release is withdrawn.
-- Safe to run twice.
--
-- What it changes. Nothing is readable by anon or authenticated; studio_writer's rights are unchanged (insert and read).
-- 1. studio.voice_boards.scene: each saved version's scene, as the closing card's choices are kept: the person's own words
--    for the setting (at most 600 characters, as a shot's description), and the kept scene picture's sha256 (the
--    picture itself is a studio.voice_board_pictures row under the shot key 'scene', as the closing background is under
--    'end'). Null on versions saved before the scene step, and while no scene is written.
--    Shots in the scene and inserts are told apart inside the shots array (already jsonb): no new column for them.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
alter table studio.voice_boards add column if not exists scene jsonb;
alter table studio.voice_boards drop constraint if exists voice_boards_scene_check;
alter table studio.voice_boards add constraint voice_boards_scene_check check (
  scene is null or (
    jsonb_typeof(scene) = 'object'
    and coalesce(jsonb_typeof(scene -> 'setting') = 'string', false)
    and coalesce(char_length(scene ->> 'setting') <= 600, false)
    and (jsonb_typeof(scene -> 'kept') is null or jsonb_typeof(scene -> 'kept') = 'null' or (scene ->> 'kept') ~ '^[0-9a-f]{64}$')
  )
);
rollback;

-- B. MIGRATION. Expect COMMIT.
begin;
alter table studio.voice_boards add column if not exists scene jsonb;
alter table studio.voice_boards drop constraint if exists voice_boards_scene_check;
alter table studio.voice_boards add constraint voice_boards_scene_check check (
  scene is null or (
    jsonb_typeof(scene) = 'object'
    and coalesce(jsonb_typeof(scene -> 'setting') = 'string', false)
    and coalesce(char_length(scene ->> 'setting') <= 600, false)
    and (jsonb_typeof(scene -> 'kept') is null or jsonb_typeof(scene -> 'kept') = 'null' or (scene ->> 'kept') ~ '^[0-9a-f]{64}$')
  )
);
commit;

-- C. READ-BACK (after B), as postgres. Expect "READ-BACK PASSED".
begin;
do $$
declare d uuid; n int;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'voice_boards' and column_name = 'scene' and data_type = 'jsonb') then
    raise exception 'studio.voice_boards.scene is missing'; end if;
  -- Rights unchanged: studio_writer inserts and reads boards, never changes or deletes them; nobody else reads them.
  if not has_table_privilege('studio_writer', 'studio.voice_boards', 'insert') or not has_table_privilege('studio_writer', 'studio.voice_boards', 'select') then
    raise exception 'studio_writer lost a right on voice_boards'; end if;
  if has_table_privilege('studio_writer', 'studio.voice_boards', 'update') or has_table_privilege('studio_writer', 'studio.voice_boards', 'delete') then
    raise exception 'studio_writer can change or delete a board'; end if;
  if has_table_privilege('anon', 'studio.voice_boards', 'select') or has_table_privilege('authenticated', 'studio.voice_boards', 'select') then
    raise exception 'anon or authenticated can read boards'; end if;

  -- A realistic performance draft and three board versions, as the site saves them.
  insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (6786, 'performance', 'ephelion-c13-b64', 'ephelion-warm-lecturer',
    jsonb_build_object('provider', 'ElevenLabs', 'model', 'eleven_multilingual_sts_v2', 'takes', jsonb_build_array(jsonb_build_object('role', 'take', 'takeSha256', repeat('a', 64), 'convertedSha256', repeat('e', 64))))) returning id into d;
  -- 1: before any scene (null), as every version saved before this release.
  insert into studio.voice_boards (draft_id, fid, version, cuts, shots, closing, scene) values (d, 6786, 1, '[8.2]',
    '[{"key":"s1","start":0,"end":8.2,"description":"","angle":"wide","styleId":null,"characterIds":[],"kept":null},{"key":"s2","start":8.2,"end":16,"description":"","angle":"medium","styleId":null,"characterIds":[],"kept":null}]', null, null);
  -- 2: the setting written, no picture kept yet.
  insert into studio.voice_boards (draft_id, fid, version, cuts, shots, closing, scene) values (d, 6786, 2, '[8.2]',
    '[{"key":"s1","start":0,"end":8.2,"description":"","angle":"wide","angleBy":"rule","insert":false,"styleId":null,"characterIds":[],"kept":null}]', null,
    jsonb_build_object('setting', 'A tall window over a grey harbour, early morning light, a lectern of dark wood.', 'kept', null));
  -- 3: the scene picture kept, and shot 2 an insert.
  insert into studio.voice_boards (draft_id, fid, version, cuts, shots, closing, scene) values (d, 6786, 3, '[8.2]',
    '[{"key":"s1","start":0,"end":8.2,"description":"He looks up.","angle":"wide","angleBy":"rule","insert":false,"styleId":null,"characterIds":[],"kept":null},{"key":"s2","start":8.2,"end":16,"description":"A family at dinner.","angle":"","angleBy":"person","insert":true,"styleId":null,"characterIds":[],"kept":null}]', null,
    jsonb_build_object('setting', 'A tall window over a grey harbour, early morning light, a lectern of dark wood.', 'kept', repeat('5', 64)));
  select count(*) into n from studio.voice_boards where draft_id = d and fid = 6786;
  if n <> 3 then raise exception 'expected 3 versions, found %', n; end if;
  if (select scene ->> 'kept' from studio.voice_boards where draft_id = d and version = 3) <> repeat('5', 64) then raise exception 'the kept scene did not read back'; end if;
  if (select (shots -> 1 ->> 'insert')::boolean from studio.voice_boards where draft_id = d and version = 3) is not true then raise exception 'the insert did not read back'; end if;

  -- Refused shapes: not an object, no setting, a setting over 600 characters, a kept value that isn't a sha256.
  begin insert into studio.voice_boards (draft_id, fid, version, cuts, shots, scene) values (d, 6786, 4, '[]', '[]', '"a string"'); raise exception 'a non-object scene was accepted'; exception when check_violation then null; end;
  begin insert into studio.voice_boards (draft_id, fid, version, cuts, shots, scene) values (d, 6786, 4, '[]', '[]', '{"kept":null}'); raise exception 'a scene with no setting was accepted'; exception when check_violation then null; end;
  begin insert into studio.voice_boards (draft_id, fid, version, cuts, shots, scene) values (d, 6786, 4, '[]', '[]', jsonb_build_object('setting', repeat('x', 601))); raise exception 'a 601-character setting was accepted'; exception when check_violation then null; end;
  begin insert into studio.voice_boards (draft_id, fid, version, cuts, shots, scene) values (d, 6786, 4, '[]', '[]', '{"setting":"x","kept":"not-a-sha"}'); raise exception 'a kept value that is not a sha256 was accepted'; exception when check_violation then null; end;

  -- Removed as the site removes a draft (studio.delete_voice_draft takes its boards with it).
  select count(*) into n from studio.delete_voice_draft(d, 6786);
  if exists (select 1 from studio.voice_boards where draft_id = d) or exists (select 1 from studio.voice_drafts where id = d) then raise exception 'the draft or its boards were not removed'; end if;
  raise notice 'READ-BACK PASSED';
end $$;
rollback;

-- D. UNDO (only if the release is withdrawn), as postgres. Paste the lines below without their "-- ". It refuses once
--    any saved version has a scene (export and ask the owner first); otherwise it drops the column.
-- begin;
-- do $$ begin
--   if exists (select 1 from studio.voice_boards where scene is not null) then raise exception 'UNDO REFUSED: boards with a scene exist; nothing is changed'; end if;
-- end $$;
-- alter table studio.voice_boards drop constraint if exists voice_boards_scene_check;
-- alter table studio.voice_boards drop column if exists scene;
-- commit;
