# handoff: voice-moderation (PR #225), 2026-11-24

Written by the coding agent (Claude, a closed model by Anthropic) for the session that carries on. DRAFT report.

## Done
- **Built:** reporting published storyboards (signed in, the images' reasons, a private note, one daily limit with images), one queue with images on /moderate (the ntfy count covers both), a reversible Hide (the files go back to private storage; Unhide restores only files whose sha256 matches what was published), the hidden page's notice, and an append-only log.
- **Nate's four changes (2026-11-23)** are made:
  - storyboard reporters count only since the last dismissal (images stay all-time: a later fix, in the launch list);
  - the Unhide line is in P5 (reread);
  - the log is kept when a storyboard is removed (`publication_id` is a plain uuid, no foreign key);
  - one queue.
- **Migration:** `supabase/migrations/0052_voice_moderation.sql`, numbered at merge. **APPLIED** on production by Nate (as at b1170584, A, B and C at once, Success). Byte-identical apart from its header comment.
- **Privacy:** words `1ou05nb`, the reread `1a8wumq` (#230) plus the ntfy item, which Nate reread on 2026-11-23. `LEGAL.effective` is 2026-11-24, the merge day; move it if the merge moves.
- **main merged in** through #231 (8a5e3de2). Head 606fb104.
- **Checks on 606fb104 (localhost):**
  - tsc: clean;
  - test:challenge: 565 passed, 268 moment checks;
  - test:voice: 348 ok;
  - check:principles: only P6a and P6d fail (local-only);
  - check:ui: the first run stopped on the "didn't go quiet" flake at /references/designs/place/autobus (seed pictures still loading); the re-run stopped on the same flake at /minpentai?watch=1 (two prefetches still open), with only the two known /challenge/make items before it. Neither page is touched by this PR; the machine was loaded with four agents' checks. A third run (rebuild at the handoff commit, then check:ui) was queued at handoff: `/Users/nathan/ephelion-voice-screens/m3-run.sh`, log `/tmp/m3-run.log`.

## Left, in order
1. **check:ui:** if the re-run shows only the two known /challenge/make "Make it" items, it passes. Otherwise re-run it once; a flake on a page this PR doesn't touch is not a failure (CLAUDE.md).
2. **Before merging:** `git fetch origin && git merge origin/main`; re-check the number (0052 must still be free on main); run test:voice and check:ui again if main brought code changes.
3. **Merge:** Nate's condition is met once the checks show only the known local items: `gh pr merge 225 --merge`.
4. **Live checks:** wait for `https://snowmoon.party/api/version` to show the merge commit, then run check:shipped, check:principles, check:ui and check:miniapp against `--url=https://snowmoon.party`, and report.
5. **Then #229**, which merges after this one (see docs/branch-reports/voice-picture-allowance.md on its branch).

## How to run the tests
- Every tsc, test, build and server holds `/Users/nathan/.snowmoon-heavy.lock`. Take it with `mkdir`, write an owner line, and `rm -rf` it in a trap.
- No server on `.env.local`: move the worktree's `.env.local` aside by absolute path, and restore it after.
- Commands:
  - `npx tsc --noEmit -p .`
  - `npm run -s test:voice`
  - `npm run -s test:challenge`
- For check:principles and check:ui, the same steps as `/Users/nathan/ephelion-voice-screens/m-run.sh`:
  1. Build with `.env.local` moved aside: `env -u VERCEL -u VERCEL_ENV STUDIO_DATABASE_URL= npm run build`.
  2. Start the demo database: `npx tsx scripts/voice-demo-db.ts --port=54386`.
  3. Start the server: `STUDIO_DATABASE_URL=postgres://studio_writer@127.0.0.1:54386/postgres npx next start -p 3086 -H 127.0.0.1`.
  4. Run `npm run -s check:principles -- --url=http://127.0.0.1:3086` and, when the load is under 8, `npx tsx scripts/check-ui.ts --url=http://127.0.0.1:3086`.
- Known local results: P6a and P6d fail; check:ui's two /challenge/make "Make it" items.

## Paste waiting for Nate
None. The SQL is applied and the reread is done.
