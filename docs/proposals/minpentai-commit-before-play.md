# Minpentai: commit before play (design)

Approved by the owner on 2026-10-21 with two changes (below) and built on branch `minpentai-onchain` (local anvil only; nothing deployed). It replaces the one-transaction MatchLog (`minpentai-onchain-v1.md`).

The owner's changes: after the deadline, record() always reverts; the only way to end an expired match is a forfeit. start() while a match is open forfeits it, before or after the deadline, and emits the forfeit.

## The flow

1. **start(rulesetId, level)** opens a match for `msg.sender`, fixing the ruleset, the level and n (their match number). One open match per wallet. Emits `MatchStarted(player, rulesetId, n, level, seedBlock, deadline)`.
2. **The seed** comes from a block that doesn't exist yet when start() is sent: `seedBlock = start's block + 2`.
   - `seed = keccak256(abi.encode(chainId, MatchLog, player, n, rulesetId, level, blockhash(seedBlock)))`.
   - About 4 seconds later the page reads that block's hash, shows the seed, and play begins. The engine still plays from the seed's last 4 bytes.
3. **record(data)** must match the open match's ruleset, level, n and seedBlock. It recomputes the seed onchain, reading the block hash from EIP-2935, then stores the hash and emits `MatchRecorded` as today.
4. **Deadline:** seedBlock + 8,000 blocks (4 h 27 min). record() works from seedBlock + 1 up to and including the deadline block, and always reverts after it.
5. **Forfeit:** an expired match ends only as a forfeit: `close(player)` (anyone, after the deadline) or the wallet's next start(). start() while a match is open forfeits it at any time, and emits `MatchForfeited`.

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

- **In the contract.** When the wallet calls start() with a match open (at any time), or anyone calls `close(player)` after the deadline, the open match is closed as a forfeit: a forfeit marker under (player, n), n moves on, and `MatchForfeited(player, rulesetId, n)` is emitted.
- **Why the contract.** n must advance, so every started match ends as exactly one of recorded or forfeited, with no gaps. Readers (the site, a profile) can count forfeits from storage and events without replaying anything, and nobody can undo a forfeit.
- **Why the verifier too.** A wallet that walks away never triggers the close. The verifier reads `MatchStarted` and treats any match still open past its deadline as a forfeit.
- **No late records.** After the deadline record() reverts whatever the claim, so every record's seed is checked onchain inside EIP-2935's window. The verifier also checks every seed against the block headers.

## Gas and cost

Measured on the built contract, on a local anvil running Prague (the same EIP-2935 contract as Base): start(), then record() of a real match. The open-match slot is kept between matches (only its flag is cleared; start() rewrites every field), so later starts are cheap. Priced against Base mainnet, read-only, on 2026-10-21 (ETH about $2,513; 15 blocks over 7 days; L1 data fee for both transactions included). Data: `docs/proposals/data/minpentai-commit-before-play-cost.json`.

| | start() | record() | Per match | Today | Low to high |
|---|---|---|---|---|---|
| A player's first match | 71,728 | 85,801 to 88,114 | about 158,000 | $0.0024 | $0.0019 to $0.0039 |
| Every later match | 34,728 | 68,713 to 69,991 | about 104,000 | $0.0016 | $0.0013 to $0.0026 |

The one-transaction design was about 56,000 gas ($0.0008) a match.

## What it fixes, and what it doesn't

- **Fixed: selective recording.** Every started match ends recorded or forfeited, so retrying a seed offline gains nothing: the next seed is unknown until the next start().
- **Fixed: level and ruleset chosen after seeing the seed.** Both are now fixed at start() (review finding D2).
- **Left: many wallets.** A player can start in many wallets and play only the best seed. Each start costs about $0.0005 and leaves a forfeit in every other wallet. Rankings should count per identity (a Farcaster-linked wallet), not per raw wallet.
- **Left: a reorg after the seed is shown.** If Base reorganised the seed block, the record would fail and the match would become a forfeit. This is very rare on Base.
- **Longer deadlines.** Past about 4 h 33 min, a win can't be checked onchain. If you want a longer deadline, a permissionless `seal(player)` could copy the block hash into storage (about 25,000 gas, a third transaction). I don't recommend it for v1.

## As built

- The seed is the hash of block start+2, read through EIP-2935. The history address is a constant, and record() reverts if it has no code or gives no hash.
- The deadline is 8,000 blocks (about 4.5 hours) after the seed block, inclusive. After it, record() always reverts.
- Forfeits are marked by the contract: by close() after the deadline, or by the wallet's next start() at any time. The verifier also counts a match still open past its deadline as a forfeit.
- Encoding format 3 adds the seed block number (8 bytes) and fixes the level's position in the bytes, so record() can check every field start() fixed.
