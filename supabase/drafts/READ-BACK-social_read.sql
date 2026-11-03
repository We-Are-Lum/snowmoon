-- READ-BACK for NEXT_social_read.sql (branch social-read). Run as postgres in the Supabase SQL Editor after applying it.
-- Two parts; paste them together. Nothing is kept.
--   (a) one read-only select: every row's ok should be true.
--   (b) one do block: a realistic hide of a Farcaster cast (its writer asked) and of a Bluesky post (it breaks the
--       Terms), checked, a second hide of the same post refused, then both deleted. It ends with the notice
--       "READ-BACK passed", or stops with "READ-BACK FAILED: …" (and keeps nothing either way).

-- (a)
select what, ok from (values
  ('social_hidden has its five columns',
    (select count(*) from information_schema.columns where table_schema = 'studio' and table_name = 'social_hidden'
      and column_name in ('network', 'post_id', 'by_fid', 'reason', 'hidden_at')) = 5),
  ('row-level security is on',
    (select relrowsecurity from pg_class where oid = 'studio.social_hidden'::regclass)),
  ('two policies, writer_read (select) and writer_insert (insert), both for studio_writer',
    (select count(*) from pg_policies where schemaname = 'studio' and tablename = 'social_hidden' and roles = '{studio_writer}'
      and (policyname, cmd) in (('writer_read', 'SELECT'), ('writer_insert', 'INSERT'))) = 2
    and (select count(*) from pg_policies where schemaname = 'studio' and tablename = 'social_hidden') = 2),
  ('studio_writer may select and insert',
    has_table_privilege('studio_writer', 'studio.social_hidden', 'select') and has_table_privilege('studio_writer', 'studio.social_hidden', 'insert')),
  ('studio_writer may not update, delete or truncate (a hide is never undone by the app)',
    not has_table_privilege('studio_writer', 'studio.social_hidden', 'update') and not has_table_privilege('studio_writer', 'studio.social_hidden', 'delete')
    and not has_table_privilege('studio_writer', 'studio.social_hidden', 'truncate')),
  ('anon and authenticated have nothing on it',
    not exists (select 1 from information_schema.role_table_grants where table_schema = 'studio' and table_name = 'social_hidden'
      and grantee in ('anon', 'authenticated')))
) as t(what, ok);

-- (b)
do $$
declare
  n int;
  refused boolean := false;
begin
  insert into studio.social_hidden (network, post_id, by_fid, reason) values
    ('farcaster', '0x6a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 6786, 'writer_asked'),
    ('bluesky', 'at://did:plc:abcdefghij1234567890klmn/app.bsky.feed.post/3lxyzabc123de', 193912, 'terms');
  select count(*) into n from studio.social_hidden
    where post_id in ('0x6a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 'at://did:plc:abcdefghij1234567890klmn/app.bsky.feed.post/3lxyzabc123de');
  if n <> 2 then raise exception 'READ-BACK FAILED: % hides added, not 2', n; end if;
  -- The same post hidden twice: one row per post.
  begin
    insert into studio.social_hidden (network, post_id, by_fid, reason) values ('farcaster', '0x6a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 6786, 'terms');
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: the same post was hidden twice'; end if;
  delete from studio.social_hidden
    where post_id in ('0x6a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 'at://did:plc:abcdefghij1234567890klmn/app.bsky.feed.post/3lxyzabc123de');
  select count(*) into n from studio.social_hidden
    where post_id in ('0x6a1b2c3d4e5f60718293a4b5c6d7e8f901234567', 'at://did:plc:abcdefghij1234567890klmn/app.bsky.feed.post/3lxyzabc123de');
  if n <> 0 then raise exception 'READ-BACK FAILED: % test rows left after the delete', n; end if;
  raise notice 'READ-BACK passed';
end $$;
