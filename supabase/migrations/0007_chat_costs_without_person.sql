-- 0007_chat_costs_without_person.sql — the assistant's cost records can't be
-- joined to a person (owner, 2026-10-08). NOT APPLIED.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the
-- Supabase SQL Editor. Requires 0001–0006. Dry run first: paste everything,
-- but replace the final `commit;` with `rollback;`. The dry run's last result
-- shows what would be kept (see "What the last select shows" below).
--
-- Before 0007, studio.chat_calls kept one row per model call under the
-- person's FID: the question ('ask'), and for each answer, safety check and
-- search-words call, its model, provider, Groq's request id, tokens, cost,
-- the safety check's verdict and the exact time.
--
-- After 0007:
-- 1. studio.chat_calls keeps only the questions: FID, time and model. It is
--    what the daily limit (30 a day) counts. No row number: rows are copied in
--    time order into a fresh table, so gaps left by removed rows can't show how
--    many model calls a question took.
-- 2. studio.chat_costs keeps the cost of the model calls as daily totals: per
--    UTC date, kind of call, model, provider and verdict, how many calls, their
--    tokens and their cost. No FID, no request id, no time of day, and no row
--    per call, so nothing in it can be matched back to a question, by timing
--    or by order. The spend cap sums it.
-- 3. Existing answer, safety-check and search rows are added to those daily
--    totals and removed, with their FID, request id and time.
-- 4. Code from before 0007 that still writes a cost row into chat_calls (the
--    deployment running while this is applied) is caught by a trigger: the row
--    is added to the daily totals and nothing is stored under the FID.
--
-- What it can't do: on a day when only one person asks, that day's totals are
-- that person's. They show how much was spent and whether an answer was
-- flagged that day, not which question.
--
-- What the last select shows: one line per table, with its row count and its
-- columns. chat_calls should list fid, at, kind, model and the always-empty
-- columns kept for older code; chat_costs should list no fid, no request_id
-- and no time.

begin;

-- ---------------------------------------------------------------------------
-- 1. Daily cost totals, without a person.
-- ---------------------------------------------------------------------------

create table studio.chat_costs (
  day date not null default ((now() at time zone 'utc')::date),
  kind text not null check (kind in ('search', 'answer', 'guard')),
  model text not null,
  -- '' when unknown, so the totals key has no nulls.
  provider text not null default '',
  -- The safety check's verdict on an 'answer' call; '' on the others.
  guard text not null default '' check (guard in ('', 'ok', 'flagged', 'none')),
  calls int not null default 0 check (calls >= 0),
  prompt_tokens bigint not null default 0 check (prompt_tokens >= 0),
  completion_tokens bigint not null default 0 check (completion_tokens >= 0),
  cost_usd numeric(14, 8) not null default 0 check (cost_usd >= 0),
  primary key (day, kind, model, provider, guard)
);

-- Existing cost rows become daily totals.
insert into studio.chat_costs (day, kind, model, provider, guard, calls, prompt_tokens, completion_tokens, cost_usd)
select (at at time zone 'utc')::date, kind, model, coalesce(provider, ''), coalesce(guard, ''),
       count(*), sum(prompt_tokens), sum(completion_tokens), sum(cost_usd)
from studio.chat_calls
where kind <> 'ask'
group by 1, 2, 3, 4, 5;

-- ---------------------------------------------------------------------------
-- 2. Questions only, in a fresh table with no row number.
-- ---------------------------------------------------------------------------

create table studio.chat_calls_0007 (
  fid bigint not null,
  at timestamptz not null default now(),
  kind text not null default 'ask' check (kind = 'ask'),
  model text not null,
  -- Kept only so code from before 0007 can still insert while it is replaced;
  -- always empty. A later migration may drop them.
  provider text check (provider is null),
  request_id text check (request_id is null),
  prompt_tokens int not null default 0 check (prompt_tokens = 0),
  completion_tokens int not null default 0 check (completion_tokens = 0),
  cost_usd numeric(14, 8) not null default 0 check (cost_usd = 0),
  guard text check (guard is null)
);

insert into studio.chat_calls_0007 (fid, at, kind, model)
select fid, at, 'ask', model from studio.chat_calls where kind = 'ask' order by at;

drop table studio.chat_calls;
alter table studio.chat_calls_0007 rename to chat_calls;

create index chat_calls_fid_at on studio.chat_calls (fid, at);
create index chat_calls_at on studio.chat_calls (at);

-- A cost row written into chat_calls (by code from before 0007) goes to the
-- daily totals instead; nothing is stored under the FID.
create function studio.chat_calls_route_costs() returns trigger
language plpgsql as $$
begin
  if new.kind = 'ask' then
    return new;
  end if;
  insert into studio.chat_costs (kind, model, provider, guard, calls, prompt_tokens, completion_tokens, cost_usd)
  values (new.kind, new.model, coalesce(new.provider, ''), coalesce(new.guard, ''), 1, new.prompt_tokens, new.completion_tokens, new.cost_usd)
  on conflict (day, kind, model, provider, guard) do update set
    calls = studio.chat_costs.calls + 1,
    prompt_tokens = studio.chat_costs.prompt_tokens + excluded.prompt_tokens,
    completion_tokens = studio.chat_costs.completion_tokens + excluded.completion_tokens,
    cost_usd = studio.chat_costs.cost_usd + excluded.cost_usd;
  return null;
end $$;

create trigger route_costs before insert on studio.chat_calls
  for each row execute function studio.chat_calls_route_costs();

-- ---------------------------------------------------------------------------
-- 3. Who may do what. Private: no public read on either table.
-- ---------------------------------------------------------------------------

alter table studio.chat_calls enable row level security;
create policy writer_insert on studio.chat_calls for insert to studio_writer with check (true);
create policy writer_read on studio.chat_calls for select to studio_writer using (true);
revoke all on studio.chat_calls from anon, authenticated;
revoke update, delete, truncate on studio.chat_calls from studio_writer;
grant select, insert on studio.chat_calls to studio_writer;

-- Totals are added to (update), never removed.
alter table studio.chat_costs enable row level security;
create policy writer_insert on studio.chat_costs for insert to studio_writer with check (true);
create policy writer_update on studio.chat_costs for update to studio_writer using (true) with check (true);
create policy writer_read on studio.chat_costs for select to studio_writer using (true);
revoke all on studio.chat_costs from anon, authenticated;
revoke delete, truncate on studio.chat_costs from studio_writer;
grant select, insert, update on studio.chat_costs to studio_writer;

-- What would be kept (the dry run's last result).
select 'chat_calls' as "table", (select count(*) from studio.chat_calls) as rows,
       (select string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns
         where table_schema = 'studio' and table_name = 'chat_calls') as columns
union all
select 'chat_costs', (select count(*) from studio.chat_costs),
       (select string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns
         where table_schema = 'studio' and table_name = 'chat_costs');

commit;
