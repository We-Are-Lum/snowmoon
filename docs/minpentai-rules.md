# Minpentai: what the book says about the rules

> **Spoilers** for chapters 2–31.

**Scope.** This is a read-only investigation of the committed chapter text (`content/snowmoon/text/`) and its exported figures (`docs/source-figures/`). Block IDs are `c<chapter>-b<idx>`. Quotes are exact. It reports findings only and builds no game.

**Status labels.**
- **Stated:** the text says it outright.
- **Implied:** it follows from what the text describes, but no line says it.
- **Unspecified:** the text leaves it open.

## Summary

1. **The square-grid rule in c4-b5 is recovered exactly.** It is the only board figure that shows successive states: a 120-frame animation labelled `t=0` to `t=119`. Every interior update fits a reversible rule on 2×2 blocks whose partition alternates each turn, forward and backward, with no exceptions (10,303 block updates). The rule is the "Critters" block rule. It is drawn so that live cells are conserved, and its "rotate 180° if three" clause matches the variant the text names at c4-b7. Confidence is high. What remains open: the board's size and edges (the figure is cropped at least on the right), and the base rule that this variant modifies.
2. **The hex-grid rule is stated in words (c12-b169, c12-b170) and checks out as reversible.** The order in which the triangle tilings shift is not given. Two families of schedules reproduce the text's claims about glider directions (c12-b152, c12-b192), so the text narrows the schedule but does not fix it.
3. **Every other board figure is a symbol map, not a cell board.** These are c4-b115, c4-b137, c7-b87, c7-b97, c7-b112, c7-b118, c12-b191, c14-b52, c14-b60, c14-b68 and c14-b80. Every symbol count the text gives matches its figure. Two cautions:
   - Which marker means which player changes between chapters.
   - Two figures contain exactly duplicated markers, which must be counted once.
4. **Much of the game is unspecified.** The text leaves open the board's size, the symbol shapes, what rock formations are, the intervention budget's units, when intervention turns come, and the measure behind "thirty squares". Section 5 lists the smallest set of inventions a playable sandbox needs.

## 1. Rules in the text

### 1.1 The grid and how cells evolve

| Rule | Status | Evidence |
|---|---|---|
| The game is a cellular automaton on a grid of squares ("cells", "squares"); a square grid is the default | Implied | "Today, Minpentai will be played on a hex grid." (c12-b147), announced as a rule change; players "put down squares" (c4-b94); "intervene in only a few cells" (c14-b36) |
| The rules are time-reversible | Stated | "Well, remember, the rules are time-reversible. So any wall that can be created in some way can be destroyed in some way." (c4-b9) |
| No invincible structure exists | Stated, as a consequence | "Anything that can be created can be destroyed." (c4-b13) |
| The rule is a pure permutation, with no information-destroying layer | Stated | "But unlike the hash function, here there was no truncate-and-xor wrapper at the end." (c12-b163) |
| Cells are conserved under the ordinary rules | Stated | "The shrines are the only objects that violate mass conservation" (c14-b35) |
| A named variant rule exists | Stated | "We were playing with the 'rotate one eighty if three' rule." (c4-b7) |
| Moving structures: gliders and spaceships; a "moving wall" is a large glider at half speed | Stated | "Spaceships flew out, acting as large slow-moving gliders" (c4-b108); "a sort of large glider that flew half as fast" (c4-b111) |
| Static structures: walls, factories, rock formations | Stated | "Walls, gliders, rocks, techniques for extracting usable negentropy from rocks, sideways attacks." (c4-b84); "eternal glider factory" (c14-b38) |
| Rock formations are a resource that gliders turn into more gliders | Stated | "Gliders flew out, interacted with rock formations, and created more gliders." (c4-b108); "constructed in real time out of nearby rock formations by gliders" (c7-b107) |
| Rock formations exist from the start and are hidden until seen | Implied | Zei "made a couple of guesses about what shape the rock formations in the hexgrid version of Minpentai might look like" (c12-b157), then a symbol "revealed a part of the board that showed what the rock formations look like" (c12-b187) |
| What a rock formation is, in cell terms | Unspecified | |
| Cells have no owner; a glider harms whoever it hits, including its sender's side | Implied | "A few stray gliders from Bai accidentally flew into Zei's territory, and wrecked one of his factories." (c4-b109); a misplaced glider "began to fly back toward his own base" (c4-b109) |
| Collisions make debris; the board's disorder grows | Stated | "most of the game field had become a high-entropy wasteland" (c4-b140); "More and more debris." (c14-b79) |
| Hex rule: the board splits into triangles each step; a triangle with one filled hex rotates clockwise, with two it rotates counterclockwise | Stated | "During each step, the game board split up into triangles, and the hexagons rotated inside each triangle - clockwise if it had one hex filled, counterclockwise if it had two hexes filled." (c12-b169) |
| Hex rule: the tiling shifts after each step, and a step is undone by applying it twice under the same tiling | Stated | "The opposite of a 120-degree rotation is, after all, two 120-degree rotations. But there was a problem: after each time step, the split into triangles shifted." (c12-b170) |
| Hex rule: the order of tilings | Unspecified | See section 3.2 |
| Hex gliders: the fastest moved east; no vertical gliders were found | Stated | "To his surprise, the gliders that moved the fastest moved ... directly east." (c12-b152); "Neither player had managed to figure out any gliders that move vertically, they realized." (c12-b192) |
| Board size and edges | Unspecified | The board has edges and corners: "along the edge" (c4-b113), "the southeast corner" (c7-b81). The hex board is drawn as a hexagon (c12-b191). |
| One turn = one update of the board | Implied | Counts such as "Sixty turns until the next intervention turn" (c4-b126) and "Ten thousand two hundred turns into the game" (c14-b94); the figure c4-b5 labels each frame `t=` |

### 1.2 Interventions and budgets

| Rule | Status | Evidence |
|---|---|---|
| An initiation (setup) phase before the battle, with placement only in a home area | Stated | "He drew a few copies of his symbol in the bottom right corner of the board, where he was allowed to put down squares during the initiation phase." (c4-b94) |
| Size of the home area | Unspecified | |
| Setup time can be set per match | Stated, for one match | "You will have twenty minutes to figure out your structures" (c12-b149); "The battle begins in two thousand ticks." (c12-b151) |
| During the battle, players act only in intervention turns | Implied | Between interventions, plans "unfold" on their own; players watch and wait: "He knew that he would not get to see the results of his attack for a long time." (c7-b92) |
| In an intervention turn, a player may place squares near any copy of their symbol | Stated | "Here, all players were able to put down more squares near any copy of their symbols." (c4-b110) |
| Interventions may also remove cells | Stated | "Zei quickly removed junk and put up walls around the symbol" (c4-b113); "Zei used his intervention turn to remove his own wall." (c4-b135) |
| A symbol only has to exist at the moment of the intervention turn to anchor placement | Implied | Gliders "came together into Zei's symbol for exactly one turn - Zei's next intervention turn." (c4-b113) |
| Each intervention has a resource budget per player | Stated | "He toned down the amount of resources allocated to the AI, and used those resources" (c7-b89); "Allocate eighty percent of resources this intervention turn to this." (c7-b102) |
| Two teammates have twice the intervention capacity of one player | Stated | "Zei and Bai could do twice as much together in their intervention turns as Pan could do alone in his." (c4-b138) |
| Unit of the budget (cells changed, cells placed, something else) | Unspecified | |
| Building a large structure can span several interventions | Stated | "it would take him four intervention turns to make a symbol-carrying spaceship or glider factory" (c14-b46), under an 80% budget cut |
| Interval between intervention turns | Implied, roughly 1,000 turns; not fixed in the text | "A thousand turns later, the first intervention turn came." (c14-b45); in c4 the first intervention came about "a thousand turns later" too (c4-b110). Inconsistency: c4-b109 mentions "his next intervention turn" before c4-b110 announces "the first intervention turn". |
| Copy and paste is allowed when placing | Stated | "speeding up his work by copying and pasting pieces of what the AI had already made" (c7-b70); "deployment is just copy and paste" (c12-b182) |
| Timed countdowns announced in Dzegoban before the start and before the battle | Stated | "MU GU GEI FA" … "Starting in fifty ticks." (c4-b83); "MU GU GEI TAU FA" … "The battle begins in fifty ticks." (c4-b97–c4-b98) |

### 1.3 Symbols and scoring

| Rule | Status | Evidence |
|---|---|---|
| Each player has a symbol, a fixed pattern of dots | Stated | "He saw in the corner of his display his *symbol*: a pattern of dots" (c4-b93) |
| A copy of a symbol anywhere gives vision around it | Stated | "were a copy of it anywhere on the board, would allow him to see everything within thirty squares" (c4-b93) |
| Symbols are made by placement in setup or interventions, or by collisions during play | Stated | Placement: c4-b94. Collisions: spaceships crash into rock "leaving behind copies of each player's symbols" (c4-b108); "One of his gliders had successfully created a symbol" (c12-b187) |
| Anyone can form any player's symbol, including a teammate's | Stated | Zei's spaceship's crash "came together into a symbol. Bai's symbol." (c4-b132–c4-b133) |
| Symbols are destroyed by gliders | Stated | "shredded through both of his remaining symbols in the southwest corner" (c10-b163) |
| Symbol shapes | Unspecified | |
| Whether a rotated or mirrored copy counts | Unspecified | |
| How exact a "copy" must be, for example whether neighbouring cells must be empty | Unspecified | |
| The running measure of standing is the symbol count | Implied | "By total symbol count, it was fifteen to fifteen" (c4-b138); "Seventeen symbols to twenty-two" (c7-b98); "Twelve to six." then "Bai resigned." (c7-b119–c7-b120) |
| The symbol count does not decide the game by itself | Implied | "By total symbol count, it was fifteen to fifteen - exactly even." (c4-b138), yet one side was clearly ahead |
| Qualifying rounds rank by wins, with a tiebreak on turns survived or needed, capped at 8,000 | Stated | "we will break ties by the geometric average of the number of turns that you survived before losing your losing games and the inverse of the number of turns that you needed to win your winning games, counted up to a maximum of eight thousand turns." (c12-b91) |

### 1.4 Visibility

| Rule | Status | Evidence |
|---|---|---|
| The board starts dark | Stated | "the game field, which at the beginning appeared completely black" (c4-b93) |
| A player sees within thirty squares of each copy of their symbol | Stated | c4-b93 |
| The distance measure behind "thirty squares" | Unspecified | |
| Teammates share vision | Implied | "he also became able to see a few parts of the field at the bottom left. Bai had put down her symbols too." (c4-b94) |
| A hidden symbol can watch an opponent's moves | Stated | "I had a symbol along the path, right in the position where you could not see it. So I could see the edge of your spaceship coming." (c10-b162) |
| Players see less than the audience | Stated | "Zei and Gun could not see the full view of what was going on, but the audience could." (c14-b51) |
| Teammates normally talk by voice | Stated | "Normally, at this stage, the players would be speaking intensely by voice chat" (c4-b99) |

### 1.5 Winning and elimination

| Rule | Status | Evidence |
|---|---|---|
| A player with no symbols left is out | Stated | "all of Dza's remaining symbols had been eliminated." then "now, Dza was out" (c4-b136, c4-b138) |
| A 1-v-1 game is won by destroying all the opponent's symbols | Stated, by example | "Within three hundred turns, all of Bo's symbols were destroyed, and Zei was announced the winner." (c12-b196) |
| Players may resign | Stated | "At that moment, Pan resigned." (c4-b141); "Zei clicked a button to resign." (c10-b164) |
| Formats: 2 v 2 teams, 1 v 1, and multi-player games with placings | Stated | Teams: c4-b89–c4-b90. 1 v 1: c7-b62, c12-b146. "I got third place!" (c2-b12) |
| Teams are normally assigned by cryptographic randomness | Stated | "the teams are randomly assigned!" (c4-b68); "the team selection was not done through cryptographic randomness" (c4-b148), as that match's change |
| Games have no fixed turn limit | Implied | Play continues past the 8,000-turn scoring cap: "Ten thousand two hundred turns into the game, Deluin was announced the winner." (c14-b94) |
| A hard time limit or draw rule | Unspecified | |

### 1.6 The sandbox

| Rule | Status | Evidence |
|---|---|---|
| A private sandbox for trying structures before placing them | Stated | "He experimented with a few glider and wall formations in his sandbox, and after confirming that they work, deployed them to the field." (c4-b96) |
| Moves found in the sandbox are repeated live by hand | Stated | "On her third try, she succeeded, and she repeated her moves live." (c4-b135) |
| The sandbox does not hold a copy of the live board | Implied | "he remembered what he saw of the rock formations near the center … replicated the pattern in his sandbox" (c14-b63) |
| Controls: one step forward; shift time forward or back | Stated | "there was a button to play one step forward, and two buttons to shift time - either forward or backward." (c12-b171) |
| Running the rules backward is possible but manual | Stated | "A, B, A, B, B. Like some kind of video game cheat code." (c12-b171); "It was an arduous process, and his fingers quickly tired. But it worked. The glider moved backwards." (c12-b173) |
| A backward run from an end state shows one possible past | Stated | "So in that particular history that Zei had just sampled, before the crash, the symbol had been there all along." (c12-b176) |

### 1.7 Each match's special rule

New rules are chosen by the priests in secret ("the priests went into the dungeon to decide on the rule sets", c4-b148). Players are kept offline beforehand: "We sit here for a longhour without internet while the others play, so we don't learn the new rule ahead of time?" "Exactly." (c12-b133–c12-b134).

| Match | Special rule | Evidence |
|---|---|---|
| Zei's earlier game (before c4) | "rotate one eighty if three" | c4-b7; animated in c4-b5 |
| Pafogai Du quarter-final (c4) | Teams chosen deliberately, not randomly; Zei was paired with his rival Bai | "The rule change was: the team selection was not done through cryptographic randomness." (c4-b148) |
| Pafogai Du semi-finals (offscreen) | A rule change partway through | "my opponent was just not prepared for the sudden rule change four thousand turns in" (c5-b30) |
| Pafogai Du final (c7) | Each player has an AI, and each side can read the other AI's thoughts | "Both players will have access to a powerful personal AI" (c7-b63); "the players and their AIs will have full read access to the thought transcripts of each other's AI." (c7-b65) |
| National qualifier, Zei v Bo (c12) | Hex grid | c12-b147, c12-b169 |
| National semi-finals (c14) | Intervention budget cut by 80%. Five shrines that apply their changes as an XOR every thousand turns, then reset | "The resources you can allocate in each intervention turn are reduced by eighty percent. But in addition, there will be five shrines, four arranged along the center of each edge of the board, and one in the center. Each thousand turns, any changes that had taken place to the contents of the shrine will be applied as an XOR to the regions near the four corners of the shrine, and the shrine will reset to being a default rock formation." (c14-b33) |
| Shrine consequences, in Zei's reading | Stated | "XOR is not weight-preserving, but it is reversible. So the game board would get more and more full, and more and more messy, over time." (c14-b35) |
| Shrines: size, "default rock formation", and the size of the "regions near the four corners" | Unspecified | |
| Practice and bot games | Custom rulesets and corner starts exist | "he had adjusted the game to only give him one corner and three other AIs the other three corners" (c12-b10) |

## 2. The board figures

| Figure | Kind | What it shows | Checked against the text |
|---|---|---|---|
| c4-b5 | **Animated cell board**, 24 × 16 cells, 120 frames, counter `t=0…119` | Zei's earlier game under "rotate one eighty if three" (c4-b7); a gold outline over columns 10–13 marks the wall band | Section 3.1 |
| c4-b115 | Symbol map, 4 players | 15 circles in the south-east, 9 squares in the south-west, 13 distinct triangles in the north-west (14 drawn, one an exact duplicate), 8 plus signs in the north-east | Places match the text: Zei in the bottom right (c4-b94), Bai bottom left (c4-b94), Pan north-west (c4-b125), Dza north-east (c4-b113). No count is given for this moment. |
| c4-b137 | Symbol map after Dza is out | 10 circles + 5 squares, 15 distinct triangles (17 drawn, 2 exact duplicates), no plus signs; one square deep in the north-west | Text: "By total symbol count, it was fifteen to fifteen" (c4-b138). Matches only if duplicates count once. The north-west square is the symbol formed in Pan's base (c4-b132–c4-b133). |
| c7-b87, c7-b97, c7-b112, c7-b118 | Symbol maps, 1 v 1 | Squares in the south, circles in two northern clusters | Here **squares are Zei**: his bases are south-west and south-east (c7-b81, c7-b95) and Bai has "both of Bai's home bases" in the north (c7-b89). The counts are 17 v 16 (no text count), 17 v 22 ("Seventeen symbols to twenty-two", c7-b98), 14 v 11 ("Fourteen to eleven. Zei was winning again.", c7-b114), and 12 v 6 ("Twelve to six.", c7-b119). All match. |
| c12-b191 | Symbol map on a hexagonal board | 5 circles in the north, 8 squares in the south | No count in the text. |
| c14-b52, c14-b60, c14-b68, c14-b80 | Symbol maps with 5 fixed triangles | Triangles at the centre of each edge and the centre, the shrines of c14-b33. Squares are Zei; circles are Gun. | Zei's three ships are at the centre, east and south (c14-b40) in c14-b52. His last ship is just north of the northern shrine (c14-b77) in c14-b80. Gun's "large advantage in material" (c14-b61) is 5 v 2 in c14-b60. |

Only c4-b5 shows successive cell states. The symbol maps show successive positions of symbols, and they agree with the text wherever the text gives a number.

## 3. Update rules tested against the figures

### 3.1 c4-b5: the square-grid rule

**Method.**
- I parsed the SVG's 143 cell paths and their discrete opacity schedules, a 12-second loop, into 120 frames.
- I read the counter sprite (`t=` plus three digit windows) to confirm one frame per turn.
- I excluded the background grid-line path and a gold overlay outlining columns 10–13.
- I then tested candidate rules in scratch scripts (kept outside the repository) against every transition, using only blocks wholly inside the 24 × 16 view, so cells arriving from outside the crop could not interfere.

**What fits.**
- The board updates in 2×2 blocks, and the block partition alternates. On even turns blocks start at (0,0); on odd turns they start at (1,1). Every one of the 119 transitions is consistent with block-local updating under that partition.
- As drawn, the rule has two phases, and neither changes a block's live-cell count:

| Live cells in a block | Even turn (blocks at 0,0) | Odd turn (blocks at 1,1) |
|---|---|---|
| 0 | unchanged | unchanged |
| 1 | unchanged | rotated 180° (the cell moves to the opposite corner) |
| 2 | each cell flipped within the block (live becomes dead and dead becomes live) | each cell flipped within the block |
| 3 | rotated 180° | unchanged |

- That is the **Critters** rule, drawn with every odd turn shown inverted (live and dead swapped). In the un-inverted form there is one fixed block rule: a block with exactly two live cells is unchanged; otherwise every cell flips, and a block that had three live cells is also rotated 180°.
- The rotation clause matches the book's name, "rotate one eighty if three" (c4-b7). It changes the result in 571 of the 10,303 block updates, so the figure shows that variant and not the same rule without it.

**Fit.**
- 10,303 interior block updates, 0 mismatches.
- Run backward with the inverse block rule, also 0 mismatches.

**Consistency with the text.**
- The block rule is a one-to-one map on the 16 possible blocks, so the board can be run backward exactly ("the rules are time-reversible", c4-b9).
- The drawn rule conserves live cells in every block, which agrees with "The shrines are the only objects that violate mass conservation" (c14-b35). The number of live cells per frame (12 to 20) changes only because cells cross the cropped right edge.
- The animation shows the outcome the text describes. Material breaks through the wall band at columns 11–12, and by t = 90 it has spread to the left side, as "this new way to breach the usual wall construction, and flooded their opponent's territory with garbage" (c4-b7) says.

**What does not fit.**
- A single block table applied on every turn, with or without an edge wrap: 599 conflicts.
- Second-order reversible rules in which the next state is a function of the neighbourhood XORed with the previous state (Moore, von Neumann and diagonal neighbourhoods): 1,718 to 2,544 conflicts.

**Edges.**
- Cells enter from beyond the right edge (for example at t = 1, a cell appears at (23,4) from an empty block), so the view is cropped at least on the right.
- Blocks that straddle the top and bottom edges fit a vertical wrap in 649 of 649 cases.
- Blocks that straddle the left and right edges fail in 22 of 413 cases.
- The vertical evidence fits a board that wraps top to bottom. It cannot be told apart from a larger board that happens to repeat vertically, because the picture repeats every 8 rows in 50 of the 120 frames.

**How sure.**
- High that the figure animates this rule. Every visible interior update agrees, forward and backward, and the rule matches the name the text gives.
- Low on board size, edges and the base rule. The text names this as a variant played in one game; the base square-grid rule is never stated. The text only says the base rule must be reversible and conserve cells.

### 3.2 The hex rule (c12-b169, c12-b170)

No figure shows hex states, so I tested the stated rule against the text's claims.

**Setup.**
- Hexes are grouped into triangles of three mutually touching hexes.
- There are six ways to tile the hex grid with such triangles: three with "up" triangles and three with "down" triangles.
- One filled hex rotates 120° one way; two filled hexes rotate the other way.

**Reversal.**
- Each step only rotates hexes within a triangle, keeping each triangle's count, so applying a step twice under the same tiling inverts it.
- Running forward 30 steps, then applying each step twice in reverse order, restored the starting board in 200 of 200 random trials. This is c12-b170's procedure, "Invert each step, and play the steps in reverse order".

**Glider directions.** I searched random patterns of up to seven filled hexes for gliders, under several tiling schedules and both rotation conventions:

| Schedule | Gliders found |
|---|---|
| Up tilings only, in one cyclic order | A single filled hex is a glider. It moves one hex per turn in three directions 120° apart: east plus two others, none vertical. |
| Up tilings only, in the other order | The same three-way pattern, mirrored: no due-east glider. |
| Up and down tilings alternating, in a matched order | Only east and west gliders, at about 0.10 to 0.17 hexes per turn |
| Up and down alternating, in other orders | Gliders on the diagonals at 60°/240° or 120°/300° |

**What fits.** Two families of schedules satisfy both "the gliders that moved the fastest moved ... directly east" (c12-b152) and the absence of vertical gliders (c12-b192):
- the up-only cycle in the right orientation;
- the matched up/down alternation.

Which of the two is fastest eastward depends on the rotation convention and on which way the board is mirrored, which the text doesn't fix.

**What does not fit.** Schedules whose gliders run on the diagonals, with no east–west motion.

**How sure.**
- High that the stated rule is reversible in the way the text says.
- Medium that the schedule is one of the two families above. The search was limited to small patterns.
- The text gives no way to decide between the two families.

## 4. Unspecified, collected

Board size, board edges, and the size of the home area for setup (c4-b94).

What a rock formation is, and how rocks are laid out at the start. The text gives only that they are hidden (c12-b157) and act as a resource (c4-b108).

Symbol shapes, and what counts as a "copy", including rotations, mirror images, and whether nearby cells must be empty.

The distance measure for "thirty squares".

When intervention turns come; only "a thousand turns" appears (c4-b110, c14-b45).

The budget's unit. How far "near any copy of their symbols" (c4-b110) reaches.

The base square-grid rule, beyond the c4-b5 variant.

The hex tiling schedule.

Shrine size and the exact XOR regions (c14-b33).

Any hard time limit or draw rule.

## 5. The smallest set of inventions for a playable sandbox

A sandbox here means what the book's players use: draw cells, step forward, and step backward (c4-b96, c12-b171). Taking the rule recovered from c4-b5 as the sandbox's rule, these are the decisions that are still open:

1. **Board size and edges.** The figure fits a top-to-bottom wrap but is cropped on the right (section 3.1). Pick a size and either wrapping or fixed edges.
2. **Which form of the rule to show.** Either the two-phase form that conserves cells, or the single Critters block rule with every other turn inverted. They evolve identically. Only the first matches what players are shown in c4-b5.
3. **One symbol shape, and what counts as a copy of it.** Needed for symbols to grant vision or to be formed by collisions (c4-b93, c4-b108).
4. **At least one rock formation.** Needed for gliders to do what the text describes, multiplying and making symbols (c4-b108, c12-b177).

Backward play needs no extra invention: the block rule is one-to-one, so stepping backward means applying the inverse block rule with the partitions in reverse order.

A full match on top of the sandbox needs these as well:
- the vision distance measure;
- the setup zone;
- when intervention turns come, the budget unit, and the reach of "near";
- how rocks are laid out at the start;
- the end condition, beyond eliminating every symbol.
