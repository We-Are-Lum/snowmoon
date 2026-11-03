-- READ-BACK for NEXT_signin_lens_bluesky.sql (branch signin-lens-bluesky): block C of that file. Run as postgres in the
-- Supabase SQL Editor after applying it. Paste (a) and (b) together; (a) shows rows, (b) a notice.
-- C. READ-BACK (after B), as postgres. Two parts, nothing is kept:
--   (a) one read-only select: every row's ok should be true;
--   (b) one do block: a realistic Lens account, a Bluesky account, a sign-in again (the handle refreshed), a link to a
--       Farcaster ID, a second active link refused, then the link ended; each checked, then deleted. It ends with the
--       notice "READ-BACK passed", or stops with "READ-BACK FAILED: …" (and keeps nothing either way).

-- (a)
select what, ok from (values
  ('social_accounts has its 6 columns',
    (select count(*) from information_schema.columns where table_schema = 'studio' and table_name = 'social_accounts'
      and column_name in ('id', 'kind', 'subject', 'handle', 'created_at', 'last_sign_in_at')) = 6),
  ('social_links has its 7 columns',
    (select count(*) from information_schema.columns where table_schema = 'studio' and table_name = 'social_links'
      and column_name in ('id', 'account_id', 'fid', 'lens_account_id', 'linked_at', 'unlinked_at', 'ended_by')) = 7),
  ('row-level security is on for both',
    (select bool_and(relrowsecurity) and count(*) = 2 from pg_class where oid in ('studio.social_accounts'::regclass, 'studio.social_links'::regclass))),
  ('the six policies, all for studio_writer',
    (select count(*) from pg_policies where schemaname = 'studio' and roles = '{studio_writer}'
      and (tablename, policyname) in (('social_accounts', 'writer_insert'), ('social_accounts', 'writer_read'), ('social_accounts', 'writer_update'),
                                      ('social_links', 'writer_insert'), ('social_links', 'writer_read'), ('social_links', 'writer_unlink'))) = 6),
  ('no other policies on them',
    (select count(*) from pg_policies where schemaname = 'studio' and tablename in ('social_accounts', 'social_links')) = 6),
  ('studio_writer may select and insert on both',
    has_table_privilege('studio_writer', 'studio.social_accounts', 'select') and has_table_privilege('studio_writer', 'studio.social_accounts', 'insert')
    and has_table_privilege('studio_writer', 'studio.social_links', 'select') and has_table_privilege('studio_writer', 'studio.social_links', 'insert')),
  ('studio_writer may not delete or truncate either',
    not has_table_privilege('studio_writer', 'studio.social_accounts', 'delete') and not has_table_privilege('studio_writer', 'studio.social_accounts', 'truncate')
    and not has_table_privilege('studio_writer', 'studio.social_links', 'delete') and not has_table_privilege('studio_writer', 'studio.social_links', 'truncate')),
  ('studio_writer may update only handle and last_sign_in_at, and only unlinked_at and ended_by',
    has_column_privilege('studio_writer', 'studio.social_accounts', 'handle', 'update') and has_column_privilege('studio_writer', 'studio.social_accounts', 'last_sign_in_at', 'update')
    and not has_column_privilege('studio_writer', 'studio.social_accounts', 'subject', 'update') and not has_column_privilege('studio_writer', 'studio.social_accounts', 'kind', 'update')
    and has_column_privilege('studio_writer', 'studio.social_links', 'unlinked_at', 'update') and has_column_privilege('studio_writer', 'studio.social_links', 'ended_by', 'update')
    and not has_column_privilege('studio_writer', 'studio.social_links', 'fid', 'update') and not has_column_privilege('studio_writer', 'studio.social_links', 'account_id', 'update')),
  ('anon and authenticated have nothing on either',
    not exists (select 1 from information_schema.role_table_grants where table_schema = 'studio'
      and table_name in ('social_accounts', 'social_links') and grantee in ('anon', 'authenticated'))),
  ('one active link per account (the partial unique index)',
    exists (select 1 from pg_indexes where schemaname = 'studio' and indexname = 'social_links_one_active' and indexdef ilike '%unique%where (unlinked_at is null)%'))
) as t(what, ok);

-- (b)
do $$
declare
  lens_id bigint;
  sky_id bigint;
  n int;
  refused boolean := false;
begin
  insert into studio.social_accounts (kind, subject, handle) values ('lens', '0xad2c0beade60fb9f7ec5c87bde8e4c126145f6e7', 'lens/stani')
    returning id into lens_id;
  insert into studio.social_accounts (kind, subject, handle) values ('bluesky', 'did:plc:z72i7hdynmk6r22z27h6tvur', 'bsky.app')
    returning id into sky_id;
  -- A sign-in again: the handle refreshed, no second row.
  insert into studio.social_accounts (kind, subject, handle) values ('bluesky', 'did:plc:z72i7hdynmk6r22z27h6tvur', 'bsky.app')
    on conflict (kind, subject) do update set handle = excluded.handle, last_sign_in_at = now();
  select count(*) into n from studio.social_accounts where subject in ('0xad2c0beade60fb9f7ec5c87bde8e4c126145f6e7', 'did:plc:z72i7hdynmk6r22z27h6tvur');
  if n <> 2 then raise exception 'READ-BACK FAILED: % account rows after a sign-in again, not 2', n; end if;
  -- A link to a Farcaster ID, then a second active link for the same account, which must be refused.
  insert into studio.social_links (account_id, fid) values (sky_id, 6786);
  begin
    insert into studio.social_links (account_id, lens_account_id) values (sky_id, lens_id);
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a second active link for one account was accepted'; end if;
  update studio.social_links set unlinked_at = now(), ended_by = 'person' where account_id = sky_id and unlinked_at is null;
  select count(*) into n from studio.social_links where account_id = sky_id and ended_by = 'person' and unlinked_at is not null;
  if n <> 1 then raise exception 'READ-BACK FAILED: the link did not end (% ended rows)', n; end if;
  delete from studio.social_links where account_id in (lens_id, sky_id);
  delete from studio.social_accounts where id in (lens_id, sky_id);
  select count(*) into n from studio.social_accounts where id in (lens_id, sky_id);
  if n <> 0 then raise exception 'READ-BACK FAILED: % test rows left after the delete', n; end if;
  raise notice 'READ-BACK passed';
end $$;
