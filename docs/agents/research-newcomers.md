# Research: people new to crypto and AI (investigation only; nothing built)

Research by a coding-agent helper, 2026-10-20, from the providers' own pages unless marked
[3rd-party] or [unverified]. Nothing was signed up for or spent. Not legal advice.

## The biggest finding

Coinbase is ending **guest checkout** (debit card or Apple Pay with no Coinbase account) in its
hosted onramp widget, effective 30 June 2026. That path is now gone, or limited to Coinbase's
"Headless" API, which needs Coinbase to approve the app. Coinbase's pages disagree on the wording
("is being discontinued" against "will be deprecated"); confirm with them before relying on it.

## 1. Signing in without Farcaster or a wallet

| Option | Cost at 100 / 1,000 users | Gives a Base address? | Where the data lives |
|---|---|---|---|
| **Supabase Auth**, an email code or link | $0 extra: the Free plan includes 50k monthly active users, Pro 100k ([pricing](https://supabase.com/pricing)) | no | our own Postgres (the `auth` schema); no new company |
| Auth.js + **Resend** to send the emails | Auth.js free; Resend free for 3,000 a month but capped at 100 a day, Pro $20 a month for 50k ([pricing](https://resend.com/pricing)) | no | our database; Resend keeps addresses and send logs |
| Postmark instead of Resend | free for 100 a month; Basic $15 a month for 10k; keeps content 45 days ([pricing](https://postmarkapp.com/pricing)) | no | Postmark |
| Clerk | free up to 50k monthly users; passkeys need Pro at $25 a month ([pricing](https://clerk.com/pricing)) | no | Clerk (US hosting reported, [3rd-party, unverified]) |
| **Passkeys we host ourselves** (the SimpleWebAuthn library) | $0 | no | only a public key per person, in our database: the most private option |
| **Coinbase Base Account** (a smart wallet behind a passkey) | no published fee [unverified]; gas can be sponsored ([docs](https://docs.cdp.coinbase.com/coinbase-wallet/overview)) | **yes**: fits our existing wallet sign-in and prepaid flow | Coinbase |
| Coinbase embedded wallets (email sign-in) | 5,000 wallet actions a month free, then $0.005 each ([pricing](https://docs.cdp.coinbase.com/embedded-wallets/pricing)); whether logins are billed isn't stated | yes | Coinbase |
| Privy | free up to 499 monthly users, then $299 a month ([pricing](https://www.privy.io/pricing)) | yes | Privy |
| Thirdweb | 1,000 wallets free; Growth $99 a month; $0.015 per user beyond ([pricing](https://thirdweb.com/pricing)) | yes | Thirdweb |
| Dynamic | no free live plan; $249 a month up to 5k users ([pricing](https://www.dynamic.xyz/pricing)) | yes | Dynamic |
| Turnkey | 25 free signatures a month, then $0.10 each; Pro $99 a month ([pricing](https://www.turnkey.com/pricing)) | yes | Turnkey |

Base Account is the only option that gives a newcomer a Base address with our current flow and
no paid vendor, but it is still a wallet. Supabase's built-in email sender is believed to be
heavily rate-limited, so a sender such as Resend would be needed [unverified].

## 2. Paying by card

**Stripe Checkout for prepaid packs.** US cards 2.9% + 30¢; +1.5% international, +1% currency
conversion; disputes $15; refunds free but the fee isn't returned; Stripe Tax 0.5% or $0.50 a
transaction where registered ([pricing](https://stripe.com/pricing)). The fixed 30¢ is what
hurts small packs:

| Pack | Fee | Share |
|---|---|---|
| $2 | $0.36 | 18% |
| $5 | $0.45 | 8.9% |
| $10 | $0.59 | 5.9% |
| $20 | $0.88 | 4.4% |

Stripe allows credits we issue ourselves ("may be subject to limits"; credits issued by others
are restricted: [restricted businesses](https://stripe.com/legal/restricted-businesses)). Expect a
review question. Stripe receives name, email, card, billing country and ZIP, IP and device data,
and uses them for its own fraud checks as an independent controller ([privacy](https://stripe.com/privacy)).

**Card-to-crypto onramps** (each needs identity checks and a $5–$20 minimum, heavy for a $3 purchase):
- **Coinbase Onramp:** free to us; the user pays 2.5% on cards (credit cards not in the US), 0.5% ACH,
  plus a spread; minimum about $5; US debit limit was $500 a week; guest checkout ending (above)
  ([FAQ](https://docs.cdp.coinbase.com/onramp/additional-resources/faq.md)).
- **Stripe Crypto Onramp:** public preview, application (about 48 hours); Stripe handles KYC, fraud
  and disputes; US (not Hawaii) and EU; USDC on Base listed ([docs](https://docs.stripe.com/crypto/onramp)).
  Customer fee about 1.5% + 30¢ [3rd-party].
- **MoonPay:** about 3.99–4.5% on cards, roughly $20 minimum, KYC [3rd-party, conflicting].

For a newcomer, Stripe Checkout beats every onramp.

## 3. Legal points (general information, not advice)

- FinCEN exempts **closed-loop prepaid access** (spendable only with the issuer) up to $2,000 per
  device per day, counting all value loaded that day
  ([FinCEN FAQ](https://www.fincen.gov/resources/statutes-regulations/guidance/frequently-asked-questions-regarding-prepaid-access)).
  Our packs are far below it. Keep credits non-transferable and non-cashable.
- Not checked: state unclaimed-property (escheat) rules for unused balances, state gift-card expiry
  rules, sales tax on digital services.

## 4. What each would add to Privacy and Terms

- **Supabase Auth or Auth.js:** the email sender (Resend or Postmark) as a processor: email address
  and send logs. Supabase is already listed.
- **Clerk, Privy, Thirdweb, Dynamic, Turnkey:** that vendor as a processor (email, IP, device,
  session data; for wallet vendors the address and key material).
- **Base Account or Coinbase:** Coinbase; the address is onchain and public.
- **Stripe:** Stripe, receiving payment, contact and fraud-check data as an independent controller.
- **Onramps:** the provider as an independent controller for identity checks.
- **Terms:** credits are a licence, not money (non-transferable, non-cashable, only on
  snowmoon.party); price per image; refunds of unused credit within N days, none on spent credit;
  whether credits expire (check state rules first); chargebacks suspend the account; taxes; for
  onramps, the provider's terms govern the purchase.

## Recommendation from the research

The easiest path for a newcomer: **an email code through Supabase Auth (sent by Resend), with
optional passkeys we host ourselves, plus Stripe Checkout selling $5 and $10 packs** credited to
the existing prepaid balance. No wallet needed; data stays in our database; the only new
processors are Resend and Stripe. Keep Farcaster and wallets alongside; add Base Account later as
"make me a wallet".

Rough monthly cost, if 30% of active users buy one $5 pack a month (US cards):
- **100 users:** about $13 (Stripe), on about $150 in sales.
- **1,000 users:** about $154 (Resend $20, Stripe about $134), on about $1,500 in sales.

$10 packs bring Stripe's share down to about 6%.
