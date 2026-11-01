# Rocks and Mirrors: balance for book-3 (design)

> DRAFT, design only, nothing merged. Written by the coding agent (Anthropic's Claude, a closed model), 2026-11-01. Rules invented for this edition, Rocks and Mirrors' pieces drawn from passages in the book · not affiliated with the author.

## The test

The owner's test of a good balance: **the unforced search computer chooses mirror walls, symbol gliders, moving walls and glider factories on its own, because they're worth it.** "Unforced" means the plain search (`searchPlayer`), without book-2's BookPlay, which makes it place book pieces.

For each rules variant, the computer played itself at levels 2 and 3, 20 matches each (10 seeds, seats swapped). For each piece I counted **the matches in which both sides placed it**, plus the draws. Script: `scripts/minpentai-book-balance.ts`. Two options were added to the engine for this, both off unless a ruleset sets them, so the identity gates pass unchanged:
- `factoryEvery`: a factory also fires on its own every N steps while its rock has ore. After c14-b38, "an eternal glider factory".
- `symbolsCapped`: a symbol forms only if its side is under the tower cap.

## Results

Matches out of 20 in which both sides used the piece. Level 2 / level 3.

| Variant | Mirror | Symbol glider | Moving wall | Factory | Draws |
|---|---|---|---|---|---|
| A book-1 as is | 1 / 0 | 1 / 19 | 0 / 0 | 0 / 0 | 11 / 5 |
| B tower cap 6 | 2 / 3 | 20 / 20 | 3 / 3 | 0 / 0 | 3 / 3 |
| C tower cap 4 | 12 / 3 | 20 / 20 | 6 / 1 | 0 / 0 | 7 / 3 |
| D tower costs 6 | 1 / 0 | 1 / 2 | 0 / 0 | 0 / 0 | 10 / 17 |
| E tower costs 8 | 1 / 0 | 1 / 4 | 0 / 0 | 0 / 0 | 10 / 18 |
| F cheaper pieces (mirror 1, symbol 1, wall 4, factory 2) | 1 / 0 | 1 / 19 | 0 / 0 | 0 / 0 | 11 / 3 |
| G stronger pieces (mirror 5 hits, ore 6, factory 3 hits) | 1 / 0 | 1 / 19 | 0 / 0 | 0 / 0 | 11 / 5 |
| H cap 6 + cheaper | 2 / 2 | 20 / 20 | 9 / 12 | 0 / 0 | 4 / 4 |
| I cap 4 + cheaper | 4 / 6 | 20 / 20 | 11 / 8 | 0 / 0 | 3 / 3 |
| J cap 6 + cheaper + stronger | 3 / 2 | 20 / 20 | 10 / 12 | 0 / 0 | 4 / 4 |
| K cap 6 counting symbols + cheaper | 5 / 6 | 20 / 20 | 14 / 11 | 0 / 0 | 19 / 18 |
| L K + factories fire every 6 steps | 4 / 7 | 20 / 20 | 16 / 12 | 4 / 0 | 18 / 19 |
| M cap 4 counting symbols + cheaper + factories every 6 | 3 / 7 | 20 / 20 | 7 / 11 | 0 / 0 | 10 / 20 |
| N L + ore 4 | 4 / 8 | 20 / 20 | 16 / 13 | 4 / 0 | 18 / 19 |
| O L + mirrors take 5 hits | 5 / 7 | 20 / 20 | 16 / 12 | 4 / 0 | 18 / 19 |
| **P** cap 6 counting symbols; symbol 2, mirror 1, wall 4, factory 2; factories every 4 | 4 / 7 | 20 / 20 | 15 / 16 | 2 / 1 | 19 / 17 |
| Q as P, cap 8 | 5 / 2 | 17 / 20 | 16 / 17 | 0 / 1 | 16 / 19 |
| S as P, gliders cost 3 | 4 / 7 | 20 / 20 | 15 / 16 | 2 / 1 | 19 / 17 |

Note: variant S came out identical to P in every count, which suggests the glider cost may not have taken effect under this runner. Unverified; checking it is part of step 1 of the next steps.

## What it says

1. **Towers are the whole game today.** With no cap, the computer buys a tower whenever it can (11 to 21 a side a match). Making towers dearer (D, E) doesn't change that: it buys fewer and the match stalls into draws. Cheaper or stronger pieces alone (F, G) change nothing.
2. **A tower cap is what makes the other pieces worth buying.** Once a side can't add towers, its points go elsewhere. Moving walls become a regular choice (both sides in 11–17 of 20 matches with a cap and cheaper walls).
3. **The cap must count symbols.** Without that (B to J), three symbol gliders are a way round the cap, and the computer floods the board with them (25 to 75 a side a match).
4. **Symbol gliders cost at least 2.** Every glider of yours in flight is worth 2 to the score. At cost 1 a symbol glider always pays for itself in flight, and the computer sends them by the dozen.
5. **Mirrors and factories are still rarely chosen.**
   - **Mirrors:** both sides used them in at most 12 of 20 matches, usually 2–8.
   - **Factories:** at most 4 of 20. Even firing on their own, a factory's gliders pay off past the computer's look-ahead, and it must stand against a rock within reach, which is rarely near your own towers on this board.
   - A mirror's worth is in turning an enemy glider you haven't seen yet, which the computer's score can't value.
   - This is partly the computer, not only the rules: its look-ahead is at most 18 steps past the next turn.
6. **Caps make draws.** With a cap of 6, most matches end level at the step limit (16–19 of 20). A cap needs a tie-break.

## Recommendation: book-3 = P, plus a tie-break, then a second look at mirrors and factories

Rules (all this edition's):
- **Tower cap 6, symbols included:** a symbol doesn't form past the cap.
- **Costs:** mirror 1, symbol glider 2, moving wall 4, factory 2. Glider, square and tower unchanged.
- **Factories fire on their own every 4 steps** while their rock has ore (still also when a glider hits the rock).
- **New, not yet tested: a tie-break at the step limit.** With equal towers, the side that destroyed more enemy pieces wins. That rewards walls and mirrors that send gliders back.

With P, the unforced computer already chooses moving walls and symbol gliders on its own. Mirrors and factories are not there yet. My next steps, if you want them:
1. Measure the tie-break, and check the glider-cost result above.
2. Put two factory rocks next to each side's starting towers (rock layout is a rules choice), so a factory is placeable from the first turn.
3. Give the computer's score a small term for a glider that ends its run turned back toward the enemy (a mirror's worth), so it can see what a mirror does. That's a computer change, measured the same way.

None of this is merged. book-2 stays live (the computer that is made to use all four pieces), and book-1 records keep replaying. book-3 would be a new ruleset id, so book-1 and book-2 records keep their rules.
