# Closed-model bases: can we publish them under GPL-3.0?

> **DRAFT.** Written by the coding agent (Claude, a closed model by Anthropic) on branch `closed-model-bases`, for the
> owner's decision of 2026-11-04 (several models may make the remix challenge's bases and references, closed ones
> included, labelled as closed). Nothing here is merged, published or switched on. **Not legal advice:** this is a
> reading of the providers' published terms, not a lawyer's opinion.
>
> Terms read on **2026-11-03 (Pacific; the machine's date; the brief's date is 2026-11-04)**. Where a page could not be
> read directly, the source says so. OpenAI's own pages (openai.com/policies/...) refused the fetch tool (HTTP 403); for
> those the text comes from OpenAI's own CDN (the Services Agreement PDF) or from a dated copy, named below. Re-check
> those quotes on the live pages before the switch turns on.

The drafted Terms, Privacy and About lines are in [`docs/legal/closed-model-bases-draft.md`](../legal/closed-model-bases-draft.md).

## What is being published

The challenge's drafts (`docs/starting-sheet-drafts/bases.md` on `starting-sheet-drafts`; ledger
`/Users/nathan/snowmoon-starting-drafts/bases/ledger.json`) include two closed models, each called by a batch script
(`docs/starting-sheet-drafts/bases/make-bases.mts`) from the owner's machine, through the Vercel AI Gateway with the
team's gateway key:

| Model | Maker | Gateway endpoint | Served by (ledger) | Credentials (ledger) | Sent |
| --- | --- | --- | --- | --- | --- |
| GPT Image 2.5 Sunburst | OpenAI | `/v1/images/edits` | `openai` | `system` (Vercel's own account) | prompt, one reference picture (the character's sheet, by sha256), size, quality, format, `disallowPromptTraining` |
| Gemini 3.1 Flash Image | Google | `/v1/chat/completions` (image output) | `vertex` (Vertex AI); `google` (Gemini API) listed as a fallback | `system` | prompt, one reference picture, aspect ratio, `disallowPromptTraining` |

Nothing about any user is in these requests: the script sends no user field, no Farcaster ID and no site request. The
references are the project's own sheets. The gateway reports `"credentialType": "system"` on every call, so OpenAI and
Google are reached from **Vercel's** accounts with them, not ours.

Already live, and covered by the same findings: every model-drawn picture of Fifteen Days version 2 was made with GPT
Image 2.5 Sunburst through the same gateway (`config/models.json`, whose `license_checked.source` still says "owner to
review that they allow publishing the pictures under GPL-3.0"). This report answers that open item too.

## Findings, per provider

### OpenAI (GPT Image 2.5 Sunburst)

**Which terms apply through the gateway.** Vercel's Notices and License Information (below) lists, for OpenAI,
`https://openai.com/policies/terms-of-use`. Vercel itself, as OpenAI's API customer, is under OpenAI's Services
Agreement (or a negotiated version). The two say the same on every point below.

- **Output ownership.** OpenAI Services Agreement, ONLINE v.010126, §4.1
  (<https://cdn.openai.com/osa/openai-services-agreement.pdf>, read 2026-11-03):
  > "As between Customer and OpenAI, to the extent permitted by applicable law, Customer: (a) retains all ownership rights in Input; and (b) owns all Output. OpenAI hereby assigns to Customer all OpenAI's right, title, and interest, if any, in and to Output."

  Terms of Use, effective 2024-12-11 (<https://openai.com/policies/terms-of-use>; the live page refused the fetch; text
  from the copy at <https://open.windriver.com/info/uni-license-list/licenses/openai-tou-20241211.html>):
  > "As between you and OpenAI, and to the extent permitted by applicable law, you (a) retain your ownership rights in Input and (b) own the Output. We hereby assign to you all our right, title, and interest, if any, in and to Output."
- **Licensing or redistributing outputs.** No clause restricts licensing, sharing or redistributing Output. The only
  related clause is on uniqueness (OSA §4.4): "Output may not be unique, and other users may receive similar content
  from OpenAI's services. Responses that are requested by and generated for other users are not considered Customer's
  Output." So we can offer our Output under GPL-3.0, and our licensees can reuse it as the licence allows.
- **Training other models.** OSA §3.3: "Customer will not, and will not permit End Users to: … (e) except for a
  Permitted Exception, use Output to develop artificial intelligence models that compete with OpenAI's products and
  services". Terms of Use, "What you cannot do": "Use Output to develop models that compete with OpenAI."
  This binds the customer (Vercel, and us through Vercel's terms) and the customer's "End Users", who are people using
  OpenAI's services through the customer's application. People who download a published picture from the site are not
  using OpenAI's services. **Reading:** a GPL licensee training a model on the pictures does not put us in breach, as
  long as we don't do it ourselves and don't offer the pictures *for* that purpose. We must not pass the restriction on:
  GPL-3.0 §10 says "You may not impose any further restrictions on the exercise of the rights granted or affirmed under
  this License."
- **Attribution, labelling, provenance.** No contractual attribution requirement. Terms of Use, "What you cannot do":
  "Represent that Output was human-generated when it was not." Usage Policies, effective 2025-10-29
  (<https://openai.com/policies/usage-policies>; the live page refused the fetch; text from a copy printed 2025-11-07,
  <https://docs.databricks.com/aws/en/assets/files/usage-policies-openai-923e062e72487537e2a8df04bcec7f6d.pdf>): no use
  for "deceit, fraud, scams, spam, or impersonation", or "use of someone's likeness, including their photorealistic
  image or voice, without their consent in ways that could confuse authenticity". The OSA's "OpenAI Policies" also
  include a Sharing and Publication Policy (<https://openai.com/policies/sharing-publication-policy>), which could not be
  read today; earlier versions asked that the AI's role be disclosed so that no reader could miss it. **Not checked
  today.** Our labels ("AI-generated … a closed model by OpenAI", the recipe) meet all of these.
  **C2PA and watermark, as found in the files:** every original PNG from GPT Image 2.5 Sunburst carries a C2PA manifest
  signed by "OpenAI OpCo, LLC" ("OpenAI Media Service API"), with the IPTC source type `trainedAlgorithmicMedia` and a
  `c2pa.watermarked` action (an invisible watermark). **Our JPEG conversion strips the manifest** (0 C2PA bytes in every
  converted `.jpg`). No clause read today forbids that; whether the invisible watermark survives the resize is not
  checked.
- **Through the gateway.** Vercel AI Product Terms §8.1 (below): we "must comply with the terms of any applicable
  third-party AI provider". So yes, they apply to us, through Vercel.

**Conclusion: publishable under GPL-3.0: yes, with conditions.** (1) Label each picture AI-made and name OpenAI (never
present it as human-made). (2) Don't impose OpenAI's no-competing-models clause on licensees, and don't use the
pictures to train a competing model ourselves. (3) No real person's likeness. (4) Re-check the live Terms of Use,
Usage Policies and Sharing and Publication Policy pages, which could not be read today.

### Google (Gemini 3.1 Flash Image, served by Vertex AI)

**Which terms apply through the gateway.** Vercel's notice lists "Google Vertex AI: https://cloud.google.com/terms/service-terms"
and "Google: https://policies.google.com/terms/generative-ai". The drafts were served by Vertex; the gateway listed the
Gemini API (`google`) as a fallback, so a call could have gone to the Gemini API instead, under its own terms (quoted
too).

- **Output ownership.** Google Cloud Service Specific Terms, §20(a), Generative AI Services
  (<https://cloud.google.com/terms/service-terms>; sections renumbered 2026-02-18; no last-modified date found):
  > "Generated Output is Customer Data. As between Customer and Google, Google does not assert any ownership rights in any new intellectual property created in the Generated Output."

  Gemini API Additional Terms, effective 2026-03-23 (<https://ai.google.dev/gemini-api/terms>, now
  <https://aistudio.google.com/docs/terms>): "Google won't claim ownership over that content."
  Google does not *assign* anything (unlike OpenAI); it disclaims ownership.
- **Licensing or redistributing outputs.** No clause restricts it. §20(b): "a Generative AI Service may, in some
  scenarios, produce the same or similar Generated Output for multiple customers."
- **Training other models.** §17(b) (formerly 16): "Customer will not, and will not allow End Users to, use output from
  an AI/ML Service (including Generated Output) to: (i) substitute, replace, or circumvent the use of a Google Model,
  directly or indirectly, or (ii) create or improve models similar to a Google Model." §17(a): "Customer will not, and
  will not allow End Users to use an AI/ML Service or Generated Output to develop a similar or competing product or
  service." Gemini API terms: "You may not use the Services to develop models that compete with the Services". Same
  reading as OpenAI: it binds the customer and its End Users, not the public who download a published picture; we must
  not pass it on (GPL-3.0 §10) and must not do it ourselves.
- **Age.** §20(d): "Customer will not, and will not allow End Users to, use a Generative AI Service as part of a
  website, Customer Application, or other online service that is directed towards or is likely to be accessed by
  individuals under the age of 18." Gemini API terms: "You also will not use the Services as part of a website,
  application, or other service (collectively, "API Clients") that is directed towards or is likely to be accessed by
  individuals under the age of 18." **This is the one unclear point.** Reading needs no account and the Privacy Policy
  says only that the Service "is not directed to children under 13". Our use is a batch job on the owner's machine, not
  a feature of the website: no visitor ever uses Gemini, only its finished pictures are shown. That reading is
  reasonable but not certain.
- **Attribution, labelling, provenance.** No contractual attribution requirement for images (the Gemini API terms
  mention attribution only "when returned as part of an API call", where law requires it). Generative AI Prohibited Use
  Policy, last modified 2024-12-17 (<https://policies.google.com/terms/generative-ai/use-policy>), incorporated by §20(c):
  no "Misrepresenting the provenance of generated content by claiming it was created solely by a human, in order to
  deceive", and no "Impersonating an individual (living or dead) without explicit disclosure, in order to deceive".
  **C2PA and SynthID, as found in the files:** every original PNG carries a C2PA manifest signed by Google LLC
  ("Google C2PA Core Generator Library") with the actions "Created by Google Generative AI." and "Applied imperceptible
  SynthID watermark.", and XMP `photoshop:Credit="Made with Google AI"`. **Our JPEG conversion strips the manifest and
  the XMP credit.** No clause read today forbids that. Indemnity §20(i) does not cover a customer who "disregards,
  disables, modifies, or circumvents source citations, filters, instructions, or other tools Google makes available";
  through the gateway we are not Google's customer, so Google's output indemnity most likely doesn't reach us anyway.
- **Data.** §18: "Google will not use Customer Data to train or fine-tune any AI/ML models without Customer's prior
  permission or instruction." §20(h): Google won't store prompts "for longer than is reasonably necessary to create the
  Generated Output". On the Gemini API's unpaid tier, Google "uses the content you submit … to provide, improve, and
  develop Google products" (paid: "Google doesn't use your prompts"). The gateway's `disallowPromptTraining` filter
  applies to every attempt, including fallbacks (ledger: "all 2 attempts disallow prompt training").
- **Through the gateway.** As for OpenAI (Vercel §8.1).

**Conclusion: publishable under GPL-3.0: yes, with conditions** (one point unclear). (1) As OpenAI's (1) to (3), with
Google named. (2) The under-18 clause: keep Gemini off the website itself (batch only, never a visitor-facing
feature), and the owner accepts the reading above, or asks Google or a lawyer. (3) Pin future calls to Vertex
(`providerOptions.gateway.only: ['vertex']`, the gateway's provider filter) so one set of terms applies; record the
served provider in each recipe (the ledger already does).

### Vercel AI Gateway

- **Whose customer we are.** Vercel's. AI Product Terms, last updated 2026-03-17, effective 2026-03-31
  (<https://vercel.com/legal/ai-product-terms>), §8.1: "AI Gateway enables you to interact with your selected
  third-party AI providers." "Any Customer Content provided to or received from such Non-Vercel Service is subject to
  the terms and conditions" of the provider, and you "must comply with the terms of any applicable third-party AI
  provider", as listed in the Notices and License Information. §14: use of Non-Vercel Services is "solely between you
  and the applicable third-party provider". With system credentials the provider's own contract is with Vercel, but
  Vercel's terms pass the provider's use terms on to us.
- **Output ownership.** §6.2: "you own Customer Content and Vercel assigns to you Vercel's rights, if any, in the Output."
- **Licensing, attribution.** No restriction on redistributing Output. §8.3 asks us to give end users our own terms and
  privacy policy and to disclose that the application uses AI (the site does).
- **Which provider terms.** Notices and License Information, last updated 2026-02-26
  (<https://vercel.com/legal/notices-and-license-information>), §6: "Non-Vercel Services in the AI Gateway are provided
  subject to any applicable terms the customer has agreed to with respect to the third-party AI service provider, or
  the terms below, as applicable." It lists OpenAI (<https://openai.com/policies/terms-of-use>), Google
  (<https://policies.google.com/terms/generative-ai>, a page that now says it no longer applies except to partners with
  a signed agreement) and Google Vertex AI (<https://cloud.google.com/terms/service-terms>).
- **Retention.** Zero Data Retention docs, last updated 2026-09-22
  (<https://vercel.com/docs/ai-gateway/security-and-compliance/zdr>): "AI Gateway has a ZDR policy and does not retain
  prompts, outputs, or sensitive data." Per request, `zeroDataRetention: true` in `providerOptions.gateway` routes only
  to providers with ZDR agreements; the table lists Google Vertex AI (ZDR) and OpenAI ("ZDR with safety retention").
  The drafts set only `disallowPromptTraining`, not `zeroDataRetention`.
- **What else the gateway passes.** Not documented in what was read: whether Vercel adds an identifier of our team or
  any request metadata when it calls OpenAI or Google. Our request carries only the gateway key (to Vercel), the model,
  the prompt, the picture and its settings. **Not checked.**

**Conclusion: yes.** Vercel assigns its rights in Output and adds no restriction of its own; it passes on the
providers' terms (above).

## Findings table

| | OpenAI (GPT Image 2.5 Sunburst) | Google (Gemini 3.1 Flash Image, Vertex) | Vercel AI Gateway |
| --- | --- | --- | --- |
| Output ownership | Customer owns Output; OpenAI assigns its rights, "if any" (OSA §4.1; ToU) | Google "does not assert any ownership rights" (Cloud §20(a)); no assignment | Vercel assigns its rights, "if any" (AI Product Terms §6.2) |
| Licensing / redistribution | No restriction | No restriction | No restriction |
| Others reuse under GPL | Yes; the no-competing-models clause binds us, not them | Yes; §17 binds us and our End Users, not the public | Yes |
| Training other models | We must not use Output to build competing models (OSA §3.3(e); ToU) | We must not use output to build similar models (§17(a), (b)) | — |
| Attribution / labelling | Don't present as human-made (ToU); no deceit or likeness misuse (Usage Policies) | Don't misrepresent provenance to deceive (Prohibited Use Policy 4.5) | Disclose AI use to end users (§8.3) |
| C2PA / watermark | C2PA manifest + watermark action in the PNG; our JPEG strips the manifest | C2PA + SynthID + "Made with Google AI" in the PNG; our JPEG strips them | — |
| Age | Minors need consent to *use* the services (OSA §3.3(c)): no visitor uses them | **Unclear:** no use "as part of a website … likely to be accessed by" under-18s (§20(d)) | — |
| Applies through the gateway | Yes, via Vercel §8.1 and its notice | Yes, same | We are Vercel's customer |
| **Publishable under GPL-3.0** | **Yes, with conditions** | **Yes, with conditions** (age clause unclear) | **Yes** |

## Copyright of the pictures (not legal advice)

- **United States.** Copyright needs a human author. The Copyright Office's report *Copyright and Artificial
  Intelligence, Part 2: Copyrightability* (January 2025) says prompts alone are generally not enough to make the user
  the author of the output. *Thaler v. Perlmutter* (D.C. Cir., 18 March 2025) upheld the human-authorship requirement;
  the Supreme Court denied review on 2 March 2026 (No. 25-449,
  <https://www.scotusblog.com/cases/case-files/thaler-v-perlmutter>). A base made wholly by a model from a prompt and a
  reference picture is therefore likely **not copyrightable** in the US, except for any human-authored parts (for
  example, a human's selection and arrangement, or human edits).
- **Elsewhere** it varies: the UK's Copyright, Designs and Patents Act s.9(3) gives "computer-generated works" to the
  person who made the arrangements; some Chinese courts have found copyright where a human shaped the result.
- **What GPL-3.0 then means for them.** A licence can only license rights that exist. Where a picture has no copyright,
  the GPL label grants nothing extra and takes nothing away: anyone may use the picture freely anyway. Where rights do
  exist (ours, or in some country), GPL-3.0 applies to them. The providers' "if any" wording says the same: they assign
  only what they have. Either way, offering the pictures "under GPL-3.0, as far as anyone holds rights in them" is
  honest and costs licensees nothing. It does not clear third parties' rights (a picture could resemble someone else's
  work; both providers warn output may not be unique).
- **The "source".** GPL-3.0 asks for the preferred form for modification. For these pictures the site publishes the
  recipe (prompt, every reference by sha256, settings, the served model and date); the weights are not published by
  their makers. This is the site's existing "inputs open, model closed" label.

## Recommendation

Allow closed-model bases and references, labelled as closed, under the conditions above. The terms of OpenAI, Google
and Vercel all leave the output to us and none restricts licensing or redistributing it, so offering the pictures
under GPL-3.0 is consistent with them. The providers' restrictions (no competing models, no deceptive provenance) bind
the project, not its licensees, and must not be written into the site's licence: GPL-3.0 §10 forbids further
restrictions. So the Terms line should say the providers' terms bind us, not "the licence is subject to the
providers' terms" (see the draft for why). The one open point is Google's under-18 clause; the owner should accept the
batch-only reading or prefer OpenAI until it is settled.

Keep the provenance: publish each closed picture's original file with its makers' C2PA manifest (or carry the
manifest over when converting), so the picture says it is AI-made even outside the site.

## Before `CHALLENGE.closedBasesAllowed` turns on

The switch is being added on `challenge-three-bases` (not yet on that branch's remote at the time of writing). It
should turn on only in the release where all of these are true:

1. **Privacy §7** names OpenAI and Google, reached through Vercel AI Gateway, and what they receive (the prompt and the
   reference pictures, nothing about users), at the owner's reread (`docs/legal/closed-model-bases-draft.md`).
2. **Terms §8** says some bases and references were made with closed models, named on each recipe, and how the licence
   applies; owner's reread.
3. **About** "Where it runs" names OpenAI and Google (P6h). `scripts/check-principles.ts`' `SERVICES` vocabulary gains
   `OpenAI` and `Google`, so P6g and P6h actually check them (today neither name is in the vocabulary, so the checks
   would pass without them).
4. **`config/models.json`** lists Gemini 3.1 Flash Image (maker Google, `open_weights: false`) on main, and both
   entries' `license_checked` points to this report instead of "owner to review".
5. **Every closed picture's recipe** names the model and its maker ("a closed model"), the served provider (`openai`,
   `vertex`), the gateway's generation id, the date, and the gateway options used.
6. **Provenance kept:** the original PNG (with its C2PA manifest) is published alongside the JPEG, or the manifest is
   carried over; the recipe says which.
7. **Gateway options for any new call:** `disallowPromptTraining: true` (already), plus `zeroDataRetention: true` if the
   Privacy line says "asked to keep no copy", and `only: ['vertex']` for Gemini.
8. **Google's under-18 clause:** the owner's decision recorded (batch-only reading accepted, or Gemini held back).
9. **Live re-check** of the three OpenAI pages that refused the fetch today (Terms of Use, Usage Policies, Sharing and
   Publication Policy), with any change noted here.
10. `check:principles` passes against the preview (P6d accepted open).

## Principles

- **1 (public recipe):** pass, if condition 5 holds; the draft recipes already carry prompt, references, model, served
  provider and generation id.
- **2 (AI use declared):** pass: every closed picture is labelled AI-made and names its maker; the providers' terms
  require no more than that. Stripping the C2PA manifest weakens the declaration outside the site (condition 6).
- **3 (allowlist, closed models reported):** concern until Gemini 3.1 Flash Image is on main's allowlist (condition 4);
  otherwise pass: both closed models are named with their maker in every draft recipe.
- **4 (published only by a person's action):** pass: the owner picks and publishes the bases.
- **6 (P6g to P6j, services named alike on Privacy, About, the notice and consent):** concern until conditions 1 and 3.
  The check's vocabulary doesn't know OpenAI or Google, so P6g and P6h can't catch their absence today (true already
  for Fifteen Days version 2's GPT pictures). No production page requests anything from OpenAI or Google.
- **New tension:** principle 3's "inputs open, model closed" against GPL-3.0's "source" for pictures whose weights no
  one can run; already accepted for Fifteen Days version 2.
