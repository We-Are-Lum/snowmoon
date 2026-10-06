# Prompt: Redesign the Minpentai tutorial

A brief for Claude Design. Paste everything below the line.

---

## What you are designing

The tutorial for a small web sandbox at `/minpentai`, inside the Snowmoon Living Edition, a free, unofficial reading app for Vitalik Buterin's novel *Snowmoon* (GPL-3.0). Minpentai is a game the characters play in the book. The sandbox is a working reconstruction of its board. The tutorial is what a first-time visitor sees.

The visitor arrives knowing nothing: not the book, not the game, not cellular automata. By the end they should:

1. feel that this is a fun, strange game worth playing;
2. know what a player is trying to do and why they care;
3. picture what a full match looks like, even though the sandbox can't play one yet;
4. understand why it's hard;
5. have used the real board with their own hands, and be ready for free play.

## The one-button rule

The whole tutorial must be completable by tapping one button, in the same place on every screen, over and over.

- That button is always there and always moves the visitor forward.
- On screens where the visitor is invited to do something (step, play, tap cells), the same button still works. Tapping it does the action for them, at a watchable pace, and then moves on.
- The visitor should never be stuck, never have to read instructions to find the next control, and never hit a goal they must meet before continuing.
- Doing it themselves should be the more satisfying path, but never the required one.
- Show progress (for example, dots). Offer a quiet way to jump to free play at any time.

Design how the button's label changes, for example "Next", "Show me", "Play it", "Start playing", while its position and weight stay the same.

## Where it runs

- A mobile phone first, 390px wide, inside a Farcaster mini app. It must also work on desktop.
- Thumb-reachable. Tap targets at least 44 × 44px. Text at least 12px.
- The board is a canvas. The page around it is the app's normal paper page.

## The approved visual design (keep it)

**Page:**
- Paper `#F4F2ED`, ink `#1D1D1B`, muted `#6A675F`, rule `#DAD6CC`.
- Dark mode: paper `#161614`, ink `#E7E4DD`.

**Fonts:** only two in app chrome.
- Crimson Pro for reading and headings.
- DM Mono, uppercase and letter-spaced, for labels and buttons.

**Board** (from the approved Minpentai board design):
- Near-black field `#060608`; cells `#0E0F13` with 1px grid lines `#16171C`.
- Live cells are cyan `#46D7E8` squares, inset by a sixth of the cell.
- Rocks are full cells in neutral grey `#4B4C55`.
- A recognised symbol's cells are full-bleed cyan, with a dashed cyan frame one cell out.
- A dark strip above the board reads `TURN n · LIVE n · SYMBOLS n`.

**Two notes on the board design:**
- One panel of that design, "one glider, four turns", wrongly uses Conway's Life. Ignore it.
- Owner colours (Zei cyan `#46D7E8`, Bai amber `#FFB43A`, Pan pink `#FF5C8A`, Dza violet `#A98BFF`) exist in the design. Use them only in illustrations of a full match. The sandbox itself is single-colour.

## Hard rules

1. **No spoilers beyond chapter 4.** Everything you say about the game, the world or the characters must come from chapters 2–4. The book later reveals a deeper purpose behind Minpentai. Don't hint at it, don't foreshadow it, and don't invent your own version of it.
2. **Label what's invented.** The game's real rule comes from the book. Several things in the sandbox are invented (listed below). Anything invented carries a small "invented" tag in the UI. Never present an invented part as the book's.
3. **At most two short sentences of instruction per screen,** in plain words. Captions and labels are fine beyond that, but no paragraphs.
4. **Be honest about the sandbox.** It has no opponents, no fog of war, no intervention turns, and no hex grid. Where you show a full match, make it an illustration or a scripted animation clearly marked as an illustration ("this is what a real match looks like"), not something the visitor plays.

## What the book says (chapters 2–4 only; your source material)

**The game and its world:**
- Minpentai is "a high-school programming game" (c4-b79), played across Dzego, the visitor's country.
- Big matches are held in a giant room inside a mountain shaped like a pyramid, before "over a thousand people" (c4-b78–c4-b79). Players enter by elevator pod and hand over their devices (c4-b77). Drones scan them for cheating equipment (c4-b81). They play at a console wearing display glasses (c4-b82).
- An automated voice counts down in Dzegoban: "MU GU GEI FA. Starting in fifty ticks." (c4-b83).
- Priests run it. Before a round they go "into the dungeon to decide on the rule sets" (c4-b148). "Every game there's always some kind of new rule, and the most important tactic of all was knowing how to adapt" (c4-b84).
- There are tournaments with rounds. Losing in the quarter-finals means you "have to find another career. Or try harder for next year!" (c4-b88).

**The player's motive** (use this to give the visitor a reason to care):
- Zei, the book's young champion-to-be: "I'm just trying to win the championship. This year is the last year I can participate, and if I win, go to the nationals." (c4-b15)
- Prize money: his rival Bai taunts him about "your excitement about getting some prize money to buy a compute box for your mom" (c4-b73).
- Rivalry and pride: Bai "had beaten him three out of three times" (c4-b72).
- Quarter-finals can be 2 v 2 teams, assigned at random by default. In one match Zei is paired with his rival, and they have to cooperate to win (c4-b89–c4-b90, c4-b148–c4-b150).

**How a match is played** (for the "full gameplay" illustration):
- **Setup.** The board starts completely black. Each player has a symbol, "a pattern of dots that, were a copy of it anywhere on the board, would allow him to see everything within thirty squares" (c4-b93). In the "initiation phase" you place copies of your symbol and your first structures in your home corner (c4-b94). You test designs in a private sandbox first, then place them for real (c4-b96).
- **The battle runs on its own.** Gliders fly out, hit rock formations, and make more gliders. Spaceships, "large slow-moving gliders", crash into rocks in a controlled way and leave copies of your symbol behind, so the area you can see grows (c4-b106–c4-b108).
- **Intervention turns.** Every so often (about a thousand turns apart in the book), "all players were able to put down more squares near any copy of their symbols" (c4-b110). In between, you watch your plans unfold.
- **Conflict.** Stray gliders wreck factories (c4-b109). Walls reflect gliders (c2-b12). Tricks include a "moving wall" (c4-b111), and gliders that come together into your symbol "for exactly one turn", just long enough to give you a foothold deep in enemy territory (c4-b113).
- **Elimination.** When every one of a player's symbols is destroyed, they are out (c4-b136–c4-b138). Players can resign (c4-b141). Late in a match "most of the game field had become a high-entropy wasteland" (c4-b140).
- **The audience** sees the whole board; players see only around their symbols (c4-b114).

**Why it's hard:**
- You can't see most of the board; you see only near your symbols (c4-b93).
- You can only act in brief intervention turns, then your plan runs without you.
- The rules change every match, and you learn the new rule only at the start (c4-b84, c4-b102).
- The rules run backward exactly, so no wall is invincible: "any wall that can be created in some way can be destroyed in some way" (c4-b9, c4-b13).
- You may have to cooperate with a teammate you don't like (c4-b118, c4-b150).

## What the sandbox actually does (build only on this)

**From the book:**
- **The rule.** It was recovered exactly from an animated board figure in chapter 4 (figure c4-b5, named "rotate one eighty if three", c4-b7). The board updates in 2×2 blocks whose grid shifts each turn. Live cells are never created or destroyed. Every step can be undone exactly: stepping back is the true past, not an approximation.
- **The book's own board.** A preset loads the opening frame of that figure.

**How it behaves:**
- A lone cell hops to the opposite corner of its block and back, every 4 turns.
- There is exactly one glider: 4 cells (`.##.` over `#..#`). It moves 2 cells every 4 turns, straight up, down, left or right. Placed one cell off its working position, the same shape doesn't travel.

**Invented, labelled in the UI:**
- **The board:** 48 × 32, wrapping at the edges.
- **Rocks:** fixed grey cells. Gliders bounce off them like mirrors.
- **The symbol:** a 4-cell skew shape (`#..` / `.##` / `.#.`). The book never shows one.
  - When a glider strikes a rock from the right angle, the symbol forms for a turn or two, then the glider bounces away.
  - Drawn alone, the symbol stays in place but cycles through 13 arrangements, some in separate pieces. All of them are recognised and framed.
  - A glider fired into a symbol destroys it for good.
- **The hidden half of the book's preset:** the figure is cropped, so the right half of the board was reconstructed so that the visible part replays the book's 120 frames exactly.

**Available to you:**
- Step forward, step back, play and pause, speed, place and remove cells, zoom (1×, 2×, 3×).
- Presets: the book's board, and a glider striking a rock. Any small board can be scripted for a screen.
- The engine can detect: a glider and its direction, a bounce, symbols, and turn numbers.

## Narrative arc to design

Treat these as a suggested arc, not a fixed list. Merge, split or reorder them, aiming for roughly 8–12 screens and about two minutes if the visitor just taps through.

1. **Hook: this is a game people love.** The mountain stadium, the crowd, the countdown. Make it feel like an event, not a lesson.
2. **Your motive.** You're a young player in Dzego. Win this season and you go to the nationals, with prize money on the line. (Draw on Zei's motive without making the visitor Zei.)
3. **The board is alive.** Cells move on their own once the battle begins.
4. **Time runs both ways.** Every move can be undone. That's why no wall is invincible.
5. **The glider,** your main tool, and building one with four taps.
6. **Rocks and reflection.** (invented)
7. **Your symbol:** what it does (vision) and why it matters (it's what you protect and what others hunt). Forming one with a glider and a rock. (invented shape)
8. **A full match, illustrated:** setup in your corner; the dark board lighting up as you spread; intervention turns; walls and gliders clashing; a symbol wiped out; a player out; the crowd. Mark it as an illustration.
9. **Why it's hard:** limited vision, rare chances to act, rules that change every match, no invincible defence.
10. **The book's own board**, playing, then the hand-off: "Start playing".

## Deliverables

1. **Storyboard:** every screen at 390px, in light and dark, with the board state shown.
2. **Copy for every screen:** instruction, button label, captions, and "invented" tags. Each claim about the book carries its block ID, so it can be checked.
3. **Interaction spec per screen:**
   - what the board shows (preset, zoom, view);
   - what the visitor can do;
   - what the one button does if they do nothing;
   - what the engine detects to mark "you did it";
   - how fast any auto-play runs.
4. **The full-match illustration:** either a frame-by-frame sequence the engineers can render in code, or a static illustrated panel. Keep it in the board's visual language.
5. **Motion notes:** how screens transition, and how "show me" animates the action.
6. **Edge cases:** reduced motion, very small screens, desktop width, returning visitors (who should land in free play with a way back to the tutorial).

The copy will be handed to an engineer, who will put it into one editable wording file (`src/lib/minpentai/tutorial-text.ts`). It ships marked model-drafted until the owner edits it.
