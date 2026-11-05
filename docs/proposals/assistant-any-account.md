# Snowmoon: Assistant for any account (DRAFT)

**DRAFT. Drafted by a coding agent (Claude, a closed model by Anthropic)** for the coordinator (session snowmoon-9c),
2026-11-05. Branch `designs-2026-11-05`. Design only: nothing is built. Legal and notice lines are drafts for the
owner's reread and never go into `src/lib/legal.ts` or `src/lib/chat/notice.ts` from this branch.

Target: the next release, with linked accounts v2 (`linked-accounts-v2.md`) and paying per person
(`origin/person-balance`).

## Today (origin/main 943fc604; same on `bluesky-check`)

- **Who can ask:** a Farcaster sign-in, or an account linked to a Farcaster ID, which asks as that FID
  (`getPerson`). Anyone else gets 403: "Sign in with Farcaster to use the assistant". The routes are
  `src/app/api/chat/ask` and `src/app/api/chat/status`. **There is no Neynar check:** any FID can ask.
- **Limit:** `CHAT.messagesPerDay` = 30 per FID per UTC day, counted in `studio.chat_calls` (FID, kind, model, time).
  Refusals and held-back answers count, and so does a question whose model call failed after the reserve.
  There is a site-wide `CHAT.dailySpendCapUsd` of $2 a day (a test cap), summed from `studio.chat_costs`: daily totals
  with no FID (0007).
- **Model and route:** gpt-oss-120b (answers) and gpt-oss-safeguard-20b (guards), both open-weights. Groq is called
  directly first, with the project's Groq key (`CHAT.direct`). The Vercel AI Gateway is the fallback, with zero data
  retention on both routes (`CHAT.gatewayFallback`). Note: this isn't "Groq through the gateway" only. The
  direct-first route is the owner's choice of 2026-10-08 and is unchanged here.
- **Cost per question:** reserved at the worst case (`worstCaseUsd(3000, 9000, 24000)`): search words, up to 2
  answers, up to 6 guard or support calls. At `CHAT.prices` that is about **$0.0099**. A typical question (one search,
  one answer, one guard, one support check) comes to roughly **$0.003** (my estimate from token sizes; not measured).
- **Notice** (`src/lib/chat/notice.ts`, P6e/P6f), item 4: "The app records only how many you ask and when, under your
  Farcaster ID, to count the daily limit. Cost records are kept without your ID." **P6i:** the notice names exactly
  the services Privacy §5 and §7 say receive questions (Groq, Vercel AI Gateway). This design adds no service that
  receives questions, so P6i is unchanged.

## 1. Who can ask

- **Any signed-in person who passes the check**, counted once across linked accounts: a current pass by any member
  of the person (Farcaster: Neynar score; Lens: the Lens score; Bluesky: the Bluesky rule). The decisions are the
  stored ones (`check_decisions`). If no member has a current decision, the ask does the same lookup a Generate does,
  in the same order, stopping at the first pass.
- **Concern (a regression):** today a Farcaster account that fails Neynar can still ask. Under this rule it can't ask
  for free. Options: (a) the check applies to everyone (recommended, matching the owner's direction and the image
  rules); such a person can still pay; (b) Farcaster accounts keep asking without a check. Open question 1.
- **A person who doesn't pass, or a wallet-only person,** can ask paid questions once paying per person ships (a
  wallet pays from its own balance, as today). Until then they see the refusal with its next step (link an account
  that passes, or prepay).
- Linked accounts count once (v2): one limit per person, whichever account signs in.

## 2. The free limit

- **Per person, per UTC day: keep 30** (`CHAT.messagesPerDay`). It is a setting, not in any legal text. Keeping 30
  means no change for today's askers. Linking two accounts never gives 60: used counts add up (v2 §3).
- The site-wide free spend cap (`CHAT.dailySpendCapUsd`) stays and covers free questions only. Opening the assistant
  to more accounts makes it likelier to be reached. Raising it is the owner's decision; I'd propose $5 at launch and
  watching `chat_costs`.
- When the free cap is reached for everyone, paid questions still work, under the prepaid daily cap. Images and Remix
  already work this way.

## 3. Price per question

The options, all at the same 30% markup as images (`IMAGES.prepaid.markup`, P7) and rounded up to $0.001:

| Option | Price | Fair? | Trade-off |
|---|---|---|---|
| A. Flat at the worst case | ~$0.013 | Overcharges a typical question about 3× | Never loses money; simple |
| B. Reserve the worst case, charge the actual cost + 30% | ~$0.004 typical, up to $0.013 | Exact | The price isn't known before asking; Terms 6a's "price shown when you start it" becomes "at most the price shown" |
| **C. Flat, set from the measured average + 30%** | ~$0.005 (to be set from data) | Fair on average | The site absorbs the rare worst case (at most ~$0.005 over) |

**Proposal: C.** It is one price, shown before asking, as images already work. It is set by the owner from
`chat_costs` (cost_usd ÷ answer calls over the last 14 days, a read-only query the owner runs), plus 30%, rounded up.
It is stored as `CHAT.paid.priceUsd`, a config value that appears on the page and in no legal text. It is reviewed
when the model or prompts change: the P6e fingerprint already forces a reread of the notice then, and the price check
can go on the same list. B is the fallback if averages drift.

## 4. Refunds (credit-back, like images)

- **Paid question, no answer shown:** the charge is added back to the balance it came from, once, for exactly that
  debit. This covers: the model didn't answer (502), a server error, "held" (the passages are past the reader's
  chapter limit), "declined" (the guard flagged the answer twice), and "unsupported" (the support check failed).
  Images credit back their rules refusals and safety drops in the same way.
- **Free question, our failure** (the model didn't answer, a server error): the free count is given back. This is a
  change, since today it is used. Declined, held and unsupported answers still use a free question, as today; they
  are the assistant working, and they cost us model calls.
- **Abuse bound:** repeated declined paid questions cost us model calls with no revenue. The prepaid daily cap is the
  backstop. If the owner wants one, add a per-person cap on credited-back questions a day, stated on the page, not in
  Terms (open question 4).
- Never a refund as money (Terms 6a: payments are final).

## 5. What the person sees

- **On opening:** "N free questions left today". When N reaches 0 and the person has a balance: "Ask more for $0.005
  each, from your balance ($X.XX)", with a switch that is **off by default**, "Pay for questions after my free ones".
  So nobody is charged without choosing to be.
- **Each paid answer:** a small "Paid $0.005" line. A credited-back one: "Not charged: no answer was shown."
- **Refusals:** each gives a next step (the approved section 12 pattern). Not passing: "Free questions come with an
  account that passes the site's check. Link one, or prepay." At the limit without a balance: "That's today's 30 free
  questions. Prepay to ask more, or come back after 00:00 UTC." (DRAFT words.)
- The sign-in prompt names every way in: "Sign in to ask". It never says "Sign in with Farcaster".

## 6. What's logged

- `studio.chat_calls`: one row per question, as today (account, kind, model, time), plus `person_id` (v2) and
  `funded` (`free` or `paid`), and `debit_id` for a paid one. **No question, answer, cost or request id**, as today.
- **Person balance ledger** (`person-balance`): one debit per paid question (kind `question`, amount), and one
  credit-back with its reason. Wallets use their own tables, as today.
- `studio.chat_costs`: unchanged (daily totals, no person).
- **Migration (outline):** two nullable columns and a check on `chat_calls`, plus `question` added to the
  person-balance debit kinds. Additive, and safe with live code (old code writes neither).

## 7. Terms, Privacy, About and the notice (DRAFT, before and after)

"Before" lines are quoted from origin/main's `src/lib/legal.ts` (943fc604) unless marked. Shortest true sentences,
with no thresholds or prices in the legal text.

**Terms §2.**
- Before: "An independent, open edition of the novel Snowmoon by Vitalik Buterin, with read-aloud audio, pictures, a
  game reconstruction and a reading assistant. It is not affiliated with or endorsed by the author. You can prepay for
  generations. Payments are final. Nothing else here is for sale."
- After: "An independent, open edition of the novel Snowmoon by Vitalik Buterin, with read-aloud audio, pictures, a
  game reconstruction and a reading assistant. It is not affiliated with or endorsed by the author. You can prepay for
  generations and for questions to the assistant. Payments are final. Nothing else here is for sale."

**Terms §6a** (before: the approved person-balance line on `origin/linked-accounts`).
- Before: "Your free generations are used first; then each generation is charged to your balance at the price shown
  when you start it. If a generation doesn't give you a picture (a check or the image model didn't answer, the rules
  refused the prompt, or the safety checker dropped the picture), that charge is added back to your balance."
- After: "Your free generations and questions are used first; then each generation, and each question to the
  assistant if you turned on paying for them, is charged to your balance at the price shown when you start it. If a
  generation doesn't give you a picture (a check or the image model didn't answer, the rules refused the prompt, or
  the safety checker dropped the picture), or a question gets no answer, that charge is added back to your balance."
- Also in 6a: "your balance can only be spent on generations here" becomes "…on generations and questions here".

**Privacy §5.**
- Before: "Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both
  are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only
  how many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals,
  without your ID, to track our spending."
- After: "Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both
  are set to keep nothing. We keep no copy of your questions or the answers. With your account we record only how many
  questions you ask and when, and whether each was free or paid, to count the daily limit and your balance. The
  assistant's costs are kept only as daily totals, without your account, to track our spending."

**Privacy §4** (the prepaid paragraph). "what each generation cost" becomes "what each generation and each paid
question cost". "any charge added back to your balance because a generation gave you no picture" becomes "…because a
generation gave you no picture or a question got no answer".

**Privacy §7** (when each check is looked up; the "before" lines are on `bluesky-check`).
- Neynar: "…when you make or publish an image or a character sheet and your account has no current check…" becomes
  "…when you make or publish an image or a character sheet, or ask the assistant, and your account has no current
  check…". Also "which decides whether you can make images" becomes "…make images and ask the assistant for free".
- Lens: "When you make an image or a frame without a linked Farcaster account, and we have no current decision…"
  becomes "When you make an image or a frame or ask the assistant, and no account linked to yours has a current
  pass…".
- Bluesky: "when you make an image or a frame, or publish a remix during the remix challenge, and your account has no
  current check" becomes "when you make an image or a frame, ask the assistant, or publish a remix during the remix
  challenge, and no account linked to yours has a current pass".

**Notice, item 4** (P6f: the owner's reread; P6e: a new fingerprint).
- Before: "The app records only how many you ask and when, under your Farcaster ID, to count the daily limit. Cost
  records are kept without your ID."
- After: "The app records only how many you ask and when, and whether each was free or paid, with your account, to
  count the daily limit and your balance. Cost records are kept without your account."

**About** (before: `bluesky-check`, src/app/about/page.tsx).
- Before: "Reading needs no account. Saving cards and liking need a Farcaster sign-in, and the assistant a Farcaster
  account or one linked to it. Making images needs a sign-in."
- After: "Reading needs no account. Saving cards and liking need a Farcaster sign-in. Asking the assistant and making
  images need a sign-in." (If saving and liking also open to every account in v2: "Everything else needs a sign-in.")
- Before (main): "this app keeps no copy, only a count and the cost." After: "this app keeps no copy, only a count,
  whether it was free or paid, and the cost."

## 8. Subscriptions (later; options only)

1. **A monthly pass from the balance:** a fixed price for a higher daily question limit for 30 days, which then
   simply ends (no renewal). Easy to explain. But it is a second kind of sale (Terms §2 and P7 need words for it), and
   it pays the same whether used or not.
2. **A prepaid bundle:** "100 questions for $X", which is only a balance top-up shown in questions. No new kind of
   sale, and it fits Terms §2 as drafted. It is barely different from per-question pricing.
3. **Supporter thanks via Support (6c):** a gift with a thank-you limit raise. **Not recommended:** 6c says a gift
   "buys nothing on the Service", and this would break that.

Recommendation for later: 2 if anything, since it needs no new legal category. Wallet-based auto-renewal isn't
possible without allowances, which this site doesn't take.

## 9. Build order

1. Linked accounts v2's `{ account, person }` resolution (the chat routes take any person, 403 becomes the check).
2. The check at ask, using stored decisions plus the same lookup as Generate. Privacy §7 lines.
3. The per-person count (`chat_calls.person_id`) and the free-count give-back on our failures.
4. Paid questions on the person balance (after `person-balance` ships): the switch, the debit, the credit-back, the
   UI. Terms §2 and §6a, Privacy §4 and §5, the notice, About.
5. The owner's reread of every line, the notice fingerprint (P6e), check:principles, then the switch on.

## 10. Open questions

1. Farcaster accounts that fail Neynar: check everyone (recommended) or keep today's no-check for Farcaster?
2. The price: confirm option C, and run the read-only `chat_costs` query to set it.
3. Raise the free spend cap from the $2 test cap when the assistant opens wider?
4. A per-person daily cap on credited-back paid questions?
5. **Principle 7:** it says "Apart from prepaid generations, anything sold is a fixed-price collectible". A paid
   question is an answer generated by a model. I read it as a prepaid generation, but P7's text and its In-this-app
   paragraph say "images". The owner should confirm that reading (or reword P7) before this is built.
6. Does the assistant's "Testing" label (`CHAT.testing`) have to come off before any question is sold?
   Recommendation: yes, or at least name it on the paid prompt ("answers can be wrong; a wrong answer isn't credited
   back").

## Principles

- **1 (public recipes):** not touched. Answers are never published.
- **2 (AI declared; words human):** pass. Answers stay labelled AI and "not the book". The no-writing guard is
  unchanged.
- **3 (model allowlist):** pass. Same open-weights models, same named provider.
- **4 (nothing published without a person's action):** not touched.
- **5 (nothing canon):** not touched.
- **6 (privacy, services named; P6e/P6f/P6i):** pass if the drafts ship together. No new service receives questions,
  so P6i is unchanged. The notice's words change, so they need the owner's reread (P6f) and a new fingerprint (P6e).
  The new check lookups at ask must be named in Privacy §7 (drafted).
- **7 (payments never enter scoring or ordering; what's sold):** **concern, raised:** paid questions are a new thing
  for sale. They fit "prepaid generations" only if the owner agrees that an answer is a generation (open question 5).
  Paying buys answers only: no ordering, no score, and nothing in a challenge.
- **8 (Minpentai):** not touched.
