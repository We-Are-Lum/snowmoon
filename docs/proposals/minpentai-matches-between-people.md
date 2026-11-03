# Minpentai: matches between people (design)

> DRAFT, for the owner. Written by the coding agent (Anthropic's Claude, a closed model), 2026-11-03. Rules invented for this edition; Rocks and Mirrors' pieces drawn from passages in the book · not affiliated with the author. Nothing here is live. Terms and Privacy changes are drafts for the owner's reread.

Two kinds of match:
- **Practice:** free over MCP, built first, on branch `minpentai-practice`. With the in-site AI: credits, or a few free a day (design).
- **Official:** design only.

Plus a **3D replay** of each turn, designed here and built once #100 merges.

*Updated 2026-11-03 (owner, with Garance): the 3D replay; practice with the in-site AI; official entry through Farcaster, Lens or Bluesky; one person, one record; official computer matches and their leaderboard; weekly PvP rulesets.*

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
- **Names:** each side's Farcaster name (or "a wallet account") is shown to the other player during the match, so they know who they're playing. In the public replay, a name appears only if that player says yes when creating or joining. The default is "Cyan" and "Amber".
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

### Practice with the in-site AI
- **What it is:** practice where your side is played through the site's own AI. It's the chat beside the board that official matches use, and works against a person or the site computer.
- **How it's paid for:**
  - **With credits:** the prepaid balance the site already has, from a wallet linked to your account.
  - **Free:** **N a day** for accounts that pass a reputation bar (the same as official entry, below).
- **Free matches use the cheapest model,** Claude Haiku 5.5. They run under a **daily site-wide spend cap** that the owner sets. When the cap is reached, free matches pause until the next day (UTC); paid ones go on.
- **Proposed:**
  - **N = 3** free a day per account.
  - A **$2 a day** cap to start (owner, 2026-11-03; the owner raises it): about 28 matches at the worst case, about 50 at a typical one.
  - Paid practice: **$0.10** a match with Claude Haiku 5.5, or **$1.50** with Claude Sonnet 5.5, the official model.
- **Why it's cheap:** one match's AI side costs at most $0.07 on Claude Haiku 5.5, with the chat trimmed each turn and at most 6 sandbox calls a turn (see the costs below). So 3 free a day cost at most $0.21 per account per day.
- **What a person sees when the day's cap is used up** (before they start a match; one already started always finishes):
  > Today's free practice matches with the site's AI are used up, across the whole site. They come back at midnight UTC (in 5 h 12 min). You can still play now with credits ($0.10 a match), or for free through your own AI.
- **When their own 3 are used:**
  > You've played your 3 free practice matches with the site's AI today. More with credits ($0.10 a match), or for free through your own AI. Your free ones come back at midnight UTC.

## Official matches (design only)

### Same AI on both sides
- Official matches are played with the **in-platform AI**: a chat beside the board on the live page, with the same tools as the connector.
- Both sides use the same model tier and settings, so the record knows the model.
- One model per season.
- Outside AIs over MCP can't play official matches.

### Who can enter
Sign in with Farcaster, Lens or Bluesky, and pass that network's reputation bar. **Farcaster first**: its sign-in and its score lookup already exist. Lens and Bluesky need their sign-in built.

| Network | Sign-in | Proposed bar |
|---|---|---|
| **Farcaster** | exists | A Neynar user score of at least 0.7 (the bar images already use), plus the account at least 90 days old and at least 50 followers |
| **Lens** | to build (Lens's own sign-in for apps) | Lens publishes an official ML-based "Account Score" through its API ([Lens docs: fetch accounts](https://lens.xyz/docs/protocol/accounts/fetch)); its range isn't documented, so set a threshold after sampling real accounts. Plus the account at least 90 days old, at least 50 followers and at least 20 posts |
| **Bluesky** | to build (atproto OAuth) | No score exists. The account at least 90 days old, at least 50 followers, at least 20 posts, and no spam or impersonation label from Bluesky's moderation service |

- **Wallet-only accounts:** practice only.
- **When it's checked:** at entry; the result is kept for a day, as the image score is.

### One person, one official record
- **Linked accounts share one record.** A person can link their Farcaster, Lens and Bluesky accounts (and wallets) by signing in with each from the same session; the site already links wallets to Farcaster. All linked accounts share one official record, one rating and one daily free match.
- **What we can't do:** prove that two unlinked accounts on different networks aren't the same person. Nothing on the site sees across networks unless a person links them.
- **What we can do:**
  - each network's bar, which makes fresh accounts useless;
  - a fee after the first free match a day, so a second identity costs money to play;
  - repeat dampening and the weekly pair cap in the rating, so two of your own identities playing each other gain little;
  - flag pairs that share a wallet or payment address, or have lopsided results, for review by an admin.
- **What we say:** "One person, one record: link your accounts and they share it. We can't see accounts you don't link; if we find two that are one person, we merge their records or void the results."

### Free and paid
- **1 official match free a day** per person (linked accounts count as one). More cost credits.
- **Official play always uses the in-site AI** (Claude Sonnet 5.5 recommended): one AI side per person.
- **Proposed price:** **$1.50** of credits for each extra official match. It covers the worst case of $1.21 an AI side (trimmed chat, capped sandbox).
- **Free official matches** have their own daily site-wide cap, set by the owner: **$10 a day** to start (owner, 2026-11-03; the owner raises it). That's about 8 free official matches at the worst case, about 12 at a typical one. When it's reached, free official matches pause until the next day, and paid ones go on.
- **What a person sees when the day's cap is used up** (before starting; a match already started always finishes):
  > Today's free official matches are used up, across the whole site. Yours isn't lost: it's still there tomorrow, from midnight UTC (in 5 h 12 min). You can play an official match now with credits ($1.50).
- **When their own free one is used:**
  > You've played today's free official match. Another costs $1.50 in credits; tomorrow's free one comes at midnight UTC.

### The $1.50 margin after payment costs
**How credits are bought today:** USDC or ETH on Base, sent from the person's own wallet. The suggested packs are **$1, $5 and $20**, and any amount of at least $0.50 is credited (`WALLET.packsUsd`, `minUsd`). There is no card processor.
- **USDC:** the payer pays Base's gas (a cent or less), and we receive the full amount. Payment cost to us: about 0.
- **ETH:** the same, plus about 0.3% when we convert it to dollars.

| How the credits were bought | Payment cost per $1.50 match | Margin, typical match ($0.79 of AI) | Margin, worst case ($1.21) |
|---|---|---|---|
| USDC, any pack | about $0.00 | **$0.71** | **$0.29** |
| ETH, any pack | about $0.005 | $0.70 | $0.28 |
| *If we ever add cards (2.9% + $0.30 per purchase):* | | | |
| $20 pack | $0.07 | $0.64 | $0.22 |
| $5 pack | $0.13 | $0.58 | $0.16 |
| $1 pack | $0.49 (33% of each dollar) | $0.22 | **−$0.20, a loss** |

- So with today's crypto credits, $1.50 keeps at least $0.29 a match even at the worst case.
- If cards are ever added, the smallest card pack should be $5.
- **Paid practice** with Claude Haiku 5.5 at $0.10 keeps $0.03 at the worst case on crypto credits, and nothing on a card. So paid practice is for crypto credits only, or its price would have to rise.

### Official computer matches
- **What it is:** your in-site AI against the site computer.
- **Confirmed: the computer plays like a real player,** from its own fogged view.
  - It plans from `engine.fog` of its side, plus where it last saw your towers (`solo.ts computerPlan`; the search builds its belief from that view, `search.ts belief`). It never reads the real board.
  - Its moves follow from the board and a random value committed before the match, so anyone can recompute them from the record.
  - Correction to v2: Play's old computer levels (`botPlan`: Practice and the old rungs) aren't used here either. They're handed the whole board, but plan only from what their towers light (see "Play's computer and the fog", below).
- **Ruleset and level:** you choose the ruleset (the official ones of the season), and a level from 1 to 3.
  - **You move up** by winning 3 of your last 5 official matches at a level, which unlocks the next.
  - You can always play a lower level.
- **A public leaderboard per ruleset shows every official result,** as a win rate per level: wins over matches, at each level.
  - **Every official match counts.** A loss is never hidden, so paying for retries adds losses as well as wins and can't buy rank.
- **Placement:** a person is placed at the highest level where the **Wilson lower bound** of their win rate is at least 50%. The bound is one-sided, at a stated confidence.

  | Matches at the level | Wins needed at 90% (z = 1.645) | Wins needed at 95% (z = 1.96) |
  |---|---|---|
  | 5 | 5 | 5 |
  | 10 | 8 | 9 |
  | 15 | 11 | 12 |
  | 20 | 14 | 15 |
  | 30 | 20 | 21 |

  (At 95%, 4 of 5 gives a lower bound of 0.38, short of the bar. At 90% it's 0.44, still short.)
- **Proposed: 90%.** At 95% a level needs a near-perfect record early on (9 of 10), so most people would sit a level below where they win. At 90% that's 8 of 10, still well above chance: a person who really wins half their matches there would reach it about 5% of the time over 10 matches. It's a ranking, not a proof, and losses always count. If the owner prefers 95%, the table above is the bar.
- **Ranked within a level** by that same lower bound, so the top isn't a big tie: everyone placed at level 3 is ordered by their level-3 bound, highest first, then level 2, and so on. The board shows each person's wins and matches at every level, not just the one they're placed at.
- **Moving up** (separate from placement): winning 3 of your last 5 at a level unlocks the next. Unlocking only lets you play it; your place comes from the bound.

### Play's computer and the fog (owner's question, 2026-11-03)
**What Play's pages say.** The rules page, §8 "Computer players": "They play by every rule above. They see only what their own towers light, get the same 8 points, build towers, and fly diagonally when the rule allows it." The same page's table of changes from Design says the old Practice bot "sees through fog", changed to "Same sight, points and pieces as you (§8)".

**What the code does:**
- **Play's ruleset 3 ladder** (the search computer) plans from the fog view only (`play-game/controller.ts`: `searchPlan({ view: e.fog(w, s, 'A') … })`).
- **The older computer** (`engine.botPlan`, used by rulesets 1 and 2, the snap, and Practice) is *passed the whole board*, but builds its own belief from what it may know:
  - its own towers;
  - your towers where it last saw them;
  - squares and gliders only on squares its towers light.

  Its one direct read of the real board is whether a placement square is empty, and placement squares are always within its sight (reach never exceeds sight).
- **Checked by a test:** `test:minpentai-players` passes "the five rungs (and practice's level 0) plan the same on the view as on the whole board", over positions from Play's matches, from both seats.

**So §8 is true today:** no Play computer uses anything its towers don't light.

**Proposed fix, as hardening:** pass `botPlan` the fog view instead of the whole board, so no future change could let it read hidden pieces by accident. The test above already shows the moves stay identical, so saved Play matches and the snap replay unchanged. The wording stays.

### Official matches between people
- **Each person has** a win/loss record tied to their social login (linked accounts share it), and a **Glicko-2 rating per season.**
- **Repeat wins count less:** the nth rated match between the same two people in a season counts 1/n, and at most 3 rated matches a week between the same pair.
- **Ratings are provisional until** 10 matches against at least 5 different opponents. Provisional ratings aren't shown on the board.
- **Resigning before turn 3** gives the resigner a loss, but the winner gains nothing.
- So **the top of the board is real people who beat many different real people.**

### Weekly rulesets for official matches between people
- **The ruleset may change week to week,** and the page says so up front.
- **Each week's ruleset is drawn at random from tested rulesets only:** ones that passed the self-play bar (contact, spending and destroyed towers) and that the owner has played.
- **Committed before the week starts:** a week ahead we publish `sha256(week, ruleset id, a secret salt)`. When the week opens we reveal the ruleset and the salt, so anyone can check we didn't change it.
- **Optional, to prove the draw itself was fair:** draw it from a public random beacon, such as drand round R mod the number of tested rulesets. R is chosen before that round exists, and the list and R are published with the commitment.
- Official computer matches keep the ruleset you choose.

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

**Per AI side** (practice with the in-site AI and official computer matches have one AI side; official matches between people have two, one paid by each person). The chat is trimmed each turn, with at most 6 sandbox calls a turn:

| Case | Claude Haiku 5.5 | Claude Sonnet 5.5 | Claude Opus 5.5 |
|---|---|---|---|
| Light (2 sandbox calls a turn) | $0.04 | $0.70 | $1.41 |
| Playtest-like, capped | $0.04 | $0.79 | $1.58 |
| Every turn at the cap of 6 | $0.07 | $1.21 | $2.42 |

**What it says:**
1. **The in-platform AI must trim its chat each turn.** It keeps the current view and that turn's sandbox answers, plus a short summary of each past turn. Kept whole, a match's prompt passes 100k by mid-match, Claude Haiku 5.5's calls pay 5×, and every model costs 1.5–2.5× more.
2. **A cap on sandbox calls per turn** (6 proposed) bounds the worst case. The playtest's turn 4 had 17.
3. Output (thinking included) is most of the cost on Claude Sonnet 5.5 and Claude Opus 5.5, so the effort setting matters as much as the model.

**Recommendation:**
- **Season 1:** Claude Sonnet 5.5 at low effort; the chat trimmed each turn; at most 6 sandbox calls a turn.
- **Price: $1.50 per player per official match** past the free one a day. It covers one AI side's worst case ($1.21) with about 1.2× headroom, and the playtest-like case ($0.79) with about 1.9×.
- **Free practice with the in-site AI:** Claude Haiku 5.5, 3 a day per account, under a $2 daily site-wide cap to start. Paid practice: $0.10 a match (Claude Haiku 5.5) or $1.50 (Claude Sonnet 5.5).
- **Free official matches:** under a $10 daily site-wide cap to start. The owner sets both caps.
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

## The 3D replay (build once #100 merges)

**Why:** so taking a turn feels exciting. A 3D version of each turn's replay sits beside the 2D one, synced to the same play, pause and step controls. The dark is a cloud over the board.

**Fog: built only from the 2D replay's frames.**
- The 3D view receives exactly the frames the 2D replay gets (`turnFrames`): each frame's board in that side's fog view, plus the squares it sees. Nothing else.
- The page never receives a hidden piece.
- The cloud is drawn over the squares out of sight. It covers nothing, because nothing hidden was sent.
- **Test:** the 3D component's props equal the 2D component's, the same object, and no other match data reaches it.

**Layout and fallbacks.**
- Wide screens: 2D and 3D side by side.
- **Phones: 3D by default where it holds the frame target, 2D otherwise** (owner, 2026-11-03: most play is on phones, and the 3D is the point).
  - On a phone's first replay, the page measures frame times over the first two seconds of 3D. If they hold the target (a median of 50 frames a second or better), 3D stays. If not, it switches to 2D and says: "Switched to 2D to keep it smooth. Tap 3D to try again."
  - A 2D/3D toggle is always there.
  - **The person's choice is remembered** on that device (localStorage). A choice they made always wins over the automatic one.
- **2D only** when WebGL is missing or the person has asked for reduced motion (`prefers-reduced-motion`), and on any error in the 3D view.
- **Loaded only when a replay opens:** the 3D code is a separate chunk (`next/dynamic`), fetched when the replay is on screen.

**Look: this edition's own abstract pieces.** No outside styles named.

| Piece | Shape |
|---|---|
| Board | low slate tiles |
| Rocks | faceted grey stones |
| Towers | hexagonal columns with a glowing ring in the side's colour |
| Squares | low blocks that crack as they lose hits |
| Gliders | small darts that glide between squares over each step |
| Symbol gliders | darts carrying a small orb |
| Mirrors | thin angled slabs |
| Factories | squat cubes with a mouth facing where they fire |
| Moving walls | three linked bars |

- **Hits:** a short burst of light where something breaks, shown only where the frame shows it.
- **The cloud:** soft, slowly drifting fog columns over unseen squares. It thins where a square comes into sight, and closes where one leaves.
- **Camera:** a fixed three-quarter view from your side, with a slow drift; no free camera on phones.

**Smooth on a mid-range phone.**
- Instanced meshes: one draw call per piece kind, at most 24 × 14 tiles.
- The device pixel ratio capped at 1.5, no real-time shadows, and the cloud a single instanced billboard layer with a noise texture.
- Animation interpolates between the engine's frames, so pieces move smoothly without inventing positions.
- **Target:** 60 frames a second on a mid-range phone, checked with Chrome's 4× CPU throttle on a phone-sized screen. The recording before the merge shows it.
- three.js is already a dependency, so nothing new is added.

**After the match ends:** the whole board in 3D for any turn, with no cloud, from the same whole-board frames as the 2D replay.

**Later (design only): a short clip to share.**
- After the end only, rendered from the whole-board frames to a canvas and recorded (`MediaRecorder`, a few seconds of webm/mp4).
- The person chooses the turn and shares the file.
- Never during a match, so a clip can't leak a side's view.

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

**Practice with the in-site AI and official matches,** when built, would need these further sections. They aren't drafted yet; these are the points each must cover:
- **Terms:**
  - credits and what they pay for (the AI, nothing else);
  - free daily matches and that they pause when the site's daily cap is reached;
  - no prizes;
  - the leaderboards: per ruleset for computer matches, and the PvP rating per season;
  - weekly rulesets, committed by hash before the week;
  - one person, one record: linked accounts share it, and we may merge records or void results;
  - review of flagged matches;
  - what an official result means, and doesn't.
- **Privacy:**
  - Lens and Bluesky sign-in;
  - the account checks: Neynar for Farcaster, Lens's account score, and Bluesky's profile and labels;
  - the in-site AI's model provider (Anthropic), which receives the board and your chat with the AI;
  - what of the chat we keep;
  - public leaderboards showing your social name;
  - linked accounts;
  - **flagging accounts that share a wallet or payment address** (or have lopsided results against each other) for review by an admin, and what a review can lead to: merged records or voided results.

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
