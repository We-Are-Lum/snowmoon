# Minpentai book-4 playtest, 2026-11-04 (AI player through the MCP tools)

I played through the MCP tools only, with each turn drafted by me (`final: false`, source agent) and then taken on the live page via `/take`. Session 1 played level 1; the helper then went down (its own bug, since fixed) and the local database was reset. Session 2 replayed level 2 from the start, then played level 3.

## 1. Matches

- **Level 1:** won in 1 turn (over at step 12), towers destroyed 2–0.
- **Level 2:** won in 11 turns (turns 0–10, over at step 126, every enemy tower gone), towers destroyed 23–0.
- **Level 3:** won on time in 12 turns (step 144: my 5 towers to their 1), towers destroyed 23–1.

How the matches went:
- **Opening.** All three openings were the same: symbol gliders (2 points each) east along five open rows, plus a square guarding each of my towers. That killed 2 to 4 enemy towers by step 12 every time.
- **Levels 2 and 3 never run out of towers.** They place 1 or 2 new towers each turn, inside the reach of a tower that is still standing at the start of the turn. That turns the middle game into whack-a-mole: I kill this turn's towers while next turn's are already being placed.
- **Getting behind the rocks.** In both matches the computer soon put towers behind the rocks (for example (14,7) and (16,7), behind rocks at (5,7) and (12,7)). Nothing from my start area could reach them. What worked:
  - a placed forward tower at (4,8);
  - a symbol formed at (11,6) with launches that `minpentai_symbol_launches` found;
  - a mirror at (14,8) that turned a south-bound symbol glider east along row 7 to (16,7).

  No tower stayed unreachable, so I never needed to resign.
- **Level 3 was the only level that hurt me.** It placed a factory at (6,6) beside rock (5,6) to fire gliders east along row 6 every 4 steps. Those gliders broke my square at (10,6) and then destroyed my symbol tower at (11,6). It also placed a moving wall at x = 11, rows 8 to 10, which shielded its tower at (10,9) for a turn. Level 2 never attacked my towers at all.

## 2. Where an AI gets stuck or confused

1. **The turn summary doesn't say what happened to a glider.**
   - "Your symbol glider from (13, 7) was stopped near (13, 7) at step 37" is in fact a kill. So is "Your symbol glider from (4, 3) was stopped near (15, 3)".
   - "Your symbol glider from (7, 7) left your sight at (7, 7), heading east, at step 120" is said of a glider two squares from my own tower, which is well inside my sight.
   - "left your sight" was also how head-on collisions showed up. Nothing ever says "destroyed".
   - Every kill is credited to "Your glider", including those made by symbol gliders.
2. **Some events are missing from the summary altogether.**
   - The enemy's factory and moving wall first appear in the board data (`factories`, `moving_walls`). The summary only says "An enemy glider came into sight at (7, 6), heading east", repeated every 4 steps. It never says "an enemy factory at (6,6)".
   - The factory later disappeared without a line.
   - The level-2 glider I launched east from (6,6) toward a tower at (8,6) has no line at all, and that tower survived.
   - A trailing glider (two on one row) is never mentioned when its partner hits a tower.
3. **My own resting symbol gliders can drop out of `get_view`.** (From session 1: a resting glider at (10,4) vanished while out of sight.) In session 2 they also came and went: one "came to rest at (12, 9) at step 109" was missing from the board a turn later.
4. **`minpentai_simulate` ignores `last_seen_enemy_towers`.** With no belief given, it treats the dark as empty. I had to copy last-seen towers into `belief.towers` by hand every turn.
5. **The belief is refused wherever you can see, and the error names only one square.** `"belief: you can see 13,5; a belief is only for squares you can't see"`. Sight from flying symbol gliders shifts every step, there's no `visible` list, and I needed three retries.
6. **Mirrors don't work the way the rules text reads.** The rules say "'/' turns E to N, N to E … The glider stays put that step". I read that as: the glider enters the mirror's square and leaves in the new direction. In fact, as simulate showed step by step, the glider turns on the square in front of the mirror and never enters it. A mirror at (13,7) therefore sends a north-bound glider along row 8, not row 7. I only found this by running simulate at steps 1 to 4. Once understood, it was the key to reaching (16,7) (a mirror at (14,8) with a glider launched S from (14,6)).
7. **Hidden ways the computer can place towers.**
   - Level 2/3 towers kept appearing inside my area, at (8,4), (10,4), (8,9) and (10,7). The view never explains what reach the enemy has (the rule is: within 3 of the enemy's towers at the start of the turn). I worked it out from the pattern.
   - The game ended only once every tower placed in the same turn was also gone. No tool helps with "cover every square they could place on next".
   - The level-3 enemy even placed a tower at (11,6), the square where my lost symbol had stood.
8. **No tool for "how can I hit tower X?".** `minpentai_symbol_launches` is excellent for symbols. Mirror routes and two-step plans (kill the front tower, then use its square) I had to work out by hand.
9. **Long replies.** Every `submit_orders` echoes the whole view (about 12 KB, with `can_place` printed one number per line). There's no text grid, so I drew my own ASCII map to see the board.
10. **Small points.**
    - `submit_orders` returns a commitment that differs from the one in the finished record, because Take turn on the page re-commits with a new salt.
    - In session 1 the view still showed my glider in flight after `phase: over`.

## 3. Where a person watching would get bored or lost

- **The useful lines are folded away.** The page shows "Your person took this turn…" and the first placement line, then "more (15)". Kills, losses, new enemy towers, the factory and symbols forming are all behind "more". The header "destroyed 21–1" is the only drama in view.
- **"Past turns" doesn't show losses.** Turn 9 of level 3 lost my symbol tower, yet it reads only "1 destroyed".
- **The past-turn grammar is wrong:** "5 symbols glider E", "2 symbols glider S".
- **"Over at step 144: you won" doesn't say why.** It doesn't say "on towers, 5 to 1" or "on time". At level 2 the end came at step 126, again with no reason given.
- **The page doesn't explain why the match goes on after big kills** (for example 11–0 and still running). Nothing says the enemy still holds towers, or where they were last seen.
- **The middle game is repetitive.** From about turn 5 on, level 2 is the same thing every turn: they place one or two towers next to the last, I kill them, repeat. That's 6 or 7 near-identical turns for a viewer. Level 1 is over in one click.
- **"You placed…" when the person only approved the AI's draft.**

## 4. What worked well

- **`minpentai_symbol_launches` is the best tool here.** It gives exact launches, the order to list them in, the resting steps, and plain reasons when there's no option ("nothing there stops them… Place a square just beyond the target first"). It got me two forward symbols that won both long matches.
- **Simulate with `steps`.** It let me step through a turn and find out how mirrors behave. Its lane-blocking warnings were accurate. `last_turns_symbols` ("stays: true") confirmed my walls before I spent points on them.
- **Refusals are clear and specific.** For example "out of reach at 5,8" and "not empty at 4,1": in the second case my own glider was already sitting on the square.
- **`your_kills` and `towers_destroyed` are reliable**, even for kills out of sight.
- **`/take` now returns the page after the turn has played**, in about 10 seconds. The draft-then-take flow worked on every turn. The record shows `source: person, drafted_by: agent`.
- **Level 3 felt like a real opponent.** Its factory and moving wall were interesting, and it cost me a tower.

## 5. Proposed fixes, ranked by impact (highest first)

1. **Turn summary: one story per glider, and every enemy piece named.**
   - Problem: "stopped near", "left your sight" and "Your glider destroyed" hide what happened. Factories and moving walls are never named; some gliders get no line at all (2.1, 2.2).
   - Fix: give each launched glider a short id. End each one's story with what happened to it: destroyed a tower, destroyed head-on, at rest at (x,y), still flying. Add lines like "An enemy factory came into sight at (6,6), firing east" and "… was destroyed".
   - Helps both the AI and the person. Size: medium.
2. **Always show your own pieces.**
   - Problem: resting symbol gliders out of sight drop out of `get_view` (2.3).
   - Fix: always list your own pieces, marking any that are out of sight.
   - Helps both. Size: small.
3. **Live page: lead with the turn's big moments and explain the end.**
   - Problem: kills, losses and new enemy pieces are hidden behind "more". Past turns don't show losses. "You won" has no reason (section 3).
   - Fix:
     - show up to 3 big-moment lines (kills, losses, new enemy pieces, symbols formed) above "more";
     - add "lost N" to Past turns;
     - end with "you won on towers, 5 to 1, at step 144" or "every enemy tower destroyed";
     - when the match goes on, say "they still have towers: last seen at …".
   - Helps the person. Size: small.
4. **Simulate counts last-seen enemy towers by default, and the view lists the squares you can see.**
   - Problem: simulate assumes the dark is empty, and beliefs are refused one square at a time (2.4, 2.5).
   - Fix: put `last_seen_enemy_towers` into the belief automatically unless the AI opts out. Add a `visible` list or sight grid to the view. Have the refusal name every refused square at once.
   - Helps the AI. Size: small.
5. **Mirror rule wording, plus a worked example.**
   - Problem: the rules make it sound as if the glider enters the mirror square. In fact it turns on the square before it (2.6).
   - Fix: "The glider stops on the square before the mirror and leaves from there in the new direction." Add one example, such as "a glider flying S from (14,6) with a '\\' at (14,8) turns at (14,7) and flies E along row 7". The same wording belongs on the person's "How the pieces work" page.
   - Helps both. Size: small.
6. **Show the enemy's possible placement area.**
   - Problem: towers keep reappearing next to the last one. The AI has to work out the enemy's reach rule and the area to sweep, and nothing helps cover it (2.7).
   - Fix: add `enemy_can_place_from_last_seen` to the view (the 7 x 7 boxes around last-seen enemy towers), and/or a simulate option that reports which of those squares your gliders would sweep this turn.
   - Mainly helps the AI. It also makes the end game less of a grind. Size: medium.
7. **Shorter middle games at levels 2 and 3.**
   - Problem: the leapfrogging tower placement drags on for 6 to 8 turns of the same move (section 3).
   - Fix (game design, owner's call): either cap rebuilds (for example, a new tower must be at least 4 squares from the last one), or end the match once one side leads by N kills with the other side's towers down to 1.
   - Helps the person. Size: medium.
8. **A route-finding tool for hard targets.**
   - Problem: there's no way to ask "how do I reach (16,7)?" (2.8).
   - Fix: `minpentai_routes_to(x,y)`, listing straight shots, one-mirror routes and forward-symbol options, each flown in the engine, as `symbol_launches` already does for symbols.
   - Helps the AI. Size: medium/large.
9. **Short replies and a text grid.**
   - Problem: the full view is echoed on every submit, and `can_place` takes about 70 lines (2.9).
   - Fix: `submit_orders` returns only accepted, commitment and points_left. The view gains a `grid` (one string per row, with a legend) and compact `can_place` ranges.
   - Helps the AI. Size: medium.
10. **Make level 1 a little harder.**
    - Problem: level 1 places a single glider and loses at step 12.
    - Fix: at setup, guard the tower rows with a square.
    - Helps the person. Size: small.
11. **Small text fixes.**
    - "5 symbols glider E" should be "5 symbol gliders E".
    - "You placed…" should be "Your AI drafted, you approved: …".
    - Take turn should keep the drafted commitment, or the view should say "re-committed on the page as …".
    - Helps the person, and trust. Size: small.
