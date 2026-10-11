-- 0010_image_scores.sql — image making for everyone, gated by Neynar score;
-- report alerts (owner, 2026-10-09; docs/proposals/add-an-image.md, decision 11).
-- APPLIED on production by the owner; confirmed 2026-10-10 09:19: image_scores and alert_state,
-- RLS on, no anon or authenticated reads, columns as expected. (Relayed to this branch by
-- another Snowmoon session on the owner's behalf.) Change what it creates in a new migration.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the
-- Supabase SQL Editor. Requires 0001–0008; independent of 0009 (Minpentai
-- Play), which touches no table here. Dry run first: paste everything, but replace the
-- final `commit;` with `rollback;`.
--
-- What it adds (none of it publicly readable):
-- 1. studio.image_scores: one row per FID, the Neynar user score last looked up
--    at Generate and when. Kept a day: a row older than IMAGES.scoreCacheHours
--    is looked up again on the next Generate, and old rows are deleted by the
--    lookup itself. Failures are never stored. Invited FIDs never get a row.
-- 2. studio.alert_state: when the last report alert was sent, one row per kind
--    of alert, so that at most one goes out an hour across every server. No
--    FID, no image, no count.

begin;

-- ---------------------------------------------------------------------------
-- 1. Neynar scores, one row per FID, kept a day.
-- ---------------------------------------------------------------------------

create table studio.image_scores (
  fid bigint primary key,
  score numeric not null check (score >= 0 and score <= 1),
  fetched_at timestamptz not null default now()
);
create index image_scores_fetched_at on studio.image_scores (fetched_at);

alter table studio.image_scores enable row level security;
create policy writer_insert on studio.image_scores for insert to studio_writer with check (true);
create policy writer_read on studio.image_scores for select to studio_writer using (true);
create policy writer_update on studio.image_scores for update to studio_writer using (true) with check (true);
create policy writer_delete on studio.image_scores for delete to studio_writer using (true);
revoke all on studio.image_scores from anon, authenticated;
revoke truncate, references, trigger on studio.image_scores from studio_writer;
grant select, insert, update, delete on studio.image_scores to studio_writer;

-- ---------------------------------------------------------------------------
-- 2. When the last alert went out (at most one an hour, across servers).
-- ---------------------------------------------------------------------------

create table studio.alert_state (
  kind text primary key check (kind in ('reports')),
  sent_at timestamptz not null
);

alter table studio.alert_state enable row level security;
create policy writer_insert on studio.alert_state for insert to studio_writer with check (true);
create policy writer_read on studio.alert_state for select to studio_writer using (true);
create policy writer_update on studio.alert_state for update to studio_writer using (true) with check (true);
revoke all on studio.alert_state from anon, authenticated;
revoke delete, truncate, references, trigger on studio.alert_state from studio_writer;
grant select, insert, update on studio.alert_state to studio_writer;

commit;

-- Dry run: what would be kept, and that none of it is public.
select c.relname as table, c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'select') as anon_reads,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_reads,
       (select string_agg(a.attname, ', ' order by a.attnum) from pg_attribute a
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'studio' and c.relname in ('image_scores', 'alert_state');
