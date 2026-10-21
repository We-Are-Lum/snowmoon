# Minpentai: rules as modules

Draft for the owner (written overnight, 2026-10-21, by the coding agent). Read-only proposal; nothing here is built.

## What is hardcoded today, and what is a parameter

In `src/lib/minpentai/play-game/game.ts` (and `play-server/match.ts`, `controller.ts`, `onchain/replay.ts`):

| Rule | Today | Where |
|---|---|---|
| Board 15 x 10, 96 steps | Hardcoded constants | `W`, `H`, `MAXS` |
| Six rocks, two towers each, mirrored | Hardcoded | `ROCKS`, `world()` |
| 8 points a turn | Hardcoded twice | `POINTS` (match.ts), `pts = 8` (botPlan) |
| Square 1, tower 4 | Hardcoded | `COST` |
| Glider cost 4 (3 under "cost3") | Parameter | `m.cost` |
| Sight and placing distance 3 (2 under "sight2") | Parameter | `m.R` |
| A turn every 12 steps (8 under "every8") | Parameter | `m.every` |
| Directions: 4 (8 under "diag") | Parameter, by rule name | `m.rule === 'diag'` in botPlan, checkPlacements |
| Squares take two hits | Hardcoded | `apply`, `step` |
| Edge bounce, rock bounce, tower hit, collisions, no debris | Hardcoded in `step()` | `step` |
| Two placements on one square cancel | Hardcoded | `apply` |
| Last-seen markers | Hardcoded | `updLS` |
| Which new rule a match gets | First random number of the seed, one of four | `RULE_IDS`, `replaySolo`, `drawRule` |
| The five computer players | One function, `botPlan`, by level; some levels read the rule by name (Opportunist uses "diag") | `botPlan` |

So the four drawn rules are really four switches on three numbers and a direction set. Anything else (the book's shrines, hex grid, team rules) needs code inside `step()` or `apply()`, and the computer players need to know about it.

## The book's special match rules

From `docs/minpentai-rules.md` section 1.7. Every match has some new rule (c4-b84), chosen in secret (c4-b148, c12-b133 to c12-b134).

| Match | Special rule | Blocks |
|---|---|---|
| Zei's earlier game | "rotate one eighty if three" (a cell rule variant) | c4-b7, animated in c4-b5 |
| Pafogai Du quarter-final | Teams chosen deliberately, not by cryptographic randomness | c4-b148 |
| Pafogai Du semi-finals | A rule change partway through the match | c5-b30 |
| Pafogai Du final | Each player has a personal AI, and each side can read the other AI's thoughts | c7-b63, c7-b65 |
| National qualifier | Hex grid | c12-b147, c12-b169, c12-b170 |
| National semi-finals | Intervention budget cut by 80%; five shrines that XOR their changes onto nearby regions every thousand turns, then reset | c14-b33, c14-b35 |
| Practice and bot games | Custom rulesets and corner starts | c12-b10 |

Of these, two fit Play's pieces today with small hooks: a budget cut (a parameter) and a mid-match rule change (a scheduled switch). Shrines need a new piece and a step hook. The hex grid and the cell rule are different engines, not modules. The AI-transcript rule is about players, not the board.

## One interface for a new rule

A rule module is a pure TypeScript object, in its own file, reached from `replay.ts` so the ruleset manifest pins it:

```ts
interface RuleModule {
  id: string;                      // 'shrines', 'budget-cut', ...
  version: number;
  text: string;                    // the rule in one plain sentence
  book?: { says: string; blocks: string[]; basis: 'stated' | 'implied' };
  edition?: string;                // this edition's details
  credit: { author: string; remixedFrom?: { ruleset: string; module: string } };
  params?: Record<string, number>; // whole numbers only, so the manifest stays canonical
  // Hooks; each optional, each pure (no clock, no Math.random: use the rng given).
  setup?(w: World, p: Params, rng: () => number): void;            // before step 0
  points?(base: number, p: Params, turn: number): number;          // a turn's budget
  cost?(piece: Piece, base: number, p: Params): number;
  sight?(base: number, p: Params): number;
  directions?(base: [number, number][], p: Params): [number, number][];
  legal?(w: World, placement: Placement, side: Side, p: Params): string | null; // a reason to refuse, or null
  afterStep?(w: World, p: Params, rng: () => number): void;        // e.g. shrines every N steps
  end?(w: World, p: Params): Side | 'D' | null;                    // an extra way to end
}
```

- The engine calls the hooks in a fixed order (setup, then each turn: points, legal, cost; each step: afterStep, end), the same in the page, the server and the replay.
- A computer player gets the active modules and their parameters in its view. A module that no computer player can play is "people only" until one can.
- Determinism stays testable: the determinism suite runs every module at every seed edge, in Node and Chromium.

## Joining a season

- A ruleset is the base engine plus a list of modules with parameters. Its manifest pins the import closure (so each module's code hash is in it) and lists the modules with their text, sources and credit.
- A season is a list of ruleset IDs, each registered in RulesetRegistry. A match draws its ruleset (or its module) from its seed, as today's four rules are drawn.
- Adding a rule never changes old matches: a new module means a new ruleset ID; old matches keep replaying under the old one.

## Credit

- Per module, in the manifest: `credit.author` (a Farcaster name or address) and `credit.remixedFrom` (the ruleset and module it builds on). The manifest's hash fixes it permanently.
- Per ruleset, in RulesetRegistry: `author` and `remixedFrom` (a ruleset ID). These are set when the owner registers it and can't change.
- Gap to decide: the registry credits whole rulesets, not modules. Module credit is only in the manifest, which readers must fetch. If module credit should be readable onchain, each module could be registered as its own one-module ruleset first, so a combined ruleset's `remixedFrom` points at it.

## Open questions for the owner

- Who writes modules: only this edition, or anyone with a pull request?
- Is a "people only" module (no computer player can play it) allowed in solo seasons?
- Should a rule change partway through a match (c5-b30) be a module, or a feature of the engine?
