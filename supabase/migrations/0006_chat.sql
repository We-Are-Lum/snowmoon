-- 0006_chat.sql — the reading assistant, slice 1: ask about the book
-- (docs/proposals/chat.md, sections 2 and 4). Oct 7, 2026. NOT APPLIED.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the
-- Supabase SQL Editor. Requires 0001–0005. Dry run first: paste everything,
-- but replace the final `commit;` with `rollback;`.
--
-- What it adds:
-- 1. Full-text search over the book's text: a generated tsvector on
--    studio.text_blocks and a GIN index. No new service, no embedding model.
-- 2. studio.chat_calls: one row per model call, for the daily limit (30 a day
--    per FID) and the spend cap. It holds counts and cost only: no question,
--    no reply, no block ids. Private threads live on the person's device.

begin;

-- ---------------------------------------------------------------------------
-- 1. Search. 'english' stems and drops stop words; names are expanded by the app.
-- ---------------------------------------------------------------------------

alter table studio.text_blocks
  add column search tsvector generated always as (to_tsvector('english', content)) stored;

create index text_blocks_search on studio.text_blocks using gin (search);

-- ---------------------------------------------------------------------------
-- 2. Model calls: counts and cost, never content. Append-only.
-- ---------------------------------------------------------------------------

create table studio.chat_calls (
  id bigint generated always as identity primary key,
  fid bigint not null,
  at timestamptz not null default now(),
  -- 'ask': a question the person sent, written before the model is called; it
  --        is what the daily limit counts. Its cost is 0.
  -- 'answer': the model call that answered it, with its real cost.
  -- 'guard': the output check on that answer, with its real cost.
  -- The day's spend is the sum of cost_usd over all rows.
  kind text not null check (kind in ('ask', 'answer', 'guard')),
  model text not null,
  provider text,
  request_id text,
  prompt_tokens int not null default 0 check (prompt_tokens >= 0),
  completion_tokens int not null default 0 check (completion_tokens >= 0),
  cost_usd numeric(14, 8) not null default 0 check (cost_usd >= 0),
  -- The guard's verdict on an 'answer' row; null on the others.
  guard text check (guard in ('ok', 'flagged', 'none'))
);

create index chat_calls_fid_at on studio.chat_calls (fid, at);
create index chat_calls_at on studio.chat_calls (at);

-- Private: no public read. studio_writer inserts and reads (the server checks
-- the signed-in FID first) but never updates or deletes.
alter table studio.chat_calls enable row level security;
create policy writer_insert on studio.chat_calls for insert to studio_writer with check (true);
create policy writer_read on studio.chat_calls for select to studio_writer using (true);
revoke all on studio.chat_calls from anon, authenticated;
-- 0001's default privileges grant update and delete on new tables; take them back.
revoke update, delete, truncate on studio.chat_calls from studio_writer;
grant select, insert on studio.chat_calls to studio_writer;

commit;
