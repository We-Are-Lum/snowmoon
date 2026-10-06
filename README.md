# Snowmoon Living Edition

A Farcaster miniapp for reading Vitalik Buterin's novel
[*Snowmoon*](https://vitalik.eth.limo/snowmoon/) (GPL v3) and, over time,
building an open illustrated and narrated edition of it together. Every
prompt, script, and piece of data used to make it is in this repository.

Working title. Licensed GPL-3.0, the same as the book. See
[ATTRIBUTION.md](ATTRIBUTION.md).

**Status: Milestone 1 plus brief v4.** Scaffold, ingest, and reader; not
yet deployed. See [docs/SNOWMOON-BUILD-BRIEF.md](docs/SNOWMOON-BUILD-BRIEF.md)
for the full plan, [docs/design/](docs/design/) for the design direction, and
[docs/prompts/](docs/prompts/) for the prompts used to build it.
`docs/SNOWMOON-CHAPTER-NOTES.md` contains full-book spoilers.

## Replicate it

```sh
npm install
npm run ingest -- --offline   # re-parse the committed source HTML into content/snowmoon/text/
npm run check:ingest          # 32 chapters, exact text coverage, byte-identical re-run
npm run build && npm start    # reader at http://localhost:3000
```

`npm run ingest` (without `--offline`) re-fetches the 32 chapters from the
source site and updates `content/snowmoon/source/` if the author has changed
anything. Commit both directories together.

## What is published, and what is not

| Published here | Never committed |
|----------------|-----------------|
| Source HTML snapshots and parsed text | `.env*.local` and any API key |
| All scripts, checks, and migrations | The `studio_writer` password and connection string |
| Prompts, recipes, analysis output (later milestones) | `private/` (local scratch notes) |
| Planning docs, build prompts, and source figures in `docs/` | |

Secrets live only in `.env.local` locally and in Vercel environment
variables in production. `.env.example` lists the names.

## Data

`content/snowmoon/text/chapter-N.json`:

```json
{
  "work_id": "snowmoon",
  "chapter": 1,
  "source_url": "https://vitalik.eth.limo/snowmoon/html/chapter-1.html",
  "source_sha256": "…",
  "fetched_at": "2026-10-02",
  "license": "GPL-3.0",
  "blocks": [{ "idx": 0, "kind": "heading", "content": "# Chapter 1", "sha256": "…" }]
}
```

Block kinds: `heading`, `dateline`, `paragraph`, `quote`, `screen`, `figure`,
`break`. Content is Markdown. Some things are carried as inline HTML,
which is valid in Markdown:

- **Speaker colours** become `<span data-hue="…">`. The source colours each
  speaker's dialogue with an OKLCH hue.
- **`screen`** blocks (hand-device screens, messages) and **`figure`** blocks
  (SVG boards, maps, diagrams) keep the source HTML, with scripts and event
  handlers removed. So do the Dzegoban lyric cards, which are `quote` blocks.

`screen` and `figure` blocks also carry `data`:

```json
{
  "setting": "veridia",
  "setting_evidence": { "idx": 1, "quote": "Meldan, Veridia" },
  "device": "hand_device",
  "device_evidence": { "idx": 17, "quote": "Shortly after he began walking beside the soundproof barrier, his hand device buzzed." },
  "device_provisional": true,
  "frame": { "width": "narrow", "align": "center", "style": null },
  "fields": [{ "type": "table", "header": [["Vote on: Badra St #1103"]], "rows": [["Emerald AI summary: …"], [{ "text": "", "controls": [{ "type": "slider", "labels": ["-5", "0", "5"] }] }]] }]
}
```

`setting` comes from the most recent dateline. `device` is provisional: it is
found by keyword in the paragraphs just before the screen, is `null` when the
text doesn't say, and will be replaced in Milestone 2 by the device's owner,
with evidence. Each comes with a block index and an exact quote, which the ingest check
verifies. Every source SVG is also exported standalone to
`docs/source-figures/c{chapter}-b{idx}.svg`.

Every block is addressable as `#c{chapter}-b{idx}`, e.g. `/chapter/1#c1-b18`.
`fetched_at` only changes when a chapter's source bytes change, so re-running
ingest is deterministic.

## Database

The app runs in a shared studio database. Everything it creates lives in the
`studio` schema, and nothing goes in `public`.

`supabase/migrations/` holds SQL files that are applied by hand in the SQL
Editor. Do a dry run first: replace the final `commit;` with `rollback;`.
Never apply migrations from a terminal with a privileged key.

After applying `0001_core.sql`:

1. In the SQL Editor, give the writer role a login. Generate the password and
   never commit it: `alter role studio_writer with login password '…';`
2. Project Settings → Data API → Exposed schemas: add `studio`. This is only
   needed for public reads through the API.
3. Set `STUDIO_DATABASE_URL` to the transaction pooler connection string, with
   the user `studio_writer.<project-ref>`.

Server writes connect as `studio_writer`, which can read and write `studio`
rows and nothing else. The service role is not used. Brief §4b explains why
and what this costs.

Apply `0002_v5.sql` after `0001_core.sql`, the same way (dry run first). It
adds proposals, picks, consents, donations and attestations (brief §4e).

`npm run seed:text` loads the text blocks as `studio_writer`. It is safe to
re-run; use `-- --dry-run` to preview without credentials. `npm run test:db`
runs the migration and permission tests in an in-memory Postgres.

## Scripts

| Command | What |
|---------|------|
| `npm run ingest` | Fetch and parse all chapters |
| `npm run check:ingest` | Ingest checks (fails on any problem) |
| `npm run seed:text` | Upsert `studio.works` and `studio.text_blocks` |
| `npm run test:db` | Migration and permission tests (PGlite) |
| `npm run test:render` | Rendering rules: ¶ labels, settings, default templates, figure sizing |
| `npm run check:ui -- --url=…` | Reader floors in Chrome at 390px: 12px text, 44px targets, fonts, colours, first screen, first-visit intro |
| `npm run check:intro -- [--url=…]` | First-visit intro (`config/intro.json`): five cards, live cards point at real pages, card 1 keeps the independence and no-token line |
| `npm run check:shipped` | Verify a live deployment runs the expected commit, serves the reader, and its narration and images load |
| `npm run publish:narration` | Upload the narration (per-block and per-chapter audio) to R2 and write `content/snowmoon/narration/` |
| `npm run seed:narration` | Write narrations, segments, recipes and house narrations from that index (skips chapters already done) |
| `npm run check:principles` | The automated checks for `docs/principles.md`, each proven to fail on a planted violation (`--url=` to target another deployment) |
| `npm run check:adaptations` | Every block ID cited under `adaptations/` exists; seeds and folders match |
| `npm run publish:images` | Upload the seeded key-moment images to R2 and write `content/snowmoon/illustrations/published.json` |

Local generation (Python, not npm): `scripts/narrate.py` (speech, Kokoro),
`scripts/illustrate.py` (images, FLUX.2 [klein] via mflux),
`scripts/letter-images.py` (draws a job's `lettering` over its image, since
prompts keep images free of writing), and
`scripts/podcast-feed.py` (RSS feed). Their setup is at the top of each file.

## Media

Audio and images are served from Cloudflare R2 at `media.snowmoon.party`.
Uploads run only from a trusted machine with a key scoped to the one bucket;
the deployed app never holds R2 keys, only `R2_PUBLIC_URL`. Keys carry each
file's sha256, so objects are immutable and cached forever, and re-running a
publish script uploads only what is missing.

`.env.local` needs `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET` and `R2_PUBLIC_URL`. With the Vercel CLI linked to the project,
`vercel env pull .env.local --environment=development` fetches them; the R2
keys are stored in Vercel for the Development environment only.

## Sign in

Sign in uses Farcaster Quick Auth. The client calls `sdk.quickAuth.fetch`,
which sends the token as `Authorization: Bearer …`. The server verifies it on
every request (`src/lib/auth.ts`). There are no cookies, because on Farcaster
web the app runs in a cross-site iframe where third-party cookies may be
blocked. Reading never requires signing in.
