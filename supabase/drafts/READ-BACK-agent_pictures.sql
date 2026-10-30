-- Read back after applying NEXT_agent_pictures (as postgres; ends in rollback, so nothing is kept). Each row should say true.
-- It also adds a realistic failure record and a 'picture' piece as the site (studio_writer), checks them, deletes them
-- as postgres, and ends in rollback, so nothing is kept (CLAUDE.md: every read-back inserts and deletes a real row).
begin;
select 'agent_failures table' as what, to_regclass('studio.agent_failures') is not null as ok
union all select 'row security on', (select relrowsecurity from pg_class where oid = 'studio.agent_failures'::regclass)
union all select 'exactly one policy (writer_all, for studio_writer)', (select count(*) from pg_policies where schemaname = 'studio' and tablename = 'agent_failures') = 1 and exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'agent_failures' and policyname = 'writer_all' and roles = '{studio_writer}')
union all select 'studio_writer: SELECT and INSERT only', (select array_agg(privilege_type::text order by privilege_type) from information_schema.role_table_grants where table_schema = 'studio' and table_name = 'agent_failures' and grantee = 'studio_writer') = array['INSERT', 'SELECT']
union all select 'anon and authenticated: nothing', not exists (select 1 from information_schema.role_table_grants where table_schema = 'studio' and table_name = 'agent_failures' and grantee in ('anon', 'authenticated'))
union all select 'columns: id, person, agent_id, agent_name, tool, kind, message, arg_names, created_at', (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema = 'studio' and table_name = 'agent_failures') = array['id', 'person', 'agent_id', 'agent_name', 'tool', 'kind', 'message', 'arg_names', 'created_at']
union all select 'pieces take the ten kinds', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'pieces_kind_check' and conrelid = 'studio.pieces'::regclass) = 'CHECK ((kind = ANY (ARRAY[''idea''::text, ''storyboard''::text, ''frames''::text, ''character''::text, ''image''::text, ''edit''::text, ''picture''::text, ''sheet''::text, ''place''::text, ''style''::text])))'
union all select 'every existing piece still fits', not exists (select 1 from studio.pieces where kind not in ('idea', 'storyboard', 'frames', 'character', 'image', 'edit', 'picture', 'sheet', 'place', 'style'));

-- A realistic failure record (the owner's first agent's tool refused an input) and a picture draft's piece, as the site.
set local role studio_writer;
insert into studio.agent_failures (person, agent_id, agent_name, tool, kind, message, arg_names)
  select a.person, a.id, a.name, 'draft_picture', 'input', 'style is required: ask your person which style they want', array['attach', 'prompt']
  from studio.agents a order by a.created_at limit 1;
insert into studio.pieces (kind, person, title) values ('picture', 6786, 'Read-back: a picture draft');
select 'the site can add a failure record and a picture piece' as what,
  (select count(*) from studio.agent_failures where message = 'style is required: ask your person which style they want' and tool = 'draft_picture') = 1
  and (select count(*) from studio.pieces where title = 'Read-back: a picture draft' and kind = 'picture') = 1 as ok;
reset role;
delete from studio.agent_failures where message = 'style is required: ask your person which style they want' and tool = 'draft_picture';
delete from studio.pieces where title = 'Read-back: a picture draft';
select 'deleted again, as postgres' as what,
  (select count(*) from studio.agent_failures where tool = 'draft_picture' and message = 'style is required: ask your person which style they want') = 0
  and (select count(*) from studio.pieces where title = 'Read-back: a picture draft') = 0 as ok;
rollback;
