# Snowmoon remix challenge, deep funding test and Snowmoon WIP mint

## Corrections (owner, 2026-10-31), these override the text below

- mint() does make one outside call: _mint calls onERC1155Received when `to` is a contract. Record the payment before minting, and test a receiver that re-enters mint and release.
- Payout is a Splits v2 PushSplit, not a PullSplit: owner address(0), distribution incentive 0, ETH only. The Sepolia dry run must include a recipient that rejects ETH, to show its share is held by Splits and the others still get paid.
- On snowmoon.party, token and version pages show images from our own storage, never an IPFS gateway. "Posted on" shows text and a link only: no avatars or embeds from the networks (P6a).
- "Add where you posted it": read the URL, check the host is one of the three networks, then fetch the post from that network's API. Never fetch the pasted URL itself.
- Bluesky searchPosts on the public API has deliberately returned 403 to cut load. Check it; if it needs a signed-in account, report back and keep manual add.
- The originality answers need their own score (e.g. the squared gap in log-odds), not the log-ratio one.
- No tracking of agent-drafted entries; I'm asking Luis to make his by hand.
- Dates (owner, 2026-10-31): entries close Sun 22 Nov 23:59 PT; shortlist vote and jurors Tue 1 to Thu 3 Dec; results at the Fri 4 Dec call; mint opens Tue 8 Dec 9:00 PT and closes at the Fri 18 Dec call. All challenge dates live in one config entry.

Handoff plan, 31 Oct 2026. For the Snowmoon design chat and for Claude Code. Builds on `snowmoon-fund-starting-small.md` and `snowmoon-deep-funding-pilot.md` in the LUM project.

## The plan in brief

For two weeks from Friday 6 November, people remix the main characters on snowmoon.party, using the site's own tools only. Nate owns the final version of each character, built from the remixes he chooses. On Friday 20 November we show those final versions and announce the poidh bounty winner. We then run a deep funding test, where AI models and a small jury divide the credit for each final version among everything it was built on. Each final version is minted on Ethereum mainnet as an open edition in a new collection, **Snowmoon WIP**. Mint proceeds, plus an extra reward pot from the fund, go to an unchangeable split set by the deep funding result. The mint closes at the 4 December call.

## Decided (Nate, 31 Oct)

- **Owners, not votes.** Each piece has an owner with final cut. Anyone can fork. Votes and panels decide support, never content.
- **Site tools only.** Challenge entries must be made with snowmoon.party's own tools, so every recipe is real.
- **No connector in the challenge.** The connector stays limited to long-term collaborators (today: Nate, Luis, Garance).
- **Uploads stay closed.** No one can bring in outside images.
- **Calls every other Friday** at 9am Pacific: 6 Nov, 20 Nov, 4 Dec, 18 Dec, then 15 Jan after the holiday break.
- **A simple poidh bounty, for reach.**
- **The Snowmoon collab chat opens** alongside the challenge.
- **A deep funding test** decides the extra rewards and the mint split.
- **Open edition mints on Ethereum mainnet,** using open-source contracts rather than a platform. Gas is cheap at the moment: Etherscan showed about 0.04 gwei on 31 Oct, roughly $0.06 for an NFT sale.
- **After the challenge,** publish a "road to Episode 1" plan, with a cadence through to Snowmoon month in January.

## Open decisions, with recommendations

1. **Collection name.** Recommend **Snowmoon WIP**. It's honest about being a living work in progress. "Evolution" suggests artwork that changes on its own, which this isn't. Tokens would be named like "Bai, WIP 1 (Nov 2026)".
2. **Which characters.** Recommend **Bai and Zei**, the two Episode 1 needs first. More characters give people more choice but make each remix graph shallower.
3. **What gets minted.** Recommend **Nate's final version** of each character, built from the remixes he picks, which fits owners-not-votes. The alternative is minting the poidh winner's version.
4. **Nate's own share.** The final version's own originality share would be Nate's, so recommend it goes to the Lake (the support wallet), published as such. Nate doesn't pay himself from the mint.
5. **Price and window.** A small fixed price, roughly $5 to $10 in ETH. Open from the 20 Nov call to the 4 Dec call.
6. **poidh bounty.** Recommend a **solo bounty** (Nate funds it and picks the one winner) on Base, where poidh has its reach. An open bounty lets others add money, but then those contributors vote on the winner, weighted by what they put in. The judging line: "the remix that most changes how we see the character while staying true to the book." Amount: Nate to set.
7. **Extra reward pot.** An amount from the support wallet, paid into each character's split on mainnet when the mint opens. Amount: Nate to set.
8. **Contract route.** Recommend **our own small contract** on OpenZeppelin's standard ERC-1155 (see the mint section). The fallback, if time runs short, is Manifold Studio with a creator-owned contract and the payout set to the split.
9. **Where token data lives.** Recommend **IPFS**, pinned with a pinning service and also pinned locally. Vitalik's own blog is served from IPFS through ENS.
10. **Free generation cap.** Free image generation, character sheets included, is capped at **$2 a day across the whole site** (`IMAGES.dailySpendCapUsd`). Each person also gets 10 generations a day. Recommend raising the site cap to about $15 a day for the challenge window, watching it, and setting it back afterwards.
11. **Royalties.** Recommend **none.** Simpler, and nothing for buyers to speculate on.
12. **Jurors and models.** Jurors: 5 to 9 people with no entries for that character. Models: about six that can read images, run through one gateway such as OpenRouter.

## Challenge rules (draft copy)

> **Remix Bai and Zei.** From 6 to 17 November, make your own version of Bai or Zei on snowmoon.party: start from any existing sheet, or from someone else's remix, change it, and publish. Your version gets its own page, credited back to what you built on.
>
> **What happens next.** On Friday 20 November, Nate shows the versions of Bai and Zei he's taking into Episode 1, built from your remixes and credited to you. AI models and a small jury divide the credit for each one among everything it was built on, and we publish how every model did it. Each version is then minted as an open edition in Snowmoon WIP. What it raises, plus an extra reward pot, goes to everyone it was built on, through a published split on Ethereum.
>
> **The bounty.** The poidh bounty goes to the remix that most changes how we see the character while staying true to the book. To be in the running, also post your version's link as a claim on the bounty.
>
> **The rules.**
> - Make your remix on snowmoon.party with the site's tools. Every recipe is published.
> - One entry per person per character. Your latest version counts unless you mark another.
> - To count as an entry, or get any reward, sign in with a Farcaster account that passes the site's check, or a wallet linked to one.
> - Entering is free. Minting isn't needed for anything.
> - Post your version anywhere with its link. If you're remixing someone's post, quote or reply to it.
>
> An independent adaptation of Snowmoon by Vitalik Buterin (GPL-3.0), not affiliated with him.

## How entries and the graph work

The site already records what each version came from:
- A character sheet fork is a new design whose first version has a `remixed_from` link to its source (`src/lib/images/designs.ts`).
- Images that use a sheet have `uses` links.
- Every version keeps its recipe.

**Entries.**
- **What counts:** a published fork of Bai or Zei (or of another entry) made between the 6 Nov launch and 23:59 Pacific on 17 Nov, by an eligible person.
- **Who's eligible:** a Farcaster account scoring at least 0.7 on Neynar, someone on the invited list, or a wallet linked to either.
- **Admins** (Nate, Garance) can make versions but aren't eligible for rewards. Any credit that reaches their work goes to the Lake.

**The final version needs more than one parent.** Today a fork has exactly one `remixed_from`. Nate's final version should be able to credit several entries: one `remixed_from` plus extra `uses` links to other design versions. The `links` table already allows this, so it's a small interface and server change, not a migration.

## Social pages

Each version's page (`/references/designs/[id]`) gets a **"Posted on"** section and share buttons:

- **Share buttons** for Farcaster, Bluesky and Lens, prefilled with the page link. Inside the Farcaster miniapp, use `composeCast`, which should return the new cast's hash (check the current SDK), so the site can record it.
- **An "Add where you posted it" field** that takes a post URL from any of the three networks. The server fetches the post and checks it links to the page before listing it.
- **Finding posts automatically:** Bluesky posts by searching for the page URL (`searchPosts` takes a `url` parameter). Farcaster casts too, if Neynar's search supports it (to check). Lens stays manual-add only for now.
- **The guidance shown:** "If you're remixing someone's post, quote or reply to it on the same network. Always include your version's link." The link is the only thing all three networks share.

## Deep funding test

The fuller design is in `snowmoon-deep-funding-pilot.md`. For this test:

- **Graph per character.** The outcome is Nate's final version. Its parents are the entries he credits. Each entry's parent is what it was forked from, back to the original sheet. The book is the root.
- **Questions.** Per node, what share is new work, and how the rest divides among its parents. Single-parent nodes only need the first question.
- **Models.** About six models that can read images. Each gets the same prompt and inputs: the sheet images, the descriptions, the recipes, and the maker's own words. Each runs three times. All maker text is passed as quoted data, never as instructions.
- **Jurors.** 5 to 9 people with no entries for that character. Each answers about six questions on the site on 18 and 19 Nov, without seeing the model answers. Four are comparisons ("for the final Bai, which mattered more, A or B, and how many times more?") and two are originality ("how much of this version is new?").
- **Scoring.** For each model, the average squared gap between its log-ratios and the jurors'. That gives the leaderboard.
- **Final weights.** The average of the top three models. Show the fitted mix of all models alongside for comparison.
- **The money flows down the graph,** and these shares go to the Lake:
  - Nate's own originality share
  - anything reaching the book
  - anything reaching admins' work or ineligible makers
  - any recipient's total under 1% of the pot
  - any recipient without a usable mainnet address
- **What's published:** the graph, every prompt and raw answer, jurors' answers by number, the scores, the weights, and each recipient's share. Stop and report before spending more than $25 on model calls.

## Snowmoon WIP: the mint

**The contract.** A small ERC-1155 built on OpenZeppelin Contracts v5 (MIT, the most audited standard base), released under GPL-3.0 like the site. The token standard comes off the shelf. The sale logic is about fifty lines on top, which is easier to check than a platform contract full of features we don't need.

- **One owner power:** creating a token. Its metadata URI, price, start, end and payout address are set at creation and can never be changed.
- **No** upgrades, pause, royalties, owner withdrawal or allowlist.
- **`mint(id, quantity, to)`** checks the time window and the exact payment, then mints. It makes no outside call.
- **Funds** build up per token. A permissionless `release(id)` sends a token's balance to its payout address and nowhere else. Anyone can call it.
- **Events** for token creation, mints and releases.

**The split.** One immutable 0xSplits **PullSplit** (v2.1) on mainnet per token. Splits v2 is GPL-3.0, and Protocol Guild runs its mainnet split on the same version.
- Recipients are each person's Farcaster-verified address, with the Lake for the rest.
- Before creating a split, check every address works on mainnet: an ordinary wallet, or a contract wallet actually deployed there. Screen addresses against the sanctions list.
- A pull split means recipients withdraw their own share, so one bad address can't block the others.

**Metadata,** pinned on IPFS:
- name, description and image (the final version's front view)
- `external_url` (its page)
- the recipe link, AI label and licence
- the contributor list, the split address, and a link to the deep funding results

The collection description: "Work-in-progress versions of characters, places and scenes from snowmoon.party's open adaptation of Snowmoon by Vitalik Buterin (GPL-3.0). Each token is one version made by many people; what it raises goes to everyone it was built on, through a published deep funding split. Independent; not affiliated with the author. No roadmap, no utility, nothing promised."

**Minting.**
- A token page on snowmoon.party, using the miniapp wallet in Farcaster, or any wallet on the web, on chain 1.
- Etherscan's "Write contract" works as a fallback, so the mint doesn't depend on our site.

**Safety, since the contract holds money:**
- Foundry tests covering windows, prices, quantities, releases, owner-only creation, payout immutability and reentrancy, plus Slither.
- A review by a separate agent that hasn't seen the code being written.
- A full dry run on Sepolia: create a token, mint, release, and distribute through a test split.
- Verify the source on Etherscan.
- Nate deploys from his own wallet. Claude Code never handles keys.

## Timeline

| When | What | Who |
|---|---|---|
| Sun 1 to Thu 5 Nov | Make the decisions above. Week-one build. Personal invites. Bounty text. Collab ready. | Nate, Claude Code |
| Fri 6 Nov | Launch on the call and in posts. poidh bounty live. | Nate |
| Sun 8 Nov | Collab chat opens ($LUM birthday) | Nate |
| Thu 12 Nov | Halfway post showing entries so far | Nate |
| 6 to 17 Nov | Build: social pages, multi-parent credit, deep funding runner, juror page, contract and Sepolia dry run | Claude Code |
| Tue 17 Nov, 23:59 PT | Entries close | |
| Wed 18 Nov | Nate publishes final versions. Models run. Jurors invited. | Nate, Claude Code |
| Thu 19 Nov | Jurors finish. Results and recipient lists. Address checks. Splits created. Metadata pinned. Tokens created. | Nate, Claude Code |
| Fri 20 Nov call | Final versions, poidh winner, model comparison, splits shown. Mint opens. | Nate |
| Fri 4 Dec call | Mint closes. `release` to the splits and distribute, live. Totals published. Road to Episode 1 published. | Nate |

18 and 19 November are tight. If anything slips, open the mint on Monday 23 November instead and close it on 4 December as planned.

## Build list for Claude Code

**Before launch (by Thu 5 Nov):**
1. A challenge page (`/challenge`) with the rules, the two characters, their source sheets, entries so far and the deadline.
2. Entry marking: eligibility, one entry per person per character, an "entry" badge on the version page.
3. Share buttons on version pages, and the "Add where you posted it" field with verification.
4. Config: raise `IMAGES.dailySpendCapUsd` for the challenge window (Nate decides the amount), and add invitees to `IMAGES.invited`.

**During the challenge (by Tue 17 Nov):**

5. Automatic post finding: Bluesky by URL, and Farcaster if Neynar supports it.
6. Multi-parent credit for the owner's final version.
7. The deep funding runner and the juror page. The juror page needs a migration, which Nate applies in the SQL Editor as usual.
8. The contract, tests, review and Sepolia dry run.
9. A results page and a token page with the mint button.

**After the call:**

10. Release and distribution checks.
11. Publishing totals.

## Legal and tax notes (not advice)

- Entering is free and needs no purchase. Minting doesn't affect entry or rewards. The bounty is judged, not drawn. That keeps it out of lottery territory.
- The mint is a fixed-price collectible with no promises, roadmap or royalties. The SEC and CFTC's March 2026 interpretation treats digital collectibles as non-securities, with caveats about promising future work, so avoid any such promises.
- Mint proceeds go straight to contributors through the split. The extra pot and the Lake's share pass through Nate's LLC, so the earlier tax questions apply: payments to people outside the US, and income timing. Ask the tax adviser before 20 Nov.

## Kickoff prompt for Claude Code

> Read `snowmoon-remix-challenge-plan.md` in the LUM project. Start the "before launch" build list (items 1 to 4) on a branch. Respect the decided rules: site tools only, no connector or uploads in the challenge, eligibility as written, admins not eligible for rewards. Don't change caps or the invited list until Nate gives the numbers and IDs. In parallel, on a separate branch, start item 8: an ERC-1155 on OpenZeppelin Contracts v5 with the sale rules in the plan (per-token immutable URI, price, window and payout; `mint` with no external call; a permissionless `release` to the payout only; no upgrades, pause, royalties or withdrawal). Write Foundry tests and run Slither. Never handle private keys; deployment is Nate's. Report what you built, what you tested, and any question where the plan is unclear.
