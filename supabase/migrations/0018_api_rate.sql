-- 0018_api_rate.sql — the agent read API's rate counter (owner, 2026-10-19: "read API open without sign-in at
-- a low rate"). DRAFT: NOT APPLIED. Written by the coding agent on branch agent-read-api; the API is switched off
-- (AGENT_API.enabled). Apply only on the owner's go, after the Privacy line is reread.
--
-- MUST RUN AS postgres, in the Supabase SQL Editor. Dry run first: replace the final `commit;` with `rollback;`.
--
-- One row per caller per minute: a keyed hash of the caller's address (never the address itself; the key
-- changes every day, so hashes can't be linked across days) and a count. Rows older than an hour are deleted
-- by the API itself as it goes. Nothing else is stored about a request: not the tool, not the query.

begin;

create table studio.api_rate (
  caller text not null check (caller ~ '^[0-9a-f]{32}$'),
  minute timestamptz not null,
  n integer not null default 0 check (n >= 0),
  primary key (caller, minute)
);
create index api_rate_minute on studio.api_rate (minute);

alter table studio.api_rate enable row level security;
create policy writer_all on studio.api_rate for all to studio_writer using (true) with check (true);
revoke all on studio.api_rate from anon, authenticated;
grant select, insert, update, delete on studio.api_rate to studio_writer;
revoke truncate, references, trigger on studio.api_rate from studio_writer;

commit;
