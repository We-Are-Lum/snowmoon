# Minpentai: player-made versions

Design spike for the owner. Written 2026-10-21 by the coding agent on branch `minpentai-versions-spike` (worktree `~/snowmoon-mp-versions`, cut from origin/main at b770a17). Nothing is merged, pushed, deployed or wired into a page.

**The goal.** Someone describes a change in plain words. AI turns it into a valid version, the version is tested automatically, and anyone can play it against the computer from a link.

**In short.**
- **20 test ideas.** 11 became playable versions as the model made them. 2 more became playable with a small fix that keeps the whole idea, and 1 only by dropping half of it. The other 6 were impossible or silly, and the model honestly declined all of them. That makes **13 playable with the idea intact, or 14 counting the partial one.** No invalid version and no misquoted book passage got through.
- **Cost per version** is about $0.001 for the model and 20 to 40 CPU-seconds for the playtest. The playtest can run in the creator's browser for free.
- **Main limit.** The six computer players are narrow. Several settings never change a computer match at all: rocks that break or absorb, saving points, and caps above 5 towers. So "playable" here means *the computer plays it sensibly and fairly*, not *it is fun for people*. The creator's own match (part 5) has to cover the rest.
- **Onchain.** A version becomes a ruleset manifest with no change to MatchLog. Two offchain pieces would change. The verifier currently only knows `replaySolo`, so it needs a version replay entry. And each shared version is "unknown ruleset" until the owner adds it to RulesetRegistry, which only the owner can do.

**What was built** (all under `src/lib/minpentai/versions/`, nothing imports it yet):

| File | What it is |
|---|---|
| `schema.ts` | The inventory (SETTINGS, PIECES, with ranges and sources), the `Version` type, `check()`, `jsonSchema()` |
| `engine.ts` | Play's engine with every constant and rule switch read from settings. Under Play's settings it plays exactly as `game.ts` |
| `playtest.ts` | The 200-match harness and the "playable" thresholds |
| `replay.ts` | `replayVersion`: a person's match under a version, replayed as the onchain branch replays solo matches |
| `manifest.ts` | A version as a ruleset manifest, and its ID |
| `link.ts` | A version in a link, and reading it back through `check()` |
| `book.ts` | Checks that every quoted book passage is word for word in the blocks it cites |
| `config/prompts/minpentai-version.md` | The model's instructions |
| `scripts/test-minpentai-versions.ts` | Tests (below) |
| `scripts/minpentai-versions-sweep.ts` | Part 1's evidence: 68 single changes, 200 matches each |
| `scripts/minpentai-versions-prompt.ts` | Part 4's prototype and the 20 ideas |
| `docs/proposals/data/minpentai-versions-*.json` | Raw results |

**Tests** (`npx tsx scripts/test-minpentai-versions.ts`, all pass):
- 432 whole matches: every pair of computer players, both seats. Each is played by the ladder test's loop on `game.ts` and by the version engine with an empty version. Every placement on every turn, the result and the end step all match.
- 1,600 random boards stepped 12 times under each of the four drawn rules, all identical.
- 216 solo matches replayed identically. An illegal placement is refused.
- 14 book quotes are each found in their blocks, and an invented quote is refused.
- 15 kinds of broken version are refused.
- Every setting at its minimum and maximum, and every rule-piece option, plays to an end with no illegal move.
- Manifest IDs change when the rules change, and links read back exactly.

I planted two bugs in the engine (a Blocker limit, and the square hit count); the comparison caught both (46 and 15,862 failures).

**Disclosure.** You allowed reading only `solo-v1.json` and the rule-modules doc on `minpentai-onchain`. I also read, without changing anything, `onchain/replay.ts`, `onchain/ruleset.ts`, `onchain/verify.ts`, `RulesetRegistry.sol` and the first 40 lines of `minpentai-onchain-v1.md`. I did that to see how a ruleset ID is computed and whether the verifier could replay a version. That was outside your instruction. The onchain facts below come from those reads.

---

## 1. What can safely vary

Each row is Play today with one thing changed, 200 computer matches each (part 3), with Play's four drawn rules left in. Columns:
- **Range**: what `check()` allows.
- **Tested**: the values run.
- **Playable**: whether the playtest passed.
- **Computer matches changed**: how many of the 200 matches had a different result or end step from Play today, on the same seeds. 0% means the computer players never notice the change.
- **Computer players**: whether all six still play sensibly. No illegal move by any of them in any case (checked every turn). The ladder still holds when the Planner (rung 5) scores well above the Rival (rung 1).

Play today, for comparison: Cyan's score 52%, draws 40%, Planner beats Rival 100% head to head, levels 13/17/30/80/83/85% (Practice to Planner), median 96 steps (7 turns after setup), the setup turn alone decides 0% of equal-player matches.

| Setting | Range | Tested | Playable | Computer matches changed | Computer players | Source |
|---|---|---|---|---|---|---|
| width | 9–25 | 9, 12, 19, 25 | all | 52–56% | Sensible. At 19 and 25 most matches run to the step limit (88%, 97%): gliders take too long to cross | This edition's. The book gives no size, only edges and corners (c4-b113, c7-b81) |
| height | 6–16 | 6, 8, 13, 16 | all | 38–60% | Sensible | This edition's |
| maxSteps | 24–240 | 24, 48, 160, 240 | 48 and up | 64–98% | Sensible. At 24 there is one turn after setup | This edition's. The book has no turn limit (c14-b94) |
| points (each later turn) | 2–24 | 2, 4, 12, 24 | all | 19–51% | Sensible. At 2, gliders come only from the drawn cost-3 rule or saved points; 100% of matches reach the step limit | Book: "reduced by eighty percent" (c14-b33) for one match; points are this edition's unit |
| setupPoints | 2–32 | 2, 4, 16, 32 | all | 16–46% | Above 8 the computer spends no more (16 and 32 play identically) | Book: an initiation phase (c4-b94) |
| costGlider | 1–12 | 1, 2, 6, 12 | 1, 2 | 18–36% | At 6 the ladder flattens (Planner 60%, Rival 33%; 72% draws). At 12 nobody can fire except under cost3. `check()` now refuses a glider no turn can pay for | This edition's |
| costSquare | 1–6 | 2, 3, 6 | all | 6–26% | Sensible | This edition's |
| costTower | 1–16 | 1, 2, 8, 16 | 1, 2 | 19–51% | At 8 and up only the Planner wins (99%); Builder and Opportunist fall to 51%. 7 passes with gliders at 1 (part 4) | This edition's |
| sight | 1–30 | 1, 2, 6, 30 | all | 32–44% | Sensible | **Book**: "within thirty squares" (c4-b93) |
| reach (placing) | 1–30 | 1, 2, 6, 30 | all | 46–62% | At 30 you can place next to the enemy: median match 26 steps, 2 turns. It passes but is barely a game | Book: "near any copy of their symbols" (c4-b110); the number is this edition's |
| every (turn spacing) | 4–32 | 4, 8, 20, 32 | all | 28–34% | Sensible. At 32 there are 2 turns after setup | Book: about a thousand turns between interventions (c14-b45, c4-b110) |
| squareHits | 1–4 | 1, 3, 4 | all | 10–16% | Sensible | Book: walls can be destroyed (c4-b9) |
| directions | 4 or 8 | 8 | yes | 16% | Only rungs 4 and 5 aim diagonally (as under today's "diag" rule) | This edition's |
| startTowers | 1–4 | 1, 3, 4 | all | 48–58% | Sensible. At 4, 96% of matches run to the step limit | Book: "a few copies of his symbol" at setup (c4-b94) |
| maxTowers | 0 (none) or 1–12 | 2, 3, 6 | all | 0% at 6; 43–48% at 2–3 | The computer stops at 5 towers anyway, so 6 or more changes nothing | This edition's |
| carryOver (save points) | 0–16 | 4, 16 | all | **0%** | The computer always spends everything, so it never saves. Only a person would use this | This edition's |
| switchAt (rule change mid-match) | 0 or up to maxSteps | 24, 48 | all | 17–54% | Sensible | **Book**: "the sudden rule change four thousand turns in" (c5-b30) |

| Rule piece | Options (Play's first) | Playable | Computer matches changed | Computer players | Source |
|---|---|---|---|---|---|
| edges | bounce, wrap, vanish | all | wrap 55%, vanish 8% | Sensible. Rivals and Blockers don't aim across a wrapped edge; Builders and up do, since they simulate | This edition's |
| rocks | bounce, absorb, breakable (rockHits 1–6), split | all | **0%**, 0%, 2% | Every computer player fires along its own tower rows, and none of Play's six rocks sits on rows 2 or 7. So rocks are almost never hit, and these options change nothing for the computer | split: **book**, gliders hitting rock formations "created more gliders" (c4-b108). breakable: "Anything that can be created can be destroyed" (c4-b13) |
| ownTower | bounce, destroy | yes | 49% | Sensible; matches are shorter (median 50) | **Book**: stray gliders "wrecked one of his factories" (c4-b109) |
| sameSide | pass, break | yes | 10% | Sensible | Book (c4-b109) |
| debris | none, rock | yes | 34% | Sensible | **Book**: "a high-entropy wasteland" (c4-b140) |
| win | towers, first-blood | towers only | 94% | Fails: one turn after setup, and the ladder squeezes (Blocker 82%, top rungs about 60%). With turns every 6 steps it passes (part 4) | towers: the book (c12-b196). first-blood is invented |

**What can't vary this way.** These would need new engine code or new computer players, so they are not in the menu:
- the hex grid and the book's cell rule (different engines);
- shrines (c14-b33, a new piece);
- gliders faster than one square a step;
- teams and more than two players;
- the AIs reading each other's thoughts (c7-b65, about players, not the board);
- uneven starts. The board is always symmetric when turned 180°, because a computer player plays Cyan by turning the board.

**Recommendation.** Keep these ranges as the hard limits. They bound the work and keep every number whole, and the playtest decides the rest. Before sharing a version, show the creator when the computer players ignore its main change (the 0% rows): "The computer won't use saved points; only you will."

## 2. The version format

A version is data only. The model fills in this JSON and nothing else; no code it writes runs. `jsonSchema()` in `schema.ts` produces the JSON Schema. `check()` enforces the same limits, and on top of them it checks:
- every change is tied to a book passage (quoted word for word from the blocks it cites, checked against `content/snowmoon/text/`) or marked invented;
- no setting is set to the value it already has;
- some turn can pay for a glider;
- drawn rules can't change the board;
- everything is printable ASCII and whole numbers.

```json
{
  "format": "snowmoon.minpentai.version/1",
  "title": "Increase sight to thirty squares",
  "different": "Sight range increased from 3 to 30 squares",
  "parent": "solo-v1",
  "author": "@someone",
  "prompt": { "text": "Make it closer to the book: you can see thirty squares.", "model": "openai/gpt-oss-120b", "date": "2026-10-21" },
  "set": { "sight": 30 },
  "changes": [
    { "what": "sight", "basis": "book", "says": "would allow him to see everything within thirty squares", "blocks": ["c4-b93"] }
  ]
}
```

- `set` holds only what differs from Play today: any setting or rule piece from part 1.
- `drawn` (optional) replaces Play's four drawn rules with 0 to 6 of the version's own, each a sentence and the settings it changes.
- `rocksAt` (optional) places Cyan's rocks; Amber's are added turned 180°.
- `parent` is `solo-v1` or another version's ruleset ID, so remixes chain.
- `prompt.text` keeps the person's words exactly, with any non-ASCII character written as `\uXXXX` (the French idea in part 4 reads back exactly).

**As a ruleset manifest.** `versionManifest()` gives the same shape as `solo-v1.json` (`format: snowmoon.minpentai.ruleset/1`):
- engine: a pinned commit and file hashes, with entry `versions/replay.ts`, function `replayVersion`;
- the board, the full settings and one rule line per setting, each with its book passage or "invented for this version by @someone";
- the drawn rules, the six computer players, and the whole version under `version`.

Its ID is the keccak256 of its sorted JSON, so MatchLog's `start(rulesetId, level)` takes it with **no contract change**. Each version gets its own ID, and old matches keep replaying under theirs.

**What would change offchain:**
1. **Verifier.** It checks the manifest names `onchain/replay.ts` / `replaySolo` and refuses anything else (verify.ts:105). It needs a second entry that calls `replayVersion(manifest.version, match)`. The bundling and sandbox can stay as they are.
2. **Registry.** `RulesetRegistry.add` is owner-only. A version recorded before the owner adds it shows as "unknown ruleset". Options: the owner adds versions in batches once they're shared (the manifest already carries `author` and `parent` for the registry's `author`/`remixedFrom`), or recorded versions stay unregistered and the verifier says so.
3. **Sorted JSON.** `manifest.ts` repeats the onchain branch's sorted-JSON rules (named `stableJson` here, because the principles check P5a reads "canonical" as "canon"). On merge, use one copy.

**In a link.** `versionLink()` puts the version's sorted JSON in `?version=` (539 to 905 characters for the 14 test versions). The page reads it back through `check()`, and a link that fails plays nothing. A registered version can have a short link by ID.

**Not built: playing from a link.** Play's page, controller, board drawing, server view and share card still import the fixed 15 × 10 board and the rules from `game.ts`: `controller.ts`, `board.ts`, `players.ts`, `play-live.tsx`, `share-result.ts`, `view.ts`, `match.ts`, `ladder.ts`. Wiring versions in means passing the version's layout and settings through those. It's a contained change, but it touches the live game, so it should be its own branch and review.

## 3. The playtest

`playtest(version)` runs 200 computer-against-computer matches. It plays 100 pairings, each twice on one seed with the seats swapped, cycling through all 21 pairs of the six computer players (each against itself too). Every match is also replayed with both sides placing nothing after setup. Reported:
- **Ends:** every match reaches a result with no engine error and no illegal move (each computer turn is checked against the version's rules; an illegal one would be dropped and counted).
- **Sides:** Cyan and Amber wins and draws, and Cyan's score (wins plus half the draws).
- **Levels:** each level's score against the others, the Planner head to head against the Rival, and the skill gap (rungs 3–5 minus Practice and rung 1).
- **Length:** median, 10th and 90th percentile end step; turns after setup; the share reaching the step limit.
- **First move:** among equal-player matches, the share where the setup turn alone gives the same decisive result. Also the share where the side ahead at the first turn after setup goes on to win, and the share over before that turn.

"First move" counts only equal-player matches. Counting all matches made Play today look 46% "decided by setup", but that was just the stronger player winning either way.

**Proposed thresholds for "playable"** (all must hold):

| Check | Threshold | Play today |
|---|---|---|
| Every match ends; no error; no illegal move | all 200 | yes |
| Side balance: Cyan's score | 40–60% | 52% |
| Draws | at most 60% | 40% |
| Planner beats Rival, head to head | at least 60% | 100% |
| Skill gap | at least 0.10 | 0.68 |
| Median match: turns after setup | at least 2 | 7 |
| Setup alone decides (equal players) | at most 25% | 0% |

These are deliberately loose. They catch broken versions (no gliders affordable, one turn per match, everyone draws, the ladder collapsing) but not boring ones. Two known blind spots:
- Equal computer players mostly draw (82% in Play today, as mirror images of each other), so the "first move" measure has few decisive matches to work with.
- The computer players never test anything they ignore (part 1's 0% rows).

## 4. Prompt to version

`scripts/minpentai-versions-prompt.ts`:
1. Sends the idea to `openai/gpt-oss-120b` (the chat's model, open weights) through Vercel AI Gateway only, pinned to Groq, with zero data retention and no prompt training, using only `AI_GATEWAY_API_KEY`. It never uses the site's Groq key.
2. Gives the model the menu and section 1 of `docs/minpentai-rules.md` (the book's rule passages with blocks).
3. Builds the version, then runs `check()` and the quote check. Any problems go back to the model, up to 3 attempts.
4. Playtests the version.
5. If it fails, searches for the smallest fix and confirms it with a full playtest. The search tries, in order:
   - each changed number moved a quarter of the way back to Play;
   - a lever the idea didn't touch, picked by which check failed (more steps, faster turns, smaller setup);
   - halfway and three quarters back;
   - putting one key back to Play's, which is labelled "drops part of the idea", and every such option is offered.
6. Pinned Groq was often busy through the gateway (498 "at capacity", as `config.ts` notes for the chat). The script waits and retries with backoff and never switches provider.

**The 20 ideas:**

| # | Idea | Outcome | Version | Notes |
|---|---|---|---|---|
| 1 | Gliders wrap around the edges, like Pac-Man | playable | edges wrap | |
| 2 | Closer to the book: see thirty squares | playable | sight 30, **book** c4-b93 | Took 2 attempts. In a diagnostic re-run, the first quote wasn't word for word; refused, fixed on retry |
| 3 | Brutal fog: see one square | playable | sight 1 | |
| 4 | *Les carrés devraient résister à trois coups* | playable | squareHits 3 | French in, exact words kept as `é` |
| 5 | Rocks make new gliders, like the book | playable | rocks split, **book** c4-b108 | Took 3 attempts (re-run: a misquote refused, then fixed). The computer barely notices (2%) |
| 6 | Your own gliders can destroy your own towers | playable | ownTower destroy | Marked invented, though c4-b109 supports it |
| 7 | Huge board 25 × 16, longer matches | playable | 25 × 16, maxSteps 240 | 55% draws (limit 60%); playtest 122 CPU-s |
| 8 | Tiny 9 × 6 knife fight | playable | 9 × 6 | Median 73 steps |
| 9 | The rules change halfway, like the chapter 5 semi-final | playable | switchAt 48, two own drawn rules | Its rule texts say "At step 48, …" though the first applies from the start. See problems below |
| 10 | Cut the budget 80%, like the national semi-finals | **fixed by dropping part** | asked points 2 + setup 2: all 200 draws | Two options offered: cut only later turns (points 2, setup 8), or only setup. The first is the book's: the cut is per intervention turn |
| 11 | Debris turns into rock | playable | debris rock | "Partly": gliders leave no debris. Marked invented, though c4-b140 supports it |
| 12 | Sudden death: first tower destroyed wins | **fixed** | + every 6 | One turn per match otherwise; with turns every 6 steps, median 18 steps, 2 turns |
| 13 | Gliders cost 1, towers 16 | **fixed** | towers 16 → 7 | At 16 the ladder breaks (70% draws) |
| 14 | Let me save points | playable | carryOver 8 | The computer never saves (0% change) |
| 15 | Play on a hex grid | declined | | "cannot be represented in the menu" |
| 16 | Personal AIs reading each other's thoughts | declined | | |
| 17 | Gliders fly two squares a step | declined | | |
| 18 | Pineapples everywhere, cheese gliders | declined | | |
| 19 | Five XOR shrines | declined | | |
| 20 | Make it so I always win | declined | | "cannot … guarantee the player always wins" |

**How many became playable:** 13 of 20 with the whole idea (11 as made, 2 with a fix that keeps the idea), plus 1 with half of it. All 6 refusals were right: four impossible ideas, one silly, one unfair. Nothing invalid reached the playtest, and no book quote was accepted unless it is in its block.

**Problems the spike found:**
- **The model's wording is machinery-speak and sometimes wrong.** Examples:
  - "ownTower rule changed from bounce to destroy";
  - drawn-rule texts that misdescribe when they apply (#9);
  - in a diagnostic re-run, a drawn rule "sight set to 3", which changes nothing (`check()` now refuses that).

  **Recommendation:** the rule sentences come from code, built from the settings (as `manifest.ts` already does for rule lines). The title and "what's different" line are the creator's own words, with the model's draft offered and labelled. See principle 2 below.
- **The model under-cites.** It marked #6 and #11 invented although the menu lists their passages. That's safe (never a false claim), and the page could offer "The book says something like this: c4-b109" for the creator to accept.
- **Fix search.** My first version offered "points back to 8" for #10, which quietly undid the idea. Fixed: dropping part of an idea is labelled and every such option is shown.

## 5. Cost, and what a creator must do before sharing

**Cost per version** (measured 2026-10-21):
- **Model:** $0.00126 per idea on average, $0.0028 at most (3 attempts), $0.025 for all 20. About 5,400 tokens in and 200–1,700 out a call; median 4.4 s, up to 72 s while Groq was busy.
- **Playtest:** 400 match runs (200 and their pass replays):
  - 20 CPU-seconds on an Apple M3 for Play-sized versions;
  - 122 CPU-seconds for 25 × 16 × 240 steps;
  - a failed version's fix search adds up to about 2 minutes more.
- **On the server:** assuming Vercel's Active CPU price of about $0.13 per CPU-hour (check the current price list), that's about $0.001 for a typical version and up to $0.01 for the largest, all within the 300 s limit except the largest with a fix search.
- **In the browser:** run it in a Web Worker for free; a phone would take one to a few minutes. The playtest is pure and seeded, so the server can re-run it whenever a version is shared and trust nothing from the browser.
- **Altogether:** about **$0.001 to $0.003 a version**, or the model's $0.001 alone if the playtest runs in the browser.

**Before sharing**, I'd require:
1. **Beat your own version once**, as you're leaning. Make it count:
   - The match is against Builder (rung 3) or higher. Practice and Rival lose to almost anything (13–17% in every playtest), and from Builder up the computer actually plays the version.
   - The seed comes from the server, or from MatchLog's commit-before-play, so a creator can't try seeds until one is easy.
   - The win is checked by `replayVersion` from the moves alone. It's deterministic, so a claimed win can't be faked.
2. **Write the title and the one line in your own words.** The model's draft is offered, labelled "drafted by the model". This is the human stamp (main goal) and principle 2.
3. **See the rules page and the playtest summary** in plain words, including any "the computer won't use this" note, and press Share. That's the signed-in person's action (principle 4).
4. **Know the words are public**, before typing the idea: the prompt is stored in the version and its manifest (principle 1).

Taps from idea to a shared link: type or say the idea (1), wait for the playtest, read the result (1), play and beat it (a match: about 8 turns), write the title (1), Share (1). That's a handful plus the match, and the match is the point.

## Open decisions for the owner

1. Beat it at which level: Builder (3) or higher, as proposed, or any level?
2. Playtest in the browser (free, the server re-runs on Share) or on the server (about $0.001 each)?
3. Registry: will you add shared versions in batches, or should versions stay unregistered offchain ("unknown ruleset" when recorded)?
4. Should rule pieces the computer ignores (save points, rock options, tower caps above 5) be allowed, with a warning, or held back until a computer player uses them?
5. Thresholds: are the loose ones in part 3 right, or should "playable" also ask for, say, at most 60% of matches reaching the step limit? That would fail widths 19 and 25, 4 starting towers, and the slow board in #7.

## Principles

| Principle | Touched? | Status |
|---|---|---|
| 1. Public recipe, people know their words will be public | Yes: the idea is kept in the version and its manifest | **Concern for build time:** the input box must say before typing that the words will be public. Not built here |
| 2. AI use declared; words are the author's or a signed-in person's | Yes: the model drafts the title, the one line and drawn-rule sentences | **Tension.** As built in the spike, a version's title and "what's different" are model-written. Proposal: the creator writes them, the model's draft is labelled, and rule sentences come from code. Your call |
| 3. Allowlist, open weights | Yes: gpt-oss-120b, already on the allowlist, the chat's model | Pass |
| 4. Published only by a signed-in person's action | Yes, at build time | Pass by design: Share after beating it |
| 5. Nothing canon or featured | | Pass. `check:principles` P5a first flagged the word "canonical"; renamed to `stableJson` |
| 6. Third-party requests; readers' words | The idea goes to Groq through the gateway, as chat questions do. The page itself makes no outside request | Pass for the spike (my test ideas only). At build time the Privacy page and the consent text must name this use; see legal-texts-describe-today |
| 7. Payments | | Not touched |
| 8. Minpentai matches the source | Yes: book citations | Pass. Every quote is checked word for word against its blocks, invented changes are labelled, and the new engine is labelled as this edition's |

`npm run check:principles`: 46 of 47 pass. The one failure is P6d (`SUPABASE_SECRET_KEY`, the accepted open item).
