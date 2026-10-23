# Credits for generations that weren't made: Terms wording (DRAFT, for the owner's reread)

Owner, 2026-10-21: "credit the balance for anything charged but not made. 'Payments are final' means no cash
refunds. Draft the Terms wording."

Nothing here is live. `src/lib/legal.ts` and `src/lib/consent.json` are unchanged. The words below go in only when
you say "reread", in the same deploy that turns credit-back on, so the Terms always describe what the site does
that day.


## Reread and live: reading B (owner, 2026-10-22, "#35: reread, with the tidier §6a sentence")

The owner chose **B** and changed §6a: "at its estimated cost plus 30%" becomes "at the price shown when you start
it", and the last sentence is the coding agent's wording, which matches what the code does (a payment is added by
the page, not by a server watching the address; that is on the backlog). Reread by the owner on 2026-10-22 with the tidier second sentence, below; in `src/lib/legal.ts`. Prices are
rounded up to the nearest $0.001 and shown in three decimals (owner, 2026-10-22).

**Terms §6a (replaces the whole paragraph):**
> You can pay in USDC or ETH on Base to the address the Service shows. Each generation is charged to your balance
> at the price shown when you start it. If a generation doesn't give you a picture (a check or
> the image model didn't answer, the rules refused the prompt, or the safety checker dropped the picture), that
> charge is added back to your balance. Payments are final: what you pay is never refunded or paid out as money,
> and your balance can only be spent on generations here. A payment made through the Service is added to your
> balance once it has 3 confirmations, while the page is open or the next time you open your wallet on that device.
> You can also add a payment from your wallet by its transaction, on the wallet panel. Either way, this works within
> 7 days of the payment; after that, write to us and we'll add it.

**Privacy §4, the wallet paragraph (its first sentence gains the last clause):**
> For a wallet account we also keep its address and its prepaid balance and spending: the payments you made to us
> (transaction, token, amount and its value in US dollars), what each generation cost, and any charge added back to
> your balance because a generation gave you no picture. This links money to your account, to keep your balance.
> Payments on Base are public on-chain, as every Base transaction is. A wallet's balance stays with the wallet when
> it is linked to a Farcaster account.

**The wallet-panel note (`IMAGE_WORDING.prepaid.termsCreditBack`), B:**
> You're paying for image generation on this site. Each Generate is charged the price shown when you press it. If
> it doesn't give you a picture (a check or the image model didn't answer, the prompt was blocked, or the safety
> checker dropped the image), the charge is added back to your balance. Payments aren't refunded as money.

After a credit, appended to the error: "No picture came back, so the charge was added back to your balance."

"The price shown": every control that charges a wallet now shows the exact charge, in three decimals
(Pictures' Generate buttons, Remix's Generate button, an agent frame's Make it); reference pictures, whose price
differs and isn't shown, are refused for wallet accounts.

## What the site does today (origin/main, 2026-10-21)

Nothing charged is credited back, whatever the outcome. The Terms say the same, so today they are accurate.

- A wallet account is charged when it presses Generate (Pictures) or makes a Remix frame, before anything else
  runs: `reserve()` in `src/lib/images/limits.ts:58-67` and `src/lib/remix/limits.ts:47-55`.
- If the prompt check or the image model then doesn't answer, nothing is made, the cost totals are corrected,
  and the charge stays: `src/lib/images/paid.ts:53-71`, `src/lib/remix/make.ts:86-106`. Pressing again charges
  again.
- `wallet_debits` is append-only and has no way to credit anything back (migration `0011_wallet_prepaid.sql:71-84`).

The code to credit back is in PR "wallet-charge-gaps" (migration 0022, not applied; switched off by
`IMAGES.prepaid.creditBack` until you reread this).

## Which outcomes are credited back: your decision

"Anything charged but not made" can be read two ways. The PR does reading A; B is a small change to it.

| Outcome | Made? | A (in the PR) | B (every outcome with no picture) |
|---|---|---|---|
| The prompt check or the image model didn't answer | no | credited back | credited back |
| The prompt is refused (blocked name or the rules check) | no | stays charged | credited back |
| The safety checker drops the picture | made, then dropped | stays charged | credited back |
| A picture is made | yes | charged | charged |

For A: a refused prompt or a dropped picture stays charged, so probing the checks still costs something, as the
proposal for agents suggested (`docs/proposals/agents-paid-tools.md` §2.7). For B: the person never pays for
something they don't get. The wording below is given for both.

## 1. Terms, section 6a (Prepaid generations): replace the whole paragraph

**Today:**
> You can pay in USDC or ETH on Base to the address the Service shows. Each generation is charged to your
> balance at its estimated cost plus 30%. Payments are final and are not refunded, whatever the outcome of a
> generation. A payment is credited once it has 3 confirmations; one more than 7 days old is not credited
> automatically — write to us.

**Proposed (A):**
> You can pay in USDC or ETH on Base to the address the Service shows. Each generation is charged to your
> balance when you start it, at its estimated cost plus 30%. If nothing is made because a check or the image
> model didn't answer, that charge is added back to your balance. A prompt the rules refuse, or a picture the
> safety checker drops, stays charged. Payments are final: what you pay is never refunded or paid out as money,
> and your balance can only be spent on generations here. A payment is credited once it has 3 confirmations; one
> more than 7 days old is not credited automatically — write to us.

**Proposed (B):** the same, with the third and fourth sentences replaced by:
> If a generation doesn't give you a picture (a check or the image model didn't answer, the rules refused the
> prompt, or the safety checker dropped the picture), that charge is added back to your balance.

Where: `src/lib/legal.ts`, Terms, the `n: '6a'` entry (line 63 on origin/main).

## 2. Terms, section 2 (What this is): no change proposed

**Today:**
> … You can prepay for generations. Payments are final. Nothing else here is for sale.

These are your words. "Payments are final" stays true under the new 6a, which now says what it means (no money
back; credits go to the balance). If you'd like it said here too, a possible line: "Payments are final; a
generation that isn't made is credited back to your balance." Your call.

## 3. Privacy, section 4 (Kept by us when you sign in): one addition

**Today:**
> For a wallet account we also keep its address and its prepaid balance and spending: the payments you made to us
> (transaction, token, amount and its value in US dollars) and what each generation cost. This links money to
> your account, to keep your balance. …

**Proposed:**
> For a wallet account we also keep its address and its prepaid balance and spending: the payments you made to us
> (transaction, token, amount and its value in US dollars), what each generation cost, and any charge added back
> to your balance because nothing was made. This links money to your account, to keep your balance. …

Where: `src/lib/legal.ts`, Privacy, `n: 4`, the wallet paragraph (line 97 on origin/main). The new rows are in
`studio.wallet_credits` (migration 0022): the debit, the account, the amount and why. Nothing public.

## 4. The note shown before paying (not legal.ts, but the same promise)

**Today** (`IMAGE_WORDING.prepaid.terms`, `src/lib/images/wording.ts:299-300`, shown in the wallet panel):
> You're paying for image generation on this site. Each Generate is charged when you press it, whatever comes
> back, including a blocked prompt or an image the safety checker drops. No refunds.

**Proposed (A)** (already in the PR as `termsCreditBack`, shown only once credit-back is on):
> You're paying for image generation on this site. Each Generate is charged when you press it. If nothing comes
> back because the prompt check or the image model didn't answer, it's added back to your balance. A blocked
> prompt or an image the safety checker drops stays charged. Payments aren't refunded as money.

**After a credit** (also in the PR, appended to the error): "Nothing was made, so it was added back to your balance."

## Before it goes live

1. You choose A or B and say "reread" for sections 1, 3 and 4 (and 2 if you want it changed).
2. Migration 0022 is applied (as postgres, dry run first).
3. In one deploy: legal.ts 6a and Privacy §4 updated (new effective date; `ownerReread` set on your word),
   `IMAGES.prepaid.creditBack` set to true.

## Follow-ups not covered here

- A generation made for less than its estimate is still charged the estimate (the worst case plus 30%). Settling
  to the real cost and crediting back the difference (proposal §2.7): owner, 2026-10-23, "no real-cost-plus-difference".
  Not planned.
- Turning credit-back off now means "no new credits" (owner, 2026-10-23; PR credit-back-off-keeps-credits): the
  balance always counts credits already given, whatever the switch says. Turning it off would still make Terms 6a
  untrue ("that charge is added back to your balance"), so it needs a Terms change and your reread in the same deploy.
