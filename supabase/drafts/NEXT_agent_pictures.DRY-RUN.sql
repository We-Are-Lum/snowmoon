-- NEXT_agent_pictures (numbered at merge). Branch agent-pictures, owner 2026-10-25. DRAFT: the owner pastes it in the
-- Supabase SQL Editor; nothing here is applied by the coding agent.
--
-- 1. studio.agent_failures: every agent tool call that failed (the person's agent couldn't do it), so the person and
--    the owner can see what agents ran into (step 0). What is kept: who, which agent, which tool, the kind of failure,
--    the message the agent was given (or the error's code), and the names of the arguments sent, never their values
--    (they can hold the person's words). Private like agent_gaps: the person sees their own on /you, the owner all.
-- 2. studio.pieces.kind: four new kinds of draft made by the site's own pipelines on the person's approval:
--    'picture' (a book moment, Pictures' pipeline), 'sheet' (a character sheet), 'place' and 'style' (designs).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0019 (agents).
-- THIS IS THE DRY RUN: it ends in rollback;, so nothing is kept. Then paste NEXT_agent_pictures.sql (ends in commit;). Read back after: READ-BACK-agent_pictures.sql.
-- One transaction: all of it or none. Additive and safe to run twice.

begin;

create table if not exists studio.agent_failures (
  id uuid primary key default gen_random_uuid(),
  person bigint not null check (person <> 0),
  agent_id uuid not null references studio.agents(id),
  agent_name text not null,
  tool text not null check (char_length(tool) between 1 and 80),
  kind text not null check (kind in ('input', 'error', 'timeout', 'refused')),
  message text not null check (char_length(message) between 1 and 1000),
  arg_names text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists agent_failures_person on studio.agent_failures (person, created_at desc);

alter table studio.agent_failures enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'agent_failures' and policyname = 'writer_all') then
    create policy writer_all on studio.agent_failures for all to studio_writer using (true) with check (true);
  end if;
end $$;
-- Nothing for anon and authenticated; the site (studio_writer) may only read and add rows: append-only.
revoke all on studio.agent_failures from anon, authenticated, studio_writer;
grant select, insert on studio.agent_failures to studio_writer;

alter table studio.pieces drop constraint if exists pieces_kind_check;
alter table studio.pieces add constraint pieces_kind_check
  check (kind in ('idea', 'storyboard', 'frames', 'character', 'image', 'edit', 'picture', 'sheet', 'place', 'style'));

rollback;
