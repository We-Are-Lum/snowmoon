-- 0021: three floors under 0019 (owner, 2026-10-21: "Optional, in a follow-up"). DRAFT, NOT APPLIED.
--
-- MUST RUN AS postgres, in the Supabase SQL Editor, after 0019 (and after 0020 if it is applied by then; this
-- one doesn't need it). Dry run first: replace the final `commit;` with `rollback;`. Tested only in PGlite
-- (npm run test:agents, group F).
--
-- 1. A personal agent key's spend cap is at most $10 in the database too (the server already refuses more:
--    AGENTS.key.capUsd.max).
-- 2. A piece's adaptation, when it has one, is a real adaptation.
-- 3. agents_three() runs with an empty search_path, so nothing earlier on a caller's path can stand in for
--    what it uses (its body names studio.agents in full; now() and count() are pg_catalog's, which is
--    always searched).

begin;

alter table studio.agents add constraint agents_key_cap_at_most_10 check (spend_cap_usd is null or spend_cap_usd <= 10);

alter table studio.pieces add constraint pieces_adaptation foreign key (adaptation_id) references studio.adaptations(id);

alter function studio.agents_three() set search_path = '';

commit;
