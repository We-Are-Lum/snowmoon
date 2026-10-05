-- 0005_public_prompts_and_consent.sql — only prompts for published work are
-- public (principle 1), and consent to publish one's own words can be
-- recorded (owner decisions, Oct 5, 2026).
--
-- MUST RUN AS postgres (the owner of the `studio` schema), in the Supabase SQL
-- Editor. studio_writer cannot change policies or constraints.
--
-- Requires 0001 to 0004. Dry run first: paste everything, but replace the
-- final `commit;` with `rollback;`.
--
-- What changes:
--   recipes                public only when they made a published element
--                          version or a segment of a narration that is not
--                          hidden. Recipes of drafts, hidden work and abandoned
--                          attempts (no output) become private. This also
--                          closes a leak in 0001's policy: it checked for
--                          versions as the public role, which cannot see draft
--                          versions, so a draft's prompt read as public.
--   contributor_consents   kind 'own_words' added: agreement, before a first
--                          contribution of one's own words, to the wording in
--                          config/consent.json (recorded by its sha256). The
--                          table stays private (0002).

begin;

-- ---------------------------------------------------------------------------
-- Recipes: only prompts for published work are public
-- ---------------------------------------------------------------------------

-- Replaces 0001's policy, which also made public every recipe with no element
-- version (narration, and any attempt that never became anything).
drop policy public_read on studio.recipes;
create policy public_read on studio.recipes for select using (
  exists (select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
          where v.recipe_id = studio.recipes.id and e.status = 'published')
  or exists (select 1 from studio.narration_segments s join studio.narrations n on n.id = s.narration_id
             where s.recipe_id = studio.recipes.id and not n.hidden)
);

-- ---------------------------------------------------------------------------
-- Consent to publish one's own words (prompts, lines)
-- ---------------------------------------------------------------------------

alter table studio.contributor_consents drop constraint contributor_consents_kind_check;
alter table studio.contributor_consents add constraint contributor_consents_kind_check
  check (kind in ('handmade_upload','voice_recording','own_words'));
comment on column studio.contributor_consents.kind is
  'own_words: agreed, before a first contribution of their own words, that they are public, permanent, GPL-3.0 and shown with their Farcaster name (config/consent.json)';

commit;
