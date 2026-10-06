# Minpentai sandbox: what is from the book and what is invented

The sandbox at `/minpentai` is an unofficial reconstruction. This file records where each part comes from. The rule and its evidence are in `minpentai-rules.md`.

## From the book

- **The rule.** It is the rule animated in figure c4-b5, the "rotate one eighty if three" rule of c4-b7, shown in the form where no block gains or loses live cells. The board updates in 2×2 blocks whose partition alternates: on even turns blocks start at (0,0), on odd turns at (1,1).

  | Live cells in a block | Even turn | Odd turn |
  |---|---|---|
  | 0 or 4 | unchanged | unchanged |
  | 1 | unchanged | rotated 180° |
  | 2 | complemented | complemented |
  | 3 | rotated 180° | unchanged |

  Each turn's map is its own inverse, so stepping back from turn t applies turn t−1's map again.
- **The opening frame of c4-b5.** It is the left 24 × 16 of the first preset.

## Invented

| Part | Choice | Why |
|---|---|---|
| Board | 48 × 32, wrapping on all edges | The book gives no size or edges (`minpentai-rules.md`, section 4). The sides are even so the 2×2 blocks wrap cleanly. |
| Rocks | A rock is a fixed cell. A 2×2 block containing a rock is left unchanged that turn. | This keeps each turn's map one-to-one, so the rules still run backward exactly and live cells are still conserved. Under this rule, rocks act as mirrors: a glider fired straight at one bounces back. The book's rocks are also a resource that gliders break up (c4-b108, c14-b38); these are not. |
| Symbol | The skew tetromino `#..` / `.##` / `.#.`, in one fixed orientation | The book gives no shape. Chosen by the search below. |
| Symbol counting | A symbol is counted wherever the live cells inside one of its cycle states' bounding box match that state exactly. The one-cell margin around the box must hold no live cells; rocks are allowed there. | Measured below. Every recognised symbol gets a dashed frame. |
| c4-b5 preset, right half | Columns 24–47, found by a SAT solver | The figure is cropped. Cells enter from beyond its right edge from turn 2, so the opening frame alone stops matching the book after a few turns. A solver found a right-hand side (one of many) with which the crop replays all 120 frames exactly, on a board that wraps every 16 rows. The preset stacks it twice to fill 32 rows. |
| Glider-and-rock preset | One glider moving up, at (21, 27), and one rock at (24, 16) | Chosen so the symbol forms on impact. |
| Zoom | Whole board, 2× and 3×, with pan buttons | At 390px wide a cell is 7.5px. At 3× it is 22px, large enough to tap. At 2× the view is exactly the c4-b5 figure's area. |

## The symbol search

`scripts/search-minpentai-symbol.ts`

**Gliders.** Among random patterns of up to 8 cells, the rule has exactly one glider. It has 4 cells (`.##.` / `#..#`), moves 2 cells every 4 turns, and travels in all four straight directions. A lone cell is not a glider: it jumps to the opposite corner of its block and back, which is the "wall" of single cells in c4-b5.

**What a glider striking a rock can make.** A single glider and a fixed rock cannot leave a product that stays put and nothing else. Run backward, a board where everything stays put would stay put forever, so it could never have sent the glider out. A symbol made this way therefore forms during the collision, as the book's does "for exactly one turn" (c4-b113).

**Results.** 672 shots: every glider direction × 6 small rock shapes × 7 sideways offsets × 2 timings.

| Shape family | Shots it formed in | Rocks | Longest run | Clusters per turn on a random board |
|---|---|---|---|---|
| L of 3 | 208 | all | 1 turn | 2.83 |
| V of 3 | 208 | all | 2 turns | 1.19 |
| Skew of 4 (chosen) | 208 | all, including a single rock | 1 turn | 0.22 |
| 2×2 square | 32 | two cells or more | 2 turns | 0.18 |

The last column counts clusters of that family on 48 × 32 boards at 25% density over 300 turns.

The skew tetromino forms from every rock shape and rarely forms by chance. Drawn on an empty board, it stays in place from any starting turn and position. In doing so it cycles through 13 arrangements, 2 of them connected. The legend on the page shows all 13.

**Chance matches of the counting rule.** `scripts/measure-minpentai-symbol.ts` runs random 48 × 32 boards for 400 turns after 100 turns of mixing, and counts recognised symbols per turn:

| Density | Every state of the cycle | Connected states only |
|---|---|---|
| 2%, 5%, 10% | 0.000 | 0.000 |
| 25% | 0.097 | 0.033 |
| 40% | 0.003 | 0.001 |

Chance matches are rare: at worst about one every ten turns, across the whole board, at 25% density. A deliberately drawn symbol is recognised on 100% of turns when every state counts, but only on 31% when only connected states count. So every state of the cycle counts. A glider on its own is never recognised as a symbol.

## The design

The board follows the approved Minpentai board (`design/direction-boards.png`, section 1c): a near-black field, cell grid, inset cyan live cells, grey rocks, full-bleed symbol cells, and a dashed frame round each symbol. The fixes it was "approved with" are not written down anywhere. The two applied here:
- It works at 390px wide, with zoom for placing cells.
- Its "one glider, four turns" panel is not used, because that panel runs Conway's Game of Life (noted in `design/README.md`).

There are no matches, opponents, fog or hex grid.

## Tests

`npx tsx scripts/test-minpentai.ts` fails on any problem. It checks seven things:
1. The rule reproduces all 10,303 interior block updates in the 120 frames of c4-b5.
2. Forward then backward restores random boards, with and without rocks.
3. The live-cell count never changes.
4. Rocks keep each turn's map one-to-one, checked exhaustively on every state of a 4 × 4 board with a rock.
5. The c4-b5 preset's crop replays all 120 frames.
6. A symbol drawn alone is recognised on every turn, and the glider-and-rock preset recognises it on turns 22, 23, 26 and 27 only.
7. The URL state round-trips.

Copies of the rule without the rotation clause, or with its phases swapped, fail test 1 with 571 and 1,237 mismatches.

## Tutorial

A first visit to `/minpentai` opens an 11-screen tutorial, redesigned from `minpentai-tutorial-design-prompt.md`.

**One button.** A bar pinned to the bottom of the screen holds the progress dots, one main button, a jump menu, and a quiet "Skip to free play".
- On reading screens the button says Next.
- On hands-on screens it says what it will do ("Show me", "Play it", "Draw it for me", "Fire it"), then performs the screen's demo at a watchable pace. A second tap during a demo finishes it at once.
- When the goal is met, by the visitor or the demo, the button says Next.
- Tapping only that button takes a visitor from the first screen to free play in 17 taps, about 18 seconds.

**Navigation.** The browser remembers once the tutorial is finished or skipped. `?lesson=N` opens screen N. `?mode=free` or a shared board (`?s=…`) opens free play. In the tutorial, stepping back stops at turn 0.

**Wording.** All of it is in `src/lib/minpentai/tutorial-text.ts`, keyed by screen id, with the book blocks behind each claim. It is marked model-drafted, and the page shows "Draft wording" until `modelDrafted` is set to false. Nothing comes from beyond chapter 4.

**Screens.** Defined in `src/lib/minpentai/tutorial.ts`. "Read" screens have no goal; the hands-on goals and demos are below.

| # | Screen | What happens | Goal; demo |
|---|---|---|---|
| 1 | A game a whole country watches | The stadium, the crowd, the priests' secret rule. The book's board plays. | None |
| 2 | Your season | Last year of school tournaments; the nationals and prize money. Your symbol cycles. | None |
| 3 | The board is alive | A lone cell hops and comes home | Four turns forward; four steps |
| 4 | Time runs both ways | Every move can be undone, so no wall is invincible. Starts at turn 4. | Turn 0; four steps back |
| 5 | The glider | Your main tool | Sixteen turns of travel; plays |
| 6 | Build one | Tap four outlined cells | A glider detected; taps the outline |
| 7 | Rocks (invented) | Gliders bounce off rocks | Glider travelling back down; plays |
| 8 | Your symbol (invented) | Sight, protect and hunt; formed against a rock | Paused on a framed turn; steps to turn 22 |
| 9 | A full match | Five-frame illustration in the board's style, labelled not playable: setup in the dark, spreading, an intervention turn, the clash, the rival out. Frames from `src/lib/minpentai/illustration.ts`. | None |
| 10 | Why it is hard | Four reasons: sight, rare turns to act, changing rules, no invincible wall | None |
| 11 | The book's own board | The c4-b5 board plays; "Start playing" hands it to free play | None |

**Tests.**
- `npx tsx scripts/test-minpentai-tutorial.ts` runs every screen's demo through the engine and checks that the goal is met on exactly the expected move and not before. It also checks near misses, the illustration's frames against their captions, and the text rules.
- In a browser at 390px with touch, in light and dark mode:
  - a one-button run reaches free play;
  - a self-solved screen says "You did it", and a double tap finishes a demo;
  - the main button is always in view, and nothing sticks out past the right edge;
  - the illustration advances, and holds still under reduced motion.
