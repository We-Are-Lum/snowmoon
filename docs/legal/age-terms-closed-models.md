# Age terms for closed models, next to our Terms' "Who can use it" (DRAFT)

> **DRAFT.** Written by the coding agent (Claude, a closed model by Anthropic) on branch `remix-model-choice`, for the
> owner's question of 2026-11-04: "Before model choice opens to remixers, quote Google's and OpenAI's age terms next to
> our Terms' 'Who can use it', and tell me what has to change." **Not legal advice:** this is a reading of the
> providers' published terms, not a lawyer's opinion. Nothing here changes a page, a switch or the legal texts.
>
> **Read on 2026-11-03** (Pacific; the machine's date; the brief's date is 2026-11-04). Google's pages were read
> directly. OpenAI's own pages (openai.com/policies/…) refused every fetch (HTTP 403, a bot check), as on 2026-11-03
> for `docs/proposals/closed-model-bases.md`. Their text comes from OpenAI's own CDN (the Services Agreement PDF) or
> from a dated copy, named with each quote. **Re-check the OpenAI quotes on the live pages, in a browser, before the
> switch turns on.**

The owner's decision (2026-11-04): Google's clause is fine for the bases he makes himself (a batch job on his machine;
no visitor uses Gemini). This note is about **model choice for remixers**, where a signed-in person presses Generate on
the website and the picture is made by a closed model (`IMAGES.designs.modelChoice`, off; Gemini also behind
`CLOSED_IMAGES.geminiAgeReadingAccepted`, false).


> **Decided by the owner, 2026-11-04.** Gemini is allowed for remixers (`CLOSED_IMAGES.geminiAgeReadingAccepted: true`).
> His reason: the Terms already require 18+ to sign in (§4), and only signed-in people can generate. With it, one 18+
> confirmation, on the same screen as the first closed-model notice and remembered on the device only (no server
> storage, no migration; Privacy §3 lists it). That is a reminder of the Terms' rule at the point of use, not a
> verification: the server can't check it. Whether it meets OpenAI's minors clause (§3.3(c) below) is left to the
> owner's reading. Options (b) and (c) below, and the stored confirmation, are not built. See
> `remix-model-choice-draft.md` v2.

## 1. Our Terms, "Who can use it" (§4), word for word

`src/lib/legal.ts` on `origin/main` and on this branch (the same words), live at <https://snowmoon.party/terms>, read
2026-11-03:

> **4. Who can use it.** Anyone can read and listen without an account. To sign in you must be at least 18 years old.
> Your account here is a Farcaster account or a wallet address. You can link a wallet to your Farcaster account; while
> it is linked, signing in with the wallet is signing in as that account. Other ways to sign in may come later; these
> Terms will list each one when it does.

Related: Privacy §8, word for word (same file, <https://snowmoon.party/privacy>):

> **8. Children.** The Service is not directed to children under 13. You must be at least 18 to sign in; we do not
> verify age.

## 2. Google

How it reaches us: model choice calls Gemini 3.1 Flash Image through the Vercel AI Gateway, pinned to the `vertex`
provider (Google Vertex AI). Vercel's Notices and License Information §6 (last updated 2026-02-26,
<https://vercel.com/legal/notices-and-license-information>) names Google Cloud's Service Specific Terms for Vertex AI,
so those apply.

**Google Cloud Service Specific Terms, §20 "Generative AI Services", subsection (d)**
(<https://cloud.google.com/terms/service-terms>, read 2026-11-03; the page's latest listed change is "October 30,
2026"):

> d. Age Restrictions. Customer will not, and will not allow End Users to, use a Generative AI Service as part of a
> website, Customer Application, or other online service that is directed towards or is likely to be accessed by
> individuals under the age of 18.

The same section, (f) and (g):

> f. Suspected Violations. Google may immediately suspend or terminate Customer's use of a Generative AI Service based
> on any suspected violation of Section 17(b) or subsection (d) above.

> g. Restrictions. The restrictions contained in subsections (d) and (e) above are deemed to be "Restrictions" or "Use
> Restrictions" under the applicable Agreement.

The only other age term on that page, in another section, is about Custom Voice and Avatar, which we don't use:

> Customer will not use any image, audio recording, voice sample, or other data depicting or derived from any
> individual(s) under the age of 18 with the Custom Voice and Avatar Functionality

**Gemini API Additional Terms of Service**, "Age Requirements" (effective March 23, 2026;
<https://ai.google.dev/gemini-api/terms>, which now redirects to <https://aistudio.google.com/docs/terms>, read
2026-11-03). These apply only if the gateway routes to the `google` provider (the Gemini API), not `vertex`:

> You must be 18 years of age or older to use the APIs. You also will not use the Services as part of a website,
> application, or other service (collectively, "API Clients") that is directed towards or is likely to be accessed by
> individuals under the age of 18.

The next section of those terms adds:

> Use of Google AI Studio and Gemini API is for developers building with Google AI models for professional or business
> purposes, not for consumer use.

**What it means for us.** §20(d) is about the **whole website** the service is part of, not only the screen where
Gemini runs: "as part of a website … that is … likely to be accessed by individuals under the age of 18". Today:

- reading and listening are open to anyone with no account and no age (Terms §4);
- Privacy §8 says only "not directed to children under 13", which concedes 13- to 17-year-olds may read;
- the book is a general-audience novel, and the site is promoted on Farcaster, Bluesky and Lens.

So an 18+ rule for signing in alone probably doesn't meet "likely to be accessed by" under-18s. The bases are
different: the owner's batch job uses Gemini outside the website (the owner's reading, accepted 2026-11-04), and the
site shows only the finished pictures.

## 3. OpenAI

How it reaches us: model choice calls GPT Image 2.5 Sunburst through the gateway, pinned to `openai`, on Vercel's own
OpenAI account (the gateway reports `"credentialType": "system"`). Vercel's Notices §6 names OpenAI's Terms of Use for
OpenAI. Vercel itself is under OpenAI's Services Agreement, whose restrictions reach Vercel's customers' end users (us
and our users).

**OpenAI Services Agreement, §3.3 "Restrictions", (c)** (ONLINE v.010126,
<https://cdn.openai.com/osa/openai-services-agreement.pdf>, OpenAI's own CDN, read 2026-11-03):

> Restrictions. Customer will not, and will not permit End Users to: … (c) allow minors to use OpenAI Services without
> consent from their parent or guardian;

The same agreement's limitation of liability excepts "CUSTOMER'S BREACH OF SECTION 3.3 (RESTRICTIONS)", so this
restriction carries uncapped liability for the customer.

**OpenAI Terms of Use, "Registration and access"** (effective December 11, 2024; <https://openai.com/policies/terms-of-use>
refused the fetch; text from the dated copy at
<https://open.windriver.com/info/uni-license-list/licenses/openai-tou-20241211.html>, read 2026-11-03):

> Minimum age. You must be at least 13 years old or the minimum age required in your country to consent to use the
> Services. If you are under 18 you must have your parent or legal guardian's permission to use the Services.

**OpenAI Usage Policies, "Keep minors safe"** (effective October 29, 2025; <https://openai.com/policies/usage-policies>
refused the fetch; text from the copy printed 2025-11-07 at
<https://docs.databricks.com/aws/en/assets/files/usage-policies-openai-923e062e72487537e2a8df04bcec7f6d.pdf>, read
2026-11-03):

> Keep minors safe. Children and teens deserve special protection. Our services are designed to prevent harm and
> support their well-being, and must never be used to exploit, endanger, or sexualize anyone under 18 years old. We
> report apparent child sexual abuse material and child endangerment to the National Center for Missing and Exploited
> Children. We prohibit use of our services for: child sexual abuse material (CSAM), whether or not any portion is AI
> generated grooming of minors exposing minors to age-inappropriate content, such as graphic self-harm, sexual, or
> violent content promoting unhealthy dieting or exercise behavior to minors shaming or otherwise stigmatizing the body
> type or appearance of minors dangerous challenges for minors underaged sexual or violent roleplay underaged access to
> age-restricted goods or activities

(The list's items run together in the PDF's text, as shown.)

**What it means for us.** OpenAI doesn't forbid a site that minors may read. It forbids **letting a minor use** its
services without a parent's or guardian's consent. Only signed-in people can press Generate, and Terms §4 says
signing in needs 18+. So the rule is met on paper. The gap is "we do not verify age" (Privacy §8): nobody has said they
are 18 at the moment they use a closed model. The Usage Policies' minors list is about content, and the site's own
rules and checker already refuse it.

## 4. Side by side

| | Our Terms §4 / Privacy §8 | Google (Vertex §20(d); Gemini API) | OpenAI (OSA §3.3(c); ToU; Usage Policies) |
| --- | --- | --- | --- |
| Who may **use** the model | Signed-in people, 18+, not verified | End users 18+ (Gemini API: "You must be 18") | Minors only with a parent's or guardian's consent |
| The **site** around it | Reading open to anyone; "not directed to children under 13" | Must not be "directed towards or … likely to be accessed by" under-18s | No rule about the site |
| Verification | "we do not verify age" | Not required in words; "likely to be accessed" is about the audience | Not required in words |
| Consequence | — | Suspension "based on any suspected violation" (§20(f)) | A breach of §3.3, outside the liability cap |
| Fits today? | — | **No, for remixers' Generate**; yes for the owner's batch bases (owner, 2026-11-04) | **Yes on paper**; stronger with an 18+ confirmation |

## 5. What has to change before model choice opens

**For GPT Image 2.5 Sunburst (OpenAI) only**, the smallest set that makes the "18+" real at the point of use:

1. **Terms §4:** add one sentence: "Making pictures with a closed model (the Service names each one) is for people
   18 or older; by choosing one you confirm you are." The rest of §4 stays.
2. **Sign-in:** no change to the sign-in itself. Farcaster and wallet sign-ins carry no age, and adding a date of
   birth would collect more than we need.
3. **The model-choice switch:** the first time a person picks a closed model, a one-time confirmation: "Closed models
   are for people 18 or older. I'm 18 or older." [Confirm]. It is stored with the account (FID or wallet account, the
   date, and nothing else), and the picker refuses a closed model without it, on the server, not only in the page. A
   `NEXT_` migration adds the column, and a P6 check ties the switch to the Terms sentence and the Privacy line.
4. **Privacy §4:** "If you confirm you're 18 or older to use a closed model, we keep that you confirmed and when." §8
   adds: "Closed models ask you to confirm you are 18 or older."
5. **The reading pages:** no change for OpenAI.

**For Gemini 3.1 Flash Image (Google) as well**, the items above are not enough, because §20(d) is about the website.
There are three ways to go, for the owner to choose:

- **(a) Keep Gemini out of remixers' choice** (`geminiAgeReadingAccepted` stays false). Gemini stays for the owner's
  batch bases only, as accepted. Nothing else changes. **Recommended:** it's the only option that fits §20(d) without
  changing who can read the book.
- **(b) Make the whole site 18+.** Terms §4 becomes "You must be at least 18 years old to use the Service, including
  reading and listening." Privacy §8 becomes "The Service is for adults (18 and over); it is not directed to anyone
  under 18." The reading pages get a first-visit line (the intro card) saying the site is for adults. An age gate
  would be a stronger signal, and nothing is verified either way. This changes who the book's adaptation is for. It
  also affects the Farcaster mini app, the Minpentai snap (whose casts reach anyone) and the posts that promote the
  site. It is a big change for one model.
- **(c) A separate 18+ service for making pictures**, on its own address, with Gemini only there. It is still arguably
  "part of" the same online service, so it's weaker than (b) and costs more to build. Not recommended.

Whichever is chosen:

- **Pin Gemini to `vertex` and never fall back to `google`** (the Gemini API). The bases' ledger lists `google` as a
  fallback. The Gemini API terms add "not for consumer use" and "You must be 18 … to use the APIs", and remixers are
  consumers. The gateway call should allow `only: ['vertex']`, with a test that fails on any other provider.
- **Re-read OpenAI's live pages** (Terms of Use, Usage Policies, and the Sharing and Publication Policy, which hasn't
  been read) in a browser, and update the quotes and dates here.
- The model-choice legal draft (`docs/legal/remix-model-choice-draft.md`) gets the Terms §4 sentence and the Privacy
  lines above, in the same release as the switch (legal texts describe today).

## Decisions owed

1. Gemini for remixers: (a) keep it out (recommended), (b) a whole-site 18+ rule, or (c) a separate service.
2. The 18+ confirmation for closed models: yes or no, and its wording.
3. Whether the confirmation is stored (needs a `NEXT_` migration and Privacy §4) or asked every time (no storage, more
   taps).
