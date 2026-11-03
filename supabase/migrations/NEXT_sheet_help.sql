-- NEXT_sheet_help.sql — "Ask for help" beside a character sheet's prompt box, during the remix challenge: its own daily
-- count and its own daily cost totals. Branch sheet-help (docs/proposals/sheet-help.md, approved by the owner
-- 2026-10-31). NOT APPLIED. It takes the next free number at merge (main has 0033), checked against origin/main and
-- production.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0001 only.
-- One transaction: all of it or none. Safe to run twice. Dry run first: supabase/drafts/NEXT_sheet_help.DRY-RUN.sql
-- (the same SQL ending in rollback). Read-back after: supabase/drafts/READ-BACK-sheet_help.sql.
--
-- Why its own tables, not a `kind` column on the coach's: the coach's tables (studio.coach_calls, coach_costs) are in
-- supabase/drafts/0017_adaptation_drafts.sql, which has never been applied, so there is no coach table on production
-- to add a column to; and two caps that the owner set separately (the coach's 50 a day and $1, this one's 20 a day and
-- $1) are clearest summed from separate rows, with no `kind` filter that a later query could forget.
--
-- What it adds (neither table is publicly readable: no public read policy, and anon and authenticated lose every
-- privilege 0001's default privileges gave them; the site reads them on the server, as studio_writer):
-- 1. studio.sheet_help_calls: one row per message, the FID and the time, nothing else (no message, no reply, no
--    cost), to count SHEET_HELP.perDay (20) a day per person (src/lib/sheet-help/limits.ts). Only rows older than two
--    days can be deleted (the site deletes them as new ones come in); no update.
-- 2. studio.sheet_help_costs: daily totals of its model calls, with no person, no request id and no time of day, like
--    studio.chat_costs (0007), summed for its $1 a day across everyone (SHEET_HELP.dailySpendCapUsd). Added to,
--    never removed: no delete.
--
-- studio_writer's privileges: sheet_help_calls select, insert, delete (old rows only, by policy); sheet_help_costs
-- select, insert, update. No truncate on either.

begin;

create table if not exists studio.sheet_help_calls (
  fid bigint not null check (fid > 0),
  at timestamptz not null default now()
);
create index if not exists sheet_help_calls_fid_at on studio.sheet_help_calls (fid, at);
create index if not exists sheet_help_calls_at on studio.sheet_help_calls (at);

create table if not exists studio.sheet_help_costs (
  day date not null default ((now() at time zone 'utc')::date),
  kind text not null check (kind in ('answer', 'guard')),
  model text not null check (length(model) between 1 and 200),
  provider text not null default '' check (length(provider) <= 100),
  guard text not null default '' check (guard in ('', 'ok', 'flagged', 'none')),
  calls int not null default 0 check (calls >= 0),
  prompt_tokens bigint not null default 0 check (prompt_tokens >= 0),
  completion_tokens bigint not null default 0 check (completion_tokens >= 0),
  cost_usd numeric(14, 8) not null default 0 check (cost_usd >= 0),
  primary key (day, kind, model, provider, guard)
);

alter table studio.sheet_help_calls enable row level security;
alter table studio.sheet_help_costs enable row level security;
drop policy if exists writer_read on studio.sheet_help_calls;
create policy writer_read on studio.sheet_help_calls for select to studio_writer using (true);
drop policy if exists writer_insert on studio.sheet_help_calls;
create policy writer_insert on studio.sheet_help_calls for insert to studio_writer with check (true);
-- Only old rows can be deleted (the two-day clean-up); a day's count can't be reset.
drop policy if exists writer_delete_old on studio.sheet_help_calls;
create policy writer_delete_old on studio.sheet_help_calls for delete to studio_writer using (at < now() - interval '2 days');
drop policy if exists writer_read on studio.sheet_help_costs;
create policy writer_read on studio.sheet_help_costs for select to studio_writer using (true);
drop policy if exists writer_insert on studio.sheet_help_costs;
create policy writer_insert on studio.sheet_help_costs for insert to studio_writer with check (true);
-- Totals are added to (update), never removed.
drop policy if exists writer_update on studio.sheet_help_costs;
create policy writer_update on studio.sheet_help_costs for update to studio_writer using (true) with check (true);

revoke all on studio.sheet_help_calls from anon, authenticated;
revoke all on studio.sheet_help_costs from anon, authenticated;
revoke update, truncate, references, trigger on studio.sheet_help_calls from studio_writer;
revoke delete, truncate, references, trigger on studio.sheet_help_costs from studio_writer;
grant select, insert, delete on studio.sheet_help_calls to studio_writer;
grant select, insert, update on studio.sheet_help_costs to studio_writer;

commit;
