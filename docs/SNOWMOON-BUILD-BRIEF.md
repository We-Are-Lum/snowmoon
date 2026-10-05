# Snowmoon Living Edition: Build Brief v4

> **What this document is:** The starting brief for a Farcaster miniapp that turns Vitalik Buterin's novel *Snowmoon* into an open, ever-evolving illustrated and narrated edition (and later a film), with every prompt and step recorded in public. Part A is for Claude Code. Part B is for Claude Design. Read the whole document before starting. Working title only.

> **Status:** v5, Oct 4, 2026 (section 4e adopts the v5 proposal). Before that, v4d, Oct 2, 2026. Supersedes v1 to v3. Milestone 1 is shipped at snowmoon.party (Oct 4). Migrations 0001 and 0002 are applied, and the text is seeded. Milestone 3 (Oct 5): the house narration of all 32 chapters is in R2 and the database, and the player is in the reader. The player reads block timings from `content/snowmoon/narration/`, since the database stores segments but not offsets in the stitched chapter file; the seeded images come from `content/snowmoon/illustrations/published.json` until Milestone 4. Section 4a records the pre-deploy data-model, session, and scaffold changes; 4b the move into a shared studio database; 4c the design direction, version anchors, house narration, and reader restyle; 4d the last edit to 0001 and the first default template. v3 added what a full read of all 32 chapters showed (section 1a).

---

## 1. The idea in one page

**Source.** *Snowmoon* is a 32-chapter novel at https://vitalik.eth.limo/snowmoon/ released under GPL v3. The author's stated reading of the license is that anyone may adapt it, but must open-source the pipeline used: AI prompts, scripts, task-specific harness, and other non-commodity materials.

**Consequence.** The record of how everything was made is the license obligation, and it is the product.

**No canon, ever.** This is a living work. Nothing is declared official. Every character design, image, and take keeps evolving, and creators may build on any version they prefer, including old ones. What readers see by default is decided by measurement (ratings, how often something is built on), never by a person.

**Vocabulary.**

- **Element:** one made thing. A design (for a character, location, prop, or style), a text element (an adapted line or caption), an image, and later a clip. Every element has versions, and every generated version has a recipe.
- **Take:** one chapter with someone's elements substituted in. Any part of the chapter a take does not cover falls back to the book's own text. Takes can be partial from the first element. A remix of a take copies it and swaps or adds elements.
- **Living edition:** for each chapter, the highest-scoring take, shown as a scroll-through and as a narrated play-through. On day one it is simply the book. It fills in with art over time.
- **Timeline:** each chapter's running conversation and activity, built on Farcaster casts.
- **Recipe:** prompt, model, parameters, cost, and references for one generation. Recipes are never edited or deleted.

**Money.** No token. No revenue share. The only money in the system is sponsorship: a person can fund a specific creator's generations. The record shows who funded what, and the creator decides how to spend it. Reputation is the reward.

**Shared engine.** The same engine should later power an open-ended comic app. Keep everything Snowmoon-specific behind `work_id`.

---

## 1a. What the full book requires

A full read of all 32 chapters changed these assumptions. Details are in `SNOWMOON-CHAPTER-NOTES.md`.

- **Two worlds, three leads.** The book alternates between Veridia (Gladias and his wife Seila) and Dzego (the teenager Zei, with Bai, Fin, Mu, and Den), with scenes in Freetown, the capital Sadzu Du, occupied Northglade, and a snow forest. Seila carries chapters of her own. The bible must cover both worlds from the start.
- **Set pieces are rendered in code, never generated.** The book has five matches of a cellular-automaton game called Minpentai (square grid, a hex grid in chapter 12, shrines in chapter 14), two sequences of a copter sport called Helisport with a scoreboard, and several drone battles shown as tactical maps (chapters 22, 26, 29, 30). These need designed templates in the repo, the same as hand-device screens. In the text they are `figure` blocks (SVG) and `screen` blocks; a contributor's version of one is a `render` element (section 4a).
- **Spoilers are a product requirement.** One character's identity flips twice and a child's arc is planted quietly from chapter 1. Anything a reader sees from analysis is limited to chapters up to the one they are in. Contributors can opt in to a full-book view behind a clear warning.
- **Locations recur.** The last chapter retraces the first chapter's walk. An entity is one thing across the whole book, with mentions in many chapters.
- **An invented language runs through the text.** Dzegoban lines appear with translations, sometimes in long blocks. Lettering shows the original line with its translation. Narration needs a committed pronunciation table at `content/snowmoon/pronunciation.json`.
- **Seasons matter.** Most of the book is green. The battle and the reunion are in deep snow.
- **How to use the chapter notes.** They are a human-written reading aid. Use them to sanity-check the analysis pipeline's output. Never seed the database from them.

---

## 2. Open decisions (defaults chosen so work can start)

| # | Decision | Default in this brief | Why |
|---|----------|----------------------|-----|
| 1 | Database | A shared studio database. Everything lives in the `studio` schema; server writes use the `studio_writer` role | Public GPL repo; the schema and role keep this app's reach to its own tables. FID is the join key. |
| 2 | Repo license | GPL-3.0, public from the first commit | Matches the source and the author's intent. |
| 3 | Image, speech, and language models | Behind adapters, limited to the allowlist in `config/models.json`; people choose among listed models (v5, §4e) | Models change fast. Record the exact version string the provider reports. A model joins the list only after its license line is quoted and clearly allows publishing outputs under GPL-3.0. |
| 4 | Uploads of media made outside the app | Hand-made work only: drawings, paintings, sketches, recordings of one's own voice (v5, §4e) | AI media made elsewhere stays out, because its prompts cannot be verified. |
| 5 | Generation limits | Neynar score 0.7 or higher. Instant generations: a small free daily allowance per FID. Proposals for the free local queue: a much larger allowance (v5, §4e) | Sponsorship and donations top up beyond the allowance. |
| 6 | Minting editions | Undecided. Not in any milestone. | Weekly snapshots exist either way, so mints can be added later without redesign. |
| 7 | Narration voice | One house narration per chapter, synthetic by default; alternate narrations, including human recordings, can be proposed and can become the house narration (v5, §4e) | No cloning of any real person's voice, including the author's. |
| 8 | App and engine name | Unset | Use `snowmoon` as the `work_id`. |
| 9 | Moderation | A short allowlist of FIDs can hide content | This is moderation only. It never promotes or ranks anything. |

---

# PART A: Claude Code

## IMMEDIATE TASK: Milestone 1

Scaffold the project, ingest the book, and ship a clean reader.

**End state:** The maintainer opens the miniapp in Farcaster, signs in, and can read Chapter 1 with correct formatting: paragraphs, scene breaks, block quotes, and the in-world tables. Every text block has a stable ID. `/api/version` returns the deployed commit. The repo is public with a GPL-3.0 LICENSE and an attribution page.

**Steps:**

1. Scaffold a Next.js + TypeScript Farcaster miniapp. Verify the current scaffold command against the Farcaster miniapp docs first. (Done; differences from the official templates are listed in section 4a.)
2. Add `LICENSE` (GPL-3.0) and `ATTRIBUTION.md` (section 8).
3. Write `scripts/ingest.ts`: fetch the 32 chapter pages (`/snowmoon/html/chapter-1.html` through `chapter-32.html`), parse each into ordered text blocks, and write one JSON file per chapter into `content/snowmoon/text/` with the fetch date and a sha256 per block. Commit the JSON. The app reads the committed snapshot, not the live site.
4. Block kinds: `heading`, `dateline` (the location and date line that opens a chapter), `paragraph`, `quote` (lyrics, Dzegoban lyric cards), `screen` (hand-device screens, messages, posters shown as screens), `figure` (SVG boards, maps, diagrams), `break` (scene break). Store content as Markdown; screens, figures, and lyric cards keep the source HTML, which is valid inside Markdown. `screen` and `figure` blocks carry `data` (section 4a). Export every source SVG to `docs/source-figures/c{chapter}-b{idx}.svg`.
5. Write migration `0001` from the core schema in section 5 as a SQL file. Do not apply it. The maintainer runs migrations by hand in the Supabase SQL Editor.
6. Write `scripts/seed-text.ts` to load the JSON into `text_blocks`. It must be safe to re-run.
7. Sign In with Farcaster through Quick Auth. The client keeps the FID for the session; the server derives it on every request from an `Authorization: Bearer` token (section 4a).
8. Reader UI: chapter list and chapter view, mobile-first. Each block is addressable (`#c1-b14`).
9. Add `/api/version` and `npm run check:shipped`.

**Do not build in Milestone 1:** generation, ratings, audio, timeline.

**Ingest checks (must pass):**

- 32 chapters parsed, none empty.
- Re-running ingest on unchanged source produces byte-identical JSON and SVG files.
- Chapter 1 contains `screen`, `figure`, and `quote` blocks. If any count is zero, the parser is wrong.
- The visible text of each source page equals the text of its blocks, whitespace ignored.
- Only `screen` and `figure` blocks carry `data`. Every evidence quote in `data` is an exact substring of the block it cites. Every figure's SVG exists in `docs/source-figures/`, is well-formed XML, and no orphan SVGs remain.

**Environment variables for Milestone 1:**

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# server only: studio_writer through the transaction pooler (section 4b)
STUDIO_DATABASE_URL=
NEXT_PUBLIC_URL=
```

---

## 3. All milestones (build in order)

### Milestone 1: Scaffold, ingest, reader
Described above.

### Milestone 2: Book analysis
A scripted, repeatable analysis of every chapter. It is part of the pipeline, so the prompts and scripts are committed.

- `scripts/analyze.ts` runs a language model over one chapter at a time and writes `content/snowmoon/analysis/chapter-N.json`. Prompt files live in `prompts/` and the output records the prompt file's commit and the model version.
- Per chapter output: a short summary; sections (one per scene, split at `break` blocks, each with a title, summary, location, characters present, time of day, and mood); entities (characters, locations, props) with visual facts; hand-device screens and tables that should be rendered as code; invented terms (units of time, games, institutions) with their meaning; continuity facts worth tracking; adaptation notes (what is hard to show, what is interior monologue); continuity questions (places where the text seems to contradict itself).
- **Every fact carries evidence:** the block index and an exact quote from that block.
- **Screens and their owners.** For each `screen` and `figure` block, record whose device shows it (a character entity), with evidence. This replaces the provisional `text_blocks.data.device`. A character's device keeps its home world's look when they travel (chapter 19 shows both side by side). So a screen's look follows its owner's home world, not the scene's setting (`data.setting`).
- `scripts/verify-analysis.ts` is a separate, non-model check: every cited block exists and every quote is an exact substring of that block. Any failure fails the run. Show that it fails on a planted bad quote before trusting it.
- A second pass merges entities across chapters (same character, different chapters) and records each entity's first chapter.
- Seed `sections`, `entities`, and `entity_mentions` from the verified JSON.
- **Order:** run Chapter 1 first and stop for the maintainer's review. Run the remaining 31 only after that review.
- **Spoilers:** anything shown in the app from analysis is limited to chapters up to the one the reader is in. A contributor view of the whole book is opt-in, behind a warning.

Chapter 1 sanity check. The analysis should find at least: Gladias (an Acolyte in the Order of Steering), Seila, Zven, Lily, Febric, Hreda; the Kalimar district street in Meldan, the sky bridge, the concert field, the autobus, the family home; the Veridian Privacy Robe (dark purple, hooded, face cover, matching shoes), the hand device, the toy drone, the Hydrafill bottle; and the local AI named Emerald.

Whole-book sanity check, once all chapters are run. The merged entities should include at least: Seila as a major character; Zei, Bai, Fin, Mu, Den, and Deluin; Delwart and Lord Ephelion; Senator Verdow; the cities Pafogai Du, Sadzu Du, Freetown, and Northglade; the pyramid mountain and its arena; and Elenar Forest. The continuity questions should include at least a chapter 15 section whose heading does not match its action, and the dates of chapters 23 and 24.

### Milestone 3: Audiobook for Chapter 1
Useful to a reader on day one, before any contributor shows up.

- The chapter's narration is its house narration (`house_narrations`); the database allows exactly one per chapter that has any.
- Generate narration one text block at a time through the speech adapter. Each segment has its own recipe and a stored duration. `break` blocks are a short pause with no audio.
- `screen` and `figure` blocks do not read well aloud. Use `text_blocks.read_aloud` as an override: a short spoken description. Write these overrides by hand or with model help, and commit them. `text_blocks.data.fields` is the starting point.
- Player in the reader: play, pause, skip by block, speed. The current block is highlighted and kept in view.
- Because audio is stored per block, anything anchored to a block automatically has a place in time. No separate timestamp data is needed.
- Dzegoban words and invented names need consistent pronunciation. Build `content/snowmoon/pronunciation.json` from the analysis glossary and apply it before sending text to the speech adapter. Chapter 1 has few of these; chapter 2 has many.
- Chapter 1 only. Extend to other chapters after cost per chapter is known.

### Milestone 4: Generation, the bible, and the public ledger
- Entity page: what the book says (from `entity_mentions`, spoiler-limited), and every design proposed for that entity with all of its versions.
- Propose a design: prompt box, generation through the image adapter, image stored in R2, recipe written in the same transaction as the version.
- Iterate: the same author adds a new version to their own element. Remix: anyone starts from any version; creates a new element with a `remixed_from` link to the exact source version.
- No design is ever marked official. The entity page sorts by "most built on" (count of distinct elements with a `uses` link to that version) and by rating. Old versions stay fully usable.
- Public ledger: a `/ledger` page and `/api/ledger` JSON export of every recipe, version, and link, including cost. Readable without sign-in.
- Gating from decision 5.

### Milestone 5: Elements, takes, ratings, and the living edition
- From the reader or the player, select a block or range and add an element there: an image or a text element. The image composer lets the creator pick any design versions as references and writes a `uses` link for each.
- Lettering is rendered in code over the image from structured data. Never ask the image model to draw text.
- Hand-device screens and tables are rendered with HTML or SVG templates from the repo, with `source = 'human_authored'`. The same applies to the set pieces in section 1a: game boards, scoreboards, and tactical maps. A contributor's version of a screen or figure is a `render` element anchored to that block, with body `{ template, template_commit, state }`; `text_blocks.data` is the starting state.
- Takes: creating an element can add it to the creator's own take for that chapter. Remix any take, then swap, add, or remove elements.
- Rendering a take: walk the chapter's blocks in order. Where a take item's version is anchored, show it with that block range: `beside` (the default) keeps the book text, `replace` hides it and needs a version that can stand in for it (section 4d). Everywhere else, show the book's text. Screens and figures no item covers use their default template if one exists, otherwise the source's own drawing.
- Within one take, two versions' anchors must be identical or not overlap at all.
- Ratings on element versions, from -5 to 5, echoing the book's own vote screen. Scoring rules in section 6.
- Living edition: per chapter, the top-scoring take. It is the default view of every chapter, as a scroll and as a narrated play-through where the image for the current block shows while that block is read.
- "Add an image to this moment" from the player opens the composer on the current block.
- Share: a cast embed that opens the miniapp at a specific block of a specific take, with the image as the preview. A rendered video clip of audio plus images is a later item.
- Weekly snapshot: freeze each active chapter's living edition into `living_snapshots`.
- Creator profile: elements made, times built on, weeks held in the living edition.

### Milestone 6: Chapter timeline and catch-up
- Each active chapter has one root cast, posted by a project Farcaster account.
- Ingest replies to the root cast and quote casts of it into `timeline_items`. Verify what the current Neynar API offers for quote casts before building on them. Filter by Neynar score. Remove an item if its author deletes the cast.
- In-app activity (new element, remix, new top take) is written to the same stream.
- Replying from inside the app composes a cast that automatically carries a link to the element or take being discussed.
- Open the timeline for Chapter 1 only. Open the next chapter's timeline when work starts there.
- Catch-up: a "catch me up" action that covers everything since the person's last visit. Lead with facts from the ledger and activity, then conversation themes. Every line links to the cast or element it refers to.
- Build catch-ups from cached rolling digests per chapter plus a small fresh part. Do not run a full summary per tap.
- Cast text is untrusted input. The summarizer reads only, has no tools, and its prompt is in the repo. Each digest stores a recipe.
- Post the weekly digest into the chapter thread from the project account, alongside the weekly snapshot.

### Milestone 7: Sponsorship
- A person funds a specific creator with generation credits, paid onchain. The grant is recorded with the transaction hash.
- Credits are not cash: they cannot be withdrawn or transferred, only spent on generations in this app. The creator chooses what to spend them on.
- Each recipe paid for by a grant records that grant, so the ledger shows who funded each generation.
- Sponsors receive credit and nothing else. No share of anything.
- Have counsel look at the prepaid-credit design before it ships.

### Later (do not build yet, but do not block)
- Video clips as an element type, and rendered video shares.
- A free-order editor that assembles elements from any chapters into a new sequence.
- Alternate narrations, including human recordings.
- Section-by-section assembly of the living edition.
- Minting snapshots as editions (decision 6).
- A guide agent beyond catch-up: search, continuity checks, pointing at parts of a chapter that need work.

---

## 4. What changed from v1

- Canon is removed everywhere. No admin sets anything official. The admin allowlist is moderation only.
- "Pieces" are now "elements". "Script beat" and "panel" are now text and image elements. "Cuts" are now chapter "takes"; the free-order editor moved to Later.
- The "stale" flag is gone. An element simply shows which design versions it was built on, and which version is currently most built on.
- New in v2: book analysis pipeline, audiobook, ratings and scoring, living edition, weekly snapshots, chapter timeline, catch-up, sponsorship credits, `cost_usd` on recipes.
- New in v3: section 1a, continuity questions and a whole-book sanity check in Milestone 2, a pronunciation table in Milestone 3, code-rendered set pieces, the spoiler rule, and a second world in the design direction.
- New in v4c: version anchors, `take_items.display`, house narration, default screen templates, readable ¶ labels, the reader restyle, and design direction in `docs/design/` (section 4c).
- New in v4: `screen` and `figure` block kinds (replacing `table`) with `text_blocks.data`, the `render` element type, `lang` and `gloss` on lettering, `entities.setting` (named `world` until v4b), section location, time of day and season, bearer-token sessions, scaffold notes, `docs/prompts/`, and `docs/source-figures/`. Details in section 4a.

## 4a. v4: pre-deploy changes and findings (Oct 2, 2026)

Migration 0001 had not been applied, so it was edited in place.

### Block kinds and `text_blocks.data`

- Every `.device-view` in the source was a `table` block. Now a device view containing an SVG is a `figure` (56 blocks) and every other one is a `screen` (84 blocks). Lyric cards stay `quote`. The `table` kind is dropped: no source block used it.
- Block IDs did not change. All 4,322 blocks kept the same `idx`, content, and sha256; only `kind` moved, and `data` was added.
- `data` on `screen` and `figure` blocks:
  - `setting` (named `world` until v4b): the region of the most recent dateline (`veridia`, `dzego`, `united-cities`), with `setting_evidence` citing the dateline block and quoting its place. This is where the scene is set, not where the device was made.
  - `device` (**provisional**, marked `device_provisional: true`): what the text says shows the screen (`hand_device`, `watch`, `robot`, `screen`, `wall_screen`, `poster`, `page`, `green_circle`, `computer`, `glasses`, `headset`), found by keyword in up to three paragraphs before it, never across a scene break, inheriting from a screen just before. `device_evidence` gives the block and the exact sentence. It is `null` for 35 of 140 blocks, where the text does not say. It is a deterministic keyword heuristic, not a reading; Milestone 2 replaces it with the device's owner.
  - `frame`: the source's width (`narrow`/`wide`), alignment (`center`/`left`), and inline style.
  - `fields`: what the screen shows, in order: `heading`, `text`, `list`, `rule`, `button`, `slider` (with its labels), `table` (header and rows; a cell with controls is `{ text, controls }`), and `svg` (file in `docs/source-figures/`, viewBox, size, text labels, whether it animates).
- Every source SVG is exported standalone to `docs/source-figures/c{chapter}-b{idx}.svg` (56 files, one per figure block). Ingest writes them and removes stale ones; the ingest check verifies them.

### Elements, lettering, entities, sections

- `elements.element_type` gains `render`: a code-rendered set piece. Body `{ template, template_commit, state }`.
- Lettering items gain `lang` (`en` or `dz`) and `gloss`.
- `entities` gain `setting` (named `world` until v4b). `sections` gain `location_entity_id` (nullable FK to `entities`), `time_of_day`, and `season`, and are created after `entities`.

### Session

- v3 stored the Quick Auth JWT in an httpOnly cookie. On Farcaster web the miniapp runs in an iframe on another site, so that cookie is third-party; Safari and Brave block third-party cookies by default, and other browsers can be set to. In the mobile app the miniapp is the top-level page of a WebView, where a first-party cookie would be sent, but one path for both is simpler.
- v4 uses the docs' recommended pattern: the client calls `sdk.quickAuth.fetch`, which adds `Authorization: Bearer <token>`, and the server verifies it with `@farcaster/quick-auth` `verifyJwt` on every request (`src/lib/auth.ts`). No cookie. `/api/auth/me` returns the FID.
- Not yet confirmed inside a live Farcaster client: that needs a deployed URL. After deploy, open the app in Farcaster web (Safari and Chrome) and mobile and confirm the bar shows the FID.

### Scaffold compared with the current Farcaster docs

`npm create @farcaster/mini-app` (`@farcaster/create-mini-app` 0.1.2) offers a Vite + React + Wagmi static template, or a Next.js template that clones `neynarxyz/create-farcaster-mini-app`. This repo was set up by hand in the shape of the Next.js template. Differences:

| Area | Docs or template | This repo | Why |
|------|------------------|-----------|-----|
| Framework | Vite static, or Next.js (Neynar) | Next.js 15 App Router | Server routes are needed for auth, ledger, and writes |
| Node | `>=22.11.0` | `engines.node >=22.11.0` | Same |
| Wallet | wagmi, viem, miniapp-wagmi-connector | None | No onchain feature before Milestone 7 |
| Neynar SDK and API key | Included in the Next.js template | None | Needed from Milestone 4 (score gating) and 6 (timeline) |
| Auth | Docs: `sdk.quickAuth.fetch` with Bearer. Template: posts the token in a JSON body to `/api/auth/validate` | Bearer via `sdk.quickAuth.fetch` | Follows the docs |
| `sdk.actions.ready()` | After the app loads | After mount, only when `sdk.isInMiniApp()` | Same, and the reader still works in a normal browser |
| Manifest | `/.well-known/farcaster.json` with `accountAssociation` and `miniapp` | Served by a route; `accountAssociation` from `FARCASTER_HEADER/PAYLOAD/SIGNATURE` | Same; values must be generated for the production domain |
| Icon | 1024x1024 PNG, no alpha | Same | Fixed in v4 |
| Splash | 200x200 | `public/splash.png` 200x200 | Fixed in v4 (was the 1024 icon) |
| Embed | `fc:miniapp` (plus legacy `fc:frame`), image 3:2, action `launch_frame` | Both tags, `public/embed.png` 1200x800, `launch_frame` | Fixed in v4 (was a square image and `launch_miniapp`) |
| Subtitle, description | No special characters, 30 and 170 characters max | Rewritten without punctuation | Fixed in v4 |
| Notifications | `webhookUrl` and `/api/webhook` in the template | None | Not needed yet |
| OG image route | Included in the template | None | Share cards are Milestone 5 |

### Docs and prompts

- References to a private repo and to the shared studio database by name were removed from this brief.
- `docs/prompts/` holds the prompts given to the coding agent that built this repo, in order. Analysis and generation prompts used by the app itself go in `prompts/` (Milestone 2).

## 4b. v4b: deploying into a shared studio database (Oct 2, 2026)

The app deploys into a shared studio database. Migration 0001 was still unapplied and was edited in place.

### Schema

- Every table, trigger, policy, and the trigger function live in a schema named `studio`. Nothing is created in `public`. `create schema studio` fails if the name is taken, rather than mixing into an existing schema.
- The trigger function sets an empty `search_path` and is not executable by anyone directly.
- `world` is renamed `setting`, in `entities` and in `text_blocks.data` (`setting`, `setting_evidence`).

### Roles and grants

| Role | Rights in `studio` | Anything else |
|------|-------------------|---------------|
| `anon`, `authenticated` | `usage` on the schema, `select` on every table; RLS shows published rows only | Unchanged |
| `studio_writer` (new) | `select, insert, update, delete` on every table and `usage` on sequences; an RLS policy lets it see and write every row; the append-only triggers still apply | No DDL, no `create` anywhere, no access to `public` tables or other schemas |
| `service_role` | None | Unchanged; this app never uses it |

Default privileges give later migrations' tables the same grants.

### Settings to change by hand

1. **Apply 0001** in the SQL Editor (dry run first: swap the final `commit;` for `rollback;`).
2. **Give `studio_writer` a login**, in the SQL Editor, with a generated password that is never committed: `alter role studio_writer with login password '…';`
3. **Expose `studio` to the Data API**: Project Settings → Data API → Exposed schemas → add `studio`. Only needed for public reads through the API with the anon key; skip it if all reads go through the app's server.
4. **Writer connection string**: take the transaction pooler string from the dashboard's Connect panel, change the user to `studio_writer.<project-ref>`, and set it as `STUDIO_DATABASE_URL` in Vercel (server only) and in `.env.local`. Confirm on first connect that the pooler accepts the custom role.

### Why `studio_writer`, and what it costs

A direct Postgres connection as a role that owns nothing and can only touch `studio`, instead of the service role key through the API.

- **Gain.** The service role bypasses RLS on every schema in the shared database. If it leaked from this app's Vercel environment, everything in the shared studio database would be exposed. A leaked `studio_writer` password exposes only `studio` rows; the role cannot change the schema, cannot read other schemas, and cannot get around the append-only triggers.
- **Cost.**
  - Writes are SQL through `postgres` (postgres.js) rather than the supabase-js query builder.
  - Connections go through the transaction pooler. That means one connection per function instance and no prepared statements, and they count against the shared studio database's connection limits.
  - A password to generate, store, and rotate by hand.
  - No Supabase admin APIs (Storage, Auth admin). This app needs neither: media go to R2 and sign-in is Farcaster.
  - Like any role, it can see catalog metadata (other schemas' table names) and call functions granted to `PUBLIC`.
- **Rejected alternative.** A custom JWT with `role: studio_writer` through the Data API keeps supabase-js. But it needs the database's JWT signing secret on this server, and that secret can mint service-role tokens too, so it is worse than the service role key.

### Tests

`npm run test:db` builds an in-memory Postgres (PGlite) shaped like a shared studio database: the API roles `anon`, `authenticated`, and `service_role`, plus existing tables outside `studio`, in `public` and in another schema. It applies 0001 and checks:

- nothing new in `public`, and RLS and the append-only triggers on every `studio` table;
- anon and authenticated read published rows only and cannot write;
- the service role cannot read `studio`;
- `studio_writer` can write `studio` rows but cannot do DDL, truncate, read other schemas, or get around the append-only rule;
- the constraints hold;
- the real seed script, connected over the wire as `studio_writer`, loads all 4,322 blocks.

PGlite runs as a superuser, unlike the database's own admin role, so role creation is approximated.

## 4c. v4c: design direction, version anchors, house narration, reader restyle (Oct 2, 2026)

Direction boards are in `docs/design/` (PNGs plus their source). They are direction, not spec. Migration 0001 was pushed but still unapplied, so it was edited in place, inside `studio`.

### Schema

1. **Anchors move to versions.** `anchors` is keyed by `version_id`, so v7 of an element can cover ¶ 11–16 where v1 covered ¶ 12–14 without starting a new element. Anchors are append-only, like versions. Only text, image, render, and clip versions can be anchored; a design version cannot.
2. **`take_items.display`**: `beside` (default) shows the version with the book text; `replace` hides the book text and is rejected unless the version's body has a non-empty `lettering` array. Widened in 4d to text and render versions.
3. **House narration.** `narrations` and `narration_segments` move into 0001. `house_narrations` has one row per chapter (primary key `work_id, chapter`) pointing at a narration of that same chapter (composite foreign key). A deferred trigger requires the row whenever the chapter has any narration, so the rule is "exactly one per chapter that has a narration". A chapter with none has none, and the reader shows text only. Switching the house is one update; the house narration cannot be deleted. Narration segments are append-only.

`npm run test:db` covers each rule, including the failure cases. A copy of the migration with each rule removed fails it.

### Rendering (no schema)

4. **Screens and figures no take covers** render from their default template if one exists, otherwise as the source drew them. Templates live in `src/templates/` (id `setting/name`), are matched on `text_blocks.data`, and may use in-world fonts inside the template only. The first, `veridia/vote`, is registered in 4d. A take's `render` element always wins over the default.
5. **¶ labels count readable blocks only** (paragraph, quote, screen, figure), 1..N per chapter. Headings, datelines, and breaks have no label. Block IDs (`c{chapter}-b{idx}`) are unchanged and remain the anchor. Each scene ends with "Scene n · ¶ a–b", and each screen or figure is captioned with its label and source.

`npm run test:render` covers labels, settings, the template rule, and figure sizing.

### Reader

6. **Colour and type.**
   - Paper is `#F4F2ED` in every chapter (dark mode `#161614`).
   - The accent comes from each block's setting, which is taken from the most recent dateline: `#2E5A3A` for Veridia, `#B3306E` for Dzego. Every other setting uses ink, including the United Cities. The Arctic never tints the reader.
   - The accent appears on the dateline, the linked block, links, and quote rules.
   - Crimson Pro for reading, DM Mono for labels, both self-hosted at build. Source screens keep their own drawing, and in-world templates may use their own faces, inside the template only.
7. **Floors.**
   - Text is never below 12px.
   - Source screens that set smaller relative sizes get a larger base size. `text_blocks.data.frame.min_font_scale` records the smallest scale.
   - Figures render wide enough that their smallest SVG text is 12px, and scroll sideways inside their frame when that is wider than the screen. Ingest records `min_text` per SVG.
   - Tap targets are at least 44×44px. Links inside running text are exempt, per WCAG 2.5.8.
8. **First screen** says: an independent adaptation, not affiliated with the author, and there is no token.

`npm run check:ui -- --url=…` drives Chrome at 390px, in light and dark, across the home page, About, and all 32 chapters. It checks 12px text (SVG at rendered scale), 44px targets, chrome fonts, paper and accent colours, the first-screen wording, and sideways scroll. Planted CSS errors fail it.

### Design flags from the boards

| # | Flag | Status |
|---|------|--------|
| 1 | No element type for code-rendered set pieces | Done in v4: `render`. The suggested `viewport` goes inside `state` |
| 2 | Tables lose their device | Done in v4: `screen`/`figure` with `data` |
| 3 | Lettering has no translation | Done in v4: `lang`, `gloss`. The suggested `layout: full \| compact` is not added yet |
| 4 | Sections don't store a place | Done in v4: `location_entity_id`; locations have `setting` |
| 5 | Posters won't ingest as quotes | Not an issue: the source draws them as device views, so they ingest as `screen` blocks (c3-b5, c13-b64) |
| 6 | Device templates only exist inside takes | Done: default templates for uncovered blocks (item 4) |
| 7 | Images always replace text | Done: `take_items.display`. Put on the take item rather than the anchor, so one version can sit beside the text in one take and replace it in another |
| 8 | Anchor belongs to the element | Done: anchors per version |
| 9 | No rule picks the narration | Done: `house_narrations` |
| 10 | A chapter fills in only as fast as someone curates a take | Open; section-by-section assembly stays in Later |
| 11 | Block indices aren't paragraph numbers | Done: ¶ labels count readable blocks |

Not built in v4c: Listen (play view), takes, ratings.

## 4d. v4d: the last edit to 0001, and veridia/vote (Oct 2, 2026)

Migration 0001 is still unapplied. This is its last in-place edit; from here it is frozen and schema changes go in `0002`.

1. **`replace` widened.** A take item may use `display = 'replace'` when its version is an image whose body has a non-empty `lettering` array, a text element whose `text` is non-empty (not just spaces), or a render element. Designs and clips cannot replace, whatever their body holds. The database does not look at where a render is anchored; the app does, with `renderMayReplace` in `src/lib/render.ts`: a replacing render's anchor must cover screen or figure blocks and nothing else. `npm run test:db` covers each case, and a copy of the migration with any one clause removed fails it.
2. **`veridia/vote`**, the first default template (`src/templates/veridia-vote.ts`). It matches the vote card on a Veridian screen, a single table headed "Vote on: …" with a summary, a slider, and a button, which in the whole book is c1-b18 and c1-b31. It is drawn from the direction board's in-world screens: Instrument Sans (self-hosted, not preloaded, used only inside Veridian templates), hairline rules, a light device face that stays light in dark mode. It is static: the slider is drawn at the centre, where the source's untouched slider sits, and nothing reacts. `npm run test:render` checks that it covers exactly those two blocks, shows the same words as the source, contains no controls, and yields to a covering take.

---

## 4e. v5: proposals, picks, hand-made work, listening, wallets, attestations, donations (Oct 4, 2026)

Approved by the owner on Oct 4, 2026 (prompt log `docs/prompts/008-narration-and-images.md`). The schema is migration `0002_v5.sql`; its RLS keeps picks and consents private and makes proposals, donations and attestations public. The proposal as written is kept at `docs/SNOWMOON-BRIEF-V5-PROPOSAL.md`.

#### 0. Where things stand

- **Narration.** All 32 chapters are narrated locally with Kokoro-82M, stock
  voice `af_heart`, at no cost (10 h 50 min of audio, 99 min to generate on an
  M3 with 8 GB). Recipes are in `content/snowmoon/recipes/narration/`. Not yet
  uploaded to R2 and not yet in `narrations` / `narration_segments` /
  `house_narrations`. The player is not built. Milestone 3 is therefore
  generated but not shipped.
- **Images.** A first set was seeded by the project, rendered locally with
  FLUX.2 [klein] 4B: a style guide (`designs/styles/techno-vistas.json`), 22
  character profiles, 26 location profiles, and 142 key moments across the
  book. All are marked "starting point", not canon (rule 3). Recipes are in
  `content/snowmoon/recipes/images/`.

#### 1. Changes to the open decisions

| # | Decision | Now | Proposed |
|---|----------|-----|----------|
| 3 | Models | Not chosen; behind adapters | Behind adapters, **and limited to an allowlist** in `config/models.json` (section 2). People choose among listed models per generation. |
| 4 | Uploads of outside media | Not allowed in v1 | **Allowed for hand-made work** (drawings, paintings, sketches, voice recordings of one's own voice), with a source file encouraged and a signed statement that it is the uploader's own work (section 5). Still not allowed: AI images made elsewhere, since their prompts can't be verified. |
| 5 | Generation limits | Score 0.7, small daily allowance | Two lanes. **Instant** generations (hosted models, cost money) keep the allowance. **Proposals** (queued for free local rendering) get a much larger allowance, limited only for spam. |
| 7 | Narration voice | One house narration, synthetic | Synthetic house narration by default; **alternate narrations**, including **human recordings**, can be proposed and can become the house narration (section 7). |

Rule 9 changes from "Narration never imitates a real person" to: **"Synthetic
narration never imitates a real person. A human recording is only ever the
uploader's own voice, with consent recorded."**

#### 2. Model allowlist

`config/models.json`, one entry per approved model:

```json
{
  "id": "flux2-klein-4b",
  "kind": "image",
  "repo": "black-forest-labs/FLUX.2-klein-4B",
  "revision": "e7b7dc27f91deacad38e78976d1f2b499d76a294",
  "license_line": "license: apache-2.0",
  "license_checked": { "by": "<fid or name>", "on": "2026-10-03", "source": "<model card URL>" },
  "capabilities": { "max_references": 4, "edit": true },
  "runs_on": "local-queue",
  "cost_usd_per_unit": 0
}
```

- Adding a model is a reviewed pull request that quotes the license line from
  the model's own card, the same check Kokoro and FLUX.2 [klein] passed. Models
  whose licenses don't clearly allow publishing outputs under GPL-3.0 stay out
  (for example FLUX.2 [dev] and the [klein] 9B variants, which are
  non-commercial).
- The composer offers only listed models. The recipe records the exact model
  and revision, so the ledger and attestations say precisely what made each
  output.
- Speech models and voices use the same file (`kind: "speech"`).
- Current entries: Kokoro-82M with `af_heart` (speech), FLUX.2 [klein] 4B
  (image). Candidates once hardware allows: Qwen-Image-Edit-2511 and Qwen Image
  2.1, both to be license-checked first.

#### 3. Proposals and the local render queue

- A proposal is a generation request that hasn't run yet: prompt, chosen model,
  style guide, character and location profiles, anchor. It costs nothing to
  make, so its allowance can be large.
- The owner's Mac (or any trusted machine) runs `scripts/render-queue.*`: it
  takes queued requests in an order the owner chooses (for example highest
  rated first), renders them with local models, uploads the output to R2, and
  writes the version and its recipe in one transaction (rule 1), with
  `provider: local` and `cost_usd: 0`.

#### 4. Style guides, character profiles, location profiles, and "my picks"

- These are `design` elements on `style`, `character` and `location`
  entities, already in 0001. Each version has a reference image (a character
  sheet, a location plate, style samples) plus its text descriptor.
- New: a person can **pick** one version per entity. Every generation they make
  automatically includes their picks that apply to the scene: the style, the
  characters named in the passage, and the location of the section. Each use is
  written as a `uses` link (unchanged rule: references live only in `links`).
- Picks are pinned to a version, not to an element, so an author's later
  version never changes someone's images silently; the app shows "newer version
  available".
- With no picks, the defaults are the "most built on" versions (rule 3: nothing
  is official). This is how "the version people agree on" works without anyone
  declaring it canon.
- Locations are tagged per section (Milestone 2's `sections.location_entity_id`
  already exists), so the right location plate is loaded for the part of the
  story being illustrated.

#### 5. Hand-made uploads

- Image, drawing and painting uploads become versions with
  `recipe.source = 'human_authored'`. Uploading the layered source file (Krita,
  Procreate, PSD) is encouraged, since GPL means the preferred form for
  modification.
- On upload, the person confirms: it's their own work, not traced from someone
  else's, and it depicts no real person. Published under GPL-3.0 like
  everything else.
- Hand-made character sheets and style samples can be picked and used as
  references by everyone, which credits the artist through `uses` links and
  "most built on".
- Sketch-to-image: a rough hand sketch can be the composition reference for a
  generation; the sketch is linked with `uses`.

#### 6. Notes on the audiobook

- A note is a `text` element anchored to a block. Because audio is stored per
  block, the player shows notes while that passage is read, with no
  timestamps.
- Optionally posted as a reply cast in the chapter thread (Milestone 6), so the
  conversation lives on Farcaster.
- The spoiler rule (rule 10) applies: notes on later chapters are not shown
  early.

#### 7. Voices: the voice lab and human recordings

- **Voice lab.** Preview a passage with any listed voice, adjust speed, blend
  two stock voices into a new synthetic voice (Kokoro voices are numeric
  tensors), or assign voices per character using the speaker markup the book
  already has. Previews run in seconds; full chapters go through the proposal
  queue. No voice cloning and no uploading voice samples to imitate.
- **Human recordings.** Anyone can record themselves reading a block, a
  chapter, or the whole book, recorded in the app block by block or uploaded
  per chapter and split into blocks automatically. It becomes a narration with
  `source: human_authored` segments. Precedent: LibriVox.
- **Consent, shown before recording:**
  - The recording is a reading of a GPL-3.0 book, so it is published under
    GPL-3.0, credited to the name or handle you choose.
  - Anyone may reuse it under that license. The project never clones voices,
    but it cannot promise that nobody else will train a voice model on audio
    that is public.
  - You can ask for it to be hidden in the app; copies already shared under
    GPL can't be recalled.
  - Only your own voice. Under 18 needs a guardian's consent.

#### 8. Listening: the player, downloads, and a podcast feed

- **No video.** The player plays the audio and shows each image while its
  passage is read; that is the brief's existing play view of the living
  edition. Video is dropped from the plan.
- **Downloads.** Each chapter's audio can be downloaded as a file, with the
  license text and a link to the repository (the pipeline that made it) next to
  the button and in the file's metadata.
- **Podcast feed.** The house narration is also published as a free podcast:
  an RSS feed with one episode per chapter, served from the app
  (`scripts/podcast-feed.*` builds it from the narration recipes). Each episode
  description carries the GPL-3.0 notice, the source link, and a statement that
  the narration is synthetic. Podcast apps (Spotify, Apple Podcasts and others)
  read the feed on non-exclusive terms, and the same files stay downloadable
  without DRM, which is what GPL-3.0 requires.
- **Not** an audiobook-store listing: those usually require warranting rights we
  don't hold (the book is the author's) and add restrictions GPL-3.0 forbids.
- Before the feed is submitted to any platform: check that platform's current
  policy on AI narration and disclosure, and ask the author (a draft note is in
  `docs/outreach/author-note-draft.md`).

#### 9. Wallets, attestations, donations

- **Wallets.** Each recipe and version records the creator's payout and credit
  address at the time of creation (default: a Farcaster-verified address,
  changeable). Old work keeps the address it was made with.
- **Attestations (Milestone 4b, after the ledger).** For every generation, the
  app signs an EAS attestation: creator address, model and revision, prompt (or
  its hash), output link and sha256, and references to earlier attestations for
  `remixed_from` and `uses`. Off-chain signed attestations first (free,
  published with the ledger); selected items on-chain on Base later, such as
  weekly living-edition snapshots. Narration and other system generations are
  attested by the project account.
- **Donations.** ETH or USDC on Base sent directly to a published project
  address; the app reads the transfers and never holds funds. Each donation is
  recorded from the chain. It is linked to a Farcaster account automatically
  when the sending address is one of that account's verified addresses. A
  different credit address requires a signed message from the paying wallet;
  otherwise a typed address is stored as an unverified note. Donations fund
  generation (for example GPU time), and the ledger shows money in next to
  costs out. "There is no token" stays true: donations buy nothing and earn
  nothing. Tax and legal questions go to an accountant before this ships.

#### 10. Draft migration 0002

```sql
-- Who to credit, as of creation.
alter table studio.recipes add column credit_address text;

-- Model allowlist mirror (the repo file is the source of truth).
-- recipes.model / model_version already record what ran.

-- Proposals and the render queue.
create table studio.generation_requests (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references studio.works(id),
  element_type text not null check (element_type in ('image','narration')),
  model_id text not null,
  request jsonb not null,           -- prompt, picks, anchor, settings
  status text not null default 'proposed'
    check (status in ('proposed','queued','rendered','rejected','withdrawn')),
  version_id uuid references studio.element_versions(id),
  created_by_fid bigint not null,
  created_at timestamptz not null default now(),
  check ((status = 'rendered') = (version_id is not null))
);

-- "My picks": one pinned version per entity per person.
create table studio.picks (
  fid bigint not null,
  entity_id uuid not null references studio.entities(id),
  version_id uuid not null references studio.element_versions(id),
  picked_at timestamptz not null default now(),
  primary key (fid, entity_id)
);

-- Consent for human recordings and hand-made uploads.
create table studio.contributor_consents (
  id uuid primary key default gen_random_uuid(),
  fid bigint not null,
  kind text not null check (kind in ('handmade_upload','voice_recording')),
  consent_text_sha256 text not null,  -- hash of the exact wording shown
  guardian boolean not null default false,
  created_at timestamptz not null default now()
);

-- Donations, read from the chain.
create table studio.donations (
  id uuid primary key default gen_random_uuid(),
  chain text not null,
  tx_hash text not null,
  from_address text not null,
  token text not null,
  amount numeric not null check (amount > 0),
  usd_at_time numeric(12,2),
  fid bigint,                        -- set only via a verified address
  credit_address text,
  credit_address_verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (chain, tx_hash)
);

-- Attestations (Milestone 4b).
create table studio.attestations (
  uid text primary key,
  recipe_id uuid references studio.recipes(id),
  donation_id uuid references studio.donations(id),
  onchain boolean not null default false,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
```

No change is needed for location profiles: 0001's `entities.kind` already allows `location`.

#### 11. Order

1. Ship Milestone 3: upload narration to R2, write `narrations`,
   `narration_segments`, `house_narrations`, build the player.
2. Milestone 4 with the allowlist, picks, proposals, and hand-made uploads.
3. Milestone 4b: attestations and wallets.
4. Notes, the voice lab and human recordings alongside Milestone 5.
5. Donations with or before Milestone 7.
6. The podcast feed once narration is hosted in R2, after the author note.

---

## 5. Data model

### Core (migration 0001)

`supabase/migrations/0001_core.sql` is the source of truth. Every table below lives in the `studio` schema (shown unqualified here for reading); the migration adds the schema, the `studio_writer` role, indexes, append-only triggers, RLS policies, and grants.

```sql
create table works (
  id text primary key,
  title text not null,
  license text not null,
  source_url text not null,
  created_at timestamptz not null default now()
);

create table text_blocks (
  id bigint generated always as identity primary key,
  work_id text not null references works(id),
  chapter int not null,
  idx int not null,
  kind text not null check (kind in ('heading','dateline','paragraph','quote','screen','figure','break')),
  content text not null,
  content_hash text not null,
  read_aloud text,
  data jsonb,
  unique (work_id, chapter, idx),
  check (data is null or kind in ('screen','figure'))
);

create table entities (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references works(id),
  kind text not null check (kind in ('character','location','prop','style')),
  name text not null,
  setting text check (setting ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  first_chapter int,
  unique (work_id, kind, name)
);

-- After entities, so a section can point at its location.
create table sections (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references works(id),
  chapter int not null,
  idx int not null,
  start_idx int not null,
  end_idx int not null,
  title text,
  location_entity_id uuid references entities(id),
  time_of_day text,
  season text,
  unique (work_id, chapter, idx),
  check (end_idx >= start_idx)
);

create table entity_mentions (
  id bigint generated always as identity primary key,
  entity_id uuid not null references entities(id),
  chapter int not null,
  idx int not null,
  fact text not null,
  quote text not null
);

create table elements (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references works(id),
  element_type text not null check (element_type in ('design','text','image','clip','render')),
  entity_id uuid references entities(id),
  created_by_fid bigint not null,
  status text not null default 'published' check (status in ('draft','published','hidden')),
  created_at timestamptz not null default now(),
  check ((element_type = 'design') = (entity_id is not null))
);

create table recipes (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('in_app','human_authored')),
  provider text,
  model text,
  model_version text,
  prompt text,
  params jsonb not null default '{}'::jsonb,
  seed bigint,
  assist jsonb,
  cost_usd numeric(10,4),
  created_by_fid bigint not null,
  created_at timestamptz not null default now()
);

create table element_versions (
  id uuid primary key default gen_random_uuid(),
  element_id uuid not null references elements(id),
  version_no int not null,
  body jsonb not null default '{}'::jsonb,
  asset_url text,
  asset_sha256 text,
  recipe_id uuid references recipes(id),
  created_at timestamptz not null default now(),
  unique (element_id, version_no)
);

create table links (
  id uuid primary key default gen_random_uuid(),
  from_version_id uuid not null references element_versions(id),
  to_version_id uuid not null references element_versions(id),
  kind text not null check (kind in ('remixed_from','uses')),
  unique (from_version_id, to_version_id, kind),
  check (from_version_id <> to_version_id)
);

-- Per version, so a later version can cover a different span. Append-only.
create table anchors (
  version_id uuid primary key references element_versions(id),
  work_id text not null references works(id),
  chapter int not null,
  start_idx int not null,
  end_idx int not null,
  check (end_idx >= start_idx)
);

create table ratings (
  version_id uuid not null references element_versions(id),
  fid bigint not null,
  value smallint not null check (value between -5 and 5),
  created_at timestamptz not null default now(),
  primary key (version_id, fid)
);

create table takes (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references works(id),
  chapter int not null,
  title text not null,
  created_by_fid bigint not null,
  parent_take_id uuid references takes(id),
  status text not null default 'published' check (status in ('draft','published','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table take_items (
  take_id uuid not null references takes(id),
  version_id uuid not null references element_versions(id),
  pos int not null default 0,
  -- replace: image with lettering, text with text, or render (section 4d)
  display text not null default 'beside' check (display in ('beside','replace')),
  primary key (take_id, version_id)
);

create table take_likes (
  take_id uuid not null references takes(id),
  fid bigint not null,
  created_at timestamptz not null default now(),
  primary key (take_id, fid)
);

create table living_snapshots (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references works(id),
  chapter int not null,
  taken_at timestamptz not null default now(),
  take_id uuid references takes(id),
  items jsonb not null,
  score numeric
);

-- Narration tables are in 0001 so the house rule holds from the start (section 4c).
create table narrations (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references works(id),
  chapter int not null,
  label text not null,
  created_by_fid bigint not null,
  created_at timestamptz not null default now(),
  unique (id, work_id, chapter)
);

create table narration_segments (
  narration_id uuid not null references narrations(id),
  idx int not null,
  asset_url text not null,
  asset_sha256 text not null,
  duration_ms int not null check (duration_ms > 0),
  recipe_id uuid not null references recipes(id),
  primary key (narration_id, idx)
);

-- Exactly one per chapter that has any narration (key + deferred trigger).
create table house_narrations (
  work_id text not null references works(id),
  chapter int not null,
  narration_id uuid not null,
  primary key (work_id, chapter),
  foreign key (narration_id, work_id, chapter) references narrations (id, work_id, chapter)
);
```

### Later migrations (draft; create with the milestone that needs them)

```sql
-- Milestone 6
create table chapter_threads (
  work_id text not null references works(id),
  chapter int not null,
  root_cast_hash text not null unique,
  opened_at timestamptz not null default now(),
  primary key (work_id, chapter)
);

create table timeline_items (
  id bigint generated always as identity primary key,
  work_id text not null references works(id),
  chapter int not null,
  kind text not null check (kind in ('reply','quote','activity')),
  cast_hash text unique,
  author_fid bigint,
  body text not null,
  element_id uuid references elements(id),
  take_id uuid references takes(id),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  check ((kind = 'activity') = (cast_hash is null))
);

create table digests (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references works(id),
  chapter int not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  body jsonb not null,
  recipe_id uuid not null references recipes(id),
  check (period_end > period_start)
);

create table last_seen (
  fid bigint not null,
  work_id text not null references works(id),
  chapter int not null,
  seen_at timestamptz not null default now(),
  primary key (fid, work_id, chapter)
);

-- Milestone 7
create table credit_grants (
  id uuid primary key default gen_random_uuid(),
  sponsor_fid bigint not null,
  creator_fid bigint not null,
  amount_usd numeric(12,2) not null check (amount_usd > 0),
  chain text not null,
  tx_hash text not null,
  created_at timestamptz not null default now(),
  unique (chain, tx_hash)
);

alter table recipes
  add column funded_by_grant_id uuid references credit_grants(id);
```

**Notes on the model**

- **Version vs remix.** A version is the same author iterating on their own element. A remix is a new element by anyone, linked with `remixed_from` to the exact version it started from.
- **References have one source of truth.** Which design versions an image used is recorded only as `uses` links. Do not also store a reference list on the recipe.
- **Anchors are per version, on blocks, never on time.** Time is derived from the narration's segment durations, so alternate narrations work later without touching anchors.
- **Append-only.** `recipes`, `element_versions`, `links`, `narration_segments`, and `digests` reject UPDATE and DELETE (trigger plus RLS). Hiding is done with `status` or `hidden`.
- **System generations** (narration, digests, analysis) use the project account's FID as `created_by_fid`.
- **`body` by type** (typed in `src/lib/element-body.ts`). `design`: `{ "description": "" }`. `text`: `{ "text": "" }`. `image`: `{ "lettering": [ { "kind": "caption|speech|thought|sfx", "text": "", "lang": "en|dz", "gloss": null, "speaker_entity_id": null, "x": 0, "y": 0, "w": 0 } ] }` with x, y, w as fractions from 0 to 1. `text` is the line as shown in its own language; `gloss` is the translation shown with it (a Dzegoban line's English), or null. `render`: `{ "template": "path/in/repo", "template_commit": "<sha>", "state": {} }`.
- **`assist`.** If a language model helped write a prompt, store its model, the prompt file path and commit, and the user's instruction.
- **Settings and seasons.** `entities.setting` and `text_blocks.data.setting` use the same slugs, taken from the datelines: `veridia`, `dzego`, `united-cities`. `sections.time_of_day` and `sections.season` are free text for now; constrain them once Milestone 2 output shows the real values.
- **Grant balance** is the grant amount minus the sum of `cost_usd` on recipes funded by it. Do not store a balance column.
- **RLS.** Public read on everything except drafts and hidden items. Writes only through server routes connected as `studio_writer`, after checking the signed-in FID. The service role is not used and has no grants in `studio`.

---

## 6. Rules that must hold

1. **No recipe, no generation.** A generated version and its recipe are written in one transaction.
2. **Record what was sent.** The stored prompt is the final string sent to the provider. Store the provider's reported model version and the actual cost.
3. **Nothing is official.** No field, flag, role, or copy anywhere marks an element or take as canon, final, or approved. Defaults come from the scoring rule below and are labeled as what they are: "top rated", "most built on".
4. **Scoring.** All thresholds live in one exported config.
   - A rater's ratings count only once they have rated at least `MIN_RATINGS` versions.
   - Normalize each rater's ratings to mean zero and unit variance. If all of a rater's ratings are equal, they all count as zero.
   - A version's score is the mean of its normalized ratings, and exists only when it has at least `MIN_RATERS` counted raters. Otherwise it is unranked and counts as zero.
   - A take's score is the average, over every block in the chapter, of the score of the element covering that block. Blocks showing book text count as zero.
   - The living edition is the take with the highest score. Ties go to greater coverage, then to the most recently updated.
   - Before any take in a chapter has a ranked element, use the take with the most likes, and with no likes, show the book.
5. **Text is the spine.** Every version of a text, image, or render element has an anchor (design versions never do). The default view of a chapter is its living edition.
6. **Evidence for analysis.** No fact from the analysis pipeline is stored or shown without a block reference and an exact quote that passes the verifier.
7. **One source of truth for constants.** Caps, thresholds, moderator FIDs, and model names each live in one exported config.
8. **Everything in the repo.** Ingest and analysis scripts, prompt files, read-aloud overrides, and rendered-screen templates are committed.
9. **No real voices.** Synthetic narration never imitates a real person. A human recording is only ever the uploader's own voice, with consent recorded.
10. **No spoilers by default.** Reader-facing views never show analysis, entity facts, or timeline digests from chapters beyond the one being read.

---

## 7. Working rules for this repo

- Migrations are SQL files in the repo. The maintainer applies them by hand in the Supabase SQL Editor after a dry run. Never apply SQL from a terminal with a privileged key.
- "Shipped" means verified live with `npm run check:shipped`.
- Any automated check must be shown to fail on a planted error before it is trusted.
- Production filesystem on Vercel is read-only. Anything edited at runtime lives in the database.
- Generated images and audio go to Cloudflare R2. Store the sha256 of every asset.

---

## 8. License and attribution

- `ATTRIBUTION.md` and an in-app About page state: *Snowmoon* was written by Vitalik Buterin and released under GPL v3, with a link to the source. This project is an independent adaptation and is not affiliated with or endorsed by the author.
- The repo is GPL-3.0.
- Before a first contribution, the user agrees that their prompts and generated media are published under GPL-3.0 and recorded permanently in the public ledger.
- The author's reading of how GPL applies to adaptations is his own stated theory and has not been tested. Do not write copy that presents it as settled law.
- There is no token. Say so plainly on the About page.

---

# PART B: Claude Design

## Start here

Before any screens, deliver three direction boards and stop for review.

1. **Veridia.** Palette, type, texture, and how its in-world screens look. Reference: the Kalimar path in chapter 1.
2. **Dzego.** The same for the second world. Reference: Hun Min street and the foil-lined classroom in chapter 2.
3. **The Minpentai board.** A code-renderable design for the game: cells, gliders, walls, player symbols, fog over unseen areas. Reference: the match in chapter 4.

## What to mock

Mobile-first, inside a Farcaster miniapp. Mock these for Chapter 1, in this order.

1. **Living edition, scroll view.** The chapter as a mix of book text and illustrated spans. This is the home screen. Show three states: all text (day one), partly illustrated, mostly illustrated.
2. **Living edition, play view.** The same chapter with the audio player: current block highlighted, the image for the current block shown, and an "add an image to this moment" action.
3. **Element detail.** One image or design, large. Below it: the full recipe (prompt, model, cost, who funded it), which design versions it was built on, what it was remixed from, what was remixed from it, and its rating control (a -5 to 5 slider like the one in the book).
4. **Entity page.** Example: Gladias. What the book says, then every proposed design and its versions, sortable by most built on and by rating. Nothing is marked official.
5. **Composer.** Add or remix an image for a selected span: the text, reference chips for chosen design versions, a prompt box, lettering placed on the result.
6. **Take view and remix.** Whose take this is, what it was remixed from, coverage of the chapter, and a mode for swapping elements.
7. **Chapter timeline.** The root cast, the running stream of replies, quote casts, and activity, and the "catch me up" result with linked lines.
8. **Creator profile.** Elements made, times built on, weeks in the living edition, sponsors, and a "sponsor this creator" action.
9. **Share card.** How a shared moment appears in a cast.

## Direction

- The recipe is the point of the product. Make it a first-class part of every element, not a hidden drawer.
- Nothing should look final or official. The interface should make it obvious that every part can be replaced by something better.
- Take cues from the book. Veridia is green, wooded, stone-built, calm, and clean. The Privacy Robe is dark purple. Dzego is low-rise, dense, and electric: blinking shop signs, cute cartoon animals on walls, underground rooms, a mountain carved into a pyramid. The app's own chrome should sit neutrally between the two worlds.
- The book's hand-device screens are plain tables with a slider and a Select button; the app's own controls can echo that plainness.
- Reading and listening come first. Text must be comfortable for a whole chapter.
- Leave a visible but inactive place for video on the element detail and play view.
- Avoid a generic crypto-app look and avoid a wiki look. It is a book that people are illustrating together.

## Deliverables

One mockup per screen, plus light and dark variants of the living edition scroll view. Note any place where the data model in Part A makes a screen awkward, so the model can change before it is built.
