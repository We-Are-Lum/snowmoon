-- READ-BACK for NEXT_admin_picks: run after the real run, as postgres. Every row should say true.
select 'admin_picks exists' as what, to_regclass('studio.admin_picks') is not null as ok
union all select 'seeded_hidden exists', to_regclass('studio.seeded_hidden') is not null
union all select 'admin_picks RLS on', (select relrowsecurity from pg_class where oid = 'studio.admin_picks'::regclass)
union all select 'seeded_hidden RLS on', (select relrowsecurity from pg_class where oid = 'studio.seeded_hidden'::regclass)
union all select 'anon cannot read admin_picks', not has_table_privilege('anon', 'studio.admin_picks', 'select')
union all select 'anon cannot read seeded_hidden', not has_table_privilege('anon', 'studio.seeded_hidden', 'select')
union all select 'writer can insert admin_picks', has_table_privilege('studio_writer', 'studio.admin_picks', 'insert')
union all select 'writer cannot update admin_picks', not has_table_privilege('studio_writer', 'studio.admin_picks', 'update')
union all select 'writer cannot delete seeded_hidden', not has_table_privilege('studio_writer', 'studio.seeded_hidden', 'delete')
union all select 'both empty', (select count(*) from studio.admin_picks) = 0 and (select count(*) from studio.seeded_hidden) = 0;
