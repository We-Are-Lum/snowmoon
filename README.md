# Snowmoon Living Edition

A Farcaster miniapp for reading Vitalik Buterin's novel
[*Snowmoon*](https://vitalik.eth.limo/snowmoon/) (GPL v3) and, over time,
building an open illustrated and narrated edition of it together. Every
prompt, script, and piece of data used to make it is in this repository.

Working title. Licensed GPL-3.0, the same as the book. See
[ATTRIBUTION.md](ATTRIBUTION.md).

**Status: Milestone 1 plus brief v4.** Scaffold, ingest, and reader; not
yet deployed. See [docs/SNOWMOON-BUILD-BRIEF.md](docs/SNOWMOON-BUILD-BRIEF.md)
for the full plan, and [docs/prompts/](docs/prompts/) for the prompts used to
build it.
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
| All scripts, checks, and migrations | The Supabase service role key |
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
  "world": "veridia",
  "world_evidence": { "idx": 1, "quote": "Meldan, Veridia" },
  "device": "hand_device",
  "device_evidence": { "idx": 17, "quote": "Shortly after he began walking beside the soundproof barrier, his hand device buzzed." },
  "device_provisional": true,
  "frame": { "width": "narrow", "align": "center", "style": null },
  "fields": [{ "type": "table", "header": [["Vote on: Badra St #1103"]], "rows": [["Emerald AI summary: …"], [{ "text": "", "controls": [{ "type": "slider", "labels": ["-5", "0", "5"] }] }]] }]
}
```

`world` comes from the most recent dateline. `device` is provisional: it is
found by keyword in the paragraphs just before the screen, is `null` when the
text doesn't say, and will be replaced in Milestone 2 by the device's owner,
with evidence. Each comes with a block index and an exact quote, which the ingest check
verifies. Every source SVG is also exported standalone to
`docs/source-figures/c{chapter}-b{idx}.svg`.

Every block is addressable as `#c{chapter}-b{idx}`, e.g. `/chapter/1#c1-b18`.
`fetched_at` only changes when a chapter's source bytes change, so re-running
ingest is deterministic.

## Database

`supabase/migrations/` holds SQL files that are applied by hand in the
Supabase SQL Editor. Do a dry run first: replace the final `commit;` with
`rollback;`. Never apply migrations from a terminal with the service role
key.

After `0001_core.sql` is applied, `npm run seed:text` loads the text blocks.
It is safe to re-run. Use `-- --dry-run` to preview it without credentials.

## Scripts

| Command | What |
|---------|------|
| `npm run ingest` | Fetch and parse all chapters |
| `npm run check:ingest` | Ingest checks (fails on any problem) |
| `npm run seed:text` | Upsert `works` and `text_blocks` into Supabase |
| `npm run check:shipped` | Verify a live deployment runs the expected commit and serves the reader |

## Sign in

Sign in uses Farcaster Quick Auth. The client calls `sdk.quickAuth.fetch`,
which sends the token as `Authorization: Bearer …`. The server verifies it on
every request (`src/lib/auth.ts`). There are no cookies, because on Farcaster
web the app runs in a cross-site iframe where third-party cookies may be
blocked. Reading never requires signing in.
