-- 0043_chapter_picture_additions.sql: pictures an admin adds to the edition's chapters while reading (owner, 2026-11-19;
-- branch chapter-pictures-in-reader). APPLIED in production by the owner as NEXT_chapter_picture_additions (owner,
-- 2026-11-20: "A, B, C(a) all true, C(b) READ-BACK PASSED"); numbered 0043 for the merge (main ended at 0042). Drafted
-- by the coding agent (Claude, a closed model by Anthropic). Additive only: it changes nothing 0042 made.
-- Requires 0001_core (the studio schema, studio_writer) and 0042_chapter_picture_versions (which this table works with;
-- it adds no foreign key to it).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: a read-only select, then a block that inserts realistic rows and deletes them,
-- inside a transaction that ends in `rollback;`; it ends "READ-BACK PASSED"), and D. the undo, only if the release is
-- withdrawn: it refuses while any added picture exists, so nothing is deleted. Safe to run twice.
--
-- What it adds: studio.chapter_picture_additions, where each added picture sits: its id (a job id of its own,
-- c<chapter>-b<block>-added-<8 hex>, the block it sits after), the chapter, the block it sits after, the passage it shows
-- (first and last block), the admin who added it and when. Its pictures are versions in
-- studio.chapter_picture_versions and what the chapter shows is the latest decision in studio.chapter_picture_decisions
-- (0042), as for the edition's committed pictures: a draft is private until kept; "take it off the chapter" is a
-- decision with no version; it stays stored and can be shown again. Not readable by anon or authenticated;
-- studio_writer may select and insert only (no update, delete or truncate).

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.chapter_picture_additions (
  job_id text primary key check (job_id ~ '^c[0-9]{1,2}-b[0-9]{1,4}-added-[0-9a-f]{8}$'),
  chapter int not null check (chapter between 1 and 99),
  after_idx int not null check (after_idx >= 0),
  start_idx int not null check (start_idx >= 0),
  end_idx int not null check (end_idx >= 0),
  by_fid bigint not null check (by_fid > 0),
  added_at timestamptz not null default now(),
  constraint passage_in_order check (start_idx <= end_idx),
  constraint id_names_its_place check (job_id like 'c' || chapter || '-b%' and split_part(split_part(job_id, '-b', 2), '-', 1)::int = after_idx)
);
create index if not exists chapter_picture_additions_chapter on studio.chapter_picture_additions (chapter, after_idx);

alter table studio.chapter_picture_additions enable row level security;
drop policy if exists writer_read on studio.chapter_picture_additions;
drop policy if exists writer_insert on studio.chapter_picture_additions;
create policy writer_read on studio.chapter_picture_additions for select to studio_writer using (true);
create policy writer_insert on studio.chapter_picture_additions for insert to studio_writer with check (true);
revoke all on studio.chapter_picture_additions from anon, authenticated;
revoke update, delete, truncate on studio.chapter_picture_additions from studio_writer;
grant select, insert on studio.chapter_picture_additions to studio_writer;
rollback;

-- B. THE MIGRATION.
begin;
create table if not exists studio.chapter_picture_additions (
  job_id text primary key check (job_id ~ '^c[0-9]{1,2}-b[0-9]{1,4}-added-[0-9a-f]{8}$'),
  chapter int not null check (chapter between 1 and 99),
  after_idx int not null check (after_idx >= 0),
  start_idx int not null check (start_idx >= 0),
  end_idx int not null check (end_idx >= 0),
  by_fid bigint not null check (by_fid > 0),
  added_at timestamptz not null default now(),
  constraint passage_in_order check (start_idx <= end_idx),
  constraint id_names_its_place check (job_id like 'c' || chapter || '-b%' and split_part(split_part(job_id, '-b', 2), '-', 1)::int = after_idx)
);
create index if not exists chapter_picture_additions_chapter on studio.chapter_picture_additions (chapter, after_idx);

alter table studio.chapter_picture_additions enable row level security;
drop policy if exists writer_read on studio.chapter_picture_additions;
drop policy if exists writer_insert on studio.chapter_picture_additions;
create policy writer_read on studio.chapter_picture_additions for select to studio_writer using (true);
create policy writer_insert on studio.chapter_picture_additions for insert to studio_writer with check (true);
revoke all on studio.chapter_picture_additions from anon, authenticated;
revoke update, delete, truncate on studio.chapter_picture_additions from studio_writer;
grant select, insert on studio.chapter_picture_additions to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Two parts. Paste the lines below without their "-- ".
-- (a) one read-only select: every row's ok must be true (4 rows).
-- select n, what, ok from (values
--   (1, 'the table exists with row level security on',
--     exists (select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'studio' and c.relname = 'chapter_picture_additions' and c.relrowsecurity)),
--   (2, 'anon and authenticated can read nothing of it',
--     not has_table_privilege('anon', 'studio.chapter_picture_additions', 'select') and not has_table_privilege('authenticated', 'studio.chapter_picture_additions', 'select')),
--   (3, 'studio_writer may select and insert, never update or delete',
--     has_table_privilege('studio_writer', 'studio.chapter_picture_additions', 'insert') and has_table_privilege('studio_writer', 'studio.chapter_picture_additions', 'select')
--     and not has_table_privilege('studio_writer', 'studio.chapter_picture_additions', 'update') and not has_table_privilege('studio_writer', 'studio.chapter_picture_additions', 'delete')),
--   (4, 'no public policy on it',
--     not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'chapter_picture_additions' and (roles && array['anon', 'authenticated', 'public']::name[])))
-- ) as t(n, what, ok) order by n;
--
-- (b) one transaction that ends in ROLLBACK. As the site writes them: a picture added in chapter 3 after block 42,
--     showing blocks 40 to 42; a draft of it (GPT Image 2.5 Sunburst, a note, Zei's sheet as a reference); kept; then
--     taken off the chapter (a decision with no version); then shown again. Checks the latest decision each time, that
--     a passage out of order and an id that names another block are refused, and that 0042's trigger refuses a
--     decision pointing at another job's version. Then deletes every row it added and checks they are gone. The person
--     number 2147483646 fits the columns and belongs to no account. Ends "READ-BACK PASSED"; each check raises
--     "READ-BACK FAILED: …" on failure. It sets no role (postgres can't switch roles in the SQL Editor).
-- begin;
-- do $$
-- declare
--   j text := 'c3-b042-added-0a1b2c3d';
--   v uuid := gen_random_uuid();
--   shown uuid;
--   refused boolean;
-- begin
--   insert into studio.chapter_picture_additions (job_id, chapter, after_idx, start_idx, end_idx, by_fid) values (j, 3, 42, 40, 42, 2147483646);
--   insert into studio.chapter_picture_versions (id, job_id, chapter, made_by_fid, model, maker, open_weights, look, note, prompt, recipe, sha256, width, height, jpeg, cost_usd) values
--     (v, j, 3, 2147483646, 'gpt-image-2.5-sunburst', 'OpenAI', false,
--      '{"kind": "style", "label": "Comic book", "text": "Comic book: bold ink outlines, flat colour, halftone shading.", "versionId": "00000009-0000-4000-8000-000000000002"}'::jsonb,
--      'Zei at the window of the classroom, the arena lights far off.',
--      'Zei at the window of the classroom, the arena lights far off.\n\nComic book: bold ink outlines, flat colour, halftone shading.\n\nNo text, no lettering, no signs with words.',
--      '{"v": 1, "kind": "chapter-picture", "added": {"after": 42, "start": 40, "end": 42}, "model": {"id": "gpt-image-2.5-sunburst", "maker": "OpenAI", "open": false}, "references": [{"sheet": "zei", "sha256": "aaaa"}]}'::jsonb,
--      repeat('d', 64), 1024, 576, decode(repeat('ff', 200), 'hex'), 0.0478);
--   insert into studio.chapter_picture_decisions (job_id, chapter, version_id, action, public_url, by_fid, by_handle) values (j, 3, v, 'keep', 'https://pictures.snowmoon.party/images/readers/' || repeat('d', 32) || '.jpg', 2147483646, 'readback-test');
--   select version_id into shown from studio.chapter_picture_decisions where job_id = j order by decided_at desc, id desc limit 1;
--   if shown is distinct from v then raise exception 'READ-BACK FAILED: the kept picture is not the one shown'; end if;
--   insert into studio.chapter_picture_decisions (job_id, chapter, version_id, action, public_url, by_fid, by_handle) values (j, 3, null, 'restore', null, 2147483646, 'readback-test');
--   select version_id into shown from studio.chapter_picture_decisions where job_id = j order by decided_at desc, id desc limit 1;
--   if shown is not null then raise exception 'READ-BACK FAILED: taking it off the chapter left a picture shown'; end if;
--   insert into studio.chapter_picture_decisions (job_id, chapter, version_id, action, public_url, by_fid, by_handle) values (j, 3, v, 'restore', 'https://pictures.snowmoon.party/images/readers/' || repeat('d', 32) || '.jpg', 2147483646, 'readback-test');
--   select version_id into shown from studio.chapter_picture_decisions where job_id = j order by decided_at desc, id desc limit 1;
--   if shown is distinct from v then raise exception 'READ-BACK FAILED: showing it again did not show it'; end if;
--   refused := false;
--   begin
--     insert into studio.chapter_picture_additions (job_id, chapter, after_idx, start_idx, end_idx, by_fid) values ('c3-b050-added-0a1b2c3e', 3, 50, 52, 48, 2147483646);
--   exception when check_violation then refused := true;
--   end;
--   if not refused then raise exception 'READ-BACK FAILED: a passage out of order was accepted'; end if;
--   refused := false;
--   begin
--     insert into studio.chapter_picture_additions (job_id, chapter, after_idx, start_idx, end_idx, by_fid) values ('c3-b050-added-0a1b2c3f', 3, 51, 50, 51, 2147483646);
--   exception when check_violation then refused := true;
--   end;
--   if not refused then raise exception 'READ-BACK FAILED: an id naming another block was accepted'; end if;
--   refused := false;
--   begin
--     insert into studio.chapter_picture_decisions (job_id, chapter, version_id, action, public_url, by_fid) values ('c3-b043-added-0a1b2c40', 3, v, 'keep', 'https://pictures.snowmoon.party/images/readers/x.jpg', 2147483646);
--   exception when others then refused := sqlerrm like 'chapter_picture_decisions: version%';
--   end;
--   if not refused then raise exception 'READ-BACK FAILED: a decision pointing at another job''s version was accepted'; end if;
--   delete from studio.chapter_picture_decisions where by_fid = 2147483646;
--   delete from studio.chapter_picture_versions where id = v;
--   delete from studio.chapter_picture_additions where by_fid = 2147483646;
--   if exists (select 1 from studio.chapter_picture_additions where by_fid = 2147483646) or exists (select 1 from studio.chapter_picture_versions where made_by_fid = 2147483646)
--     or exists (select 1 from studio.chapter_picture_decisions where by_fid = 2147483646)
--   then raise exception 'READ-BACK FAILED: a test row was not deleted'; end if;
--   raise notice 'READ-BACK PASSED';
-- end;
-- $$;
-- rollback;

-- D. UNDO (only if the release is withdrawn), as postgres. Paste the lines below without their "-- ". It removes the
--    table only while it is empty: once an admin has added a picture, it refuses (nothing is deleted; export the rows
--    first and ask the owner). 0042's tables are untouched.
-- begin;
-- do $$
-- begin
--   if to_regclass('studio.chapter_picture_additions') is not null and exists (select 1 from studio.chapter_picture_additions) then
--     raise exception 'UNDO REFUSED: pictures have been added; nothing is deleted';
--   end if;
-- end;
-- $$;
-- drop table if exists studio.chapter_picture_additions;
-- commit;
