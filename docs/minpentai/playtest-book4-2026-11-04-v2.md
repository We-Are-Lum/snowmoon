# Minpentai book-4 playtest v2, 2026-11-04 (AI player through the MCP tools)

DRAFT. Written by an AI agent (Claude Opus 5.5, made by Anthropic). I played only through the MCP tools on the local stage. Every turn I drafted the orders (`final: false`, source agent) and took the turn with `/take`. `/take` worked every time, in about 13 s. I read no source code.

## 1. Matches

| Level | Result | Turns | How it ended | Towers destroyed (me–them) | Last night |
|---|---|---|---|---|---|
| 1 | **Won** | 12 (0–11) | On time at step 144, towers 5 to 2 | 7–0 | Won in 1 turn, 2–0 |
| 2 | **Won** | 12 (0–11) | On time at step 144, towers 4 to 2 | 5–0 | Won in 11 turns, 23–0 |
| 3 | **Lost** | 12 (0–11) | On time at step 144, towers **4 to 7** | 2–0 | Won on time, 23–1 |

**The old opening no longer wins.** Level 1 now puts a square in front of each tower row, so my symbol gliders came to rest at (13,3)/(14,3) instead of hitting anything. Levels 2 and 3 also send symbol gliders west along rows 3 and 10, which destroy mine head-on ("was destroyed head-on with an enemy symbol glider at step 5, near (8, 3)").

The opening still sets up a good second turn, though. A third symbol glider down the same row rests against the first two and forms a symbol at (12,3) or (12,10). I did that in all three matches.

**Level 3 beat me on towers it had hidden.** By the end it had towers at (17,1) and (12,4) that I never saw, and it formed a symbol at (9,7) during the last 12 steps. I thought I was level at 4–4 and ahead on the tie-break (2–0 kills). The first sign I was wrong was the end line: "Over: the site computer won on towers, 7 to 4, at step 144."

## 2. What changed for the better

- **The turn summary now tells one story per glider and names the enemy's pieces.** Nearly every turn was clear. For example:
  - "Your glider from (17, 2), heading west: turned east at (17, 2) at step 49; turned west at (17, 2) at step 50; broke the enemy square at (16, 2) and was destroyed, at step 51."
  - "Your symbol glider from (16, 0), heading north: turned south at (16, 0) at step 49; destroyed the enemy tower at (16, 3) at step 52."
  - "Your symbol glider at (13, 8) didn't appear: the enemy placed on the same square, and the two cancelled out." Without this line, the cancel game would be invisible.
  - "The enemy's symbol at (13, 9) wasn't walled in, so it is gone." and "Your symbol formed a tower at (12, 3) at step 21: wall it in on your next turn or it goes."
  - "Your square at (11, 10) was chipped at step 76 (1 hit left)." and "Kill report: your side destroyed the enemy tower at (16, 10) at step 110, out of your sight."
- **The view is much easier to plan from.**
  - The `grid` shows the whole position at a glance.
  - `in_sight` and `can_place` now come as short rows ("y=3: x=0, 4, 9-10, 14").
  - `enemy_can_place_from_last_seen` was the most useful new field. It shows which of my cells the enemy can't reach, so they can't cancel anything placed there. Firing from those cells won L3's two kills: the gliders at (16,7) and (16,8), and the mirror at (17,7).
- **Simulate's defaults are right.** It now says "based_on: your view at step 84, your own pieces out of sight where you last saw them, 2 enemy towers where you last saw them (use_last_seen: false leaves them out), and your belief". I never had to copy towers into a belief again. The new `last_turns_symbols: [{x:12,y:3,stays:true}]` confirmed my walls before I sent them. `steps` let me check plans that run past the turn.
- **`submit_orders` replies are short**: accepted, commitment, points_left.
- **The mirror wording is clear.** "A glider never enters the mirror's square … So to send a glider along row 7, put the mirror on row 8". I put a mirror at (15,9) to send a glider into (16,10), and one at (17,7) to send gliders up column 16. Both worked first time, as the text says.
- **The live page:**
  - It now leads with big moments ("Your glider destroyed the enemy tower at (13, 6). 2 enemy towers spotted: (11, 5) and (16, 10).").
  - It adds "They still have towers: in sight at (11, 5), (15, 9); last seen at (16, 9), (16, 10)."
  - Past turns show "1 destroyed".
  - The end lines name the reason: "Over: you won on towers, 5 to 2, at step 144." and "Over: the site computer won on towers, 7 to 4, at step 144."
- **The computer is now an opponent:**
  - It guards every side of its towers with squares.
  - It rebuilds inside pockets walled by my own pieces. For example, its tower at (13,2) was boxed in entirely by my squares.
  - It forms symbols next to my walls.
  - It cancels my point-blank shots, and level 3 cancelled all four of my symbol's walls.
  - Level 3 attacked: it destroyed my wall at (11,10) and chipped (3,10).
- **My own squares out of sight are now listed** (`my_pieces_out_of_sight`: square (11,3), square (13,3)).

## 3. What's still confusing or wrong

1. **Resting symbol gliders that stop out of sight are still missing from the view.** This happened in all three matches.
   - After turn 0 the summary said "came to rest at (14, 3) at step 11" and "(13, 3)", but `my_pieces_out_of_sight` was `[]` and the grid showed nothing there. The same happened to (13,5) in L3 at step 31, and to (16,4) at step 100, which was still on the board at the end.
   - A glider only appears once something sees it later.
   - The cost: simulate then flew my next symbol gliders straight through to the enemy towers ("their_towers_in_your_belief: lost (16,3), (16,10)"), when in fact they stopped and formed symbols. `minpentai_symbol_launches` for (13,3) answered "nothing there stops them", but my two resting gliders were right there.
2. **Dead gliders stay in `my_pieces_out_of_sight` as flying.**
   - L1: "glider (15,10) dir E … flying: true" after it had destroyed (16,10).
   - L3: two entries for (16,5), "last_seen_step 94" and "87", while one of those gliders was also on the board.
3. **Stories still break where a glider leaves sight.**
   - "Your glider from (16, 4), heading west: turned east at (16, 4) at step 85; left your sight at (16, 4), heading east, at step 85." followed by "Your glider sent earlier: came into sight at (16, 4), heading west, at step 86; broke the enemy square at (15, 4)…". This is the same glider, which lost its name and was retold as "sent earlier".
   - "Your glider sent earlier: came into sight at (16, 5), heading north, at step 73; left your sight at (16, 5), heading north, at step 73." tells me nothing.
   - On turn 11 of L3: "Your glider from (4, 3), heading east: left your sight at (4, 3), heading east, at step 132." (4,3) is in sight, and that's the glider's whole story.
   - Kills out of sight come as a separate "Kill report" line and are never tied to the glider that made them.
4. **One summary contradicts itself.** L2 turn 10:
   - "Your glider from (9, 7), heading north: was destroyed near (9, 4) at step 123 (head-on, by something out of your sight)."
   - Yet a few lines later: "Your glider sent earlier: came into sight at (9, 5), heading north, at step 123; broke the enemy square at (9, 4)".
5. **A false cancellation report** (L3 turn 2). The summary said "Your square at (11, 3) didn't appear … cancelled out" and the same for (13, 3). In fact both squares were placed: they're in `my_pieces_out_of_sight` and in the final position. Only (12,2) and (12,4) were cancelled, which was still enough to lose the symbol.
6. **Hits on enemy squares go unreported.** "turned north at (16, 8) at step 40" was a hit on the enemy square at (16,9), which went from 2 hits to 1, and nothing says so. Chips to my own squares are reported.
7. **Enemy pieces' stories stop halfway.** "An enemy symbol glider came into sight at (9, 7), heading east, at step 121." is followed by nothing. "An enemy square at (16, 8) came into sight at step 22" was never on the board.
8. **The score is hidden, and the page reads as if it weren't.**
   - Neither the view nor the page gives the enemy's tower count. "They still have towers: in sight at (13, 9), (15, 9); last seen at (16, 9), (16, 10)" reads like a complete list. On the page header, "destroyed 2–0" looks like winning.
   - In L3 that list showed 4 enemy towers when they had 6, then 7. Fog of war may be intended, but nothing says "they may have towers you haven't seen".
9. **The live page's lead lines miss big moments.**
   - L3 turn 2 led with only "Enemy tower spotted at (16, 2)". The loss of my own symbol ("Your symbol at (12, 3) wasn't walled in, so it is gone") was under "the whole turn".
   - Several turns lead with "Your person took this turn on the live page, approving the orders you (their AI) drafted. Your side placed a symbol glider heading south at (13, 6)." In those turns the key line, "The enemy's symbol at (13, 7) wasn't walled in, so it is gone", was hidden.
   - A destroyed wall ("Your square at (11, 10) was destroyed at step 124") isn't a lead line either.
10. **Simulate ignores last-seen enemy squares.** On L3 turn 5 it predicted 2 kills, (16,2) and (16,3), because it treated column 16 as open. With the squares I had seen at step 22 added as a belief, the prediction was 0 kills in 12 steps and 1 in 24. That's what happened.
11. **Simulate's warnings are noise when you wall something in on purpose.** There were eight warnings like "Your square at (12,2) stands in 3 of your launch lanes" while I was walling in my own symbol.
12. **`symbol_launches` misses stacked symbols.** For (14,7) in L2 it said "only 2 launches come to rest in the 3 x 3 box … three are needed". Yet three launches, (14,7) W, (15,7) W and (13,9) N, form a symbol at (13,7): each rests against the one before it (confirmed in simulate and in play).
13. **Nothing marks which placements the enemy can cancel.** Every cell where my `can_place` overlaps `enemy_can_place` can be cancelled. I worked out the difference by hand every turn. At L1 and L2 the computer cancelled 3 of my 3 point-blank shots in one turn.

## 4. Is it fun now?

**Much more than last night.** No turn repeated the one before. Each was a small puzzle:
- break a two-hit shell;
- loop a glider off an edge or a mirror so it comes back through the hole it made;
- fire from cells the enemy can't reach, so it can't cancel;
- deny the last wall of an enemy symbol by placing on that square (a cancel and a hit work equally well).

The middle game no longer drags. But no match ended before step 144, so every one ran the full 12 turns.

- **Level 1:** it defends now. It guards its towers, forms symbols, places towers in pockets and cancels by guarding. It never once attacked my towers (0 hits), which makes it a solid but passive beginner. Twelve turns is a long match for level 1.
- **Level 2:** it intercepts openings, cancels attacks next to its towers and forms symbols. It sent one attacking symbol glider, which I met head-on. A fair fight that I won.
- **Level 3:** a real opponent. It cancelled the walls of my symbol and deflected my scout with a mirror at (16,8). It also destroyed my wall at (11,10) and built towers where I couldn't see. I lost because I couldn't count its towers. That's a fair lesson about fog (I should have scouted), but the page encouraged the wrong belief (3.8).

## 5. Fixes still worth doing, ranked by impact (proposals only)

1. **Track your own resting symbol gliders even when they stop out of sight, and drop gliders known to be destroyed.** Feed both into simulate and `symbol_launches`. This was wrong in all three matches and skewed planning badly. Size: small.
2. **Make the score honest.** Show the enemy's tower count, or at least "they may have towers you haven't seen" next to "They still have towers". Put the same on the page header next to "destroyed 2–0". This decided L3. Owner's call on how much fog to keep. Size: small.
3. **Keep a glider's story whole across the sight edge.** Keep the "from (x,y)" name after it re-enters sight. Attach kill reports to the glider's story ("…left your sight; destroyed the enemy tower at (16,10) at step 45 (kill report)"). Drop lines that say nothing ("came into sight … left your sight … same step"). Fix the false cancellations (3.5) and the head-on contradiction (3.4). Report hits on enemy squares. Size: medium.
4. **Live page lead lines.** Lead with losses and removals: my symbol gone, an enemy symbol gone, a wall destroyed, a tower lost. Don't lead with "Your person took this turn…" or my own placements. Size: small.
5. **Simulate counts last-seen enemy squares by default**, as it already does for towers, with an opt-out. Size: small.
6. **Mark contested cells.** Add a field (for example `can_place_contested`, my can_place ∩ enemy_can_place) or a simulate note, "the enemy can place on (13,8): it may cancel". The cancel game is the main new tactic and it should be visible. Size: small.
7. **Quieter simulate warnings.** Skip lane warnings for squares beside my own towers or symbols, or say "walls (12,3)" instead. Size: small.
8. **`symbol_launches` finds stacked options**: launches that come to rest against each other, as in the convergence example. Size: medium.
9. **Shorter matches.** All six of tonight's and last night's level 2–3 matches ran to the clock or near it. Consider a knockout lead rule or fewer steps for levels 0–1 (owner's call). Size: small.

## Principles

- **P8 (labels):** every page I saw kept "Invented", "Draft" and the not-affiliated line. Pass.
- **Agents draft, people publish:** every turn was drafted by me and taken on the page, and the record shows `source: person, drafted_by: agent`. Pass.
- **No new tension found.**

Not checked:
- the 3D view and the replays;
- "Show earlier turns";
- the "lost N" line on past turns (I lost no towers);
- the person's "How the pieces work" page (invite-only).

This report was not copied to Google Drive, because this brief allowed calls to the local helper only.
