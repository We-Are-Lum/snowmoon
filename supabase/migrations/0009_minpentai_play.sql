-- 0009_minpentai_play.sql — Minpentai Play: the computer ladder's progress and
-- one-on-one (owner's decisions of 2026-10-09; the earlier proposal is
-- docs/proposals/minpentai-multiplayer.md on branch site-multiplayer-proposal).
-- APPLIED on production by the owner, 2026-10-09 23:55 (PDT). The owner's final check: all
-- eight mp_ tables with row-level security on, no anon or authenticated reads, and the
-- expected studio_writer privileges. Do not edit what this file creates; change it in a new migration.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the
-- Supabase SQL Editor. Requires 0001; independent of 0002–0008 (it touches none
-- of their tables). Dry run first: paste everything, but replace the final
-- `commit;` with `rollback;`.
--
-- What it adds. None of it is publicly readable: no public read policy, and
-- anon and authenticated lose every privilege 0001's default privileges gave
-- them. Only the server (studio_writer) reads or writes these rows, and only
-- for the signed-in FID the route checked. There is no public record, ranking,
-- leaderboard or free text anywhere.
-- 1. studio.mp_progress: the computer ladder, one row per FID: the highest rung
--    open and, per rung, tries and the step of the first win. The ladder's
--    matches run in the browser; the server records results.
-- 2. studio.mp_lobby: who is ready for one-on-one now (3 minutes, renewed while
--    the screen is open), with the Farcaster username the server verified.
--    Rows are deleted when a player stops or starts a match.
-- 3. studio.mp_matches: one-on-one matches. `state` holds the whole hidden
--    match (board, pending placements, both players' "last seen" maps, every
--    step for "watch it again"); browsers are only ever sent their own view.
--    The seed never leaves the server.
-- 4. studio.mp_challenges: a challenge from one ready player to another
--    (20 seconds to accept). At most one open challenge per challenger.
-- 5. studio.mp_invites: invite links (one use, 24 hours).
-- 6. studio.mp_blocks: a player's own blocks, for good (no unblock).
-- 7. studio.mp_rate: limits per person, one row per FID holding only this
--    minute's and today's request counts and when they last viewed a match
--    and the lobby (src/lib/config.ts MINPENTAI_PLAY). No history, no request log.
-- 8. studio.mp_daily: Play requests per UTC day across everyone, for the
--    sitewide cap. No FID (like chat_costs).
--
-- studio_writer's privileges, exactly what the routes and the cleanup use:
--   mp_progress    select, insert, update           (kept until erasure)
--   mp_blocks      select, insert                   (kept until erasure; a block is for good)
--   mp_lobby       select, insert, update, delete
--   mp_matches     select, insert, update, delete   (row locks: select … for update)
--   mp_challenges  select, insert, update, delete
--   mp_invites     select, insert, update, delete
--   mp_rate        select, insert, update, delete
--   mp_daily       select, insert, update, delete
--
-- Retention. No cron: any Play request runs the cleanup after its answer, at
-- most once per 10 minutes per server instance, at most 500 rows per table per
-- run (src/lib/minpentai/play-server/store.ts, cleanup):
--   mp_invites     deleted once expired (24 h after creation, used or not)
--   mp_challenges  deleted 1 h after they expired or were answered
--   mp_lobby       deleted 1 h after the ready time ended
--   mp_matches     a match nobody has polled for 24 h is ended as abandoned
--                  (no result); every match is deleted 30 days after it
--                  ended, with its state, replay and both usernames
--   mp_rate        deleted once its day is before today (UTC)
--   mp_daily       deleted once older than 90 days
--   mp_progress    kept until the person asks for erasure (docs/removal.md)
--   mp_blocks      kept until the person asks for erasure (docs/removal.md)

begin;

-- ---------------------------------------------------------------------------
-- 1. The computer ladder's progress.
-- ---------------------------------------------------------------------------

create table studio.mp_progress (
  fid bigint primary key,
  opened smallint not null default 1 check (opened between 1 and 5),
  -- {"1": {"tries": 3, "won": 61}, "2": {"tries": 1}}
  rec jsonb not null default '{}'::jsonb check (jsonb_typeof(rec) = 'object'),
  updated_at timestamptz not null default now()
);

alter table studio.mp_progress enable row level security;
create policy writer_read on studio.mp_progress for select to studio_writer using (true);
create policy writer_insert on studio.mp_progress for insert to studio_writer with check (true);
create policy writer_update on studio.mp_progress for update to studio_writer using (true) with check (true);
revoke all on studio.mp_progress from anon, authenticated;
revoke delete, truncate on studio.mp_progress from studio_writer;
grant select, insert, update on studio.mp_progress to studio_writer;

-- ---------------------------------------------------------------------------
-- 2. Ready for one-on-one.
-- ---------------------------------------------------------------------------

create table studio.mp_lobby (
  fid bigint primary key,
  -- Verified by the server (signed website name, or Farcaster's public API).
  username text not null check (username ~ '^[A-Za-z0-9][A-Za-z0-9.-]{0,30}$'),
  ready_at timestamptz not null default now(),
  ready_until timestamptz not null
);
create index mp_lobby_ready on studio.mp_lobby (ready_until, ready_at desc);

alter table studio.mp_lobby enable row level security;
create policy writer_read on studio.mp_lobby for select to studio_writer using (true);
create policy writer_insert on studio.mp_lobby for insert to studio_writer with check (true);
create policy writer_update on studio.mp_lobby for update to studio_writer using (true) with check (true);
create policy writer_delete on studio.mp_lobby for delete to studio_writer using (true);
revoke all on studio.mp_lobby from anon, authenticated;
revoke truncate on studio.mp_lobby from studio_writer;
grant select, insert, update, delete on studio.mp_lobby to studio_writer;

-- ---------------------------------------------------------------------------
-- 3. One-on-one matches.
-- ---------------------------------------------------------------------------

create table studio.mp_matches (
  id uuid primary key default gen_random_uuid(),
  fid_c bigint not null,
  fid_a bigint not null,
  username_c text not null,
  username_a text not null,
  -- Which rules the match was played under (the rules page's draft).
  rules_version text not null,
  rule text not null check (rule in ('diag', 'cost3', 'sight2', 'every8')),
  -- Draws the match's new rule; never sent to a browser.
  seed bigint not null,
  -- 'abandoned': nobody polled it for 24 hours; ended with no result.
  status text not null default 'live' check (status in ('live', 'over', 'cancelled', 'abandoned')),
  -- Bumped on every change; the poll's ?v=.
  version int not null default 1,
  state jsonb not null,
  act_deadline timestamptz,
  last_seen_c timestamptz not null default now(),
  last_seen_a timestamptz not null default now(),
  -- Once over: {win, kind, step, by, counts}.
  result jsonb,
  rematch_of uuid references studio.mp_matches(id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (fid_c <> fid_a),
  check ((status = 'live') = (ended_at is null))
);
create index mp_matches_c on studio.mp_matches (fid_c, status);
create index mp_matches_a on studio.mp_matches (fid_a, status);
create index mp_matches_ended on studio.mp_matches (ended_at) where ended_at is not null;

alter table studio.mp_matches enable row level security;
create policy writer_read on studio.mp_matches for select to studio_writer using (true);
create policy writer_insert on studio.mp_matches for insert to studio_writer with check (true);
create policy writer_update on studio.mp_matches for update to studio_writer using (true) with check (true);
revoke all on studio.mp_matches from anon, authenticated;
create policy writer_delete on studio.mp_matches for delete to studio_writer using (true);
revoke truncate on studio.mp_matches from studio_writer;
grant select, insert, update, delete on studio.mp_matches to studio_writer;

-- ---------------------------------------------------------------------------
-- 4. Challenges between ready players.
-- ---------------------------------------------------------------------------

create table studio.mp_challenges (
  id uuid primary key default gen_random_uuid(),
  from_fid bigint not null,
  from_username text not null,
  to_fid bigint not null,
  to_username text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'cancelled')),
  -- When it was answered or withdrawn (null while open).
  closed_at timestamptz,
  match_id uuid references studio.mp_matches(id) on delete set null,
  check (from_fid <> to_fid),
  check ((status = 'open') = (closed_at is null))
);
-- One open challenge per challenger (expired ones are closed before a new one).
create unique index mp_challenges_one_open on studio.mp_challenges (from_fid) where status = 'open';
create index mp_challenges_to on studio.mp_challenges (to_fid, status);

alter table studio.mp_challenges enable row level security;
create policy writer_read on studio.mp_challenges for select to studio_writer using (true);
create policy writer_insert on studio.mp_challenges for insert to studio_writer with check (true);
create policy writer_update on studio.mp_challenges for update to studio_writer using (true) with check (true);
revoke all on studio.mp_challenges from anon, authenticated;
create policy writer_delete on studio.mp_challenges for delete to studio_writer using (true);
revoke truncate on studio.mp_challenges from studio_writer;
grant select, insert, update, delete on studio.mp_challenges to studio_writer;

-- ---------------------------------------------------------------------------
-- 5. Invite links: one use, 24 hours.
-- ---------------------------------------------------------------------------

create table studio.mp_invites (
  -- 128 random bits, base64url.
  token text primary key check (token ~ '^[A-Za-z0-9_-]{22,64}$'),
  from_fid bigint not null,
  from_username text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by bigint,
  used_at timestamptz,
  match_id uuid references studio.mp_matches(id) on delete set null,
  check (used_by is null or used_by <> from_fid)
);
create index mp_invites_from on studio.mp_invites (from_fid, expires_at);
create index mp_invites_expires on studio.mp_invites (expires_at);

alter table studio.mp_invites enable row level security;
create policy writer_read on studio.mp_invites for select to studio_writer using (true);
create policy writer_insert on studio.mp_invites for insert to studio_writer with check (true);
create policy writer_update on studio.mp_invites for update to studio_writer using (true) with check (true);
revoke all on studio.mp_invites from anon, authenticated;
create policy writer_delete on studio.mp_invites for delete to studio_writer using (true);
revoke truncate on studio.mp_invites from studio_writer;
grant select, insert, update, delete on studio.mp_invites to studio_writer;

-- ---------------------------------------------------------------------------
-- 6. Blocks, for good.
-- ---------------------------------------------------------------------------

create table studio.mp_blocks (
  fid bigint not null,
  blocked_fid bigint not null,
  at timestamptz not null default now(),
  primary key (fid, blocked_fid),
  check (fid <> blocked_fid)
);
create index mp_blocks_blocked on studio.mp_blocks (blocked_fid, fid);

alter table studio.mp_blocks enable row level security;
create policy writer_read on studio.mp_blocks for select to studio_writer using (true);
create policy writer_insert on studio.mp_blocks for insert to studio_writer with check (true);
revoke all on studio.mp_blocks from anon, authenticated;
revoke update, delete, truncate on studio.mp_blocks from studio_writer;
grant select, insert on studio.mp_blocks to studio_writer;

-- ---------------------------------------------------------------------------
-- 7. Limits per person: this minute's and today's counts only.
-- ---------------------------------------------------------------------------

create table studio.mp_rate (
  fid bigint primary key,
  minute timestamptz not null,
  minute_count int not null default 0 check (minute_count >= 0),
  day date not null,
  day_count int not null default 0 check (day_count >= 0),
  last_match_at timestamptz,
  last_lobby_at timestamptz
);
create index mp_rate_day on studio.mp_rate (day);

alter table studio.mp_rate enable row level security;
create policy writer_read on studio.mp_rate for select to studio_writer using (true);
create policy writer_insert on studio.mp_rate for insert to studio_writer with check (true);
create policy writer_update on studio.mp_rate for update to studio_writer using (true) with check (true);
create policy writer_delete on studio.mp_rate for delete to studio_writer using (true);
revoke all on studio.mp_rate from anon, authenticated;
revoke truncate on studio.mp_rate from studio_writer;
grant select, insert, update, delete on studio.mp_rate to studio_writer;

-- ---------------------------------------------------------------------------
-- 8. Requests per day across everyone. No FID.
-- ---------------------------------------------------------------------------

create table studio.mp_daily (
  day date primary key,
  requests int not null default 0 check (requests >= 0)
);

alter table studio.mp_daily enable row level security;
create policy writer_read on studio.mp_daily for select to studio_writer using (true);
create policy writer_insert on studio.mp_daily for insert to studio_writer with check (true);
create policy writer_update on studio.mp_daily for update to studio_writer using (true) with check (true);
create policy writer_delete on studio.mp_daily for delete to studio_writer using (true);
revoke all on studio.mp_daily from anon, authenticated;
revoke truncate on studio.mp_daily from studio_writer;
grant select, insert, update, delete on studio.mp_daily to studio_writer;

commit;

-- Dry run: what would be kept, and that none of it is public.
select c.relname as table, c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'select') as anon_reads,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_reads,
       (select string_agg(p, ', ') from unnest(array['select', 'insert', 'update', 'delete']) p
        where has_table_privilege('studio_writer', c.oid, p)) as writer_may
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'studio' and c.relname like 'mp\_%' and c.relkind = 'r';
