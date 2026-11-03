# Model choice for remixers: Privacy, Terms, consent and About lines (DRAFT, not reread)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-04, on branch `remix-model-choice`.
**Not reread by the owner. Not in `src/lib/legal.ts` or `config/consent.json`** (this branch touches neither). Not
legal advice. It builds on the provider terms research of branch `closed-model-bases`
([`docs/proposals/closed-model-bases.md`](../proposals/closed-model-bases.md), merged into this branch; its clauses are
not repeated here, only cited) and adds what changes when **a remixer**, not the owner's batch script, makes a picture
with a closed model.

Legal texts describe today (owner, 2026-10-18): these lines go into `src/lib/legal.ts` and `config/consent.json` in the
same release that turns `IMAGES.designs.modelChoice` on, never ahead of it. `check:principles` P6s fails while the switch
is on and Privacy §4, §7 or the consent screen lack them; P6g, P6h and P6i now know OpenAI and Google
(`SERVICES` in `scripts/check-principles.ts`), so About must name them too.

"Before" is main's `src/lib/legal.ts` and `config/consent.json` (`own-words-v4`) at `26bf405` (2026-11-03).

## What the code does, which the words must match

- On the remix form of a character sheet, with the switch on, a remixer picks one model for the sheet. **The site's open
  models are the default and first**: Z-Image Turbo for the front, FLUX.2 [klein] 4B edit for the side and back, both
  open weights, Apache-2.0, on fal.ai (unchanged). The closed choice offered: **GPT Image 2.5 Sunburst, a closed model by
  OpenAI**; and **Gemini 3.1 Flash Image, a closed model by Google**, only once the owner settles Google's under-18 clause
  (`CLOSED_IMAGES.geminiAgeReadingAccepted`, false; below).
- A closed choice makes all three views: the front from the prompt alone, then the side and back from the prompt and the
  front view (`src/lib/images/closed.ts`).
- **What the provider receives:** the prompt (the view line, the style's text and the sheet's text, the no-words line,
  all of it public with the sheet) and, for a side or back, the front view the same model made. Nothing else about the
  person: no FID, name, wallet, IP address or user field. The call comes from our server, through Vercel AI Gateway.
- **How the gateway is asked to keep it:** every call sets `providerOptions.gateway` to
  `{ zeroDataRetention: true, disallowPromptTraining: true, only: [<provider>] }`. The provider is pinned:
  `openai` for GPT, `vertex` (Google Vertex AI) for Gemini, so only the terms read apply. Vercel's ZDR page
  (<https://vercel.com/docs/ai-gateway/security-and-compliance/zdr>, last updated 2026-09-22): "AI Gateway has a ZDR
  policy and does not retain prompts, outputs, or sensitive data. User data is immediately and permanently deleted after
  requests are completed." Its provider table lists Google Vertex AI "ZDR" and OpenAI "ZDR with safety retention". The
  no-training page (<https://vercel.com/docs/ai-gateway/security-and-compliance/disallow-prompt-training>, last updated
  2026-09-10): "Set `disallowPromptTraining: true` … to ensure requests are only routed to providers that do not use your
  data for training." If the pinned provider can't meet both, the gateway refuses the call; no picture is made, and the
  person's count is not given back (as for a model that didn't answer today).
- The picture comes back as a PNG; it is stored as every view is (JPEG at 576 × 768, padded, no model). The recipe
  records the conversion, the original's sha256 and whether the original carried its maker's content credentials (C2PA),
  which the JPEG does not keep.
- The same prompt check as today runs first (gpt-oss-safeguard-20b, through Groq or Vercel AI Gateway); no host safety
  checker result comes back from a closed model, so the recipe says "Checked by gpt-oss-safeguard-20b; made by a closed
  model whose own safety filters we can't see."
- Counts: a closed picture counts in its own daily count (6 per person), never in the open 10; closed spend has its own
  daily cap ($5), inside the free cap ($15 in the challenge window). Kept as today: `studio.image_asks` (FID, time, and
  now its pool) and daily totals in `studio.image_costs` with no person.

## Privacy §4 (Kept by us when you sign in): the character sheets item

**Before:**

> Character sheets you publish, with their text, their views, your name and the record of how each view was made. These
> are public. During the remix challenge, anyone who passes the same check as making images can publish a remix of its
> characters' sheets.

**After:**

<!-- privacy-4 -->
> Character sheets you publish, with their text, their views, your name and the record of how each view was made. These
> are public. During the remix challenge, anyone who passes the same check as making images can publish a remix of its
> characters' sheets. When you remix a character's sheet you can choose the model that makes all of its views: the
> site's open models, or a closed model, named with its maker on the form and in each view's record. How many pictures
> you make with closed models each day is counted apart from the others.
<!-- end -->

## Privacy §7 (Outside services and what they receive): one new list item, after the fal.ai item

**Before:** (no item; §7 names neither OpenAI nor Google.)

**After (OpenAI only, while Gemini waits):**

<!-- privacy-7 -->
> If you choose a closed model when you remix a character's sheet, its maker (OpenAI, for GPT Image 2.5 Sunburst)
> receives, through Vercel AI Gateway, the prompt for each view and, for the side and back, the front view it made. It
> receives nothing else about you, and your browser never contacts it. The gateway keeps no copy, and passes them on
> from its own account, set so that the maker may not train on them or keep a copy, apart from OpenAI's safety checks.
<!-- end -->

**When Gemini is offered as well**, the first sentence reads "…its maker (OpenAI, for GPT Image 2.5 Sunburst; Google,
for Gemini 3.1 Flash Image) receives…", and the last ends "…apart from OpenAI's safety checks; Google's runs on its
Vertex AI service." `CLOSED_IMAGES.geminiAgeReadingAccepted` and this sentence change in the same release (P6s follows
the list offered).

**If `closed-model-bases`' own §7 item ships first** (the project's own bases), the two can be one item: "OpenAI and
Google, through Vercel AI Gateway, receive the prompt and the reference pictures for some of the pictures the project
makes itself (the remix challenge's bases and references) and, if you choose a closed model when you remix a
character's sheet, for each of its views. …" (then this item's last three sentences).

Notes:
- "apart from OpenAI's safety checks": Vercel's ZDR table says "ZDR with safety retention" for OpenAI. What OpenAI keeps
  under it, and for how long, is not on the pages read (openai.com refused the fetch). **To check before the switch.**
- "from its own account": the bases ledger reports `"credentialType": "system"` on every call (Vercel's own accounts).

## The consent screen (`config/consent.json`): its last paragraph, a new version (`own-words-v5`)

P6j compares the consent screen with what receives the prompt at Generate. With the switch on, OpenAI does.

**Before (`own-words-v4`, last paragraph):**

> To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to
> fal.ai to make it, and your Farcaster ID to Neynar to check your account's score. In Remix, every frame you make is
> saved and public at its link as soon as it is made, with your words. Elsewhere, drafts you don't publish stay on your
> device.

**After:**

<!-- consent -->
> To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to
> fal.ai to make it, and your Farcaster ID to Neynar to check your account's score. If you choose a closed model for a
> sheet's views, the prompt and the front view go to its maker (OpenAI) through Vercel AI Gateway instead of fal.ai. In
> Remix, every frame you make is saved and public at its link as soon as it is made, with your words. Elsewhere, drafts
> you don't publish stay on your device.
<!-- end -->

A new consent version means everyone agrees again before their next Generate; the owner may prefer to keep v4 and ask
again only when a closed model is chosen (a decision owed; the code follows `config/consent.json`'s `current`).

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

> … Supabase holds the database. If you choose a closed model when you remix a character's sheet, its maker (OpenAI)
> receives the prompt and the front view through Vercel AI Gateway, set to keep nothing and not to train on them;
> nothing about you. …

(With Gemini: "its maker (OpenAI or Google)". With `closed-model-bases`' About sentence, the two merge as in §7.)
The assistant's notice (P6i) doesn't change: no assistant question goes to OpenAI or Google.

## Terms check per model: GPL-3.0 and minting

Minting here: an open edition on `contracts/snowmoon-wip` (ERC-1155, fixed price), whose token metadata points to the
published picture and its recipe.

| Model | Licence or terms | Publish under GPL-3.0 | Mint | Verdict |
| --- | --- | --- | --- | --- |
| Z-Image Turbo (open default, front) | "License: apache-2.0", <https://huggingface.co/Tongyi-MAI/Z-Image-Turbo> | Apache-2.0 puts no condition on outputs | No restriction | **Offered** (unchanged) |
| FLUX.2 [klein] 4B edit (open default, side and back) | "license: apache-2.0", <https://huggingface.co/black-forest-labs/FLUX.2-klein-4B> | as above | No restriction | **Offered** (unchanged) |
| GPT Image 2.5 Sunburst, a closed model by OpenAI | OpenAI Services Agreement §4.1, <https://cdn.openai.com/osa/openai-services-agreement.pdf>: "Customer: (a) retains all ownership rights in Input; and (b) owns all Output. OpenAI hereby assigns to Customer all OpenAI's right, title, and interest, if any, in and to Output." Terms of Use: "Represent that Output was human-generated when it was not." is forbidden (labels meet it). Vercel AI Product Terms §8.1 passes these on, §6.2 assigns Vercel's rights | Yes: no clause restricts licensing or redistribution (`closed-model-bases`) | **Not addressed; no restriction found.** Usage Policies, effective 2025-10-29 (<https://openai.com/policies/usage-policies>, read from the dated copy `closed-model-bases` cites): no clause on NFTs, crypto, tokens or selling output; the nearest, "real money gambling" and "financial activities and credit" (automated high-stakes decisions), don't cover a fixed-price open edition of a labelled picture | **Offered** |
| Gemini 3.1 Flash Image, a closed model by Google | Google Cloud Service Specific Terms §20(a), <https://cloud.google.com/terms/service-terms>: "Generated Output is Customer Data. As between Customer and Google, Google does not assert any ownership rights in any new intellectual property created in the Generated Output." §17(b) bars using output to build similar models (binds us only) | Yes | **Not addressed; no restriction found.** Generative AI Prohibited Use Policy, last modified 2024-12-17 (<https://policies.google.com/terms/generative-ai/use-policy>): no clause on NFTs, crypto, tokens, minting or selling generated content (read 2026-11-04) | **Held back** (in the code, not offered): §20(d), "Customer will not, and will not allow End Users to, use a Generative AI Service as part of a website … that is directed towards or is likely to be accessed by individuals under the age of 18". A remixer's own Generate is a use on the website. Signing in needs 18+ (Terms §4), but reading needs no account. **The owner's decision.** |
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

1. Reread these lines; then Privacy §4, §7, the consent screen and About change in the release that turns the switch on.
2. Google's under-18 clause: accept a reading (signing in needs 18+) and set `CLOSED_IMAGES.geminiAgeReadingAccepted`, or
   leave Gemini out.
3. A new consent version (`own-words-v5`, everyone agrees again) or a separate consent only when a closed model is chosen.
4. Content credentials: the code records that the original had a C2PA manifest and that the JPEG drops it. Proposal:
   also publish the original PNG beside the JPEG (one more file per closed view, about 2–3 MB, kept on our bucket),
   named in the recipe, so the picture says it is AI-made outside the site. Not built.
5. "ZDR with safety retention": what OpenAI keeps for safety, and for how long; and whether the gateway honours
   `zeroDataRetention` on its image endpoints (a single paid test call, with the owner's OK, before the switch).
6. Closed models for wallet (prepaid) accounts: refused for now.
7. Whether a closed-model remix can be a challenge entry (and be minted at the end), as the challenge's rules read today.
8. The wording on the form, the recipe's "can't be re-run exactly" line, and the refusals (DRAFT, `IMAGE_WORDING.designs.models`).
