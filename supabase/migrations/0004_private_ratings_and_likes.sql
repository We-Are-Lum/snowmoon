-- 0004_private_ratings_and_likes.sql — individual ratings and likes become
-- private; the public reads totals only (principle 6; owner decision, Oct 5, 2026).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema and created
-- 0001 to 0003), in the Supabase SQL Editor. studio_writer cannot change
-- policies or create views, and the views below must be owned by the tables'
-- owner so they can count rows the public can no longer read.
--
-- Requires 0001 to 0003. Dry run first: paste everything, but replace the
-- final `commit;` with `rollback;`.
--
-- What changes:
--   ratings, likes, take_likes   public read policy dropped and select revoked
--                                from anon and authenticated; studio_writer keeps
--                                full row access (server routes, after checking
--                                the signed-in FID)
--   rating_totals, like_totals,  new views: one row per published version (or
--   take_like_totals             take) with counts, and for ratings a sum;
--                                readable by anyone
--
-- The views run with their owner's rights (the default for views), which is
-- what lets them count private rows. They expose no FID, and they include only
-- published elements and takes, as the dropped policies did.

begin;

-- ---------------------------------------------------------------------------
-- Individual rows: private
-- ---------------------------------------------------------------------------

drop policy public_read on studio.ratings;
drop policy public_read on studio.likes;
drop policy public_read on studio.take_likes;

revoke select on studio.ratings, studio.likes, studio.take_likes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Totals: public
-- ---------------------------------------------------------------------------

create view studio.rating_totals with (security_barrier) as
  select r.version_id,
         count(*)::int     as raters,
         sum(r.value)::int as total
  from studio.ratings r
  join studio.element_versions v on v.id = r.version_id
  join studio.elements e on e.id = v.element_id
  where e.status = 'published'
  group by r.version_id;

create view studio.like_totals with (security_barrier) as
  select l.version_id,
         count(*)::int as likes
  from studio.likes l
  join studio.element_versions v on v.id = l.version_id
  join studio.elements e on e.id = v.element_id
  where e.status = 'published'
  group by l.version_id;

create view studio.take_like_totals with (security_barrier) as
  select tl.take_id,
         count(*)::int as likes
  from studio.take_likes tl
  join studio.takes t on t.id = tl.take_id
  where t.status = 'published'
  group by tl.take_id;

comment on view studio.rating_totals is 'Public totals of ratings per published version. Individual ratings are private (0004).';
comment on view studio.like_totals is 'Public like counts per published version. Individual likes are private (0004).';
comment on view studio.take_like_totals is 'Public like counts per published take. Individual take likes are private (0004).';

grant select on studio.rating_totals, studio.like_totals, studio.take_like_totals to anon, authenticated, studio_writer;

commit;
