# Principles

Eight principles this edition holds itself to. Each one is **our inference from
public writing**, mostly the author's. None is a statement by the author about
this project, and none implies the author endorses it. The project is
independent and not affiliated with him.

For each: the statement, the source it is inferred from, what it means in this
app, and how it is checked. Automated checks run with
`npm run check:principles` (`scripts/check-principles.ts`); every check is
proven to fail on a planted violation each time it runs. Review questions are
for a person to answer when the matching code or content changes.

Status is as of Oct 5, 2026, after the owner's rulings on the first audit
(the seven decisions and the rulings that followed).

---

## 1. Every published generated asset has a public recipe, including its exact prompt. People know their words will be public before they write them.

**Source.** The book's index page: anyone adapting it is "required to
open-source the pipeline (AI prompts, scripts, task-specific harness, etc)".
<https://vitalik.eth.limo/snowmoon/>. *Inference, not endorsement.*

**In this app.** Every image, audio file and saved card that a model or script
produced has a committed recipe: model and revision, the exact prompt or text
sent, seed and settings, and the sha256 of the output. Recipes live in
`content/snowmoon/recipes/` and in `studio.recipes`. Prompts given to the
coding agent and its helpers are in `docs/prompts/`.

**Checked by.**
- `P1a`: every published image's render hash is in a committed image recipe,
  and every lettered image has a matching record in `lettering.json`.
- `P1b`: every published narration file (each block and each chapter) matches
  its committed narration recipe.
- `P1c`: in the database, every version of a published element has a recipe
  (reads the live database when `STUDIO_DATABASE_URL` is set).
- `P1d`: a signed-out visitor reaches the exact prompt of every published
  image and narration: the chapter page links the recipe (and the lettering
  record for lettered images), and the file at that link, fetched anonymously
  from the public repository, holds the prompt or spoken text for that very
  output.
- `P1e`: through the public database API, with only the public key, the
  spoken text of the house narration is readable.
- `P1f`: every text box whose contents may be published is a
  `PublishedTextField`, which shows the publication line under it.
- `npm run test:db`: after 0005, a recipe is public only if it made a
  published element version or a segment of a narration that is not hidden;
  drafts, hidden work and abandoned attempts stay private.
- Review: does any new output path publish a file without writing its recipe
  first? Does any new way of storing a person's own words skip the consent
  screen or the preview?

**Prompts are public; people's drafts are not.** Only prompts for published
elements are public. The prompts of people's drafts and abandoned attempts in
the app stay private. The maintainer's own pipeline, including rejected
attempts, stays fully public in the repository. A proposal for the render
queue is public: submitting one is publishing it, so it goes through the
consent screen and the preview. (Owner decisions, Oct 5, 2026.)

**People know their words will be public.** Before a person's first
contribution that stores their own words (a prompt or a line), a blocking
screen says: "Public, permanent, GPL-3.0, shown with your Farcaster name."
Their agreement is recorded in `studio.contributor_consents` (kind
`own_words`) with who, when, and the sha256 of the exact wording
(`config/consent.json`). The same line appears under every text box whose
contents will be published, and a preview is shown before publishing
(`src/components/publish-words.tsx`). Hiding and erasure follow
`docs/removal.md` (approved as policy); "Hide this" is built with the first
form that stores a person's words, and only then does the consent wording
promise it.

**Status.** `P1d` fails on production until this change is deployed: the
narration had no recipe link on the page, and lettered images did not link
their lettering record. Every prompt itself was already in the public
repository. Found while testing 0004: under 0001's recipe policy, a draft's
prompt was public, because the policy checked for versions as the public
role, which cannot see draft versions; 0005 replaced it (applied Oct 5,
2026). No screen stores a
person's own words yet, so the consent screen and the preview are built but
not yet used.

Every committed recipe now records `assist`: which inputs a
model drafted (see 3). The 4,237 narration recipes already in
`studio.recipes` predate `assist`, and that table is append-only, so 0005 adds
an append-only side table, `studio.recipe_assist`, public exactly when its
recipe is; `scripts/backfill-recipe-assist.ts` copied each record from the
committed recipe file (all 4,237, written Oct 5, 2026). New rows carry `assist`
directly.

## 2. AI use is declared on every element. The book's text is never altered, and nothing generated is presented as the author's. The words of a piece are the author's or a signed-in person's.

> The words of a piece (narration, dialogue, and any description spoken or
> shown as part of it) are the author's or a signed-in person's.
> Model-drafted working notes and accessibility text may be shown only when
> labelled as model-drafted, and never inside the piece itself.
> *(Owner's wording, Oct 5, 2026.)*

**Source.** The book's own "AI usage declaration": "All words were written
directly by me", with AI assistance listed separately.
<https://vitalik.eth.limo/snowmoon/>. *Inference, not endorsement.*

**In this app.** Wherever a generated image, voice or text appears, it says so
there, not only on an About page. The book's text is shown exactly as fetched.
Generated material never sits where a reader could take it for the author's
words.

Models build structure and images; people write every published word. In an
adaptation script (`docs/adaptation-format.md`), a model may draft the
structure (who, wants, cost, context, image descriptions) and collect verbatim
candidate lines from the book; narration and dialogue stay empty until a
person writes them, and each line records its author: `book c<ch>-b<idx>` or
`by FID <n> on <date>`. An adaptation page shows the piece first (book lines,
people's lines, images) and puts the structure under a collapsed "How this was
built", labelled model-drafted. Image alt text is model-drafted accessibility
text and begins "AI-generated image:".

**Recorded exception.** The house narration keeps 148 model-drafted spoken
descriptions of screens, figures and lyric cards. Each is preceded by a tone
and shown with the label "Model-drafted description, not the author's words".
They are listed in `content/snowmoon/read-aloud/exceptions.json`. The list
may only shrink: an entry is removed when a person rewrites that description
in 25 words or fewer and records `written_by { fid, date }`.

**Checked by.**
- `P2a`: every text block's sha256 is the hash of its content (the committed
  text is unaltered). `npm run check:ingest` additionally re-parses the fetched
  source and must reproduce the committed text byte for byte.
- `P2b`: on chapter pages, every seeded image's caption says "AI-generated";
  the player says the narration is synthetic; quote cards with an image label
  it as AI-generated.
- `P2c`: every narration and dialogue line in an adaptation script carries a
  human author tag. `npm run check:adaptations` also checks every book line
  verbatim against its block and narration at 25 words or fewer per beat.
- `P2d`: every spoken description is either written by a person (with FID and
  date, 25 words or fewer) or on the exception list, and the list has not
  grown past 148.
- Review: is anything generated (a caption, a summary, a spoken description of
  a screen) placed where it could be taken for the book's words?

**Status.** Pass, with the recorded exception above. Image captions say
"AI-generated image, a starting point"; image quote cards credit "IMAGE:
AI-GENERATED"; the player shows "AI-generated image" on its image.

## 3. The model allowlist records each model's license and whether its weights are open. Open-weight models are preferred. Report any closed model in use.

**Source.** The book's AI usage declaration names its tools, Kimi K3 and Qwen
3.8 Flash Next, both published as open weights by their makers
(<https://huggingface.co/moonshotai/Kimi-K3>,
<https://huggingface.co/Qwen/Qwen3.8-Flash-Next>);
<https://vitalik.eth.limo/snowmoon/>. Also "My techno-optimism", where the
author's fund "insisted that projects it funds must be open source"
(<https://vitalik.eth.limo/general/2023/11/27/techno_optimism.html>).
*Inference, not endorsement.* Note the limit: in "AI as the engine, humans as
the steering wheel" he treats "open models, closed models … all fair game" in
an open market
(<https://vitalik.eth.limo/general/2025/02/28/aihumans.html>). "Preferred" is
our choice, not his rule.

**In this app.** `config/models.json` lists every model allowed to make
published output, with its quoted license line and `open_weights`. A model
used anywhere in the pipeline is reported here if its weights are closed.

Hosted open-weight models may be listed too (`runs_on: hosted`): for a hosted render the recipe's model record is the endpoint, the date and the host's request id, because the host does not expose a weights revision. Local models stay preferred when they can do the job. (Owner decision, Oct 5, 2026: Z-Image Turbo and ERNIE-Image Turbo, Apache-2.0, on fal.ai.)

**Checked by.**
- `P3a`: every allowlisted model has `license_line` and a boolean
  `open_weights`.
- `P3b`: every model named in a recipe is on the allowlist, and every hosted
  endpoint used in an adaptation's recipe belongs to an allowlisted model;
  closed ones are printed as a note.
- Review: was any closed model used to make or shape published content, and is
  that reported below?

- `P3c`: every committed recipe file has an `assist` field: the drafting
  model and what it drafted, or null.
- `P3d`: on the live database, every recipe of the house narration (chapter 1
  sampled) has `assist` in the column or in `studio.recipe_assist`.

**Status.** Pass. Both generation models record `open_weights: true`, their
license and their weights. The closed drafting model is listed under
`drafting` in `config/models.json`.

**Closed models in use, reported.** The coding agent that built this repo and
its helper agents run on a closed model (Claude, by Anthropic). Besides code,
they drafted published text and inputs: the spoken descriptions of screens and
figures, the pronunciation word lists, the character and location profiles,
and the image prompts (their instructions are in
`docs/prompts/008a-agent-prompts.md`). No closed model generated any image or
audio.

## 4. No model output is published without a signed-in person's action.

**Source.** "AI as the engine, humans as the steering wheel"
(<https://vitalik.eth.limo/general/2025/02/28/aihumans.html>).
*Inference, not endorsement.*

**In this app.** A person signed in with Farcaster takes the action that
publishes anything a model made. Server routes that write require a verified
Quick Auth FID. Anything published outside the app records whose action
published it.

**Allowed, recorded path: the maintainer via script.** Seeded images and
narration may be published by the maintainer (FID 6786) running a publish
script. The published index then records `published_by` with the FID, role
`maintainer`, the action, the script, the date, and an evidence file in the
repo (the prompt log of the request that asked for it).

**Checked by.**
- `P4a`: every API route that writes (POST, PUT, PATCH, DELETE) calls `getFid`
  and refuses without it (401). `npm run check:shipped` also confirms on the
  live site that save and like refuse anonymous requests.
- `P4b`: the published image index and every narration index record
  `published_by` with an FID and the action; for the maintainer path, also
  the script, the date, and an evidence file that exists.
- Review: does any script or job publish model output without a recorded human
  action?

**Status.** Pass. The image and narration indexes record the maintainer path,
dated Oct 5, 2026, with `docs/prompts/008-narration-and-images.md` as
evidence. Saved cards need a signed-in FID.

## 5. Nothing is marked canon, official, or featured. Moderators can hide and nothing else.

**Source.** "AI as the engine, humans as the steering wheel": the mechanism
"avoids enshrining any single model … instead, you get an open market of many
different participants"
(<https://vitalik.eth.limo/general/2025/02/28/aihumans.html>).
*Inference, not endorsement.* Brief rule 3 ("Nothing is official") is the
project's own rule from the same idea.

**In this app.** Defaults come from scoring and are labelled as what they are
("most liked"). Seeded material is a "starting point". Moderators (FIDs in
`MODERATOR_FIDS`) can set content hidden; they cannot promote, order or label.

**Checked by.**
- `P5a`: no migration adds a canon/official/featured/pinned field, and no UI
  string uses those words except to deny them.
- `P5b`: code that checks moderator FIDs does not publish, order or sort.
- Review: does any default, badge or ordering reflect a person's choice rather
  than a stated rule?

**Status.** Pass. (No moderation feature exists yet.)

## 6. Production pages make no third-party requests. Individual ratings and likes are not publicly readable. Only totals are.

**Source.** "Why I support privacy": "Privacy is an important guarantor of
decentralization: whoever has the information has the power"
(<https://vitalik.eth.limo/general/2025/04/14/privacy.html>). The book's own
devices disclose only what is needed: chapter 1's watch "had learned that the
drone was not a threat - and nothing else"
(<https://vitalik.eth.limo/snowmoon/html/chapter-1.html>).
*Inference, not endorsement.*

**In this app.** Pages load only from this site and its media subdomain
(`*.snowmoon.party`): fonts are self-hosted, there is no analytics, no third
party script. Who rated or liked what is private; the public sees totals
only, through `studio.rating_totals`, `studio.like_totals` and
`studio.take_like_totals` (migration 0004).

**Checked by.**
- `P6a`: a real browser loads eight production pages (including a chapter,
  the cards gallery, an adaptation and a share page) and fails on any request
  outside the site's own domain.
- `P6b`: in the committed migrations, no public read policy remains on
  `ratings`, `likes`, `take_likes`, `picks` or `contributor_consents`
  (`npm run test:db` proves it on an in-memory database, totals views
  included).
- `P6c`: on the live database, through the public API with the public key,
  the individual tables refuse to answer and the totals views answer.
- `P6d`: the Vercel project holds no `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET` or `POSTGRES_*` variable (read by name through the
  signed-in Vercel CLI; values are never read). The app reaches the database
  only as `studio_writer`.
- Review: does a new page, embed or script reach another domain? Does a new
  table expose who did what?

**Status.** Pass. 0004 is applied: the live database refuses individual
ratings and likes and serves the totals.

## 7. Payments never enter scoring or ordering. No token. The "not affiliated" line stays on the first screen.

**Source.** "Moving beyond coin voting governance", on why letting money buy
influence over outcomes fails, starting with "outright attacks through various
forms of (often obfuscated) vote buying"
(<https://vitalik.eth.limo/general/2021/08/16/voting3.html>). The
affiliation line follows from the book's AI declaration (only the author's
words are his): <https://vitalik.eth.limo/snowmoon/>.
*Inference, not endorsement.*

**In this app.** Donations and sponsorship can fund generation; they never
change a score, a sort or a default. There is no token. The first screen says
the edition is independent, "not affiliated with the author", and that there
is no token.

**Checked by.**
- `P7a`: no ordering (`order by`, `.sort`) or scoring code references
  donations, grants, amounts, costs or sponsors.
- `P7b`: the deployed first screen contains "not affiliated with the author"
  and "There is no token"; no token code (ERC-20/721, mint, airdrop) exists in
  the repo. `npm run check:ui` also checks the first screen at phone size.
- Review: does any payment change what anyone sees first?

**Status.** Pass.

## 8. Dzegoban, Minpentai, and in-world screens match the source.

**Source.** The book's AI usage declaration lists "verifying consistency of
the rules of Minpentai and Dzegoban" among the checks the author made
(<https://vitalik.eth.limo/snowmoon/>). *Inference, not endorsement.*

**In this app.** Screens and figures show exactly what the source shows,
either as drawn or through a template that keeps every word. Dzegoban is
quoted as written. Minpentai boards and maps come from the source's own SVGs.

**Checked by.**
- `P8a`: every screen drawn by a default template shows every word of the
  source screen.
- `P8b`: Dzegoban lettering on images uses lines that appear in that chapter's
  source.
- `npm run check:ingest`: the committed text, screens and figures re-parse
  byte-identical from the fetched source. `npm run test:render`: template cases.
- Review: do generated images that depict boards, maps or screens (for example
  the chapter 22 tactical map or the chapter 25 circle game) claim to be the
  source's version? They are illustrations, and should not replace the
  source's drawing.

**Status.** Pass.

---

## Summary of current failures

None. All automated checks pass on production (Oct 5, 2026).

0005 is applied, and `scripts/backfill-recipe-assist.ts --write` recorded
`assist` for all 4,237 narration recipes in the database (Oct 5, 2026);
`P3d` passes. Recorded exception: 148 model-drafted spoken descriptions (2),
labelled, list may only shrink.
