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

## 2026-10-08: the frame made as light as the prototype (branch site-lightness)

Type, spacing and weights measured against the clickable prototype; touch targets as invisible
44px hit areas on touch screens only; one "Draft wording" line per screen; no hyphenation; links in
the prototype's accent; a plain Listen progress bar with image marks. To undo it (back to `8491af9`):

    vercel rollback dpl_2tCMnup8RvLVVP7pKiNKg8hsXPX8 --scope nates-projects-d1780cff

## 2026-10-08: the owner's wording (branch site-wording)

The owner's words and approvals from the draft-wording doc (docs/prompts/011-wording-decisions.md):
the assistant (all but the notice), sign-in, the recipe sheet, the pronunciation page and the intro
now show the owner's wording, tagged FID 6786, with no draft line. To undo it (back to `afc272c`):

    vercel rollback dpl_AN1A6jZANZkfqrRvpyt5Ls3vnjfv --scope nates-projects-d1780cff

## 2026-10-08: website sign-in fixed; podcast owner; node_modules untracked (branch site-contact)

Website sign-in failed at the first step on production: the start route sent the nonce as
`{ nonce }` (what `generateNonce` resolves to) instead of the string, and the relay refused it
(400, "body/nonce must be string"). Fixed; both sign-in routes now log the upstream status (never a
token, message or signature); check:shipped now starts a sign-in and needs a Farcaster link and a
QR code back. Also: itunes:owner with the owner's contact, and the committed node_modules link
removed. To undo (back to `dd32480`):

    vercel rollback dpl_81niopCmc1t8LecYdxFBePq2hPji --scope nates-projects-d1780cff

## 2026-10-08: links to other sites open in a new tab (branch site-links)

One listener for the app (src/components/external-links.tsx); inside a Farcaster app the host's
openUrl. check:ui clicks the chapter's source-edition link and needs a new tab. To undo (back to `68e475d`):

    vercel rollback dpl_EgcPUfj2h12pXQZibuYqahxDSmjt --scope nates-projects-d1780cff

## 2026-10-08: adaptations out of view (branch site-no-adaptations)

ADAPTATIONS.visible = false (src/lib/config.ts): no Adaptations in the rail, menu or intro list;
no "cited in" marks; /adaptations and its pages say nothing is published yet. Files kept. To undo
(back to `61d6b4a`):

    vercel rollback dpl_AWEuFNYMMndxuQ8fmPRaD15oaP7F --scope nates-projects-d1780cff

## 2026-10-08: readers' images, slice 1 "Trial" (branch site-images)

Migration 0008 applied by the owner. Making images needs FAL_KEY and the R2 variables in
Production (see the report); until then the composer says it isn't set up. To undo (back to
`a228576`; 0008's tables can stay, nothing reads them then):

    vercel rollback dpl_EaZuNFKqB95P7YVx4LnV9au5uQuU --scope nates-projects-d1780cff

## 2026-10-08: Minpentai Learn after Design's v3 (branch site-minpentai)

The tutorial becomes Learn: eight watch screens over the recorded match in 3D (three.js bundled),
seven lessons on the real engine, Under the hood, a practice match with one new rule. Play and
Sandbox unchanged. To undo (back to `f21b536`):

    vercel rollback dpl_2Z3E2iKHjqxy3ncnf19MnxWVj3Jk --scope nates-projects-d1780cff

## 2026-10-08: readers' image screens restyled to Design (branch site-images-restyle)

Composer, draft, preview, image page, feed, readers' strip, report sheet and moderator queue in
Design's layout; slice 1's rules unchanged. To undo (back to `6871964`, Minpentai Learn):

    vercel rollback dpl_EpU9y57k4AeZ1VyJM3q1N9rzCCUc --scope nates-projects-d1780cff
