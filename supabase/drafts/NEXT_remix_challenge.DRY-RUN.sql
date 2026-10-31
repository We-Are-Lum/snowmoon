-- NEXT_remix_challenge.DRY-RUN.sql — the dry run of supabase/migrations/NEXT_remix_challenge.sql: the same SQL,
-- ending in rollback, so nothing is kept. Run as postgres in the Supabase SQL Editor. It should finish with no error.
-- Any error here means: stop, and don't run the migration.

begin;

create table if not exists studio.challenge_marks (
  id bigint generated always as identity primary key,
  challenge text not null check (challenge ~ '^[a-z0-9-]{1,40}$'),
  fid bigint not null check (fid > 0),
  character text not null check (character ~ '^[a-z0-9-]{1,40}$'),
  version_id uuid not null references studio.element_versions(id),
  marked_at timestamptz not null default now()
);
create index if not exists challenge_marks_person on studio.challenge_marks (challenge, fid, character, marked_at desc);

create table if not exists studio.version_posts (
  id bigint generated always as identity primary key,
  version_id uuid not null references studio.element_versions(id),
  network text not null check (network in ('farcaster', 'bluesky', 'lens')),
  post_id text not null check (length(post_id) between 1 and 200),
  handle text not null check (handle ~ '^[a-z0-9][a-z0-9._-]{0,252}$'),
  posted_at timestamptz not null,
  url text not null check (
    (network = 'farcaster' and url ~ '^https://farcaster\.xyz/[a-z0-9._-]{1,64}/0x[0-9a-f]{8,40}$')
    or (network = 'bluesky' and url ~ '^https://bsky\.app/profile/did:[a-z0-9]+:[A-Za-z0-9._:%-]{1,253}/post/[A-Za-z0-9]{1,64}$')
    or (network = 'lens' and url ~ '^https://hey\.xyz/posts/[a-z0-9]{1,64}$')
  ),
  fid bigint not null check (fid <> 0),
  added_at timestamptz not null default now(),
  constraint version_posts_once unique (version_id, network, post_id)
);
create index if not exists version_posts_version on studio.version_posts (version_id, posted_at desc);
create index if not exists version_posts_person on studio.version_posts (fid, added_at);

alter table studio.challenge_marks enable row level security;
alter table studio.version_posts enable row level security;
drop policy if exists writer_read on studio.challenge_marks;
create policy writer_read on studio.challenge_marks for select to studio_writer using (true);
drop policy if exists writer_insert on studio.challenge_marks;
create policy writer_insert on studio.challenge_marks for insert to studio_writer with check (true);
drop policy if exists writer_read on studio.version_posts;
create policy writer_read on studio.version_posts for select to studio_writer using (true);
drop policy if exists writer_insert on studio.version_posts;
create policy writer_insert on studio.version_posts for insert to studio_writer with check (true);
drop policy if exists writer_delete on studio.version_posts;
create policy writer_delete on studio.version_posts for delete to studio_writer using (true);
revoke all on studio.challenge_marks from anon, authenticated;
revoke all on studio.version_posts from anon, authenticated;
revoke update, delete, truncate on studio.challenge_marks from studio_writer;
revoke update, truncate on studio.version_posts from studio_writer;
grant select, insert on studio.challenge_marks to studio_writer;
grant select, insert, delete on studio.version_posts to studio_writer;

-- The dry run keeps nothing.
rollback;
