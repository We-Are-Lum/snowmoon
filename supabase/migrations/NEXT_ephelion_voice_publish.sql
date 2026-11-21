-- NEXT_ephelion_voice_publish.sql: the Ephelion storyboard, slice 4 (Nate, 2026-11-21, branch ephelion-publish): the closing
-- card's choices and publishing a storyboard. NOT APPLIED. Unnumbered while the branch is unmerged: it takes the next
-- free number at merge, after NEXT_ephelion_voice.sql's. Drafted by the coding agent (Claude, a closed model by
-- Anthropic), DRAFT until Nate approves it; tested in PGlite by the agent (npm run test:voice).
-- Requires NEXT_ephelion_voice.sql (studio.voice_drafts, voice_boards, voice_board_pictures) applied first.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (ending in `rollback;`), B. the migration (ending in `commit;`), C. the read-back (realistic rows
-- inserted and deleted inside a transaction that ends in `rollback;`; it ends "READ-BACK PASSED"), and D. the undo,
-- only if the release is withdrawn. Safe to run twice.
--
-- What it adds. None of it is readable by anon or authenticated; studio_writer may select, and publish or take down only
-- through the two functions.
-- 1. studio.voice_boards.closing: the closing card's choices on each saved version: the person's own words for its
--    look, the style sheet, and the sha256 of the background picture kept for it (shot key 'end'). The card's text is
--    not stored: the site sets it from the recipe each time (fixed credits, the snowmoon.party mark, the not-affiliated
--    line, the AI labels).
-- 2. studio.voice_publications: a published storyboard: who, when, which draft and board version, whether the performer
--    is named, the full recipe (the voice's, each shot's picture recipe, the closing card's), and the public files (the
--    audio pieces, the shots' pictures, the closing background and the composed card) with their sha256. A take-down keeps the row (taken_down_at)
--    and the site deletes the public files.
-- 3. studio.publish_voice_board(...): the only way to publish: only the draft's own person, only an unpublished
--    performance, and only the board version given, in one transaction: the publication row, and the draft's
--    published_at (so it can't be removed while public).
-- 4. studio.take_down_voice_publication(id, fid): the person's own take-down: marks it taken down, makes the draft a
--    draft again (removable), and returns the public files' keys so the site deletes them.
-- 5. studio.delete_voice_draft, replaced: removing a draft also removes its taken-down publications' rows (a live one
--    still blocks it). The undo puts back NEXT_ephelion_voice.sql's version.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
alter table studio.voice_boards add column if not exists closing jsonb check (closing is null or jsonb_typeof(closing) = 'object');

create table if not exists studio.voice_publications (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references studio.voice_drafts(id),
  fid bigint not null check (fid > 0),
  board_version int not null check (board_version between 1 and 10000),
  named boolean not null default true,
  published_at timestamptz not null default now(),
  taken_down_at timestamptz,
  recipe jsonb not null check (jsonb_typeof(recipe) = 'object' and recipe ? 'voice' and recipe ? 'shots' and recipe ? 'closing'),
  -- [{role: 'audio'|'shot'|'background'|'closing', key, sha256, ...}], each key under storyboards/<this id>/.
  files jsonb not null check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) between 2 and 64)
);
-- One live publication a draft; a taken-down one may be published again (a new row).
create unique index if not exists voice_publications_live on studio.voice_publications (draft_id) where taken_down_at is null;
create index if not exists voice_publications_fid on studio.voice_publications (fid, published_at desc);
alter table studio.voice_publications enable row level security;
drop policy if exists writer_read on studio.voice_publications;
create policy writer_read on studio.voice_publications for select to studio_writer using (true);
revoke all on studio.voice_publications from anon, authenticated;
grant select on studio.voice_publications to studio_writer;
revoke insert, update, delete, truncate on studio.voice_publications from studio_writer;

create or replace function studio.publish_voice_board(p_id uuid, p_draft uuid, p_fid bigint, p_version int, p_named boolean, p_recipe jsonb, p_files jsonb) returns uuid
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if not exists (select 1 from studio.voice_drafts where id = p_draft and fid = p_fid and kind = 'performance' and published_at is null for update) then
    raise exception 'not your unpublished performance' using errcode = 'P0002';
  end if;
  if not exists (select 1 from studio.voice_boards where draft_id = p_draft and version = p_version and version = (select max(version) from studio.voice_boards where draft_id = p_draft)) then
    raise exception 'not the latest storyboard' using errcode = 'P0002';
  end if;
  if exists (select 1 from jsonb_array_elements(p_files) f where not (f->>'key' like 'storyboards/' || p_id::text || '/%' and f->>'key' ~ '^storyboards/[0-9a-f-]{36}/[a-z0-9-]{1,40}-[0-9a-f]{64}\.(mp3|png|jpg)$' and f->>'sha256' ~ '^[0-9a-f]{64}$')) then
    raise exception 'a file is not under this publication' using errcode = '22023';
  end if;
  insert into studio.voice_publications (id, draft_id, fid, board_version, named, recipe, files) values (p_id, p_draft, p_fid, p_version, p_named, p_recipe, p_files);
  update studio.voice_drafts set published_at = now() where id = p_draft;
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
  update studio.voice_drafts set published_at = null where id = d;
  return query select f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = p_id;
end $fn$;
revoke all on function studio.take_down_voice_publication(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.take_down_voice_publication(uuid, bigint) to studio_writer;

-- Removing one's own unpublished draft (NEXT_ephelion_voice.sql's function, with publications): a taken-down
-- publication's row goes with the draft (its files are already deleted); a live one blocks removal, as before.
create or replace function studio.delete_voice_draft(p_id uuid, p_fid bigint) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if not exists (select 1 from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null) then return; end if;
  if exists (select 1 from studio.voice_publications where draft_id = p_id and taken_down_at is null) then return; end if;
  delete from studio.voice_publications where draft_id = p_id and taken_down_at is not null;
  return query delete from studio.voice_board_pictures where draft_id = p_id returning storage_key;
  delete from studio.voice_board_asks where draft_id = p_id;
  delete from studio.voice_boards where draft_id = p_id;
  return query delete from studio.voice_draft_audio where draft_id = p_id returning storage_key;
  delete from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null;
end $fn$;
revoke all on function studio.delete_voice_draft(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.delete_voice_draft(uuid, bigint) to studio_writer;
rollback;

-- B. MIGRATION: the same SQL, ending in commit.
begin;
alter table studio.voice_boards add column if not exists closing jsonb check (closing is null or jsonb_typeof(closing) = 'object');

create table if not exists studio.voice_publications (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references studio.voice_drafts(id),
  fid bigint not null check (fid > 0),
  board_version int not null check (board_version between 1 and 10000),
  named boolean not null default true,
  published_at timestamptz not null default now(),
  taken_down_at timestamptz,
  recipe jsonb not null check (jsonb_typeof(recipe) = 'object' and recipe ? 'voice' and recipe ? 'shots' and recipe ? 'closing'),
  files jsonb not null check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) between 2 and 64)
);
create unique index if not exists voice_publications_live on studio.voice_publications (draft_id) where taken_down_at is null;
create index if not exists voice_publications_fid on studio.voice_publications (fid, published_at desc);
alter table studio.voice_publications enable row level security;
drop policy if exists writer_read on studio.voice_publications;
create policy writer_read on studio.voice_publications for select to studio_writer using (true);
revoke all on studio.voice_publications from anon, authenticated;
grant select on studio.voice_publications to studio_writer;
revoke insert, update, delete, truncate on studio.voice_publications from studio_writer;

create or replace function studio.publish_voice_board(p_id uuid, p_draft uuid, p_fid bigint, p_version int, p_named boolean, p_recipe jsonb, p_files jsonb) returns uuid
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if not exists (select 1 from studio.voice_drafts where id = p_draft and fid = p_fid and kind = 'performance' and published_at is null for update) then
    raise exception 'not your unpublished performance' using errcode = 'P0002';
  end if;
  if not exists (select 1 from studio.voice_boards where draft_id = p_draft and version = p_version and version = (select max(version) from studio.voice_boards where draft_id = p_draft)) then
    raise exception 'not the latest storyboard' using errcode = 'P0002';
  end if;
  if exists (select 1 from jsonb_array_elements(p_files) f where not (f->>'key' like 'storyboards/' || p_id::text || '/%' and f->>'key' ~ '^storyboards/[0-9a-f-]{36}/[a-z0-9-]{1,40}-[0-9a-f]{64}\.(mp3|png|jpg)$' and f->>'sha256' ~ '^[0-9a-f]{64}$')) then
    raise exception 'a file is not under this publication' using errcode = '22023';
  end if;
  insert into studio.voice_publications (id, draft_id, fid, board_version, named, recipe, files) values (p_id, p_draft, p_fid, p_version, p_named, p_recipe, p_files);
  update studio.voice_drafts set published_at = now() where id = p_draft;
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
  update studio.voice_drafts set published_at = null where id = d;
  return query select f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = p_id;
end $fn$;
revoke all on function studio.take_down_voice_publication(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.take_down_voice_publication(uuid, bigint) to studio_writer;

-- Removing one's own unpublished draft (NEXT_ephelion_voice.sql's function, with publications): a taken-down
-- publication's row goes with the draft (its files are already deleted); a live one blocks removal, as before.
create or replace function studio.delete_voice_draft(p_id uuid, p_fid bigint) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if not exists (select 1 from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null) then return; end if;
  if exists (select 1 from studio.voice_publications where draft_id = p_id and taken_down_at is null) then return; end if;
  delete from studio.voice_publications where draft_id = p_id and taken_down_at is not null;
  return query delete from studio.voice_board_pictures where draft_id = p_id returning storage_key;
  delete from studio.voice_board_asks where draft_id = p_id;
  delete from studio.voice_boards where draft_id = p_id;
  return query delete from studio.voice_draft_audio where draft_id = p_id returning storage_key;
  delete from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null;
end $fn$;
revoke all on function studio.delete_voice_draft(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.delete_voice_draft(uuid, bigint) to studio_writer;
commit;

-- C. READ-BACK (after B): a look, then a realistic publication made and taken down inside a transaction that ends in
--    rollback. Expect "READ-BACK PASSED".
begin;
do $$
declare d uuid; p uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); n int;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'voice_boards' and column_name = 'closing') then
    raise exception 'voice_boards.closing is missing'; end if;
  if has_table_privilege('studio_writer', 'studio.voice_publications', 'insert') or has_table_privilege('anon', 'studio.voice_publications', 'select') then
    raise exception 'voice_publications is writable by studio_writer or readable by anon'; end if;

  insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (6786, 'performance', 'ephelion-c13-b64', 'ephelion-warm-lecturer',
    jsonb_build_object('provider', 'ElevenLabs', 'model', 'eleven_multilingual_sts_v2', 'takes', jsonb_build_array(jsonb_build_object('role', 'take', 'takeSha256', repeat('a', 64)))))
    returning id into d;
  insert into studio.voice_boards (draft_id, fid, version, cuts, shots, closing) values (d, 6786, 1, '[8.4]', '[{"key":"s1"},{"key":"s2"}]',
    jsonb_build_object('description', 'snow over a dark harbour, the lamps out', 'styleId', null, 'kept', repeat('e', 64)));
  execute 'set local role studio_writer';
  -- Someone else can't publish it; nor can a file outside the publication's folder be listed.
  begin perform studio.publish_voice_board(p, d, 193912, 1, true, '{"voice":{},"shots":[],"closing":{}}', '[]'); raise exception 'someone else published a draft';
  exception when sqlstate 'P0002' then null; end;
  begin perform studio.publish_voice_board(p, d, 6786, 1, true, '{"voice":{},"shots":[],"closing":{}}',
    jsonb_build_array(jsonb_build_object('key', 'images/readers/x.png', 'sha256', repeat('f', 64)), jsonb_build_object('key', 'storyboards/' || p || '/audio-0-' || repeat('b', 64) || '.mp3', 'sha256', repeat('b', 64))));
    raise exception 'a file outside the publication was accepted';
  exception when sqlstate '22023' then null; end;
  perform studio.publish_voice_board(p, d, 6786, 1, true, jsonb_build_object('voice', jsonb_build_object('preset', 'Warm, measured (American)'), 'shots', '[]'::jsonb, 'closing', '{}'::jsonb),
    jsonb_build_array(
      jsonb_build_object('role', 'audio', 'key', 'storyboards/' || p || '/audio-0-' || repeat('b', 64) || '.mp3', 'sha256', repeat('b', 64)),
      jsonb_build_object('role', 'shot', 'key', 'storyboards/' || p || '/s1-' || repeat('c', 64) || '.jpg', 'sha256', repeat('c', 64)),
      jsonb_build_object('role', 'closing', 'key', 'storyboards/' || p || '/closing-' || repeat('d', 64) || '.png', 'sha256', repeat('d', 64))));
  if (select published_at from studio.voice_drafts where id = d) is null then raise exception 'the draft was not marked published'; end if;
  -- Published: it can't be removed, nor published twice.
  select count(*) into n from studio.delete_voice_draft(d, 6786);
  if n <> 0 or not exists (select 1 from studio.voice_drafts where id = d) then raise exception 'a published draft was removed'; end if;
  begin perform studio.publish_voice_board(p2, d, 6786, 1, true, '{"voice":{},"shots":[],"closing":{}}', '[]'); raise exception 'published twice';
  exception when sqlstate 'P0002' then null; end;
  begin update studio.voice_publications set named = false where id = p; raise exception 'studio_writer changed a publication';
  exception when insufficient_privilege then null; end;
  -- Taken down by someone else: nothing; by its person: the three keys back, and the draft is a draft again.
  select count(*) into n from studio.take_down_voice_publication(p, 193912);
  if n <> 0 then raise exception 'someone else took it down'; end if;
  select count(*) into n from studio.take_down_voice_publication(p, 6786);
  if n <> 3 or (select published_at from studio.voice_drafts where id = d) is not null or (select taken_down_at from studio.voice_publications where id = p) is null then
    raise exception 'the take-down was incomplete (% keys)', n; end if;
  -- Taken down, it is a draft again: its person can remove it, the taken-down publication's row with it.
  select count(*) into n from studio.delete_voice_draft(d, 6786);
  if exists (select 1 from studio.voice_drafts where id = d) or exists (select 1 from studio.voice_publications where draft_id = d) then
    raise exception 'a taken-down draft could not be removed'; end if;
  execute 'reset role';
  raise notice 'READ-BACK PASSED';
end $$;
rollback;

-- D. UNDO (only if the release is withdrawn), as postgres. Paste the lines below without their "-- ". It refuses while
--    any storyboard has been published (live or taken down): export the rows and the files under storyboards/ first, and
--    ask the owner.
-- begin;
-- do $$
-- begin
--   if to_regclass('studio.voice_publications') is not null and exists (select 1 from studio.voice_publications) then
--     raise exception 'UNDO REFUSED: storyboards have been published; nothing is deleted';
--   end if;
-- end;
-- $$;
-- drop function if exists studio.take_down_voice_publication(uuid, bigint);
-- drop function if exists studio.publish_voice_board(uuid, uuid, bigint, int, boolean, jsonb, jsonb);
-- create or replace function studio.delete_voice_draft(p_id uuid, p_fid bigint) returns setof text
-- language plpgsql security definer set search_path = studio, pg_temp as $fn$
-- begin
--   if not exists (select 1 from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null) then return; end if;
--   return query delete from studio.voice_board_pictures where draft_id = p_id returning storage_key;
--   delete from studio.voice_board_asks where draft_id = p_id;
--   delete from studio.voice_boards where draft_id = p_id;
--   return query delete from studio.voice_draft_audio where draft_id = p_id returning storage_key;
--   delete from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null;
-- end $fn$;
-- drop table if exists studio.voice_publications;
-- alter table studio.voice_boards drop column if exists closing;
-- commit;
