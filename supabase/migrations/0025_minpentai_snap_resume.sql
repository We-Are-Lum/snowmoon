-- 0025_minpentai_snap_resume.sql — Minpentai in a Farcaster cast (the snap): each player's
-- latest practice match, so the snap's first page can offer "Resume" after a dropped page
-- (owner, 2026-10-21; docs/proposals/minpentai-snap.md, branch minpentai-snap).
-- APPLIED by the owner on 2026-10-23 (read-back: 7 rows true; checked read-only as studio_writer). Numbered 0025
-- (reserved for the snap; main has 0024, 0026 and 0027).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor.
-- Requires 0001. Dry run first: paste everything, but replace the final `commit;` with `rollback;`.
--
-- What it adds: studio.mp_snap_resume, one row per FID: the computer player's level, the
-- version id, the extra rule the player picked ('' when it was drawn), and the match as text (seed, then the finished turns' placements; the format is
-- src/lib/minpentai/snap/moves.ts encMatch). Nothing else: no username, no taps, no result.
-- Practice only; nothing here is a record of play. Not publicly readable: no public read
-- policy, and anon and authenticated lose every privilege 0001's default privileges gave them.
--
-- studio_writer's privileges: select, insert, update, delete (the snap deletes a row when its
-- match ends).
--
-- Retention. No cron: the snap deletes a FID's row when its match ends, and at most once per
-- 10 minutes per server instance it deletes every row whose last turn is over 30 days old
-- (src/lib/minpentai/snap/resume.ts).

begin;

create table studio.mp_snap_resume (
  fid bigint primary key,
  lvl smallint not null default 0 check (lvl between 0 and 5),
  ver text not null default '' check (ver ~ '^[a-z0-9-]{0,40}$'),
  rule text not null default '' check (rule in ('', 'diag', 'cost3', 'sight2', 'every8')),
  -- seed (base 36) . number of turns . placements, two base64url characters each, turns joined by ~
  moves text not null check (moves ~ '^[0-9a-z]{1,7}\.[0-9]{1,3}\.[A-Za-z0-9_~-]{0,2000}$'),
  updated_at timestamptz not null default now()
);
create index mp_snap_resume_updated on studio.mp_snap_resume (updated_at);

alter table studio.mp_snap_resume enable row level security;
create policy writer_read on studio.mp_snap_resume for select to studio_writer using (true);
create policy writer_insert on studio.mp_snap_resume for insert to studio_writer with check (true);
create policy writer_update on studio.mp_snap_resume for update to studio_writer using (true) with check (true);
create policy writer_delete on studio.mp_snap_resume for delete to studio_writer using (true);
revoke all on studio.mp_snap_resume from anon, authenticated;
revoke truncate on studio.mp_snap_resume from studio_writer;
grant select, insert, update, delete on studio.mp_snap_resume to studio_writer;

commit;
