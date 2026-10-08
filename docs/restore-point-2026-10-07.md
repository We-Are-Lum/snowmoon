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

To undo the rebuild (back to `858529a`):

    vercel rollback dpl_HXy2qrskMkCzLXuhEMGDfpQ88zpd --scope nates-projects-d1780cff

## 2026-10-08: the narration recipe link in the chapter page (P1d)

`d62f616` puts the narration credit and its recipe link in the chapter page as served; the
rebuild had left it only in the Listen view, drawn in the browser. To undo it (back to
`84b6cf6`, which fails P1d):

    vercel rollback dpl_AhVbWgVXTxtCQ5RDXwjNT41uBb1S --scope nates-projects-d1780cff

After the deploy: check:shipped, check:principles (26 of 27; P6d is the accepted open item),
check:ui, check:miniapp and check:podcast all pass against https://snowmoon.party. The feed
is valid on the W3C validator and passes Podbase.
