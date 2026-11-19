-- NEXT_chapter_picture_versions.sql: the edition's chapter pictures, replaced by an admin on the site (owner, 2026-11-18,
-- option B: "A keep goes live at once"; branch chapter-pictures-admin). NOT APPLIED. Unnumbered until merge: it takes
-- the next free number then, checked against origin/main and production. Drafted by the coding agent (Claude, a closed
-- model by Anthropic). DRAFT: the coordinator tests it first in PGlite or a local Postgres; the owner applies it.
-- Requires 0001_core (the studio schema, studio_writer), 0008_images and 0011_wallet_prepaid (studio.image_costs and its
-- `funded` column).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: a read-only select, then a block that inserts realistic rows and deletes them,
-- inside a transaction that ends in `rollback;`; it ends "READ-BACK PASSED"), and D. the undo, only if the release is
-- withdrawn. Safe to run twice.
--
-- What it adds. None of it is readable by anon or authenticated (no public policy; they lose every privilege); the site
-- reads it as studio_writer and shows only what an admin kept. studio_writer may select and insert, never update,
-- delete or truncate, so every row stays: nothing is replaced in place, nothing is deleted.
-- 1. studio.chapter_picture_versions: a picture an admin made for one of the edition's chapter pictures (a job in
--    content/snowmoon/illustrations/chapter-N.json): the admin (FID), when, the model, its maker, whether its weights are
--    open, the look (a published style or a written line), the admin's note, the exact prompt, the recipe (settings, the
--    reference picture's sha256, the host's request id, cost), and the picture itself (JPEG bytes, sha256, size). It is
--    a draft, private, until an admin keeps it: its bytes live only here, served only to admins.
-- 2. studio.chapter_picture_decisions: which picture a chapter shows. "keep" makes a version the one shown (its file is
--    then copied to the public pictures bucket, public_url); "restore" shows an earlier version again, or with no
--    version the committed file (published.json). The latest decision per job counts; every earlier one stays, so any
--    choice can be undone in one step. Each names the admin (FID, and the handle as it was then) and the time. A
--    trigger refuses a decision that points at another job's version.
-- 3. studio.chapter_picture_looks: the look every redo uses (chapter null), or one chapter's own (a null look clears
--    the chapter's own and goes back to every chapter's). Append-only; the latest counts.
-- 4. studio.image_costs.funded takes 'admin': an admin's chapter pictures are counted apart, against their own daily cap
--    (src/lib/config.ts CHAPTER_PICTURES.adminDailyCapUsd), never the free cap entrants use.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.chapter_picture_versions (
  id uuid primary key default gen_random_uuid(),
  job_id text not null check (job_id ~ '^c[0-9]{1,2}-b[0-9]{1,4}-[a-z0-9-]{1,60}$'),
  chapter int not null check (chapter between 1 and 99),
  made_by_fid bigint not null check (made_by_fid > 0),
  made_at timestamptz not null default now(),
  model text not null check (length(model) between 1 and 120),
  maker text not null check (length(maker) between 1 and 80),
  open_weights boolean not null,
  look jsonb check (look is null or (jsonb_typeof(look) = 'object' and look->>'kind' in ('style', 'line') and length(coalesce(look->>'text', '')) between 1 and 2000)),
  note text not null check (length(note) between 1 and 1000),
  prompt text not null check (length(prompt) between 1 and 8000),
  recipe jsonb not null check (jsonb_typeof(recipe) = 'object'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  width int not null check (width between 64 and 4096),
  height int not null check (height between 64 and 4096),
  jpeg bytea not null check (octet_length(jpeg) between 100 and 8000000),
  cost_usd numeric(10, 6) check (cost_usd is null or cost_usd >= 0)
);
create index if not exists chapter_picture_versions_job on studio.chapter_picture_versions (job_id, made_at desc);

create table if not exists studio.chapter_picture_decisions (
  id bigint generated always as identity primary key,
  job_id text not null check (job_id ~ '^c[0-9]{1,2}-b[0-9]{1,4}-[a-z0-9-]{1,60}$'),
  chapter int not null check (chapter between 1 and 99),
  version_id uuid references studio.chapter_picture_versions (id),
  action text not null check (action in ('keep', 'restore')),
  public_url text check (public_url is null or public_url ~ '^https?://[A-Za-z0-9.:-]+/[A-Za-z0-9/._-]+$'),
  by_fid bigint not null check (by_fid > 0),
  by_handle text check (by_handle is null or by_handle ~ '^[a-z0-9][a-z0-9._-]{0,40}$'),
  decided_at timestamptz not null default now(),
  constraint keep_has_version check (action <> 'keep' or version_id is not null),
  constraint version_has_url check ((version_id is null) = (public_url is null))
);
create index if not exists chapter_picture_decisions_job on studio.chapter_picture_decisions (job_id, decided_at desc, id desc);

create or replace function studio.chapter_picture_decision_job() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.version_id is not null and not exists (
    select 1 from studio.chapter_picture_versions v where v.id = new.version_id and v.job_id = new.job_id and v.chapter = new.chapter
  ) then
    raise exception 'chapter_picture_decisions: version % is not a picture of %', new.version_id, new.job_id;
  end if;
  return new;
end;
$$;
drop trigger if exists chapter_picture_decision_job on studio.chapter_picture_decisions;
create trigger chapter_picture_decision_job before insert on studio.chapter_picture_decisions
  for each row execute function studio.chapter_picture_decision_job();

create table if not exists studio.chapter_picture_looks (
  id bigint generated always as identity primary key,
  chapter int check (chapter is null or chapter between 1 and 99),
  look jsonb check (look is null or (jsonb_typeof(look) = 'object' and look->>'kind' in ('style', 'line') and length(coalesce(look->>'text', '')) between 1 and 2000)),
  by_fid bigint not null check (by_fid > 0),
  set_at timestamptz not null default now(),
  constraint every_chapter_has_a_look check (chapter is not null or look is not null)
);

alter table studio.chapter_picture_versions enable row level security;
alter table studio.chapter_picture_decisions enable row level security;
alter table studio.chapter_picture_looks enable row level security;
drop policy if exists writer_read on studio.chapter_picture_versions;
drop policy if exists writer_insert on studio.chapter_picture_versions;
drop policy if exists writer_read on studio.chapter_picture_decisions;
drop policy if exists writer_insert on studio.chapter_picture_decisions;
drop policy if exists writer_read on studio.chapter_picture_looks;
drop policy if exists writer_insert on studio.chapter_picture_looks;
create policy writer_read on studio.chapter_picture_versions for select to studio_writer using (true);
create policy writer_insert on studio.chapter_picture_versions for insert to studio_writer with check (true);
create policy writer_read on studio.chapter_picture_decisions for select to studio_writer using (true);
create policy writer_insert on studio.chapter_picture_decisions for insert to studio_writer with check (true);
create policy writer_read on studio.chapter_picture_looks for select to studio_writer using (true);
create policy writer_insert on studio.chapter_picture_looks for insert to studio_writer with check (true);
revoke all on studio.chapter_picture_versions, studio.chapter_picture_decisions, studio.chapter_picture_looks from anon, authenticated;
revoke update, delete, truncate on studio.chapter_picture_versions, studio.chapter_picture_decisions, studio.chapter_picture_looks from studio_writer;
grant select, insert on studio.chapter_picture_versions, studio.chapter_picture_decisions, studio.chapter_picture_looks to studio_writer;

alter table studio.image_costs drop constraint if exists image_costs_funded_check;
alter table studio.image_costs add constraint image_costs_funded_check check (funded in ('free', 'prepaid', 'admin'));
rollback;

-- B. THE MIGRATION.
begin;
create table if not exists studio.chapter_picture_versions (
  id uuid primary key default gen_random_uuid(),
  job_id text not null check (job_id ~ '^c[0-9]{1,2}-b[0-9]{1,4}-[a-z0-9-]{1,60}$'),
  chapter int not null check (chapter between 1 and 99),
  made_by_fid bigint not null check (made_by_fid > 0),
  made_at timestamptz not null default now(),
  model text not null check (length(model) between 1 and 120),
  maker text not null check (length(maker) between 1 and 80),
  open_weights boolean not null,
  look jsonb check (look is null or (jsonb_typeof(look) = 'object' and look->>'kind' in ('style', 'line') and length(coalesce(look->>'text', '')) between 1 and 2000)),
  note text not null check (length(note) between 1 and 1000),
  prompt text not null check (length(prompt) between 1 and 8000),
  recipe jsonb not null check (jsonb_typeof(recipe) = 'object'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  width int not null check (width between 64 and 4096),
  height int not null check (height between 64 and 4096),
  jpeg bytea not null check (octet_length(jpeg) between 100 and 8000000),
  cost_usd numeric(10, 6) check (cost_usd is null or cost_usd >= 0)
);
create index if not exists chapter_picture_versions_job on studio.chapter_picture_versions (job_id, made_at desc);

create table if not exists studio.chapter_picture_decisions (
  id bigint generated always as identity primary key,
  job_id text not null check (job_id ~ '^c[0-9]{1,2}-b[0-9]{1,4}-[a-z0-9-]{1,60}$'),
  chapter int not null check (chapter between 1 and 99),
  version_id uuid references studio.chapter_picture_versions (id),
  action text not null check (action in ('keep', 'restore')),
  public_url text check (public_url is null or public_url ~ '^https?://[A-Za-z0-9.:-]+/[A-Za-z0-9/._-]+$'),
  by_fid bigint not null check (by_fid > 0),
  by_handle text check (by_handle is null or by_handle ~ '^[a-z0-9][a-z0-9._-]{0,40}$'),
  decided_at timestamptz not null default now(),
  constraint keep_has_version check (action <> 'keep' or version_id is not null),
  constraint version_has_url check ((version_id is null) = (public_url is null))
);
create index if not exists chapter_picture_decisions_job on studio.chapter_picture_decisions (job_id, decided_at desc, id desc);

create or replace function studio.chapter_picture_decision_job() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.version_id is not null and not exists (
    select 1 from studio.chapter_picture_versions v where v.id = new.version_id and v.job_id = new.job_id and v.chapter = new.chapter
  ) then
    raise exception 'chapter_picture_decisions: version % is not a picture of %', new.version_id, new.job_id;
  end if;
  return new;
end;
$$;
drop trigger if exists chapter_picture_decision_job on studio.chapter_picture_decisions;
create trigger chapter_picture_decision_job before insert on studio.chapter_picture_decisions
  for each row execute function studio.chapter_picture_decision_job();

create table if not exists studio.chapter_picture_looks (
  id bigint generated always as identity primary key,
  chapter int check (chapter is null or chapter between 1 and 99),
  look jsonb check (look is null or (jsonb_typeof(look) = 'object' and look->>'kind' in ('style', 'line') and length(coalesce(look->>'text', '')) between 1 and 2000)),
  by_fid bigint not null check (by_fid > 0),
  set_at timestamptz not null default now(),
  constraint every_chapter_has_a_look check (chapter is not null or look is not null)
);

alter table studio.chapter_picture_versions enable row level security;
alter table studio.chapter_picture_decisions enable row level security;
alter table studio.chapter_picture_looks enable row level security;
drop policy if exists writer_read on studio.chapter_picture_versions;
drop policy if exists writer_insert on studio.chapter_picture_versions;
drop policy if exists writer_read on studio.chapter_picture_decisions;
drop policy if exists writer_insert on studio.chapter_picture_decisions;
drop policy if exists writer_read on studio.chapter_picture_looks;
drop policy if exists writer_insert on studio.chapter_picture_looks;
create policy writer_read on studio.chapter_picture_versions for select to studio_writer using (true);
create policy writer_insert on studio.chapter_picture_versions for insert to studio_writer with check (true);
create policy writer_read on studio.chapter_picture_decisions for select to studio_writer using (true);
create policy writer_insert on studio.chapter_picture_decisions for insert to studio_writer with check (true);
create policy writer_read on studio.chapter_picture_looks for select to studio_writer using (true);
create policy writer_insert on studio.chapter_picture_looks for insert to studio_writer with check (true);
revoke all on studio.chapter_picture_versions, studio.chapter_picture_decisions, studio.chapter_picture_looks from anon, authenticated;
revoke update, delete, truncate on studio.chapter_picture_versions, studio.chapter_picture_decisions, studio.chapter_picture_looks from studio_writer;
grant select, insert on studio.chapter_picture_versions, studio.chapter_picture_decisions, studio.chapter_picture_looks to studio_writer;

alter table studio.image_costs drop constraint if exists image_costs_funded_check;
alter table studio.image_costs add constraint image_costs_funded_check check (funded in ('free', 'prepaid', 'admin'));
commit;

-- C. READ-BACK (after B), as postgres. Two parts. Paste the lines below without their "-- ".
-- (a) one read-only select: every row's ok must be true (6 rows).
-- select n, what, ok from (values
--   (1, 'the three tables exist with row level security on',
--     (select count(*) from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'studio' and c.relname in ('chapter_picture_versions', 'chapter_picture_decisions', 'chapter_picture_looks') and c.relrowsecurity) = 3),
--   (2, 'anon and authenticated can read none of them',
--     not has_table_privilege('anon', 'studio.chapter_picture_versions', 'select') and not has_table_privilege('authenticated', 'studio.chapter_picture_versions', 'select')
--     and not has_table_privilege('anon', 'studio.chapter_picture_decisions', 'select') and not has_table_privilege('anon', 'studio.chapter_picture_looks', 'select')),
--   (3, 'studio_writer may select and insert, never update or delete',
--     has_table_privilege('studio_writer', 'studio.chapter_picture_versions', 'insert') and has_table_privilege('studio_writer', 'studio.chapter_picture_decisions', 'select')
--     and not has_table_privilege('studio_writer', 'studio.chapter_picture_versions', 'update') and not has_table_privilege('studio_writer', 'studio.chapter_picture_decisions', 'delete')
--     and not has_table_privilege('studio_writer', 'studio.chapter_picture_looks', 'update')),
--   (4, 'the decision trigger is there',
--     exists (select 1 from pg_trigger where tgrelid = 'studio.chapter_picture_decisions'::regclass and tgname = 'chapter_picture_decision_job' and not tgisinternal)),
--   (5, 'image_costs takes funded admin',
--     exists (select 1 from pg_constraint where conrelid = 'studio.image_costs'::regclass and conname = 'image_costs_funded_check' and pg_get_constraintdef(oid) like '%admin%')),
--   (6, 'no public policy on the new tables',
--     not exists (select 1 from pg_policies where schemaname = 'studio' and tablename like 'chapter_picture_%' and (roles && array['anon', 'authenticated', 'public']::name[])))
-- ) as t(n, what, ok) order by n;
--
-- (b) one transaction that ends in ROLLBACK. As the site writes them: a picture for c1-b005-toy-drone made by GPT Image
--     2.5 Sunburst with the look "Comic book" and a note, kept (public_url), then the committed file restored, then the
--     version kept again; checks the latest decision is the one shown each time, that a decision pointing at another
--     job's version is refused, that a keep without a version is refused; a look for every chapter and one for chapter
--     1; an admin cost row (today, funded admin, GPT, 1 call, $0.0478); then deletes every row it added and checks they
--     are gone. The person number 2147483646 fits the columns and belongs to no account. Ends "READ-BACK PASSED"; each
--     check raises "READ-BACK FAILED: …" on failure. It sets no role (postgres can't switch roles in the SQL Editor).
-- begin;
-- do $$
-- declare
--   v uuid := gen_random_uuid();
--   shown uuid;
--   refused boolean;
--   d date := (now() at time zone 'utc')::date;
--   n int;
-- begin
--   insert into studio.chapter_picture_versions (id, job_id, chapter, made_by_fid, model, maker, open_weights, look, note, prompt, recipe, sha256, width, height, jpeg, cost_usd) values
--     (v, 'c1-b005-toy-drone', 1, 2147483646, 'gpt-image-2.5-sunburst', 'OpenAI', false,
--      '{"kind": "style", "label": "Comic book", "text": "Comic book: bold ink outlines, flat colour, halftone shading.", "versionId": "00000009-0000-4000-8000-000000000002"}'::jsonb,
--      'Make the drone smaller, and the morning light warmer.',
--      'Redraw the reference picture as this scene. A small toy drone hovers over a quiet street at dawn.\n\nMake the drone smaller, and the morning light warmer.\n\nComic book: bold ink outlines, flat colour, halftone shading.\n\nNo text, no lettering, no signs with words.',
--      '{"v": 1, "model": {"id": "gpt-image-2.5-sunburst", "maker": "OpenAI", "open": false, "endpoint": "openai/gpt-image-2.5-sunburst"}, "settings": {"size": "1536x1024", "quality": "high"}, "reference": {"sha256": "ea7f59a8c05f2caf1774cbc08fa48d27d631e290687a367a4b985ba9a207e684"}}'::jsonb,
--      repeat('c', 64), 1024, 576, decode(repeat('ff', 200), 'hex'), 0.0478);
--   insert into studio.chapter_picture_decisions (job_id, chapter, version_id, action, public_url, by_fid, by_handle) values
--     ('c1-b005-toy-drone', 1, v, 'keep', 'https://pictures.snowmoon.party/images/readers/' || repeat('c', 32) || '.jpg', 2147483646, 'readback-test');
--   select version_id into shown from studio.chapter_picture_decisions where job_id = 'c1-b005-toy-drone' order by decided_at desc, id desc limit 1;
--   if shown is distinct from v then raise exception 'READ-BACK FAILED: the kept version is not the one shown'; end if;
--   insert into studio.chapter_picture_decisions (job_id, chapter, version_id, action, public_url, by_fid, by_handle) values ('c1-b005-toy-drone', 1, null, 'restore', null, 2147483646, 'readback-test');
--   select version_id into shown from studio.chapter_picture_decisions where job_id = 'c1-b005-toy-drone' order by decided_at desc, id desc limit 1;
--   if shown is not null then raise exception 'READ-BACK FAILED: restoring the committed file did not show it'; end if;
--   insert into studio.chapter_picture_decisions (job_id, chapter, version_id, action, public_url, by_fid, by_handle) values
--     ('c1-b005-toy-drone', 1, v, 'restore', 'https://pictures.snowmoon.party/images/readers/' || repeat('c', 32) || '.jpg', 2147483646, 'readback-test');
--   select version_id into shown from studio.chapter_picture_decisions where job_id = 'c1-b005-toy-drone' order by decided_at desc, id desc limit 1;
--   if shown is distinct from v then raise exception 'READ-BACK FAILED: restoring the version did not show it'; end if;
--   refused := false;
--   begin
--     insert into studio.chapter_picture_decisions (job_id, chapter, version_id, action, public_url, by_fid) values ('c1-b013-sky-bridge', 1, v, 'keep', 'https://pictures.snowmoon.party/images/readers/x.jpg', 2147483646);
--   exception when others then refused := sqlerrm like 'chapter_picture_decisions: version%';
--   end;
--   if not refused then raise exception 'READ-BACK FAILED: a decision pointing at another job''s version was accepted'; end if;
--   refused := false;
--   begin
--     insert into studio.chapter_picture_decisions (job_id, chapter, version_id, action, by_fid) values ('c1-b005-toy-drone', 1, null, 'keep', 2147483646);
--   exception when check_violation then refused := true;
--   end;
--   if not refused then raise exception 'READ-BACK FAILED: a keep without a version was accepted'; end if;
--   insert into studio.chapter_picture_looks (chapter, look, by_fid) values
--     (null, '{"kind": "line", "text": "Comic book: bold ink outlines, flat colour, halftone shading."}'::jsonb, 2147483646),
--     (1, null, 2147483646);
--   insert into studio.image_costs (day, funded, kind, model, provider, verdict, calls, cost_usd) values (d, 'admin', 'image', 'gpt-image-2.5-sunburst', 'Vercel AI Gateway', 'ok', 1, 0.0478)
--     on conflict (day, funded, kind, model, provider, verdict) do update set calls = studio.image_costs.calls + 1, cost_usd = studio.image_costs.cost_usd + excluded.cost_usd;
--   select calls into n from studio.image_costs where day = d and funded = 'admin' and kind = 'image' and model = 'gpt-image-2.5-sunburst' and provider = 'Vercel AI Gateway' and verdict = 'ok';
--   if n is null or n < 1 then raise exception 'READ-BACK FAILED: the admin cost row was not written'; end if;
--   delete from studio.image_costs where day = d and funded = 'admin' and kind = 'image' and model = 'gpt-image-2.5-sunburst' and provider = 'Vercel AI Gateway' and verdict = 'ok';
--   delete from studio.chapter_picture_looks where by_fid = 2147483646;
--   delete from studio.chapter_picture_decisions where by_fid = 2147483646;
--   delete from studio.chapter_picture_versions where id = v;
--   if exists (select 1 from studio.chapter_picture_versions where made_by_fid = 2147483646) or exists (select 1 from studio.chapter_picture_decisions where by_fid = 2147483646)
--     or exists (select 1 from studio.chapter_picture_looks where by_fid = 2147483646) or exists (select 1 from studio.image_costs where day = d and funded = 'admin' and model = 'gpt-image-2.5-sunburst' and kind = 'image')
--   then raise exception 'READ-BACK FAILED: a test row was not deleted'; end if;
--   raise notice 'READ-BACK PASSED';
-- end;
-- $$;
-- rollback;

-- D. UNDO (only if the release is withdrawn), as postgres. Paste the lines below without their "-- ". It removes the
--    tables only while they are empty: once an admin has made a picture, it refuses (nothing is deleted; export the
--    rows first and ask the owner). It narrows image_costs.funded back only while no 'admin' row exists.
-- begin;
-- do $$
-- begin
--   if to_regclass('studio.chapter_picture_versions') is not null and (exists (select 1 from studio.chapter_picture_versions) or exists (select 1 from studio.chapter_picture_decisions) or exists (select 1 from studio.chapter_picture_looks)) then
--     raise exception 'UNDO REFUSED: chapter pictures have been made or kept; nothing is deleted';
--   end if;
--   if exists (select 1 from studio.image_costs where funded = 'admin') then
--     raise exception 'UNDO REFUSED: image_costs has admin rows';
--   end if;
-- end;
-- $$;
-- drop table if exists studio.chapter_picture_decisions;
-- drop function if exists studio.chapter_picture_decision_job();
-- drop table if exists studio.chapter_picture_looks;
-- drop table if exists studio.chapter_picture_versions;
-- alter table studio.image_costs drop constraint if exists image_costs_funded_check;
-- alter table studio.image_costs add constraint image_costs_funded_check check (funded in ('free', 'prepaid'));
-- commit;
