-- NEXT_social_read (numbered at merge). Branch social-read, owner 2026-10-29: "Social threads, reading half: posts on
-- Farcaster (Neynar) and Bluesky that link to a snowmoon.party page, shown newest first on that page, removable on
-- request." DRAFT: the owner pastes it in the Supabase SQL Editor; nothing here is applied by the coding agent.
--
-- 1. studio.social_hidden: posts on Farcaster or Bluesky that link here and must not be shown on any page ("Posts that
--    link here"). A row per hidden post: the network, the post's own id (a cast's hash, 0x + 40 hex; a Bluesky post's
--    at:// URI), who hid it (a moderator's or admin's FID), why ('writer_asked': its writer asked, by email;
--    'terms': it breaks the Terms) and when. Nothing else about the post is kept: the posts themselves are read from
--    the networks and kept only in the site's short-lived cache (half an hour), never in the database.
--    Private: no public read (who hid what is the moderators' business, like removal_log). The site (studio_writer) may
--    only read and add rows; a hide is never undone by the app (P5b: moderators only hide). The owner can delete a row
--    here, as postgres, to show a post again.
--
-- Until this is applied, the site reads no hide list, so it shows no posts at all (fail closed), whatever
-- SOCIAL_READ.show says.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor. Requires 0001.
-- Dry run first: supabase/drafts/NEXT_social_read.DRY-RUN.sql (the same, ending in rollback;). Read back after:
-- supabase/drafts/READ-BACK-social_read.sql. One transaction: all of it or none. Safe to run twice.

begin;

create table if not exists studio.social_hidden (
  network text not null check (network in ('farcaster', 'bluesky')),
  post_id text not null check (
    (network = 'farcaster' and post_id ~ '^0x[0-9a-f]{40}$')
    or (network = 'bluesky' and post_id ~ '^at://did:[a-z0-9]+:[A-Za-z0-9._:%-]+/app\.bsky\.feed\.post/[A-Za-z0-9]{1,64}$')
  ),
  by_fid bigint not null check (by_fid > 0),
  reason text not null check (reason in ('writer_asked', 'terms')),
  hidden_at timestamptz not null default now(),
  primary key (network, post_id)
);

alter table studio.social_hidden enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'social_hidden' and policyname = 'writer_read') then
    create policy writer_read on studio.social_hidden for select to studio_writer using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'social_hidden' and policyname = 'writer_insert') then
    create policy writer_insert on studio.social_hidden for insert to studio_writer with check (true);
  end if;
end $$;
-- Nothing for anon and authenticated (0001's default privileges gave them select; take it back); the site may only
-- read and add rows: append-only.
revoke all on studio.social_hidden from anon, authenticated, studio_writer;
grant select, insert on studio.social_hidden to studio_writer;

commit;
