# Proposal: Minpentai against the computer and against a friend

> **Status:** proposal only. Nothing is built. Drafted by the coding agent (Claude, a closed
> model) on 2026-10-09 on branch `site-multiplayer-proposal`. No code, no migration file: the
> table sketch in section 6 lives only in this document. Every on-screen wording below is
> model-drafted and would ship tagged DRAFT WORDING.
>
> **Owner's task (verbatim):** "Proposal only, build nothing: docs/proposals/minpentai-multiplayer.md.
> Cover computer opponents at rising difficulty for signed-in players, and live one-on-one.
> Include: the server running the match so fog can't be bypassed, syncing turns without a new
> outside service, readiness and matching, what is stored, abuse, cost, and the ten loose ends in
> Design's rules, which Design is settling. List my decisions."
>
> **Read for this:** `docs/design/minpentai-learn-port.md` (§5, the loose ends),
> `docs/design/minpentai-study.md` (§4.1, §4.6, §12.3, §13), `src/lib/minpentai/learn-game/*`,
> `src/lib/minpentai/ai.ts` (the sandbox's fair computer player), `docs/principles.md`,
> `src/lib/auth.ts`, `src/lib/client-auth.ts`, `src/lib/db.ts`, `src/lib/images/limits.ts`,
> `src/app/api/moderate/route.ts`, `supabase/migrations/0006`–`0008`, `docs/proposals/chat.md`,
> `docs/proposals/add-an-image.md`.
>
> **Unverified** marks anything I could not check today (mostly prices and plan limits).

## In one paragraph

A signed-in player opens Play and picks a computer opponent at one of four levels, or invites a
friend by link or by Farcaster ID. The game is the Learn game (Design's pieces rules, labelled
RULES INVENTED FOR THIS EDITION). The server holds the whole match. A player's browser only ever
sends "I put these pieces here" during their turn to act, and only ever receives what that player
can see: their own pieces, the rocks, and what lies near their towers. The computer runs on the
server and, at every level, sees only what its own towers see. Turns sync by the browser asking
the server every second or two whether anything changed (a cheap "no" most of the time), over the
site's own functions and its existing Postgres: no new outside service. Results stay private to
the two players; there is no ranking, no leaderboard and no free-text chat. A live match costs
well under a tenth of a cent. Several of Design's ten loose ends must be settled before live play,
and three of them before the computer levels; section 10 says which.

---

## 0. Conflicts and tensions (read first)

1. **Design is changing the rules this proposal plays.** The ten loose ends (section 10) include
   rules multiplayer cannot guess: what the opponent's tower count shows under fog, whether
   diagonal gliders that cross meet, and whether resigning is part of the game. Building
   multiplayer before Design answers means either waiting or making interim rulings that Design
   may overturn. Proposed: computer levels can start with interim rulings on the blocking items,
   each listed and labelled; live play waits (decision 2). Every match stores a rules version so
   old replays survive a rule change (section 6).
2. **Moderators can hide and nothing else (P5).** In a two-person game there is nothing
   published to hide, and the usual remedy for harassment (keeping a person out of matching) is a
   new moderator power. This proposal avoids needing it: live play is friends-only (invites), any
   player can block another for good, and there is no free-text channel. An open queue would bring
   the question back (decision 9).
3. **Who played whom is "who did what" (P6).** Match records are private, readable only by the
   server; the two players see their own matches; nothing is totalled per person in public.
4. **Fair computer vs Design's bot.** Design's practice bot reads the whole board through the fog
   (loose end 5a). Learn's practice keeps it as Design has it; the computer levels proposed here
   all play fair. Two bots, one labelled as a simple practice partner, is a small inconsistency
   the owner may prefer to remove (decision 5).
5. **The Play tab already has a computer opponent, on a different game.** `match-view.tsx` plays
   the sandbox's engine (the rule recovered from the book's figure) against `ai.ts` in the
   browser. The levels here are on the Learn game's invented rules. Two "play the computer" games
   on one page need clear names (decision 1).
6. **Turn clocks vs accessibility.** A live game needs a clock or a stalling player holds the
   other hostage; WCAG 2.2.1 allows that for real-time competition, but some players need longer.
   Proposed: no clock against the computer; friends choose a clock (45 s, 2 min, or 10 min) when
   inviting (decision 10).
7. **Region latency, unverified.** The database is in `us-west-2` (transaction pooler, port 6543).
   If the site's functions run in Vercel's default `iad1`, every poll crosses the continent
   (about 70 ms each way). Not a blocker for a turn game; worth checking before building.

---

## 1. Which game, and what the computer and the server each do

**The game.** The Learn game as ported: `pieces.ts` (`pStep`, `near`, `COST`, `RULES`), the
practice board in `lessons.ts` (15 × 10 squares, towers at (1, 2), (1, 7) and (13, 2), (13, 7),
six rocks), budget 8, build zone 3, fog 3, a turn to act every 12 steps, 96 steps, one of Design's
four new rules drawn at the start. The practice board is point-symmetric (each rock and tower maps
to its partner under (x, y) → (14 − x, 9 − y)), so neither side starts better placed.

Why not the sandbox's engine: the engine is the book's recovered rule and its matches are slow
and opaque to play (study §12.3: gliders usually survive hitting a tower, nothing breaks); the
Learn game is small, deterministic and what the tutorial teaches. Decision 1.

**The rule code moves to a shared, server-safe module.** `pStep`, `near`, the board and the new
rules are already pure functions with no DOM. The practice match's turn logic (`pCheck`,
`endTurn`, `botTurn`, `place`) sits inside `LearnController`, mixed with the screen; it would be
lifted into a pure `match` module that both `LearnController` and the server call, and the
existing `test:minpentai-learn` comparison against Design's script must still pass unchanged after
the lift (so Learn keeps playing exactly as Design's).

**Server-run, both kinds.** Against the computer and against a friend, the server holds the
match. For the computer this is not strictly needed for honesty (a player cheating against a
private bot cheats only themselves), but it keeps one code path, makes the fog real at every
level, and makes a win something the unlock can trust. The browser-only alternative costs nothing
and is decision 3.

---

## 2. Computer opponents at rising difficulty

### 2.1 What Design's bot does today (`controller.ts` `botTurn`)

- Sees the whole board, through the fog.
- Plays after you: it runs when you press END TURN, on a board that already holds the pieces you
  just placed (so it can react to them).
- Always has 8 points, priced by the match's costs (the same budget as you).
- Defend: for each of its towers, if one of your gliders is in that row, flying at it with
  nothing in between, it puts one square 1–3 squares in front of the tower.
- Attack: up to 24 tries; picks one of your towers at random, aims at its row for the first 5
  tries, then at random rows; fires gliders flying left from x 10–12.
- Fill: spends what is left on squares at random x 10–12, random rows.
- Never builds towers, never fires diagonally even under the diagonal rule, never plans for a
  bounce, uses `Math.random`.

### 2.2 Four levels, all built on it

Every level: sees only what its towers see (plus rocks, plus your towers' start positions, which
both sides are shown at step 0); decides on the board as it stood when the turn to act began,
never after seeing your placements (the same as you); draws its random numbers from the match
seed; has the same 8 points and costs as you.

| Level | Name (draft) | How it differs |
|---|---|---|
| 1 | **Rookie** | Design's bot with half its attack: at most one glider a turn, never defends, fills with squares. Aims at the row where it last saw your tower. |
| 2 | **Practice partner** | Design's bot as it is, made fair: same defend, attack and fill steps, on what it can see and remembers. |
| 3 | **Club player** | Plays the new rule (fires diagonally under the diagonal rule, buys three gliders under the cost rule); defends with two squares when a glider is coming; builds a forward tower when one of its towers has fallen, to see further; before firing, runs each candidate shot through `pStep` on its own view for the next 12 steps and keeps only shots that land or bounce usefully. |
| 4 | **Finalist** | Level 3 plus: forecasts your likely shots on the squares it can see and blocks the most dangerous; plans bounces off rocks and edges; spreads squares where your gliders have come from before. Bounded at 50 ms of compute a turn (section 7). |

Level 2's name and the book: c7-b13–b14 says bots are strong on stock Minpentai and weak on new
rules. Levels 1–2 adapt badly to the new rule by construction; levels 3–4 adapt. The wording would
not claim either is how the book's bots play.

**Fair at every level** (recommended) means the computer's input is a filtered view, built the
same way the server filters a human player's view (section 3.3), the way `ai.ts`'s `knowledge`
already filters for the sandbox's computer player. The alternative ("the top level sees
everything, and says so") is decision 5.

### 2.3 Seeds

Each match draws one 64-bit seed from the server's cryptographic random source when it starts.
The new rule and every random choice the computer makes come from it (`rng(seed ^ turn)`, the
mulberry function already in `ai.ts`). Same seed, rules version and moves → the same match, so a
replay can be rebuilt and a bug report reproduced. The seed is never sent to a browser before the
match ends (it would reveal the computer's future choices).

### 2.4 How levels unlock

Proposed: level 1 is open; beating level n opens level n + 1; that progress is a single private
number per FID (section 6), shown only to that player. No ranks, no scores, no win counts in
public, nothing ordered by skill. Alternatives: all four levels open from the start (no stored
progress at all), or unlock kept on the device only (decision 6). A public leaderboard is not
proposed; it would be the first thing on the site that orders people, and P5's review question
("does any ordering reflect a person's choice rather than a stated rule?") would need the owner's
reading. Payments never unlock anything (P7).

---

## 3. Live one-on-one: the server is the authority

### 3.1 The rule

The server keeps the only full match state. A browser sends **intents** only: during its own
turn to act, the list of pieces it wants to place (kind, square, direction), plus "resign". It
never sends a board. The server checks each intent against the rules and the fog, applies both
players' intents together, runs the match to the next turn to act, and answers each player with
**their view only**. No response, at any time, holds a square the player cannot see.

### 3.2 Turns: both act at once, in secret

Design's practice match is sequential (you place, then the bot places with your pieces in front
of it). Two humans cannot both go second. Proposed: each turn to act, both players place in
secret; when both have committed (or the clock runs out), the server merges the two lists and runs
the match. This is a rule change only Design can make for the Learn game (section 10, question A),
so it is listed there.

### 3.3 What each player is sent (`viewFor(state, player)`)

- their own pieces, all rocks, and any other piece on a square within the sight radius of one of
  their towers (`near(s, x, y, fogR, p)`); at step 0, also the other side's towers (Design's
  opening reveal, "you see them only until this turn ends");
- glider trails cut to squares they can see (a trail running out of the dark gives away where a
  glider came from);
- hits (tower lost, square broken, crash) only on squares they can see, except their own towers
  falling;
- the opponent's tower count only as section 10, loose end 6 settles it (blocking);
- piece ids renumbered per view (the engine's ids rise with every piece placed, so raw ids would
  count the opponent's hidden placements);
- "opponent has committed: yes/no", the clock, the step, the new rule.

Never sent: the seed, the opponent's intents before both have committed, any square outside
sight, the full state (until the match is over, if decision 13 shows the whole board then).

### 3.4 Checking an intent

Refused unless: the match is in its act phase, before the deadline; the sender is in the match
and has not committed this turn; every placement is on the board, within the build zone of one of
the sender's towers, on a square the sender can see, and empty as far as the sender can see; the
total cost is within the budget under this match's costs; directions are allowed by this match's
rule. Two questions here belong to Design (section 10, B and C): a placed tower extending the zone
for the same turn's later placements (Design's `place` does this today), and squares in the zone
but out of sight under the fog-2 rule (a refusal there would leak a hidden piece).

### 3.5 The run between turns

Once both lists are merged, the server runs `pStep` to the next turn to act (12 steps, or 8 under
that rule) or to the end, and stores the result. Each player receives the run as a short list of
per-step views (12 frames of their own view, roughly 10–15 KB uncompressed) and plays it at
Design's 4 steps a second. Pausing pauses only your own playback; the other player is not held.

### 3.6 Clocks

Only the server's clock counts. Each response carries the deadline as "milliseconds left" and the
server's time, so a wrong device clock does nothing. The act clock starts when the run that ends
in it has finished playing (the server knows the run's length: 12 steps at 4 a second is 3 s).

---

## 4. Syncing turns without a new outside service

The site runs on Vercel Functions (Fluid Compute, Node) and one Postgres reached as
`studio_writer` through Supabase's **transaction** pooler (`src/lib/db.ts`, `max: 1`). Every option
below uses only those.

| Option | How | For | Against |
|---|---|---|---|
| **A. Polling with a version (recommended)** | `GET /api/minpentai/match/:id` with `If-None-Match: <version>`. The server reads one integer; unchanged → `304`, changed → the player's view. Every 1.5 s while waiting on the other player, every 10 s during your own turn (to catch a resign), none when the page is hidden. | Stateless: any instance, any deploy, any reconnect. Works through Farcaster's iframe and every proxy. One indexed read a poll. Nothing new to install. | Up to 1.5 s delay before you see the other player's commit, which a turn game absorbs. More requests than a stream. |
| B. Long-poll | Same request, but the function holds it up to ~20 s, checking the version every second, and answers at the first change. | Near-instant; fewer requests. | Same DB reads as A (the function polls inside). Holds memory while open. Needs care with timeouts. |
| C. Server-Sent Events from a function | A `text/event-stream` GET held for up to the function's max duration (300 s on Hobby, 800 s on Pro), checking the version every second and pushing changes; the browser's `EventSource` reconnects. | Real push to the browser; zero-config on Node. Active CPU is billed only while working. | Still polls Postgres inside (instances don't share memory). Streams end at max duration and must resume. Provisioned memory is billed while open (shared across streams under Fluid). |
| D. Postgres LISTEN/NOTIFY | A function `LISTEN`s on a channel; the commit route `NOTIFY`s. | True push from the database. | **Does not work through the transaction pooler** the app uses. Needs a session-mode or direct connection held open per waiting function, against Supabase's connection limits (unverified for this plan). |
| E. WebSockets on Vercel Functions | Vercel Functions now accept WebSocket upgrades (Vercel itself, not an outside service). In Next.js only through `experimental_upgradeWebSocket()` from `@vercel/functions`. | Two-way, low latency. | Experimental in Next.js and a new package. Two players' sockets may sit on different instances, so the turn still passes through Postgres (A or D inside). Connections close at max duration. Vercel's own guidance is to keep shared state in an external store, which here means Postgres again. |

**Recommendation: A.** The game is turn-based with a 45 s or longer act phase and a 3 s run;
a delay of up to 1.5 s is invisible in it. Polling keeps every request short and independent,
which makes reconnects, deploys, idempotency and the "no hidden state on the client" rule simple to
reason about, and it adds no dependency. C is the upgrade path if the wait feels slow: same data
model, same version number, one new route.

**CDN.** Every match response is per player: `Cache-Control: private, no-store`, and the route
reads the bearer token, so Vercel's CDN must never cache it (a cached view would show one
player's fog to the other). A check in `check:principles` would assert the header.

**Deadlines without a timer.** No process waits for a deadline. Any request on a match (either
player's poll) first checks whether the act deadline has passed and, if so, resolves the turn
under a row lock (`select … for update`, then bump `version`). If both players have gone, a
daily Vercel Cron job (the platform's own) closes matches whose deadline passed long ago.

**Idempotency.** Each commit carries a random `commit_id` from the browser; a unique key on
(match, turn, player) and on `commit_id` makes a retried commit return the stored result instead
of applying twice. Resolution happens once, inside the transaction that sees both commits (or the
deadline), and bumps the version.

**Reconnects.** A reload, a lost connection or a new device just polls again and gets the current
view from the server. Nothing in the browser is needed to continue, except an uncommitted draft,
which is kept in `sessionStorage` until committed.

---

## 5. Readiness and matching

**Invites (recommended for live play).**
- *By link*: the inviter gets `snowmoon.party/minpentai/play/<token>` (a random, unguessable
  token). The first signed-in person to open and accept it is the opponent. Inside Farcaster the
  page offers "Share as a cast" through the Farcaster app's own compose action (the host app does
  this; the page makes no request elsewhere). A link cast in public can be taken by anyone who sees
  it, and the wording says so.
- *By FID*: the inviter types a Farcaster ID (or picks a recent opponent); only that FID can
  accept. The invitee sees it next time they open Play signed in. No push notification in slice 1
  (decision 18).
- Invites expire after 24 h; an inviter may have at most 5 open.

**Open queue (not proposed for slice 1).** "Play anyone" pairs the two longest-waiting players.
It invites strangers, so it needs gating against throwaway accounts (the brief's Neynar score is
not available without a new outside service) and a moderation answer (section 0, item 2).
Decision 9.

**The ready check.** When the invite is accepted, both see the other's name (section 8) and a
READY button. The match starts when both press it within 60 s; otherwise it is cancelled with no
result. **The new rule is drawn only at the start**, so no one learns it early (as the book's
players are kept offline so they cannot, c12-b133–b134).

**Timeouts.** A turn not committed by the deadline commits nothing for that turn (the player's
uncommitted draft is not used: it never left their device). Two missed turns in a row lose the
match ("left the match"). The whole match is capped at 20 minutes of wall time; at the cap the
most towers wins, as at step 96.

**Resign.** A RESIGN button, with a confirm, at any time; the other player wins. This is needed
whatever Design rules on loose end 1; Design settles whether resigning is part of the game and its
wording.

**Abandon.** A player who closes the page is not punished until their deadline passes; then the
timeout rule applies. A match where neither has polled for 10 minutes is closed as abandoned with
no winner.

**Against the computer** there is no ready check and no clock: the computer commits instantly,
so each END TURN returns the run and the next turn at once. Leaving and coming back resumes; a
match idle for 24 h is closed as abandoned.

---

## 6. What is stored

### 6.1 Tables (a sketch for a future migration, `0009_minpentai_matches.sql`; not a file)

Applied, like every migration, only by the owner by hand in the SQL editor after a dry run.

```sql
-- Sketch only. Private tables: no public read; studio_writer only, as in 0006/0008.
create table studio.mp_matches (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('computer', 'live')),
  level smallint check (level between 1 and 4),         -- computer matches only
  fid_a bigint not null,                                 -- the inviter, or the player vs the computer
  fid_b bigint,                                          -- null against the computer
  rules_version text not null,                           -- e.g. 'learn-2026-10-09' (section 10)
  rule text check (rule in ('diag', 'cost', 'fog', 'every')),  -- drawn at start
  seed bigint,                                           -- drawn at start; never sent before the end
  clock_s int,                                           -- null = untimed
  status text not null check (status in ('ready_check', 'playing', 'over', 'cancelled', 'abandoned')),
  turn smallint not null default 0,                      -- which turn to act
  version int not null default 0,                        -- bumped on every change; the poll's ETag
  act_deadline timestamptz,
  state jsonb,                                           -- the full current state (hidden from browsers)
  result text check (result in ('a', 'b', 'draw')),
  end_reason text check (end_reason in ('towers', 'time', 'resign', 'timeout', 'abandoned', 'cap')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index mp_matches_fid_a on studio.mp_matches (fid_a, created_at);
create index mp_matches_fid_b on studio.mp_matches (fid_b, created_at);

create table studio.mp_moves (                           -- append-only
  match_id uuid not null references studio.mp_matches on delete cascade,
  turn smallint not null,
  side char(1) not null check (side in ('a', 'b')),      -- 'b' is the computer in computer matches
  commit_id uuid not null unique,
  placements jsonb not null,                              -- [{k, x, y, dx, dy}], at most 8
  at timestamptz not null default now(),
  primary key (match_id, turn, side)
);

create table studio.mp_invites (
  token text primary key,                                -- random, 128 bits
  from_fid bigint not null,
  to_fid bigint,                                         -- null = anyone with the link
  clock_s int,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  match_id uuid references studio.mp_matches on delete set null
);

create table studio.mp_blocks (                          -- a player's own block list
  fid bigint not null,
  blocked_fid bigint not null,
  at timestamptz not null default now(),
  primary key (fid, blocked_fid)
);

create table studio.mp_progress (                        -- the unlock, one small number per player
  fid bigint primary key,
  highest_level_beaten smallint not null default 0,
  updated_at timestamptz not null default now()
);

create table studio.mp_daily (                           -- counts only, no FID (like chat_costs)
  day date not null,
  kind text not null,                                    -- 'computer:1'..'computer:4', 'live'
  matches int not null default 0,
  primary key (day, kind)
);
-- RLS on all six; revoke all from anon, authenticated; studio_writer gets select/insert,
-- plus update on mp_matches, mp_invites, mp_progress, mp_daily, delete on mp_blocks only.
```

`mp_moves` plus seed and rules version are enough to rebuild a match; `state` is kept so the
server need not replay a whole match on every request.

### 6.2 What is private, and who sees replays

- Nothing here has a public read policy (P6b would be extended to list these tables).
- A player sees their own matches (list and replay) and nothing of anyone else's.
- During a match each player sees only their view. **After it ends**, proposed: both players can
  watch the whole board, fog lifted, step by step (decision 13); no one else can.
- No profile page, no win count shown to others, no "recently played" list for anyone but you.

### 6.3 Retention

Proposed: 30 days after a match ends, its moves and state are deleted and the match row reduced
to nothing (deleted), with only the day's counts kept in `mp_daily` (no FID). Invites are deleted
7 days after they expire. `mp_progress` and `mp_blocks` stay until the player asks for erasure
(`docs/removal.md`). Decision 14.

### 6.4 Never stored

Any free text (there is none to store); IP addresses, device or browser details; timings of
polls; each player's draft before commit; the per-player views (rebuilt on request); who reported
whom shown to anyone (reports, if any, follow the 0008 pattern: reporters' FIDs kept for abuse
handling only).

---

## 7. Cost

### 7.1 Assumptions (unverified prices: Vercel's published Fluid Compute rates as I understand them)

- Active CPU about **$0.128 per hour**, provisioned memory about **$0.0106 per GB-hour**,
  invocations **$0.60 per million**, Standard instance 2 GB / 1 vCPU. Hobby includes about 4 CPU-hours,
  360 GB-hours and 1 million invocations a month. Unverified, and which plan the project is on is
  unverified too.
- `pStep` on a 15 × 10 board with ~40 pieces is microseconds; a level-4 computer turn is capped at
  50 ms. Quick Auth verification is local after the key set is cached.
- A computer match: 8 turns to act, about **10 requests** (start, 8 END TURNs, end), ~20 ms CPU
  and ~150 ms wall time each.
- A live match: 8 turns; each player commits 8 times and polls about 12 times a turn while
  waiting, plus ~10 requests for invite, ready and end: about **230 requests** for the pair; a
  `304` poll ~5 ms CPU, a commit/resolve ~20 ms; ~100 ms wall time each.

### 7.2 Per match

| | Requests | Active CPU | Memory (GB-s, upper bound) | Cost |
|---|---|---|---|---|
| Computer | ~10 | ~0.2 s (≤ 0.6 s at level 4) | ~3 | ~$0.00002 |
| Live | ~230 | ~1.5 s | ~46 | ~$0.0003 |

Memory is an upper bound: Fluid Compute serves concurrent requests on one instance, so real
memory time is lower.

### 7.3 Per month (example: 5,000 computer + 1,000 live matches)

About 280,000 requests, 0.8 CPU-hours, ~16 GB-hours: **about $0.45 a month** at paid rates, and
inside Hobby's included amounts. Database: ~1 KB a turn snapshot plus moves, ~15 KB a match →
~90 MB a month before retention, ~90 MB held at any time with 30-day retention. That is the
largest real cost: the studio database is shared with everything else (unverified plan size).
Postgres reads: ~250,000 one-row reads a month, trivial.

### 7.4 Caps (proposed defaults, all in `src/lib/config.ts` as `MINPENTAI_PLAY`, as `IMAGES` and `CHAT` are)

| Cap | Default | Why |
|---|---|---|
| Off switch | `enabled` | Stops new matches at once |
| Computer matches started per FID per day | 40 | Counted from `mp_matches` |
| Live matches started per FID per day | 20 | |
| Matches in progress per FID | 1 live + 1 computer | |
| Open invites per FID | 5, expire after 24 h | |
| Live matches in progress, sitewide | 200 | Bounds the worst case |
| New matches per day, sitewide | 5,000 | |
| Polls | at most 1 a second per FID per match; faster gets `429` with `Retry-After` | A script ignoring the interval |
| Level-4 compute | 50 ms a turn | |

Counting per FID follows `src/lib/images/limits.ts`: under an advisory lock per FID, count
today's rows, refuse with a reason. No cost row is ever tied to a FID (`mp_daily` has none).

---

## 8. Abuse

- **Harassment.** No free-text chat, no free-text names, no messages. The only things a player
  can show the other are pieces on a board. Optional later: a few fixed phrases ("Good game",
  "Rematch?") (decision 12). Names: the opponent is shown as "FID n", or a username only when
  the site itself vouches for it (the server-signed name from website sign-in), the rule already
  set for images (add-an-image decision 12). Anyone can **block** an FID: no invites from them,
  never matched with them, silently.
- **Stalling.** The act clock, two missed turns lose, a 20-minute match cap, the deadline checked
  on every request.
- **Multi-accounting.** With no ranking and no public results there is nothing to farm; a second
  account only gets around a block, and invites are opt-in, so the blocked person still needs the
  other player to accept. If the owner wants public results or an open queue later, gating comes
  back (decisions 6, 9).
- **Automated players.** A script can play through the API. With nothing public it only beats
  the computer or a friend who agreed to play it. The poll limit and daily caps bound its cost.
- **Cheating by reading hidden state.** Impossible by construction: the hidden state never leaves
  the server (section 3.3). A check (`P6g`, proposed) would run a scripted match and assert that no
  response ever holds a square outside the player's sight.
- **Reports and moderators.** With friends-only invites, no text and blocks, I propose no report
  button in slice 1. If an open queue is added, a private `mp_reports` table in the 0008 style,
  and the owner decides what a moderator may do (P5 allows hiding only; keeping a person out of
  the queue is new).
- **Rate limits.** Section 7.4. Vercel's own firewall rate limits are an option for the poll route
  without any outside service.

---

## 9. Accessibility and the Farcaster frame

**Accessibility.**
- The board keeps Learn's keyboard placing (arrows move the outline, Enter or Space places), its
  square descriptions and 44 px controls.
- One `aria-live` line announces: "Your turn to act. 45 seconds." / "Your opponent is ready." /
  "Run: you lost a tower at C3." / "10 seconds left." Run frames are summarised per step in text,
  so the match is playable without seeing the board.
- Reduced motion: the run jumps to its end, with the summary.
- Clocks: none against the computer; friends choose 45 s, 2 min or 10 min. "Time left" is text,
  not only a ring.
- Colour is never the only cue: Cyan and Amber pieces also differ by shape and by the square
  description.
- Both players see themselves on the left (the server sends Amber's view rotated 180°, which
  the point-symmetric board allows), so "your side" is always the same place; the rotation must be
  applied to the directions in both the view and the intents (decision 15).

**Farcaster.** The site is already a mini app (`fc:miniapp` embed with `launch_frame`). Inside
Farcaster, Quick Auth signs the player in silently, so play needs no extra step; on the plain
website, Sign in with Farcaster as built. An invite page carries its own embed ("Play Minpentai")
whose image is a static one from the site, never a picture of a match (no state leaks into a
public image). Mini apps on phones stop when backgrounded: polling stops, and the clock keeps
running, which the wording warns about. Playing inside a cast (old server-rendered "frames" with
buttons) is not proposed: each press would render a fogged image server-side, and it would put
match state into images Farcaster caches.

---

## 10. The ten loose ends in Design's rules

Source: `docs/design/minpentai-learn-port.md` §5, which lists 16 entries. **How I get ten:**
entries 10–13 are already closed in the port (the pause is kept, the tags are added, citations
corrected, the code's 0.9 s slow motion is ported), and 14–16 are layout and unused mockup code,
not the game. That leaves entries 1–9, the ones "ported as is". Entry 5 (the bot) holds two
separate questions with separate answers (does it see through fog; how much of the game does it
play), so it is split into 5a and 5b. Design is settling all ten; options are offered, nothing is
decided for Design.

| # | Loose end (§5) | What multiplayer needs settled | Options for Design | Blocks |
|---|---|---|---|---|
| 1 | **Resigning** exists only in the scripted broadcast; practice has no way to resign. | Whether resign is part of the game, and its words. The site needs a resign/leave in any case. | (a) Resign at any time, the other wins; (b) only during your turn to act; (c) not part of the game: the site's "leave match" counts as a loss and is not called resigning. | **Live 1v1** (wording); computer matches can use "leave". |
| 2 | **The broadcast's rules are not the lessons' rules** (drones never kill towers, pass own walls, break enemy walls 35%, rocks turn 90° half the time, drones expire). | Which rules are "the game" that people play against each other. | (a) The lessons' `pStep` is the game, the broadcast is staging (labelled); (b) bring the broadcast's rules into `pStep`; (c) a mix, item by item. | **Both** (the server must run one rule set). |
| 3 | **RESET does not clear a met goal.** | Nothing. | Clear it on reset, or keep. | Lessons only. |
| 4 | **Diagonal gliders that cross between squares don't meet** (only same square or exact swap). | Whether an X-crossing destroys both, since it decides matches under the diagonal rule. | (a) Pass through, as now (write it down as a rule); (b) crossing counts as meeting; (c) drop the diagonal rule from multiplayer. | **The diagonal rule only**, both kinds of match; the other three new rules can ship. |
| 5a | **The bot reads the whole board** (ignores fog). | Whether "the computer" in this game plays fair. | (a) Learn's practice bot stays as is, multiplayer levels play fair (this proposal); (b) make Learn's bot fair too; (c) the bot may see everything, labelled. | **Computer levels** (their definition); not live. |
| 5b | **The bot never builds towers, never fires diagonally, always has 8 points.** | What a "simple bot" may do, so levels above it are clearly more. | (a) Keep as Design's simplest level; (b) give it the whole game. (Its 8 points equal the player's 8.) | Neither; shapes the levels. |
| 6 | **Hidden information shows**: the strip counts the opponent's towers in the dark. | What the server sends about the opponent's towers. | (a) Always shown, as a public scoreboard (the crowd's view); (b) "?" when none is in sight, as the sandbox does; (c) the last count you saw, marked as such. | **Live 1v1** and fair computer levels. |
| 7 | **Practice toast** says "Press reset to plan again" though practice has no reset. | The words for "your turn is over". | Rewrite the toast. | Lessons only (multiplayer reuses the fixed words). |
| 8 | **Lesson 5's demo fires in the last direction chosen.** | Nothing. | Reset the direction before the demo, or keep. | Lessons only. |
| 9 | **The big button ignores presses during a demo.** | Nothing. | Finish the demo at once, or keep. | Lessons only. |

**Blocking summary.** Live one-on-one needs 1, 2, 4 (or the diagonal rule left out) and 6.
Computer levels need 2, 5a and 6 (and 4 for the diagonal rule). 3, 7, 8 and 9 affect only the
lessons; 5b affects only how the levels are described.

### 10.1 Further questions for Design, found while writing this (not among the ten)

They are not in §5 because they do not show in a one-player practice, but two-player play hits
each one.

- **A. Turn order.** Practice is sequential: the bot places after seeing your new pieces. Two
  players need either secret simultaneous placement (proposed) or alternating first mover.
- **B. Merging and list order.** `pStep` moves gliders in list order, so who was placed first
  can decide a step (a glider breaking a square lets the next glider through in the same step).
  Needs: an order for merged placements (by turn, alternating; by seed; both sides' pieces
  interleaved), and what happens when both place on the same square (both refused; neither; a
  coin from the seed).
- **C. Zone vs sight.** Under "You see only 2 squares around your towers" the build zone stays 3,
  so a player can try to build on a square they cannot see; refusing because it is occupied
  leaks a hidden piece. Options: zone shrinks to sight; placing onto an unseen occupied square
  silently fails and the points are spent; the zone is never larger than sight.
- **D. Towers extending the zone the same turn.** In Design's `place`, a tower placed this turn
  extends the zone for further placements in the same turn (so two towers can step forward 6
  squares). Intended?
- **E. The opening reveal.** Both see the other's towers at step 0 only. Keep for two players?
- **F. Ties and the time limit.** Both out on the same step is a draw, and equal towers at 96 is a
  draw. Keep for two players?

---

## 11. Principles

**Tensions first** (detail in section 0): P5 and moderation of players (avoided by friends-only
and blocks); P6 and records of who played whom (private tables, 30-day retention); fair computer
vs Design's bot; turn clocks vs accessibility; Design's rules still moving.

| # | Principle | How this stands | Status |
|---|---|---|---|
| 1 | Recipes for generated assets | Nothing generated is published. The computer is code in the public repo, so its "recipe" is public. | Pass |
| 2 | AI declared; words are the author's or a signed-in person's | All wording model-drafted and tagged DRAFT WORDING; no generated text in play; no player text at all. | Pass |
| 3 | Model allowlist | No model is used. | Pass |
| 4 | No model output without a signed-in person | The computer is a deterministic script, not a model; nothing is published. Every write route (`start`, `commit`, `resign`, `invite`, `ready`, `block`) calls `getFid` (P4a covers them automatically). | Pass |
| 5 | Nothing canon or featured; moderators only hide | No ranking, no featured players, no "best" matches. Concern: any action against a harassing player is beyond hiding; avoided for slice 1, returns with an open queue. | Pass, concern noted |
| 6 | No third-party requests; individual records private | Polling goes only to the site; invites shared through the Farcaster host's own compose action; no push notifications (they would mean a server request to Farcaster's notification service, decision 18). Match tables have no public read; responses are `private, no-store`. Proposed check `P6g`: no response leaks a square outside sight. P6d remains the owner's accepted open item. | Pass |
| 7 | Payments never in scoring | Nothing paid; unlocks are by play only. | Pass |
| 8 | Minpentai matches the source | The game is the Learn game, labelled RULES INVENTED FOR THIS EDITION on every play screen (P8d extended to the play screens), with the note pointing to the book's rule in the sandbox. No claim that this is how the book's matches or bots work. | Pass |

---

## 12. Order of work, if approved

1. Design answers the blocking loose ends (2, 5a, 6; then 1 and 4) and questions A–F.
2. Lift the practice match into a pure module; `test:minpentai-learn` unchanged and passing.
3. Migration 0009, applied by the owner; `test:db` extended (no public read on the new tables).
4. Computer levels 1–2, server-run, with the leak check.
5. Levels 3–4.
6. Live one-on-one: invites, ready check, polling, clocks, resign, blocks.

---

## Decisions for the owner

1. **Which game is played.** (a) The Learn game, invented rules, labelled; (b) the sandbox's
   engine, the book's recovered rule; (c) both. *Recommended: (a)*, with the existing engine
   match in Play renamed "The book's rule against the computer" so the two are told apart.
2. **Order and waiting on Design.** (a) Computer levels first, live after, each waiting for the
   loose ends it needs; (b) build now on interim rulings, labelled; (c) wait for all ten.
   *Recommended: (a).*
3. **Where computer matches run.** (a) On the server (fog real, wins trusted, one code path);
   (b) in the browser (free, but the hidden state is on the device). *Recommended: (a).*
4. **Levels.** (a) The four in section 2.2; (b) three; (c) Design's bot only. *Recommended: (a).*
5. **Fair play.** (a) Every level sees only what its towers see; Learn's practice bot stays as
   Design has it; (b) also make Learn's bot fair (Design's call); (c) the top level sees all,
   labelled. *Recommended: (a)*, and pass (b) to Design.
6. **Unlocking and results.** (a) Beat a level to open the next, progress private on the server;
   (b) all levels open, nothing stored; (c) progress on the device only; (d) any public results
   or leaderboard. *Recommended: (a); no (d).*
7. **Sync.** (a) Polling with a version and `304`s; (b) long-poll; (c) SSE; (d) LISTEN/NOTIFY;
   (e) WebSockets. *Recommended: (a)*, with (c) as the upgrade if the wait feels slow.
8. **Simultaneous secret turns** for two players (subject to Design, question A). *Recommended:
   yes.*
9. **Matching.** (a) Friends only, by link or FID; (b) also an open queue. *Recommended: (a)* for
   now; (b) only with gating and a moderation answer.
10. **Clocks.** (a) Friends choose 45 s / 2 min / 10 min, computer untimed; (b) one fixed 45 s
    clock; (c) no clocks. *Recommended: (a)*, first turn twice as long.
11. **Names.** (a) "FID n", or a username only when signed by the site; (b) the username the
    Farcaster app reports (not verified by the server). *Recommended: (a).*
12. **Talking.** (a) None; (b) a few fixed phrases; (c) free text. *Recommended: (a)* in slice 1,
    (b) later if wanted, never (c).
13. **Replays.** (a) The two players only, whole board after the match ends; (b) the two players,
    each still in their own fog; (c) public. *Recommended: (a).*
14. **Retention.** (a) Matches deleted 30 days after the end, daily counts kept without FID;
    (b) 7 days; (c) kept until erasure is asked. *Recommended: (a).*
15. **Both players on the left** (Amber's view rotated). *Recommended: yes.*
16. **Timeouts and leaving.** Missed turn commits nothing; two in a row lose; 20-minute match cap;
    resign at any time. *Recommended: as written*, with Design's answer on loose end 1 for the
    word "resign".
17. **Caps.** The defaults in section 7.4, and the off switch. *Recommended: as written.*
18. **Notifications.** (a) None; the invitee sees invites when they open Play; (b) Farcaster
    mini app notifications (a server request to Farcaster for each). *Recommended: (a)* for now.
19. **Reports.** (a) No report button while play is friends-only, blocks instead; (b) a report
    button now. *Recommended: (a).*
20. **Migration 0009.** Approve the sketch in section 6.1 for the coding agent to write as a file,
    for you to dry-run and apply by hand. *Recommended: yes, after decisions 6, 13 and 14.*
21. **A new principle check (`P6g`)**: a scripted match asserts that no response ever holds a
    square outside the player's sight, and that match responses are `private, no-store`.
    *Recommended: yes.*
