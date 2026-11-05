# Snowmoon: Paying per person, Terms and Privacy lines (draft)

**DRAFT, for the owner's reread.** Drafted by a coding agent (Claude, a closed model by Anthropic) on branch
`person-balance`, 2026-11-04. Design: `docs/proposals/person-balance.md`. Nothing here is in `src/lib/legal.ts`.
`LEGAL.ownerReread` is not touched. These lines ship only in the release that turns `PERSON_BALANCE` on, together with
the browser side, which isn't built yet (legal texts describe today).

"Before" is quoted word for word from `src/lib/legal.ts` on branch `signin-lens-bluesky` (82a07763). Where several
sentences of a paragraph stay the same, they are kept in full in "after" so the paragraph can be pasted whole.

## Terms

### §2 What this is: no change

> You can prepay for generations. Payments are final. Nothing else here is for sale.

Still true.

### §4 Who can use it: last sentence

**Before:**

> To prepay for generations, sign in with a wallet (section 6a).

**After:**

> You can prepay for generations with any of these accounts (section 6a).

### §6a Prepaid generations

**Before:**

> You can pay in USDC or ETH on Base to the address the Service shows. Each generation is charged to your balance at the price shown when you start it. If a generation doesn't give you a picture (a check or the image model didn't answer, the rules refused the prompt, or the safety checker dropped the picture), that charge is added back to your balance. Payments are final: what you pay is never refunded or paid out as money, and your balance can only be spent on generations here. A payment made through the Service is added to your balance once it has 3 confirmations, while the page is open or the next time you open your wallet on that device. You can also add a payment from your wallet by its transaction, on the wallet panel. Either way, this works within 7 days of the payment; after that, write to us and we'll add it.

**After:**

> You can pay in USDC or ETH on Base to the address the Service shows. If you are signed in with Farcaster, Lens or Bluesky, your wallet first signs a message naming your account, and a payment from that wallet made soon after is added to that account's balance. Your free generations are used first; then each generation is charged to your balance at the price shown when you start it. If a generation doesn't give you a picture (a check or the image model didn't answer, the rules refused the prompt, or the safety checker dropped the picture), that charge is added back to your balance. Payments are final: what you pay is never refunded or paid out as money, and your balance can only be spent on generations here. Paying never makes an entry in a challenge. A balance stays with the account it was paid to, including when that account is linked to another. A payment made through the Service is added to your balance once it has 3 confirmations, while the page is open or the next time you open your wallet on that device. You can also add a payment from your wallet by its transaction, on the wallet panel. Either way, this works within 7 days of the payment; after that, write to us and we'll add it.

Changed: the second and third sentences (new), "Paying never makes an entry in a challenge." (new), "A balance stays with the
account it was paid to, …" (new). The rest is as before.

**For the owner:** the last two sentences of "before" must stay true once the browser side is built: for a Farcaster,
Lens or Bluesky account, "add a payment by its transaction" works only for a wallet that has signed for that account.
If the page can't offer that, the sentence becomes "If you sign in with a wallet, you can also add …".

### §6b Agents: no change

Agents' frames go through Remix, which this branch doesn't connect to a person balance, so "on a Farcaster account it
uses your free frames for the day; on a wallet account it's charged to your balance" stays true. It changes when Remix
frames are connected.

## Privacy

### §4 What we keep: the prepaid paragraph

**Before:**

> For a wallet account we also keep its address and its prepaid balance and spending: the payments you made to us (transaction, token, amount and its value in US dollars), what each generation cost, and any charge added back to your balance because a generation gave you no picture. This links money to your account, to keep your balance. Payments on Base are public on-chain, as every Base transaction is. A wallet's balance stays with the wallet when it is linked to a Farcaster account.

**After:**

> For a wallet account we also keep its address. If you prepay, we keep your prepaid balance and spending: the payments you made to us (transaction, token, amount and its value in US dollars), what each generation cost, and any charge added back to your balance because a generation gave you no picture. If you pay for a Farcaster, Lens or Bluesky account, we also keep the address of each wallet that signed to pay for it, and when. This links money, and the wallets you pay from, to your account, to keep your balance; we don't show that link on the site. Payments on Base are public on-chain, as every Base transaction is. A balance stays with the account it was paid to, including when that account is linked to another.

### §7 Who else receives data: the Base line

**Before:**

> If you prepay: Base's public network endpoint receives the transaction we look up to confirm your payment.

**After:**

> If you prepay: Base's public network endpoint receives the transaction we look up to confirm your payment, and, for a smart wallet, the message it signed to pay for your account, to check its signature.

(A wallet sign-in already sends a smart wallet's sign-in message to the same endpoint, the same way; the current line
doesn't say so. The owner may want that said once, for both.)

### §3 Kept on your device: to check when the browser side is built

> … and a payment you have sent but not yet seen credited.

Probably still true. The page will also keep the signed-for-your-account note (the intent's id) with that payment. If
so: "… and a payment you have sent but not yet seen credited, with the note that your wallet signed for it."

## Not in these lines (on purpose)

No table names, no time window ("soon after" stands for a setting that may change), no gateway accounts, no
per-person cap (there is none), and no site-wide daily spending cap (the current Terms don't name it either).
