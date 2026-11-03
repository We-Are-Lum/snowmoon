# Minpentai: matches between people (design)

> DRAFT, for the owner. Written by the coding agent (Anthropic's Claude, a closed model), 2026-11-03. Rules invented for this edition; Rocks and Mirrors' pieces drawn from passages in the book · not affiliated with the author. Nothing here is live. Terms and Privacy changes are drafts for the owner's reread.

Two kinds of match:
- **Practice:** free, built first, on branch `minpentai-practice`.
- **Official:** design only.

Both use the agent-play engine, views and tools that already exist (#86–#100): the fog view, the sandbox, the rule texts, the turn summary, Take turn and the replay.

## Practice matches

### How a match goes
1. **Creating.** A person creates a match. They choose:
   - the ruleset: book-2 (default) or Play's play-3; drafts such as book-4 only for people on the drafts list;
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
| Ruleset | book-2 | book-2, play-3; drafts by name for the drafts list |
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
- Without a scheduled job, the clock is enforced whenever either player, or either live page, looks at the match. An overdue turn resolves first.
- A Vercel cron job every 5 minutes would also resolve overdue turns and send notifications. It needs a `CRON_SECRET` environment variable, which only the owner can add. The build includes the route, which does nothing until the secret is set.

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

The bar is checked at entry and kept for a day, as the image score is.

### The fee covers the AI, no prizes
I measured the payloads of a real book-4 match on this branch's code; no paid model calls were made.

| Payload | Tokens |
|---|---|
| Tool definitions | about 4.8k |
| `get_view` | about 3.4k |
| `simulate`, 2 plans | about 0.5k |
| Symbol helper | about 0.2k |

**Assumptions** about how an in-platform AI plays a turn:
- four model calls: view, two sandbox calls, then orders and a reply;
- the tools and system prompt cached, about 6.3k;
- about 5.5k of new input per call, because only the current view is kept, not every past one;
- about 2k output a turn, thinking included.

Over 12 turns that's about 300k cached and 265k new input tokens and 24k output tokens a side, so for **both sides**: about 0.6M cached, 0.53M new and 48k output.

| Model (per million tokens: input / output / cached read) | AI cost of one match, both sides | Proposed fee per player |
|---|---|---|
| Claude Haiku 5.5 ($0.10 / $0.50 / ≈$0.01) | ≈ $0.08 | $0.25 |
| Claude Sonnet 5.5 ($2 / $10 / $0.20) | ≈ $1.66 | $1.50 |
| Claude Opus 5.5 ($4 / $20 / $0.20) | ≈ $3.20 | $3.00 |

**Recommendation:**
- **Season 1:** Claude Sonnet 5.5 at low effort, **$1.50 per player per match**, paid from the prepaid wallet balance the site already has.
- The fee leaves about 1.8× headroom for longer chats, retries and cache misses.
- Measure the real cost on the first 20 official matches, then set the season's fee.
- **No prizes from fees.** The fee pays for the AI and nothing else, and the page says so.

**Before any number is final:** these are estimates. A measured match needs real model calls, which need the owner's OK because they spend money.

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
> If you play a practice match against another person: the match is kept with both players' accounts, including its board, every turn's orders and who chose them, the turn clock, and your standing order. The other player learns your name while the match is on, and everyone sees the replay once it ends (with your name only if you chose that). Your standing order's words stay private. Invite links are kept as a hash until they're used or expire after 24 hours. Matches are deleted 30 days after they end, except their public replay, unless you ask us to remove your name from it.

**Privacy section 7, new sentence (only if ntfy turn alerts are kept).**
> ntfy delivers "your turn" alerts to the private topic you choose to subscribe to. An alert carries only that it's your turn and a link to your match. ntfy learns the topic name, not who you are.

**Official matches,** when built, would need these further sections (not drafted yet):
- Terms: the fee, no prizes, the leaderboard and its seasons, the review of flagged matches, what an official result means.
- Privacy: account-age and follower checks, Neynar and Bluesky lookups, and the in-platform AI's model provider (it receives the board and your chat in official matches).

## Build plan for practice matches (this branch)
1. **Migration `NEXT_minpentai_versus.sql`:** table `studio.mp_versus`, with the two people, ruleset, clock, privacy, state, version, the invite hash and its expiry, and timestamps. The owner applies it as postgres.
2. **`agent-play/versus.ts`:**
   - the match, with orders sealed by per-turn commitments per side;
   - resolving when both are in, or when the clock forces the missing side;
   - each side's view (the fog view and summary from solo.ts, for Cyan or Amber);
   - the record.
3. **New tools:** `minpentai_create_practice`, `minpentai_list_open_practice`, `minpentai_join_practice`. The existing match tools take a practice match id too.
4. **Pages:**
   - the live page for either side, with Take turn;
   - an invite page that joins as Amber;
   - the open list;
   - the public replay after the end.
5. **The clock:** enforced on every read, plus a cron route that's off until `CRON_SECRET` is set.
6. **Tests:**
   - sealed orders, and commitments revealed correctly;
   - the clock firing the standing order;
   - single-use invites;
   - no view of the other side;
   - no spectator during the match;
   - the replay after the end;
   - never counted.
