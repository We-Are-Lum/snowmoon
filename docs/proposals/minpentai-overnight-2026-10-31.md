# Minpentai overnight, 2026-10-31: morning report

> DRAFT, for the owner. Written by the coding agent (Anthropic's Claude, a closed model) during the overnight run of 2026-10-30/31. Rules invented for this edition · not affiliated with the author. Drive copy: "Snowmoon: Minpentai overnight report 2026-10-31".

## In one minute

- **Stage 1:** #68 (one engine) merged at 29df5fa and live; its live checks passed. The cap10 rules are PR **#75**, with a preview; it waits for you to run the SQL below and say merge. Not confirmed: a snap turn after the deploy (no one tapped in Farcaster overnight).
- **Stage 2:** the book edition, branch `minpentai-book-edition` (22fed02). All four pieces (mirror wall, symbol glider, moving wall, glider factory) are on a 24 × 14 board, as a separate ruleset. Today's game is unchanged: every identity gate passes untouched. Preview: <https://snowmoon-j6mgl2qak-nates-projects-d1780cff.vercel.app/minpentai/book>.
- **Stage 3:** the search computer, branch `minpentai-search-computer` (afb347f, on top of stage 2; its final level settings are on `minpentai-agent-play`). It has five levels, each beating the one below on Play and on the book edition over 40 matches a pairing, and every level beats the old Planner. Node and Chrome play the same moves.
- **Stage 4:** the AI commander, solo, branch `minpentai-agent-play` (e5015c3; with stage 5's fixes 45b0bf0), on top of stage 3. Ten connector tools, a live link, and a NEXT_ migration. A scripted agent played a whole book-edition match through the real `/mcp`. Everything stays **off** in production until you approve its consent wording and legal lines.
- **Stage 5:** an independent reviewer (a fresh agent that hadn't seen the work) attacked the fog through every channel. It found six problems: three that leak hidden information, a timing side channel and a predictable computer among them. Five are fixed with tests that fail on the old code; the predictability is only partly fixed. It also showed that **live one-on-one on main has the same own-piece leak** (needs you). Top of the stack: `minpentai-agent-play` (750d597), preview <https://snowmoon-l6y95y5nj-nates-projects-d1780cff.vercel.app> (built at 45b0bf0; the last commit changes only level 3's slip rate and docs).
- **Nothing else merged or deployed by me.** No migration applied, no legal text changed, no paid model or image call. Production moved once overnight, to 31c9d3b: another session merged #76 (Support) at 08:22.

## Stage 1: #68 and cap10

**#68:** merged with a merge commit at 29df5fa and deployed. These all passed against production: `check:shipped`, `check:snap-live`, `check:minpentai-live` (one-on-one: 51 checks in two browsers, 65 match views, no hidden piece sent), `check:principles --url` (53 of 54; only P6d, accepted) and `check:miniapp`.
- **Not confirmed:** a snap match played after the deploy. That needs a real tap in a Farcaster client, and nobody tapped overnight. `check:snap-live` covers the snap's routes and its first card, not a turn. **Needs you:** one snap turn on your phone.

**cap10:** PR **#75** (`minpentai-cap10-120`, 96c22d5), preview <https://snowmoon-p578clvyt-nates-projects-d1780cff.vercel.app>. It adds ruleset 2 (120 steps, up to 10 computer towers) with ruleset 1 frozen, links that carry their ruleset, the one-time ladder note, the Resume SQL fix (fid as a whole number, ruleset set on insert and update, with a test) and "Yes, resign". Full gate passed.

**The SQL, final** (`supabase/migrations/NEXT_minpentai_resume_ruleset.sql`). Run it as postgres in the Supabase SQL Editor. Dry run first: replace `commit;` with `rollback;`.

```sql
begin;

alter table studio.mp_snap_resume
  add column ruleset smallint not null default 1 check (ruleset between 1 and 99);

commit;

-- Read-back (after commit):
select column_name, data_type, column_default, is_nullable from information_schema.columns
  where table_schema = 'studio' and table_name = 'mp_snap_resume' and column_name = 'ruleset';
begin;
insert into studio.mp_snap_resume (fid, lvl, ver, rule, moves, ruleset)
  values (2147483646, 2, '', '', '1btfdzl.4.FYFICyHeQ2~FYOgTM~FYQ2~FOQ2', 2);
select fid, ruleset = 2 as same from studio.mp_snap_resume where fid = 2147483646;
delete from studio.mp_snap_resume where fid = 2147483646;
commit;
select count(*) from studio.mp_snap_resume where fid = 2147483646;
```

**Needs you:** run it, tell me "applied", then OK the merge of #75.

## Stage 2: the book edition

Branch `minpentai-book-edition`, commit 22fed02. Preview (behind Vercel sign-in): `/minpentai/book` on <https://snowmoon-j6mgl2qak-nates-projects-d1780cff.vercel.app/minpentai/book>. The page isn't linked from anywhere and is marked noindex. For each piece it shows the book's words, this edition's rules, and small boards you can play and step through.

**How it stays separate.** The four pieces are switched on by new settings (`costMirror`, `costSeed`, `costWall`, `costFactory`, `ore`) that are **not in Play's base settings**. Play's settings, every saved world's shape and every version's manifest are exactly as before. Under Play the engine refuses the new pieces ("not a piece in these rules") and never makes one. These all pass unchanged: `test:minpentai-versions` (frozen copies), `test:minpentai-one-engine` (200 of 200 saved matches finish identically), `test:minpentai-play` (29,048 checks identical to Design's mockup), `-play-server`, `-snap`, `-learn`, `-ladder` and `-kit`. The book edition is `src/lib/minpentai/versions/book-edition.ts`.

**The pieces.** All the rules below are this edition's. The book's words are on the page with their blocks, checked word for word against `content/snowmoon/text`.

| Piece | The book | This edition's rule (cost) |
|---|---|---|
| Mirror wall | c2-b12, c4-b95, c14-b91 | One square, "/" or "\\". A glider flying into it turns a quarter turn and stays where it is that step. A diagonal glider goes straight back. It turns every glider, its owner's too, and breaks on the 3rd hit (2) |
| Symbol glider (the remote symbol, redesigned) | c4-b113, c4-b132, c12-b181 | Flies like a glider. When it hits a rock, square, factory, moving wall or another resting one, it comes to rest. Three of a side's resting within one 3 × 3 box **come together into that side's symbol**, which lasts until that side's next turn to act ends. It **stays only if, when the turn ends, it is walled in**: every square a glider could reach it from is solid or the edge. Otherwise it is gone (2 each) |
| Moving wall | c4-b111, c4-b124 | Three squares across its line of flight. It moves every second step. Its front sends gliders straight back, unharmed; a hit from the side or behind breaks the square hit. It waits for a glider in its way, stops for good at anything else, and never destroys anything (6) |
| Glider factory | c4-b108, c14-b38, c7-b107 | Rocks hold 3 ore. A factory stands against a rock (the rock must be within reach), facing away from it. Each time any glider hits that rock, the factory fires one of its owner's gliders from its front square, if that square is empty, and the rock spends one ore. With no ore left the rock crumbles. A factory breaks after 2 hits (3) |

**Tests:** `npm run test:minpentai-book`, 109 checks. They cover every scenario's outcome; each piece's rules at their edges; placing that never reads hidden squares; the half-turned board (used to play Cyan) keeping every piece; and the ladder's old players playing whole book-edition matches with no illegal turn.

**Names proposed for the edition:** "Rocks and Mirrors", "Intervention Turns", "The Wasteland Field" (c4-b140's "high-entropy wasteland"). **Needs you:** pick one, or none.

## Stage 3: the search computer

Branch `minpentai-search-computer`, commit afb347f, on top of stage 2.

**The engine now exports** `legal()` (every single placement the placement check accepts, for every piece the rules allow), `score()` and `fog()` (a side's view, book pieces included). The search player (`versions/search.ts`) plans from the view only. It tries every legal placement on a copy of the board as it believes it is, runs the engine to the next turn plus a look-ahead, and keeps the best, one piece at a time. It also tries some moves as groups: three symbol gliders side by side, and walling in a symbol of its own that is still forming. Budgets are counted in **simulated engine steps, never time**. Levels differ in look-ahead, budget, and how often they slip (play any option they tried, drawn from their own seeded numbers).

**Round robin**, final: 20 seeds a pairing with seats swapped (40 matches), after the fog review's fixes. Full table: `docs/minpentai/search-ladder-2026-10-31.md`.

| | 2 vs 1 | 3 vs 2 | 4 vs 3 | 5 vs 4 | vs old Planner (levels 1 to 5) |
|---|---|---|---|---|---|
| Play | 70% | 76% | 59% | 69% | 85%, 86%, 93%, 89%, 88% |
| Book edition | 84% | 59% | 100% | 100% | 79%, 98%, 100%, 99%, 100% |

No illegal turn in any match.

**Time per turn**, measured on its own (median / slowest):

| | Node | Chrome | Chrome, CPU slowed 4× (a mid-range phone) |
|---|---|---|---|
| Play, level 5 | 19 / 31 ms | 11 / 16 ms | 40 / 61 ms |
| Book edition, level 3 | 68 / 104 ms | 41 / 73 ms | 161 / 291 ms |
| Book edition, level 5 | 212 / 326 ms | 132 / 205 ms | 524 / 853 ms |

**Node and the browser agree:** Chrome (through playwright-core) plays the same four matches as Node, move for move. `npm run test:minpentai-search` has 616 checks: `legal()` is exactly the placement check, the same on the view as on the real board, the search's turn doesn't change when hidden pieces do, and every level stays within its budget.

**What I changed along the way:**
- **The score now counts exposure:** 15 less for each open line a glider could fly into one of your towers. Without it the search only built towers and lost to Planner, whose gliders it never saw coming. With it, level 3 went from 6/8/6 to 17/3/0 against Planner.
- **The score at the step limit keeps the margin.** Before, a side that looked behind near the end stopped placing anything.
- I tried "guess the hidden board as a mirror of your own" for level 5. It lost 0–20 to level 4, wasting points on imagined towers, so I removed it.

**Worth knowing:**
- **Even level 1 beats the old Planner** most of the time. The new ladder starts above the old one; the old rungs stay for beginners.
- **On the book edition the search uses towers, symbol gliders and the odd mirror, never walls or factories.** Their value shows up past its look-ahead. Teaching it those is a scoring change for later.
- Search against search is often a tower race. Many Play draws come from equal tower counts at the end.

## Stage 4: the AI commander, solo

Branch `minpentai-agent-play`, commit e5015c3, on top of stage 3.

**What a person can do** (once you switch it on): tell their own AI (Claude, ChatGPT, any MCP client) "start a Minpentai match on the book edition at level 3". The AI then reads their side, tries plans in the sandbox, says what it would do, and places what the person agrees to. The person watches a live link showing only their side.

**Tools** (scope `play`): `minpentai_start_solo`, `minpentai_list_my_matches`, `minpentai_get_view`, `minpentai_simulate`, `minpentai_submit_orders`, `minpentai_let_site_play_turn`, `minpentai_set_standing_order`, `minpentai_resign`, `minpentai_new_live_link`, `minpentai_get_record`.
- **get_view** is the side's view only (engine `fog()`). It carries no piece ids or counters, and shows ore only on rocks fully in sight.
- **simulate** runs from the side's view plus the agent's own belief, never the real board. A belief piece is refused only where the side can already see, in the same words whether that square is empty or not.
- **submit_orders** is checked on the real board. Placing reads only squares within reach, all of which the side can see, so a refusal says nothing about the dark. Each submission gets a fresh 32-byte salt and a commitment. The site computer commits its own orders when the turn opens, from its own view, before the person's exist. With `final: true` both sides are revealed and applied together.
- **get_record** opens only when the match is over, for anyone. Before that it says the same words as for a match that doesn't exist. The record carries every turn's orders, who chose them, and each commitment with its salt.
- **The live link:** `/minpentai/m/<id>?k=<secret>`. The secret is shown once and stored hashed; `new_live_link` replaces it. It is noindex, sends no referrer, and refreshes itself. It shows the side's view while the match is on and the whole board after.

**Tests:**
- `npm run test:minpentai-agent-play`, 115 checks, in-process: whole matches with a scripted agent that compares plans in the sandbox; every commitment checked against its revealed orders and salt; the record replays to the final board; the view and the sandbox unchanged by hidden pieces; each review finding as a twin-board check.
- `npm run test:minpentai-agent-mcp`, 22 checks: the built site on PGlite with every migration. A scripted agent signs in through OAuth asking for `play`, then plays a whole book-edition match through `/mcp` (view, sandbox, standing order, committed orders, one turn handed to the site computer) to the end. Another person's agent is told the same as for a match that doesn't exist. The live link opens only with its secret, and final submits take a fixed time.
- `test:agents` (185) and `test:agent-api` (25) still pass.

**Off in production.** `AGENTS.minpentaiPlay` is false. The `play` scope can't be granted, isn't in the OAuth metadata, isn't the default, its tools are listed to no agent, and the live link returns 404. Only the local tests switch it on (`MINPENTAI_PLAY_TEST`, never on Vercel). The consent line for `play` is drafted in `SCOPE_TEXT` but shows nowhere while it's off.

**Not built (later, as you said):** PvP, lobbies, clocks, notifications, and the format 4 bytes. Hand placing on the live link isn't built either: the person decides in their chat.

## Stage 5: independent review

A fresh agent, given the code and the agent-play design but not my reasoning, tried to learn hidden information through error messages, the sandbox, the view, the live link, timing, the record, other people's matches and the commitments. Its probe scripts are kept in `docs/minpentai/fog-review-2026-10-31/`.

**Found, and fixed** (commits fd6d675 and 45b0bf0):

| # | Finding | Severity | Fix | Test |
|---|---|---|---|---|
| 1 | **Your own pieces were sensors in the dark.** The view showed a side's own squares, mirrors, factories, resting symbol gliders and moving walls anywhere, with their real state. So a symbol glider sent east came to rest exactly where a hidden square was (2 points for its exact position); a moving wall stopped short of one; and an own square's hits left showed a hidden glider's hit. | High | A side's view holds only what is in sight, its own non-tower pieces included. The person still sees where they placed them in their own turn list. | F1 (three twin-board checks) |
| 2 | **Timing.** A final submit runs the computer's next plan, which took about 12 ms more per computer tower (102 to 246 ms over HTTP), against a 4 ms non-final baseline. | Medium | Calls that resolve a turn (and the start) answer no sooner than 1.5 s. The reviewer's own HTTP probe now reads 1508 to 1516 ms from 5 to 21 computer towers. | M22 over `/mcp` |
| 3 | **The computer is predictable.** Book-edition setups at level 5 come in 4 shapes over 60 seeds. With the open-source engine, an agent can keep a handful of candidate hidden boards that always include the real one. | Medium, partly by design | Partly: the computer's numbers now mix in a server-only random value per match, shown in the record after the end, so the seed alone no longer gives its exact choices. Its play is still narrow, and an agent can still sample the distribution. | F3 |
| 4 | **Ore at the edge of sight** showed a hidden factory firing. | Low | Ore only where the rock and every square beside it are in sight. | F4 |
| 5 | **A moving wall's stop flag** reached the sandbox. | Low | Never copied into a view. | F5 |
| 6 | **Rocks out of sight showed their real state** in rulesets without ore (latent: no live ruleset has breakable rocks or rock debris). | Low | Every ruleset: rocks out of sight as at the start. | F6 |

After the fixes, the reviewer's 150-pair differential fuzz (view, sandbox and refusals on twin boards that differ only in the dark) still finds nothing. Each new test fails on the engine before the fixes and passes after. `test:minpentai-agent-play` is now 115 checks and `test:minpentai-agent-mcp` 22. The identity gates are unchanged.

**Tried, no leak:** placement and belief refusals; the sandbox from view plus belief; glider and wall ids; empty lists; another person's match and the record before the end (same words as a match that doesn't exist); the live link's secret (24 bytes, constant-time compare, 404 either way); commitments (fresh 32-byte salts; the computer's orders fixed at the turn's opening); brute-forcing the seed.

**Not reviewed:** the live page's HTML byte for byte, OAuth attacks beyond other people's matches, CPU abuse of the sandbox, timing against Vercel itself, and PvP (not built).

**Found in live code, not changed (needs you):** Play's one-on-one, on main and in production, sends each side its own squares (with hits left) and its own gliders everywhere (`play-server/view.ts` `fog`). A player's own glider out of sight shows where it bounced off a hidden piece, and an own square's hits left shows a hidden glider's hit: the same class as finding 1. Fixing it changes what one-on-one players see, so it's your call. I'd hide own gliders and squares out of sight, as agent play now does.

## Decisions I made for you

Each one is easy to change.

1. **The book edition's numbers:** 24 × 14 (within 32 × 16, so it fits the snap), 144 steps, 10 points a turn, 12 at setup, no drawn rule, 14 rocks in pairs and singles (7 a side, turned half round for Amber).
2. **The book's pieces as settings that are absent from Play,** not as new options of existing settings, so nothing about Play or old versions changes. Player-made versions can't turn them on yet (`check()` is unchanged).
3. **Mirrors turn a glider in place** (on the square before the mirror), as squares and rocks bounce in place in this edition. Moving onto the mirror square would look more like a mirror but needs two pieces on one square.
4. **The remote symbol, per your reading of c4-b113:** three gliders, one turn, walled in or gone. "Walled in" is every square a glider could reach it from (four sides, or eight under the diagonal rule) being solid or the edge. While it forms it counts as a tower (sight, reach, and the tower count). Several at once form on the first in reading order.
5. **Factories need their rock within reach,** so a refusal can't tell you whether a rock out of sight has crumbled. Ore is spent only when the factory actually fires.
6. **A side sees rocks out of sight as they were at the start,** and their ore only where the rock and the squares beside it are in sight.
7. **The view renumbers glider and wall ids and drops empty piece lists.** Real ids would count pieces made out of sight, and an empty list would say the enemy has such a piece somewhere. The review test found the empty list (below).
8. **Search levels:** spaced by slips and look-ahead, not by handicaps. Level 1 is already above the old ladder.
9. **Agent play, solo, without clocks:** a turn resolves when the person's side marks its orders final. "Let the site computer play this turn" is the explicit fallback, under the standing order's preset (defend, attack, expand, balanced as search weights; level 3).
10. **Opponent's revealed orders are not shown during the match,** only in the record after it, since they would show hidden pieces.
11. **The live link is a random secret stored hashed** (not a signed token), so it can be replaced at once.
12. **Level 3's slips** were tuned once more after the fog fix (15% to 12%), and the round robin re-run (table above).
13. **Disk:** the Mac's disk filled at about 07:55. I freed about 5 GB by deleting `.next` and `.vercel/output` (build files, rebuilt on the next build) in my own Minpentai worktrees only. Stages 3 and 4 are stacked in the `snowmoon-book-edition` worktree rather than new worktrees. **The disk is still nearly full**, with about 3 GB free.

## What failed, and what I fixed

- The first round robin had stronger levels losing to weaker ones (level 4 0–20 against level 1 on Play). The cause was the flattened end-of-match score. Fixed and re-run.
- A fog leak found by the stage 3 test: an enemy's hidden moving wall left an empty list in Cyan's view. Fixed, and tested.
- The principles check flagged a function named `canonical` under P5a ("canon"). Renamed.
- The kit's rules table quoted `apply`'s old first line. Updated (P8g).
- The first preview build failed because the archived review probes were `.ts` files the build typechecked. Kept as text; rebuilt.

## What needs you

1. Run the cap10 SQL, say "applied", then OK #75's merge.
2. Play one snap turn on your phone (the deploy of #68 hasn't been tried in Farcaster).
3. The book edition: read the four pieces' rules on the preview, and pick a name.
4. Whether the search computer should replace Play's ladder now, and whether level 1 is too strong for a first match.
5. Agent play: the consent line for `play`, the Terms and Privacy lines (model label, standing orders, notes, the public record), and applying `NEXT_minpentai_agent_matches.sql`. These come before switching it on.
6. Live one-on-one's own-piece leak (Stage 5): hide own gliders and squares out of sight?
7. Disk space: a cleanup plan for old worktrees (you asked for one before deleting anything).

## Principles

- **P8 (book, invented, draft):** every new page carries "Book", "Invented" and "Draft". Every quote is word for word with its block, and every rule is marked this edition's. **Pass** (`check:principles` 53/54 on each branch, P6d accepted).
- **P5 (no canon):** **pass**, after the rename.
- **P4 (agents draft, people decide):** agent play is the person's own match. Each turn records whether the person, the agent or the site computer chose it, and the agent is told to place only what its person agrees to. **Pass.** One new tension: the agent can submit orders itself under a standing order. The design allows that, and the record labels it.
- **P6 (keys and money):** no new key, and no paid call. **Pass** (P6d accepted as before).
- **Legal texts describe today:** nothing changed. Agent play stays off until its lines exist. **Pass.**
