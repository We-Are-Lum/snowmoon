-- DRAFT, NOT APPLIED (owner's long run 2, item 5, 2026-10-19). Dry-run only on a local PGlite
-- (npm run test:make). Not to be run on production before the owner's go and their reread of
-- docs/legal/make-your-own-draft.md. Number 0017: 0016 is taken by 0016_line_takes.sql (branch record-takes).
--
-- studio.adaptation_drafts: a person's draft adaptation from "Make your own" (src/lib/make/): their idea, their
-- beats and their text storyboard, every word their own (src/lib/make/draft.ts, Draft). Private: only the site's
-- role can read it, and the site shows a draft only to the person who wrote it. The assistant's notes and the
-- conversation are never stored. The person can delete a draft; delete removes the row (nothing is kept).
-- Not an adaptation yet: publishing one is a later step (studio.adaptations), with its own consent.
--
-- studio.coach_calls: the coach's own daily count (owner, 2026-10-19: "coach 50 a day"; src/lib/make/limits.ts). One
-- row per coach message: the person, the time and whether its reply was refused, nothing else (no message, no reply,
-- no cost). A refused reply doesn't count as a message, up to 20 a day per person; from the 21st it does (owner,
-- 2026-10-19). Rows older than two days are deleted by the site as new ones come in.
--
-- studio.coach_checks: daily totals of the coach's pronoun check (owner, 2026-10-19: "Log each one so we can see how
-- often it happens"): how many replies it flagged, and how many retried replies were shown with a slip. No person,
-- no message, no time of day.
--
-- studio.coach_costs: the coach's own cost rows, for its own spend cap (owner, 2026-10-19: "coach gets its own $1 a
-- day"). Daily totals of model calls, with no person, no request id and no time of day, like studio.chat_costs (0007).
--
-- People: a FID (positive) or minus a wallet account's number (negative), as getPerson gives it (owner, 2026-10-19:
-- "open to wallet accounts"), the same numbering as the image tables.

begin;

create table studio.adaptation_drafts (
  id uuid primary key default gen_random_uuid(),
  -- A FID (positive), or minus a wallet account's number (negative). Never 0.
  person bigint not null check (person <> 0),
  title text not null default '' check (length(title) <= 120),
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index adaptation_drafts_person on studio.adaptation_drafts (person, updated_at desc);

alter table studio.adaptation_drafts enable row level security;
create policy writer_read on studio.adaptation_drafts for select to studio_writer using (true);
create policy writer_insert on studio.adaptation_drafts for insert to studio_writer with check (true);
create policy writer_update on studio.adaptation_drafts for update to studio_writer using (true) with check (true);
create policy writer_delete on studio.adaptation_drafts for delete to studio_writer using (true);
revoke all on studio.adaptation_drafts from anon, authenticated;
grant select, insert, update, delete on studio.adaptation_drafts to studio_writer;
revoke truncate, references, trigger on studio.adaptation_drafts from studio_writer;

-- A draft's owner never changes.
create function studio.adaptation_draft_owner_fixed() returns trigger language plpgsql as $$
begin
  if new.person is distinct from old.person or new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'a draft''s owner, id and creation time are fixed';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger adaptation_draft_owner_fixed before update on studio.adaptation_drafts for each row execute function studio.adaptation_draft_owner_fixed();
revoke execute on function studio.adaptation_draft_owner_fixed() from public;

create table studio.coach_calls (
  person bigint not null check (person <> 0),
  at timestamptz not null default now(),
  refused boolean not null default false
);
create index coach_calls_person_at on studio.coach_calls (person, at);
create index coach_calls_at on studio.coach_calls (at);

alter table studio.coach_calls enable row level security;
create policy writer_read on studio.coach_calls for select to studio_writer using (true);
create policy writer_insert on studio.coach_calls for insert to studio_writer with check (true);
-- Only old rows can be deleted (the two-day clean-up); a day's count can't be reset.
create policy writer_delete_old on studio.coach_calls for delete to studio_writer using (at < now() - interval '2 days');
-- A message's own row can be marked refused in the minutes it is answered, and only marked, never unmarked; nothing
-- else in a row can change.
create policy writer_mark_refused on studio.coach_calls for update to studio_writer using (at > now() - interval '10 minutes') with check (refused);
revoke all on studio.coach_calls from anon, authenticated;
grant select, insert, delete on studio.coach_calls to studio_writer;
-- Update on the refused column only: the table-wide right (from the schema's default privileges) is taken away first.
revoke update, truncate, references, trigger on studio.coach_calls from studio_writer;
grant update (refused) on studio.coach_calls to studio_writer;

create table studio.coach_costs (
  day date not null default ((now() at time zone 'utc')::date),
  kind text not null check (kind in ('answer', 'guard')),
  model text not null,
  provider text not null default '',
  guard text not null default '' check (guard in ('', 'ok', 'flagged', 'none')),
  calls int not null default 0 check (calls >= 0),
  prompt_tokens bigint not null default 0 check (prompt_tokens >= 0),
  completion_tokens bigint not null default 0 check (completion_tokens >= 0),
  cost_usd numeric(14, 8) not null default 0 check (cost_usd >= 0),
  primary key (day, kind, model, provider, guard)
);
-- Totals are added to (update), never removed.
alter table studio.coach_costs enable row level security;
create policy writer_read on studio.coach_costs for select to studio_writer using (true);
create policy writer_insert on studio.coach_costs for insert to studio_writer with check (true);
create policy writer_update on studio.coach_costs for update to studio_writer using (true) with check (true);
revoke all on studio.coach_costs from anon, authenticated;
grant select, insert, update on studio.coach_costs to studio_writer;
revoke delete, truncate, references, trigger on studio.coach_costs from studio_writer;

create table studio.coach_checks (
  day date not null default ((now() at time zone 'utc')::date),
  -- pronoun_slip: a reply the pronoun check flagged; pronoun_shown: a retried reply shown although it still slipped.
  event text not null check (event in ('pronoun_slip', 'pronoun_shown')),
  n int not null default 0 check (n >= 0),
  primary key (day, event)
);
-- Totals are added to (update), never removed.
alter table studio.coach_checks enable row level security;
create policy writer_read on studio.coach_checks for select to studio_writer using (true);
create policy writer_insert on studio.coach_checks for insert to studio_writer with check (true);
create policy writer_update on studio.coach_checks for update to studio_writer using (true) with check (true);
revoke all on studio.coach_checks from anon, authenticated;
grant select, insert, update on studio.coach_checks to studio_writer;
revoke delete, truncate, references, trigger on studio.coach_checks from studio_writer;

commit;

-- Check: four rows (adaptation_drafts, coach_calls, coach_costs, coach_checks), each rls = true, anon_reads = false, anon_writes = false.
select c.relname as table, c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'select') as anon_reads,
       has_table_privilege('anon', c.oid, 'insert') as anon_writes
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'studio' and c.relname in ('adaptation_drafts', 'coach_calls', 'coach_costs', 'coach_checks');
