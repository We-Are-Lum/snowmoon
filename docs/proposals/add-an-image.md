# Proposal: add an image to a passage

> **Status:** drafted by the coding agent (Claude, a closed model) on 2026-10-08; decided by the
> owner the same day (see below); slice 1 built on branch `site-images`, not merged. Meant for
> `docs/proposals/add-an-image.md`. Board items: L8 ("+ Add an image" on a
> scene) and L18 (the player's "+ Add an image to this moment") in
> `docs/design/gap-list.md`. Every on-screen wording below is model-drafted and
> would ship marked as draft.
>
> **Unverified** marks anything I could not check today.
>
> **Since drafting (2026-10-08):** Sign in with Farcaster now works on the plain
> website too (`docs/proposals/web-sign-in.md`, built). Where this proposal says
> "outside Farcaster", read "signed out".

> **Decided and built (2026-10-08):** the owner took all 28 decisions as recommended, except 11
> (invited FIDs only, starting with 6786; no Neynar key), 12 ("FID n" until a way to show the
> username without a new outside service is agreed; see "Slice 1, as built"), 18 (contact
> snowmoon@wearelum.xyz), 20 (moderator 6786) and 24 (migration 0008, after the assistant's 0007;
> the FID only on rows that count a person's daily limit; costs carry no FID and only the date).
> Slice 1 is on branch `site-images`, labelled "Trial". Part B (reference images) is answered
> below, before section 1.

## In one paragraph

A signed-in Farcaster user selects a passage in the reader. They write their own
prompt, then press Generate. The server checks the prompt and has Z-Image Turbo
on fal.ai make one image. An automated filter checks the image too. The person
sees the image as a draft, kept only on their device. If they publish it, the
image is stored on the project's media domain. It then appears under the passage
with "AI-generated image · by @name · recipe", and anyone can read the exact
prompt. The author can hide it at once. Anyone signed in can report it, and a
moderator can hide it. Nothing else is moderated, and nothing is marked
official.

---

## 0. Conflicts and tensions (read first)

1. **A hidden image is still at its public URL.** `docs/removal.md` says hiding
   keeps the media object and only takes the URL out of indexes. The R2 bucket is
   public through the custom domain, so anyone with the link still gets the
   image. For a harmful image that is not enough. **Proposal:** when an image is
   hidden, copy it to a private bucket and delete the public copy, then purge the
   cache. The record and the bytes are kept, which the policy allows. Only the
   public copy is removed. This changes how the policy is carried out, so it
   needs your ruling.
2. **Principle 6: readers' prompts go to third parties.** On Oct 5 you approved
   fal.ai as a host for your own renders. This feature sends readers' prompts
   to fal.ai, and to Groq if the prompt check runs (section 6). The page itself
   makes no third-party request. This is the same tension you ruled on for chat,
   and the same kind of conditions could apply: name the hosts on screen, turn
   off payload storage (`X-Fal-Store-IO: 0`), and keep fal's copy of the image
   for a short time only.
3. **The consent wording has to change before launch.** `own-words-v1` says "You
   can ask the maintainer to hide it". `docs/removal.md` says "Hide this" ships
   with the first form that stores a person's words, together with
   `own-words-v2`. This is that form. No screen in production has stored anyone's
   words yet (principles 1, Status), so in practice nobody has to be asked again.
4. **Do not use `studio.generation_requests` for drafts.** Its public read policy
   (0002) shows rows that are `proposed`, `queued` or `rendered`. A draft's
   prompt stored there would be public, which breaks your Oct 5 rule that draft
   prompts stay private.
5. **Gating (brief decision 5) is not built.** The brief says Neynar score ≥ 0.7
   and a small free allowance per day. The project has no Neynar key yet. Any
   Farcaster account can be created, so caps per FID alone don't stop someone
   with many accounts.
6. **`MODERATOR_FIDS` is empty** (`src/lib/config.ts`). Reports would reach
   nobody. At least one moderator has to be set before launch.
7. **No public contact address.** Signed-out web readers cannot report anything,
   and copyright or legal notices need an address. You held back
   `itunes:owner` for the same reason (commit 15b42bf).

---

## Part B: a hosted, open-weights model that accepts reference images

Asked by the owner on 2026-10-08, before building, because it decides how character sheets and
style guides work later. Checked on the hosts' pages that day.

**Yes: FLUX.2 [klein] 4B, edit mode, on fal.ai.**

| | FLUX.2 [klein] 4B edit (recommended) | Qwen-Image-Edit-2509 (alternative) |
|---|---|---|
| Endpoint | `fal-ai/flux-2/klein/4b/edit` | `fal-ai/qwen-image-edit-plus` |
| Licence | Apache-2.0, open weights (the model card: "This model is licensed under the Apache 2.0"; the 9B variant is non-commercial, not this one) | Apache-2.0 per its model card (not stated on fal's page; **unverified there**) |
| On our allowlist | Yes, already (`flux2-klein-4b`, the model behind the project's own chapter images, run locally) | No; would need adding |
| Reference images | Up to 4 (`image_urls`, "A maximum of 4 images are allowed") | Up to 4 |
| Price | "$0.01 per megapixel" (whether reference images count toward it is **unverified**) | "$0.03 per megapixel" |
| Safety checker | `enable_safety_checker`, default true; output has `has_nsfw_concepts` | default true; output has `has_nsfw_concepts` |
| Keeps a copy? | `sync_mode`: "Output is not stored when this is True"; `X-Fal-Store-IO: 0` keeps no request or reply | same |

**What it adds as an outside service: nothing new.** It runs on fal.ai, already the host for
readers' images in this slice. The difference is what fal.ai is sent: with reference images, the
request also carries the URLs of the referenced images (published character sheets or style
pictures on media.snowmoon.party), which fal.ai fetches. Those are already public, so nothing
private leaves; the recipe would record each reference as a `uses` link (built in this slice).

**One more finding:** the same model also does plain text-to-image on fal.ai,
`fal-ai/flux-2/klein/4b`, at "$0.005 per megapixel", the same price as Z-Image Turbo, with the
same safety flag. Using FLUX.2 [klein] 4B for both making and editing would give readers' images
the look of the project's own chapter images and one model throughout. Slice 1 uses Z-Image
Turbo, as decision 3 says; switching is one line (`IMAGES.model` in `src/lib/config.ts`) and the
owner's call.

Sources (fetched 2026-10-08): <https://fal.ai/models/fal-ai/flux-2/klein/4b/edit/llms.txt>,
<https://fal.ai/models/fal-ai/flux-2/klein/4b/llms.txt>,
<https://huggingface.co/black-forest-labs/FLUX.2-klein-4B>,
<https://fal.ai/models/fal-ai/qwen-image-edit-plus/llms.txt>,
<https://fal.ai/docs/model-apis/data-retention>.

---

## 1. The smallest real version

In:
- One image per generation, at one fixed size (1024×576, the same as the seeded
  images), from one model.
- A passage range of 1 to 8 consecutive blocks in one chapter.
- The person's own prompt, plus an optional existing style.
- A private draft on the device, then a preview, then publish.
- The image under the passage, with its label, its byline and a link to its recipe.
- Hide this (by the author), Report (by any signed-in user), and a moderator
  queue with one action: Hide.
- A cap per person per day, a total spend cap per day, and an off switch.

Out (section 9): lettering, character or location references, image-to-image,
remix, ratings, takes, the living edition, the player entry (L18), share casts,
sponsorship, the ledger page, and video.

---

## 2. The compose screen

**Where it opens.**
- From the reader's existing block selection (the quote-card selection), with a
  new action, "Add an image".
- From a "+ Add an image" link on each scene label (L8). It opens with that
  scene's blocks selected, cut to the first 8.
- Signed out, or outside Farcaster: "Open Snowmoon in Farcaster to add an
  image." Reading still works everywhere.

**What the person picks, top to bottom.**
1. **The passage.** The selected blocks are shown as book text, with "¶ a–b".
   They can widen or narrow the range, up to 8 blocks in the same chapter. The
   book text is never sent to the model. It is only shown to help them write.
2. **The prompt.** A `PublishedTextField` (required by check P1f), labelled
   "Describe the image". Up to 600 characters. Under it is the publication line:
   "Public, permanent, GPL-3.0, shown with your Farcaster name." There is one
   more line: "Your prompt is sent to fal.ai to make the image. It becomes
   public only if you publish."
3. **Style (optional).** A choice between "Techno vistas (the project's starting
   style)" and "None". It reuses `content/snowmoon/designs/styles/*.json`
   together with the chapter's setting text. That style text was drafted by a
   model, so the recipe's `assist` says so. The screen shows the style text in
   full, because it becomes part of the public prompt.
4. **Model.** One line, not a menu: "Z-Image Turbo · open weights, Apache-2.0 ·
   runs on fal.ai". There would be a menu only if you approve a second model
   (decision 6).
5. **The rules, in one short box** above the Generate button: "No real people.
   No sexual content. Nothing violent or hateful. No characters or logos from
   other works. Don't ask for words in the picture." It links to the full
   policy.
6. **Generate** shows "N left today". It is disabled while a generation is
   running.

**After Generate.** The image appears as a draft labelled "Draft · only you can
see this · AI-generated image". Under it are "Generate again" (which counts
toward the cap) and "Preview and publish" (the existing `PublishFlow`). The
preview shows the image exactly as readers will see it: the passage, the
caption, the byline and the full prompt as it will be published.

**Drafts live on the device only**, the same as chat threads. The server sends
the image bytes back to the device and does not keep them (section 5). If the
person closes the app, the draft is lost unless it is kept in IndexedDB.
Keeping it there is decision 13.

---

## 3. Consent

- **When:** before the person's first **Generate**, not at publish. Generating
  stores the prompt in a recipe, even though that recipe stays private. The
  owner's rule is consent before the first contribution that stores a person's
  own words.
- **How:** reuse the consent screen from `publish-words.tsx` and `/api/consent`.
  Agreement is recorded in `studio.contributor_consents` (kind `own_words`) with
  the sha256 of the exact wording (`src/lib/consent.ts`). One change is needed:
  `PublishFlow` now asks for consent at Preview. A small helper should run the
  same check before Generate.
- **The wording.** `own-words-v2` would be added to `config/consent.json`
  (draft, model-drafted):
  - line: "Public, permanent, GPL-3.0, shown with your Farcaster name. You can hide it."
  - text: the five v1 paragraphs, with the third one replaced by: "It is
    permanent: the project keeps the record. You can hide your own work at any
    time, and it disappears from view at once. Moderators can also hide it.
    Copies others have already made may remain." One paragraph is added: "To
    make an image, your prompt is sent to fal.ai. Drafts you don't publish stay
    private."
- The content rules are **not** part of the hashed consent. They change more
  often. Decision 9 is whether they should be.

---

## 4. Model, host, cost and caps

### Model and host

| Option | Licence (allowlist) | Runs on | Price (host page, fetched 2026-10-08) | Per 1024×576 image | Safety on the host | Fit |
|---|---|---|---|---|---|---|
| **Z-Image Turbo** | Apache-2.0, open weights | fal.ai, `fal-ai/z-image/turbo` | "$0.005 per megapixel" (<https://fal.ai/models/fal-ai/z-image/turbo>) | **≈ $0.003** (0.59 MP) | `enable_safety_checker` (default true). The output includes `has_nsfw_concepts` (<https://fal.ai/models/fal-ai/z-image/turbo/api>) | **Recommended** |
| ERNIE-Image Turbo | Apache-2.0, open weights | fal.ai, `fal-ai/ernie-image/turbo` | "$0.01 per megapixel" (<https://fal.ai/models/fal-ai/ernie-image/turbo>) | ≈ $0.006 | Safety checker on by default. "Disabling requires account authorization". The output schema lists **no** NSFW flag, so a flagged image's behaviour is **unverified**. `enable_prompt_expansion` defaults to **true** and must be set false | Second choice |
| FLUX.2 [klein] 4B | Apache-2.0, open weights | Your Mac (local queue) | $0 | $0, about 230 s per image (chapter 1 recipe) | None built in. The model card asks for filters | Fits the later "proposal" lane, not instant drafts |

**Recommendation: Z-Image Turbo on fal.ai.** It is already on the allowlist, half
the price of ERNIE, and returns an NSFW flag per image. Fixed settings:
`image_size {1024, 576}`, `num_images 1`, `num_inference_steps 8`,
`enable_safety_checker true`, `enable_prompt_expansion false` (set explicitly;
its default is not stated, **unverified**), `output_format jpeg`,
`sync_mode true` (bytes come back in the response, so the server never fetches
from fal.media), and the headers `X-Fal-Store-IO: 0` (fal keeps no
request/response JSON; the default is 30 days) and
`X-Fal-Object-Lifecycle-Preference` with a short expiry, in case a CDN copy is
made at all (<https://fal.ai/docs/model-apis/data-retention>).

**Unverified:** whether fal bills 0.59 MP as 0.59 or rounds up to 1 MP. That
makes ≈ $0.003 or $0.005 per image. The spend guard reserves $0.005 either way.
Z-Image's model card advertises good text rendering (not re-checked today). That
makes words in images a real risk (section 7).

### Cost per generation (worst case reserved)

| Part | Cost |
|---|---|
| Image, Z-Image Turbo, 1024×576 | $0.003 to $0.005 |
| Prompt check, gpt-oss-safeguard-20b on Groq (already allowlisted) | ≈ $0.0001 |
| Optional second image check, `fal-ai/x-ailab/nsfw` | $0.001 ("$0.001 per image", <https://fal.ai/models/fal-ai/x-ailab/nsfw/llms.txt>, fetched 2026-10-08) |
| **Reserved per Generate** | **$0.0065** |

### Caps (proposed defaults, all in `src/lib/config.ts`)

| Cap | Default | Why |
|---|---|---|
| Generations per person per UTC day | **10** (blocked attempts and retries count) | Enough to try a few times. 10 × $0.0065 = $0.065 per person at most |
| Published images per person per day | **3** | Limits flooding a chapter |
| Total image spend per UTC day | **$2** | The same as chat's test cap. That is about 300 to 600 generations a day |
| Who may generate | **An allowlist of invited FIDs** for the trial, then Neynar score ≥ 0.7 (brief decision 5) | Caps per FID don't stop many accounts |
| Off switch | `IMAGES.enabled` | Turns off at once if abuse or cost spikes |
| Test spend while building | **$1**, logged in `docs/proposals/add-an-image-spend.md` | The same practice as `chat-spend.md` |

**The spend guard** works like chat's `reserve()` (`src/lib/chat/limits.ts`). One
transaction with an advisory lock for spend and one per FID. It counts today's
generations for the FID, adds today's image spend plus the worst case, writes a
reservation row, and only then calls the model. After the call it writes the
real cost. The per-FID lock also means one generation at a time per person.

**Where the counts live:** reuse `studio.chat_calls` and add kinds
`image_ask` (the reservation, cost 0) and `image` / `image_check` (the real
costs). That needs a one-line change to the check constraint in migration 0007.
Chat and images get **separate** daily caps, summed by kind. Decision 10 is
whether they share one budget.

---

## 5. Data flow, on the existing tables

```
Generate ──► server: FID ✓, consent ✓, allowlist/gate ✓, reserve() ✓
             prompt check (guard model) ── blocked? ─► recipe (blocked), no image, counts
             fal Z-Image (sync, jpeg, no IO storage) ── has_nsfw_concepts? ─► recipe (blocked), bytes dropped
             [optional] second NSFW check
             write studio.recipes row (private: no version yet)
             return bytes + recipe id to the device ──► draft lives on the device

Publish ───► device sends bytes + recipe id; server checks FID = recipe.created_by_fid,
             sha256(bytes) = the hash in the recipe, recipe not already used, publish cap
             upload to R2 (public) under images/u/<sha12>.jpg
             one transaction: elements (image, published) + element_versions
             (asset_url, asset_sha256, recipe_id, body {lettering: []}) + anchors (chapter, a, b)
             revalidate /chapter/n
```

**The recipe** (`studio.recipes`, append-only, written at generation):
`source 'in_app'`, `provider 'fal.ai'`, `model 'z-image-turbo'` (the allowlist
id), `model_version` set to the endpoint, `prompt` set to **the exact final string sent**
(the person's prompt, plus the style text if chosen), `seed`, `cost_usd` (real),
`created_by_fid`. In `params`: the endpoint, the date, fal's request id, every
setting, the anchor, the person's prompt on its own, the style id, the output
sha256 and the check verdicts. `assist` is null with no style, or records that
the style text was drafted by `claude-coding-agent`.

**Why the draft is not stored on the server.** `element_versions` is
append-only, and its `asset_url` cannot be filled in later. A draft in the
public bucket would be reachable by anyone with its link. So the server writes
only the recipe at generation time. Under 0005, a recipe with no published
version is private. The version, the element and the anchor are written at
publish, in one transaction, pointing at that recipe. Rule 1 still holds: no
version without a recipe. Abandoned drafts leave only a private recipe, which
matches "drafts and abandoned attempts stay private". No new table is needed for
drafts.

**How the reader shows it.** The chapter page already reads seeded images from
`published.json`. It would also read published image elements anchored in the
chapter, through the public RLS. Hidden and draft rows never come back. Each one
shows after its last block:

> [image]
> ¶ 4–9 · AI-generated image · by @name · not by the author · recipe

- **Alt text:** "AI-generated image: " plus the first sentence of the person's
  own prompt. These are the person's words, labelled, so principle 2 holds.
- **recipe** links to a new public page, `/image/<version id>`. It shows the full
  prompt (as plain escaped text, with links not clickable), the model, the host,
  the endpoint, the request id, the seed, the cost, the date, the person's name,
  the passage and any `assist`. This is what check P1d needs for a signed-out
  visitor.
- **More than one image on a passage:** in the trial, readers' images sit
  **behind a tap** ("2 images by readers · show"). They are not shown inline by
  default. The seeded image still shows as now. Order: most liked (from
  `like_totals`), then newest, and the label says which. Decision 4 covers this.
- **The byline name.** The FID is known. The username must be looked up on the
  server, not taken from the device, or anyone could claim any name. Options are
  Neynar (a key is needed anyway for gating) or a public Farcaster hub. Until one
  is chosen, the byline shows "FID n". Decision 12.

**Ratings later.** `studio.likes` and `like_totals` already work on any element
version. A like button can come in slice 1 or later. Ratings (−5 to 5, with
normalized scoring) and the living edition wait for Milestone 5.

---

## 6. Hide, report and the moderator queue (under `docs/removal.md`)

**Hide this (the author).** On their own image, on the chapter page and on
`/image/<id>`. One transaction does four things. It sets
`studio.elements.status` to `hidden`, which drops the element, versions,
anchors, likes and recipe from public reads (0001, 0004, 0005). It writes a
`removal_log` row (step `hidden`, by the author). It moves the public R2 object
to private storage (tension 1). It revalidates the chapter. No approval is
needed. "Unhide" is only for work the author hid themselves. It runs the same
steps in reverse.

**Report (any signed-in user).** A "Report" link on every reader image, which
needs Quick Auth (check P4a). The reporter picks one reason:

- sexual content, or anything sexual involving a minor
- a real person
- violence or gore
- hateful
- someone else's character, logo or artwork
- misrepresents the book or the author
- spam or nonsense
- other

The reporter can add an optional note of up to 280 characters. The note is
private. It is never published, so no consent screen is needed. Limits: one
report per person per image, and 20 reports per person per day.

**What happens to a report:**
- **"Sexual content involving a minor" hides the image at once** and the
  maintainer is told. Decision 17.
- **Three reports from different people hide it** until a moderator looks.
  This hiding follows a stated rule, so principle 5 holds.
- Every other report waits in the moderator queue, and the image stays up.

**The moderator queue** (`/moderate`, open only to FIDs in `MODERATOR_FIDS`).
For each reported image it shows:
- the image
- the exact prompt (and the style text, if any)
- the passage it is attached to, as book text with ¶ labels
- the model and date, and the automated check verdicts
- the creator's public name (it is already public on the image)
- each reason with its count, and the reporters' notes

It does **not** show who reported. Reporter FIDs are kept in the private log
only, for abuse handling. It shows no other personal data: no other images by
the creator, no IP addresses and no device data. Actions: **Hide** or
**Dismiss**. Nothing else. They cannot promote, order, label or unhide, as P5b
requires. Erasure is a separate step, done by the maintainer with the logged
procedure in `docs/removal.md`, step 2.

**Signed-out readers and legal notices** use a public contact address on About
(decision 18). The maintainer acts on those as a moderator.

**New tables:** only `studio.removal_log`, which `docs/removal.md` already plans.
It is private and append-only. Reports go in it as step `reported` with the
reason and the note, and moderators' choices as `dismissed` and `hidden`. The
queue is the latest step for each element. A separate `reports` table is not
needed. Migration 0007: `removal_log`, the new kinds on `chat_calls`, and
nothing else.

---

## 7. What could go wrong with images on a public site under your name

**What the automated checks are, and their limits:**

| Layer | Catches | Misses |
|---|---|---|
| Gate (invited FIDs, later Neynar score) and caps | Mass abuse, runaway cost | One determined bad actor with a good account |
| Prompt check: gpt-oss-safeguard-20b with a written, public policy (`config/prompts/image-guard.md`) | Plain requests for sexual content, minors, named real people, gore, hate symbols, named characters or brands, requests for words in the picture | Euphemisms and coded prompts. It is a model and can be argued with (prompt injection aimed at the guard). It adds Groq as a second hop |
| fal safety checker (`has_nsfw_concepts`) | Nudity and explicit sexual content, mostly | Likeness, hate imagery, gore (partly), copyrighted characters and text. Thresholds and model are not documented (**unverified**) |
| Optional second classifier, `fal-ai/x-ailab/nsfw` | A second opinion on nudity | The same blind spots |
| The person's own preview, and Publish | Their own mistakes | Intent |
| Reports, auto-hide rules and moderators | Anything a person sees and reports | Anything nobody reports. It also takes time. |
| Hash matching, such as Cloudflare's CSAM Scanning Tool (<https://developers.cloudflare.com/cache/reference/csam-scanning/>) | **Known** CSAM only | Newly generated images, which is every image here. Its use on the R2 custom domain is **unverified** |

**The risks one by one:**
- **Illegal content (sexual imagery of minors).** This is the worst case and
  rare, but every layer above can miss it. AI-generated sexual imagery of
  minors is illegal in many places. fal's terms ban it and require customers to
  report CSAM (<https://fal.ai/legal/acceptable-use-policy>). US providers must
  report apparent CSAM to NCMEC (**unverified for your situation; get advice**).
  The design limits exposure in three ways. Blocked images are never stored or
  shown. A single report in this category hides the image at once. The
  maintainer gets a written procedure: hide, keep the evidence privately,
  report, then erase.
- **Real people's likeness**, including the author's. "Vitalik Buterin as …"
  next to his own text, on a site that names him, is the most likely
  embarrassment. The prompt policy blocks named real people, and a word list
  names the author and his pseudonyms. A description with no name can still
  produce a likeness.
- **Sexual content, gore, hateful imagery.** Covered in part by the layers
  above. Hate symbols and slurs drawn as text are the weakest spot.
- **Copyrighted characters and styles.** The policy blocks named characters,
  brands and living artists' names. The project's own style prompt names no
  artist. This calls for a takedown route, and in the US a registered DMCA agent
  for safe harbour (**unverified; get advice**).
- **Text in images.** Z-Image can draw legible words. A slur or a fake quote
  drawn inside the image, next to the author's text, is a real risk. Mitigations:
  the policy bans asking for words, and "no text, no lettering" is always added to
  the prompt sent. The brief already says lettering is drawn in code, never by
  the model (out of scope here).
- **Prompt injection.** The image model has no tools, so injection only matters
  for the guard. Its verdict is one layer, not the only one. Prompts are shown as
  escaped plain text with links not clickable. The book text is never sent to a
  model.
- **Cost abuse.** Caps per FID, a total cap, worst-case reservation under a lock,
  one generation at a time, a fixed size, one image per call, prompt expansion
  off, a 600-character limit and the off switch. The most anyone can cost you
  in a day is the daily cap.
- **Misrepresenting the book or the author.** Every image says "AI-generated
  image · by @name · not by the author". The first screen already says "not
  affiliated with the author". Images of in-world screens or boards are captioned
  as illustrations, not the source's drawing (principle 8 review).
- **Your exposure as publisher.** You run snowmoon.party, and it shows strangers'
  images next to a named author's book. Laws that may apply depend on where you
  and your readers are (**unverified, not legal advice**): US Section 230 and the
  DMCA's notice-and-takedown, the EU Digital Services Act notice-and-action
  duties for hosting services, and the UK Online Safety Act duties for
  user-to-user services. Each roughly needs a way to report, a way to act fast,
  a contact point and records. This design supplies those but has had no lawyer
  review. That review is decision 19.
- **Images leave the site.** Downloads, casts and screenshots can't be recalled.
  The consent wording says so.

---

## 8. What changes in checks (when built)

- **P1c, P1d:** extend to database images. Every published image version has a
  recipe, and `/image/<id>` shows its prompt to a signed-out visitor.
- **P1f:** the prompt box is a `PublishedTextField`.
- **P2b:** every reader-image caption says "AI-generated image" and "not by the
  author".
- **P3b:** every database recipe's model is on the allowlist.
- **P4a:** the generate, publish, hide and report routes refuse without an FID.
- **P5b:** the moderator code only hides.
- **P6a:** the compose and moderate pages load images only from the media domain
  or `data:`.
- **New check:** every hidden image is absent from public reads and from the
  public bucket. `removal.md` already asks for this.
- **`test:db`:** a draft recipe stays private, and a hidden image's recipe goes
  private.

---

## 9. Out of scope

- Lettering, and editing an image after publishing.
- Character, location or prop designs as image references (Z-Image takes no
  multiple references).
- Image-to-image, remix, and `remixed_from` or `uses` links.
- Ratings and scoring, takes, the living edition, and weekly snapshots.
- The player's "+ Add an image to this moment" (L18). It is easy once this exists.
- The free local "proposal" queue (FLUX.2 [klein] on the Mac).
- Share casts and previews of readers' images.
- Sponsorship, credits, the `/ledger` page and attestations.
- Publishing without one's name (`publish-without-name.md`, "not now").
- Video.

---

## 10. Principles

| # | Principle | How this stands | Status |
|---|---|---|---|
| 1 | Public recipes and prompts; people know first | The exact prompt sent is in the recipe and public on publish; drafts stay private; consent before the first Generate; the line under the box | Pass, with own-words-v2 |
| 2 | AI declared; words are people's | Caption, alt text and recipe page all say AI-generated; "not by the author"; the book text is unchanged and never sent to the model; the style text is model-drafted and recorded in `assist` | Pass |
| 3 | Allowlist, open weights | Z-Image Turbo and gpt-oss-safeguard-20b are already listed, Apache-2.0, open weights. The optional fal NSFW classifier's licence and weights are **not checked**, so it would need listing (or leave it out). No closed model makes or checks images | Pass; **concern** if the extra classifier is used unlisted |
| 4 | No model output published without a person's action | The image is public only after the person presses Publish; the element's creator FID is that person | Pass |
| 5 | Nothing official; moderators only hide | No badge or pin; order is "most liked, then newest", labelled; moderators can hide or dismiss; auto-hide follows stated rules | Pass |
| 6 | No third-party requests from pages; private stays private | Pages load only the media domain and `data:`. But prompts go to fal.ai (and Groq for the prompt check). Reporters' identities are private | **Concern: needs your ruling** (tension 2) |
| 7 | Payments never enter scoring; no token | No payments; cost is never used in ordering | Pass |
| 8 | Screens and Dzegoban match the source | Images can depict screens or boards; they are captioned as illustrations and never replace the source drawing; the model must not draw Dzegoban | Pass, by review |

Tensions: principle 6 against the hosted model (tension 2), and removal "nothing
deleted" against harmful bytes at a public URL (tension 1). Principle 1 also
pulls against draft privacy: drafts are private, but the line under the box
says public. That is consistent only because publishing is when it becomes
public, and the second line says so.

---

## Decisions for the owner

1. **Ship this slice at all**, as the first collaborative feature: recommended yes, labelled "Trial".
2. **Principle 6:** let readers' prompts go to fal.ai (and Groq for the check): recommended yes, on chat's terms (hosts named on screen, `X-Fal-Store-IO: 0`, short media expiry, nothing kept by fal that can be avoided).
3. **Model:** Z-Image Turbo on fal.ai, 1024×576, settings fixed: recommended yes.
4. **How readers' images appear:** behind a tap ("n images by readers · show") during the trial, not inline: recommended behind a tap.
5. **Passage range:** 1 to 8 consecutive blocks in one chapter: recommended 8.
6. **Model choice on screen:** one model only (no menu) for the trial: recommended one.
7. **Style option:** offer "Techno vistas" or "None", with the style text shown and recorded as model-drafted: recommended yes.
8. **Consent:** ask before the first Generate (not at publish), with `own-words-v2` as drafted: recommended yes.
9. **Content rules:** shown on the compose screen, not part of the hashed consent: recommended not hashed.
10. **Caps:** 10 generations and 3 publishes per person per UTC day, $2 total image spend a day, kept apart from chat's $2: recommended as stated.
11. **Who may generate:** an invited FID allowlist first, then Neynar score ≥ 0.7 (needs a Neynar key): recommended allowlist first.
12. **Byline name:** look up the username on the server (Neynar or a public hub), "FID n" until then: recommended Neynar, with the gating key.
13. **Drafts:** device only, never on the server, optionally kept in IndexedDB: recommended device only, with IndexedDB.
14. **Prompt check:** run gpt-oss-safeguard-20b on every prompt before spending: recommended yes.
15. **Second image check:** add `fal-ai/x-ailab/nsfw` ($0.001) only after its licence is checked and listed: recommended no for the trial (rely on fal's built-in checker).
16. **Blocked attempts count toward the cap:** recommended yes.
17. **Auto-hide rules:** one "minor" report hides at once; three distinct reporters hide pending review: recommended yes.
18. **Public contact address** on About for legal, copyright and signed-out reports: recommended yes, before launch.
19. **Legal review** of publisher duties (CSAM reporting, a DMCA agent, EU DSA, UK OSA) before opening beyond invited testers: recommended yes.
20. **Moderators:** who goes in `MODERATOR_FIDS` (at least you, 6786): recommended 6786 to start.
21. **On hide, move the public R2 object to a private bucket and purge the cache** (tension 1): recommended yes.
22. **Who can unhide:** only the author, for their own hide; moderator hides are undone only by the maintainer: recommended yes.
23. **Moderators see reporters' notes but never who reported:** recommended yes.
24. **Migration 0007** (`removal_log` and new `chat_calls` kinds; no other new tables): recommended yes, applied by you after a dry run.
25. **New secrets on Vercel:** `FAL_KEY`, plus R2 write keys scoped to the media bucket and a private bucket: recommended yes (**unverified** whether R2 keys are on Vercel today).
26. **Likes on readers' images in the trial:** recommended yes (the table and totals exist). Ratings later.
27. **Test spend cap while building:** $1, logged in a spend file: recommended yes.
28. **The word list of blocked names** (the author and his pseudonyms, public figures): recommended yes, committed and public.


---

## Slice 1, as built (branch `site-images`, 2026-10-08)

Where the build differs from the text above, and why:

- **Drafts are not stored on the server at all**, not even as a private recipe. The server returns
  the image and a record of how it was made, signed with `IMAGES_TICKET_SECRET`; at Publish the
  device sends both back, and the recipe is written then, from the signed record. This keeps a
  draft's prompt and its cost off the server entirely, which the owner's cost rule (decision 24)
  needs: a stored draft recipe would be a cost tied to a person.
- **Costs** are daily totals in `studio.image_costs` (per kind of call, model, host, verdict), with
  no FID, no request id, no time of day and no row number, the rule of the assistant's 0007. The
  daily limit is counted in `studio.image_asks` (FID and time, no row number). A published image's
  recipe still shows its cost, as every recipe does (principle 1): that is the published work's
  provenance, shown with its maker's name by their own choice to publish.
- **Test spending** is capped in code: `IMAGES.totalSpendCapUsd` = $1 across all days, besides the
  $2 a day. Log: `docs/proposals/add-an-image-spend.md`.
- **Hiding** moves the public file to a private bucket (`R2_PRIVATE_BUCKET`), and public copies are
  cached for 5 minutes, so no Cloudflare cache-purge key is needed.
- **A moderator's "Dismiss"** never restores an image a stated rule hid: restoring would let
  moderator code publish (P5b). Those stay hidden until the maintainer restores them.
- **"The maintainer is told"** of a "minor" report (decision 17): the report is at the top of the
  moderator queue (`/moderate`), but nothing sends a message: that needs an outside service (email,
  a cast), which is the owner's choice.
- **The prompt check** also receives the prompt, so `own-words-v2` and the composer name Groq as
  well as fal.ai (the draft wording named only fal.ai).
- **Usernames (decision 12): "FID n" for now.** Ways to show the username without a new outside
  service, for the owner to choose before anything is added:
  1. *Website sign-ins:* Farcaster's relay (already named) sends our server the person's username
     when they sign in. The server could hand it back signed, like a draft, and accept it at
     Publish. No new service, no new table; miniapp sign-ins would still show "FID n".
  2. *Miniapp sign-ins:* the Farcaster app tells the page the username, but the page could claim
     any name, so it can't be trusted for a byline. No way without a lookup.
  3. *A lookup:* Farcaster's own public API or a public hub (both run by Farcaster). That is a new
     host our server calls, to be named on About: needs the owner's yes.
- **Built to fit what comes next:** publishing accepts `uses` (published design versions) and
  `remixed_from` (published images) and writes them to `studio.links`; `studio.picks` (private,
  0002) is untouched and ready for the composer to pre-fill references later.
