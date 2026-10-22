-- 0024: "Suggest an improvement" notes, and a note at a moment of the film (owner, 2026-10-22, for the
-- invited people: "I want to make sure they can leave notes for how to make the experience better", and "a
-- simple ability for them to watch the video on the website, and pause at any point and log notes for
-- themselves that their AI can then read, interpret, and take action on").

-- 1. studio.suggestions: what an invited person says would make the site better, typed or spoken (spoken
--    ones are transcribed, checked by the person and kept as words; the recording is never kept). Private to
--    the owner, who reads them on their You page with who said it and where they were. The person's own
--    agent can read that person's suggestions, nobody else's. Kept until the person asks us to delete them.
create table studio.suggestions (
  id uuid primary key default gen_random_uuid(),
  person bigint not null check (person <> 0),
  body text not null check (char_length(body) between 1 and 2000),
  spoken boolean not null default false,
  -- Where they were: the page's path, and (optionally) a moment of a published scene and the time in its video.
  page text check (page is null or (char_length(page) between 1 and 300 and page ~ '^/')),
  moment text check (moment is null or moment ~ '^[0-9]{1,6}/[0-9]{1,6}/[A-Za-z0-9-]{1,40}$'),
  seconds numeric(8, 2) check (seconds is null or (seconds >= 0 and seconds < 36000)),
  -- Filed by the person's agent, in the person's words (null when the person filed it themselves).
  agent_id uuid references studio.agents(id),
  agent_name text check (agent_name is null or char_length(agent_name) between 1 and 120),
  created_at timestamptz not null default now(),
  constraint suggestions_agent_named check ((agent_id is null) = (agent_name is null))
);
create index suggestions_person on studio.suggestions (person, created_at desc);
create index suggestions_new on studio.suggestions (created_at desc);

alter table studio.suggestions enable row level security;
create policy writer_insert on studio.suggestions for insert to studio_writer with check (true);
create policy writer_read on studio.suggestions for select to studio_writer using (true);
revoke all on studio.suggestions from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.suggestions from studio_writer;
grant select, insert on studio.suggestions to studio_writer;

-- 2. A request at a moment can also name the time in the video (seconds from the start of that version's
--    cut), so "Note at 1:23" lands on the shot, the time and the lines spoken there.
alter table studio.requests add column target_seconds numeric(8, 2)
  check (target_seconds is null or (target_seconds >= 0 and target_seconds < 36000));
alter table studio.requests add constraint requests_seconds_need_moment check (target_seconds is null or target_moment is not null);
