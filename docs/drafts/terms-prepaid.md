# Terms of Service: prepaid images (DRAFT for the owner to decide)

Drafted by the coding agent on 2026-10-14. Not in `src/lib/legal.ts`; nothing here ships until the
owner says "reread". Moved here from the privacy wallet draft, where "Payment is final: there are
no refunds" sat (`docs/drafts/privacy-wallets.md`).

## What the code does today (branch `site-launch-caps`, checked 2026-10-14)

- **When you're charged.** A wallet account is debited when it presses Generate, before anything
  else runs (`reserveIn`, `src/lib/images/limits.ts`). The price is the worst-case cost reserved
  for that Generate plus a 30% markup (`priceUsd`, `src/lib/wallet/credits.ts`; `IMAGES.reserveUsd`
  0.0065 and `IMAGES.prepaid.markup` 0.3, so $0.00845 for a default image).
- **Not charged:** a Generate refused because the wallet reached its 300 for the day, its balance
  is too low, or the site-wide prepaid circuit breaker is reached. These are checked before the debit.
- **Charged, and never credited back** (`src/lib/images/paid.ts`; `settle` changes the site's cost
  totals, not the wallet):
  1. a prompt naming someone on the blocked list;
  2. a prompt the prompt check blocks;
  3. **the prompt check not answering** (an outage on our side or Groq's);
  4. **the image model not answering** (an outage at fal.ai);
  5. an image the host's safety checker flags, which is dropped.
- The charge is the worst case, not what the image actually cost.
- The payment screen already says: "Each Generate is charged when you press it, whatever comes back,
  including a blocked prompt or an image the safety checker drops. No refunds."
  (`IMAGE_WORDING.prepaid.terms`). It doesn't mention outages (3 and 4).
- **If the site shut down:** nothing in the code, the Terms or `docs/removal.md` covers unused
  balances. They would stay as rows in the database; there is no withdrawal or refund path.

## Decisions for the owner

1. Keep "no refunds", as the payment screen says?
2. Should outages (3 and 4 above) still cost the Generate? Not charging them is a code change in
   `paid.ts` (credit the price back when the check or the model doesn't answer).
3. What happens to unused balances if the site closes? Options: refunded to the paying address on
   request, minus fees; or stated plainly as non-refundable.

## Draft lines (for the owner to rewrite)

**Prepaid images.** You can pay in USDC or ETH on Base to make images. Your balance is spent when you
press Generate, whatever comes back, including a prompt the rules block or an image the safety
checker drops. Payment is final: there are no refunds.

*(Line for decision 3, to be written once the owner decides.)*
