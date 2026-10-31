# Minpentai search computer: round robin, 2026-10-31

Written by the coding agent (Anthropic's Claude, a closed model). DRAFT. Output of `npm run minpentai:search-ladder -- --n 20` on the owner's Mac, after the fog review's fixes and with level 3's slips at 12%, six matches running at once (so the times below are slower than one match alone; see the morning report for times measured alone). Levels: `src/lib/minpentai/versions/search.ts` SEARCH_LEVELS.


Search levels, 20 seeds a pairing, seats swapped (40 matches). Score = wins + half the draws, for the first named.

| Ruleset | Pairing | Won / drawn / lost | Score |
|---|---|---|---|
| Book edition | Search 2 vs Search 1 | 31 / 5 / 4 | 84% |
| Book edition | Search 3 vs Search 1 | 40 / 0 / 0 | 100% |
| Book edition | Search 4 vs Search 1 | 40 / 0 / 0 | 100% |
| Book edition | Search 5 vs Search 1 | 40 / 0 / 0 | 100% |
| Book edition | Search 3 vs Search 2 | 21 / 5 / 14 | 59% |
| Book edition | Search 4 vs Search 2 | 39 / 1 / 0 | 99% |
| Book edition | Search 5 vs Search 2 | 40 / 0 / 0 | 100% |
| Book edition | Search 4 vs Search 3 | 40 / 0 / 0 | 100% |
| Book edition | Search 5 vs Search 3 | 40 / 0 / 0 | 100% |
| Book edition | Search 5 vs Search 4 | 40 / 0 / 0 | 100% |
| Book edition | Search 1 vs Planner (rung 5) | 30 / 3 / 7 | 79% |
| Book edition | Search 2 vs Planner (rung 5) | 39 / 0 / 1 | 98% |
| Book edition | Search 3 vs Planner (rung 5) | 40 / 0 / 0 | 100% |
| Book edition | Search 4 vs Planner (rung 5) | 39 / 1 / 0 | 99% |
| Book edition | Search 5 vs Planner (rung 5) | 40 / 0 / 0 | 100% |
| Play | Search 2 vs Search 1 | 23 / 10 / 7 | 70% |
| Play | Search 3 vs Search 1 | 34 / 5 / 1 | 91% |
| Play | Search 4 vs Search 1 | 36 / 3 / 1 | 94% |
| Play | Search 5 vs Search 1 | 37 / 2 / 1 | 95% |
| Play | Search 3 vs Search 2 | 26 / 9 / 5 | 76% |
| Play | Search 4 vs Search 2 | 32 / 6 / 2 | 88% |
| Play | Search 5 vs Search 2 | 38 / 2 / 0 | 98% |
| Play | Search 4 vs Search 3 | 13 / 21 / 6 | 59% |
| Play | Search 5 vs Search 3 | 20 / 20 / 0 | 75% |
| Play | Search 5 vs Search 4 | 15 / 25 / 0 | 69% |
| Play | Search 1 vs Planner (rung 5) | 32 / 4 / 4 | 85% |
| Play | Search 2 vs Planner (rung 5) | 32 / 5 / 3 | 86% |
| Play | Search 3 vs Planner (rung 5) | 34 / 6 / 0 | 93% |
| Play | Search 4 vs Planner (rung 5) | 32 / 7 / 1 | 89% |
| Play | Search 5 vs Planner (rung 5) | 30 / 10 / 0 | 88% |

Time and simulated steps per turn (this machine, Node):

| Ruleset | Level | Median ms | 95th pct ms | Slowest ms | Most steps |
|---|---|---|---|---|---|
| Play | 1 | 5 | 12 | 65 | 2124 |
| Play | 2 | 8 | 18 | 66 | 3804 |
| Play | 3 | 23 | 48 | 95 | 13554 |
| Play | 4 | 29 | 56 | 81 | 17544 |
| Play | 5 | 34 | 66 | 157 | 18840 |
| Book edition | 1 | 28 | 47 | 74 | 3000 |
| Book edition | 2 | 63 | 107 | 138 | 7992 |
| Book edition | 3 | 128 | 194 | 246 | 19998 |
| Book edition | 4 | 182 | 291 | 380 | 39984 |
| Book edition | 5 | 214 | 481 | 607 | 79980 |

Illegal turns: 0
