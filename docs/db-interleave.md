# The test database's one session, interleaved (2026-10-19)

## What was seen

`npm run test:remix` sometimes failed with "500 from /api/remix/<id>/hide". The site's server log showed Postgres
errors from the in-memory test database (PGlite):

- 08P01 "bind message supplies 3 parameters, but prepared statement "" requires 1" (also 2/1 and 2/0);
- once, 22P02 "invalid input syntax for type bigint" with a frame's uuid.

The Hide route didn't catch database errors, so it answered a bare 500.

## The cause: the test harness, not the site

PGlite is one Postgres session. In the end-to-end tests the site connects to it through `pglite-socket`, and
the test also queries it directly (`pg.query`, e.g. `select hidden, hidden_role from studio.remix_frames where
id = $1`) to check what the site wrote.

A Postgres session keeps one unnamed prepared statement. postgres.js with `prepare: false`, as `src/lib/db.ts`
uses it, runs a query with parameters in two steps:
1. Parse + Describe + Flush;
2. after the parameter types come back, Bind + Execute + Sync.

When the test's direct query runs between those two steps, it replaces the site's unnamed statement. The site's
Bind then runs against the test's statement:
- a different parameter count gives 08P01;
- a different type gives 22P02;
- **the same count and types give no error at all: the site silently runs the test's statement with its own
  values.**

How this was narrowed down (probes in a scratch worktree, not committed):
1. Not a second connection. The socket never had more than one connection, and none was dropped.
2. Not pglite-socket reordering. Serialising its data handling changed nothing.
3. The client's wire order was correct. Every message the site sent, logged as it arrived, was in the right
   order. The statement its Bind landed on was the test's own, which goes to PGlite directly and never crosses
   the socket.

**Production:** on the real database, every connection (`src/lib/db.ts`, one per function instance, through the
Supabase pooler on port 6543, transaction mode) is its own session. Nothing else can parse into it.
`npm run test:pglite-gate` round 3 runs the site's client alone: 600 overlapping query jobs (800 queries,
including transactions), two shapes with the same parameter type, every value checked. 0 wrong, 0 errors.
Production logs, read-only, 2026-10-11 to 10-18: no "08P01", no "remix status failed", and no 5xx on production.

**Through the real Supabase transaction pooler** (port 6543, Supavisor), `scripts/probe-pooler-echo.ts`, which is
READ-ONLY: constants only, no table, transactions opened `read only`. N postgres.js clients exactly like
`src/lib/db.ts` (`prepare: false`, `max: 1`) fire overlapping echo queries of three shapes, a third of them inside
transactions, and check every value. 2026-10-19:
- 4 × 150: 800 of 800 right;
- 6 × 200 (two runs): 1,596 of 1,596 right;
- 0 wrong, 0 errors.

With `prepare: false`, postgres.js uses the unnamed statement and never a named one. The Parse+Describe+Flush …
Bind+Execute+Sync of one query is a single pooler transaction, because no ReadyForQuery comes back before the
Sync, so the pooler keeps that client on one server connection until then.

**Shared clients or variables across concurrent requests.**
- `src/lib/db.ts` is one postgres.js client per function instance, shared by every request that instance serves.
  That is by design: postgres.js queues them on its one connection in order, which round 3 and the pooler probe
  check.
- No other module-level state holds a request's identity. The other module-level variables are caches of static
  files, or maps keyed by FID, name or address (names, labels, shots), plus the Base read client.

**Concurrent inserts and hides: `npm run test:db-swaps`.** The site's own `saveFrame`, `setHidden`, `saveBoard`,
`setBoardHidden` and `frameById` run on the site's client, all at once:
- 8 people × 6 frames and 6 storyboards, 4 rounds: 384 writes;
- makers hide their own, others try to hide them (all 128 refused), the maintainer hides one each: 224 hides;
- 192 reads.

Every value encodes its person and index, and each row's person, words, prompt, hash, URL, name, cost, hidden state,
hider and role are checked against its own tag. Result: 0 problems.

`-- --planted` runs the same work while the test queries the shared session ungated. It must catch it, or the
test can't detect a swap; it does: errors and wrong or missing rows.

**Production writes, last 8 days (to 2026-10-19), read-only audit** in the SQL Editor (`docs/db-audit-week.sql`). Nothing wrong:
- **Remix frames (1):** the hash, shot, cost and name match its own recipe, and the words are in its prompt. It is a
  prepaid frame, with its debit 4.2 s from it (prepaid frames record no daily ask, by design).
- **Storyboards (0) and removal log (0):** nothing to check.
- **Image asks (63):** all with a real FID, at most 30 per FID per day.
- **Wallet:** 1 payment (ETH, $0.999999) and 1 debit ($0.053951). The account exists, no balance below zero, and
  no debit without a payment.
- **Consents (2, own-words, two wording hashes):** no duplicates, and the wallet consent has its account.
- **Hides:** none was recorded by anyone but the maker or the maintainer.

**Could a write receive another query's values?**
- On the site, no. The client's own order is correct (above).
- In the tests, yes, before this fix: the site's Bind for an insert or update could run the test's
  (select) statement instead. So a write was silently skipped, or a read returned the test's row, and a check
  could pass or fail for the wrong reason.

The direct test queries during the site phase are reads, so the test never ran the site's writes with the
test's values. The opposite direction, the site's write Bind landing on a test's read statement with matching
types, would silently not write. That is how an end-to-end check can be wrong without an error.
`test:pglite-gate` shows the silent case: without the gate, 80 to 86 of 400 site queries read the test's value
instead of their own, with no error.

## The fix

- `scripts/lib/pglite-gate.ts` gates the shared session:
  - the test's `pg.query` / `pg.exec` wait until the site's open pipeline reaches its Sync, and hold the session
    while they run;
  - a site message that would start a new pipeline waits for them;
  - every reply to the site is checked for 08P01, so this can't come back unnoticed.
- Used in `test:remix` (a "DB" check) and `test:adaptation-pages` (fails at exit on any 08P01).
- `npm run test:pglite-gate` is the regression probe. It must reproduce the fault without the gate, and show 0
  with it.
- `src/lib/try-again.ts`: the Hide routes (remix frame, storyboard, image) answer 503 "Something went wrong on
  our side. Try again in a moment." (DRAFT) on any database error, instead of a bare 500. Tested by
  `npm run test:try-again`.
- No change to `src/lib/db.ts`. postgres.js 3.4.9 is the latest release (2026-04-05). A second connection for
  transactions was not needed: the pooler would allow it (pool size 15, 200 clients on Micro), but the site's own
  connection was never at fault.
- The gate counts the session free only after a Sync whose ReadyForQuery says idle ('I'). A test query never runs
  between two statements of the site's open transaction.
