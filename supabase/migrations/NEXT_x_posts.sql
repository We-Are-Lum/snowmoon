-- NEXT_x_posts.sql: posts for the Snowmoon X account (@snowmoon_party), proposed and approved by the team in Discord's
-- #x-posts, and suggested by the site (owner, 2026-11-25; branch x-posts; plan docs/proposals/x-posts.md). Unnumbered
-- until merge: it takes the next free number then, checked against origin/main and production. NOT APPLIED until the
-- owner applies it; the branch merges only after he says "applied". Drafted by the coding agent (Claude, a closed model
-- by Anthropic). Tested on in-memory PGlite against main's 0001-0051 (npm run test:x-posts), version 2 included.
-- Requires 0001_core (the studio schema and the studio_writer role). Nothing else.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: a read-only look at the rights, then a block that writes realistic rows as the
-- site writes them, checks that bad rows are refused, and deletes them, all inside a transaction that ends in
-- `rollback;`; it ends "READ-BACK PASSED"; it sets no role, as the SQL Editor can't), and D. the undo, only if the release
-- is withdrawn. Safe to run twice. Additive: three new tables and a trigger on one
-- of them; nothing else changes.
--
-- What it is for. Release 1 (cards, posting off) and release 2 (posting on) both use these tables; release 2 needs no
-- other migration.
-- - studio.x_proposals: one row per card in #x-posts. A team proposal (its proposer's Discord user ID and name) or a site
--   suggestion (no proposer until someone on the team edits it; the work it is about: a published storyboard
--   'voice_publication', a challenge entry 'challenge_entry', or a recording-only Ephelion entry 'voice_take' (owner,
--   2026-11-25: its table, from NEXT_voice_takes.sql, not yet written, uses a uuid id), by id, at most one suggestion per
--   work). The post's text
--   and link, the card's Discord message ID, and its state: open, posting (claimed by one click, so it posts at most
--   once), posted (with X's post ID), failed, unknown (X didn't answer), withdrawn, deleted. studio_writer may select,
--   insert and update; never delete, so the log always has its proposal. A posted card is frozen (trigger
--   studio.x_proposals_freeze): its only change is to 'deleted', setting deleted_at, with everything else unchanged; a
--   deleted card never changes. The other states change as the site needs. (Version 2, 2026-11-25: the owner found on
--   Postgres 16 that version 1 let studio_writer rewrite a posted card's text and link, or reopen it.)
--   "Delete and redraft" (owner, 2026-11-25) deletes the post and starts a new open team card with the same text and link
--   and the clicker as proposer; it points back with redraft_of, and a card can be redrafted once.
-- - studio.x_approvals: who approves an open proposal now (Discord user ID and name). Taking an approval back or an edit
--   deletes rows. studio_writer may select, insert and delete.
-- - studio.x_post_log: every proposal, suggestion, edit, approval, approval taken back, withdrawal, hold, post, failed
--   post, delete and redraft (logged on both cards, each naming the other), with who (none for what the site does itself), the text and link at that moment, X's post ID and
--   what it cost as priced. This month's spending and today's posts are read from it. studio_writer may select and
--   insert only: it is append-only.
-- Private: no policy or grant for anon or authenticated; only the server reads these tables.
--
-- Safe with today's live code (main at 286891ec, 2026-11-25): nothing reads or writes these tables.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.x_proposals (
  id bigint generated always as identity primary key,
  source text not null check (source in ('team', 'site')),
  proposer_discord_id text check (proposer_discord_id ~ '^[0-9]{17,20}$'),
  proposer_name text check (char_length(proposer_name) between 1 and 100),
  body text not null check (char_length(body) between 1 and 4000 and btrim(body) <> ''),
  link text check (link ~ '^https://[^[:space:]]+$' and char_length(link) <= 2000),
  subject_kind text check (subject_kind in ('voice_publication', 'challenge_entry', 'voice_take')),
  subject_id text check (subject_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  status text not null default 'open' check (status in ('open', 'posting', 'posted', 'failed', 'unknown', 'withdrawn', 'deleted')),
  discord_message_id text unique check (discord_message_id ~ '^[0-9]{17,20}$'),
  x_post_id text unique check (x_post_id ~ '^[0-9]{1,25}$'),
  redraft_of bigint references studio.x_proposals (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  posted_at timestamptz,
  deleted_at timestamptz,
  constraint x_proposals_proposer check ((proposer_discord_id is null) = (proposer_name is null) and (source = 'site' or proposer_discord_id is not null)),
  constraint x_proposals_subject check ((subject_kind is null) = (subject_id is null) and (source = 'team' or subject_kind is not null)),
  constraint x_proposals_posted check ((status in ('posted', 'deleted')) = (x_post_id is not null and posted_at is not null)),
  constraint x_proposals_deleted check ((status = 'deleted') = (deleted_at is not null)),
  constraint x_proposals_redraft check (redraft_of is null or (source = 'team' and redraft_of <> id))
);
create unique index if not exists x_proposals_one_suggestion on studio.x_proposals (subject_kind, subject_id) where source = 'site';
create index if not exists x_proposals_subject on studio.x_proposals (subject_kind, subject_id) where subject_kind is not null;
create unique index if not exists x_proposals_one_redraft on studio.x_proposals (redraft_of) where redraft_of is not null;
create index if not exists x_proposals_created on studio.x_proposals (source, created_at desc);
-- Once posted, a card is frozen: its only change is to 'deleted' (with deleted_at), and a deleted card never changes.
create or replace function studio.x_proposals_freeze() returns trigger language plpgsql set search_path = '' as $fn$
begin
  if old.status = 'deleted' then
    raise exception 'x_proposals: a deleted post is final' using errcode = 'check_violation';
  end if;
  if old.status = 'posted' and not (new.status = 'deleted' and new.deleted_at is not null
      and (new.id, new.source, new.proposer_discord_id, new.proposer_name, new.body, new.link, new.subject_kind, new.subject_id,
        new.discord_message_id, new.x_post_id, new.redraft_of, new.created_at, new.posted_at)
        is not distinct from (old.id, old.source, old.proposer_discord_id, old.proposer_name, old.body, old.link, old.subject_kind,
        old.subject_id, old.discord_message_id, old.x_post_id, old.redraft_of, old.created_at, old.posted_at)) then
    raise exception 'x_proposals: a posted card can only be marked deleted' using errcode = 'check_violation';
  end if;
  return new;
end
$fn$;
revoke all on function studio.x_proposals_freeze() from public;
drop trigger if exists x_proposals_freeze on studio.x_proposals;
create trigger x_proposals_freeze before update on studio.x_proposals for each row execute function studio.x_proposals_freeze();
create table if not exists studio.x_approvals (
  proposal_id bigint not null references studio.x_proposals (id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  discord_name text not null check (char_length(discord_name) between 1 and 100),
  approved_at timestamptz not null default now(),
  primary key (proposal_id, discord_user_id)
);
create table if not exists studio.x_post_log (
  id bigint generated always as identity primary key,
  proposal_id bigint not null references studio.x_proposals (id),
  event text not null check (event in ('proposed', 'suggested', 'edited', 'approved', 'unapproved', 'withdrawn', 'auto_withdrawn',
    'would_post', 'held', 'posted', 'post_failed', 'post_unknown', 'deleted', 'auto_deleted', 'delete_failed', 'redrafted_to', 'redrafted_from')),
  actor_discord_id text check (actor_discord_id ~ '^[0-9]{17,20}$'),
  actor_name text check (char_length(actor_name) between 1 and 100),
  body text check (char_length(body) between 1 and 4000),
  link text check (char_length(link) <= 2000),
  x_post_id text check (x_post_id ~ '^[0-9]{1,25}$'),
  cost_usd numeric(8, 4) check (cost_usd >= 0 and cost_usd <= 10),
  other_proposal_id bigint references studio.x_proposals (id),
  detail text check (char_length(detail) <= 1000),
  at timestamptz not null default now(),
  constraint x_post_log_actor check ((actor_discord_id is null) = (actor_name is null)
    and (event not in ('proposed', 'edited', 'approved', 'unapproved', 'withdrawn', 'deleted', 'redrafted_to', 'redrafted_from') or actor_discord_id is not null)
    and (event not in ('suggested', 'auto_withdrawn', 'auto_deleted') or actor_discord_id is null)),
  constraint x_post_log_body check (event not in ('proposed', 'suggested', 'edited', 'redrafted_from') or body is not null),
  constraint x_post_log_redraft check ((event in ('redrafted_to', 'redrafted_from')) = (other_proposal_id is not null)),
  constraint x_post_log_post check (event not in ('posted', 'deleted', 'auto_deleted') or x_post_id is not null),
  constraint x_post_log_cost check (cost_usd is null or event in ('posted', 'post_unknown', 'deleted', 'auto_deleted'))
);
create index if not exists x_post_log_proposal on studio.x_post_log (proposal_id, at);
create index if not exists x_post_log_at on studio.x_post_log (at);

alter table studio.x_proposals enable row level security;
alter table studio.x_approvals enable row level security;
alter table studio.x_post_log enable row level security;
drop policy if exists writer_read on studio.x_proposals;
create policy writer_read on studio.x_proposals for select to studio_writer using (true);
drop policy if exists writer_insert on studio.x_proposals;
create policy writer_insert on studio.x_proposals for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.x_proposals;
create policy writer_update on studio.x_proposals for update to studio_writer using (true) with check (true);
drop policy if exists writer_read on studio.x_approvals;
create policy writer_read on studio.x_approvals for select to studio_writer using (true);
drop policy if exists writer_insert on studio.x_approvals;
create policy writer_insert on studio.x_approvals for insert to studio_writer with check (true);
drop policy if exists writer_delete on studio.x_approvals;
create policy writer_delete on studio.x_approvals for delete to studio_writer using (true);
drop policy if exists writer_read on studio.x_post_log;
create policy writer_read on studio.x_post_log for select to studio_writer using (true);
drop policy if exists writer_insert on studio.x_post_log;
create policy writer_insert on studio.x_post_log for insert to studio_writer with check (true);
revoke all on studio.x_proposals, studio.x_approvals, studio.x_post_log from public, anon, authenticated;
revoke all on studio.x_proposals, studio.x_approvals, studio.x_post_log from studio_writer;
grant select, insert, update on studio.x_proposals to studio_writer;
grant select, insert, delete on studio.x_approvals to studio_writer;
grant select, insert on studio.x_post_log to studio_writer;
rollback;

-- B. MIGRATION.
begin;
create table if not exists studio.x_proposals (
  id bigint generated always as identity primary key,
  source text not null check (source in ('team', 'site')),
  proposer_discord_id text check (proposer_discord_id ~ '^[0-9]{17,20}$'),
  proposer_name text check (char_length(proposer_name) between 1 and 100),
  body text not null check (char_length(body) between 1 and 4000 and btrim(body) <> ''),
  link text check (link ~ '^https://[^[:space:]]+$' and char_length(link) <= 2000),
  subject_kind text check (subject_kind in ('voice_publication', 'challenge_entry', 'voice_take')),
  subject_id text check (subject_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  status text not null default 'open' check (status in ('open', 'posting', 'posted', 'failed', 'unknown', 'withdrawn', 'deleted')),
  discord_message_id text unique check (discord_message_id ~ '^[0-9]{17,20}$'),
  x_post_id text unique check (x_post_id ~ '^[0-9]{1,25}$'),
  redraft_of bigint references studio.x_proposals (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  posted_at timestamptz,
  deleted_at timestamptz,
  constraint x_proposals_proposer check ((proposer_discord_id is null) = (proposer_name is null) and (source = 'site' or proposer_discord_id is not null)),
  constraint x_proposals_subject check ((subject_kind is null) = (subject_id is null) and (source = 'team' or subject_kind is not null)),
  constraint x_proposals_posted check ((status in ('posted', 'deleted')) = (x_post_id is not null and posted_at is not null)),
  constraint x_proposals_deleted check ((status = 'deleted') = (deleted_at is not null)),
  constraint x_proposals_redraft check (redraft_of is null or (source = 'team' and redraft_of <> id))
);
create unique index if not exists x_proposals_one_suggestion on studio.x_proposals (subject_kind, subject_id) where source = 'site';
create index if not exists x_proposals_subject on studio.x_proposals (subject_kind, subject_id) where subject_kind is not null;
create unique index if not exists x_proposals_one_redraft on studio.x_proposals (redraft_of) where redraft_of is not null;
create index if not exists x_proposals_created on studio.x_proposals (source, created_at desc);
-- Once posted, a card is frozen: its only change is to 'deleted' (with deleted_at), and a deleted card never changes.
create or replace function studio.x_proposals_freeze() returns trigger language plpgsql set search_path = '' as $fn$
begin
  if old.status = 'deleted' then
    raise exception 'x_proposals: a deleted post is final' using errcode = 'check_violation';
  end if;
  if old.status = 'posted' and not (new.status = 'deleted' and new.deleted_at is not null
      and (new.id, new.source, new.proposer_discord_id, new.proposer_name, new.body, new.link, new.subject_kind, new.subject_id,
        new.discord_message_id, new.x_post_id, new.redraft_of, new.created_at, new.posted_at)
        is not distinct from (old.id, old.source, old.proposer_discord_id, old.proposer_name, old.body, old.link, old.subject_kind,
        old.subject_id, old.discord_message_id, old.x_post_id, old.redraft_of, old.created_at, old.posted_at)) then
    raise exception 'x_proposals: a posted card can only be marked deleted' using errcode = 'check_violation';
  end if;
  return new;
end
$fn$;
revoke all on function studio.x_proposals_freeze() from public;
drop trigger if exists x_proposals_freeze on studio.x_proposals;
create trigger x_proposals_freeze before update on studio.x_proposals for each row execute function studio.x_proposals_freeze();
create table if not exists studio.x_approvals (
  proposal_id bigint not null references studio.x_proposals (id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  discord_name text not null check (char_length(discord_name) between 1 and 100),
  approved_at timestamptz not null default now(),
  primary key (proposal_id, discord_user_id)
);
create table if not exists studio.x_post_log (
  id bigint generated always as identity primary key,
  proposal_id bigint not null references studio.x_proposals (id),
  event text not null check (event in ('proposed', 'suggested', 'edited', 'approved', 'unapproved', 'withdrawn', 'auto_withdrawn',
    'would_post', 'held', 'posted', 'post_failed', 'post_unknown', 'deleted', 'auto_deleted', 'delete_failed', 'redrafted_to', 'redrafted_from')),
  actor_discord_id text check (actor_discord_id ~ '^[0-9]{17,20}$'),
  actor_name text check (char_length(actor_name) between 1 and 100),
  body text check (char_length(body) between 1 and 4000),
  link text check (char_length(link) <= 2000),
  x_post_id text check (x_post_id ~ '^[0-9]{1,25}$'),
  cost_usd numeric(8, 4) check (cost_usd >= 0 and cost_usd <= 10),
  other_proposal_id bigint references studio.x_proposals (id),
  detail text check (char_length(detail) <= 1000),
  at timestamptz not null default now(),
  constraint x_post_log_actor check ((actor_discord_id is null) = (actor_name is null)
    and (event not in ('proposed', 'edited', 'approved', 'unapproved', 'withdrawn', 'deleted', 'redrafted_to', 'redrafted_from') or actor_discord_id is not null)
    and (event not in ('suggested', 'auto_withdrawn', 'auto_deleted') or actor_discord_id is null)),
  constraint x_post_log_body check (event not in ('proposed', 'suggested', 'edited', 'redrafted_from') or body is not null),
  constraint x_post_log_redraft check ((event in ('redrafted_to', 'redrafted_from')) = (other_proposal_id is not null)),
  constraint x_post_log_post check (event not in ('posted', 'deleted', 'auto_deleted') or x_post_id is not null),
  constraint x_post_log_cost check (cost_usd is null or event in ('posted', 'post_unknown', 'deleted', 'auto_deleted'))
);
create index if not exists x_post_log_proposal on studio.x_post_log (proposal_id, at);
create index if not exists x_post_log_at on studio.x_post_log (at);

alter table studio.x_proposals enable row level security;
alter table studio.x_approvals enable row level security;
alter table studio.x_post_log enable row level security;
drop policy if exists writer_read on studio.x_proposals;
create policy writer_read on studio.x_proposals for select to studio_writer using (true);
drop policy if exists writer_insert on studio.x_proposals;
create policy writer_insert on studio.x_proposals for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.x_proposals;
create policy writer_update on studio.x_proposals for update to studio_writer using (true) with check (true);
drop policy if exists writer_read on studio.x_approvals;
create policy writer_read on studio.x_approvals for select to studio_writer using (true);
drop policy if exists writer_insert on studio.x_approvals;
create policy writer_insert on studio.x_approvals for insert to studio_writer with check (true);
drop policy if exists writer_delete on studio.x_approvals;
create policy writer_delete on studio.x_approvals for delete to studio_writer using (true);
drop policy if exists writer_read on studio.x_post_log;
create policy writer_read on studio.x_post_log for select to studio_writer using (true);
drop policy if exists writer_insert on studio.x_post_log;
create policy writer_insert on studio.x_post_log for insert to studio_writer with check (true);
revoke all on studio.x_proposals, studio.x_approvals, studio.x_post_log from public, anon, authenticated;
revoke all on studio.x_proposals, studio.x_approvals, studio.x_post_log from studio_writer;
grant select, insert, update on studio.x_proposals to studio_writer;
grant select, insert, delete on studio.x_approvals to studio_writer;
grant select, insert on studio.x_post_log to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Paste the lines below without their "-- ". It sets no role (postgres can't
--    switch roles in the SQL Editor): studio_writer's rights are read with has_table_privilege, and the rows are written
--    as postgres, exactly as the site writes them. Everything is inside one transaction that ends in rollback, so
--    nothing is kept even if a check fails part way. The Discord IDs fit the columns and are made up. Ends
--    "READ-BACK PASSED"; each check raises "READ-BACK FAILED: …" on failure.
--
-- begin;
-- select t, p, has_table_privilege('studio_writer', 'studio.' || t, p) as writer, has_table_privilege('anon', 'studio.' || t, p) as anon,
--   has_table_privilege('authenticated', 'studio.' || t, p) as authenticated
-- from unnest(array['x_proposals', 'x_approvals', 'x_post_log']) t, unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p order by 1, 2;
-- do $$
-- declare
--   proposer constant text := '100000000000000001';
--   second constant text := '100000000000000002';
--   lead constant text := '100000000000000003';
--   entry constant text := '72222222-2222-4222-8222-222222222222';
--   team_id bigint;
--   site_id bigint;
--   redraft_id bigint;
--   n int;
--   spent numeric;
--   refused boolean;
-- begin
--   -- Rights: exactly what the site needs, and nothing for anon or authenticated.
--   if not (has_table_privilege('studio_writer', 'studio.x_proposals', 'select') and has_table_privilege('studio_writer', 'studio.x_proposals', 'insert') and has_table_privilege('studio_writer', 'studio.x_proposals', 'update'))
--     or has_table_privilege('studio_writer', 'studio.x_proposals', 'delete') or has_table_privilege('studio_writer', 'studio.x_proposals', 'truncate') then raise exception 'READ-BACK FAILED: studio_writer''s rights on x_proposals'; end if;
--   if not (has_table_privilege('studio_writer', 'studio.x_approvals', 'select') and has_table_privilege('studio_writer', 'studio.x_approvals', 'insert') and has_table_privilege('studio_writer', 'studio.x_approvals', 'delete'))
--     or has_table_privilege('studio_writer', 'studio.x_approvals', 'update') then raise exception 'READ-BACK FAILED: studio_writer''s rights on x_approvals'; end if;
--   if not (has_table_privilege('studio_writer', 'studio.x_post_log', 'select') and has_table_privilege('studio_writer', 'studio.x_post_log', 'insert'))
--     or has_table_privilege('studio_writer', 'studio.x_post_log', 'update') or has_table_privilege('studio_writer', 'studio.x_post_log', 'delete') or has_table_privilege('studio_writer', 'studio.x_post_log', 'truncate')
--     then raise exception 'READ-BACK FAILED: studio_writer''s rights on x_post_log (it must be insert-only)'; end if;
--   select count(*) into n from unnest(array['x_proposals', 'x_approvals', 'x_post_log']) t, unnest(array['anon', 'authenticated']) r, unnest(array['select', 'insert', 'update', 'delete']) p
--     where has_table_privilege(r, 'studio.' || t, p);
--   if n <> 0 then raise exception 'READ-BACK FAILED: anon or authenticated has % rights on the X posts tables', n; end if;
--   select count(*) into n from pg_class where relnamespace = 'studio'::regnamespace and relname in ('x_proposals', 'x_approvals', 'x_post_log') and relrowsecurity;
--   if n <> 3 then raise exception 'READ-BACK FAILED: row level security is on for % of 3 tables', n; end if;
--
--   -- A team proposal, as the site writes it: the card, the proposer's own approval, the log row.
--   insert into studio.x_proposals (source, proposer_discord_id, proposer_name, body, link, discord_message_id)
--     values ('team', proposer, 'naaate', 'Chapter 4 is narrated now. Listen on snowmoon.party.', 'https://snowmoon.party/read/4', '1300000000000000001')
--     returning id into team_id;
--   insert into studio.x_approvals (proposal_id, discord_user_id, discord_name) values (team_id, proposer, 'naaate');
--   insert into studio.x_post_log (proposal_id, event, actor_discord_id, actor_name, body, link) values (team_id, 'proposed', proposer, 'naaate', 'Chapter 4 is narrated now. Listen on snowmoon.party.', 'https://snowmoon.party/read/4');
--   -- A second approval, then an edit: approvals reset to the proposer's alone.
--   insert into studio.x_approvals (proposal_id, discord_user_id, discord_name) values (team_id, second, 'garance');
--   insert into studio.x_post_log (proposal_id, event, actor_discord_id, actor_name) values (team_id, 'approved', second, 'garance');
--   update studio.x_proposals set body = 'Chapter 4 is narrated now.', updated_at = now() where id = team_id;
--   delete from studio.x_approvals where proposal_id = team_id and discord_user_id <> proposer;
--   insert into studio.x_post_log (proposal_id, event, actor_discord_id, actor_name, body, link) values (team_id, 'edited', proposer, 'naaate', 'Chapter 4 is narrated now.', 'https://snowmoon.party/read/4');
--   select count(*) into n from studio.x_approvals where proposal_id = team_id;
--   if n <> 1 then raise exception 'READ-BACK FAILED: % approvals after the edit, not 1', n; end if;
--   -- Two more approvals, then posted, then deleted.
--   insert into studio.x_approvals (proposal_id, discord_user_id, discord_name) values (team_id, second, 'garance'), (team_id, lead, 'luisotravez');
--   update studio.x_proposals set status = 'posting', updated_at = now() where id = team_id and status = 'open';
--   update studio.x_proposals set status = 'posted', x_post_id = '1993000000000000001', posted_at = now(), updated_at = now() where id = team_id and status = 'posting';
--   insert into studio.x_post_log (proposal_id, event, actor_discord_id, actor_name, x_post_id, cost_usd) values (team_id, 'posted', lead, 'luisotravez', '1993000000000000001', 0.2);
--   -- A posted card is frozen: its text, link and post can't change, it can't reopen, and it can't be posted again.
--   begin update studio.x_proposals set body = 'Something else.' where id = team_id; refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a posted card''s text was changed'; end if;
--   begin update studio.x_proposals set link = 'https://snowmoon.party/' where id = team_id; refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a posted card''s link was changed'; end if;
--   begin update studio.x_proposals set status = 'open', x_post_id = null, posted_at = null where id = team_id; refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a posted card was reopened'; end if;
--   begin update studio.x_proposals set status = 'deleted', deleted_at = now(), body = 'Something else.' where id = team_id; refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a delete that also changed the text was accepted'; end if;
--   update studio.x_proposals set status = 'deleted', deleted_at = now(), updated_at = now() where id = team_id and status = 'posted';
--   begin update studio.x_proposals set status = 'posted', deleted_at = null where id = team_id; refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a deleted post was changed'; end if;
--   select count(*) into n from studio.x_proposals where id = team_id and status = 'deleted' and body = 'Chapter 4 is narrated now.' and x_post_id = '1993000000000000001';
--   if n <> 1 then raise exception 'READ-BACK FAILED: posted to deleted did not keep the card as posted'; end if;
--   -- Delete and redraft: a new open team card with the same text and link, the clicker as proposer, logged on both.
--   insert into studio.x_proposals (source, proposer_discord_id, proposer_name, body, link, redraft_of)
--     select 'team', second, 'garance', body, link, id from studio.x_proposals where id = team_id returning id into redraft_id;
--   insert into studio.x_approvals (proposal_id, discord_user_id, discord_name) values (redraft_id, second, 'garance');
--   insert into studio.x_post_log (proposal_id, event, actor_discord_id, actor_name, other_proposal_id) values (team_id, 'redrafted_to', second, 'garance', redraft_id);
--   insert into studio.x_post_log (proposal_id, event, actor_discord_id, actor_name, body, link, other_proposal_id)
--     values (redraft_id, 'redrafted_from', second, 'garance', 'Chapter 4 is narrated now.', 'https://snowmoon.party/read/4', team_id);
--   select count(*) into n from studio.x_proposals where id = redraft_id and status = 'open' and body = 'Chapter 4 is narrated now.' and x_post_id is null;
--   if n <> 1 then raise exception 'READ-BACK FAILED: the redraft is not an open card with the same text'; end if;
--   begin insert into studio.x_proposals (source, proposer_discord_id, proposer_name, body, redraft_of) values ('team', lead, 'luisotravez', 'x', team_id); refused := false; exception when unique_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a second redraft of the same card was accepted'; end if;
--   begin insert into studio.x_proposals (source, body, subject_kind, subject_id, redraft_of) values ('site', 'x', 'voice_publication', '73333333-3333-4333-8333-333333333333', team_id); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a redraft saved as a site suggestion was accepted'; end if;
--   begin insert into studio.x_post_log (proposal_id, event, actor_discord_id, actor_name) values (team_id, 'redrafted_to', second, 'garance'); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a redraft log row without its other card was accepted'; end if;
--   insert into studio.x_post_log (proposal_id, event, actor_discord_id, actor_name, x_post_id, cost_usd) values (team_id, 'deleted', second, 'garance', '1993000000000000001', 0.01);
--
--   -- A site suggestion: no proposer, a subject; hidden on the site, so withdrawn by the site.
--   insert into studio.x_proposals (source, body, link, subject_kind, subject_id, discord_message_id)
--     values ('site', 'A new remix challenge entry: Zei by garance on Farcaster.', 'https://snowmoon.party/remix/' || entry, 'challenge_entry', entry, '1300000000000000002')
--     returning id into site_id;
--   insert into studio.x_post_log (proposal_id, event, body, link) values (site_id, 'suggested', 'A new remix challenge entry: Zei by garance on Farcaster.', 'https://snowmoon.party/remix/' || entry);
--   -- Anyone on the team edits it and becomes its proposer.
--   update studio.x_proposals set proposer_discord_id = second, proposer_name = 'garance', body = 'Zei, by garance on Farcaster.', updated_at = now() where id = site_id;
--   update studio.x_proposals set status = 'withdrawn', updated_at = now() where id = site_id;
--   insert into studio.x_post_log (proposal_id, event, detail) values (site_id, 'auto_withdrawn', 'hidden on the site');
--
--   -- A recording-only Ephelion entry ('voice_take', a uuid) can be suggested too; a kind outside the three can't.
--   insert into studio.x_proposals (source, body, link, subject_kind, subject_id)
--     values ('site', 'Zei''s line from chapter 3, voiced by garance on Farcaster.', 'https://snowmoon.party/ephelion', 'voice_take', '74444444-4444-4444-8444-444444444444');
--   begin insert into studio.x_proposals (source, body, subject_kind, subject_id) values ('site', 'x', 'voice_take', '4258'); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a voice take that is not a uuid was accepted'; end if;
--   begin insert into studio.x_proposals (source, body, subject_kind, subject_id) values ('site', 'x', 'scene_version', '75555555-5555-4555-8555-555555555555'); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: an unknown kind of work was accepted'; end if;
--   -- Bad rows are refused.
--   begin insert into studio.x_proposals (source, proposer_discord_id, proposer_name, body) values ('team', 'naaate', 'naaate', 'x'); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a Discord ID that is not a number was accepted'; end if;
--   begin insert into studio.x_proposals (source, proposer_discord_id, proposer_name, body) values ('team', proposer, 'naaate', '   '); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a blank post was accepted'; end if;
--   begin insert into studio.x_proposals (source, proposer_discord_id, proposer_name, body, link) values ('team', proposer, 'naaate', 'x', 'http://snowmoon.party'); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a link that is not https was accepted'; end if;
--   begin insert into studio.x_proposals (source, body) values ('team', 'x'); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a team proposal without a proposer was accepted'; end if;
--   begin insert into studio.x_proposals (source, body) values ('site', 'x'); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a site suggestion without its work was accepted'; end if;
--   begin insert into studio.x_proposals (source, body, subject_kind, subject_id) values ('site', 'x', 'challenge_entry', entry); refused := false; exception when unique_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a second suggestion for the same work was accepted'; end if;
--   begin update studio.x_proposals set status = 'posted' where id = site_id; refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: posted without an X post was accepted'; end if;
--   begin insert into studio.x_approvals (proposal_id, discord_user_id, discord_name) values (team_id, lead, 'luisotravez'); refused := false; exception when unique_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: the same person approving twice was accepted'; end if;
--   begin insert into studio.x_post_log (proposal_id, event) values (team_id, 'approved'); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: an approval without who was accepted'; end if;
--   begin insert into studio.x_post_log (proposal_id, event, actor_discord_id, actor_name, cost_usd) values (team_id, 'approved', lead, 'luisotravez', 0.2); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a cost on an approval was accepted'; end if;
--
--   -- What the site reads back: this month's spending and today's posts.
--   select coalesce(sum(cost_usd), 0) into spent from studio.x_post_log where proposal_id in (team_id, site_id) and at >= date_trunc('month', now());
--   if spent <> 0.21 then raise exception 'READ-BACK FAILED: this month''s spending reads %, not 0.21', spent; end if;
--   select count(*) into n from studio.x_post_log where proposal_id in (team_id, site_id, redraft_id);
--   if n <> 9 then raise exception 'READ-BACK FAILED: % log rows, not 9', n; end if;
--
--   -- Delete them (the transaction's rollback below also undoes everything).
--   delete from studio.x_post_log where proposal_id in (team_id, site_id, redraft_id);
--   delete from studio.x_approvals where proposal_id in (team_id, site_id, redraft_id);
--   delete from studio.x_proposals where id in (team_id, site_id, redraft_id);
--   delete from studio.x_proposals where subject_kind = 'voice_take' and subject_id = '74444444-4444-4444-8444-444444444444';
--   if exists (select 1 from studio.x_proposals where id in (team_id, site_id, redraft_id)) or exists (select 1 from studio.x_post_log where proposal_id in (team_id, site_id, redraft_id))
--     or exists (select 1 from studio.x_proposals where subject_kind = 'voice_take')
--     then raise exception 'READ-BACK FAILED: the test rows were not deleted'; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;
-- rollback;

-- D. UNDO, only if the release is withdrawn (after the code that reads these tables is gone). It deletes every
--    proposal, approval and log row. Paste without the "-- ".
-- begin;
-- drop table if exists studio.x_post_log;
-- drop table if exists studio.x_approvals;
-- drop table if exists studio.x_proposals;
-- drop function if exists studio.x_proposals_freeze();
-- commit;
