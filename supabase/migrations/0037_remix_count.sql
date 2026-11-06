-- 0037_remix_count.sql (was NEXT_remix_count.sql) — free remixes counted as remixes, not pictures (branch remix-submit, owner 2026-11-04, item 7).
-- APPLIED on production by the owner on 2026-11-06 (SQL pack items 3, 4, 6: dry run clean, applied, read-back (a) all
-- true, read-back (b) passed).
-- Numbered at merge (CLAUDE.md). Requires 0008 (studio.image_asks, for the same shape of counting).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. One transaction. Safe to
-- run twice. Dry run first: paste everything, but replace the final `commit;` with `rollback;`.
--
-- Why a table: studio.image_asks holds one row per picture (the FID and the time, nothing else), so it can't say
-- which pictures belong to one remix. A remix is one sheet's three views (owner, 2026-11-04): for an account that
-- passes the check (not an admin, not invited), 3 remixes start per UTC day (IMAGES.designs.remixesPerDay), each
-- allowing 6 pictures in all (its three views and three more tries, so a view that fails is made again inside the
-- same remix), and a closed-model remix counts 3 (remixUnits; branch remix-model-choice). This table holds one row per
-- picture asked for in a remix: the remix's id (made by our server and signed into the person's tickets), the
-- person's FID, the units the remix uses, the view and when. No prompt, no picture, no cost (costs stay daily totals
-- in studio.image_costs, without a person). Until this runs, the site counts those views as pictures, as before.
--
-- Who: a person's number, as studio.challenge_marks takes it after NEXT_social_bluesky_check: an FID (above zero) or a
-- Bluesky account (at or below -1,000,000,000), so a Bluesky account that passes the Bluesky check gets free remixes.
-- Never a wallet's number (-1 to -999,999,999). The check is named and re-added, so running this again widens it.
--
-- Not publicly readable: RLS on, only studio_writer's select and insert (no update, delete or truncate); anon and
-- authenticated lose every privilege 0001's default privileges gave them.

begin;

create table if not exists studio.sheet_remix_asks (
  id bigint generated always as identity primary key,
  remix uuid not null,
  fid bigint not null,
  units smallint not null check (units in (1, 3)),
  slot text not null check (slot in ('front', 'side', 'back')),
  at timestamptz not null default now()
);
alter table studio.sheet_remix_asks drop constraint if exists sheet_remix_asks_fid_check;
alter table studio.sheet_remix_asks add constraint sheet_remix_asks_fid_check check (fid > 0 or fid <= -1000000000);
create index if not exists sheet_remix_asks_fid_at on studio.sheet_remix_asks (fid, at);
create index if not exists sheet_remix_asks_remix on studio.sheet_remix_asks (remix);

alter table studio.sheet_remix_asks enable row level security;
drop policy if exists writer_read on studio.sheet_remix_asks;
create policy writer_read on studio.sheet_remix_asks for select to studio_writer using (true);
drop policy if exists writer_insert on studio.sheet_remix_asks;
create policy writer_insert on studio.sheet_remix_asks for insert to studio_writer with check (true);
revoke all on studio.sheet_remix_asks from anon, authenticated;
revoke update, delete, truncate on studio.sheet_remix_asks from studio_writer;
grant select, insert on studio.sheet_remix_asks to studio_writer;

commit;

-- Read-back, two parts (after commit), as postgres.
-- (a) one read-only SELECT; expect every row's ok to be true (7 rows):
-- select what, ok from (
--   select 'table exists' as what, to_regclass('studio.sheet_remix_asks') is not null as ok
--   union all select 'fid check: FIDs and Bluesky accounts, not wallets', coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'studio.sheet_remix_asks'::regclass and conname = 'sheet_remix_asks_fid_check'), '') like '%fid > 0%fid <= ''-1000000000''%'
--   union all select 'rls on', (select relrowsecurity from pg_class where oid = 'studio.sheet_remix_asks'::regclass)
--   union all select 'writer: select and insert', has_table_privilege('studio_writer', 'studio.sheet_remix_asks', 'SELECT') and has_table_privilege('studio_writer', 'studio.sheet_remix_asks', 'INSERT')
--   union all select 'writer: no update, delete or truncate', not (has_table_privilege('studio_writer', 'studio.sheet_remix_asks', 'UPDATE') or has_table_privilege('studio_writer', 'studio.sheet_remix_asks', 'DELETE') or has_table_privilege('studio_writer', 'studio.sheet_remix_asks', 'TRUNCATE'))
--   union all select 'no public access', not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, 'studio.sheet_remix_asks', p))
--   union all select 'only studio_writer policies', (select count(*) = 2 and bool_and(roles = '{studio_writer}'::name[]) from pg_policies where schemaname = 'studio' and tablename = 'sheet_remix_asks')
-- ) c;
-- (b) realistic rows, as the site writes them (a front view starting an open remix, from an FID and from a Bluesky
--     account), read back; a bad units value and a wallet's number refused; then deleted. The test numbers 2147483646
--     and -2147483646 fit fid's type; no real account has them. Expect "NOTICE: read-back passed".
-- do $$
-- declare r uuid := gen_random_uuid(); n int; refused boolean := false; wallet_refused boolean := false;
-- begin
--   insert into studio.sheet_remix_asks (remix, fid, units, slot) values (r, 2147483646, 1, 'front');
--   insert into studio.sheet_remix_asks (remix, fid, units, slot) values (r, -2147483646, 1, 'front');
--   select count(*) into n from studio.sheet_remix_asks where remix = r and fid in (2147483646, -2147483646) and units = 1 and slot = 'front' and at > now() - interval '1 minute';
--   begin
--     insert into studio.sheet_remix_asks (remix, fid, units, slot) values (r, 2147483646, 2, 'side');
--   exception when check_violation then refused := true;
--   end;
--   begin
--     insert into studio.sheet_remix_asks (remix, fid, units, slot) values (r, -500, 1, 'side');
--   exception when check_violation then wallet_refused := true;
--   end;
--   delete from studio.sheet_remix_asks where remix = r;
--   if n <> 2 or not refused or not wallet_refused or exists (select 1 from studio.sheet_remix_asks where remix = r) then raise exception 'READ-BACK FAILED'; end if;
--   raise notice 'read-back passed';
-- end $$;
