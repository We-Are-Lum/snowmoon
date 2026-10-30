# Minpentai: agent play (bring your own AI)

> DRAFT design, 2026-10-30, v2 with the owner's decisions of 2026-10-30 (section 0). For the owner's read. Written by the coding agent (Anthropic's Claude, a closed model). Nothing here is built. It builds on `docs/minpentai-book-study.md` (what the book says, and the gap table) and on what exists on `main` (02ddf08): Play's engine (`src/lib/minpentai/play-game/game.ts`), the one-on-one server (`src/lib/minpentai/play-server/`), and the Snowmoon connector (`src/app/mcp/route.ts`, `src/lib/agents/`). Rules invented for this edition · not affiliated with the author.

## 0. Decisions (owner, 2026-10-30)

1. **Fallback:** a side with nothing submitted at the deadline is played by the site's own search computer (no model calls), guided by the standing order's preset. Forfeit only after 3 turns in a row played by the fallback with no agent or person connecting; then the opponent chooses to claim the win or play on. Depends on the stronger computer landing (section 9).
2. **Commitments:** a hash of the orders plus a random 32-byte salt per side per turn; the salt is revealed with the orders (section 6).
3. **Fog invariant:** placing reach can never exceed sight. A checked rule for every ruleset and version; the version check refuses a version that breaks it (section 5).
4. **Notifications:** opt-in Farcaster mini app notifications for "your game has an opponent" and "your turn", in v1 (section 4).
5. **Paces:** all three kept; 2- and 5-minute turns need the person present in chat, otherwise the fallback plays (section 7).
6. **Settled questions:** agent games unranked; hand players can face agents, labelled; patterns private during a match, publishable after; no live spectating, full board after the match; no public thought note in v1; legal texts ship with the feature; build on the one-engine engine after it merges (section 14).

## 1. What it is, in one paragraph

A person connects their own AI (Claude, ChatGPT, or any MCP client) to snowmoon.party, as they do today for scenes. Through new Minpentai tools the agent can find a game, join it, read *its own side's* view, try plans in a private sandbox, and submit orders at each turn to act. The person watches a live link that shows only their side, and talks to their agent in their own chat app: "play defensively", "send a glider at that tower", "resign". If the person says nothing before a turn's deadline, the agent's standing move goes in; if there is no move at all, the site's own computer plays the turn under the person's standing order. The site is the referee: it runs the engine, hides each side's orders until both are in, enforces each side's fog and the clocks, and logs every move in a replayable record. It is the chapter 7 final (c7-b63, c7-b65) with the player's own AI, minus the shared transcripts (section 9).

The site pays for no model. Each player's AI runs on their own account.

## 2. What exists today, and what it gives us

| Need | Already on `main` | Missing |
|---|---|---|
| A referee that hides the whole board | `play-server/match.ts`: the match lives on the server; `view.ts`'s `viewFor` and `fog` give each side only what its towers light; the full replay (`hist`) is sent only when the match is over | Nothing for fog; reuse as is |
| Simultaneous orders | Both sides' placements are held in `pend` and applied together (`apply`, "two on one square cancel"); a side's view shows only its own pending pieces | A commitment receipt per side (section 6) |
| Server deadlines | `advance()` resolves deadlines lazily on any request; `TURN_MS` 45 s, `SETUP_MS` 90 s | Longer clocks for agents; a deadline that resolves with no one polling (section 7) |
| Lobby | `store.ts`: ready list, challenges, invites (`INVITE_MS` 24 h, 5 open), blocks, keyed by Farcaster ID | Open games that any agent can list, with settings |
| Placement checks | `checkPlacements(m, side, list)` | Reuse as is |
| An agent's view of a turn | `play-game/players.ts`: `PlayerView` (the fogged board, R, cost, every, rule, points, `mine`, `lastSeen`) for computer players | Serve it over MCP |
| A connector with sign-in | `/mcp` (OAuth 2.1, wallet sign-in or a personal key), scopes, per-agent daily limits, "agent of @person" naming; switched on for three people (`AGENTS.people`) | A `play` scope and the Minpentai tools |
| A move log | The onchain spike (branch `minpentai-onchain`, not merged): format 3, solo matches only, one record per match | A two-player format (section 10) |
| A declared-model label | `bring_in_image` takes `model {name, maker, weights, version}` and labels it "recipe as declared, not checked" | The same for a match side |

So most of the referee is built. The new work is the tools, the agent-paced clocks, the standing-move rule, the sandbox, the record, and the labels.

## 3. Who's who

- **Person:** a signed-in player, by Farcaster ID (as one-on-one today).
- **Agent:** one of the person's connected agents (`Agent` in `src/lib/agents/core.ts`; up to 3 per person). It acts only for its person.
- **Side:** Cyan or Amber in a match. A side is held by a person, played either **by hand** (the site's page, as today) or **by agent**. One agent per side per match.
- **Referee:** the server. It alone holds the whole board.

## 4. The flow

1. **Find or make a game.** The agent calls `minpentai_list_games` or `minpentai_create_game`. An open game waits up to its expiry (default 24 h, like invites).
2. **Check on a schedule.** The person tells their agent how often to look ("check every hour from 9 to 6"). The schedule lives in the person's AI app, not on the site: Claude's scheduled tasks, ChatGPT's tasks, or a cron in a self-hosted agent. When the agent finds a game waiting for them ("someone's waiting, want to play?"), it asks the person in their chat. The site can't push into someone's chat; it can only answer when asked.
   **Notifications, in v1 (opt-in):** the person can also turn on Farcaster mini app notifications from the site, for two events only: "your game has an opponent" and "your turn". Off by default, one switch each, on the person's Minpentai settings; sent through the mini app notification tokens the person grants when they add the app. They reach the person's phone even when their AI isn't running. At most one "your turn" per turn; none for Quick games unless the person asks.
3. **Join.** `minpentai_join_game` returns the match, the side, and a **live link for that side only**: `snowmoon.party/minpentai/m/<id>?side=<token>`. The token is per side, signed, and shows that side's fogged board, its pending orders, its standing order and the model labels. It never shows the other side's board or orders. Opening it needs no sign-in, so the person can send it to their phone; it can be revoked.
4. **Setup and each turn to act.** The agent reads `minpentai_get_view`, may try ideas in `minpentai_simulate`, then calls `minpentai_submit_orders`. It can replace its orders as often as it likes until the deadline. The person may chat and override at any time before the deadline.
5. **Reveal.** At the deadline, or as soon as both sides mark their orders final, the referee applies both sides' orders at once, runs the steps until the next turn to act, and the next turn opens.
6. **End.** As today: no towers, most towers at the last step, resignation, or forfeit. The full replay and both sides' orders become public on the match page and through `minpentai_get_record`.

## 5. Fog: agents see only their side

- Every Minpentai tool answers from `viewFor(m, side, now)`, the same view the hand player's page gets: the rocks, the side's own pieces, every piece within R of its towers, and last-seen outlines. Never `m.w`, never `hist` before the end, never the other side's `pend`.
- The tools take a `match_id` and find the side from the calling agent's person. An agent can't ask for the other side. A person who holds both sides is refused (section 12).
- Errors don't leak. `checkPlacements` checks emptiness against the real board, but only inside the placing zone, and a side sees at least that far, so every square a side may place on is one it can see. If both sides place on the same square, both placements cancel (`apply`), as today.
- **The fog invariant (decision 3): placing reach can never exceed sight.** If it did, a refusal ("that square is taken") would tell a player about a piece in the dark. It becomes a checked rule:
  - the version check (`check()` in `versions/schema.ts` on the one-engine branch) refuses any version where reach is greater than sight, **in the base settings and after every drawn rule and every mid-match change is applied** (each combination checked, since a drawn rule can set one number and not the other);
  - the engine asserts it when a match is created, so a bad version can't start even if it skipped the check;
  - a test runs every built-in rule and every listed version through both.
- **Does anything break it today?** No live mode does. On `main` there is one number, R, for both sight and placing: the one-on-one server, Play practice, the ladder and the snap all use `lit(…, R, …)` for both, and "sight 2" (`sight2`) sets R to 2 for both. The snap's sample version "Fast fog" sets R to 2, also both. The only mode with a human opponent is one-on-one, and it draws from the four rules, none of which separates the two. Learn's "fog" rule plays only against the computer.
- **But the one-engine branch, as it stands, would allow it.** It splits R into `sight` and `reach` (each 1–30), `check()` does not compare them, and its one-on-one server accepts a player-made version (`LiveMatch.version`). A version with `set: { sight: 2 }` keeps reach 3 and passes. No such version exists yet, and the built-in `sight2` sets both. The check above must land with or before one-engine's merge.
- The sandbox never reads the real board (section 8).
- Spectators: no live spectating (decision 6). The book's audience sees everything (c14-b51), but a live full view is the easiest leak: a person could watch it in one tab and tell their agent. The full board, every turn's orders and the replay are public after the match.

## 6. Simultaneous orders, committed and revealed

- An order is a list of placements: `{piece: glider|square|tower, x, y, dir?}`, at most the turn's points.
- `minpentai_submit_orders` stores the list as that side's `pend` (replacing any earlier one) and returns a **commitment** (decision 2): `sha256(canonical(placements) || salt)`, where `salt` is 32 random bytes drawn fresh by the server for this side, this turn and this submission (a replaced submission gets a new salt). The salt stays on the server until the reveal and is published with the orders. Without the salt, a hash of a short placement list could be guessed by trying every list. The other side sees that this side has committed, and the commitment hash itself (`opponent_commitment`), never the orders. Showing the hash to the opponent at once is what makes it worth something: the referee can't later swap a side's orders without the opponent's copy of the hash disagreeing.
- At reveal, both lists and both salts go into the match record, so anyone can check afterwards that each side's orders are the ones committed before the reveal. This is the "signed, offchain commitments" path the onchain fog proposal recommends for PvP (`minpentai-fog.md` on the `minpentai-onchain` branch); the referee signs the commitments, since agents have no wallet of their own. Owner decision: whether the person's wallet should also sign (section 14, question 6).
- Final early: `final: true` on a submission says "I'm done". When both sides are final, the turn reveals at once instead of waiting for the clock. This exists today as `ended` (`playTurn`: "Both ended → the turn resolves now"; the view shows `oppEnded`).

## 7. Clocks

- Every turn to act has a deadline the server enforces. The deadline must resolve even if nobody polls: today `advance()` runs only on a request. Agent matches need a small scheduled job (a Vercel cron every minute) that advances any match past its deadline.
- Agent games choose a pace when created:

| Pace | Setup | Each turn | For |
|---|---|---|---|
| Quick | 3 min | 2 min | Two agents on autopilot, people watching |
| Sitting | 10 min | 5 min | A person chatting with their agent |
| Daily | 24 h | 24 h | Correspondence: one turn a day, the agent checks on a schedule |

  **Quick and Sitting need the person present in chat** (decision 5). A chat AI doesn't wake itself every 2 or 5 minutes, and no scheduled task runs that often. If the person isn't there, each turn the agent didn't reach is played by the site's computer under the standing order (section 9). Daily is the pace for playing while away: the agent's schedule, or the person, gets to each turn within the day.

  Today's 45 s turn stays for hand play. A 96-step match with a turn every 12 steps has 8 turns to act plus setup, so a Daily match lasts about nine days.
- No presence pause for agent sides: today's 15 s pause and 60 s "gone" rules (`PAUSE_MS`, `GONE_MS`) assume a page that polls. For an agent side, only the deadline counts.

## 8. The sandbox: plans against a guess

`minpentai_simulate` lets the agent ask "what happens if I do X, and the enemy is where I think it is?" without touching the real hidden board.

- **What it starts from:** the side's own view (exactly what `minpentai_get_view` returns), plus the agent's **belief**: enemy towers, squares and gliders it supposes are in the dark, and optionally the enemy orders it expects this turn. The belief is the agent's own claim; the server never checks it against reality and never says whether it is right.
- **What it runs:** the same engine (`apply`, `step`) from that invented board, with the scenario's placements, for N steps (default: to the next turn to act; at most the match's remaining steps).
- **What it returns, per scenario:** whether the orders are legal and their cost; towers each side keeps and loses in the simulation; where each glider ends; the simulated board at the end (and at each step, if asked). Several scenarios in one call come back side by side, so the agent can compare "defend" with "attack" under the same belief, or one plan under several beliefs.
- **Why it can't leak:** the simulation is built only from the view and the belief. Nothing in it is read from `m.w`. Squares the side can't see are empty unless the belief fills them. A belief piece placed on a square the side can see but that is really empty is refused the same way every time ("you can see that square"), which reveals nothing new.
- **It can also run on the agent's side.** The engine is open source (AGPL-3.0); an agent with a code tool can run `game.ts` itself. The tool is for agents without one, and so every agent tests against the same rules.
- **Blank boards:** with no `match_id`, the sandbox starts from an empty or given board (like Free play), for learning patterns.

## 9. Autopilot: the standing order and the standing move

The person can't be asked to answer every 2 minutes, and the agent isn't always running: a chat AI only acts when it's asked or when its schedule wakes it. So "if the person says nothing, the agent plays" needs the move to be **on the server before the deadline**.

- **Standing order (words and a preset, private).** The person tells the agent how to play: "play defensively, do your best", "trade towers if you're ahead". The agent stores the words and the nearest preset (`defend`, `attack`, `expand`, `balanced`) with `minpentai_set_standing_order`; both are shown on the person's live link, so the person can see how their words were read, and never to the other side. The words guide the agent; the preset guides the site's fallback. The referee never interprets the words.
- **Standing move (placements).** As soon as a turn opens, the agent submits its best orders under the standing order (`source: "autopilot"`). That submission *is* the default: if nothing replaces it, it is what's revealed at the deadline. The agent should do this early in every turn it wakes for.
- **Override.** The person chats ("no, put a square in front of the north tower"); the agent submits again with `source: "person"`. The latest submission before the deadline counts. The person can also place by hand on the live link, which replaces the agent's orders (`source: "hand"`).
- **Nothing at all by the deadline: the site's computer plays the turn** (decision 1). The site's own search computer (the stronger computer player approved on 2026-10-21, built on the one-engine engine) chooses the side's placements, from that side's fogged view only, like any computer player. It calls no model and costs nothing per turn. It follows the standing order through a **preset**:

  | Preset | What the search weighs |
  |---|---|
  | `defend` | Keeping its own towers; squares in front of seen gliders; no towers spent forward |
  | `attack` | Hits on seen and last-seen enemy towers; gliders aimed off rocks |
  | `expand` | New towers that light more of the board; scouting gliders |
  | `balanced` | The search's default score |

  The agent sets the preset with the standing order (`minpentai_set_standing_order { text, preset }`), mapping the person's words; if the agent never set one, `balanced`. The record shows the turn as **"site computer, standing order: <preset>"**, never as the person's or the agent's move.
- **Forfeit:** only after **3 turns in a row** played by the fallback with no agent call and no person on the live link for that side during those turns. Then the match pauses for the opponent, who chooses: **claim the win** (recorded as a forfeit) or **play on** (the fallback keeps playing that side, and the match is marked "finished against the site computer from turn N"). Any call from the side's agent or a visit from its person resets the count.
- **Dependency:** the fallback needs the stronger computer, which waits for one-engine to merge. Until then agent play can't ship with this rule; a stopgap (the current ladder's "Blocker" plays the turn) is possible but weaker. Owner's call whether to wait.
- The match record keeps each turn's source, so a replay shows which moves the person chose and which the agent chose on its own.

**The book's shared transcripts.** In chapter 7 each side reads the other AI's thoughts (c7-b65). Not in v1 (decision 6): a chat AI's reasoning isn't something we can collect honestly, and a summary written by the agent would be a claim. No public thought note either.

## 10. The match record, replayable and compatible with the onchain log

- Each match keeps: the seed, the rule, the pace, both sides (person, played by hand or agent, model label), and for each turn to act: each side's final placements, the source, the commitment, the salt and the reveal time. Plus the end.
- **Replay:** seed + rule + both sides' placement lists replays the whole match with the engine. The test is the same as the snap's and the onchain spike's: replaying the record must give the stored final position, byte for byte.
- **Encoding:** reuse the spike's format 3 piece encoding (one byte for the square `y * 15 + x`, one byte `piece << 4 | direction`) and its final-position block. A two-player draft, "format 4": opponent kind 1 (a person), both sides' placement lists per turn (Cyan then Amber), and a 32-byte commitment per side per turn. Model labels and standing orders stay offchain, in the site's record; only their hash goes into the bytes, if anything. The spike is solo-only and not merged, so format 4 is a proposal for whoever takes PvP onchain; the site's record stores the format 4 bytes from day one so nothing has to be converted later.
- `minpentai_get_record` returns the record as JSON and as the encoded bytes (hex).

## 11. Which model played: a label, not a proof

- **On the live view and in the match record**, each side shows: "Cyan: @nate's agent "Rook" · Claude (Anthropic app) · says it runs Claude Opus 5.5 (self-reported)". Played by hand: "Cyan: @nate, by hand".
- **What we know vs. what's claimed.** The app (Claude, ChatGPT, a personal key) is known from how the agent connected (its OAuth client or key). The model is what the agent declares on joining, in the same shape `bring_in_image` uses (`model: {name, maker, weights: open|closed|unknown, version?}`), and is labelled "self-reported". It can change mid-match; every change is kept with the turn it started.
- Closed models are allowed and labelled, with the maker named first (the site's rule since 2026-10-18).
- **An AI-free ladder, kept apart.** Today's one-on-one record (hand play) stays its own table and ranking. Agent games are unranked and never count toward it (decision 6). Hand players can face agents: the game's listing and the live view say so before and during the match ("Amber: an agent of @bai · ChatGPT (OpenAI app) · says it runs …"), and a hand player's result against an agent is recorded with the agent games, not on the ladder. Honest wording on the AI-free side: "no connected agent played", not "no AI helped". The site can't see a second screen.

## 12. Limits and fairness

- **One person, both sides:** refused when both sides are the same Farcaster ID or the same agent. Two accounts run by one person can't be ruled out; see open questions.
- **Rate limits** (per agent, on top of `AGENTS.limits`): `get_view` 60 a minute (the existing read brake); `simulate` 30 per turn to act and 300 a day; `submit_orders` 20 per turn; at most 3 open games created and 5 live matches per person.
- **Cost to the site:** no model calls. The sandbox is CPU on the server: a 96-step simulation of a 15 × 10 board takes milliseconds; the per-turn cap bounds it.
- The connector stays behind `AGENTS.people` until the owner opens it.

## 13. Proposed MCP tools

All new tools are in a new scope, **`play`**, that the person grants on the consent screen ("play Minpentai for you: join games, see only your side, submit moves"). None spends money. Names follow the existing tools' style, with a `minpentai_` prefix so they group together.

### Lobby

**`minpentai_list_games`** (read)
- In: `{ for_me?: boolean, pace?: "quick" | "sitting" | "daily", limit?: number }`
- Out: `{ games: [{ game_id, host: { person, agent_name | null, model_claim | null, by_hand: boolean }, pace, opponents: "agents" | "anyone", rule: "drawn at start", created_at, expires_at, waiting_for_you: boolean }], my_open_games: [...], invites_to_me: [...] }`
- `for_me` keeps only games and invites the person can join right now. This is what the scheduled check calls.

**`minpentai_create_game`** (write)
- In: `{ pace: "quick" | "sitting" | "daily", opponents: "agents" | "anyone", invite?: "open" | "link" | { fid: number }, expires_hours?: number (1–72), model: ModelClaim }`
- Out: `{ game_id, invite_url, expires_at }`

**`minpentai_join_game`** (write)
- In: `{ game_id, model: ModelClaim, standing_order?: string (≤ 500 chars) }`
- Out: `{ match_id, side: "C" | "A", live_url, rule: { id, text }, pace, setup_deadline, opponent: { person, agent_name | null, model_claim | null, by_hand } }`

**`minpentai_cancel_game`** (write): In `{ game_id }`; Out `{ ok: true }`. Only before someone joins.

### A match

**`minpentai_get_view`** (read)
- In: `{ match_id, since_step?: number, frames?: boolean }`
- Out: `{ match_id, side, phase: "setup" | "act" | "run" | "over", step, max_steps: 96, turn: number, deadline, rule, R, every, points, cost: { glider, square: 1, tower: 4 }, board: { rocks, mine: { towers, squares, gliders }, seen: { towers, squares, gliders }, last_seen: [{ x, y, step }] }, can_place: [[x, y]...], my_orders: { placements, source, final, commitment } | null, opponent_commitment: string | null, opponent_final: boolean, standing_order, counts_seen: { mine, theirs_seen }, frames?: [fogged boards since since_step], live_url }`
- Pieces are `{x, y}` plus `{dx, dy}` for gliders and `hp` for squares. Everything is from this side's view.

**`minpentai_submit_orders`** (write)
- In: `{ match_id, turn: number, placements: [{ piece: "glider" | "square" | "tower", x, y, dir?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" }], source: "autopilot" | "person" | "agent", final?: boolean, note?: string (≤ 280, private, shown on the person's live link) }`
- Out: `{ accepted: true, commitment, replaced_previous: boolean, points_left, deadline }` or a refusal naming the placement and why (out of reach, not enough points, not empty where you can see, wrong turn, past deadline).
- `turn` must be the open turn, so a late or repeated call can't land in the next one.

**`minpentai_set_standing_order`** (write)
- In: `{ match_id, text: string (≤ 500), preset: "defend" | "attack" | "expand" | "balanced" }`; Out `{ ok: true, preset }`. Private to the side. The preset is what the site's computer uses if the side has no orders at a deadline.

**`minpentai_simulate`** (read; computes, stores nothing)
- In: `{ match_id?: string, board?: Board (only without match_id), belief?: { towers: [[x,y]], squares: [{x,y,hp}], gliders: [{x,y,dir}], orders?: [placements] }, scenarios: [{ name, placements }] (1–6), steps?: number, frames?: boolean }`
- Out: `{ based_on: "your view at step N + your belief", scenarios: [{ name, legal, cost, why_not?, result: { my_towers: { kept, lost: [[x,y]] }, their_towers_in_belief: { kept, lost }, gliders_end: [...], board_end, frames? } }] }`

**`minpentai_resign`** (write): In `{ match_id }`; Out `{ ok: true, over }`.

**`minpentai_list_my_matches`** (read): In `{ state?: "live" | "over", limit? }`; Out `{ matches: [{ match_id, side, opponent, phase, deadline, your_turn_open: boolean, result? }] }`.

### After a match

**`minpentai_get_record`** (read; only when over, for anyone)
- In: `{ match_id }`
- Out: `{ seed, rule, pace, sides: { C: Side, A: Side }, turns: [{ turn, step, C: { placements, source: "autopilot" | "person" | "agent" | "hand" | "site-computer", preset?, commitment, salt }, A: {...} }], end: { win, kind, step, counts }, final_position, bytes_hex, format: 4, replay_url }`

### Patterns

**`minpentai_save_pattern`** (write): In `{ name, placements (relative to an anchor), note? }`; Out `{ pattern_id }`. **`minpentai_list_patterns`** (read): Out `{ patterns: [...] }`. **`minpentai_publish_pattern`** (write): In `{ pattern_id, match_id? }`; Out `{ url }`. Patterns are private during a match; a pattern used in a match can be published only after that match ends (decision 6), under GPL-3.0 with the author's credit, like everything made on the site.

`ModelClaim` = `{ name: string, maker: string, weights: "open" | "closed" | "unknown", version?: string }`, as `bring_in_image` uses.

Existing tools stay as they are; `whoami` gains the person's live matches and open turns, so an agent that wakes on a schedule learns in one call what needs doing.

## 14. Settled, and still open

**Settled (owner, 2026-10-30):**
- One person running both sides: same Farcaster ID or same agent is refused; **agent games are unranked**, which removes most of the reason to run two accounts.
- **Hand players can face agents**, labelled before joining and during the match; results go with the agent games.
- **Patterns:** private during a match, publishable after it.
- **Spectators:** no live spectating; the full board after the match.
- **No public thought note in v1** (the book's c7-b65 transcripts stay out).
- **Legal texts** (Terms and Privacy lines for the model label, standing orders, private notes, notifications and the public record) ship with the feature, not before.
- **Engine:** build on the one-engine engine after it merges; the record's ruleset ID says which rules a match used.
- **Disconnect:** the fallback plays; forfeit after 3 fallback turns in a row with nobody connecting, at the opponent's choice (section 9).
- **Commitments:** hash plus a fresh 32-byte salt, revealed with the orders.

**Still open:**
1. **Rate limits.** The numbers in section 12 are guesses, to set after a few real matches.
2. **Wallet-signed commitments.** Referee-signed now. A wallet signature per turn would make the record checkable without trusting the site but needs a tap each turn, which works against the fallback. Revisit if agent games become ranked.
3. **Ship before the stronger computer?** Wait for it, or ship with the current "Blocker" as a weaker stand-in fallback.
4. **Presets.** Four is a start; more (for example "scout", "trade") only if the search's score can express them.

## 15. A build order, if approved

After one-engine merges (decision 6):

0. The fog invariant check in `check()` and at match creation, with tests (needed by one-engine itself, agent play or not).
1. The `play` scope and the read tools (`list_games`, `get_view`, `list_my_matches`, `get_record`), for the allowlisted people.
2. Agent paces, the deadline cron, `submit_orders` with salted commitments, the standing order with its preset, the per-side live link, the opt-in notifications.
3. The fallback, once the stronger computer is on main; the 3-turn forfeit and the opponent's choice.
4. `simulate`.
5. Model labels on the live view and record; agent results kept apart from the ladder.
6. The format 4 bytes in the record.

Each step is testable without a model: a scripted agent (like `scripts/minpentai-players/first-player.ts`) can play through the tools.
