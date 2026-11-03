# Rocks and Mirrors: book-4 (design)

> DRAFT, design only, nothing merged. Written by the coding agent (Anthropic's Claude, a closed model), 2026-11-02, after the owner's book-3 playtest (match coj2y7jbdnll). Rules invented for this edition; Rocks and Mirrors' pieces drawn from passages in the book · not affiliated with the author.

## What the playtest showed

The owner played book-3 at level 2: six towers and walls by turn 4, then nothing to do. The record showed this:

- **Kills nobody saw.** The owner's gliders destroyed 2 of the computer's towers, at steps 59 and 71, out of sight. The owner never saw an enemy piece. The computer first saw one of the owner's pieces at step 56. The owner's gliders were in the owner's own sight on 4 of the 24 steps they flew.
- **The computer was stuck at the cap.** It filled its corners with towers. On turn 4 it sent three symbol gliders on parallel lines (rows 10–12, west). They couldn't form a symbol: two came to rest far apart, and the row-12 one met the owner's row-12 symbol glider head-on, and both were destroyed (step 61, square (5, 12), the head-on rule). It spent 4–6 of its 10 points a turn. Unspent points are lost (carry-over 0).
- **The owner's AI didn't know the rules.** It sent five symbol gliders on parallel lines (rows 1, 3, 5, 8 and 12), which could never form.

## The bar (the owner's)

The design should be tested in self-play first. For each candidate:
- the turn of first contact (target: usually by turn 2 or 3);
- points spent;
- gliders sent;
- towers destroyed;
- symbol gliders, and symbols formed;
- draws;
- which pieces both sides use.

Recommend a candidate only when the computer spends most of its points and destroys towers in most matches.

Runs: `scripts/minpentai-book4-balance.ts`. Each run is 20 self-play matches at each level (1 / 2 / 3), with kill reports on. The new computer is used everywhere except T0.

## The new computer (book-4's, option F)

Three changes, all off for every other ruleset:
- **Symbols that work:** three symbol gliders are tried only where a sandbox run from its own view shows them forming. They can be side by side or staggered.
- **No spam incentive:** a symbol glider in flight is worth nothing to the score by itself. That term was what made it flood the board.
- **No lost points:** when unspent points would be lost, it also takes a placement that scores no worse.

## Results

| Variant | Contact by turn 3 (of 20) | Towers destroyed a match | Draws (of 20) | Points spent | Symbols formed a side |
|---|---|---|---|---|---|
| T0 book-3, its computer | 1 / 0 / 17 | 0.1 / 2.8 / 5.3 | 19 / 3 / 2 | 40.3% / 52.8% / 82.7% | 0 / 0.1 / 0.4 |
| T1 book-3, new computer | 1 / 1 / 5 | 0 / 0.6 / 1.3 | 20 / 13 / 12 | 71.7% / 89.7% / 97.5% | 0 / 0 / 0.1 |
| b1 towers start at column 5 | 5 / 0 / 20 | 3.3 / 4.2 / 3.4 | 5 / 1 / 3 | 50.3% / 58.4% / 91.3% | 0 / 0 / 0.1 |
| b2 board 18 wide | 16 / 17 / 17 | 3.2 / 2.5 / 3.2 | 6 / 4 / 5 | 68.8% / 86.8% / 96.9% | 0 / 0.1 / 0.1 |
| b3 sight 4 (reach 3) | 1 / 4 / 11 | 0 / 0.3 / 0.2 | 20 / 15 / 17 | 71.6% / 90.4% / 98.1% | 0 / 0 / 0 |
| b4 symbol gliders see 2 | 0 / 20 / 20 | 0.1 / 0.3 / 0.6 | 19 / 16 / 16 | 61.5% / 89.2% / 97.4% | 0 / 0 / 0 |
| b5 all gliders see 1 | 1 / 19 / 20 | 0.5 / 0 / 0.1 | 16 / 20 / 18 | 70.3% / 89.6% / 97.2% | 0 / 0 / 0 |
| c1 symbols uncapped | 1 / 5 / 7 | 0 / 1.8 / 2.5 | 3 / 1 / 0 | 53.3% / 79.8% / 94.6% | 5 / 4.7 / 3.7 |
| c2 uncapped, at most 2 symbol towers | 1 / 5 / 7 | 0 / 1.6 / 1.8 | 5 / 1 / 1 | 56.2% / 83.4% / 96.3% | 3.9 / 2.8 / 2 |
| c3 uncapped, symbol gliders cost 3 | 1 / 5 / 10 | 0 / 0.6 / 1.3 | 4 / 2 / 1 | 64.7% / 82.1% / 90.7% | 4.7 / 3.5 / 3.3 |
| c4 uncapped, carry over 10 | 1 / 4 / 4 | 0 / 1.4 / 2.2 | 3 / 1 / 1 | 27.8% / 58.5% / 67.2% | 5.2 / 6.9 / 4.2 |
| r1 col 5 + 2 symbol towers | 5 / 0 / 20 | 3.4 / 4.2 / 4.5 | 0 / 0 / 2 | 46.4% / 57.2% / 90.8% | 0.8 / 0.5 / 1.6 |
| r2 18 wide + 2 symbol towers | 16 / 17 / 18 | 3.8 / 2.8 / 4 | 2 / 2 / 1 | 62.9% / 83.1% / 95.5% | 1.5 / 1.6 / 1.4 |
| r3 18 wide + uncapped | 16 / 17 / 18 | 3.8 / 2.6 / 3.8 | 2 / 1 / 0 | 62.3% / 82.7% / 93.8% | 1.9 / 2.1 / 3 |
| r4 col 5 + uncapped | 5 / 0 / 20 | 3.4 / 4.2 / 4.3 | 0 / 0 / 1 | 46.4% / 57.1% / 85.8% | 0.8 / 0.6 / 3.8 |
| **r5 18 wide + 2 symbol towers + symbol scouts 2** | 20 / 20 / 20 | 5.8 / 5.7 / 6.7 | 0 / 0 / 1 | 59% / 82.6% / 93.7% | 2.3 / 2.2 / 3.1 |
| r6 col 5 + 2 symbol towers + symbol scouts 2 | 4 / 1 / 20 | 4.5 / 5.2 / 5.9 | 1 / 0 / 3 | 41.1% / 50.8% / 90% | 0.3 / 0.8 / 2.4 |
| r7 18 wide + col 3 + 2 symbol towers | 2 / 1 / 19 | 3 / 4.5 / 3.4 | 2 / 5 / 2 | 48.7% / 55.5% / 89% | 0.9 / 1.1 / 2.5 |

The variants:
- **b1:** the starting towers at column 5 (book-3: column 1).
- **b2:** an 18-wide board (book-3: 24).
- **b3:** sight 4, reach 3.
- **b4:** symbol gliders see 2 squares around them while they fly.
- **b5:** all gliders see 1.
- **c1:** symbols not stopped by the tower cap.
- **c2:** as c1, but at most 2 towers formed from symbols.
- **c3:** as c1, with symbol gliders costing 3.
- **c4:** as c1, with carry-over of up to 10.
- **r1–r7:** combinations of the leaders.

## What it says

1. **The new computer spends** (72–98% of its points against 40–83%), but on book-3's board that alone doesn't make fights (T1).
2. **Seeing farther makes contact, not fights.** Sight 4 or seeing gliders (b3–b5) bring first contact to turn 1–2 at levels 2–3. Towers still rarely fall, and most matches are drawn.
3. **Distance makes fights.** The 18-wide board (b2) or towers starting at column 5 (b1) bring a destroyed tower to nearly every match. Only the narrow board also makes contact early at level 1.
4. **Symbols past the cap form.** Uncapping symbols (c1) gives 4–5 symbols a side and almost no draws. A limit of 2 symbol towers (c2) keeps them in check. A higher symbol cost (c3) means fewer kills. Carry-over (c4) made the computer hoard: its spending fell to 28–67%.
5. **r5 meets the bar:** the 18-wide board, at most 2 symbol towers, and symbol gliders that see 2.
   - First contact comes by turn 3 in 20 of 20 matches at every level.
   - 5.7–6.7 towers are destroyed a match, with a kill in every match.
   - Draws: 0–1. Points spent: 59%, 83% and 94%.
   - At level 1 the computer can place only 3 pieces a turn, which caps what it can spend.
6. **Still rare:** mirrors (both sides in 3–16 of 20 matches) and factories (0–1). People may value them more than the computer can.

## Does the book support each contact option?

| Option | Book support |
|---|---|
| Gliders that see (scouting) | **For symbol-carrying ships, yes:** c7-b81 "Zei's symbol-carrying spaceship started moving west from the southeast corner. The portion of the game field that Zei could see increased."; c7-b84 "their symbol-carrying spaceships got within sight of each other"; c14-b70 "after it had gotten within visual range of Zei's own". **For plain gliders, no:** the book gives sight to symbols and the ships that carry them. book-4 gives sight to symbol gliders only. |
| Symbols forward, past the cap | Supported in spirit: c4-b108, spaceships "crashed into a rock formation in a controlled way, leaving behind copies of each player's symbols"; c4-b110, "all players were able to put down more squares near any copy of their symbols". The cap and its limit of 2 are this edition's. |
| A narrower board | No: the book never gives a size. This edition's choice. |
| Starting towers further in | No: the book names bases and corners (c7-b81 "the southeast corner"), no columns. This edition's choice. |
| Sight 4 | No: the book never gives a number. This edition's choice. |

## Recommendation: book-4 = book-3 + r5 + kill reports

- **Board:** 18 wide, 14 high, book-1's rocks.
- **Symbol gliders see 2 squares** around them while they fly. Plain gliders carry no sight. Placement reach stays the towers' 3, so reach never exceeds sight.
- **Symbols form past the tower cap** of 6, but a side holds at most 2 towers formed from symbols. A formed symbol still has to be walled in on the next turn, or it's gone.
- **Kill reports:** a side learns the square and step of every enemy tower its gliders destroy, seen or not, plus both sides' counts. The tie-break uses those counts. A destroyed tower leaves the killer's last-seen. Nothing else from the dark is revealed.
- **Unchanged from book-3:** costs (mirror 1, symbol glider 2, moving wall 4, factory 2), factories firing every 4 steps, the tie-break.
- **The computer:** F.

It's ruleset `book-4`, a draft started by name in agent play, for the people on the drafts list (the owner). New Rocks and Mirrors matches stay book-2, and book-1, book-2 and book-3 records keep their rules.

## Open points
- **Mirrors and factories** are still rarely the computer's choice.
- **Level 1 spends 59%**, because of its 3-pieces-a-turn limit.
- **Carry-over** isn't in book-4. Agent play doesn't support it yet, and c4 showed the computer hoarding with it.
