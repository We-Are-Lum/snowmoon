# Minpentai: what exists (kit step 1)

> DRAFT, 2026-10-20. Written by the coding agent (Anthropic's Claude, a closed model) from reading the code on `main` at 8d45275; for the owner to rewrite or approve. Rules invented for this edition · not affiliated with the author.

There are three game engines, not one. Each is pure (no DOM, no clock) and has its own tests.

| Engine | Where | What it is | Where it shows |
|---|---|---|---|
| **Play** | `src/lib/minpentai/versions/engine.ts` (Play is its base settings: `versions/schema.ts`, `versions/solo-v1.ts`) | Pieces on a 15 × 10 board: towers, gliders, squares, rocks. Rules invented for this edition, ported line for line from Claude Design's mockup (`docs/design/minpentai-play-prototype.dc.html`) and set by Design's rules page (`docs/design/minpentai-rules.dc.html`). | `/minpentai?mode=play`: practice, the computer ladder, free play, one-on-one |
| **Learn** | `src/lib/minpentai/learn-game/` | The same kind of game in its earlier version (Design's v3, `docs/design/minpentai-intro-v3.dc.html`), plus a scripted four-player broadcast. The rules page says Play's rules replace v3's; the lessons have not been updated yet. | `/minpentai?lesson=1…`, the home page's board |
| **The book's cell rule** | `src/lib/minpentai/engine.ts` | The rule recovered from the animated figure c4-b5 ("rotate one eighty if three", c4-b7): 2×2 blocks, alternating partition, reversible, cell-conserving. | `/minpentai/rule`; Learn's Under the hood (`learn-game/cells.ts`, the same rule) |

## Play (`src/lib/minpentai/play-game/`, `play-server/`)

- `versions/engine.ts`: the one engine, for Play, versions and replays. `engine(layout)` gives `world()` (two towers each, mirrored), `step()` (all gliders at once: edges turn them back, opposing gliders that meet or swap break, rocks bounce, squares crack then break, an opponent's tower is destroyed, your own bounces), `apply()` (both sides' placements appear at once; two on one square cancel), `lit()` (sight, Chebyshev radius), `updLS()` (where each side last saw the other's towers) and `botPlan()` (the five computer players; the bot always plays Amber). Every number comes from a version's settings.
- `versions/schema.ts`: every setting, with Play's value as the base (board 15 × 10, 120 steps, 8 points, costs 4/1/4, sight 3, a turn every 12 steps, squares take 2 hits), and `BASE_DRAWN`, Play's four drawn rules (`diag`, `cost3`, `sight2`, `every8`). `versions/solo-v1.ts`: Play as the version with no changes.
- `play-game/game.ts`: the old names (`W`, `H`, `MAXS`, `ROCKS`, `RULES`, `RUNGS`, `botPlan`…) kept as a thin adapter over the engine, for code that still imports them.
- `controller.ts`: practice, the ladder and free play in the browser. A match draws one rule from `RULES` at random (`R` 3 or 2, `every` 12 or 8, glider `cost` 4 or 3); 8 points a turn; placing only in the lit area of the towers that stood when the turn began; take back a piece placed this turn; the end (`checkEnd`: no towers, or most towers at step 120). Free play: any board, an eraser, two rule switches, `#fp=` links.
- `board.ts`: draws a `World` as cells (rocks always shown; the dark; last-seen outlines).
- `play-server/match.ts`: one-on-one on the server. `SETUP_MS` 90 s, `TURN_MS` 45 s, `PAUSE_MS` 15 s, `GONE_MS` 60 s, `POINTS` 8, `drawRule(seed)`, `checkEnd`, `resign`, `leave`, rematch. `store.ts` keeps matches, lobby, invites and challenges in Postgres (`supabase/migrations/0009_minpentai_play.sql`); `ladder.ts` records ladder progress (a private table keyed by FID). API routes: `src/app/api/minpentai/**`.
- Pages: `src/app/minpentai/play.tsx` (hub, practice, ladder, free play), `play-live.tsx` (one-on-one; its countdown banner is c4-b97/c4-b98), `play-board.tsx`, `share-result.tsx` and `/minpentai/result` (sharing a ladder win; `src/lib/minpentai/share-result.ts`).
- Tests: `npm run test:minpentai-play` (runs Design's own functions beside these and compares), `test:minpentai-play-server`, `test:minpentai-share`, `check:minpentai-live`.

## Learn (`src/lib/minpentai/learn-game/`)

- `pieces.ts`: v3's game, `pStep()`: gliders move one at a time in list order (Play moves them all at once), the same costs (glider 4, square 1, tower 4) and the same four drawn rules (`RULES`: diag, cost, fog, every).
- `lessons.ts`: seven lessons, Under the hood (optional) and a practice match. `controller.ts` runs them; `bot.ts` is v3's practice bot (it reads the whole board, ignoring the dark).
- `broadcast.ts`: the scripted four-player broadcast (Cyan, Amber, Pink, Violet), drawn in 3D by `src/app/minpentai/broadcast-scene.ts`; debris is drawn here only.
- `cells.ts`: Under the hood, the book's cell rule on a 48 × 32 wrapping board.
- Words: `src/lib/minpentai/learn-text.ts` (every claim about the book cites a block; checked by check:principles P8c, P8d, P8f). Labels: `src/app/minpentai/mp-tags.tsx` ("Book", "Invented", "Draft").
- Tests: `npm run test:minpentai-learn`.

## The book's cell rule and the older sandbox (`engine.ts` and friends)

- `engine.ts`: `blockRule`, `step`, `stepBack`, `liveCount`. Invented here: the board size (48 × 32, wrapping) and rocks (a block with a rock is left unchanged, which keeps the rule reversible).
- `figure.ts` reads the frames of `docs/source-figures/c4-b5.svg`; `presets.ts` has the figure's first frame and an invented right-hand side that makes the crop replay all 120 frames.
- `src/app/minpentai/rule/`: the page, on `engine.ts` and `c4b5Preset`.
- Kept in the repo, out of the menus since 2026-10-09: the sandbox (`src/app/minpentai/sandbox.tsx`, `url.ts`), its symbol (`symbol.ts`, a skew tetromino, invented), glider detection (`glider.ts`), and a full match engine on the book's rule with owned cells (`match.ts`, `ai.ts`, `matches.ts`, `watch-moves.ts`; `match-view.tsx`). Write-ups: `docs/minpentai-sandbox.md`, `docs/minpentai-backward.md`.
- Tests: `scripts/test-minpentai.ts`, `scripts/test-minpentai-match.ts` (no npm script; run with `npx tsx`).

## The rules pages

- `/minpentai/rules`: Claude Design's rules page, word for word (`src/app/minpentai/rules/rules-html.ts`, generated by `scripts/build-minpentai-rules.ts` from `docs/design/minpentai-rules.dc.html`). It marks each of Play's rules BOOK (with a block), INVENTED or OPEN, and lists what changes from v3 (§11). Its header says "RULES, DRAFT 1 · ALL WORDING IS DRAFT".
- `/minpentai/rule`: the book's cell rule (above).
- `/minpentai/build`: this kit (the rules table and the passages).

## The reading of the book

- `docs/minpentai-rules.md`: what the book says about the rules, stated or implied, with every quote and block id; the recovery of the c4-b5 rule; the hex rule tested; what the book leaves open.

## Found while mapping

- The ladder's order: kit part 1 (2026-10-20) found by self-play that the rungs are not in order of strength (Planner loses to Builder and Opportunist; one likely cause is `cnt(b, o) < (L >= 5 ? 3 : 5)` in `botPlan`). Not re-run here. Part 1 also said the site calls the rungs "each harder"; on `main` at 8d45275 that phrase is gone (`play.tsx` says "Five computer players to beat. Beat one to open the next."), so only the order itself is open.
- Learn still teaches v3 (gliders one at a time; the rules page lists the differences in §11).
