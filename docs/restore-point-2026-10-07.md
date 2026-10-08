# Restore point before the 2026-10-07 merge

Production before the merge of foundations, first-visit-intro, minpentai-rules and
chat-slice-1 (owner instruction, 2026-10-07):

- Commit: `97de7d0` (main)
- Deployment: `dpl_9QDLhRmho45joM58zTkQF9uoK3vM`,
  https://snowmoon-9cwyr2d4j-nates-projects-d1780cff.vercel.app

One step puts that deployment back on snowmoon.party:

    vercel rollback dpl_9QDLhRmho45joM58zTkQF9uoK3vM --scope nates-projects-d1780cff

After a rollback, Vercel stops promoting new production deployments automatically until one
is promoted by hand (`vercel promote <deployment>`). Migration 0006 only adds a column, an
index and a table, so the old code runs unchanged against the migrated database; nothing in
the database needs undoing.

## 2026-10-08: before the site rebuild (branch site-rebuild)

Production before the merge: commit `858529a` (main), deployment taken at merge time; the
one-step restore for this change is recorded with the deploy in the report.
