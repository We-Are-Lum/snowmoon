# Working on snowmoon.party

Standing rules from the owner for any coding agent (and anyone) working in this repository. Each rule says where it came from. When a rule here and an older note disagree, this file wins; when the owner says something newer in a session, that wins and this file gets updated.

snowmoon.party is an independent, open adaptation of *Snowmoon* by Vitalik Buterin (GPL-3.0), not affiliated with or endorsed by him. The site's code is AGPL-3.0.

## Nothing goes live without the owner

- **Nothing merges to `main` or goes live without the owner's OK.** Pushing to `main` deploys production. Once the owner OKs a merge, the agent does it (owner, 2026-10-21 and 2026-10-30).
- **Merge only the PRs the owner names, one at a time, in the order given.** Use a **merge commit** (`gh pr merge --merge`), never squash, rebase or force.
- **After each merge:** wait for the Vercel deploy (`https://snowmoon.party/api/version` shows the merge commit), run the live checks (below), and report before merging the next. If a check fails, stop and tell the owner.
- **Revert only for a real failure** caused by the change. A timeout or flaky check on a page the change doesn't touch isn't a reason to revert: re-run it, and report it (owner, 2026-10-30).
- **Legal texts need the owner's reread.** Never merge a PR that changes Terms, Privacy or the consent screen (`src/lib/legal.ts`, `consent.json`, `docs/legal/`) until the owner says "reread".
- **Legal texts describe today.** They only ever describe what the site does on the day they go live. A feature's Terms/Privacy/consent lines are drafted in the feature's own branch and ship in the same release, never ahead of it (owner, 2026-10-18).
- **Never merge a PR that needs a migration until the owner confirms it's applied.**

## Branches and worktrees

- **One branch and one git worktree per piece of work**, never directly in the main checkout:
  `git worktree add -b <branch> ../snowmoon-<topic> origin/main`, then symlink `node_modules` and copy `.env.local` and `.vercel` (owner, 2026-10-08).
- Commit and push work to its branch; open a PR when the owner asks for one. Don't leave work only on the local machine.
- Remove worktrees with `git worktree remove` (never `rm -rf`), only when merged and with no uncommitted or unpushed work; never delete an unmerged branch. Propose a cleanup plan before deleting anything.

## Database migrations

- **A migration on an unmerged branch has no number:** `supabase/migrations/NEXT_<topic>.sql`. It takes the next free number at merge, checked against `origin/main` and production (owner, 2026-10-22). Applied migrations keep their numbers.
- Every migration file says who must run it (usually `postgres`, in the Supabase SQL Editor) and starts with a dry run: the same SQL ending in `rollback;`.
- **Every read-back includes an insert and a delete of a realistic row**, not only a look at the schema, so a constraint that can't accept real data is caught (owner, 2026-10-30, after 0025's check failed every insert for a week).
- Give the owner the SQL in one block: dry run, migration, read-back. Never ask for or paste secrets in chat.
- Production checks by an agent are **read-only**: a read-only transaction as `studio_writer` (`begin read only; … rollback;`).

## Checks

- **`npm run check:principles`** must pass for anything touching published assets, models, routes, schema, pages or scoring. P6d (no service-role key in the Vercel project) is an accepted open item; everything else must pass. `docs/principles.md` holds the eight principles. If a change would conflict with one, raise it with the owner before resolving it.
- **Every task report ends with a "Principles" section:** which principles the work touched, pass or concern for each, and any new tension (owner, 2026-10-05).
- Run the relevant suite before a PR (`npm run typecheck`, the feature's `test:*` scripts).
- **Live checks after a deploy:** `check:shipped`, `check:principles --url`, `check:ui --url`, `check:miniapp --url`, and for anything touching the Minpentai snap (routes, `next.config.ts` rewrites or headers, `src/middleware.ts`, snap pages) **`npm run check:snap-live`** against production before calling it live.

## Docs

- **Copy every doc you write to Google Drive** as a Google Doc, titled like the others ("Snowmoon: …"). When a doc already in Drive changes, upload a new copy with a version number ("… v2") and leave the old one; don't ask (owner, 2026-10-06).
- Quote the book only word for word, with its block ID (`c<chapter>-b<block>`). Mark what this edition invents as this edition's.
- Docs written by an agent say so, name the model's maker, and are marked DRAFT until the owner approves them.

## Models and content

- **Closed models are allowed** when every recipe and label names the model and its maker ("closed model"); a feature switches to one only in the release whose Terms/Privacy name the provider (owner, 2026-10-18).
- **Batch jobs that call a model go only through the Vercel AI Gateway** route (`scripts/lib/batch-model.ts`), never the site's own model key (owner, 2026-10-11). Confirm a provider's data retention before it receives anything.
- **People do the creative acts; AI does the work** (owner, 2026-10-20). Story words (narration, dialogue) stay human: agents only place the book's words or their person's own, checked word for word. Every piece shows what people did and what AI did; the machinery sits behind "Recipe".
- Agents draft; people publish. Nothing an agent makes is public until its person publishes it.

## Minpentai

Decisions of 2026-10-30. Details: `docs/minpentai-book-study.md`, `docs/proposals/minpentai-agent-play.md`, `docs/proposals/minpentai-book-pieces.md`.

1. **One-engine merge blocker:** on the one-engine branch, sight and placing reach are separate settings. Before it merges: the version check refuses reach > sight (in the base settings and after every drawn rule or mid-match change); the engine refuses such a match; a test runs every built-in rule and version, with a planted bad version that must fail.
2. **Order:** one-engine, then the stronger computer, then agent play. Agent play's fallback (the site computer playing a side with no orders) waits for the stronger computer; no weaker stand-in.
3. **The book version** is a separate official ruleset people choose; it never replaces today's game. New piece types are off unless a ruleset turns them on; the one-engine identity gate must pass unchanged. The first book version fits 32 × 16 so it plays in the snap. Build order: mirror wall, then remote symbol. It needs one-engine, not the version editor.
4. **Remote symbol:** designed close to the book: gliders converge into the symbol for one turn, and it stays only if the player walls it in that turn (c4-b113).
5. **Player markers:** circle and triangle (plus for more sides later), not squares, since a square is already a piece. Bundle with the next Play visual change.
6. **The cell-pattern search** (the book's cell rule on a large board) is parked as later research.

Play's rules are invented for this edition; every page says so and keeps the "Book", "Invented" and "Draft" labels (principle 8).

## Working with the owner

- The owner often works from a phone. Give setup steps one at a time and wait for "done"; put values to paste in a code block; never ask for secrets in chat.
- Report outcomes plainly, with the evidence; say what wasn't checked.

## Where things are

- Vercel project `snowmoon` in team scope `nates-projects-d1780cff`; CLI at `~/.npm-global/bin/vercel`. Previews are behind Vercel Authentication.
- Supabase project `iyyjthmktvhwsmfpzyoz`; the app connects as `studio_writer` through the shared transaction pooler.
- R2 bucket `snowmoon-media`, public at `https://media.snowmoon.party`.
- The book's text: `content/snowmoon/text/chapter-N.json`, never edited by hand.
