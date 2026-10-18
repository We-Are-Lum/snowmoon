-- 0014_version_2.sql — Fifteen Days, version 2: the GPT cut, and the owner's page pointing at it
-- (owner, 2026-10-18: "Chat gpt version is so much better. Let's go with that one and change the site to allow
-- closed models." The open-weight cut stays as version 1, at its own fixed link /@naaate/1/v/1).
-- DRAFT — not applied. The coordinating agent applies it in the SQL Editor after the owner's go,
-- once the files are on media.snowmoon.party (npm run publish:scene-video -- --version 2).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor.
-- Requires 0012 (adaptations, versions, pages). Dry run first: paste everything, but replace the
-- final `commit;` with `rollback;`. Safe to run again: version 2 is inserted only if it is not
-- there, and if a version 2 is there with any other content the script stops (nothing changes).
--
-- What it does:
-- 1. Adds version 2 of adaptation 1, by FID 6786 (@naaate). parent_version_id is null: it is the
--    owner's own second cut of the same adaptation, not a remix of version 1 (0012: the parent is
--    "the version it was forked from"; the scene page shows a parent as "remixed from version N").
--    Its pictures were redrawn from version 1's picture recipes, which its recipe folder says.
-- 2. Points the owner's page (person 6786, adaptation 1) at version 2, so /@naaate/1 plays it.
--    Version 1 is not touched (its recipe is fixed by the adaptation_versions_fixed trigger).
-- 3. Moves the versions' identity sequence past 2, so the next published version gets 3.
--
-- The recipe's URLs are named by the files' sha256 (scripts/publish-scene-video.ts); the same
-- row is the built-in fallback in src/lib/adaptation-pages.ts.

begin;

insert into studio.adaptation_versions (id, adaptation_id, parent_version_id, author_person, recipe)
values (2, 1, null, 6786, jsonb_build_object(
  'video_url', 'https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-58da1b6d582e.mp4',
  'poster_url', 'https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-poster-5d38a729cda4.jpg',
  'recipe_url', 'https://github.com/We-Are-Lum/snowmoon/tree/main/adaptations/fifteen-days',
  -- DRAFT wording for the owner to approve (2026-10-18).
  'ai_label', 'Pictures: AI-generated with GPT Image (OpenAI, a closed model), not by the author · Voices: @naaate''s performances, AI-converted.',
  'after_chapter', 14,
  'spoilers_through', 19,
  -- The closed model that drew the pictures (principle 3: reported). Inputs open, model closed.
  'closed_model', jsonb_build_object(
    'name', 'GPT Image 2.5 Sunburst',
    'maker', 'OpenAI',
    'endpoint', 'openai/gpt-image-2.5-sunburst',
    'host', 'Vercel AI Gateway',
    'date', '2026-10-18',
    'made', 'the pictures',
    'weights', 'not published',
    'openness', 'inputs open, model closed'
  )
))
on conflict (id) do nothing;

-- Stop if a version 2 is there with any other content (another run, or another version took id 2).
do $$
begin
  if not exists (
    select 1 from studio.adaptation_versions
    where id = 2 and adaptation_id = 1 and parent_version_id is null and author_person = 6786
      and recipe->>'video_url' = 'https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-58da1b6d582e.mp4'
      and recipe->>'poster_url' = 'https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-poster-5d38a729cda4.jpg'
  ) then
    raise exception 'version 2 is not the GPT cut: stopping, nothing changed';
  end if;
end $$;

insert into studio.adaptation_pages (person, adaptation_id, version_id) values (6786, 1, 2)
on conflict (person, adaptation_id) do update set version_id = excluded.version_id, updated_at = now()
where studio.adaptation_pages.version_id is distinct from excluded.version_id;

select setval(pg_get_serial_sequence('studio.adaptation_versions', 'id'),
              greatest(2, (select max(id) from studio.adaptation_versions)));

commit;

-- Check: version 1 unchanged (the open-weight cut), version 2 the GPT cut, the owner's page at 2.
select v.id, v.parent_version_id, v.author_person, v.recipe->>'video_url' as video, v.recipe->'closed_model'->>'name' as closed_model,
       (select p.version_id from studio.adaptation_pages p where p.person = 6786 and p.adaptation_id = 1) as owner_page
from studio.adaptation_versions v where v.adaptation_id = 1 and v.id in (1, 2) order by v.id;
