# Minpentai onchain, v1

Proposal for the owner. Written 2026-10-21 by the coding agent, from the spike on branch `minpentai-onchain` (local anvil only; nothing deployed).

## The idea

Play stays offchain and free. When a match is over, the player can record it on Base in one transaction, paying their own gas (about a tenth of a cent). Their match history is permanent. Rules can change later without changing what any past match means.

## How it works

1. **Ruleset.** A JSON manifest (`docs/minpentai/rulesets/solo-v1.json`) pins the engine: the full 40-character commit, the hash of every file the replay reaches (found from the TypeScript syntax tree), every rule (from the book, stated or implied, with block IDs; or invented for this edition) and each computer player. Its ID is the keccak256 of its canonical JSON (RFC 8785, ASCII and whole numbers only). A Python script with its own JSON and Keccak gets the same ID.
2. **Seed.** A player's nth match uses `keccak256(abi.encode(chainId, MatchLog, player, n))`, where n is how many they have recorded. The engine plays from its last 4 bytes, big-endian. The page can show the next seed before play.
3. **Play.** Offchain, exactly as today. The engine is deterministic: the same seed and moves give the same match in Node and in the browser, across the whole 32-bit seed range.
4. **Record.** The match is packed into about 80 to 230 bytes (format 2: version, ruleset ID, n, seed, opponent, claimed result, how and when it ended, the moves, and the final position as a sorted piece list). There is one valid byte form per match: the decoder re-encodes and refuses anything else.
5. **MatchLog** (no owner, admin or proxy) checks only the version, the length, and that the seed is the sender's own nth seed. Then it stores the match's hash under (player, n) and emits `MatchRecorded(player, rulesetId, n, data)`. It never reads the registry.
6. **RulesetRegistry** is append-only. Its owner adds rulesets (ID, manifest URI, author, remixed-from); nobody can edit or remove one. The owner can never be changed.
7. **Verifier** (`scripts/minpentai-verify.ts`) reads the events and replays each match under the engine its ruleset pins, rebuilt from git at the pinned commit when the working tree has moved on. Each match comes out verified, invalid (with the reason) or unknown ruleset.

## What is verified, and what is trusted

| Verified (anyone can check) | Trusted |
|---|---|
| The match is in the player's own history: only their wallet could record it, at that number, once. | The registry owner, to add only rulesets whose manifests are published and correct. |
| The moves are legal, and the claimed result, end step, end kind and final position are what the replay gives. | The pinned engine text staying available (git history, or an archive). |
| The ruleset is registered, and the replay ran the exact code its ID pins. | The verifier's RPC, and the MatchLog and registry addresses it is pointed at. |
| A record can never change or disappear. | Nothing about skill or fairness: see the first open decision. |

## Cost on Base

Measured 2026-10-21, read-only, against Base mainnet's public RPC: L2 gas from `record()` on a local anvil; the L1 data fee from the GasPriceOracle (`0x4200…000F`, `getL1Fee`) at 15 blocks over the last 7 days; priority fees from `eth_feeHistory`; USD from Chainlink's ETH / USD feed on Base (about $2,441 today). The L2 base fee sat at its 0.005 gwei floor all week. Raw data: `docs/proposals/data/minpentai-onchain-cost.json`.

| Match | Bytes | Gas | Today | Low | Typical | High |
|---|---|---|---|---|---|---|
| Short, player's first | 83 | 72,166 | $0.0011 | $0.0009 | $0.0011 | $0.0018 |
| Short, later | 83 | 55,078 | $0.0008 | $0.0007 | $0.0008 | $0.0014 |
| Median, first | 120 | 73,033 | $0.0011 | $0.0009 | $0.0011 | $0.0018 |
| Median, later | 107 | 55,789 | $0.0008 | $0.0007 | $0.0008 | $0.0014 |
| Long, first | 207 | 75,250 | $0.0011 | $0.0009 | $0.0011 | $0.0018 |
| Long, later | 183 | 57,499 | $0.0008 | $0.0007 | $0.0009 | $0.0014 |

Almost all of it is L2 gas; the L1 data fee is under $0.000003. A first match costs more because the player's count goes from zero to one. If Base's base fee rose tenfold in a busy hour, a match would cost about a cent.

## Independent review

A fresh reviewer, given only the code, manifest, fixtures and README, tried to break it. It could not record as someone else or twice for one n, make TypeScript and Solidity disagree, change a record, or get a fake match verified. It found four real breaks, all offchain, all fixed with tests:

1. The import walker was a regex: an oddly written import could hide engine code from the ruleset ID. Now it uses the TypeScript syntax tree and refuses any import it can't know.
2. The verifier hashed one copy of the engine and ran another. Now it runs a fresh copy of exactly the pinned text.
3. Hex with a stray character was silently trimmed. Now it's refused, and the CLI also checks each event against MatchLog's stored hash.
4. The rebuilt engine went into a shared temp folder, and the manifest's commit was never validated. Now it gets a fresh private folder, the commit must be 40 hex characters, and every pinned file hash is checked.

Kept as documented behaviour (tests in `MatchLogLimits.t.sol`): record from your own wallet, never through a shared forwarder (everyone using one forwarder shares its history); MatchLog accepts any bytes with a valid header, and readers decide; n is 4 bytes, so a wallet stops at about 4.3 billion matches.

## Deploy plan

1. Merge the branch with a merge commit, not a squash or rebase: the manifest pins commit `5db11b1…` by hash. If the history is rewritten, rebuild the manifest; the ruleset ID changes, which is fine before any deploy.
2. Tag every engine commit a manifest pins (for example `minpentai-engine-solo-v1`) and push the tags before deploying, so the commits can't be garbage-collected or lost to a rewritten branch (owner, 2026-10-21).
3. Put each manifest and its closure files (the exact text of every pinned file) on Arweave, and point the registry's manifest URI there (owner, 2026-10-21). Git stays a second copy.
4. Rehearse on Base Sepolia: deploy RulesetRegistry with a Safe as owner, deploy MatchLog, register solo-v1, record a few matches from test wallets, run the verifier against them, and verify both contracts' source on the explorer.
5. Mainnet: the same steps. The registry owner is a Safe, not a single key, so its signers can change later even though the owner address can't. The Safe starts with the owner as its only signer (owner, 2026-10-21).
6. Tell players to record from their own wallet (smart wallets are fine), never through a shared forwarder.
7. If commit-before-play is built (`minpentai-commit-before-play.md`), it replaces this MatchLog before any deploy: the page calls `start()` before a match and reads the seed from the seed block, instead of `nextSeed(player)`.

## Open decisions

- **Selective recording and fairness.** Decided: build commit-before-play (`minpentai-commit-before-play.md`, waiting for the owner's OK on the design). Every seed is known in advance and the computer player is deterministic, so a player can retry the same seed offline until they win, or grind wallets, and record only wins. The reviewer won at level 5 after 439 random tries. Today a history proves legal games, not skill. The fix is commit-before-play: a small transaction before the match fixes the seed and the level, and every committed match must be recorded or counts as a loss. That is a second transaction per match and a different MatchLog, so decide before mainnet.
- **The seed doesn't fix the level or ruleset.** Related: a player chooses the level and ruleset after seeing the seed. Commit-before-play would fix both.
- **Solo first, or PvP.** Solo works today. PvP needs both players' signed moves (see `minpentai-fog.md`).
- **An onchain profile.** History is already readable by wallet (`count`, `matchHash`, events). A profile (name, avatar, stats) could stay offchain on the You page, or be its own contract later.
- **A ranked mode.** Only meaningful after commit-before-play. Even then, solo fog can't be enforced: the player can compute the whole board from the seed.
- **Where manifests live.** Decided: Arweave, with git tags as a second copy (deploy plan, steps 2 and 3).
- **The verifier's addresses.** Pin the official MatchLog and registry addresses in the verifier, so it can't be pointed at a look-alike.
