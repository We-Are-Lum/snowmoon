-- 0049_storyboard_guide.sql (was NEXT_storyboard_guide.sql; numbered at merge, 2026-11-23): the storyboard guide's dialogue (Nate, 2026-11-22/23, branch storyboard-guide; P2's
-- "Storyboard pictures" ruling: the recipe keeps the person's request, word for word). APPLIED on production by Nate on
-- 2026-11-23, after 0048 ("applied": A, B, C run at once, Success), and confirmed read-only by the agent the same day. Drafted by the coding agent (Claude, a closed model by Anthropic); tested in
-- PGlite by the agent (npm run test:voice, every migration in order). Requires 0046_ephelion_voice_publish.sql
-- (applied) and 0048_storyboard_scene.sql (applied).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (ending in `rollback;`), B. the migration (ending in `commit;`), C. the read-back (a realistic draft,
-- board and dialogue made, read and removed inside a transaction that ends in `rollback;`; it ends "READ-BACK PASSED";
-- studio_writer's rights are read by definition, as the SQL Editor can't SET ROLE), and D. the undo. Safe to run twice.
--
-- What it changes. Nothing is readable by anon or authenticated.
-- 1. studio.voice_guide_messages: each message of a person's dialogue with the guide on one draft's storyboard: who
--    (fid), its place (n), whose it is ('person' or 'guide'), the step (setting, clothing, plan, shot, fix), the text, the
--    guide's draft (JSON, the guide's messages only), the model that wrote it and what it cost. studio_writer may insert
--    and read only; a message is never edited (an edit is the person's next message, or is kept in the picture's recipe).
-- 2. studio.delete_voice_board and studio.delete_voice_draft, replaced: removing a board (or the draft) also removes its
--    dialogue, as it removes its pictures and tries.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.voice_guide_messages (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references studio.voice_drafts(id),
  fid bigint not null check (fid > 0),
  n int not null check (n between 1 and 1000),
  role text not null check (role in ('person', 'guide')),
  step text not null check (step in ('setting', 'clothing', 'plan', 'shot', 'fix')),
  text text not null check (char_length(text) between 1 and 4000),
  draft jsonb check (draft is null or jsonb_typeof(draft) = 'object'),
  model text check (model is null or char_length(model) <= 120),
  cost_usd numeric(10, 6) check (cost_usd is null or cost_usd >= 0),
  made_at timestamptz not null default now(),
  unique (draft_id, fid, n),
  check ((role = 'guide') = (model is not null))
);
alter table studio.voice_guide_messages enable row level security;
drop policy if exists writer_insert on studio.voice_guide_messages;
drop policy if exists writer_read on studio.voice_guide_messages;
create policy writer_insert on studio.voice_guide_messages for insert to studio_writer with check (true);
create policy writer_read on studio.voice_guide_messages for select to studio_writer using (true);
revoke all on studio.voice_guide_messages from anon, authenticated;
grant select, insert on studio.voice_guide_messages to studio_writer;
revoke update, delete, truncate on studio.voice_guide_messages from studio_writer;
rollback;

-- B. MIGRATION. Expect COMMIT.
begin;
create table if not exists studio.voice_guide_messages (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references studio.voice_drafts(id),
  fid bigint not null check (fid > 0),
  n int not null check (n between 1 and 1000),
  role text not null check (role in ('person', 'guide')),
  step text not null check (step in ('setting', 'clothing', 'plan', 'shot', 'fix')),
  text text not null check (char_length(text) between 1 and 4000),
  draft jsonb check (draft is null or jsonb_typeof(draft) = 'object'),
  model text check (model is null or char_length(model) <= 120),
  cost_usd numeric(10, 6) check (cost_usd is null or cost_usd >= 0),
  made_at timestamptz not null default now(),
  unique (draft_id, fid, n),
  check ((role = 'guide') = (model is not null))
);
alter table studio.voice_guide_messages enable row level security;
drop policy if exists writer_insert on studio.voice_guide_messages;
drop policy if exists writer_read on studio.voice_guide_messages;
create policy writer_insert on studio.voice_guide_messages for insert to studio_writer with check (true);
create policy writer_read on studio.voice_guide_messages for select to studio_writer using (true);
revoke all on studio.voice_guide_messages from anon, authenticated;
grant select, insert on studio.voice_guide_messages to studio_writer;
revoke update, delete, truncate on studio.voice_guide_messages from studio_writer;

-- Removing one's own draft: as 0046, and its dialogue goes with it.
create or replace function studio.delete_voice_draft(p_id uuid, p_fid bigint) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if not exists (select 1 from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null) then return; end if;
  if exists (select 1 from studio.voice_publications where draft_id = p_id and taken_down_at is null) then return; end if;
  if exists (select 1 from studio.voice_boards where draft_id = p_id and fid <> p_fid) or exists (select 1 from studio.voice_board_pictures where draft_id = p_id and fid <> p_fid) then return; end if;
  delete from studio.voice_publications where draft_id = p_id and taken_down_at is not null;
  return query delete from studio.voice_board_pictures where draft_id = p_id returning storage_key;
  delete from studio.voice_board_asks where draft_id = p_id;
  delete from studio.voice_guide_messages where draft_id = p_id;
  delete from studio.voice_boards where draft_id = p_id;
  delete from studio.voice_reading_timings where draft_id = p_id;
  return query delete from studio.voice_draft_audio where draft_id = p_id returning storage_key;
  delete from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null;
end $fn$;
revoke all on function studio.delete_voice_draft(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.delete_voice_draft(uuid, bigint) to studio_writer;

-- Removing one's own board on a draft: as 0046, and its dialogue goes with it.
create or replace function studio.delete_voice_board(p_draft uuid, p_fid bigint) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if exists (select 1 from studio.voice_publications where draft_id = p_draft and fid = p_fid and taken_down_at is null) then return; end if;
  delete from studio.voice_publications where draft_id = p_draft and fid = p_fid and taken_down_at is not null;
  return query delete from studio.voice_board_pictures where draft_id = p_draft and fid = p_fid returning storage_key;
  delete from studio.voice_board_asks where draft_id = p_draft and fid = p_fid;
  delete from studio.voice_guide_messages where draft_id = p_draft and fid = p_fid;
  delete from studio.voice_boards where draft_id = p_draft and fid = p_fid;
end $fn$;
revoke all on function studio.delete_voice_board(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.delete_voice_board(uuid, bigint) to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Expect "READ-BACK PASSED".
begin;
do $$
declare d uuid; n int;
begin
  if to_regclass('studio.voice_guide_messages') is null then raise exception 'studio.voice_guide_messages is missing'; end if;
  if not has_table_privilege('studio_writer', 'studio.voice_guide_messages', 'insert') or not has_table_privilege('studio_writer', 'studio.voice_guide_messages', 'select') then raise exception 'studio_writer cannot keep or read the dialogue'; end if;
  if has_table_privilege('studio_writer', 'studio.voice_guide_messages', 'update') or has_table_privilege('studio_writer', 'studio.voice_guide_messages', 'delete') or has_table_privilege('studio_writer', 'studio.voice_guide_messages', 'truncate') then raise exception 'studio_writer can change or delete a message'; end if;
  if has_table_privilege('anon', 'studio.voice_guide_messages', 'select') or has_table_privilege('authenticated', 'studio.voice_guide_messages', 'select') then raise exception 'anon or authenticated can read the dialogue'; end if;

  -- A realistic draft, a board, and the first exchange of a dialogue, as the site keeps them.
  insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (6786, 'performance', 'ephelion-c13-b64', 'ephelion-warm-lecturer',
    jsonb_build_object('provider', 'ElevenLabs', 'model', 'eleven_multilingual_sts_v2', 'takes', jsonb_build_array(jsonb_build_object('role', 'take', 'takeSha256', repeat('a', 64), 'convertedSha256', repeat('e', 64))))) returning id into d;
  insert into studio.voice_boards (draft_id, fid, version, cuts, shots) values (d, 6786, 1, '[8.2]', '[]');
  insert into studio.voice_guide_messages (draft_id, fid, n, role, step, text) values (d, 6786, 1, 'person', 'setting', 'An empty lecture hall in the Arctic, cold blue morning light, he stands at a lectern.');
  insert into studio.voice_guide_messages (draft_id, fid, n, role, step, text, draft, model, cost_usd) values (d, 6786, 2, 'guide', 'setting', 'Here is a setting from your words.',
    '{"setting":"An empty tiered lecture hall, pale blue morning light through tall windows; Lord Ephelion alone at a lectern of dark wood."}', 'openai/gpt-oss-120b', 0.000412);
  select count(*) into n from studio.voice_guide_messages where draft_id = d;
  if n <> 2 then raise exception 'expected 2 messages, found %', n; end if;
  -- Refused shapes: a guide message without its model, a person's message with one, an unknown step, an empty text, a repeated place.
  begin insert into studio.voice_guide_messages (draft_id, fid, n, role, step, text) values (d, 6786, 3, 'guide', 'plan', 'x'); raise exception 'a guide message without its model was accepted'; exception when check_violation then null; end;
  begin insert into studio.voice_guide_messages (draft_id, fid, n, role, step, text, model) values (d, 6786, 3, 'person', 'plan', 'x', 'm'); raise exception 'a person''s message with a model was accepted'; exception when check_violation then null; end;
  begin insert into studio.voice_guide_messages (draft_id, fid, n, role, step, text) values (d, 6786, 3, 'person', 'elsewhere', 'x'); raise exception 'an unknown step was accepted'; exception when check_violation then null; end;
  begin insert into studio.voice_guide_messages (draft_id, fid, n, role, step, text) values (d, 6786, 3, 'person', 'plan', ''); raise exception 'an empty message was accepted'; exception when check_violation then null; end;
  begin insert into studio.voice_guide_messages (draft_id, fid, n, role, step, text) values (d, 6786, 2, 'person', 'plan', 'again'); raise exception 'a repeated place was accepted'; exception when unique_violation then null; end;
  -- Removing the board removes its dialogue; removing the draft removes the rest.
  select count(*) into n from studio.delete_voice_board(d, 6786);
  if exists (select 1 from studio.voice_guide_messages where draft_id = d) or exists (select 1 from studio.voice_boards where draft_id = d) then raise exception 'the board''s dialogue was not removed with it'; end if;
  insert into studio.voice_guide_messages (draft_id, fid, n, role, step, text) values (d, 6786, 1, 'person', 'setting', 'Again.');
  select count(*) into n from studio.delete_voice_draft(d, 6786);
  if exists (select 1 from studio.voice_guide_messages where draft_id = d) or exists (select 1 from studio.voice_drafts where id = d) then raise exception 'the draft''s dialogue was not removed with it'; end if;
  raise notice 'READ-BACK PASSED';
end $$;
rollback;

-- D. UNDO (only if the release is withdrawn), as postgres. Paste the lines below without their "-- ". It refuses once any
--    dialogue exists (export and ask the owner first); otherwise it drops the table and puts back 0046's two functions.
-- begin;
-- do $$ begin
--   if exists (select 1 from studio.voice_guide_messages) then raise exception 'UNDO REFUSED: dialogues exist; nothing is changed'; end if;
-- end $$;
-- -- 0046's two functions, word for word, without the dialogue (the table goes after them, so nothing refers to it).
-- create or replace function studio.delete_voice_draft(p_id uuid, p_fid bigint) returns setof text
-- language plpgsql security definer set search_path = studio, pg_temp as $fn$
-- begin
--   if not exists (select 1 from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null) then return; end if;
--   if exists (select 1 from studio.voice_publications where draft_id = p_id and taken_down_at is null) then return; end if;
--   if exists (select 1 from studio.voice_boards where draft_id = p_id and fid <> p_fid) or exists (select 1 from studio.voice_board_pictures where draft_id = p_id and fid <> p_fid) then return; end if;
--   delete from studio.voice_publications where draft_id = p_id and taken_down_at is not null;
--   return query delete from studio.voice_board_pictures where draft_id = p_id returning storage_key;
--   delete from studio.voice_board_asks where draft_id = p_id;
--   delete from studio.voice_boards where draft_id = p_id;
--   delete from studio.voice_reading_timings where draft_id = p_id;
--   return query delete from studio.voice_draft_audio where draft_id = p_id returning storage_key;
--   delete from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null;
-- end $fn$;
-- revoke all on function studio.delete_voice_draft(uuid, bigint) from public, anon, authenticated;
-- grant execute on function studio.delete_voice_draft(uuid, bigint) to studio_writer;
-- create or replace function studio.delete_voice_board(p_draft uuid, p_fid bigint) returns setof text
-- language plpgsql security definer set search_path = studio, pg_temp as $fn$
-- begin
--   if exists (select 1 from studio.voice_publications where draft_id = p_draft and fid = p_fid and taken_down_at is null) then return; end if;
--   delete from studio.voice_publications where draft_id = p_draft and fid = p_fid and taken_down_at is not null;
--   return query delete from studio.voice_board_pictures where draft_id = p_draft and fid = p_fid returning storage_key;
--   delete from studio.voice_board_asks where draft_id = p_draft and fid = p_fid;
--   delete from studio.voice_boards where draft_id = p_draft and fid = p_fid;
-- end $fn$;
-- revoke all on function studio.delete_voice_board(uuid, bigint) from public, anon, authenticated;
-- grant execute on function studio.delete_voice_board(uuid, bigint) to studio_writer;
-- drop table if exists studio.voice_guide_messages;
-- commit;
