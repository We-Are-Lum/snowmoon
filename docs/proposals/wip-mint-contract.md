# Snowmoon WIP mint contract: decisions and open questions

DRAFT, written by an AI agent (Claude, made by Anthropic) on 2026-10-31 for the owner's review. This is item 8 of the remix-challenge plan. The code is in `contracts/snowmoon-wip/`; its README has the deploy checklist. Nothing is deployed and nothing has been sent to any network.

## First: a principle to settle

**Principle 7 says "No token".** `docs/principles.md` says "There is no token", and P7b says "no token code (ERC-20/721, mint, airdrop) exists in the repo". The home page's first screen carries "Independent adaptation · Not affiliated with the author · No token" (`config/intro.json`).

This contract is an ERC-1155 with a `mint` function: token code, in the repo. The automated P7b check doesn't scan `contracts/`, so `check:principles` still passes, but the text of the principle and the first-screen line don't.

The plan's decision (owner, 31 Oct) to mint Snowmoon WIP on mainnet needs one of these, chosen by the owner before this branch merges or the mint is announced:
- reword P7 and the first-screen line (for example "no coin" or "no fungible token", if that was the intent);
- or keep the contract outside this repo.

The agent hasn't changed the principle, the check or the intro line.

## Decisions made in the contract

| Question | Choice | Why |
|---|---|---|
| Base | OpenZeppelin Contracts **v5.7.0** (`ERC1155`, `Ownable2Step`, `ReentrancyGuardTransient`), solc **0.8.28**, EVM `cancun` | Latest 5.x release; pinned by tag and commit in `foundry.lock` and the submodules. Transient-storage guard needs EIP-1153, live on mainnet and Sepolia. |
| Licence | GPL-3.0-or-later | As the plan says; OZ is MIT, compatible. |
| Price 0 | **Not allowed** (`ZeroPrice`) | Terms can never be fixed after creation. A forgotten price would open a free, unlimited mint that can't be closed. The plan is a paid edition. A free edition would need its own decision. |
| Window | `start` inclusive, `end` exclusive: open while `start <= block.timestamp < end` | One unambiguous closing second. `createToken` requires `start < end` and `end` in the future; `start` may already have passed (opens at once). Dates are parameters, never hard-coded. |
| Payment | `msg.value == price * quantity` exactly; checked multiplication reverts on overflow; `quantity > 0` | No refunds to calculate, so no change is ever owed. |
| Effects before interactions | `mint` records the payment (`proceeds[id]`, `totalProceeds`) and emits `Minted` **before** `_mint`, which calls `onERC1155Received` on contract receivers | The owner's correction to the plan: `mint` does make one outside call. |
| Reentrancy guard | `nonReentrant` on **both** `mint` and `release` (one shared lock) | CEI already keeps the books right. The guard also refuses re-entry from a receiver or a payout outright. The only cost: a contract receiver can't mint again from inside its own receive hook. |
| `release(id)` | Permissionless. Sends the token's whole recorded balance to its payout, zeroes it first, reverts with `NothingToRelease` when it's 0 | No empty `Released` events. |
| Payout rejects ETH | The whole `release` reverts (`ReleaseFailed`); the proceeds stay recorded, mints continue, a later release can succeed | A PushSplit accepts ETH, so this shouldn't happen. If it did, nothing is lost or redirected. There's no fallback address, since that would be a second payout. |
| Payout validation | Not zero, not the contract itself | Whether it's a deployed split is checked by the owner before creation (checklist), not on-chain, so Sepolia dry runs can use any address. |
| `receive` / `fallback` | **None**. Plain ETH sends revert | No reason to accept stray ETH. |
| Forced ETH (selfdestruct, block reward, pre-existing balance) | Ignored by accounting; never paid out by anyone. Releases pay only `proceeds[id]`. | Tested with `selfdestruct`. The mainnet fork test hit a real case: the fresh contract's address already held 0.000577 ETH on mainnet, and it stayed put. |
| Ownership | `Ownable2Step`: transferable in two steps, and renounceable | **Recommend: keep both.** Transfer lets the owner move creation rights to a Safe or a new wallet without a typo risk. Renouncing freezes the collection (no new tokens) without touching existing tokens, a clean way to end it. The owner can't touch any token's terms or money either way. |
| `contractURI()` | ERC-7572, set once at deploy, non-empty; no setter (so no `ContractURIUpdated` event) | Collection metadata for marketplaces and explorers. |
| `uri(id)` | Per-token, reverts for ids that don't exist | Ids run from 1 to `tokenCount`. |
| `name()` / `symbol()` | Set at deploy | Wallets and Etherscan show them. |
| Royalties | None (no ERC-2981) | Plan decision 11. |

## Splits

- **The payout is a Splits v2 PushSplit, not a PullSplit** (owner's correction). Create it with owner `address(0)`, distribution incentive 0, ETH only. A recipient that can't take ETH within 100,000 gas has its share held in SplitsWarehouse; the others are still paid. The mainnet-fork test shows this on the real v2.1 and v2.2 factories.
- **Use the PushSplitFactory v2.2** at `0x8E8eB0cC6AE34A38B67D5Cf91ACa38f60bc3Ecf4`. It's the same address on mainnet and Sepolia, from `packages/splits-v2/deployments/{1,11155111}.json` on the monorepo's `main` branch. The `splits-v2.2` tag (31f55f1) predates the deployment file entry. v2.1 is at `0xDc6259E13ec0621e6F19026b2e49D846525548Ed`.
- **SplitsWarehouse** is at `0x8fb66F38cF86A3d5e8768f8F1754A24A6c661Fb8`.
- **To create one:** `SplitFactoryV2.createSplit(SplitV2Lib.Split _splitParams, address _owner, address _creator) returns (address split)`. The struct is `Split { address[] recipients; uint256[] allocations; uint256 totalAllocation; uint16 distributionIncentive; }`.
- **To distribute:** `PushSplit.distribute(Split _split, address _token, address _distributor)`, with ETH as `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`.
- **Dust:** a distribution leaves 1 wei plus the rounding remainder in the split (4 wei in the fork test).
- **Held shares:**
  - A recipient whose share is held can take it later with `SplitsWarehouse.withdraw`, which still sends ETH and so needs it to accept ETH.
  - It can also move it as an ERC-6909 balance with `transfer`, if it's a contract that can make calls.
  - A plain contract that can't receive ETH and can't make calls can never get its share. That's another reason to check addresses before creating a split.

## Dates

- **The dates come from the site's challenge config.** That config isn't on `main` yet; don't copy dates from this doc.
- **The current window is 7 to 18 December 2026** (it was 20 November to 4 December). It may change again.
- **The time of day is the owner's to set.** The examples assume 09:00 Pacific for both ends, the time of the calls:
  - start `1796662800` (2026-12-07 09:00 PST);
  - end `1797613200` (2026-12-18 09:00 PST);
  - because `end` is exclusive, the last mint would be at 08:59:59 on the 18th.
- **To turn a Pacific time into the timestamp:**
  - macOS: `TZ=America/Los_Angeles date -j -f "%Y-%m-%d %H:%M:%S" "2026-12-07 09:00:00" +%s`
  - Linux: `date -d 'TZ="America/Los_Angeles" 2026-12-07 09:00' +%s`

## Paying from Farcaster with funds on Base

**Short answer:** chain 1 is a supported chain in the miniapp schema. No source says the Farcaster wallet bridges automatically to pay an arbitrary `eth_sendTransaction` on mainnet. Plan for it not to.

**Confirmed by sources:**
- The miniapp manifest schema's `chains` list includes `eip155:1` (Ethereum mainnet), alongside Base and others: <https://github.com/farcasterxyz/miniapps/blob/main/packages/miniapp-core/src/schemas/manifest.ts>.
- `sdk.getChains()` returns the chains the host supports, and `requiredChains` can be declared in the manifest: <https://miniapps.farcaster.xyz/docs/sdk/detecting-capabilities>. Both arrived in SDK 0.0.45: <https://miniapps.farcaster.xyz/docs/sdk/changelog>.
- The wallet guide says batching works on "all EVM chains Farcaster supports", and that there are no paymasters: <https://miniapps.farcaster.xyz/docs/guides/wallets>.
- `sdk.actions.swapToken` opens the wallet's own swap form with CAIP-19 tokens: <https://miniapps.farcaster.xyz/docs/sdk/actions/swap-token>. Its example sells Base USDC for OP ETH.

**Not confirmed:**
- **Whether the Farcaster app's own wallet signs on chain 1 today.** The schema listing it isn't proof; calling `sdk.getChains()` inside the app is the real check.
- **Whether Relay-powered cross-chain features apply to mini app transactions.** Relay's marketing names Farcaster among its wallets (<https://www.relay.link/wallets-solution>, seen only as a search snippet). Nothing in the miniapp docs says this applies to `eth_sendTransaction` from mini apps.
- **What a chain-1 `sendTransaction` with value does when the ETH is only on Base.** Most likely "insufficient funds" or no confirmation, with no bridge prompt. This needs a real-device test: it costs nothing if cancelled before signing.

**Options, if it doesn't bridge:**
- an "add mainnet ETH" step using `swapToken` from Base ETH to `eip155:1/native`, which would need testing;
- a third-party any-chain checkout (not checked);
- a plain web wallet;
- Etherscan's Write Contract.

## Open questions for the owner

1. **Principle 7 and the "No token" line** (above). This must be settled before merge or announcement.
2. **Time of day** for start and end, and whether the 18 December call should still fall inside the window.
3. **Price** in wei per token. It's fixed forever at creation, so convert from USD on the day.
4. **Collection name and symbol.** The examples use "Snowmoon WIP" / `SNOWMOONWIP`.
5. **Ownership after the mint:** keep, move to a Safe, or renounce.
6. **Review:** the plan asks for a review by a separate agent that hasn't seen the code being written. This hasn't been done yet.
7. **Farcaster on-device test** of a chain-1 transaction with only Base funds, and of `swapToken` to mainnet ETH.
8. **Vercel:** the submodules (OpenZeppelin, forge-std) are public. Vercel clones submodules during builds, which adds a little build time. If unwanted, add this branch to `vercel.json`'s `deploymentEnabled: false` list, or vendor nothing and install the dependencies at test time.

## How it was checked

- **Unit and fuzz tests: 44.** The 3 fuzz tests ran 1,000 times each; the accounting fuzz also passed 20,000 runs.
  - A receiver's `onERC1155Received` checks that this mint's payment is already in `proceeds(id)` and `totalProceeds()`.
  - Moving the payment record after `_mint` makes that test and all 5 invariants fail. This was tried locally on 2026-10-31, then reverted.
- **Invariant tests: 5.** 256 runs × 64 calls each, with `fail_on_revert = true`, so any unexpected revert fails the run.
  - The handler also mints to that hook-checking contract.
- **Fork tests: 2.** The v2.1 and v2.2 factories, on a mainnet fork, read-only.
- **Slither 0.11.6:** 5 findings in the contract itself, none a real issue:
  - `arbitrary-send-eth` on `release`: the destination is the token's payout, fixed by the owner at creation. That is the design.
  - `low-level-calls`, the same `call`: needed to forward ETH to a split, and the result is checked.
  - `timestamp` (3, in `createToken`, `mint` and `isOpen`): the window is in days, so a few seconds of validator drift don't matter.
  - The other 91 findings are in OpenZeppelin, ignored as library code: assembly, pragma ranges, Math, and Ownable2Step allowing `transferOwnership(0)` to cancel.
- See `contracts/snowmoon-wip/README.md` for the commands.
