-- 0002_v5.sql — brief v5 (section 4e): proposals, picks, consents, donations,
-- attestations, credit addresses, hideable narrations.
--
-- Requires 0001. Same rules as 0001: everything lives in `studio`, applied by
-- hand in the SQL Editor after a dry run, never from a terminal with a
-- privileged key.
--
-- Dry run: paste everything, but replace the final `commit;` with `rollback;`.
--
-- Grants for the new tables come from 0001's default privileges (anon and
-- authenticated may select, studio_writer may write); the policies below decide
-- which rows anyone actually sees. Private tables also lose the anon and
-- authenticated grants, so a missing policy can never expose them.

begin;

-- ---------------------------------------------------------------------------
-- Credit addresses (section 9): who to credit, as of creation. Old work keeps
-- the address it was made with, because recipes are append-only.
-- ---------------------------------------------------------------------------

alter table studio.recipes add column credit_address text
  check (credit_address is null or credit_address ~ '^0x[0-9a-fA-F]{40}$');

-- ---------------------------------------------------------------------------
-- Proposals and the render queue (section 3). A proposal is a request that
-- hasn't run; a renderer writes the version and its recipe, then marks the
-- request rendered. The model must be on the allowlist in config/models.json;
-- the server checks that, since the file is the source of truth.
-- ---------------------------------------------------------------------------

create table studio.generation_requests (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references studio.works(id),
  element_type text not null check (element_type in ('image','narration')),
  model_id text not null,
  request jsonb not null,            -- prompt, picks, anchor, settings
  status text not null default 'proposed'
    check (status in ('proposed','queued','rendered','rejected','withdrawn')),
  version_id uuid references studio.element_versions(id),
  narration_id uuid references studio.narrations(id),
  created_by_fid bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Rendered means exactly one output exists: a version for images, a
  -- narration for narration requests.
  check ((status = 'rendered') = (version_id is not null or narration_id is not null)),
  check (version_id is null or narration_id is null),
  check (element_type = 'image' or version_id is null),
  check (element_type = 'narration' or narration_id is null)
);

create index generation_requests_queue on studio.generation_requests (status, created_at);

-- ---------------------------------------------------------------------------
-- Picks (section 4): one pinned version per entity per person. Pinned to a
-- version, so an author's later version never changes someone's images.
-- ---------------------------------------------------------------------------

create table studio.picks (
  fid bigint not null,
  entity_id uuid not null references studio.entities(id),
  version_id uuid not null references studio.element_versions(id),
  picked_at timestamptz not null default now(),
  primary key (fid, entity_id)
);

-- A pick must be a version of a design element for that same entity.
create function studio.check_pick() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from studio.element_versions v
    join studio.elements e on e.id = v.element_id
    where v.id = new.version_id and e.element_type = 'design' and e.entity_id = new.entity_id
  ) then
    raise exception 'pick: version % is not a design version of entity %', new.version_id, new.entity_id;
  end if;
  return new;
end;
$$;

create trigger picks_valid
  before insert or update on studio.picks
  for each row execute function studio.check_pick();

-- ---------------------------------------------------------------------------
-- Consents (sections 5 and 7): the exact wording shown is hashed, so the
-- record says what the person agreed to. Append-only; a later request to hide
-- work is handled on the work (elements.status, narrations.hidden).
-- ---------------------------------------------------------------------------

create table studio.contributor_consents (
  id uuid primary key default gen_random_uuid(),
  fid bigint not null,
  kind text not null check (kind in ('handmade_upload','voice_recording')),
  consent_text_sha256 text not null check (consent_text_sha256 ~ '^[0-9a-f]{64}$'),
  guardian boolean not null default false,
  created_at timestamptz not null default now()
);

create index contributor_consents_fid on studio.contributor_consents (fid, kind);

-- ---------------------------------------------------------------------------
-- Hideable narrations (section 7): a human recording can be hidden on request.
-- The house narration can never be hidden; switch the house first.
-- ---------------------------------------------------------------------------

alter table studio.narrations add column hidden boolean not null default false;

create function studio.check_narration_hidden() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from studio.house_narrations h
    join studio.narrations n on n.id = h.narration_id
    where n.hidden
  ) then
    raise exception 'the house narration cannot be hidden';
  end if;
  return null;
end;
$$;

create constraint trigger narrations_house_not_hidden
  after insert or update on studio.narrations
  deferrable initially deferred
  for each row execute function studio.check_narration_hidden();
create constraint trigger house_narration_not_hidden
  after insert or update on studio.house_narrations
  deferrable initially deferred
  for each row execute function studio.check_narration_hidden();

-- ---------------------------------------------------------------------------
-- Donations (section 9), read from the chain. fid is set only when the sending
-- address is one of that account's verified addresses; a different credit
-- address is verified only by a signature from the paying wallet.
-- ---------------------------------------------------------------------------

create table studio.donations (
  id uuid primary key default gen_random_uuid(),
  chain text not null,
  tx_hash text not null,
  from_address text not null check (from_address ~ '^0x[0-9a-fA-F]{40}$'),
  token text not null,
  amount numeric not null check (amount > 0),
  usd_at_time numeric(12,2),
  fid bigint,
  credit_address text check (credit_address is null or credit_address ~ '^0x[0-9a-fA-F]{40}$'),
  credit_address_verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (chain, tx_hash),
  check (credit_address_verified = false or credit_address is not null)
);

-- ---------------------------------------------------------------------------
-- Attestations (section 9, Milestone 4b): signed EAS attestations, off-chain
-- first. Each one is about a recipe or a donation.
-- ---------------------------------------------------------------------------

create table studio.attestations (
  uid text primary key,
  recipe_id uuid references studio.recipes(id),
  donation_id uuid references studio.donations(id),
  onchain boolean not null default false,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  check ((recipe_id is null) <> (donation_id is null))
);

-- ---------------------------------------------------------------------------
-- Append-only, with 0001's trigger function: consents, donations, attestations.
-- ---------------------------------------------------------------------------

create trigger contributor_consents_append_only
  before update or delete on studio.contributor_consents
  for each row execute function studio.reject_mutation();
create trigger donations_append_only
  before update or delete on studio.donations
  for each row execute function studio.reject_mutation();
create trigger attestations_append_only
  before update or delete on studio.attestations
  for each row execute function studio.reject_mutation();

create trigger contributor_consents_no_truncate
  before truncate on studio.contributor_consents
  for each statement execute function studio.reject_mutation();
create trigger donations_no_truncate
  before truncate on studio.donations
  for each statement execute function studio.reject_mutation();
create trigger attestations_no_truncate
  before truncate on studio.attestations
  for each statement execute function studio.reject_mutation();

-- ---------------------------------------------------------------------------
-- RLS
--   generation_requests   public, except withdrawn or rejected
--   donations             public (the transfers are on-chain anyway)
--   attestations          public (they are signed for publication)
--   picks                 private: a person's own choices
--   contributor_consents  private: includes guardian flags
--   narrations            hidden ones drop out of public reads, with their segments
-- studio_writer reads and writes every row, after the server checks the FID.
-- ---------------------------------------------------------------------------

alter table studio.generation_requests  enable row level security;
alter table studio.picks                enable row level security;
alter table studio.contributor_consents enable row level security;
alter table studio.donations            enable row level security;
alter table studio.attestations         enable row level security;

create policy public_read on studio.generation_requests for select
  using (status in ('proposed','queued','rendered'));
create policy public_read on studio.donations    for select using (true);
create policy public_read on studio.attestations for select using (true);

-- Replace 0001's narration policies so hidden recordings stay out of public reads.
drop policy public_read on studio.narrations;
drop policy public_read on studio.narration_segments;
create policy public_read on studio.narrations for select using (not hidden);
create policy public_read on studio.narration_segments for select using (
  exists (select 1 from studio.narrations n where n.id = narration_id and not n.hidden)
);

do $$
declare t text;
begin
  foreach t in array array['generation_requests','picks','contributor_consents','donations','attestations']
  loop
    execute format('create policy writer_all on studio.%I for all to studio_writer using (true) with check (true)', t);
  end loop;
end
$$;

-- Private tables: no public policy, and no grant either.
revoke select on studio.picks, studio.contributor_consents from anon, authenticated;

-- Trigger functions are internal; nobody calls them directly.
revoke execute on function studio.check_pick() from public;
revoke execute on function studio.check_narration_hidden() from public;

commit;
