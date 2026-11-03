# Challenge payout: the pot, payout addresses and the mint's chain (DRAFT, a proposal only)

Written by the coding agent (Claude, a closed model by Anthropic), 2026-11-03 (Pacific; the brief's date is
2026-11-04), on branch `deep-funding`, for the owner's OK. DRAFT until the owner approves it. **A proposal only:
nothing is built, no contract or setting is changed, no migration file is written and no legal text is changed.**
Every number in the worked examples is **made up**.

It answers items 16 to 18 of the owner's list of 2026-11-04, and replaces parts of two earlier drafts on this branch:

- `docs/proposals/payout-addresses.md`: the chain becomes Base, a passkey wallet is offered, and a missing address
  is shared among the others instead of going to the Lake;
- `docs/proposals/deep-funding-runner.md`: one pot for the whole contest instead of one split per character.

The rules used throughout (owner, 2026-11-04):

- up to **3 submissions per person**, for any characters;
- a character **counts** once it has **3 different submitters**.

## 16. The pot

**What's in it:** the owner's Snowmoon contest winnings, converted to ETH on Base, plus the Snowmoon WIP mint's
proceeds. All of it is distributed by the deep funding result across the whole contest.

**What the deep funding result gives** (`scripts/deep-funding.ts decide`), for each counting character's final
version, a share of credit for every version it was built on, adding up to 1:

- the final's own originality share (the owner's);
- what reaches the book;
- what reaches each maker's versions. A maker is a Farcaster ID; one maker may appear in several characters.

So the result says how to share **within** a character. The pot needs one more rule: how much goes to each character.
The options are below. Each can be used on its own (100% by deep funding) or with the owner's 20/80 rule.

### The options across characters

- **A. Equal per character.** Each counting character gets the same part of the pot. Its few makers share as much
  as a busy character's many makers.
- **B. By number of submitters.** A character's part is in proportion to its distinct eligible submitters. Each
  person's expected share is about the same, whichever character they chose.
- **C. Proceeds follow their character.** Each token's mint proceeds go to its own character, and the winnings are
  split equally. This is the earlier plan (one split per token). Sales decide part of who gets what.
- **D. One pot across all, with no character weights.** This needs the jurors and models to compare versions *across*
  characters ("did this Bai matter more than that Zei?"), which the runner doesn't ask. Not built, and it would need
  more jurors. Listed for completeness, not recommended.

### The 20/80 rule (owner, 2026-11-04)

- **20%** of the pot is split equally among every eligible submitter. **Per person, not per submission:** someone
  with three entries gets one equal share.
- **80%** is split by deep funding, across characters by A, B or C.

Who is an "eligible submitter" for the 20%: proposed, a person with at least one eligible entry in a **counting**
character, whether or not the final used it. A person whose only entries are in characters that didn't reach three
submitters has no deep funding result to stand on. Including them is a one-word change (the owner's list, item 2).

### Worked example (made-up numbers)

**The contest** (made up):

- **Pot:** 2.0 ETH of winnings, plus 0.6 ETH of mint proceeds (Zei 0.30, Bai 0.20, Mu 0.10), so **2.6 ETH**.
- **Submitters:** Zei 8 (A to H), Bai 5 (B, I, J, A, K), Mu 3 (L, C, M), Gladias 2 (N, O). Seila and Deluin have
  none.
- **Counting characters:** Zei, Bai and Mu. Gladias has only two submitters.
- **Eligible submitters:** the 13 distinct people A to M. N and O have entries only in Gladias.

**Deep funding results per character** (made up; each adds up to 1):

| | Owner's originality | Book | Makers |
| --- | --- | --- | --- |
| Zei | 0.40 | 0.10 | A 0.20, B 0.12, C 0.08, D 0.05, E 0.03, F 0.015, G 0.005 (H: 0) |
| Bai | 0.35 | 0.15 | B 0.25, I 0.15, J 0.06, A 0.04 (K: 0) |
| Mu | 0.45 | 0.05 | L 0.30, C 0.15, M 0.05 |

The owner's and the book's shares go to the Lake, as the runner does today (`DEEP_FUNDING.lake`, the team's Fund
account since 2026-11-04). The runner's under-1% rule is left off here: with the 20% share, nobody's payout is dust
(the owner's list, item 4).

**Each character's part of the 80% (2.08 ETH):**

| Option | Zei | Bai | Mu |
| --- | --- | --- | --- |
| A. Equal per character | 0.6933 | 0.6933 | 0.6933 |
| B. By submitters (8 : 5 : 3) | 1.0400 | 0.6500 | 0.3900 |
| C. Proceeds follow (0.30 / 0.20 / 0.10, plus the winnings in thirds), scaled to 80% | 0.7733 | 0.6933 | 0.6133 |

**What each person gets, 20/80** (ETH). The 20% is 0.52 ETH, which is 0.04 ETH each for 13 people:

| Person (characters) | A | B | C |
| --- | --- | --- | --- |
| A (Zei, Bai) | 0.2064 | 0.2740 | 0.2224 |
| B (Zei, Bai) | 0.2965 | 0.3273 | 0.3061 |
| C (Zei, Mu) | 0.1995 | 0.1817 | 0.1939 |
| D (Zei) | 0.0747 | 0.0920 | 0.0787 |
| E (Zei) | 0.0608 | 0.0712 | 0.0632 |
| F (Zei) | 0.0504 | 0.0556 | 0.0516 |
| G (Zei) | 0.0435 | 0.0452 | 0.0439 |
| H (Zei, credited 0) | 0.0400 | 0.0400 | 0.0400 |
| I (Bai) | 0.1440 | 0.1375 | 0.1440 |
| J (Bai) | 0.0816 | 0.0790 | 0.0816 |
| K (Bai, credited 0) | 0.0400 | 0.0400 | 0.0400 |
| L (Mu) | 0.2480 | 0.1570 | 0.2240 |
| M (Mu) | 0.0747 | 0.0595 | 0.0707 |
| **People, in all** | **1.5600** | **1.5600** | **1.5600** |
| Lake: owner's originality | 0.8320 | 0.8190 | 0.8280 |
| Lake: the book | 0.2080 | 0.2210 | 0.2120 |
| **Check** | 2.6000 | 2.6000 | 2.6000 |

**The same with 100% by deep funding** (option B, nothing equal): A 0.2925, B 0.3591, C 0.1771, D 0.0650, E 0.0390,
F 0.0195, G 0.0065, H 0, I 0.1219, J 0.0488, K 0, L 0.1463, M 0.0244. People get 1.30 in all and the Lake 1.30.
Two people who entered get nothing.

**A missing address (made up):** under B with 20/80, say E and K give no address by the deadline. Their 0.1112 ETH is
shared among the other 11 in proportion to what each already gets (nothing goes to the team): A 0.2950, B 0.3524,
C 0.1956, D 0.0991, F 0.0599, G 0.0487, H 0.0431, I 0.1481, J 0.0851, L 0.1691, M 0.0641. That still adds up to 1.56.

**What the Lake holds.** In every option above, about 40% of the pot (0.83 + 0.21 ETH) goes back to the team's
account: the owner's own originality share and the book's share. "All of it is distributed by the deep funding
result" is true, since the result names those shares. But if the owner means all of it goes to the participants,
those two shares should instead be shared among the makers. With B and 20/80, people would then get 2.59 ETH in all,
for example A 0.508 and L 0.274 (the owner's list, item 3).

### Recommendation

**B (by number of submitters) with 20/80, one pot on one chain:**

- Each person's expected share doesn't depend on which character they picked, and nobody gains by moving to a quiet
  character to share a whole third with two others (A's weakness: in the example, L's 0.248 under A against 0.157
  under B).
- Sales don't decide anyone's payout (C's weakness; principle 7 is about scoring and ordering, but C would make what a
  maker gets depend on how well a token sold).
- The 20% means everyone eligible who took part gets something, and makes the under-1% rule unnecessary.
- One pot means **one split** (a PushSplit, owner `address(0)`) holding every recipient, the team's Fund account, and
  the book's recipient once decided. Every token's payout is that split, and the winnings are sent into it. On one
  chain that's one split; see 18.

Weights by distinct **eligible** submitters, counted once per character, as stored at publish
(`studio.challenge_eligibility`). An admin's or ineligible maker's entry doesn't count toward a character's weight,
or toward the three submitters.

### What changes in the runner (when approved; not done)

- `decide` takes every counting character at once and writes one pot table: the character weights (A, B or C), the
  equal part, each FID's total, and the Lake rows.
- A new setting, `DEEP_FUNDING.pot`: `{ across: 'submitters', equalShare: 0.2, minShare: 0 }`.
- Rule 5 ("no usable address → Lake") becomes "no address by the deadline → shared among the others, pro rata". The
  results file lists the redistributed total, without names.
- Allocations stay in millionths, adding up to exactly 1,000,000, one row per address.

## 17. Payout addresses

**The rule** (owner, 2026-11-04):

- Addresses are asked **only of the people being paid**, and **only after the results**. Entering never asks for one.
- Each recipient chooses one of two options:
  - **"Use your wallet"**: a Farcaster-verified address, or a wallet they sign in with;
  - **"Create a passkey wallet"**: for people without one.
- A **deadline** comes before the split is made. Anyone without an address by then has their share **shared among
  the others** (above), not sent to the team.

### When

- **From** the results, Fri 4 Dec at 09:00 Pacific.
- **Deadline:** **Mon 7 Dec at 12:00 Pacific** (`CHALLENGE.dates.payoutConfirmCloses`).
- **Then** the owner re-checks every address, creates the split, and creates the tokens with it as their payout,
  before the mint opens on Tue 8 Dec at 09:00.

Three days is short. A longer deadline means a later mint, since each token's payout is fixed at `createToken`
(the owner's list, item 5).

### The screens

Who sees them: a recipient (an FID on the results' recipients list, committed with the results) who signs in sees a
card on /you and on /challenge: "You're in the results: 0.0712 ETH. Choose where it goes by Monday 7 December, 12:00
Pacific, or it's shared among the others." Nobody else sees the screen or can store an address.

**Use your wallet:**

- The server reads the person's verified Ethereum addresses from Neynar (Neynar receives their FID, at that moment
  only) and offers the primary one, selected, with the others as choices. These addresses are already proven by
  Farcaster.
- **Another wallet:** signing in with it on the same screen (the site's Sign-In with Ethereum,
  `src/lib/wallet/session.ts`, checked on Base, so smart wallets work). This proves control, so there's no free-text
  address box.

**Create a passkey wallet:**

- A short explainer: "A passkey wallet lives on your phone or computer, unlocked with your fingerprint or face. No
  app, no seed phrase. It's made by Coinbase (Base Account); the site never holds it."
- The button "Create one with Coinbase" opens Coinbase's sign-up (Sign in with Base) in its own window. Once it's
  made, the same window signs our sign-in message, so the address is proven like any other wallet.

**Confirm:**

> Your 0.0712 ETH will go to 0x12…ab on Base, through a split contract that can't be changed once made. Check that
> you control this address on Base: payments to it can't be reversed.

Button: "Confirm". It can be changed until the deadline; after that, nothing changes.

### Checks before anything is stored (our server)

- **Works on Base.** `eth_getCode` on Base.
  - An ordinary wallet, an EIP-7702 delegation, or a deployed contract wallet: accepted.
  - A smart wallet not deployed yet (a new Base Account): accepted when its sign-in signature checks out
    (ERC-6492). The address is fixed by the passkey, so ETH sent to it waits there until its first transaction
    deploys it.
- **Sanctions:** Chainalysis' sanctions oracle by `eth_call`, so no screening service receives the address beyond our
  RPC. Its contract address on Base is **to confirm** before this is built. A hit is refused with a neutral message,
  and the share is shared among the others.

### What's stored

A sketch, not a file:

```sql
-- NEXT_payout_addresses.sql (sketch). MUST RUN AS postgres. RLS on; studio_writer select and insert only.
create table studio.payout_confirmations (
  id bigint generated always as identity primary key,
  challenge text not null check (challenge ~ '^[a-z0-9-]{1,40}$'),
  fid bigint not null check (fid > 0),
  chain_id int not null check (chain_id = 8453),
  address text not null check (address ~ '^0x[0-9a-fA-F]{40}$'),
  source text not null check (source in ('farcaster-primary', 'farcaster-verified', 'signed-wallet', 'passkey-wallet')),
  wallet_kind text not null check (wallet_kind in ('ordinary', 'delegated', 'contract', 'undeployed-smart')),
  checked_block bigint not null,
  sanctions_clear boolean not null check (sanctions_clear),
  confirmed_at timestamptz not null default now()
);
```

- One row per confirmation, append-only; the latest counts. A failed check stores nothing. Only FIDs on the
  recipients list may insert (checked by the route).
- **No amounts in the table**: the shares are in the public results file.
- **Retention:** rows are deleted 90 days after the split is made. The addresses stay public in the split on chain.
- Nothing about wallets is read or stored at publish, or for anyone not on the list.

### Privacy and Terms lines (DRAFT, for the owner's reread; they ship with the feature, never ahead)

**Privacy §4 (Kept by us when you sign in), a new item:**

> If the remix challenge's results pay you and you choose a payout address: the address, how you chose it (a verified
> Farcaster address, a wallet you signed in with, or a passkey wallet you created), the result of our checks (that it
> can receive on Base and is not on the sanctions list), and when you confirmed it. The address is written, with your
> share, into a split contract on Base, where it is public and permanent. We delete our record of it 90 days after the
> split is made. We ask no one else for an address, and never to enter.

**Privacy §7 (Outside services), added to the Neynar item:**

> If the results pay you, Neynar receives your Farcaster ID when you open "Choose where your payout goes", to read your
> verified addresses.

**Privacy §7, new items:**

> To check a payout address, our Base provider (Base's public endpoint) receives the address, to read whether it holds
> a contract and to ask the Chainalysis sanctions list on Base whether it is listed.

> If you choose "Create a passkey wallet", Coinbase makes the wallet in its own window, under its own terms and
> privacy policy; we receive only the address and its signature.

**Terms, a new section after 6e:**

> **6f. Payouts.** If the results pay you, you may choose an address on Base for your share by the date the challenge
> page gives. Choose only an address you control on Base: payments to it can't be reversed, and the split it goes into
> can't be changed. We may refuse an address that can't receive on Base or that is on a sanctions list. If you don't
> choose a usable address in time, your share is shared among the other people paid.

### The passkey wallet: what is simplest today

Checked 2026-11-03. The live help pages refused the fetch tool in places, and that's marked below.

- **Coinbase's Base Account** (formerly Coinbase Smart Wallet) is the simplest option. Its docs have moved:
  - docs.base.org's Base Account pages now say "The Base Account SDK and Base MCP documentation has moved from Base
    docs to Coinbase Developer Platform", and that the Base Account SDK is now the Coinbase Wallet SDK
    (<https://docs.base.org/base-account/overview/what-is-base-account.md>, read 2026-11-03).
  - Coinbase Developer Platform's overview
    (<https://docs.cdp.coinbase.com/coinbase-wallet/overview>, read 2026-11-03, through the fetch tool's summary) says
    "Use Sign in with Base to authenticate with a passkey — no password, no email round-trip", that one passkey works
    across Base-enabled apps with "no installs, seed phrases, or network switches", and that the SDK to use for now is
    `@base-org/account`. It calls the consumer app "Coinbase Wallet (formerly known as Base App)".
  - Coinbase's help page on passkeys (<https://help.coinbase.com/en-gb/wallet/getting-started/smart-wallet-passkeys>)
    refused the fetch (HTTP 403). A search summary of it says sign-in at keys.coinbase.com works with passkeys, email
    passcodes or a recovery phrase. **Not read directly.**
  - The older Smart Wallet docs, via a search summary, not re-read live: the same address on every supported network
    (Base and Ethereum among them), deployed on its first transaction. Coinbase's own network page now redirects to
    the moved docs. **To re-read before building.**
- **Why it fits:**
  - it's free for the person, with no app or extension;
  - it works on Base, where the payout would be;
  - it signs our existing sign-in message (ERC-6492, which `src/lib/wallet/chain.ts` already checks on Base);
  - we never hold a key.
- **The cost to principle 6:** the SDK opens Coinbase's window, and may send Coinbase its own telemetry.
  - Proposed: load it only on the payout screen, only after the person taps "Create one with Coinbase", with
    telemetry off if the SDK allows it (**to check**).
  - Name Coinbase in Privacy §7, as above.
  - Add a P6 check that the SDK is imported nowhere else.
  - This is a narrow, opt-in exception to "production pages make no third-party requests" (the owner's list, item 6).
- **Alternatives:**
  - **The Farcaster app's own wallet.** Most recipients already have it, and its address is usually their verified
    one, so "Use your wallet" covers them with no new wallet at all. This is likely the most common path.
  - **Embedded-wallet services** (Privy, Dynamic, Web3Auth and the like). They need an account with them, their
    scripts on our page, and they hold key shares. Rejected: more to trust, and more third-party requests.
  - **Paste an address and type its last six characters to confirm.** No proof of control, but the person is signed
    in with Farcaster, so the risk is only theirs. A fallback if the SDK exception is refused.
  - **A Safe.** Too much setup for one payout.

## 18. The mint's chain

Compared (owner, 2026-11-04):

- **Keep** Snowmoon WIP on Ethereum mainnet, as built (`contracts/snowmoon-wip`; sale window unix `1796749200` →
  `1797613200`, Tue 8 Dec 09:00 PST to Fri 18 Dec 09:00 PST, end exclusive).
- **Move** it to Base, and anchor the challenge record on mainnet in one transaction.

**Nothing has been changed; the owner decides.**

**Prices read 2026-11-03, 20:56 UTC:**

- mainnet gas 0.0479 gwei (`eth_gasPrice`, ethereum-rpc.publicnode.com);
- Base 0.006 gwei (mainnet.base.org), plus Base's L1 data fee, a fraction of a cent for these transactions;
- ETH $2,287 (Chainlink's ETH/USD, from https://snowmoon.party/api/eth-usd).

Gas used is from `forge test --gas-report` on the contract: deploy 2,011,180; `createToken` about 146,000; `mint`
76,000 (median, up to 179,000 for a first mint to a new holder).

| | Keep on mainnet | Move to Base, anchor on mainnet |
| --- | --- | --- |
| Deploy the contract | ~0.000096 ETH ($0.22) today; $4.60 at 1 gwei | ~$0.03 plus the data fee, a few cents |
| Each `createToken` (6 at most) | ~$0.016 today | under $0.01 |
| A buyer's mint | ~$0.008 today; ~$0.17 at 1 gwei | under $0.01 |
| The split (create + each distribute) | cents today; a few dollars at 1 gwei | under $0.05 |
| The anchor | not needed (the tokens on mainnet reference the record) | one transaction: ~23,000 gas, ~$0.003 today |
| Gas risk | mainnet fees can jump 10 to 100 times in a busy week; still small per mint, but noticeable for one $7 edition | negligible |
| **Buyers' wallets** | need ETH on mainnet. Many Farcaster and Coinbase users hold theirs on Base and would bridge first | ETH on Base, where the Farcaster wallet, the Base app and most of this audience already are; the mini app can mint in one tap |
| **Recipients' wallets** | a new passkey wallet must be deployed on mainnet before its owner can move funds (mainnet gas, paid by them) | deployed cheaply on Base, often sponsored by the wallet |
| **The pot** (winnings in ETH on Base) | the proceeds are on mainnet and the winnings on Base, so either two splits with the same allocations (a deterministic split at the same address on both, to confirm), or the owner bridges one side | one chain: the winnings and every token's proceeds go into **one** split |
| **Splits v2** | PushSplitFactory v2.2 `0x8E8e…3Ecf4`, v2.1 `0xDc62…48Ed` and SplitsWarehouse `0x8fb6…1Fb8`: code present | **the same addresses, code present on Base** (3,030, 3,022 and 12,146 bytes, read 2026-11-03), and on Base Sepolia for the dry run |
| **The fork test** (`test/fork/PushSplitFork.t.sol`) | passes, 2 of 2 | **passes, 2 of 2, against Base's public RPC** (run 2026-11-03 with `MAINNET_RPC_URL=https://mainnet.base.org`) |
| **The team's share** (the Fund account, a Splits Teams smart account) | set up on Ethereum (tx `0xd9c5…a68a`), so a payout to it works. A PushSplit pays it directly on a mainnet fork (branch `fund-page`) | set up on Base (tx `0xac87…051d`); works the same, checked on a Base fork |
| **"Referenced on Ethereum"** (Terms §6e) | true: every token references the record | true through the anchor transaction, if it's made before the tokens and the tokens name it |
| **Provenance** | some collectors value mainnet | a Base token is an Ethereum L2 token; its record is anchored on mainnet |

**What changes in the contract if it moves to Base:** no Solidity.

- Base runs the Cancun EVM the contract is built for, including the transient storage `ReentrancyGuardTransient`
  uses.
- The README's deploy checklist changes:
  - the RPC (`https://mainnet.base.org`; dry run on Base Sepolia, `https://sepolia.base.org`);
  - verifying on Basescan (`--chain base`; the Etherscan API key works for both) and Sourcify;
  - the Splits addresses, noted as present on Base;
  - the fork test's variable renamed from `MAINNET_RPC_URL` to a chain-neutral name.
- The window's unix times stay the same: block time on Base is also UTC seconds.

**What changes in the deep-funding export (`scripts/challenge-record.ts`)** if it moves:

1. **The records** are unchanged (no chain in the entries record).
2. **A new `anchor` step** (owner signs, nothing sent by an agent):
   - it prints one mainnet transaction for the owner to send from his own wallet: 0 ETH, to his own address, with
     data `snowmoon-challenge-record/1 <entries CID> <results CID> <sha256 of each>`;
   - and the `cast send … --browser` command for it.
3. **The results record and each token's metadata** gain `"chain": "eip155:8453"`, the split's address on Base, and
   `"record_anchor": "eip155:1:tx:<hash>"`.
4. **The order:** pin the records, then anchor, then write and pin the metadata, then `createToken` on Base. The
   anchor must come before the metadata that names it.

Wording that would change with a move: the principles' P7 paragraph ("open editions on Ethereum mainnet") and the
plan's "minted on Ethereum mainnet". The mint sentence on /challenge names no chain, and Terms §6e stays true.

**Recommendation: move to Base and anchor on mainnet.** One chain carries the pot, the proceeds, the split and the
recipients' new wallets. Buyers mint where their ETH already is. The record stays referenced on Ethereum by one
transaction. Mainnet is cheap enough today, so this is about wallets and one pot, not gas.

## The owner's list

1. **The split across characters:** A, B (recommended) or C, and 20/80 (recommended) or 100% by deep funding.
2. **"Eligible submitter" for the 20%:** in a counting character only (recommended), or any eligible entry.
3. **What reaches the owner's originality and the book:**
   - the Lake, as built: about 40% back to the team in the example;
   - or shared among the makers, so nearly all the pot goes to participants;
   - and `DEEP_FUNDING.bookRecipient` is still unset.
4. **The under-1% rule:** off with 20/80 (recommended), or kept (shares under 1% go where?).
5. **The address deadline** (Mon 7 Dec 12:00 PT proposed), and whether the mint moves later to allow more time.
6. **The passkey option:** Base Account through Coinbase's SDK on the payout screen only, a narrow P6 exception named
   in Privacy §7; or the paste-and-retype fallback.
7. **The mint's chain:** stay on mainnet, or move to Base with the mainnet anchor (recommended).
8. **The Privacy and Terms lines above:** reread when the feature is built, in its release.
9. **Tax:** Lum LLC paying prizes to many people: ask the tax adviser before December.

## Principles

- **P1 (recipes public):** unchanged. The results file publishes every share by FID; no address is in the records.
- **P5 (no ranking powers):** pass. Character weights come from submitter counts, not from any admin pick. Admins'
  entries count toward nothing.
- **P6 (privacy):** concern. The passkey option loads Coinbase's SDK on one screen, opt-in. That's a narrow exception
  needing the owner's yes, Privacy §7 words and a check. Addresses are asked only of recipients, after the results.
- **P7 (payments never in scoring or ordering):** pass for B and A. C makes payouts depend on sales, which is a
  tension and one reason it isn't recommended. The mint stays a fixed-price collectible with no royalties, on either
  chain.
