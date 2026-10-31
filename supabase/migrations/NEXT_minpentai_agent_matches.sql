-- NEXT_minpentai_agent_matches.sql — agent play, solo: a person's matches against the site computer, played with
-- their own AI through the connector (docs/proposals/minpentai-agent-play.md; src/lib/minpentai/agent-play/).
-- DRAFT v2 (owner's changes of 2026-10-31): not applied. Takes its number at merge (owner's standing rule,
-- 2026-10-22). Nothing reads or writes this table until the "play" scope is switched on (AGENTS.minpentaiPlay),
-- which also needs the owner's reread of the Terms/Privacy lines for agent play.
--
-- One row a match. `state` is the whole match as JSON, the real board included: only the server reads it; what a
-- side is shown is computed from it (its own view). `ruleset` is the exact ruleset the match was played under
-- (e.g. play-3, book-1), so a record replays the same after the rules change. `version` guards saves against two
-- calls at once; `updated_at` is set by the code on every save and, to be sure, by a trigger.
-- No delete for studio_writer: a record is removed only by the site's owner, by hand, on request (Privacy).
--
-- MUST RUN AS postgres (the owner of the `studio` schema), in the Supabase SQL Editor.
-- Dry run first: paste everything, but replace the final `commit;` with `rollback;`.

begin;

create table studio.mp_agent_matches (
  id text primary key check (id ~ '^[a-z0-9]{12}$'),
  -- The person, as studio.agents.person (a Farcaster ID, or minus a wallet account's id).
  person bigint not null check (person <> 0),
  agent_id uuid references studio.agents (id) on delete set null,
  -- The exact ruleset: its family and number (play-3: Play's ruleset 3; book-1: the book edition's first).
  ruleset text not null check (ruleset ~ '^(play|book)-[0-9]{1,3}$'),
  -- The site computer's level: 0 the beginner, 1-5 the search levels.
  level smallint not null check (level between 0 and 5),
  state jsonb not null check (jsonb_typeof(state) = 'object' and pg_column_size(state) < 400000),
  over boolean not null default false,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mp_agent_matches_person on studio.mp_agent_matches (person, over, updated_at desc);

-- Every update stamps updated_at with the real time (clock_timestamp, so it moves even inside one transaction).
create function studio.mp_agent_matches_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger mp_agent_matches_touch before update on studio.mp_agent_matches
  for each row execute function studio.mp_agent_matches_touch();

alter table studio.mp_agent_matches enable row level security;
revoke all on studio.mp_agent_matches from anon, authenticated;
grant select, insert, update on studio.mp_agent_matches to studio_writer;
create policy mp_agent_matches_writer_read on studio.mp_agent_matches for select to studio_writer using (true);
create policy mp_agent_matches_writer_insert on studio.mp_agent_matches for insert to studio_writer with check (true);
create policy mp_agent_matches_writer_update on studio.mp_agent_matches for update to studio_writer using (true) with check (true);

commit;

-- Read-back (after commit):
-- 1. The columns.
-- select column_name, data_type from information_schema.columns where table_schema = 'studio' and table_name = 'mp_agent_matches' order by ordinal_position;
-- 2. Nobody but the server can read or change it, and the server can't delete: all four false.
-- select has_table_privilege('anon', 'studio.mp_agent_matches', 'select') as anon_reads,
--        has_table_privilege('authenticated', 'studio.mp_agent_matches', 'select') as authenticated_reads,
--        has_table_privilege('anon', 'studio.mp_agent_matches', 'insert') as anon_writes,
--        has_table_privilege('studio_writer', 'studio.mp_agent_matches', 'delete') as writer_deletes;
-- 3. A realistic row: inserted, updated under its version (the trigger stamps updated_at), read, deleted.
-- begin;
-- insert into studio.mp_agent_matches (id, person, agent_id, ruleset, level, state)
--   values ('readback0001', 2147483646, null, 'book-1', 0, '{"v":1,"id":"readback0001","turn":0,"w":{"step":0,"rock":{},"sq":{},"tw":{"25":"C"},"gl":[],"nid":1,"flash":[]}}');
-- update studio.mp_agent_matches set version = version + 1, over = true where id = 'readback0001' and version = 0 returning id, version, over, updated_at > created_at as stamped;
-- select id, ruleset, level, state->>'turn' as turn from studio.mp_agent_matches where id = 'readback0001';
-- delete from studio.mp_agent_matches where id = 'readback0001';
-- commit;
-- 4. Gone.
-- select count(*) from studio.mp_agent_matches where id = 'readback0001';
-- 5. Bad values refused (each should fail): a ruleset without its number, a level of 6.
-- insert into studio.mp_agent_matches (id, person, ruleset, level, state) values ('readback0002', 1, 'play', 3, '{}');
-- insert into studio.mp_agent_matches (id, person, ruleset, level, state) values ('readback0003', 1, 'play-3', 6, '{}');
