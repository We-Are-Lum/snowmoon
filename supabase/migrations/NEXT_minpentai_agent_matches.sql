-- NEXT_minpentai_agent_matches.sql — agent play, solo: a person's matches against the site computer, played with
-- their own AI through the connector (docs/proposals/minpentai-agent-play.md; src/lib/minpentai/agent-play/).
-- DRAFT: not applied. Takes its number at merge (owner's standing rule, 2026-10-22). Nothing reads or writes this
-- table until the "play" scope is switched on (AGENTS.minpentaiPlay), which also needs the owner's reread of the
-- Terms/Privacy lines for agent play.
--
-- One row a match. `state` is the whole match as JSON, the real board included: only the server reads it; what a
-- side is shown is computed from it (its own view). `version` guards saves against two calls at once.
--
-- MUST RUN AS postgres (the owner of the `studio` schema), in the Supabase SQL Editor.
-- Dry run first: paste everything, but replace the final `commit;` with `rollback;`.

begin;

create table studio.mp_agent_matches (
  id text primary key check (id ~ '^[a-z0-9]{12}$'),
  -- The person, as studio.agents.person (a Farcaster ID, or minus a wallet account's id).
  person bigint not null check (person <> 0),
  agent_id uuid references studio.agents (id) on delete set null,
  ruleset text not null check (ruleset in ('book', 'play')),
  level smallint not null check (level between 1 and 5),
  state jsonb not null check (jsonb_typeof(state) = 'object' and pg_column_size(state) < 400000),
  over boolean not null default false,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mp_agent_matches_person on studio.mp_agent_matches (person, over, updated_at desc);

alter table studio.mp_agent_matches enable row level security;
revoke all on studio.mp_agent_matches from anon, authenticated;
grant select, insert, update on studio.mp_agent_matches to studio_writer;
create policy mp_agent_matches_writer on studio.mp_agent_matches for all to studio_writer using (true) with check (true);

commit;

-- Read-back (after commit): the table, then a realistic row inserted, updated under its version, read and deleted.
-- select column_name, data_type from information_schema.columns where table_schema = 'studio' and table_name = 'mp_agent_matches' order by ordinal_position;
-- begin;
-- insert into studio.mp_agent_matches (id, person, agent_id, ruleset, level, state)
--   values ('readback0001', 2147483646, null, 'book', 3, '{"v":1,"id":"readback0001","turn":0,"w":{"step":0,"rock":{},"sq":{},"tw":{"25":"C"},"gl":[],"nid":1,"flash":[]}}');
-- update studio.mp_agent_matches set version = version + 1, over = true where id = 'readback0001' and version = 0 returning id, version, over;
-- select id, state->>'turn' as turn from studio.mp_agent_matches where id = 'readback0001';
-- delete from studio.mp_agent_matches where id = 'readback0001';
-- commit;
-- select count(*) from studio.mp_agent_matches where id = 'readback0001';
