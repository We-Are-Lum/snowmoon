# Snowmoon editions: Sepolia dry run and mainnet deployment

DRAFT, written by an AI agent (Claude, made by Anthropic) for the owner's review.

Nate and the Safe sign everything. No script here reads a private key: they sign with `--ledger`, or with `--account <name>` (an encrypted keystore made once with `cast wallet import <name> --interactive`, which asks for the key and a password in the terminal). Never put a key in a file, an env var or chat.

All commands run in `contracts/snowmoon-editions`. Put non-secret settings in `contracts/snowmoon-editions/.env`, which git ignores:

```sh
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com
ETHERSCAN_API_KEY=<from etherscan.io, for source verification>
```

Then load it with `set -a; source .env; set +a`.

## What's already rehearsed (no keys, nothing sent)

`test/fork/SepoliaRehearsal.t.sol` runs the whole dry run on a local fork of Sepolia against the real Safe v1.4.1 and Splits v2.2 contracts:
- a 2-of-3 Safe;
- a PullSplit with six recipients, one of which rejects ETH;
- deploying both contracts;
- two editions created through the Safe, one of 256 and one of 5;
- minting all 256 pieces with a margin each time;
- release, distribute, and withdrawal from the Warehouse;
- a third edition refused one second before 30 days, then accepted at 30 days.

The scripts below were also run end to end on a local anvil fork of Sepolia, with unlocked test accounts and no keys: Deploy, EditionTx, Buy and Check.

## Sepolia dry run (Nate)

You need about 0.1 Sepolia ETH in the deployer/buyer wallet. The test ladder below costs 0.0766 ETH for both editions, plus gas.

**1. Test Safe.** On app.safe.global, on Sepolia, create a Safe with owners Nate, Garance and Luis, threshold 2. Note its address as `SAFE`.

**2. Test split.** On app.splits.org, on Sepolia, create a **Pull** split, immutable (no controller), with a distribution incentive of 0. Use the test recipients, for example your own three addresses with 10% to a stand-in collab pot and 5% to a stand-in treasury. Note it as `SPLIT`.
- Or: copy `splits/sepolia-test.example.json` to `splits/sepolia-test.json` with real recipients, sorted ascending, shares adding up to 1,000,000. Then run `SPLIT_JSON=splits/sepolia-test.json forge script script/CreateSplit.s.sol --rpc-url sepolia --account <name> --broadcast`.

**3. Test metadata.** Pin a collection JSON (`name`: "Snowmoon Editions", plus `description`, `image`, `external_link`) and one JSON per edition (see the handoff's Metadata section) on IPFS. An edition's own `name` or `description` can say it's a work in progress. Test pins are fine.

**4. Deploy and verify.**
```sh
CREATOR=$SAFE CONTRACT_URI=ipfs://<collection cid> \
forge script script/Deploy.s.sol --rpc-url sepolia --account <name> --broadcast --verify
```
Note the two printed addresses as `EDITIONS` and `SELLER`. The deployer keeps no role.

**5. Edition 1: 256 pieces**, on a cheap ladder with the same 1,000× shape (0.000002 to 0.002 ETH, 0.074636 ETH in all).
```sh
EDITIONS=$EDITIONS SELLER=$SELLER URI=ipfs://<edition 1 cid> SIZE=256 PAYOUT=$SPLIT \
START_PRICE_WEI=2000000000000 TOP_PRICE_WEI=2000000000000000 START_TIME=0 \
forge script script/EditionTx.s.sol --rpc-url sepolia
```
It sends nothing. It prints the ladder and writes `safe-tx/create-edition-1-11155111.json`. In the Safe app: Apps → Transaction Builder → load that file → create. A second owner signs, then execute.

**6. Edition 2: 5 pieces.** The same, with `SIZE=5 START_PRICE_WEI=100000000000000 TOP_PRICE_WEI=1000000000000000` (0.0001 to 0.001 ETH, 0.002155 ETH in all).

**7. Mint across the ladder.**
```sh
SELLER=$SELLER ID=1 forge script script/Buy.s.sol --rpc-url sepolia --account <name> --broadcast
SELLER=$SELLER ID=2 forge script script/Buy.s.sol --rpc-url sepolia --account <name> --broadcast
```
Also try one mint from Etherscan's Write tab on the seller: call `quote(1, 1)` first, then `mint` with a margin. Use `PIECES=250` on the first command if you want to keep some for that.

**8. Release.** Anyone can do it: `cast send $SELLER "release(uint256)" 1 --rpc-url sepolia --account <name>`, then the same for 2. Or use the Write tab.

**9. Distribute through the split.** On app.splits.org, open the split → Distribute (ETH) → each recipient withdraws.

**10. Third edition is refused.** `EditionTx` with edition 3's settings prints `allowed from … (NOT YET …)` and stops. To see the chain refuse it, run:
```sh
cast call $EDITIONS "createEdition(string,uint256,address,address,bytes)" ipfs://x 5 $SELLER $SPLIT \
  $(cast abi-encode "f(uint256,uint256,uint256)" 100000000000000 1000000000000000 0) --from $SAFE --rpc-url sepolia
```
It reverts with `TooSoon` (selector `0xe86f59ea`). Optionally propose it in the Safe too: the Safe app's simulation shows the failure, and executing it fails with `GS013` and changes nothing.

**11. Check.**
```sh
EDITIONS=$EDITIONS SELLER=$SELLER EXPECTED_CREATOR=$SAFE forge script script/Check.s.sol --rpc-url sepolia
```
It reads only, checks the name "Snowmoon Editions" and the symbol `SNOWMOON`, and ends with "all checks passed". Send me the addresses and the transaction links; I re-run the checks read-only and write them up.

`forge script` keeps a record of each broadcast in `broadcast/` (public data only). Commit the Sepolia and mainnet records. Don't commit runs against a local fork: those show chain id 11155111 too.

## Mainnet (after the owner's go)

Before anything:
- Nate has reviewed the Sepolia results and the independent review.
- A lawyer has looked at the sale wording and the ladder.
- The Terms, Privacy and principle 7 wording for the sale ship in the same release as the mint page, after the owner's reread.
- The real 2-of-3 Safe exists. Each edition's PullSplit is created from the deep-funding result plus the standing shares, and its address is checked against app.splits.org.

Steps:
1. Deploy with `--rpc-url mainnet --ledger --broadcast --verify` and the real `CREATOR` and `CONTRACT_URI`. Then run `Check.s.sol`.
2. For each edition: run `EditionTx.s.sol` against mainnet and read the printed ladder. Check that `PAYOUT` is that edition's split. Load the JSON in the Safe app; two signers check the calldata, sign and execute.
3. Run `Check.s.sol` again, and buy one piece yourself (from Etherscan) before announcing.

What can't be undone, so check twice: the payout address, the size, the metadata link, the start and top prices, and the opening time. An edition also uses one of the two slots in its 30 days, even if it's wrong.
