-- 0008_images.sql — readers add an image to a passage, slice 1 ("Trial";
-- docs/proposals/add-an-image.md, owner's decisions of 2026-10-08). NOT APPLIED.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the
-- Supabase SQL Editor. Requires 0001–0006; numbered after the assistant's
-- 0007 and independent of it (it touches no chat table). Dry run first: paste
-- everything, but replace the final `commit;` with `rollback;`.
--
-- Published images use the tables that already exist: elements (image),
-- element_versions (the public file and its sha256), recipes (the exact prompt),
-- anchors (the passage), links ('uses', 'remixed_from'), likes and like_totals.
-- A draft is never stored here: the server hands the person's device a signed
-- record of what it made, and writes the recipe only when they publish.
--
-- What it adds (none of it publicly readable):
-- 1. studio.image_asks: one row per Generate, the FID and the time, for the
--    daily limit (10 a day) only. No row number.
-- 2. studio.image_costs: what generation costs, as daily totals per kind of
--    call, model, host and verdict. No FID, no request id, no time of day, no
--    row per call, so no cost can be matched to a person or to a request (the
--    rule the assistant's 0007 follows). The spend caps sum it. A Generate
--    first adds its worst case to 'reserved', then moves it to its real cost.
-- 3. studio.removal_log: reports, hides, unhides and dismissals, append-only
--    (docs/removal.md). Reporters' FIDs stay here, for abuse handling only;
--    moderators are shown the reasons and notes, never who reported.
-- 4. Indexes for the feed (newest first) and a chapter's images.

begin;

-- ---------------------------------------------------------------------------
-- 1. Generations, counted per person per day. No row number.
-- ---------------------------------------------------------------------------

create table studio.image_asks (
  fid bigint not null,
  at timestamptz not null default now()
);
create index image_asks_fid_at on studio.image_asks (fid, at);

alter table studio.image_asks enable row level security;
create policy writer_insert on studio.image_asks for insert to studio_writer with check (true);
create policy writer_read on studio.image_asks for select to studio_writer using (true);
revoke all on studio.image_asks from anon, authenticated;
revoke update, delete, truncate on studio.image_asks from studio_writer;

-- ---------------------------------------------------------------------------
-- 2. Costs as daily totals, without a person.
-- ---------------------------------------------------------------------------

create table studio.image_costs (
  day date not null default ((now() at time zone 'utc')::date),
  -- 'image': a call to the image model. 'guard': the prompt check.
  -- 'reserved': the worst case of Generates still running (added before the
  -- call, taken back after it), so concurrent Generates can't pass a cap.
  kind text not null check (kind in ('image', 'guard', 'reserved')),
  model text not null,
  provider text not null default '',
  -- The outcome: 'ok', 'blocked' (the prompt check refused), 'nsfw' (the host's
  -- safety checker flagged the image, which is dropped); '' for 'reserved'.
  verdict text not null default '' check (verdict in ('', 'ok', 'blocked', 'nsfw')),
  calls int not null default 0,
  cost_usd numeric(14, 8) not null default 0,
  primary key (day, kind, model, provider, verdict),
  check (kind = 'reserved' or (calls >= 0 and cost_usd >= 0))
);

alter table studio.image_costs enable row level security;
create policy writer_insert on studio.image_costs for insert to studio_writer with check (true);
create policy writer_read on studio.image_costs for select to studio_writer using (true);
create policy writer_update on studio.image_costs for update to studio_writer using (true) with check (true);
revoke all on studio.image_costs from anon, authenticated;
revoke delete, truncate on studio.image_costs from studio_writer;

-- ---------------------------------------------------------------------------
-- 3. The removal log: private and append-only.
-- ---------------------------------------------------------------------------

create table studio.removal_log (
  element_id uuid not null references studio.elements(id),
  step text not null check (step in ('reported', 'hidden', 'unhidden', 'dismissed', 'moved_private', 'restored_public', 'erasure_approved', 'erased')),
  by_fid bigint not null,
  -- Who acted: the image's author, a reader reporting it, a moderator, the
  -- maintainer, or a stated rule (one "minor" report; three reporters).
  role text not null check (role in ('author', 'reader', 'moderator', 'maintainer', 'rule')),
  reason text check (reason in ('minor', 'sexual', 'real_person', 'violence', 'hateful', 'someone_elses_work', 'misrepresents', 'spam', 'other')),
  note text check (char_length(note) <= 280),
  at timestamptz not null default now()
);
create index removal_log_element on studio.removal_log (element_id, at);
create index removal_log_reporter on studio.removal_log (by_fid, at) where step = 'reported';

alter table studio.removal_log enable row level security;
create policy writer_insert on studio.removal_log for insert to studio_writer with check (true);
create policy writer_read on studio.removal_log for select to studio_writer using (true);
revoke all on studio.removal_log from anon, authenticated;
revoke update, delete, truncate on studio.removal_log from studio_writer;

-- ---------------------------------------------------------------------------
-- 4. The feed and the chapter: newest images first; images in a chapter.
-- ---------------------------------------------------------------------------

create index elements_type_status_created on studio.elements (element_type, status, created_at desc);
create index anchors_chapter on studio.anchors (work_id, chapter, end_idx);
create index element_versions_sha256 on studio.element_versions (asset_sha256) where asset_sha256 is not null;

commit;

-- Dry run: what would be kept, and that none of it is public.
select c.relname as table, c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'select') as anon_reads,
       (select string_agg(a.attname, ', ' order by a.attnum) from pg_attribute a
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'studio' and c.relname in ('image_asks', 'image_costs', 'removal_log');
