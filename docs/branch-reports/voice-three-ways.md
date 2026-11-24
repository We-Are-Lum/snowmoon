# Branch voice-three-ways: three ways in (DRAFT)

Nate's item 3 of 2026-11-24. Built by the coding agent (Claude, a closed model by Anthropic). Its own PR; merge only on
Nate's word. Kept current after every step, so a cloud session can carry on from here.

## Nate's words

> 3. Then, on its own branch (this one may run overnight): three ways in, chosen on the first screen:
> - From scratch: your speech (recorded, or a ready-made reading) and your own pictures, as today.
> - New pictures for an existing recording: a ready-made reading now, and published takes once publishing is on,
>   credited to their performer.
> - Your voice over an existing storyboard: pick one (team-made, or published and credited), record your take, then
>   make each picture shorter or longer to fit, by dragging or by asking the guide ("make shot 3 longer").
> Draft the three choices' words for my reread, and say which team-made storyboards we'd start with. Its own PR; merge
> only on my word.

## The three choices' words (for Nate's reread; "Draft wording" on the page)

Heading: **Three ways in**

| Way | Title | Line | Under it |
|---|---|---|---|
| 1 | Start from scratch | Record the speech yourself, or start from a ready-made reading, then make your own pictures. | Everything is yours: the voice, the cuts, the scene and every picture. |
| 2 | New pictures for a recording | Pick a recording that already exists and storyboard it with your own pictures. | Ready-made readings now; published takes once publishing opens, each credited to its performer. |
| 3 | Your voice over a storyboard | Pick a storyboard, record your take, then make each picture shorter or longer to fit your voice. | Team-made storyboards now; published ones once publishing opens, each credited to its maker. |

Other new lines on the pages (also Draft wording):
- Way 2, nothing to choose: "No recording to choose yet."
- Way 2, before publishing: "Published takes appear here once publishing opens."
- Way 3, nothing to choose: "No storyboard to choose yet: the team's come first."
- Way 3, after picking a storyboard: "Record this speech below and keep your take. Then fit the storyboard to it: each picture stays as it is; you make it shorter or longer to fit your voice."
- Way 3's button: "Fit "…" to your take of <date>".
- The fit panel's heading: "Fit the pictures to your voice". Its note: "The pictures of "…", the storyboard by @…, as they are. Make each one shorter or longer to fit your voice, here or by dragging a cut on the strip below."
- The fit panel's controls:
  - each shot: Shorter / Longer;
  - "Or ask the guide, in your own words" (placeholder "Make shot 3 longer");
  - on the guide's proposal: Use it / No, thanks.

## Which team-made storyboards to start with (proposed, for Nate)

Production today (read-only, as studio_writer, 2026-11-24) holds three storyboards, all Nate's, and none is complete:
- `9c51bd22-ade7-4122-acdc-8951ec69f07a`: on the ready-made reading of "Doing fine" v2 (voice ephelion-warm-lecturer-2). Version 5, 5 shots, 1 picture kept.
- `9a57e92f-4cd8-4b40-8ab4-6e51db3a4619`: on Nate's performance of "The last five years" v2. Version 2, 6 shots, 1 picture kept.
- `f7df6d2e-ee00-4274-b5f3-68167e8a7760`: on Nate's performance of c13-b64 (voice ephelion-light-russian). Version 1, 3 shots, no pictures.

A storyboard is offered only when every shot has a kept picture. Proposed:
1. **Finish `9c51bd22…` ("Doing fine", 5 shots):** a ready-made reading, so anyone's take of "Doing fine" can be fitted by sentence.
2. **One complete storyboard of the book's speech (c13-b64):** finish `f7df6d2e…`, or make a new one on the c13-b64 ready-made reading once it exists. The book speech is what most testers will record.

**How they're marked:** `VOICE.teamBoards` in `src/lib/config.ts`, a list of `{ draftId, fid, title }` that Nate fills in. It is empty today, so way 3 shows "No storyboard to choose yet" until he does.

## What's built (all on this branch, not merged)

- **`src/lib/voice/three-ways.ts`** (pure):
  - the words;
  - `fitShots`: a reused storyboard's cuts move to the same sentence's end in the new take, or keep their share of the length snapped to word ends, never leaving a shot under 2 s;
  - `nudgeShot`: Shorter / Longer;
  - `retimed`: shots kept by position;
  - `reusedProblems`: only the timing changes;
  - `timingFromWords`.
- **`src/lib/voice/three-ways-server.ts`** and **`/api/voice/ways`**:
  - GET: published takes (once publishing is on) and reusable storyboards (team, and published once publishing is on).
  - POST: fit the chosen storyboard to the person's own new take. Each picture is copied as it is, its sha256 checked, its recipe kept with `reusedFrom`, and the board carries its `source`.
- **Board saves** (`/api/voice/boards`): on a reused board only the timing is saved; the shots, pictures, words, cameras, scene and closing card stay as reused.
- **The guide:** a `timing` step that only proposes `{ shot, change, seconds }`; the person presses "Use it". On a reused board the guide drafts no prompts.
- **Published takes** (`board-store.ts` `sharedTake`, `drafts.ts`): someone else's take is shared only while publishing is on and its performer's own storyboard of it is published, live and named.
- **Credits** (`closing.ts`, `publish.ts`): "Storyboard by @maker … Each picture's timing fitted to this voice by @you"; on someone's published take, "Performed by @performer" and "Storyboard by @you … on @performer's published take". The published recipe keeps `source` and `takeBy`.
- **Pages:**
  - the three choices at the top of /storyboard/record (`src/components/voice-ways.tsx`);
  - on a reused board, the fit panel: each shot's picture and length, Shorter / Longer, ask the guide, drag a cut on the strip. The editing sections are hidden there.
- **SQL:** `supabase/migrations/NEXT_voice_three_ways.sql`, for Nate to test:
  - `voice_boards.source`, with a check;
  - the guide's `timing` step;
  - `publish_voice_board`, which lets someone publish their board on another person's published, named take; only the performer's own publishing marks the take published;
  - `take_down_voice_publication`, which leaves the performer's take alone when someone else takes theirs down.
  - Each function is written out in full in D, the undo.
- **Legal:** `docs/legal/voice-three-ways-draft.md`. Nothing in `legal.ts`: reusing others' published work waits for the publishing release.

## Left

- Nate's reread of the words; his list for `VOICE.teamBoards`; testing the SQL, then "applied".
- Screenshots at 390 and 1440 (the first screen, each way, the fit panel): see "Review page" below once taken.
- **When #225 (moderation) merges:** a hidden publication must not count as shared or reusable. Add `hidden_at is null` to `sharedTake`, `sharedTakes`, `reusableBoards` and the SQL function's check.
- **guide-fixes** (another agent; the coordinator, 2026-11-24): `voice-guide.tsx` becomes a conversation with tappable cards, look and clothes references in `shot-picture.ts`, Make it and progress, the ask box, and `/ephelion` replacing `/storyboard/record` (a 308 redirect). The three ways' first screen then lives at `/ephelion`. Merge `origin/guide-fixes` in as soon as it has commits (none yet at this writing), and move the VoiceWays mount, the links (`/storyboard/record`), the screenshot script and the tests to `/ephelion`.
- **When voice-improv merges:** an improvised take has its own sentences, and `fitShots` then fits by length (tested). Merge `origin/voice-improv` in whenever it has new commits.

## How to run the tests

From the worktree (`/Users/nathan/snowmoon-voice-three-ways`), under the heavy lock:
- `npx tsc --noEmit -p .`
- `npm run -s test:voice` (section 3W), `npm run -s test:challenge`
- `check:principles` and `check:ui` on a local build with the demo database. Use `scripts/voice-demo-db.ts`, `next start`, and move `.env.local` aside first.

## Results

(updated after each run)
