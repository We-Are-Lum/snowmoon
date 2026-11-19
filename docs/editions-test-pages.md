# Snowmoon Editions: the test mint pages on Sepolia

DRAFT, written by an AI agent (Claude, made by Anthropic) for the owner's review. Branch `editions-mint-pages`, off `editions-contracts`. Nothing is deployed, and nothing touches mainnet.

## What's built

Three unlisted, noindex routes, linked from nowhere. Each one opens with the test banner, then shows the countdown when a next opening is scheduled.

| Route | What it is |
|---|---|
| `/editions` | The Editions list: title, two draft lines, the next opening (countdown and an inactive "Remind me"), every edition newest first. |
| `/editions/[id]` | The edition page, story first. In order: the piece (picture, or video with its play control); the label, title and story; the mint card; the ladder to true scale; how the piece came to be; where the money goes; earlier editions. |
| `/editions/[id]/minted/[hash]` | After a mint, read from the transaction itself, so a refresh or a shared link shows the same thing. |

**Quiet and busy, exactly as decided:**
- **Quiet** (no mint on this edition in the last 3 minutes): the page sends the quoted price and says nothing about refunds.
- **Busy:** the page sends the cost of the same pieces 3 places further up the ladder. Before the buyer confirms, it says: the price may move up a step, you pay at most X, any difference comes straight back.
- **Just before sending:** the price is read again through the wallet. If it moved, the page shows the new price and needs another tap.
- **After a mint:** a returned line appears only when money actually came back.
- **A quiet mint that loses a race:** the page says so plainly and offers to try again at the new price.

**States, each in plain words:**
- not open yet (with the countdown);
- sold out;
- no wallet;
- not connected;
- wrong network (one tap to Sepolia);
- not enough test ETH (with a faucet link);
- waiting for the block;
- confirmed;
- cancelled in the wallet;
- failed;
- a wallet that can't hold this collectible.

The page never shows a raw error.

## Where things come from

- **The chain:** `src/lib/editions/config.ts`, the one place. Sepolia only, with no mainnet entry. The addresses stay null until Nate deploys, and the pages say "not on Sepolia yet". For a local fork, set the `NEXT_PUBLIC_EDITIONS_*` variables and `EDITIONS_RPC_URL`; a fork keeps Sepolia's chain id.
- **Reads:** the server reads Sepolia (`src/lib/editions/chain.ts`) and serves `/api/editions/[id]/live`. In the browser the only reads go through the buyer's own wallet. The page itself makes no third-party request (principle 6a).
- **Wallet:** the Farcaster wallet inside the miniapp (`sdk.wallet.getEthereumProvider`). Anywhere else, the wallet the browser injects.
- **What the contract doesn't hold:** label, title, story, media, credits, earlier versions and split shares live in `config/editions-sepolia.json`. It holds SAMPLE DATA until Nate picks the two pieces. Every owner field is null and shows as a [bracketed] placeholder.
- **Words:** every word is in `src/lib/editions/wording.ts`, as draft copy for Nate to rewrite.
- **The dollar figure:** `/api/eth-usd`, Chainlink's ETH/USD read by our server and cached for a minute, labelled approximate.

## Checks

- `npm run test:editions`: the unit tests. They cover:
  - prices, and the quiet and busy amounts against the contract's reference ladder;
  - every state, and the wording rules (no investment talk, no Terms or Privacy lines, the new name only, placeholders bracketed);
  - Sepolia only, no keys, no browser RPC, noindex and unlisted.
- `scripts/editions-fork-run.ts`: the run against a local Sepolia fork, with screenshots. Build first with the variables from `--env`, then run it; hold the shared heavy lock throughout.

## Open questions for Nate (defaults used)

1. **Where it runs:** a preview deployment first. The pages need no database, so a preview works. For the Farcaster miniapp wallet, the miniapp only opens on the real domain, so the miniapp test needs the routes on production behind a switch (proposal; not built).
2. **Routes:** `/editions` and `/editions/[id]`, unlisted.
3. **"Remind me":** shown but inactive, with a note. The simplest real version is a Farcaster miniapp notification to people who added the app. It needs a table of notification tokens, so one migration.
4. **Busy window:** 3 minutes. The cushion is 3 pieces further up.
5. **Dollar figure:** the site's existing Chainlink read on Base.
6. **Which two pieces:** Nate to choose. The sample media are a chapter 1 picture and the Fifteen Days video. That video is 36 MB and landscape, so a shorter clip would suit the test better.
