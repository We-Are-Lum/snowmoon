# Snowmoon: Paying per person (design)

**DRAFT.** Drafted by a coding agent (Claude, a closed model by Anthropic) on branch `person-balance`, 2026-11-04, for
the owner's task "paying per person". Nothing here is decided until the owner approves it. Nothing is applied,
merged or switched on.

## What the owner asked for (2026-11-04)

- In the remix contest: 3 free remixes a day, plus as many paid ones as the person's prepaid balance covers. No
  per-person daily cap on paid ones.
- Paying must work for Farcaster, Bluesky and Lens sign-ins, not only wallet accounts.
- Payment never makes an entry: Submit never offers prepay (principle 7: payment buys generations and nothing else).

Today only a wallet account has a balance (`src/lib/people.ts`, "Money follows the wallet"; migrations 0011, 0022,
0026, 0027).

## The key question: crediting a browser-wallet payment to the signed-in person

A Farcaster, Lens or Bluesky session doesn't prove control of any wallet. Today's wallet claim works because the
wallet's own sign-in proves the address, and `readPayment` checks that the payment came from it. For a person, the
page first gets the wallet to sign a statement naming that person. The steps:

1. **Intent (one signature).** The page gets a nonce from us (today's ten-minute signed nonce,
   `src/lib/wallet/session.ts`). It builds a Sign-In with Ethereum message (EIP-4361) for snowmoon.party on Base,
   with the nonce, the wallet's address, the statement "Add payments from this wallet to the prepaid balance of
   <name> on snowmoon.party", and the request id `person:<person number>`. The wallet signs it.
2. **The server checks it** (`POST /api/balance/intent`): the session's person is a Farcaster, Lens or Bluesky
   person (wallet accounts keep today's claim); the message is ours (domain, Base, our nonce, still current); the
   request id names *this session's* person; and the signature is the address's (an ordinary wallet's is checked
   locally; a smart wallet's, EIP-1271/6492, through Base, as at sign-in). Only then does it keep an intent:
   a random id, the person, the address, the time. Insert-only.
3. **Payment.** The wallet sends USDC or ETH on Base to `IMAGES.prepaid.payTo`, as today.
4. **Claim** (`POST /api/balance/claim`, `{ intent, txHash }`): the server credits the payment only if
   - the intent was made by this session's person (otherwise "not yours", and nothing is said about the intent);
   - the intent hasn't been used (one payment per intent);
   - `readPayment(txHash, intent.address)` passes: succeeded, 3 confirmations, at most 7 days old, to us, from the
     intent's address (USDC Transfer from it; plain ETH from it; or a smart wallet's own user operation with a rise in
     payTo's balance, refusing a shared block), at least the minimum;
   - the payment's block is no earlier than a few minutes before the intent and no later than a day after it, so an
     intent can't pull in an older payment, and a signature from long ago can't take a later one;
   - the transaction hasn't been credited anywhere: not to a person, and not to a wallet account.

**Why no one can claim someone else's transaction.** To credit a transaction from address A to person P, there
must be an intent binding A to P, which needs A's signature over a message naming P. An attacker who knows a
transaction hash but not A's key can't make one. A leaked intent id is useless: the claim also needs P's session.
A message signed for P can't be replayed for Q: the request id names P, and the server compares it with the session.

**Credited once, across both kinds of account.** The same transaction could be claimed by the person (through an
intent) and by the wallet itself (by signing in with it and using today's claim). The migration adds a ledger of
credited transactions, keyed by the hash, filled by a trigger on both payment tables: the first claim wins, the other
is skipped as "already added". Today's code needs no change for this: its insert already says "already" when no row
comes back.

## Balances

- **Person balance** = the person's payments − their debits + their credit-backs, in new tables keyed by the person
  number (a Farcaster ID above zero, or a Lens/Bluesky account at or below −1,000,000,000). A wallet account's
  number is refused there: wallet accounts keep their tables and today's code.
- **Existing wallet balances stay where they are**, spendable exactly as today when signed in as that wallet.
- **A wallet linked to a Farcaster ID** signs in as the FID, so it pays and spends the **FID's** person balance. Its
  old wallet balance stays on the wallet account and isn't spent while linked (as `LINKED_WALLETS` says today). No
  merging, no moving of money between balances. The same goes for a Lens or Bluesky account linked to an FID: its
  own person balance stays its own and isn't spent while it signs in as the FID.
- **Spending order:** free first (the contest's 3 remixes a day, Pictures' daily count), then the balance, at the
  same price as wallets (estimate + markup, rounded up to $0.001). A person who doesn't pass the free check (Neynar
  score, Lens score, Bluesky check) can still pay, as wallet accounts can today (they have no gate). **Owner to
  confirm.**
- **Credit-backs:** the same three reasons as wallets (`failed`, `refused`, `dropped`), once per debit, for exactly
  that debit, to the same person.
- **Refunds:** never as money. Payments are final; nothing is held for anyone to withdraw. A balance can only be
  spent on generations here.
- **Caps:** no per-person daily cap on paid. The site-wide prepaid daily spend cap (`IMAGES.prepaid.dailyCapUsd`,
  daily totals with no person in them) stays and covers wallet and person balances together. The minimum payment
  and the 7-day claim window stay.
- **Entries:** untouched. Submit's 3 per person never offers prepay, and nothing in a balance enters any order, score
  or default (P5g, P7a).

## What is kept, and what Privacy and Terms must say

Kept privately (RLS on, no public read, append-only for the app): which wallet address signed to pay for which
person and when; each payment (transaction, token, amount, US dollar value); each generation's charge; each charge
added back. This links a wallet address to a Farcaster, Lens or Bluesky account, privately; onchain the payment is
public, as every Base payment is. The link is never shown on the site.

- **Terms §4:** "To prepay for generations, sign in with a wallet" becomes "you can prepay with any account".
- **Terms §6a:** a payment is added to the account that was signed in when the wallet signed to pay for it.
- **Privacy §4:** the prepaid paragraph covers every account, and says the paying wallet's address is kept with it.
- **Principles P6** (its prepaid exception names wallet accounts) and **`src/lib/people.ts`** ("Money follows the
  wallet") are updated in the same release.

Drafts: `docs/legal/person-balance-draft.md`. They ship only in the release that switches this on.

## Switch and order

`PERSON_BALANCE.enabled` in `src/lib/config.ts`, **off**. Off, the new routes answer "not available" and nothing in
spending changes. Turning it on needs, in one deploy: the migration applied (`NEXT_person_balance.sql`), the
Terms/Privacy lines reread by the owner, and the browser side (the sign-to-pay step and the claim), which isn't built.

## Out of scope

- The browser side (the wallet panel for a person: sign, send, claim, show the balance). Not built.
- Remix frames (`src/lib/remix/limits.ts`) and Make's coach paying from a person balance: the contest's remixes go
  through Pictures' path, which is wired. The others are a follow-up.
- Moving or merging balances (wallet → FID, Bluesky → FID), and paying for someone else on purpose.
- Any refund as money, any withdrawal, any token.
- Agents spending a person balance (agents can't spend money, Terms §6b).
- Payments older than 7 days (still "write to us").

## Merging with other branches

- `remix-submit` (the contest's remix count) changes `src/lib/images/limits.ts` too. The hook here is one call where
  the free path refuses (`limit`, `no-free`); it moves to wherever that branch refuses a fourth remix.
- The migration is additive and needs only 0011 (wallet payments). It is tested after main's migrations and the
  2026-11-04 SQL pack (`npm run test:person-balance`).
