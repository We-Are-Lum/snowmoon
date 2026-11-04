# Fund page: the Terms line and the page's words (DRAFT, for the owner's reread)

Written by the coding agent (Claude, a closed model by Anthropic), 2026-11-04, on branch `fund-page`. DRAFT until the
owner rereads it. The Terms line below is already in `src/lib/legal.ts` on this branch, so the Terms page shows "Draft
wording" until the owner says "reread" (P6k). It ships in the same merge as the page (owner, 2026-10-18: legal texts
describe today).

## What changes

Owner, 2026-11-04: menu label "Fund", page title "Fund this project", the link in the menu's first section under
"Remix the cast", the footer link kept, and a new address that receives ETH and USDC on Ethereum and Base with no
conversion.

- **The address:** `0xe29f1FC6B5afEd31897e8B388d9c1145a4e819d5`. Owner's correction of 2026-11-04: a **Splits Teams
  account**, a smart account the team controls, not a split and not an ordinary wallet.
  - Set up on Base (tx `0xac8790fb…051d`, block 53474251) and on Ethereum (tx `0xd9c5396d…a68a`, block 26336698).
  - The same 61-byte ERC-1967 proxy on both chains, implementation `0x15ec0fa6…f3fa`, factory `0x8e6af8ed…7c`, owner
    `0xe0e5c6e8…aa`. Code read on both chains on 2026-11-04.
- **Per-chain readiness:** `FUND.chains: { base: true, ethereum: true }` in `src/lib/config.ts`. The page names and
  offers only a ready chain. Principle check P7c reads `eth_getCode` at the address on each ready chain and fails if
  it's empty.
- **The route:** `/fund`. `/support` redirects there (permanent), so old links and QR codes keep working.
- **The old address** (`0x93eC…73a3`, a Splits account) is no longer shown. Prepaid generations keep their own
  address (`IMAGES.prepaid.payTo`, `0x4FEA…4FfA`), unchanged.
- **The mint's team share** (the Lake in each Snowmoon WIP split) goes to the Fund account
  (`contracts/snowmoon-wip/README.md`, "The team's share"). Nothing is deployed.

## Terms §6c, as drafted

Today (reread 2026-10-31):

> **6c. Support.** You can send money to the address on the Support page (a Splits account on Ethereum or Base) to
> support the We Are Lum team, who make the Service. It's a gift: it buys nothing on the Service, isn't an investment,
> can't be refunded and isn't tax-deductible (Lum LLC is not a charity). Send it only on the networks the page names;
> money sent on any other network may be lost. How it's shared out is public on Splits.

Proposed (in `src/lib/legal.ts` on this branch):

> **6c. Fund.** You can send money to the address on the Fund page (a Splits Teams account, on the networks the Fund
> page names) to fund the We Are Lum team, who make the Service. It's a gift: it buys nothing on the Service, isn't an investment,
> can't be refunded and isn't tax-deductible (Lum LLC is not a charity). Send it only on the networks the page names;
> money sent on any other network may be lost. The account is a smart account the team controls, not a split: nothing
> divides what it receives automatically. Everything it receives and sends is public on each network.

What changed, and why:

- **"Support" → "Fund"**, and "the Support page" → "the Fund page": the owner's new names.
- **"a Splits account" → "a Splits Teams account"**: what the address is.
- **"How it's shared out is public on Splits." is replaced** by two sentences:
  - "The account is a smart account the team controls, not a split: nothing divides what it receives automatically."
    The old line implied a split dividing the money by fixed shares. This account doesn't; the team decides what it
    pays out.
  - "Everything it receives and sends is public on each network." This is what is actually public: the account's
    transactions on Basescan and Etherscan. Splits' own app may show it too, but that's Splits' choice, so the line
    doesn't promise it.
- **The rest is word for word** the owner's text of 2026-10-31.

For the reread:

1. **"to fund the We Are Lum team"** keeps the owner's earlier "support the We Are Lum team". Alternative: "to fund
   this project, made by the We Are Lum team". Either way the money goes to the team's account, which the line now
   says.
2. **"on Ethereum or Base"** names both chains, since both are ready. If a chain is ever marked not ready, the page
   stops offering it, and this line would need the same change. Alternative wording, which never needs changing:
   "(a Splits Teams account, on the networks the Fund page names)".
3. **"isn't tax-deductible (Lum LLC is not a charity)"**: unchanged.

## The owner's choices, 2026-11-04 (reread pack, item 8)

- **8.1** "the first": "to fund the We Are Lum team".
- **8.2** "the second": "(a Splits Teams account, on the networks the Fund page names)". It's in `legal.ts` above.
- **8.3** The footer reads "Fund this project".
- **8.4** "as recommended": no change. "Fund" stays under "Remix the cast"; non-admins don't see that item while the
  challenge is admin-only.

These choose the words. The owner's "reread" of §6c comes separately; `LEGAL.ownerReread.terms` stays as it is until
then.

## The page's words

In `src/lib/support-wording.ts`. Only the first three are new.

| Where | Today | Proposed |
| --- | --- | --- |
| Menu (first section, under "Remix the cast") | (not in the menu) | **Fund** |
| Page title | Support the We Are Lum team | **Fund this project** |
| Footer and About link | Support the We Are Lum team | **Fund this project** (the owner's choice, 2026-11-04, item 8.3) |
| The line | We make snowmoon.party. Send ETH or USDC on Ethereum mainnet or Base to this address, or send below. | Unchanged while both chains are ready. It names only ready chains: with only Base ready it reads "… on Base to this address, or send below." |
| The warning | Other networks: funds may be lost. | Unchanged |
| Network choice | Base · Ethereum | Only the ready chains (both today) |

No word on the page mentions Splits. check:ui fails if `splits.org` or "donate" appears on it.

## Privacy: no change

Nothing about a sender is recorded, as before (test:support S6: the page and the send call no API of ours; the
component asks only GET /api/eth-usd, which takes nothing about the reader). The new check (P7c) runs in
check:principles only. It asks two public RPCs, Base's `mainnet.base.org` and `ethereum-rpc.publicnode.com`, for the
Fund address's code. It carries nothing about a visitor, and pages never call it.

The optional funders list (`docs/proposals/funders-list.md`) would need Privacy lines first, in its own release.
