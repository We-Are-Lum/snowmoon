-- NEXT_backstory_shortlist.sql: the admins' private shortlist for the poidh backstory bounty (/admin/backstories;
-- owner, 2026-11-16; branch backstory-shortlist). NOT APPLIED. Takes the next free number at merge (CLAUDE.md), checked
-- against origin/main and production. DRAFT, drafted by the coding agent (Claude, a closed model by Anthropic).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: a read-only select, then a do block that inserts realistic rows as the site
-- writes them, moves one between piles, checks that bad rows are refused, and deletes them; it ends "READ-BACK
-- PASSED"), and D. the undo, only if the release is withdrawn. Safe to run twice. Additive: two new tables, nothing
-- else changes.
--
-- What it is for. /admin/backstories lists every claim on poidh bounty 560 (poidh.xyz's bounty 1546), read from the
-- PoidhV3 contract on Base, including claims made on poidh.xyz itself. Each claim is in one of three piles: New (no row
-- here), Shortlisted or Passed (a row here). Nothing is sent onchain or to poidh; passing removes nothing from poidh.
-- - studio.backstory_shortlist: one row per decided claim, keyed by (bounty_id, claim_id): the pile, for Passed an
--   optional reason and a short note, the admin who decided (FID) and when. With it, a copy of the claim as the admin
--   saw it when deciding (owner, 2026-11-16: kept so the shortlisted ones can later be shown publicly after the close,
--   and people can build on them; nothing is public yet): the claimant's address, the claim's title and description
--   (the backstory) as they are on Base, the claim's URI (the claim NFT's tokenURI), the picture's address read from
--   it, the snowmoon.party picture it links (if any), when it was claimed, a sha256 of those fields, and when the copy
--   was taken. Every move between piles takes the copy again; "Put back" (to New) deletes the row. studio_writer may
--   select, insert, update and delete (it is the admins' own working list); nothing for anon or authenticated.
-- - studio.backstory_visits: one row per admin and bounty: their latest visit, and "since", the visit before the
--   latest one that was over an hour earlier ("New since your last visit"; a reload within the hour keeps the same
--   "since"). studio_writer may select, insert and update; no delete.
--
-- Safe with today's live code (main at 81ecbf59, 2026-11-16): nothing reads or writes either table.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.backstory_shortlist (
  bounty_id bigint not null check (bounty_id >= 0),
  claim_id bigint not null check (claim_id >= 0),
  pile text not null check (pile in ('shortlisted', 'passed')),
  reason text check (reason in ('no_backstory', 'not_true_to_book', 'picture_not_from_site')),
  note text check (note is null or (char_length(note) between 1 and 280 and btrim(note) <> '')),
  decided_by bigint not null check (decided_by > 0),
  decided_at timestamptz not null default now(),
  claimant text not null check (claimant ~ '^0x[0-9a-f]{40}$'),
  title text not null check (char_length(title) <= 1000),
  description text not null check (char_length(description) <= 20000),
  claim_uri text check (claim_uri is null or char_length(claim_uri) between 1 and 2048),
  picture_url text check (picture_url is null or (char_length(picture_url) <= 2048 and picture_url ~ '^(https|ipfs)://[^[:space:]]+$')),
  picture_version uuid,
  claimed_at timestamptz not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default now(),
  primary key (bounty_id, claim_id),
  constraint backstory_shortlist_reason_on_pass check (pile = 'passed' or (reason is null and note is null))
);
create index if not exists backstory_shortlist_pile on studio.backstory_shortlist (bounty_id, pile, decided_at desc);

create table if not exists studio.backstory_visits (
  fid bigint not null check (fid > 0),
  bounty_id bigint not null check (bounty_id >= 0),
  visit_at timestamptz not null default now(),
  since_at timestamptz,
  primary key (fid, bounty_id),
  constraint backstory_visits_since check (since_at is null or since_at <= visit_at)
);

alter table studio.backstory_shortlist enable row level security;
alter table studio.backstory_visits enable row level security;
drop policy if exists writer_read on studio.backstory_shortlist;
create policy writer_read on studio.backstory_shortlist for select to studio_writer using (true);
drop policy if exists writer_insert on studio.backstory_shortlist;
create policy writer_insert on studio.backstory_shortlist for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.backstory_shortlist;
create policy writer_update on studio.backstory_shortlist for update to studio_writer using (true) with check (true);
drop policy if exists writer_delete on studio.backstory_shortlist;
create policy writer_delete on studio.backstory_shortlist for delete to studio_writer using (true);
drop policy if exists writer_read on studio.backstory_visits;
create policy writer_read on studio.backstory_visits for select to studio_writer using (true);
drop policy if exists writer_insert on studio.backstory_visits;
create policy writer_insert on studio.backstory_visits for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.backstory_visits;
create policy writer_update on studio.backstory_visits for update to studio_writer using (true) with check (true);
revoke all on studio.backstory_shortlist from anon, authenticated;
revoke all on studio.backstory_visits from anon, authenticated;
revoke truncate, references, trigger on studio.backstory_shortlist from studio_writer;
revoke delete, truncate, references, trigger on studio.backstory_visits from studio_writer;
grant select, insert, update, delete on studio.backstory_shortlist to studio_writer;
grant select, insert, update on studio.backstory_visits to studio_writer;
rollback;

-- B. MIGRATION.
begin;
create table if not exists studio.backstory_shortlist (
  bounty_id bigint not null check (bounty_id >= 0),
  claim_id bigint not null check (claim_id >= 0),
  pile text not null check (pile in ('shortlisted', 'passed')),
  reason text check (reason in ('no_backstory', 'not_true_to_book', 'picture_not_from_site')),
  note text check (note is null or (char_length(note) between 1 and 280 and btrim(note) <> '')),
  decided_by bigint not null check (decided_by > 0),
  decided_at timestamptz not null default now(),
  claimant text not null check (claimant ~ '^0x[0-9a-f]{40}$'),
  title text not null check (char_length(title) <= 1000),
  description text not null check (char_length(description) <= 20000),
  claim_uri text check (claim_uri is null or char_length(claim_uri) between 1 and 2048),
  picture_url text check (picture_url is null or (char_length(picture_url) <= 2048 and picture_url ~ '^(https|ipfs)://[^[:space:]]+$')),
  picture_version uuid,
  claimed_at timestamptz not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default now(),
  primary key (bounty_id, claim_id),
  constraint backstory_shortlist_reason_on_pass check (pile = 'passed' or (reason is null and note is null))
);
create index if not exists backstory_shortlist_pile on studio.backstory_shortlist (bounty_id, pile, decided_at desc);

create table if not exists studio.backstory_visits (
  fid bigint not null check (fid > 0),
  bounty_id bigint not null check (bounty_id >= 0),
  visit_at timestamptz not null default now(),
  since_at timestamptz,
  primary key (fid, bounty_id),
  constraint backstory_visits_since check (since_at is null or since_at <= visit_at)
);

alter table studio.backstory_shortlist enable row level security;
alter table studio.backstory_visits enable row level security;
drop policy if exists writer_read on studio.backstory_shortlist;
create policy writer_read on studio.backstory_shortlist for select to studio_writer using (true);
drop policy if exists writer_insert on studio.backstory_shortlist;
create policy writer_insert on studio.backstory_shortlist for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.backstory_shortlist;
create policy writer_update on studio.backstory_shortlist for update to studio_writer using (true) with check (true);
drop policy if exists writer_delete on studio.backstory_shortlist;
create policy writer_delete on studio.backstory_shortlist for delete to studio_writer using (true);
drop policy if exists writer_read on studio.backstory_visits;
create policy writer_read on studio.backstory_visits for select to studio_writer using (true);
drop policy if exists writer_insert on studio.backstory_visits;
create policy writer_insert on studio.backstory_visits for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.backstory_visits;
create policy writer_update on studio.backstory_visits for update to studio_writer using (true) with check (true);
revoke all on studio.backstory_shortlist from anon, authenticated;
revoke all on studio.backstory_visits from anon, authenticated;
revoke truncate, references, trigger on studio.backstory_shortlist from studio_writer;
revoke delete, truncate, references, trigger on studio.backstory_visits from studio_writer;
grant select, insert, update, delete on studio.backstory_shortlist to studio_writer;
grant select, insert, update on studio.backstory_visits to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Two parts, nothing is kept. Paste the lines below without their "-- ".
-- (a) one read-only select: every row's ok must be true (6 rows).
-- select n, what, ok from (values
--   (1, 'both tables exist, with row level security on',
--     coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.backstory_shortlist')), false)
--       and coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.backstory_visits')), false)),
--   (2, 'backstory_shortlist has its 16 columns and its key (bounty_id, claim_id)',
--     (select count(*) from information_schema.columns where table_schema = 'studio' and table_name = 'backstory_shortlist') = 16
--       and (select array_agg(a.attname::text order by k.ord) from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum where i.indrelid = 'studio.backstory_shortlist'::regclass and i.indisprimary) = array['bounty_id', 'claim_id']),
--   (3, 'studio_writer: select, insert, update and delete on backstory_shortlist; no truncate',
--     has_table_privilege('studio_writer', 'studio.backstory_shortlist', 'SELECT') and has_table_privilege('studio_writer', 'studio.backstory_shortlist', 'INSERT')
--       and has_table_privilege('studio_writer', 'studio.backstory_shortlist', 'UPDATE') and has_table_privilege('studio_writer', 'studio.backstory_shortlist', 'DELETE')
--       and not has_table_privilege('studio_writer', 'studio.backstory_shortlist', 'TRUNCATE')),
--   (4, 'studio_writer: select, insert and update on backstory_visits; no delete or truncate',
--     has_table_privilege('studio_writer', 'studio.backstory_visits', 'SELECT') and has_table_privilege('studio_writer', 'studio.backstory_visits', 'INSERT')
--       and has_table_privilege('studio_writer', 'studio.backstory_visits', 'UPDATE') and not has_table_privilege('studio_writer', 'studio.backstory_visits', 'DELETE')
--       and not has_table_privilege('studio_writer', 'studio.backstory_visits', 'TRUNCATE')),
--   (5, 'the policies are studio_writer''s only (4 + 3)',
--     (select count(*) from pg_policies where schemaname = 'studio' and tablename in ('backstory_shortlist', 'backstory_visits')) = 7
--       and not exists (select 1 from pg_policies where schemaname = 'studio' and tablename in ('backstory_shortlist', 'backstory_visits') and roles <> '{studio_writer}')),
--   (6, 'anon and authenticated have nothing on either table',
--     not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['studio.backstory_shortlist', 'studio.backstory_visits']) t, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, t, p)))
-- ) as t(n, what, ok) order by n;
-- (b) one do block: a realistic shortlisted claim (a ~1,600-character backstory, an IPFS claim URI and picture, a
--     linked snowmoon.party picture) and a passed one (a reason and a note, a picture on another host), inserted as the
--     site writes them; the passed one moved to Shortlisted (its reason and note cleared, the copy taken again); bad
--     rows refused; then a visit row rolled over as the site does; then everything deleted. Claim ids 2147483600 and
--     2147483601 and admin FID 2147483646 belong to no real claim or account. Ends "READ-BACK PASSED"; each check raises
--     "READ-BACK FAILED: …". It sets no role (postgres can't switch roles in the SQL Editor).
-- do $$
-- declare
--   story text := repeat('When she was young she kept the ledger for the ferry crossing at Redshire, and every winter the numbers stopped adding up. ', 14);
--   refused boolean;
--   s timestamptz;
--   n int;
-- begin
--   if char_length(story) < 1500 then raise exception 'READ-BACK FAILED: the test backstory is too short to be realistic'; end if;
--   insert into studio.backstory_shortlist (bounty_id, claim_id, pile, decided_by, claimant, title, description, claim_uri, picture_url, picture_version, claimed_at, content_sha256)
--     values (560, 2147483600, 'shortlisted', 2147483646, '0x' || repeat('2f', 20), 'Mu and the Ledger of Years',
--       story || E'\n\nhttps://snowmoon.party/challenge/p/00000000-0000-4000-8000-000000000001',
--       'https://beige-impossible-dragon-883.mypinata.cloud/ipfs/QmX7RtFxievWyBWDipBWLEUy9EG8zsLtuBmjMvT8qggGTR',
--       'https://beige-impossible-dragon-883.mypinata.cloud/ipfs/QmZJr6Dk8D2NJLepisVkjCrpiSy2dSwjFPjabB1UGTL4Po',
--       '00000000-0000-4000-8000-000000000001', '2026-11-16T13:32:43Z', repeat('a1', 32));
--   insert into studio.backstory_shortlist (bounty_id, claim_id, pile, reason, note, decided_by, claimant, title, description, claim_uri, picture_url, claimed_at, content_sha256)
--     values (560, 2147483601, 'passed', 'picture_not_from_site', 'Picture is on GitHub, not linked to a page here.', 2147483646, '0x' || repeat('94', 20), 'Deluin — The Wall on the Inside',
--       'Sixty words about Deluin and the wall he built on the inside of the house, then took down a brick at a time.',
--       'https://raw.githubusercontent.com/example/bounty-submissions/0e85c9cd4473ac46c12267971f6608aca54496c3/deluin/deluin_wall.jpg',
--       'https://raw.githubusercontent.com/example/bounty-submissions/0e85c9cd4473ac46c12267971f6608aca54496c3/deluin/deluin_wall.jpg',
--       '2026-11-13T14:37:00Z', repeat('b2', 32));
--   update studio.backstory_shortlist set pile = 'shortlisted', reason = null, note = null, decided_by = 2147483646, decided_at = now(), content_sha256 = repeat('c3', 32), captured_at = now()
--     where bounty_id = 560 and claim_id = 2147483601;
--   select count(*)::int into n from studio.backstory_shortlist where bounty_id = 560 and claim_id in (2147483600, 2147483601) and pile = 'shortlisted';
--   if n <> 2 then raise exception 'READ-BACK FAILED: % of the 2 test claims are shortlisted', n; end if;
--   refused := false;
--   begin update studio.backstory_shortlist set reason = 'no_backstory' where bounty_id = 560 and claim_id = 2147483600;
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a shortlisted claim took a pass reason'; end if;
--   refused := false;
--   begin insert into studio.backstory_shortlist (bounty_id, claim_id, pile, decided_by, claimant, title, description, claimed_at, content_sha256)
--     values (560, 2147483602, 'maybe', 2147483646, '0x' || repeat('2f', 20), 't', 'd', now(), repeat('a1', 32));
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a pile other than shortlisted or passed was accepted'; end if;
--   refused := false;
--   begin insert into studio.backstory_shortlist (bounty_id, claim_id, pile, decided_by, claimant, title, description, claimed_at, content_sha256)
--     values (560, 2147483602, 'passed', 2147483646, '0x2FEB329B9289B60064904FA61FC347157A5AED6A', 't', 'd', now(), repeat('a1', 32));
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a claimant address not in lowercase was accepted'; end if;
--   refused := false;
--   begin insert into studio.backstory_shortlist (bounty_id, claim_id, pile, decided_by, claimant, title, description, claimed_at, content_sha256)
--     values (560, 2147483602, 'passed', 2147483646, '0x' || repeat('2f', 20), 't', repeat('x', 20001), now(), repeat('a1', 32));
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a description over 20,000 characters was accepted'; end if;
--   refused := false;
--   begin insert into studio.backstory_shortlist (bounty_id, claim_id, pile, note, decided_by, claimant, title, description, claimed_at, content_sha256)
--     values (560, 2147483602, 'passed', repeat('x', 281), 2147483646, '0x' || repeat('2f', 20), 't', 'd', now(), repeat('a1', 32));
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a note over 280 characters was accepted'; end if;
--   -- A visit, then the next one over an hour later: "since" becomes the first visit; a reload within the hour keeps it.
--   insert into studio.backstory_visits (fid, bounty_id, visit_at) values (2147483646, 560, now() - interval '3 hours');
--   insert into studio.backstory_visits as v (fid, bounty_id) values (2147483646, 560)
--     on conflict (fid, bounty_id) do update set since_at = case when v.visit_at < now() - interval '1 hour' then v.visit_at else v.since_at end, visit_at = now();
--   insert into studio.backstory_visits as v (fid, bounty_id) values (2147483646, 560)
--     on conflict (fid, bounty_id) do update set since_at = case when v.visit_at < now() - interval '1 hour' then v.visit_at else v.since_at end, visit_at = now()
--     returning since_at into s;
--   if s is null or s > now() - interval '2 hours' then raise exception 'READ-BACK FAILED: "since" is %, not the visit three hours ago', s; end if;
--   delete from studio.backstory_shortlist where bounty_id = 560 and claim_id in (2147483600, 2147483601, 2147483602);
--   delete from studio.backstory_visits where fid = 2147483646;
--   select (select count(*)::int from studio.backstory_shortlist where claim_id in (2147483600, 2147483601, 2147483602))
--        + (select count(*)::int from studio.backstory_visits where fid = 2147483646) into n;
--   if n <> 0 then raise exception 'READ-BACK FAILED: % test rows left after the delete', n; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;

-- D. UNDO (only if this release is withdrawn). Paste without the "-- ". The admins' piles, reasons and copies are lost;
-- nothing on poidh or Base changes.
-- begin;
-- drop table if exists studio.backstory_visits;
-- drop table if exists studio.backstory_shortlist;
-- commit;
