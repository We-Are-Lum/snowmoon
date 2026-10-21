# Overnight report: Minpentai onchain v1, 2026-10-21

Branch `minpentai-onchain` (worktree `/Users/nathan/snowmoon-onchain`). Local anvil only; nothing pushed, merged or deployed; no private keys (anvil accounts impersonated). The anvil on port 8547 was not touched.

## Done

| Stage | Commit | Result |
|---|---|---|
| 1. Registry | `75d5e63` | An empty URI always reverts (fuzzed); the same ID can't be added twice, even in one transaction; an invariant run (random adds, empty URIs, zero and repeated IDs) shows each ID stored once and never changed. |
| 2. Verifier | `28db7e4` | 20 real matches from 5 wallets verified; 10 planted fakes caught with the right reason; the CLI and the engine rebuilt from git agree; 6 planted verifier bugs each make the test fail. |
| 3. Cost on Base | `e622ca7` | About $0.0008 to $0.0011 a match today; $0.0007 to $0.0018 over the past week. L1 data fee negligible. |
| 4. Review | `5fb6d50` | No break in the contracts. Four offchain breaks found and fixed with tests (import walker, verifier ran a different engine copy than it hashed, loose hex, temp-folder loading). Now: Forge 28 tests, ruleset 16, verifier 21, all passing. |
| 5. Proposal | `f4d2676` | `docs/proposals/minpentai-onchain-v1.md` |
| 6. Two docs | `78bd56e`, `e1a0b8e` | `minpentai-fog.md`, `minpentai-rule-modules.md` |

Ruleset ID (unchanged by the night's fixes): `0x99afca1f74da319bc2ead8c1b501833b7d15efa5022cd5b4566314068c371a6f`.

## Decisions I made for you

- Invariant tests run 256 times at depth 200 (the first run of 2,000 took 7.5 minutes).
- "Unknown ruleset" is split into "not in the registry" and "registered, but no engine here".
- The verifier also checks each event against MatchLog's stored hash.
- USD comes from Chainlink's ETH / USD feed on Base, so every number comes from one public RPC. Low, typical and high are the cheapest, median and dearest of 15 samples over 7 days, with the 10th, 50th and 90th percentile tip.
- Engines that use npm packages are refused by the verifier for now (v1 uses none).
- I kept the reviewer's Forge tests as `MatchLogLimits.t.sol` and deleted its scratch files.
- Not changed: two orders of squares and towers within one turn give two byte forms of the same game (gliders' order matters, theirs doesn't). It's harmless because each (player, n) records once. Say if you want one fixed order.
- Each verifier run leaves a small engine copy in the OS temp folder; I didn't add cleanup.

## What failed along the way

- Two test bugs, both fixed: addresses compared with different letter case; and, earlier, a Forge `prank` used up by the wrong call.
- The unrelated anvil on 8547 (a mainnet fork) has an Alchemy API key in its command line, readable by anyone who can list processes on the Mac. I left it alone.

## What needs you

1. **Commit-before-play, before any mainnet deploy.** Seeds are known in advance and the computer player is deterministic, so a player can retry offline and record only wins (the reviewer won at level 5 after 439 tries). Decide whether a history should prove fairness, which needs a second, small transaction per match and a different MatchLog, or only legal games.
2. **Where manifests and engine text live permanently** (IPFS, Arweave, or the repository at a fixed commit).
3. **The Safe's signers** for the registry owner.
4. **How to merge.** Use a merge commit, not a squash: the manifest pins a commit hash.
5. **Solo first or PvP**, and whether to build commit-reveal PvP next (`minpentai-fog.md`).
6. **Rule modules**: who may write them, and whether "people only" rules are allowed in solo (`minpentai-rule-modules.md`).
