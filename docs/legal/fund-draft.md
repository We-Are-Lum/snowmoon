# Fund Snowmoon Party: Terms and Privacy lines (DRAFT, for the owner's reread)

Branch `fund-block`, 2026-10-30. Drafted by the coding agent. **Not in `src/lib/legal.ts`**: per "legal texts
describe today", these lines go in with the release that shows the block (the owner sets `FUND.address` in
`src/lib/config.ts`), after the owner's reread. Until then nothing about gifts is live, and nothing here describes
the site today.

What ships when the address is set: on /about, under "No token", a small "Fund Snowmoon Party" block shows the
owner's wallet address (USDC or ETH on Base) with a copy button, one line on what gifts pay for, the facts
principle 7 asks for, and a short "What we want to explore" list. The site reads nothing from the chain, writes
nothing to the database and records nothing about who gave (`studio.donations` stays unused). No QR code and no
outside request from the browser.

Open questions for the owner, before the reread:

1. **Who receives.** The draft says "the project owner's wallet". If the wallet is Lum LLC's, say "Lum LLC's
   wallet" instead; if it is Nate's personal wallet, the Terms should say so plainly (the Terms are Lum LLC's).
2. **Tax.** The draft says gifts are not tax-deductible. Lum LLC is not a charity, so that is likely right; the
   words "unless we say otherwise" leave room for a future fiscal sponsor.
3. **Which chain.** The draft says Base only. A gift sent on another chain to the same address may still reach the
   wallet, but the site cannot help with it. Say if the wallet also takes Ethereum mainnet.

## Terms, section 2 ("What this is."): one sentence changed

**Today:**
> An independent, open edition of the novel Snowmoon by Vitalik Buterin, with read-aloud audio, pictures, a game
> reconstruction and a reading assistant. It is not affiliated with or endorsed by the author. There is no token.
> You can prepay for generations. Payments are final. Nothing else here is for sale.

**Proposed:**
> An independent, open edition of the novel Snowmoon by Vitalik Buterin, with read-aloud audio, pictures, a game
> reconstruction and a reading assistant. It is not affiliated with or endorsed by the author. There is no token.
> You can prepay for generations. Payments are final. Nothing else here is for sale. **You can also give to the
> project (section 6c).**

## Terms, new section 6c ("Gifts."), after 6b

**Today:** (no section)

**Proposed:**
> **6c. Gifts.** You can give to the project in USDC or ETH on Base, to the address shown on About; it is the
> project owner's wallet. A gift is a gift to the project: it buys nothing on the Service, and it changes no order,
> score or default here, and no one's standing. There is no token, and nothing is owed to you in return. Gifts are
> final: they are never refunded. Gifts are not tax-deductible unless we say otherwise. Send only on Base; a gift
> sent on another network may be lost. Gifts help pay for the image and video models, the assistant's models,
> hosting and storage, but we don't promise how any single gift is spent.

## Privacy, section 4 ("Kept by us when you sign in."): one paragraph added before "Deletions happen…"

**Today** (the paragraph it follows):
> For a wallet account we also keep its address and its prepaid balance and spending: the payments you made to us
> (transaction, token, amount and its value in US dollars), what each generation cost, and any charge added back
> to your balance because a generation gave you no picture. This links money to your account, to keep your balance.
> Payments on Base are public on-chain, as every Base transaction is. A wallet's balance stays with the wallet when
> it is linked to a Farcaster account.

**Proposed** (new paragraph after it):
> If you give to the project (Terms, section 6c), the gift is a public transaction on the blockchain, as every
> Base transaction is, visible to anyone with the sending and receiving addresses. We don't record it, and we don't
> link it to your account here. If we ever do, it will be said here first.

## Privacy, section 7 ("Outside services and what they receive."): no change

The block makes no outside request: the address is part of the page, the copy button uses the browser's own
clipboard, and the site never looks the gift up on Base. If recording gifts is built later (option below), the
"If you prepay" item would grow to cover it.

## Option for later, not built: recording gifts

`studio.donations` and `studio.attestations` (migration 0002) were designed to record on-chain gifts. A later
version could list gifts publicly (address, amount, date) from the chain, for thanks, with no link to accounts
unless a giver asks. That would need: a chain read (a Privacy §7 line), the Privacy §4 line above replaced, and
principle 7's check (P7a) keeping any list of givers out of every order, score and default. Not proposed now.
