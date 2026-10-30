-- NEXT_minpentai_resume_moves_check.sql — fix studio.mp_snap_resume's moves check (0025).
-- DRAFT: not applied. Takes its number at merge (owner's standing rule, 2026-10-22).
--
-- Why: 0025's check said `[A-Za-z0-9_~-]{0,2000}`. Postgres refuses a bounded repeat over 255
-- ("invalid regular expression: invalid repetition count(s)"), and a check constraint's regex is
-- compiled when a row is checked, so every insert into mp_snap_resume has failed since 0025 was
-- applied (2026-10-23). The snap logs the error and plays on without Resume (resume.ts is best effort),
-- which is why nothing visible broke. Checked read-only on 2026-10-30: the constraint is still 0025's,
-- the table has 0 rows, and the old pattern errors in a select.
--
-- The new check accepts the same strings 0025 meant to: at most 2012 characters (7-character seed, a
-- dot, up to 3 digits, a dot, 2000 characters of placements), with no bounded repeat over 255.
-- src/lib/minpentai/snap/moves.ts (movesShapeOk, MOVES_MAX) accepts exactly the same, and
-- scripts/test-minpentai-snap.ts checks both against this file in PGlite.
--
-- MUST RUN AS postgres (the owner of the `studio` schema), in the Supabase SQL Editor.
-- Requires 0025. Dry run first: paste everything, but replace the final `commit;` with `rollback;`.

begin;

alter table studio.mp_snap_resume drop constraint mp_snap_resume_moves_check;
alter table studio.mp_snap_resume add constraint mp_snap_resume_moves_check
  check (length(moves) <= 2012 and moves ~ '^[0-9a-z]{1,7}\.[0-9]{1,3}\.[A-Za-z0-9_~-]*$');

commit;
