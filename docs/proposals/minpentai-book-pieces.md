# Minpentai: the book's structures as pieces

> DRAFT design, 2026-10-30, for the owner's read. Written by the coding agent (Anthropic's Claude, a closed model). Nothing here is built. Quotes are the book's words, word for word, with block IDs (`[…]` marks words left out); everything under **This edition's behaviour** is invented for this edition, not the book's. Rules invented for this edition · not affiliated with the author. Background: `docs/minpentai-book-study.md` (every passage, by kind of piece) and `docs/proposals/minpentai-agent-play.md`.

## What Play has now, and what a new piece must fit

- Play (`src/lib/minpentai/play-game/game.ts`; on the one-engine branch, `versions/engine.ts`) has three pieces and rocks on a 15 × 10 board: **glider** (4 points, or 3; flies one square a step, bounces off edges and rocks, breaks a square in two hits, destroys an enemy tower, bounces off its own), **square** (1 point, two hits), **tower** (4 points; gives sight and placing reach R, counts for the win). Rocks never change. A side gets 8 points per turn to act, every 12 steps; a match is 96 steps.
- A new piece needs, in each case: its rule in `step()`; its legality in placement checks; its drawing (Play's board, the snap's frames, the replay); its byte code in the match record (the piece field has 4 bits, 3 used, so 13 codes are free); the computer players; and `minpentai_simulate`.
- **The computer player.** The approved stronger computer (search over the engine, branch `minpentai-stronger-computer`, waiting for one-engine) plans from the engine's own list of legal placements and a score. A piece the engine lists is searched automatically; what each piece needs is a **score term** (what the piece is worth to have) and, if it is costly to search, a **move filter** (which placements are worth trying). The old ladder rungs (`botPlan`) would ignore new pieces unless taught; the proposal is to leave them on today's rules.
- **`minpentai_simulate`.** It runs the same engine, so every piece below works in it at no extra cost, as long as the agent's **belief** (its guess of the enemy's hidden pieces) can name the new piece types. Pieces with hidden contents (the program factory) also need the belief to say what the agent guesses is inside.
- **Board size.** Multi-square pieces crowd a 15 × 10 board. The one-engine versions allow up to 25 × 16; the pieces marked "needs a bigger board" should come with it.
- **Sizes:** S = a few days, one rule and its drawing; M = one to two weeks, multi-square or several interactions; L = more than two weeks, hidden state or new kinds of information.

## 1. Moving wall

**The book.**
- **c4-b111** "At the front, Zei put down a "moving wall" design that he had perfected - a sort of large glider that flew half as fast, but was optimized for reflecting more basic types of gliders right back at the sender. Right behind his three moving walls, all aimed at Dza's corner of the game board, he put his symbol-carrying spaceships."
- **c4-b124** "Then, Zei saw that Pan was sending against Zei the same type of moving wall that Zei had used himself."
- **c7-b72** "with a different style of moving wall in front of it."

**This edition's behaviour.**
- A straight piece **three squares wide**, set across its direction of travel (a moving wall flying east stands north–south).
- It moves **one square every two steps** ("flew half as fast").
- A glider that hits its **front face**, from either side, is sent straight back and the wall is unharmed ("reflecting more basic types of gliders right back at the sender").
- A glider that hits it **from the side or from behind** breaks the square it hits; the wall becomes two squares wide, then one, then is gone.
- At the board's edge or a rock it stops (it does not bounce), and stays as a three-square wall.
- It never destroys a tower; it stops in front of one.
- **Cost: 6 points.**

**Computer player:** score term for enemy gliders it is currently shielding against; move filter: only placements whose path crosses a seen or last-seen enemy glider line. **Simulate:** works as is; belief can include enemy moving walls.
**Size: M** (multi-square piece, half-speed movement, face-dependent collisions).

## 2. Mirror wall

**The book.**
- **c2-b12** "Finally figured out a wall structure that reflected their gliders right back at them, completely wreaked havoc on their territory."
- **c4-b95** "and then reflect one glider back into Bai's territory where a mirror wall would send the glider right back, but also shoot another glider upward."
- **c14-b91** "As soon as a storm of gliders came, Deluin would figure out how to reflect it."

**This edition's behaviour.**
- A one-square piece with a **slant**, `/` or `\`, chosen when placed.
- A glider that enters it **turns 90°** (as light off a mirror) instead of breaking it. A flat mirror (`|` across the glider's line) sends it straight back.
- **Three hits** and it breaks (a mirror wears down; c4-b13: "nothing can be invincible").
- Mirrors turn every glider, the owner's too.
- **Cost: 2 points.**

**Computer player:** score term for enemy gliders whose future path a mirror sends back toward the enemy; small move set (each lit square × 3 slants). **Simulate:** as is.
**Size: S.** The cheapest way to give players the book's "wall structure that reflected their gliders".

## 3. Glider factory from rocks (rocks as a resource)

**The book.**
- **c4-b84** "Walls, gliders, rocks, techniques for extracting usable negentropy from rocks, sideways attacks."
- **c4-b108** "it was simply a matter of expanding into the field and gathering resources. Gliders flew out, interacted with rock formations, and created more gliders."
- **c4-b95** "Zei saw Bai setting up walls and glider factories - gliders that would fly right to a nearby rock formation, and then reflect one glider back into Bai's territory where a mirror wall would send the glider right back, but also shoot another glider upward."
- **c7-b107** "Part of the factory had been built during the intervention turn, the rest continued to be constructed in real time out of nearby rock formations by gliders."
- **c14-b38** "an eternal glider factory: a glider would bounce back and forth, at each collision it would break off rock to spray even more gliders further north, and then every thousand turns, the rock would reset."
- **c14-b45** "Zei shot off a few gliders to turn more rock formations into symbols and glider factories."

**This edition's behaviour.**
- **Rocks hold ore.** Each rock starts with 3 ore (shown as 3 dots).
- **A factory** is a one-square piece placed **next to a rock**, with an output direction pointing away from the rock.
- When **any** glider hits that rock, the rock spends 1 ore and the factory **emits a new glider of its owner's colour** in its output direction, the step after. The hitting glider bounces as today.
- A rock with no ore left **crumbles** (the square becomes empty). A factory whose rock is gone does nothing.
- A factory can be broken like a square (two hits).
- This is what makes the board fill up and empty out over a match, the "high-entropy wasteland" of c4-b140, and gives players something to fight over that isn't a tower (c4-b99: dividing rock formations between teammates).
- **Cost: 3 points.** Option, as a separate rule: rocks hidden until seen (c12-b157, c12-b187), drawn like any other piece in the dark.

**Computer player:** score term for ore next to its own factories and for enemy factories it can starve; move filter: only squares next to rocks. **Simulate:** belief must include enemy factories and ore counts it can't see (ore in lit rocks is shown).
**Size: M** (rock state, an emitting piece, the crumble rule; the record must carry ore counts in the final position).

## 4. Spaceship

**The book.**
- **c4-b107** "Larger spaceships flew out from Zei and Bai's bases."
- **c4-b108** "Spaceships flew out, acting as large slow-moving gliders that eventually crashed into a rock formation in a controlled way, leaving behind copies of each player's symbols."
- **c4-b131** "Zei's spaceship crashed against the remaining intact southern wall of Pan's home base. It briefly fluttered into chaotic shapes."
- **c7-b91** "Soon, one of Zei's symbol-carrying spaceships on the west was breached, and it exploded into a storm of gliders flying in all directions."
- **c10-b160** "Suddenly, as the spaceship hit a rock formation and was in the process of reflecting, gliders from Bai hit it. The spaceship exploded into a storm of gliders."

**This edition's behaviour.**
- A **2 × 2** piece that moves **one square every two steps** in one of four directions.
- It **bounces** off edges and rocks, like a glider, and pushes through squares (breaking them).
- It takes **3 glider hits**. On the third it **explodes into 4 gliders**, one flying out of each side, **owned by nobody**: they break anything, both sides' pieces alike (c7-b91's "storm of gliders flying in all directions").
- It destroys an enemy tower it runs into, and is itself destroyed doing it.
- **Cost: 8 points** (a whole turn).
- On its own it is a battering ram; its real use is as the hull of the next piece.

**Computer player:** score term for its distance to seen enemy towers and for its remaining hits; few placements (corners of the lit zone × 4 directions). **Simulate:** as is; belief can include enemy spaceships.
**Size: M**, needs a bigger board (a 2 × 2 piece on 15 × 10 is a large share of the field). Ownerless gliders are a small engine change of their own.

## 5. Symbol-carrying spaceship

**The book.**
- **c4-b111** "Right behind his three moving walls, all aimed at Dza's corner of the game board, he put his symbol-carrying spaceships."
- **c7-b72** "He aimed the symbol-carrying spaceship so that it would reflect off a wall that his AI had already constructed, and then move upwards along the middle of the game field."
- **c7-b81** "Zei's symbol-carrying spaceship started moving west from the southeast corner. The portion of the game field that Zei could see increased."
- **c14-b36** "a steerable symbol-carrying spaceship he had developed months prior, that could change its direction if you intervene in only a few cells."
- **c14-b46** "it would take him four intervention turns to make a symbol-carrying spaceship or glider factory."
- **c14-b56** "On his next intervention turn, he steered that spaceship to temporarily stop, just outside of visual range of Gun's northeastern base. He set the spaceship to fire off gliders to destroy the symbols that were undoubtedly in Gun's northeastern base."
- **c15-b103** "by pre-publishing most of the data - the symbol-carrying spaceship - and then using only a few bits of manipulation at the end to deploy the most important parts of your strategy."

**This edition's behaviour.**
- A spaceship (section 4) that **carries a tower**. While it flies, it gives **sight and placing reach** around itself, and **counts as a tower** for the win.
- **Steering:** in any turn to act, its owner may, for **1 point**, turn it 90°, reverse it, stop it, or start it again (c14-b36, c14-b56).
- **Firing:** for the cost of a glider, its owner may launch a glider from any of its sides, as if placed there.
- **Landing:** if it stops next to a rock, its owner may, for 1 point, **set down** its tower on an empty square beside it; the hull is then gone (c4-b108: "crashed into a rock formation in a controlled way, leaving behind copies of each player's symbols").
- Broken (3 hits), it explodes like a spaceship and the tower is lost.
- **Cost: 12 points**, so it takes **two turns to build**: placed as a frame in one turn (8 points, inert, can be hit), completed in the next (4 points). This edition's version of "four intervention turns" (c14-b46) at Play's scale.
- Fog: the opponent sees it only when it is in their sight, like any piece; it carries the tower's sight with it, so it is also a scout.

**Computer player:** score term for the sight it adds and its safety; steering is a small move set (5 orders per ship per turn); building across two turns needs the search to value an unfinished frame. **Simulate:** as is; steering orders are placements in the scenario.
**Size: L** (depends on 4; moving sight and reach; two-turn building; steering orders as a new kind of placement; the record must encode orders that aren't placements).

## 6. Chapter 7's sixteen-strategy factory (the program factory)

**The book.**
- **c7-b102** "Take my fourth westernmost symbol", he told the AI. "Take the best sixteen strategies that you can come up with. Construct near that symbol a factory capable of executing each of those strategies. It should be activated by a glider coming in from the southwest, and the exact strategy chosen should depend on the type of glider and the time it hits. Then, near my second westernmost symbol, make that glider. Allocate eighty percent of resources this intervention turn to this."
- **c7-b108** "A few hundred turns after *that*, the gliders that Zei sent manually crashed into the factory, and activated it."
- **c7-b109** "The factory picked a strategy that was none of the four that Bai's AI had focused on planning for."
- **c7-b115** "immediately create many glider factories in the northeast, and have their exact style and direction be set off by a trigger that would only appear in ten turns. Bai could not see the exact internal logic of the trigger"
- **c9-b70** "But you figured out a really basic version of that - just sixteen possible algorithms, melded into one factory - and used that, plus a hidden glider to provide the input, to hide your intentions."
- **c15-b104** "Actually a very similar tactic to what you used in your other game months earlier, when you sent out a spaceship that encoded basically every possible glider attack strategy, and then another glider to choose which specific one you wanted to use."

**This edition's behaviour.**
- A one-square piece holding up to **16 programs**. A program is a small burst: up to 3 gliders, each with an offset from the factory and a direction.
- **Which program fires** depends on how it is triggered: the **side** the trigger glider comes in from (4) × the **step it hits, counted modulo 4** (4) = **16**, the book's "type of glider and the time it hits" at Play's scale.
- Only the **owner's** gliders trigger it. It fires once, then is spent (the square is empty).
- **Hidden contents:** the opponent sees the piece when it is in sight, never its programs. The programs are committed when it is built (a salted hash, as the agent-play orders are) and revealed in the record after the match, so nobody can change them afterwards.
- **Cost: 4 points**, plus each program's gliders at **1 point each**, paid when built. A full sixteen-program factory with 3 gliders each would cost 52 points, so it is built over several turns: up to 8 points a turn go into it until it is complete; it can be triggered once it holds at least one program.
- It can be broken like a square, before it fires; its programs are then lost unseen (and revealed only after the match).

**Computer player:** the search can fire factories it owns (it knows their programs) and must **guess** at enemy ones: a score term treating an unseen enemy factory as the average of possible bursts. Designing programs is a large search; the proposal is to let the computer place factories only with programs from a fixed library. **Simulate:** the agent knows its own programs; for enemy factories the belief must include a guessed program table. This is exactly the book's situation: Bai's AI "could not optimize defenses against all of them at the same time" (c7-b104).
**Size: L** (hidden state inside a visible piece, commitments for piece contents, triggers by direction and time, multi-turn building, a new record section). The most book-like piece, and the one an AI commander (`minpentai-agent-play.md`) is best placed to use.

## 7. Remote symbols (towers formed away from home)

**The book.**
- **c4-b108** "Spaceships flew out, acting as large slow-moving gliders that eventually crashed into a rock formation in a controlled way, leaving behind copies of each player's symbols."
- **c4-b113** "Zei then rolled out his next move: sending three unusual-looking gliders deep into Dza's territory along the edge. The gliders hit the wall that Dza had set up around his home base in the northeast corner, and came together into Zei's symbol for exactly one turn - Zei's next intervention turn. Zei quickly removed junk and put up walls around the symbol, and three gliders aimed in strategic directions. He now had a base right at the core of Dza's territory."
- **c4-b132** "Then, seemingly miraculously, for one single turn, the chaos came together into a symbol." / **c4-b133** "Bai's symbol."
- **c12-b181** "Zei quickly put up symbols, walls, and gliders that would create symbols if they crashed into favorable rock formations."
- **c12-b187** "One of his gliders had successfully created a symbol, and revealed a part of the board that showed what the rock formations look like."
- **c14-b45** "Zei shot off a few gliders to turn more rock formations into symbols and glider factories."

**This edition's behaviour.**
- A **seed glider**: a glider that carries a tower. It flies like a glider.
- When it **hits a rock**, it stops and **becomes a tower** on the square in front of the rock, if that square is empty; otherwise it breaks.
- When it hits anything else (an edge bounces it; a square, tower or glider) it **breaks** without effect. Seeds are fragile; walls defend against them.
- A seed may carry a **teammate's** tower (for team games; c4-b133).
- In a turn to act, the new tower gives its owner sight and placing reach there, the book's "base right at the core of Dza's territory" (c4-b113).
- **Cost: 6 points** (more than a glider, less than a glider plus a tower).

**Computer player:** score term for the sight a new tower would add and its safety; move set is gliders' (with a flag). **Simulate:** as is; it shows where each seed would land given the rocks.
**Size: S.** Rocks are already visible, so the move is readable; it gives Play the book's main expansion tactic at once.

## Summary

| Piece | Book blocks | Cost (this edition's) | Size | Needs |
|---|---|---|---|---|
| Mirror wall | c2-b12, c4-b95, c14-b91 | 2 | S | — |
| Remote symbol (seed glider) | c4-b108, c4-b113, c4-b133, c12-b181, c12-b187, c14-b45 | 6 | S | — |
| Glider factory from rocks | c4-b84, c4-b95, c4-b108, c7-b107, c14-b38, c14-b45 | 3 (rocks get ore) | M | — |
| Moving wall | c4-b111, c4-b124, c7-b72 | 6 | M | — |
| Spaceship | c4-b107, c4-b108, c4-b131, c7-b91, c10-b160 | 8 | M | a bigger board |
| Symbol-carrying spaceship | c4-b111, c7-b72, c7-b81, c14-b36, c14-b46, c14-b56, c15-b103 | 12 over two turns | L | spaceship |
| Program factory (sixteen strategies) | c7-b102, c7-b108, c7-b109, c7-b115, c9-b70, c15-b104 | 4 + 1 per programmed glider | L | commitments |

Every piece is a new rule; each would ship as a **version** (one-engine's versions) players can choose, not a change to Play's base game, so the ladder and old records keep their meaning.

## The other path: the true cell rule, and finding these as patterns

**What it is.** Play would be replaced, for a mode, by the book's own physics: the reversible block rule recovered from c4-b5 (`docs/minpentai-rules.md` §3.1; the "Critters" rule with the "rotate one eighty if three" clause; already running at `/minpentai/rule` on `src/lib/minpentai/engine.ts`). Nothing is a piece; gliders, walls, mirrors, spaceships and factories are **patterns of cells** that players find, as Zei does in his sandbox (c12-b152, c12-b153). The work is a search for those patterns.

**What the research would take.**
1. **A pattern search** over the cell rule: run every small pattern (up to about 12 live cells in a 6 × 6 box) forward and keep those that repeat their shape, moved (gliders, spaceships) or not (walls, still lifes). Critters is known to have gliders, which is a good sign; the variant's exact catalogue isn't known.
2. **Collision tables:** for each glider found, fire it at each still pattern from every offset and phase, and keep the collisions that reflect (mirrors), stop it cleanly (walls), or make more gliders (factories).
3. **Rocks and ore:** decide what a rock formation is in cells (a still pattern dense with "negentropy", c4-b84) and search collisions that turn a rock plus a glider into more gliders, as c4-b108 describes.
4. **Symbols by collision:** use the rule's reversibility, Zei's own method (c12-b163, c12-b177): put "symbol + outgoing gliders" into the sandbox, run it backward, and keep pasts that start from a bare rock plus incoming gliders.
5. **A pattern library and placement by stamp:** players and agents place named patterns, not cells (c12-b182: "deployment is just copy and paste").
6. **A game on top:** board size (hundreds of cells a side), symbols, sight, turns to act every few hundred steps, and the match length (thousands of steps). Performance: the block rule is cheap per cell, so a 256 × 256 board for a few thousand steps runs in a browser in seconds; the search in 1–4 is offline compute (hours to days on one machine).
7. **Teaching it:** a player who can't find patterns can't play; the library and the sandbox become the game's first screen.

**How likely it is to work.**
- Gliders, still walls and reflections: **likely** (known gliders; reflections are a matter of search).
- Rock-to-gliders factories: **plausible**, not certain; the rule conserves cells, so a factory must spend a rock's cells to make gliders, which matches the book ("break off rock to spray even more gliders", c14-b38).
- Symbol-forming collisions by backward search: **plausible**, and the book's own method; each found collision is fragile (phase- and offset-exact).
- Moving walls, steerable symbol-carrying spaceships, a sixteen-way program factory: **uncertain to unlikely** in reasonable time. These are large engineered constructions (the kind found over years in other cellular automata), not search results.
- A game that people enjoy at that scale: **unknown**, and the larger risk. Matches would last much longer than Play's and depend on a library few players will learn.

**Size: L+**, several weeks of search and design before a first playable match, with a real chance that the result is a fine sandbox but not a game.

## Recommendation

**Build the pieces, starting with the two S pieces.** The **mirror wall** and the **seed glider** (remote symbols) bring two of the book's most-cited tactics into Play in days, as versions players can pick, and work at once with the stronger computer and with `minpentai_simulate`. Then the **glider factory from rocks** (M), which makes rocks the resource the book describes. Then the spaceship family and the program factory, on a bigger board, when agent play exists to use them.

Keep the cell path as **research on the side**, not a game: run steps 1–2 of the search (gliders and collision tables) as a spike on `/minpentai/rule` and publish the catalogue. If it finds clean factories and symbol collisions, revisit; the piece rules above can then be described as "what these patterns do", which would tie the pieces back to the book's physics.

## Also sized: the book's player markers in Play's overview and the snap

The book's summary maps (c4-b114 to c14-b80) mark each player's symbols with one shape each: **circle, square, triangle (point down), plus** (`docs/minpentai-book-study.md`, part 2). Play and the snap draw both sides' towers as the same ring, told apart only by colour (Cyan, Amber).

**Proposal:** Cyan's towers drawn as a **circle**, Amber's as a **square**, as in the book's 1-v-1 maps (chapter 7: two shapes), keeping the colours; triangle and plus reserved for teams of four. Shapes also help players who can't tell the two colours apart.

**Where it touches:**
- Play's board (`play-game/board.ts`: towers are cells with a ring) and Learn's board if it shares it.
- The snap's frames (`snap/run.ts` `frameSvg`: towers are two `<circle>`s) and its still images (`boardGif`, `boardPng`), plus the "last seen" outline (a dashed circle today; it would take the side's shape).
- The share card and result page (`share-result.tsx`, `/minpentai/result`), the rules page's piece key, and Learn's words where they say "tower".
- Tests: `check:ui` screenshots, `test:minpentai-play`, the snap's image tests and `check:snap-live` after deploy.

**Size: S** (two to three days), most of it in checking every place a tower is drawn and redoing screenshots. Nothing in the engine or the record changes. A four-shape version for team games waits for teams.
