# NEVER MERGE THIS BRANCH TO MAIN

Branch `contest-rehearsal` exists only for the agents' dress runs of the remix challenge rehearsal (2026-11-04). It is
branch `contest` plus the dress run's stand-ins: a test sign-in for two test Farcaster IDs (`REHEARSAL_TEST_SIGNIN`)
and Farcaster casts read from a local file instead of Neynar (`REHEARSAL_TEST_POSTS`), with the dress-run script
`scripts/rehearsal-dress.ts`. They only work under the rehearsal switch (this machine, never on Vercel, a local
database), but they don't belong on the site. `contest` itself has none of this; the owner's rehearsal runs from
`contest` with the real Farcaster sign-in (docs/rehearsal-1.md).

check:principles P6z fails on this branch, always, because this file exists: a pull request from it can't pass.
To refresh it after `contest` changes: merge `contest` into it (never the other way).
