# Handoff: voice-improv (improvising, and timing without a button; DRAFT branch report)

## State, 2026-11-25 (cloud session `session_015MNLwvqWNRKiBmpphsR2Lj`, carrying on from the handoff below)

- **Step 1 done:** `origin/guide-fixes` is merged in (b7aae221), with its fix 7 server side. The one conflict was the
  comment above the Privacy key in `src/lib/legal.ts`: both "NOT REREAD YET" notes are kept, and the Privacy texts
  merged cleanly.
- **Checks (cloud container, localhost, on b7aae221):**
  - tsc: clean.
  - test:voice: 360 ok, all passed.
  - test:challenge: 565 passed, 268 moment checks.
  - next build: passed.
  - check:principles: fails P1i (own-voice-v4 is the draft, as expected), P6a (local-only), P6k (the Privacy drafts,
    unreread) and P6d (not run: no Vercel CLI). P6g failed once with the rest and passes alone.
  - check:ui: see the PR. This container's network refuses media.snowmoon.party.
- **Not done:**
  - The screenshots and their R2 page (step 3). The script is on the Mac, and there are no R2 keys here.
  - Merging. It waits for Nate's reread and word.
- **The PR body carries the reread list below.**

## Handoff (2026-11-24, ~13:30 PT; Nate's laptop closing; a cloud session carries on from here)

**State:** pushed and clean at `20f2b9af` (and this report's commit after it). No PR yet. Not to merge: Nate's reread
and merge word first. No SQL.

**Done:** everything in "Done" below. tsc clean; test:voice 339 ok, all passed (on 20f2b9af).

**Left, in order:**
1. **Merge `origin/guide-fixes`** into this branch when it lands (or once it is on main): another agent's six
   guided-storyboard fixes (voice-guide.tsx's conversation layout, look/clothes references in shot-picture.ts, Make
   it/progress, the ask box, and /ephelion replacing /storyboard/record with a redirect). Resolve in favour of both;
   expect conflicts in `src/components/voice-guide.tsx`, `src/lib/voice/shot-picture.ts`, `src/components/voice-record.tsx`.
   Then re-run tsc and test:voice. (The screenshot script opens `/storyboard/record`: follow the redirect or use `/ephelion`.)
2. test:challenge, the production build, the screenshots, check:principles and check:ui (the run
   `/Users/nathan/ephelion-voice-screens/imp-full.sh` was started at ~13:20 and may finish; its log is `/tmp/imp-full.log`).
   Expected: check:principles fails only P6a and P6d (local-only), P6k (the Privacy drafts, unreread) and P1i (consent
   v4 is the draft); check:ui only the two known /challenge/make "Make it" items.
3. Upload the screenshots: `node /Users/nathan/ephelion-voice-screens/improv/page.mjs` (R2 keys from main's `.env.local`,
   never printed) and put the link here and in the PR.
4. Open the PR (title: "Voice improv: improvising, the transcript as the words, no Time this reading (not to merge yet:
   needs Nate's reread)"), body = the "For Nate's reread" list below.

**How to run its tests** (on a Mac with the worktree; a cloud session: clone, `npm ci` in its own checkout, and skip
the lock):
- Worktree `/Users/nathan/snowmoon-voice-improv`; `node_modules` is a symlink to the main checkout's: **never `npm
  install`/`npm ci` there**.
- Every tsc/test/build/server holds the shared lock: `mkdir /Users/nathan/.snowmoon-heavy.lock` (wait while it exists),
  write an owner line into it, `rm -rf` it on exit (a trap). Background jobs over 30 minutes need a long timeout, or
  they are killed with the lock held.
- `npx tsc --noEmit -p .`; `npm run -s test:voice`; `npm run -s test:challenge`.
- A build or server **never** runs on `.env.local` (production): move the worktree's `.env.local` aside by absolute path
  and put it back after; never touch the main checkout's `.env*`. Build: `env -u VERCEL -u VERCEL_ENV
  STUDIO_DATABASE_URL= npm run build`. Then `npx tsx scripts/voice-demo-db.ts --port=54389 &`,
  `STUDIO_DATABASE_URL=postgres://studio_writer@127.0.0.1:54389/postgres npx next start -p 3089 -H 127.0.0.1 &`,
  `npm run -s check:principles -- --url=http://127.0.0.1:3089`, and (only when the load is under 8) `npx tsx
  scripts/check-ui.ts --url=http://127.0.0.1:3089`. No production secrets, no `vercel env pull`, no spending.

**For Nate's reread (paste waiting):**
- Label lines (Nate's own): "word for word"; "improvised on 'Doing fine' (version 2)".
- Credit (Nate's own form): "Words by @name, improvising on 'Doing fine' · [the speech's credit]"; on the closing card the
  AI line becomes "Voice converted by …; the spoken words transcribed by …" and the site line "People did the
  performance, its words and the words for each picture. AI did the voice conversion, the transcript and the pictures."
- Record page (Draft wording): "Read it word for word, or improvise around its theme in your own words. A take is at
  most 2:00; the recording stops when the countdown reaches 0:00."; Stop button "1:18 left"; under an improvised take
  "Your storyboard will use your own words, as transcribed. Before you storyboard it, you can correct the transcript
  below, under Your drafts."; the folded word check "Meant it word for word? N of M sentences don't match the speech:
  redo them."
- Correction screen (Draft wording): "Correct the transcript of your words"; "This is what the transcription heard you
  say, sentence by sentence. Correct any word it got wrong; your storyboard and its credits use these words. Only you
  change them: no model edits them."; "Sentence N"; "Keep my corrections"; "Kept: your corrected words are your
  storyboard's words. The correction is in the draft's recipe."
- Board and guide: "Your words" in place of "Book" over an improvised take's words.
- P2 line (Nate's own words, in `docs/principles.md` under Improvising).
- Privacy §7 (Groq) and §4 (speeches), and own-voice consent v4 (points 1, 4, 7): word for word in
  `docs/legal/voice-improv-draft.md`.
- **A decision:** the book speech (c13-b64) takes about 2:40 word for word, so it is allowed 3 minutes
  (`VOICE.takeMaxSecondsFor`); every other take 2 minutes.
- No SQL to test.

Branch `voice-improv`, from main 8a5e3de2 (2026-11-24). Written by the coding agent (Claude, a closed model by
Anthropic) for Nate, and kept current so a later session (local or cloud) can carry on from it. Not merged: it merges
only after Nate's reread and merge word. No SQL.

## Nate's ask (2026-11-24, verbatim points)

- improvise around a speech's theme, within 2 minutes a take, shown as a countdown that stops the recording;
- the take is transcribed (scribe_v3) and the storyboard's spoken words are that transcript; cuts and the guide's plan
  follow the transcript's sentences;
- the person can correct the transcript of their own words before storyboarding; no model edits it;
- the word check only labels the take: "word for word", or "improvised on 'Doing fine' (version 2)";
- credit: word for word keeps today's; improvised: "Words by @name, improvising on 'Doing fine' · [the speech's credit]";
- "Time this reading" goes: a reading is timed when made, an older one when first opened, no button, admins' pool;
- a P2 line for his reread, and any Privacy or consent drafts.

## Done (pushed)

- `src/lib/voice/spoken.ts`: the spoken words (`recipe.spoken`: word for word, or improvised with the performer's
  sentences and each correction), the transcript split into sentences (at . ! ?, a 0.8 s pause, or 30 words), the
  improvised strip, the label, the improvised credit, the take limit (`takeMaxSeconds`).
- `src/lib/config.ts`: `takeMaxSeconds` 120; `takeMaxSecondsFor` gives the book speech (c13-b64) 180, because it takes
  about 2:40 word for word: **a decision for Nate** (flagged in the PR).
- Convert route: refuses a whole take over its limit (+1 s for the recorder's stop).
- Keeping a take (`keep-converted.ts`) and "Check the words" (`recheck-draft.ts`): word for word keeps the speech's strip;
  otherwise the strip is the transcript's sentences and `recipe.spoken` is improvised.
- `POST /api/voice/drafts/<id>/words` (`correct-words.ts`): the person's corrected words, one text per sentence, kept
  again under a new id with the correction in its history (when, by whom, the words before); no model; refused once a
  storyboard is saved. Corrected words that are the speech's, word for word, label and credit the take word for word.
- Boards route: `sentences` are the spoken words; `take: { label, improvised }`; a reading with no timings is timed on
  its first open (no 409, no button), paid from the admins' pool (`READINGS_FUNDED`).
- Reading route: a new reading is timed right after it is made.
- The guide receives the spoken sentences (the performer's for an improvised take) and refuses both the performer's and
  the speech's words in any draft.
- Publishing: an improvised take isn't held to the speech's words; the recipe keeps `spoken` and `take.label`; the
  credits' first line is the improvised credit; the AI and site lines say "transcript" instead of "word check".
- Published page: shows the performer's words for an improvised take; the kicker says "Words improvised on '…' (version
  N)".
- Record page: "2. Record your take", the intro line and the countdown on Stop ("1:18 left"), the label after
  conversion, the word check folded under "Meant it word for word?", each draft's label, and "Correct the transcript of
  your words" on an improvised draft. Board and guide: "Your words" in place of "Book" for an improvised take.
- "Time this reading" screen removed from the board page.

- Legal drafts (no key set; P6k and P1i red until Nate's reread): Privacy §7's Groq item and §4's speeches item in
  `src/lib/legal.ts`, own-voice-v4 as the consent file's draft (the voice pages show it), all in
  `docs/legal/voice-improv-draft.md`.
- P2's improvising line in `docs/principles.md` (for Nate's reread), and check:principles P2v with a planted fault.
- test:voice section IM (each point above).

## Left (in order)

1. tsc and test:voice on this branch (queued on the shared lock), and fixing what they find: older sections expected
   every take's strip to be the speech's, but the stub always mishears one sentence, so its takes are now improvised.
2. Screenshots at 390 and 1440 (`/Users/nathan/ephelion-voice-screens/improv/run.mts`, on a production build with the
   worktree's `.env.local` moved aside) to R2 review/<hex>/; link here and in the PR.
3. test:challenge, check:principles, check:ui on localhost; open the PR (not to merge: Nate's reread first).

## How to run the tests

From the worktree (`/Users/nathan/snowmoon-voice-improv`; node_modules is a symlink to the main checkout's: never
`npm install` there), holding the shared lock `/Users/nathan/.snowmoon-heavy.lock`:

- `npx tsc --noEmit -p .`
- `npm run -s test:voice` (PGlite, the ElevenLabs stub, stand-in pictures; no spending)
- `npm run -s test:challenge`
- check:principles and check:ui need a build and a local server on a throwaway database, with the worktree's `.env.local`
  moved aside: `npm run build`, `npx tsx scripts/voice-demo-db.ts --port=54382`, then `STUDIO_DATABASE_URL=postgres://studio_writer@127.0.0.1:54382/postgres npx next start -p 3077`,
  then `npm run -s check:principles -- --url=http://127.0.0.1:3077` and `npx tsx scripts/check-ui.ts --url=http://127.0.0.1:3077`.
  Known local-only results: P6a, P6d; check:ui's two /challenge/make "Make it" items.

## The other open PRs (2026-11-24)

- #225 moderation: migration 0052 applied by Nate; the main session merges it after its checks.
- #229 storyboard picture allowance: migration applied, reread with Nate's change to the fifth line; merges after #225.
- #232 voice testers (Luis 6852, Freymon 665530): merges if test:voice and check:ui pass.
- Three ways in (from scratch / new pictures for an existing recording / your voice over an existing storyboard): its
  own branch, another agent.
