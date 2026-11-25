# Back to the Mac session: branch guide-fixes, the guided storyboard's fixes for the testers (DRAFT)

**Back to the Mac session (2026-11-25, from cloud session `session_015MNLwvqWNRKiBmpphsR2Lj`).** PR #235 is open;
the cloud session pushes nothing more here.
- **Done:** all seven fixes, including fix 7's server side. tsc, test:voice (344), test:challenge, the build and
  check:principles were run (details below).
- **check:ui here:** it never got a full pass in this container. Every branch run broke at `/references` on a stalled prefetch of `/references/glossary`, and a probe reproduced the same stall on an unchanged main build (main's own run happened to pass). This container also can't reach media.snowmoon.party. check:ui doesn't cover the voice pages. **Left: one clean check:ui run on the Mac before merging.**
- **Left:** check:ui on the Mac; the 390 px recording of the whole flow (`flow.mts`) and its R2 page; Nate's two
  rereads (Privacy §7's face-only line, and the 409's words); merging, on Nate's word.

**State, 2026-11-25 (cloud session `session_015MNLwvqWNRKiBmpphsR2Lj`, carrying on from the Mac's handoff):**
- **Checks on this branch (cloud container, localhost):** tsc clean; test:voice 344 ok, all passed; test:challenge 565
  passed, 268 moment checks; production build passed; check:principles: P6a (local-only, known), P6d (not run: no
  Vercel CLI here) and P6k (the Privacy draft below, unreread) fail; P6g failed once when run with the rest ("fetch
  failed" loading /privacy) and passes alone. check:ui: see the PR (this container's network refuses
  media.snowmoon.party, so pages that show the site's pictures can't load them here).
- **What the cloud session changed:**
  - tsc: a duplicated `made` in shot-picture.ts.
  - test:voice's 6 failures were tests written before fix 1. The board's look now goes with every shot in the scene, so:
    a second test look is seeded; shot 2's expected references are the scene, the look, then shot 1; the admin's
    real-pictures test gives the look's sheet picture.
  - Two server fixes the tests found. A request naming two looks is still refused (400). More than 3 references are
    refused, before and after the site adds the scene and the look, instead of being cut short without a word.
  - The recipe: the person's edit of the guide's references is judged on what they sent, before the site's changes. A
    reference the site put back is recorded as the site's (`chosenBy: 'site'`), and one it left out (a stale kept
    shot, another look) is listed in `guided.siteRemoved` with why.
  - **Fix 7's server side.** The Mac and the cloud both wrote one; they are merged into one mechanism:
    - `convertTake` calls the route's `admit(takeSha256)` with the take's sha256 only (never the take), before anything
      is sent.
    - `admit` refuses (409, reason `converted`) a whole take already kept as one of the person's drafts, unless the
      form has `again=1`. Then it checks the limits and takes the hold, so a refusal counts nothing, not even one of
      the day's takes.
    - The page sends `again=1` only from "Convert again" and reloads the drafts on a 409.
    - Dropped from the Mac's version: the fingerprint the device sent, and the second check after the take was
      counted.
    - Tests in test:voice sections V and $.
- **Left:**
  1. The 390 px recording of the whole flow (`flow.mts` on the Mac) and its R2 review page: not done. The script is
     on the Mac only, and this container has no R2 keys.
  2. Merging waits for Nate's reread and word.
- **Waiting for Nate:**
  - The reread of the Privacy line in fix 2 (`docs/legal/guide-fixes-draft.md`; P6k is red until then).
  - The 409's words (Draft wording, `CONVERTED_ALREADY` in `src/lib/voice/take-flow.ts`): "This recording is
    converted already: your draft is below. To convert it once more, press Convert again (it uses one of today's
    takes)."
  - Fix 7's page words are reread (2026-11-24).
- Not covered: two tabs converting the same recording at the same moment can both pass the check (the draft is kept
  only when the conversion comes back). One tab's double tap is stopped by the page's guard.

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
