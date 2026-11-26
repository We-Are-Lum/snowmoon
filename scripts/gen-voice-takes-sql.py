# Writes NEXT_voice_takes.sql and NEXT_ephelion_scene.sql (A and B from one body, so the dry run is the migration word for word). Drafted by the coding agent (Claude, a closed model by Anthropic).
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

BODY = r"""alter table studio.voice_publications add column if not exists kind text not null default 'storyboard';
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
      and ((picture->>'source' in ('set', 'own')) = (picture ? 'version'))
      and ((picture->>'source' = 'preset') = (picture ? 'scene'))));
-- One live take per person per speech (plan v3: one entry per person per speech); a hidden take is still live.
create unique index if not exists voice_publications_live_take on studio.voice_publications (fid, speech_id) where kind = 'take' and taken_down_at is null;

create or replace function studio.publish_voice_take(p_id uuid, p_draft uuid, p_fid bigint, p_named boolean, p_recipe jsonb, p_picture jsonb, p_files jsonb) returns uuid
language plpgsql security definer set search_path = studio, pg_temp as $fn$
declare d record;
begin
  select kind, fid, speech_id, published_at into d from studio.voice_drafts where id = p_draft for update;
  if d.kind is distinct from 'performance' or d.fid is distinct from p_fid or d.published_at is not null then
    raise exception 'not a take this person can enter' using errcode = 'P0002';
  end if;
  if p_recipe->'speech'->>'id' is distinct from d.speech_id then raise exception 'the recipe is of another speech' using errcode = '22023'; end if;
  if exists (select 1 from studio.voice_publications where kind = 'take' and fid = p_fid and speech_id = d.speech_id and taken_down_at is null) then
    raise exception 'already entered for this speech' using errcode = 'P0002';
  end if;
  -- A ready picture: a published image on the site (an approved Ephelion picture), or one this person made (their own).
  if p_picture->>'source' in ('set', 'own') and not exists (
    select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
    where v.id::text = p_picture->>'version' and e.element_type = 'image' and e.status = 'published'
      and (p_picture->>'source' = 'set' or e.created_by_fid = p_fid)) then
    raise exception 'not a picture this take can use' using errcode = 'P0002';
  end if;
  if exists (select 1 from jsonb_array_elements(p_files) f where not (f->>'key' like 'takes/' || p_id::text || '/%'
        and f->>'key' ~ '^takes/[0-9a-f-]{36}/[a-z0-9-]{1,40}-[0-9a-f]{64}\.(mp3|png|jpg)$' and f->>'sha256' ~ '^[0-9a-f]{64}$')) then
    raise exception 'a file is not under this publication' using errcode = '22023';
  end if;
  if not exists (select 1 from jsonb_array_elements(p_files) f where f->>'key' like '%.mp3') then raise exception 'no audio' using errcode = '22023'; end if;
  if not exists (select 1 from jsonb_array_elements(p_files) f where f->>'key' = p_picture->>'key' and f->>'sha256' = p_picture->>'sha256') then
    raise exception 'the picture is not among the files' using errcode = '22023';
  end if;
  insert into studio.voice_publications (id, draft_id, fid, kind, board_version, speech_id, picture, named, recipe, files)
    values (p_id, p_draft, p_fid, 'take', null, d.speech_id, p_picture, p_named, p_recipe, p_files);
  update studio.voice_drafts set published_at = now() where id = p_draft;
  return p_id;
end $fn$;
revoke all on function studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb) to studio_writer;
"""

READBACK = r"""begin;
select p, has_table_privilege('studio_writer', 'studio.voice_publications', p) as writer, has_table_privilege('anon', 'studio.voice_publications', p) as anon
from unnest(array['select', 'insert', 'update', 'delete']) p order by 1;
do $$
declare
  dr uuid;
  dr2 uuid;
  el uuid;
  ver uuid;
  pub uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  pub2 uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  fid constant bigint := 2147483646;
  refused boolean;
  n int;
  a64 constant text := repeat('a', 64);
  b64 constant text := repeat('b', 64);
  rec jsonb := '{"voice":{"preset":"ephelion-warm-lecturer"},"speech":{"id":"doing-fine-v2"},"spoken":{"kind":"as-written"},"credits":["@readback"]}';
  files jsonb;
  pic jsonb;
  drec constant jsonb := '{"provider":"elevenlabs","model":"eleven_multilingual_sts_v2","takes":[{"takeSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}]}';
begin
  if not has_table_privilege('studio_writer', 'studio.voice_publications', 'select') or has_table_privilege('studio_writer', 'studio.voice_publications', 'insert')
    or has_table_privilege('studio_writer', 'studio.voice_publications', 'update') or has_table_privilege('studio_writer', 'studio.voice_publications', 'delete')
    then raise exception 'READ-BACK FAILED: studio_writer''s rights on voice_publications (select only)'; end if;
  if not has_function_privilege('studio_writer', 'studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb)', 'execute')
    or has_function_privilege('anon', 'studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb)', 'execute')
    then raise exception 'READ-BACK FAILED: who may enter a take'; end if;
  if to_regclass('studio.voice_publications_live_take') is null then raise exception 'READ-BACK FAILED: the index for one live take per speech is missing'; end if;
  -- A person's converted take of "Doing fine", and a picture they published earlier.
  insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (fid, 'performance', 'doing-fine-v2', 'ephelion-warm-lecturer', drec) returning id into dr;
  insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (fid, 'performance', 'doing-fine-v2', 'ephelion-warm-lecturer', drec) returning id into dr2;
  insert into studio.elements (work_id, element_type, created_by_fid, status) values ('snowmoon', 'image', fid, 'published') returning id into el;
  insert into studio.element_versions (element_id, version_no, body) values (el, 1, '{}') returning id into ver;
  pic := jsonb_build_object('source', 'own', 'version', ver::text, 'key', 'takes/' || pub || '/picture-' || b64 || '.jpg', 'sha256', b64);
  files := jsonb_build_array(jsonb_build_object('key', 'takes/' || pub || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', pic->>'key', 'sha256', b64));
  perform studio.publish_voice_take(pub, dr, fid, true, rec, pic, files);
  select count(*) into n from studio.voice_publications where id = pub and kind = 'take' and speech_id = 'doing-fine-v2' and board_version is null and picture->>'source' = 'own';
  if n <> 1 then raise exception 'READ-BACK FAILED: the take was not kept as one take of its speech with its picture'; end if;
  if (select published_at from studio.voice_drafts where id = dr) is null then raise exception 'READ-BACK FAILED: the draft was not marked published'; end if;
  -- A second take of the same speech is refused while the first is live.
  begin
    perform studio.publish_voice_take(pub2, dr2, fid, true, rec, jsonb_set(pic, '{key}', to_jsonb('takes/' || pub2 || '/picture-' || b64 || '.jpg')),
      jsonb_build_array(jsonb_build_object('key', 'takes/' || pub2 || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64)));
    refused := false;
  exception when others then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: a second live take of the same speech was accepted'; end if;
  -- Someone else's picture, as "own", is refused.
  update studio.elements set created_by_fid = 2147483645 where id = el;
  begin
    perform studio.publish_voice_take(pub2, dr2, fid, true, rec, jsonb_set(pic, '{key}', to_jsonb('takes/' || pub2 || '/picture-' || b64 || '.jpg')), jsonb_build_array(jsonb_build_object('key', 'takes/' || pub2 || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64)));
    refused := false;
  exception when others then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: someone else''s picture was accepted as the person''s own'; end if;
  -- A file outside the take's own folder is refused.
  begin
    perform studio.publish_voice_take(pub2, dr2, fid, true, rec, jsonb_build_object('source', 'preset', 'scene', 'study', 'key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64),
      jsonb_build_array(jsonb_build_object('key', 'storyboards/' || pub2 || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64)));
    refused := false;
  exception when others then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: a file outside takes/<id>/ was accepted'; end if;
  -- A recipe holding a recording is refused.
  begin
    insert into studio.voice_publications (id, draft_id, fid, kind, speech_id, picture, recipe, files) values (pub2, dr2, fid, 'take', 'doing-fine-v2', jsonb_build_object('source', 'preset', 'scene', 'study', 'key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64), rec || '{"recording":"x"}', files);
    refused := false;
  exception when check_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: a take whose recipe holds a recording was accepted'; end if;
  -- Taken down (the existing function), the person can enter that speech again, with a preset scene.
  perform studio.take_down_voice_publication(pub, fid);
  if (select published_at from studio.voice_drafts where id = dr) is not null then raise exception 'READ-BACK FAILED: taking down did not make the draft a draft again'; end if;
  perform studio.publish_voice_take(pub2, dr2, fid, true, rec, jsonb_build_object('source', 'preset', 'scene', 'study', 'key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64),
    jsonb_build_array(jsonb_build_object('key', 'takes/' || pub2 || '/speech-' || a64 || '.mp3', 'sha256', a64), jsonb_build_object('key', 'takes/' || pub2 || '/picture-' || b64 || '.jpg', 'sha256', b64)));
  -- #225's hide covers a take as it does a storyboard.
  perform studio.hide_voice_publication(pub2, 6786, 'moderator', 'spam', null);
  if (select hidden_at from studio.voice_publications where id = pub2) is null then raise exception 'READ-BACK FAILED: a take could not be hidden'; end if;
  -- Existing storyboards are untouched in shape: a storyboard row with a take's fields is refused.
  begin
    insert into studio.voice_publications (draft_id, fid, board_version, speech_id, recipe, files) values (dr, fid, 1, 'doing-fine-v2', '{"voice":{},"shots":[],"closing":{}}', files);
    refused := false;
  exception when check_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: a storyboard with a speech was accepted'; end if;
  delete from studio.voice_publication_log where publication_id in (pub, pub2);
  delete from studio.voice_publications where id in (pub, pub2);
  delete from studio.voice_drafts where id in (dr, dr2);
  -- The picture's element and version stay until the rollback below: element versions are append-only (0001).
  if exists (select 1 from studio.voice_publications where id in (pub, pub2)) then raise exception 'READ-BACK FAILED: the test rows were not deleted'; end if;
  raise notice 'READ-BACK PASSED';
end $$;
rollback;"""

UNDO = r"""begin;
do $$ begin
  if exists (select 1 from studio.voice_publications where kind = 'take') then raise exception 'UNDO REFUSED: takes have been entered'; end if;
end $$;
drop function if exists studio.publish_voice_take(uuid, uuid, bigint, boolean, jsonb, jsonb, jsonb);
drop index if exists studio.voice_publications_live_take;
alter table studio.voice_publications drop constraint if exists voice_publications_kind_shape;
alter table studio.voice_publications drop constraint if exists voice_publications_files_check;
alter table studio.voice_publications add constraint voice_publications_files_check check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) between 2 and 64);
alter table studio.voice_publications drop constraint if exists voice_publications_recipe_check;
alter table studio.voice_publications add constraint voice_publications_recipe_check check (jsonb_typeof(recipe) = 'object' and recipe ? 'voice' and recipe ? 'shots' and recipe ? 'closing');
alter table studio.voice_publications drop constraint if exists voice_publications_board_version_check;
alter table studio.voice_publications add constraint voice_publications_board_version_check check (board_version between 1 and 10000);
alter table studio.voice_publications alter column board_version set not null;
alter table studio.voice_publications drop column if exists picture, drop column if exists speech_id, drop column if exists kind;
commit;"""

HEAD = """-- NEXT_voice_takes.sql: entering a take in the Ephelion challenge (Nate, 2026-11-26: "people should enter and share takes
-- in this round"; plan v3, PR 6), with its picture (Nate, 2026-11-26: "entering a take includes its picture"). Branch
-- ephelion-takes. NOT APPLIED. It takes the next free number at merge, checked against origin/main and production.
-- Drafted by the coding agent (Claude, a closed model by Anthropic). Tested on in-memory PGlite against the branch's
-- migrations 0001-0052 (npm run test:voice-takes-sql). Requires 0046 (voice publications), 0049 and 0052 (#225, moderation).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: rights read with has_table_privilege and has_function_privilege, then realistic
-- rows entered, refused, taken down, entered again, hidden and deleted (the test picture's element version, append-only,
-- goes with the rollback), all inside a transaction that ends in `rollback;`;
-- it ends "READ-BACK PASSED"), and D. the undo, refused once any take has been entered. Safe to run twice.
--
-- What it is for. A take is a second kind of publication in studio.voice_publications (0046), so the existing take-down
-- (take_down_voice_publication) and #225's report, queue and reversible hide (0052) cover takes as they cover storyboards.
-- 1. kind: 'storyboard' (every existing row, by default) or 'take'. A take has no storyboard version (board_version is
--    null), its speech (speech_id) and its picture (picture); a storyboard has neither. Storyboards' recipe and file rules
--    are unchanged.
-- 2. A take's recipe holds the voice, the speech and the words as spoken (as transcribed, with any corrections), and
--    never a recording (a recipe with "recording" is refused). Its files (2 to 8) are only under takes/<publication id>/:
--    the converted speech (mp3) and the picture (png or jpg), each named by its sha256, as storyboards' are.
-- 3. picture: where the take's picture came from, and its file: source 'set' (an approved Ephelion picture: a published
--    image on the site, by its version id), 'own' (a published picture this person made, by its version id), 'preset'
--    (one of the three ready-made scenes, by its scene id) or 'own-scene' (the one they described); its key under
--    takes/<id>/ and its sha256. Its labels and credit are in the recipe. A picture used by a take is copied into the
--    take's folder, so hiding or taking down the take never touches the original.
-- 4. studio.publish_voice_take: the person's own converted take (a performance draft, theirs, not yet public), for its
--    own speech; refused if they already have a live take of that speech (one live take per person per speech: the site
--    takes the old one down first, after asking); a 'set' or 'own' picture must be a published image, and 'own' theirs;
--    every file under the take's own folder, an mp3 among them, and the picture among them. The draft is then marked
--    published, as a storyboard's performance is; taking the take down makes it a draft again (0046).
-- 5. voice_publications_live_take: one live take per person per speech (a hidden take is still live).
-- studio_writer's rights are unchanged (select on voice_publications; execute on the functions). Nothing for anon.
--
-- Safe with today's live code: every existing row is a storyboard; the new columns are empty on them; publishing is off.

"""

def migration(end):
    return 'begin;\n' + BODY + end + '\n'

sql = HEAD + '-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.\n' + migration('rollback;') + '\n-- B. MIGRATION.\n' + migration('commit;') + """
-- C. READ-BACK (after B), as postgres. Paste the lines below without their "-- ". It sets no role (postgres can't switch
--    roles in the SQL Editor): studio_writer's rights are read with has_table_privilege and has_function_privilege, and the
--    rows are written as postgres, exactly as the site writes them. Everything is inside one transaction that ends in
--    rollback. FID 2147483646 belongs to no one. Ends "READ-BACK PASSED"; each check raises "READ-BACK FAILED: …".
--
""" + '\n'.join('-- ' + l if l else '--' for l in READBACK.split('\n')) + """

-- D. UNDO, only if the release is withdrawn (after the code that reads these is gone). Refused once any take has been
--    entered: those are the challenge's record. Paste without the "-- ".
""" + '\n'.join('-- ' + l for l in UNDO.split('\n')) + '\n'
open('supabase/migrations/NEXT_voice_takes.sql', 'w').write(sql)

# The free picture of one's own scene (one per account), its own small file: it can ship apart from entering.
SBODY = r"""create table if not exists studio.ephelion_scene_pictures (
  person bigint primary key check (person <> 0),
  made_at timestamptz not null default now(),
  picture_sha256 text not null check (picture_sha256 ~ '^[0-9a-f]{64}$')
);
alter table studio.ephelion_scene_pictures enable row level security;
drop policy if exists writer_read on studio.ephelion_scene_pictures;
create policy writer_read on studio.ephelion_scene_pictures for select to studio_writer using (true);
drop policy if exists writer_insert on studio.ephelion_scene_pictures;
create policy writer_insert on studio.ephelion_scene_pictures for insert to studio_writer with check (true);
revoke all on studio.ephelion_scene_pictures from public, anon, authenticated;
revoke all on studio.ephelion_scene_pictures from studio_writer;
grant select, insert on studio.ephelion_scene_pictures to studio_writer;
"""
SREAD = r"""begin;
select p, has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', p) as writer, has_table_privilege('anon', 'studio.ephelion_scene_pictures', p) as anon
from unnest(array['select', 'insert', 'update', 'delete']) p order by 1;
do $$
declare refused boolean;
begin
  if not (has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', 'select') and has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', 'insert'))
    or has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', 'update') or has_table_privilege('studio_writer', 'studio.ephelion_scene_pictures', 'delete')
    or has_table_privilege('anon', 'studio.ephelion_scene_pictures', 'select')
    then raise exception 'READ-BACK FAILED: rights on ephelion_scene_pictures (studio_writer select and insert only, anon nothing)'; end if;
  -- A person's free picture came back: kept once. A second is refused.
  insert into studio.ephelion_scene_pictures (person, picture_sha256) values (2147483646, repeat('c', 64));
  begin insert into studio.ephelion_scene_pictures (person, picture_sha256) values (2147483646, repeat('d', 64)); refused := false; exception when unique_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: a second free picture for one account was accepted'; end if;
  begin insert into studio.ephelion_scene_pictures (person, picture_sha256) values (0, repeat('c', 64)); refused := false; exception when check_violation then refused := true; end;
  if not refused then raise exception 'READ-BACK FAILED: person 0 was accepted'; end if;
  delete from studio.ephelion_scene_pictures where person = 2147483646;
  if exists (select 1 from studio.ephelion_scene_pictures where person = 2147483646) then raise exception 'READ-BACK FAILED: the test row was not deleted'; end if;
  raise notice 'READ-BACK PASSED';
end $$;
rollback;"""
SUNDO = r"""begin;
do $$ begin
  if exists (select 1 from studio.ephelion_scene_pictures) then raise exception 'UNDO REFUSED: free pictures have been made'; end if;
end $$;
drop table if exists studio.ephelion_scene_pictures;
commit;"""
SHEAD = """-- NEXT_ephelion_scene.sql: the free picture of one's own scene in the Ephelion challenge, one per account (Nate,
-- 2026-11-26: "One free picture per account"; "A refused or failed picture doesn't use up the free one"). Branch
-- ephelion-takes. NOT APPLIED. It takes the next free number at merge, checked against origin/main and production.
-- Drafted by the coding agent (Claude, a closed model by Anthropic). Tested on in-memory PGlite against the branch's
-- migrations (npm run test:voice-takes-sql). Requires 0001 only.
--
-- MUST RUN AS postgres, in the Supabase SQL Editor. A. the dry run (ending in `rollback;`), B. the migration (ending in
-- `commit;`), C. the read-back (rights by has_table_privilege; a realistic row kept, a second refused, then deleted, all in
-- a transaction that ends in `rollback;`; it ends "READ-BACK PASSED"), D. the undo, refused once any free picture exists.
--
-- What it is for. studio.ephelion_scene_pictures: one row per account (a FID, or minus a wallet account's number, or a
-- Lens or Bluesky account's person number: never 0) that has made its free picture, written only once the picture has
-- come back, so a refused or failed one never counts; the primary key makes a second impossible. It keeps only when and
-- the picture's sha256, never the description. studio_writer may select and insert; nothing else. Not a pool in
-- studio.image_asks: those rows are written before the picture is made and given back per day (0041), which can't say
-- "one, ever, only if it came back". The cost still counts in studio.image_costs as every picture does.
--
-- Safe with today's live code: nothing reads or writes it yet.

"""
s2 = SHEAD + '-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.\nbegin;\n' + SBODY + 'rollback;\n\n-- B. MIGRATION.\nbegin;\n' + SBODY + 'commit;\n' + """
-- C. READ-BACK (after B), as postgres. Paste the lines below without their "-- ". FID 2147483646 belongs to no one.
--
""" + '\n'.join('-- ' + l if l else '--' for l in SREAD.split('\n')) + """

-- D. UNDO, only if the release is withdrawn. Refused once any free picture has been made. Paste without the "-- ".
""" + '\n'.join('-- ' + l for l in SUNDO.split('\n')) + '\n'
open('supabase/migrations/NEXT_ephelion_scene.sql', 'w').write(s2)
print('ok')
