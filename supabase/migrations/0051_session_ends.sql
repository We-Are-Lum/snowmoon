-- 0051_session_ends.sql: "Sign out on every device" (owner, 2026-11-23; branch session-30d). Numbered at merge on
-- 2026-11-23 (was NEXT_session_ends.sql), the next free number after main's 0001-0050 (no unmerged branch holds a later
-- number). APPLIED by the owner in production on 2026-11-23 (A, B and C run all at once: Success; he also tested it on
-- Postgres 16 against main's migrations: it passes all at once, a second run changes nothing, studio_writer has select,
-- insert and update only, nothing for anon or authenticated, and the undo puts back main's exact shape). Drafted by the
-- coding agent (Claude, a closed model by Anthropic). Tested on in-memory PGlite against main's migrations
-- (npm run test:sessions).
-- Requires 0001_core (the studio schema and the studio_writer role). Nothing else.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: rights read with has_table_privilege, then realistic rows inserted, moved and
-- deleted, and bad rows refused, all inside a transaction that ends in `rollback;`; it ends "READ-BACK PASSED"), and
-- D. the undo, only if the release is withdrawn. Safe to run twice. Additive: one new table, nothing else changes.
--
-- What it is for. Website sign-ins become the site's own sessions, 30 days for every kind (Farcaster on the website,
-- wallet, Lens, Bluesky); each carries when it was issued. "Sign out on every device" (the You page) writes one row per
-- person: the moment they chose it. Every route then refuses a session issued before that moment, for the person it
-- signs in as and the account it is (src/lib/session-ends.ts, src/lib/auth.ts). Choosing it again moves the moment on.
-- - studio.session_ends: person (a FID; minus a wallet account's number; or a Lens/Bluesky account's person number,
--   src/lib/people.ts: never 0), ended_at. studio_writer may select, insert and update; no delete. Nothing for anon
--   or authenticated.
-- Until this is applied nothing is ended (the check finds no table) and "Sign out on every device" answers "not
-- available yet"; sign-ins work as before.
--
-- Safe with today's live code (main at 903ca86a, 2026-11-23): nothing reads or writes this table.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.session_ends (
  person bigint primary key check (person <> 0),
  ended_at timestamptz not null default now()
);
alter table studio.session_ends enable row level security;
drop policy if exists writer_read on studio.session_ends;
create policy writer_read on studio.session_ends for select to studio_writer using (true);
drop policy if exists writer_insert on studio.session_ends;
create policy writer_insert on studio.session_ends for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.session_ends;
create policy writer_update on studio.session_ends for update to studio_writer using (true) with check (true);
revoke all on studio.session_ends from public, anon, authenticated;
revoke all on studio.session_ends from studio_writer;
grant select, insert, update on studio.session_ends to studio_writer;
rollback;

-- B. MIGRATION.
begin;
create table if not exists studio.session_ends (
  person bigint primary key check (person <> 0),
  ended_at timestamptz not null default now()
);
alter table studio.session_ends enable row level security;
drop policy if exists writer_read on studio.session_ends;
create policy writer_read on studio.session_ends for select to studio_writer using (true);
drop policy if exists writer_insert on studio.session_ends;
create policy writer_insert on studio.session_ends for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.session_ends;
create policy writer_update on studio.session_ends for update to studio_writer using (true) with check (true);
revoke all on studio.session_ends from public, anon, authenticated;
revoke all on studio.session_ends from studio_writer;
grant select, insert, update on studio.session_ends to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Paste the lines below without their "-- ". It sets no role (postgres can't
--    switch roles in the SQL Editor): studio_writer's rights are read with has_table_privilege, and the rows are written
--    as postgres, exactly as the site writes them. Everything is inside one transaction that ends in rollback, so
--    nothing is kept even if a check fails part way. The person numbers 2147483646 (a FID), -2147483646 (a wallet
--    account) and -3147483646 (a Lens/Bluesky account) fit the column and belong to no one.
--    Ends "READ-BACK PASSED"; each check raises "READ-BACK FAILED: …" on failure.
--
-- begin;
-- select p, has_table_privilege('studio_writer', 'studio.session_ends', p) as writer, has_table_privilege('anon', 'studio.session_ends', p) as anon,
--   has_table_privilege('authenticated', 'studio.session_ends', p) as authenticated
-- from unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p order by 1;
-- do $$
-- declare
--   n int;
--   first timestamptz;
--   refused boolean;
-- begin
--   if not (has_table_privilege('studio_writer', 'studio.session_ends', 'select') and has_table_privilege('studio_writer', 'studio.session_ends', 'insert') and has_table_privilege('studio_writer', 'studio.session_ends', 'update'))
--     or has_table_privilege('studio_writer', 'studio.session_ends', 'delete') or has_table_privilege('studio_writer', 'studio.session_ends', 'truncate')
--     then raise exception 'READ-BACK FAILED: studio_writer''s rights on session_ends'; end if;
--   select count(*) into n from unnest(array['anon', 'authenticated']) r, unnest(array['select', 'insert', 'update', 'delete']) p where has_table_privilege(r, 'studio.session_ends', p);
--   if n <> 0 then raise exception 'READ-BACK FAILED: anon or authenticated has % rights on session_ends', n; end if;
--   if not (select relrowsecurity from pg_class where oid = 'studio.session_ends'::regclass) then raise exception 'READ-BACK FAILED: row level security is off'; end if;
--   -- Realistic rows, as the site writes them: a FID, a wallet account and a Lens account sign out everywhere.
--   insert into studio.session_ends (person, ended_at) select p, now() from unnest(array[2147483646, -2147483646, -3147483646]::bigint[]) p
--     on conflict (person) do update set ended_at = excluded.ended_at;
--   select count(*) into n from studio.session_ends where person in (2147483646, -2147483646, -3147483646);
--   if n <> 3 then raise exception 'READ-BACK FAILED: % of 3 rows kept', n; end if;
--   -- Choosing it again moves the moment on (one row per person).
--   select ended_at into first from studio.session_ends where person = 2147483646;
--   insert into studio.session_ends (person, ended_at) values (2147483646, first + interval '1 minute')
--     on conflict (person) do update set ended_at = excluded.ended_at;
--   select count(*) into n from studio.session_ends where person = 2147483646;
--   if n <> 1 then raise exception 'READ-BACK FAILED: % rows for one person after signing out twice, not 1', n; end if;
--   if (select ended_at from studio.session_ends where person = 2147483646) <> first + interval '1 minute' then raise exception 'READ-BACK FAILED: the moment did not move on'; end if;
--   -- What every route asks: a session issued before the moment is over; one issued after is not.
--   select count(*) into n from studio.session_ends where person in (2147483646) and ended_at > first;
--   if n <> 1 then raise exception 'READ-BACK FAILED: a session issued before the moment is not ended'; end if;
--   select count(*) into n from studio.session_ends where person in (2147483646) and ended_at > first + interval '2 minutes';
--   if n <> 0 then raise exception 'READ-BACK FAILED: a session issued after the moment is ended'; end if;
--   -- Person 0 is no one.
--   begin insert into studio.session_ends (person) values (0); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: person 0 was accepted'; end if;
--   delete from studio.session_ends where person in (2147483646, -2147483646, -3147483646);
--   if exists (select 1 from studio.session_ends where person in (2147483646, -2147483646, -3147483646)) then raise exception 'READ-BACK FAILED: the test rows were not deleted'; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;
-- rollback;

-- D. UNDO, only if the release is withdrawn (after the code that reads this table is gone). Every "Sign out on every
--    device" is forgotten, so sessions it ended work again until they expire. Paste without the "-- ".
-- begin;
-- drop table if exists studio.session_ends;
-- commit;
