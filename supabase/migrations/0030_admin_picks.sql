-- 0030_admin_picks.sql — admin picks and seeded-image hides. Branch phase2-admin, owner 2026-10-29 ("Phase 2 admin
-- tools … Draft the admin_picks migration as NEXT_").
-- APPLIED by the owner on 2026-10-31 in the Supabase SQL Editor, as postgres. Read back the same day, all true: both
-- tables exist with RLS on; anon cannot read either; studio_writer can select and insert, not update or delete; only
-- studio_writer's read and insert policies exist; a realistic pick, a cleared pick and a hide were inserted, counted
-- and deleted (in one DO block, since the SQL Editor runs each statement on its own and postgres there can't SET ROLE).
-- Numbered 0030 at merge (main had 0029; no branch held 0030).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0001 only.
-- One transaction: all of it or none. Safe to run twice.
--
-- What it adds (neither table is publicly readable: no public read policy, and anon and authenticated lose every
-- privilege 0001's default privileges gave them; the site reads them on the server):
-- 1. studio.admin_picks: an admin's pick of the image shown first for a moment (a book block, c<chapter>-b<block>) or a
--    glossary term (its slug). Principle 5 as reread on 2026-10-29: a pick is always shown labelled "Picked by @…", with
--    the reader's switch (Picked by · Most liked · Newest · Liked by me) beside it, and orders nothing else (P5b, P5d,
--    P5e). Append-only: a new pick is a new row and the latest per target counts; clearing a pick is a row with
--    image_kind 'none'. Who picked (FID) and when are kept; the label shows the picker's @handle.
--    image_kind: 'seeded' (an id in content/snowmoon/illustrations/published.json), 'reader' (a reader's published
--    image, its element version id), 'sheet' (a design sheet's picture, its key as the References page names it).
-- 2. studio.seeded_hidden: seeded images an admin hid in the reader (owner, 2026-10-29: "an admin Hide in the reader for
--    seeded and readers' images"). A readers' image is hidden as before (studio.elements.status and removal_log); a
--    seeded image is a file in the repository, so its hide is a row here, read by the reader before showing it.
--    One row per image; who hid it and when.
--
-- studio_writer's privileges: select and insert on both (no update, delete or truncate).

begin;

create table if not exists studio.admin_picks (
  id bigint generated always as identity primary key,
  target_kind text not null check (target_kind in ('moment', 'term')),
  target text not null check (
    (target_kind = 'moment' and target ~ '^c[0-9]{1,2}-b[0-9]{1,4}$')
    or (target_kind = 'term' and target ~ '^[a-z0-9-]{1,80}$')
  ),
  image_kind text not null check (image_kind in ('seeded', 'reader', 'sheet', 'none')),
  image_ref text check (image_ref is null or length(image_ref) between 1 and 200),
  by_fid bigint not null check (by_fid > 0),
  picked_at timestamptz not null default now(),
  constraint ref_unless_none check ((image_kind = 'none') = (image_ref is null))
);
create index if not exists admin_picks_target on studio.admin_picks (target_kind, target, picked_at desc);

create table if not exists studio.seeded_hidden (
  image_id text primary key check (image_id ~ '^c[0-9]{1,2}-b[0-9]{1,4}-[a-z0-9-]{1,80}$'),
  by_fid bigint not null check (by_fid > 0),
  hidden_at timestamptz not null default now()
);

alter table studio.admin_picks enable row level security;
alter table studio.seeded_hidden enable row level security;
drop policy if exists writer_read on studio.admin_picks;
create policy writer_read on studio.admin_picks for select to studio_writer using (true);
drop policy if exists writer_insert on studio.admin_picks;
create policy writer_insert on studio.admin_picks for insert to studio_writer with check (true);
drop policy if exists writer_read on studio.seeded_hidden;
create policy writer_read on studio.seeded_hidden for select to studio_writer using (true);
drop policy if exists writer_insert on studio.seeded_hidden;
create policy writer_insert on studio.seeded_hidden for insert to studio_writer with check (true);
revoke all on studio.admin_picks from anon, authenticated;
revoke all on studio.seeded_hidden from anon, authenticated;
revoke update, delete, truncate on studio.admin_picks from studio_writer;
revoke update, delete, truncate on studio.seeded_hidden from studio_writer;
grant select, insert on studio.admin_picks to studio_writer;
grant select, insert on studio.seeded_hidden to studio_writer;

commit;
