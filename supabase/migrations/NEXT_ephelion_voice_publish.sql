-- NEXT_ephelion_voice_publish.sql: the Ephelion storyboard, slice 4 and storyboards from the ready-made reading (Nate,
-- 2026-11-21, branch ephelion-publish). NOT APPLIED. Unnumbered while the branch is unmerged: it takes the next free number
-- at merge. Drafted by the coding agent (Claude, a closed model by Anthropic), DRAFT until Nate approves it; tested in PGlite
-- by the agent (npm run test:voice). Version 2 (2026-11-21 night): the coordinator tested version 1; this one adds a board's
-- own owner, reading timings and publishing from a reading, and a read-back without SET ROLE, so it needs testing again.
-- Requires 0044_ephelion_voice.sql (applied on production 2026-11-21).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (ending in `rollback;`), B. the migration (ending in `commit;`), C. the read-back (realistic rows made and
-- removed inside a transaction that ends in `rollback;`; it ends "READ-BACK PASSED"; it reads studio_writer's rights by
-- definition, as the SQL Editor can't SET ROLE), and D. the undo, only if the release is withdrawn. Safe to run twice.
--
-- What it changes. None of it is readable by anon or authenticated.
-- 1. studio.voice_boards.closing: the closing card's choices on each saved version (the person's own words for its look,
--    the style sheet, the kept background's sha256). The card's text isn't stored: the site sets it from the recipe.
-- 2. A board has its own owner (Nate: "a storyboard on a shared reading belongs to the person making it"): versions are
--    unique per (draft, person), not per draft; kept pictures carry their owner (fid) in the key and in their storage path
--    (voice-boards/<draft>/<fid>/...); rows kept before this keep their path and get the draft's person as owner.
-- 3. studio.voice_reading_timings: a ready-made reading's word timings, made once by transcribing its own audio (who asked,
--    the model, the timeline, the word check, the credits, whether the transcript was deleted at ElevenLabs). Insert only.
-- 4. studio.voice_publications: a published storyboard: who, when, which draft (a performance or a reading) and board
--    version, whether its maker is named, the full recipe and the public files under storyboards/<id>/. One live
--    publication per board (draft and person). studio_writer may only read it; publish and take-down are functions.
-- 5. studio.publish_voice_board: a performance only by its person (then marked published, so it can't be removed while
--    public); a reading by anyone with a board on it (the reading isn't changed); the owner's latest version only; once.
-- 6. studio.take_down_voice_publication: the person's own take-down; a performance is a draft again; returns the keys.
-- 7. studio.delete_voice_draft, replaced: not while public, and not while anyone else has a board on it (a shared
--    reading); its own boards, pictures, tries, taken-down publications and timings go with it.
-- 8. studio.delete_voice_board: removing one's own board on a draft (a reading's), unless it is published.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
alter table studio.voice_boards add column if not exists closing jsonb check (closing is null or jsonb_typeof(closing) = 'object');

-- A board has its own owner (fid): a ready-made reading carries many people's boards, each with its own versions.
alter table studio.voice_boards drop constraint if exists voice_boards_draft_id_version_key;
create unique index if not exists voice_boards_owner_version on studio.voice_boards (draft_id, fid, version);

-- Kept pictures are their board owner's: the owner in the key and in the storage path (voice-boards/<draft>/<fid>/…);
-- rows kept before this keep their old path and get the draft's own person as owner.
alter table studio.voice_board_pictures add column if not exists fid bigint;
update studio.voice_board_pictures p set fid = d.fid from studio.voice_drafts d where d.id = p.draft_id and p.fid is null;
alter table studio.voice_board_pictures alter column fid set not null;
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'voice_board_pictures_fid_check') then
    alter table studio.voice_board_pictures add constraint voice_board_pictures_fid_check check (fid > 0);
  end if;
  if exists (select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
             where n.nspname = 'studio' and t.relname = 'voice_board_pictures' and c.contype = 'p' and pg_get_constraintdef(c.oid) not like '%fid%') then
    alter table studio.voice_board_pictures drop constraint voice_board_pictures_pkey;
    alter table studio.voice_board_pictures add primary key (draft_id, fid, shot_key, sha256);
  end if;
end $c$;
alter table studio.voice_board_pictures drop constraint if exists voice_board_pictures_storage_key_check;
alter table studio.voice_board_pictures drop constraint if exists voice_board_pictures_storage_key_owner_check;
alter table studio.voice_board_pictures add constraint voice_board_pictures_storage_key_owner_check check (
  storage_key ~ '^voice-boards/[0-9a-f-]{36}/[a-z0-9]{1,16}-[0-9a-f]{64}\.(png|jpg)$'
  or storage_key like 'voice-boards/' || draft_id::text || '/' || fid::text || '/%' and storage_key ~ '^voice-boards/[0-9a-f-]{36}/[0-9]{1,20}/[a-z0-9]{1,16}-[0-9a-f]{64}\.(png|jpg)$');
create index if not exists voice_board_asks_owner on studio.voice_board_asks (draft_id, fid, shot_key);

-- A ready-made reading's word timings, made once by transcribing the reading's own audio (Nate, 2026-11-21).
create table if not exists studio.voice_reading_timings (
  draft_id uuid primary key references studio.voice_drafts(id),
  made_by bigint not null check (made_by > 0),
  model text not null check (length(model) between 1 and 80),
  timeline jsonb not null check (jsonb_typeof(timeline) = 'object' and timeline ? 'seconds' and timeline ? 'words' and timeline ? 'sentences'),
  check_result jsonb not null check (jsonb_typeof(check_result) = 'object'),
  credits int check (credits >= 0),
  transcript_deleted boolean not null,
  made_at timestamptz not null default now()
);
alter table studio.voice_reading_timings enable row level security;
drop policy if exists writer_insert on studio.voice_reading_timings;
drop policy if exists writer_read on studio.voice_reading_timings;
create policy writer_insert on studio.voice_reading_timings for insert to studio_writer with check (true);
create policy writer_read on studio.voice_reading_timings for select to studio_writer using (true);
revoke all on studio.voice_reading_timings from anon, authenticated;
grant select, insert on studio.voice_reading_timings to studio_writer;
revoke update, delete, truncate on studio.voice_reading_timings from studio_writer;

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
-- One live publication per board: a person's board on a draft (many people can publish boards on one reading).
create unique index if not exists voice_publications_live_owner on studio.voice_publications (draft_id, fid) where taken_down_at is null;
create index if not exists voice_publications_fid on studio.voice_publications (fid, published_at desc);
alter table studio.voice_publications enable row level security;
drop policy if exists writer_read on studio.voice_publications;
create policy writer_read on studio.voice_publications for select to studio_writer using (true);
revoke all on studio.voice_publications from anon, authenticated;
grant select on studio.voice_publications to studio_writer;
revoke insert, update, delete, truncate on studio.voice_publications from studio_writer;

create or replace function studio.publish_voice_board(p_id uuid, p_draft uuid, p_fid bigint, p_version int, p_named boolean, p_recipe jsonb, p_files jsonb) returns uuid
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare k text;
begin
  select kind into k from studio.voice_drafts where id = p_draft for update;
  if k is null or (k = 'performance' and not exists (select 1 from studio.voice_drafts where id = p_draft and fid = p_fid and published_at is null)) then
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
  -- A performance is then published (its person can't remove it while public); a shared reading isn't changed.
  if k = 'performance' then update studio.voice_drafts set published_at = now() where id = p_draft; end if;
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
  update studio.voice_drafts set published_at = null where id = d and kind = 'performance';
  return query select f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = p_id;
end $fn$;
revoke all on function studio.take_down_voice_publication(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.take_down_voice_publication(uuid, bigint) to studio_writer;

-- Removing one's own draft: not while it is public, and not while anyone else has a board on it (a shared reading); its
-- own boards, pictures, tries, taken-down publications and timings go with it. Returns every storage key.
create or replace function studio.delete_voice_draft(p_id uuid, p_fid bigint) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if not exists (select 1 from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null) then return; end if;
  if exists (select 1 from studio.voice_publications where draft_id = p_id and taken_down_at is null) then return; end if;
  if exists (select 1 from studio.voice_boards where draft_id = p_id and fid <> p_fid) or exists (select 1 from studio.voice_board_pictures where draft_id = p_id and fid <> p_fid) then return; end if;
  delete from studio.voice_publications where draft_id = p_id and taken_down_at is not null;
  return query delete from studio.voice_board_pictures where draft_id = p_id returning storage_key;
  delete from studio.voice_board_asks where draft_id = p_id;
  delete from studio.voice_boards where draft_id = p_id;
  delete from studio.voice_reading_timings where draft_id = p_id;
  return query delete from studio.voice_draft_audio where draft_id = p_id returning storage_key;
  delete from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null;
end $fn$;
revoke all on function studio.delete_voice_draft(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.delete_voice_draft(uuid, bigint) to studio_writer;

-- Removing one's own board on a draft (a shared reading's, say): its versions, pictures, tries and taken-down
-- publications; not while it is published. Returns the pictures' storage keys.
create or replace function studio.delete_voice_board(p_draft uuid, p_fid bigint) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if exists (select 1 from studio.voice_publications where draft_id = p_draft and fid = p_fid and taken_down_at is null) then return; end if;
  delete from studio.voice_publications where draft_id = p_draft and fid = p_fid and taken_down_at is not null;
  return query delete from studio.voice_board_pictures where draft_id = p_draft and fid = p_fid returning storage_key;
  delete from studio.voice_board_asks where draft_id = p_draft and fid = p_fid;
  delete from studio.voice_boards where draft_id = p_draft and fid = p_fid;
end $fn$;
revoke all on function studio.delete_voice_board(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.delete_voice_board(uuid, bigint) to studio_writer;
rollback;

-- B. MIGRATION: the same SQL, ending in commit.
begin;
alter table studio.voice_boards add column if not exists closing jsonb check (closing is null or jsonb_typeof(closing) = 'object');

-- A board has its own owner (fid): a ready-made reading carries many people's boards, each with its own versions.
alter table studio.voice_boards drop constraint if exists voice_boards_draft_id_version_key;
create unique index if not exists voice_boards_owner_version on studio.voice_boards (draft_id, fid, version);

-- Kept pictures are their board owner's: the owner in the key and in the storage path (voice-boards/<draft>/<fid>/…);
-- rows kept before this keep their old path and get the draft's own person as owner.
alter table studio.voice_board_pictures add column if not exists fid bigint;
update studio.voice_board_pictures p set fid = d.fid from studio.voice_drafts d where d.id = p.draft_id and p.fid is null;
alter table studio.voice_board_pictures alter column fid set not null;
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'voice_board_pictures_fid_check') then
    alter table studio.voice_board_pictures add constraint voice_board_pictures_fid_check check (fid > 0);
  end if;
  if exists (select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
             where n.nspname = 'studio' and t.relname = 'voice_board_pictures' and c.contype = 'p' and pg_get_constraintdef(c.oid) not like '%fid%') then
    alter table studio.voice_board_pictures drop constraint voice_board_pictures_pkey;
    alter table studio.voice_board_pictures add primary key (draft_id, fid, shot_key, sha256);
  end if;
end $c$;
alter table studio.voice_board_pictures drop constraint if exists voice_board_pictures_storage_key_check;
alter table studio.voice_board_pictures drop constraint if exists voice_board_pictures_storage_key_owner_check;
alter table studio.voice_board_pictures add constraint voice_board_pictures_storage_key_owner_check check (
  storage_key ~ '^voice-boards/[0-9a-f-]{36}/[a-z0-9]{1,16}-[0-9a-f]{64}\.(png|jpg)$'
  or storage_key like 'voice-boards/' || draft_id::text || '/' || fid::text || '/%' and storage_key ~ '^voice-boards/[0-9a-f-]{36}/[0-9]{1,20}/[a-z0-9]{1,16}-[0-9a-f]{64}\.(png|jpg)$');
create index if not exists voice_board_asks_owner on studio.voice_board_asks (draft_id, fid, shot_key);

-- A ready-made reading's word timings, made once by transcribing the reading's own audio (Nate, 2026-11-21).
create table if not exists studio.voice_reading_timings (
  draft_id uuid primary key references studio.voice_drafts(id),
  made_by bigint not null check (made_by > 0),
  model text not null check (length(model) between 1 and 80),
  timeline jsonb not null check (jsonb_typeof(timeline) = 'object' and timeline ? 'seconds' and timeline ? 'words' and timeline ? 'sentences'),
  check_result jsonb not null check (jsonb_typeof(check_result) = 'object'),
  credits int check (credits >= 0),
  transcript_deleted boolean not null,
  made_at timestamptz not null default now()
);
alter table studio.voice_reading_timings enable row level security;
drop policy if exists writer_insert on studio.voice_reading_timings;
drop policy if exists writer_read on studio.voice_reading_timings;
create policy writer_insert on studio.voice_reading_timings for insert to studio_writer with check (true);
create policy writer_read on studio.voice_reading_timings for select to studio_writer using (true);
revoke all on studio.voice_reading_timings from anon, authenticated;
grant select, insert on studio.voice_reading_timings to studio_writer;
revoke update, delete, truncate on studio.voice_reading_timings from studio_writer;

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
-- One live publication per board: a person's board on a draft (many people can publish boards on one reading).
create unique index if not exists voice_publications_live_owner on studio.voice_publications (draft_id, fid) where taken_down_at is null;
create index if not exists voice_publications_fid on studio.voice_publications (fid, published_at desc);
alter table studio.voice_publications enable row level security;
drop policy if exists writer_read on studio.voice_publications;
create policy writer_read on studio.voice_publications for select to studio_writer using (true);
revoke all on studio.voice_publications from anon, authenticated;
grant select on studio.voice_publications to studio_writer;
revoke insert, update, delete, truncate on studio.voice_publications from studio_writer;

create or replace function studio.publish_voice_board(p_id uuid, p_draft uuid, p_fid bigint, p_version int, p_named boolean, p_recipe jsonb, p_files jsonb) returns uuid
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare k text;
begin
  select kind into k from studio.voice_drafts where id = p_draft for update;
  if k is null or (k = 'performance' and not exists (select 1 from studio.voice_drafts where id = p_draft and fid = p_fid and published_at is null)) then
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
  -- A performance is then published (its person can't remove it while public); a shared reading isn't changed.
  if k = 'performance' then update studio.voice_drafts set published_at = now() where id = p_draft; end if;
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
  update studio.voice_drafts set published_at = null where id = d and kind = 'performance';
  return query select f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = p_id;
end $fn$;
revoke all on function studio.take_down_voice_publication(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.take_down_voice_publication(uuid, bigint) to studio_writer;

-- Removing one's own draft: not while it is public, and not while anyone else has a board on it (a shared reading); its
-- own boards, pictures, tries, taken-down publications and timings go with it. Returns every storage key.
create or replace function studio.delete_voice_draft(p_id uuid, p_fid bigint) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if not exists (select 1 from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null) then return; end if;
  if exists (select 1 from studio.voice_publications where draft_id = p_id and taken_down_at is null) then return; end if;
  if exists (select 1 from studio.voice_boards where draft_id = p_id and fid <> p_fid) or exists (select 1 from studio.voice_board_pictures where draft_id = p_id and fid <> p_fid) then return; end if;
  delete from studio.voice_publications where draft_id = p_id and taken_down_at is not null;
  return query delete from studio.voice_board_pictures where draft_id = p_id returning storage_key;
  delete from studio.voice_board_asks where draft_id = p_id;
  delete from studio.voice_boards where draft_id = p_id;
  delete from studio.voice_reading_timings where draft_id = p_id;
  return query delete from studio.voice_draft_audio where draft_id = p_id returning storage_key;
  delete from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null;
end $fn$;
revoke all on function studio.delete_voice_draft(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.delete_voice_draft(uuid, bigint) to studio_writer;

-- Removing one's own board on a draft (a shared reading's, say): its versions, pictures, tries and taken-down
-- publications; not while it is published. Returns the pictures' storage keys.
create or replace function studio.delete_voice_board(p_draft uuid, p_fid bigint) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if exists (select 1 from studio.voice_publications where draft_id = p_draft and fid = p_fid and taken_down_at is null) then return; end if;
  delete from studio.voice_publications where draft_id = p_draft and fid = p_fid and taken_down_at is not null;
  return query delete from studio.voice_board_pictures where draft_id = p_draft and fid = p_fid returning storage_key;
  delete from studio.voice_board_asks where draft_id = p_draft and fid = p_fid;
  delete from studio.voice_boards where draft_id = p_draft and fid = p_fid;
end $fn$;
revoke all on function studio.delete_voice_board(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.delete_voice_board(uuid, bigint) to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Expect "READ-BACK PASSED".
begin;
do $$
declare r uuid; perf uuid; p uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); p3 uuid := gen_random_uuid(); n int; k text;
begin
  -- As postgres: the SQL Editor can't SET ROLE studio_writer (0030, 0040, 0044), so its rights are read by definition.
  if to_regclass('studio.voice_reading_timings') is null or to_regclass('studio.voice_publications') is null then raise exception 'a table is missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'voice_boards' and column_name = 'closing')
     or not exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'voice_board_pictures' and column_name = 'fid') then
    raise exception 'a new column is missing'; end if;
  foreach k in array array['voice_publications', 'voice_reading_timings'] loop
    if has_table_privilege('anon', 'studio.' || k, 'select') or has_table_privilege('authenticated', 'studio.' || k, 'select') then raise exception 'anon or authenticated can read %', k; end if;
    if has_table_privilege('studio_writer', 'studio.' || k, 'update') or has_table_privilege('studio_writer', 'studio.' || k, 'delete') or has_table_privilege('studio_writer', 'studio.' || k, 'truncate') then
      raise exception 'studio_writer can change or delete %', k; end if;
  end loop;
  if has_table_privilege('studio_writer', 'studio.voice_publications', 'insert') then raise exception 'studio_writer can insert a publication directly'; end if;
  if not has_table_privilege('studio_writer', 'studio.voice_reading_timings', 'insert') then raise exception 'studio_writer cannot keep a reading''s timings'; end if;
  foreach k in array array['studio.publish_voice_board(uuid, uuid, bigint, int, boolean, jsonb, jsonb)', 'studio.take_down_voice_publication(uuid, bigint)', 'studio.delete_voice_draft(uuid, bigint)', 'studio.delete_voice_board(uuid, bigint)'] loop
    if not has_function_privilege('studio_writer', k, 'execute') or has_function_privilege('anon', k, 'execute') or has_function_privilege('authenticated', k, 'execute') then
      raise exception '% is not studio_writer''s alone', k; end if;
  end loop;

  -- A shared ready-made reading (made by 6786), its timings, and two people's boards on it.
  insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (6786, 'reading', 'ephelion-c13-b64', 'ephelion-warm-lecturer',
    jsonb_build_object('provider', 'ElevenLabs', 'model', 'eleven_multilingual_v2', 'textSha256', repeat('d', 64))) returning id into r;
  insert into studio.voice_draft_audio (draft_id, n, role, storage_key, bytes, sha256) values (r, 0, 'reading', 'voice-drafts/' || r || '/0-' || repeat('b', 64) || '.mp3', 2336434, repeat('b', 64));
  insert into studio.voice_reading_timings (draft_id, made_by, model, timeline, check_result, credits, transcript_deleted)
    values (r, 6786, 'scribe_v3', '{"seconds":144.1,"words":[],"sentences":[{"n":0,"start":0,"end":4.2}]}', '{"sentences":28,"matched":28,"unmatched":[]}', 55, true);
  insert into studio.voice_boards (draft_id, fid, version, cuts, shots) values (r, 6786, 1, '[8.4]', '[{"key":"s1"}]');
  insert into studio.voice_boards (draft_id, fid, version, cuts, shots) values (r, 193912, 1, '[9.1]', '[{"key":"s1"}]'), (r, 193912, 2, '[9.1, 20]', '[{"key":"s1"}]');
  insert into studio.voice_board_pictures (draft_id, fid, shot_key, sha256, storage_key, bytes, recipe) values
    (r, 6786, 's1', repeat('e', 64), 'voice-boards/' || r || '/6786/s1-' || repeat('e', 64) || '.png', 412345, '{"model":"m","prompt":"p"}'),
    (r, 193912, 's1', repeat('e', 64), 'voice-boards/' || r || '/193912/s1-' || repeat('e', 64) || '.png', 412345, '{"model":"m","prompt":"p"}');
  begin insert into studio.voice_boards (draft_id, fid, version, cuts, shots) values (r, 193912, 2, '[]', '[]'); raise exception 'a second version 2 for one owner accepted';
  exception when unique_violation then null; end;
  begin insert into studio.voice_board_pictures (draft_id, fid, shot_key, sha256, storage_key, bytes, recipe) values (r, 4242, 's1', repeat('f', 64), 'voice-boards/' || r || '/193912/s1-' || repeat('f', 64) || '.png', 10, '{"model":"m","prompt":"p"}');
    raise exception 'a picture under someone else''s folder accepted';
  exception when check_violation then null; end;
  begin insert into studio.voice_reading_timings (draft_id, made_by, model, timeline, check_result, transcript_deleted) values (r, 6786, 'm', '{"seconds":1}', '{}', true); raise exception 'a second timing (or one without words) accepted';
  exception when unique_violation or check_violation then null; end;

  -- Publishing a board of the reading: its owner's latest version only; once; not by someone with no board.
  begin perform studio.publish_voice_board(p, r, 193912, 1, true, '{"voice":{},"shots":[],"closing":{}}', jsonb_build_array(jsonb_build_object('key', 'storyboards/' || p || '/audio-0-' || repeat('b', 64) || '.mp3', 'sha256', repeat('b', 64)), jsonb_build_object('key', 'storyboards/' || p || '/closing-' || repeat('c', 64) || '.png', 'sha256', repeat('c', 64))));
    raise exception 'an older version was published';
  exception when sqlstate 'P0002' then null; end;
  begin perform studio.publish_voice_board(p, r, 4242, 1, true, '{"voice":{},"shots":[],"closing":{}}', '[]'); raise exception 'someone with no board published';
  exception when sqlstate 'P0002' then null; end;
  perform studio.publish_voice_board(p, r, 193912, 2, true, jsonb_build_object('voice', jsonb_build_object('kind', 'reading'), 'shots', '[]'::jsonb, 'closing', '{}'::jsonb),
    jsonb_build_array(jsonb_build_object('role', 'audio', 'key', 'storyboards/' || p || '/audio-0-' || repeat('b', 64) || '.mp3', 'sha256', repeat('b', 64)),
                      jsonb_build_object('role', 'closing', 'key', 'storyboards/' || p || '/closing-' || repeat('c', 64) || '.png', 'sha256', repeat('c', 64))));
  if (select published_at from studio.voice_drafts where id = r) is not null then raise exception 'a shared reading was marked published'; end if;
  begin perform studio.publish_voice_board(p2, r, 193912, 2, true, '{"voice":{},"shots":[],"closing":{}}', '[]'); raise exception 'published twice';
  exception when sqlstate 'P0002' then null; end;
  -- Its maker can't remove the reading while others' boards (and a publication) are on it; the publisher can't remove a public board.
  select count(*) into n from studio.delete_voice_draft(r, 6786);
  if n <> 0 or not exists (select 1 from studio.voice_drafts where id = r) then raise exception 'a reading with others'' boards was removed'; end if;
  select count(*) into n from studio.delete_voice_board(r, 193912);
  if n <> 0 or not exists (select 1 from studio.voice_boards where draft_id = r and fid = 193912) then raise exception 'a published board was removed'; end if;
  select count(*) into n from studio.take_down_voice_publication(p, 193912);
  if n <> 2 then raise exception 'the take-down did not return its keys (%)', n; end if;
  select count(*) into n from studio.delete_voice_board(r, 193912);
  if n <> 1 or exists (select 1 from studio.voice_boards where draft_id = r and fid = 193912) or exists (select 1 from studio.voice_publications where draft_id = r and fid = 193912) then
    raise exception 'the board was not fully removed (% keys)', n; end if;
  if not exists (select 1 from studio.voice_boards where draft_id = r and fid = 6786) then raise exception 'removing one board took another'; end if;
  select count(*) into n from studio.delete_voice_draft(r, 6786);
  if n <> 2 or exists (select 1 from studio.voice_drafts where id = r) or exists (select 1 from studio.voice_reading_timings where draft_id = r) then
    raise exception 'the reading was not fully removed (% keys)', n; end if;

  -- A performance: only its person publishes it; then it is published; a take-down makes it a draft again.
  insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (6786, 'performance', 'ephelion-c13-b64', 'ephelion-warm-lecturer',
    jsonb_build_object('provider', 'ElevenLabs', 'model', 'eleven_multilingual_sts_v2', 'takes', jsonb_build_array(jsonb_build_object('role', 'take', 'takeSha256', repeat('a', 64))))) returning id into perf;
  insert into studio.voice_boards (draft_id, fid, version, cuts, shots) values (perf, 6786, 1, '[]', '[]');
  begin perform studio.publish_voice_board(p3, perf, 193912, 1, true, '{"voice":{},"shots":[],"closing":{}}', '[]'); raise exception 'someone else published a performance';
  exception when sqlstate 'P0002' then null; end;
  perform studio.publish_voice_board(p3, perf, 6786, 1, true, '{"voice":{},"shots":[],"closing":{}}',
    jsonb_build_array(jsonb_build_object('key', 'storyboards/' || p3 || '/audio-0-' || repeat('b', 64) || '.mp3', 'sha256', repeat('b', 64)), jsonb_build_object('key', 'storyboards/' || p3 || '/closing-' || repeat('c', 64) || '.png', 'sha256', repeat('c', 64))));
  if (select published_at from studio.voice_drafts where id = perf) is null then raise exception 'the performance was not marked published'; end if;
  select count(*) into n from studio.delete_voice_draft(perf, 6786);
  if n <> 0 or not exists (select 1 from studio.voice_drafts where id = perf) then raise exception 'a published performance was removed'; end if;
  select count(*) into n from studio.take_down_voice_publication(p3, 6786);
  if n <> 2 or (select published_at from studio.voice_drafts where id = perf) is not null then raise exception 'the performance take-down was incomplete'; end if;
  delete from studio.voice_publications where draft_id = perf;
  delete from studio.voice_boards where draft_id = perf;
  delete from studio.voice_drafts where id = perf;
  raise notice 'READ-BACK PASSED';
end $$;
rollback;

-- D. UNDO (only if the release is withdrawn), as postgres. Paste the lines below without their "-- ". It refuses once any
--    storyboard was published, or boards on others' readings or pictures kept under their owner exist (export and ask
--    the owner first); otherwise it puts back 0044's shape.
-- begin;
-- do $$
-- begin
--   if exists (select 1 from studio.voice_publications) then raise exception 'UNDO REFUSED: storyboards have been published; nothing is deleted'; end if;
--   if exists (select 1 from studio.voice_boards b join studio.voice_drafts d on d.id = b.draft_id where b.fid <> d.fid)
--      or exists (select 1 from studio.voice_board_pictures where storage_key ~ '^voice-boards/[0-9a-f-]{36}/[0-9]{1,20}/') then
--     raise exception 'UNDO REFUSED: boards on others'' readings or pictures kept under their owner exist; nothing is deleted'; end if;
-- end;
-- $$;
-- drop function if exists studio.delete_voice_board(uuid, bigint);
-- drop function if exists studio.take_down_voice_publication(uuid, bigint);
-- drop function if exists studio.publish_voice_board(uuid, uuid, bigint, int, boolean, jsonb, jsonb);
-- drop table if exists studio.voice_publications;
-- drop table if exists studio.voice_reading_timings;
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
-- alter table studio.voice_board_pictures drop constraint if exists voice_board_pictures_storage_key_owner_check;
-- alter table studio.voice_board_pictures drop constraint voice_board_pictures_pkey;
-- alter table studio.voice_board_pictures add primary key (draft_id, shot_key, sha256);
-- alter table studio.voice_board_pictures drop column fid;
-- alter table studio.voice_board_pictures add constraint voice_board_pictures_storage_key_check check (storage_key ~ '^voice-boards/[0-9a-f-]{36}/[a-z0-9]{1,16}-[0-9a-f]{64}\.(png|jpg)$');
-- drop index if exists studio.voice_board_asks_owner;
-- drop index if exists studio.voice_boards_owner_version;
-- alter table studio.voice_boards add constraint voice_boards_draft_id_version_key unique (draft_id, version);
-- alter table studio.voice_boards drop column if exists closing;
-- commit;
