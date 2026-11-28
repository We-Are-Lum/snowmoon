-- NEXT_takes_hide_owner.sql: a picture's maker hiding it hides the takes that copied it, and bringing it back brings
-- them back (Nate, 2026-11-27: "the follow-up PR for the two hiding gaps, before the challenge opens to everyone").
-- Branch takes-hide-followup. NOT APPLIED. 0052's check on who hid a publication is widened for the author too.
-- It takes the next free number at merge, after 0056, checked against
-- origin/main and production. Drafted by the coding agent (Claude, a closed model by Anthropic). Tested on in-memory
-- PGlite against migrations 0001-0056 (npm run test:takes-hide-owner-sql). Requires 0052 (the takes log) and 0054.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (rights by has_function_privilege; a picture made by one person and one by their linked
-- wallet, another person's two takes using it, a refused stranger, the maker's hide and unhide, all inside a transaction
-- that ends in `rollback;`; it ends "READ-BACK PASSED"), and D. the undo, refused once a maker's hide is on record.
-- Safe to run twice.
--
-- What it is for. 0054's hide_takes_using_picture and unhide_takes_using_picture are for moderators and rules; a maker's
-- own "Hide" (src/app/api/images/[id]/hide/route.ts) didn't reach the takes that copied the picture. New functions, not a
-- looser old one: each checks the caller made the picture (studio.made_picture: its maker, or a FID whose linked wallet
-- made it), then does what the moderator's does, logged with role 'author'. The takes log (0052) accepts role 'author'
-- and, for it only, a negative person number (wallet, Lens, Bluesky). Every take that copied the picture is hidden,
-- anyone's: the picture leaves public view, and a take shows its own copy of it.
--
-- Safe with today's live code: nothing calls the new functions until this branch ships; the widened checks accept every
-- row the old ones did.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
-- The takes log accepts a picture's maker (role 'author') hiding or bringing back the takes that copied their picture,
-- with their own person number (a wallet, Lens or Bluesky person number is negative); everyone else's rows as before.
alter table studio.voice_publication_log drop constraint if exists voice_publication_log_role_check;
alter table studio.voice_publication_log add constraint voice_publication_log_role_check check (role in ('reader', 'moderator', 'maintainer', 'rule', 'author'));
alter table studio.voice_publication_log drop constraint if exists voice_publication_log_by_fid_check;
alter table studio.voice_publication_log add constraint voice_publication_log_by_fid_check check (by_fid >= 0 or (role = 'author' and by_fid <> 0));
-- A take hidden with its maker's picture is hidden by the author (0052's check: moderators, maintainers and rules only).
alter table studio.voice_publications drop constraint if exists voice_publications_hidden_check;
alter table studio.voice_publications add constraint voice_publications_hidden_check check (
  (hidden_at is null and hidden_by is null and hidden_role is null)
  or (hidden_at is not null and hidden_by is not null and hidden_by >= 0 and hidden_role in ('moderator', 'maintainer', 'rule'))
  or (hidden_at is not null and hidden_by is not null and hidden_by <> 0 and hidden_role = 'author'));

-- Whether p_by made the picture (this version's element): its maker, or a FID whose linked wallet made it.
create or replace function studio.made_picture(p_version uuid, p_by bigint) returns boolean
language sql stable security definer set search_path = studio, pg_temp as $fn$
  select exists (
    select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
    where v.id = p_version and e.element_type = 'image' and (e.created_by_fid = p_by
      or (e.created_by_fid < 0 and exists (select 1 from studio.wallet_links l where l.account_id = -e.created_by_fid and l.fid = p_by and l.unlinked_at is null))));
$fn$;
revoke all on function studio.made_picture(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.made_picture(uuid, bigint) to studio_writer;

-- A maker hides their own picture (Terms §7, "Hide"): every live take that copied it, anyone's, is hidden with it, as for
-- a moderator's hide (0054), logged as the author's. Refused unless p_by made the picture. Returns the files to move.
create or replace function studio.hide_takes_using_own_picture(p_version uuid, p_by bigint) returns table (publication_id uuid, key text)
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare t uuid;
begin
  if not studio.made_picture(p_version, p_by) then raise exception 'not a picture this person made' using errcode = 'P0002'; end if;
  for t in select id from studio.voice_publications where kind = 'take' and picture->>'version' = p_version::text and taken_down_at is null and hidden_at is null loop
    update studio.voice_publications set hidden_at = now(), hidden_by = p_by, hidden_role = 'author' where id = t;
    insert into studio.voice_publication_log (publication_id, step, by_fid, role, note) values (t, 'hidden', p_by, 'author', 'its picture was hidden');
    return query select t, f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = t;
  end loop;
end $fn$;
revoke all on function studio.hide_takes_using_own_picture(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.hide_takes_using_own_picture(uuid, bigint) to studio_writer;

-- The maker brings their picture back: the takes hidden only because of it come back, by the same rule as a moderator's
-- unhide (0054): hidden with their picture, no hide of their own since they were last unhidden, no open report of their
-- own; and only those hidden by the maker's own hide (hidden_role 'author'), never a moderator's or a rule's. Refused
-- unless p_by made the picture. Returns the files to move back.
create or replace function studio.unhide_takes_using_own_picture(p_version uuid, p_by bigint) returns table (publication_id uuid, key text)
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare t uuid;
begin
  if not studio.made_picture(p_version, p_by) then raise exception 'not a picture this person made' using errcode = 'P0002'; end if;
  for t in
    select p.id from studio.voice_publications p
    where p.kind = 'take' and p.picture->>'version' = p_version::text and p.taken_down_at is null and p.hidden_at is not null and p.hidden_role = 'author'
      and exists (select 1 from studio.voice_publication_log g where g.publication_id = p.id and g.step = 'hidden' and g.note = 'its picture was hidden')
      and not exists (select 1 from studio.voice_publication_log h where h.publication_id = p.id and h.step = 'hidden' and h.note is distinct from 'its picture was hidden'
        and h.at >= coalesce((select max(u.at) from studio.voice_publication_log u where u.publication_id = p.id and u.step = 'unhidden'), '-infinity'))
      and not exists (select 1 from studio.voice_publication_log r where r.publication_id = p.id and r.step = 'reported'
        and r.at > coalesce((select max(x.at) from studio.voice_publication_log x where x.publication_id = p.id and x.step = 'dismissed'), '-infinity'))
  loop
    update studio.voice_publications set hidden_at = null, hidden_by = null, hidden_role = null where id = t;
    insert into studio.voice_publication_log (publication_id, step, by_fid, role, note) values (t, 'unhidden', p_by, 'author', 'its picture was restored');
    return query select t, f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = t;
  end loop;
end $fn$;
revoke all on function studio.unhide_takes_using_own_picture(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.unhide_takes_using_own_picture(uuid, bigint) to studio_writer;
rollback;

-- B. MIGRATION.
begin;
-- The takes log accepts a picture's maker (role 'author') hiding or bringing back the takes that copied their picture,
-- with their own person number (a wallet, Lens or Bluesky person number is negative); everyone else's rows as before.
alter table studio.voice_publication_log drop constraint if exists voice_publication_log_role_check;
alter table studio.voice_publication_log add constraint voice_publication_log_role_check check (role in ('reader', 'moderator', 'maintainer', 'rule', 'author'));
alter table studio.voice_publication_log drop constraint if exists voice_publication_log_by_fid_check;
alter table studio.voice_publication_log add constraint voice_publication_log_by_fid_check check (by_fid >= 0 or (role = 'author' and by_fid <> 0));
-- A take hidden with its maker's picture is hidden by the author (0052's check: moderators, maintainers and rules only).
alter table studio.voice_publications drop constraint if exists voice_publications_hidden_check;
alter table studio.voice_publications add constraint voice_publications_hidden_check check (
  (hidden_at is null and hidden_by is null and hidden_role is null)
  or (hidden_at is not null and hidden_by is not null and hidden_by >= 0 and hidden_role in ('moderator', 'maintainer', 'rule'))
  or (hidden_at is not null and hidden_by is not null and hidden_by <> 0 and hidden_role = 'author'));

-- Whether p_by made the picture (this version's element): its maker, or a FID whose linked wallet made it.
create or replace function studio.made_picture(p_version uuid, p_by bigint) returns boolean
language sql stable security definer set search_path = studio, pg_temp as $fn$
  select exists (
    select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
    where v.id = p_version and e.element_type = 'image' and (e.created_by_fid = p_by
      or (e.created_by_fid < 0 and exists (select 1 from studio.wallet_links l where l.account_id = -e.created_by_fid and l.fid = p_by and l.unlinked_at is null))));
$fn$;
revoke all on function studio.made_picture(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.made_picture(uuid, bigint) to studio_writer;

-- A maker hides their own picture (Terms §7, "Hide"): every live take that copied it, anyone's, is hidden with it, as for
-- a moderator's hide (0054), logged as the author's. Refused unless p_by made the picture. Returns the files to move.
create or replace function studio.hide_takes_using_own_picture(p_version uuid, p_by bigint) returns table (publication_id uuid, key text)
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare t uuid;
begin
  if not studio.made_picture(p_version, p_by) then raise exception 'not a picture this person made' using errcode = 'P0002'; end if;
  for t in select id from studio.voice_publications where kind = 'take' and picture->>'version' = p_version::text and taken_down_at is null and hidden_at is null loop
    update studio.voice_publications set hidden_at = now(), hidden_by = p_by, hidden_role = 'author' where id = t;
    insert into studio.voice_publication_log (publication_id, step, by_fid, role, note) values (t, 'hidden', p_by, 'author', 'its picture was hidden');
    return query select t, f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = t;
  end loop;
end $fn$;
revoke all on function studio.hide_takes_using_own_picture(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.hide_takes_using_own_picture(uuid, bigint) to studio_writer;

-- The maker brings their picture back: the takes hidden only because of it come back, by the same rule as a moderator's
-- unhide (0054): hidden with their picture, no hide of their own since they were last unhidden, no open report of their
-- own; and only those hidden by the maker's own hide (hidden_role 'author'), never a moderator's or a rule's. Refused
-- unless p_by made the picture. Returns the files to move back.
create or replace function studio.unhide_takes_using_own_picture(p_version uuid, p_by bigint) returns table (publication_id uuid, key text)
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare t uuid;
begin
  if not studio.made_picture(p_version, p_by) then raise exception 'not a picture this person made' using errcode = 'P0002'; end if;
  for t in
    select p.id from studio.voice_publications p
    where p.kind = 'take' and p.picture->>'version' = p_version::text and p.taken_down_at is null and p.hidden_at is not null and p.hidden_role = 'author'
      and exists (select 1 from studio.voice_publication_log g where g.publication_id = p.id and g.step = 'hidden' and g.note = 'its picture was hidden')
      and not exists (select 1 from studio.voice_publication_log h where h.publication_id = p.id and h.step = 'hidden' and h.note is distinct from 'its picture was hidden'
        and h.at >= coalesce((select max(u.at) from studio.voice_publication_log u where u.publication_id = p.id and u.step = 'unhidden'), '-infinity'))
      and not exists (select 1 from studio.voice_publication_log r where r.publication_id = p.id and r.step = 'reported'
        and r.at > coalesce((select max(x.at) from studio.voice_publication_log x where x.publication_id = p.id and x.step = 'dismissed'), '-infinity'))
  loop
    update studio.voice_publications set hidden_at = null, hidden_by = null, hidden_role = null where id = t;
    insert into studio.voice_publication_log (publication_id, step, by_fid, role, note) values (t, 'unhidden', p_by, 'author', 'its picture was restored');
    return query select t, f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = t;
  end loop;
end $fn$;
revoke all on function studio.unhide_takes_using_own_picture(uuid, bigint) from public, anon, authenticated;
grant execute on function studio.unhide_takes_using_own_picture(uuid, bigint) to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Paste the lines below without their "-- ". It sets no role. FIDs 2147483646,
--    2147483645 and 2147483644 and the wallet 0x…c0ffee03 belong to no one. Ends "READ-BACK PASSED".
--
-- begin;
-- select f, has_function_privilege('studio_writer', f, 'execute') as writer, has_function_privilege('anon', f, 'execute') as anon
-- from unnest(array['studio.hide_takes_using_own_picture(uuid, bigint)', 'studio.unhide_takes_using_own_picture(uuid, bigint)', 'studio.made_picture(uuid, bigint)']) f order by 1;
-- do $$
-- declare
--   maker constant bigint := 2147483646;
--   other constant bigint := 2147483645;
--   eph uuid; sheet uuid; sheetv uuid; img uuid; imgv uuid; wimg uuid; wimgv uuid; acct bigint;
--   dr1 uuid; dr2 uuid;
--   t1 uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
--   t2 uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
--   a64 constant text := repeat('a', 64);
--   b64 constant text := repeat('b', 64);
--   n int;
--   refused boolean;
--   drec constant jsonb := '{"provider":"elevenlabs","model":"eleven_multilingual_sts_v2","takes":[{"takeSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}]}';
-- begin
--   if not has_function_privilege('studio_writer', 'studio.hide_takes_using_own_picture(uuid, bigint)', 'execute')
--     or has_function_privilege('anon', 'studio.hide_takes_using_own_picture(uuid, bigint)', 'execute')
--     or not has_function_privilege('studio_writer', 'studio.unhide_takes_using_own_picture(uuid, bigint)', 'execute')
--     or has_function_privilege('anon', 'studio.unhide_takes_using_own_picture(uuid, bigint)', 'execute')
--     then raise exception 'READ-BACK FAILED: who may hide or bring back takes with their own picture'; end if;
--   -- A picture of Lord Ephelion made by `maker`, and one made by a wallet linked to `maker`; elements, versions and links
--   -- are append-only: the rollback removes them.
--   select id into eph from studio.entities where work_id = 'snowmoon' and kind = 'character' and name = 'Lord Ephelion';
--   if eph is null then insert into studio.entities (work_id, kind, name) values ('snowmoon', 'character', 'Lord Ephelion') returning id into eph; end if;
--   insert into studio.elements (work_id, element_type, entity_id, created_by_fid, status) values ('snowmoon', 'design', eph, 6786, 'published') returning id into sheet;
--   insert into studio.element_versions (element_id, version_no) values (sheet, 1) returning id into sheetv;
--   insert into studio.elements (work_id, element_type, created_by_fid, status) values ('snowmoon', 'image', maker, 'published') returning id into img;
--   insert into studio.element_versions (element_id, version_no) values (img, 1) returning id into imgv;
--   insert into studio.links (from_version_id, to_version_id, kind) values (imgv, sheetv, 'uses');
--   insert into studio.wallet_accounts (address) values ('0x00000000000000000000000000000000c0ffee03') returning id into acct;
--   insert into studio.wallet_links (account_id, fid, how) values (acct, maker, 'signed');
--   insert into studio.elements (work_id, element_type, created_by_fid, status) values ('snowmoon', 'image', -acct, 'published') returning id into wimg;
--   insert into studio.element_versions (element_id, version_no) values (wimg, 1) returning id into wimgv;
--   if not studio.made_picture(imgv, maker) or not studio.made_picture(wimgv, maker) or studio.made_picture(imgv, other) then
--     raise exception 'READ-BACK FAILED: who made which picture'; end if;
--   -- Another person's take using maker's picture, and another of theirs using it, reported for itself.
--   insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (other, 'performance', 'doing-fine-v2', 'ephelion-warm-lecturer', drec) returning id into dr1;
--   insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (other, 'performance', 'natural-way-v2', 'ephelion-warm-lecturer', drec) returning id into dr2;
--   perform studio.publish_voice_take(t1, dr1, other, true, '{"voice":{},"speech":{"id":"doing-fine-v2"},"spoken":{}}',
--     jsonb_build_object('source', 'set', 'version', imgv::text, 'key', 'takes/' || t1 || '/picture-' || b64 || '.jpg', 'sha256', b64),
--     jsonb_build_array(jsonb_build_object('key', 'takes/' || t1 || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || t1 || '/picture-' || b64 || '.jpg', 'sha256', b64)), false);
--   perform studio.publish_voice_take(t2, dr2, other, true, '{"voice":{},"speech":{"id":"natural-way-v2"},"spoken":{}}',
--     jsonb_build_object('source', 'set', 'version', imgv::text, 'key', 'takes/' || t2 || '/picture-' || b64 || '.jpg', 'sha256', b64),
--     jsonb_build_array(jsonb_build_object('key', 'takes/' || t2 || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || t2 || '/picture-' || b64 || '.jpg', 'sha256', b64)), false);
--   insert into studio.voice_publication_log (publication_id, step, by_fid, role, reason) values (t2, 'reported', 2147483644, 'reader', 'spam');
--   -- Someone who didn't make the picture is refused.
--   begin perform studio.hide_takes_using_own_picture(imgv, other); refused := false; exception when others then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a person who did not make the picture hid its takes'; end if;
--   begin perform studio.unhide_takes_using_own_picture(imgv, other); refused := false; exception when others then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a person who did not make the picture brought its takes back'; end if;
--   -- The maker hides it: both takes (another person's) are hidden, logged as the author's, their files returned.
--   select count(*) into n from studio.hide_takes_using_own_picture(imgv, maker);
--   if n <> 4 or (select hidden_at from studio.voice_publications where id = t1) is null or (select hidden_at from studio.voice_publications where id = t2) is null
--     or not exists (select 1 from studio.voice_publication_log where publication_id = t1 and step = 'hidden' and role = 'author' and by_fid = maker and note = 'its picture was hidden')
--     then raise exception 'READ-BACK FAILED: the maker''s hide did not hide the takes that copied the picture'; end if;
--   -- The maker brings it back: the take hidden only because of it returns; the one with its own report stays hidden.
--   select count(*) into n from studio.unhide_takes_using_own_picture(imgv, maker);
--   if n <> 2 or (select hidden_at from studio.voice_publications where id = t1) is not null or (select hidden_at from studio.voice_publications where id = t2) is null
--     or not exists (select 1 from studio.voice_publication_log where publication_id = t1 and step = 'unhidden' and role = 'author' and note = 'its picture was restored')
--     then raise exception 'READ-BACK FAILED: the maker''s unhide did not bring back only the takes hidden because of the picture'; end if;
--   -- A take a moderator hid with the picture stays hidden when the maker brings it back.
--   perform studio.hide_takes_using_picture(imgv, 6786, 'moderator');
--   if (select hidden_role from studio.voice_publications where id = t1) is distinct from 'moderator' then raise exception 'READ-BACK FAILED: a moderator''s hide of the picture did not reach the take'; end if;
--   perform studio.unhide_takes_using_own_picture(imgv, maker);
--   if (select hidden_at from studio.voice_publications where id = t1) is null then raise exception 'READ-BACK FAILED: the maker brought back a take a moderator hid'; end if;
--   -- A wallet account's person number (negative) is accepted for the author, and refused for anyone else.
--   insert into studio.voice_publication_log (publication_id, step, by_fid, role, note) values (t1, 'moved_private', -acct, 'author', 'its picture was hidden');
--   begin insert into studio.voice_publication_log (publication_id, step, by_fid, role) values (t1, 'hidden', -acct, 'moderator'); refused := false; exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a negative person number was logged for a moderator'; end if;
--   delete from studio.voice_publication_log where publication_id in (t1, t2);
--   delete from studio.voice_publications where id in (t1, t2);
--   delete from studio.voice_drafts where id in (dr1, dr2);
--   delete from studio.wallet_links where account_id = acct;
--   if exists (select 1 from studio.voice_publications where id in (t1, t2)) then raise exception 'READ-BACK FAILED: the test rows were not deleted'; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;
-- rollback;

-- D. UNDO, only if the release is withdrawn. Paste without the "-- ".
-- begin;
-- do $$ begin
--   if exists (select 1 from studio.voice_publication_log where role = 'author') or exists (select 1 from studio.voice_publications where hidden_role = 'author') then raise exception 'UNDO REFUSED: a maker''s hide of takes is on record'; end if;
-- end $$;
-- drop function if exists studio.unhide_takes_using_own_picture(uuid, bigint);
-- drop function if exists studio.hide_takes_using_own_picture(uuid, bigint);
-- drop function if exists studio.made_picture(uuid, bigint);
-- alter table studio.voice_publications drop constraint if exists voice_publications_hidden_check;
-- alter table studio.voice_publications add constraint voice_publications_hidden_check check (
--   (hidden_at is null and hidden_by is null and hidden_role is null)
--   or (hidden_at is not null and hidden_by is not null and hidden_by >= 0 and hidden_role in ('moderator', 'maintainer', 'rule')));
-- alter table studio.voice_publication_log drop constraint if exists voice_publication_log_by_fid_check;
-- alter table studio.voice_publication_log add constraint voice_publication_log_by_fid_check check (by_fid >= 0);
-- alter table studio.voice_publication_log drop constraint if exists voice_publication_log_role_check;
-- alter table studio.voice_publication_log add constraint voice_publication_log_role_check check (role in ('reader', 'moderator', 'maintainer', 'rule'));
-- commit;
