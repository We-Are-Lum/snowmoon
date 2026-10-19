-- 0015_version_hidden_by.sql — who hid a scene version (the You page, owner 2026-10-18: "your work …
-- each with Hide").
-- DRAFT, not applied. Nobody has run this anywhere but the local in-memory tests. Apply only on the
-- owner's go.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor.
-- Requires 0012 (adaptation_versions). Dry run first: paste everything, but replace the final
-- `commit;` with `rollback;`. Safe to run again (every step is "if not exists").
--
-- Why: remix frames and storyboards (0013) record who hid them (hidden_by, hidden_role, hidden_at),
-- so a maker's hide is undone only by the maker and the maintainer's only by the maintainer
-- (docs/removal.md, decision 22). Scene versions (0012) have only `hidden`. The You page hides a
-- version without these columns (src/lib/version-hide.ts), but then nobody can bring it back from the
-- site, because a maker's hide can't be told from the maintainer's. With them, "Show it again" works
-- for the maker's own hides, as it does for frames and storyboards.
--
-- What waits on it: only "Show it again" on a hidden scene, and the "Hidden by you / by the
-- maintainer" line on the You page. Hiding works without it.
--
-- What it adds:
-- 1. Three columns on studio.adaptation_versions: hidden_by (the person number who hid it),
--    hidden_role ('maker' or 'maintainer'), hidden_at. Null while the version is shown.
--    Versions hidden before this runs keep null (nobody recorded): only the maintainer, in the SQL
--    Editor, brings those back.
-- 2. A check that a recorded role means the version is hidden.
-- The append-only trigger (0012, adaptation_version_fixed) names the columns that may never change;
-- these three are not among them, so it allows them, like `hidden`.
-- Public reads: 0012's public_read policy returns only rows that are not hidden, where all three
-- are null, so the public never sees who hid anything.

begin;

alter table studio.adaptation_versions add column if not exists hidden_by bigint;
alter table studio.adaptation_versions add column if not exists hidden_role text;
alter table studio.adaptation_versions add column if not exists hidden_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'adaptation_versions_hidden_role') then
    alter table studio.adaptation_versions add constraint adaptation_versions_hidden_role
      check ((hidden_role is null or hidden_role in ('maker', 'maintainer')) and (hidden_role is null or hidden));
  end if;
end $$;

commit;

-- Check: the three columns, and that anon still reads no hidden version.
select a.attname as column, format_type(a.atttypid, a.atttypmod) as type
from pg_attribute a
where a.attrelid = 'studio.adaptation_versions'::regclass and a.attname in ('hidden_by', 'hidden_role', 'hidden_at');
