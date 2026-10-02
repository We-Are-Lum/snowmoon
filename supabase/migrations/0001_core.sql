-- 0001_core.sql — core schema (Build Brief v4, sections 4b and 5).
--
-- Target: a shared studio database. Every object lives in the `studio` schema;
-- nothing is created in `public`.
--
-- Applied by hand in the SQL Editor after a dry run. Do not run this from a
-- terminal with a privileged key.
--
-- Dry run: paste everything, but replace the final `commit;` with `rollback;`.
--
-- After applying (by hand, never committed):
--   alter role studio_writer with login password '<generated>';
-- and expose `studio` to the Data API (see README, "Database").

begin;

-- Fails if a `studio` schema already exists, rather than mixing into it.
create schema studio;

-- Server-side writer: rights in `studio` only. Login is enabled by hand (see above).
create role studio_writer nologin noinherit;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table studio.works (
  id text primary key,
  title text not null,
  license text not null,
  source_url text not null,
  created_at timestamptz not null default now()
);

create table studio.text_blocks (
  id bigint generated always as identity primary key,
  work_id text not null references studio.works(id),
  chapter int not null,
  idx int not null,
  kind text not null check (kind in ('heading','dateline','paragraph','quote','screen','figure','break')),
  content text not null,
  content_hash text not null,
  read_aloud text,
  -- screen and figure only: { setting, setting_evidence, device, device_evidence, device_provisional, frame, fields }
  data jsonb,
  unique (work_id, chapter, idx),
  check (data is null or kind in ('screen','figure'))
);

create table studio.entities (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references studio.works(id),
  kind text not null check (kind in ('character','location','prop','style')),
  name text not null,
  -- 'veridia', 'dzego', 'united-cities', … (same slugs as text_blocks.data.setting); null if none
  setting text check (setting ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  first_chapter int,
  unique (work_id, kind, name)
);

-- After entities, so a section can point at its location.
create table studio.sections (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references studio.works(id),
  chapter int not null,
  idx int not null,
  start_idx int not null,
  end_idx int not null,
  title text,
  location_entity_id uuid references studio.entities(id),
  time_of_day text,
  season text,
  unique (work_id, chapter, idx),
  check (end_idx >= start_idx)
);

create table studio.entity_mentions (
  id bigint generated always as identity primary key,
  entity_id uuid not null references studio.entities(id),
  chapter int not null,
  idx int not null,
  fact text not null,
  quote text not null
);

create table studio.elements (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references studio.works(id),
  -- render: a code-rendered set piece (screen, board, map); body { template, template_commit, state }
  element_type text not null check (element_type in ('design','text','image','clip','render')),
  entity_id uuid references studio.entities(id),
  created_by_fid bigint not null,
  status text not null default 'published' check (status in ('draft','published','hidden')),
  created_at timestamptz not null default now(),
  check ((element_type = 'design') = (entity_id is not null))
);

create table studio.recipes (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('in_app','human_authored')),
  provider text,
  model text,
  model_version text,
  prompt text,
  params jsonb not null default '{}'::jsonb,
  seed bigint,
  assist jsonb,
  cost_usd numeric(10,4),
  created_by_fid bigint not null,
  created_at timestamptz not null default now()
);

create table studio.element_versions (
  id uuid primary key default gen_random_uuid(),
  element_id uuid not null references studio.elements(id),
  version_no int not null,
  body jsonb not null default '{}'::jsonb,
  asset_url text,
  asset_sha256 text,
  recipe_id uuid references studio.recipes(id),
  created_at timestamptz not null default now(),
  unique (element_id, version_no)
);

create table studio.links (
  id uuid primary key default gen_random_uuid(),
  from_version_id uuid not null references studio.element_versions(id),
  to_version_id uuid not null references studio.element_versions(id),
  kind text not null check (kind in ('remixed_from','uses')),
  unique (from_version_id, to_version_id, kind),
  check (from_version_id <> to_version_id)
);

-- Where a version sits in the book. Anchored per version, so a later version
-- of the same element can cover a different span. Append-only, like versions.
create table studio.anchors (
  version_id uuid primary key references studio.element_versions(id),
  work_id text not null references studio.works(id),
  chapter int not null,
  start_idx int not null,
  end_idx int not null,
  check (end_idx >= start_idx)
);

create table studio.ratings (
  version_id uuid not null references studio.element_versions(id),
  fid bigint not null,
  value smallint not null check (value between -5 and 5),
  created_at timestamptz not null default now(),
  primary key (version_id, fid)
);

create table studio.takes (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references studio.works(id),
  chapter int not null,
  title text not null,
  created_by_fid bigint not null,
  parent_take_id uuid references studio.takes(id),
  status text not null default 'published' check (status in ('draft','published','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table studio.take_items (
  take_id uuid not null references studio.takes(id),
  version_id uuid not null references studio.element_versions(id),
  pos int not null default 0,
  -- beside: shown with the book text. replace: hides the book text; needs lettering.
  display text not null default 'beside' check (display in ('beside','replace')),
  primary key (take_id, version_id)
);

create table studio.take_likes (
  take_id uuid not null references studio.takes(id),
  fid bigint not null,
  created_at timestamptz not null default now(),
  primary key (take_id, fid)
);

create table studio.living_snapshots (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references studio.works(id),
  chapter int not null,
  taken_at timestamptz not null default now(),
  take_id uuid references studio.takes(id),
  items jsonb not null,
  score numeric
);

-- Narration (Milestone 3 fills it; the house rule is enforced from the start).
create table studio.narrations (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references studio.works(id),
  chapter int not null,
  label text not null,
  created_by_fid bigint not null,
  created_at timestamptz not null default now(),
  unique (id, work_id, chapter)
);

create table studio.narration_segments (
  narration_id uuid not null references studio.narrations(id),
  idx int not null, -- text_blocks.idx in the narration's chapter
  asset_url text not null,
  asset_sha256 text not null,
  duration_ms int not null check (duration_ms > 0),
  recipe_id uuid not null references studio.recipes(id),
  primary key (narration_id, idx)
);

-- The house narration: exactly one per chapter that has any narration.
-- The primary key allows at most one; a deferred trigger below requires one
-- whenever the chapter has a narration. The composite key keeps it in its chapter.
create table studio.house_narrations (
  work_id text not null references studio.works(id),
  chapter int not null,
  narration_id uuid not null,
  primary key (work_id, chapter),
  foreign key (narration_id, work_id, chapter) references studio.narrations (id, work_id, chapter)
);

-- Lookup indexes for foreign keys that are not already the leading column of a key.
create index on studio.sections (location_entity_id);
create index on studio.entity_mentions (entity_id);
create index on studio.entity_mentions (chapter, idx);
create index on studio.elements (work_id, element_type);
create index on studio.elements (entity_id);
create index on studio.element_versions (recipe_id);
create index on studio.links (to_version_id, kind);
create index on studio.anchors (work_id, chapter, start_idx);
create index on studio.takes (work_id, chapter);
create index on studio.take_items (version_id);
create index on studio.living_snapshots (work_id, chapter, taken_at desc);
create index on studio.narrations (work_id, chapter);
create index on studio.narration_segments (recipe_id);
create index on studio.house_narrations (narration_id);

-- ---------------------------------------------------------------------------
-- Append-only: recipes, element_versions, links, anchors, narration_segments.
-- digests get the same trigger in their own migration.
-- The trigger also stops the service role, which bypasses RLS.
-- ---------------------------------------------------------------------------

create function studio.reject_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only: % rejected', tg_table_name, tg_op;
end;
$$;

create trigger recipes_append_only
  before update or delete on studio.recipes
  for each row execute function studio.reject_mutation();
create trigger element_versions_append_only
  before update or delete on studio.element_versions
  for each row execute function studio.reject_mutation();
create trigger links_append_only
  before update or delete on studio.links
  for each row execute function studio.reject_mutation();
create trigger anchors_append_only
  before update or delete on studio.anchors
  for each row execute function studio.reject_mutation();
create trigger narration_segments_append_only
  before update or delete on studio.narration_segments
  for each row execute function studio.reject_mutation();

-- TRUNCATE skips row triggers, so block it per statement as well.
create trigger recipes_no_truncate
  before truncate on studio.recipes
  for each statement execute function studio.reject_mutation();
create trigger element_versions_no_truncate
  before truncate on studio.element_versions
  for each statement execute function studio.reject_mutation();
create trigger links_no_truncate
  before truncate on studio.links
  for each statement execute function studio.reject_mutation();
create trigger anchors_no_truncate
  before truncate on studio.anchors
  for each statement execute function studio.reject_mutation();
create trigger narration_segments_no_truncate
  before truncate on studio.narration_segments
  for each statement execute function studio.reject_mutation();

-- ---------------------------------------------------------------------------
-- Cross-table rules
-- ---------------------------------------------------------------------------

-- Only placed elements are anchored: text, image, render, clip. Never a design.
create function studio.check_anchor_type() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
    where v.id = new.version_id and e.element_type in ('text','image','render','clip')
  ) then
    raise exception 'anchors: version % is not a text, image, render, or clip element', new.version_id;
  end if;
  return new;
end;
$$;
create trigger anchors_type
  before insert on studio.anchors
  for each row execute function studio.check_anchor_type();

-- display = 'replace' hides the book text, so the version must carry lettering.
create function studio.check_take_item_display() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.display = 'replace' and not exists (
    select 1 from studio.element_versions v
    where v.id = new.version_id
      and jsonb_typeof(v.body->'lettering') = 'array'
      and jsonb_array_length(v.body->'lettering') > 0
  ) then
    raise exception 'take_items: display replace needs a version with lettering (version %)', new.version_id;
  end if;
  return new;
end;
$$;
create trigger take_items_display
  before insert or update on studio.take_items
  for each row execute function studio.check_take_item_display();

-- Exactly one house narration for every chapter that has a narration.
-- Deferred to commit, so a narration and its house row can arrive in either order,
-- and the house can switch narrations with a single update.
create function studio.check_house_narration() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  keys text[][] := array[]::text[][];
  k text[];
begin
  if tg_op in ('INSERT', 'UPDATE') then keys := keys || array[[new.work_id, new.chapter::text]]; end if;
  if tg_op in ('UPDATE', 'DELETE') then keys := keys || array[[old.work_id, old.chapter::text]]; end if;
  foreach k slice 1 in array keys loop
    if exists (select 1 from studio.narrations n where n.work_id = k[1] and n.chapter = k[2]::int)
       and not exists (select 1 from studio.house_narrations h where h.work_id = k[1] and h.chapter = k[2]::int) then
      raise exception 'chapter % of % has narrations but no house narration', k[2], k[1];
    end if;
  end loop;
  return null;
end;
$$;
create constraint trigger narrations_need_house
  after insert or update or delete on studio.narrations
  deferrable initially deferred
  for each row execute function studio.check_house_narration();
create constraint trigger house_narration_required
  after insert or update or delete on studio.house_narrations
  deferrable initially deferred
  for each row execute function studio.check_house_narration();

-- ---------------------------------------------------------------------------
-- RLS: public read on everything except drafts and hidden items.
-- anon and authenticated get no write policies. studio_writer (server routes,
-- after checking the signed-in FID) may read and write every row; the
-- append-only triggers above still apply to it.
-- ---------------------------------------------------------------------------

alter table studio.works            enable row level security;
alter table studio.text_blocks      enable row level security;
alter table studio.sections         enable row level security;
alter table studio.entities         enable row level security;
alter table studio.entity_mentions  enable row level security;
alter table studio.elements         enable row level security;
alter table studio.recipes          enable row level security;
alter table studio.element_versions enable row level security;
alter table studio.links            enable row level security;
alter table studio.anchors          enable row level security;
alter table studio.ratings          enable row level security;
alter table studio.takes            enable row level security;
alter table studio.take_items       enable row level security;
alter table studio.take_likes       enable row level security;
alter table studio.living_snapshots enable row level security;
alter table studio.narrations       enable row level security;
alter table studio.narration_segments enable row level security;
alter table studio.house_narrations enable row level security;

create policy public_read on studio.works            for select using (true);
create policy public_read on studio.text_blocks      for select using (true);
create policy public_read on studio.sections         for select using (true);
create policy public_read on studio.entities         for select using (true);
create policy public_read on studio.entity_mentions  for select using (true);
create policy public_read on studio.ratings          for select using (true);
create policy public_read on studio.take_likes       for select using (true);
create policy public_read on studio.living_snapshots for select using (true);
create policy public_read on studio.narrations       for select using (true);
create policy public_read on studio.narration_segments for select using (true);
create policy public_read on studio.house_narrations for select using (true);

create policy public_read on studio.elements for select using (status = 'published');
create policy public_read on studio.takes    for select using (status = 'published');

create policy public_read on studio.element_versions for select using (
  exists (select 1 from studio.elements e where e.id = element_id and e.status = 'published')
);
create policy public_read on studio.anchors for select using (
  exists (select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
          where v.id = version_id and e.status = 'published')
);
create policy public_read on studio.links for select using (
  exists (select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
          where v.id = from_version_id and e.status = 'published')
  and
  exists (select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
          where v.id = to_version_id and e.status = 'published')
);
create policy public_read on studio.take_items for select using (
  exists (select 1 from studio.takes t where t.id = take_id and t.status = 'published')
);
-- A recipe is public unless every version it produced belongs to a draft or hidden element.
-- Recipes with no version yet (narration, digests, analysis) are public.
create policy public_read on studio.recipes for select using (
  not exists (select 1 from studio.element_versions v where v.recipe_id = studio.recipes.id)
  or exists (select 1 from studio.element_versions v join studio.elements e on e.id = v.element_id
             where v.recipe_id = studio.recipes.id and e.status = 'published')
);

-- studio_writer: full row access in every studio table, through RLS.
do $$
declare t text;
begin
  foreach t in array array['works','text_blocks','sections','entities','entity_mentions','elements',
    'recipes','element_versions','links','anchors','ratings','takes','take_items','take_likes','living_snapshots',
    'narrations','narration_segments','house_narrations']
  loop
    execute format('create policy writer_all on studio.%I for all to studio_writer using (true) with check (true)', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Grants
--   anon, authenticated  read (rows filtered by the policies above)
--   studio_writer        read and write rows; no DDL, nothing outside studio
--   service_role         nothing: this app never uses it
-- ---------------------------------------------------------------------------

grant usage on schema studio to anon, authenticated, studio_writer;

grant select on all tables in schema studio to anon, authenticated;

grant select, insert, update, delete on all tables in schema studio to studio_writer;
grant usage, select on all sequences in schema studio to studio_writer;

-- The same for tables and sequences that later migrations create.
alter default privileges in schema studio grant select on tables to anon, authenticated;
alter default privileges in schema studio grant select, insert, update, delete on tables to studio_writer;
alter default privileges in schema studio grant usage, select on sequences to studio_writer;

-- Trigger functions are internal; nobody calls them directly.
revoke execute on function studio.reject_mutation() from public;
revoke execute on function studio.check_anchor_type() from public;
revoke execute on function studio.check_take_item_display() from public;
revoke execute on function studio.check_house_narration() from public;

commit;
