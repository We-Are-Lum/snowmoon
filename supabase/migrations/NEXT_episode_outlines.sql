-- NEXT_episode_outlines.sql — Episode 1: the opening, the card challenge's outlines (branch episode1-opening, 2026-11-24).
-- NOT APPLIED. It gets the next free number at merge (CLAUDE.md), checked against origin/main and production.
-- Drafted by the coding agent (Claude, a closed model by Anthropic). Tested on PGlite: npm run test:episode-sql.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Three parts, in order:
-- 1. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), 2. the migration (ending in
-- `commit;`), 3. the read-back (after commit; it inserts a realistic outline, withdraws it, hides another, checks the
-- refusals, and deletes both). Safe to run twice.
--
-- What it is for. A person's outline for Episode 1 is kept only once they press Submit (drafts stay on their device):
-- its cards (1 to 10, each "what happens" and "what it does for the viewer", up to 120 characters each, and optionally
-- one published picture's version id), its optional title, where the first-minute line sits (after card n; 0 = before
-- card 1), the name shown with it, the account check's decision at Submit ('admin', 'invited' or 'passed'; nothing is
-- kept for an account that didn't pass, because Submit refuses it), and when. Withdrawing sets `withdrawn_at`; a
-- moderator hiding it sets `hidden_at` and `hidden_by`. Neither can be undone, and no row is ever deleted by the site.
-- - studio.challenge_outlines, with row level security; studio_writer may select and insert, and update only
--   withdrawn_at, hidden_at and hidden_by. No delete or truncate. anon and authenticated get nothing.
-- - studio.outline_cards_ok(jsonb): the cards' shape, used by the table's check.
-- - studio.outline_stays(): a trigger that refuses un-withdrawing or un-hiding.
-- Nothing else changes. No live code reads or writes this table until the episode-1 release is merged.

-- 1. The dry run: everything below, then rollback. Expect no error.
begin;
create or replace function studio.outline_cards_ok(c jsonb) returns boolean language plpgsql immutable as $f$
declare x jsonb; k text;
begin
  if c is null or jsonb_typeof(c) <> 'array' or jsonb_array_length(c) not between 1 and 10 then return false; end if;
  for x in select value from jsonb_array_elements(c) loop
    if jsonb_typeof(x) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(x) loop
      if k not in ('happens', 'does', 'picture') then return false; end if;
    end loop;
    if jsonb_typeof(x->'happens') is distinct from 'string' or jsonb_typeof(x->'does') is distinct from 'string' then return false; end if;
    if char_length(x->>'happens') not between 1 and 120 or char_length(x->>'does') not between 1 and 120 then return false; end if;
    if btrim(x->>'happens') = '' or btrim(x->>'does') = '' then return false; end if;
    if x ? 'picture' and jsonb_typeof(x->'picture') <> 'null'
       and (jsonb_typeof(x->'picture') <> 'string' or (x->>'picture') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return false; end if;
  end loop;
  return true;
end $f$;
create table if not exists studio.challenge_outlines (
  id uuid primary key default gen_random_uuid(),
  challenge text not null check (challenge ~ '^[a-z0-9-]{1,40}$'),
  fid bigint not null check (fid <> 0),
  by_name text check (by_name is null or char_length(by_name) between 1 and 100),
  title text check (title is null or (char_length(title) between 1 and 80 and btrim(title) <> '')),
  cards jsonb not null check (studio.outline_cards_ok(cards)),
  minute_after smallint not null check (minute_after between 0 and 10),
  decision text not null check (decision in ('admin', 'invited', 'passed')),
  submitted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  hidden_at timestamptz,
  hidden_by bigint,
  constraint challenge_outlines_minute_in_deck check (minute_after <= jsonb_array_length(cards)),
  constraint challenge_outlines_withdrawn_after check (withdrawn_at is null or withdrawn_at >= submitted_at),
  constraint challenge_outlines_hidden_after check (hidden_at is null or hidden_at >= submitted_at),
  constraint challenge_outlines_hidden_by check ((hidden_at is null) = (hidden_by is null))
);
create index if not exists challenge_outlines_list on studio.challenge_outlines (challenge, submitted_at desc, id desc) where withdrawn_at is null and hidden_at is null;
create index if not exists challenge_outlines_person on studio.challenge_outlines (challenge, fid, submitted_at);
create or replace function studio.outline_stays() returns trigger language plpgsql as $f$
begin
  if old.withdrawn_at is not null and new.withdrawn_at is distinct from old.withdrawn_at then
    raise exception 'an outline stays withdrawn' using errcode = 'check_violation';
  end if;
  if old.hidden_at is not null and (new.hidden_at is distinct from old.hidden_at or new.hidden_by is distinct from old.hidden_by) then
    raise exception 'an outline stays hidden' using errcode = 'check_violation';
  end if;
  return new;
end $f$;
drop trigger if exists challenge_outlines_stay on studio.challenge_outlines;
create trigger challenge_outlines_stay before update on studio.challenge_outlines for each row execute function studio.outline_stays();
alter table studio.challenge_outlines enable row level security;
drop policy if exists writer_read on studio.challenge_outlines;
drop policy if exists writer_insert on studio.challenge_outlines;
drop policy if exists writer_update on studio.challenge_outlines;
create policy writer_read on studio.challenge_outlines for select to studio_writer using (true);
create policy writer_insert on studio.challenge_outlines for insert to studio_writer with check (withdrawn_at is null and hidden_at is null);
create policy writer_update on studio.challenge_outlines for update to studio_writer using (true) with check (true);
revoke all on studio.challenge_outlines from anon, authenticated, studio_writer;
grant select, insert on studio.challenge_outlines to studio_writer;
grant update (withdrawn_at, hidden_at, hidden_by) on studio.challenge_outlines to studio_writer;
revoke all on function studio.outline_cards_ok(jsonb) from public, anon, authenticated;
grant execute on function studio.outline_cards_ok(jsonb) to studio_writer;
revoke all on function studio.outline_stays() from public, anon, authenticated;
rollback;

-- 2. The migration.
begin;
create or replace function studio.outline_cards_ok(c jsonb) returns boolean language plpgsql immutable as $f$
declare x jsonb; k text;
begin
  if c is null or jsonb_typeof(c) <> 'array' or jsonb_array_length(c) not between 1 and 10 then return false; end if;
  for x in select value from jsonb_array_elements(c) loop
    if jsonb_typeof(x) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(x) loop
      if k not in ('happens', 'does', 'picture') then return false; end if;
    end loop;
    if jsonb_typeof(x->'happens') is distinct from 'string' or jsonb_typeof(x->'does') is distinct from 'string' then return false; end if;
    if char_length(x->>'happens') not between 1 and 120 or char_length(x->>'does') not between 1 and 120 then return false; end if;
    if btrim(x->>'happens') = '' or btrim(x->>'does') = '' then return false; end if;
    if x ? 'picture' and jsonb_typeof(x->'picture') <> 'null'
       and (jsonb_typeof(x->'picture') <> 'string' or (x->>'picture') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return false; end if;
  end loop;
  return true;
end $f$;
create table if not exists studio.challenge_outlines (
  id uuid primary key default gen_random_uuid(),
  challenge text not null check (challenge ~ '^[a-z0-9-]{1,40}$'),
  fid bigint not null check (fid <> 0),
  by_name text check (by_name is null or char_length(by_name) between 1 and 100),
  title text check (title is null or (char_length(title) between 1 and 80 and btrim(title) <> '')),
  cards jsonb not null check (studio.outline_cards_ok(cards)),
  minute_after smallint not null check (minute_after between 0 and 10),
  decision text not null check (decision in ('admin', 'invited', 'passed')),
  submitted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  hidden_at timestamptz,
  hidden_by bigint,
  constraint challenge_outlines_minute_in_deck check (minute_after <= jsonb_array_length(cards)),
  constraint challenge_outlines_withdrawn_after check (withdrawn_at is null or withdrawn_at >= submitted_at),
  constraint challenge_outlines_hidden_after check (hidden_at is null or hidden_at >= submitted_at),
  constraint challenge_outlines_hidden_by check ((hidden_at is null) = (hidden_by is null))
);
create index if not exists challenge_outlines_list on studio.challenge_outlines (challenge, submitted_at desc, id desc) where withdrawn_at is null and hidden_at is null;
create index if not exists challenge_outlines_person on studio.challenge_outlines (challenge, fid, submitted_at);
create or replace function studio.outline_stays() returns trigger language plpgsql as $f$
begin
  if old.withdrawn_at is not null and new.withdrawn_at is distinct from old.withdrawn_at then
    raise exception 'an outline stays withdrawn' using errcode = 'check_violation';
  end if;
  if old.hidden_at is not null and (new.hidden_at is distinct from old.hidden_at or new.hidden_by is distinct from old.hidden_by) then
    raise exception 'an outline stays hidden' using errcode = 'check_violation';
  end if;
  return new;
end $f$;
drop trigger if exists challenge_outlines_stay on studio.challenge_outlines;
create trigger challenge_outlines_stay before update on studio.challenge_outlines for each row execute function studio.outline_stays();
alter table studio.challenge_outlines enable row level security;
drop policy if exists writer_read on studio.challenge_outlines;
drop policy if exists writer_insert on studio.challenge_outlines;
drop policy if exists writer_update on studio.challenge_outlines;
create policy writer_read on studio.challenge_outlines for select to studio_writer using (true);
create policy writer_insert on studio.challenge_outlines for insert to studio_writer with check (withdrawn_at is null and hidden_at is null);
create policy writer_update on studio.challenge_outlines for update to studio_writer using (true) with check (true);
revoke all on studio.challenge_outlines from anon, authenticated, studio_writer;
grant select, insert on studio.challenge_outlines to studio_writer;
grant update (withdrawn_at, hidden_at, hidden_by) on studio.challenge_outlines to studio_writer;
revoke all on function studio.outline_cards_ok(jsonb) from public, anon, authenticated;
grant execute on function studio.outline_cards_ok(jsonb) to studio_writer;
revoke all on function studio.outline_stays() from public, anon, authenticated;
commit;

-- 3. The read-back (after commit), as postgres. Two parts: (a) one read-only select, every row's ok true; (b) a do block
-- that ends with the notice "READ-BACK PASSED" (or stops with "READ-BACK FAILED: …"), leaving no row behind.
-- (a)
-- select n, what, ok from (
--   select 1 as n, 'studio_writer: select and insert on challenge_outlines' as what, has_table_privilege('studio_writer', 'studio.challenge_outlines', 'SELECT') and has_table_privilege('studio_writer', 'studio.challenge_outlines', 'INSERT') as ok
--   union all select 2, 'studio_writer: update of withdrawn_at, hidden_at and hidden_by only', has_column_privilege('studio_writer', 'studio.challenge_outlines', 'withdrawn_at', 'UPDATE') and has_column_privilege('studio_writer', 'studio.challenge_outlines', 'hidden_at', 'UPDATE') and has_column_privilege('studio_writer', 'studio.challenge_outlines', 'hidden_by', 'UPDATE') and not has_column_privilege('studio_writer', 'studio.challenge_outlines', 'cards', 'UPDATE') and not has_column_privilege('studio_writer', 'studio.challenge_outlines', 'fid', 'UPDATE') and not has_table_privilege('studio_writer', 'studio.challenge_outlines', 'UPDATE')
--   union all select 3, 'studio_writer: no delete or truncate', not (has_table_privilege('studio_writer', 'studio.challenge_outlines', 'DELETE') or has_table_privilege('studio_writer', 'studio.challenge_outlines', 'TRUNCATE'))
--   union all select 4, 'studio_writer may run the cards check', has_function_privilege('studio_writer', 'studio.outline_cards_ok(jsonb)', 'EXECUTE')
--   union all select 5, 'three policies, all studio_writer''s', (select count(*) from pg_policies where schemaname = 'studio' and tablename = 'challenge_outlines') = 3 and not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'challenge_outlines' and roles <> '{studio_writer}')
--   union all select 6, 'the trigger that keeps withdrawn and hidden', exists (select 1 from pg_trigger where tgrelid = 'studio.challenge_outlines'::regclass and tgname = 'challenge_outlines_stay' and not tgisinternal)
--   union all select 7, 'the two indexes', (select count(*) from pg_indexes where schemaname = 'studio' and tablename = 'challenge_outlines' and indexname in ('challenge_outlines_list', 'challenge_outlines_person')) = 2
--   union all select 8, 'row level security is on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.challenge_outlines')), false)
--   union all select 9, 'anon and authenticated have nothing', not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, 'studio.challenge_outlines', p))
-- ) t order by n;
-- (b) A realistic outline (the test FID 2147483646 fits fid's type and no real account has it): three cards, the line
-- after card 2, a picture on card 1 (the newest version's id); withdrawn as Withdraw does; a second hidden as Hide does;
-- bad rows refused; then both deleted.
-- do $$
-- declare v uuid; a uuid; b uuid; refused boolean;
--   good jsonb;
-- begin
--   select id into v from studio.element_versions order by created_at desc limit 1;
--   if v is null then raise exception 'READ-BACK FAILED: needs one existing version to test on'; end if;
--   good := jsonb_build_array(
--     jsonb_build_object('happens', 'Zei laughs off the drone', 'does', 'we like him straight away', 'picture', v::text),
--     jsonb_build_object('happens', 'Read-back card two, what happens', 'does', 'Read-back card two, what it does', 'picture', null),
--     jsonb_build_object('happens', 'Read-back card three, what happens', 'does', 'Read-back card three, what it does'));
--   insert into studio.challenge_outlines (challenge, fid, by_name, title, cards, minute_after, decision)
--     values ('episode-1', 2147483646, 'read-back test', 'Read-back test outline', good, 2, 'passed') returning id into a;
--   insert into studio.challenge_outlines (challenge, fid, by_name, cards, minute_after, decision)
--     values ('episode-1', 2147483646, 'read-back test', good, 0, 'invited') returning id into b;
--   update studio.challenge_outlines set withdrawn_at = now() where id = a and withdrawn_at is null;
--   update studio.challenge_outlines set hidden_at = now(), hidden_by = 2147483646 where id = b and hidden_at is null;
--   if not exists (select 1 from studio.challenge_outlines where id = a and withdrawn_at is not null)
--      or not exists (select 1 from studio.challenge_outlines where id = b and hidden_at is not null and hidden_by = 2147483646)
--      or (select jsonb_array_length(cards) from studio.challenge_outlines where id = a) <> 3
--      or (select cards->0->>'picture' from studio.challenge_outlines where id = a) <> v::text
--   then raise exception 'READ-BACK FAILED: the outlines are not on record as written'; end if;
--   refused := false;
--   begin update studio.challenge_outlines set withdrawn_at = null where id = a;
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: un-withdrawing was accepted'; end if;
--   refused := false;
--   begin update studio.challenge_outlines set hidden_at = null, hidden_by = null where id = b;
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: un-hiding was accepted'; end if;
--   refused := false;
--   begin insert into studio.challenge_outlines (challenge, fid, cards, minute_after, decision) values ('episode-1', 2147483646, good, 4, 'passed');
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a first-minute line past the last card was accepted'; end if;
--   refused := false;
--   begin insert into studio.challenge_outlines (challenge, fid, cards, minute_after, decision) values ('episode-1', 2147483646, good || good || good || good, 1, 'passed');
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: twelve cards were accepted'; end if;
--   refused := false;
--   begin insert into studio.challenge_outlines (challenge, fid, cards, minute_after, decision) values ('episode-1', 2147483646, jsonb_build_array(jsonb_build_object('happens', '  ', 'does', 'x')), 1, 'passed');
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: an empty card was accepted'; end if;
--   refused := false;
--   begin insert into studio.challenge_outlines (challenge, fid, cards, minute_after, decision) values ('episode-1', 2147483646, good, 1, 'below');
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: an account that did not pass was accepted'; end if;
--   delete from studio.challenge_outlines where fid = 2147483646;
--   if exists (select 1 from studio.challenge_outlines where fid = 2147483646) then raise exception 'READ-BACK FAILED: test rows left behind'; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;
