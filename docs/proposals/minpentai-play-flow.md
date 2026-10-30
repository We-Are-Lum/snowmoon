# Minpentai: the play flow (sign in, find a game, share, contests)

> DRAFT design, 2026-10-30, for the owner's read. Written by the coding agent (Anthropic's Claude, a closed model). Nothing here is built. Rules invented for this edition · not affiliated with the author. It builds on `docs/proposals/minpentai-agent-play.md` (agent play, the site computer's fallback, presets) and follows the owner's order: one-engine, then the stronger computer, then agent play. **[Unverified]** marks outside facts I didn't confirm against current documentation.

## 0. The flow in one picture

1. **Sign in** with Farcaster, a wallet or Bluesky (or play signed out). Accounts can be linked; any one gives every feature.
2. **Choose how to play:** by hand, by hand with a standing-order preset the site computer follows when you're away, or through your own AI via the Snowmoon connector. The AI is optional.
3. **Find a game:** the computer (practice and ladder), a person now (lobby), a person over days (daily turns), or a person in a window you both set (scheduled play).
4. **After the game:** play it again, choose a new game, share it (Farcaster snap, X and Bluesky link cards), or challenge someone to the same board.
5. **Contests:** a weekly same-board challenge first; later a scheduled agent-play tournament.

## 1. What exists on `main` today

| Piece | Today | Source |
|---|---|---|
| Sign in with Farcaster | Quick Auth in Farcaster clients; SIWF through the relay on the web; one-hour token, no cookie | `src/lib/auth.ts` `getFid`, `src/lib/client-auth.ts`, `docs/proposals/web-sign-in.md` |
| Sign in with a wallet | A wallet session; the person is a negative number, never a FID | `src/lib/wallet/session.ts`, `getPerson` |
| Linking | A wallet linked to a FID signs in as that FID everywhere `getPerson` is used (`studio.wallet_links`, 0026) | `src/lib/wallet/links.ts` |
| **Minpentai and accounts** | **Farcaster only.** The ladder's progress, the lobby, challenges, invites and one-on-one all key on `getFid`; a wallet person can't climb the ladder or play a person ("SIGN IN WITH FARCASTER") | `play.tsx`, `play-server/store.ts`, `ladder.ts` |
| Practice | Anyone, signed out too | `play-game/controller.ts` |
| Lobby | "Ready" for 3 minutes, a list of ready players, challenges (20 s), invites (24 h, 5 open), blocks | `play-server/store.ts` |
| One-on-one | 90 s setup, 45 s turns, pause and gone rules, rematch | `play-server/match.ts` |
| End of a match | Practice: PLAY AGAIN / WATCH IT AGAIN / DONE. Ladder: next rung / try again / watch / the ladder | `controller.ts` line ~408 |
| Same-board challenges | **Made only in the snap** (`challengeLink`, signed); browser Play can open one but not make one | `snap/challenge.ts`, `snap/pages.ts` |
| Sharing | The snap in Farcaster; the share card (og:image, twitter:card) for every other link; a ladder win can be shared | `share-meta.ts`, `share-result.tsx` |
| The connector | MCP for three allowlisted people; no Minpentai tools yet | `src/app/mcp/route.ts` |

## 2. Sign in: Farcaster, wallet, Bluesky; linked; full parity

**Goal (owner):** anyone signed in by any of the three gets every feature, and a person with two or three can link them into one.

### 2.1 One person, several sign-ins

- Today a "person" is a FID (positive) or a wallet account (negative), and Minpentai only knows FIDs. Parity needs **one person id for everything**, with sign-ins attached to it:
  - a new table `studio.persons` (an id per person) and `studio.person_logins` (kind `farcaster` | `wallet` | `bluesky`, the login's id: FID, address, DID; linked_at, unlinked_at, how);
  - `getPerson` returns the person id for any sign-in; existing FID and wallet rows map to persons once, by a migration, without rewriting history (the same approach `credit.ts` took for wallet links);
  - every Minpentai table keyed by `fid` (`mp_lobby`, `mp_challenges`, `mp_matches`, `mp_ladder`, `mp_blocks`, `mp_snap_resume`) moves to the person id, with the FID kept where Farcaster needs it (the snap's signed taps are by FID).
- **Linking:** signed in with one, sign in with another in the same session and confirm ("These are both me"), as wallet↔Farcaster linking works today. Unlink on the You page. At most one active link per login.
- **Display name:** the person picks which login names them (`@nate` on Farcaster, `nate.bsky.social`, a Basename or a short address).
- **What a name means:** the site never claims two logins are the same human beyond the person's own link.

### 2.2 Bluesky (new)

- **How:** AT Protocol OAuth [Unverified: current spec]. The site publishes a client metadata document at a URL (that URL is the client id); sign-in uses PAR, PKCE and DPoP-bound tokens; the person's handle resolves to a DID and a PDS, and the token proves control of the DID. Server-side only, like SIWF today; the page makes no third-party request beyond the redirect (principle 6).
- **What's kept:** the DID and the handle at sign-in; no posts, follows or tokens beyond the session. Tokens expire like ours (no long refresh by default).
- **Legal:** Privacy must name Bluesky (the PDS host the person uses, and bsky.social's entryway) before it ships.
- **Size: M** (OAuth with DPoP, a session kind, the sign-in button, tests).

### 2.3 Parity

- **Size of moving Minpentai off FID: M**, mostly mechanical (six tables, their routes and tests), plus the persons migration, which touches the rest of the site (images, Remix, agents) and is **L** overall. It can land in two steps: persons and logins first (site-wide), then Minpentai's tables.
- **The connector** today authenticates a person by FID or wallet (`AGENTS.people`); it moves to person ids in the same step, so a Bluesky sign-in can connect an AI too.
- **Farcaster-only things stay Farcaster-only by nature:** the snap (it is a Farcaster cast) and Farcaster notifications. A Bluesky-only person plays everything else in the browser.

## 3. Your own AI is optional

Three ways to play any game, chosen per game:

| Way | What the person does | Who places pieces |
|---|---|---|
| **By hand** | Places pieces each turn | The person |
| **By hand, with a preset** | Places pieces when present; picks `defend`, `attack`, `expand` or `balanced` for turns they miss | The person, else the site computer under the preset |
| **With your AI** | Talks to their AI (Claude, ChatGPT, any MCP client) through the Snowmoon connector | The AI, else the site computer under the preset |

- The preset is the same as agent play's (`minpentai-agent-play.md` §9), so the site computer is the fallback for everyone, AI or not. It needs the stronger computer (decision 2), and until then turns a person misses simply pass, as today's deadlines do.
- Every match record says, per turn, who placed: the person, their AI, or the site computer under which preset.
- Labels on the live view and the record: "by hand", "by hand · site computer on 2 turns (defend)", "@x's AI · Claude (Anthropic app) · says it runs … (self-reported)".

## 4. Find a game with someone

### 4.1 Lobbies (now games)

- **Today's lobby** stays for live play: "ready" for 3 minutes, challenge someone ready, 45-second turns.
- **New: open games.** A person posts a game with its settings (pace, ruleset, "anyone" or "by hand only" or "AI welcome"), and it waits up to a day. Others see it in the lobby list and join. The same list is what an AI sees through `minpentai_list_games`.
- **Size: S–M** on today's `store.ts` (one table for open games; the lobby view lists them).

### 4.2 Daily turns (playing while away)

- A game whose turns last up to 24 hours (agent play's "Daily" pace). Each side places once a day, any time; the turn reveals when both have placed or the day ends. A 96-step game is about 9 days.
- Needs the deadline job (a cron every minute that advances any match past its deadline; today deadlines resolve only when someone polls) and, for missed turns, the site computer fallback.
- **Notifications** (opt-in): "your game has an opponent", "your turn" through Farcaster mini app notifications; for wallet and Bluesky people, the in-site "Your games" list (Bluesky has no notification channel for apps [Unverified]; email is out of scope). An AI can check on a schedule in the person's own app.
- **Size: M** (pace, cron, "Your games" list, notifications).

### 4.3 Scheduled play windows

- A person sets when they're free ("weekdays 19:00–21:00 my time"). The site suggests opponents whose windows overlap and, when both accept, books a match at the next overlap with a reminder. A booked match uses the Sitting pace (5-minute turns), so both can be present.
- Missed by one side: after 10 minutes the other can claim it or rebook; it never counts as a result.
- **Size: M** (windows per person with time zones, overlap matching, booking and reminders).

### 4.4 Matchmaking fairness

- Open games show each side's way of playing (by hand, with preset, with AI) before joining; a person can filter for "by hand only".
- The AI-free ladder stays separate: agent games and AI-welcome games never count toward it (agent-play decision 6).

## 5. After a game: Choose new game, and same-board challenges from browser Play

Both change Play's controller (`play-game/controller.ts`), which one-engine rewrites, so **both are planned on top of one-engine, not `main`**, after it merges. One-engine already reads a match's version and settings from one place, which is what both need.

### 5.1 Play it again / Choose new game / Done

- **Play it again:** the same level, the same extra rule (picked or drawn), a new seed. **Choose new game:** opens the picker: computer level (Practice, rungs 1–5 as unlocked) and extra rule (drawn, or one of the four; later, a ruleset such as the book version). **Done:** home.
- Works signed out (practice only; the ladder needs a sign-in) and signed in by wallet or Bluesky once parity lands; until then a wallet person sees practice levels only, as today.
- On the ladder: "Next rung" replaces Play it again after a win; Choose new game is the same picker.
- **Size: S** on one-engine (the picker already exists in the snap's first page; Play gets the same choices).

### 5.2 Same-board challenges from browser Play

- At a match's end, **Challenge someone to this board** makes the same signed link the snap makes (`/minpentai/c/<seed.level.rule.version.result>.<signature>`), with the result in it, and offers Share (Farcaster, X, Bluesky, copy link).
- **The signature must mean something.** In the snap the server played every turn, so signing the result is honest. In browser Play the match runs in the browser. So the browser sends the **moves** (seed + each turn's placements, `encMatch`), and the server **replays them with the engine** and signs the result it computes. A made-up result can't be signed. Replay costs milliseconds.
- Opening a challenge in the browser or the snap starts the same board, as today.
- **Size: S–M** on one-engine (a sign endpoint that replays; the share sheet; tests that a tampered move list gets a different result or none).

## 6. Sharing

| Where | How | Exists? |
|---|---|---|
| **Farcaster** | The snap: a cast with `snowmoon.party/minpentai/play`, a challenge link or `/snap/minpentai` plays in the feed. Share opens Farcaster's composer with the link | Yes (snap); the composer intent from browser Play is new (S) |
| **X** | A link card (og:image 1200×630, `summary_large_image`); Share opens X's post intent with text and link [Unverified: current intent URL] | Card yes; intent from Play new (S) |
| **Bluesky** | A link card from the same Open Graph tags (Bluesky's card fetcher reads og:title, og:description, og:image [Unverified]); Share opens Bluesky's compose intent with the text and link | Card yes (the 2026-10-30 link rule sends bots the page); intent new (S) |
| **Copy link** | Any of the above | New in Play (S) |

- One share sheet for match results, challenges and ladder wins. The text names the result and the rule ("Won in 49 steps · gliders cost 3 · Rules invented for this edition"), never invents book claims (principle 8h).
- Nothing is sent until the person taps Share (as the ladder share today).

## 7. Contests

Two formats, in order. Both need the official rules a prize requires (7.3) and **legal review before any prize is offered**.

### 7.1 Weekly same-board challenge (today's game)

**Format.** Every Monday at 00:00 UTC a board goes up: one seed, one level of the computer, one extra rule, today's game (solo-v1). Anyone plays it as often as they like until Sunday 23:59 UTC. The leaderboard ranks each person's **best verified result**: a win first, then fewest steps, then most towers left, then earliest submission. A board's results are public with the moves, so anyone can replay them.

| | |
|---|---|
| **Exists** | Signed challenge links (one seed, level, rule, result); the engine; the snap's server-played matches; Play's challenge opener |
| **New** | The weekly board (a seed chosen in advance, its hash published before the week starts, the seed revealed at start, so nobody, the site included, picks a board after seeing results); verified submission (the server replays the moves, 5.2); the leaderboard page; the share card per board; a results archive |
| **Size** | **M** (on one-engine and 5.2) |

**One person, many accounts.** With unlimited attempts on one account, more accounts don't help anyone's best score: a person could play the same board a thousand times on one account. So for the **leaderboard** multiple accounts barely matter. They matter for **prizes** (one prize per person) and for "first to…" or participation rewards, which this format should avoid. Measures:
- one entry per person: linked logins count as one person (§2.1);
- prizes only to people who pass winner verification at award time (identity, age, residence; see 7.3), not at entry;
- a Farcaster account below a quality score (for example Neynar's) can play and appear, but isn't prize-eligible [threshold for the owner];
- the moves are public, so copied games (two accounts submitting the same move list) are visible; the earliest submission keeps the place.

**"No AI" can't be enforced here.** The board is open, and anyone can run the engine (it's open source) or an AI on their own machine to search for the best line. So the weekly challenge is **one open category**: "any help allowed", said plainly. That is also what makes it fair.

### 7.2 Scheduled agent-play tournament

**Format.** A tournament on a set date, after agent play ships (after one-engine and the stronger computer). Sign-ups for a week; then a Swiss system (5 rounds, Sitting pace, one round per evening in a stated window), or a round-robin for small fields; top 4 to a final. Two categories:
- **"With AI":** each side plays through the connector or by hand with a preset; the model is self-reported and labelled.
- **"No agent":** played by hand on the live page; no connector agent may join that side, and the site computer fallback is off (a missed turn passes).

| | |
|---|---|
| **Exists (by then)** | Agent play's referee, fog, clocks, commitments, records, model labels; the lobby; Sitting pace |
| **New** | Tournament registration, pairings (Swiss), the schedule and its reminders, standings, tie-breaks, a results page with every game's replay, category rules |
| **Size** | **L** (after agent play) |

**One person, many accounts.** It matters more here: two accounts could meet in the bracket and throw a game, or one person could enter both categories.
- registration with a linked person (one entry per person per category; a person enters one category per tournament);
- prize eligibility as in 7.1, plus a minimum account age and, for Farcaster, a quality score;
- pairings avoid pairing two accounts that share a wallet or a linked login; results between suspected pairs are reviewed;
- every game's moves are public; a thrown game is visible and can be voided under the rules.

**"No agent" is an honour category.** The site can stop connector agents from playing that side, but it can't see a second screen or a local program. The rules should say so ("no AI or computer assistance, on your honour") and say what happens on a credible report (review; disqualification).

### 7.3 What official rules a prize needs (for legal review)

Everything below is a checklist for a lawyer, not legal advice. **Flagged for legal review: all of section 7 before any prize, and anything that charges entry or pays in crypto.**

- **Sponsor:** who runs it and pays the prize (name, address); that Farcaster, Bluesky, X and the book's author are not sponsors and not affiliated.
- **No purchase necessary,** and no entry fee. An entry fee plus a prize can make it a regulated contest or gambling in some places; this design charges nothing.
- **Skill, not chance:** the winner is decided by play, by stated criteria and tie-breaks. Chance in the board (the seed) is the same for everyone, which should help; a lawyer should confirm it's a contest of skill where it's offered.
- **Eligibility:** minimum age (18, or the age of majority where the entrant lives); countries and states where it's void or restricted; excluded people (the sponsor, its family, anyone who built the board); sanctioned countries and persons.
- **Entry period** with a time zone; how to enter; one entry per person; what counts as a person (linked logins).
- **How winners are decided:** ranking, tie-breaks, what happens to void or disputed games, the right to disqualify for cheating or multiple accounts, and who decides.
- **Prizes:** what, approximate retail value, how and when paid, no substitution or transfer; **taxes** are the winner's (in the US, a 1099 at $600 or more [Unverified: threshold]); crypto prizes add valuation and tax questions.
- **Winner notification and verification:** how winners are contacted, how long they have to answer, the documents asked (identity, age, residence, a tax form), and what happens if they don't.
- **Publicity:** whether the winner's name or handle is published (the leaderboard already is).
- **Privacy:** what's collected for verification, kept how long, by whom; Privacy and Terms must say it before the contest starts (the site's rule: legal texts describe today).
- **Liability, governing law, disputes, changes or cancellation** (a bug in the board, an outage).
- **Registration or bonding** some places require for prize promotions over a value [Unverified: which and when they apply to skill contests].
- **Platform rules:** Farcaster, X and Bluesky each have promotion rules for contests run on them [Unverified]; the contest runs on snowmoon.party and is only shared there.

## 8. Sizes and order

| # | Piece | Size | Needs | Why here |
|---|---|---|---|---|
| 1 | One-engine merges (with the reach ≤ sight check) | — | owner's OK | everything below builds on it |
| 2 | Choose new game (5.1) | S | 1 | cheap, asked for |
| 3 | Same-board challenges from browser Play, server-replayed (5.2) and the share sheet with Farcaster, X, Bluesky and copy (§6) | S–M | 1 | needed by the weekly challenge |
| 4 | **Weekly same-board challenge** (7.1), unranked and prize-free first | M | 3 | a contest on today's game, soon; runs a few weeks before any prize |
| 5 | Persons and logins (site-wide), then Minpentai off FID (§2.1, §2.3) | L | — | parity; can run in parallel with 2–4 |
| 6 | Bluesky sign-in (§2.2) | M | 5, Privacy reread | a third way in |
| 7 | Open games and daily turns with the deadline cron and notifications (§4.1, §4.2) | M | 1 | play while away |
| 8 | Stronger computer, then presets and the fallback for everyone (§3) | M (+ its own build) | 1 | owner's order |
| 9 | Agent play (its own design) | L | 8 | owner's order |
| 10 | Scheduled play windows (§4.3) | M | 7 | |
| 11 | Agent-play tournament (7.2) | L | 9, legal review | |
| — | Any prize (7.1 or 7.2) | — | legal review, official rules, Terms and Privacy | flagged |

## 9. Open questions for the owner

1. Prizes at all, and if so which kind (none, recognition only, cash, crypto)? Recognition-only removes most of 7.3.
2. The weekly board's level: one fixed level (say rung 3), or a level per week?
3. The Farcaster quality-score threshold for prize eligibility, and whether wallet-only and Bluesky-only people can win prizes (they're harder to tell apart).
4. Persons and logins is a site-wide change: do it now for Minpentai's sake, or after the next-version plan?
5. Bluesky: sign-in only, or also posting a result for the person (needs a write scope)? This design does sign-in and an intent link only.

## Principles

| Principle | Touched | Status |
|---|---|---|
| 1 Recipes | Agent games label models | Pass (as agent play) |
| 2 AI declared | Every turn says who placed | Pass |
| 4 No output published without a person's action | Share only on a tap; AI moves are game moves, not publications | Pass |
| 5 Nothing marked canon or featured | The weekly board is "this week's board", not official; leaderboards rank by stated rules | Pass; wording to check |
| 6 No third-party page requests; readers' data | Bluesky sign-in is server-side; contest verification data | **Concern until legal texts cover it** |
| 7 Payments never enter scoring | Prizes never depend on paying; no entry fee | Pass |
| 8 Minpentai matches the source | Rules stay "invented for this edition"; the book version is a separate ruleset | Pass |
