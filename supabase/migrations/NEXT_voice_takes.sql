-- NEXT_voice_takes.sql: entering a take in the Ephelion challenge, with its picture, and hiding it (Nate, 2026-11-26:
-- "people should enter and share takes in this round"; "entering a take includes its picture"; report and hide for
-- takes folded into PR 6). Branch ephelion-takes. NOT APPLIED. It takes the next free number at merge, checked against
-- origin/main and production. Drafted by the coding agent (Claude, a closed model by Anthropic). Tested on in-memory
-- PGlite against the branch's migrations 0001-0052 (npm run test:voice-takes-sql). Requires 0046 (voice publications),
-- 0049 and 0052 (#225, moderation).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: rights read with has_table_privilege and has_function_privilege, then realistic
-- rows entered, refused, replaced, hidden and unhidden with their picture, taken down and deleted (the test pictures and sheets,
-- append-only, go with the rollback), all inside a transaction that ends in `rollback;`; it ends "READ-BACK PASSED"),
-- and D. the undo, refused once any take has been entered. Safe to run twice.
--
-- What it is for. A take is a second kind of publication in studio.voice_publications (0046), so the take-down (0046)
-- and #225's report, queue and reversible hide (0052) cover takes as they cover storyboards.
-- 1. kind: 'storyboard' (every existing row, by default) or 'take'. A take has no storyboard version, its speech
--    (speech_id) and its picture (picture); a storyboard has neither. Storyboards' recipe and file rules are unchanged.
-- 2. A take's recipe holds the voice, the speech and the words as spoken (as transcribed, with any corrections), and
--    never a recording. Its files (2 to 8) are only under takes/<publication id>/: the converted speech (mp3) and its
--    picture (png or jpg), each named by its sha256.
-- 3. picture: where the take's picture came from and its own copy: 'set' (an approved Ephelion picture: which are
--    approved is the site's config; the database checks it is a published picture of Lord Ephelion), 'own' (a published
--    picture of Lord Ephelion this person made), both by their version id; 'preset' (a ready-made scene picture, by its
--    id in the site's config); 'own-scene' (the one they described); and the copy's key and sha256 under takes/<id>/.
--    Its labels and credit are in the recipe. A copy, so taking the take down never touches the original.
-- 4. studio.picture_is_of(version, character): a published picture is of a character when it, or a picture it was
--    remixed from (remixed_from links, up to 20 steps), uses a published sheet of that character, as the challenge pages
--    decide (src/lib/challenge/pictures.ts).
-- 5. studio.publish_voice_take: the person's own converted take (a performance draft, theirs, not yet public), for its
--    own speech; a 'set' or 'own' picture of Lord Ephelion ('own' made by them); every file under the take's folder, an
--    mp3 among them and the picture among them. With p_replace, their live take of that speech is taken down in the
--    same call (Nate, 2026-11-26), so a failed entry leaves the old one live; without it, a second is refused.
-- 6. studio.hide_takes_using_picture: when a picture is hidden, every live take that copied it is hidden with it
--    (reversibly, logged "its picture was hidden"), and its files' keys are returned for the site to move, as for any
--    hide. studio.unhide_takes_using_picture: when the picture is unhidden, the takes hidden only because of it come
--    back (their latest hide is the picture's, and no report of their own is open); a take hidden or reported for
--    itself stays hidden (Nate, 2026-11-26).
-- 7. voice_publications_live_take: one live take per person per speech (a hidden take is still live);
--    voice_publications_take_picture: the takes by the picture they copied.
-- studio_writer's rights on the table are unchanged (select); it may execute the four functions. Nothing for anon.
--
-- Safe with today's live code: every existing row is a storyboard; the new columns are empty on them; publishing is off.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
alter table studio.voice_publications add column if not exists kind text not null default 'storyboard';
alter table studio.voice_publications add column if not exists speech_id text;
alter table studio.voice_publications add column if not exists picture jsonb;
alter table studio.voice_publications alter column board_version drop not null;
alter table studio.voice_publications drop constraint if exists voice_publications_board_version_check;
alter table studio.voice_publications add constraint voice_publications_board_version_check check (board_version is null or board_version between 1 and 10000);
alter table studio.voice_publications drop constraint if exists voice_publications_recipe_check;
alter table studio.voice_publications add constraint voice_publications_recipe_check check (jsonb_typeof(recipe) = 'object' and (
  (kind = 'storyboard' and recipe ? 'voice' and recipe ? 'shots' and recipe ? 'closing')
  or (kind = 'take' and recipe ? 'voice' and recipe ? 'speech' and recipe ? 'spoken' and not recipe ? 'recording')));
alter table studio.voice_publications drop constraint if exists voice_publications_files_check;
alter table studio.voice_publications add constraint voice_publications_files_check check (jsonb_typeof(files) = 'array' and (
  (kind = 'storyboard' and jsonb_array_length(files) between 2 and 64)
  or (kind = 'take' and jsonb_array_length(files) between 2 and 8)));
alter table studio.voice_publications drop constraint if exists voice_publications_kind_shape;
alter table studio.voice_publications add constraint voice_publications_kind_shape check (
  (kind = 'storyboard' and board_version is not null and speech_id is null and picture is null)
  or (kind = 'take' and board_version is null and speech_id ~ '^[a-z0-9-]{1,80}$' and jsonb_typeof(picture) = 'object'
      and picture->>'source' in ('set', 'own', 'preset', 'own-scene')
      and picture->>'key' ~ '^takes/[0-9a-f-]{36}/[a-z0-9-]{1,40}-[0-9a-f]{64}\.(png|jpg)$' and picture->>'sha256' ~ '^[0-9a-f]{64}$'
      and ((picture->>'source' in ('set', 'own')) = (picture->>'version' ~ '^[0-9a-f-]{36}$'))
      and ((picture->>'source' = 'preset') = (picture->>'scene' ~ '^[a-z0-9-]{1,80}$'))));
-- One live take per person per speech (plan v3); a hidden take is still live.
create unique index if not exists voice_publications_live_take on studio.voice_publications (fid, speech_id) where kind = 'take' and taken_down_at is null;
-- The takes that copied a given picture (a 'set' or 'own' picture, by its version), for hiding them with it.
create index if not exists voice_publications_take_picture on studio.voice_publications ((picture->>'version')) where kind = 'take';

-- Whether a published picture is of a character: it, or a picture it was remixed from (any number of steps), uses a
-- published sheet (a 'design' element) of that character, as the challenge pages decide (src/lib/challenge/pictures.ts).
create or replace function studio.picture_is_of(p_version uuid, p_character text) returns boolean
language sql stable security definer set search_path = studio, pg_temp as $fn$
  with recursive line(v, depth) as (
    select p_version, 0
    union
    select l.to_version_id, line.depth + 1 from studio.links l join line on l.from_version_id = line.v
    where l.kind = 'remixed_from' and line.depth < 20
  )
  select exists (
    select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
    where v.id = p_version and e.element_type = 'image' and e.status = 'published'
  ) and exists (
    select 1 from line join studio.links u on u.from_version_id = line.v and u.kind = 'uses'
    join studio.element_versions sv on sv.id = u.to_version_id
    join studio.elements se on se.id = sv.element_id and se.element_type = 'design' and se.status = 'published'
    join studio.entities en on en.id = se.entity_id and en.kind = 'character' and en.name = p_character
  );
$fn$;
revoke all on function studio.picture_is_of(uuid, text) from public, anon, authenticated;
grant execute on function studio.picture_is_of(uuid, text) to studio_writer;

drop function if exists studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb);
create or replace function studio.publish_voice_take(p_id uuid, p_draft uuid, p_fid bigint, p_named boolean, p_recipe jsonb, p_picture jsonb, p_files jsonb, p_replace boolean) returns uuid
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare
  d record;
  old uuid;
begin
  select kind, fid, speech_id, published_at into d from studio.voice_drafts where id = p_draft for update;
  if d.kind is distinct from 'performance' or d.fid is distinct from p_fid or d.published_at is not null then
    raise exception 'not a take this person can enter' using errcode = 'P0002';
  end if;
  if p_recipe->'speech'->>'id' is distinct from d.speech_id then raise exception 'the recipe is of another speech' using errcode = '22023'; end if;
  -- A ready picture of Lord Ephelion: an approved one (any published picture of him; which are approved is the site's
  -- config) or one this person made.
  if p_picture->>'source' in ('set', 'own') then
    if not studio.picture_is_of((p_picture->>'version')::uuid, 'Lord Ephelion') then
      raise exception 'not a published picture of Lord Ephelion' using errcode = 'P0002';
    end if;
    if p_picture->>'source' = 'own' and not exists (select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
        where v.id = (p_picture->>'version')::uuid and e.created_by_fid = p_fid) then
      raise exception 'not a picture this person made' using errcode = 'P0002';
    end if;
  end if;
  if exists (select 1 from jsonb_array_elements(p_files) f where not (f->>'key' like 'takes/' || p_id::text || '/%'
        and f->>'key' ~ '^takes/[0-9a-f-]{36}/[a-z0-9-]{1,40}-[0-9a-f]{64}\.(mp3|png|jpg)$' and f->>'sha256' ~ '^[0-9a-f]{64}$')) then
    raise exception 'a file is not under this publication' using errcode = '22023';
  end if;
  if not exists (select 1 from jsonb_array_elements(p_files) f where f->>'key' like '%.mp3') then raise exception 'no audio' using errcode = '22023'; end if;
  if not exists (select 1 from jsonb_array_elements(p_files) f where f->>'key' = p_picture->>'key' and f->>'sha256' = p_picture->>'sha256') then
    raise exception 'the picture is not among the files' using errcode = '22023';
  end if;
  -- Entering again (Nate, 2026-11-26): the person's live take of this speech is taken down in this same call, so a
  -- failed entry leaves the old one live. Without p_replace a second live take is refused.
  select id into old from studio.voice_publications where kind = 'take' and fid = p_fid and speech_id = d.speech_id and taken_down_at is null for update;
  if old is not null then
    if not coalesce(p_replace, false) then raise exception 'already entered for this speech' using errcode = 'P0002'; end if;
    update studio.voice_publications set taken_down_at = now() where id = old;
    update studio.voice_drafts set published_at = null where id = (select draft_id from studio.voice_publications where id = old) and kind = 'performance';
  end if;
  insert into studio.voice_publications (id, draft_id, fid, kind, board_version, speech_id, picture, named, recipe, files)
    values (p_id, p_draft, p_fid, 'take', null, d.speech_id, p_picture, p_named, p_recipe, p_files);
  update studio.voice_drafts set published_at = now() where id = p_draft;
  return p_id;
end $fn$;
revoke all on function studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb, boolean) to studio_writer;

-- When a picture is hidden (a moderator, or a rule after reports), every live take that copied it is hidden with it, by
-- the same reversible hide as storyboards (0052), logged with a note. Unhiding the picture doesn't unhide them: a
-- moderator looks at each take (they are in the queue as hidden). Returns each hidden take and its files' keys, for the
-- site to move them to the private bucket, as for any hide.
create or replace function studio.hide_takes_using_picture(p_version uuid, p_by bigint, p_role text) returns table (publication_id uuid, key text)
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare t uuid;
begin
  if p_role not in ('moderator', 'maintainer', 'rule') then raise exception 'not a hiding role' using errcode = '22023'; end if;
  for t in select id from studio.voice_publications where kind = 'take' and picture->>'version' = p_version::text and taken_down_at is null and hidden_at is null loop
    update studio.voice_publications set hidden_at = now(), hidden_by = p_by, hidden_role = p_role where id = t;
    insert into studio.voice_publication_log (publication_id, step, by_fid, role, note) values (t, 'hidden', p_by, p_role, 'its picture was hidden');
    return query select t, f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = t;
  end loop;
end $fn$;
revoke all on function studio.hide_takes_using_picture(uuid, bigint, text) from public, anon, authenticated;
grant execute on function studio.hide_takes_using_picture(uuid, bigint, text) to studio_writer;

-- When the picture is unhidden (Nate, 2026-11-26), the takes hidden only because of it come back: those hidden with
-- their picture ("its picture was hidden"), with no hide of their own since they were last unhidden, and no report of
-- their own still open (a report after the latest dismissal). A take a moderator or a rule hid for itself, or reported for itself, stays hidden. Returns each
-- restored take and its files' keys, for the site to move back, as for any unhide.
create or replace function studio.unhide_takes_using_picture(p_version uuid, p_by bigint, p_role text) returns table (publication_id uuid, key text)
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare t uuid;
begin
  if p_role not in ('moderator', 'maintainer') then raise exception 'not an unhiding role' using errcode = '22023'; end if;
  for t in
    select p.id from studio.voice_publications p
    where p.kind = 'take' and p.picture->>'version' = p_version::text and p.taken_down_at is null and p.hidden_at is not null
      and exists (select 1 from studio.voice_publication_log g where g.publication_id = p.id and g.step = 'hidden' and g.note = 'its picture was hidden')
      -- no hide of its own since it was last unhidden (a tie keeps it hidden)
      and not exists (select 1 from studio.voice_publication_log h where h.publication_id = p.id and h.step = 'hidden' and h.note is distinct from 'its picture was hidden'
        and h.at >= coalesce((select max(u.at) from studio.voice_publication_log u where u.publication_id = p.id and u.step = 'unhidden'), '-infinity'))
      and not exists (select 1 from studio.voice_publication_log r where r.publication_id = p.id and r.step = 'reported'
        and r.at > coalesce((select max(x.at) from studio.voice_publication_log x where x.publication_id = p.id and x.step = 'dismissed'), '-infinity'))
  loop
    update studio.voice_publications set hidden_at = null, hidden_by = null, hidden_role = null where id = t;
    insert into studio.voice_publication_log (publication_id, step, by_fid, role, note) values (t, 'unhidden', p_by, p_role, 'its picture was restored');
    return query select t, f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = t;
  end loop;
end $fn$;
revoke all on function studio.unhide_takes_using_picture(uuid, bigint, text) from public, anon, authenticated;
grant execute on function studio.unhide_takes_using_picture(uuid, bigint, text) to studio_writer;
rollback;

-- B. MIGRATION.
begin;
alter table studio.voice_publications add column if not exists kind text not null default 'storyboard';
alter table studio.voice_publications add column if not exists speech_id text;
alter table studio.voice_publications add column if not exists picture jsonb;
alter table studio.voice_publications alter column board_version drop not null;
alter table studio.voice_publications drop constraint if exists voice_publications_board_version_check;
alter table studio.voice_publications add constraint voice_publications_board_version_check check (board_version is null or board_version between 1 and 10000);
alter table studio.voice_publications drop constraint if exists voice_publications_recipe_check;
alter table studio.voice_publications add constraint voice_publications_recipe_check check (jsonb_typeof(recipe) = 'object' and (
  (kind = 'storyboard' and recipe ? 'voice' and recipe ? 'shots' and recipe ? 'closing')
  or (kind = 'take' and recipe ? 'voice' and recipe ? 'speech' and recipe ? 'spoken' and not recipe ? 'recording')));
alter table studio.voice_publications drop constraint if exists voice_publications_files_check;
alter table studio.voice_publications add constraint voice_publications_files_check check (jsonb_typeof(files) = 'array' and (
  (kind = 'storyboard' and jsonb_array_length(files) between 2 and 64)
  or (kind = 'take' and jsonb_array_length(files) between 2 and 8)));
alter table studio.voice_publications drop constraint if exists voice_publications_kind_shape;
alter table studio.voice_publications add constraint voice_publications_kind_shape check (
  (kind = 'storyboard' and board_version is not null and speech_id is null and picture is null)
  or (kind = 'take' and board_version is null and speech_id ~ '^[a-z0-9-]{1,80}$' and jsonb_typeof(picture) = 'object'
      and picture->>'source' in ('set', 'own', 'preset', 'own-scene')
      and picture->>'key' ~ '^takes/[0-9a-f-]{36}/[a-z0-9-]{1,40}-[0-9a-f]{64}\.(png|jpg)$' and picture->>'sha256' ~ '^[0-9a-f]{64}$'
      and ((picture->>'source' in ('set', 'own')) = (picture->>'version' ~ '^[0-9a-f-]{36}$'))
      and ((picture->>'source' = 'preset') = (picture->>'scene' ~ '^[a-z0-9-]{1,80}$'))));
-- One live take per person per speech (plan v3); a hidden take is still live.
create unique index if not exists voice_publications_live_take on studio.voice_publications (fid, speech_id) where kind = 'take' and taken_down_at is null;
-- The takes that copied a given picture (a 'set' or 'own' picture, by its version), for hiding them with it.
create index if not exists voice_publications_take_picture on studio.voice_publications ((picture->>'version')) where kind = 'take';

-- Whether a published picture is of a character: it, or a picture it was remixed from (any number of steps), uses a
-- published sheet (a 'design' element) of that character, as the challenge pages decide (src/lib/challenge/pictures.ts).
create or replace function studio.picture_is_of(p_version uuid, p_character text) returns boolean
language sql stable security definer set search_path = studio, pg_temp as $fn$
  with recursive line(v, depth) as (
    select p_version, 0
    union
    select l.to_version_id, line.depth + 1 from studio.links l join line on l.from_version_id = line.v
    where l.kind = 'remixed_from' and line.depth < 20
  )
  select exists (
    select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
    where v.id = p_version and e.element_type = 'image' and e.status = 'published'
  ) and exists (
    select 1 from line join studio.links u on u.from_version_id = line.v and u.kind = 'uses'
    join studio.element_versions sv on sv.id = u.to_version_id
    join studio.elements se on se.id = sv.element_id and se.element_type = 'design' and se.status = 'published'
    join studio.entities en on en.id = se.entity_id and en.kind = 'character' and en.name = p_character
  );
$fn$;
revoke all on function studio.picture_is_of(uuid, text) from public, anon, authenticated;
grant execute on function studio.picture_is_of(uuid, text) to studio_writer;

drop function if exists studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb);
create or replace function studio.publish_voice_take(p_id uuid, p_draft uuid, p_fid bigint, p_named boolean, p_recipe jsonb, p_picture jsonb, p_files jsonb, p_replace boolean) returns uuid
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare
  d record;
  old uuid;
begin
  select kind, fid, speech_id, published_at into d from studio.voice_drafts where id = p_draft for update;
  if d.kind is distinct from 'performance' or d.fid is distinct from p_fid or d.published_at is not null then
    raise exception 'not a take this person can enter' using errcode = 'P0002';
  end if;
  if p_recipe->'speech'->>'id' is distinct from d.speech_id then raise exception 'the recipe is of another speech' using errcode = '22023'; end if;
  -- A ready picture of Lord Ephelion: an approved one (any published picture of him; which are approved is the site's
  -- config) or one this person made.
  if p_picture->>'source' in ('set', 'own') then
    if not studio.picture_is_of((p_picture->>'version')::uuid, 'Lord Ephelion') then
      raise exception 'not a published picture of Lord Ephelion' using errcode = 'P0002';
    end if;
    if p_picture->>'source' = 'own' and not exists (select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
        where v.id = (p_picture->>'version')::uuid and e.created_by_fid = p_fid) then
      raise exception 'not a picture this person made' using errcode = 'P0002';
    end if;
  end if;
  if exists (select 1 from jsonb_array_elements(p_files) f where not (f->>'key' like 'takes/' || p_id::text || '/%'
        and f->>'key' ~ '^takes/[0-9a-f-]{36}/[a-z0-9-]{1,40}-[0-9a-f]{64}\.(mp3|png|jpg)$' and f->>'sha256' ~ '^[0-9a-f]{64}$')) then
    raise exception 'a file is not under this publication' using errcode = '22023';
  end if;
  if not exists (select 1 from jsonb_array_elements(p_files) f where f->>'key' like '%.mp3') then raise exception 'no audio' using errcode = '22023'; end if;
  if not exists (select 1 from jsonb_array_elements(p_files) f where f->>'key' = p_picture->>'key' and f->>'sha256' = p_picture->>'sha256') then
    raise exception 'the picture is not among the files' using errcode = '22023';
  end if;
  -- Entering again (Nate, 2026-11-26): the person's live take of this speech is taken down in this same call, so a
  -- failed entry leaves the old one live. Without p_replace a second live take is refused.
  select id into old from studio.voice_publications where kind = 'take' and fid = p_fid and speech_id = d.speech_id and taken_down_at is null for update;
  if old is not null then
    if not coalesce(p_replace, false) then raise exception 'already entered for this speech' using errcode = 'P0002'; end if;
    update studio.voice_publications set taken_down_at = now() where id = old;
    update studio.voice_drafts set published_at = null where id = (select draft_id from studio.voice_publications where id = old) and kind = 'performance';
  end if;
  insert into studio.voice_publications (id, draft_id, fid, kind, board_version, speech_id, picture, named, recipe, files)
    values (p_id, p_draft, p_fid, 'take', null, d.speech_id, p_picture, p_named, p_recipe, p_files);
  update studio.voice_drafts set published_at = now() where id = p_draft;
  return p_id;
end $fn$;
revoke all on function studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb, boolean) to studio_writer;

-- When a picture is hidden (a moderator, or a rule after reports), every live take that copied it is hidden with it, by
-- the same reversible hide as storyboards (0052), logged with a note. Unhiding the picture doesn't unhide them: a
-- moderator looks at each take (they are in the queue as hidden). Returns each hidden take and its files' keys, for the
-- site to move them to the private bucket, as for any hide.
create or replace function studio.hide_takes_using_picture(p_version uuid, p_by bigint, p_role text) returns table (publication_id uuid, key text)
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare t uuid;
begin
  if p_role not in ('moderator', 'maintainer', 'rule') then raise exception 'not a hiding role' using errcode = '22023'; end if;
  for t in select id from studio.voice_publications where kind = 'take' and picture->>'version' = p_version::text and taken_down_at is null and hidden_at is null loop
    update studio.voice_publications set hidden_at = now(), hidden_by = p_by, hidden_role = p_role where id = t;
    insert into studio.voice_publication_log (publication_id, step, by_fid, role, note) values (t, 'hidden', p_by, p_role, 'its picture was hidden');
    return query select t, f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = t;
  end loop;
end $fn$;
revoke all on function studio.hide_takes_using_picture(uuid, bigint, text) from public, anon, authenticated;
grant execute on function studio.hide_takes_using_picture(uuid, bigint, text) to studio_writer;

-- When the picture is unhidden (Nate, 2026-11-26), the takes hidden only because of it come back: those hidden with
-- their picture ("its picture was hidden"), with no hide of their own since they were last unhidden, and no report of
-- their own still open (a report after the latest dismissal). A take a moderator or a rule hid for itself, or reported for itself, stays hidden. Returns each
-- restored take and its files' keys, for the site to move back, as for any unhide.
create or replace function studio.unhide_takes_using_picture(p_version uuid, p_by bigint, p_role text) returns table (publication_id uuid, key text)
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare t uuid;
begin
  if p_role not in ('moderator', 'maintainer') then raise exception 'not an unhiding role' using errcode = '22023'; end if;
  for t in
    select p.id from studio.voice_publications p
    where p.kind = 'take' and p.picture->>'version' = p_version::text and p.taken_down_at is null and p.hidden_at is not null
      and exists (select 1 from studio.voice_publication_log g where g.publication_id = p.id and g.step = 'hidden' and g.note = 'its picture was hidden')
      -- no hide of its own since it was last unhidden (a tie keeps it hidden)
      and not exists (select 1 from studio.voice_publication_log h where h.publication_id = p.id and h.step = 'hidden' and h.note is distinct from 'its picture was hidden'
        and h.at >= coalesce((select max(u.at) from studio.voice_publication_log u where u.publication_id = p.id and u.step = 'unhidden'), '-infinity'))
      and not exists (select 1 from studio.voice_publication_log r where r.publication_id = p.id and r.step = 'reported'
        and r.at > coalesce((select max(x.at) from studio.voice_publication_log x where x.publication_id = p.id and x.step = 'dismissed'), '-infinity'))
  loop
    update studio.voice_publications set hidden_at = null, hidden_by = null, hidden_role = null where id = t;
    insert into studio.voice_publication_log (publication_id, step, by_fid, role, note) values (t, 'unhidden', p_by, p_role, 'its picture was restored');
    return query select t, f->>'key' from studio.voice_publications, jsonb_array_elements(files) f where id = t;
  end loop;
end $fn$;
revoke all on function studio.unhide_takes_using_picture(uuid, bigint, text) from public, anon, authenticated;
grant execute on function studio.unhide_takes_using_picture(uuid, bigint, text) to studio_writer;
commit;

-- C. READ-BACK (after B), as postgres. Paste the lines below without their "-- ". It sets no role: studio_writer's rights are
--    read with has_table_privilege and has_function_privilege; the rows are written as postgres, as the site writes them.
--    Everything is inside one transaction that ends in rollback. FID 2147483646 belongs to no one. Ends "READ-BACK PASSED".
--
-- begin;
-- select p, has_table_privilege('studio_writer', 'studio.voice_publications', p) as writer, has_table_privilege('anon', 'studio.voice_publications', p) as anon
-- from unnest(array['select', 'insert', 'update', 'delete']) p order by 1;
-- do $$
-- declare
--   dr uuid; dr2 uuid; dr3 uuid; dr4 uuid;
--   pub4 uuid := 'aaaaaaaa-0000-4000-8000-000000000004';
--   rec2 constant jsonb := '{"voice":{"preset":"ephelion-warm-lecturer"},"speech":{"id":"natural-way-v2"},"spoken":{"kind":"as-written"},"credits":["@readback"]}';
--   eph uuid; other uuid;
--   sheet uuid; sheetv uuid; osheet uuid; osheetv uuid;
--   img uuid; imgv uuid; img2 uuid; img2v uuid; oimg uuid; oimgv uuid;
--   pub uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
--   pub2 uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
--   pub3 uuid := 'aaaaaaaa-0000-4000-8000-000000000003';
--   fid constant bigint := 2147483646;
--   refused boolean;
--   n int;
--   a64 constant text := repeat('a', 64);
--   b64 constant text := repeat('b', 64);
--   rec constant jsonb := '{"voice":{"preset":"ephelion-warm-lecturer"},"speech":{"id":"doing-fine-v2"},"spoken":{"kind":"as-written"},"credits":["@readback"]}';
--   drec constant jsonb := '{"provider":"elevenlabs","model":"eleven_multilingual_sts_v2","takes":[{"takeSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}]}';
-- begin
--   if not has_table_privilege('studio_writer', 'studio.voice_publications', 'select') or has_table_privilege('studio_writer', 'studio.voice_publications', 'insert')
--     or has_table_privilege('studio_writer', 'studio.voice_publications', 'update') or has_table_privilege('studio_writer', 'studio.voice_publications', 'delete')
--     then raise exception 'READ-BACK FAILED: studio_writer''s rights on voice_publications (select only)'; end if;
--   if not has_function_privilege('studio_writer', 'studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb, boolean)', 'execute')
--     or has_function_privilege('anon', 'studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb, boolean)', 'execute')
--     or not has_function_privilege('studio_writer', 'studio.hide_takes_using_picture(uuid, bigint, text)', 'execute')
--     or has_function_privilege('anon', 'studio.hide_takes_using_picture(uuid, bigint, text)', 'execute')
--     or not has_function_privilege('studio_writer', 'studio.unhide_takes_using_picture(uuid, bigint, text)', 'execute')
--     or has_function_privilege('anon', 'studio.unhide_takes_using_picture(uuid, bigint, text)', 'execute')
--     then raise exception 'READ-BACK FAILED: who may enter or hide a take'; end if;
--   if to_regclass('studio.voice_publications_live_take') is null then raise exception 'READ-BACK FAILED: the index for one live take per speech is missing'; end if;
--   -- Lord Ephelion's sheet and another character's (made here if this database has none), a picture of him remixed once,
--   -- and a picture of the other character. Elements, versions and links are append-only: the rollback removes them.
--   select id into eph from studio.entities where work_id = 'snowmoon' and kind = 'character' and name = 'Lord Ephelion';
--   if eph is null then insert into studio.entities (work_id, kind, name) values ('snowmoon', 'character', 'Lord Ephelion') returning id into eph; end if;
--   insert into studio.entities (work_id, kind, name) values ('snowmoon', 'character', 'Read-back Other') returning id into other;
--   insert into studio.elements (work_id, element_type, entity_id, created_by_fid, status) values ('snowmoon', 'design', eph, 6786, 'published') returning id into sheet;
--   insert into studio.element_versions (element_id, version_no) values (sheet, 1) returning id into sheetv;
--   insert into studio.elements (work_id, element_type, entity_id, created_by_fid, status) values ('snowmoon', 'design', other, 6786, 'published') returning id into osheet;
--   insert into studio.element_versions (element_id, version_no) values (osheet, 1) returning id into osheetv;
--   insert into studio.elements (work_id, element_type, created_by_fid, status) values ('snowmoon', 'image', 6786, 'published') returning id into img;
--   insert into studio.element_versions (element_id, version_no) values (img, 1) returning id into imgv;
--   insert into studio.links (from_version_id, to_version_id, kind) values (imgv, sheetv, 'uses');
--   insert into studio.elements (work_id, element_type, created_by_fid, status) values ('snowmoon', 'image', fid, 'published') returning id into img2;
--   insert into studio.element_versions (element_id, version_no) values (img2, 1) returning id into img2v;
--   insert into studio.links (from_version_id, to_version_id, kind) values (img2v, imgv, 'remixed_from');
--   insert into studio.elements (work_id, element_type, created_by_fid, status) values ('snowmoon', 'image', fid, 'published') returning id into oimg;
--   insert into studio.element_versions (element_id, version_no) values (oimg, 1) returning id into oimgv;
--   insert into studio.links (from_version_id, to_version_id, kind) values (oimgv, osheetv, 'uses');
--   if not studio.picture_is_of(img2v, 'Lord Ephelion') or studio.picture_is_of(oimgv, 'Lord Ephelion') then raise exception 'READ-BACK FAILED: which pictures are of Lord Ephelion'; end if;
--   insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (fid, 'performance', 'doing-fine-v2', 'ephelion-warm-lecturer', drec) returning id into dr;
--   insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (fid, 'performance', 'doing-fine-v2', 'ephelion-warm-lecturer', drec) returning id into dr2;
--   insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (fid, 'performance', 'doing-fine-v2', 'ephelion-warm-lecturer', drec) returning id into dr3;
--   insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (fid, 'performance', 'natural-way-v2', 'ephelion-warm-lecturer', drec) returning id into dr4;
--   -- 1. Enter a take with the person's own picture of him (a remix of an approved one).
--   perform studio.publish_voice_take(pub, dr, fid, true, rec,
--     jsonb_build_object('source', 'own', 'version', img2v::text, 'key', 'takes/' || pub || '/picture-' || b64 || '.jpg', 'sha256', b64),
--     jsonb_build_array(jsonb_build_object('key', 'takes/' || pub || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || pub || '/picture-' || b64 || '.jpg', 'sha256', b64)), false);
--   select count(*) into n from studio.voice_publications where id = pub and kind = 'take' and speech_id = 'doing-fine-v2' and board_version is null and picture->>'source' = 'own';
--   if n <> 1 then raise exception 'READ-BACK FAILED: the take was not kept as one take of its speech with its picture'; end if;
--   if (select published_at from studio.voice_drafts where id = dr) is null then raise exception 'READ-BACK FAILED: the draft was not marked published'; end if;
--   -- 2. A second take of the same speech, without replacing, is refused.
--   begin
--     perform studio.publish_voice_take(pub2, dr2, fid, true, rec, jsonb_build_object('source', 'preset', 'scene', 'study', 'key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64),
--       jsonb_build_array(jsonb_build_object('key', 'takes/' || pub2 || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64)), false);
--     refused := false;
--   exception when others then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a second live take of the same speech was accepted'; end if;
--   -- 3. Pictures of another character are refused, as 'set' and as 'own'; and an 'own' picture someone else made.
--   begin
--     perform studio.publish_voice_take(pub2, dr2, fid, true, rec, jsonb_build_object('source', 'set', 'version', oimgv::text, 'key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64),
--       jsonb_build_array(jsonb_build_object('key', 'takes/' || pub2 || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64)), true);
--     refused := false;
--   exception when others then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: an approved picture of another character was accepted'; end if;
--   begin
--     perform studio.publish_voice_take(pub2, dr2, fid, true, rec, jsonb_build_object('source', 'own', 'version', oimgv::text, 'key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64),
--       jsonb_build_array(jsonb_build_object('key', 'takes/' || pub2 || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64)), true);
--     refused := false;
--   exception when others then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: the person''s own picture of another character was accepted'; end if;
--   begin
--     perform studio.publish_voice_take(pub2, dr2, fid, true, rec, jsonb_build_object('source', 'own', 'version', imgv::text, 'key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64),
--       jsonb_build_array(jsonb_build_object('key', 'takes/' || pub2 || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64)), true);
--     refused := false;
--   exception when others then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: someone else''s picture was accepted as the person''s own'; end if;
--   -- 4. Replacing, with a failing new entry (a file outside its folder): refused, and the old take is still live.
--   begin
--     perform studio.publish_voice_take(pub2, dr2, fid, true, rec, jsonb_build_object('source', 'preset', 'scene', 'study', 'key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64),
--       jsonb_build_array(jsonb_build_object('key', 'storyboards/' || pub2 || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64)), true);
--     refused := false;
--   exception when others then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a file outside takes/<id>/ was accepted'; end if;
--   if (select taken_down_at from studio.voice_publications where id = pub) is not null or (select published_at from studio.voice_drafts where id = dr) is null then
--     raise exception 'READ-BACK FAILED: a failed replacing entry took the old take down'; end if;
--   -- 5. Replacing works: the new take (an approved picture of him) is live, the old one taken down and its draft a draft again.
--   perform studio.publish_voice_take(pub2, dr2, fid, true, rec, jsonb_build_object('source', 'set', 'version', imgv::text, 'key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64),
--     jsonb_build_array(jsonb_build_object('key', 'takes/' || pub2 || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64)), true);
--   if (select taken_down_at from studio.voice_publications where id = pub) is null or (select published_at from studio.voice_drafts where id = dr) is not null
--     or (select taken_down_at from studio.voice_publications where id = pub2) is not null then raise exception 'READ-BACK FAILED: replacing did not swap the takes'; end if;
--   -- 6. A recipe holding a recording is refused.
--   begin
--     insert into studio.voice_publications (id, draft_id, fid, kind, speech_id, picture, recipe, files) values (pub3, dr3, fid, 'take', 'doing-fine-v3', jsonb_build_object('source', 'preset', 'scene', 'study', 'key', 'takes/' || pub3 || '/picture-' || b64 || '.jpg', 'sha256', b64), rec || '{"recording":"x"}',
--       jsonb_build_array(jsonb_build_object('key', 'takes/' || pub3 || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || pub3 || '/picture-' || b64 || '.jpg', 'sha256', b64)));
--     refused := false;
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a take whose recipe holds a recording was accepted'; end if;
--   -- 7. A take of another speech with the same approved picture, reported for itself.
--   perform studio.publish_voice_take(pub4, dr4, fid, true, rec2, jsonb_build_object('source', 'set', 'version', imgv::text, 'key', 'takes/' || pub4 || '/picture-' || b64 || '.jpg', 'sha256', b64),
--     jsonb_build_array(jsonb_build_object('key', 'takes/' || pub4 || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || pub4 || '/picture-' || b64 || '.jpg', 'sha256', b64)), false);
--   insert into studio.voice_publication_log (publication_id, step, by_fid, role, reason) values (pub4, 'reported', 2147483645, 'reader', 'spam');
--   -- 8. The approved picture is hidden: both takes that copied it are hidden with it, logged, and their files returned.
--   select count(*) into n from studio.hide_takes_using_picture(imgv, 6786, 'moderator');
--   if n <> 4 or (select hidden_at from studio.voice_publications where id = pub2) is null or (select hidden_at from studio.voice_publications where id = pub4) is null
--     or not exists (select 1 from studio.voice_publication_log where publication_id = pub2 and step = 'hidden' and note = 'its picture was hidden')
--     then raise exception 'READ-BACK FAILED: hiding a picture did not hide the takes that copied it'; end if;
--   -- 9. The picture is unhidden: the take hidden only because of it comes back, its files returned; the take with its
--   --    own open report stays hidden.
--   select count(*) into n from studio.unhide_takes_using_picture(imgv, 6786, 'moderator');
--   if n <> 2 or (select hidden_at from studio.voice_publications where id = pub2) is not null
--     or not exists (select 1 from studio.voice_publication_log where publication_id = pub2 and step = 'unhidden' and note = 'its picture was restored')
--     then raise exception 'READ-BACK FAILED: unhiding the picture did not bring back the take hidden only because of it'; end if;
--   if (select hidden_at from studio.voice_publications where id = pub4) is null then raise exception 'READ-BACK FAILED: unhiding the picture brought back a take with its own report'; end if;
--   -- 10. A take a moderator hid for itself stays hidden when the picture is hidden and unhidden again.
--   perform studio.hide_voice_publication(pub2, 6786, 'moderator', 'spam', null);
--   perform studio.hide_takes_using_picture(imgv, 6786, 'moderator');
--   perform studio.unhide_takes_using_picture(imgv, 6786, 'moderator');
--   if (select hidden_at from studio.voice_publications where id = pub2) is null then raise exception 'READ-BACK FAILED: unhiding the picture brought back a take a moderator hid for itself'; end if;
--   -- 11. The existing take-down (0046) works for a take.
--   perform studio.take_down_voice_publication(pub2, fid);
--   if (select taken_down_at from studio.voice_publications where id = pub2) is null then raise exception 'READ-BACK FAILED: a take could not be taken down'; end if;
--   -- 12. A storyboard with a take's fields is refused.
--   begin
--     insert into studio.voice_publications (draft_id, fid, board_version, speech_id, recipe, files) values (dr3, fid, 1, 'doing-fine-v2', '{"voice":{},"shots":[],"closing":{}}',
--       jsonb_build_array(jsonb_build_object('key', 'storyboards/x/a', 'sha256', a64), jsonb_build_object('key', 'storyboards/x/b', 'sha256', b64)));
--     refused := false;
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a storyboard with a speech was accepted'; end if;
--   delete from studio.voice_publication_log where publication_id in (pub, pub2, pub3, pub4);
--   delete from studio.voice_publications where id in (pub, pub2, pub3, pub4);
--   delete from studio.voice_drafts where id in (dr, dr2, dr3, dr4);
--   if exists (select 1 from studio.voice_publications where id in (pub, pub2, pub3, pub4)) then raise exception 'READ-BACK FAILED: the test rows were not deleted'; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;
-- rollback;

-- D. UNDO, only if the release is withdrawn. Refused once any take has been entered. Paste without the "-- ".
-- begin;
-- do $$ begin
--   if exists (select 1 from studio.voice_publications where kind = 'take') then raise exception 'UNDO REFUSED: takes have been entered'; end if;
-- end $$;
-- drop function if exists studio.unhide_takes_using_picture(uuid, bigint, text);
-- drop function if exists studio.hide_takes_using_picture(uuid, bigint, text);
-- drop function if exists studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb, boolean);
-- drop function if exists studio.picture_is_of(uuid, text);
-- drop index if exists studio.voice_publications_take_picture;
-- drop index if exists studio.voice_publications_live_take;
-- alter table studio.voice_publications drop constraint if exists voice_publications_kind_shape;
-- alter table studio.voice_publications drop constraint if exists voice_publications_files_check;
-- alter table studio.voice_publications add constraint voice_publications_files_check check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) between 2 and 64);
-- alter table studio.voice_publications drop constraint if exists voice_publications_recipe_check;
-- alter table studio.voice_publications add constraint voice_publications_recipe_check check (jsonb_typeof(recipe) = 'object' and recipe ? 'voice' and recipe ? 'shots' and recipe ? 'closing');
-- alter table studio.voice_publications drop constraint if exists voice_publications_board_version_check;
-- alter table studio.voice_publications add constraint voice_publications_board_version_check check (board_version between 1 and 10000);
-- alter table studio.voice_publications alter column board_version set not null;
-- alter table studio.voice_publications drop column if exists picture, drop column if exists speech_id, drop column if exists kind;
-- commit;
