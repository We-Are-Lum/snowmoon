# Minpentai in a cast: snap feasibility spike

Written 2026-10-21 by the coding agent for the owner. Branch `minpentai-snap` (not merged). Code: `src/lib/minpentai/snap/`, `src/app/snap/minpentai/`, `scripts/test-minpentai-snap.ts` (`npm run test:minpentai-snap`). Screenshots: `docs/proposals/minpentai-snap/`.

## Answer first

A whole practice match fits in the feed. Every move the real game allows can be made by tapping, each page fits under 500 px, and the server's own work per POST is a few milliseconds. The cost is taps: about 32 for a simple match and 40–55 with squares, plus the tutorial, and every tap waits for a round trip. Recommendation: **keep the full match in the snap as a practice taster, and offer the mini app on the run screen after turn 2** ("Keep playing in the app": same seed, same moves), rather than forcing a hand-off. Reasons are under "Feed or hand-off" below.

Not yet tested: the Farcaster emulator and a phone (see "What wasn't tested").

## What was built

| Ask | Done | How |
|---|---|---|
| 1. Board | Yes | `cell_grid` 15 × 10, square cells, every cell given a hex colour: fog `#08090C`, lit `#17323A`, rocks grey, Cyan/Amber pieces in Play's colours with glyphs (◎ tower, ■ square, □ cracked, arrows for gliders). Amber's towers outside sight show dimmed where last seen. Each tap POSTs (`select: "off"` + `on.press`). |
| Move controls | Yes | A 3-option `toggle_group` picks the piece (`→ 4`, `■ 1`, `◎ 4`), sent with every tap. A new glider faces → and shows arrows on its neighbours: tap one to aim (all 8 under "diag"). Tapping your glider turns it clockwise, which covers aiming off the board at an edge, where no arrow cell exists. Tapping your square or tower takes it back. Undo removes the last piece. |
| 2. Between turns | Yes | `/snap/minpentai/run?g=…&h=…`: an animated GIF of the run as Cyan saw it (fogged per step, like one-on-one's frames), 640 × 360, 260 ms a step, ticks for the steps down the left. The link holds the match up to that turn, signed, so the same link always draws the same picture: `Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable`. |
| 3. State | Yes | **Signed URL**, no table: every target carries seed, level, version, every placement, this turn's pieces, the piece picked, the aim and the tap count (about 60–200 characters), HMAC-SHA256 signed and bound to the FID that started the match. The server replays the whole match on each POST with the site's engine. A POST signed by another FID starts that person a new match. Practice only: nothing is stored or recorded. |
| Same engine | Yes | `snap/match.ts` follows Play practice's flow (controller.ts) and the onchain spike's `replaySolo` step for step: one `rng(seed)`, rule first, computer player after; placements checked by the one-on-one server's `checkPlacements`. The test plays 14 seed/strategy pairs through both `PlayController` and the snap and compares every board at every turn: identical. |
| 4. Tutorial | Yes | `paginator` of 4 cards (what it is, the three pieces, turns, playing here) with "Start a match" under it on every card. A version link (`?v=fast-fog`) opens on one "What's different" card first, then the same 4. |
| 5. End screen | Yes | Result and reason, confetti on a win, the last run's GIF, Share (`compose_cast`, the version's snap link in `embeds`), Play again, "Make your own version" (`open_mini_app` → snowmoon.party/minpentai). |
| 6. Measure | Partly | Heights, taps, server timings and GIF sizes measured locally with `@farcaster/snap/react`'s `SnapCard` (the component the emulator renders). Not measured: the real emulator, a phone, real network round trips. |

### Versions

There are no player-made versions anywhere yet, and nothing on main to make them. The snap reads versions only from a list in code (`snap/versions.ts`), never from the link, so a link can't put words in a player's name. The list has one sample by this edition, "Fast fog" (turns every 8, sight 2), labelled "(a sample)". A version can change only the numbers the engine already takes as parameters: the extra rule (fixed instead of drawn; the first random number is still drawn, so the computer player's numbers don't shift), sight, the turn interval and the glider cost. Points per turn (8) and the square and tower costs are hard-coded in `botPlan` and `checkPlacements`. Anything more needs the rule modules in `docs/proposals/minpentai-rule-modules.md`.

## Measurements

### Height (visible card under 500 px)

Measured as the card content's height in `SnapCard` at 480 px wide (dark theme):

| Page | Height |
|---|---|
| Tutorial cards 1–4 | about 250–280 px |
| Version "What's different" | 284 px |
| Turn to act, setup (two-line status) | 493 px |
| Turn to act, later turns | 475 px |
| Turn to act, refusal message (two lines) | 493 px |
| Run (GIF) | 403 px |
| Result | 451 px |

The board page is the tight one: 7 px to spare at setup. **First version failed:** the renderer stacks a 3-option `toggle_group` vertically once its labels total more than 15 characters (`Glider 4 · Square 1 · Tower 4` is 23), which pushed End turn below the line. The glyph labels fix it. Anything else added to the board page (a second status line, a resign button, a rule badge) would push it over.

### Time per POST (well under 5 s)

| Part | Measured |
|---|---|
| Replay + page build (`act`), 586 actions over 17 matches | median 1.7 ms, p95 11 ms, max 42 ms |
| Signature check (ed25519) | about 1–2 ms |
| Hub lookup of the FID's signer keys (`rho.farcaster.xyz:3381`), from this Mac | 115–823 ms (8 tries) |
| Same, cached for 5 minutes per FID | 0 ms after the first tap |
| Page JSON | about 7 KB (the 150 cells) |
| GIF render, production build, uncached | 120–230 ms; 10–26 KB |
| Tutorial GET, production build | about 30 ms |

So a POST costs one hub lookup (under 1 s) on the first tap of a session and a few ms afterwards. The cache is per server instance. With Fluid Compute's reused instances most taps should hit it, but a cold instance pays the lookup again. The library's own `verifyJFS` doesn't cache, which is why `snap/auth.ts` does the lookup itself. Real round trips (Farcaster's client → Vercel → back) were not measured.

### Taps per match

Counted by the server (each POST, plus a piece switch read from the inputs). Paginator swipes are local and can't be counted; the tutorial adds 0–3.

| Player | Turns | Taps |
|---|---|---|
| Two gliders a turn, 96 steps (base rules) | 8 | 32 |
| One glider and squares, 96 steps | 8 | 39–54 |
| Two gliders a turn, Fast fog (turns every 8) | 12 | 48 |
| By hand in the harness (a quick win at step 17) | 3 | 19 |

Each turn costs at least 2 taps that aren't moves: End turn, then Your turn after the GIF. That's 16 of the 32.

## What didn't fit, or fits badly

- **The extra rule's text and the piece names don't fit on the board page.** Setup shows them in the status line; later turns show a short form ("diagonal gliders"). The glyph toggle (`→ 4`) is less clear than words.
- **Taps are small.** Cells are about 29 px on a 480 px card (less on narrow phones). Fine with a mouse; unproven with a thumb.
- **Aim arrows sit on the neighbouring squares.** To put a piece right next to a new glider, you first tap its → arrow (or place the neighbour before the glider). The test covers it, but people will trip on it.
- **No hold-to-preview, no animation on the board itself.** The run is a GIF in a separate page; the board page is static.
- **No true count at the end.** The site shows the whole board when a match ends; the snap's result GIF is still fogged. It could be added as a second GIF.
- **A match is lost if the client drops the page.** With signed URLs, scrolling away or a client reload returns to the tutorial. Server-side state by FID would let a GET resume, but `action.user` on GET isn't guaranteed, so even that is best effort. I'd keep signed URLs: no new table and no data kept about anyone.
- **Badges aren't the site's labels.** Play's tags are the ⓘ "Invented" and "Draft" opening an explanation (P8f); a snap can't open a dialog, so they are plain badges, with "rules invented for this edition" in the text beside them.
- **Only the Practice computer (level 0).** The ladder rungs would work the same way, but they're recorded in the mini app, so the snap leaves them out.
- **"Make your own version" goes to the Minpentai page.** Nothing to make versions exists yet.

## Feed or hand-off

A full match in the feed works, but it is 30–55 taps, and every tap waits for a POST. The value of the snap is a first taste without leaving the feed, and a share card that is itself playable. Suggestion:

1. Play the whole match in the snap (it's practice, nothing to lose).
2. On the run screen from turn 2, offer "Keep playing in the app" (`open_mini_app`) with the match's seed and moves in the link, so the app picks it up mid-match. This needs the mini app to accept a seed and a move list: replay already does it (onchain spike), Play doesn't yet.
3. Results that count (the ladder, recording) stay in the mini app, as you said.

Forcing the hand-off after turn 1 or 2 would be simpler to build, but it gives up the in-feed match that makes the snap worth sharing.

## What wasn't tested, and what I need from you

- **The Farcaster emulator** (farcaster.xyz/~/developers/snaps): in this session, Chrome automation timed out on every page (the emulator and localhost alike), so I used the same renderer locally (`@farcaster/snap/react` `SnapCard`, dark theme, overflow line at 500 px) with signature checks skipped in development.
- **A phone**: needs a public URL. See the preview note in the session report.

## Principles

- **P6 (no third-party requests on pages; ratings private):** the snap is JSON drawn by Farcaster's client. Our server makes one outside request, to a Farcaster hub, to check who signed a tap (required by the snap spec). Nothing about players is stored. The browser fallback page links only to snowmoon.party. Pass.
- **P7 (not affiliated line on the first screen; no token):** the first card (and the version card) carries "Independent adaptation · Not affiliated with the author · No token". Pass.
- **P8 (Minpentai matches the source):** the snap plays Play's invented rules, labelled "Invented" and "Draft", with "rules invented for this edition" on card 1. It doesn't paraphrase c4-b84 as "a new rule each match" ("one of four invented extras"). Concern: P8f's ⓘ labels can't be drawn in a snap; the badges stand in. P8's checks don't cover the snap yet.
- **P1, P2, P4 (generated assets, AI declared, publishing):** the GIFs are drawn in code from the engine, with no model and no text in the picture. Not touched.
- **Legal texts:** the snap stores nothing and records nothing. It sends each tapping FID's signing key lookup to a Farcaster hub. If it ships, Privacy needs a line saying that the snap checks a tapper's Farcaster signature with a Farcaster hub and keeps nothing (to ship with it, per "legal texts describe today").
