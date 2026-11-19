# Snowmoon Editions: the test mint pages on Sepolia

DRAFT, written by an AI agent (Claude, made by Anthropic) for the owner's review. Branch `editions-mint-pages`, off `editions-contracts`. Nothing is deployed, nothing touches mainnet, and nothing merges to `main` without the owner's go.

## What's built

Three unlisted, noindex routes, linked from nowhere. Their layout and words follow the four mockups made with Nate (LUM project, `claude/mockups/editions-*.dc.html`), built with the site's tokens in light and dark. Every page opens with the test banner and ends with the affiliation line.

| Route | Mockup | What it is |
|---|---|---|
| `/editions` | editions-list-phone | "Editions", the line about making it in the open, the next opening (countdown, inactive "Remind me"), every edition newest first with its progress bar. |
| `/editions/[id]` | editions-mint-phone, -desktop | Story first: the piece (picture, or video behind a play button), label, title, story and credits, the mint card, the price ladder, how it came to be, where the money goes, earlier editions. On desktop: the piece and its steps on the left; the story, the card and the money on the right; then the ladder and earlier editions across the page. |
| `/editions/[id]/minted/[hash]` | editions-after-mint-phone | "Piece N is yours", what you paid, the returned cushion (only when money came back), where it went, then story, share and all-editions buttons, and the next piece. Read from the transaction itself. |

**Quiet and busy:**
- **Quiet** (no mint in the last 3 minutes): the page sends exactly the quoted price and says nothing about refunds.
- **Busy:** it sends the cost of the same pieces 3 places up the ladder, and says so under the button before the buyer confirms, with "at most".
- **Just before sending:** the price is read again through the wallet. If it moved, the page shows the new price and needs another tap.
- **A lost race:** the page says so plainly and offers to try again.

**Every state is in plain words, never a raw error:** not open yet, sold out, no wallet, not connected, wrong network (one tap), not enough test ETH (faucet link), waiting, cancelled, failed, and a wallet that can't hold this collectible.

## Where things come from

- **Chain and addresses:** `src/lib/editions/config.ts`, Sepolia only, null until Nate deploys.
- **The server reads one call per edition:** LadderSeller's `summary(id)` (sold, next price, opening time, last mint time, payout, link) and `pricesOf(id, 1, size)` (the whole ladder in one call). The busy rule reads `lastMintAt` from that summary; there's no event search and no 256 separate reads. The browser asks only our API, or the buyer's wallet.
- **Wallet:** the Farcaster wallet inside the miniapp, the injected wallet elsewhere.
- **What the contract doesn't hold:** `config/editions-sepolia.json`, SAMPLE DATA until Nate picks the pieces. The owner's fields are null and show as [brackets].
- **Words:** `src/lib/editions/wording.ts`, the mockups' wording, for Nate's pass.

## On production behind a switch (proposal: waits for Nate's go)

**Why:** the Farcaster wallet can only be tested inside the Farcaster app, and the app only opens the real domain.

**How it works:**
1. **The switch.** `EDITIONS_PAGES.onProduction` in `src/lib/editions/config.ts` (built on the branch, `false`). It follows the pattern of the site's other switches (`ADAPTATION_PAGES.live`). While it's off, production answers 404 for `/editions/*` and `/api/editions/*`; locally and on previews the pages are always on. Turning it on, or off again, is a one-line change in a PR the owner OKs, then `vercel redeploy` (no environment variable to set).
2. **Unlisted.** No link from any page, menu or sitemap (`test:editions` checks this), `noindex, nofollow` on every page, and the test banner on every page.
3. **Opening it in Farcaster.** Each edition page carries its own miniapp embed, so a cast of `https://snowmoon.party/editions/1` shows an "Open the test edition" button that opens that page inside the Farcaster app, with the Farcaster wallet. Testers get the link in a direct cast, or from a cast in a quiet channel, Nate's choice.
4. **What it reads.** Sepolia, through a public endpoint (publicnode), by our server only. It receives nothing about the reader, and nothing is recorded: no database change, no new tables. Nothing is sold for real. The pages sell test pieces for test ETH, which is why Terms §2 ("Nothing else here is for sale") stays true. That's my reading; whether the test needs any Terms or Privacy line is the owner's call, and the reread rule applies if it does.

**Order:**
1. Nate does the Sepolia deployment (DEPLOY.md) and sends the addresses.
2. I add them to the config, with the two pieces he picks, on this branch.
3. **Merge order.** This branch carries `editions-contracts`, so merging it also brings the contracts folder, the removal of the old `contracts/snowmoon-wip` and the P7b check. Principle 7's "fixed-price collectible" sentence needs the owner's words first. So I'd merge `editions-contracts` first, on its own PR, once that sentence is settled, then the pages, with the switch still off.
4. After each merge: the deploy, then the live checks (`check:shipped`, `check:principles`, `check:ui`, `check:miniapp`).
5. The owner turns the switch on in a one-line PR. I run a live check of `/editions` and `/editions/1` and confirm the miniapp embed opens it in Farcaster.
6. When the test ends, the switch goes back off in another one-line PR.

## Checks

- `npm run test:editions`: 83 unit tests. They cover:
  - prices, the quiet and busy amounts, the grouped ladder and its ticks;
  - every state, and the wording rules;
  - the production switch, Sepolia only, no keys, no browser RPC, noindex and unlisted.
- `scripts/editions-fork-run.ts`: 19 scenarios against a local Sepolia fork, with screenshots.

## Open questions (defaults used)

1. **Where it runs:** see the proposal above.
2. **Routes:** `/editions` and `/editions/[id]`.
3. **"Remind me":** inactive in the test. The simplest real version is a Farcaster miniapp notification, which needs one migration (a table of notification tokens).
4. **Busy window:** 3 minutes; the cushion is 3 pieces up.
5. **Dollar figure:** the site's Chainlink read on Base, shown as "about $X".
6. **Which two pieces:** Nate to choose. The sample video is 36 MB and landscape.
