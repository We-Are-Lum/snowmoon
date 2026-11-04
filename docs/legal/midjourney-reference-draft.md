# Pictures made with Midjourney: Terms §8 and About lines (DRAFT, redrafted 2026-11-04, not reread)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-04, on branch `closed-model-bases`, for the
owner's direction of 2026-11-04: his own picture of Zei and Bai, made outside the Service with Midjourney, is the
reference for the "Animated series" direction (docs/starting-sheet-drafts/zei-directions.md, branch `challenge-styles`).
**Not reread by the owner. Not in `src/lib/legal.ts`.** These lines go in only in the release that first publishes a
picture made from it, never ahead of it. Not legal advice.

## What happens, which the words must match

- The owner made the picture himself, on Midjourney, on a paid plan (owner, 2026-11-04). Lum LLC's revenue is under $1M
  a year (owner, 2026-11-04), so Midjourney's Pro-or-Mega rule for larger companies does not apply.
- He brought it in: the site's label is "Brought in". Crops of it were sent, as reference pictures, to OpenAI and Google
  through Vercel AI Gateway, already covered by the Privacy §7 item on OpenAI and Google.
- **Nothing is sent to Midjourney** by the site or its scripts, and no visitor's browser contacts it. So **no Privacy
  line** is needed.
- Midjourney's terms, read from a dated copy (the live page refused the fetch; re-check before publishing): "You own all
  Assets You create with the Services to the fullest extent possible under applicable law." Its restrictions bind the
  owner as its user, not people who receive the picture under GPL-3.0. Findings, quoted: zei-directions.md, "Midjourney's
  terms".

## Redraft (owner, 2026-11-04, after the restart: 5.1, 5.2)

The plan changed: more than one picture the owner made with Midjourney may be brought in, so "one reference picture"
is no longer true, and the "Brought in" label detail is dropped from the legal text (it stays on the recipe). Terms §8
and About each get one sentence covering OpenAI, Google and Midjourney (owner's choice 8), so these are not separate
sentences any more.

**5.1, Terms §8. Before** (draft, not reread): "Some of these pictures were made from a reference the owner made outside
the Service with Midjourney, a closed model by Midjourney; its recipe says so and labels it "Brought in". The owner owns
that picture under Midjourney's terms and offers it, and what is made from it, under the licence in section 3, as far as
anyone holds rights in them."

**After** (T2, replacing the whole closed-model sentence the day the first such picture is published):

> Some of the project's own pictures are made with closed models by OpenAI and Google, and some the owner made with Midjourney outside the Service are brought in with the recipe the owner reports; each recipe names the model and its maker, and these pictures, and what is made from them, are offered under the licence in section 3, as far as anyone holds rights in them; their makers' terms bind us, not you.

**5.2, About. Before** (draft, not reread): "One reference picture was made by the owner outside the site with
Midjourney and brought in; the site sends nothing to Midjourney."

**After** (A2, replacing About's whole closed-model sentence the same day):

> OpenAI and Google receive, through Vercel AI Gateway, the prompts and pictures for some of the project's own pictures, and nothing about you, and neither may train on them (OpenAI may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law; Google keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days); the site sends nothing to Midjourney, which the owner used outside the site for some pictures.

**5.3, Midjourney's live terms:** the fetch tool was refused (HTTP 403) at
<https://docs.midjourney.com/hc/en-us/articles/32083055291277-Terms-of-Service> on 2026-11-04, before the restart
(also <https://www.midjourney.com/terms-of-service> and <https://docs.midjourney.com/docs/terms-of-service>) and again
after it. The quotes above are still from the dated copy. Nothing made from these pictures is published until the owner
reads the live page in a browser and it matches.

## Notes

- P6g to P6j compare the services named across Privacy, About, the notice and consent. If `scripts/check-principles.ts`'
  `SERVICES` vocabulary gains "Midjourney", P6h would require Privacy to name it too; since nothing is sent to it, the
  check should treat it as a maker named for provenance, not a service that receives anything. A check change for the
  owner to approve.
- If the owner confirms the uploaded file is an upscale or another export (it differs from the recipe card's saved copy),
  the recipe should say which.
