# Model choice for remixers: Privacy, consent, Terms, About lines and the closed models' notice (DRAFT v2, not reread)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-04, on branch `remix-model-choice`. **v2**
folds in the owner's decisions of 2026-11-04: closed models without zero retention are allowed, with a notice; Gemini is
allowed for remixers; a one-time "I'm 18 or older" on the same screen as the first notice. **Not reread by the owner.**
The Privacy §3, §4 and §7 lines and the notices are in `src/lib/legal.ts` on this branch, pending the reread (so P6k is
red until then); `config/consent.json` is not changed (its new version is a decision owed). Not legal advice. It builds
on `closed-model-bases` ([`docs/proposals/closed-model-bases.md`](../proposals/closed-model-bases.md)) and
[`age-terms-closed-models.md`](age-terms-closed-models.md).

Legal texts describe today (owner, 2026-10-18): these lines go live in the same release that turns
`IMAGES.designs.modelChoice` on, never ahead of it. `check:principles` P6t fails while the switch is on and Privacy §4,
§7 (each maker with its retention, `CLOSED_PROVIDERS[maker].retentionWords`) or the consent screen lack them.

"Before" is main's `src/lib/legal.ts` and `config/consent.json` (`own-words-v4`) at `d42b7d8`.

## What the code does, which the words must match

- On the remix form of a character sheet, with the switch on, a remixer picks one model for the sheet. **The site's open
  models are the default and listed first**: Z-Image Turbo for the front, FLUX.2 [klein] 4B edit for the side and back,
  open weights, Apache-2.0, on fal.ai. Then **GPT Image 2.5 Sunburst, a closed model by OpenAI**, and **Gemini 3.1 Flash
  Image, a closed model by Google** (allowed by the owner, 2026-11-04; `CLOSED_IMAGES.geminiAgeReadingAccepted: true`).
- A closed choice makes all three views: the front from the prompt alone, then side and back from the prompt and the front.
- **What the maker receives:** the prompt (view line, style text, sheet text, the no-words line; all public with the
  sheet) and, for side and back, the front view the same model made. No FID, name, wallet, IP or user field.
- **What each call asks of the gateway** (`CLOSED_PROVIDERS[maker].gateway`, as the gateway offers it,
  `https://ai-gateway.vercel.sh/v1/models/<model>/endpoints`, read 2026-11-04):
  - OpenAI, `openai/gpt-image-2.5-sunburst`, one endpoint (`openai`): `"has_zdr":false,"has_no_training":true`. So
    calls set `disallowPromptTraining: true` and `only: ['openai']`, **not** `zeroDataRetention` (it would be refused).
  - Google, `google/gemini-3.1-flash-image` on `vertex`: `"has_zdr":true,"has_no_training":true`. Calls set
    `zeroDataRetention: true`, `disallowPromptTraining: true`, `only: ['vertex']`.
  - The owner's batch calls (bases and styles) keep the zero-retention rule unchanged; this is only the remixers' route.
- **The notice:** the first time a device picks a model by a maker, the form shows that maker's notice (one per maker,
  not per model). "OK" closes it for the page; "Don't remind me again" stores the maker's notice version on the device,
  and it shows again only when `CLOSED_PROVIDERS[maker].noticeVersion` goes up (each version records the sha256 of its
  words, so changed words without a new version fail `test:model-choice`). The first notice a device sees also asks "I'm
  18 or older"; until it is ticked, neither button works and no closed model can be picked. Both answers are kept on the
  device only (`snowmoon.model-notice.<maker>`, `snowmoon.adult-confirmed`); nothing is sent.
- **The label** beside each closed model in the picker, always, whether or not its notice was answered.
- Counts and caps as v1: 6 closed pictures a person a day apart from the open 10; closed spend under its own $5 cap
  inside the free cap. Same prompt check; the recipe's closed safety line.

## Each maker's retention and training, from its current terms

**OpenAI** (GPT Image 2.5 Sunburst), from <https://developers.openai.com/api/docs/guides/your-data> (redirected from
platform.openai.com/docs/guides/your-data; read 2026-11-04 by the fetch tool, which this page did not refuse; no date on
the page):
- "By default, abuse monitoring logs are generated for all API feature usage and retained for up to 30 days".
- The table's rows for `/v1/images/generations` and `/v1/images/edits`: Data used for training "No"; Abuse monitoring
  retention "30 days"; Application state retention "None"; Zero Data Retention eligible "Yes, see below for limitations".
- "data sent to the OpenAI API is not used to train or improve OpenAI models".
- "If the classifier detects potential CSAM content, the image will be retained for manual review".
- Through the gateway this is OpenAI's default, not ZDR: the gateway offers no ZDR for this model (above). OpenAI's terms
  pages on openai.com/policies still refuse the fetch (HTTP 403); the ownership and usage quotes in v1 come from the CDN
  PDF and dated copies, **to re-check on the live pages**.

**Google** (Gemini 3.1 Flash Image, Vertex AI), from
<https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance> (read 2026-11-04; no date on the page):
- "Google won't use your data to train or fine-tune any AI/ML models without your prior permission or instruction."
- In-memory caching: "It's deleted no later than 24 hours after it's written", unless caching is turned off for the
  project; Google may log prompts for abuse monitoring, with no period stated, and "Zero data retention may not be
  possible when using some Advanced AI features".
- Through the gateway, calls are routed only to Vertex under Vercel's ZDR agreement
  (<https://vercel.com/docs/ai-gateway/security-and-compliance/zdr>, last updated 2026-09-22: Google Vertex AI "ZDR").
  What that agreement covers of the caching and abuse logging above isn't public. **The notice and §7 say "set to keep no
  copy … through the gateway's zero-retention agreement", which is what Vercel states; the owner may prefer to add
  Google's own 24-hour cache.**

**Vercel AI Gateway** itself (same ZDR page): "AI Gateway has a ZDR policy and does not retain prompts, outputs, or
sensitive data."

## The notices (`MODEL_NOTICES`, `ADULT_CONFIRM`, `NOTICE_BUTTONS` in `src/lib/legal.ts`), word for word

**Before:** none.

**After, OpenAI** (notice version 1):

> **A closed model by OpenAI**
>
> GPT Image 2.5 Sunburst is made by OpenAI. Its weights aren't published, so its recipe can't be re-run exactly.
>
> OpenAI receives your prompt for each view and, for the side and back, the front view it made, through Vercel AI
> Gateway. Nothing else about you.
>
> OpenAI may keep them for up to 30 days to check for abuse, and longer if its checks flag a picture for review. It
> doesn't train its models on them. The gateway keeps no copy.

**After, Google** (notice version 1):

> **A closed model by Google**
>
> Gemini 3.1 Flash Image is made by Google. Its weights aren't published, so its recipe can't be re-run exactly.
>
> Google receives your prompt for each view and, for the side and back, the front view it made, through Vercel AI
> Gateway. Nothing else about you.
>
> Google is set to keep no copy, through the gateway's zero-retention agreement with Google Vertex AI, and doesn't
> train its models on them. The gateway keeps no copy.

**With the first notice a device sees** (either maker), below the text:

> Closed models are for people 18 or older, as signing in here is (Terms, section 4).
>
> ☐ I'm 18 or older

**Buttons:** "OK" · "Don't remind me again". Both stay disabled until the box is ticked, the first time.

## The labels beside each closed model in the picker, word for word

- GPT Image 2.5 Sunburst: "OpenAI keeps prompts up to 30 days"
- Gemini 3.1 Flash Image: "Google keeps no copy"

## The 18+ confirmation and the notice: one screen

The age-terms doc proposed an 18+ confirmation stored with the account. The owner chose (2026-11-04) **one screen**: the
box sits on the first notice and is remembered on the device only. **Honestly:** the server can't check a device-only
answer, and someone who clears site data or uses another device is asked again; anyone can tick it. It reminds of the
Terms' 18+ rule (Terms §4, sign-in needs 18+; only signed-in people can generate); it is not a verification. **Whether that
meets OpenAI's clause on minors** (Services Agreement §3.3(c), quoted in `age-terms-closed-models.md`: minors only with a
parent's or guardian's consent) **is the owner's reading to make.** On paper, since only signed-in people, who agreed they
are 18 or older, can Generate, no minor should reach OpenAI; the box adds a reminder at the point of use, not proof.

## Privacy §3 (Kept on your device only)

**Before:**

> Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark
> setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its
> answers, drafts of images you make until you publish them, a few other settings of yours, and, on the website, your
> sign-in, which lasts about an hour (a day for a wallet sign-in), and a payment you have sent but not yet seen
> credited. These stay on your device. Clearing your browser's site data removes them. Frames you make in Remix are
> not drafts: they are saved by us as soon as they are made (section 4). So are the frames and video tests your agent
> makes when you approve them, but privately: only you can see them (section 4).

**After** (one sentence added before "These stay on your device."):

> Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark
> setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its
> answers, drafts of images you make until you publish them, a few other settings of yours, and, on the website, your
> sign-in, which lasts about an hour (a day for a wallet sign-in), and a payment you have sent but not yet seen
> credited. If you choose a closed model when you remix a character's sheet, it also stores that you confirmed you are
> 18 or older, and which makers' notices you asked not to be shown again; we don't receive either. These stay on your
> device. Clearing your browser's site data removes them. Frames you make in Remix are not drafts: they are saved by
> us as soon as they are made (section 4). So are the frames and video tests your agent makes when you approve them,
> but privately: only you can see them (section 4).

## Privacy §4 (Kept by us when you sign in): the character sheets item

**Before:**

> Character sheets you publish, with their text, their views, your name and the record of how each view was made.
> These are public. During the remix challenge, anyone who passes the same check as making images can publish a remix
> of its characters' sheets.

**After:**

<!-- privacy-4 -->
> Character sheets you publish, with their text, their views, your name and the record of how each view was made.
> These are public. During the remix challenge, anyone who passes the same check as making images can publish a remix
> of its characters' sheets. When you remix a character's sheet you can choose the model that makes all of its views:
> the site's open models, or a closed model, named with its maker on the form and in each view's record. How many
> pictures you make with closed models each day is counted apart from the others.
<!-- end -->

## Privacy §7 (Outside services and what they receive): one new list item, after the fal.ai item

**Before:** (no item; §7 names neither OpenAI nor Google.)

**After:**

<!-- privacy-7 -->
> If you choose a closed model when you remix a character's sheet, its maker receives, through Vercel AI Gateway, the
> prompt for each view and, for the side and back, the front view it made. It receives nothing else about you, and
> your browser never contacts it. OpenAI (for GPT Image 2.5 Sunburst) may keep them for up to 30 days to check for
> abuse, and longer if its checks flag a picture for review; it does not train its models on them. Google (for Gemini
> 3.1 Flash Image) is set to keep no copy, through the gateway's zero-retention agreement with Google Vertex AI, and
> does not train its models on them. The gateway itself keeps no copy.
<!-- end -->

If `closed-model-bases`' own §7 item (the project's bases) ships too, the two stay separate items: theirs is about the
project's own pictures, this one about a remixer's.

## The consent screen (`config/consent.json`): its last paragraph, a new version (`own-words-v5`), not changed on the branch

P6j compares the consent screen with what receives the prompt at Generate; with the switch on, OpenAI and Google do.

**Before (`own-words-v4`, last paragraph):**

> To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to
> fal.ai to make it, and your Farcaster ID to Neynar to check your account's score. In Remix, every frame you make is
> saved and public at its link as soon as it is made, with your words. Elsewhere, drafts you don't publish stay on your
> device.

**After:**

<!-- consent -->
> To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to
> fal.ai to make it, and your Farcaster ID to Neynar to check your account's score. If you choose a closed model for a
> sheet's views, the prompt and the front view go to its maker (OpenAI or Google) through Vercel AI Gateway instead of
> fal.ai; OpenAI may keep them for up to 30 days. In Remix, every frame you make is saved and public at its link as soon
> as it is made, with your words. Elsewhere, drafts you don't publish stay on your device.
<!-- end -->

## Terms §8 (AI-made material): one sentence added at the end

**Before:**

> The narration, many pictures (every frame made in Remix among them) and the assistant's answers are produced by AI
> models and are labelled as such. They can be wrong. The assistant's commentary is not the book and is not advice of
> any kind.

**After** (with `closed-model-bases`' two sentences, if they ship; otherwise this one alone, then theirs' second):

> … The assistant's commentary is not the book and is not advice of any kind. When you remix a character's sheet you may
> choose a closed model for its views, named with its maker on the form and in each view's record; its maker's terms let
> us publish those pictures, and bind us, not you: they are offered under the licence in section 3, as far as anyone
> holds rights in them, and a closed model's recipe can't be re-run exactly.

Why "bind us, not you": the providers' restrictions (no competing models, no passing machine work off as human) bind
the project; GPL-3.0 §10 forbids adding restrictions for licensees (`closed-model-bases`, "Recommendation").

## About, "Where it runs": one sentence added

P6h needs About to name the services Privacy names; `SERVICES` now has OpenAI and Google.

**Before (first sentences):**

> Vercel hosts the site and sees your IP address and browser details, as any web host does. Cloudflare stores and serves
> the pictures and audio. Supabase holds the database. …

**After:**

> … Supabase holds the database. If you choose a closed model when you remix a character's sheet, its maker (OpenAI or
> Google) receives the prompt and the front view through Vercel AI Gateway, and nothing about you; OpenAI may keep them
> for up to 30 days, Google is set to keep no copy, and neither trains on them. …

(In `src/app/about/page.tsx` on the branch, since Privacy §7 now names OpenAI and Google and P6h compares the two; it ships with them.)
The assistant's notice (P6i) doesn't change: no assistant question goes to OpenAI or Google.

## Terms check per model: GPL-3.0 and minting

Minting here: an open edition on `contracts/snowmoon-wip` (ERC-1155, fixed price), whose token metadata points to the
published picture and its recipe.

| Model | Licence or terms | Publish under GPL-3.0 | Mint | Verdict |
| --- | --- | --- | --- | --- |
| Z-Image Turbo (open default, front) | "License: apache-2.0", <https://huggingface.co/Tongyi-MAI/Z-Image-Turbo> | Apache-2.0 puts no condition on outputs | No restriction | **Offered** (unchanged) |
| FLUX.2 [klein] 4B edit (open default, side and back) | "license: apache-2.0", <https://huggingface.co/black-forest-labs/FLUX.2-klein-4B> | as above | No restriction | **Offered** (unchanged) |
| GPT Image 2.5 Sunburst, a closed model by OpenAI | OpenAI Services Agreement §4.1, <https://cdn.openai.com/osa/openai-services-agreement.pdf>: "Customer: (a) retains all ownership rights in Input; and (b) owns all Output. OpenAI hereby assigns to Customer all OpenAI's right, title, and interest, if any, in and to Output." Terms of Use: "Represent that Output was human-generated when it was not." is forbidden (labels meet it). Vercel AI Product Terms §8.1 passes these on, §6.2 assigns Vercel's rights | Yes: no clause restricts licensing or redistribution (`closed-model-bases`) | **Not addressed; no restriction found.** Usage Policies, effective 2025-10-29 (<https://openai.com/policies/usage-policies>, read from the dated copy `closed-model-bases` cites): no clause on NFTs, crypto, tokens or selling output; the nearest, "real money gambling" and "financial activities and credit" (automated high-stakes decisions), don't cover a fixed-price open edition of a labelled picture | **Offered** |
| Gemini 3.1 Flash Image, a closed model by Google | Google Cloud Service Specific Terms §20(a), <https://cloud.google.com/terms/service-terms>: "Generated Output is Customer Data. As between Customer and Google, Google does not assert any ownership rights in any new intellectual property created in the Generated Output." §17(b) bars using output to build similar models (binds us only) | Yes | **Not addressed; no restriction found.** Generative AI Prohibited Use Policy, last modified 2024-12-17 (<https://policies.google.com/terms/generative-ai/use-policy>): no clause on NFTs, crypto, tokens, minting or selling generated content (read 2026-11-04) | **Offered** (owner, 2026-11-04): §20(d), "Customer will not, and will not allow End Users to, use a Generative AI Service as part of a website … that is directed towards or is likely to be accessed by individuals under the age of 18". The owner's reading: the Terms require 18+ to sign in, and only signed-in people can generate; the first notice adds the 18+ box (`age-terms-closed-models.md`) |
| Qwen-Image-Edit-2511 (open, considered) | "license: apache-2.0"; "Qwen-Image is licensed under Apache 2.0.", <https://huggingface.co/Qwen/Qwen-Image-Edit-2511> (revision 6f3ccc0b) | Yes | No restriction | **Not added yet:** passes the licence; on fal.ai at $0.03/MP with a safety checker; its card claims "improved character consistency". But it edits only (no front from text) and no sheet view has been made with it: a paid three-view test first (owner) |
| FLUX.3 [klein] (open weights per the gateway) | "license: other", flux-kommunity-license, gated: <https://huggingface.co/black-forest-labs/flux-3-image-klein> | Can't be read without accepting it; the allowlist rule needs a licence that clearly allows it | — | **Left out** |
| FLUX.2 [klein] 9B | flux-non-commercial-license (`config/models.json` excluded) | No | No | **Left out** |

Copyright (not legal advice): a picture made wholly by a model is likely not copyrightable in the US; "under GPL-3.0, as
far as anyone holds rights in them" is honest either way (`closed-model-bases`, "Copyright of the pictures").

## Cost per remix, at today's prices

A remix makes three views (front, side, back), each after its prompt check. Sources: fal's pricing API
(`https://api.fal.ai/v1/models/pricing?endpoint_id=…`, read 2026-11-04: Z-Image Turbo $0.005/MP, FLUX.2 [klein] 4B edit
$0.01/MP, Qwen-Image-Edit-2511 $0.03/MP); the gateway's model list (`https://ai-gateway.vercel.sh/v1/models`, read
2026-11-04: gpt-image-2.5-sunburst $5 / $30 per million input / output tokens; gemini-3.1-flash-image $0.067 per 1K
image, $0.50 / $3 per million tokens; gpt-oss-safeguard-20b $0.075 / $0.30 per million, `CHAT.prices`); the bases
ledger of 2026-11-03 (branch `starting-sheet-drafts`), the gateway's own reported cost per call.

| Model | Front | Side or back (each) | Prompt checks (3) | **Per remix** | Reserved, worst case per view |
| --- | --- | --- | --- | --- | --- |
| Open default (Z-Image Turbo, then FLUX.2 [klein] 4B edit) | $0.0022 (0.442 MP × $0.005; $0.005 if fal rounds to 1 MP) | $0.0088 ((0.442 + 0.442) MP × $0.01; measured $0.00885) | ~$0.0005 (measured $0.0001–0.00015 each) | **~$0.020** | $0.0065 / $0.0215 |
| GPT Image 2.5 Sunburst (OpenAI) | ~$0.0427 (1,372 output tokens at 1024 × 1536, high = $0.0412, plus ~300 prompt tokens) | $0.0467 (measured, 6 calls, $0.0466–0.0468, with one reference picture) | ~$0.0005 | **~$0.137** | $0.0815 |
| Gemini 3.1 Flash Image (Google) | $0.0677 (measured, 6 calls; $0.067 per 1K image plus tokens) | $0.0677 | ~$0.0005 | **~$0.204** | $0.0915 |

The publish adds one more prompt check (the sheet's name), ~$0.0001, for every model. At the closed cap of $5 a day: about
36 GPT remixes (or 24 Gemini); at 6 closed pictures a person, two remixes each, so 18 people a day (12 with Gemini).
The GPT front is estimated, not measured (the bases made every front from a reference picture).

## Decisions owed (the owner's)

1. Reread the notices, the labels, the 18+ line and Privacy §3, §4 and §7 (in `legal.ts` on the branch), and the consent
   and About lines (draft only); they ship in the release that turns the switch on.
2. The consent screen: a new version (`own-words-v5`, everyone agrees again) or a separate consent only when a closed
   model is chosen.
3. The 18+ box: whether a device-only reminder meets OpenAI's minors clause in your reading (it is not a verification).
4. Google's wording: "set to keep no copy" (Vercel's ZDR agreement), or also Google's own 24-hour in-memory cache.
5. OpenAI's live terms pages (openai.com/policies) still refuse the fetch: re-check the v1 ownership and usage quotes there.
6. Content credentials: publish the original PNG with its C2PA manifest beside the JPEG (proposed), or only record it (built).
7. Closed models for wallet (prepaid) accounts: refused for now.
8. Whether a closed-model remix can be a challenge entry and be minted.
9. The form's other wording and the recipe's "can't be re-run exactly" line (`IMAGE_WORDING.designs.models`, recipe-lines.ts).
10. Whether to add Qwen-Image-Edit-2511 after a three-view test.
