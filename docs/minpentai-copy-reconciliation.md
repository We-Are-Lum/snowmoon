# Minpentai tutorial wording: the board's copy against the branch's

Two model-drafted wording files exist for the tutorial:

- `docs/design/minpentai-tutorial-copy.json`: the Minpentai Tutorial board's copy
  (Claude Design, 12 screens, written for the board's own prototype engine).
- `src/lib/minpentai/tutorial-text.ts`: the wording the `/minpentai` page shows
  (11 screens, written for this branch's engine and lessons).

**Which one the page uses.** `tutorial-text.ts`, unchanged by the restyle
(2026-10-07). It is wired to this branch's engine, its goals are tested
(`scripts/test-minpentai-tutorial.ts`), and it carries an owner-directed
correction the board's copy does not have (screen 5 below). The board's copy is
kept in `docs/design/` as reference. Both stay labelled model-drafted until Nate
rewrites them. Nothing below has been changed in either file; every difference is
a decision for Nate.

Compared by the coding agent on 2026-10-07.

## Facts the two disagree on (not just wording)

| # | Topic | Board's copy | Branch | What the book says |
|---|---|---|---|---|
| F1 | **Running time backward** | Screen 5 "Time runs both ways": "Step back and you get the true past, not a guess. That is why any wall that can be built can also be destroyed." | Replaced on Oct 6 with "Running the rules backward": the sandbox can step back to turn 0; "In a match, time only moves forward." The old wording "overstated it" (`tutorial-text.ts`, `docs/minpentai-backward.md`). | Zei says the rules are time-reversible, so any wall can be destroyed (c4-b9, c4-b13); no block shows time reversed on a live match board. |
| F2 | **The symbol's cycle** | 12 arrangements (screen 9; the board's engine note: "12 arrangements, not 13"). | 13 states (the sandbox legend; `symbol.ts`). | Not in the book; both are invented. The engines differ, so one count is wrong for the other's engine. |
| F3 | **How a symbol forms** | A glider strikes **two** rocks and the symbol holds for exactly one turn (screen 8; engine note). | A glider forms one **against a rock** (screen "symbol"; the "glider meets a rock" preset). | Not in the book (rocks and this mechanism are invented). In ch 4 Zei's gliders form his symbol against Dza's wall for one turn (c4-b113). |
| F4 | **A lone cell's movement** | Caption: "it hops to the opposite corner of its block every turn, and is back after four turns" — but the board's own engine note corrects this to "visits 4 positions in 4 turns". | "watch this one hop and come home" in four steps. | Recovered from the c4-b5 figure (`docs/minpentai-rules.md`). The branch's engine and the board's engine note agree; the board's caption does not. |
| F5 | **Player symbol shape** | 4-cell symbol (the tutorial board's open issue). | The branch's symbol (`symbol.ts`). | Direction board 1c draws 5×5 symbols. Gap list conflict 2: one has to change before matches ship. |
| F6 | **The match screen** | "An illustration of a full match. The sandbox can't play one yet", with six illustrated frames. | A recorded match played by computer players under invented rules, labelled "Computer players · match rules invented". | Ch 4's match (c4-b93–c4-b142). |
| F7 | **What a symbol shows** | "everything within thirty squares of it" (c4-b93). | "the board around it". | c4-b93: "within thirty squares". The board is closer to the book. |

## Screen by screen

| Board # | Board id | Branch id | Titles (board / branch) | Differences |
|---|---|---|---|---|
| 1 | hook | arena | "Over a thousand people are watching" / "A game a whole country watches" | Board: a high-school programming game; devices handed over, drone scan, display glasses (c4-b77–c4-b82), countdown lettering with gloss. Branch: a stadium inside a mountain; "the priests secretly choose a new rule" (c4-b84, c4-b148); caption "MU GU GEI FA · starting in fifty ticks". Board button "BEGIN", branch "Next". |
| 2 | motive | you | "Your last season" / "Your season" | Board quotes Zei (c4-b15) and shows a season ladder and "a rival who has beaten you 3 of 3" (c4-b72). Branch: one sentence, adds prize money (c4-b73), caption "Your symbol". |
| 3 | alive | alive | "The board moves on its own" / "The board is alive" | Board: many cells and two gliders, "Press play"; caption on 2×2 blocks shifting. Branch: one cell, "Step forward four times". |
| 4 | rule | — | "Rotate one eighty if three" | Board only: names the rule (c4-b7) and says cells are never created or destroyed. The branch has no screen for the rule's name. F4. |
| 5 | reverse | backward | "Time runs both ways" / "Running the rules backward" | F1. Board adds turn-0/turn-4 outlines. |
| 6 | glider | glider + build | "Build a glider" / "The glider" and "Build one" | The branch splits watching and building into two screens. Board: "travel two cells every four turns"; "placed one cell off, the same shape stays put". Button "PLACE IT FOR ME" vs "Draw it for me". |
| 7 | rocks | rock | "Rocks bounce gliders" / "Rocks" | Both say rocks are the sandbox's own (board caption; branch `invented`). Board ties them to the book's rock formations and reflecting walls (c2-b12). |
| 8 | symbol | symbol | "Your symbol" / "Your symbol" | F3, F7. Branch asks the visitor to stop while it is framed. |
| 9 | guard | — | "Lose them all and you're out" | Board only: a glider destroys a symbol; all copies gone means elimination (c4-b136–c4-b138). The branch teaches this in the practice match, not the tutorial. F2. |
| 10 | match | match | "A real match" / "A full match" | F6. Branch: four corners, a turn to act every 24 turns (invented), crowd vs player sight (c4-b114). |
| 11 | hard | hard | "Why it's hard" / "Why it is hard" | Board: five reasons, adding random teams (c4-b89–c4-b90, c4-b150). Branch: four reasons, and "This is the same match as cyan sees it." |
| 12 | book | book | "The book's own board" | Board: cropped figure, right half reconstructed to replay 120 frames; "START PLAYING". Branch: "drawn in chapter 4 … from a real match"; leads to the practice match. |

## Shared labels

| Board | Branch |
|---|---|
| "TAP TO SKIP" while a demo runs | The label doesn't change; a second tap finishes the demo (same behaviour). |
| "NEXT" when done | "Next" |
| "Skip tutorial" | "Skip to free play" |
| Tags "BOOK · CH 4" / "ENGINE" per claim, with a "sources" list of block IDs per screen | Tags "Book · ch 4" or "invented" per screen (added in the restyle); sources live in the file's header comment, not on screen. |

## What the restyle took from the board

Layout and look only: the bar with the name and count, one mark per screen,
the board on top with its counts under it, the transport row (◁| · Play · |▷),
tags, title (27px), instruction (18px), caption (15px), numbered reasons, and a
footer with the skip link and one main button. The board's 10–11px labels are
set at the 12px floor. The board's tap-to-jump marks are display-only here:
eleven marks at 390px are 29px wide, under the 44px tap floor, so the
"jump to a screen" menu stays. Not taken: the per-screen sources list (the
branch has no per-screen claim data yet), the season ladder, the countdown
lettering card, and the illustrated match frames.
