-- NEXT_minpentai_practice.sql — Minpentai practice matches between people. Branch minpentai-practice, owner
-- 2026-11-03 (docs/proposals/minpentai-matches-between-people.md, "Build plan for practice matches"). Takes the next
-- free number at merge. NOT APPLIED.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0032.
-- One transaction: all of it or none. Run the dry run first (it ends in rollback), then the same without it.
--
-- What it changes: studio.mp_agent_matches (0032) keeps practice matches too, so a practice match is saved, versioned
-- and read the way an agent match is. Three columns, all with defaults, so every existing row is a solo match as before:
-- 1. kind: 'solo' (a person against the site computer, as now) or 'practice' (two people).
-- 2. opponent: a practice match's second player (Amber), a Farcaster ID or minus a wallet account's id; null until
--    someone joins, and always null for a solo match. Never the same as person.
-- 3. open: a public practice match waiting for its second player (shown on the open list). False once someone joins,
--    and always false for a solo match or a private invite.
-- No grant or policy changes: the table stays readable only by the server (studio_writer), and nobody can delete.

-- ---------- dry run: run this first; it changes nothing ----------
begin;
alter table studio.mp_agent_matches
  add column kind text not null default 'solo' check (kind in ('solo', 'practice')),
  add column opponent bigint check (opponent is null or opponent <> 0),
  add column open boolean not null default false;
alter table studio.mp_agent_matches
  add constraint mp_agent_matches_two_people check (opponent is null or opponent <> person),
  add constraint mp_agent_matches_solo_alone check (kind = 'practice' or (opponent is null and not open));
create index mp_agent_matches_opponent on studio.mp_agent_matches (opponent, over, updated_at desc) where opponent is not null;
create index mp_agent_matches_open on studio.mp_agent_matches (created_at desc) where open;
select count(*) as rows_now_solo from studio.mp_agent_matches where kind = 'solo';
rollback;

-- ---------- the change ----------
begin;
alter table studio.mp_agent_matches
  add column kind text not null default 'solo' check (kind in ('solo', 'practice')),
  add column opponent bigint check (opponent is null or opponent <> 0),
  add column open boolean not null default false;
alter table studio.mp_agent_matches
  add constraint mp_agent_matches_two_people check (opponent is null or opponent <> person),
  add constraint mp_agent_matches_solo_alone check (kind = 'practice' or (opponent is null and not open));
create index mp_agent_matches_opponent on studio.mp_agent_matches (opponent, over, updated_at desc) where opponent is not null;
create index mp_agent_matches_open on studio.mp_agent_matches (created_at desc) where open;
commit;

-- ---------- read back (expect: every existing match solo, no opponent, not open) ----------
-- select kind, count(*), count(opponent) as with_opponent, count(*) filter (where open) as open from studio.mp_agent_matches group by kind;
