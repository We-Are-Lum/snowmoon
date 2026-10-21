# Agents paying for site tools (DESIGN NOTE, nothing built)

> **Status: draft for the owner's review. Nothing here is built, migrated, deployed or switched on.**
> The owner's words (2026-10-21): "Design note, don't build yet: other people's agents pay for site
> tools from that person's prepaid balance, with a cap and approval, with a markup over cost. Also look
> at x402 for agents with their own wallets."
>
> All wording below (button text, recipe lines, Terms and Privacy lines) is draft. Prompts and examples
> name no artists or people. File and line references are to `origin/main` at `b770a17` (2026-10-21).

## Contents

0. Short version
1. Today: who pays for what, and when
2. Proposal A: a person's agents spend from that person's prepaid balance
3. Proposal B: x402, agents paying per call from their own wallets
4. Terms, Privacy and consent lines (drafts, for the owner's reread)
5. Principles (tensions first)
6. Decisions for the owner
7. Cost of building each
8. Sources (x402 research, verified vs. unverified)

---

## 0. Short version

- **Today an agent spends nothing on its own.** It drafts a frame or a video test with an estimate; the
  person taps "Make it" on /you; only then does the server spend (`src/lib/agents/approve.ts:15-19`).
  For the owner (a Farcaster account) the money comes from the site's own provider keys, within free
  caps. Only wallet accounts have a prepaid balance, and no wallet is on the agents allowlist yet.
- **Proposal A (recommended first):** one balance per person (Farcaster or wallet), charged at cost
  plus the existing 30% markup; each agent gets a daily cap and an all-time cap; approval before any
  spend stays the default, with a one-tap "Make all" for what is waiting. Agent spending is always
  prepaid (never the site's free caps) once agents open beyond the owner. Failures are credited back to
  the balance (a change to "payments are final", for the owner to decide).
- **Proposal B (later, small):** x402 on two or three "Made here" tools at REST paths, for **linked**
  wallet agents only, paid in USDC on Base per call, at the same cost plus 30% with a small floor.
  Verify, make, settle, then return: nothing is delivered unpaid and nothing is charged if nothing is
  made. Kept off the main `/mcp` connector so the directory listing isn't put at risk.
- Several pieces of today's code would need fixing before either opens to anyone else (section 1.4).

---

## 1. Today: who pays for what, and when

### 1.1 The three ways money is spent on generation

| What | Who triggers it | Who pays | Caps | Where |
|---|---|---|---|---|
| Pictures (text to image, a passage) by a Farcaster account | the person, in the browser | the site's fal.ai and Groq keys ("free") | 10 a day per person (`src/lib/config.ts:298`; the owner 300, `:300`); $2 a day for everyone (`:303`) | `src/lib/images/limits.ts:54-77` |
| Remix frames by a Farcaster account | the person, in the browser | the site's keys ("free") | 10 a day (`config.ts:224`); $10 a day for everyone (`:223`); `REMIX_FREE=off` stops it | `src/lib/remix/limits.ts:42-65` |
| Pictures and Remix frames by a wallet account (person number below zero) | the person, in the browser | **the person's prepaid balance**, at worst-case cost plus 30% | balance; $25 a day of prepaid spend for everyone, per table (`config.ts:319`) | `images/limits.ts:58-68`, `remix/limits.ts:47-56` |
| An agent's frame try (`try_frame`) | the agent drafts; **the person taps "Make it" on /you** | through Remix's `generate()` as the person: free for a Farcaster account, prepaid for a wallet account | 20 frames, 5 videos and $2 a day per person (`config.ts:171`); a key's all-time cap (`:181`) | `src/lib/agents/approve.ts:28-44`, `:73-108` |
| An agent's video test (`request_video_test`) | the same | **always the site's fal key**, whoever the person is | the same per-person caps; no site-wide cap | `approve.ts:47-71` |

How `fundedBy` decides: a positive person number is a Farcaster FID and is "free"; a negative one is a
wallet account and is "prepaid" (`src/lib/images/limits.ts:23`, `src/lib/remix/limits.ts:21`).

### 1.2 The prepaid balance

- Price of a Generate = its worst case reserved, times 1.3, rounded up to a millionth of a dollar
  (`src/lib/wallet/credits.ts:12`; `markup: 0.3` at `config.ts:315`).
- Balance = payments credited minus debits (`credits.ts:25-30`). Payments are USDC or ETH on Base to
  the owner's address (`config.ts:314`), read onchain and credited once by transaction hash
  (`src/app/api/wallet/claim/route.ts:29`, `credits.ts:33-38`).
- The debit is taken **at reserve time, at the worst case**, and never adjusted: "Payment is final: no
  refunds, whatever the outcome" (`src/lib/images/paid.ts:20-21`, `credits.ts:40-43`, Terms §6a in
  `src/lib/legal.ts:63`). A Generate refused by the prompt check, dropped by the safety checker, or lost
  to a model error is still charged.
- Tables (migration `0011_wallet_prepaid.sql`, applied 2026-10-13): `wallet_accounts`, `wallet_payments`,
  `wallet_debits` (account, usd, at: no reason, no link to what was made), and `image_costs.funded`.
  Money is linked to a person only for prepaid accounts (the owner's exception, `0011:20-21`);
  the cost tables still carry no person.

### 1.3 Agents and spending

- Only the owner's FID 6786 may use agents (`config.ts:161`); the wallet list is empty (`:166`). The
  allowlist is checked on every agent request (`src/lib/agents/core.ts:90-91`).
- No agent tool spends. `try_frame` and `request_video_test` write a draft with `estimate_usd`
  (`src/lib/agents/edits.ts:53-54`, `:62-67`, `:94-98`); the tool tells the agent "nothing is spent
  before" approval (`edits.ts:59`). `approve.ts` is imported only by the person's route
  (`src/app/api/drafts/route.ts:7`, `:35-37`), which requires the person's own sign-in and the allowlist.
- At "Make it" (`approve.ts:73-108`): the draft is claimed once (`:80`); today's approved frames, videos
  and dollars for the person are counted against `AGENTS.spend` (`:82-97`); a personal key's all-time
  cap is checked (`:98-103`); then the frame or video is made and `spent_usd`, the recipe (`made`) and
  the private file are saved (`:104-106`).
- Caps per agent exist only for keys (`spend_cap_usd`, at most $10, `config.ts:181`, migration
  `0021_agents_floors.sql:16`). OAuth and wallet agents have no spend cap of their own; only the
  person's $2 a day applies.
- `countOk` counts drafts, notes, images and reads per agent per day (`core.ts:116-141`); approved
  spending is not counted there.

### 1.4 Gaps to fix before anyone but the owner can spend (found while reading)

1. **Video tests are never charged to a balance** (`approve.ts:53-60` calls fal with the site's key).
   Already flagged in `docs/legal/agents-owner-draft.md` ("Check: a video test is not charged to a
   balance").
2. **The estimate shown is cost, not price.** "Make it (up to $0.05)" (`src/lib/agents/wording.ts:36`,
   `edits.ts:53`) but a wallet account is debited `priceUsd(0.0515)` = $0.06695. The person would be
   charged more than the button said.
3. **"Made, for $x" shows cost, not what was charged** (`approve.ts:43` records `made.costUsd + guard`;
   `wording.ts:39`).
4. **A failure after the debit is charged twice if retried.** `generate()` debits at reserve; when it
   then fails, `runApproved` clears `approved_at` (`approve.ts:93-96`, `:105`) so the person can tap
   "Make it" again, and is debited again.
5. **The daily $2 is counted on cost** (`sum(spent_usd)`, `approve.ts:85`) **and on the approval day of
   the draft**, not on what was charged.
6. **A Farcaster person has no balance at all.** Balances are keyed by wallet account
   (`credits.ts:25-29`). "That person's prepaid balance" does not exist yet for a Farcaster account.

---

## 2. Proposal A: a person's agents spend from that person's prepaid balance

### 2.1 Shape

```
agent drafts (estimate = price) ──► /you shows "Make it, $0.07" ──► person taps ──► hold price on balance
                                                                                   │
                                                 made ◄── prompt check, model ◄────┘
                                                   │
                         settle to real cost × 1.3 (credit back the difference; all of it on failure)
```

Nothing changes for the agent: it still only drafts. Everything that spends stays behind the person's
own route, as today.

### 2.2 One balance per person

Today a balance belongs to a wallet account. Three options for a Farcaster person:

| Option | How | For | Against |
|---|---|---|---|
| **A1. Farcaster verified addresses** (recommended) | a payment to `payTo` from any address the FID has verified on Farcaster (looked up with the Neynar key the site already uses for scores) is credited to the FID | no new sign-in; the payer is provably the person's; reuses `readPayment` | Neynar lookup at claim time; a verified address can be removed later (credit stays with the FID) |
| A2. Link a wallet account to a FID | the person signs in with both once; their balances merge | works for any wallet | one more step; merging two ledgers |
| A3. Card packs | Stripe into the same balance (`docs/agents/design.md` §8) | for people new to crypto | Stripe fees, refunds terms, a new processor in Privacy |

The ledger becomes keyed by **person** (FID, or minus the wallet account), so every route reads one
balance.

### 2.3 Caps

| Cap | Today | Proposed default | Who sets it |
|---|---|---|---|
| Per agent, per UTC day | none (keys only have an all-time cap) | **$1** for every route (OAuth, wallet, key) | the person on /you, $0 to $10 |
| Per agent, all time (until the link ends) | keys only, default $1, max $10 | every route, default **$5**, max $25 | the person |
| Per person, per UTC day, all agents | $2 on cost | **$5 on price** | the owner (config) |
| Everyone's agents, per UTC day | none (videos), $25 per table (frames) | **$25 on price**, its own counter | the owner (config) |
| Counts | 20 frames, 5 videos a day per person | unchanged | the owner |

$0 is a real setting: "this agent may not spend". A new OAuth agent starts at $0 until the person sets a
cap (one tap: "Let it spend up to $1 a day").

### 2.4 Approval: options

The owner's rule so far is **"cost shown, my approval before any spend"** (`approve.ts:16-17`).

| Option | Taps per costly draft | Keeps the rule? | Risk |
|---|---|---|---|
| **1. Per draft, as today** | 1 ("Make it") | yes | taps add up when an agent drafts ten frames |
| **2. "Make all" for what's waiting** (recommended now) | 1 for the whole batch ("Make all 6, $0.42") | yes: the person sees the list and the total before anything is spent | a long list approved without reading; mitigated by showing the total and the cap left |
| 3. Pre-approved budget per agent ("make without asking, up to $1 a day, each under $0.10") | 0 | **no**: spending happens on an agent's call | an injected or stolen agent spends the budget; the agent route would import spending code, which P4a forbids today (`docs/agents/design.md` §8b) and which keeps the connector out of Claude's directory (`design.md:67-68`) |
| 4. Pre-approved for a short window ("for the next hour, make what this agent drafts, up to $0.50") | 1 per window | arguably: one approval, bounded in time and money | the same as 3, smaller |

**Recommendation:** keep option 1, add option 2 now. Option 3 or 4 only if the owner decides the rule
can bend, only for agents with a cap, off by default, and never on the `/mcp` connector meant for the
directory (a separate endpoint).

### 2.5 The markup over cost

**What "cost" is, per call:**

| Part | Frame try (Remix edit, 4 pictures in) | Video test (5 s, 480p) | Picture (text to image) |
|---|---|---|---|
| Model, worst case | $0.05 (`(1+4) × $0.01`, `config.ts:244`) | $0.025 (`$0.005 × 5`, `config.ts:171`; fal returns no price, so the estimate is the cost, `approve.ts:70`) | $0.005 (`config.ts:289`) |
| Prompt check (Groq) | $0.0015 reserved; about $0.0003 used | none today (no check on a video note; to add) | $0.0015 reserved |
| Storage (R2, private `made/`) | about 300 KB: about $0.000005 a month at R2's listed $0.015 per GB-month (unverified today; recheck) | about 1–2 MB: about $0.00003 a month | public, same order |
| Scanning | none (made here, not brought in) | none | none |
| **Worst case** | **$0.0515** | **$0.025** | **$0.0065** |

Storage and scanning are too small to price per call; the markup covers them, and the note says so.
Scanning applies only to brought-in images, which no one pays for.

**The markup:** keep the existing **30%** (one number already in Terms §6a and Principle 7's text).
Price = worst case × 1.3, held at approval; settled to real cost × 1.3 after (section 2.7).

| | Cost (worst) | Price held | Typical charge after settling |
|---|---|---|---|
| Frame try | $0.0515 | **$0.067** | about $0.03–$0.07, depending on how fal rounds megapixels |
| Video test | $0.025 | **$0.033** | $0.033 (no real price returned) |

**Shown on /you (draft wording):**
- Button: "Make it, up to $0.07 (cost $0.05 + 30%)"; for a batch: "Make all 6, up to $0.42".
- After: "Made, $0.04 from your balance (cost $0.03 + 30%)".
- Under each agent: "Spent $0.42 of $1.00 today · $2.10 of $5.00 in all · ends 2026-11-20".
- A "Balance" line at the top of the agents section, with "Add money".

**In the recipe (public, Principle 1):** the recipe already holds the model, request id, seed, prompt
and inputs (`approve.ts:43`, `:70`). Proposed: add the **listed price of the model call** (a public
fact, e.g. "fal.ai lists $0.01 per megapixel"), and nothing about who paid or how much was charged.
Reason: the owner's rule since 2026-10-08 is that no cost can be matched to a person in public; the
wallet exception (0011) is private. The charge and markup stay on /you, private. (Decision D5.)

### 2.6 Ledger and database (sketch only; no migration written)

```sql
-- One balance per person (FID > 0, or minus a wallet account). Replaces reading wallet_* directly.
studio.balance_credits (id, person bigint, source text  -- 'wallet_payment' | 'settle_back' | 'refund' | 'card'
                        , ref text                     -- tx hash, debit id, or card session id; unique per source
                        , usd numeric(12,6) check (usd > 0), at timestamptz)
studio.balance_debits  (id, person bigint, agent_id uuid null, piece_version_id uuid null,
                        kind text,                       -- 'frame' | 'video' | 'picture' | 'remix'
                        cost_usd numeric(12,6),          -- worst case at hold, real cost after settle
                        markup numeric(4,3),             -- 0.300, kept per row so a later change is honest
                        usd numeric(12,6) check (usd > 0),
                        status text,                     -- 'held' | 'settled' | 'refunded'
                        at timestamptz, settled_at timestamptz)
-- Existing wallet_payments / wallet_debits are copied in as the opening rows (a view would also do).
-- studio.agents: spend_cap_usd (all time) for every route, plus day_cap_usd; 0021's $10 floor raised to 25.
-- studio.piece_versions: price_usd beside spent_usd (cost), so /you shows both.
-- Grants as in 0011: writer insert/select only; nothing public; RLS on.
```

Balance = credits minus debits that aren't refunded. Every hold, settle and refund happens under the
person's advisory lock, as `reserve()` does today.

### 2.7 Refunds on failure

Today: none, by the owner's rule of 2026-10-13. For agent spending the person approved one call at a
time, three choices:

| | Model error, nothing made | Prompt check refuses | Safety checker drops it | Made, but cheaper than the worst case |
|---|---|---|---|---|
| **Keep final** (today) | charged | charged | charged | charged worst case |
| **Credit back what wasn't made** (recommended) | full credit back | charged the check only ($0.0015 × 1.3) | charged | difference credited back |
| Credit back everything | full | full | full | difference |

Credits go back to the balance only, never out as money ("nothing is held for anyone to withdraw",
Principle 7). This also fixes gap 4 (a retried failure charged twice). Charging a refused or dropped
call keeps a small cost on probing the checks.

### 2.8 Abuse and failure cases

| Case | Guard |
|---|---|
| A stolen key or token drafts many costly edits | nothing is spent without the person; per-agent day and all-time caps; revoke in one tap |
| An injected agent writes a misleading note to get approval | the person sees the note, the shot and the price; "Make all" shows each item and the total |
| Draining a balance quickly | per-agent and per-person day caps; counts per day; one approval per draft (`approve.ts:80`) |
| Using paid agents to dodge the free caps | agent spending is prepaid only once agents open past the owner (decision D3) |
| Laundering through the balance | no withdrawal, no transfer between people; payments over 7 days old not credited automatically (`config.ts:328`) |
| A sanctioned or stolen-funds payer | the same exposure as today's prepaid; for card packs, Stripe's checks |
| Payment ordering or ranking | none: money never touches scoring or order (Principle 7, check P7a) |
| The site's own exposure | the everyone-agents day cap; the existing `IMAGES.enabled` and `REMIX_GENERATE` switches; a new `AGENTS.spend.on` switch |

---

## 3. Proposal B: x402, agents paying per call from their own wallets

### 3.1 What x402 is (from the research; details and sources in section 8)

Researched 2026-10-21 (a research pass by the coding agent; nothing installed, nothing paid). **V** = read on
the primary source (spec or vendor docs); **U** = secondary source or inference. Numbers in brackets are the
sources in section 8.

- **What it is.** An open protocol that uses HTTP status 402 "Payment Required". The current spec is
  **v2** (`x402-specification-v2.md`, latest history entry 2025-12-09). It now lives at
  `github.com/x402-foundation/x402`; `coinbase/x402` is called a development fork. **V** [1][2]
- **Governance.** Coinbase and Cloudflare announced an x402 Foundation on 2025-09-23 (**U** [25]). It
  launched under the Linux Foundation on 2026-04-02, with Coinbase's contribution of the protocol
  complete (**V** [26]). Reported members include AWS, Cloudflare, Google, Stripe and Visa (**U** [27]).
- **The flow (v2, over HTTP).** The server answers 402 with a `PAYMENT-REQUIRED` header (base64 JSON:
  `x402Version`, `resource`, `accepts[]`). Each accepted option gives `scheme`, `network` (CAIP-2, e.g.
  `eip155:8453` for Base), `amount` (atomic units; USDC has 6 decimals), `asset`, `payTo` and
  `maxTimeoutSeconds`. The client retries with `PAYMENT-SIGNATURE`; the server answers with
  `PAYMENT-RESPONSE` (the settlement, with the transaction hash and the `payer`). v1's `X-PAYMENT`
  headers and `maxAmountRequired` are renamed. **V** [2][4]
- **Schemes.**
  - **`exact`** on EVM signs a USDC `transferWithAuthorization` (EIP-3009) for a fixed amount; the
    facilitator pays the gas and can't change the amount or recipient. The payer needs no ETH. **V** [7]
  - **`upto`** signs a cap through Permit2; the server then settles any amount up to the cap (zero
    means no transaction). This is what "charge the real cost" needs. **V** [8]
  - Also in the repo: `batch-settlement` and an `auth-capture` draft (authorize, capture, void,
    refund; v1.1 dated 2026-08-18). **V** [6][9]
  - **`exact` has no refunds.** **V** [9]
- **Facilitators.** A facilitator's `/verify` checks a payment without writing anything; its `/settle`
  submits it onchain. **V** [2]
  - **Coinbase's (CDP)** supports Base and Base Sepolia with exact, upto and batch-settlement. Verify
    is free. Settling is free for the first 1,000 transactions a month, then $0.001 each. **V** [10]
  - The x402.org facilitator is meant for testing. **V** [11]
  - Others are PayAI, thirdweb and x402.rs. Their fees are not confirmed. **U** [13][14]
  - Self-hosting is possible, but it needs a funded wallet to pay gas. **V** [11]
- **USDC on Base** is `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, the same address the site already
  reads (`config.ts:324`). **V** [15]
- **Agents with their own wallets.**
  - **Clients.** `@x402/fetch` (`wrapFetchWithPayment`), `@x402/axios`, plus Python and Go clients.
    The fetch client documents **no built-in spending cap**; the agent's side has to enforce one. **V** [16]
  - **Coinbase "Agentic Wallet".** It holds USDC for an agent, with operator-set spending limits. The
    exact parameters are not confirmed. **V/U** [18][19]
- **Next.js.**
  - `@x402/next` has `paymentProxy` (for `proxy.ts`).
  - It also has `withX402(handler, …)` for API routes, which **settles only if the handler returns a
    status below 400**. **V** [24]
  - Vercel's older `x402-mcp` and its starter template are v1-era. **V** [22]
- **MCP.**
  - **The protocol.** The v2 MCP transport answers an unpaid `tools/call` with a normal tool result,
    `isError: true`, carrying the payment requirements in `structuredContent`. The client calls again
    with `_meta["x402/payment"]`. On success, the result carries `_meta["x402/payment-response"]`
    (with `payer`). If settling fails, the tool's output is withheld. **V** [20]
  - **Libraries.** `@x402/mcp` wraps chosen tools and leaves the rest free; its client has an
    `onPaymentRequested` hook that can refuse a payment. **V** [21] Cloudflare's Agents SDK has
    `paidTool`. **V** [12]
- **Identity.**
  - **The payer.** The payer's address comes back from verify and settle (`payer`). **V** [2]
  - **Sign-In-With-X.** A "Sign-In-With-X" extension (SIWE on EVM) lets a returning payer prove its
    address. **V** [34]
  - **ERC-8004.** No formal x402 extension for ERC-8004 agent identity was found. **U** [36]
- **Security and status.**
  - **Facilitator flaws.** A 2026-07 study reported 31 vulnerabilities across 15 facilitators. Among
    them: "free shopping" when a service is delivered after `/verify` but before settling, and
    duplicate settlement. Coinbase, PayAI and Mogami acknowledged six. **The advice: release the
    service only after settlement succeeds.** **U** [30][31]
  - **Volume.** Reported volume is real but small, and partly artificial: about $19M over about 134M
    transactions by 2026-04, with about half called wash trading in one analysis. **U** [28][29]
  - **Regulation.** Nothing specific to x402 was found. **U** [32]
- **Not confirmed.**
  - An exact v2 release date from a primary source.
  - PayAI's and thirdweb's fees.
  - Agentic Wallet's limit parameters.
  - Whether Vercel's template is on v2.
  - Any figures for September or October 2026.
  - Whether the reported vulnerabilities are fixed.

### 3.2 How a Snowmoon tool call would be paid

```
agent ── POST /api/agent/v1/paid/frame {adaptation, version, shot, note} + its token ──► site
site  ── checks everything free first: token, allowlist, own version, note, blocked names, caps
site  ◄─ 402, PAYMENT-REQUIRED: upto (or exact), eip155:8453, USDC, amount = price held, payTo, resource, 60 s
agent ── signs the authorization for that amount; retries with PAYMENT-SIGNATURE
site  ── verify (facilitator) ─► reserve under caps ─► prompt check ─► model ─► store privately
site  ── settle (facilitator): upto settles real cost × 1.3; exact settles the price held
site  ── only after settlement succeeds: return the result and PAYMENT-RESPONSE (tx hash, payer)
         model fails or a check refuses: don't settle (upto: settle 0); return the reason; nothing charged
         (the site absorbs a refused prompt check, about $0.0003; with upto it could settle that instead)
         settling fails: the result is withheld and discarded (the site loses at most one call's cost)
```

Why this order:
- **Releasing only after settlement succeeds** is the advice from the 2026-07 facilitator study [30], and
  it is what the MCP transport spec does when settlement fails [20].
- Settling only after the work is made gives "no charge if nothing is made" without refund machinery,
  which `exact` lacks [9].
- The **`upto` scheme** (Permit2; CDP supports it on Base [8][10]) lets the site charge the real cost ×
  1.3 rather than the worst case. **Recommended if a test on Base Sepolia confirms it.** Otherwise use
  `exact` at the worst case × 1.3, as the prepaid balance does today.
- **Build note:** `@x402/next`'s `withX402` settles when the handler returns below 400 [24]. Check
  whether it holds the response until settlement. If it doesn't, the route calls verify and settle
  itself through `@x402/core`.
- Every payment's nonce and transaction hash go in the ledger. A replayed or duplicated settlement is
  refused (the nonce is enforced onchain [2]; keep our own unique key too, as `wallet_payments` does).

### 3.3 Which tools, at what price

| Tool | Paid by x402? | Price (worst case × 1.3, floor $0.01) |
|---|---|---|
| Reads (book, scenes, recipes) | no: free, rate limited | free |
| Drafts that cost nothing (storyboard, timing, takes, notes) | no | free |
| **Frame try** (Remix edit pipeline) | yes | **$0.067** |
| **Video test** (LongCat 480p, 5 s) | yes | **$0.033** |
| Picture for a passage (text to image) | maybe later | $0.01 (floor; $0.0085 at cost × 1.3) |
| Bring in an image | no: closed until scanning; never paid | none |
| Publish, keep, discard | never: only the person | none |

The floor covers the facilitator's fee (CDP: free for 1,000 settlements a month, then $0.001 each [10]) and keeps very small calls from being mostly fees.

### 3.4 Who the "person" is

| Payer | Person | Stamp and label | What it gets |
|---|---|---|---|
| **A linked wallet agent** (route `wallet`, it signed its person's link message, `src/lib/agents/accounts.ts:88-117`) | its linked person | "Name, agent of @x" (`accounts.ts:131-135`), as today | a private draft on the person's /you; only the person keeps it |
| An unlinked wallet (any address) | **none** | if ever shown: "made by an agent paying from 0xab12…cd34, not linked to a person" | **recommended: refused** in v1 ("link this wallet to a person on snowmoon.party first") |
| Later, maybe: unlinked, results only | none | not shown on the site | the bytes and recipe returned to the payer only; nothing kept or published |

The payer's address is in the signed authorization (`from`), so the server can match it to
`studio.agents.address` before doing anything. A linked agent paying with its own money doesn't spend
the person's balance, so the person's approval isn't needed for the **spend**; the result is still a
private draft that only the person can keep (Principle 4). Whether that counts as "approval before any
spend" is decision D8.

### 3.5 The allowlist, story words and the stamp

- **Allowlist:** the same check as every agent route: the linked person must be in `AGENTS.people`
  (`core.ts:28-36`, `:90-91`). No x402 route answers 402 to anyone else; they get the same 404.
- **Story words stay human:** paid tools make pictures and video only. Frames are made with "No text,
  no lettering" (`config.ts`, `IMAGES.suffix`); no paid tool takes narration or dialogue. A note the
  agent wrote itself is the agent's idea in the stamp ("Idea by Claude, agent of @x"), never the
  person's (`docs/agents/design.md` §3).
- **Made here:** a paid frame is "Made here" (site-run, verified recipe), as approved frames are today.

### 3.6 Where the tools live

- **REST first:** `/api/agent/v1/paid/<tool>`, the shape x402 clients expect.
- **Not on `/mcp`:** Anthropic's directory won't list a connector that moves money (`design.md:67-68`).
  If MCP is wanted, a separate endpoint (for example `/mcp/paid`) for clients that pay.

### 3.7 Risks

| Risk | Note |
|---|---|
| Facilitator dependency | verify and settle go through a third party (or a self-hosted one that needs a funded wallet for gas); if it's down, paid tools are down |
| A new outside service in Privacy | the facilitator sees the payer address, amount and resource URL |
| Exact price, not real cost | with `exact`, charged the worst case, so the difference is margin above 30% (say so); `upto` avoids it |
| Facilitator bugs | a 2026-07 study found 31 issues across 15 facilitators, including "free shopping" and duplicate settlement [30]; release after settlement only, and keep our own unique key per payment |
| No spending cap in the client | the x402 fetch client has none built in [16]; an agent's operator must set one; our caps protect the site, not the agent |
| Fees on tiny payments | a floor per call |
| Onchain publicity | every payment links the agent's address to the site's `payTo` in public (true of prepaid today) |
| Settle after work | the site may lose one call's cost when settling fails; bounded by caps |
| P4a and the "no spend tool" check | a paid tool spends (the agent's own money) on an agent's call; the check must be amended by the owner, not bypassed |
| Regulation | accepting USDC for a service, as prepaid does today; nothing held, nothing withdrawn; tax treatment not checked |
| Status of the protocol | v2 spec; Linux Foundation since 2026-04-02 [26]; real volume small and partly artificial [28][29] |

---

## 4. Terms, Privacy and consent lines (drafts for the owner's reread)

These ship only with the release that does what they say (the owner's rule of 2026-10-18). Each names
what it would describe. None is in `src/lib/legal.ts` or `consent.json`.

**Terms §6a, Prepaid, replace** "Payments are final and are not refunded, whatever the outcome of a
generation." **with (only if D6 is "credit back"):**
> Payments are final: nothing is paid back as money. If a generation you approved makes nothing
> because a model failed, its price goes back to your balance; if it costs less than the price held,
> the difference goes back to your balance. A generation our checks refuse is charged for the check only.

**Terms, "Agents", replace** "They can't spend money. … A frame is charged to your balance like any
other generation (section 6a)." **with:**
> Your agents can't spend money on their own. When an agent drafts something that costs money, you see
> its price (its cost plus 30%) before anything is made, and it is charged to your balance only when you
> approve it. You set how much each agent may spend in a day and in all, and you can set it to nothing.

**Terms, "Agents", add (Proposal B, only when it ships):**
> An agent linked to your account can pay for some tools itself, from its own wallet, in USDC on Base.
> It pays per use, at the cost plus 30% (at least $0.01). What it makes is a draft that only you can
> publish. Payments are made by the agent, not by you, and are final; nothing is charged if nothing is made.

**Privacy §4, kept when you sign in, add:**
> If you pay for generations: your balance, the payments you made (transaction, token, amount, its value
> in US dollars) and, for each generation, which of your agents asked for it, what it cost and what you
> were charged. This links money to your account, to keep your balance. If you pay from an address you
> verified on Farcaster, we look up your verified addresses to credit you.

**Privacy §7, outside services, add (Proposal B):**
> When an agent pays a tool with x402, [facilitator] checks and submits the payment. It receives the
> agent's wallet address, the amount and which tool was paid for. The payment is public on Base, as every
> Base transaction is.

**Consent, agents, add one line on /you before the first cap is set:**
> Your agent can ask; only you approve. Each approval is charged to your balance at cost plus 30%.

---

## 5. Principles

Principles touched (`docs/principles.md`), tensions first.

### Tensions (raise before resolving)

1. **P4 (no model output published without a signed-in person's action) and the owner's spending rule
   vs. pre-approved budgets and x402.** Publishing is unaffected in both proposals (drafts only), but
   any spending on an agent's call, from a budget (A, option 3/4) or the agent's own wallet (B), breaks
   P4a's agent-route check as written ("no tool named spend or pay"; tool modules never reach spending
   code, `design.md` §8b) and the owner's "approval before any spend". **Concern.** The owner decides
   whether the rule is about the person's money only.
2. **P1 (public recipe) vs. the 2026-10-08 rule that no cost is matched to a person in public.** Putting
   the charge in a public recipe would publish what a named person spent. Proposed: public recipe shows
   the model's listed price; the charge stays private. **Concern until decided (D5).**
3. **P7 (payments never enter scoring or ordering).** Paid agents must get no visibility advantage; work
   made by a paid call is ordered exactly like free work. Credits back to a balance are not
   withdrawable. **Pass, if kept that way.**
4. **Refunds vs. "Payment is final" (2026-10-13).** Credits back change a recorded owner rule.
   **Concern until decided (D6).**
5. **Main goal (people do the creative acts):** approval taps are not creative acts; option 2 ("Make
   all") cuts them without spending on an agent's call. x402 for linked agents cuts them to zero for
   the agent's own money. **Pass with option 2.**

### Others touched

| Principle | Status | Note |
|---|---|---|
| P2 (AI declared; story words human) | pass | paid tools make pictures and video; no story words; "Made here" label kept |
| P3 (model allowlist, open weights preferred) | pass | no new model; LongCat and the edit model already listed |
| P5 (nothing canon, featured) | pass | not touched |
| P6 (no third-party requests from pages; ratings private) | pass | a facilitator is called from the server only; pages unchanged. P6d stays open as accepted |
| P8 (in-world screens match the source) | not touched | |

`npm run check:principles` was not run: this branch changes one Markdown file and no code.

---

## 6. Decisions for the owner

| # | Decision | Recommended |
|---|---|---|
| D1 | Build A (agents spend from the person's balance), B (x402), both, or neither | **A first; B small and later** |
| D2 | How a Farcaster person gets a balance | **A1: payments from Farcaster-verified addresses**; card packs separately (design §8) |
| D3 | Once agents open past the owner, is agent spending prepaid only (never the site's free caps)? | **yes** |
| D4 | Approval: per draft only, plus "Make all", or a pre-approved budget | **per draft plus "Make all"**; no pre-approved budget yet |
| D5 | Recipe: show only the model's listed price, or also the charge | **listed price only; charge private on /you** |
| D6 | Refunds: keep final, credit back what wasn't made, or credit back everything | **credit back what wasn't made, to the balance only** |
| D7 | Markup: keep 30%, and a $0.01 floor for x402 | **30%; floor for x402 only** |
| D8 | x402: does a linked agent paying from its own wallet need the person's approval per spend? | **no for the spend; yes for keeping**, as for any draft |
| D9 | x402: unlinked wallets refused, or results-only | **refused in v1** |
| D10 | x402: which facilitator (Coinbase's hosted CDP, another, or self-hosted), and `upto` or `exact` | **CDP to start (free up to 1,000 settlements a month, then $0.001 each); `upto` if the testnet run confirms it** |
| D11 | Caps: $1/day and $5 in all per agent; $5/day per person; $25/day everyone's agents | as proposed, or other numbers |
| D12 | Amend P4a's agent-route check for paid tools (B, or A option 3/4) | only if D4 or D1 include them |
| D13 | Fix gaps 1–6 (section 1.4) now, even before A | **yes: they matter as soon as a wallet joins the allowlist** |

---

## 7. Cost of building each

Hours are rough, for one agent session with tests, as the estimates in `design.md` §11.

| Part | Hours | Running cost |
|---|---|---|
| **Gaps 1–6** (video charged to balance, price on the button, settle, no double charge) | 4–6 | none |
| **A:** person-keyed ledger (migration, copy of 0011's rows, balance reads), Farcaster verified-address credits | 8–12 | Neynar lookups (already paid) |
| **A:** caps per agent on every route, /you lines, "Make all" | 5–7 | none |
| **A:** hold, settle and credit back; recipe price line | 4–6 | none |
| **A:** tests (caps, races, refunds, double approval), check:ui, legal lines | 6–8 | none |
| **A total** | **27–39** | model costs only, covered by the 30% |
| **B:** x402 on two REST tools, verify then settle, linked-payer check, caps, ledger rows | 8–12 | CDP: $0 for 1,000 settlements a month, then $0.001 each |
| **B:** testnet run (Base Sepolia), then one real call under $0.10 with the owner's go | 4–6 | under $0.10 |
| **B:** a separate paid MCP endpoint (optional) | 6–10 | none |
| **B:** P4a amendment and its tests, Privacy lines | 3–4 | none |
| **B total** | **21–32** | |
| Card packs (if wanted; from `design.md` §8) | 16–24 | about $13 a month at 100 active users |

---

## 8. Sources: x402 research (verified vs. unverified)

Read on 2026-10-21. "n.d." means the page shows no date. V = verified on the primary source; U = unverified
(secondary source, a search snippet, or inference).

1. https://github.com/coinbase/x402 (README; n.d.) V
2. https://raw.githubusercontent.com/x402-foundation/x402/main/specs/x402-specification-v2.md (history to 2025-12-09) V
3. https://docs.x402.org/core-concepts/http-402 (n.d.) U (search snippet)
4. https://docs.x402.org/guides/migration-v1-to-v2 (n.d.) V
5. https://raw.githubusercontent.com/x402-foundation/x402/main/specs/x402-specification-v1.md (n.d.) V
6. https://github.com/x402-foundation/x402/tree/main/specs/schemes (n.d.) V
7. https://raw.githubusercontent.com/x402-foundation/x402/main/specs/schemes/exact/scheme_exact_evm.md (n.d.) V
8. https://raw.githubusercontent.com/x402-foundation/x402/main/specs/schemes/upto/scheme_upto_evm.md (n.d.) V
9. https://raw.githubusercontent.com/x402-foundation/x402/main/specs/schemes/auth-capture/scheme_auth_capture.md (v1.1, 2026-08-18) V
10. https://docs.cdp.coinbase.com/x402/network-support and https://docs.cdp.coinbase.com/x402/seller/facilitator (n.d.) V
11. https://docs.x402.org/core-concepts/facilitator (n.d.) V
12. https://developers.cloudflare.com/agents/agentic-payments/x402/charge-for-mcp-tools (2026-06-03) V
13. https://docs.polygon.technology/payment-services/agentic-payments/x402/analytics (n.d.) U
14. https://stablecoininsider.org/best-x402-facilitators-compared/ (about 2026-09) U
15. https://developers.circle.com/stablecoins/usdc-contract-addresses (n.d.) V
16. https://raw.githubusercontent.com/x402-foundation/x402/main/typescript/packages/http/fetch/README.md (n.d.) V
17. https://crypto.news/coinbase-backed-x402-v2-links-base-solana-and-cards-for-ai-native-payments/ (about 2025-12-11) U
18. https://docs.cdp.coinbase.com/x402/agentic-accounts/agentic-wallet (n.d.) V
19. https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets (n.d.) U
20. https://raw.githubusercontent.com/x402-foundation/x402/main/specs/transports-v2/mcp.md (n.d.) V
21. https://raw.githubusercontent.com/x402-foundation/x402/main/typescript/packages/mcp/README.md (n.d.) V
22. https://vercel.com/blog/introducing-x402-mcp-open-protocol-payments-for-mcp-tools (2025-09-12) V
23. https://theaicareerlab.com/blog/x402-mcp-server-agents-pay (n.d.) U
24. https://raw.githubusercontent.com/x402-foundation/x402/main/typescript/packages/http/next/README.md (n.d.) V
25. https://www.theblock.co/post/372064/cloudflare-coinbase-launch-x402-foundation (2025-09-23) U
26. https://docs.cdp.coinbase.com/x402/support/x402-foundation (n.d.; states 2026-04-02) V
27. https://www.bydfi.com/en/crypto-news/xrp/linux-foundation-launches-x402-foundation-with-40-members-27108 (about 2026-07) U
28. https://thedefiant.io/news/infrastructure/visa-s-sheffield-pegs-adjusted-x402-volume-at-19m (about 2026-04) U
29. https://forkast.news/half-of-x402s-transaction-volume-is-artificial-the-infrastructure-layer-keeps-building-anyway/ (about 2026-08) U
30. https://cryptoslate.com/31-newly-discovered-vulnerabilities-expose-99-of-x402-crypto-payments-to-asset-theft-and-free-shopping/ (2026-07-27) U
31. https://arxiv.org/pdf/2607.19545, https://arxiv.org/pdf/2605.30998, https://arxiv.org/pdf/2605.11781 (2026-05 to 2026-07; not opened) U
32. https://www.dotfile.com/blog-articles/genius-act-compliance-complete-guide-for-2026 (2026) U
33. https://raw.githubusercontent.com/x402-foundation/x402/main/specs/extensions/bazaar.md (n.d.) V
34. https://raw.githubusercontent.com/x402-foundation/x402/main/specs/extensions/sign-in-with-x.md (n.d.) V
35. https://github.com/x402-foundation/x402/tree/main/specs/extensions (n.d.; file names only) V
36. https://www.quicknode.com/blog/the-quicknode-erc-8004-stack-a-public-window-into-onchain-agents (about 2026-05) U

Recheck before building: the CDP fee table, whether `@x402/next`'s `withX402` can hold back the response until
settlement (or whether we call verify and settle ourselves), the upto scheme on Base through CDP, and the
status of the 2026-07 facilitator findings.
