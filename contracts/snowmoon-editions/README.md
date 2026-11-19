# Snowmoon editions: the collection and the ladder seller

DRAFT, written by an AI agent (Claude, made by Anthropic) for the owner's review. Nothing here is deployed.

Work-in-progress pieces from snowmoon.party, an independent, open adaptation of *Snowmoon* by Vitalik Buterin (GPL-3.0), not affiliated with him, released as collectible editions on Ethereum mainnet. Licence: GPL-3.0-or-later. Built from the handoff of 18 Nov 2026 ("Snowmoon editions: contract handoff"), which replaces the fixed-price `contracts/snowmoon-wip` (merged in #85, never deployed; removed on this branch).

Two contracts:

| | `SnowmoonEditions` ("Snowmoon WIP", SMWIP) | `LadderSeller` (v1) |
|---|---|---|
| Role | Permanent ERC-1155 collection. Holds every edition and enforces the hard limits. | Replaceable seller. Prices, takes payment, pays out. |
| Upgradable | No. No proxy, pause, royalties, burn, funds or payable function. | No. No owner, no admin, no withdrawal. |
| Bound to | — | One collection, fixed at deployment. |

## SnowmoonEditions

**Hard limits**, enforced by the collection whatever a seller does:

- `MAX_EDITION_SIZE = 256`: every edition has 1 to 256 pieces, and the collection itself refuses any mint past an edition's size.
- `MAX_EDITIONS_PER_WINDOW = 2` per `WINDOW = 30 days`: once two editions exist, a new one needs `block.timestamp >= createdAt(second most recent) + 30 days`. `nextEditionAllowedAt()` gives that time. Any three consecutive editions therefore span at least 30 days.
- An edition's seller, payout, metadata link, size and creation time are stored once in `createEdition` and have no setters. The seller's settings are set in the same transaction through `IEditionSeller.configure`, which a seller accepts only once per edition.

**The creator role** (at launch the 2-of-3 Safe) can do exactly three things:
1. `createEdition(uri, maxSupply, seller, payout, sellerData)`. It checks that `uri` isn't empty, the size is 1 to 256, the seller has code (and isn't the collection), the payout isn't zero, the collection or the seller, and the rate limit. The seller's `configure` must return its own selector, so a contract with a permissive fallback, or a smart wallet, can't be made a seller by mistake. Ids run from 1.
2. `transferCreator(next)` then `acceptCreator()` by `next`: a two-step handover. Naming `address(0)` cancels a pending one. There is no renounce.
3. `setContractURI(uri)`: the collection description (ERC-7572), with the "mint the next one at snowmoon.party" line. It can't touch an edition.

**Minting:** `mint(to, id, quantity)`, callable only by that edition's seller. It also reverts on quantity 0, on an unknown id, and (from OpenZeppelin) when `to` is the zero address or a contract that doesn't accept ERC-1155 tokens. `totalMinted(id)` counts the pieces.

**Views:** `uri(id)` (reverts for an unknown id), `contractURI()`, `edition(id)`, `sellerOf`, `payoutOf`, `maxSupplyOf`, `totalMinted`, `createdAt`, `exists`, `editionCount`, `nextEditionAllowedAt`, `creator`, `pendingCreator`, `name`, `symbol`, plus standard ERC-1155.

**Events:** `EditionCreated(id, seller, payout, maxSupply, uri, sellerData, createdAt)` plus the standard `URI`; `CreatorTransferStarted`, `CreatorTransferred`; `ContractURIUpdated`; standard `TransferSingle` on every mint.

## LadderSeller v1

**Settings per edition**, in `sellerData = abi.encode(uint256 startPrice, uint256 topPrice, uint256 startTime)`:
- `0 < startPrice <= topPrice <= MAX_PRICE` (1,000,000 ETH).
- `startTime` is in seconds, at most `MAX_START_DELAY` (365 days) after creation; 0 means open at once. The limit catches a time given in milliseconds, which would otherwise leave the edition closed for good while using one of the two creation slots.
- The payout may not be the seller or the collection.
- `encodeSettings(...)` builds the bytes.

**Price of piece n** (1-indexed, edition size N):

```
price(n) = startPrice * (topPrice / startPrice) ^ ((n - 1) / (N - 1))
```

- Piece 1 is exactly `startPrice` and piece N exactly `topPrice`. N = 1, or `startPrice == topPrice`, gives `startPrice` throughout.
- Pieces in between are rounded down to `PRICE_STEP = 1e12` wei (0.000001 ETH) and kept within `[startPrice, topPrice]`, so prices never decrease.
- The first ladder (0.0005 to 0.5 ETH over 256) rises about 2.746% a step. It goes 0.0005, 0.000513, 0.000527, … 0.005 (piece 86), … 0.05 (piece 171), … 0.486637, 0.5. The whole edition is 18.690311 ETH.

**How it's computed, and why.** `configure` stores `lnRatio = lnWad(topPrice * 1e18 / startPrice)` once. Each price is then `startPrice * expWad(lnRatio * (n - 1) / (N - 1)) / 1e18`, using Solady's `FixedPointMathLib` (v0.1.26).
- **Why Solady:** it is widely used and audited, and pure Solidity with no dependencies. `lnWad` and `expWad` are accurate to about 1e-17, which is five orders of magnitude finer than the price step. PRBMath would also do; Solady is smaller and cheaper.
- **Why compute on-chain rather than store a table:** a 256-entry table per edition costs about 1.4M gas or more to store, and the creator would have to supply it. A wrong table would be accepted. The formula can't be mis-entered.
- **Rounding:** before rounding down, the price gets a relative allowance of 1e-15. Without it, prices that are exactly on a step come out a hair below and floor to the step under, so 0.005 and 0.05 ETH in the first ladder became 0.004999 and 0.049999. The allowance is far larger than the maths' error and far smaller than a step.
- **Checked against** tables computed off-chain at 80 significant digits (`reference/ladder.py`, Python standard library only). There are 14 fixed ladders, covering sizes 1, 2, 3, 100 and 256, flat, steep, gentle, endpoints off the step, a start below one step, and up to `MAX_PRICE` from 1 wei, plus 60 random ladders: 5,820 prices in all (2,354 + 3,466). Every price matches exactly. `MAX_PRICE` keeps the allowance below one step: above about 1e27 wei it would round some prices up a step, which the independent review found.

**Buying:** `mint(id, quantity, to)` is payable, with `quantity` from 1 to `MAX_PER_TX = 10`. `to` must be able to hold ERC-1155 tokens: an ordinary address, or a contract (including an EIP-7702 delegated account) that implements `onERC1155Received`. Others revert cleanly.
- The cost is the sum of the next `quantity` prices, the same as `quote(id, quantity)`.
- Send at least that. The actual cost is kept and any excess goes back to `msg.sender` in the same transaction, so a buyer who sends a margin still gets through if someone else mints first.
- Underpayment reverts with `Underpaid(cost, sent)`. So does a mint before `startTime`, beyond what's left, or for an unknown edition.
- Order: checks, then the counters, payment and `Minted` event, then the collection's mint, then the refund. A transient reentrancy guard covers `mint` and `release`.

**Payout:** payments build up per edition (`ladder(id).paid` and `.released`; `held(id)` is the difference). `release(id)` can be called by anyone and sends that edition's whole balance to its payout address, and nowhere else. If the payout rejects ETH, the release reverts and the balance waits for a later one; other editions are unaffected. There is no other way for ETH to leave. ETH forced in by `selfdestruct` is never counted and stays.

**Views:** `nextPrice(id)` (reverts when sold out), `priceOf(id, n)`, `quote(id, quantity)` (1 to 10, like `mint`; it doesn't check the opening time), `isOpen(id)`, `remaining(id)`, `sold(id)`, `held(id)`, `ladder(id)`, `collection`, `PRICE_STEP`, `MAX_PER_TX`, `MAX_PRICE`, `MAX_START_DELAY`.

**Events:** `EditionConfigured(id, payout, maxSupply, startPrice, topPrice, startTime)`, `Minted(id, buyer, to, firstPiece, quantity, cost)`, `Released(id, payout, amount)`.

**Minting from Etherscan** (so the sale doesn't depend on the site): on the seller's Read tab, call `quote(id, 1)`. On its Write tab, call `mint` with `id`, `quantity` and `to` (your address), and a `payableAmount` in ETH of the quote plus a margin; the excess comes back.

## Build and test

Foundry (tested with forge 1.7.1), solc 0.8.28, EVM `cancun`. Dependencies are git submodules pinned to tags: OpenZeppelin Contracts v5.7.0 (`cab19933`), Solady v0.1.26 (`acd959a`), forge-std v1.17.0 (`f3dae6e`).

```sh
git submodule update --init contracts/snowmoon-editions/lib/openzeppelin-contracts \
  contracts/snowmoon-editions/lib/solady contracts/snowmoon-editions/lib/forge-std
cd contracts/snowmoon-editions
forge test                                        # unit, fuzz (2,000 runs) and invariant (256 x 100) tests
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
  forge test --match-path test/fork/SepoliaRehearsal.t.sol -vv   # the dry run on a local Sepolia fork
forge test --match-contract GasTest --gas-report --isolate
slither . --filter-paths 'lib/|test/|script/'
python3 -I reference/ladder.py                    # regenerate the reference tables
```

On this machine, hold `/Users/nathan/.snowmoon-heavy.lock` for every build and test run.

## Deploying

See [DEPLOY.md](DEPLOY.md). Nate and the Safe deploy and create editions. The scripts never read a private key: they sign with `--ledger` or an encrypted `--account` keystore, or write a Safe Transaction Builder file for the signers.
