-- 0009_minpentai_play.sql — Minpentai Play: the computer ladder's progress and
-- one-on-one (owner's decisions of 2026-10-09; the earlier proposal is
-- docs/proposals/minpentai-multiplayer.md on branch site-multiplayer-proposal). NOT APPLIED.
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
-- Nothing is counted per day, so there is no daily table.
--
-- studio_writer's privileges, exactly what the routes use:
--   mp_progress    select, insert, update
--   mp_lobby       select, insert, update, delete   (stop being ready; start a match)
--   mp_matches     select, insert, update           (row locks: select … for update)
--   mp_challenges  select, insert, update           (status changes; never deleted)
--   mp_invites     select, insert, update           (marked used; never deleted)
--   mp_blocks      select, insert                   (a block is for good)
-- Retention (deleting old matches and invites) is not in this migration.

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
  status text not null default 'live' check (status in ('live', 'over', 'cancelled')),
  -- Bumped on every change; the poll's ?v=.
  version int not null default 1,
  state jsonb not null,
  act_deadline timestamptz,
  last_seen_c timestamptz not null default now(),
  last_seen_a timestamptz not null default now(),
  -- Once over: {win, kind, step, by, counts}.
  result jsonb,
  rematch_of uuid references studio.mp_matches(id),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (fid_c <> fid_a),
  check ((status = 'live') = (ended_at is null))
);
create index mp_matches_c on studio.mp_matches (fid_c, status);
create index mp_matches_a on studio.mp_matches (fid_a, status);

alter table studio.mp_matches enable row level security;
create policy writer_read on studio.mp_matches for select to studio_writer using (true);
create policy writer_insert on studio.mp_matches for insert to studio_writer with check (true);
create policy writer_update on studio.mp_matches for update to studio_writer using (true) with check (true);
revoke all on studio.mp_matches from anon, authenticated;
revoke delete, truncate on studio.mp_matches from studio_writer;
grant select, insert, update on studio.mp_matches to studio_writer;

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
  match_id uuid references studio.mp_matches(id),
  check (from_fid <> to_fid)
);
-- One open challenge per challenger (expired ones are closed before a new one).
create unique index mp_challenges_one_open on studio.mp_challenges (from_fid) where status = 'open';
create index mp_challenges_to on studio.mp_challenges (to_fid, status);

alter table studio.mp_challenges enable row level security;
create policy writer_read on studio.mp_challenges for select to studio_writer using (true);
create policy writer_insert on studio.mp_challenges for insert to studio_writer with check (true);
create policy writer_update on studio.mp_challenges for update to studio_writer using (true) with check (true);
revoke all on studio.mp_challenges from anon, authenticated;
revoke delete, truncate on studio.mp_challenges from studio_writer;
grant select, insert, update on studio.mp_challenges to studio_writer;

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
  match_id uuid references studio.mp_matches(id),
  check (used_by is null or used_by <> from_fid)
);
create index mp_invites_from on studio.mp_invites (from_fid, expires_at);

alter table studio.mp_invites enable row level security;
create policy writer_read on studio.mp_invites for select to studio_writer using (true);
create policy writer_insert on studio.mp_invites for insert to studio_writer with check (true);
create policy writer_update on studio.mp_invites for update to studio_writer using (true) with check (true);
revoke all on studio.mp_invites from anon, authenticated;
revoke delete, truncate on studio.mp_invites from studio_writer;
grant select, insert, update on studio.mp_invites to studio_writer;

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

commit;

-- Dry run: what would be kept, and that none of it is public.
select c.relname as table, c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'select') as anon_reads,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_reads,
       (select string_agg(p, ', ') from unnest(array['select', 'insert', 'update', 'delete']) p
        where has_table_privilege('studio_writer', c.oid, p)) as writer_may
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'studio' and c.relname like 'mp\_%' and c.relkind = 'r';
