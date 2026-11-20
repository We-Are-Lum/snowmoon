-- NEXT_ephelion_voice.sql: the Ephelion voice slice 1 (Nate, 2026-11-19, branch ephelion-voice): what its ElevenLabs
-- calls cost, as daily totals, and the drafts a person accepts. NOT APPLIED. Unnumbered while the branch is unmerged: it
-- takes the next free number at merge, checked against origin/main and production. Drafted by the coding agent (Claude,
-- a closed model by Anthropic), DRAFT until Nate approves it; tested in PGlite by the agent (npm run test:voice). Was
-- NEXT_voice_costs.sql (2026-11-19); the draft tables were added on 2026-11-20.
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
--    (each with the sentence it replaces and where), or the reading. MP3 bytes, sha256, size and length.

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
revoke all on studio.voice_asks from anon, authenticated;
grant select, insert on studio.voice_asks to studio_writer;
revoke update, delete, truncate on studio.voice_asks from studio_writer;

create table if not exists studio.voice_drafts (
  id uuid primary key default gen_random_uuid(),
  fid bigint not null check (fid > 0),
  kind text not null check (kind in ('performance', 'reading')),
  speech_id text not null check (speech_id ~ '^[a-z0-9-]{1,80}$'),
  preset_id text not null check (preset_id ~ '^[a-z0-9-]{1,80}$'),
  made_at timestamptz not null default now(),
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
  mp3 bytea not null check (octet_length(mp3) between 1 and 4500000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  seconds numeric(8, 2) check (seconds between 0 and 600),
  primary key (draft_id, n),
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
revoke all on studio.voice_asks from anon, authenticated;
grant select, insert on studio.voice_asks to studio_writer;
revoke update, delete, truncate on studio.voice_asks from studio_writer;

create table if not exists studio.voice_drafts (
  id uuid primary key default gen_random_uuid(),
  fid bigint not null check (fid > 0),
  kind text not null check (kind in ('performance', 'reading')),
  speech_id text not null check (speech_id ~ '^[a-z0-9-]{1,80}$'),
  preset_id text not null check (preset_id ~ '^[a-z0-9-]{1,80}$'),
  made_at timestamptz not null default now(),
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
  mp3 bytea not null check (octet_length(mp3) between 1 and 4500000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  seconds numeric(8, 2) check (seconds between 0 and 600),
  primary key (draft_id, n),
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
commit;

-- C. READ-BACK (after B). Changes nothing: it ends in rollback. Expect "READ-BACK PASSED".
begin;
do $$
declare n int; usd numeric; d uuid;
begin
  -- The tables and their privileges.
  if to_regclass('studio.voice_costs') is null or to_regclass('studio.voice_asks') is null or to_regclass('studio.voice_drafts') is null or to_regclass('studio.voice_draft_audio') is null then
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
  insert into studio.voice_draft_audio (draft_id, n, role, mp3, sha256, seconds) values (d, 0, 'take', decode(repeat('ff', 2000), 'hex'), repeat('b', 64), 152.4);
  insert into studio.voice_draft_audio (draft_id, n, role, sentence, replaces_start, replaces_end, mp3, sha256, seconds)
    values (d, 1, 'redo', 7, 41.2, 47.9, decode(repeat('ff', 200), 'hex'), repeat('c', 64), 6.6);
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
  begin insert into studio.voice_draft_audio (draft_id, n, role, mp3, sha256) values (d, 2, 'redo', '\xff', repeat('e', 64)); raise exception 'a redo with no sentence accepted';
  exception when check_violation then null; end;
  begin insert into studio.voice_draft_audio (draft_id, n, role, mp3, sha256) values (d, 3, 'raw', '\xff', repeat('e', 64)); raise exception 'a raw role accepted';
  exception when check_violation then null; end;

  select count(*), sum(cost_usd) into n, usd from studio.voice_costs where day = (now() at time zone 'utc')::date and funded = 'free';
  if n < 3 then raise exception 'expected the free rows, got %', n; end if;
  select count(*) into n from studio.voice_draft_audio where draft_id = d;
  if n <> 2 then raise exception 'expected 2 audio rows, got %', n; end if;

  -- And deleted again (as postgres; studio_writer can't).
  delete from studio.voice_draft_audio where draft_id = d;
  delete from studio.voice_drafts where speech_id = 'ephelion-c13-b64' and recipe->'takes'->0->>'takeSha256' = repeat('a', 64);
  delete from studio.voice_drafts where fid = 193912 and recipe->>'textSha256' = repeat('d', 64);
  if exists (select 1 from studio.voice_drafts where id = d) then raise exception 'the draft was not deleted'; end if;
  raise notice 'READ-BACK PASSED (free total today in this transaction was % USD)', usd;
end $$;
rollback;

-- D. UNDO, only if the release is withdrawn (it drops the day totals and every voice draft).
-- begin;
-- drop table if exists studio.voice_draft_audio;
-- drop table if exists studio.voice_drafts;
-- drop table if exists studio.voice_asks;
-- drop table if exists studio.voice_costs;
-- commit;
