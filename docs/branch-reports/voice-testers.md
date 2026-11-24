# handoff: voice-testers (PR #232), 2026-11-24

Written by the coding agent (Claude, a closed model by Anthropic) for the session that carries on. DRAFT report.

## Done
- **The list:** `VOICE.testers` = 6852 @luisotravez (Luis) and 665530 @freymon.eth (Freymon), looked up on Farcaster's public API on 2026-11-24. Garance (193912) is already an admin.
- **What testers get:** the voice pages admins get (`voiceAllowed` through `voiceInsider` in `src/lib/voice/flag.ts`); takes and storyboard pictures on the admins' pool (`fundedFor`, `realPicturesFor`, the picture spend pool `admin`).
- **Nothing else of an admin's:** `isAdmin` is unchanged, and a test checks that only the voice code reads the list.
- **Tests:** test:voice section T. No migration and no legal change.
- **Branched from main 8a5e3de2.** Its checks (tsc, test:voice, build, check:ui on localhost) were queued at handoff: `/Users/nathan/ephelion-voice-screens/v232-run.sh`, log `/tmp/v232-run.log`.

## Left, in order
1. **Checks:** if the queued run didn't finish, run tsc, test:voice and check:ui (localhost) on this branch. If main has moved, merge main in first. Nate's condition: **merge if test:voice and check:ui pass** (check:ui: only the two known /challenge/make items).
2. **Merge:** `gh pr merge 232 --merge`. It goes first, ahead of #225 and #229, because it's needed for the testers' call.
3. **Live checks:** check:shipped, check:principles, check:ui and check:miniapp against `--url=https://snowmoon.party`, and report.
4. **Don't give the testers the link** until this is merged AND the guide fixes (branch guide-fixes) are merged (Nate, 2026-11-24).

## How to run the tests
- Lock, env and server rules as in docs/branch-reports/voice-moderation.md on #225's branch.
- Commands: `npx tsc --noEmit -p .` and `npm run -s test:voice`. check:ui needs a build and a demo DB, as there.

## Paste waiting for Nate
None.
