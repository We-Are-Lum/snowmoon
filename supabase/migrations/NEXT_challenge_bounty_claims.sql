-- NEXT_challenge_bounty_claims.sql — backstories added after publish, and backstory claims on the poidh bounty
-- (branch challenge-backstory-bounty, owner's spec 2026-11-12). NOT APPLIED. Takes the next free number at merge
-- (CLAUDE.md), checked against origin/main and production. Drafted by the coding agent (Claude, a closed model by
-- Anthropic).
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Three parts, in order:
-- 1. the dry run (the migration's own SQL, ending in `rollback;`: it changes nothing), 2. the migration (ending in
-- `commit;`), 3. the read-back (after commit; it inserts a realistic backstory and claim, sends and confirms the claim
-- as the app does, checks that bad rows are refused, and deletes them). Safe to run twice.
--
-- What it is for.
-- - studio.challenge_backstories: a challenge picture's maker adds or changes its backstory on its page (1–3
--   paragraphs, at most 2,000 characters, checked by the prompt guard). Append-only: studio_writer may select and
--   insert, never update or delete; the newest row is the picture's backstory. element_versions' bodies are never
--   edited. `fid` is the person number getPerson gives (a FID, or a negative number for a wallet, Lens or Bluesky account).
-- - studio.challenge_bounty_claims: each claim prepared through the app on poidh bounty 560 (the picture and the
--   record pinned to IPFS, their gateway URLs, the claim's title and description), then the wallet's transaction hash
--   and when it was sent, and once Base confirms it the sending wallet, the outcome and poidh's claim id. Up to three
--   sent claims per person are counted from these rows (the app's rule, src/lib/poidh/claim.ts). studio_writer may
--   select and insert (an unsent row only), and update only tx_hash, sent_at, wallet, outcome, claim_id and
--   confirmed_at, only while the claim has no outcome; a trigger keeps each of those once set. No delete.
-- Nothing else changes: no public access (anon and authenticated get nothing).
--
-- Safe with today's live code (main, 2026-11-12): main never reads or writes either table. Requires 0001's
-- studio.element_versions and the studio_writer role.

-- 1. The dry run: everything below, then rollback. Expect no error.
begin;
create table if not exists studio.challenge_backstories (
  id bigint generated always as identity primary key,
  version_id uuid not null references studio.element_versions(id),
  fid bigint not null check (fid <> 0),
  text text not null check (char_length(text) between 1 and 2000 and btrim(text) <> ''),
  added_at timestamptz not null default now()
);
create index if not exists challenge_backstories_version on studio.challenge_backstories (version_id, added_at desc);

create table if not exists studio.challenge_bounty_claims (
  id bigint generated always as identity primary key,
  bounty_id bigint not null check (bounty_id >= 0),
  version_id uuid not null references studio.element_versions(id),
  fid bigint not null check (fid <> 0),
  backstory_id bigint references studio.challenge_backstories(id),
  title text not null check (char_length(title) between 1 and 200),
  description text not null check (char_length(description) between 1 and 1500),
  image_url text not null check (image_url ~ '^https://[A-Za-z0-9.-]+/ipfs/[A-Za-z0-9]{10,100}$'),
  metadata_uri text not null check (metadata_uri ~ '^https://[A-Za-z0-9.-]+/ipfs/[A-Za-z0-9]{10,100}$'),
  pinned_at timestamptz not null default now(),
  tx_hash text unique check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  sent_at timestamptz,
  wallet text check (wallet ~ '^0x[0-9a-f]{40}$'),
  outcome text check (outcome in ('confirmed', 'reverted')),
  claim_id bigint check (claim_id >= 0),
  confirmed_at timestamptz,
  constraint bounty_claims_sent check ((tx_hash is null) = (sent_at is null)),
  constraint bounty_claims_outcome check (outcome is null or (tx_hash is not null and confirmed_at is not null)),
  constraint bounty_claims_claim check (claim_id is null or outcome = 'confirmed')
);
create index if not exists challenge_bounty_claims_person on studio.challenge_bounty_claims (bounty_id, fid, pinned_at);
create index if not exists challenge_bounty_claims_version on studio.challenge_bounty_claims (version_id);

-- Once set, a claim's transaction, wallet, outcome and claim id never change.
create or replace function studio.bounty_claims_keep() returns trigger language plpgsql as $f$
begin
  if (old.tx_hash is not null and new.tx_hash is distinct from old.tx_hash)
    or (old.wallet is not null and new.wallet is distinct from old.wallet)
    or (old.outcome is not null and new.outcome is distinct from old.outcome)
    or (old.claim_id is not null and new.claim_id is distinct from old.claim_id) then
    raise exception 'a sent claim''s transaction, wallet, outcome and claim id are kept as they are' using errcode = 'check_violation';
  end if;
  return new;
end $f$;
drop trigger if exists bounty_claims_keep on studio.challenge_bounty_claims;
create trigger bounty_claims_keep before update on studio.challenge_bounty_claims for each row execute function studio.bounty_claims_keep();

alter table studio.challenge_backstories enable row level security;
alter table studio.challenge_bounty_claims enable row level security;
drop policy if exists writer_read on studio.challenge_backstories;
create policy writer_read on studio.challenge_backstories for select to studio_writer using (true);
drop policy if exists writer_insert on studio.challenge_backstories;
create policy writer_insert on studio.challenge_backstories for insert to studio_writer with check (true);
drop policy if exists writer_read on studio.challenge_bounty_claims;
create policy writer_read on studio.challenge_bounty_claims for select to studio_writer using (true);
drop policy if exists writer_insert on studio.challenge_bounty_claims;
create policy writer_insert on studio.challenge_bounty_claims for insert to studio_writer with check (tx_hash is null and claim_id is null and outcome is null);
drop policy if exists writer_send on studio.challenge_bounty_claims;
create policy writer_send on studio.challenge_bounty_claims for update to studio_writer using (claim_id is null and outcome is null) with check (true);
revoke all on studio.challenge_backstories from anon, authenticated;
revoke all on studio.challenge_bounty_claims from anon, authenticated;
revoke update, delete, truncate on studio.challenge_backstories from studio_writer;
revoke update, delete, truncate on studio.challenge_bounty_claims from studio_writer;
grant select, insert on studio.challenge_backstories to studio_writer;
grant select, insert on studio.challenge_bounty_claims to studio_writer;
grant update (tx_hash, sent_at, wallet, outcome, claim_id, confirmed_at) on studio.challenge_bounty_claims to studio_writer;
rollback;

-- 2. The migration.
begin;
create table if not exists studio.challenge_backstories (
  id bigint generated always as identity primary key,
  version_id uuid not null references studio.element_versions(id),
  fid bigint not null check (fid <> 0),
  text text not null check (char_length(text) between 1 and 2000 and btrim(text) <> ''),
  added_at timestamptz not null default now()
);
create index if not exists challenge_backstories_version on studio.challenge_backstories (version_id, added_at desc);

create table if not exists studio.challenge_bounty_claims (
  id bigint generated always as identity primary key,
  bounty_id bigint not null check (bounty_id >= 0),
  version_id uuid not null references studio.element_versions(id),
  fid bigint not null check (fid <> 0),
  backstory_id bigint references studio.challenge_backstories(id),
  title text not null check (char_length(title) between 1 and 200),
  description text not null check (char_length(description) between 1 and 1500),
  image_url text not null check (image_url ~ '^https://[A-Za-z0-9.-]+/ipfs/[A-Za-z0-9]{10,100}$'),
  metadata_uri text not null check (metadata_uri ~ '^https://[A-Za-z0-9.-]+/ipfs/[A-Za-z0-9]{10,100}$'),
  pinned_at timestamptz not null default now(),
  tx_hash text unique check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  sent_at timestamptz,
  wallet text check (wallet ~ '^0x[0-9a-f]{40}$'),
  outcome text check (outcome in ('confirmed', 'reverted')),
  claim_id bigint check (claim_id >= 0),
  confirmed_at timestamptz,
  constraint bounty_claims_sent check ((tx_hash is null) = (sent_at is null)),
  constraint bounty_claims_outcome check (outcome is null or (tx_hash is not null and confirmed_at is not null)),
  constraint bounty_claims_claim check (claim_id is null or outcome = 'confirmed')
);
create index if not exists challenge_bounty_claims_person on studio.challenge_bounty_claims (bounty_id, fid, pinned_at);
create index if not exists challenge_bounty_claims_version on studio.challenge_bounty_claims (version_id);

-- Once set, a claim's transaction, wallet, outcome and claim id never change.
create or replace function studio.bounty_claims_keep() returns trigger language plpgsql as $f$
begin
  if (old.tx_hash is not null and new.tx_hash is distinct from old.tx_hash)
    or (old.wallet is not null and new.wallet is distinct from old.wallet)
    or (old.outcome is not null and new.outcome is distinct from old.outcome)
    or (old.claim_id is not null and new.claim_id is distinct from old.claim_id) then
    raise exception 'a sent claim''s transaction, wallet, outcome and claim id are kept as they are' using errcode = 'check_violation';
  end if;
  return new;
end $f$;
drop trigger if exists bounty_claims_keep on studio.challenge_bounty_claims;
create trigger bounty_claims_keep before update on studio.challenge_bounty_claims for each row execute function studio.bounty_claims_keep();

alter table studio.challenge_backstories enable row level security;
alter table studio.challenge_bounty_claims enable row level security;
drop policy if exists writer_read on studio.challenge_backstories;
create policy writer_read on studio.challenge_backstories for select to studio_writer using (true);
drop policy if exists writer_insert on studio.challenge_backstories;
create policy writer_insert on studio.challenge_backstories for insert to studio_writer with check (true);
drop policy if exists writer_read on studio.challenge_bounty_claims;
create policy writer_read on studio.challenge_bounty_claims for select to studio_writer using (true);
drop policy if exists writer_insert on studio.challenge_bounty_claims;
create policy writer_insert on studio.challenge_bounty_claims for insert to studio_writer with check (tx_hash is null and claim_id is null and outcome is null);
drop policy if exists writer_send on studio.challenge_bounty_claims;
create policy writer_send on studio.challenge_bounty_claims for update to studio_writer using (claim_id is null and outcome is null) with check (true);
revoke all on studio.challenge_backstories from anon, authenticated;
revoke all on studio.challenge_bounty_claims from anon, authenticated;
revoke update, delete, truncate on studio.challenge_backstories from studio_writer;
revoke update, delete, truncate on studio.challenge_bounty_claims from studio_writer;
grant select, insert on studio.challenge_backstories to studio_writer;
grant select, insert on studio.challenge_bounty_claims to studio_writer;
grant update (tx_hash, sent_at, wallet, outcome, claim_id, confirmed_at) on studio.challenge_bounty_claims to studio_writer;
commit;

-- 3. The read-back (after commit), as postgres. Two parts: (a) one read-only select, every row's ok true; (b) a do block
-- that ends with the notice "READ-BACK PASSED" (or stops with "READ-BACK FAILED: …"), leaving no row behind.
-- (a)
-- select n, what, ok from (
--   select 1 as n, 'studio_writer: select and insert on challenge_backstories, no update or delete' as what, has_table_privilege('studio_writer', 'studio.challenge_backstories', 'SELECT') and has_table_privilege('studio_writer', 'studio.challenge_backstories', 'INSERT') and not has_table_privilege('studio_writer', 'studio.challenge_backstories', 'UPDATE') and not has_table_privilege('studio_writer', 'studio.challenge_backstories', 'DELETE') as ok
--   union all select 2, 'studio_writer: select and insert on challenge_bounty_claims, no delete or truncate', has_table_privilege('studio_writer', 'studio.challenge_bounty_claims', 'SELECT') and has_table_privilege('studio_writer', 'studio.challenge_bounty_claims', 'INSERT') and not has_table_privilege('studio_writer', 'studio.challenge_bounty_claims', 'DELETE') and not has_table_privilege('studio_writer', 'studio.challenge_bounty_claims', 'TRUNCATE')
--   union all select 3, 'studio_writer: update of the send and confirm columns only', has_column_privilege('studio_writer', 'studio.challenge_bounty_claims', 'tx_hash', 'UPDATE') and has_column_privilege('studio_writer', 'studio.challenge_bounty_claims', 'claim_id', 'UPDATE') and not has_table_privilege('studio_writer', 'studio.challenge_bounty_claims', 'UPDATE') and not has_column_privilege('studio_writer', 'studio.challenge_bounty_claims', 'description', 'UPDATE') and not has_column_privilege('studio_writer', 'studio.challenge_bounty_claims', 'metadata_uri', 'UPDATE') and not has_column_privilege('studio_writer', 'studio.challenge_bounty_claims', 'fid', 'UPDATE')
--   union all select 4, 'the policies are studio_writer''s only', (select count(*) from pg_policies where schemaname = 'studio' and tablename in ('challenge_backstories', 'challenge_bounty_claims')) = 5 and not exists (select 1 from pg_policies where schemaname = 'studio' and tablename in ('challenge_backstories', 'challenge_bounty_claims') and roles <> '{studio_writer}')
--   union all select 5, 'row level security is on for both', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.challenge_backstories')), false) and coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.challenge_bounty_claims')), false)
--   union all select 6, 'anon and authenticated have nothing', not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['studio.challenge_backstories', 'studio.challenge_bounty_claims']) t, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, t, p))
--   union all select 7, 'the trigger that keeps a sent claim', exists (select 1 from pg_trigger where tgrelid = 'studio.challenge_bounty_claims'::regclass and tgname = 'bounty_claims_keep')
-- ) t order by n;
-- (b) A realistic backstory and claim (the test person number 2147483646 fits fid's type and no real account has it), on
-- the newest version: inserted, sent, confirmed, then bad rows refused, then deleted.
-- do $$
-- declare v uuid; b bigint; c bigint; refused boolean;
-- begin
--   select id into v from studio.element_versions order by created_at desc limit 1;
--   if v is null then raise exception 'READ-BACK FAILED: needs one existing version to test on'; end if;
--   insert into studio.challenge_backstories (version_id, fid, text) values (v, 2147483646, E'Zei left the ice road the winter the lamps went out.\n\nNow he keeps one lit in every window he passes.') returning id into b;
--   insert into studio.challenge_bounty_claims (bounty_id, version_id, fid, backstory_id, title, description, image_url, metadata_uri)
--     values (560, v, 2147483646, b, 'Zei', E'Zei left the ice road the winter the lamps went out.\n\nNow he keeps one lit in every window he passes.\n\nhttps://snowmoon.party/challenge/p/' || v, 'https://gateway.pinata.cloud/ipfs/bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy', 'https://gateway.pinata.cloud/ipfs/bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq') returning id into c;
--   update studio.challenge_bounty_claims set tx_hash = '0x' || repeat('ab', 32), sent_at = now() where id = c and tx_hash is null;
--   update studio.challenge_bounty_claims set claim_id = 4242, outcome = 'confirmed', confirmed_at = now(), wallet = '0x' || repeat('cd', 20) where id = c and claim_id is null;
--   if not exists (select 1 from studio.challenge_bounty_claims where id = c and claim_id = 4242 and outcome = 'confirmed' and tx_hash is not null) then raise exception 'READ-BACK FAILED: the claim was not sent and confirmed'; end if;
--   refused := false;
--   begin update studio.challenge_bounty_claims set tx_hash = '0x' || repeat('ef', 32) where id = c;
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a sent claim''s transaction was changed'; end if;
--   refused := false;
--   begin insert into studio.challenge_bounty_claims (bounty_id, version_id, fid, title, description, image_url, metadata_uri) values (560, v, 2147483646, 'Zei', repeat('x', 1501), 'https://gateway.pinata.cloud/ipfs/bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy', 'https://gateway.pinata.cloud/ipfs/bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq');
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a description over 1,500 characters was accepted'; end if;
--   refused := false;
--   begin insert into studio.challenge_backstories (version_id, fid, text) values (v, 2147483646, repeat('x', 2001));
--   exception when check_violation then refused := true; end;
--   if not refused then raise exception 'READ-BACK FAILED: a backstory over 2,000 characters was accepted'; end if;
--   delete from studio.challenge_bounty_claims where fid = 2147483646;
--   delete from studio.challenge_backstories where fid = 2147483646;
--   if exists (select 1 from studio.challenge_backstories where fid = 2147483646) or exists (select 1 from studio.challenge_bounty_claims where fid = 2147483646) then raise exception 'READ-BACK FAILED: test rows left behind'; end if;
--   raise notice 'READ-BACK PASSED';
-- end $$;
