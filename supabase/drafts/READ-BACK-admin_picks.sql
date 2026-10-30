-- READ-BACK for NEXT_admin_picks: run after the real run, as postgres. Every row should say true.
-- It adds a realistic pick and a realistic hide as the site's own role (studio_writer), checks them, deletes them as
-- postgres, and ends in rollback, so nothing is kept (CLAUDE.md: every read-back inserts and deletes a real row).
begin;
select 'admin_picks exists' as what, to_regclass('studio.admin_picks') is not null as ok
union all select 'seeded_hidden exists', to_regclass('studio.seeded_hidden') is not null
union all select 'admin_picks RLS on', (select relrowsecurity from pg_class where oid = 'studio.admin_picks'::regclass)
union all select 'seeded_hidden RLS on', (select relrowsecurity from pg_class where oid = 'studio.seeded_hidden'::regclass)
union all select 'anon cannot read admin_picks', not has_table_privilege('anon', 'studio.admin_picks', 'select')
union all select 'anon cannot read seeded_hidden', not has_table_privilege('anon', 'studio.seeded_hidden', 'select')
union all select 'writer can insert admin_picks', has_table_privilege('studio_writer', 'studio.admin_picks', 'insert')
union all select 'writer cannot update admin_picks', not has_table_privilege('studio_writer', 'studio.admin_picks', 'update')
union all select 'writer cannot delete seeded_hidden', not has_table_privilege('studio_writer', 'studio.seeded_hidden', 'delete');

-- A realistic pick (the owner picks a reader's image for chapter 1, block 5), a cleared pick, and a hide, as the site.
set local role studio_writer;
insert into studio.admin_picks (target_kind, target, image_kind, image_ref, by_fid) values ('moment', 'c1-b5', 'reader', '00000000-0000-4000-8000-000000000001', 6786);
insert into studio.admin_picks (target_kind, target, image_kind, image_ref, by_fid) values ('term', 'keeper', 'none', null, 193912);
insert into studio.seeded_hidden (image_id, by_fid) values ('c1-b005-toy-drone', 6786);
select 'the site can add a pick, a cleared pick and a hide' as what,
  (select count(*) from studio.admin_picks where by_fid in (6786, 193912) and target in ('c1-b5', 'keeper')) = 2
  and (select count(*) from studio.seeded_hidden where image_id = 'c1-b005-toy-drone') = 1 as ok;
reset role;
delete from studio.admin_picks where target in ('c1-b5', 'keeper') and by_fid in (6786, 193912);
delete from studio.seeded_hidden where image_id = 'c1-b005-toy-drone';
select 'deleted again, as postgres' as what,
  (select count(*) from studio.admin_picks where target in ('c1-b5', 'keeper')) = 0
  and (select count(*) from studio.seeded_hidden where image_id = 'c1-b005-toy-drone') = 0 as ok;
rollback;
