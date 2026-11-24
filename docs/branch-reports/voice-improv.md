# voice-improv: improvising, and timing without a button (DRAFT branch report)

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

## Left (in order)

1. tsc and test:voice (not run yet on this branch).
2. Tests in `scripts/test-voice.ts` for each point (see the PR's list).
3. Legal drafts: Privacy §7's Groq item (the guide receives the transcript), §4's speeches item (the transcript and its
   corrections are kept with the draft), own-voice consent v4 (improvising; the words transcribed and kept as the
   storyboard's words). In `docs/legal/voice-improv-draft.md`; no reread key set.
4. P2 line in `docs/principles.md`, for Nate's reread; a check:principles item if needed.
5. Screenshots at 390 and 1440 (countdown, label, correction) to R2 review/<hex>/; link here and in the PR.
6. test:challenge, check:principles, check:ui on localhost; open the PR.

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
