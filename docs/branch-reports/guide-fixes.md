# HANDOFF: branch guide-fixes, the guided storyboard's fixes for the testers (DRAFT)

**Handoff, 2026-11-24, Nate's laptop closing; a cloud session carries on from here.** State at the last push:
- All seven fixes are written, and the code of 1–7 is committed. **Not yet run:** tsc, test:voice and the other
  checks (the shared lock was busy). Run them first; fix what fails.
- **Left, in order:**
  1. Run the checks below. Fix failures, which are most likely in test-voice's GU section (fix 1 changed which
     references a guided shot sends).
  2. **Fix 7's server side**: written (untested). The page sends its own fingerprint of the recording (`takeSha256`,
     computed on the device) and `again=1` only after "Convert again". `/api/voice/convert` refuses a whole take
     already converted into a draft with 409, `reason: 'converted'`, before anything is counted
     (`src/lib/voice/converted-before.ts`). `convertTake` checks the real sha256 as a backstop, through a new
     `deps.convertedBefore` that never sees the take (P1h). Tests: test:voice section $, "fix 7". The `again` and
     `takeSha256` fields are new: check the P1h static scan still passes.
  3. The 390 px recording of the whole flow: `/Users/nathan/ephelion-voice-screens/guide-fixes/flow.mts` (outside
     the repo). Run it after a local production build, with the worktree's `.env.local` moved aside. Upload the
     screenshots and video to R2 review/<random hex>/ with an index page; the R2 keys are in main's `.env.local`,
     never printed.
  4. Open the PR: "Guided storyboard fixes for the testers (not to merge yet: Nate's word)". Merge only on Nate's
     word.
- **Waiting for Nate:** the reread of the Privacy line in fix 2 (below; P6k is red until then). Fix 7's words are
  reread (2026-11-24).


2026-11-24. Written by the coding agent (Claude, a closed model by Anthropic). Nate went through the guided storyboard
on his phone on 24 Nov and asked for these fixes before the testers (Garance 193912, Luis 6852, Freymon 665530) try it.
Not merged: merging waits for Nate's word. Kept current as the work goes; a cloud session may carry on from here.

## Done

1. **The wrong look on shot 1.** Cause, read read-only on production (draft 9a57e92f…):
   - The guided draft reused a board begun on the storyboard page on 23 Nov. There, shot 1 was kept (picture c3922cad)
     with look "Animated series, B", the "Comic book" style and no scene.
   - On the 24th, in the guide, the look saved for every shot was "Animated series, C" with "Comic 3D mix" (board v4),
     and a new scene was kept.
   - The old shot 1 stayed marked kept, so the page showed it as shot 1 and the guide offered it as continuity for
     shot 2. Its try from the 23rd also counted, which is why the button already said "Try again" (fix 3).
   - The old rule (`oldSceneShots`) missed it, because it only marks a shot made with *another* scene, not with none,
     and it never compares the look.
   - The fix: `staleShots` in `src/lib/voice/board.ts`. A kept shot made with another scene or none, or with another
     look, is not this scene's picture, unless the person confirmed it with this scene. The server never sends it as
     a reference, and the guide is never offered it.
   - The guide page shows it as "made with another look or before this scene" and doesn't count it as done.
   - For every shot in the scene, the server sends the kept scene and the board's look first, whatever an older page
     state or the guide's draft sent. What the site adds is recorded as the site's choice ("chosenBy: site") in the
     recipe.
   - On the page, the scene and his look are locked on in the reference list.
   - Tests (test:voice GU): `staleShots` on Nate's case; a look change leaves out the stale shot and the old look;
     the site puts the look back when the person drops it.
2. **The clothes.**
   - When the clothes are described, the scene and its shots send the look's face only: a head crop of the sheet's
     front view (`src/lib/voice/head-crop.ts`, a fixed box with sharp, no model).
   - The crop is recorded in the recipe with its box and the sheet picture it came from.
   - The clothes come first in the prompt ("Clothes: …"), and the look's text is marked "the face only; the clothes as
     above".
   - Stand-in references are now real blank pictures, so the crop runs locally too.
   - A failed crop refuses the picture rather than send the whole figure.
   - Tests (GU fix 2): the crop is recorded; the clothes lead the prompt and aren't repeated.
   - Privacy §7's storyboard item gets "(only its face, if you describe the clothes)", for Nate's reread
     (`docs/legal/guide-fixes-draft.md`). P6k is red until then.
3. **"Make it" first, progress, failure.**
   - "Make it" until a picture is made on the page, then "Try again".
   - While it works: "Making shot 2… about 40 seconds". The estimate comes from the continuity test's measured times:
     GPT Image 39–60 s, Gemini 12–18 s, FLUX 3–7 s.
   - A failure says so under the button.
4. **Ask the guide.**
   - The box sends at every step. It was disabled at the scene picture step: it now asks for a new setting there.
   - It says what it's for at each step, with examples to tap ("make him lean in", "a close-up on his hands", …).
5. **A conversation.**
   - The guide's turn is a bubble in the dialogue, holding its question and its choices as cards: use this setting or
     these clothes, the looks, Make it, Use this plan or "Plan it for me", Keep this one, previous and next shot.
   - The finished steps fold under "Earlier".
   - The composer sticks to the bottom of the screen.
   - Every text box is still a PublishedTextField (P1f).
6. **/ephelion.**
   - The record page moved to `src/app/ephelion/`, keeping its metadata and embed.
   - /storyboard/record now redirects there permanently (308, a page with `permanentRedirect`; no change to
     next.config.ts or the middleware).
   - Updated: the embed, the board's links, the record page's own address line, check:miniapp (a 308, then /ephelion's
     embed), test-voice-leave and voice-screens.
   - Don't give the link to the testers until #232 (testers) is merged and these fixes are live.
7. **Convert once** (the coordinator's message, from Nate).
   - One tap converts once: a ref guard, not React state.
   - A recording already converted (this page, or kept from this take) no longer shows the tick and Convert. It shows
     "Not happy with it? Convert this recording again: it uses one of today's 2 takes." with "Convert again" and
     "Keep this one" (`src/lib/voice/convert-again.ts`), for Nate's reread.
   - The words are reread by Nate (2026-11-24), so no "Draft wording" mark.
   - The server refuses a second whole conversion of the same recording unless the page sends "Convert again"
     (written; see the handoff above).

## Left
- Checks on the full branch: tsc, test:voice, test:challenge, check:principles, check:ui (localhost).
- The 390 px recording of the whole flow, and the PR.

## How to run the tests
Rules:
- Every tsc, test, build and server holds `/Users/nathan/.snowmoon-heavy.lock`: mkdir to take it, write an owner
  line, rm -rf it on exit.
- No server on `.env.local` (production): move the worktree's aside by absolute path, and restore it after.
- Run check:ui only when the load is under 8.
- Never `npm install` here: node_modules is a link to main's.

Commands (on a local runner, `/Users/nathan/ephelion-voice-screens/guide-fixes/tsc.sh voice` runs tsc and test:voice
under the lock). From the worktree:
- `npx tsc --noEmit -p .`
- `npm run test:voice` (sections GU and GF hold these fixes)
- `npm run test:challenge`
- check:principles and check:ui against a local production build: move `.env.local` aside first, then run
  `npx tsx scripts/voice-demo-db.ts --port=<p>` and `next start` with `STUDIO_DATABASE_URL` set to it.
