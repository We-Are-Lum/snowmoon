# Minpentai: agent play (bring your own AI)

> DRAFT design, 2026-10-30, for the owner's read. Written by the coding agent (Anthropic's Claude, a closed model). Nothing here is built. It builds on `docs/minpentai-book-study.md` (what the book says, and the gap table) and on what exists on `main` (02ddf08): Play's engine (`src/lib/minpentai/play-game/game.ts`), the one-on-one server (`src/lib/minpentai/play-server/`), and the Snowmoon connector (`src/app/mcp/route.ts`, `src/lib/agents/`). Rules invented for this edition · not affiliated with the author.

## 1. What it is, in one paragraph

A person connects their own AI (Claude, ChatGPT, or any MCP client) to snowmoon.party, as they do today for scenes. Through new Minpentai tools the agent can find a game, join it, read *its own side's* view, try plans in a private sandbox, and submit orders at each turn to act. The person watches a live link that shows only their side, and talks to their agent in their own chat app: "play defensively", "send a glider at that tower", "resign". If the person says nothing before a turn's deadline, the agent's standing move goes in. The site is the referee: it runs the engine, hides each side's orders until both are in, enforces each side's fog and the clocks, and logs every move in a replayable record. It is the chapter 7 final (c7-b63, c7-b65) with the player's own AI, minus the shared transcripts (section 9).

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
2. **Check on a schedule.** The person tells their agent how often to look ("check every hour from 9 to 6"). The schedule lives in the person's AI app, not on the site: Claude's scheduled tasks, ChatGPT's tasks, or a cron in a self-hosted agent. When the agent finds a game waiting for them ("someone's waiting, want to play?"), it asks the person in their chat. The site can't push into someone's chat; it can only answer when asked. (Optional later: a Farcaster notification from the site to the person, the same as a challenge today.)
3. **Join.** `minpentai_join_game` returns the match, the side, and a **live link for that side only**: `snowmoon.party/minpentai/m/<id>?side=<token>`. The token is per side, signed, and shows that side's fogged board, its pending orders, its standing order and the model labels. It never shows the other side's board or orders. Opening it needs no sign-in, so the person can send it to their phone; it can be revoked.
4. **Setup and each turn to act.** The agent reads `minpentai_get_view`, may try ideas in `minpentai_simulate`, then calls `minpentai_submit_orders`. It can replace its orders as often as it likes until the deadline. The person may chat and override at any time before the deadline.
5. **Reveal.** At the deadline, or as soon as both sides mark their orders final, the referee applies both sides' orders at once, runs the steps until the next turn to act, and the next turn opens.
6. **End.** As today: no towers, most towers at the last step, resignation, or forfeit. The full replay and both sides' orders become public on the match page and through `minpentai_get_record`.

## 5. Fog: agents see only their side

- Every Minpentai tool answers from `viewFor(m, side, now)`, the same view the hand player's page gets: the rocks, the side's own pieces, every piece within R of its towers, and last-seen outlines. Never `m.w`, never `hist` before the end, never the other side's `pend`.
- The tools take a `match_id` and find the side from the calling agent's person. An agent can't ask for the other side. A person who holds both sides is refused (section 12).
- Errors don't leak. `checkPlacements` checks emptiness against the real board, but only inside the lit zone (within R of the side's towers at the start of the turn), and sight has the same radius R, so every square a side may place on is one it can see. If both sides place on the same square, both placements cancel (`apply`), as today. Keep sight radius ≥ placement radius in any future rule, or this check starts to leak.
- The sandbox never reads the real board (section 8).
- Spectators: no live audience view during agent matches, for now. The book's audience sees everything (c14-b51), but a live full view is the easiest leak: a person could watch it in one tab and tell their agent. Full view after the match.

## 6. Simultaneous orders, committed and revealed

- An order is a list of placements: `{piece: glider|square|tower, x, y, dir?}`, at most the turn's points.
- `minpentai_submit_orders` stores the list as that side's `pend` (replacing any earlier one) and returns a **commitment**: `sha256(canonical(placements) || salt)`, with the salt kept by the server. The other side sees that this side has committed, and the commitment hash itself (`opponent_commitment`), never the orders. Showing the hash to the opponent at once is what makes it worth something: the referee can't later swap a side's orders without the opponent's copy of the hash disagreeing.
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

- **Standing order (words, private).** The person tells the agent how to play: "play defensively, do your best", "trade towers if you're ahead". The agent stores it with `minpentai_set_standing_order`; it's shown on the person's live link and never to the other side. It guides what the agent submits; the referee doesn't interpret it.
- **Standing move (placements).** As soon as a turn opens, the agent submits its best orders under the standing order (`source: "autopilot"`). That submission *is* the default: if nothing replaces it, it is what's revealed at the deadline. The agent should do this early in every turn it wakes for.
- **Override.** The person chats ("no, put a square in front of the north tower"); the agent submits again with `source: "person"`. The latest submission before the deadline counts. The person can also place by hand on the live link, which replaces the agent's orders (`source: "hand"`).
- **Nothing at all by the deadline:** the side passes (no placements). Two passes in a row with nothing ever submitted counts as gone (forfeit), so an abandoned side doesn't hold a game open. Owner decision on the number.
- The match record keeps each turn's source, so a replay shows which moves the person chose and which the agent chose on its own.

**The book's shared transcripts.** In chapter 7 each side reads the other AI's thoughts (c7-b65). Not in the first version: a chat AI's reasoning isn't something we can collect honestly, and a summary written by the agent would be a claim. A later "open thoughts" mode could carry a per-turn note the agent writes for the opponent (`notes_public`), labelled as the agent's own words.

## 10. The match record, replayable and compatible with the onchain log

- Each match keeps: the seed, the rule, the pace, both sides (person, played by hand or agent, model label), and for each turn to act: each side's final placements, the source, the commitment, the salt and the reveal time. Plus the end.
- **Replay:** seed + rule + both sides' placement lists replays the whole match with the engine. The test is the same as the snap's and the onchain spike's: replaying the record must give the stored final position, byte for byte.
- **Encoding:** reuse the spike's format 3 piece encoding (one byte for the square `y * 15 + x`, one byte `piece << 4 | direction`) and its final-position block. A two-player draft, "format 4": opponent kind 1 (a person), both sides' placement lists per turn (Cyan then Amber), and a 32-byte commitment per side per turn. Model labels and standing orders stay offchain, in the site's record; only their hash goes into the bytes, if anything. The spike is solo-only and not merged, so format 4 is a proposal for whoever takes PvP onchain; the site's record stores the format 4 bytes from day one so nothing has to be converted later.
- `minpentai_get_record` returns the record as JSON and as the encoded bytes (hex).

## 11. Which model played: a label, not a proof

- **On the live view and in the match record**, each side shows: "Cyan: @nate's agent "Rook" · Claude (Anthropic app) · says it runs Claude Opus 5.5 (self-reported)". Played by hand: "Cyan: @nate, by hand".
- **What we know vs. what's claimed.** The app (Claude, ChatGPT, a personal key) is known from how the agent connected (its OAuth client or key). The model is what the agent declares on joining, in the same shape `bring_in_image` uses (`model: {name, maker, weights: open|closed|unknown, version?}`), and is labelled "self-reported". It can change mid-match; every change is kept with the turn it started.
- Closed models are allowed and labelled, with the maker named first (the site's rule since 2026-10-18).
- **An AI-free ladder, kept apart.** Today's one-on-one record (hand play) stays its own table and ranking. Agent games never count toward it, and hand players are never matched against agents unless they choose an agent game. Honest wording on the AI-free side: "no connected agent played", not "no AI helped". The site can't see a second screen.

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
- In: `{ match_id, text: string (≤ 500) }`; Out `{ ok: true }`. Private to the side.

**`minpentai_simulate`** (read; computes, stores nothing)
- In: `{ match_id?: string, board?: Board (only without match_id), belief?: { towers: [[x,y]], squares: [{x,y,hp}], gliders: [{x,y,dir}], orders?: [placements] }, scenarios: [{ name, placements }] (1–6), steps?: number, frames?: boolean }`
- Out: `{ based_on: "your view at step N + your belief", scenarios: [{ name, legal, cost, why_not?, result: { my_towers: { kept, lost: [[x,y]] }, their_towers_in_belief: { kept, lost }, gliders_end: [...], board_end, frames? } }] }`

**`minpentai_resign`** (write): In `{ match_id }`; Out `{ ok: true, over }`.

**`minpentai_list_my_matches`** (read): In `{ state?: "live" | "over", limit? }`; Out `{ matches: [{ match_id, side, opponent, phase, deadline, your_turn_open: boolean, result? }] }`.

### After a match

**`minpentai_get_record`** (read; only when over, for anyone)
- In: `{ match_id }`
- Out: `{ seed, rule, pace, sides: { C: Side, A: Side }, turns: [{ turn, step, C: { placements, source, commitment, salt }, A: {...} }], end: { win, kind, step, counts }, final_position, bytes_hex, format: 4, replay_url }`

### Patterns (open question, section 14)

**`minpentai_save_pattern`** / **`minpentai_list_patterns`**: a named set of placements relative to an anchor (`{ name, placements, note }`), private to the person by default. Sharing is the open question.

`ModelClaim` = `{ name: string, maker: string, weights: "open" | "closed" | "unknown", version?: string }`, as `bring_in_image` uses.

Existing tools stay as they are; `whoami` gains the person's live matches and open turns, so an agent that wakes on a schedule learns in one call what needs doing.

## 14. Open questions for the owner

1. **One person running both sides.** Same FID is refused. Two FIDs held by one person can't be seen. Options: count agent-match results only between people above a Farcaster quality score (as the onchain spike proposes for rankings); show the pair's history ("these two have played 40 times"); make agent games unranked to start, which removes the reason to cheat. Recommendation: unranked first.
2. **Rate limits.** The numbers in section 12 are guesses. Should `simulate` be cheaper in Daily games (more time, more tries)?
3. **Disconnect.** Proposed: the standing move counts; nothing at all means a pass; two passes with nothing ever submitted is a forfeit. Is two right? In Daily games a missed day is likelier; maybe count in hours, not turns.
4. **Blueprints and patterns.** Private by default. If shared: public under GPL-3.0 with the author's credit, like everything else made on the site? Visible to an opponent during a match? (The book's players keep their designs secret: "Zei designed that piece himself, so that it would not appear in the transcript", c7-b115.) Recommendation: private during matches, publishable afterwards.
5. **Hand play against agents.** Allowed only in games marked "anyone", with the opponent's label shown before joining?
6. **Commitments.** Referee-signed only, or also signed by the person's wallet when they have one? Wallet signatures make the record checkable without trusting the site, and need a wallet tap each turn, which defeats autopilot. Recommendation: referee-signed now, wallet later for ranked games.
7. **The book's open thoughts (c7-b65).** Build the optional public note per turn, or leave it out?
8. **Spectators.** Keep live full view off for agent games, as proposed? A delayed view (one turn behind) is safer than live.
9. **Legal texts.** Agent play stores a model label, the standing order and private notes, and publishes the record after the match. Terms and Privacy need lines for it, shipped with the feature, not before (the site's rule).
10. **Engine.** This uses Play's engine as it is. If the one-engine work changes it, agent play follows; the record's ruleset ID says which rules a match used.

## 15. A build order, if approved

1. The `play` scope and the read tools (`list_games`, `get_view`, `list_my_matches`, `get_record`) on existing one-on-one matches, for the allowlisted people.
2. Agent paces, the deadline cron, `submit_orders` with commitments, the standing order and autopilot rules, the per-side live link.
3. `simulate`.
4. Model labels on the live view and record, and the separate ranking.
5. The format 4 bytes in the record.

Each step is testable without a model: a scripted agent (like `scripts/minpentai-players/first-player.ts`) can play through the tools.
