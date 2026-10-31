# Routing C: Privacy, Terms, About and notice lines (DRAFT)

DRAFT, by the coding agent (Anthropic's Claude), 2026-10-31, for the owner's reread. Nothing here is in
`src/lib/legal.ts` yet, and its reread record is untouched.

These lines ship in the same release that turns make mode on (`CHAT.make.enabled`), never before (legal texts
describe today). While make mode is off, the site sends nothing to Baseten, and today's words stay true.

They start from the reread pack's items 12 and 13 (`docs/reread-pack-2026-10-30.md` on `next-version`). They are
cut to what is built tonight:
- make mode reads the book and plans with you;
- it can't draft or save anything yet. The drafting tools need the assistant to act as your agent, which isn't built.

So the pack's "drafts go to your Dashboard" wording (item 14) is not used here. It comes back when drafting does.

The checks that keep these consistent:
- P6i: the notice names exactly the services that the Privacy page says "receive assistant questions".
- P6g and P6h: About, the notice and Privacy name the same services. Baseten is now on the checks' list of services.
- P6e and P6f: the notice was reread after the change, and the owner reread its words.

When make mode is switched on with only the notice changed, P6i and P6g fail until Privacy names Baseten. P6h fails
until About does. P6f fails until the owner rereads the notice's words.

---

## 1. Privacy §5 (The assistant)

**Before** (live today):

> Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set
> to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many
> questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals, without
> your ID, to track our spending.

**After** (draft):

> Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Until you
> ask the assistant to make something, Groq first reads each message on its own, to tell a question about the book
> from a request to make something. When you do, the conversation from then on is sent through Vercel AI Gateway to
> Baseten, which runs Kimi K3, and to no other provider. All are set to keep nothing. We keep no copy of your questions or the answers. Under your
> Farcaster ID we record only how many questions you ask, and how many times you start making something, and when,
> to count the daily limits. The assistant's costs are kept only as daily totals, without your ID, to track our
> spending and to pause the assistant, or its making, for the day when its spending limit is reached.

What changed from the pack's item 13:
- The added second sentence says the routing call is a separate read of your latest message, and that it stops
  once a conversation is about making.
- Otherwise it is the pack's words.

## 2. Privacy §7, the Groq item

**Before** (live today):

> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, and the prompts for images you make,
> which are checked against the published rules.

**After** (draft; the pack's item 13 words, without the agent-drafts clause, which belongs to a later release):

> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, and the prompts for images you make,
> which are checked against the published rules. When you ask the assistant to make something, Vercel AI Gateway also
> receives the conversation and passes it to Baseten.

## 3. Privacy §7, a new item after the Groq item

**Before:** no such item.

**After** (draft; the pack's words, with "receive assistant questions" added so P6i counts Baseten as a receiver):

> Baseten runs Kimi K3 for the assistant when you ask it to make something. It receives assistant questions in that
> conversation through Vercel AI Gateway, answers them, and keeps nothing (its zero-data-retention terms, and
> Vercel's agreement with it).

## 4. The assistant's notice ("What the assistant does")

The text is in `src/lib/chat/notice.ts`, `noticeItemsWithMake`. It is shown only while `CHAT.make.enabled` is on.
Item 4's heading is unchanged.

**Item 1, before:**

> **It helps you read.** Ask about the book. Answers point to the passages they rest on, with chapter and ¶, and show
> the book's own words.

**Item 1, after:**

> **It helps you read and plan.** Ask about the book, or say what you'd like to make. Answers point to the passages
> they rest on and show the book's own words. It can plan something with you from the book, but it can't draft or
> make anything yet.

**Item 2, before:**

> **It won't write for you.** No dialogue, narration or description. It gives context and commentary only.

**Item 2, after** (in make mode it describes what a picture should show, as the real trial did; adapted from the
pack's item 14):

> **It won't write the story for you.** No dialogue or narration: lines it plans with you are the book's own words or
> yours, exactly. When you make something, it may describe what a picture should show.

**Item 3, before:**

> **Your messages go to Groq (not the Grok of X).** Groq runs gpt-oss-120b, an open-weights model. When Groq is busy,
> a message goes through Vercel AI Gateway to Groq instead. Both are set to keep nothing, and this app keeps no copy
> of your messages.

**Item 3, after:**

> **Your messages go to Groq (not the Grok of X), or to Baseten when you make something.** Questions about the book
> go to Groq, which runs gpt-oss-120b, an open-weights model; when Groq is busy, through Vercel AI Gateway instead.
> Until you ask to make something, gpt-oss-120b first reads each message on its own, to tell a question from a
> request to make something. From then on, the conversation goes through Vercel AI Gateway to Baseten, which runs
> Kimi K3, an open-weights model by Moonshot AI; if Baseten isn't available, making is paused rather than sent elsewhere. All are set to keep
> nothing, and this app keeps no copy of your messages.

**Item 4, before:**

> **Your questions are saved only on this device.** They are sent to Groq (or through Vercel AI Gateway when Groq is
> busy) to be answered, and never published. Another device won't have them. The app records only how many you ask
> and when, under your Farcaster ID, to count the daily limit. Cost records are kept without your ID.

**Item 4, after:**

> **Your questions are saved only on this device.** They are sent to Groq (or, when you make something, to Baseten)
> to be answered, and never published. Another device won't have them. The app records only how many you ask, and
> how many times you start making something (10 a day), and when, under your Farcaster ID, to count the daily limits.
> Cost records are kept without your ID.

## 5. About, "The reading assistant" (`src/app/about/page.tsx`)

This isn't a legal text, but P6h needs About to name Baseten once Privacy does.

**Before** (first paragraph, as served):

> The assistant answers questions about the book with gpt-oss-120b, an open-weights model. Your questions are saved
> only on your device and never published. To be answered, each one is sent to Groq, or through Vercel AI Gateway
> when Groq is busy, with zero data retention required; this app keeps no copy, only a count and the cost.

**After** (a second paragraph added; the first is unchanged):

> When you ask it to make something, the conversation goes instead through Vercel AI Gateway to Baseten, which runs
> Kimi K3 (Moonshot AI, open weights), with zero data retention required and no other provider allowed: if Baseten
> isn't available, making pauses. Making has its own daily limits: 10 conversations for you and a spending limit for
> the whole site.

## 6. Terms (optional)

Terms §6 already forbids getting around "daily limits or spending caps", so nothing in Terms is required. If you want
the limits stated, here is the pack's sentence, moved from §6b to §8, since the assistant doesn't act as an agent yet.

**§8 (AI-made material), before:**

> The narration, many pictures (every frame made in Remix among them) and the assistant's answers are produced by AI
> models and are labelled as such. They can be wrong. The assistant's commentary is not the book and is not advice of
> any kind.

**§8, after** (draft; one sentence added):

> … The assistant's commentary is not the book and is not advice of any kind. When you ask the assistant to make
> something, each day is limited to 10 such conversations for you and to a spending limit for the whole site; when
> either is reached, making pauses until the next day, and questions about the book still work.

---

## Evidence behind "keeps nothing" for Baseten (checked 2026-10-31)

- Baseten, Security Practices (<https://www.baseten.co/security-practices/>):
  - "Baseten adheres to a Zero Data Retention posture across all inference products."
  - "Baseten's Model APIs product adheres to a Zero Data Retention posture for all Customer Content."
  - "'Zero Data Retention' means that Baseten shall not (a) log, record, or store Customer Content … (b) save Customer
    Content to persistent storage…"
  - "Baseten does not use Customer Content for model training, fine-tuning, or improvement of any algorithms."
  - The exception is Asynchronous Inference: "These model input requests can stay in queue for up to 72 hours before
    being processed and then deleted." The site calls the gateway's synchronous chat endpoint, so it doesn't apply.
- Baseten, Data Request Policy (<https://www.baseten.co/data-request-policy/>), §4: "Baseten does not log, record, or
  save Customer Content contained in inference inputs or outputs … to persistent storage after real-time processing,
  subject to the limited exceptions described in the Security Practices."
- Vercel, AI Gateway ZDR (<https://vercel.com/docs/ai-gateway/security-and-compliance/zdr>):
  - Baseten is in the table "The following providers currently offer ZDR on AI Gateway", with no prompt training ✓,
    ZDR ✓ and policy "Security".
  - "Set `zeroDataRetention` to `true` to route the request only through providers that have zero data retention
    agreements with Vercel AI Gateway."
  - "If no ZDR-compliant providers are available for the requested model, the request fails with an error".
- The gateway's model listing (<https://ai-gateway.vercel.sh/v1/models/moonshotai/kimi-k3/endpoints>) shows the
  Baseten endpoint for Kimi K3 with `has_zdr: true` and `has_no_training: true`, region US.
- Caveat: Baseten's "Customer" here is Vercel, whose system credentials the gateway uses. Our zero retention with
  Baseten rests on Vercel's agreement with Baseten and on Baseten's posture, not on a contract between Lum and Baseten.
