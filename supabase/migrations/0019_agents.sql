-- 0019: agents that act for a person, their drafts, and feedback (owner, 2026-10-20; DRAFT).
--
-- NOT APPLIED. Built on branch agents-connect and tested only in PGlite (npm run test:agents). The owner
-- applies migrations by hand, dry run first (replace the final commit; with rollback;).
--
-- Design: docs/agents/design.md. In short:
-- 1. studio.agents: an agent is linked to exactly one person (a Farcaster FID, or minus a wallet account),
--    by one of two routes: OAuth (Add to Claude / Add to ChatGPT, any MCP client) or a wallet the person
--    named and the agent signed for. At most 3 live agents per person. Revoking stops it at once.
-- 2. OAuth's own records: registered clients, one-time codes (hashed) and tokens (hashed). No token is
--    ever stored in the clear.
-- 3. studio.pieces and studio.piece_versions: what agents draft (an idea, a storyboard, frames and
--    prompts, a character version, a brought-in image). Every version is a private draft until its person
--    publishes it. A revision is a new version with its credit chain (remixed from whom, and whose agent).
-- 4. studio.notes: feedback on a published version, from a person or (once its person publishes it) an
--    agent, with the @mentions in it.
-- 5. studio.agent_counts: per agent, per UTC day, how many of each thing it did, for its limits.
-- 6. studio.requests (owner, 2026-10-20, the main goal: people do the creative acts, AI does the work):
--    what a person tells their agent, typed or spoken (transcribed; the recording is never kept): an idea,
--    a note on a frame, a moment or a draft, "try again", "say more". These are the person's own words.
--    They are private until a version that answers them is published; then they show as that person's.
--    Each version records which request it answers and its stamp: what people did (idea, words, feedback)
--    kept apart from what the agent did.
-- Nothing here is readable by anon or authenticated; pages read it through the server.

begin;

create table studio.agents (
  id uuid primary key default gen_random_uuid(),
  person bigint not null check (person <> 0),
  route text not null check (route in ('oauth', 'wallet')),
  name text not null check (char_length(name) between 1 and 60),
  client_id text,
  address text check (address is null or address ~ '^0x[0-9a-f]{40}$'),
  scopes text[] not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- A wallet agent is live once it has signed the link message the person made for it.
  link_message text,
  link_signature text,
  revoked_at timestamptz,
  last_used_at timestamptz,
  check (route <> 'wallet' or address is not null),
  check (route <> 'oauth' or client_id is not null)
);
create index agents_person on studio.agents (person) where revoked_at is null;
create unique index agents_wallet_live on studio.agents (address) where route = 'wallet' and revoked_at is null;

create table studio.oauth_clients (
  client_id text primary key,
  how text not null check (how in ('dcr', 'cimd')),
  name text not null check (char_length(name) between 1 and 80),
  redirect_uris text[] not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table studio.oauth_codes (
  code_hash text primary key,
  client_id text not null references studio.oauth_clients(client_id),
  agent_id uuid not null references studio.agents(id),
  redirect_uri text not null,
  code_challenge text not null,
  resource text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table studio.agent_tokens (
  token_hash text primary key,
  agent_id uuid not null references studio.agents(id),
  kind text not null check (kind in ('access', 'refresh')),
  resource text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz
);
create index agent_tokens_agent on studio.agent_tokens (agent_id);

create table studio.agent_counts (
  agent_id uuid not null references studio.agents(id),
  day date not null default (now() at time zone 'utc')::date,
  what text not null,
  n int not null default 0,
  primary key (agent_id, day, what)
);

create table studio.pieces (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('idea', 'storyboard', 'frames', 'character', 'image', 'edit')),
  person bigint not null check (person <> 0),
  adaptation_id bigint,
  title text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now()
);
create index pieces_person on studio.pieces (person);

create table studio.piece_versions (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references studio.pieces(id),
  n int not null check (n >= 1),
  body jsonb not null,
  -- Who made it: always the piece's person; an agent too when an agent drafted it.
  agent_id uuid references studio.agents(id),
  agent_name text,
  -- AI-written story words: only possible in a brought-in piece (agents may not write story words; owner,
  -- 2026-10-20). Labelled wherever shown, and never part of the person's stamp.
  words_by_agent boolean not null default false,
  -- The request this version answers, and the stamp: { idea, words, feedback: [{person, request}], made_by }.
  request_id uuid,
  stamp jsonb not null default '{}',
  remix_of uuid references studio.piece_versions(id),
  credit jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'published', 'discarded')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by bigint,
  -- A brought-in image: where it is kept, its hash, what the agent declared and what we checked.
  image_key text,
  image_sha256 text check (image_sha256 is null or image_sha256 ~ '^[0-9a-f]{64}$'),
  declared jsonb,
  checked jsonb,
  unique (piece_id, n),
  check (status <> 'published' or (published_at is not null and published_by is not null))
);

create table studio.notes (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references studio.piece_versions(id),
  person bigint not null check (person <> 0),
  agent_id uuid references studio.agents(id),
  agent_name text,
  body text not null check (char_length(body) between 1 and 500),
  body_hash text not null,
  mentions jsonb not null default '[]',
  status text not null check (status in ('draft', 'published', 'discarded', 'hidden')),
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index notes_version on studio.notes (version_id) where status = 'published';
create index notes_mentions on studio.notes using gin (mentions);

create table studio.requests (
  id uuid primary key default gen_random_uuid(),
  person bigint not null check (person <> 0),
  kind text not null check (kind in ('idea', 'note', 'again', 'more')),
  body text not null check (char_length(body) between 1 and 2000),
  spoken boolean not null default false,
  -- What it is about: a piece version (a draft or published), or a moment ("<adaptation>/<version>/<shot>"), or nothing (a new idea).
  target_version uuid references studio.piece_versions(id),
  target_moment text check (target_moment is null or target_moment ~ '^[0-9]{1,6}/[0-9]{1,6}/[A-Za-z0-9-]{1,40}$'),
  status text not null default 'open' check (status in ('open', 'answered', 'withdrawn')),
  answered_by uuid references studio.piece_versions(id),
  created_at timestamptz not null default now()
);
create index requests_open on studio.requests (person) where status = 'open';
alter table studio.piece_versions add constraint piece_versions_request foreign key (request_id) references studio.requests(id);

-- 7. studio.agent_gaps (owner, 2026-10-20): when an agent can't do what its person asked, it records what was
--    asked and what was missing. The person sees them on /you; together they are the build list.
create table studio.agent_gaps (
  id uuid primary key default gen_random_uuid(),
  person bigint not null check (person <> 0),
  agent_id uuid not null references studio.agents(id),
  agent_name text not null,
  asked text not null check (char_length(asked) between 1 and 1000),
  missing text not null check (char_length(missing) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index agent_gaps_person on studio.agent_gaps (person, created_at desc);

-- 8. Spending that a person approved on a draft (a frame try or a video test): what it cost, when, and the
--    recipe of what it made. Nothing is spent before the person's approval (owner, 2026-10-20).
alter table studio.piece_versions add column approved_at timestamptz;
alter table studio.piece_versions add column spent_usd numeric(10, 4);
alter table studio.piece_versions add column made jsonb;

-- A person never has more than 3 live agents (the server checks too; this is the floor).
create function studio.agents_three() returns trigger language plpgsql as $$
begin
  if (select count(*) from studio.agents where person = new.person and revoked_at is null and expires_at > now()) >= 3 then
    raise exception 'at most 3 agents per person';
  end if;
  return new;
end $$;
create trigger agents_three before insert on studio.agents for each row execute function studio.agents_three();

do $$
declare t text;
begin
  foreach t in array array['agents', 'oauth_clients', 'oauth_codes', 'agent_tokens', 'agent_counts', 'pieces', 'piece_versions', 'notes', 'requests', 'agent_gaps'] loop
    execute format('alter table studio.%I enable row level security', t);
    execute format('create policy writer_all on studio.%I for all to studio_writer using (true) with check (true)', t);
    execute format('revoke all on studio.%I from anon, authenticated', t);
    execute format('grant select, insert, update on studio.%I to studio_writer', t);
    execute format('revoke delete, truncate on studio.%I from studio_writer', t);
  end loop;
end $$;
-- Rate rows and expired codes are the only things the app deletes.
grant delete on studio.oauth_codes to studio_writer;

commit;
