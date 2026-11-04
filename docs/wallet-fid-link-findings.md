# Wallet ↔ FID link: findings, 2026-11-03/04 (DRAFT)

Written by the coding agent (Claude, a model made by Anthropic). Branch `wallet-fid-link`. DRAFT until the owner approves it.

## The owner's addresses (FID 6786, @naaate). From Neynar, user/bulk?fids=6786
- Custody address: `0x463783f68f7b90fa3ed9127cd7103c5449f28d4f`
- 12 verified ETH addresses. The primary is `0x8621ffa9fd2b61bfa485798a1082d23dc920e8d1`. The list includes `0xc1aebd6f0d37611d744b0ecd0865984fbcb4b4c4`.

The site's `NEYNAR_API_KEY` isn't in `.env.local`, and `vercel env pull` gives a placeholder for it, because it is a sensitive variable. The lookups were therefore made with Neynar's public docs key (`NEYNAR_API_DOCS`, through curl), which hits the same endpoint.

## Neynar bulk-by-address
| Address | `verified_address` (the site's query) | `custody_address` | both |
|---|---|---|---|
| custody `0x4637…8d4f` | **404 No users found** | 200, FID 6786 | 200, FID 6786 |
| verified `0xc1ae…b4c4` | 200, FID 6786 | 404 | 200, FID 6786 |

A checksummed (mixed-case) query comes back keyed in lower case.

## What production stored. Read-only, as studio_writer
- `wallet_accounts` id 24, `0xc1ae…b4c4` (a VERIFIED address), created 2026-11-03 20:47:42Z. It is the only account among all of 6786's custody, verified and auth addresses.
- `wallet_fid_lookups` account 24: fids {6786}, at 20:47:43.6Z. This is the only lookup row.
- `wallet_links` id 3: account 24 → FID 6786, how 'verified', at 20:47:43.9Z, still active. The other links are the two seeded ones (accounts 20 and 17).

So the server did link the wallet, 1.3 s after sign-in.

## Root cause
1. **What he saw.** The menu shows a wallet session's shortened address (`wallet.short` from localStorage) even when the wallet is linked. The wallet panel's balance route only read the link (`linkOf`) and never tried the automatic one. If the panel loaded before the first getPerson request, it offered "Link this wallet", and it didn't refresh afterwards.
2. **Custody addresses were never matched.** The site sent `address_types=verified_address` and counted only `verified_addresses`. For a custody address Neynar answers 404, so it never linked. The old test said so on purpose: "a custody address … is not linked".
3. **Only one path linked.** The automatic link ran only in getPerson for a wallet signed in alone. A wallet signed in beside a Farcaster sign-in, or the balance route, never triggered it.

Ruled out:
- Letter case: everything is compared in lower case.
- Multiple FIDs: the address is on 6786 only.
- A stale cache: the one cached answer is right.

## Fix (commit 5dcc9ea)
See the commit message. A backfill isn't needed: the owner's wallet is already linked. Any other wallet is linked at its next signed-in request, once its kept answer (at most a day old) has expired. Only one lookup row exists today, and it is correct.

## Not run when the laptop closed
`test:agents` and `check:ui` need `next build`; `.next` was deleted to free disk. What did run:
- tsc: ok.
- test:wallet: 193 passed.
- check:principles on production: 56/58. P6d is accepted. P6k fails on purpose until the owner rereads the Privacy draft.
