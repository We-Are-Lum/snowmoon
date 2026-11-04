# Closed-model bases: Privacy, Terms and About lines (redraft v2, 2026-11-04, DRAFT, not reread)

> **Redraft v2 (2026-11-04, after the 11:20 restart), not reread.** The owner's decisions on the reread pack (the
> coordinator's review, approved by the owner) reopen all three lines reread earlier today: **6.4** one OpenAI
> description everywhere, in the owner's words; **6.3** Google's in-memory cache; **8** one sentence each in Terms §8
> and About; and the standing rule: the shortest true sentence, no implementation details (gateway accounts, internal
> labels, thresholds) in legal texts. The new words are in `src/lib/legal.ts` and `src/app/about/page.tsx` on this
> branch. `LEGAL.ownerReread` is **not** changed, so P6k and P6l fail until the owner rereads them. Not merged.
> Drafted by the coding agent (Claude, a closed model by Anthropic).

## Redraft v2: before and after

**Privacy §7, the bases item.** The 6.4 sentence is the owner's own wording, but it replaces this item's reread OpenAI
sentence, so the item's reread reopens there; 6.3 adds Google's cache; and "We send the gateway only … from its own
accounts with OpenAI and Google …" goes (an implementation detail; the recipe keeps it).

Before (reread 2026-11-04):

> OpenAI and Google, through Vercel AI Gateway, receive the prompt and the reference pictures for some of the pictures the project makes itself: the remix challenge's bases, styles and references. They receive nothing about you, and your browser never contacts them. We send the gateway only the prompt, the pictures and the picture's settings, and it passes them on from its own accounts with OpenAI and Google, set so that neither may train on them. Google, on its Vertex AI, keeps no copy. OpenAI may keep our prompts, reference pictures and the pictures it makes for up to 30 days to watch for abuse, and longer only where the law requires it or to protect its services or others from harm. Each picture's recipe names the model and its maker.

After:

> OpenAI and Google receive, through Vercel AI Gateway, the prompt and the reference pictures for some of the pictures the project makes itself, such as the remix challenge's bases, styles and references. They receive nothing about you, and may not train on them. OpenAI may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law. Google keeps no copy, except in memory for up to 24 hours. Each picture's recipe names the model and its maker.

**Terms §8.** Before (reread 2026-11-04), two sentences after main's last:

> Some of the project's own pictures, among them some of the remix challenge's bases, styles and references, are made with closed models by OpenAI and Google, named with their maker on each picture's recipe. Their makers' terms let us publish them and bind us, not you: we offer these pictures under the licence in section 3, as far as anyone holds rights in them, since a picture made wholly by a model may have no copyright at all.

After (T1, this branch alone):

> Some of the project's own pictures are made with closed models by OpenAI and Google, named with their maker on each picture's recipe; they are offered under the licence in section 3, as far as anyone holds rights in them, and their makers' terms bind us, not you.

**About, "Where it runs".** Before (reread 2026-11-04):

> Some of the project's own pictures (the remix challenge's bases, styles and references) are made with closed models by OpenAI and Google, through Vercel AI Gateway: they receive the prompt and the reference pictures, nothing about you.

After (A1, this branch alone):

> OpenAI and Google receive, through Vercel AI Gateway, the prompts and pictures for some of the project's own pictures, and nothing about you, and neither may train on them (OpenAI may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law; Google keeps no copy, except in memory for up to 24 hours).

**Which release carries which version.** T1 and A1 are true with this branch alone. The day the first picture the owner
made with Midjourney is published, T2 and A2 replace them; when model choice for remixers is on, T3 and A3. All are in
`docs/legal/remix-model-choice-draft.md` on `remix-model-choice` ("Terms §8 and About: one sentence each, by release"),
and T2 and A2 in `midjourney-reference-draft.md` here. A2 and A3 name Midjourney, so they need the 5.4 check change
(`PROVENANCE_ONLY`, on `remix-model-choice`) in the same release.

## The reread version (2026-11-04, kept for the record)


> **Reread (owner, 2026-11-04): Privacy §7, Terms §8 and About approved as drafted** (at 54b895e2). They are now in
> `src/lib/legal.ts` and `src/app/about/page.tsx` on this branch, with `LEGAL.ownerReread` updated. Not merged;
> `CHALLENGE.closedBasesAllowed` stays false.

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
  `disallowPromptTraining: true` and the provider pinned (Google to `vertex`, OpenAI to `openai`) on every call;
  `zeroDataRetention: true` required for Google on Vertex (owner, 2026-11-04, second decision of the day). OpenAI is
  called without ZDR (the gateway lists no ZDR endpoint for GPT Image 2.5 Sunburst, read 2026-11-03), only after the
  gateway's endpoint list shows no training, and each picture's recipe records what OpenAI keeps (quoted below).
- The gateway calls OpenAI (GPT Image 2.5 Sunburst) or Google (Gemini 3.1 Flash Image, served by Vertex AI) from its
  own accounts: the ledger reports `"credentialType": "system"` on every call.
- Whether Vercel adds anything of its own when it calls them (an identifier of our team, request metadata) is not
  documented in the terms or docs read; **not checked**. Vercel's own ZDR page says the gateway keeps no prompts or
  outputs.
- Visitors' browsers never contact OpenAI or Google: the published pictures are served from our media host.
- On publish, the bases become ordinary project pictures with their recipe; no visitor action reaches either provider.

## Privacy §7 (Outside services and what they receive): one new list item, after the fal.ai item

**Before:** (no item; §7 names neither OpenAI nor Google.)

**After (recommended; owner, 2026-11-04: OpenAI allowed without zero retention, Google on Vertex with it):**

> OpenAI and Google, through Vercel AI Gateway, receive the prompt and the reference pictures for some of the pictures
> the project makes itself: the remix challenge's bases, styles and references. They receive nothing about you, and
> your browser never contacts them. We send the gateway only the prompt, the pictures and the picture's settings, and it
> passes them on from its own accounts with OpenAI and Google, set so that neither may train on them. Google, on its
> Vertex AI, keeps no copy. OpenAI may keep our prompts, reference pictures and the pictures it makes for up to 30 days
> to watch for abuse, and longer only where the law requires it or to protect its services or others from harm. Each
> picture's recipe names the model and its maker.

**The source for "up to 30 days", verified:** OpenAI, "Your data" (API data controls),
<https://developers.openai.com/api/docs/guides/your-data> (platform.openai.com/docs/guides/your-data redirects there),
read live on **2026-11-03** (the machine's date); the page shows no last-updated date:

> "By default, abuse monitoring logs are generated for all API feature usage and retained for up to 30 days, unless
> longer retention is required by law, or is reasonably necessary to protect our services or any third party from
> harm."

Its endpoint table gives `/v1/images/edits` (the endpoint the GPT bases use): abuse monitoring retention "30 days",
application state retention "None". And: "As of March 1, 2023, data sent to the OpenAI API is not used to train or
improve OpenAI models (unless you explicitly opt in to share data with us)."

**Flag: the figure is "up to 30 days" with two exceptions**, longer retention required by law, or reasonably necessary
to protect OpenAI's services or third parties. The drafted line says so ("longer only where…") rather than a flat
30 days. The same page lists `gpt-image-2.5-sunburst` as Zero Data Retention compatible for OpenAI customers with a ZDR
agreement; through the gateway it has none (`has_zdr: false`), so the default above applies.

**"Google, on its Vertex AI, keeps no copy"** rests on the gateway's ZDR terms for Vertex and on each call's answer
(`"enabledZeroDataRetention": true`, provider restricted to `vertex`). It is true only of pictures made through
`batch-model.ts`. **The six Gemini drafts of 2026-11-03 (bases.md) were made without ZDR:** if one is published, this
sentence must change, and its recipe must first record what was kept.

**Optional, the owner's choice:** Fifteen Days version 2's pictures were made by GPT Image 2.5 Sunburst through the
gateway (without ZDR) and are already live, and §7 doesn't say so today. To cover them, add a sentence after the first:
"OpenAI, through the same gateway, received the prompts and reference pictures for the pictures of Fifteen Days' second
version, set so that it may not train on them."
(Not checked: whether Fifteen Days' GPT calls set the no-training option; read their recipes before using this.)

Notes:
- **Google's under-18 clause: decided (owner, 2026-11-04).** Gemini is allowed, for bases and for remixers. The owner's
  reason: the Terms already require people to be 18 or older to sign in (Terms §4: "To sign in you must be at least 18
  years old."), and only signed-in people can generate. These lines need no age wording. A remixer-facing Gemini option
  is not built; when it is, it needs its own lines (§4, §7 and the consent screen) in its own release. This is not the
  reread: the lines above still need the owner's reread before any closed base or style is published and
  `CHALLENGE.closedBasesAllowed` turns on.
- **P6s** (scripts/check-principles.ts on main) requires Privacy to name OpenAI and Google: these lines name both, so it
  passes unchanged once they are in `src/lib/legal.ts`.
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
> are made with closed models by OpenAI and Google, named with their maker on each picture's recipe. Their makers' terms let us
> publish them and bind us, not you: we offer these pictures under the licence in section 3, as far as anyone holds
> rights in them, since a picture made wholly by a model may have no copyright at all.

(With the optional Fifteen Days sentence, add after "references": "and the pictures of Fifteen Days' second version".)

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
> references) are made with closed models by OpenAI and Google, through Vercel AI Gateway: they receive the prompt and
> the reference pictures, nothing about you. …

The assistant's notice (P6i) and the image consent screen (P6j) don't change: neither OpenAI nor Google receives an
assistant question, or anything at Generate.
