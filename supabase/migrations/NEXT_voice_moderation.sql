-- NEXT_voice_moderation.sql: reporting and hiding published storyboards (Nate, 2026-11-23, branch voice-moderation;
-- docs/proposals/storyboard-moderation.md on branch ephelion-launch-list, approved with his answers: the same rules as
-- images, a notice on a hidden page, the admins moderate). Not numbered until merge: it takes the next free number then,
-- checked against origin/main and production. NOT APPLIED until Nate applies it; the branch merges only after he says
-- "applied". Drafted by the coding agent (Claude, a closed model by Anthropic); tested in PGlite by the agent (npm run
-- test:voice, every migration in order). Requires 0046_ephelion_voice_publish.sql (applied).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (ending in `rollback;`), B. the migration (ending in `commit;`), C. the read-back (a realistic
-- publication, a report, a rule's hide, an unhide and a dismissal made, read and removed inside a transaction that ends in
-- `rollback;`, and the draft removed as the site removes it, which leaves the log in place; it ends "READ-BACK PASSED";
-- studio_writer's rights are read by definition, as the SQL Editor can't SET ROLE), and D. the undo, only if the release is withdrawn. Safe to run twice.
--
-- What it changes. Nothing is readable by anon or authenticated.
-- 1. studio.voice_publications.hidden_at, hidden_by, hidden_role: set while a publication is hidden (by a moderator, the
--    maintainer, or a stated rule), cleared when it is unhidden. studio_writer still can't change the table: hiding and
--    unhiding are the two functions below, as publishing and taking down are (0046).
-- 2. studio.voice_publication_log: every report, hide, unhide and dismissal of a published storyboard, and each move of
--    its files to private storage and back, with who (by FID: the reporter's is never shown to moderators), their role,
--    the reason and the reporter's note. The same shape as studio.removal_log. Insert and read only for studio_writer:
--    append-only. publication_id is a plain uuid with no foreign key (Nate, 2026-11-23: "Keep the log when a storyboard
--    is removed, so removing it can't erase a hide"): when its maker removes a taken-down storyboard's draft or board
--    (studio.delete_voice_draft, studio.delete_voice_board, unchanged from 0049), the publication row goes and its log
--    rows stay.
-- 3. studio.hide_voice_publication: hides a live, shown publication and logs it; returns its files' public keys (to move
--    to private storage), or nothing if it was already hidden or is taken down.
-- 4. studio.unhide_voice_publication: shows a hidden one again and logs it; returns its files' public keys (to restore).

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
alter table studio.voice_publications add column if not exists hidden_at timestamptz;
alter table studio.voice_publications add column if not exists hidden_by bigint;
alter table studio.voice_publications add column if not exists hidden_role text;
alter table studio.voice_publications drop constraint if exists voice_publications_hidden_check;
alter table studio.voice_publications add constraint voice_publications_hidden_check check (
  (hidden_at is null and hidden_by is null and hidden_role is null)
  or (hidden_at is not null and hidden_by is not null and hidden_by >= 0 and hidden_role in ('moderator', 'maintainer', 'rule'))
);
create table if not exists studio.voice_publication_log (
  publication_id uuid not null,
  step text not null check (step in ('reported', 'hidden', 'unhidden', 'dismissed', 'moved_private', 'restored_public')),
  by_fid bigint not null check (by_fid >= 0),
  role text not null check (role in ('reader', 'moderator', 'maintainer', 'rule')),
  reason text check (reason in ('minor', 'sexual', 'real_person', 'violence', 'hateful', 'someone_elses_work', 'misrepresents', 'spam', 'other')),
  note text check (char_length(note) <= 280),
  at timestamptz not null default now(),
  check (step <> 'reported' or (role = 'reader' and reason is not null))
);
create index if not exists voice_publication_log_pub on studio.voice_publication_log (publication_id, at);
create index if not exists voice_publication_log_reporter on studio.voice_publication_log (by_fid, at) where step = 'reported';
alter table studio.voice_publication_log enable row level security;
drop policy if exists writer_insert on studio.voice_publication_log;
drop policy if exists writer_read on studio.voice_publication_log;
create policy writer_insert on studio.voice_publication_log for insert to studio_writer with check (true);
create policy writer_read on studio.voice_publication_log for select to studio_writer using (true);
revoke all on studio.voice_publication_log from anon, authenticated;
grant select, insert on studio.voice_publication_log to studio_writer;
revoke update, delete, truncate on studio.voice_publication_log from studio_writer;

create or replace function studio.hide_voice_publication(p_id uuid, p_by bigint, p_role text, p_reason text, p_note text) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if p_role not in ('moderator', 'maintainer', 'rule') then raise exception 'not a hiding role' using errcode = '22023'; end if;
  update studio.voice_publications set hidden_at = now(), hidden_by = p_by, hidden_role = p_role
    where id = p_id and taken_down_at is null and hidden_at is null;
  if not found then return; end if;
  insert into studio.voice_publication_log (publication_id, step, by_fid, role, reason, note) values (p_id, 'hidden', p_by, p_role, p_reason, p_note);
  return query select f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = p_id;
end $fn$;
revoke all on function studio.hide_voice_publication(uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function studio.hide_voice_publication(uuid, bigint, text, text, text) to studio_writer;

create or replace function studio.unhide_voice_publication(p_id uuid, p_by bigint, p_role text) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if p_role not in ('moderator', 'maintainer') then raise exception 'not an unhiding role' using errcode = '22023'; end if;
  update studio.voice_publications set hidden_at = null, hidden_by = null, hidden_role = null
    where id = p_id and taken_down_at is null and hidden_at is not null;
  if not found then return; end if;
  insert into studio.voice_publication_log (publication_id, step, by_fid, role) values (p_id, 'unhidden', p_by, p_role);
  return query select f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = p_id;
end $fn$;
revoke all on function studio.unhide_voice_publication(uuid, bigint, text) from public, anon, authenticated;
grant execute on function studio.unhide_voice_publication(uuid, bigint, text) to studio_writer;
rollback;

-- B. MIGRATION. Expect COMMIT.
begin;
alter table studio.voice_publications add column if not exists hidden_at timestamptz;
alter table studio.voice_publications add column if not exists hidden_by bigint;
alter table studio.voice_publications add column if not exists hidden_role text;
alter table studio.voice_publications drop constraint if exists voice_publications_hidden_check;
alter table studio.voice_publications add constraint voice_publications_hidden_check check (
  (hidden_at is null and hidden_by is null and hidden_role is null)
  or (hidden_at is not null and hidden_by is not null and hidden_by >= 0 and hidden_role in ('moderator', 'maintainer', 'rule'))
);
create table if not exists studio.voice_publication_log (
  publication_id uuid not null,
  step text not null check (step in ('reported', 'hidden', 'unhidden', 'dismissed', 'moved_private', 'restored_public')),
  by_fid bigint not null check (by_fid >= 0),
  role text not null check (role in ('reader', 'moderator', 'maintainer', 'rule')),
  reason text check (reason in ('minor', 'sexual', 'real_person', 'violence', 'hateful', 'someone_elses_work', 'misrepresents', 'spam', 'other')),
  note text check (char_length(note) <= 280),
  at timestamptz not null default now(),
  check (step <> 'reported' or (role = 'reader' and reason is not null))
);
create index if not exists voice_publication_log_pub on studio.voice_publication_log (publication_id, at);
create index if not exists voice_publication_log_reporter on studio.voice_publication_log (by_fid, at) where step = 'reported';
alter table studio.voice_publication_log enable row level security;
drop policy if exists writer_insert on studio.voice_publication_log;
drop policy if exists writer_read on studio.voice_publication_log;
create policy writer_insert on studio.voice_publication_log for insert to studio_writer with check (true);
create policy writer_read on studio.voice_publication_log for select to studio_writer using (true);
revoke all on studio.voice_publication_log from anon, authenticated;
grant select, insert on studio.voice_publication_log to studio_writer;
revoke update, delete, truncate on studio.voice_publication_log from studio_writer;

create or replace function studio.hide_voice_publication(p_id uuid, p_by bigint, p_role text, p_reason text, p_note text) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if p_role not in ('moderator', 'maintainer', 'rule') then raise exception 'not a hiding role' using errcode = '22023'; end if;
  update studio.voice_publications set hidden_at = now(), hidden_by = p_by, hidden_role = p_role
    where id = p_id and taken_down_at is null and hidden_at is null;
  if not found then return; end if;
  insert into studio.voice_publication_log (publication_id, step, by_fid, role, reason, note) values (p_id, 'hidden', p_by, p_role, p_reason, p_note);
  return query select f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = p_id;
end $fn$;
revoke all on function studio.hide_voice_publication(uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function studio.hide_voice_publication(uuid, bigint, text, text, text) to studio_writer;

create or replace function studio.unhide_voice_publication(p_id uuid, p_by bigint, p_role text) returns setof text
language plpgsql security definer set search_path = studio, pg_temp as $fn$
begin
  if p_role not in ('moderator', 'maintainer') then raise exception 'not an unhiding role' using errcode = '22023'; end if;
  update studio.voice_publications set hidden_at = null, hidden_by = null, hidden_role = null
    where id = p_id and taken_down_at is null and hidden_at is not null;
  if not found then return; end if;
  insert into studio.voice_publication_log (publication_id, step, by_fid, role) values (p_id, 'unhidden', p_by, p_role);
  return query select f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = p_id;
end $fn$;
revoke all on function studio.unhide_voice_publication(uuid, bigint, text) from public, anon, authenticated;
grant execute on function studio.unhide_voice_publication(uuid, bigint, text) to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Expect "READ-BACK PASSED".
begin;
do $$
declare d uuid; p uuid := gen_random_uuid(); n int;
begin
  if to_regclass('studio.voice_publication_log') is null then raise exception 'studio.voice_publication_log is missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'voice_publications' and column_name = 'hidden_at') then raise exception 'voice_publications.hidden_at is missing'; end if;
  -- Rights: studio_writer adds and reads the log, never changes it; it still can't change publications itself.
  if not has_table_privilege('studio_writer', 'studio.voice_publication_log', 'insert') or not has_table_privilege('studio_writer', 'studio.voice_publication_log', 'select') then raise exception 'studio_writer cannot keep or read the log'; end if;
  if has_table_privilege('studio_writer', 'studio.voice_publication_log', 'update') or has_table_privilege('studio_writer', 'studio.voice_publication_log', 'delete') or has_table_privilege('studio_writer', 'studio.voice_publication_log', 'truncate') then raise exception 'studio_writer can change the log'; end if;
  if has_table_privilege('studio_writer', 'studio.voice_publications', 'update') then raise exception 'studio_writer can change publications directly'; end if;
  if has_table_privilege('anon', 'studio.voice_publication_log', 'select') or has_table_privilege('authenticated', 'studio.voice_publication_log', 'select') then raise exception 'anon or authenticated can read the log'; end if;
  if not has_function_privilege('studio_writer', 'studio.hide_voice_publication(uuid, bigint, text, text, text)', 'execute') or not has_function_privilege('studio_writer', 'studio.unhide_voice_publication(uuid, bigint, text)', 'execute') then raise exception 'studio_writer cannot hide or unhide'; end if;
  if has_function_privilege('anon', 'studio.hide_voice_publication(uuid, bigint, text, text, text)', 'execute') then raise exception 'anon can hide'; end if;

  -- A realistic performance, its board and its publication, as the site makes them.
  insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (6786, 'performance', 'ephelion-c13-b64', 'ephelion-warm-lecturer',
    jsonb_build_object('provider', 'ElevenLabs', 'model', 'eleven_multilingual_sts_v2', 'takes', jsonb_build_array(jsonb_build_object('role', 'take', 'takeSha256', repeat('a', 64), 'convertedSha256', repeat('e', 64))))) returning id into d;
  insert into studio.voice_boards (draft_id, fid, version, cuts, shots) values (d, 6786, 1, '[8.2]', '[]');
  perform studio.publish_voice_board(p, d, 6786, 1, true, '{"voice":{},"shots":[],"closing":{}}'::jsonb,
    jsonb_build_array(jsonb_build_object('key', 'storyboards/' || p || '/audio-1-' || repeat('b', 64) || '.mp3', 'sha256', repeat('b', 64)),
                      jsonb_build_object('key', 'storyboards/' || p || '/s1-' || repeat('c', 64) || '.png', 'sha256', repeat('c', 64))));

  -- A reader's report, then the stated rule's hide (one "minor" report): the two public keys come back to move.
  insert into studio.voice_publication_log (publication_id, step, by_fid, role, reason, note) values (p, 'reported', 193912, 'reader', 'minor', 'A child in shot 1.');
  select count(*) into n from studio.hide_voice_publication(p, 0, 'rule', 'minor', 'one "minor" report');
  if n <> 2 then raise exception 'the hide returned % keys, not 2', n; end if;
  if (select hidden_role from studio.voice_publications where id = p) <> 'rule' then raise exception 'the hide was not kept'; end if;
  select count(*) into n from studio.hide_voice_publication(p, 6786, 'moderator', null, null);
  if n <> 0 then raise exception 'a second hide returned keys'; end if;
  insert into studio.voice_publication_log (publication_id, step, by_fid, role) values (p, 'moved_private', 0, 'rule');
  -- A moderator unhides it (the report was wrong), the files go back, and the reports are dismissed.
  select count(*) into n from studio.unhide_voice_publication(p, 6786, 'moderator');
  if n <> 2 or (select hidden_at from studio.voice_publications where id = p) is not null then raise exception 'the unhide did not show it again'; end if;
  insert into studio.voice_publication_log (publication_id, step, by_fid, role) values (p, 'restored_public', 6786, 'moderator'), (p, 'dismissed', 6786, 'moderator');
  select count(*) into n from studio.voice_publication_log where publication_id = p;
  if n <> 6 then raise exception 'expected 6 log rows, found %', n; end if;

  -- Refused shapes: a report without a reason, a report by a moderator's role, an unknown step, a long note, a reader's hide, a rule's unhide.
  begin insert into studio.voice_publication_log (publication_id, step, by_fid, role) values (p, 'reported', 1, 'reader'); raise exception 'a report without a reason was accepted'; exception when check_violation then null; end;
  begin insert into studio.voice_publication_log (publication_id, step, by_fid, role, reason) values (p, 'reported', 1, 'moderator', 'spam'); raise exception 'a report by a moderator role was accepted'; exception when check_violation then null; end;
  begin insert into studio.voice_publication_log (publication_id, step, by_fid, role) values (p, 'liked', 1, 'reader'); raise exception 'an unknown step was accepted'; exception when check_violation then null; end;
  begin insert into studio.voice_publication_log (publication_id, step, by_fid, role, reason, note) values (p, 'reported', 1, 'reader', 'spam', repeat('x', 281)); raise exception 'a 281-character note was accepted'; exception when check_violation then null; end;
  begin perform studio.hide_voice_publication(p, 1, 'reader', null, null); raise exception 'a reader''s hide was accepted'; exception when invalid_parameter_value then null; end;
  begin perform studio.unhide_voice_publication(p, 0, 'rule'); raise exception 'a rule''s unhide was accepted'; exception when invalid_parameter_value then null; end;
  begin update studio.voice_publications set hidden_at = now() where id = p; raise exception 'a hide without who was accepted'; exception when check_violation then null; end;

  -- Its maker takes it down, then removes the draft as the site does (0049's studio.delete_voice_draft, unchanged): the
  -- publication, board and draft go, and the log stays, so removing a storyboard can't erase a hide.
  perform * from studio.take_down_voice_publication(p, 6786);
  perform * from studio.delete_voice_draft(d, 6786);
  if exists (select 1 from studio.voice_publications where id = p) or exists (select 1 from studio.voice_drafts where id = d) or exists (select 1 from studio.voice_boards where draft_id = d) then raise exception 'the draft, its board or its publication was not removed'; end if;
  select count(*) into n from studio.voice_publication_log where publication_id = p;
  if n <> 6 then raise exception 'removing the draft changed its log (% rows, not 6)', n; end if;
  -- Removed again: the read-back's own log rows (as postgres; studio_writer can't).
  delete from studio.voice_publication_log where publication_id = p;
  if exists (select 1 from studio.voice_publication_log where publication_id = p) then raise exception 'the read-back rows were not removed'; end if;
  raise notice 'READ-BACK PASSED';
end $$;
rollback;

-- D. UNDO (only if the release is withdrawn), as postgres. Paste the lines below without their "-- ". It refuses once
--    any storyboard has been reported or hidden (export and ask the owner first); otherwise it removes all of the above.
-- begin;
-- do $$ begin
--   if exists (select 1 from studio.voice_publication_log) or exists (select 1 from studio.voice_publications where hidden_at is not null) then raise exception 'UNDO REFUSED: reports or hides exist; nothing is changed'; end if;
-- end $$;
-- drop function if exists studio.hide_voice_publication(uuid, bigint, text, text, text);
-- drop function if exists studio.unhide_voice_publication(uuid, bigint, text);
-- drop table if exists studio.voice_publication_log;
-- alter table studio.voice_publications drop constraint if exists voice_publications_hidden_check;
-- alter table studio.voice_publications drop column if exists hidden_role;
-- alter table studio.voice_publications drop column if exists hidden_by;
-- alter table studio.voice_publications drop column if exists hidden_at;
-- commit;
