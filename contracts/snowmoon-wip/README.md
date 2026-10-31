# Snowmoon WIP: the mint contract

DRAFT, written by an AI agent (Claude, made by Anthropic) for the owner's review. Nothing here is deployed.

An open-edition ERC-1155 for **Snowmoon WIP**: work-in-progress versions of characters, places and scenes from snowmoon.party's open adaptation of *Snowmoon* by Vitalik Buterin (GPL-3.0). Independent; not affiliated with the author. Licence: GPL-3.0-or-later. Built on OpenZeppelin Contracts v5.7.0 (MIT).

The contract is `src/SnowmoonWIP.sol`, about fifty lines of sale logic on top of OpenZeppelin's `ERC1155`, `Ownable2Step` and `ReentrancyGuardTransient`.

## What it does

- **The owner creates tokens, and that is the owner's only power.** `createToken(uri, price, start, end, payout)` fixes the metadata URI, the price in wei, the sale window and the payout address. No function changes them afterwards.
  - It checks the URI isn't empty and the price isn't zero.
  - It checks `start < end`, and that `end` is still in the future.
  - It checks the payout isn't the zero address or the contract itself, and that it's a deployed contract (`payout.code.length > 0`). An EOA, or a split not yet created, is refused with `PayoutNotContract`.
- **Anyone mints** with `mint(id, quantity, to)`, paying exactly `price × quantity` wei.
  - The mint is open from `start` (inclusive) until `end` (exclusive): `start <= block.timestamp < end`.
  - The payment is recorded against the token before `_mint` runs, since `_mint` calls `onERC1155Received` when `to` is a contract.
- **Anyone releases** with `release(id)`, which sends that token's whole recorded balance to its payout address and nowhere else.
  - The balance is zeroed before sending.
  - If the payout rejects the ETH, the call reverts and the balance stays recorded for a later release.
  - With a 0xSplits PushSplit as the payout, it doesn't reject.
- **`uri(id)`** returns each token's own URI. **`contractURI()`** returns the collection's metadata (ERC-7572), set once at deploy.
- **Events:**
  - `TokenCreated` (plus the standard ERC-1155 `URI`);
  - `Minted` (plus `TransferSingle`);
  - `Released`.

## What it doesn't do

- No upgrades, pause, royalties, owner withdrawal, allowlist, `setURI`, or any setter.
- No `receive` or `fallback`, so a plain ETH transfer to the contract reverts.
- ETH forced in some other way stays in the contract for good. That covers `selfdestruct`, a block reward, or ETH already at the address before deploy. It's never counted in any token's proceeds, and no function can send it out.
- No supply cap: it's an open edition. No free mints, since the price is never zero.

## Ownership

Ownership is `Ownable2Step`: it transfers in two steps (`transferOwnership`, then `acceptOwnership` by the new owner), and `renounceOwnership` is allowed. The owner keeps ownership after the mint. The owner's reason (2026-10-31): "Renouncing can't touch existing tokens or their proceeds, and it's my one-call stop if my wallet is ever compromised."

## Interface

```solidity
function createToken(string uri, uint256 price, uint64 start, uint64 end, address payable payout) external returns (uint256 id); // owner only
function mint(uint256 id, uint256 quantity, address to) external payable;
function release(uint256 id) external;

function uri(uint256 id) external view returns (string memory);
function token(uint256 id) external view returns (Token memory); // uri, price, start, end, payout
function isOpen(uint256 id) external view returns (bool);
function proceeds(uint256 id) external view returns (uint256);   // recorded, not yet released
function totalProceeds() external view returns (uint256);
function tokenCount() external view returns (uint256);            // ids run 1..tokenCount
function contractURI() external view returns (string memory);
function name() external view returns (string memory);
function symbol() external view returns (string memory);
// Plus standard ERC-1155 (OpenZeppelin) and Ownable2Step: owner, pendingOwner, transferOwnership, acceptOwnership, renounceOwnership.
```

## Build and test

The project needs [Foundry](https://getfoundry.sh) (tested with forge 1.7.1). Its dependencies are git submodules, pinned to tags:
- OpenZeppelin Contracts v5.7.0, `cab19933`;
- forge-std v1.17.0, `f3dae6e6`.

Solc is pinned to 0.8.28, with the `cancun` EVM.

```sh
git submodule update --init contracts/snowmoon-wip/lib/openzeppelin-contracts contracts/snowmoon-wip/lib/forge-std
cd contracts/snowmoon-wip
forge build
forge test                       # unit, fuzz and invariant tests; the fork test is skipped
MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com \
  forge test --match-path test/fork/PushSplitFork.t.sol -vv   # mainnet-fork test, read-only
slither src/SnowmoonWIP.sol --filter-paths lib/
```

The fork test creates real Splits v2 PushSplits (v2.1 and v2.2 factories) on a local fork of mainnet. Recipients include a contract that rejects ETH. The test releases to the split and distributes, then checks that:
- the other recipients are paid;
- the rejecting recipient's share is held for it in SplitsWarehouse.

Nothing is sent to any network.

## Splits v2 addresses

These come from `packages/splits-v2/deployments/1.json` and `11155111.json` in [0xSplits/splits-contracts-monorepo](https://github.com/0xSplits/splits-contracts-monorepo/tree/main/packages/splits-v2/deployments). The addresses are the same on mainnet and Sepolia, and the code was checked present on both on 2026-10-31.

| Contract | Address |
|---|---|
| PushSplitFactory v2.2 (use this) | `0x8E8eB0cC6AE34A38B67D5Cf91ACa38f60bc3Ecf4` |
| PushSplitFactory v2.1 | `0xDc6259E13ec0621e6F19026b2e49D846525548Ed` |
| SplitsWarehouse | `0x8fb66F38cF86A3d5e8768f8F1754A24A6c661Fb8` |
| Native ETH token id in the warehouse | `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` (as uint256) |

Create a split with `createSplit((address[] recipients, uint256[] allocations, uint256 totalAllocation, uint16 distributionIncentive), address owner, address creator)`:
- owner is `address(0)`, so the split is immutable;
- `distributionIncentive` is `0`;
- allocations are out of `totalAllocation`, with 1,000,000 = 100% being the convention.

Distribute with `distribute(split, 0xEeee…EEeE, distributor)`, passing the same struct.

A PushSplit keeps 1 wei, plus a few wei of rounding, for the next distribution. A recipient that can't take ETH within 100,000 gas gets its share as a SplitsWarehouse balance instead.

## Deploy checklist (for the owner)

**Claude Code never handles keys.** Every step marked **you sign** is done in your own wallet. With Foundry, `--browser` opens your browser wallet to sign, and `--ledger` works for a Ledger. Never use `--private-key` or `-i`. Run from `contracts/snowmoon-wip/` after `forge build`. `$RPC` is any RPC URL: `https://ethereum-sepolia-rpc.publicnode.com` for Sepolia, or `https://ethereum-rpc.publicnode.com` for mainnet.

### Dates

**The sale dates come from the site's challenge config**, which isn't on `main` yet; don't copy them from this file. The current example window is **7 to 18 December 2026**, and it may change again. Each token's `start` and `end` are unix timestamps passed to `createToken`.

**The time of day is yours to set.** These examples assume **09:00 Pacific**, the time of the calls, for both start and end. `end` is exclusive, so the last mint is at 08:59:59 on 18 December. To include the 18 December call, pick a later end.

```sh
# macOS
TZ=America/Los_Angeles date -j -f "%Y-%m-%d %H:%M:%S" "2026-12-07 09:00:00" +%s   # 1796662800 (start)
TZ=America/Los_Angeles date -j -f "%Y-%m-%d %H:%M:%S" "2026-12-18 09:00:00" +%s   # 1797613200 (end)
# Linux (GNU date)
date -d 'TZ="America/Los_Angeles" 2026-12-07 09:00' +%s
# Check a timestamp back
TZ=America/Los_Angeles date -r 1796662800        # macOS; Linux: date -d @1796662800
```

### 0. Before any deploy: run every test, including the fork test (required)

All of these must pass on the exact commit you deploy. The fork test is not optional: it is the only test against the real Splits contracts.

```sh
forge test                                    # unit, fuzz (1,000 runs) and invariant tests
MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com \
  forge test --match-path test/fork/PushSplitFork.t.sol -vv   # must show 2 passed, not skipped
```

### 1. Sepolia dry run

Do the whole run with Sepolia ETH; make the window short.

1. **Deploy** (you sign):
   ```sh
   forge create src/SnowmoonWIP.sol:SnowmoonWIP --rpc-url $RPC --browser --broadcast \
     --constructor-args <YOUR_ADDRESS> "Snowmoon WIP" "SMWIP" "ipfs://<collection-cid>"
   ```
2. **Deploy a recipient that rejects ETH** (you sign). This is the test helper `EthRejecter`, which has no `receive`:
   ```sh
   forge create test/utils/Helpers.sol:EthRejecter --rpc-url $RPC --browser --broadcast
   ```
3. **Create a PushSplit** (you sign). Use the v2.2 factory, with owner `address(0)`, incentive 0, and recipients including the rejecter. For example, two of your own addresses at 50% and 30%, and the rejecter at 20%:
   ```sh
   cast send 0x8E8eB0cC6AE34A38B67D5Cf91ACa38f60bc3Ecf4 \
     "createSplit((address[],uint256[],uint256,uint16),address,address)" \
     "([<A>,<B>,<REJECTER>],[500000,300000,200000],1000000,0)" \
     0x0000000000000000000000000000000000000000 <YOUR_ADDRESS> \
     --rpc-url $RPC --browser
   ```
   The split's address is topic 1 of the `SplitCreated` log (`cast receipt <tx> --rpc-url $RPC`), and is on Etherscan's transaction page.
   **Before `createToken`, check the split on that chain.** Its owner must be zero, and its code must exist:
   ```sh
   cast call <SPLIT> "owner()(address)" --rpc-url $RPC   # must print 0x0000000000000000000000000000000000000000
   cast codesize <SPLIT> --rpc-url $RPC                  # must be greater than 0
   ```
4. **Create a token** (you sign). Use the real price, **0.003 ETH = `3000000000000000` wei per edition**; it's fixed forever at creation. Use a window starting now and ending in an hour or two:
   ```sh
   cast send <WIP> "createToken(string,uint256,uint64,uint64,address)" \
     "ipfs://<token-cid>" 3000000000000000 $(date +%s) $(( $(date +%s) + 7200 )) <SPLIT> \
     --rpc-url $RPC --browser
   cast call <WIP> "token(uint256)((string,uint256,uint64,uint64,address))" 1 --rpc-url $RPC
   ```
5. **Mint** (you, or a second wallet, sign). Try 3 editions at 0.003 ETH (0.009 ETH in all); also try a wrong amount and see it revert:
   ```sh
   cast send <WIP> "mint(uint256,uint256,address)" 1 3 <TO> --value 9000000000000000 --rpc-url $RPC --browser
   ```
6. **Release** (any wallet signs): `cast send <WIP> "release(uint256)" 1 --rpc-url $RPC --browser`. Check `cast balance <SPLIT>` and that `proceeds(1)` is 0.
7. **Distribute** (any wallet signs), with the same struct as step 3:
   ```sh
   cast send <SPLIT> "distribute((address[],uint256[],uint256,uint16),address,address)" \
     "([<A>,<B>,<REJECTER>],[500000,300000,200000],1000000,0)" \
     0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE <YOUR_ADDRESS> --rpc-url $RPC --browser
   ```
8. **Check:**
   - A and B received their shares.
   - The rejecter's share is held in SplitsWarehouse: `cast call 0x8fb66F38cF86A3d5e8768f8F1754A24A6c661Fb8 "balanceOf(address,uint256)(uint256)" <REJECTER> 1364068194842176056990105843868530818345537040110 --rpc-url $RPC`. That big number is `0xEeee…EEeE` as uint256.
   - The split keeps only a few wei.
9. Optionally, after the window, check that `mint` reverts with `MintNotOpen`.

### 2. Verify the source

After both deploys, verify the source. Etherscan needs your own API key, kept in your shell env, never in chat. Sourcify needs none.

```sh
forge verify-contract <WIP> src/SnowmoonWIP.sol:SnowmoonWIP --chain sepolia --watch \
  --constructor-args $(cast abi-encode "constructor(address,string,string,string)" <YOUR_ADDRESS> "Snowmoon WIP" "SMWIP" "ipfs://<collection-cid>")
# add --etherscan-api-key "$ETHERSCAN_API_KEY" for Etherscan, or --verifier sourcify
```

Once it's verified, Etherscan's "Write Contract" tab can mint and release without the site.

### 3. Mainnet

1. **Pin the collection metadata** on IPFS (`contractURI`, ERC-7572: `name`, `description`, `image`, `external_link`).
2. **Deploy** with name `"Snowmoon WIP"`, symbol `"SMWIP"` and the collection URI, then verify (you sign). The constructor args are `<YOUR_ADDRESS> "Snowmoon WIP" "SMWIP" "ipfs://<collection-cid>"`.
3. **For each final version:**
   - check every recipient address works on mainnet and screen it;
   - create its PushSplit (you sign);
   - before `createToken`, read the split's `owner()` (must be `0x0…0`) and its `cast codesize` on mainnet (must be above 0), as in step 1.3;
   - pin its metadata;
   - `createToken` with the split as payout, price **`3000000000000000` wei (0.003 ETH) per edition**, and the dates from the challenge config (you sign). The price, like every term, is fixed forever at creation:
     ```sh
     cast send <WIP> "createToken(string,uint256,uint64,uint64,address)" \
       "ipfs://<token-cid>" 3000000000000000 <START> <END> <SPLIT> --rpc-url $RPC --browser
     ```
4. **Read back each token** with `token(id)`, and compare it with the plan before announcing.
5. **When the window closes,** anyone runs `release(id)`, then `distribute` on the split.

Metadata on IPFS is fine. The site's token pages show images from the site's own storage, not from an IPFS gateway; that is site work.
