# handoff: voice-picture-allowance (PR #229), 2026-11-24

Written by the coding agent (Claude, a closed model by Anthropic) for the session that carries on. DRAFT report.

## Done
- **The allowance:** storyboard pictures get their own, 20 a person a day on any model, a GPT picture counting as 1 (`VOICE.pictures.perPersonPerDay`). They are kept apart from the images' 10 a day.
- **The pool:** $20 a day for storyboard pictures (`VOICE.pictures.dailyPoolUsd`, pool `storyboard`). Admins stay on the admins' pool.
- **Reviews:** both numbers are to be reviewed after the challenge's first three days (in config and in the launch list).
- **Off for everyone else:** `VOICE.realPictures` stays `'admins'`, so the allowance applies only once everyone is let in.
- **Lines reread by Nate on 2026-11-24, with his one change to the fifth** (no "Draft wording" marks):
  - "14 storyboard pictures left today"
  - "You've made today's 20 storyboard pictures. Your storyboard is saved: make the rest from {reset}."
  - "Today's storyboard pictures for everyone are used up. Your storyboard is saved: make the rest from {reset}."
  - "You've converted today's 2 takes. Your drafts are kept, and your recording stays on this device: convert it again from {reset}."
  - "Today's voice conversions for everyone are used up. Your recording stays on this device: convert it from {reset}."
  - `{reset}` is midnight UTC, written by the browser in the person's own time.
- **Privacy §4:** the daily-count item adds "storyboard pictures". Reread by Nate on 2026-11-24, as drafted. **The key is not set yet:** set it at the merge, after main is merged in (see below).
- **Migration:** `supabase/migrations/NEXT_storyboard_pictures.sql` (lets `image_asks.pool` and `image_costs.funded` take `storyboard`). **APPLIED** on production by Nate (A, B and C at once, Success).
- **Head:** the reread commit on top of 0b86b480.
- **Checks on 0b86b480 (before the reread edits):**
  - test:voice: 332 ok;
  - test:images: 186 passed;
  - check:principles: P6a, P6d and P6k (unreread) fail;
  - check:ui: only the two known items.

## Left, in order (after #225 merges and its live checks pass)
1. **Merge main in:** `git merge origin/main`. Expect conflicts in `src/lib/legal.ts` (the Privacy key and comments: keep main's comments, add this one), `scripts/test-voice.ts`, and maybe `src/lib/voice/shot-picture.ts`, `src/lib/images/limits.ts` and `costs.ts`. #232 (testers) changes the same pool checks to `voiceInsider(fid)`; keep it.
2. **Number the migration:** the next free number on main, 0053 if #225 took 0052. `git mv` it, and update its header to "APPLIED on production by Nate, 2026-11-24".
3. **Set the Privacy key:**
   - Compute it: `npx tsx` a two-line script importing `PRIVACY` and `legalKey` from `src/lib/legal.ts`, printing `legalKey(PRIVACY)`.
   - Set `LEGAL.privacy.words` to it, with the comment: "2026-11-24, owner's reread for #229: "reread too: Privacy §4's daily-count item with "storyboard pictures" added, as drafted". The words before were <main's key>."
   - Set `LEGAL.effective` to the merge day (Pacific).
4. **Run on the merge result:** tsc, test:voice, test:images, test:challenge, check:principles and check:ui (localhost; known local items only: P6a, P6d and the two /challenge/make items).
5. **Merge:** `gh pr merge 229 --merge` (Nate's condition: only the known local items).
6. **Live checks:** check:shipped, check:principles, check:ui and check:miniapp against `--url=https://snowmoon.party`, and report.

## How to run the tests
- Lock, env and server rules as in docs/branch-reports/voice-moderation.md on #225's branch.
- Extra commands: `npm run -s test:images` and `npm run -s test:challenge`.

## Paste waiting for Nate
None. The SQL is applied and the rereads are done.
