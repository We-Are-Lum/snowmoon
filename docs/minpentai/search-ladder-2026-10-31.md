# Minpentai search computer: round robin, 2026-10-31

Written by the coding agent (Anthropic's Claude, a closed model). DRAFT. Output of `npm run minpentai:search-ladder -- --n 10` on the owner's Mac, six matches running at once (so the times are slower than one match alone). Levels: `src/lib/minpentai/versions/search.ts` SEARCH_LEVELS.



Search levels, 10 seeds a pairing, seats swapped (20 matches). Score = wins + half the draws, for the first named.

| Ruleset | Pairing | Won / drawn / lost | Score |
|---|---|---|---|
| Book edition | Search 2 vs Search 1 | 14 / 3 / 3 | 78% |
| Book edition | Search 3 vs Search 1 | 20 / 0 / 0 | 100% |
| Book edition | Search 4 vs Search 1 | 20 / 0 / 0 | 100% |
| Book edition | Search 5 vs Search 1 | 20 / 0 / 0 | 100% |
| Book edition | Search 3 vs Search 2 | 11 / 2 / 7 | 60% |
| Book edition | Search 4 vs Search 2 | 20 / 0 / 0 | 100% |
| Book edition | Search 5 vs Search 2 | 20 / 0 / 0 | 100% |
| Book edition | Search 4 vs Search 3 | 20 / 0 / 0 | 100% |
| Book edition | Search 5 vs Search 3 | 20 / 0 / 0 | 100% |
| Book edition | Search 5 vs Search 4 | 20 / 0 / 0 | 100% |
| Book edition | Search 1 vs Planner (rung 5) | 13 / 3 / 4 | 73% |
| Book edition | Search 2 vs Planner (rung 5) | 20 / 0 / 0 | 100% |
| Book edition | Search 3 vs Planner (rung 5) | 20 / 0 / 0 | 100% |
| Book edition | Search 4 vs Planner (rung 5) | 19 / 1 / 0 | 98% |
| Book edition | Search 5 vs Planner (rung 5) | 20 / 0 / 0 | 100% |
| Play | Search 2 vs Search 1 | 12 / 4 / 4 | 70% |
| Play | Search 3 vs Search 1 | 18 / 2 / 0 | 95% |
| Play | Search 4 vs Search 1 | 19 / 1 / 0 | 98% |
| Play | Search 5 vs Search 1 | 19 / 1 / 0 | 98% |
| Play | Search 3 vs Search 2 | 14 / 3 / 3 | 78% |
| Play | Search 4 vs Search 2 | 15 / 4 / 1 | 85% |
| Play | Search 5 vs Search 2 | 18 / 2 / 0 | 95% |
| Play | Search 4 vs Search 3 | 6 / 11 / 3 | 58% |
| Play | Search 5 vs Search 3 | 12 / 8 / 0 | 80% |
| Play | Search 5 vs Search 4 | 7 / 13 / 0 | 68% |
| Play | Search 1 vs Planner (rung 5) | 19 / 0 / 1 | 95% |
| Play | Search 2 vs Planner (rung 5) | 17 / 0 / 3 | 85% |
| Play | Search 3 vs Planner (rung 5) | 17 / 3 / 0 | 93% |
| Play | Search 4 vs Planner (rung 5) | 16 / 4 / 0 | 90% |
| Play | Search 5 vs Planner (rung 5) | 17 / 3 / 0 | 93% |

Time and simulated steps per turn (this machine, Node):

| Ruleset | Level | Median ms | 95th pct ms | Slowest ms | Most steps |
|---|---|---|---|---|---|
| Play | 1 | 5 | 11 | 16 | 2124 |
| Play | 2 | 9 | 17 | 26 | 3804 |
| Play | 3 | 23 | 46 | 57 | 13554 |
| Play | 4 | 27 | 52 | 85 | 14904 |
| Play | 5 | 32 | 63 | 81 | 18810 |
| Book edition | 1 | 32 | 51 | 67 | 3000 |
| Book edition | 2 | 73 | 166 | 416 | 7992 |
| Book edition | 3 | 160 | 296 | 589 | 19998 |
| Book edition | 4 | 198 | 373 | 480 | 39984 |
| Book edition | 5 | 239 | 539 | 665 | 79980 |

Illegal turns: 0
