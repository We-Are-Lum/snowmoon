# Minpentai: a stronger computer player (design spike)

For the owner. Written 2026-10-21 by the coding agent on branch `minpentai-stronger-computer` (from main `f77028c`). Nothing in the game is changed; the prototype is in `scratch/minpentai-stronger/` and runs against today's `game.ts`.

## The idea

Today's five players follow hand-written habits (`botPlan`): fire at a visible tower, block a glider, build towers to the left. Whole rules go unused, and the ladder isn't in order of strength.

The proposed player picks moves by simulating the real engine instead:
1. List every placement the engine allows this turn.
2. For each one, copy the board, apply it, and run the engine's own `step()` to the next turn to act (and a little further).
3. Score the resulting board, keep the best, and repeat for the remaining points.

Because legality and physics come from the engine, it plays whatever the engine's rules are.

## How it works

- **What it sees.** Only the fog view every player gets (`players.ts fogView`), plus the enemy towers where it last saw them. Its simulations can't see hidden enemy pieces; it assumes there are none. This is the same honesty as today's players: it never reads the whole board.
- **Candidates.** Every square in its placing area, times every piece (glider in each of 8 directions, square, tower). The engine's own placement check (`checkPlacements`) filters them, so a rule like "diag" or "cost3" is honoured without code knowing about it. That's about 300 to 1,000 legal single placements a turn.
- **Building a turn.** Greedy: try each candidate added to what's chosen so far, simulate, keep the best; stop when points run out or nothing improves the score.
- **Scoring a simulated board.** A win or loss first (sooner is better). Otherwise 100 per tower ahead, plus half a point per square it can see, plus 2 per glider of its own still flying. Towers are the score and the sight, so the weights follow the rules.
- **Looking ahead.** Level 3 simulates to the next turn plus 12 steps. Levels 4 and 5 go further and model the opponent's next turn with a simple player. That turned out not to help (below).

## Results: 200 matches against each current level

Each pairing is 100 seeds with the new player as Amber and 100 as Cyan (the board turned), using `players.ts tally`. Won / drawn / lost, out of 200. No turn was ever refused by the placement check.

| New player | Practice | Rival | Blocker | Builder | Opportunist | Planner |
|---|---|---|---|---|---|---|
| L1: next turn only, 35% mistakes, a quarter of candidates | 21 / 111 / 68 | 21 / 111 / 68 | 3 / 67 / 130 | 0 / 0 / 200 | 0 / 0 / 200 | 0 / 0 / 200 |
| L2: next turn only, 15% mistakes, half of candidates | 99 / 93 / 8 | 99 / 93 / 8 | 58 / 135 / 7 | 0 / 0 / 200 | 0 / 0 / 200 | 0 / 0 / 200 |
| **L3: +12 steps, 5% mistakes, all candidates** | **200 / 0 / 0** | **200 / 0 / 0** | **200 / 0 / 0** | **200 / 0 / 0** | **200 / 0 / 0** | **187 / 11 / 2** |
| L4: +24 steps, opponent model | 200 / 0 / 0 | 200 / 0 / 0 | 200 / 0 / 0 | 200 / 0 / 0 | 199 / 1 / 0 | 181 / 16 / 3 |
| L5: +36 steps, opponent model | 200 / 0 / 0 | 200 / 0 / 0 | 200 / 0 / 0 | 200 / 0 / 0 | 199 / 1 / 0 | 185 / 12 / 3 |

What this says:
- Looking past the next turn is what matters. L1 and L2 only see to the next turn and lose every match to Builder and above; with 12 more steps (L3) the player wins almost everything.
- Going further, and modelling the opponent with a simple player, adds nothing. L3 is the sweet spot.
- Practice and Rival gave identical results in every pairing: their only difference (practice sometimes skips a glider when it sees no target) never mattered in these matches.

## How long a turn takes

Measured uncontended over 20 matches against Planner (level 3: 164 turns), and in Chromium with and without a 4x CPU slowdown (a mid-range phone). A turn's cost is mostly simulated engine steps.

| | Median | 95th percentile | Slowest | Steps per turn (max) |
|---|---|---|---|---|
| L3, Node (this Mac) | 33 ms | 59 ms | 96 ms | 36,000 |
| L3, Chromium | 29 ms | 56 ms | 63 ms | 36,000 |
| L3, Chromium at 4x slower | 113 ms | 195 ms | 200 ms | 36,000 |
| L5, Chromium at 4x slower | 301 ms | 988 ms | 1,075 ms | 123,408 |

- **Play in the browser.** L3 fits easily, even on a slow phone (at most about 0.2 s, with the existing "thinking" pause).
- **The snap on the server.** I couldn't find "the snap" in the repository; I've assumed it is a server-rendered Farcaster embed whose handler must answer within 5 seconds. L3 needs at most about 36,000 simulated steps, about 50 ms here and perhaps 0.1 to 0.3 s on a serverless CPU. That leaves well over 4 seconds for the rest of the request. Tell me if "the snap" is something else.
- **Budget in steps, never in time.** During the 200-match runs, five processes shared the CPU and the slowest L5 turn took 9.7 s. A time limit would make the moves depend on the machine and break replays. So the budget must be a fixed number of simulated steps (for example 40,000), which is the same everywhere; a bigger budget is a different player.

## Levels

A level is a search setting, not a different habit list:

| Level | Look-ahead | Mistakes (from the seed) | Candidates |
|---|---|---|---|
| 1 | next turn only | often picks the 2nd or 3rd best | a quarter |
| 2 | next turn only | sometimes | half |
| 3 | + 6 steps | sometimes | all |
| 4 | + 12 steps | rarely | all |
| 5 | + 12 steps, two pieces chosen together | never | all |

Levels 3 to 5 here are proposals, not measured: today's L3 already beats every current level, so the new ladder needs calibrating with the existing round-robin test (`test-minpentai-ladder.ts`) until each level beats the one below most of the time. Deliberate mistakes are drawn from the player's seeded random numbers, so they are part of the replay.

## Staying deterministic

- No clock, no `Math.random`: the only randomness is the player's seeded `rng` (mistakes), the same as today's players.
- Budgets are counted (simulations, steps), never timed.
- Candidates are visited in a fixed order (square number, then piece), and ties keep that order (`Array.sort` is stable).
- Checked: 15 of 15 matches identical when replayed (levels 1, 3 and 5; seeds including 2^31 and 2^32 - 1), and Node and Chromium play the same 10 matches byte for byte.

So replays, the page and the onchain verifier stay in agreement, as long as the verifier runs the same code.

## Code hashes and ruleset IDs

This applies to the onchain spike on branch `minpentai-onchain` (not on main): a ruleset manifest pins every file the replay reaches, and each computer player's code hash is that closure's hash plus its level.

- Adding the search player (reached from the replay) changes the closure hash. So every computer player's code hash changes, the old five included, and the ruleset ID changes. That's intended: it's a different game to replay.
- Matches recorded under the old ruleset keep its ID and keep replaying with the old engine (the verifier rebuilds the pinned engine from git).
- Recommendation: ship the new player as part of a new ruleset (solo-v2), together with the engine rework another session is doing, so the ID changes once.
- If players should be added later without changing the others' hashes, a player's code hash could cover only its own files plus the engine. Not needed now.

## What "any version's rules" really covers

- **Covered without new code:** anything the engine expresses through its placement check, `step()`, sight (`lit`), costs and turn spacing. That includes today's four drawn rules: the prototype never mentions them, yet it uses diagonal gliders under "diag" because the placement check allows them (in 9 "diag" matches, 14 of its 16 gliders flew diagonally; under the other rules, none did).
- **Needs the engine's help:** new piece types, and rules that act through new hooks. The candidate list is built from today's pieces (glider, square, tower). Ask the engine rework to export two things: the list of legal placements for a side, and a "how is this side doing" score (towers and sight today). Then the player needs no changes when rules change.

## Open points

- **It's predictable.** A deterministic search player is as predictable as today's: with a known seed, a player can still replay offline and take moves back (the takebacks finding in `minpentai-commit-before-play.md`). A stronger opponent makes solo puzzles harder, not unfair-proof.
- **Weak spots of the prototype:**
  - it builds a turn greedily, one piece at a time;
  - the score weights are set by hand;
  - it assumes no hidden enemy pieces;
  - the opponent model (a simple player) didn't help; using itself at a small budget may.
- **How strong is too strong?** L3 already beats every current level. The top of the ladder should be beatable by a good person; that needs playtesting, not just self-play.
