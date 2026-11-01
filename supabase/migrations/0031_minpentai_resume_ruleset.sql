-- 0031_minpentai_resume_ruleset.sql — each kept snap match records the ruleset it was played under.
-- Applied by the owner on 2026-10-31 (read-back passed); numbered 0031 at merge. Requires 0025 and
-- the Resume moves-check fix (PR #64). Must be applied before minpentai-cap10-120 merges: from then on the
-- snap reads and writes this column (src/lib/minpentai/snap/resume.ts).
--
-- Why (owner, 2026-10-30): a rule change must never change old links or saved matches. Play's rulesets are
-- numbered (src/lib/minpentai/versions/solo-v1.ts RULESETS): 1 is Play until 2026-10-22, frozen (96 steps,
-- computer players build up to 5 towers); 2 is rules draft 2 (120 steps, up to 10). A row saved before this
-- column existed was played under 1, which is the default.
--
-- MUST RUN AS postgres (the owner of the `studio` schema), in the Supabase SQL Editor.
-- Dry run first: paste everything, but replace the final `commit;` with `rollback;`.

begin;

alter table studio.mp_snap_resume
  add column ruleset smallint not null default 1 check (ruleset between 1 and 99);

commit;

-- Read-back (after commit): the column, then a realistic row under ruleset 2 inserted, read and deleted. The
-- test fid 2147483646 fits fid's type (bigint, 0025) and would fit an integer too; no real account has it.
-- select column_name, data_type, column_default, is_nullable from information_schema.columns
--   where table_schema = 'studio' and table_name = 'mp_snap_resume' and column_name = 'ruleset';
-- begin;
-- insert into studio.mp_snap_resume (fid, lvl, ver, rule, moves, ruleset)
--   values (2147483646, 2, '', '', '1btfdzl.4.FYFICyHeQ2~FYOgTM~FYQ2~FOQ2', 2);
-- select fid, ruleset = 2 as same from studio.mp_snap_resume where fid = 2147483646;
-- delete from studio.mp_snap_resume where fid = 2147483646;
-- commit;
-- select count(*) from studio.mp_snap_resume where fid = 2147483646;
