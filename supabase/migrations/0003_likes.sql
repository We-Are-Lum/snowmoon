-- 0003_likes.sql — likes, separate from ratings (brief §6 rule 4, Oct 5, 2026).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema and created
-- 0001 and 0002), in the Supabase SQL Editor. studio_writer cannot create
-- tables, and the default privileges set in 0001 apply only to tables that
-- postgres creates.
--
-- Requires 0001 and 0002. Dry run first: paste everything, but replace the
-- final `commit;` with `rollback;`.
--
-- Likes are not ratings: a like never enters rating normalization or the
-- score. "Most liked" sorts by distinct likers (one row per FID per version).
-- Not append-only: unliking deletes the row.

begin;

create table studio.likes (
  version_id uuid not null references studio.element_versions(id),
  fid bigint not null,
  created_at timestamptz not null default now(),
  primary key (version_id, fid)
);

-- "Who liked what" lookups for a person; counts per version use the primary key.
create index likes_fid on studio.likes (fid);

-- ---------------------------------------------------------------------------
-- RLS: the public reads likes on versions of published elements only, as with
-- ratings' visibility of elements in 0001. studio_writer reads and writes every
-- row, after the server checks the signed-in FID.
-- ---------------------------------------------------------------------------

alter table studio.likes enable row level security;

create policy public_read on studio.likes for select using (
  exists (
    select 1 from studio.element_versions v
    join studio.elements e on e.id = v.element_id
    where v.id = likes.version_id and e.status = 'published'
  )
);

create policy writer_all on studio.likes for all to studio_writer using (true) with check (true);

-- 0001's default privileges already grant these on new tables created by
-- postgres; stated here as well so the migration does not depend on that.
grant select on studio.likes to anon, authenticated;
grant select, insert, update, delete on studio.likes to studio_writer;

commit;
