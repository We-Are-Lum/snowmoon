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
--   recipe_assist          new, append-only: which inputs a model drafted, for
--                          recipes written before assist was filled in
--                          (recipes are append-only, so their assist column
--                          cannot be set afterwards). One row per recipe; public
--                          exactly when its recipe is. Owner decision, Oct 5.

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

-- ---------------------------------------------------------------------------
-- recipe_assist: the assist record for recipes that predate it
-- ---------------------------------------------------------------------------

create table studio.recipe_assist (
  recipe_id uuid primary key references studio.recipes(id),
  assist jsonb not null,
  source text not null,              -- the committed recipe file it was taken from
  recorded_by_fid bigint not null,
  created_at timestamptz not null default now()
);
comment on table studio.recipe_assist is
  'Which inputs a model drafted, for recipes written before recipes.assist was filled in. Append-only; read it together with recipes.assist (principle 3).';

create trigger recipe_assist_append_only
  before update or delete on studio.recipe_assist
  for each row execute function studio.reject_mutation();
create trigger recipe_assist_no_truncate
  before truncate on studio.recipe_assist
  for each statement execute function studio.reject_mutation();

alter table studio.recipe_assist enable row level security;
-- Public exactly when the recipe is: the subquery runs under the reader's own
-- recipe policy above.
create policy public_read on studio.recipe_assist for select using (
  exists (select 1 from studio.recipes r where r.id = recipe_id)
);
create policy writer_all on studio.recipe_assist for all to studio_writer using (true) with check (true);

commit;
