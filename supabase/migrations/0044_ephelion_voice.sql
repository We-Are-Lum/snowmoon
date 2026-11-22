-- 0044_ephelion_voice.sql: the Ephelion voice slice 1 (Nate, 2026-11-19, branch ephelion-voice): what its ElevenLabs
-- calls cost, as daily totals, and the drafts a person accepts. Numbered 0044 at merge (2026-11-21; main's highest was
-- 0043); it was NEXT_ephelion_voice.sql, and before that NEXT_voice_costs.sql (2026-11-19); the draft tables were added
-- on 2026-11-20, the storyboard tables on 2026-11-21. Drafted by the coding agent (Claude, a closed model by Anthropic);
-- tested in PGlite by the agent (npm run test:voice) and by the coordinator on Postgres (2026-11-21: dry run clean,
-- applies twice, read-back passes, the undo refuses while drafts exist and otherwise removes only the voice tables).
-- APPLIED on production by Nate on 2026-11-21: parts A and B ran; part C as first drafted stopped at "permission denied
-- to set role studio_writer" (the SQL Editor can't SET ROLE, as 0030 and 0040 note) after its earlier checks passed. Part
-- C below checks studio_writer's rights without SET ROLE and is what ran next.
-- Requires 0001_core (the studio schema, studio_writer).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: a read-only look, then realistic rows inserted and deleted inside a transaction
-- that ends in `rollback;`; it ends "READ-BACK PASSED"), and D. the undo, only if the release is withdrawn. Safe to run
-- twice.
--
-- What it adds. None of it is readable by anon or authenticated; studio_writer may select and insert (and update the
-- day totals only), never delete or truncate.
-- 1. studio.voice_costs, a sibling of studio.image_costs (0008): daily totals per kind of call, model, funding and
--    verdict, with no FID, no request id, no time of day and no row per call, so no cost can be matched to a person, a
--    recording or a request. The caps (src/lib/config.ts VOICE.caps) sum it. A call first adds its worst case to
--    'reserved', then moves it to its real cost. estimated_credits is kept beside credits for the owner's rule
--    (2026-11-20): more than 20% over the estimate stops the next call.
--    kind: 'convert' (speech-to-speech), 'transcribe' (speech-to-text of the converted audio, never the raw take),
--    'reading' (text-to-speech of a speech in a preset), 'design' (Voice Design, made by an admin), 'reserved'.
-- 2. studio.voice_asks: one row per whole-take conversion, the FID and the time, for the per-person daily limit only.
-- 3. studio.voice_drafts: a converted speech a person accepted (kind 'performance'), or a ready-made reading an admin
--    made (kind 'reading'): who, when, the speech, the preset, and the recipe (provider, models, settings, the sha256 of
--    each raw take and of each converted file, the word check). Private: it is a draft until its person publishes it
--    (a later slice). Never a raw take: the table has no place for one, and the recipe holds only its sha256.
-- 4. studio.voice_draft_audio: a draft's audio files, in order: the whole converted take, then any redone sentence
--    (each with the sentence it replaces and where), or the reading: where the MP3 is in private storage (the private
--    R2 bucket, under voice-drafts/, never public; served only through the signed-in route), its sha256, size and
--    length. No audio bytes in the database (Nate, 2026-11-20 morning).
-- 5. Removing a draft (Nate, 2026-11-20 morning): studio.delete_voice_draft(id, fid) deletes one draft and its audio
--    rows, only if that person made it and it is unpublished (published_at is null; the publish slice sets it), and
--    returns the storage keys, so the site deletes the files too. studio_writer can't delete voice rows any other way.
-- 7. Slice 2 (2026-11-21): studio.voice_boards, a performance's storyboard as versions (cut times; each shot's own
--    words, camera and sheets), and studio.voice_board_pictures, the picture kept for a shot (its recipe; the file in
--    private storage under voice-boards/), and studio.voice_board_asks, one row per picture made for a shot (the limit of
--    3 tries a shot). New rows only; removing the draft removes them, files included.
-- 6. voice_asks are kept for the day only: studio_writer may delete rows from before today (UTC), and nothing else; the
--    site does it at most once an hour (src/lib/voice/costs.ts), as Minpentai's daily counts.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.voice_costs (
  day date not null default ((now() at time zone 'utc')::date),
  kind text not null check (kind in ('convert', 'transcribe', 'reading', 'design', 'reserved')),
  model text not null check (length(model) between 1 and 80),
  provider text not null default 'elevenlabs' check (provider = 'elevenlabs'),
  funded text not null default 'free' check (funded in ('free', 'admin')),
  verdict text not null default '' check (verdict in ('', 'ok', 'failed')),
  calls int not null default 0,
  seconds numeric(12, 2) not null default 0,
  characters int not null default 0,
  credits int not null default 0,
  estimated_credits int not null default 0,
  cost_usd numeric(14, 8) not null default 0,
  primary key (day, funded, kind, model, verdict),
  check (kind = 'reserved' or (calls >= 0 and seconds >= 0 and characters >= 0 and credits >= 0 and estimated_credits >= 0 and cost_usd >= 0)),
  check ((kind = 'reserved') = (verdict = ''))
);
alter table studio.voice_costs enable row level security;
drop policy if exists writer_insert on studio.voice_costs;
drop policy if exists writer_read on studio.voice_costs;
drop policy if exists writer_update on studio.voice_costs;
create policy writer_insert on studio.voice_costs for insert to studio_writer with check (true);
create policy writer_read on studio.voice_costs for select to studio_writer using (true);
create policy writer_update on studio.voice_costs for update to studio_writer using (true) with check (true);
revoke all on studio.voice_costs from anon, authenticated;
grant select, insert, update on studio.voice_costs to studio_writer;
revoke delete, truncate on studio.voice_costs from studio_writer;

create table if not exists studio.voice_asks (
  fid bigint not null check (fid > 0),
  at timestamptz not null default now()
);
create index if not exists voice_asks_fid_at on studio.voice_asks (fid, at);
alter table studio.voice_asks enable row level security;
drop policy if exists writer_insert on studio.voice_asks;
drop policy if exists writer_read on studio.voice_asks;
create policy writer_insert on studio.voice_asks for insert to studio_writer with check (true);
create policy writer_read on studio.voice_asks for select to studio_writer using (true);
drop policy if exists writer_purge on studio.voice_asks;
create policy writer_purge on studio.voice_asks for delete to studio_writer using ((at at time zone 'utc')::date < (now() at time zone 'utc')::date);
revoke all on studio.voice_asks from anon, authenticated;
grant select, insert, delete on studio.voice_asks to studio_writer;
revoke update, truncate on studio.voice_asks from studio_writer;

create table if not exists studio.voice_drafts (
  id uuid primary key default gen_random_uuid(),
  fid bigint not null check (fid > 0),
  kind text not null check (kind in ('performance', 'reading')),
  speech_id text not null check (speech_id ~ '^[a-z0-9-]{1,80}$'),
  preset_id text not null check (preset_id ~ '^[a-z0-9-]{1,80}$'),
  made_at timestamptz not null default now(),
  -- Set by the publish slice; until then every draft is unpublished, and its person may remove it.
  published_at timestamptz,
  recipe jsonb not null check (jsonb_typeof(recipe) = 'object' and recipe ? 'provider' and recipe ? 'model'),
  -- A performance's recipe names every raw take by its sha256 only.
  check (kind = 'reading' or (recipe ? 'takes' and jsonb_typeof(recipe->'takes') = 'array' and jsonb_array_length(recipe->'takes') >= 1))
);
create index if not exists voice_drafts_fid on studio.voice_drafts (fid, made_at desc);
alter table studio.voice_drafts enable row level security;
drop policy if exists writer_insert on studio.voice_drafts;
drop policy if exists writer_read on studio.voice_drafts;
create policy writer_insert on studio.voice_drafts for insert to studio_writer with check (true);
create policy writer_read on studio.voice_drafts for select to studio_writer using (true);
revoke all on studio.voice_drafts from anon, authenticated;
grant select, insert on studio.voice_drafts to studio_writer;
revoke update, delete, truncate on studio.voice_drafts from studio_writer;

create table if not exists studio.voice_draft_audio (
  draft_id uuid not null references studio.voice_drafts(id),
  n int not null check (n between 0 and 99),
  role text not null check (role in ('take', 'redo', 'reading')),
  -- For a redo: the sentence it replaces, and where in the take (seconds).
  sentence int check (sentence between 0 and 999),
  replaces_start numeric(8, 3),
  replaces_end numeric(8, 3),
  storage_key text not null unique check (storage_key ~ '^voice-drafts/[0-9a-f-]{36}/[0-9]{1,2}-[0-9a-f]{64}\.mp3$'),
  bytes int not null check (bytes between 1 and 4500000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  seconds numeric(8, 2) check (seconds between 0 and 600),
  primary key (draft_id, n),
  check (storage_key like 'voice-drafts/' || draft_id::text || '/%'),
  check ((role = 'redo') = (sentence is not null)),
  check (role <> 'redo' or (replaces_start is not null and replaces_end is not null and replaces_end >= replaces_start))
);
alter table studio.voice_draft_audio enable row level security;
drop policy if exists writer_insert on studio.voice_draft_audio;
drop policy if exists writer_read on studio.voice_draft_audio;
create policy writer_insert on studio.voice_draft_audio for insert to studio_writer with check (true);
create policy writer_read on studio.voice_draft_audio for select to studio_writer using (true);
revoke all on studio.voice_draft_audio from anon, authenticated;
grant select, insert on studio.voice_draft_audio to studio_writer;
revoke update, delete, truncate on studio.voice_draft_audio from studio_writer;


-- Slice 2 (2026-11-21): a performance's storyboard, as versions (new rows only), and the pictures kept for its shots.
create table if not exists studio.voice_boards (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references studio.voice_drafts(id),
  fid bigint not null check (fid > 0),
  version int not null check (version between 1 and 10000),
  made_at timestamptz not null default now(),
  -- Cut times (seconds) and the shots between them: the person's own words for each, the camera, the sheets used.
  cuts jsonb not null check (jsonb_typeof(cuts) = 'array'),
  shots jsonb not null check (jsonb_typeof(shots) = 'array'),
  unique (draft_id, version)
);
alter table studio.voice_boards enable row level security;
drop policy if exists writer_insert on studio.voice_boards;
drop policy if exists writer_read on studio.voice_boards;
create policy writer_insert on studio.voice_boards for insert to studio_writer with check (true);
create policy writer_read on studio.voice_boards for select to studio_writer using (true);
revoke all on studio.voice_boards from anon, authenticated;
grant select, insert on studio.voice_boards to studio_writer;
revoke update, delete, truncate on studio.voice_boards from studio_writer;

create table if not exists studio.voice_board_pictures (
  draft_id uuid not null references studio.voice_drafts(id),
  shot_key text not null check (shot_key ~ '^[a-z0-9]{1,16}$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text not null unique check (storage_key ~ '^voice-boards/[0-9a-f-]{36}/[a-z0-9]{1,16}-[0-9a-f]{64}\.(png|jpg)$'),
  bytes int not null check (bytes between 1 and 8000000),
  recipe jsonb not null check (jsonb_typeof(recipe) = 'object' and recipe ? 'model' and recipe ? 'prompt'),
  kept_at timestamptz not null default now(),
  primary key (draft_id, shot_key, sha256),
  check (storage_key like 'voice-boards/' || draft_id::text || '/%')
);
alter table studio.voice_board_pictures enable row level security;
drop policy if exists writer_insert on studio.voice_board_pictures;
drop policy if exists writer_read on studio.voice_board_pictures;
create policy writer_insert on studio.voice_board_pictures for insert to studio_writer with check (true);
create policy writer_read on studio.voice_board_pictures for select to studio_writer using (true);
revoke all on studio.voice_board_pictures from anon, authenticated;
grant select, insert on studio.voice_board_pictures to studio_writer;
revoke update, delete, truncate on studio.voice_board_pictures from studio_writer;

-- Pictures made for a storyboard's shots (2026-11-21): one row per picture made, for the 3-tries-per-shot limit.
create table if not exists studio.voice_board_asks (
  draft_id uuid not null references studio.voice_drafts(id),
  shot_key text not null check (shot_key ~ '^[a-z0-9]{1,16}$'),
  fid bigint not null check (fid > 0),
  at timestamptz not null default now()
);
create index if not exists voice_board_asks_shot on studio.voice_board_asks (draft_id, shot_key);
alter table studio.voice_board_asks enable row level security;
drop policy if exists writer_insert on studio.voice_board_asks;
drop policy if exists writer_read on studio.voice_board_asks;
create policy writer_insert on studio.voice_board_asks for insert to studio_writer with check (true);
create policy writer_read on studio.voice_board_asks for select to studio_writer using (true);
revoke all on studio.voice_board_asks from anon, authenticated;
grant select, insert on studio.voice_board_asks to studio_writer;
revoke update, delete, truncate on studio.voice_board_asks from studio_writer;

-- Removing one's own unpublished draft: the only way a draft row is deleted. Its storyboards and kept pictures go with it;
-- it returns every storage key (audio and pictures), so the site deletes the files too.
create or replace function studio.delete_voice_draft(p_id uuid, p_fid bigint) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if not exists (select 1 from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null) then return; end if;
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
create table if not exists studio.voice_costs (
  day date not null default ((now() at time zone 'utc')::date),
  kind text not null check (kind in ('convert', 'transcribe', 'reading', 'design', 'reserved')),
  model text not null check (length(model) between 1 and 80),
  provider text not null default 'elevenlabs' check (provider = 'elevenlabs'),
  funded text not null default 'free' check (funded in ('free', 'admin')),
  verdict text not null default '' check (verdict in ('', 'ok', 'failed')),
  calls int not null default 0,
  seconds numeric(12, 2) not null default 0,
  characters int not null default 0,
  credits int not null default 0,
  estimated_credits int not null default 0,
  cost_usd numeric(14, 8) not null default 0,
  primary key (day, funded, kind, model, verdict),
  check (kind = 'reserved' or (calls >= 0 and seconds >= 0 and characters >= 0 and credits >= 0 and estimated_credits >= 0 and cost_usd >= 0)),
  check ((kind = 'reserved') = (verdict = ''))
);
alter table studio.voice_costs enable row level security;
drop policy if exists writer_insert on studio.voice_costs;
drop policy if exists writer_read on studio.voice_costs;
drop policy if exists writer_update on studio.voice_costs;
create policy writer_insert on studio.voice_costs for insert to studio_writer with check (true);
create policy writer_read on studio.voice_costs for select to studio_writer using (true);
create policy writer_update on studio.voice_costs for update to studio_writer using (true) with check (true);
revoke all on studio.voice_costs from anon, authenticated;
grant select, insert, update on studio.voice_costs to studio_writer;
revoke delete, truncate on studio.voice_costs from studio_writer;

create table if not exists studio.voice_asks (
  fid bigint not null check (fid > 0),
  at timestamptz not null default now()
);
create index if not exists voice_asks_fid_at on studio.voice_asks (fid, at);
alter table studio.voice_asks enable row level security;
drop policy if exists writer_insert on studio.voice_asks;
drop policy if exists writer_read on studio.voice_asks;
create policy writer_insert on studio.voice_asks for insert to studio_writer with check (true);
create policy writer_read on studio.voice_asks for select to studio_writer using (true);
drop policy if exists writer_purge on studio.voice_asks;
create policy writer_purge on studio.voice_asks for delete to studio_writer using ((at at time zone 'utc')::date < (now() at time zone 'utc')::date);
revoke all on studio.voice_asks from anon, authenticated;
grant select, insert, delete on studio.voice_asks to studio_writer;
revoke update, truncate on studio.voice_asks from studio_writer;

create table if not exists studio.voice_drafts (
  id uuid primary key default gen_random_uuid(),
  fid bigint not null check (fid > 0),
  kind text not null check (kind in ('performance', 'reading')),
  speech_id text not null check (speech_id ~ '^[a-z0-9-]{1,80}$'),
  preset_id text not null check (preset_id ~ '^[a-z0-9-]{1,80}$'),
  made_at timestamptz not null default now(),
  -- Set by the publish slice; until then every draft is unpublished, and its person may remove it.
  published_at timestamptz,
  recipe jsonb not null check (jsonb_typeof(recipe) = 'object' and recipe ? 'provider' and recipe ? 'model'),
  -- A performance's recipe names every raw take by its sha256 only.
  check (kind = 'reading' or (recipe ? 'takes' and jsonb_typeof(recipe->'takes') = 'array' and jsonb_array_length(recipe->'takes') >= 1))
);
create index if not exists voice_drafts_fid on studio.voice_drafts (fid, made_at desc);
alter table studio.voice_drafts enable row level security;
drop policy if exists writer_insert on studio.voice_drafts;
drop policy if exists writer_read on studio.voice_drafts;
create policy writer_insert on studio.voice_drafts for insert to studio_writer with check (true);
create policy writer_read on studio.voice_drafts for select to studio_writer using (true);
revoke all on studio.voice_drafts from anon, authenticated;
grant select, insert on studio.voice_drafts to studio_writer;
revoke update, delete, truncate on studio.voice_drafts from studio_writer;

create table if not exists studio.voice_draft_audio (
  draft_id uuid not null references studio.voice_drafts(id),
  n int not null check (n between 0 and 99),
  role text not null check (role in ('take', 'redo', 'reading')),
  -- For a redo: the sentence it replaces, and where in the take (seconds).
  sentence int check (sentence between 0 and 999),
  replaces_start numeric(8, 3),
  replaces_end numeric(8, 3),
  storage_key text not null unique check (storage_key ~ '^voice-drafts/[0-9a-f-]{36}/[0-9]{1,2}-[0-9a-f]{64}\.mp3$'),
  bytes int not null check (bytes between 1 and 4500000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  seconds numeric(8, 2) check (seconds between 0 and 600),
  primary key (draft_id, n),
  check (storage_key like 'voice-drafts/' || draft_id::text || '/%'),
  check ((role = 'redo') = (sentence is not null)),
  check (role <> 'redo' or (replaces_start is not null and replaces_end is not null and replaces_end >= replaces_start))
);
alter table studio.voice_draft_audio enable row level security;
drop policy if exists writer_insert on studio.voice_draft_audio;
drop policy if exists writer_read on studio.voice_draft_audio;
create policy writer_insert on studio.voice_draft_audio for insert to studio_writer with check (true);
create policy writer_read on studio.voice_draft_audio for select to studio_writer using (true);
revoke all on studio.voice_draft_audio from anon, authenticated;
grant select, insert on studio.voice_draft_audio to studio_writer;
revoke update, delete, truncate on studio.voice_draft_audio from studio_writer;


-- Slice 2 (2026-11-21): a performance's storyboard, as versions (new rows only), and the pictures kept for its shots.
create table if not exists studio.voice_boards (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references studio.voice_drafts(id),
  fid bigint not null check (fid > 0),
  version int not null check (version between 1 and 10000),
  made_at timestamptz not null default now(),
  -- Cut times (seconds) and the shots between them: the person's own words for each, the camera, the sheets used.
  cuts jsonb not null check (jsonb_typeof(cuts) = 'array'),
  shots jsonb not null check (jsonb_typeof(shots) = 'array'),
  unique (draft_id, version)
);
alter table studio.voice_boards enable row level security;
drop policy if exists writer_insert on studio.voice_boards;
drop policy if exists writer_read on studio.voice_boards;
create policy writer_insert on studio.voice_boards for insert to studio_writer with check (true);
create policy writer_read on studio.voice_boards for select to studio_writer using (true);
revoke all on studio.voice_boards from anon, authenticated;
grant select, insert on studio.voice_boards to studio_writer;
revoke update, delete, truncate on studio.voice_boards from studio_writer;

create table if not exists studio.voice_board_pictures (
  draft_id uuid not null references studio.voice_drafts(id),
  shot_key text not null check (shot_key ~ '^[a-z0-9]{1,16}$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text not null unique check (storage_key ~ '^voice-boards/[0-9a-f-]{36}/[a-z0-9]{1,16}-[0-9a-f]{64}\.(png|jpg)$'),
  bytes int not null check (bytes between 1 and 8000000),
  recipe jsonb not null check (jsonb_typeof(recipe) = 'object' and recipe ? 'model' and recipe ? 'prompt'),
  kept_at timestamptz not null default now(),
  primary key (draft_id, shot_key, sha256),
  check (storage_key like 'voice-boards/' || draft_id::text || '/%')
);
alter table studio.voice_board_pictures enable row level security;
drop policy if exists writer_insert on studio.voice_board_pictures;
drop policy if exists writer_read on studio.voice_board_pictures;
create policy writer_insert on studio.voice_board_pictures for insert to studio_writer with check (true);
create policy writer_read on studio.voice_board_pictures for select to studio_writer using (true);
revoke all on studio.voice_board_pictures from anon, authenticated;
grant select, insert on studio.voice_board_pictures to studio_writer;
revoke update, delete, truncate on studio.voice_board_pictures from studio_writer;

-- Pictures made for a storyboard's shots (2026-11-21): one row per picture made, for the 3-tries-per-shot limit.
create table if not exists studio.voice_board_asks (
  draft_id uuid not null references studio.voice_drafts(id),
  shot_key text not null check (shot_key ~ '^[a-z0-9]{1,16}$'),
  fid bigint not null check (fid > 0),
  at timestamptz not null default now()
);
create index if not exists voice_board_asks_shot on studio.voice_board_asks (draft_id, shot_key);
alter table studio.voice_board_asks enable row level security;
drop policy if exists writer_insert on studio.voice_board_asks;
drop policy if exists writer_read on studio.voice_board_asks;
create policy writer_insert on studio.voice_board_asks for insert to studio_writer with check (true);
create policy writer_read on studio.voice_board_asks for select to studio_writer using (true);
revoke all on studio.voice_board_asks from anon, authenticated;
grant select, insert on studio.voice_board_asks to studio_writer;
revoke update, delete, truncate on studio.voice_board_asks from studio_writer;

-- Removing one's own unpublished draft: the only way a draft row is deleted. Its storyboards and kept pictures go with it;
-- it returns every storage key (audio and pictures), so the site deletes the files too.
create or replace function studio.delete_voice_draft(p_id uuid, p_fid bigint) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if not exists (select 1 from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null) then return; end if;
  return query delete from studio.voice_board_pictures where draft_id = p_id returning storage_key;
  delete from studio.voice_board_asks where draft_id = p_id;
  delete from studio.voice_boards where draft_id = p_id;
  return query delete from studio.voice_draft_audio where draft_id = p_id returning storage_key;
  delete from studio.voice_drafts where id = p_id and fid = p_fid and published_at is null;
end $fn$;
revoke all on function studio.delete_voice_draft(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.delete_voice_draft(uuid, bigint) to studio_writer;
commit;

-- C. READ-BACK (after B). Changes nothing: it ends in rollback. Expect "READ-BACK PASSED".
begin;
do $$
declare n int; usd numeric; d uuid; d2 uuid; k text;
begin
  -- The tables and their privileges.
  if to_regclass('studio.voice_costs') is null or to_regclass('studio.voice_asks') is null or to_regclass('studio.voice_drafts') is null or to_regclass('studio.voice_draft_audio') is null
     or to_regclass('studio.voice_boards') is null or to_regclass('studio.voice_board_pictures') is null or to_regclass('studio.voice_board_asks') is null then
    raise exception 'a voice table is missing'; end if;
  if has_table_privilege('anon', 'studio.voice_costs', 'select') or has_table_privilege('anon', 'studio.voice_drafts', 'select') or has_table_privilege('anon', 'studio.voice_draft_audio', 'select') or has_table_privilege('anon', 'studio.voice_asks', 'select') then
    raise exception 'anon can read a voice table'; end if;
  if has_table_privilege('authenticated', 'studio.voice_drafts', 'select') or has_table_privilege('authenticated', 'studio.voice_draft_audio', 'select') then
    raise exception 'authenticated can read a voice table'; end if;
  if not has_table_privilege('studio_writer', 'studio.voice_drafts', 'insert') then raise exception 'studio_writer cannot insert drafts'; end if;
  if has_table_privilege('studio_writer', 'studio.voice_costs', 'delete') or has_table_privilege('studio_writer', 'studio.voice_drafts', 'delete')
     or has_table_privilege('studio_writer', 'studio.voice_draft_audio', 'delete') or has_table_privilege('studio_writer', 'studio.voice_drafts', 'update') then
    raise exception 'studio_writer can delete or change a voice row'; end if;

  -- Realistic cost rows, as the site writes them: a 2.5-minute conversion reserved, then settled; its transcription; a
  -- reading of c13-b64 (about 2,000 characters); an admin's Voice Design round.
  insert into studio.voice_costs (kind, model, funded, verdict, calls, estimated_credits, cost_usd) values ('reserved', 'eleven_multilingual_sts_v2', 'free', '', 1, 2500, 0.4545);
  insert into studio.voice_costs (kind, model, funded, verdict, calls, seconds, credits, estimated_credits, cost_usd)
    values ('convert', 'eleven_multilingual_sts_v2', 'free', 'ok', 1, 152.40, 2540, 2540, 0.4618)
    on conflict (day, funded, kind, model, verdict) do update set calls = studio.voice_costs.calls + excluded.calls,
      seconds = studio.voice_costs.seconds + excluded.seconds, credits = studio.voice_costs.credits + excluded.credits,
      estimated_credits = studio.voice_costs.estimated_credits + excluded.estimated_credits, cost_usd = studio.voice_costs.cost_usd + excluded.cost_usd;
  update studio.voice_costs set calls = calls - 1, estimated_credits = estimated_credits - 2500, cost_usd = cost_usd - 0.4545
    where day = (now() at time zone 'utc')::date and funded = 'free' and kind = 'reserved' and model = 'eleven_multilingual_sts_v2' and verdict = '';
  insert into studio.voice_costs (kind, model, funded, verdict, calls, seconds, cost_usd) values ('transcribe', 'scribe_v1', 'free', 'ok', 1, 150.10, 0.0084)
    on conflict (day, funded, kind, model, verdict) do update set calls = studio.voice_costs.calls + 1;
  insert into studio.voice_costs (kind, model, funded, verdict, calls, characters, credits, estimated_credits, cost_usd) values ('reading', 'eleven_multilingual_v2', 'admin', 'ok', 1, 2010, 2010, 2010, 0.3654)
    on conflict (day, funded, kind, model, verdict) do update set calls = studio.voice_costs.calls + 1;
  insert into studio.voice_costs (kind, model, funded, verdict, calls, characters, cost_usd) values ('design', 'eleven_ttv_v3', 'admin', 'failed', 1, 378, 0)
    on conflict (day, funded, kind, model, verdict) do update set calls = studio.voice_costs.calls + 1;
  insert into studio.voice_asks (fid) values (6786);

  -- A realistic draft: a performance, its whole take and one redone sentence.
  insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (6786, 'performance', 'ephelion-c13-b64', 'ephelion-rally-orator',
    jsonb_build_object('provider', 'ElevenLabs', 'model', 'eleven_multilingual_sts_v2', 'settings', jsonb_build_object('stability', 0.5),
      'takes', jsonb_build_array(jsonb_build_object('role', 'take', 'takeSha256', repeat('a', 64), 'convertedSha256', repeat('b', 64)))))
    returning id into d;
  insert into studio.voice_draft_audio (draft_id, n, role, storage_key, bytes, sha256, seconds) values (d, 0, 'take', 'voice-drafts/' || d || '/0-' || repeat('b', 64) || '.mp3', 2438400, repeat('b', 64), 152.4);
  insert into studio.voice_draft_audio (draft_id, n, role, sentence, replaces_start, replaces_end, storage_key, bytes, sha256, seconds)
    values (d, 1, 'redo', 7, 41.2, 47.9, 'voice-drafts/' || d || '/1-' || repeat('c', 64) || '.mp3', 105600, repeat('c', 64), 6.6);
  insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (193912, 'reading', 'ephelion-c13-b64', 'ephelion-cold-baritone',
    jsonb_build_object('provider', 'ElevenLabs', 'model', 'eleven_multilingual_v2', 'textSha256', repeat('d', 64)));

  -- Refusals: a negative settled cost, an unknown kind, a 'reserved' row with a verdict, a performance with no take, a
  -- redo with no sentence, an unknown audio role.
  begin insert into studio.voice_costs (kind, model, verdict, calls, cost_usd) values ('convert', 'x', 'ok', 1, -1); raise exception 'negative cost accepted';
  exception when check_violation then null; end;
  begin insert into studio.voice_costs (kind, model, verdict) values ('clone', 'x', 'ok'); raise exception 'unknown kind accepted';
  exception when check_violation then null; end;
  begin insert into studio.voice_costs (kind, model, verdict) values ('reserved', 'x', 'ok'); raise exception 'reserved with a verdict accepted';
  exception when check_violation then null; end;
  begin insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (6786, 'performance', 'x', 'y', '{"provider":"ElevenLabs","model":"m"}'); raise exception 'a performance with no take accepted';
  exception when check_violation then null; end;
  begin insert into studio.voice_draft_audio (draft_id, n, role, storage_key, bytes, sha256) values (d, 2, 'redo', 'voice-drafts/' || d || '/2-' || repeat('e', 64) || '.mp3', 10, repeat('e', 64)); raise exception 'a redo with no sentence accepted';
  exception when check_violation then null; end;
  begin insert into studio.voice_draft_audio (draft_id, n, role, storage_key, bytes, sha256) values (d, 3, 'raw', 'voice-drafts/' || d || '/3-' || repeat('e', 64) || '.mp3', 10, repeat('e', 64)); raise exception 'a raw role accepted';
  exception when check_violation then null; end;
  begin insert into studio.voice_draft_audio (draft_id, n, role, storage_key, bytes, sha256) values (d, 4, 'take', 'images/readers/x.mp3', 10, repeat('e', 64)); raise exception 'a key outside voice-drafts/ accepted';
  exception when check_violation then null; end;
  begin insert into studio.voice_draft_audio (draft_id, n, role, storage_key, bytes, sha256) values (d, 5, 'take', 'voice-drafts/00000000-0000-4000-8000-000000000000/5-' || repeat('e', 64) || '.mp3', 10, repeat('e', 64)); raise exception 'a key under another draft accepted';
  exception when check_violation then null; end;

  select count(*), sum(cost_usd) into n, usd from studio.voice_costs where day = (now() at time zone 'utc')::date and funded = 'free';
  if n < 3 then raise exception 'expected the free rows, got %', n; end if;
  select count(*) into n from studio.voice_draft_audio where draft_id = d;
  if n <> 2 then raise exception 'expected 2 audio rows, got %', n; end if;

  -- A storyboard for it, two versions, and a kept picture.
  insert into studio.voice_boards (draft_id, fid, version, cuts, shots) values (d, 6786, 1, '[8.4, 17.9]', '[{"key":"s1","description":"the poster in the tunnel","angle":"wide"}]');
  insert into studio.voice_boards (draft_id, fid, version, cuts, shots) values (d, 6786, 2, '[8.4, 16.2]', '[{"key":"s1","description":"the poster in the tunnel","angle":"low"}]');
  insert into studio.voice_board_pictures (draft_id, shot_key, sha256, storage_key, bytes, recipe) values (d, 's1', repeat('f', 64), 'voice-boards/' || d || '/s1-' || repeat('f', 64) || '.jpg', 412345, '{"model":"gpt-image-2.5-sunburst","prompt":"p"}');
  insert into studio.voice_board_asks (draft_id, shot_key, fid) values (d, 's1', 6786), (d, 's1', 6786);
  begin insert into studio.voice_boards (draft_id, fid, version, cuts, shots) values (d, 6786, 2, '[]', '[]'); raise exception 'a second version 2 accepted';
  exception when unique_violation then null; end;
  begin insert into studio.voice_board_pictures (draft_id, shot_key, sha256, storage_key, bytes, recipe) values (d, 's2', repeat('e', 64), 'images/readers/x.png', 10, '{"model":"m","prompt":"p"}'); raise exception 'a picture key outside voice-boards/ accepted';
  exception when check_violation then null; end;
  -- Removing a draft, as studio_writer: not by someone else, not once published, and then fully (its audio and picture keys back).
  insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe, published_at) values (6786, 'reading', 'ephelion-c13-b64', 'ephelion-cold-baritone',
    jsonb_build_object('provider', 'ElevenLabs', 'model', 'eleven_multilingual_v2', 'textSha256', repeat('9', 64)), now()) returning id into d2;
  insert into studio.voice_asks (fid, at) values (6786, now() - interval '2 days');
  -- As postgres: the Supabase SQL Editor can't SET ROLE studio_writer (0030, 0040; it failed here on 2026-11-21), so
  -- studio_writer's rights are read with has_*_privilege and the policy's own definition, and removal runs as postgres
  -- through the same security-definer function the site calls.
  select count(*) into n from studio.delete_voice_draft(d, 193912);
  if n <> 0 or not exists (select 1 from studio.voice_drafts where id = d) then raise exception 'someone else removed a draft'; end if;
  select count(*) into n from studio.delete_voice_draft(d2, 6786);
  if n <> 0 or not exists (select 1 from studio.voice_drafts where id = d2) then raise exception 'a published draft was removed'; end if;
  select count(*) into n from studio.delete_voice_draft(d, 6786);
  if n <> 3 or exists (select 1 from studio.voice_drafts where id = d) or exists (select 1 from studio.voice_draft_audio where draft_id = d)
     or exists (select 1 from studio.voice_boards where draft_id = d) or exists (select 1 from studio.voice_board_pictures where draft_id = d)
     or exists (select 1 from studio.voice_board_asks where draft_id = d) then
    raise exception 'the draft was not fully removed (% keys)', n; end if;
  foreach k in array array['voice_drafts', 'voice_draft_audio', 'voice_boards', 'voice_board_pictures', 'voice_board_asks'] loop
    if has_table_privilege('studio_writer', 'studio.' || k, 'update') or has_table_privilege('studio_writer', 'studio.' || k, 'delete') or has_table_privilege('studio_writer', 'studio.' || k, 'truncate') then
      raise exception 'studio_writer can change or delete rows of %', k; end if;
  end loop;
  if has_table_privilege('studio_writer', 'studio.voice_costs', 'delete') or has_table_privilege('studio_writer', 'studio.voice_asks', 'update') then
    raise exception 'studio_writer can delete a cost or change a count'; end if;
  if not has_function_privilege('studio_writer', 'studio.delete_voice_draft(uuid, bigint)', 'execute')
     or has_function_privilege('anon', 'studio.delete_voice_draft(uuid, bigint)', 'execute') or has_function_privilege('authenticated', 'studio.delete_voice_draft(uuid, bigint)', 'execute') then
    raise exception 'delete_voice_draft is not studio_writer''s alone'; end if;
  -- The daily counts: studio_writer may delete only rows from before today (UTC): the purge policy's own condition.
  if not has_table_privilege('studio_writer', 'studio.voice_asks', 'delete') or not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'voice_asks'
     and policyname = 'writer_purge' and cmd = 'DELETE' and 'studio_writer' = any(roles) and qual ilike '%now()%utc%' and qual like '%<%') then
    raise exception 'the purge policy is not the before-today one'; end if;
  select count(*) into n from studio.voice_asks where fid = 6786 and (at at time zone 'utc')::date < (now() at time zone 'utc')::date;
  if n <> 1 then raise exception 'the purge condition would take today''s count, or miss the old one (% rows)', n; end if;
  -- And deleted again (as postgres).
  delete from studio.voice_drafts where id = d2;
  delete from studio.voice_drafts where fid = 193912 and recipe->>'textSha256' = repeat('d', 64);
  raise notice 'READ-BACK PASSED (free total today in this transaction was % USD)', usd;
end $$;
rollback;

-- D. UNDO (only if the release is withdrawn), as postgres. Paste the lines below without their "-- ". It removes the
--    voice tables only while there is no voice draft: once anyone has kept a draft (a performance or a reading), it
--    refuses, and nothing is deleted (export the rows and the files under voice-drafts/ and voice-boards/ first, and ask
--    the owner). The day totals and counts go with it.
-- begin;
-- do $$
-- begin
--   if to_regclass('studio.voice_drafts') is not null and exists (select 1 from studio.voice_drafts) then
--     raise exception 'UNDO REFUSED: voice drafts exist; nothing is deleted';
--   end if;
-- end;
-- $$;
-- drop function if exists studio.delete_voice_draft(uuid, bigint);
-- drop table if exists studio.voice_board_asks;
-- drop table if exists studio.voice_board_pictures;
-- drop table if exists studio.voice_boards;
-- drop table if exists studio.voice_draft_audio;
-- drop table if exists studio.voice_drafts;
-- drop table if exists studio.voice_asks;
-- drop table if exists studio.voice_costs;
-- commit;
