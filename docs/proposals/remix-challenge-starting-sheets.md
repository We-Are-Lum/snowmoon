# Remix challenge: the six starting sheets (PROPOSAL, DRAFT)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-10-31, on branch `remix-challenge`, for the
owner's approval. **Nothing was generated, uploaded or published.** Production was read only (as `studio_writer`, in a
read-only transaction).

The owner's request (2026-10-31): publish the repository's starting-point sheets for Zei, Bai, Gladias, Seila, Deluin
and Mu (`content/snowmoon/recipes/images/cast.json`) from his account (FID 6786) as each character's first version,
labelled "starting point", with their recipes. Hold Gladias for the privacy-robe check.

## What exists today

- **On production:** no character sheet at all (`studio.entities` has no row of kind `character`). Published designs
  are 6 versions of 5 styles, all by FID 6786: core (v1, v2 "warm light"), Bolder, Quiet, Printed, Mood. The project's
  starting style, Techno vistas (`content/snowmoon/designs/styles/techno-vistas.json`), is **not** published as a
  design.
- **The six source images.** Each is one 1024 × 576 PNG with three full-body views side by side (front, three-quarter,
  back), rendered locally on 2026-10-04 with FLUX.2 [klein] 4B (open weights, Apache-2.0; revision e7b7dc2…, mflux
  0.20.0, 4-bit, 4 steps, guidance 1.0; cost $0). The recipe's prompt is the job's prompt plus Techno vistas' style text
  (for Zei, 1,197 characters). The character description in each prompt was drafted by the coding agent
  (`assist.drafted`: character profiles, image prompts, reference choices).
- **Where the files are.** Not in the repository or on the media host (none is in `published.json`). Copies whose
  sha256 matches the recipe are in the owner's Google Drive, `My Drive/Snowmoon images/cast v2/`, and, for Zei, Bai and
  Deluin, also in `/Users/nathan/snowmoon-scenes/images-out/cast/`. (`My Drive/Snowmoon images/cast/` holds the older
  watercolour renders for Gladias, Seila and Mu, from `cast-watercolor.json`; not these.)

| Character | Recipe id (cast.json) | Seed | sha256 (PNG) | File that matches the recipe |
|---|---|---|---|---|
| Zei Leimin | `zei-sheet` | 5114 | `cd6e71769d0d468bbfc5dbb4269aa62b14a92efaa45aef33bfc1b9fd0ba8d867` | `…/Snowmoon images/cast v2/zei-sheet.png`; `/Users/nathan/snowmoon-scenes/images-out/cast/zei-sheet.png` |
| Bai Jahen | `bai-sheet` | 5015 | `21def33df4f734aa8979a2bb152d88b443d511b940eaae0c4a67347f900db73e` | `…/cast v2/bai-sheet.png`; `/Users/nathan/snowmoon-scenes/images-out/cast/bai-sheet.png` |
| Gladias | `gladias-sheet` | 5001 | `5b0c9d56c09f120d12be9657721f93eec56ec71c6f7c721312dc54a1a10e8d57` | `…/cast v2/gladias-sheet.png` |
| Seila | `seila-sheet` | 5002 | `62f2f7ce966c5cc0c425af17edf58640bf587fff0486f5a7bb62530abfb447c4` | `…/cast v2/seila-sheet.png` |
| Deluin | `deluin-sheet` | 5020 | `3edf7878c7001438c4c7133005517cba0d1679bed4988fadc58947d428934384` | `…/cast v2/deluin-sheet.png`; `/Users/nathan/snowmoon-scenes/images-out/cast/deluin-sheet.png` |
| Mu | `mu-sheet` | 5017 | `e1854964c41862db245d46cc188ba84af6235fb95c38a79d55fe9281abf3aec7` | `…/cast v2/mu-sheet.png` |

(`…` is `/Users/nathan/Library/CloudStorage/GoogleDrive-geko5443@gmail.com/My Drive`.)

## Gladias and the privacy robe: held

Gladias's starting sheet **does not show the privacy robe.** All three views show him in a moss-green sleeveless tabard
with a standing collar, a cream long-sleeved bodysuit, an ochre sash, charcoal leggings and grey boots, face and hair
visible. His prompt doesn't mention the robe, and the cast job lists no props. (The robe, per
`content/snowmoon/designs/props/privacy-robe.json`, is dark purple, hooded, to the ankles, with a face cover.) The 31
seeded images in Garance's note are scene images, not this sheet. He stays **held** (`CHALLENGE.held`), so /challenge
says his starting sheet is held for a check, until the owner has looked: the open question is whether his everyday look
should change to fit Garance's new robe reference (for example, whether he should be shown robed), not whether this sheet
shows the robe.

## The site's format, and what has to fit

A character sheet's version body (`DesignBody`, `src/lib/element-body.ts`) has a title, a text of at most 600 characters
(shown on its page as the sheet's words), and views `front`, `side`, `back`, each a picture `{ url, sha256, recipe }`.
The site makes views at 576 × 768 (portrait 3:4). Each picture's recipe names the prompt, model, endpoint, host,
settings, seed, cost, date, size, its checks (the prompt check and the host's safety checker) and what a model drafted.

## Option A (recommended): crop the three views from the existing image, no model call

For each character, a local script (Pillow, no network, no model):
1. checks the PNG's sha256 against cast.json;
2. cuts it into three equal panels, x = 0–341, 341–683, 683–1024, full height (576), which is where the three figures
   stand in all six (checked by eye on Zei, Gladias and Mu);
3. pads each panel left and right to 432 × 576 (3:4) with the sheet's own off-white, without scaling (no upscale);
4. saves each as a JPEG and takes its sha256.

**Cost: $0 per character, $0 in total.** No model, no hosted service.

**What it keeps:** the exact pictures every seeded chapter image of that character was made from (they used these
sheets as references), so the starting point matches the book's images. The recipe stays complete and true: each view's
recipe is the original render's (model, revision, runtime, seed, the full prompt, settings, cost $0, date 2026-10-04,
local host) plus a derivation line: "Cropped from <png sha256> at x0–x1, padded to 432 × 576; no model."
**What it loses or needs:**
- **The middle view is three-quarter, not side.** It would sit in the `side` slot. The page's labels ("side view") should
  say "three-quarter view" for these (a small page change: a `view_label` on the picture).
- **No prompt check or safety checker ran** (a local render). The recipe type today only allows
  `host_safety_checker: 'passed'`, and the version page prints "Checked by gpt-oss-safeguard-20b and the host's safety
  checker" and "on fal.ai" for every view. Publishing these honestly needs that line to come from each recipe:
  "Rendered locally; no automated check ran. The owner reviewed and published it." (A small code change, with a
  `checks: { prompt: 'not run', host_safety_checker: 'not run' }` variant.)
- **Smaller pictures** (432 × 576 instead of 576 × 768). Forks will make new views at the site's size.
- **Scenery behind some figures** (Zei, Gladias, Mu, of the three looked at): the Techno vistas style text added skyline
  backgrounds despite "no scenery". Kept as rendered.
- **The views don't always agree.** On Zei's sheet the front and back show the cropped orange jacket closed over the
  bodysuit, while the three-quarter view shows the bodysuit with the jacket's sleeves only. Cropping keeps that as it is;
  a remix can fix it. (Only Zei, Gladias and Mu were looked at; Bai, Seila and Deluin should be checked by eye before
  publishing.)
- **The style** isn't a published design, so the sheet's "made in" style link would be empty (or Techno vistas would have
  to be published first with `npm run seed:designs`, which the repo already has, for the owner's go).

## Option B: make new views with the site's own sheet tool

Front: Z-Image Turbo on fal.ai, 576 × 768, from the sheet text plus a published style's text. Side and back: FLUX.2
[klein] 4B edit on fal.ai, from the front view. Each call is checked first by gpt-oss-safeguard-20b. At the site's real
prices (`config/models.json`; `src/lib/images/fal.ts` and `src/lib/config.ts`, `IMAGES`):

| Call | Price | Per character |
|---|---|---|
| Front, Z-Image Turbo | 0.442368 MP × $0.005/MP = $0.00221 (fal may round up to 1 MP: $0.005) | 1 × $0.00221 |
| Side and back, FLUX.2 [klein] 4B edit | (0.442368 out + 0.442368 in) MP × $0.01/MP = $0.00885 each (rounded up: $0.02) | 2 × $0.00885 |
| Prompt check, gpt-oss-safeguard-20b | $0.07 / M input, $0.20 / M output tokens: about $0.0002 a call (the site reserves $0.0015) | 3 × ≈ $0.0002 |
| **Total** | | **≈ $0.0205 a character; ≈ $0.123 for all six.** Worst case as the site reserves it: $0.0065 + 2 × $0.0215 = $0.0495 a character, $0.297 for six. |

A redo after a refusal costs again. It also needs the text cut to 600 characters (the descriptions are 376–544, so they
fit once the fixed "Character reference sheet …" opening is dropped) and a published style for the views (core, Bolder,
Quiet, Printed or Mood; not Techno vistas unless it is published first). The site allows 3 published designs a day per
person, so six take two days, or the seeding script.

**What it keeps:** the site's own format exactly (576 × 768, front/side/back, a checked prompt and the host's safety
checker, the recipe as every other sheet's). **What it loses:** the match with the seeded images. New renders from a
different model and style give a different Zei, Bai, etc. from the 139 chapter images. The words are still the coding
agent's drafted description, so the starting point is no more the owner's own than in Option A.

## Labels and whose words are whose (both options)

- Every view keeps its AI label (the sheet page's caption and AiTag, principle 2).
- The sheet's text is the coding agent's character description (drafted from the book's facts), not the owner's words.
  The version records `assist: { model: 'claude-coding-agent', drafted: ['character profile', 'view prompts'], source:
  'content/snowmoon/recipes/images/cast.json#<id>' }`, so its page shows "drafted" as it does for Techno vistas. The
  owner publishes it (principle 4: a signed-in person's action), and it is labelled `role: 'maintainer'`, shown as
  "@naaate · maintainer", with the title "Starting point".
- Nothing is canon or official (principle 5): the starting point is labelled as one, sorts by date like any sheet, and
  forks are welcome.

## What publishing as the owner would write (for approval)

A script like `scripts/seed-designs.ts` (dry run by default, `--apply` only after the owner's go), run once per
character except Gladias until he is released. It reuses `makeDesign` (mode `create`, kind `character`), so it writes
exactly what the site's own publish writes, and nothing else:

1. **Cloudflare R2, the public bucket** (`media.snowmoon.party`): 3 JPEG files per character, named by their sha256
   (`putPublic`), so 15 for five characters (18 with Gladias).
2. **`studio.entities`**: 1 row per character, `kind 'character'`, the book's name, setting and first chapter (none exist
   today).
3. **`studio.elements`**: 1 row per character, `element_type 'design'`, `entity_id` that row, `created_by_fid 6786`,
   `status 'published'`, `work_id 'snowmoon'`.
4. **`studio.element_versions`**: 1 row per character, `version_no 1`, body `{ title: 'Starting point', text: <the
   description>, samples: [], views: { front, side, back } each { url, sha256, recipe }, by_name: 'naaate',
   by_name_source, role: 'maintainer', assist: {…}, style: null or Techno vistas }`.
5. **Nothing else:** no `studio.links` (it is not a fork), no `studio.recipes` row (a sheet keeps each picture's recipe in
   its body, which P1c checks), no `challenge_eligibility` row (an admin's sheet, made before the window), no counts.

They must be published before the window opens (Fri 6 Nov, 09:00 Pacific): /challenge lists as "sheets to start from"
only those made before it.

Approval needed: Option A or B; Techno vistas published first or not; the two small code changes for Option A (the view
label and the honest "how it was made" line); and the go for the script's `--apply`.
