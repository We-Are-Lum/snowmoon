-- DRAFT, NOT APPLIED (owner's long run 2, item 5, 2026-10-19). Dry-run only on a local PGlite
-- (npm run test:make). Not to be run on production before the owner's go and their reread of
-- docs/legal/make-your-own-draft.md. Number 0017: 0016 is taken by 0016_line_takes.sql (branch record-takes).
--
-- studio.adaptation_drafts: a person's draft adaptation from "Make your own" (src/lib/make/): their idea, their
-- beats and their text storyboard, every word their own (src/lib/make/draft.ts, Draft). Private: only the site's
-- role can read it, and the site shows a draft only to the person who wrote it. The assistant's notes and the
-- conversation are never stored. The person can delete a draft; delete removes the row (nothing is kept).
-- Not an adaptation yet: publishing one is a later step (studio.adaptations), with its own consent.

begin;

create table studio.adaptation_drafts (
  id uuid primary key default gen_random_uuid(),
  -- A FID (Farcaster sign-in; the assistant's sign-in). Positive.
  person bigint not null check (person > 0),
  title text not null default '' check (length(title) <= 120),
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index adaptation_drafts_person on studio.adaptation_drafts (person, updated_at desc);

alter table studio.adaptation_drafts enable row level security;
create policy writer_read on studio.adaptation_drafts for select to studio_writer using (true);
create policy writer_insert on studio.adaptation_drafts for insert to studio_writer with check (true);
create policy writer_update on studio.adaptation_drafts for update to studio_writer using (true) with check (true);
create policy writer_delete on studio.adaptation_drafts for delete to studio_writer using (true);
revoke all on studio.adaptation_drafts from anon, authenticated;
grant select, insert, update, delete on studio.adaptation_drafts to studio_writer;
revoke truncate, references, trigger on studio.adaptation_drafts from studio_writer;

-- A draft's owner never changes.
create function studio.adaptation_draft_owner_fixed() returns trigger language plpgsql as $$
begin
  if new.person is distinct from old.person or new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'a draft''s owner, id and creation time are fixed';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger adaptation_draft_owner_fixed before update on studio.adaptation_drafts for each row execute function studio.adaptation_draft_owner_fixed();
revoke execute on function studio.adaptation_draft_owner_fixed() from public;

commit;

-- Check: one row, rls = true, anon_reads = false, anon_writes = false.
select c.relname as table, c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'select') as anon_reads,
       has_table_privilege('anon', c.oid, 'insert') as anon_writes
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'studio' and c.relname = 'adaptation_drafts';
