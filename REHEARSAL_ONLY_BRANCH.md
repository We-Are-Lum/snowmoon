# NEVER MERGE THIS BRANCH TO MAIN

Branch `contest-rehearsal` exists only for the agents' dress runs of the remix challenge rehearsal (2026-11-04). It is
branch `contest` plus the dress run's stand-ins: a test sign-in for two test Farcaster IDs (`REHEARSAL_TEST_SIGNIN`)
and Farcaster casts read from a local file instead of Neynar (`REHEARSAL_TEST_POSTS`), with the dress-run script
`scripts/rehearsal-dress.ts`. They only work under the rehearsal switch (this machine, never on Vercel, a local
database), but they don't belong on the site. `contest` itself has none of this; the owner's rehearsal runs from
`contest` with the real Farcaster sign-in (docs/rehearsal-1.md).

check:principles P6z fails on this branch, always, because this file exists: a pull request from it can't pass.
To refresh it after `contest` changes: merge `contest` into it (never the other way). Note that `contest`'s commit
6f4901bd removed the stand-ins there, so after such a merge, restore them from this branch's 44d63e95
(`git checkout 44d63e95 -- src/lib/auth.ts src/lib/challenge/posts.ts src/lib/challenge/rehearsal-switch.ts
scripts/rehearsal-dress.ts scripts/test-rehearsal.ts`, then check `scripts/check-principles.ts` P6w by hand, since
contest's P6w refuses a test sign-in).
