# Closed-model bases: Privacy, Terms and About lines (DRAFT, not reread)

Drafted by the coding agent (Claude, a closed model by Anthropic), on branch `closed-model-bases`, for the owner's
decision of 2026-11-04: several models may make the remix challenge's bases, styles and references, closed ones included,
labelled as closed. **Not reread by the owner. Not in `src/lib/legal.ts`** (this branch doesn't touch it). The findings
behind these words, with every clause quoted: [`docs/proposals/closed-model-bases.md`](../proposals/closed-model-bases.md).
Not legal advice.

Legal texts describe today (owner, 2026-10-18): these lines go into `src/lib/legal.ts` in the same merge that turns
`CHALLENGE.closedBasesAllowed` on (branch `challenge-three-bases`), never ahead of it.

"Before" is main's `src/lib/legal.ts` at `26bf405` (2026-11-03).

## What the code does, which the words must match

- A batch script on the owner's machine (`docs/starting-sheet-drafts/bases/make-bases.mts`) calls the Vercel AI Gateway
  with the team's gateway key. It sends the model, the prompt, one reference picture (the character's own sheet) and the
  picture's settings (size, quality or aspect ratio, format), and the gateway option `disallowPromptTraining`. No user
  field, Farcaster ID, wallet or site request is in it.
- **Since 2026-11-04** every new closed call goes through `scripts/lib/batch-model.ts` (branch `challenge-styles`):
  `zeroDataRetention: true`, `disallowPromptTraining: true`, the provider pinned (Google to `vertex`, OpenAI to
  `openai`), and refused before sending unless the gateway lists that provider with both. GPT Image 2.5 Sunburst is
  refused (no ZDR endpoint on the gateway, read 2026-11-03).
- The gateway calls OpenAI (GPT Image 2.5 Sunburst) or Google (Gemini 3.1 Flash Image, served by Vertex AI) from its
  own accounts: the ledger reports `"credentialType": "system"` on every call.
- Whether Vercel adds anything of its own when it calls them (an identifier of our team, request metadata) is not
  documented in the terms or docs read; **not checked**. Vercel's own ZDR page says the gateway keeps no prompts or
  outputs.
- Visitors' browsers never contact OpenAI or Google: the published pictures are served from our media host.
- On publish, the bases become ordinary project pictures with their recipe; no visitor action reaches either provider.

## Privacy §7 (Outside services and what they receive): one new list item, after the fal.ai item

**Before:** (no item; §7 names neither OpenAI nor Google.)

**After, variant B (recommended; owner, 2026-11-04: every new closed call sets zero data retention):**

> Google, through Vercel AI Gateway, receives the prompt and the reference pictures for some of the pictures the
> project makes itself: the remix challenge's bases, styles and references. It receives nothing about you, and your
> browser never contacts it. We send the gateway only the prompt, the pictures and the picture's settings, and it passes
> them on from its own account with Google, on Google's Vertex AI, set so that Google may not train on them and, under
> the gateway's zero-data-retention terms, keeps no copy. Each picture's recipe names the model and its maker.

Why B, and why Google alone (as of 2026-11-04):
- Every new closed call goes through `scripts/lib/batch-model.ts` (branch `challenge-styles`) with
  `zeroDataRetention: true`, `disallowPromptTraining: true` and `only: ['vertex']`; the gateway's answer to the style
  test's Gemini call says `"enabledZeroDataRetention": true, "enabledDisallowPromptTraining": true` and "Provider set
  restricted to: vertex".
- **OpenAI can't be called under that rule:** the gateway lists GPT Image 2.5 Sunburst only on OpenAI, with
  `has_zdr: false`, so the batch path refuses it and sends nothing. No OpenAI picture can be a new base, style or
  reference, so the line doesn't name OpenAI.
- B is accurate only if every closed picture the challenge publishes was made through that path. **The 2026-11-03
  closed drafts (bases.md: six GPT, six Gemini) were made without ZDR and must not be published** under this line.
- **P6s** (scripts/check-principles.ts on main) fails while Privacy doesn't name *OpenAI and Google*. With this line it
  would need to require only Google, or the makers of the published closed pictures. That is a check change for the
  owner to approve, in the same merge.

**Variant A (only if an OpenAI picture, made without ZDR, is ever published):**

> OpenAI and Google, through Vercel AI Gateway, receive the prompt and the reference pictures for some of the pictures
> the project makes itself: the remix challenge's bases, styles and references. They receive nothing about you, and
> your browser never contacts them. We send the gateway only the prompt, the pictures and the picture's settings, and it
> passes them on from its own accounts with OpenAI and Google, set so that neither may train on them. Each picture's
> recipe names the model and its maker.

**Optional, the owner's choice:** Fifteen Days version 2's pictures were made by GPT Image 2.5 Sunburst through the
gateway (without ZDR) and are already live, and §7 doesn't say so today. To cover them, add a sentence after B's first:
"OpenAI, through the same gateway, received the prompts and reference pictures for the pictures of Fifteen Days' second
version, set so that it may not train on them."

Notes:
- **Decision recorded (owner, 2026-11-04): Google's under-18 clause is fine for bases he makes** (Cloud Service Specific
  Terms §20(d); the proposal's Google section). Gemini is used only in a batch job the owner runs, never by a visitor, so
  these lines need no age wording. This is not the reread: the lines above still need the owner's reread before any
  closed base is published and `CHALLENGE.closedBasesAllowed` turns on.
- **Styles (owner, 2026-11-04):** the lines now say "the remix challenge's bases, styles and references" (a closed
  style's samples are neither bases nor references). In code, `closedStyleRefusal` gates closed styles like bases.
- "the project makes itself" matches Terms §7 ("the images the project made itself, its starting points").
- This item is about the project's pictures, not users' data. It is in §7 because P6g to P6j compare the outside
  services named across Privacy, About, the notice and consent, and because readers should be able to see who has seen
  which inputs.
- If a later feature lets a *person* make pictures with a closed model, it needs its own lines (§4, §7 and the consent
  screen) in its own release; this item does not cover that.

## Terms §8 (AI-made material): two sentences added at the end

**Before:**

> The narration, many pictures (every frame made in Remix among them) and the assistant's answers are produced by AI
> models and are labelled as such. They can be wrong. The assistant's commentary is not the book and is not advice of
> any kind.

**After:**

> The narration, many pictures (every frame made in Remix among them) and the assistant's answers are produced by AI
> models and are labelled as such. They can be wrong. The assistant's commentary is not the book and is not advice of
> any kind. Some of the project's own pictures, among them some of the remix challenge's bases, styles and references,
> are made with a closed model by Google, named with its maker on each picture's recipe. Its maker's terms let us
> publish them and bind us, not you: we offer these pictures under the licence in section 3, as far as anyone holds
> rights in them, since a picture made wholly by a model may have no copyright at all.

(With variant A, "a closed model by Google, named with its maker" reads "closed models by OpenAI and Google, named with
their maker". With the optional Fifteen Days sentence, add after "references": "and, by OpenAI, the pictures of
Fifteen Days' second version".) With variant A, "Its maker's terms" reads "Their makers' terms".

**Why §8, not §3 or 6e:**

- **§8** is where the Terms say what AI made and how it is labelled; naming which models made which pictures belongs
  with it, and the licence sentence points back to §3 rather than changing it.
- **§3** says "Nothing in these Terms limits the rights the licence gives you." Writing "the site's licence for them is
  subject to the providers' terms" (the brief's words) into §3 would read as a limit, and GPL-3.0 §10 forbids adding
  restrictions. The finding is that the providers' terms don't restrict licensing or redistribution at all: their
  restrictions (no competing models, no passing machine work off as human) bind the project, not its licensees. So the
  honest sentence is "bind us, not you". If the owner still wants "subject to the providers' terms", it should go in
  §8 as "Our own use of these models is subject to their makers' terms", which is true and limits no one else.
- **6e** is about the challenge's run (dates, entries, record). The bases outlive the challenge as starting points, so
  their provenance shouldn't sit in a section that may later be removed.

**Only if condition 6 of the proposal holds** (the original files with their C2PA manifests are published), add: "Their
original files keep their makers' content credentials, which say they are AI-made."

## About, "Where it runs": one sentence added

P6h requires About to name the same services as Privacy. Today `scripts/check-principles.ts`' `SERVICES` vocabulary
has neither OpenAI nor Google, so P6h would pass without this line; the proposal asks for both names to be added to the
vocabulary, after which this line is required.

**Before (first sentences of the paragraph):**

> Vercel hosts the site and sees your IP address and browser details, as any web host does. Cloudflare stores and
> serves the pictures and audio. Supabase holds the database. …

**After (a sentence after "Supabase holds the database."):**

> … Supabase holds the database. Some of the project's own pictures (the remix challenge's bases, styles and
> references) are made with a closed model by Google, through Vercel AI Gateway: Google receives the prompt and the
> reference pictures, nothing about you. …

(With variant A: "closed models by OpenAI and Google … they receive".)

The assistant's notice (P6i) and the image consent screen (P6j) don't change: neither OpenAI nor Google receives an
assistant question, or anything at Generate.
