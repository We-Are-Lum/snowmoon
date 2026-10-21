# Minpentai: commit before play (design)

For the owner's OK before building. Written 2026-10-21 by the coding agent. It replaces the one-transaction MatchLog (`minpentai-onchain-v1.md`); nothing is deployed yet.

## The flow

1. **start(rulesetId, level)** opens a match for `msg.sender`, fixing the ruleset, the level and n (their match number). One open match per wallet. Emits `MatchStarted(player, rulesetId, n, level, seedBlock, deadline)`.
2. **The seed** comes from a block that doesn't exist yet when start() is sent: `seedBlock = start's block + 2`.
   - `seed = keccak256(abi.encode(chainId, MatchLog, player, n, rulesetId, level, blockhash(seedBlock)))`.
   - About 4 seconds later the page reads that block's hash, shows the seed, and play begins. The engine still plays from the seed's last 4 bytes.
3. **record(data)** must match the open match's ruleset, level, n and seedBlock. It recomputes the seed onchain, reading the block hash from EIP-2935, then stores the hash and emits `MatchRecorded` as today.
4. **Deadline:** seedBlock + 8,000 blocks (4 h 27 min). Before it, any result can be recorded. After it, only a loss or a resign.
5. **Forfeit:** a match not recorded by the deadline is a forfeit.

## Where the seed comes from (Base, checked 2026-10-21 against mainnet)

| Source | Unknown at start()? | Checkable when record() comes | Verdict |
|---|---|---|---|
| **A future block hash, read through EIP-2935** | Yes: block start+2 isn't built when start() is sent. | Base has EIP-2935 live: its history contract served all 8,191 recent block hashes (about 4 h 33 min) and refused 8,192 back. After that, any Base node's block headers still have it, offchain. | **Recommended.** No extra transaction. |
| A future block hash, BLOCKHASH opcode only | Yes | Only for 256 blocks (8.5 minutes), so it needs a third "reveal" transaction | Worse than EIP-2935 |
| prevrandao | **No.** Measured: it holds one value for 6 L2 blocks (12 s) and is the randao of the L1 block Base follows, already public on Ethereum before those L2 blocks are built. | Yes | Rejected: predictable |
| A seed signed by the site | Yes, if the site is honest | Yes | Rejected: needs the site online and trusted, and a site key |
| Chainlink VRF | Yes | Yes | Rejected: a fee per request, an async callback, and a subscription someone must own and fund (an admin in a no-admin contract) |

Trust left in the recommended source: Base's sequencer (Coinbase) could in principle steer a block hash by choosing block contents; players can't.

## Forfeits: marked in the contract, and counted by the verifier

- **In the contract, lazily.** When the wallet next calls start(), or anyone calls `close(player)` after the deadline, the open match is closed as a forfeit: a forfeit marker under (player, n), n moves on, and `MatchForfeited(player, n)` is emitted.
- **Why the contract.** n must advance, so every started match ends as exactly one of recorded or forfeited, with no gaps. Readers (the site, a profile) can count forfeits from storage and events without replaying anything, and nobody can undo a forfeit.
- **Why the verifier too.** A wallet that walks away never triggers the close. The verifier reads `MatchStarted` and treats any match still open past its deadline as a forfeit.
- **Losses after the deadline.** A loss or resign can still be recorded while the match is open, and counts as a recorded loss with its moves. Inside the 8,191-block window the seed is checked onchain. Past it, the contract accepts a loss without that check, and the verifier checks the seed against the block header. A loss gains the player nothing, so this is safe.

## Gas and cost

Measured with a prototype on a local anvil running Prague, which has the same EIP-2935 contract. The prototype keeps the open-match slot between matches, so later starts are cheap.

| | start() | record() (83 to 207 byte match) | Per match | On Base today |
|---|---|---|---|---|
| A player's first match | 71,800 | 85,100 | about 157,000 | about $0.0023 |
| Every later match | 34,800 | 68,700 to 71,100 | about 105,000 | about $0.0015 (high: $0.0026) |

Today's one-transaction design is about 56,000 gas ($0.0008) a match, so commit-before-play roughly doubles the cost. Prices use last night's sampling: L2 base fee 0.005 gwei, a 0.001 gwei tip (0.005 gwei for "high"), ETH at about $2,441. The L1 data fee, under $0.00001 for both transactions, is included.

## What it fixes, and what it doesn't

- **Fixed: selective recording.** Every started match ends recorded or forfeited, so retrying a seed offline gains nothing: the next seed is unknown until the next start().
- **Fixed: level and ruleset chosen after seeing the seed.** Both are now fixed at start() (review finding D2).
- **Left: many wallets.** A player can start in many wallets and play only the best seed. Each start costs about $0.0005 and leaves a forfeit in every other wallet. Rankings should count per identity (a Farcaster-linked wallet), not per raw wallet.
- **Left: a reorg after the seed is shown.** If Base reorganised the seed block, the record would fail and the match would become a forfeit. This is very rare on Base.
- **Longer deadlines.** Past about 4 h 33 min, a win can't be checked onchain. If you want a longer deadline, a permissionless `seal(player)` could copy the block hash into storage (about 25,000 gas, a third transaction). I don't recommend it for v1.

## Recommendation

Build it as above, with these details:
- the seed is the hash of block start+2, read through EIP-2935;
- the deadline is 8,000 blocks (about 4.5 hours), and losses can still be recorded after it;
- forfeits are marked by the contract lazily, and counted by the verifier for wallets that never return;
- encoding format 3 adds the seed block number (8 bytes) and fixes the level's position in the bytes.
