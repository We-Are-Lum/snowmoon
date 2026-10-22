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
- `P1c`: in the database, every version of a published element has a recipe; a style or character sheet keeps one inside its body for each of its pictures instead, and passes only when it has pictures and every one names its prompt and model (owner, 2026-10-14)
  (reads the live database when `STUDIO_DATABASE_URL` is set).
- `P1d`: a signed-out visitor reaches the exact prompt of every published
  image and narration: the chapter page links the recipe (and the lettering
  record for lettered images), and the file at that link, fetched anonymously
  from the public repository, holds the prompt or spoken text for that very
  output.
- `P1e`: through the public database API, with only the public key, the
  spoken text of the house narration is readable.
- `P1f`: every text box whose contents may be published is a
  `PublishedTextField`, which shows the publication line under it. The boxes
  that are never published say so instead: the assistant's question
  (`PrivateTextField`), a report's note (`PrivateNoteField`) and the search of
  the book's text on "Make an image" (`SearchField`, 2026-10-10: searched on
  the reader's device over the text served whole by `/api/book/text`; the
  query is never sent anywhere, kept or published, and the page may fetch
  only that text).
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

**Recorded exception: raw voice takes (owner, 2026-10-13).** When a person
performs lines that are converted into a character's voice, their raw takes
are never published. The reason is privacy: a raw recording of a person's
voice is enough to clone it. The converted line is the published source of
that line, and its recipe gives the model and revision, the settings, the
character's reference clip and the sha256 of the raw take, but not the take.
Conversion runs on the performer's own machine, so the take never leaves it,
and takes are kept in a private folder outside the repository and outside R2.
The performer agrees to `own-voice-v1` (`config/consent.json`) first. Every
performer gets the same terms. Anyone can still re-run the conversion with
their own voice or another reference clip; they cannot reproduce the exact
converted line from the recipe alone, which is why the converted line itself
is published.

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

**Prompts in scenes (owner, 2026-10-13).** Voice descriptions, the sound line
for each place, and style texts are the owner's words; until the owner sends
them they are marked placeholders, and nothing is published with one.
Per-shot and per-cue prompts (image, motion, sound effect) may be drafted by a
model, and each recipe labels them model-drafted in `assist`, as image
prompts are. **DRAFT, for the owner (replaces "Published scene assets use
open-weight models only"):** Published scene assets may use closed models when
every recipe and label names the model, its maker, the date and that it is
closed (owner, 2026-10-18).

**Recorded exception.** The house narration keeps 148 model-drafted spoken
descriptions of screens, figures and lyric cards. Each is preceded by a tone
and shown in Listen with the label "AI description ⓘ", which opens the details
(owner ruling, 2026-10-09).
They are listed in `content/snowmoon/read-aloud/exceptions.json`. The list
may only shrink: an entry is removed when a person rewrites that description
in 25 words or fewer and records `written_by { fid, date }`.

**Checked by.**
- `P2a`: every text block's sha256 is the hash of its content (the committed
  text is unaltered). `npm run check:ingest` additionally re-parses the fetched
  source and must reproduce the committed text byte for byte.
- `P2b`: on chapter pages, every seeded image's caption says "AI-generated";
  the player says the narration is synthetic; quote cards with an image label
  it as AI-generated. The glossary's "Hear it" clip (`/glossary/autobus` as
  served) carries the same voice label ("AI voice · by Snowmoon Party"), and its
  recipe sheet is checked like the chapter's. Pictures carry a short "AI ⓘ" label, the
  declaration on hover and in its accessible name (owner, 2026-10-15); on a chapter page, where
  pictures sit beside the book's text, "not by the author" is also shown, once, beside the first
  picture (owner, 2026-10-15). The first-visit intro's images (its recipe and
  record cards) carry the same image label (owner, 2026-10-10). The home page's "Just made"
  (`src/components/home-feed.tsx`) shows each reader's image with the same
  label, or its empty state.
- `P2c`: every narration and dialogue line in an adaptation script carries a
  human author tag. `npm run check:adaptations` also checks every book line
  verbatim against its block and narration at 25 words or fewer per beat.
- `P2d`: every spoken description is either written by a person (with FID and
  date, 25 words or fewer) or on the exception list, and the list has not
  grown past 148.
- `P2e`: every quote in the glossary (`content/snowmoon/glossary.json`), both the
  explanations and each word's "First appears" sentence, is a sentence of the book,
  verbatim in its block (speaker-colour span tags removed), at a block id that exists;
  the first sentence is in the word's first block and names the word; terms carry no
  definition field. Nothing on a glossary
  page defines a word except those quotes. `npm run test:glossary` also rebuilds
  the file from its sources and must match it byte for byte.
- `P2i`: every "moment from the book" on the home page (`HOME_MOMENTS` in
  `src/lib/home.ts`) is one or more whole sentences of a paragraph or quote
  block, verbatim (speaker-colour span tags removed, no quote marks added or
  changed), at a block id that exists (`check:ui` follows "Read from here" and
  checks it lands on that block). The proof changes one word and adds Design's screen block c1-b18
  as if it were a sentence.
- `P2g`: on every chapter page as served, each screen redrawn from a template
  (`data-source="template"`) carries one ⓘ label named "Redrawn": the ⓘ shown,
  the word and the declaration served with it as its accessible name, and a
  dialog with the details; screens drawn as in the book carry no marker. Owner
  ruling, 2026-10-10: "Icon only for all short labels", replacing that of
  2026-10-09 ("a short visible word, with ⓘ … An icon alone doesn't count");
  no word shows beside the ⓘ. The proof blanks the word.
- `P2h`: Listen shows the ⓘ named "AI description" while a model-drafted
  description plays; the label renders with the ⓘ, and its word and declaration
  ("not the author's words") as its accessible name. The proof blanks the word.
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
audio, except the one below.

**DRAFT, for the owner:** GPT Image 2.5 Sunburst (OpenAI), a closed model
(`config/models.json` `gpt-image-2.5-sunburst`, `open_weights: false`), drew
every model-drawn picture of Fifteen Days version 2, the GPT cut, on
2026-10-18, through the Vercel AI Gateway (owner, 2026-10-18: "Chat gpt
version is so much better. Let's go with that one and change the site to allow
closed models"). Inputs open, model closed: its prompts, the pictures sent and
every call's recipe are committed (`adaptations/fifteen-days/versions/2.json`);
its weights are not published. The version's AI label names it. Version 1, the
open-weight cut, stays at its own fixed link. `P3b` prints it as a note.

## 4. No model output is published without a signed-in person's action.

**Source.** "AI as the engine, humans as the steering wheel"
(<https://vitalik.eth.limo/general/2025/02/28/aihumans.html>).
*Inference, not endorsement.*

**In this app.** A person signed in with Farcaster takes the action that
publishes anything a model made. Server routes that write require a verified
Quick Auth FID. Anything published outside the app records whose action
published it.

**Allowed, recorded path: a signed-in wallet (owner, 2026-10-13).** Readers'
images may also be made and published by a person signed in with a wallet
(Sign-In with Ethereum, checked by our server; `src/lib/wallet/session.ts`).
Only the image routes and consent take a wallet sign-in (`getPerson`); every
other route still requires a Farcaster FID. In the image tables a wallet
account's person number is minus its account number, so it never reads as a
FID; its byline is its address, shortened. Wallet accounts don't get the free
daily allowance or the Neynar check: they pay in advance for each image.

**Allowed, recorded path: the maintainer via script.** Seeded images and
narration may be published by the maintainer (FID 6786) running a publish
script. The published index then records `published_by` with the FID, role
`maintainer`, the action, the script, the date, and an evidence file in the
repo (the prompt log of the request that asked for it).

**Checked by.**
- `P4a`: every API route that writes (POST, PUT, PATCH, DELETE) calls `getFid`
  (or `getPerson` / `getWallet` where a wallet sign-in is taken) and refuses
  without it (401), or hands the request to a shared wrapper that
  does (listed in the check; today only Minpentai Play's `play()`, read each run). `npm run check:shipped` also confirms on the
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
- `P6a`: a real browser loads the production pages in its list (including a chapter,
  the cards gallery, an adaptation, a share page, the glossary and a glossary word) and fails on any request
  outside the site's own domain.
- `P6b`: in the committed migrations, no public read policy remains on
  `ratings`, `likes`, `take_likes`, `picks`, `contributor_consents`, `image_asks`,
  `removal_log`, `image_scores` (Neynar scores by FID, migration 0010) or `wallet_links` (which wallet is linked
  to which FID, DRAFT migration NEXT_wallet_links.sql)
  (`npm run test:db` proves it on an in-memory database, totals views
  included).
- `P6c`: on the live database, through the public API with the public key,
  the individual tables refuse to answer and the totals views answer.
- `P6d`: the Vercel project holds no `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET` or `POSTGRES_*` variable (read by name through the
  signed-in Vercel CLI; values are never read). The app reaches the database
  only as `studio_writer`.
- `P6e`: the reading assistant's notice ("What the assistant does",
  `src/lib/chat/notice.ts`) was reread after the last change to how the chat
  works. The check fingerprints the chat code and routes, the `chat-*` prompts
  and the `CHAT` settings, and fails until the notice's `reviewedFor` matches.
  The stamp records who reread it: the coding agent, or the owner. An
  agent's reread is enough only when the words are unchanged.
  A reader who ticked "Don't show this again" sees the notice once more
  whenever its words change.
- `P6f`: the notice's words, as readers see them now, are words the owner
  (FID 6786) has reread (`NOTICE_REVIEW.ownerReread`). Any change to the
  words fails until the owner rereads them; it is set only on the owner's word.
- `P6g`–`P6j` (owner, 2026-10-09): the Privacy page (`/privacy`), About, the
  assistant's notice (`currentNoticeItems`) and the image consent screen
  (`config/consent.json`, current version) name the same outside services. The
  vocabulary is the services the Privacy page names: Vercel, Vercel AI Gateway,
  Cloudflare, Supabase, Groq, fal.ai, Farcaster (its services, not a Farcaster
  ID or name), Neynar, GitHub. The pages are read as served.
  - `P6g`: the Privacy page names every service that About, the notice or the
    consent screen names, and the three that receive something at Generate.
  - `P6h`: About names the same set as the Privacy page, no more and no fewer.
  - `P6i`: the notice names exactly the services the Privacy page says receive
    assistant questions (section 5, and section 7's "receive assistant questions").
  - `P6j`: the consent screen names exactly the services that receive the image
    prompt or the Farcaster ID at Generate: Groq, fal.ai and Neynar.
- `P6k`, `P6l`: the Privacy and Terms pages' words are words the owner (FID 6786)
  has reread (`LEGAL.ownerReread` in `src/lib/legal.ts`), the notice's `P6f`
  rule: any change to the words fails until the owner rereads them; it is set
  only on the owner's word. Until then each page shows one "Draft wording"
  line; after it, "Reread by FID 6786" with the date. No per-sentence tags.
- `P6m`: the Terms and Privacy pages carry their effective date
  (`LEGAL.effective`, the day they go live), and no placeholder shows.
- `P6n`: image making is open beyond the invited list (the gate looks up a
  Neynar score) only when `src/app/terms/page.tsx` and `src/app/privacy/page.tsx`
  both exist, and the Privacy page names Neynar (which receives the FID at
  Generate). The owner's launch order (2026-10-09). At runtime the generate
  route also refuses everyone outside the invited list until `next.config.ts`
  has found both page files at build time (`APP_LEGAL_PAGES`) and
  `SNOWMOON_ALERT_URL` is set. It failed on branch `site-images-everyone` alone, by design, until
  the Terms and Privacy pages were merged into it.
- Review: does a new page, embed or script reach another domain? Does a new
  table expose who did what?

**Status.** Pass, with two open items, and the Terms and Privacy pages waiting
for the owner: `P6k`, `P6l` (the owner's reread) and `P6m` (the effective date,
set on the day they go live) fail until then, by design. 0004 is applied: the live database refuses individual
ratings and likes and serves the totals.

- `P6d` fails: `SUPABASE_SECRET_KEY` is still set on the Vercel project.
  Accepted as an open item by the owner (2026-10-08): left in place for
  now. The check keeps reporting it, and merges to main may proceed with
  only P6d failing.
- The reading assistant's direct route to Groq: zero data retention there is
  a setting in the owner's Groq console (Data Controls → global ZDR). Each
  request through the gateway asks for zero retention and the gateway enforces
  it; the direct route cannot ask, and nothing in Groq's replies shows the
  setting. Confirmed by the owner in the Groq console on 2026-10-08:
  organization "Lum", Global ZDR and Inference APIs ZDR enabled, Batch and
  Fine-tuning storage off. No automated check covers it; recheck by hand if
  the key or the Groq organization changes.
- The assistant's records: questions are counted under the FID
  (`studio.chat_calls`: FID, time, model); model-call costs are kept as daily
  totals with no FID, request id or time of day (`studio.chat_costs`,
  migration 0007), so none can be joined to a person. `npm run test:chat`
  fails if one can. Residual: on a day when only one person asks, that day's
  totals are theirs.
- Prepaid images (owner's exception, 2026-10-13, migration 0011): a wallet
  account's payments (`studio.wallet_payments`, with the transaction hash) and
  what each of its images cost it (`studio.wallet_debits`) are kept per account,
  because a balance can't be kept otherwise; onchain, the payment is public
  anyway. They are private (no public read; append-only for the app;
  `npm run test:wallet`). `studio.image_costs` still has no person in it: it now
  says only whether a day's costs were free or prepaid.
- Wallet ↔ Farcaster links (owner, 2026-10-22; DRAFT migration NEXT_wallet_links.sql): which wallet account is
  linked to which FID, and how ('verified' on Farcaster, or 'signed' with both sign-ins), are kept privately
  (`studio.wallet_links`, append-only for the app except a link's one-time unlinked_at). A linked wallet's work is
  then shown under the Farcaster name, which makes the link public for a 'signed' link (the person is told so
  before confirming; for a 'verified' one it is public on Farcaster already). The automatic link sends the wallet's
  address to Neynar; it is switched off (`WALLET_LINKS.lookUp`) until the owner rereads the Privacy line that says
  so (docs/legal/wallet-links-draft.md).

## 7. Payments never enter scoring or ordering. No token. The "not affiliated" line stays on the first screen.

**Source.** "Moving beyond coin voting governance", on why letting money buy
influence over outcomes fails, starting with "outright attacks through various
forms of (often obfuscated) vote buying"
(<https://vitalik.eth.limo/general/2021/08/16/voting3.html>). The
affiliation line follows from the book's AI declaration (only the author's
words are his): <https://vitalik.eth.limo/snowmoon/>.
*Inference, not endorsement.*

**In this app.** Donations and sponsorship can fund generation; they never
change a score, a sort or a default. Prepaid images (owner, 2026-10-13): a
wallet account buys images in advance with USDC or ETH on Base, at the
estimated cost plus 30%. Paying buys images and nothing else: no place in any
order, no score, no default. Payment is for the service (image generation) and
is final: no refunds; nothing is held for anyone to withdraw. There is no token. The first screen says
the edition is independent, "not affiliated with the author", and that there
is no token.

**Checked by.**
- `P7a`: no ordering (`order by`, `.sort`) or scoring code references
  donations, grants, amounts, costs or sponsors.
- `P7b`: the deployed first screen (the first words of the home page's
  `<main>`, its dark hero) contains "not affiliated with the author" and "no
  token" (the owner-approved line "Independent adaptation · Not affiliated
  with the author · No token", `config/intro.json`; the owner moved it from
  Design's footer into the hero, 2026-10-10); no token code (ERC-20/721, mint, airdrop) exists in
  the repo. `npm run check:ui` also checks the first screen at phone size.
- `npm run check:intro`: the first-visit intro's disclaimer (`config/intro.json`),
  shown on card 1 and at the top of /about, keeps "not affiliated with the
  author" and "no token"; every card and feature marked "live" points at a
  page that exists.
- Review: does any payment change what anyone sees first?

**Status.** Pass.

## 8. Dzegoban, Minpentai, and in-world screens match the source.

**Source.** The book's AI usage declaration lists "verifying consistency of
the rules of Minpentai and Dzegoban" among the checks the author made
(<https://vitalik.eth.limo/snowmoon/>). *Inference, not endorsement.*

**In this app.** Screens and figures show exactly what the source shows,
either as drawn or through a template that keeps every word. Dzegoban is
quoted as written. Minpentai boards and maps come from the source's own SVGs.

**Lettering.** Text in an image must match its lettering record exactly. It may be drawn in code, or repainted by the image model from the code-drawn version, and it is checked either way. An in-world screen shown on a device in a
panel is the book's own screen block, as the reader's template draws it; a cut
is marked `…` and recorded. (Owner's wording, Oct 5, 2026. Applied first to
dog-dawn panel 7's versions; the check is extended to every lettered image
once the owner picks a version.)

**Checked by.**
- `P8a`: every screen drawn by a default template shows every word of the
  source screen.
- `P8b`: Dzegoban lettering on images uses lines that appear in that chapter's
  source.
- `P8c`: every book claim in the Minpentai Learn wording (`learn-text.ts`,
  including the rules note's quote of c4-b84) cites a block
  that exists, words it quotes are in that block, a file it cites exists, and
  the broadcast's countdown is chapter 4's Dzegoban (c4-b97–b98). P8 applies
  to what is presented as the book's (the recovered rule and c4-b5 board on
  `/minpentai/rule`, whose sources and quote P8c also checks, Under the hood,
  Dzegoban, claims about the book); the Learn game's (and Free play's)
  own rules are invented for this edition and are not checked against the
  book's rule (owner, 2026-10-09).
- `P8d`: every Learn screen with the game (watch, lessons, practice) carries
  "Rules invented for this edition" and a draft tag; Under the hood, the
  book's rule, does not; lessons 1 and 7 and practice quote c4-b84, "every
  game there's always some kind of new rule", and link to `/minpentai/rule`;
  the note and the source lines never say "the rule changes every match" (or a
  close variant) outside a quotation (owner, 2026-10-09). The rule page is the
  book's rule: tagged FROM THE BOOK and never RULES INVENTED, it cites c4-b5
  and c4-b7 in its text and sources, and runs `engine.ts` on the c4-b5 board.
- `P8f`: Minpentai's tags are the ⓘ named "Book", "Invented" (the rules, the
  broadcast, the lenses and the symbol's shape, folded into one label whose
  details list each) or "Draft", each opening its explanation (the ⓘ alone, the
  word as its accessible name; owner ruling 2026-10-10), on every
  Learn screen and the rule page. Play's tags (`play.tsx`, `play-live.tsx`, the rules page) are the
  same labels, with no old-style tag carrying a label's words, and nothing there paraphrases c4-b84 as
  "a new rule each match" (the ruling of 2026-10-09, which P8d checks in Learn; 2026-10-10). The proof
  blanks each of the three words and plants the old c4-b84 tag.
- `P8e`: every live voting screen (c1-b18, c1-b31, c7-b6) starts in the state
  the book shows: the slider's range, step and starting value are the source's
  `<input type="range">` with its HTML defaults, its marks and title are the
  source's, and the island's first render (its value, the drawn thumb, the
  marks, the reading under the screen) matches; every slider the book draws is
  live. The reading itself is this edition's (the book never shows one).
  The book's sliders are working range inputs (`<input type="range"
  style="width:100%">`, not disabled, in `content/snowmoon/source`); the
  grey, inert slider readers saw before came from our import, which disables
  every input and button it keeps (`scripts/lib/parse-chapter.ts`, `safeHtml`).
  `test:render` also checks that Reset returns to the source's value from
  anywhere and that the island neither stores nor sends; `check:ui` moves each
  slider and resets it in a browser with no request made.
- `P8g`: the Minpentai build-on kit's rules table (`src/lib/minpentai/kit-rules.ts`,
  served as `/minpentai/build` and `public/minpentai/rules.json`, DRAFT 2026-10-20):
  every rule from the book cites blocks that exist and are Minpentai passages,
  and every quote is word for word in its block; every invented rule names a
  place in the code that is in its file; the passages are 152; `rules.json`
  matches the table; the page is labelled Book, Invented and Draft, says it is
  not affiliated with the author, shows every passage of chapters 2–14, and
  keeps chapters 15 on in a Spoilers section closed by default (owner,
  2026-10-20). `npm run test:minpentai-kit` checks the same and that the
  generated files are current. The proof changes one quoted word, shows a chapter 15 passage and opens Spoilers.
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
