-- 0013_remix.sql — Remix: frames people generate from a shot, their own daily count and costs,
-- and storyboards (owner's direction, 2026-10-18: "the editor is for REMIX, and everything stays
-- on the site").
-- APPLIED on production by the coding agent on the owner's go, 2026-10-18, after the real prompt check passed (SQL Editor, as postgres; dry run first, rolled back).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor.
-- Requires 0008 (image tables, for the same shape of counting), 0011 (wallet accounts) and 0012
-- (adaptations and versions). Dry run first: paste everything, but replace the final `commit;`
-- with `rollback;`.
--
-- People are person numbers, as in 0012: a Farcaster FID (positive), or minus a wallet account's id.
--
-- What it adds:
-- 1. studio.remix_frames: every frame generated in the shot editor, saved to that person's remix
--    of the shot (adaptation, version, shot). The person's own words (their prompt), the exact
--    prompt sent, the recipe (model, seed, request id, every picture sent by sha256, the camera
--    and people), the image's public address and sha256. A frame is shown, or hidden by its maker
--    or by the maintainer (who hid it is kept). Nothing here is readable by anon: the site reads
--    it as studio_writer and shows only frames that are not hidden.
-- 2. studio.remix_asks: one row per Generate (person and time), for the per-person daily count,
--    as studio.image_asks is for Pictures. Kept apart so Remix and Pictures each have their own count.
-- 3. studio.remix_costs: what Remix costs, as daily totals per kind of call, with no person and no
--    row per call (the assistant's rule, as studio.image_costs). Its free total is held under the
--    Remix daily cap (REMIX.dailyFreeCapUsd in src/lib/config.ts, $10 to start).
-- 4. studio.storyboards: a person's storyboard for a version: an ordered list of frames (the
--    version's own shots or remix frames), each with its length, and which converted take plays
--    for each line. Shown or hidden, like frames.

begin;

-- ---------------------------------------------------------------------------
-- 1. Remix frames.
-- ---------------------------------------------------------------------------

create table studio.remix_frames (
  id uuid primary key default gen_random_uuid(),
  adaptation_id bigint not null references studio.adaptations(id),
  version_id bigint not null references studio.adaptation_versions(id),
  shot_id text not null check (shot_id ~ '^[A-Za-z0-9-]{1,64}$'),
  person bigint not null check (person <> 0),
  -- The person's own words, published with their name (consent: config/consent.json).
  own_words text not null check (char_length(own_words) between 1 and 600),
  -- The exact prompt sent: their words plus the site's own text for the shot (shown in the recipe).
  prompt text not null check (char_length(prompt) <= 6000),
  recipe jsonb not null,
  image_url text not null,
  image_sha256 text not null unique check (image_sha256 ~ '^[0-9a-f]{64}$'),
  cost_usd numeric(10, 4) not null check (cost_usd >= 0),
  by_name text,
  hidden boolean not null default false,
  hidden_by bigint,
  hidden_role text check (hidden_role in ('maker', 'maintainer')),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  check (hidden = (hidden_role is not null))
);
create index remix_frames_shot on studio.remix_frames (version_id, shot_id, created_at desc);
create index remix_frames_person on studio.remix_frames (person, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. The per-person daily count.
-- ---------------------------------------------------------------------------

create table studio.remix_asks (
  person bigint not null,
  at timestamptz not null default now()
);
create index remix_asks_person_at on studio.remix_asks (person, at);

-- ---------------------------------------------------------------------------
-- 3. Daily totals of what Remix costs (no person, no time finer than a day).
-- ---------------------------------------------------------------------------

create table studio.remix_costs (
  day date not null default ((now() at time zone 'utc')::date),
  funded text not null check (funded in ('free', 'prepaid')),
  kind text not null check (kind in ('image', 'guard', 'reserved')),
  model text not null,
  provider text not null default '',
  verdict text not null default '' check (verdict in ('', 'ok', 'blocked', 'nsfw')),
  calls integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  primary key (day, funded, kind, model, provider, verdict),
  check (kind = 'reserved' or (calls >= 0 and cost_usd >= 0))
);

-- ---------------------------------------------------------------------------
-- 4. Storyboards.
-- ---------------------------------------------------------------------------

create table studio.storyboards (
  id uuid primary key default gen_random_uuid(),
  adaptation_id bigint not null references studio.adaptations(id),
  version_id bigint not null references studio.adaptation_versions(id),
  person bigint not null check (person <> 0),
  title text not null default '' check (char_length(title) <= 80),
  -- [{ "shot": "<shot id>", "frame": null | "<remix frame id>", "seconds": 0.5..20 }], up to 200.
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 200),
  -- { "<line cue>": "<take id>" }: which existing converted take plays for each line.
  takes jsonb not null default '{}'::jsonb check (jsonb_typeof(takes) = 'object'),
  by_name text,
  hidden boolean not null default false,
  hidden_by bigint,
  hidden_role text check (hidden_role in ('maker', 'maintainer')),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hidden = (hidden_role is not null))
);
create index storyboards_person on studio.storyboards (person, updated_at desc);

-- ---------------------------------------------------------------------------
-- Who may do what: only the site (studio_writer). Nothing is readable by anon.
-- ---------------------------------------------------------------------------

alter table studio.remix_frames enable row level security;
alter table studio.remix_asks enable row level security;
alter table studio.remix_costs enable row level security;
alter table studio.storyboards enable row level security;

create policy writer_read on studio.remix_frames for select to studio_writer using (true);
create policy writer_insert on studio.remix_frames for insert to studio_writer with check (true);
create policy writer_update on studio.remix_frames for update to studio_writer using (true) with check (true);
create policy writer_read on studio.remix_asks for select to studio_writer using (true);
create policy writer_insert on studio.remix_asks for insert to studio_writer with check (true);
create policy writer_read on studio.remix_costs for select to studio_writer using (true);
create policy writer_insert on studio.remix_costs for insert to studio_writer with check (true);
create policy writer_update on studio.remix_costs for update to studio_writer using (true) with check (true);
create policy writer_read on studio.storyboards for select to studio_writer using (true);
create policy writer_insert on studio.storyboards for insert to studio_writer with check (true);
create policy writer_update on studio.storyboards for update to studio_writer using (true) with check (true);

revoke all on studio.remix_frames, studio.remix_asks, studio.remix_costs, studio.storyboards from anon, authenticated;
grant select, insert, update on studio.remix_frames, studio.remix_costs, studio.storyboards to studio_writer;
grant select, insert on studio.remix_asks to studio_writer;
revoke delete, truncate, references, trigger on studio.remix_frames, studio.remix_asks, studio.remix_costs, studio.storyboards from studio_writer;
revoke update on studio.remix_asks from studio_writer;

-- A frame's words, prompt, recipe and image are fixed once written; only hiding can change.
create function studio.remix_frame_fixed() returns trigger language plpgsql as $$
begin
  if (new.adaptation_id, new.version_id, new.shot_id, new.person, new.own_words, new.prompt, new.recipe, new.image_url, new.image_sha256, new.cost_usd, new.created_at)
     is distinct from (old.adaptation_id, old.version_id, old.shot_id, old.person, old.own_words, old.prompt, old.recipe, old.image_url, old.image_sha256, old.cost_usd, old.created_at) then
    raise exception 'a remix frame is fixed once written; only hiding can change';
  end if;
  return new;
end $$;
create trigger remix_frame_fixed before update on studio.remix_frames for each row execute function studio.remix_frame_fixed();
revoke execute on function studio.remix_frame_fixed() from public;

commit;

-- Check: four rows, every one rls = true, anon_reads = false, anon_writes = false.
select c.relname as table, c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'select') as anon_reads,
       has_table_privilege('anon', c.oid, 'insert') as anon_writes
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'studio' and c.relname in ('remix_frames', 'remix_asks', 'remix_costs', 'storyboards');
