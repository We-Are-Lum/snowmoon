# DRAFT: Remix with GPT Image (OpenAI, a closed model)

**Status: DRAFT, not live.** Drafted by the coding agent on 2026-10-18 for the owner's reread. Nothing here is
in `src/lib/legal.ts` or `config/consent.json`, and none of it may be. The owner's rule is that the texts only
describe what the site does on the day they go live. These lines ship in the same release that sets
`REMIX_MODEL = 'gpt'` (src/lib/remix/model.ts), and not before.

Why: the owner said "all the pictures in the remix aren't the ChatGPT images so might be confusing". Version 2
of Fifteen Days (the chosen version) was drawn by GPT Image 2.5 Sunburst. Remix still draws with FLUX.2 [klein] 4B
(open weights, on fal.ai). With the flag on, Remix on version 2 draws with the same model, through the same
gateway, as the cut (`openai/gpt-image-2.5-sunburst`, Vercel AI Gateway `/v1/images/edits`, 1536×864). That
means a reader's prompt and pictures go to a new outside party, OpenAI, through Vercel AI Gateway.

## What is sent, and to whom (flag on, version 2 only)

- **The prompt.** This is the shot's own prompt from version 2's recipe (committed), plus the reader's own words,
  plus the site's no-text line.
- **The pictures.** These are a depth picture of the camera the reader set (made in their browser), plus the
  shot's cast cards and plate (committed files).
- The reader's Farcaster ID, wallet address and name are **not** sent to OpenAI or to the gateway.
- The prompt check is unchanged. It is Groq through Vercel AI Gateway, as today.
- Version 1 (the open-weight version) keeps FLUX.2 [klein] 4B on fal.ai, flag or not.

## Privacy, section 7 ("Outside services and what they receive"): one new item

> DRAFT: OpenAI receives, through Vercel AI Gateway, the prompt and pictures for a frame you make in Remix from a
> version whose pictures OpenAI's GPT Image drew (in Fifteen Days, version 2). That is a depth picture of the
> camera you set, the shot's place and cast pictures, the shot's prompt and your words. OpenAI makes the frame.
> Nothing that identifies you is sent with it. OpenAI keeps what it receives under its own terms for its API
> customers; we cannot ask it to keep nothing, as we ask fal.ai.

The fal.ai item changes to cover only the cases still sent there:

> DRAFT: fal.ai receives the prompt for an image you make, and any pictures sent with it (in Remix, for a
> version drawn with open-weight models: a depth picture of the camera you set, and the shot's place and cast
> pictures), and makes the image. It is asked to keep no copy.

**Open point for the owner:** OpenAI's API data-retention terms (abuse monitoring, zero-data-retention
eligibility) have not been checked by the agent. The last sentence of the OpenAI item has to match what is
actually true on the day it goes live. Check OpenAI's terms and the gateway's settings for this model before
that sentence ships.

## Terms: section 6a (prepaid) is unchanged; section 8 gets one clause

Section 6a already says "at its estimated cost plus 30%", which covers the new price, so its wording stays
as it is. The price shown in the panel changes (see the price below).

Section 8 ("AI-made material"), with the added clause in bold:

> DRAFT: The narration, many pictures (every frame made in Remix among them) and the assistant's answers are
> produced by AI models and are labelled as such. **Some are made with a closed model, whose weights its maker
> does not publish. Each of those is labelled with the model, its maker and that it is closed, and its recipe
> records the date it was made.** They can be wrong. The assistant's commentary is not the book and is not advice
> of any kind.

Section 9 ("Outside services") is unchanged. It already points to the Privacy Policy's list, which gains OpenAI.

## Consent: a new wording, own-words-v5 (everyone is asked again)

`config/consent.json` is append-only, and a new wording asks again. Only the last paragraph changes from v4:

> DRAFT (own-words-v5, last paragraph): To make an image, your prompt is sent to Groq to be checked (through
> Vercel AI Gateway when Groq is busy), and to fal.ai, or, in Remix for a version drawn by GPT Image, to OpenAI
> through Vercel AI Gateway, to make it. Your Farcaster ID is sent to Neynar to check your account's score. In
> Remix, every frame you make is saved and public at its link as soon as it is made, with your words. Elsewhere,
> drafts you don't publish stay on your device.

P6j checks that the consent screen names exactly the services that receive the prompt at Generate. With the flag
on, that means OpenAI and Vercel AI Gateway must be named, so v5 has to ship with the flag.

## Labels on remix frames (built, shown only with the flag on)

These are drafted in src/lib/remix/model.ts (`remixFrameLabel`, `REMIX_GPT`).

- **Under a frame, in the panel and on /remix/<id>:** "AI image · by @name · AI-generated with GPT Image 2.5
  Sunburst (OpenAI, a closed model), not by the author"
- **In the panel, before Generate:** "Made with GPT Image 2.5 Sunburst (OpenAI, a closed model; weights not
  published) on Vercel AI Gateway, the model that drew this version's pictures."
- **In the frame's recipe** (studio.remix_frames.recipe):
  - `model: { id, name, maker: "OpenAI", endpoint: "openai/gpt-image-2.5-sunburst", host: "Vercel AI Gateway", licence: "proprietary (OpenAI); weights not published", closed: true, open_weights: false }`
  - `label: "closed model"`
  - `made_at` (the date)
  - the gateway's generation id and reported cost
  - every picture sent, by sha256
- Name order on the byline is unchanged: Farcaster name, then Basename, then shortened address.

## Price per Remix frame (estimate + 30%)

This is the arithmetic. No call was made to get these numbers.

**What the gateway charged for the cut** (adaptations/fifteen-days/preprod/gpt/costs.jsonl and recipes/):
- 56 calls: $2.3154 in all, which is $0.0413 a call. The cheapest was $0.0187 and the dearest $0.0538.
- The 51 pictures the cut uses: $2.1614 in all, which is $0.0424 a picture.

**The gateway's price for this model.** Each recipe records its tokens and the gateway's cost. Across all 51
recipes, those costs fit exactly (largest error 1e-17):
- $5 per million text tokens in
- $8 per million image tokens in
- $30 per million tokens out

**What the cut used, per call:**
- text in: 462 to 1,678 tokens
- image in: 1,152 to 2,304 tokens
- out: 120, 280, 480 or 1,078 tokens (1,078 in 33 of 51)

**Worst case for one Remix frame:**

| Part | Bound | Cost |
| --- | --- | --- |
| Text in | 8,500-character prompt cap (the longest shot prompt is 7,397, plus 600 of the reader's words), at about 4.15 characters a token: at most 2,200 tokens | 2,200 × $5/M = $0.0110 |
| Image in | 4 pictures (layout, up to 2 cards, plate); the cut's maximum was 2,304, so at most 2,600 tokens | 2,600 × $8/M = $0.0208 |
| Out | 1536×864; the cut's maximum was 1,078, so at most 1,100 tokens | 1,100 × $30/M = $0.0330 |
| Image call | | $0.0648 |
| Prompt check | as in REMIX.reserveUsd today | $0.0015 |
| **Estimate (reserved before each Generate)** | | **$0.0663** |

- **Price per frame (prepaid):** $0.0663 × 1.30 = $0.08619, which is **about $0.086 a frame**. It is rounded up
  to the micro-dollar, as `priceUsd` does.
- **Typical real cost:** $0.0424 + $0.0015 = **about $0.044**. The reservation is replaced by the real cost
  after each call.
- **For comparison, today (FLUX.2 [klein] 4B):** the estimate is (1 + 4) × $0.01 + $0.0015 = $0.0515, and the
  price is $0.0515 × 1.30 = **$0.06695**.

## Monthly cost at the current daily caps

The caps are in src/lib/config.ts, and they are not changed here:
- `REMIX.dailyFreeCapUsd = 10`, across everyone
- `REMIX.generationsPerDay = 10` a person (the owner has 300)
- the prepaid daily cap `IMAGES.prepaid.dailyCapUsd = 25`

**Free frames:**
- At most $10 a day, so **at most $300 for a 30-day month**. That is the same ceiling as today, because the cap
  is in dollars.
- With GPT, that buys about 10 ÷ 0.044 ≈ **227 free frames a day** at most, all readers together.
  - A new Generate is refused once spend plus $0.0663 would pass $10.
  - With FLUX today, the same $10 buys about 10 ÷ 0.031 ≈ 320 a day. Each frame is about $0.0295 (five pictures
    of at most 0.59 MP each, at $0.01 a megapixel) plus $0.0015.
- **At a realistic level,** say 20 frames a day: 20 × $0.044 × 30 ≈ **$26 a month**.

**Prepaid frames:**
- At most $25 a day of model cost, so at most $750 a month.
- Readers pay for this in advance at cost + 30%: up to $975 a month paid in. It is never a net cost to the
  project.

## Open questions for the owner

1. OpenAI's API retention and terms: can the Privacy item say what OpenAI keeps? And do OpenAI's terms allow
   publishing remix frames under GPL-3.0? This is already open in config/models.json for the cut.
2. Should GPT remix frames be 1536×864, like the cut, or 1024×576, like today's remix frames? The estimate
   assumes 1536×864.
3. Is the free cap ($10 a day across everyone) still right when each frame costs about 50% more than with
   FLUX?
4. A test generation. One real call would confirm three things: that the gateway passes the four pictures and
   `output_format: "jpeg"`, the real cost of a Remix-sized request, and how OpenAI refuses a flagged prompt.
   It costs about $0.04 to $0.07. It has **not** been run. It needs the owner's go.
