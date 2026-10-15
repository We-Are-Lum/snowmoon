# Privacy Policy: wallet section (DRAFT for the owner's reread)

**Copy of `docs/legal/privacy-wallet-draft.md` on `site-launch-caps` (41009a7), revised on
`remote-oct14` on 2026-10-14 after the owner's reread of chunk 1:** the wallet signs more than the
sign-in message (the payment is a transaction it signs), and the address being public onchain is now
said outright. "Payment is final: there are no refunds" moved to a Terms draft
(`docs/drafts/terms-prepaid.md`) for the owner to decide. The `site-launch-caps` copy is unchanged.

Drafted by the coding agent on 2026-10-14 for the owner's reread. **Not in `src/lib/legal.ts`** and
not shown on the site. After the reread, the owner's words go into the Privacy Policy (and its
fact-check, `docs/legal/privacy-fact-check.md`); then 0012 is applied; then `site-launch-caps` is
merged when the owner says.

It covers what the site keeps when someone signs in with a wallet and pays for images: the wallet
address, onchain payments and balances, and the per-wallet daily count. Below the draft, every
sentence is checked against the code.

## Where it goes

A new section after section 4 ("Kept by us when you sign in"), numbered 5, with the later sections
renumbered; plus one line each in sections 6, 7 and 9 (below).

## Draft

**5. If you sign in with a wallet.** You can sign in with an Ethereum wallet instead of Farcaster, to
pay for making images. Then we keep:

- **Your wallet address.** Signing in asks your wallet to sign one message, which proves the address
  is yours; we keep the address to hold your account. Paying asks your wallet to approve a payment
  you send to us (below). We never hold your keys, and nothing leaves your wallet unless you approve
  it there.
- **Your payments and your balance.** When you pay in USDC or ETH on Base, we record the
  transaction (its hash, the token, the amount, its value in US dollars when we credited it, and the
  block) against your account. Each image you make records what it cost you. Your balance is your
  payments minus those costs.
- **How many images you make each day,** under your wallet account, to count the daily limit of
  300 per wallet. We keep the count and the time, not what you asked for.

Your sign-in is kept in your browser for 24 hours. Your wallet address and your payments to us are public on
the blockchain: anyone can see a transaction from your address to ours, and we can't hide or remove
it.
Records of what images cost the project overall are kept as daily totals, without your account.

**Section 6 (What you publish), add:** If you publish an image while signed in with a wallet, it is
credited to a shortened form of your address (for example 0x4FEA…4FfA).

**Section 7 (Outside services), add:** To check a payment, our server asks Base's public network
about that transaction. Your wallet app talks to Base when you pay; that's between you and your
wallet.

**Section 9 (Keeping and deleting), add:** Wallet accounts, payments and costs are kept while the
account is used, like other account records, until you ask us to erase them. What is on the
blockchain stays there.

## Fact-check

| Line | True? | Where |
|---|---|---|
| Sign in with an Ethereum wallet, to pay for images | true | Sign-In with Ethereum (EIP-4361), `src/lib/wallet/session.ts`; a wallet session is accepted only by the image routes and consent (`src/lib/auth.ts`, `WALLET_ROUTES` in `src/lib/client-auth.ts`) |
| We keep the address to hold the account | true | `studio.wallet_accounts (id, address, created_at)`, `supabase/migrations/0011_wallet_prepaid.sql` |
| Signing in asks for one message; paying asks the wallet to approve a payment; we never hold keys; nothing leaves without approval | true | sign-in: `wallet.signMessage` (`src/lib/wallet/client.ts:43`); payment: `writeContract` USDC `transfer` (`:68`) or `sendTransaction` ETH (`:73`), each approved in the person's wallet; the server only reads the chain (`src/lib/wallet/chain.ts`). The earlier line "signs nothing else" was false |
| Payment recorded: hash, token, amount, USD value at crediting, block | true | `studio.wallet_payments (tx_hash, account_id, chain_id, token, amount, usd, block_number, credited_at)`, 0011 |
| Each image records what it cost you | true | `studio.wallet_debits (account_id, usd, at)`, written by `reserve` (`src/lib/images/limits.ts`) |
| Balance = payments minus costs | true | `balanceUsd`, `src/lib/wallet/credits.ts` |
| Daily count of 300 per wallet; count and time, not the prompt | true **after `site-launch-caps`** | `studio.image_asks (fid, at)` with the account's negative number; `IMAGES.prepaid.perDay`; before that branch, wallet Generates are not counted |
| Sign-in kept in the browser for 24 hours | true | `localStorage['snowmoon.wallet']`; token lifetime `IMAGES.prepaid.sessionHours` (24); nothing stored server-side for sessions |
| Address and payments are public onchain | true | a property of the chain (Base, `chainId` 8453) |
| Overall costs kept as daily totals without the account | true | `studio.image_costs` has no account column; `funded` says only free or prepaid |
| Published images credited to a shortened address | true | `shortAddress` (`0x1234…abcd`), `src/app/api/images/publish/route.ts` |
| Our server asks Base's public network about the transaction | true | `IMAGES.prepaid.rpcUrl` (`https://mainnet.base.org`) unless `BASE_RPC_URL` is set (`src/lib/wallet/chain.ts`); if the owner sets `BASE_RPC_URL` to a provider, section 7 should name it |
| Kept until erased | true | wallet tables are append-only for the app (`test:wallet`, "append-only"); erasure by the maintainer, `docs/removal.md` |
| Not checked here | — | Whether the site ever shows the full address anywhere (I found only `shortAddress`); the pending payment hash kept in the browser (`localStorage['snowmoon.wallet.pending']`) until it's credited, which the draft doesn't mention |

## For the owner

1. The draft says "300 per wallet". If the number changes before the merge, change it here too.
2. The pending payment hash in the browser (last row) is small and local; mention it in section 3
   ("Kept on your device only") if you want the list there complete.
3. "We can't hide or remove it" about onchain payments is the honest limit of erasure for wallet users.
