-- NEXT_illustration_review.sql — the owner's review of the seeded key-moment images (owner, 2026-10-23: "Does each
-- image show its scene?"; branch illustration-check). DRAFT, NOT APPLIED. No number yet (owner's rule, 2026-10-22):
-- it takes the next free number at merge time, checked against main and production.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0001 only.
-- Dry run first: paste everything, but replace the final `commit;` with `rollback;`.
--
-- What it adds (neither table is publicly readable: no public read policy, and anon and authenticated lose every
-- privilege 0001's default privileges gave them):
-- 1. studio.illustration_checks: the vision check's answer for a job in a run (scripts/check-illustrations.ts
--    --upload), so the owner's review page (/you/illustrations) can show it on the site before anything about it is
--    committed to the public repository. One row per run and job; never changed.
-- 2. studio.illustration_reviews: the owner's decision on a job: keep, regenerate (with a note that the Sunday redo
--    appends to the job's prompt, credited to the owner) or drop; who decided (FID), when, the note, the picture
--    reviewed (its sha256) and the check run seen. Append-only: a new decision is a new row and the latest one per
--    job counts, so every earlier decision stays readable. The page answers only for the owner (src/lib/config.ts
--    ILLUSTRATION_CHECK.owners); the redo (scripts/illustration-redo.ts) copies the latest decisions into the job
--    files when the owner runs it.
--
-- studio_writer's privileges: select and insert on both (no update, delete or truncate).

begin;

create table studio.illustration_checks (
  run text not null check (run ~ '^[A-Za-z0-9._-]{1,120}$'),
  job_id text not null check (job_id ~ '^c[0-9]{1,2}-b[0-9]{1,4}-[a-z0-9-]{1,60}$'),
  image_sha256 text check (image_sha256 ~ '^[0-9a-f]{64}$'),
  model text not null check (length(model) between 1 and 120),
  answer jsonb not null,
  inputs_sha256 jsonb not null,
  cost_usd numeric(10, 6),
  created_at timestamptz not null default now(),
  primary key (run, job_id)
);

create table studio.illustration_reviews (
  id bigint generated always as identity primary key,
  job_id text not null check (job_id ~ '^c[0-9]{1,2}-b[0-9]{1,4}-[a-z0-9-]{1,60}$'),
  decision text not null check (decision in ('keep', 'regenerate', 'drop')),
  note text check (note is null or length(note) between 1 and 1000),
  by_fid bigint not null check (by_fid > 0),
  decided_at timestamptz not null default now(),
  image_sha256 text check (image_sha256 ~ '^[0-9a-f]{64}$'),
  check_run text check (check_run ~ '^[A-Za-z0-9._-]{1,120}$'),
  -- A redo needs the owner's note: it is what goes into the job's prompt.
  constraint regenerate_has_note check (decision <> 'regenerate' or note is not null)
);
create index illustration_reviews_job on studio.illustration_reviews (job_id, decided_at desc);

alter table studio.illustration_checks enable row level security;
alter table studio.illustration_reviews enable row level security;
create policy writer_read on studio.illustration_checks for select to studio_writer using (true);
create policy writer_insert on studio.illustration_checks for insert to studio_writer with check (true);
create policy writer_read on studio.illustration_reviews for select to studio_writer using (true);
create policy writer_insert on studio.illustration_reviews for insert to studio_writer with check (true);
revoke all on studio.illustration_checks from anon, authenticated;
revoke all on studio.illustration_reviews from anon, authenticated;
revoke update, delete, truncate on studio.illustration_checks from studio_writer;
revoke update, delete, truncate on studio.illustration_reviews from studio_writer;
grant select, insert on studio.illustration_checks to studio_writer;
grant select, insert on studio.illustration_reviews to studio_writer;

commit;
