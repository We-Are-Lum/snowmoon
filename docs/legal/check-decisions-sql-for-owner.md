# Check decisions: SQL for the owner (DRAFT)

Branch `check-decisions`. Written by a coding agent (Claude, a closed model made by Anthropic) on 2026-11-03 for the
owner's rule of 2026-11-04, "look each account up as rarely as possible". Nothing here has been applied by the agent.

**Run as `postgres`, in the Supabase SQL Editor, in this order, one block at a time.** The migration file is
`supabase/migrations/NEXT_check_decisions.sql`; it takes the next free number at merge (main ends at 0033).

**When:** apply it before this branch merges (CLAUDE.md: a PR that needs a migration merges only once it is applied).
The site as deployed today keeps working after it: it finds no kept score, asks Neynar at each Generate, and its
attempt to keep the score fails quietly, so from the moment the migration runs no score is kept.

## 1. Dry run (ends in rollback; changes nothing)

Expected: it runs without an error and ends with `ROLLBACK`.

```sql
begin;

create table if not exists studio.check_decisions (
  network text not null check (network in ('farcaster', 'lens', 'bluesky')),
  account text not null check (length(account) between 1 and 2048),
  threshold text not null check (threshold ~ '^[a-z0-9][a-z0-9.:+<>=_-]{0,199}$'),
  passed boolean not null,
  decided_at timestamptz not null default now(),
  primary key (network, account, threshold),
  constraint check_decisions_account_shape check (
    (network = 'farcaster' and account ~ '^[1-9][0-9]{0,18}$')
    or (network = 'lens' and account ~ '^0x[0-9a-f]{40}$')
    or (network = 'bluesky' and account ~ '^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$')
  )
);
create index if not exists check_decisions_decided_at on studio.check_decisions (decided_at);

alter table studio.check_decisions enable row level security;
drop policy if exists writer_read on studio.check_decisions;
create policy writer_read on studio.check_decisions for select to studio_writer using (true);
drop policy if exists writer_insert on studio.check_decisions;
create policy writer_insert on studio.check_decisions for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.check_decisions;
create policy writer_update on studio.check_decisions for update to studio_writer using (true) with check (true);
drop policy if exists writer_delete on studio.check_decisions;
create policy writer_delete on studio.check_decisions for delete to studio_writer using (true);
revoke all on studio.check_decisions from anon, authenticated;
revoke truncate, references, trigger on studio.check_decisions from studio_writer;
grant select, insert, update, delete on studio.check_decisions to studio_writer;

-- No score is kept from here on: the kept ones go, and none can be added or changed.
delete from studio.image_scores;
revoke insert, update on studio.image_scores from studio_writer;

rollback;
```

## 2. The migration

Expected: `COMMIT`.

```sql
begin;

create table if not exists studio.check_decisions (
  network text not null check (network in ('farcaster', 'lens', 'bluesky')),
  account text not null check (length(account) between 1 and 2048),
  threshold text not null check (threshold ~ '^[a-z0-9][a-z0-9.:+<>=_-]{0,199}$'),
  passed boolean not null,
  decided_at timestamptz not null default now(),
  primary key (network, account, threshold),
  constraint check_decisions_account_shape check (
    (network = 'farcaster' and account ~ '^[1-9][0-9]{0,18}$')
    or (network = 'lens' and account ~ '^0x[0-9a-f]{40}$')
    or (network = 'bluesky' and account ~ '^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$')
  )
);
create index if not exists check_decisions_decided_at on studio.check_decisions (decided_at);

alter table studio.check_decisions enable row level security;
drop policy if exists writer_read on studio.check_decisions;
create policy writer_read on studio.check_decisions for select to studio_writer using (true);
drop policy if exists writer_insert on studio.check_decisions;
create policy writer_insert on studio.check_decisions for insert to studio_writer with check (true);
drop policy if exists writer_update on studio.check_decisions;
create policy writer_update on studio.check_decisions for update to studio_writer using (true) with check (true);
drop policy if exists writer_delete on studio.check_decisions;
create policy writer_delete on studio.check_decisions for delete to studio_writer using (true);
revoke all on studio.check_decisions from anon, authenticated;
revoke truncate, references, trigger on studio.check_decisions from studio_writer;
grant select, insert, update, delete on studio.check_decisions to studio_writer;

-- No score is kept from here on: the kept ones go, and none can be added or changed.
delete from studio.image_scores;
revoke insert, update on studio.image_scores from studio_writer;

commit;
```

## 3. Read-back (a): read only

Expected: 11 rows, every `ok` is `true`.

```sql
-- Read-back (a): every row must say true.
select what, ok from (
  select 1 as n, 'check_decisions exists' as what, to_regclass('studio.check_decisions') is not null as ok
  union all select 2, 'row level security is on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('studio.check_decisions')), false)
  union all select 3, 'columns: network, account, threshold, passed, decided_at, and nothing else',
    coalesce((select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns where table_schema = 'studio' and table_name = 'check_decisions'), '') = 'network,account,threshold,passed,decided_at'
  union all select 4, 'no column can hold a score or the numbers behind a decision',
    not exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'check_decisions' and (column_name ~ '(^|_)(score|scores|value|age|count|posts|followers)(_|$)' or data_type in ('numeric', 'real', 'double precision', 'integer', 'bigint', 'smallint', 'jsonb', 'json')))
  union all select 5, 'one decision per network, account and rule (the primary key)',
    coalesce((select string_agg(a.attname::text, ',' order by array_position(i.indkey::int2[], a.attnum)) from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = to_regclass('studio.check_decisions') and i.indisprimary), '') = 'network,account,threshold'
  union all select 6, 'anon and authenticated cannot read or write it',
    not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, 'studio.check_decisions', p))
  union all select 7, 'studio_writer: select, insert, update, delete; no truncate',
    has_table_privilege('studio_writer', 'studio.check_decisions', 'SELECT') and has_table_privilege('studio_writer', 'studio.check_decisions', 'INSERT') and has_table_privilege('studio_writer', 'studio.check_decisions', 'UPDATE') and has_table_privilege('studio_writer', 'studio.check_decisions', 'DELETE') and not has_table_privilege('studio_writer', 'studio.check_decisions', 'TRUNCATE')
  union all select 8, 'its four policies are studio_writer''s only',
    (select count(*) from pg_policies where schemaname = 'studio' and tablename = 'check_decisions') = 4 and not exists (select 1 from pg_policies where schemaname = 'studio' and tablename = 'check_decisions' and roles <> '{studio_writer}')
  union all select 9, 'no Neynar score is kept', not exists (select 1 from studio.image_scores)
  union all select 10, 'studio_writer cannot add or change a score',
    not has_table_privilege('studio_writer', 'studio.image_scores', 'INSERT') and not has_table_privilege('studio_writer', 'studio.image_scores', 'UPDATE')
  union all select 11, 'the decided_at index exists', to_regclass('studio.check_decisions_decided_at') is not null
) t order by n;
```

## 4. Read-back (b): a realistic row in, checked, deleted

Expected: the notice `READ-BACK PASSED`. Any problem stops it with an error that starts `READ-BACK FAILED`; nothing
is left behind either way.

```sql
-- Read-back (b): a realistic decision per network goes in, is read back, replaced, refused when malformed, and deleted.
-- It leaves nothing behind. It ends with "READ-BACK PASSED", or stops with an error starting "READ-BACK FAILED".
do $$
declare
  did text := 'did:plc:readback' || repeat('z', 2000);
  n int;
  refused boolean;
begin
  insert into studio.check_decisions (network, account, threshold, passed) values
    ('farcaster', '987654321', 'neynar-score>=0.7', true),
    ('lens', '0x00000000000000000000000000000000000c0de1', 'lens-score>=1000', false),
    ('bluesky', did, 'made-before-2026-11-06+5posts30d', true);
  select count(*) into n from studio.check_decisions
    where (network, account, threshold) in (('farcaster', '987654321', 'neynar-score>=0.7'), ('lens', '0x00000000000000000000000000000000000c0de1', 'lens-score>=1000'), ('bluesky', did, 'made-before-2026-11-06+5posts30d'))
      and decided_at > now() - interval '1 minute';
  if n <> 3 then raise exception 'READ-BACK FAILED: % of 3 decisions read back', n; end if;
  -- A new decision under the same rule replaces the old one.
  insert into studio.check_decisions (network, account, threshold, passed) values ('lens', '0x00000000000000000000000000000000000c0de1', 'lens-score>=1000', true)
    on conflict (network, account, threshold) do update set passed = excluded.passed, decided_at = now();
  select count(*) into n from studio.check_decisions where network = 'lens' and account = '0x00000000000000000000000000000000000c0de1' and passed;
  if n <> 1 then raise exception 'READ-BACK FAILED: the replaced Lens decision reads back % rows', n; end if;
  -- A malformed account is refused.
  refused := false;
  begin
    insert into studio.check_decisions (network, account, threshold, passed) values ('farcaster', 'abc', 'neynar-score>=0.7', true);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'READ-BACK FAILED: a FID that is not digits was accepted'; end if;
  delete from studio.check_decisions where account in ('987654321', '0x00000000000000000000000000000000000c0de1', did);
  select count(*) into n from studio.check_decisions where account in ('987654321', '0x00000000000000000000000000000000000c0de1', did);
  if n <> 0 then raise exception 'READ-BACK FAILED: % rows left after the delete', n; end if;
  raise notice 'READ-BACK PASSED';
end $$;
```

## Later, once this branch is live

`studio.image_scores` is then empty and unused. A follow-up migration (its own branch) drops it; until then it stays
empty because `studio_writer` can no longer add a row.
