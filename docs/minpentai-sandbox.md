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
- Tapping only that button takes a visitor through the tutorial and the practice match to the match against the computer in 25 taps, about 25 seconds.

**Navigation.** Four tabs at the top: Learn, Practice, Play, Sandbox. The browser remembers once the tutorial is finished or skipped. `?lesson=N` opens screen N; `?mode=practice` and `?mode=play` open the matches; `?mode=free` or a shared board (`?s=…`) opens free play. In the tutorial, stepping back stops at turn 0.

**Wording.** All of it is in `src/lib/minpentai/tutorial-text.ts`, keyed by screen id, with the book blocks behind each claim. It is marked model-drafted, and the page shows "Draft wording" until `modelDrafted` is set to false. Nothing comes from beyond chapter 4.

**Screens.** Defined in `src/lib/minpentai/tutorial.ts`. "Read" screens have no goal; the hands-on goals and demos are below.

| # | Screen | What happens | Goal; demo |
|---|---|---|---|
| 1 | A game a whole country watches | The stadium, the crowd, the priests' secret rule. The book's board plays. | None |
| 2 | Your season | Last year of school tournaments; the nationals and prize money. Your symbol cycles. | None |
| 3 | The board is alive | A lone cell hops and comes home | Four turns forward; four steps |
| 4 | Running the rules backward | The rules run in reverse, so the sandbox can step back to see where a pattern came from; in a match, time only moves forward. Starts at turn 4. Wording model-drafted (see `minpentai-backward.md`). | Turn 0; four steps back |
| 5 | The glider | Your main tool | Sixteen turns of travel; plays |
| 6 | Build one | Tap four outlined cells | A glider detected; taps the outline |
| 7 | Rocks (invented) | Gliders bounce off rocks | Glider travelling back down; plays |
| 8 | Your symbol (invented) | Sight, protect and hunt; formed against a rock | Paused on a framed turn; steps to turn 22 |
| 9 | A full match (invented) | The recorded four-player match (below) as the crowd sees it, with a line for each turn to act, each player out, and the winner | None |
| 10 | Why it is hard | The same match as cyan sees it, and four reasons: sight, rare turns to act, changing rules, no invincible wall | None |
| 11 | The book's own board | The c4-b5 board plays; "Practice match" goes on to the practice match | None |

**Tests.**
- `npx tsx scripts/test-minpentai-tutorial.ts` runs every screen's demo through the engine and checks that the goal is met on exactly the expected move and not before. It also checks near misses, the illustration's frames against their captions, and the text rules.
- In a browser at 390px with touch, in light and dark mode:
  - a one-button run reaches free play;
  - a self-solved screen says "You did it", and a double tap finishes a demo;
  - the main button is always in view, and nothing sticks out past the right edge;
  - the illustration advances, and holds still under reduced motion.

## Matches

Everything in this section is **invented**. Chapters 2–4 describe how a match goes but give no numbers or exact procedure, so every number and procedure here is ours. The page labels each match screen "Match rules invented", and each match screen marks its wording as drafted.

**What the book gives us.**
- The board starts dark; a copy of your symbol lets you see around it (c4-b93).
- Setup happens in a home corner (c4-b94).
- The battle then runs on its own (c4-b106–b108).
- Intervention turns let players "put down more squares near any copy of their symbols" (c4-b110).
- A player whose symbols are all destroyed is out (c4-b136–b138).
- The crowd sees the whole board (c4-b114).
- Players test designs in a private sandbox first (c4-b96).
- Walls reflect gliders (c2-b12).

**The rules** (`src/lib/minpentai/match.ts`):

| Rule | Value |
|---|---|
| Owners | Every live cell has an owner. Each turn applies the book's rule exactly, and owners travel with their cells by a fixed pairing inside each block. A test checks that the live cells always equal the plain rule's. |
| Your symbol | A recognised symbol with at least 3 of its 4 cells yours. Where one has been seen is a *site*. A site lasts 8 turns after its symbol was last recognised, so a symbol that flickers as a glider passes is not lost at once. A symbol that forms out of your cells on impact gives you a site too (the book's foothold "for exactly one turn", c4-b113). |
| Sight | 10 cells around each of your sites (the book: thirty squares on a far bigger board). Rocks are shown everywhere: the map is known. |
| Turns to act | Every 24 turns (the book: about a thousand). |
| Squares | Up to 8 per turn to act, each within 7 cells of one of your sites, on empty cells with an empty cell around the new shape. Three things to put down: a glider (4 squares, any of four directions, snapped to where it travels), a single square (1, which bounces gliders), or a new symbol (4). |
| Out and winning | A player with no sites is out; the last player in wins. At turn 480, the most sites wins, and equal counts are a draw. |

**Test.** During your turn to act, Test runs the next 48 turns on a private copy that holds only what you can see, plus your squares this turn. Nothing is placed.

**Computer players** (`src/lib/minpentai/ai.ts`). They play fair: each knows the rocks and only the cells it can see. Results are the same for a given seed.
- *Normal* tests its options on a private copy of what it sees:
  - it blocks a glider that would destroy one of its symbols;
  - it fires at symbols it can see, when a test shows the shot lands;
  - it spreads new symbols toward the middle or the enemy.
- *Easy* tests only that a shot will not hit its own symbols. It spreads slowly, fires roughly in your direction without checking its aim, and never defends.

**Three matches** (`src/lib/minpentai/matches.ts`):
- **Watched (tutorial screens 9 and 10).** Four normal computer players start in the corners of a 56 × 56 board. The page replays a recorded game rather than running four players on a phone.
  - `scripts/record-minpentai-match.ts` plays seeds until a match ends with three players out, the first no earlier than turn 80 and the last by turn 400.
  - It keeps seed 2: amber is out at 178, cyan at 267 and pink at 346, so violet wins.
  - It writes the moves to `watch-moves.ts`.
- **Practice (`?mode=practice`).** You against a practice rival with one symbol and a script: its only move is one glider, fired at your nearest symbol during setup. There are five steps, and the one button works the same way as in the tutorial ("Show me", then "Run"). The outline shows each step's move, and the right tool is already chosen.
  1. You see only around your symbols.
  2. Spread: a new symbol on the outline, which brings the rival into sight.
  3. Block: one square in the glider's path. The goal is met when a full-information test shows every symbol of yours still standing 48 turns on.
  4. Attack: a glider at the rival's symbol. The goal is met when the test shows it gone and yours safe.
  5. You win. The rival is out at turn 58.
- **Against the computer (`?mode=play`).** You (cyan, lower right) against easy (amber, upper left), on the tutorial's 48 × 32 board with six rocks. Run ends your turn; tapping again skips ahead. Play again starts a new seed.

**How the computer players measure up** (engine runs, not people):
- Normal beats easy in 7 of 8 seeds.
- Easy beats a player who does nothing in 6 of 8 seeds, between turns 190 and 476.

**Tests.**
- `npx tsx scripts/test-minpentai-match.ts` checks:
  - owners and the rule;
  - each glider stamp's direction;
  - reach, crowding, budget and turns to act;
  - that the recorded match replays to its recorded result;
  - the practice: doing nothing loses a symbol; each goal is unmet before its scripted move and met after it; near misses (off the outline, out of the path, a missed shot) do not count; the rival is out after the shot;
  - that easy beats an idle player in most seeds.
- In a browser at 390px with touch, in light and dark mode:
  - one button alone gets through the tutorial and practice to the computer match;
  - doing nothing against the computer ends the match;
  - the practice works by hand, tapping each outline twice and using Test;
  - text, tap-target size, fonts and fit to the screen all pass on every screen;
  - the watched match plays, and holds still under reduced motion.
