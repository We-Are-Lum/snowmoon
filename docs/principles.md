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

Status is as of Oct 5, 2026 (commit after `570d699`).

---

## 1. Every published generated asset has a public recipe.

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
- Review: does any new output path publish a file without writing its recipe
  first?

**Status.** Pass. One gap to note under 3: the recipes record the generation
model, but not that a closed model drafted some of the text and prompts that
went into it (`recipes.assist` is unused).

## 2. AI use is declared on every element. The book's text is never altered, and nothing generated is presented as the author's.

**Source.** The book's own "AI usage declaration": "All words were written
directly by me", with AI assistance listed separately.
<https://vitalik.eth.limo/snowmoon/>. *Inference, not endorsement.*

**In this app.** Wherever a generated image, voice or text appears, it says so
there, not only on an About page. The book's text is shown exactly as fetched.
Generated material never sits where a reader could take it for the author's
words.

**Checked by.**
- `P2a`: every text block's sha256 is the hash of its content (the committed
  text is unaltered). `npm run check:ingest` additionally re-parses the fetched
  source and must reproduce the committed text byte for byte.
- `P2b`: on chapter pages, every seeded image's caption says "AI-generated";
  the player says the narration is synthetic; quote cards with an image label
  it as AI-generated.
- Review: is anything generated (a caption, a summary, a spoken description of
  a screen) placed where it could be taken for the book's words?

**Status. Fails `P2b`.** Image captions say "seeded image, a starting point"
without saying AI-generated, and image quote cards do not label the image at
all. Concern for review: the narration speaks the AI-drafted descriptions of
screens and figures (`content/snowmoon/read-aloud/`) in the same voice as the
book's text, with nothing marking them as not the author's.

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

**Checked by.**
- `P3a`: every allowlisted model has `license_line` and a boolean
  `open_weights`.
- `P3b`: every model named in a recipe is on the allowlist; closed ones are
  printed as a note.
- Review: was any closed model used to make or shape published content, and is
  that reported below?

**Status. Fails `P3a`.** Neither entry records `open_weights` (both are in
fact open: Kokoro-82M and FLUX.2 [klein] 4B publish their weights).

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

**Checked by.**
- `P4a`: every API route that writes (POST, PUT, PATCH, DELETE) calls `getFid`
  and refuses without it (401). `npm run check:shipped` also confirms on the
  live site that save and like refuse anonymous requests.
- `P4b`: the published image index and every narration index record
  `published_by` with an FID and the action.
- Review: does any script or job publish model output without a recorded human
  action?

**Status. Fails `P4b`.** The seeded images and the narration were published by
scripts run on the owner's instruction in a coding session, not by an in-app
action, and the indexes do not record who published them. Saved cards pass:
they need a signed-in FID.

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

## 6. Production pages make no third-party requests. Individual ratings are not publicly readable. Only totals are.

**Source.** "Why I support privacy": "Privacy is an important guarantor of
decentralization: whoever has the information has the power"
(<https://vitalik.eth.limo/general/2025/04/14/privacy.html>). The book's own
devices disclose only what is needed: chapter 1's watch "had learned that the
drone was not a threat - and nothing else"
(<https://vitalik.eth.limo/snowmoon/html/chapter-1.html>).
*Inference, not endorsement.*

**In this app.** Pages load only from this site and its media subdomain
(`*.snowmoon.party`): fonts are self-hosted, there is no analytics, no third
party script. Who rated what is private; the public sees totals only.

**Checked by.**
- `P6a`: a real browser loads eight production pages (including a chapter,
  the cards gallery, an adaptation and a share page) and fails on any request
  outside the site's own domain.
- `P6b`: with the migrations applied to an in-memory database, the public
  roles cannot read individual rows of `ratings`, `picks` or
  `contributor_consents`.
- Review: does a new page, embed or script reach another domain? Does a new
  table expose who did what?

**Status. Fails `P6b`.** Migration 0001 gives `studio.ratings` a public read
policy (`using (true)`), so anyone can read each person's rating. Totals
alone would need a view or function. Tension, not a failure of the statement
as written: `studio.likes` (0003) is also publicly readable row by row, so who
liked what is public. Likes are not ratings under rule 4, but the privacy
reasoning arguably applies to them too.

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

| Check | Principle | What fails |
|---|---|---|
| `P2b` | 2 | Image captions and image quote cards do not say "AI-generated" |
| `P3a` | 3 | `config/models.json` does not record `open_weights` |
| `P4b` | 4 | Seeded images and narration do not record whose action published them |
| `P6b` | 6 | Individual ratings are publicly readable (0001 policy) |

Concerns from review: AI-drafted screen descriptions spoken in the narration
unmarked (2); closed-model drafting not recorded in recipes (1, 3); likes
readable row by row (6).
