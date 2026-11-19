# Snowmoon Editions: state at the pause (19 Nov 2026)

DRAFT, written by an AI agent (Claude, made by Anthropic). Paused at the owner's request: Nate is rethinking the mint structure. Nothing is merged, deployed (Sepolia included) or open as a PR.

## Branch heads
- `editions-contracts`: `7fd0c80a`
- `editions-mint-pages`: this note's commit (the head before it: `f9e4b363`), which includes `editions-contracts` at `7fd0c80a`

## Built and passing
| What | Commit | Checks |
|---|---|---|
| SnowmoonEditions (collection, 256 cap, 2 per 30 days, two-step creator) and LadderSeller v1 | `72aabf87`, `499f51b2` | Foundry tests, Slither 0, independent review (no critical or high findings) |
| Old `contracts/snowmoon-wip` removed; P7b checks the new folder | `f218a76a` | |
| Renamed "Snowmoon Editions" / `SNOWMOON` | `9520d732` | |
| LadderSeller views `lastMintAt`, `pricesOf`, `summary`; Sepolia test ladder 0.00001 to 0.01 ETH | `835f61e4`, `d50c52ad` | 85 tests, fork rehearsal, Slither 0, independent review of the diff (no defects) |
| P7b ignores view/pure functions | `7fd0c80a` | check:principles 72 of 73 (P6d, the accepted item) |
| Test mint pages matched to the four mockups, production switch (off), miniapp embed | `f936c123`, `324772b7`, `f9e4b363` | test:editions 83, typecheck, build, fork run 19 of 19, screenshots in `~/snowmoon-editions-screens` |

## Doesn't depend on the mint structure (reusable as is)
- **Page layout and styles:** the list, edition and after-mint pages, the bar, the piece with its play button, the steps, earlier editions, and the footer. Built with the site's tokens, in light and dark (`src/app/editions/*`, `src/styles/editions.css`).
- **Wallets:** the Farcaster wallet inside the miniapp, an injected wallet elsewhere. Also the network switch, the balance check, cancelled and waiting states, and naming a wallet that can't hold the piece by asking its account (`src/lib/editions/wallet.ts`).
- **The per-edition Farcaster miniapp embed.**
- **The production switch:** `EDITIONS_PAGES.onProduction` (off), with noindex, unlisted pages and the test banner.
- **Config and catalog:** chain and addresses in one place (`src/lib/editions/config.ts`, Sepolia only), and the catalog of what the contract doesn't hold (`config/editions-sepolia.json`, sample data, owner fields as [placeholders]).
- **The fork harness** `scripts/editions-fork-run.ts`: anvil on a Sepolia fork, impersonated deploys, a stand-in wallet answering like a real one, and screenshots. Only its scenarios are mint-specific.
- **Draft copy** in `src/lib/editions/wording.ts`, apart from the ladder and cushion lines.
- **The collection contract,** if the new structure keeps a permanent collection with pluggable sellers.

## Depends on the mint structure (revisit)
- **The rising price ladder:** the formula, rounding, reference tables (`reference/ladder.py`), the ladder chart and its ticks.
- **Quiet and busy, the cushion and the refund:** the overpay-and-refund mint, the busy rule, "pay at most", the returned line after a mint, and the lost-race retry.
- **LadderSeller's views** `pricesOf`, `summary` and `lastMintAt`, and the pages' reads that use them (`src/lib/editions/chain.ts`, `abi.ts`).
- **The split display:** a per-edition 0xSplits PullSplit with standing shares (10% collab pot, 5% Lum treasury, proposed) and the remainder to the people it was built on.
- **The rate limit, the 256 cap and the 10-per-transaction cap,** if those change.
- **DEPLOY.md's Sepolia dry run and the scripts** (Deploy, EditionTx, Buy, Check, CreateSplit).

## Open items
1. **Principle 7 wording.** It still reads "anything sold is a fixed-price collectible". The ladder has a fixed price per piece set at creation, but not one price. The sentence is the owner's; the P7b check passes.
2. **Sepolia rounding.** Prices round down to 0.000001 ETH. On the 0.00001 to 0.01 ETH test ladder, 22 of the first 45 pieces cost the same as the piece before (every step rises from piece 46). The old 0.000002 start was flat for about 15 pieces. Any low-priced ladder needs a smaller step or a higher start.
3. **The unnamed public Sepolia endpoint.** The server reads Sepolia through publicnode (`EDITIONS_TEST.rpcUrl`). It receives nothing about readers, but it isn't named anywhere. It would need naming, or replacing, before any production use.
4. **"Remind me".** It's inactive. The simplest real version, a Farcaster miniapp notification, needs one migration (a table of notification tokens).

Also noted:
- **Safe accounts:** the anvil account 0xf39F… has EIP-7702 code on Sepolia, so use fresh addresses on forks.
- **Server environment:** never keep `.env.local` in a worktree while `next start` runs there.
- **Merge order:** if work resumes, merge `editions-contracts` before the pages.
