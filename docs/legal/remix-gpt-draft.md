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

The owner's wording (2026-10-19: "say OpenAI may keep the prompt and pictures up to 30 days for abuse monitoring
and doesn't train on them"), since zero data retention is refused for this model (see "The test calls" below):

> DRAFT: If you make a Remix frame of a version drawn by GPT Image, your prompt and the pictures sent with it (the
> shot's layout, the character cards and the set's plate; nothing that identifies you) go to OpenAI through Vercel
> AI Gateway to draw it. OpenAI may keep the prompt and pictures for up to 30 days for abuse monitoring
> [TO VERIFY against OpenAI's terms] and doesn't train on them [TO VERIFY against OpenAI's terms]. Vercel AI Gateway
> does not keep them [UNVERIFIED].

Three claims in it must be checked before it ships:

- **"up to 30 days" (TO VERIFY):** check against OpenAI's current API data-usage terms.
- **"does not train" (TO VERIFY):** check against the same terms.
- **"Vercel AI Gateway does not keep them" (UNVERIFIED until checked against Vercel's AI Gateway data terms):**
  - The lead to check is Vercel's AI Gateway ZDR docs, https://vercel.com/docs/ai-gateway/security-and-compliance/zdr
    (last updated 2026-09-22; read by the coordinator on 2026-10-19).
  - Under its "Vercel" heading, the page says the gateway doesn't retain prompts or outputs and deletes user data
    once a request completes.
  - The docs are not a contract term. The owner should confirm the clause applies to this team's plan.

The fal.ai item changes to cover only the cases still sent there:

> DRAFT: fal.ai receives the prompt for an image you make, and any pictures sent with it (in Remix, for a
> version drawn with open-weight models: a depth picture of the camera you set, and the shot's place and cast
> pictures), and makes the image. It is asked to keep no copy.

## The test calls

### 1. With zero data retention (2026-10-18)

The owner approved one test call (decision 2c: "Send it with the gateway's zeroDataRetention: true"), and the
coordinator ran it.

- **Request:** `POST https://ai-gateway.vercel.sh/v1/images/edits` with `model: "openai/gpt-image-2.5-sunburst"`,
  a prompt, the pictures as data: URIs, `n: 1`, `size: "1536x864"`, and the gateway's `zeroDataRetention: true`.
- **Answer:** HTTP 400, type `no_zdr_providers_available`: "openai/gpt-image-2.5-sunburst is ineligible for Zero
  Data Retention (ZDR). This model retains data and cannot be used with ZDR configurations."
- **Cost:** $0. No provider was attempted.

So `makeGptEdit` (src/lib/images/gateway-image.ts) does not send zeroDataRetention; with it, every call would be
refused. A comment there records why. The Privacy line says what OpenAI may keep instead.

### 2. Without zero data retention (2026-10-19, the owner's go: "test without ZDR, as a script, no database")

One call, made by the coordinator from a standalone script, with no database. The picture is kept on the
coordinator's machine only and is not published.
- **Request:** the same four pictures (recipe C17-K4-g1: the depth set frame, the Zei and Bai cards, the corridor
  plate; every sha256 matched its recipe) and the same prompt; `size: "1536x864"`, `output_format: "jpeg"`, `n: 1`;
  no zeroDataRetention.
- **Answer:** HTTP 200 in 21 s, routed to openai (system credentials). Generation id
  gen_01M58RSHNQGF5CXXA8YHCTYKJ0.
- **Cost:** $0.026908, recorded in the GPT ledger, which is now $2.3423 in all.
- **The four pictures:** taken. The usage is 732 text tokens, 1,856 image tokens and 280 out, identical to the
  cut's own call for this recipe (also $0.026908).
- **output_format "jpeg": ignored.** OpenAI's metadata says `outputFormat: png`, and a 1536×864 PNG came back,
  1,535,122 bytes. The owner chose JPEG (2026-10-19): the site converts it on our server before storing
  (`src/lib/images/stored-jpeg.ts`, sharp, quality 90; this PNG became a 160,935-byte JPEG). The PNG is kept
  privately in R2 (owner, 2026-10-19; see "The original PNG" below).
- **Still unseen:** what a moderation refusal looks like.

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

`config/consent.json` is append-only, and a new wording asks again. The owner's ruling: "Fold the remix and
storyboard listing into consent v5 with Part 2, so everyone is asked again once, not twice". So v5 covers two
things:
- OpenAI, for Remix on a version drawn by GPT Image.
- The public profile listing a person's remix frames and storyboards. That listing is built on branch `you-page`,
  behind `PROFILE_LISTS_REMIXES` in src/lib/you-flags.ts (not touched here).

v5 must ship when both are on. If one goes live first, the wording has to match what is live that day.

Two paragraphs change from v4:

> DRAFT (own-words-v5, the "shown with your name" paragraph): It is shown with your name: your Farcaster name, or,
> for a wallet account, its address shortened. Your public profile lists the Remix frames and storyboards you
> make, until you hide them.

> DRAFT (own-words-v5, last paragraph): To make an image, your prompt is sent to Groq to be checked (through
> Vercel AI Gateway when Groq is busy), and to fal.ai, or, in Remix for a version drawn by GPT Image, to OpenAI
> through Vercel AI Gateway, to make it. OpenAI may keep the prompt and pictures up to 30 days for abuse monitoring
> and doesn't train on them [TO VERIFY against OpenAI's terms]. Your Farcaster ID is sent to Neynar to check your
> account's score. In Remix, every frame you make is saved and public at its link as soon as it is made, with your
> words. Elsewhere, drafts you don't publish stay on your device.

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
- **Version 1's remixes on version 2's panel** (decision 2d; built, live with part 2's code even with the flag
  off): each is tagged "version 1 · open-weight" and keeps its own label, "AI-generated with FLUX.2 [klein] 4B
  (open weights), not by the author". They can't be added to version 2's storyboard; they belong to version 1's.

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

## The owner's decisions (2026-10-18)

- **2a:** 1536×864, to match version 2's frames. `REMIX_GPT.size` is already so.
- **2b:** keep the $10 a day free cap. `REMIX.dailyFreeCapUsd` is already 10; nothing changed.
- **2c:** one test, with zeroDataRetention. It was refused (see "The ZDR test").
- **2d:** list version 1's remixes on version 2's panel, labelled "version 1 · open-weight". Built.

## Still open

- **G7:** GPL-3.0 and OpenAI's terms. Do OpenAI's terms allow publishing remix frames (and the cut's pictures)
  under GPL-3.0? This is open in config/models.json too.
- **C1:** open (not acted on here).
- **C2:** open (not acted on here).
- **TO VERIFY / UNVERIFIED before the Privacy line ships:** "up to 30 days", "does not train", and "Vercel AI
  Gateway does not keep them" (above).
- **JPEG or PNG: decided** (owner, 2026-10-19: "JPEG for GPT Remix frames: yes, converted on our server, with the
  recipe recording both the original PNG's sha256 and the stored JPEG's"). Built: the recipe's `output_sha256` is the
  stored JPEG's (the frame's `image_sha256`, as for every frame) and `model_output` records the PNG the gateway sent
  (type, size, sha256, how it was converted). Tested by `npm run test:gpt-jpeg` (no network, no key).
- **The original PNG: kept privately** (owner, 2026-10-19: "Keep the original PNGs privately in R2. Delete a PNG
  whenever its frame is deleted, and tell me the Privacy wording that needs."). Built: the PNG goes to the private
  bucket only, under `remix/model-output/<sha256>.png`, before the JPEG is made public; `model_output` records
  `kept: true` and that key, never a URL. A hide (the maker's or the maintainer's) leaves it there, unchanged. No route
  deletes a frame (the site's role has no delete on `studio.remix_frames`, 0013); the one deletion is the maintainer's
  erasure (docs/removal.md step 2), whose files step, `scripts/erase-remix-frame.ts`, deletes the PNG with the picture.
  Tested by `npm run test:gpt-png-private` (no network, no database, no key).
- **When the PNG is erased: decided** (owner, 2026-10-19, D5: "erase the PNG when its frame is deleted or on
  request"). Built: with the frame (eraseFrameFiles, P6), or on its own on request (eraseOriginalPng,
  `scripts/erase-remix-frame.ts <frame id> --png-only --delete`, P11; the frame stays). Both are the maintainer's,
  run on their machine; no route deletes either (P9). Procedure: docs/removal.md.
  Drafted Privacy line (for §4, what we keep; DRAFT, for the owner's reread):
  > For a Remix frame drawn with GPT Image, we also keep the model's original picture (a PNG) privately; it is
  > never public. We erase it when the frame is deleted, or when you ask us to.
- **A moderation refusal:** its shape is still unseen. It is handled as a dropped frame by matching "moderation" or
  "safety" in the error.
