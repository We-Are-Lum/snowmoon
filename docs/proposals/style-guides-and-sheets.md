# Style guides, character sheets, forks and picks (step 4)

> **Built on branch `site-images-designs`. Not merged, not pushed, not deployed.** Written
> 2026-10-08 by the coding agent while the owner was away ("where you'd ask a question, take the
> conservative option, write it down, and keep going"). Every new string is draft wording, one
> "Draft wording" line per screen, and every one is listed in `IMAGE_WORDING_ROWS`
> (`src/lib/images/wording.ts`). The list of decisions the owner has to make before this can ship
> is at the end.

Design source: Claude Design's "Image creation" board and prototype, studied in
`docs/design/image-creation-study.md` (§2.13–2.20 screens, §4.14–4.16 strings, §5 measurements,
§6 data, §7 guesses, §8b the gap, §9 conflicts). This step builds the screens that study listed as
"not built": style guides (4a, 4b, 4c, 4-desktop), character sheets (5a, 5b), "use as my …",
forking, My picks (6, 6-desktop) and the composer's "from your picks" chips (1b), plus reports and
hiding for all of them through the moderation that already exists.

## 1. What was built

| Screen | Route | Design |
|---|---|---|
| Styles & characters (tabs: Styles, Characters, Places · coming) | `/images/designs`, `?sort=built`, `?tab=characters` | 4-desktop index, prototype library |
| A style or a sheet, at any version | `/images/designs/[versionId]` | 4a, 5a, 4-desktop detail |
| A character: what the book says, then its sheets | `/images/designs/character/[slug]` | 5a's book card, prototype CHARACTERS tab |
| New style | `/images/designs/new?kind=style` | 4b |
| New sheet for a book character | `/images/designs/new?kind=character&character=zei` | 5b |
| Fork a style or a sheet | `/images/designs/new?from=[versionId]` | 4c, 5b |
| New version of your own | `/images/designs/new?version=[versionId]` | (implied by "V3 OF 3") |
| My picks, with "compare a newer version" | `/images/picks` | 6, 6-desktop |
| Composer chips "From your picks · change for this image only" | the existing composer | 1b |
| Reported styles and sheets in the moderator queue | `/moderate` | 7 |

Entry: a link "Styles & characters →" on the Pictures page, and "My picks →" on the index for
invited readers. No new rail or menu entry; the rail keeps "Pictures · Trial" and stays on it for
every page under `/images` (conservative choice 1).

### New code

- `src/lib/images/designs.ts`: the data layer (lists, a design at a version, built-on counts, the
  book's characters, making a design, picks for one FID, hide/report support, the joint queue).
- `src/lib/images/design-rules.ts`: the fixed sample subjects and view lines, the sample prompt, the
  word diff used for shading, "does this passage name the character".
- `src/lib/images/paid.ts`: the one path every paid picture goes through (count and reserve, blocked
  names, prompt check, the model with its safety checker, settle, drop flagged pictures). The
  existing Generate route now uses it too, with the same messages and order as before.
- `src/lib/images/fal.ts`: `makeEdit` for FLUX.2 [klein] 4B edit; `makeImage` takes a size.
- `src/lib/images/limits.ts`: `reserve`/`settle` take the model and its worst case (default unchanged).
- `src/lib/images/ticket.ts`: a signed record for samples and views (`kind: 'design-sample'`); an
  image's record and a sample's record can't be swapped.
- Routes: `POST /api/designs` (publish), `POST /api/designs/sample` (one sample or view),
  `GET/POST/DELETE /api/designs/picks` (your own picks only), `GET /api/designs/version` (public
  text and pictures of a published version, for the comparison). Extended: `/api/images/status`
  (your picks for the composer, the edit model), `/api/images/generate` (picked style and sheets,
  reference pictures), `/api/images/publish` ('uses' links from the signed record),
  `/api/images/[id]/hide` and `/report` and `/api/moderate` (designs too).
- Pages and components listed above; styles in `src/styles/designs.css`.
- `scripts/test-designs.ts` (run by `npm run test:images`), `scripts/seed-designs.ts` (not run).
- `scripts/check-principles.ts`: P2b now reads the new screens' files, P3b the edit endpoint, P6a
  fetches the new pages. P6e and P6f untouched. `scripts/check-ui.ts`: the new pages signed out,
  My picks and the new-style form signed in (mocked), and any design page given with `--design=`.

## 2. Data: the tables that exist (no migration)

| Thing | Where it lives |
|---|---|
| A style | `studio.entities` (kind `style`, `name` = the style's name, unique per work) |
| A character | `studio.entities` (kind `character`, `name` = the book's name from `content/snowmoon/designs/characters/*.json`, `setting`, `first_chapter` = earliest chapter in its facts). Made when its first sheet is published; never typed by a reader |
| A style or a sheet | `studio.elements` (`element_type 'design'`, `entity_id`, `created_by_fid`, `status`) |
| Each version | `studio.element_versions` (`version_no`, `body`); `body` = `DesignBody` in `src/lib/element-body.ts`: `title`, `text`, `samples[]`, `views{front,side,back}`, `by_name`, `by_name_source`, `assist` |
| A sample or view | inside the body: `{url, sha256, recipe}`, the recipe with the exact prompt, model, endpoint, settings, seed, request id, cost, date, size, references and checks. Files on the readers' bucket under `images/readers/` by sha256, like images |
| A fork | a new design element on the same entity; its v1 has a `studio.links` row `remixed_from` → the source version (append-only, so the credit stays) |
| "Uses" | the existing `uses` links from an image version to the design versions added to it, written at publish from the signed draft record |
| Built on by n | published images whose version has a `uses` link to any version of the design (per version on the version list) |
| A pick | `studio.picks (fid, entity_id, version_id, picked_at)`, one per person per entity; written and read only for the signed-in FID |
| Reports, hides | `studio.removal_log` on the design element, as for images |

Why no migration was needed: every field fits `body` (jsonb) or an existing table, `picks_valid`
already requires a design version of the same entity, `links` already allows design → design
`remixed_from`, and `removal_log` already references `elements`. `0009` was not written.

Production today has no rows in `studio.entities` or `studio.entity_mentions` (checked read-only,
2026-10-08), so the character list comes from the repo's character files, and a character's
entity row is created with its first sheet.

## 3. Rules, as built

- **Same machinery as images.** Samples, sheet views and reference images are Generates: invited
  FIDs only, consent (the existing `own-words-v2` wording, unchanged) before the first one, the
  day's count (10), the daily ($2) and trial ($1) spend caps with the worst case reserved first,
  the blocked-names list, the prompt check (gpt-oss-safeguard-20b on Groq), the host's safety
  checker, pictures flagged by it dropped, signed records instead of server-side drafts.
- **Edit model.** FLUX.2 [klein] 4B edit on fal.ai (`fal-ai/flux-2/klein/4b/edit`, allowlisted as
  `flux2-klein-4b`), Apache-2.0, open weights. Body `{prompt, image_urls, image_size, num_images: 1,
  enable_safety_checker: true, output_format: 'jpeg', sync_mode: true}`, header `X-Fal-Store-IO: 0`.
  Reference pictures are sent as `data:` URIs, so fal fetches nothing. Price constant
  `IMAGES.editPricePerMp = 0.01` with its source; cost recorded as (output MP + every input's MP) ×
  $0.01; reserved as (1 + inputs) × $0.01 + $0.0015 (each picture rounded up to 1 MP).
  Its name, licence and host show wherever the model line shows (form, composer, recipes).
- **Where the edit model is used.** A sheet's side and back views (made from its front view, which
  the device sends back with its signed record; the server checks the bytes). And, only when the
  person ticks "Use {name}'s sheet pictures as a reference", an image made with a picked sheet's
  views (fetched by the server from the readers' bucket and checked against their sha256).
- **Text in full.** Every added style or sheet text is shown in full before Generate, on the preview
  (read from the draft's own signed record, so it is what will be published) and on the image page,
  with a link to the exact version. Model-drafted text says so.
- **The prompt check sees the added text.** With picks added, the check reads the person's words and
  every added text together; with none, exactly the person's words, as before.
- **Samples are made with exactly the published text.** Each sample's record holds the text; the
  server publishes only pictures whose text matches. Editing the text marks them "make again".
- **Published words.** Name and text boxes are `PublishedTextField` with the publication line (P1f);
  the first time goes through the same consent; "Preview" then "Publish" (P4: no model output
  published without the person's action).
- **AI-generated and not by the author** on every picture: samples, views, row thumbnails (in the
  row text), My picks, the comparison, the built-on list, the moderator queue, the composer.
- **Nothing official.** Orders are always named: "Newest first" (default) or "Most built on".
  The footer says "Nothing here is official." No pick is counted or shown to anyone else.
- **Report and hide.** Report (any signed-in reader) and Hide this (the maker), through the image
  routes; hiding moves every picture of every version to the private bucket. Reported designs join
  the moderator queue (oldest first); moderators can only hide or dismiss; Dismiss never unhides.
  A hidden design leaves every list and page, can't be picked, isn't offered in the composer, and a
  pick of it says "Hidden since you picked it".
- **Spoilers.** "What the book says" shows only the book's own quotes from chapters opened on this
  device, each linked to its block. A character whose first chapter is past that is covered on the
  index, on its page and on its sheets, with "Show anyway".

## 4. Measured against Design

Values set from the study's §5 and checked as computed styles in the production build (390 px).

| Item | Design | Built | |
|---|---|---|---|
| Style name | Crimson 30/1.05 | 30/1.05 | closed |
| Meta and labels | DM Mono 12 upper case, #6A675F | 12px, upper case, --muted | closed |
| Samples (phone) | 2 × 2, gap 4, ≈175 × 92 | 2 × 2, gap 4, 171 × 96 (the pictures' own 16:9) | ratio kept |
| Samples (desktop) | 4 in a row, gap 8 | 4 in a row, gap 8 | closed |
| Views | 3 in a row, ≈0.77:1 | 3 in a row, 3:4 (576 × 768) | closed |
| Action bar | "Use as my …" 2fr filled 48, Fork 1fr outlined ink 48 | same, kept at the foot on a phone | closed |
| Versions (phone) | one row "V3 V2 V1", shown one underlined | same | closed |
| Versions (desktop) | list with date and built-on count | same (no change note: no such field) | change note not built |
| Index rows | 64 × 48 thumbnail, gap 12, name 18, meta mono 12 | same | closed |
| Index tabs and order | mono 12, active ink underline | same, 44px rows | closed |
| Fork band | --soft, padding 10px 16px, ink rule under | same | closed |
| Name field | rule under only, Crimson 20, 6px 0 | same | closed |
| Text box | 1px ink, card fill, min-height 92, 16/1.4 | same | closed |
| Sample slots | 4 cols × 64 (board) / 3 × 80 (prototype) | 2 cols on a phone (each with its subject line), 4 from 768 | not closed: the subject of each sample is shown, needs room |
| Shaded words | --soft fill | same | closed |
| Newer-version box | 1px green, radius 3, 8px 10px, 44 | same | closed |
| Private strip | dashed --faint rule, mono 12, ○ | same | closed |
| Desktop styles | 220 rail / 340 list / detail | the app's 248 rail / 340 list / detail, on a style or sheet page when there is no assistant beside it (or ≥1600) | the index page itself shows the list only |
| Detail head buttons (desktop) | in the 52px head | in the action bar under the page | not closed |

Side-by-sides (Design board frame, Design prototype, built) are in the session scratchpad:
`step4-shots/pairs/*-390.png`, `*-424x695.png`, `*-1440.png`, `*-1440-nopanel.png`.

## 5. Conservative choices made (and written down)

1. No new rail or menu entry; a link from Pictures. "Pictures · Trial" unchanged.
2. Making, forking, picking and samples: invited FIDs only, like "Add an image". Signed-out and
   not-invited readers can read everything.
3. Readers create new styles (entity rows) and new sheets only for the book's own characters; they
   never name a character.
4. With several styles picked, the composer offers the most recently picked one (picks allow one
   per style entity, so several styles can be picked).
5. With no pick, nothing is added. (favourites.md proposed "most built on" as a fallback; that would
   be a de-facto default, so it is not built.)
6. A character chip starts ticked only when the passage names the character (a whole word of their
   name, case kept); others can be ticked for this image only; at most 3.
7. Reference pictures only when the person ticks the box; off by default.
8. Picks in the composer are only the person's own; "for this image only" never changes a pick.
9. Default order newest first; "most built on" is the labelled alternative; characters list in the
   order the book first tells of them.
10. Built-on counts are shown (on rows, pages and per version), never pick counts.
11. Samples and views use the same daily count and caps as images; a style needs 2 to 4 samples, a
    sheet its front view (side and back optional).
12. A daily cap of 3 published designs (new ones or new versions) per person.
13. Every new version needs new samples made with its text.
14. Style names are unique without case ("Kalimar Paper" = "kalimar paper"); a taken name is
    refused with "Fork it, or choose another name."
15. The design text is checked when its samples or views are made (it is in their prompts); the
    name gets the blocked-names list only, not the model check.
16. A fork's credit links to the source version; if the source is later hidden, the credit is no
    longer shown (it would link to a page that is gone).
17. "What the book says" shows the book's quotes only, never the model-written facts or "about"
    lines in the character files (they contain spoilers and are model text).
18. Samples and views last on the page until you publish or leave (not in IndexedDB).
19. The project's starting style stays a file option in the composer; publishing it as a design is
    a script that was not run (`npm run seed:designs`, needs `--apply`).
20. Designs have no likes, no cast and no share card.
21. The style page's "See them" is a list of the images built on it (newest first), not a filter on
    the feed.

## 6. Not closed, and why

- **No live call to the edit model was made** in this step: not essential, since it was verified
  on 2026-10-08 with a data: URI and every path to it is tested without paid calls. Paid calls in
  this step: none.
- Design's detail head with the buttons (desktop) and the index's split view on the index page
  itself: the list sits beside the page on a style or sheet page; the index page lists only.
- "1 OF 4 SHEETS ▸" on a sheet: the character page lists the sheets instead.
- Change notes ("deeper greens") on versions: no field; would be a new body field and box.
- "Most built on is used" for entities with no pick: not built (choice 5).
- The sheet's name label "CHARACTER" (prototype) is not a field; the character is fixed by the
  link, and a sheet's own name is optional.
- Design's "PLACES · COMING" toast: shown as plain text, not a control.
- Sticky action bars on the forms: the form's Publish is at the end of the form, not fixed.

## 7. Migration status

None needed, none written, none applied.

## 8. Decisions before this can ship

Each with the question, the options, and the recommendation.

1. **Who drafts and checks style and sheet text?**
   Options: (a) the reader writes it; the model check runs on it when samples are made, reports
   and moderators after; (b) also a pre-publication review queue; (c) model-drafted suggestions.
   *Recommend (a)*, as built: it is the person's own published words under the consent they gave;
   add the name to the model check too (today the name gets only the blocked-names list).
2. **May readers create new style entities, or only fork existing ones?**
   Options: (a) create and fork (built); (b) fork only, from styles the project publishes;
   (c) create only after an approval. *Recommend (a)* for invited readers during the trial, (b) if
   the trial opens wider before moderation has been tried on designs.
3. **"My style" when several styles are picked.** Options: (a) the most recently picked is offered
   (built); (b) the composer offers all picked styles as chips, the newest pre-selected; (c) one
   style slot (picking a style clears the others, needs a code rule since picks are per entity).
   *Recommend (b)* next: it keeps "for this image only" honest without a hidden rule. (a) for now.
4. **Default order: newest or most built on?** *Recommend newest first* (built), "most built on"
   as the labelled alternative, everywhere; Design's library defaulted to most built on.
5. **Should built-on counts show at all?** They are public facts but nudge everyone toward the same
   version (favourites.md, question 2). Options: (a) show on rows, pages and per version (built);
   (b) only on a design's own page; (c) only as an order, never as a number. *Recommend (b)*:
   keep the order, drop the number from list rows and the pick button's neighbourhood.
6. **Reference use of other readers' sheets, and consent for it.** Today a reader can use any
   published sheet's views as references once they pick it, and the image credits it with a
   'uses' link. Options: (a) that, covered by the GPL-3.0 publication the maker agreed to (built);
   (b) add a line to the consent wording (a new consent version, everyone agrees again);
   (c) let makers mark a sheet "not for reference". *Recommend (a) plus a sentence on the sheet
   form* saying that published views may be used as references by others, as draft wording.
7. **Caps for samples and sheet views.** Options: (a) they count as Generates against the 10 a day
   (built); (b) a separate small allowance; (c) free re-use of a design's earlier samples for a new
   version. *Recommend (a)* with the edit model's worst case reserved per call; revisit when the
   $1 trial cap is raised.
8. **Who can create: invited only?** *Recommend invited only* (built), same list as Add an image.
9. **Is design text GPL-3.0 like prompts?** The publication line and consent already say
   "Public, permanent, GPL-3.0". *Recommend yes*, as built; say it on the About page with prompts.
10. **Moderation of sheet views and samples.** Options: (a) the host's safety checker, reports and
    moderators (built); (b) also a vision check before publish. *Recommend (a)*; sheets show people,
    so watch the "real person" reports in the first weeks.
11. **Spoilers for characters first appearing later.** Built: covered past the furthest chapter
    opened on this device, "Show anyway". Options: (a) that; (b) list only characters up to the
    reader's chapter, no cover. *Recommend (a)*. Also decide whether a sheet's own text can be a
    spoiler (it can: "his left arm once broken") — *recommend* a rule in the sheet rules: "Describe
    how they look early in the book; nothing that happens later."
12. **The entity naming collision rule.** Built: style names unique without case; forks keep the
    entity and have their own title. Options: also refuse names close to a book character's or
    another style's name. *Recommend* the built rule plus refusing a style named exactly like a
    book character.
13. **Publish "Techno vistas" as a design?** `npm run seed:designs -- --apply` would publish it under
    FID 6786 with its model-drafted text declared, so it can be forked and credited. Options:
    (a) publish it as a design, then retire the file option in the composer; (b) keep it only as
    the file option (built). *Recommend (a)*, under the system FID, with its page saying it is the
    project's starting style and model-drafted; it then sorts like any other style (not first).
14. **The fallback with no pick** (favourites.md: "most built on is used"). *Recommend no fallback*
    (built): nothing is added unless the person adds it.
15. **Per-setting lines.** The file style adds a line per setting (Veridia, Dzego…); designs are one
    fixed text. *Recommend* keeping designs one text; settings can be separate styles.
16. **A hidden source's credit.** Built: the credit disappears with the source. Options: keep the
    credit as text without a link. *Recommend* text without a link ("remixed from a design that was
    hidden") so the fork still says it is a remix.
17. **Three designs a day.** *Recommend* keeping it during the trial.
18. **Draft wording.** Every new string (about 130 new rows in `IMAGE_WORDING_ROWS`) needs the owner's
    words, including the fixed sample subjects and view lines, which are part of public prompts.
19. **Character first chapter.** Taken as the earliest chapter in the character file's facts, which
    can be later than the first appearance. *Recommend* recording first appearances in the files.
20. **"What the book says" uses quotes only.** *Recommend* keeping quotes only (book text, no model).

## 9. Principles

| # | Principle | Status |
|---|---|---|
| 1 | Public recipes and prompts; people know first | Pass: every picture's recipe is on its design's page; added texts shown in full before Generate, in preview and on the image page; consent and the publication line on every box |
| 2 | AI declared; nothing presented as the author's | Pass: "AI-generated" and "not by the author" on every picture (P2b now reads the new files); model-drafted text declared |
| 3 | Allowlist, open weights | Pass: FLUX.2 [klein] 4B edit is allowlisted (P3b now checks its endpoint) |
| 4 | No model output published without a person's action | Pass: Preview, then Publish; samples never published alone |
| 5 | Nothing official; moderators only hide | Pass: orders named, "Nothing here is official", Dismiss never unhides (P5a, P5b, test) |
| 6 | No third-party requests; private stays private | Pass: picks only for the signed-in FID, never counted (tests); reference pictures sent as data URIs; P6a passes for the new pages. P6d not run (Vercel CLI; accepted open item) |
| 7 | Payments never in scoring | Pass: costs only in recipes |
| 8 | Screens match the source | Pass: sheets show the book's own quotes; sheet rules say "Don't contradict what the book says" |

Tension raised, not resolved: built-on counts next to "Use as my …" (decision 5).
