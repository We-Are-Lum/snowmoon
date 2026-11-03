# Minpentai: ideas for building on it

> DRAFT, 2026-10-20. Section B of the kit's part 1, as the owner read it, with the code table moved to `code-map.md`. Written by the coding agent (Anthropic's Claude, a closed model). **These are ideas, not features: none is built.** Rules invented for this edition · not affiliated with the author.

## Ideas, easiest first

**These are ideas, not features.** None is built. Sizes are rough, for one person who knows the code; "files" are where each one would start.

**Idea 0 (a prerequisite for most of the ideas below):** make the Play engine the one shared core, with Learn and the sandbox reading from it.
- **Size:** medium (2–4 days).
- **Open question:** keep the older engine for the book-faithful sandbox, or fold it in?

**The ladder isn't in order of difficulty.** Kit part 1 checked by self-play (not re-run for this file): 120 games per pairing, both colours, a rule drawn each match.

| Player | Average score against the others |
|---|---|
| Rival | 14% |
| Blocker | 32% |
| Builder | 89% |
| Opportunist | 89% |
| Planner | 62% |

- Planner loses to Builder and to Opportunist 94% of the time.
- Rival plays the same as the practice bot.
- One likely cause: `botPlan` caps the Planner at 3 towers, against 5 for the others (`cnt(b, o) < (L >= 5 ? 3 : 5)`).
- Part 1 said the site calls the rungs "each harder"; on `main` at 8d45275 it no longer does ("Five computer players to beat. Beat one to open the next."). Whether the bots should be put in order needs a decision.

### a. Tune it: the numbers in one config file

- **What:** move the numbers into one file, `config/minpentai.json`:
  - board size: 15×10;
  - rocks;
  - match length: 120 steps;
  - turn interval: 12, or 8 under "every8";
  - points per turn: 8;
  - costs: glider 4, square 1, tower 4;
  - sight: 3;
  - square hit points: 2;
  - starting towers.

  The engine reads them, and anyone can make a variant by changing one file.
- **Files:** `play-game/game.ts` (the constants at the top, and `world()`), `learn-game/` for the same numbers, and a schema check in tests.
- **Size:** small (half a day) once idea 0 is done; medium if each engine has to read it separately.
- **Open questions:**
  - Should variants be shareable as links, like free play's `#fp=` boards?
  - Should the ladder always run on the default numbers?

### b. Write a computer player

- **The interface:** `plan(state) → placements`.
  - **In:** the board as that player sees it (only what its towers light), its points, the drawn rule, and where it last saw enemy towers.
  - **Out:** a list of `{piece, x, y, direction}`.

  This is today's `PlanInput` and `botPlan`, made side-neutral (now it always plays Amber), with typed inputs and docs.
- **A local runner:** `npm run minpentai:duel -- my-bot.ts planner --games 200 --seed 1`. It plays both colours and prints a score table. It would be built from the self-play script part 1 used for the check above (not in the repo).
- **Getting onto the ladder:**
  1. a pull request adds the bot under `bots/`, with a name, a one-line description, and its author;
  2. it has to pass the runner's checks: deterministic for a seed, under a time limit per turn, legal moves only;
  3. its strength against the five decides where it goes.
- **Files:** `play-game/game.ts` (split `botPlan` out), a new `bots/` folder, a new `scripts/minpentai-duel.ts`, and the ladder list in `play-game/controller.ts` and `play-server/`.
- **Size:** medium (2–3 days), including a starter bot and docs.
- **Open questions:**
  - Who approves a bot onto the ladder?
  - Can bots be written by agents (see the agent interface)?
  - Are bots allowed only in TypeScript, or also as WASM?

### c. New rules as add-ons

- **What:** each rule is a small module. It has a name, a one-line description, whether it's from the book or invented, and hooks (`setup`, `beforeStep`, `afterStep`, `legal(placement)`, `cost(piece)`, `sight(tower)`).
  - A match picks rules from a list, and each can be switched on or off.
  - Today's four rules (diag, cost3, sight2, every8) become the first four modules.
- **Worked example:** "Sudden wind". Every 16 steps, every glider in flight turns 90° clockwise. It's one `afterStep` hook, about 15 lines, plus a lesson card and a test position.
- **Files:** `play-game/game.ts` (the `RULES` table, and where `step`, `apply` and `lit` call the hooks), a new `rules/` folder, and `learn-text.ts` (where rules are described).
- **Size:** medium (2–3 days) for the hook system, then small (hours) per rule.
- **Open question:** may more than one drawn rule apply per match? The book says each match has its new rule (c4-b84).

### d. Rules from the book that aren't built yet

- **What:** go through the table from step 2 (`rules.md`). Each "from the book" rule the site doesn't follow becomes an idea card: the quote, how to build it, and what it would break.
- **Already visible in docs/minpentai-rules.md:**
  - the book's grid that evolves cell by cell (§1.1, §3.1, and the c4-b5 rule from the figure);
  - the hex board (c12-b169, c12-b170);
  - symbols and scoring by symbol (§1.3);
  - interventions and budgets as the book describes them (§1.2);
  - the sandbox (§1.6).
- **Files:** a rule module each (idea c), and the older engine for the book's grid.
- **Size:** varies: small for a cost or sight rule, large for the cell-by-cell grid or the hex board.
- **Open question:** a "book mode" that follows only what the book says, kept apart from the invented rules?

### e. Bigger modes

- **4 players, or 2 against 2:** the 3D broadcast already shows four colours (Cyan, Amber, Pink, Violet), but only as a script.
  - **Needs:** a bigger board, four start corners, sides as a list instead of `'C' | 'A'`, team scoring, and a four-way server match.
  - **Files:** `game.ts` (`Side`, `world`, `towers`, `lit`, `apply`), `play-server/match.ts`, the board drawing and the broadcast.
  - **Size:** large (1–2 weeks).
- **Hidden information:** already partly there (you see only what your towers light).
  - **Idea:** hidden rules, so each side learns the drawn rule only by seeing its effect.
  - **Size:** small to medium.
- **Simultaneous moves:** already there; both sides' placements appear at once, and two on one square cancel.
  - **Idea:** timed turns in one-on-one.
  - **Size:** small.
- **A broadcast with commentary:** a real match, not a script, replayed in the 3D broadcast, with notes written by a person (or by an agent, labelled).
  - **Files:** `learn-game/broadcast.ts` (take a replay instead of a script), `broadcast-scene.ts`, and a replay file (idea f).
  - **Size:** medium (3–5 days).
  - **Open question:** commentary written by a model counts as "writing" under the site's rules, so does it need the same labels as other AI-made text?

### f. Make it sturdy

- **The same seed always gives the same game:** true today for a given seed and both players' moves (the tests compare whole matches with Design's mockup). This would make it a promise: one RNG for each side, no `Math.random` in the engine, and a check that fails on any other randomness.
  - **Size:** small.
- **A replay file:** `{version, seed, rule(s), config, sides, placements per turn}` as JSON, plus a viewer that plays one in 2D or 3D. Free play's `#fp=` links and one-on-one's "watch it again" already keep parts of this.
  - **Size:** small to medium.
- **A test set of positions:** named boards (from the lessons, the book's figures, and edge cases such as a glider at a corner, two gliders on one cell, or a square on its last hit point), each with the expected next steps. Some exist in `test-minpentai-*.ts`.
  - **Size:** small.
- **Self-play stats:** the runner from idea b, run nightly. It gives a win-rate table and match lengths for each rule, and flags a rule that changes balance more than a set amount.
  - **Size:** small, once the runner exists.
- **Open question:** a tolerance for balance. For example, no drawn rule should move a side's win rate more than 10 points.
