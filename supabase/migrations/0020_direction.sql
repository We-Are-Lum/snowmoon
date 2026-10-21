-- 0020: direction notes and line rewrites, the person's own words on their own scene version (owner, 2026-10-20; DRAFT).
--
-- NOT APPLIED. Built on branch direction-notes (on top of agents-owner, PR #11), tested only in PGlite
-- (npm run test:agents). The owner applies migrations by hand in the Supabase SQL Editor as postgres, dry run
-- first (replace the final commit; with rollback;). Needs 0019 (studio.agents, studio.requests).
--
-- The owner's brief (2026-10-20): "Direction notes, three kinds, always my words exactly as I give them":
-- 1. studio.direction_notes:
--    - intent: per moment (a shot): where to take the viewer, the feeling, the thoughts;
--    - acting: per character per shot: thinking, movement, where they look. Fed into that shot's image and
--      video prompts, and shown in their recipes as the person's;
--    - delivery: per line: how it's said. On the re-record sheet.
-- 2. studio.line_rewrites: the person's new line, exactly as written, a draft against the book/script line. A
--    rewritten line is on the re-record sheet until it is recorded.
-- Both are private to their person (the version's author). Filed on the script page by the person, or by
-- their agent from what they said (agent_id and agent_name say which). Withdrawn, never deleted.

begin;

create table studio.direction_notes (
  id uuid primary key default gen_random_uuid(),
  person bigint not null check (person <> 0),
  adaptation_id bigint not null,
  version int not null check (version >= 1),
  kind text not null check (kind in ('intent', 'acting', 'delivery')),
  shot text not null check (shot ~ '^[A-Za-z0-9-]{1,40}$'),
  -- acting: the character it is for; delivery: the line's cue.
  character text check (character is null or character ~ '^[[:alpha:] .''-]{1,30}$'),
  cue text check (cue is null or cue ~ '^[A-Za-z0-9-]{1,40}$'),
  body text not null check (char_length(body) between 1 and 1000),
  agent_id uuid references studio.agents(id),
  agent_name text,
  request_id uuid references studio.requests(id),
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  check (kind <> 'acting' or character is not null),
  check (kind <> 'delivery' or cue is not null)
);
create index direction_notes_version on studio.direction_notes (person, adaptation_id, version) where withdrawn_at is null;

create table studio.line_rewrites (
  id uuid primary key default gen_random_uuid(),
  person bigint not null check (person <> 0),
  adaptation_id bigint not null,
  version int not null check (version >= 1),
  shot text not null check (shot ~ '^[A-Za-z0-9-]{1,40}$'),
  cue text not null check (cue ~ '^[A-Za-z0-9-]{1,40}$'),
  -- The line as the version has it, kept so the draft always reads against what it replaces.
  original text not null check (char_length(original) between 1 and 600),
  body text not null check (char_length(body) between 1 and 600),
  agent_id uuid references studio.agents(id),
  agent_name text,
  request_id uuid references studio.requests(id),
  created_at timestamptz not null default now(),
  recorded_at timestamptz,
  withdrawn_at timestamptz
);
create index line_rewrites_version on studio.line_rewrites (person, adaptation_id, version) where withdrawn_at is null;

do $$
declare t text;
begin
  foreach t in array array['direction_notes', 'line_rewrites'] loop
    execute format('alter table studio.%I enable row level security', t);
    execute format('create policy writer_all on studio.%I for all to studio_writer using (true) with check (true)', t);
    execute format('revoke all on studio.%I from anon, authenticated', t);
    execute format('grant select, insert, update on studio.%I to studio_writer', t);
    execute format('revoke delete, truncate on studio.%I from studio_writer', t);
  end loop;
end $$;

commit;
