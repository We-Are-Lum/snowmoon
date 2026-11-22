-- NEXT_challenge_lettering.sql: words a closed model draws in a picture (lettering, part C; owner's decisions of
-- 2026-11-18 to 2026-11-22; drafted on branch closed-lettering, wired in on branch lettering). NOT APPLIED. Unnumbered
-- until merge: it takes the next free number then, checked against origin/main and production (main holds 0001-0046 on
-- 2026-11-22, so 0047 if nothing else lands first). Drafted by the coding agent (Claude, a closed model by Anthropic).
-- DRAFT: the owner applies it. Re-checked against main's 0001-0046 on 2026-11-22: nothing since 0001_core redefines
-- studio.check_take_item_display, and nothing since 0008_images changes image_costs' kind or verdict checks (0011 added
-- `funded`, 0042 added funded 'admin'; 0045 counts refusals in its own table). Tested on in-memory PGlite (every
-- migration, then A, B twice, C, D, B again; scratchpad sqltest pattern).
-- Requires 0001_core (studio.check_take_item_display, studio.take_items), 0008_images and 0011_wallet_prepaid
-- (studio.image_costs and its key), and 0042_chapter_picture_versions (funded 'admin': an admin's chapter picture's
-- read-back is counted in the admins' own cap).
-- Chapter pictures need no schema change: a lettered version's record is in its recipe (studio.chapter_picture_versions
-- .recipe, jsonb), and a mismatch saves no version.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Four parts, in order:
-- A. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), B. the migration (ending in
-- `commit;`), C. the read-back (after B: a read-only select, then a block that inserts realistic rows and deletes them,
-- all inside a transaction that ends in `rollback;`; it ends "READ-BACK PASSED"), and D. the undo, only if the release
-- is withdrawn. Safe to run twice.
--
-- What it is for.
-- 1. A picture whose version has lettering may stand in for the book's text in a reading (take_items display
--    'replace', 0001_core's check_take_item_display): today any image with a non-empty body.lettering qualifies. A
--    challenge picture whose words a closed model drew would record them in body.lettering with drawn_by 'model', and
--    must never replace the book's text. After this, an image qualifies only with at least one lettering item that is
--    not drawn_by 'model' (the project's code-drawn lettering, which has no drawn_by in the database). On 2026-11-18
--    production had 50 image versions, none with lettering, and no take_items at all (read-only check by the coding
--    agent then; not re-read on 2026-11-22, no production access in this session), so nothing that existed changes.
-- 2. studio.image_costs gets the kind 'readback' (the vision model that reads a lettered picture's words back) and the
--    verdicts 'mismatch' (the words read don't match the record) and 'unread' (the read-back gave no usable answer),
--    so its daily totals stay one row per day, kind, model, provider and verdict, with no person, as for every other
--    call; for an entrant's picture they count against the challenge's closed cap, for an admin's chapter picture against
--    the admins' daily cap (funded 'admin'). Until this is applied the site makes no lettered picture (it checks for the
--    kind 'readback' first: src/lib/images/readback.ts letteringReady), so it never writes a row these checks refuse.
-- Nothing public changes: image_costs stays unreadable to anon and authenticated; the function keeps its owner and
-- search_path.

-- A. DRY RUN: the migration below, ending in rollback; nothing is kept. Expect no error.
begin;
create or replace function studio.check_take_item_display() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.display = 'replace' and not exists (
    select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
    where v.id = new.version_id
      and (
        (e.element_type = 'image'
          and exists (
            select 1 from jsonb_array_elements(case when jsonb_typeof(v.body->'lettering') = 'array' then v.body->'lettering' else '[]'::jsonb end) x
            where coalesce(x->>'drawn_by', '') <> 'model'))
        or (e.element_type = 'text'
          and jsonb_typeof(v.body->'text') = 'string'
          and btrim(v.body->>'text') <> '')
        or e.element_type = 'render'
      )
  ) then
    raise exception 'take_items: display replace needs an image with lettering not drawn by a model, a text with text, or a render (version %)', new.version_id;
  end if;
  return new;
end;
$$;
alter table studio.image_costs drop constraint if exists image_costs_kind_check;
alter table studio.image_costs add constraint image_costs_kind_check check (kind in ('image', 'guard', 'reserved', 'readback'));
alter table studio.image_costs drop constraint if exists image_costs_verdict_check;
alter table studio.image_costs add constraint image_costs_verdict_check check (verdict in ('', 'ok', 'blocked', 'nsfw', 'mismatch', 'unread'));
rollback;

-- B. THE MIGRATION.
begin;
create or replace function studio.check_take_item_display() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.display = 'replace' and not exists (
    select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
    where v.id = new.version_id
      and (
        (e.element_type = 'image'
          and exists (
            select 1 from jsonb_array_elements(case when jsonb_typeof(v.body->'lettering') = 'array' then v.body->'lettering' else '[]'::jsonb end) x
            where coalesce(x->>'drawn_by', '') <> 'model'))
        or (e.element_type = 'text'
          and jsonb_typeof(v.body->'text') = 'string'
          and btrim(v.body->>'text') <> '')
        or e.element_type = 'render'
      )
  ) then
    raise exception 'take_items: display replace needs an image with lettering not drawn by a model, a text with text, or a render (version %)', new.version_id;
  end if;
  return new;
end;
$$;
alter table studio.image_costs drop constraint if exists image_costs_kind_check;
alter table studio.image_costs add constraint image_costs_kind_check check (kind in ('image', 'guard', 'reserved', 'readback'));
alter table studio.image_costs drop constraint if exists image_costs_verdict_check;
alter table studio.image_costs add constraint image_costs_verdict_check check (verdict in ('', 'ok', 'blocked', 'nsfw', 'mismatch', 'unread'));
commit;

-- C. READ-BACK (after B), as postgres. Two parts. Paste the lines below without their "-- ".
-- (a) one read-only select: every row's ok must be true (3 rows).
-- select n, what, ok from (values
--   (1, 'image_costs takes the kind readback',
--     exists (select 1 from pg_constraint where conrelid = 'studio.image_costs'::regclass and conname = 'image_costs_kind_check' and pg_get_constraintdef(oid) like '%readback%')),
--   (2, 'image_costs takes the verdicts mismatch and unread',
--     exists (select 1 from pg_constraint where conrelid = 'studio.image_costs'::regclass and conname = 'image_costs_verdict_check' and pg_get_constraintdef(oid) like '%mismatch%' and pg_get_constraintdef(oid) like '%unread%')),
--   (3, 'the take_items trigger uses the new rule, still before insert or update',
--     pg_get_functiondef('studio.check_take_item_display'::regproc) like '%drawn_by%'
--     and exists (select 1 from pg_trigger where tgrelid = 'studio.take_items'::regclass and tgname = 'take_items_display' and not tgisinternal))
-- ) as t(n, what, ok) order by n;
--
-- (b) one transaction that ends in ROLLBACK (studio.element_versions and studio.recipes are append-only, so a test
--     version can't be deleted; the rollback removes it, and the block deletes everything that can be deleted first).
--     It inserts, as the site writes them: a read-back cost row (today, free, kind readback, GPT-6.1 Sol on openai,
--     verdict mismatch, 1 call, $0.0041), reads it back, adds a second call to it, deletes it; an admin's read-back
--     (funded admin, Gemini 3.8 Flash on vertex, ok) and an unread one, then deletes them; then a challenge picture
--     whose words a closed model drew (body.lettering with drawn_by 'model', the book's words "Embrace the competition"
--     from c13-b64) and a picture with the project's code-drawn lettering, each with its recipe, in a draft take; checks
--     the model-drawn one is refused as a replacement and the code-drawn one is accepted; and deletes the take's rows.
--     The person number 2147483646 fits the columns and belongs to no account. Ends "READ-BACK PASSED"; each check
--     raises "READ-BACK FAILED: …" on failure. It sets no role (postgres can't switch roles in the SQL Editor).
-- begin;
-- do $$
-- declare
--   d date := (now() at time zone 'utc')::date;
--   n int;
--   c numeric;
--   r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid();
--   e1 uuid := gen_random_uuid(); e2 uuid := gen_random_uuid();
--   v1 uuid := gen_random_uuid(); v2 uuid := gen_random_uuid();
--   t uuid := gen_random_uuid();
--   refused boolean := false;
-- begin
--   insert into studio.image_costs (day, funded, kind, model, provider, verdict, calls, cost_usd)
--     values (d, 'free', 'readback', 'openai/gpt-6.1-sol', 'openai', 'mismatch', 1, 0.0041)
--     on conflict (day, funded, kind, model, provider, verdict) do update set calls = studio.image_costs.calls + 1, cost_usd = studio.image_costs.cost_usd + excluded.cost_usd;
--   insert into studio.image_costs (day, funded, kind, model, provider, verdict, calls, cost_usd)
--     values (d, 'free', 'readback', 'openai/gpt-6.1-sol', 'openai', 'mismatch', 1, 0.0039)
--     on conflict (day, funded, kind, model, provider, verdict) do update set calls = studio.image_costs.calls + 1, cost_usd = studio.image_costs.cost_usd + excluded.cost_usd;
--   select calls, cost_usd into n, c from studio.image_costs where day = d and funded = 'free' and kind = 'readback' and model = 'openai/gpt-6.1-sol' and provider = 'openai' and verdict = 'mismatch';
--   if n is null or n < 2 or c < 0.008 then raise exception 'READ-BACK FAILED: the read-back row reads % calls, $%', n, c; end if;
--   delete from studio.image_costs where day = d and funded = 'free' and kind = 'readback' and model = 'openai/gpt-6.1-sol' and provider = 'openai' and verdict = 'mismatch';
--   if exists (select 1 from studio.image_costs where day = d and kind = 'readback' and model = 'openai/gpt-6.1-sol' and verdict = 'mismatch') then raise exception 'READ-BACK FAILED: the read-back row was not deleted'; end if;
--   insert into studio.image_costs (day, funded, kind, model, provider, verdict, calls, cost_usd)
--     values (d, 'admin', 'readback', 'google/gemini-3.8-flash', 'vertex', 'ok', 1, 0.0015);
--   insert into studio.image_costs (day, funded, kind, model, provider, verdict, calls, cost_usd)
--     values (d, 'free', 'readback', 'openai/gpt-6.1-sol', 'openai', 'unread', 1, 0);
--   select count(*)::int into n from studio.image_costs where day = d and kind = 'readback' and ((funded = 'admin' and verdict = 'ok' and model = 'google/gemini-3.8-flash') or (funded = 'free' and verdict = 'unread'));
--   if n <> 2 then raise exception 'READ-BACK FAILED: % of 2 read-back rows (an admin''s, an unread one) were kept', n; end if;
--   delete from studio.image_costs where day = d and kind = 'readback' and ((funded = 'admin' and verdict = 'ok' and model = 'google/gemini-3.8-flash') or (funded = 'free' and verdict = 'unread'));
--
--   insert into studio.recipes (id, source, provider, model, model_version, prompt, params, cost_usd, created_by_fid) values
--     (r1, 'in_app', 'Vercel AI Gateway', 'gpt-image-2.5-sunburst', 'openai/gpt-image-2.5-sunburst', 'a banner above him reading “Embrace the competition”',
--       '{"lettering": {"phrases": [{"text": "Embrace the competition", "source": "book", "block": "c13-b64", "also_in": 0}], "readback": {"model": "openai/gpt-6.1-sol", "verdict": "match", "rule": "v1"}}}'::jsonb, 0.0472, 2147483646),
--     (r2, 'human_authored', null, null, null, null, '{}'::jsonb, null, 2147483646);
--   insert into studio.elements (id, work_id, element_type, created_by_fid, status) values (e1, 'snowmoon', 'image', 2147483646, 'draft'), (e2, 'snowmoon', 'image', 2147483646, 'draft');
--   insert into studio.element_versions (id, element_id, version_no, body, asset_url, asset_sha256, recipe_id) values
--     (v1, e1, 1, '{"lettering": [{"kind": "sign", "text": "Embrace the competition", "lang": "en", "gloss": null, "speaker_entity_id": null, "drawn_by": "model", "source": {"kind": "book", "block": "c13-b64"}}]}'::jsonb, 'https://pictures.snowmoon.party/images/readers/readback-test.jpg', repeat('a', 64), r1),
--     (v2, e2, 1, '{"lettering": [{"kind": "sign", "text": "DOG", "lang": "en", "gloss": null, "speaker_entity_id": null, "x": 0.4, "y": 0.4, "w": 0.2}]}'::jsonb, 'https://pictures.snowmoon.party/images/readers/readback-test-2.jpg', repeat('b', 64), r2);
--   insert into studio.takes (id, work_id, chapter, title, created_by_fid, status) values (t, 'snowmoon', 13, 'read-back test', 2147483646, 'draft');
--   begin
--     insert into studio.take_items (take_id, version_id, pos, display) values (t, v1, 0, 'replace');
--   exception when others then
--     refused := sqlerrm like 'take_items: display replace needs%';
--   end;
--   if not refused then raise exception 'READ-BACK FAILED: a picture whose words a model drew was accepted to replace the book''s text'; end if;
--   insert into studio.take_items (take_id, version_id, pos, display) values (t, v2, 1, 'replace');
--   insert into studio.take_items (take_id, version_id, pos, display) values (t, v1, 2, 'beside');
--   select count(*)::int into n from studio.take_items where take_id = t;
--   if n <> 2 then raise exception 'READ-BACK FAILED: % take items, not 2 (code-drawn replace, model-drawn beside)', n; end if;
--   delete from studio.take_items where take_id = t;
--   delete from studio.takes where id = t;
--   if exists (select 1 from studio.take_items where take_id = t) or exists (select 1 from studio.takes where id = t) then raise exception 'READ-BACK FAILED: the test take was not deleted'; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;
-- rollback;

-- D. UNDO (only if this release is withdrawn). Paste without the "-- ". Read-back cost rows must go first (they would
-- break the old checks); the site stops writing them once the lettering release is withdrawn.
-- begin;
-- delete from studio.image_costs where kind = 'readback' or verdict in ('mismatch', 'unread');
-- alter table studio.image_costs drop constraint if exists image_costs_kind_check;
-- alter table studio.image_costs add constraint image_costs_kind_check check (kind in ('image', 'guard', 'reserved'));
-- alter table studio.image_costs drop constraint if exists image_costs_verdict_check;
-- alter table studio.image_costs add constraint image_costs_verdict_check check (verdict in ('', 'ok', 'blocked', 'nsfw'));
-- create or replace function studio.check_take_item_display() returns trigger
-- language plpgsql
-- set search_path = ''
-- as $$
-- begin
--   if new.display = 'replace' and not exists (
--     select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
--     where v.id = new.version_id
--       and (
--         (e.element_type = 'image'
--           and jsonb_typeof(v.body->'lettering') = 'array'
--           and jsonb_array_length(v.body->'lettering') > 0)
--         or (e.element_type = 'text'
--           and jsonb_typeof(v.body->'text') = 'string'
--           and btrim(v.body->>'text') <> '')
--         or e.element_type = 'render'
--       )
--   ) then
--     raise exception 'take_items: display replace needs an image with lettering, a text with text, or a render (version %)', new.version_id;
--   end if;
--   return new;
-- end;
-- $$;
-- commit;
