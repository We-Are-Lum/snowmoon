# Privacy Policy and the designs work: what is not covered (2026-10-10)

Styles, character sheets, forks and My picks (step 4, `docs/proposals/style-guides-and-sheets.md`,
branch `site-images-designs-2`) store and send things the Privacy Policy (`src/lib/legal.ts`, the
owner's words) was written before. This file lists each new thing stored or sent, quotes the
Privacy sentence that covers it, or says **not covered**. The Privacy and Terms words are not
changed here: the owner writes them. Written by the coding agent; line numbers are on this branch.

No new outside service: the designs use the services already named (fal.ai, Groq / Vercel AI
Gateway, Cloudflare, Supabase, Farcaster's public API, ntfy). Neynar is not asked for designs
today, since making designs is for invited FIDs only and invited FIDs skip the lookup
(`src/lib/images/gate.ts:39`). What changes is what two of them receive (rows 7–9). The P6g–P6j
service checks still pass for that reason: they compare names, not what each receives.

## Stored by us, under the maker's or the reader's Farcaster ID

| # | What | Where (evidence) | Privacy sentence | Verdict |
|---|---|---|---|---|
| 1 | A published style or sheet: its name, text, sample pictures or views, each picture's recipe (prompt, model, seed, cost, date), the maker's FID and username | `studio.elements` / `element_versions` with `created_by_fid` (`src/lib/images/designs.ts:308`, `:311`); username looked up at `src/app/api/designs/route.ts:120`; pictures to the public bucket at `:121` | §6: "Anything you publish is public, shown with your Farcaster username (your Farcaster ID on quote cards), the date, and the record of how it was made." §4 lists only "Images you publish, with their prompt, your Farcaster username and the record of how they were made." | Covered as published work by §6; **not covered** by §4's list, which names images only (styles and sheets are not images, and their text is not a prompt) |
| 2 | A new style or character entity row (the style's name; for a character, the book's name, setting and first chapter) | `src/lib/images/designs.ts:284`, `:291` | §6 (published) | Covered by §6; holds no personal data apart from the design's maker (row 1) |
| 3 | A fork's credit: a permanent `remixed_from` link from the fork to the source version, so the source maker's name shows on the fork | `src/lib/images/designs.ts:312`; credit shown on the design page | §6 "…and the record of how it was made." | Covered in part: that **your work stays linked, by name, from other people's forks for good** (even after you hide it the credit stays as text) is **not covered** (Terms §5 says others may copy under the licence; nothing says the credit link is kept) |
| 4 | An image's `uses` links to the styles and sheets added to it, and their full text in its public prompt | `src/app/api/images/publish/route.ts:43-44`; the text joined into the prompt at `src/app/api/images/generate/route.ts:90` | §4 "Images you publish, with their prompt … and the record of how they were made." | Covered |
| 5 | **My picks**: one row per person per style or character (`fid`, `entity_id`, `version_id`, `picked_at`), on the server, private (no public read; only ever read for the signed-in FID); kept until you clear it | `studio.picks` (`supabase/migrations/0002_v5.sql:60-66`, RLS `:211`, `:240`); written at `src/lib/images/designs.ts:386`, cleared at `:393`; route `src/app/api/designs/picks/route.ts` | §4's list (cards, likes, consent, hidden work, images, counts, reports, Minpentai). §3 "a few other settings of yours" is for the device only. | **Not covered**. Open to everyone signed in (owner, 2026-10-10), so any reader can now create these rows |
| 6 | Samples and views made for a design count toward the day's image count; a design's publication counts toward "3 designs a day" | `studio.image_asks` via `reserve` (`src/lib/images/paid.ts:39`); the day's designs counted from `studio.elements` (`src/lib/images/designs.ts:253`) | §4 "How many images you make each day, to count the daily limit, and the reports you make." | Covered for samples and views (they are pictures you make); the designs-a-day count reads published rows (row 1), nothing new is stored |
| 7 | Reports and hides of a style or sheet | `studio.removal_log` (`src/app/api/images/[id]/report/route.ts`, `hide/route.ts`) | §4 "…and the reports you make." §4 "…any of your own work you have hidden." | Covered |

## Sent to outside services

| # | What | Where (evidence) | Privacy sentence | Verdict |
|---|---|---|---|---|
| 8 | **fal.ai receives pictures**, not only prompts: (a) a sheet's front view (the maker's own, not yet published) as a `data:` URI, to make the side and back views; (b) when a reader ticks "Use {name}'s sheet pictures as a reference", up to 3 published views of a picked sheet (anyone's) as `data:` URIs. The server fetches (b) from our own bucket and checks each sha256; fal fetches nothing. Endpoint FLUX.2 [klein] 4B edit, `X-Fal-Store-IO: 0` | `src/lib/images/fal.ts:68-80` (`image_urls` as data URIs, `:78`), header `:30`; (a) `src/app/api/designs/sample/route.ts:73`; (b) `src/app/api/images/generate/route.ts:95-111` | §7 "fal.ai receives the prompt for an image you make, and makes the image. It is asked to keep no copy." | **Not covered**: fal.ai receiving reference pictures (your unpublished front view; others' published views) |
| 9 | fal.ai receives the prompts for samples and views: a fixed subject line plus the style or sheet text | `src/app/api/designs/sample/route.ts:65-73` | §7 "fal.ai receives the prompt for an image you make" | Covered if a sample or view counts as "an image you make"; the owner may want to say so |
| 10 | Groq (or Vercel AI Gateway when Groq is busy) receives (a) the style or sheet text with every sample and view prompt; (b) a picked style's and sheets' text together with the reader's prompt at Generate; (c) **a style's or sheet's name at publish**, checked alone | (a) `src/app/api/designs/sample/route.ts:71`; (b) `src/app/api/images/generate/route.ts:109`; (c) `src/app/api/designs/route.ts:117` via `checkWords` (`src/lib/images/paid.ts:77-89`) | §7 "Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, and the prompts for images you make, which are checked against the published rules." | (a), (b) covered (they are part of a prompt for an image you make). (c) **not covered**: a design's name is not a prompt |
| 11 | Cloudflare stores and serves the samples and views (public bucket, `images/readers/` by sha256; moved to the private bucket when hidden) | `src/app/api/designs/route.ts:121`; hide moves every file `src/app/api/images/[id]/hide/route.ts` | §7 "Cloudflare stores and serves the pictures and audio, and sees the same when your device fetches them." | Covered |
| 12 | Farcaster's public API: the maker's FID, to look up the username shown with a design | `src/app/api/designs/route.ts:120` (`bylineName`) | §7 "Farcaster's public API receives a Farcaster ID when we look up the username to show with published work…" | Covered |
| 13 | ntfy: an alert when a style or sheet is reported (the same "Snowmoon: N reports waiting", counting designs with images) | `src/lib/images/alert.ts` (counts every element in `studio.removal_log`); called from the report and hide routes | §7 "ntfy delivers a short alert to us when an image is reported. It carries no content and nothing about you." | Covered in substance; the sentence says "an image" only |

## Kept on the device

Nothing new is stored on the device. Samples and views live in the page's memory until you publish
or leave (`docs/proposals/style-guides-and-sheets.md` §5, choice 18). The spoiler covers read the
furthest chapter opened, which §3 already names ("the furthest chapter you have opened").

## For the owner to write

1. §4: published styles and character sheets (name, text, pictures, recipes), beside "Images you publish".
2. §4: My picks, stored on the server under your Farcaster ID, private, until you clear them.
3. §7 fal.ai: it also receives reference pictures (your own front view; published views of sheets you pick, when you ask).
4. §7 Groq: it also checks the names of styles and sheets you publish.
5. Optional: forks keep a credit to the source for good; ntfy alerts cover reported styles and sheets.

Until then P6k/P6l (the owner's reread) stay failing on this branch by design, and the composer and
the design form already name the hosts that receive the words (`IMAGE_WORDING.designs.form.sentTo`).
