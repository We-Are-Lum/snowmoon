-- 0048_bounty_review.sql: the admins' private review labels for the poidh backstory bounty's claims and the remix
-- challenge's entries (/admin/bounty; owner, 2026-11-23; branch bounty-review). Numbered 0048 on 2026-11-23 (was
-- NEXT_bounty_review.sql), the next free number after main's 0001-0047 (no unmerged branch holds a later number).
-- APPLIED by the owner in production on 2026-11-23 (A, B, C: READ-BACK PASSED; the owner also tested it on Postgres 16
-- against main's migrations: the dry run changes nothing, it applies twice, the read-back keeps nothing, the undo puts
-- back main's exact shape). Drafted by the coding agent (Claude, a closed model by Anthropic). Tested on in-memory PGlite
-- against main's 0001-0047 (npm run test:bounty-review).
-- Requires 0001_core (the studio schema and the studio_writer role). Nothing else.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: a read-only select, then a block that inserts realistic rows as the site
-- writes them, checks that bad rows are refused, and deletes them, all inside a transaction that ends in `rollback;`;
-- it ends "READ-BACK PASSED"), and D. the undo, only if the release is withdrawn. Safe to run twice. Additive: three
-- new tables, nothing else changes.
--
-- What it is for. Admins go through the bounty's claims (read from Base, never stored here) and the challenge's entries,
-- one per screen, and tap up to three labels on each: "Followed directions", "Good", "Top", with a short private note.
-- - studio.review_labels: one row per label on a claim or an entry (kind 'bounty_claim', subject "<bounty id>:<claim
--   id>"; kind 'challenge_entry', subject the entry's version id): which admin set it (FID) and when. Tapping it off
--   deletes the row. studio_writer may select, insert and delete; no update.
-- - studio.review_notes: one note per claim or entry (at most 280 characters), who wrote it last and when; emptying
--   the note deletes the row. studio_writer may select, insert, update and delete.
-- - studio.review_log: every change, kept (label on, label off, note set or cleared), with who and when, so a label
--   another admin took off is still on record. studio_writer may select and insert only.
-- Private (P5): no policy or grant for anon or authenticated; nothing public reads these tables (npm run
-- test:bounty-review checks every file under src/). The winner is still picked on poidh.xyz.
--
-- Safe with today's live code (main at 8bf0b667, 2026-11-23): nothing reads or writes these tables.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create table if not exists studio.review_labels (
  kind text not null check (kind in ('bounty_claim', 'challenge_entry')),
  subject text not null,
  label text not null check (label in ('followed_directions', 'good', 'top')),
  set_by bigint not null check (set_by > 0),
  set_at timestamptz not null default now(),
  primary key (kind, subject, label),
  constraint review_labels_subject check (
    (kind = 'bounty_claim' and subject ~ '^[0-9]{1,10}:[0-9]{1,12}$')
    or (kind = 'challenge_entry' and subject ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
);
create table if not exists studio.review_notes (
  kind text not null check (kind in ('bounty_claim', 'challenge_entry')),
  subject text not null,
  note text not null check (char_length(note) between 1 and 280 and btrim(note) <> ''),
  set_by bigint not null check (set_by > 0),
  set_at timestamptz not null default now(),
  primary key (kind, subject),
  constraint review_notes_subject check (
    (kind = 'bounty_claim' and subject ~ '^[0-9]{1,10}:[0-9]{1,12}$')
    or (kind = 'challenge_entry' and subject ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
);
create table if not exists studio.review_log (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('bounty_claim', 'challenge_entry')),
  subject text not null check (char_length(subject) between 1 and 64),
  change text not null check (change in ('label_on', 'label_off', 'note_set', 'note_cleared')),
  label text check (label in ('followed_directions', 'good', 'top')),
  note text check (note is null or char_length(note) <= 280),
  by_fid bigint not null check (by_fid > 0),
  at timestamptz not null default now(),
  constraint review_log_shape check (
    (change in ('label_on', 'label_off') and label is not null and note is null)
    or (change = 'note_set' and label is null and note is not null)
    or (change = 'note_cleared' and label is null and note is null))
);
create index if not exists review_log_subject on studio.review_log (kind, subject, at desc);

alter table studio.review_labels enable row level security;
alter table studio.review_notes enable row level security;
alter table studio.review_log enable row level security;
drop policy if exists writer_read on studio.review_labels;
create policy writer_read on studio.review_labels for select to studio_writer using (true);
drop policy if exists writer_insert on studio.review_labels;
create policy writer_insert on studio.review_labels for insert to studio_writer with check (true);
drop policy if exists writer_delete on studio.review_labels;
create policy writer_delete on studio.review_labels for delete to studio_writer using (true);
drop policy if exists writer_read on studio.review_notes;
create policy writer_read on studio.review_notes for select to studio_writer using (true);
drop policy if exists writer_insert on studio.review_notes;
create policy writer_insert on studio.review_notes for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.review_notes;
create policy writer_update on studio.review_notes for update to studio_writer using (true) with check (true);
drop policy if exists writer_delete on studio.review_notes;
create policy writer_delete on studio.review_notes for delete to studio_writer using (true);
drop policy if exists writer_read on studio.review_log;
create policy writer_read on studio.review_log for select to studio_writer using (true);
drop policy if exists writer_insert on studio.review_log;
create policy writer_insert on studio.review_log for insert to studio_writer with check (true);
revoke all on studio.review_labels from public, anon, authenticated;
revoke all on studio.review_notes from public, anon, authenticated;
revoke all on studio.review_log from public, anon, authenticated;
revoke all on studio.review_labels, studio.review_notes, studio.review_log from studio_writer;
grant select, insert, delete on studio.review_labels to studio_writer;
grant select, insert, update, delete on studio.review_notes to studio_writer;
grant select, insert on studio.review_log to studio_writer;
rollback;

-- B. MIGRATION.
begin;
create table if not exists studio.review_labels (
  kind text not null check (kind in ('bounty_claim', 'challenge_entry')),
  subject text not null,
  label text not null check (label in ('followed_directions', 'good', 'top')),
  set_by bigint not null check (set_by > 0),
  set_at timestamptz not null default now(),
  primary key (kind, subject, label),
  constraint review_labels_subject check (
    (kind = 'bounty_claim' and subject ~ '^[0-9]{1,10}:[0-9]{1,12}$')
    or (kind = 'challenge_entry' and subject ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
);
create table if not exists studio.review_notes (
  kind text not null check (kind in ('bounty_claim', 'challenge_entry')),
  subject text not null,
  note text not null check (char_length(note) between 1 and 280 and btrim(note) <> ''),
  set_by bigint not null check (set_by > 0),
  set_at timestamptz not null default now(),
  primary key (kind, subject),
  constraint review_notes_subject check (
    (kind = 'bounty_claim' and subject ~ '^[0-9]{1,10}:[0-9]{1,12}$')
    or (kind = 'challenge_entry' and subject ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
);
create table if not exists studio.review_log (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('bounty_claim', 'challenge_entry')),
  subject text not null check (char_length(subject) between 1 and 64),
  change text not null check (change in ('label_on', 'label_off', 'note_set', 'note_cleared')),
  label text check (label in ('followed_directions', 'good', 'top')),
  note text check (note is null or char_length(note) <= 280),
  by_fid bigint not null check (by_fid > 0),
  at timestamptz not null default now(),
  constraint review_log_shape check (
    (change in ('label_on', 'label_off') and label is not null and note is null)
    or (change = 'note_set' and label is null and note is not null)
    or (change = 'note_cleared' and label is null and note is null))
);
create index if not exists review_log_subject on studio.review_log (kind, subject, at desc);

alter table studio.review_labels enable row level security;
alter table studio.review_notes enable row level security;
alter table studio.review_log enable row level security;
drop policy if exists writer_read on studio.review_labels;
create policy writer_read on studio.review_labels for select to studio_writer using (true);
drop policy if exists writer_insert on studio.review_labels;
create policy writer_insert on studio.review_labels for insert to studio_writer with check (true);
drop policy if exists writer_delete on studio.review_labels;
create policy writer_delete on studio.review_labels for delete to studio_writer using (true);
drop policy if exists writer_read on studio.review_notes;
create policy writer_read on studio.review_notes for select to studio_writer using (true);
drop policy if exists writer_insert on studio.review_notes;
create policy writer_insert on studio.review_notes for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.review_notes;
create policy writer_update on studio.review_notes for update to studio_writer using (true) with check (true);
drop policy if exists writer_delete on studio.review_notes;
create policy writer_delete on studio.review_notes for delete to studio_writer using (true);
drop policy if exists writer_read on studio.review_log;
create policy writer_read on studio.review_log for select to studio_writer using (true);
drop policy if exists writer_insert on studio.review_log;
create policy writer_insert on studio.review_log for insert to studio_writer with check (true);
revoke all on studio.review_labels from public, anon, authenticated;
revoke all on studio.review_notes from public, anon, authenticated;
revoke all on studio.review_log from public, anon, authenticated;
revoke all on studio.review_labels, studio.review_notes, studio.review_log from studio_writer;
grant select, insert, delete on studio.review_labels to studio_writer;
grant select, insert, update, delete on studio.review_notes to studio_writer;
grant select, insert on studio.review_log to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Paste the lines below without their "-- ". It sets no role (postgres can't
--    switch roles in the SQL Editor): studio_writer's rights are read with has_table_privilege, and the rows are written
--    as postgres, exactly as the site writes them. Everything is inside one transaction that ends in rollback, so
--    nothing is kept even if a check fails part way. The admin FID 2147483646 fits the columns and belongs to no one.
--    Ends "READ-BACK PASSED"; each check raises "READ-BACK FAILED: …" on failure.
--
-- begin;
-- select t, p, has_table_privilege('studio_writer', 'studio.' || t, p) as writer, has_table_privilege('anon', 'studio.' || t, p) as anon,
--   has_table_privilege('authenticated', 'studio.' || t, p) as authenticated
-- from unnest(array['review_labels', 'review_notes', 'review_log']) t, unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p order by 1, 2;
-- do $$
-- declare
--   a constant bigint := 2147483646;
--   c constant text := '560:4258';
--   e constant text := '72222222-2222-4222-8222-222222222222';
--   n int;
--   refused boolean;
-- begin
--   -- Rights: exactly what the site needs, and nothing for anon or authenticated.
--   if not (has_table_privilege('studio_writer', 'studio.review_labels', 'select') and has_table_privilege('studio_writer', 'studio.review_labels', 'insert') and has_table_privilege('studio_writer', 'studio.review_labels', 'delete'))
--     or has_table_privilege('studio_writer', 'studio.review_labels', 'update') then raise exception 'READ-BACK FAILED: studio_writer''s rights on review_labels'; end if;
--   if not (has_table_privilege('studio_writer', 'studio.review_notes', 'select') and has_table_privilege('studio_writer', 'studio.review_notes', 'insert') and has_table_privilege('studio_writer', 'studio.review_notes', 'update') and has_table_privilege('studio_writer', 'studio.review_notes', 'delete'))
--     then raise exception 'READ-BACK FAILED: studio_writer''s rights on review_notes'; end if;
--   if not (has_table_privilege('studio_writer', 'studio.review_log', 'select') and has_table_privilege('studio_writer', 'studio.review_log', 'insert'))
--     or has_table_privilege('studio_writer', 'studio.review_log', 'update') or has_table_privilege('studio_writer', 'studio.review_log', 'delete') then raise exception 'READ-BACK FAILED: studio_writer''s rights on review_log'; end if;
--   select count(*) into n from unnest(array['review_labels', 'review_notes', 'review_log']) t, unnest(array['anon', 'authenticated']) r, unnest(array['select', 'insert', 'update', 'delete']) p
--     where has_table_privilege(r, 'studio.' || t, p);
--   if n <> 0 then raise exception 'READ-BACK FAILED: anon or authenticated has % rights on the review tables', n; end if;
--   select count(*) into n from pg_class where relnamespace = 'studio'::regnamespace and relname in ('review_labels', 'review_notes', 'review_log') and relrowsecurity;
--   if n <> 3 then raise exception 'READ-BACK FAILED: row level security is on for % of 3 tables', n; end if;
--   -- Realistic rows, as the site writes them: two labels on a claim, one on an entry, a note, and their log rows.
--   insert into studio.review_labels (kind, subject, label, set_by) values ('bounty_claim', c, 'followed_directions', a), ('bounty_claim', c, 'good', a), ('challenge_entry', e, 'top', a);
--   insert into studio.review_log (kind, subject, change, label, by_fid) values ('bounty_claim', c, 'label_on', 'followed_directions', a), ('bounty_claim', c, 'label_on', 'good', a), ('challenge_entry', e, 'label_on', 'top', a);
--   insert into studio.review_notes (kind, subject, note, set_by) values ('bounty_claim', c, 'Strong hook; check the Su line against c4.', a)
--     on conflict (kind, subject) do update set note = excluded.note, set_by = excluded.set_by, set_at = now();
--   insert into studio.review_log (kind, subject, change, note, by_fid) values ('bounty_claim', c, 'note_set', 'Strong hook; check the Su line against c4.', a);
--   select count(*) into n from studio.review_labels where set_by = a;
--   if n <> 3 then raise exception 'READ-BACK FAILED: % of 3 labels kept', n; end if;
--   -- Tapping a label off deletes it; the log keeps the change.
--   delete from studio.review_labels where kind = 'bounty_claim' and subject = c and label = 'good';
--   insert into studio.review_log (kind, subject, change, label, by_fid) values ('bounty_claim', c, 'label_off', 'good', a);
--   -- Bad rows are refused: a label that isn't one of the three, a claim subject that isn't "<bounty>:<claim>", an
--   -- entry that isn't a version id, the same label twice, a blank note, a note over 280 characters, a log row of the
--   -- wrong shape.
--   begin insert into studio.review_labels (kind, subject, label, set_by) values ('bounty_claim', c, 'winner', a); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a fourth label was accepted'; end if;
--   begin insert into studio.review_labels (kind, subject, label, set_by) values ('bounty_claim', '4258', 'top', a); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a claim without its bounty was accepted'; end if;
--   begin insert into studio.review_labels (kind, subject, label, set_by) values ('challenge_entry', c, 'top', a); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: an entry that is not a version id was accepted'; end if;
--   begin insert into studio.review_labels (kind, subject, label, set_by) values ('bounty_claim', c, 'followed_directions', a); refused := false; exception when unique_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: the same label twice was accepted'; end if;
--   begin insert into studio.review_notes (kind, subject, note, set_by) values ('challenge_entry', e, '   ', a); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a blank note was accepted'; end if;
--   begin insert into studio.review_notes (kind, subject, note, set_by) values ('challenge_entry', e, repeat('x', 281), a); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a note over 280 characters was accepted'; end if;
--   begin insert into studio.review_log (kind, subject, change, by_fid) values ('bounty_claim', c, 'label_on', a); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a label change without its label was accepted'; end if;
--   -- What the page reads back.
--   select count(*) into n from studio.review_labels where kind = 'bounty_claim' and subject = c;
--   if n <> 1 then raise exception 'READ-BACK FAILED: % labels on the claim after one was taken off, not 1', n; end if;
--   select count(*) into n from studio.review_log where by_fid = a;
--   if n <> 5 then raise exception 'READ-BACK FAILED: % log rows, not 5', n; end if;
--   -- Delete them (the transaction's rollback below also undoes everything).
--   delete from studio.review_labels where set_by = a;
--   delete from studio.review_notes where set_by = a;
--   delete from studio.review_log where by_fid = a;
--   if exists (select 1 from studio.review_labels where set_by = a) or exists (select 1 from studio.review_notes where set_by = a) or exists (select 1 from studio.review_log where by_fid = a)
--     then raise exception 'READ-BACK FAILED: the test rows were not deleted'; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;
-- rollback;

-- D. UNDO, only if the release is withdrawn (after the code that reads these tables is gone). It deletes every label
--    and note. Paste without the "-- ".
-- begin;
-- drop table if exists studio.review_log;
-- drop table if exists studio.review_notes;
-- drop table if exists studio.review_labels;
-- commit;
