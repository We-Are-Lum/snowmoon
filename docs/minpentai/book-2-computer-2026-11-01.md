# Rocks and Mirrors: the book-2 computer, 2026-11-01

Written by the coding agent (Anthropic's Claude, a closed model). DRAFT.

**What changed.** book-2 is book-1's rules with a computer that uses the book's pieces (`versions/search.ts` BookPlay; `agent-play/solo.ts` COMPUTERS). From the third turn to act on, each turn it first considers one book piece it has none of standing, in this order: a glider factory, a moving wall, a mirror wall, three symbol gliders together. It takes the best placement of that kind if it scores no worse than placing nothing. Then its usual search spends the rest of the points. book-1 matches keep replaying with the computer they were played against (`checkComputer`).

**Measured** on the book edition, 20 matches a pairing (10 seeds, seats swapped):

| Pairing | Won / drawn / lost | Score | All four pieces on both sides |
|---|---|---|---|
| book-2 level 1 vs beginner | 20 / 0 / 0 | 100% | 10 of 20 |
| book-2 level 2 vs level 1 | 12 / 4 / 4 | 70% | 20 of 20 |
| book-2 level 3 vs level 2 | 20 / 0 / 0 | 100% | 20 of 20 |
| book-2 level 2 self-play | 9 / 2 / 9 | 50% | 20 of 20 |
| book-2 level 3 self-play | 8 / 4 / 8 | 50% | 20 of 20 |
| book-2 vs book-1, level 1 | 14 / 2 / 4 | 75% | (book-1 rarely uses them) |
| book-2 vs book-1, level 2 | 15 / 2 / 3 | 80% | |
| book-2 vs book-1, level 3 | 2 / 1 / 17 | 13% | |

**What it says about the game.** At levels 1 and 2 the pieces make the computer stronger. At level 3 they make it weaker: the book-1 level 3 spends those points on towers, and with no tower limit, towers decide most matches at the step limit. So in Rocks and Mirrors as it stands, a tower is the better buy than a wall, a factory or a mirror for a strong player. Ways to change that are rule changes (a tower limit, cheaper walls and factories, or ore that pays more), so they would be a book-3 ruleset, for the owner to decide after playing.

**Tried and dropped** (40 or 20 matches each): sending symbol gliders every turn the side had none (about 25 a match; it lost 39 of 40 to book-1 at levels 1 and 3); book pieces from the setup turn on (they took the place of the starting towers); a margin of 15 or 40 instead of 0 (no difference in any pairing).
