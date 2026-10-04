# Brief v5: proposal

**Status: proposal, not adopted.** Written Oct 4, 2026 from the owner's requests
in `docs/prompts/008-narration-and-images.md`. Nothing here changes the brief
until the owner approves it; approved parts move into
`SNOWMOON-BUILD-BRIEF.md` as section 4e and into migration `0002`.

## 0. Where things stand

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

## 1. Changes to the open decisions

| # | Decision | Now | Proposed |
|---|----------|-----|----------|
| 3 | Models | Not chosen; behind adapters | Behind adapters, **and limited to an allowlist** in `config/models.json` (section 2). People choose among listed models per generation. |
| 4 | Uploads of outside media | Not allowed in v1 | **Allowed for hand-made work** (drawings, paintings, sketches, voice recordings of one's own voice), with a source file encouraged and a signed statement that it is the uploader's own work (section 5). Still not allowed: AI images made elsewhere, since their prompts can't be verified. |
| 5 | Generation limits | Score 0.7, small daily allowance | Two lanes. **Instant** generations (hosted models, cost money) keep the allowance. **Proposals** (queued for free local rendering) get a much larger allowance, limited only for spam. |
| 7 | Narration voice | One house narration, synthetic | Synthetic house narration by default; **alternate narrations**, including **human recordings**, can be proposed and can become the house narration (section 7). |

Rule 9 changes from "Narration never imitates a real person" to: **"Synthetic
narration never imitates a real person. A human recording is only ever the
uploader's own voice, with consent recorded."**

## 2. Model allowlist

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

## 3. Proposals and the local render queue

- A proposal is a generation request that hasn't run yet: prompt, chosen model,
  style guide, character and location profiles, anchor. It costs nothing to
  make, so its allowance can be large.
- The owner's Mac (or any trusted machine) runs `scripts/render-queue.*`: it
  takes queued requests in an order the owner chooses (for example highest
  rated first), renders them with local models, uploads the output to R2, and
  writes the version and its recipe in one transaction (rule 1), with
  `provider: local` and `cost_usd: 0`.

## 4. Style guides, character profiles, location profiles, and "my picks"

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

## 5. Hand-made uploads

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

## 6. Notes on the audiobook

- A note is a `text` element anchored to a block. Because audio is stored per
  block, the player shows notes while that passage is read, with no
  timestamps.
- Optionally posted as a reply cast in the chapter thread (Milestone 6), so the
  conversation lives on Farcaster.
- The spoiler rule (rule 10) applies: notes on later chapters are not shown
  early.

## 7. Voices: the voice lab and human recordings

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

## 8. Listening: the player, downloads, and a podcast feed

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

## 9. Wallets, attestations, donations

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

## 10. Draft migration 0002

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

## 11. Order

1. Ship Milestone 3: upload narration to R2, write `narrations`,
   `narration_segments`, `house_narrations`, build the player.
2. Milestone 4 with the allowlist, picks, proposals, and hand-made uploads.
3. Milestone 4b: attestations and wallets.
4. Notes, the voice lab and human recordings alongside Milestone 5.
5. Donations with or before Milestone 7.
6. The podcast feed once narration is hosted in R2, after the author note.
