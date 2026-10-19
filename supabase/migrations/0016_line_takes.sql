-- 0016_line_takes.sql — "Record your own takes" (owner, 2026-10-19): a person records a line in their
-- browser; the site converts it into the character's voice and keeps only the converted take.
-- DRAFT: NOT APPLIED. Written by the coding agent on branch record-takes; switched off in code
-- (TAKES.enabled in src/lib/config.ts). Apply only on the owner's go, after the Privacy and consent
-- lines are reread.
--
-- MUST RUN AS postgres, in the Supabase SQL Editor. Requires 0012 (adaptations) and 0013 (the same
-- shape of counting). Dry run first: replace the final `commit;` with `rollback;`.
--
-- People are person numbers, as in 0012: a Farcaster FID (positive), or minus a wallet account's id.
--
-- What it adds:
-- 1. studio.line_takes: every converted take, attached to one line (adaptation, version, cue) and
--    its maker. The converted audio's public address and sha256, its length, and its recipe (model,
--    endpoint, the target voice by sha256, the raw recording only as a sha256). The raw recording
--    itself is never stored anywhere. Shown, or hidden by its maker or the maintainer.
-- 2. studio.take_asks: one row per conversion (person and time), for the per-person daily count.
-- 3. studio.take_costs: daily totals of what conversions cost, with no person and no row per call.

begin;

create table studio.line_takes (
  id uuid primary key default gen_random_uuid(),
  adaptation_id bigint not null references studio.adaptations(id),
  version_id bigint not null references studio.adaptation_versions(id),
  cue text not null check (cue ~ '^[A-Za-z0-9-]{1,32}$'),
  person bigint not null check (person <> 0),
  -- The character whose voice it was converted into, as named in the version's script.
  speaker text not null check (char_length(speaker) between 1 and 40),
  recipe jsonb not null,
  audio_url text not null,
  audio_sha256 text not null unique check (audio_sha256 ~ '^[0-9a-f]{64}$'),
  seconds real not null check (seconds > 0 and seconds <= 20),
  cost_usd numeric(10, 6) not null check (cost_usd >= 0),
  by_name text,
  hidden boolean not null default false,
  hidden_by bigint,
  hidden_role text check (hidden_role in ('maker', 'maintainer')),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  check (hidden = (hidden_role is not null))
);
create index line_takes_line on studio.line_takes (version_id, cue, created_at desc);
create index line_takes_person on studio.line_takes (person, created_at desc);

create table studio.take_asks (
  person bigint not null,
  at timestamptz not null default now()
);
create index take_asks_person_at on studio.take_asks (person, at);

create table studio.take_costs (
  day date not null default ((now() at time zone 'utc')::date),
  funded text not null check (funded in ('free', 'prepaid')),
  kind text not null check (kind in ('convert', 'reserved')),
  model text not null,
  calls integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  primary key (day, funded, kind, model),
  check (kind = 'reserved' or (calls >= 0 and cost_usd >= 0))
);

alter table studio.line_takes enable row level security;
alter table studio.take_asks enable row level security;
alter table studio.take_costs enable row level security;

create policy writer_read on studio.line_takes for select to studio_writer using (true);
create policy writer_insert on studio.line_takes for insert to studio_writer with check (true);
create policy writer_update on studio.line_takes for update to studio_writer using (true) with check (true);
create policy writer_read on studio.take_asks for select to studio_writer using (true);
create policy writer_insert on studio.take_asks for insert to studio_writer with check (true);
create policy writer_read on studio.take_costs for select to studio_writer using (true);
create policy writer_insert on studio.take_costs for insert to studio_writer with check (true);
create policy writer_update on studio.take_costs for update to studio_writer using (true) with check (true);

revoke all on studio.line_takes, studio.take_asks, studio.take_costs from anon, authenticated;
grant select, insert, update on studio.line_takes, studio.take_costs to studio_writer;
grant select, insert on studio.take_asks to studio_writer;
revoke delete, truncate, references, trigger on studio.line_takes, studio.take_asks, studio.take_costs from studio_writer;
revoke update on studio.take_asks from studio_writer;

create function studio.line_take_fixed() returns trigger language plpgsql as $$
begin
  if (new.adaptation_id, new.version_id, new.cue, new.person, new.speaker, new.recipe, new.audio_url, new.audio_sha256, new.seconds, new.cost_usd, new.created_at)
     is distinct from (old.adaptation_id, old.version_id, old.cue, old.person, old.speaker, old.recipe, old.audio_url, old.audio_sha256, old.seconds, old.cost_usd, old.created_at) then
    raise exception 'a take is fixed once written; only hiding can change';
  end if;
  return new;
end $$;
create trigger line_take_fixed before update on studio.line_takes for each row execute function studio.line_take_fixed();
revoke execute on function studio.line_take_fixed() from public;

commit;
