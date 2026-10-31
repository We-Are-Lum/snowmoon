-- NEXT_remix_challenge.sql — the remix challenge's entry marks and "Posted on". Branch remix-challenge, owner
-- 2026-10-31 (docs/proposals/remix-challenge-plan.md, build list items 2 and 3). NOT APPLIED. It takes the next free
-- number at merge, checked against origin/main and production.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0001 only.
-- One transaction: all of it or none. Safe to run twice. First run supabase/drafts/NEXT_remix_challenge.DRY-RUN.sql
-- (the same SQL ending in rollback), then this, then both parts of supabase/drafts/READ-BACK-remix_challenge.sql.
--
-- What it adds (neither table is publicly readable: no public read policy, and anon and authenticated lose every
-- privilege 0001's default privileges gave them; the site reads them on the server, as studio_writer):
-- 1. studio.challenge_marks: "Mark as my entry". A person (FID) marks one of their own versions as their entry for a
--    challenge character; append-only, the latest row per (challenge, fid, character) counts. Without a mark, their
--    latest version in the window counts, so the site works without this table (marking says "not available yet").
-- 2. studio.version_posts: "Posted on". A post on Farcaster, Bluesky or Lens that links to a version's page, added by a
--    signed-in person after our server read it from that network's own API and found the link. Kept: the network, the
--    post's id there, the writer's handle, when it was posted, its address (rebuilt by us), who added it (fid: a FID,
--    or minus a wallet account) and when. Never the post's words, avatar or pictures. One row per post per version.
--    The person who added it, or a moderator, can remove it (a delete: the row is gone).
--
-- studio_writer's privileges: challenge_marks select and insert (no update, delete or truncate); version_posts select,
-- insert and delete (no update or truncate).

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

commit;
