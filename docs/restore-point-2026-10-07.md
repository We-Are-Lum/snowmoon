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

## 2026-10-08: spend log for the local generation test (docs only)

No code change. To undo (back to `cc0fb3f`, the image screens restyle):

    vercel rollback dpl_9QJrtzj72UR4djeUNL2eoDG2me8b --scope nates-projects-d1780cff

## 2026-10-09: Minpentai Learn taken off while it is rebuilt from Design's game (branch site-learn-off)

/minpentai opens on the sandbox; Play the computer and the sandbox stay; old Learn and practice links
show "being rebuilt". The rail says "Sandbox". To undo (back to `93a308b`):

    vercel rollback dpl_Eoik1u76Yv3CsYVMmkZvDD9eD5Zy --scope nates-projects-d1780cff

## 2026-10-09: Minpentai Learn ported from Design's game (branch site-minpentai-design)

Learn back on the menu, now Claude Design's game with its own invented rules (src/lib/minpentai/learn-game/),
labelled "Rules invented for this edition"; the sandbox keeps the book's recovered rule. To undo (back to
`892b243`, Learn off with the "being rebuilt" note):

    vercel rollback dpl_C9phakj9k4DdXer1NgQimn247Eh4 --scope nates-projects-d1780cff

## 2026-10-09: the book's voting screens live (branch site-live-voting)

c1-b18, c1-b31 and c7-b6: the slider moves, the reading follows, Reset returns to the book's state;
nothing stored or sent. c7-b6 now drawn by a template (dzego/vote). To undo (back to `6aab89b`):

    vercel rollback dpl_BRKrEY8iNeVBihT1ZXrrY8J5nTog --scope nates-projects-d1780cff

## 2026-10-09: storage docs (branch site-docs-storage)

Docs only: readers' images in their own buckets marked done; README's Media section names the production key. To undo (back to `8307334`):

    vercel rollback dpl_3BQYabZ7zyMSuuamc7bEeFB8nbSB --scope nates-projects-d1780cff

## 2026-10-09: compact AI labels (branch site-ai-labels)

Captions and the narration credit become a short label with AI that opens the recipe sheet; 'AI-generated, not by the author' served and in the sheet; P2b rewritten; share cards keep the full line. To undo (back to `42507cc`):

    vercel rollback dpl_5hyJqgCDLu2WZwAGm7eim1EJCiQz --scope nates-projects-d1780cff

## 2026-10-09: Learn's rules note quotes c4-b84 (branch site-learn-quote)

The note quotes "every game there's always some kind of new rule" (c4-b84) instead of saying the rule changes every match; P8d checks the quote. To undo (back to `d31910d`):

    vercel rollback dpl_A2cLgZRsnxpueDFKZ9VTYX1MHMHT --scope nates-projects-d1780cff

## 2026-10-09: Learn full screen (branch site-learn-fullscreen)

Learn fills the screen on phones and the Farcaster frame, with a × back to the site. To undo (back to `8239d08`):

    vercel rollback dpl_7uZgLaFhNv3Bdyv6sirFKeQcpv5K --scope nates-projects-d1780cff

## 2026-10-09: Free play is Design's game; the book's rule on /minpentai/rule (branch site-free-play)

Sandbox and Play the computer out of the UI (code kept); Free play runs Design's practice match; /minpentai/rule runs the rule recovered from c4-b5. To undo (back to `284bb8c`):

    vercel rollback dpl_2RrpEYmgH1qW12YoWMz9ju7DrV9n --scope nates-projects-d1780cff

## 2026-10-09: glossary (branch site-glossary)

/glossary and /glossary/[term]: invented words with the book's own sentences, every mention and a narration clip, limited to the reader's chapters; Glossary in the menu and rail. To undo (back to `9d00b6f`):

    vercel rollback dpl_GZESByBrZCdJRUUsP6LsWd5ukn6n --scope nates-projects-d1780cff

## 2026-10-09: AI labels name who made them (branch site-ai-labels-2)

The edition's images and narration say 'by Snowmoon Party'; check:ui checks every rendered AI image and the narration control for the label. To undo (back to `43e5306`):

    vercel rollback dpl_BhSNG22KDdys4VfrA1Q3m4Zes2M9 --scope nates-projects-d1780cff

## 2026-10-09: check:ui refuses a build of another commit (branch site-checkui-build)

Checks only: check:ui fails when a local server, or the local build it starts for the readers' screens, is from another commit. To undo (back to `fa0e88f`):

    vercel rollback dpl_PdaddFGtgYMxV2NDaN489Pv3nSmt --scope nates-projects-d1780cff

## 2026-10-09: the book's sliders work (branch site-c7b6-note)

Docs only: P8e and live.ts say the book's sliders are working range inputs; the grey disabled look came from our import. To undo (back to `67bf0d3`):

    vercel rollback dpl_FQ75udfwBAfWgkDfgdhr1xHS8t89 --scope nates-projects-d1780cff

## 2026-10-09: proposal, word-only pronunciation clips (branch site-word-clips-proposal)

Docs only: docs/proposals/word-pronunciation-clips.md. To undo (back to `473f94c`):

    vercel rollback dpl_9mdPcZ8FsEE65ot9h1UoYByGtCq4 --scope nates-projects-d1780cff

## 2026-10-09: glossary First appears, review signed off, clip's AI label (branch site-glossary-2)

Every word shows the sentence where it first appears; the review file is reviewed by FID 6786; the clip carries AI voice · by Snowmoon Party; P2b and P2e cover them. To undo (back to `84b78f1`):

    vercel rollback dpl_FDdV4x29HL6WpjhSnbdbVicimTyK --scope nates-projects-d1780cff

## 2026-10-09: untrack the links d62f616 committed (branch site-untrack-links)

Repo hygiene: .venv, narration-out, images-out and art-out are no longer tracked; .gitignore entries without a trailing slash. To undo (back to `85ad0f1`):

    vercel rollback dpl_BHDcuK9uunUocUjdfaMcCn93oVa8 --scope nates-projects-d1780cff

## 2026-10-10: Minpentai Play: Design's hub, ladder, one-on-one, free play and rules page (branch site-minpentai-play-2)

Play replaces v3's four tabs: practice, a ladder against the computer, one-on-one by username or invite link, free play and full screen, on the new rules page's game; Learn stays on v3. Signed-in play uses 0009 (applied by the owner on 2026-10-09, 23:55), with per-person and sitewide limits and cleanup. A Farcaster username that doesn't fit the lobby is refused with a clear message. To undo (back to `d3d0f56`):

    vercel rollback dpl_7D1FoPE54Xh9bPz22pdQMLxhkx2b --scope nates-projects-d1780cff

Rolling back the code leaves 0009's tables in place; they are private and unused without it.

## 2026-10-10: storage check names two more variables; 0007 marked applied; check:ui and check:miniapp fixed for Minpentai Play (branch site-storage-check-names)

NEYNAR_API_KEY and SNOWMOON_ALERT_URL listed when missing (names only); 0007's header says applied; check:ui accepts a 3-point glider under cost3; check:miniapp checks ?mode=free as Play. To undo (back to `4fb3c16`):

    vercel rollback dpl_HeSRboPJkeGpgdovmhnND7kXFEVm --scope nates-projects-d1780cff
