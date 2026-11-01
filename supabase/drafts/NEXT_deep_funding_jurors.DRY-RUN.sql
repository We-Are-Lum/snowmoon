-- NEXT_deep_funding_jurors.DRY-RUN.sql — the dry run of supabase/migrations/NEXT_deep_funding_jurors.sql: the same
-- SQL, ending in rollback, so nothing is kept. Run as postgres in the Supabase SQL Editor. It should finish with no
-- error. Any error here means: stop, and don't run the migration.

begin;

create table if not exists studio.deep_funding_jurors (
  id bigint generated always as identity primary key,
  challenge text not null check (challenge ~ '^[a-z0-9-]{1,40}$'),
  character text not null check (character ~ '^[a-z0-9-]{1,40}$'),
  fid bigint not null check (fid > 0),
  added_by bigint not null check (added_by > 0),
  added_at timestamptz not null default now(),
  constraint deep_funding_jurors_once unique (challenge, character, fid)
);

create table if not exists studio.juror_answers (
  id bigint generated always as identity primary key,
  challenge text not null check (challenge ~ '^[a-z0-9-]{1,40}$'),
  character text not null check (character ~ '^[a-z0-9-]{1,40}$'),
  final_version_id uuid not null references studio.element_versions(id),
  fid bigint not null check (fid > 0),
  question_no smallint not null check (question_no between 1 and 20),
  kind text not null check (kind in ('compare', 'originality')),
  version_a uuid not null references studio.element_versions(id),
  version_b uuid references studio.element_versions(id),
  choice text check (choice in ('a', 'b')),
  times numeric(6, 2) check (times is null or (times >= 1 and times <= 100)),
  share numeric(4, 3) check (share is null or (share >= 0 and share <= 1)),
  answered_at timestamptz not null default now(),
  constraint juror_answer_shape check (
    (kind = 'compare' and version_b is not null and version_b <> version_a and choice is not null and times is not null and share is null)
    or (kind = 'originality' and version_b is null and choice is null and times is null and share is not null)
  )
);
create index if not exists juror_answers_juror on studio.juror_answers (challenge, character, fid, question_no, answered_at desc);

alter table studio.deep_funding_jurors enable row level security;
alter table studio.juror_answers enable row level security;
drop policy if exists writer_read on studio.deep_funding_jurors;
create policy writer_read on studio.deep_funding_jurors for select to studio_writer using (true);
drop policy if exists writer_insert on studio.deep_funding_jurors;
drop policy if exists writer_read on studio.juror_answers;
create policy writer_read on studio.juror_answers for select to studio_writer using (true);
drop policy if exists writer_insert on studio.juror_answers;
create policy writer_insert on studio.juror_answers for insert to studio_writer with check (true);
revoke all on studio.deep_funding_jurors from anon, authenticated;
revoke all on studio.juror_answers from anon, authenticated;
revoke insert, update, delete, truncate on studio.deep_funding_jurors from studio_writer;
revoke update, delete, truncate on studio.juror_answers from studio_writer;
grant select on studio.deep_funding_jurors to studio_writer;
grant select, insert on studio.juror_answers to studio_writer;

-- The dry run keeps nothing.
rollback;
