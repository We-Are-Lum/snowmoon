-- NEXT_sheet_help.DRY-RUN.sql — the dry run of supabase/migrations/NEXT_sheet_help.sql: the same SQL, ending in
-- rollback, so nothing is kept. Run as postgres in the Supabase SQL Editor. It should finish with no error. Any error
-- here means: stop, and don't run the migration.

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

create table if not exists studio.sheet_help_served (
  fid bigint not null check (fid > 0),
  version_id uuid not null references studio.element_versions(id),
  words_sha256 text not null check (words_sha256 ~ '^[0-9a-f]{64}$'),
  words_count int not null check (words_count between 1 and 24),
  at timestamptz not null default now()
);
create index if not exists sheet_help_served_lookup on studio.sheet_help_served (fid, version_id, at);
create index if not exists sheet_help_served_at on studio.sheet_help_served (at);

alter table studio.sheet_help_calls enable row level security;
alter table studio.sheet_help_costs enable row level security;
alter table studio.sheet_help_served enable row level security;
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
drop policy if exists writer_read on studio.sheet_help_served;
create policy writer_read on studio.sheet_help_served for select to studio_writer using (true);
drop policy if exists writer_insert on studio.sheet_help_served;
create policy writer_insert on studio.sheet_help_served for insert to studio_writer with check (true);
-- Only rows past the two-day window can be deleted (the site deletes them as new ones come in).
drop policy if exists writer_delete_old on studio.sheet_help_served;
create policy writer_delete_old on studio.sheet_help_served for delete to studio_writer using (at < now() - interval '2 days');

revoke all on studio.sheet_help_calls from anon, authenticated;
revoke all on studio.sheet_help_costs from anon, authenticated;
revoke all on studio.sheet_help_served from anon, authenticated;
revoke update, truncate, references, trigger on studio.sheet_help_calls from studio_writer;
revoke delete, truncate, references, trigger on studio.sheet_help_costs from studio_writer;
revoke update, truncate, references, trigger on studio.sheet_help_served from studio_writer;
grant select, insert, delete on studio.sheet_help_calls to studio_writer;
grant select, insert, update on studio.sheet_help_costs to studio_writer;
grant select, insert, delete on studio.sheet_help_served to studio_writer;

rollback;
