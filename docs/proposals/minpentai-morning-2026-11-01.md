# Minpentai: morning report, 2026-11-01

> DRAFT, for the owner. Written by the coding agent (Anthropic's Claude, a closed model) during the overnight run of 2026-10-31/11-01. Rules invented for this edition · not affiliated with the author.

## Start here: your first message to Claude

**One step first:** in Claude, open Settings → Connectors → Snowmoon, **disconnect it and connect again** (sign in with Farcaster, press Allow). The Allow screen now lists "play Minpentai for you…". Your existing connection was made before agent play existed, so it doesn't have that permission.

Then send this:

> Start a Rocks and Mirrors match on Snowmoon at level 2, and give me my live link first. Set my standing order to "Play defensively: keep my towers walled", preset defend. Each turn, before you send anything: call minpentai_get_view and tell me in two lines what you see; then simulate two plans with minpentai_simulate against where you think their towers are, and show me what happens in each. Wait for me to pick one, then send it with minpentai_submit_orders, source "person", final true. If I say "your call", pick the better plan yourself and send it with source "agent".

Open the live link on your phone to watch. Until #88 merges, a new match is **book-1**: the computer there rarely uses moving walls or factories (see below).

## What's live now

Merged with merge commits, in your order. Every one passed its live checks: `check:shipped`, `check:principles` (54/55, only P6d), `check:miniapp`, `check:snap-live`, `check:ui` and `check:minpentai-live`.

| PR | Merge commit | What |
|---|---|---|
| #75 | 0f3bead | Play rules draft 2 as ruleset 2 (ruleset 1 frozen); links carry their ruleset; "Yes, resign"; Resume's ruleset column, migration **0031** (you applied it; checked read-only in production) |
| #81 | d95304b | Play's ladder: the search computer as ruleset 3, six rungs (Beginner, Easy, Fair, Levels 1–3), a fresh ladder with old wins as history |
| #78 | 3a823d7 | Every check names its target (`--url`); none defaults to production |
| #79 | 6fba2ae | One-on-one shows only what's in sight, your own squares and gliders too, with a faded marker where your glider left sight |
| #86 | 68cede9 | **Agent play**, for FID 6786 only. Connector tools, live link, Rocks and Mirrors (book-1) and its invite-only page, Terms §6d and Privacy §4 (your reread, effective 2026-11-01), migration **0032** (applied; trigger checked read-only in production) |

How "for you only" works:
- `AGENTS.minpentaiPlay.people = [6786]`. The `play` permission is granted to you even when the app asks only for the usual scopes, as Claude does. Anyone else isn't granted it, their tools refuse, and the Allow screen doesn't list it.
- A match link opens only your matches.
- `/minpentai/book` shows only to you when signed in. Everyone else sees "invite-only for now".

## What's on previews, waiting for your OK

| PR | Preview | What |
|---|---|---|
| #87 | (config only) | **The production test account** and `check:minpentai-agent-live` (item 1). The permission check refused this merge, correctly: it wasn't in tonight's list. |
| #88 | https://snowmoon-2chn968oq-nates-projects-d1780cff.vercel.app | Items 2–5: the **book-2 computer**, the **tutorial cards**, **Play with your AI**, the **live page for a phone** |

**#87, item 1 (production end to end): not run yet.**
- I can't sign in as you, so I made a dedicated test account: wallet `0xE86987Cc0d1B6746f13B9F90380563080ba5f973`, site account −23. It signed in once, which created that account row. Its key and session are kept only on this Mac (`~/.snowmoon-test`, mode 600).
- To play agent matches it needs to be on the allowlists, and that's #87.
- Once you OK #87, I merge it and run `npm run check:minpentai-agent-live -- --url=https://snowmoon.party`. It plays a whole Rocks and Mirrors match through the live `/mcp` and runs the fog review's probes against what production answers, reading the database read-only (nothing is planted):
  - every turn, the view is the side's fog view of the real board;
  - the sandbox answer and refusals are the same with every hidden enemy piece removed;
  - final submits take the fixed time;
  - the record's commitments and computer value check out, and it names neither the person nor the agent.
- If anything leaks, I switch agent play off and tell you.
- What did run tonight was the local, real-`/mcp` version: 29 checks pass. Its four new checks cover who gets play: you do, even when the app asks only for the usual scopes; someone else connecting doesn't, and their tools refuse.

**#88, items 2–5:**
- **book-2.** It's a new computer, so it's a new ruleset: book-1's rules with a computer that, from the third turn on, places one book piece it lacks each turn (factory, moving wall, mirror, then three symbol gliders together). New matches become book-2; book-1 records keep replaying with their own computer (tested). Over 20 matches a pairing:

  | Pairing | Score | All four pieces on both sides |
  |---|---|---|
  | Level 2 self-play | 50% | 20 of 20 |
  | Level 3 self-play | 50% | 20 of 20 |
  | Level 1 vs Beginner | 100% | 10 of 20 |
  | Level 2 vs Level 1 | 70% | 20 of 20 |
  | Level 3 vs Level 2 | 100% | 20 of 20 |
  | book-2 vs book-1, Level 1 | 75% | |
  | book-2 vs book-1, Level 2 | 80% | |
  | book-2 vs book-1, Level 3 | **13%** | |

  **The finding:** at Level 3 the pieces make the computer weaker. With no tower limit, towers decide matches at the step limit, so a strong player is better off buying towers than walls, factories or mirrors. Changing that is a rules change (a tower limit, cheaper walls and factories, more ore), so it would be a **book-3**, your call after you play. Details: `docs/minpentai/book-2-computer-2026-11-01.md`.
- **Tutorial:** `/minpentai/book/tutorial`, one card per piece with its scenario playing. Opened from the book page and the live page. Invite-only.
- **Play with your AI:** `/minpentai/agent` (draft, noindex). What it is, connecting in Claude, your five example messages, and what becomes public. ChatGPT is mentioned as untested: I couldn't try it.
- **Live page on a phone:**
  - **Board:** your side only, with the last turn's moves outlined.
  - **Last turn:** each move, and who chose it (you, your AI, or the site computer under the standing order).
  - **Also shown:** this turn's orders, the standing order in effect, and a link to the tutorial.

  A screenshot from a local match is in the PR.

## Decisions I made for you

1. **The test account:** a new wallet, not your account; its key stays on this Mac. Remove it from the allowlists when you're done (the comment in `config.ts` says so).
2. **"play" granted without being asked** for invited people: Claude asks only for the scopes `/mcp` named before agent play, so without this you could never get it. The Allow screen lists it for you.
3. **Rocks and Mirrors invite-only:** the book page and tutorial show only to invited people, signed in. The pieces' text is in the page code, so it's not secret; it's just not shown.
4. **Items 2–5 not merged:** your list of merges was five PRs; these wait for your OK (#88), as does the test account (#87).
5. **book-2's computer** uses the pieces from the third turn on, with no margin. Earlier variants lost to book-1 or spammed symbol gliders (in the doc).
6. **Migrations numbered at merge:** 0031 (resume ruleset), 0032 (agent matches).

## What failed or surprised me

- My first live-check script ran `check:minpentai-live` before the worktree had a build, so it crashed. I re-ran it after the build and it passed; the script order is fixed.
- I briefly deleted Easy and Fair's definitions while editing; the typecheck caught it. There's now a test that plays every rung's first turn.
- Production also has #83 (Support, from my mistake yesterday) and other sessions' merges; none touch Minpentai.

## What needs you

1. Reconnect Snowmoon in Claude, then send the first message above.
2. OK **#87** so I can run the production end-to-end check and fog probes (or tell me to drop the test account).
3. Play Rocks and Mirrors; then OK **#88** (book-2 and the pages), or ask for a book-3 rules change.
4. The #81 ladder: play from Beginner up; if Easy feels like a wall, I add a rung near the old Blocker.
5. Follow-up still open: the snap's levels use ruleset 2's players.

## Principles

- **P2 (fog):** pass locally. In production, the view, sandbox and refusal probes wait on #87.
- **P4 (people decide):** pass. Every turn records who chose it.
- **P6:** pass. P6d stays accepted. The secret key can't delete match records.
- **P8:** pass. All new pages are labelled Draft and invented, with the pieces drawn from the book.
- **Legal texts describe today:** pass. §6d and §4 went live with the feature, at your reread.
