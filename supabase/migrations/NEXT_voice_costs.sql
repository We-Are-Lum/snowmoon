-- NEXT_voice_costs.sql: what the Ephelion voice slice's ElevenLabs calls cost, as daily totals (Nate, 2026-11-19, branch
-- ephelion-voice, Part B item 7). NOT APPLIED. Unnumbered while the branch is unmerged: it takes the next free number at
-- merge, checked against origin/main and production. Drafted by the coding agent (Claude, a closed model by Anthropic),
-- DRAFT until Nate approves it.
-- Requires 0001_core (the studio schema, studio_writer).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: a read-only look, then realistic rows inserted and deleted inside a transaction
-- that ends in `rollback;`; it ends "READ-BACK PASSED"), and D. the undo, only if the release is withdrawn. Safe to run
-- twice.
--
-- What it adds: studio.voice_costs, a sibling of studio.image_costs (0008) for ElevenLabs calls. Like image_costs it has
-- no FID, no request id, no time of day and no row per call, so no cost can be matched to a person, a recording or a
-- request. The daily cap (src/lib/config.ts VOICE.dailyCapUsd) sums it. A call first adds its worst case to 'reserved',
-- then moves it to its real cost, so concurrent calls can't pass the cap. Not readable by anon or authenticated;
-- studio_writer may select, insert and update (to add to a day's total), never delete or truncate.
-- kind: 'convert' (speech-to-speech), 'transcribe' (speech-to-text of the converted audio, never the raw take),
-- 'reading' (text-to-speech of a speech in a preset), 'design' (Voice Design previews, made by an admin), 'reserved'.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.voice_costs (
  day date not null default ((now() at time zone 'utc')::date),
  kind text not null check (kind in ('convert', 'transcribe', 'reading', 'design', 'reserved')),
  model text not null check (length(model) between 1 and 80),
  provider text not null default 'elevenlabs' check (provider = 'elevenlabs'),
  -- 'free': the site pays (everyone, once open); 'admin': an admin's own trials, counted apart.
  funded text not null default 'free' check (funded in ('free', 'admin')),
  -- 'ok', 'failed' (the provider answered an error; still counted, as it may still charge); '' for 'reserved'.
  verdict text not null default '' check (verdict in ('', 'ok', 'failed')),
  calls int not null default 0,
  seconds numeric(12, 2) not null default 0,
  characters int not null default 0,
  credits int not null default 0,
  cost_usd numeric(14, 8) not null default 0,
  primary key (day, funded, kind, model, verdict),
  check (kind = 'reserved' or (calls >= 0 and seconds >= 0 and characters >= 0 and credits >= 0 and cost_usd >= 0)),
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
  cost_usd numeric(14, 8) not null default 0,
  primary key (day, funded, kind, model, verdict),
  check (kind = 'reserved' or (calls >= 0 and seconds >= 0 and characters >= 0 and credits >= 0 and cost_usd >= 0)),
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
commit;

-- C. READ-BACK (after B). Changes nothing: it ends in rollback. Expect "READ-BACK PASSED".
begin;
do $$
declare n int; usd numeric;
begin
  -- The table and its privileges.
  if to_regclass('studio.voice_costs') is null then raise exception 'voice_costs missing'; end if;
  if has_table_privilege('anon', 'studio.voice_costs', 'select') then raise exception 'anon can read voice_costs'; end if;
  if has_table_privilege('authenticated', 'studio.voice_costs', 'select') then raise exception 'authenticated can read voice_costs'; end if;
  if not has_table_privilege('studio_writer', 'studio.voice_costs', 'insert') then raise exception 'studio_writer cannot insert'; end if;
  if has_table_privilege('studio_writer', 'studio.voice_costs', 'delete') then raise exception 'studio_writer can delete'; end if;

  -- Realistic rows, as the site writes them: a 2.5-minute conversion reserved, then settled; its transcription; a
  -- reading of c13-b64 (about 2,000 characters); an admin's Voice Design round.
  insert into studio.voice_costs (kind, model, funded, verdict, calls, cost_usd) values ('reserved', 'eleven_multilingual_sts_v2', 'free', '', 1, 0.75);
  insert into studio.voice_costs (kind, model, funded, verdict, calls, seconds, credits, cost_usd)
    values ('convert', 'eleven_multilingual_sts_v2', 'free', 'ok', 1, 152.40, 2540, 0.762)
    on conflict (day, funded, kind, model, verdict) do update set calls = studio.voice_costs.calls + excluded.calls,
      seconds = studio.voice_costs.seconds + excluded.seconds, credits = studio.voice_costs.credits + excluded.credits,
      cost_usd = studio.voice_costs.cost_usd + excluded.cost_usd;
  update studio.voice_costs set calls = calls - 1, cost_usd = cost_usd - 0.75
    where day = (now() at time zone 'utc')::date and funded = 'free' and kind = 'reserved' and model = 'eleven_multilingual_sts_v2' and verdict = '';
  insert into studio.voice_costs (kind, model, funded, verdict, calls, seconds, cost_usd) values ('transcribe', 'scribe_v1', 'free', 'ok', 1, 150.10, 0.0167);
  insert into studio.voice_costs (kind, model, funded, verdict, calls, characters, credits, cost_usd) values ('reading', 'eleven_multilingual_v2', 'admin', 'ok', 1, 2010, 2010, 0.603);
  insert into studio.voice_costs (kind, model, funded, verdict, calls, characters, cost_usd) values ('design', 'eleven_ttv_v3', 'admin', 'failed', 1, 420, 0);

  -- Refusals: a negative settled cost, an unknown kind, and a 'reserved' row with a verdict.
  begin insert into studio.voice_costs (kind, model, verdict, calls, cost_usd) values ('convert', 'x', 'ok', 1, -1); raise exception 'negative cost accepted';
  exception when check_violation then null; end;
  begin insert into studio.voice_costs (kind, model, verdict) values ('clone', 'x', 'ok'); raise exception 'unknown kind accepted';
  exception when check_violation then null; end;
  begin insert into studio.voice_costs (kind, model, verdict) values ('reserved', 'x', 'ok'); raise exception 'reserved with a verdict accepted';
  exception when check_violation then null; end;

  select count(*), sum(cost_usd) into n, usd from studio.voice_costs where day = (now() at time zone 'utc')::date and funded = 'free';
  if n < 3 then raise exception 'expected the free rows, got %', n; end if;

  delete from studio.voice_costs where day = (now() at time zone 'utc')::date and model in ('eleven_multilingual_sts_v2', 'scribe_v1', 'eleven_multilingual_v2', 'eleven_ttv_v3')
    and calls in (0, 1);
  raise notice 'READ-BACK PASSED (free total today in this transaction was % USD)', usd;
end $$;
rollback;

-- D. UNDO, only if the release is withdrawn (it drops the day totals; nothing else uses the table).
-- begin;
-- drop table if exists studio.voice_costs;
-- commit;
