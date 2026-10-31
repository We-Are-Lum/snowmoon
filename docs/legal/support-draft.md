# "Support this site": the Terms line (DRAFT, for the owner's reread)

Branch `support-page`, 2026-10-30. Drafted by the coding agent (Claude, by Anthropic). Reread by the owner on 2026-10-30, who replaced it with a shorter version (below, "As reread"); that version is Terms 6c in `src/lib/legal.ts`. It
ships in the same merge as the page, after your reread (owner, 2026-10-18: texts describe today).

Owner, 2026-10-30: "Terms line for my reread: a gift, no rewards or refunds, not an investment, not tax-deductible. No
Privacy change while nothing is recorded."

## As reread (owner, 2026-10-30): Terms 6c

> **6c. Support.** You can send money to the address on the Support page (a Splits account on Ethereum or Base) to help
> pay for the Service. It's a gift: it buys nothing on the Service, isn't an investment, can't be refunded and isn't
> tax-deductible (Lum LLC is not a charity). Send it only on the networks the page names; money sent on any other
> network may be lost. How it's shared out is public on Splits.

The footer and About links to /support stay hidden (`SUPPORT.linked` false) until the owner's $1 test passes.

## The first draft (replaced): a new section 6c, after 6b (Agents)

Today there is no section about gifts. §6a (Prepaid generations) covers payments that buy generations; a gift is
different, so it gets its own short section.

**Proposed:**

> **6c. Support.** You can send money to the address on the Support page (a Splits account, on Ethereum or Base) to
> help pay for the Service. It is a gift. It buys nothing on the Service and earns no reward, no place in any order,
> no score and no say. It is not an investment, and there is no token. It is final: it is never refunded or paid back.
> It is not tax-deductible: Lum LLC is not a charity. Send it only on the networks the page names: money sent on any
> other network may be lost, and we can't recover it. What the address receives is shared out as its Split says, which
> anyone can see on Splits.

## Privacy: no change

Nothing about a sender is recorded:
- **The page:** it shows the address, a QR code drawn on our server, and links. It calls no API of ours (test:support
  S6; check:ui counts the page's requests to our API, and expects none).
- **"Send with your wallet":** your wallet sends the transaction straight to the network. Our server is never told.
- **The transaction:** it is public on the blockchain, as any transaction is. We don't read it, keep it or link it to
  your account.

If that changes (for example, a thank-you list of supporters), Privacy gets its lines first, in that release.

## For the reread

- **"Lum LLC is not a charity":** Terms §1 names Lum LLC as who runs the Service. Say if the gift should be described
  as going somewhere else (the Split's recipients are visible on Splits).
- **"we can't recover it":** a Split is a contract. On a network where it doesn't exist (anything but Ethereum and
  Base, checked with eth_getCode on 2026-10-30), the address has no owner who could move funds. Whether money sent
  there could ever be recovered depends on Splits deploying the same address there later; the line doesn't promise
  either.
- **The heading options** for the page (not "donate"): "Fund the next scene" (shown now), "Back Snowmoon Party",
  "Keep the lights on". All the page's words are in `src/lib/support-wording.ts`, marked draft.
