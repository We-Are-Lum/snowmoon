# Minpentai: matches between people (design)

> DRAFT, for the owner. Written by the coding agent (Anthropic's Claude, a closed model), 2026-11-03. Rules invented for this edition; Rocks and Mirrors' pieces drawn from passages in the book · not affiliated with the author. Nothing here is live. Terms and Privacy changes are drafts for the owner's reread.

Two kinds of match:
- **Practice:** free, built first, on branch `minpentai-practice`.
- **Official:** design only.

Both use the agent-play engine, views and tools that already exist (#86–#100): the fog view, the sandbox, the rule texts, the turn summary, Take turn and the replay.

## Practice matches

### How a match goes
1. **Creating.** A person creates a match. They choose:
   - the ruleset: book-2 or Play's play-3, and drafts such as book-4 for people on the drafts list. The default is book-4 for people on the drafts list (the ruleset tuned for contact, owner 2026-11-03), and book-2 for everyone else;
   - the turn clock;
   - private (invite link) or public (on the open list).

   The creator plays Cyan.
2. **Joining.**
   - A **private** invite link is single-use, expires after 24 hours, and joins as Amber.
   - A **public** match is listed on the open list for anyone signed in and allowed to play. The first to join takes Amber, and the match leaves the list.
3. **Each turn,** each side sends its orders through its own AI over MCP (`submit_orders`), or approves its AI's draft with Take turn on its live page.
   - Orders stay sealed. Each side sees only that the other has sent orders, with **their per-turn commitment** (sha-256 of the orders and a secret salt).
   - When both have sent final orders, the turn resolves, and both orders and salts are revealed in the record.
   - Per-turn commitments are back for these matches, because a human's orders can't be re-derived like the computer's.
4. **The turn clock.** If a side hasn't sent final orders when the clock runs out, its **standing order** plays the turn: the site computer plays it under the side's preset (balanced if none), recorded as `site-computer (clock ran out)`. MCP can't reach anyone's AI, so a person has to come back; the site tells them it's their turn (see Notifications).
5. **The end.** A match ends by towers, the step limit or a resignation. Its **replay opens to everyone**: every turn, the whole board.

### Recommended defaults

| Choice | Default | Options |
|---|---|---|
| Ruleset | book-4 for people on the drafts list; book-2 for everyone else | book-2, play-3; drafts by name for the drafts list |
| Turn clock | 24 hours | 15 minutes (both playing now), 4 hours, 24 hours |
| Visibility | private invite | public |
| Invite link | single-use, 24 hours | — |
| Standing order when the clock runs out | the side's own; balanced if none | — |
| Live matches per person | 5 at once (as agent play) | — |

### Nobody watches a match while it's on
A watcher could relay one side's view to the other. While a match is on:
- each side's live link shows only that side;
- there is no spectator link;
- the open list shows only matches waiting for a second player, never matches being played.

At the end, the replay is public.

### What the record shows
- Both sides' orders every turn, revealed with their salts, and who chose each turn: the person, their AI, Take turn on the page, or the clock.
- Each side's model, **self-reported** and unchecked.
- **Names:** each side's Farcaster name (or shortened wallet address) is shown to the other player during the match, so they know who they're playing. In the public replay, a name appears only if that player says yes when creating or joining. The default is "Cyan" and "Amber".
- Standing-order text stays private: it's the person's own words.

### Never counted
Practice matches never count toward any leaderboard or one-on-one result, and the record says so.

### Notifications ("it's your turn")
Nothing on the site notifies anyone today. Proposal, in order:
1. **In the build:**
   - `list_my_matches` and the live page say "your turn" with the time left.
   - Each player can opt into a **private ntfy topic**: a random topic name we give them. They subscribe in the ntfy app, and we post "Your turn in a Minpentai match" with the link. The message carries no board, no orders and no names. We already use ntfy for report alerts.
2. **Later:** Farcaster mini app notifications for people who added the app. That needs the mini app's webhook, which we don't have yet, and a Privacy change.

### Turn clock enforcement
- The clock is enforced whenever either player, or either live page, looks at the match: an overdue turn resolves first. **That's enough for now (owner, 2026-11-03): no cron job.**
- If one is wanted later, a Vercel cron job would also resolve overdue turns and send alerts when nobody looks. The build includes its route (`/api/minpentai/practice/clock`), which stays off (503) until the owner sets `CRON_SECRET` and adds a schedule to `vercel.json`. Neither is done.

### Fog and timing
- Each side's view is the same fog view agent play uses, for its own side.
- The quiet time (#90) was about hiding the site computer's planning. With two people there's no computer planning, so calls aren't delayed. A call does show whether the other side has sent orders, but the commitment already says that, by design.

## Official matches (design only)

### Same AI on both sides
- Official matches are played with the **in-platform AI**: a chat beside the board on the live page, with the same tools as the connector.
- Both sides use the same model tier and settings, so the record knows the model.
- One model per season.
- Outside AIs over MCP can't play official matches.

### Who can enter
- **Farcaster accounts:**
  - a Neynar user score of at least 0.7, the bar images already use;
  - the account at least 90 days old;
  - at least 50 followers.
- **Bluesky accounts:**
  - at least 90 days old;
  - at least 50 followers;
  - at least 20 posts;
  - not labelled as spam by Bluesky's moderation.

  **This needs Bluesky sign-in, which the site doesn't have** (Bluesky is used today only to check post links).
- **Wallet-only accounts:** practice only.
- **Practice itself stays on the agent-play allowlist** (owner, 2026-11-03) until the owner opens it.

The bar is checked at entry and kept for a day, as the image score is.

### The fee covers the AI, no prizes

**Prices, from Anthropic's official pricing page (platform.claude.com/docs/en/about-claude/pricing, read 2026-11-03), per million tokens:**

| Model | Input | 5-minute cache write | Cache read | Output |
|---|---|---|---|---|
| Claude Haiku 5.5, prompt up to 100,000 tokens | $0.10 | $0.125 | $0.01 | $0.50 |
| Claude Haiku 5.5, **prompt over 100,000 tokens** | $0.50 | $0.625 | $0.05 | $2.50 |
| Claude Sonnet 5.5 | $2 | $2.50 | $0.10 | $10 |
| Claude Opus 5.5 | $4 | $5 | $0.20 | $20 |

**The long-prompt tier is real, and only for Claude Haiku 5.5.**
- The page's words: "a request whose prompt is over 100,000 tokens pays higher prices. A request's prompt length counts all of its input tokens, including cache reads and cache writes. Each request is priced on its own".
- So the whole request pays 5×, output included.
- Claude Sonnet 5.5 and Claude Opus 5.5 have no long-prompt tier: "a 900k-token request is billed at the same per-token rate as a 9k-token request".
- (The first version of this doc used $0.20 for Claude Sonnet 5.5's cache reads; it's $0.10.)

**How a match's context grows.** Every tool call is a model call, and each resends the whole conversation so far. The model below:
- **Measured sizes:** tool definitions about 4.8k tokens, `get_view` about 3.4k, a `simulate` answer about 0.6k, a `submit_orders` answer with its view about 3.6k.
- **Assumed:** a 1.5k system prompt; 0.3k of arguments and 0.4k of thinking and text per call; a 0.25k reply and a 0.06k message from the person per turn; caching on the whole prefix.

**How many calls a turn: the owner's book-3 playtest.** Counted from production's logs on 2026-11-03, match coj2y7jbdnll:

| Turn | `simulate` | `get_view` | `submit_orders` |
|---|---|---|---|
| 0 | 1 | 1 | 0 (plus start and the standing order) |
| 1 | 3 | 1 | 1 |
| 2 | 1 | 1 | 1 |
| 3 | 2 | 1 | 2 |
| **4** | **17** | 1 | 1 |
| 5 | 3 | 1 | 1 |

**One 12-turn match, both sides, AI cost** (arithmetic from the model above; no paid calls):

| Case | The chat... | Calls a side | Largest prompt | Claude Haiku 5.5 | Claude Sonnet 5.5 | Claude Opus 5.5 |
|---|---|---|---|---|---|---|
| Light (2 simulate a turn) | keeps everything | 60 | 142k | $0.41 (19 calls over 100k) | $2.13 | $4.25 |
| Light | is trimmed each turn | 60 | 23k | $0.08 | $1.41 | $2.82 |
| Playtest-like (1, 3, 1, 2, 17, 3, twice) | keeps everything | 90 | 181k | $0.90 (42 over 100k) | $3.48 | $6.96 |
| Playtest-like | is trimmed each turn | 90 | 42k | $0.12 | $2.09 | $4.17 |
| Heavy (17 simulate every turn) | keeps everything | 240 | 376k | $5.16 (179 over 100k) | $13.44 | $26.89 |
| Heavy | is trimmed each turn | 240 | 42k | $0.33 | $5.44 | $10.88 |
| **At most 6 simulate a turn, every turn at the cap** | **is trimmed each turn** | 108 | **28k** | **$0.14** | **$2.42** | **$4.83** |
| Playtest-like, capped at 6 | is trimmed each turn | 68 | 28k | $0.09 | $1.58 | $3.16 |

**What it says:**
1. **The in-platform AI must trim its chat each turn.** It keeps the current view and that turn's sandbox answers, plus a short summary of each past turn. Kept whole, a match's prompt passes 100k by mid-match, Claude Haiku 5.5's calls pay 5×, and every model costs 1.5–2.5× more.
2. **A cap on sandbox calls per turn** (6 proposed) bounds the worst case. The playtest's turn 4 had 17.
3. Output (thinking included) is most of the cost on Claude Sonnet 5.5 and Claude Opus 5.5, so the effort setting matters as much as the model.

**Recommendation:**
- **Season 1:** Claude Sonnet 5.5 at low effort; the chat trimmed each turn; at most 6 sandbox calls a turn.
- **Fee: $1.50 per player per match** ($3.00 a match). It covers the capped worst case ($2.42) with about 1.2× headroom, and the playtest-like case with about 1.9×.
- Claude Haiku 5.5 would cost about $0.25 per player, but only with trimming. Without it, a heavy match costs 20× more.
- Measure the real cost on the first 20 official matches (paid calls: the owner's OK first), then set the season's fee.
- **No prizes from fees.** The fee pays for the AI and nothing else, and the page says so.

### The leaderboard, per season
- **One ruleset per season.** The page says up front that rules and process change each season.
- **Ratings:** Glicko-2, a new season starting fresh.
- **Repeat wins count less.** The nth rated match between the same two people in a season counts 1/n. At most 3 rated matches a week between the same two people.
- **Provisional until** 10 matches against at least 5 different opponents. Provisional ratings aren't shown on the board.
- **Resigning before turn 3** gives the resigner a loss, but the winner gains nothing.

**How it resists alt accounts and win-trading:**

| Threat | What stands in the way |
|---|---|
| Making alt accounts to feed wins | The entry bar (age, score, followers); the fee for each match; provisional status until 5 different opponents |
| Two friends trading wins | Repeat matches count 1/n; a weekly cap per pair; early resignations give nothing |
| One person, two accounts playing each other | Same as above, plus a review flag for pairs with lopsided results, many early resignations or shared wallet links. Flagged matches are reviewed by an admin and voided if needed |
| Buying an aged account | Not preventable; the fee and repeat dampening limit what it gains |

### What can't be enforced, and how we say so
- We can't see help from outside the site: another AI, a friend, notes, or a second screen.
- An official result means **both sides played with the same in-platform AI for every move, under the same rules and clock.** It doesn't mean no other help.
- Proposed page wording: "Official matches are played with the site's AI, the same for both players. We can't see or stop help from outside the site, so a result says who won with the site's AI, not who played alone."

## Terms and Privacy changes (drafts, for the owner's reread)

**Terms, new section 6f "Practice matches between people."**
> If we let you play Minpentai against another person, each of you plays through your own agent or on your live page. Your orders stay sealed until both sides have sent theirs; the other player sees only that you sent them, as a commitment. If your turn's clock runs out, the site's computer plays the turn for you under your standing order. Nobody can watch a match while it is on. When it ends, its replay is public: the board, every turn's orders, who chose them (you, your agent, the site's computer or the clock), and the model each agent said it runs (shown as self-reported; we don't check it). Your name is shown to the other player during the match, and in the public replay only if you choose. Practice matches never count toward any ranking. Be civil; we may end a match and hide its record if it breaks these Terms.

**Privacy section 4, new bullet.**
> If you play a practice match against another person: the match is kept with both players' accounts, including its board, every turn's orders and who chose them, the turn clock, and your standing order. The other player learns your name while the match is on, and everyone sees the replay once it ends (with your name only if you chose that). Your standing order's words stay private. An invite link is kept only as a hash; it is cleared when used and stops working after 24 hours. Match records, finished or not, are kept until either player asks us to remove them: write to us (section 11) with the match's link or id, and we delete the whole record by hand. Only we remove match records, by hand, on request.

**Privacy section 7, new sentence (only if ntfy turn alerts are kept).**
> ntfy delivers "your turn" alerts to the private topic you choose to subscribe to. An alert carries only that it's your turn and a link to your match. ntfy learns the topic name, not who you are.

*Why not "deleted 30 days after they end": nothing would delete them.* The table can't delete rows (the site's roles have no delete), and there's no scheduled job. Deleting after 30 days would need three things:
- a database function, created by a migration the owner applies as postgres, that deletes only finished practice matches older than 30 days;
- a cron job calling it, which needs `CRON_SECRET` and a `vercel.json` schedule;
- a test that it deletes only those.

That is a deliberate exception to "only we remove match records, by hand". Until it is built, the draft says what happens today.

**Official matches,** when built, would need these further sections (not drafted yet):
- Terms: the fee, no prizes, the leaderboard and its seasons, the review of flagged matches, what an official result means.
- Privacy: account-age and follower checks, Neynar and Bluesky lookups, and the in-platform AI's model provider (it receives the board and your chat in official matches).

## What was built for practice matches (this branch, PR #101)
1. **Migration `NEXT_minpentai_practice.sql`:** no new table. It adds three columns to `studio.mp_agent_matches` (0032):
   - `kind` ('solo' or 'practice');
   - `opponent` (Amber's person);
   - `open` (public, waiting for a player).

   Practice matches are saved, versioned and read like agent matches. No grant changes; nobody can delete. The owner applies it as postgres when #101 is ready, numbered then.
2. **`agent-play/solo.ts`, by side:** every function takes a side, Cyan by default, so solo play is unchanged.
   - A practice match is a match with a `versus` block: both players, the names, show-name choices, Amber's agent, the clock and its deadline, public or private, the invite's hash and expiry, Amber's live link, standing order and summary, and opted-in alert topics.
   - Orders are sealed by per-turn commitments.
   - A turn resolves when both sides' final orders are in, or when the clock plays the late side (`runClock`).
   - Turns the clock plays come from the committed random value, so they can be checked from the record (`checkComputer`).
3. **Tools:**
   - New: `minpentai_create_practice`, `minpentai_list_open_practice`, `minpentai_join_practice`, `minpentai_practice_alerts`.
   - Every existing match tool acts for the caller's side.
   - No quiet time between people (there's no computer planning to hide).
   - The clock runs on every read (`act.ts clocked`).
4. **Pages:**
   - the live page for either side, with Take turn (#100);
   - `/minpentai/practice/join` (an invite);
   - `/minpentai/practice` (the open list);
   - `/minpentai/practice/[id]` (the public record and replay after the end; missing while the match is on).
5. **The clock:** on every read. The sweep route `/api/minpentai/practice/clock` stays off: no cron for now.
6. **Alerts:** an opt-in private ntfy topic per player.
7. **Who can play:** the agent-play allowlist only.
8. **Tests:**
   - in-process: invites, sealed orders, Amber's fog view against a copy with Cyan's hidden pieces removed, the clock (once, and both players away), resign, the record, and links per side;
   - over `/mcp` (P1–P21): the whole flow with two people and one who isn't on the allowlist, and the default ruleset.
