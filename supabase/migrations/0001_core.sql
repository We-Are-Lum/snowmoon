-- 0001_core.sql — core schema (Build Brief v3, section 5).
--
-- Applied by hand in the Supabase SQL Editor after a dry run. Do not run this
-- from a terminal with the service role key.
--
-- Dry run: paste everything, but replace the final `commit;` with `rollback;`.

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table works (
  id text primary key,
  title text not null,
  license text not null,
  source_url text not null,
  created_at timestamptz not null default now()
);

create table text_blocks (
  id bigint generated always as identity primary key,
  work_id text not null references works(id),
  chapter int not null,
  idx int not null,
  kind text not null check (kind in ('heading','dateline','paragraph','quote','screen','figure','break')),
  content text not null,
  content_hash text not null,
  read_aloud text,
  -- screen and figure only: { world, world_evidence, device, device_evidence, frame, fields }
  data jsonb,
  unique (work_id, chapter, idx),
  check (data is null or kind in ('screen','figure'))
);

create table entities (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references works(id),
  kind text not null check (kind in ('character','location','prop','style')),
  name text not null,
  -- 'veridia', 'dzego', 'united-cities', … (same slugs as text_blocks.data.world); null if none
  world text check (world ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  first_chapter int,
  unique (work_id, kind, name)
);

-- After entities, so a section can point at its location.
create table sections (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references works(id),
  chapter int not null,
  idx int not null,
  start_idx int not null,
  end_idx int not null,
  title text,
  location_entity_id uuid references entities(id),
  time_of_day text,
  season text,
  unique (work_id, chapter, idx),
  check (end_idx >= start_idx)
);

create table entity_mentions (
  id bigint generated always as identity primary key,
  entity_id uuid not null references entities(id),
  chapter int not null,
  idx int not null,
  fact text not null,
  quote text not null
);

create table elements (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references works(id),
  -- render: a code-rendered set piece (screen, board, map); body { template, template_commit, state }
  element_type text not null check (element_type in ('design','text','image','clip','render')),
  entity_id uuid references entities(id),
  created_by_fid bigint not null,
  status text not null default 'published' check (status in ('draft','published','hidden')),
  created_at timestamptz not null default now(),
  check ((element_type = 'design') = (entity_id is not null))
);

create table recipes (
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

create table element_versions (
  id uuid primary key default gen_random_uuid(),
  element_id uuid not null references elements(id),
  version_no int not null,
  body jsonb not null default '{}'::jsonb,
  asset_url text,
  asset_sha256 text,
  recipe_id uuid references recipes(id),
  created_at timestamptz not null default now(),
  unique (element_id, version_no)
);

create table links (
  id uuid primary key default gen_random_uuid(),
  from_version_id uuid not null references element_versions(id),
  to_version_id uuid not null references element_versions(id),
  kind text not null check (kind in ('remixed_from','uses')),
  unique (from_version_id, to_version_id, kind),
  check (from_version_id <> to_version_id)
);

create table anchors (
  element_id uuid primary key references elements(id),
  work_id text not null references works(id),
  chapter int not null,
  start_idx int not null,
  end_idx int not null,
  check (end_idx >= start_idx)
);

create table ratings (
  version_id uuid not null references element_versions(id),
  fid bigint not null,
  value smallint not null check (value between -5 and 5),
  created_at timestamptz not null default now(),
  primary key (version_id, fid)
);

create table takes (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references works(id),
  chapter int not null,
  title text not null,
  created_by_fid bigint not null,
  parent_take_id uuid references takes(id),
  status text not null default 'published' check (status in ('draft','published','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table take_items (
  take_id uuid not null references takes(id),
  version_id uuid not null references element_versions(id),
  pos int not null default 0,
  primary key (take_id, version_id)
);

create table take_likes (
  take_id uuid not null references takes(id),
  fid bigint not null,
  created_at timestamptz not null default now(),
  primary key (take_id, fid)
);

create table living_snapshots (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references works(id),
  chapter int not null,
  taken_at timestamptz not null default now(),
  take_id uuid references takes(id),
  items jsonb not null,
  score numeric
);

-- Lookup indexes for foreign keys that are not already the leading column of a key.
create index on sections (location_entity_id);
create index on entity_mentions (entity_id);
create index on entity_mentions (chapter, idx);
create index on elements (work_id, element_type);
create index on elements (entity_id);
create index on element_versions (recipe_id);
create index on links (to_version_id, kind);
create index on anchors (work_id, chapter, start_idx);
create index on takes (work_id, chapter);
create index on take_items (version_id);
create index on living_snapshots (work_id, chapter, taken_at desc);

-- ---------------------------------------------------------------------------
-- Append-only: recipes, element_versions, links (section 5 notes).
-- narration_segments and digests get the same trigger in their own migrations.
-- The trigger also stops the service role, which bypasses RLS.
-- ---------------------------------------------------------------------------

create function reject_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only: % rejected', tg_table_name, tg_op;
end;
$$;

create trigger recipes_append_only
  before update or delete on recipes
  for each row execute function reject_mutation();
create trigger element_versions_append_only
  before update or delete on element_versions
  for each row execute function reject_mutation();
create trigger links_append_only
  before update or delete on links
  for each row execute function reject_mutation();

-- TRUNCATE skips row triggers, so block it per statement as well.
create trigger recipes_no_truncate
  before truncate on recipes
  for each statement execute function reject_mutation();
create trigger element_versions_no_truncate
  before truncate on element_versions
  for each statement execute function reject_mutation();
create trigger links_no_truncate
  before truncate on links
  for each statement execute function reject_mutation();

-- ---------------------------------------------------------------------------
-- RLS: public read on everything except drafts and hidden items.
-- No insert/update/delete policies: all writes go through server routes using
-- the service role after checking the signed-in FID.
-- ---------------------------------------------------------------------------

alter table works            enable row level security;
alter table text_blocks      enable row level security;
alter table sections         enable row level security;
alter table entities         enable row level security;
alter table entity_mentions  enable row level security;
alter table elements         enable row level security;
alter table recipes          enable row level security;
alter table element_versions enable row level security;
alter table links            enable row level security;
alter table anchors          enable row level security;
alter table ratings          enable row level security;
alter table takes            enable row level security;
alter table take_items       enable row level security;
alter table take_likes       enable row level security;
alter table living_snapshots enable row level security;

create policy public_read on works            for select using (true);
create policy public_read on text_blocks      for select using (true);
create policy public_read on sections         for select using (true);
create policy public_read on entities         for select using (true);
create policy public_read on entity_mentions  for select using (true);
create policy public_read on ratings          for select using (true);
create policy public_read on take_likes       for select using (true);
create policy public_read on living_snapshots for select using (true);

create policy public_read on elements for select using (status = 'published');
create policy public_read on takes    for select using (status = 'published');

create policy public_read on element_versions for select using (
  exists (select 1 from elements e where e.id = element_id and e.status = 'published')
);
create policy public_read on anchors for select using (
  exists (select 1 from elements e where e.id = element_id and e.status = 'published')
);
create policy public_read on links for select using (
  exists (select 1 from element_versions v join elements e on e.id = v.element_id
          where v.id = from_version_id and e.status = 'published')
  and
  exists (select 1 from element_versions v join elements e on e.id = v.element_id
          where v.id = to_version_id and e.status = 'published')
);
create policy public_read on take_items for select using (
  exists (select 1 from takes t where t.id = take_id and t.status = 'published')
);
-- A recipe is public unless every version it produced belongs to a draft or hidden element.
-- Recipes with no version yet (narration, digests, analysis) are public.
create policy public_read on recipes for select using (
  not exists (select 1 from element_versions v where v.recipe_id = recipes.id)
  or exists (select 1 from element_versions v join elements e on e.id = v.element_id
             where v.recipe_id = recipes.id and e.status = 'published')
);

commit;
