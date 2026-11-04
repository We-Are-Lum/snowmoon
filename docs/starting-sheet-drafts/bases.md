# Three bases per character: fronts for the owner's pick (DRAFT)

> **NEVER PUBLISH the twelve closed-model pictures on this page** (the six "closed: GPT Image 2.5 Sunburst" and six
> "closed: Gemini 3.1 Flash Image" fronts; owner, 2026-11-04). They were made before the retention settings and their
> recipes don't record what was kept. The seed script refuses them by sha256 (`NEVER_PUBLISH`, src/lib/challenge/bases.ts).
> Any closed picture that is published is made fresh.

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-03, on branch `starting-sheet-drafts`. **Drafts only:** nothing published, nothing written to the database, nothing uploaded to the site's storage. Every picture is AI-made and keeps that label wherever it is used.

**Reply with picks like "Bolder, Printed, Mood"** (the three styles every character gets), or per picture with its label, e.g. **"Zei · Printed"** or **"Bai · closed: Gemini 3.1 Flash Image"**, and **"Zei side · seed C"**. Only fronts for now: no side or back views in the new styles until the styles are picked.

**Which styles look most like one cast across all six:** **Bolder, Printed and Mood.** All three keep every character's look in all six, and each set reads as one drawing hand. core (its v2, "warm light") and Quiet each drift on one character: core turns Deluin's tunic yellow; Quiet drops Zei's jacket front. Of the closed concepts, Gemini 3.1 Flash Image is the most faithful set; GPT Image 2.5 Sunburst is the most stylised, with drifts (Zei's right sleeve, Bai's trousers, Gladias's sash).

## How they were made

- **The five published styles**, read from production in one read-only transaction (studio_writer, `sql.begin('read only', …)`), at each style's newest version: **Bolder** (`9e255ec2…`), **core** v2, titled "warm light" (`6cbf8e03…`), **Mood** (`712ca63f…`), **Printed** (`b83aa0d7…`), **Quiet** (`3b1c6e9d…`). Their texts are in `bases/styles.json`, word for word.
- **Open fronts: FLUX.2 [klein] 4B edit** (open weights, Apache-2.0, on fal.ai), from each character's original sheet (sha256 checked against `content/snowmoon/recipes/images/cast.json`), the way v2 was made: the site's `viewPrompt` (the front line in the side line's form, the style's text, the sheet's text, the no-words line) and the site's `makeEdit`, unchanged. **Chosen over the site's text-to-image front path (Z-Image Turbo)** after a pilot on Zei in three styles: the edit model keeps the character (cyan seams, glowing sneakers, the blue streak, the face); Z-Image draws a different young man each time and loses the sneakers. The pilot's three Z-Image fronts are kept for comparison: <img src="bases/zei-front-bolder-text.jpg" width="60" alt="Zei Bolder, Z-Image Turbo"> <img src="bases/zei-front-mood-text.jpg" width="60" alt="Zei Mood, Z-Image Turbo"> <img src="bases/zei-front-quiet-text.jpg" width="60" alt="Zei Quiet, Z-Image Turbo">
- **Closed concepts**, through the Vercel AI Gateway (`AI_GATEWAY_API_KEY`; the gateway's `disallowPromptTraining` option on every call), each from the character's original sheet, one published style each:
  - **GPT Image 2.5 Sunburst, a closed model by OpenAI**, in **Mood** (the strongest style text, to see what a stronger model does with it). `/v1/images/edits`, 1024 × 1536, quality high. $0.0466 to $0.0468 a picture, as the gateway reported it (token-priced: $5 per million input tokens, $30 per million output tokens).
  - **Gemini 3.1 Flash Image, a closed model by Google**, in **Bolder** (the cleanest of the three cast-like styles). `/v1/chat/completions` with image output, aspect 3:4, served by Google Vertex. $0.0677 a picture ($0.067 per 1K image, plus tokens). Added to `config/models.json`, labelled closed, so its recipe line reads "a closed model by Google".
  - Each closed picture is stored as the site stores pictures: JPEG at 576 × 768, the whole picture scaled to fit and padded with its own corner colour (no model; the conversion and the PNG's sha256 are in the recipe). The PNGs are kept locally in `/Users/nathan/snowmoon-starting-drafts/bases/`, not committed.
- **Every prompt passed the site's prompt check before its picture was made** (`blockedName`, then `checkPrompt`: gpt-oss-safeguard-20b against `config/prompts/image-guard.md`, through the gateway with `GROQ_API_KEY` removed, never the site's own Groq key). 14 first answers were "unclear" (the model's reasoning running out of its 400 tokens, as on 2026-11-01); each passed when asked again, as a visitor's retry would. None was refused for its content. fal's safety checker flagged none.
- **Every recipe is the site's standard format**: the publish route's `recipeOf`, copied verbatim into the script and checked against the route's source at start. The style link is the published style version. Full recipes: `bases/ledger.json`; script: `bases/make-bases.mts`.
- No artists, studios or films are named in any prompt (the published styles name none).

## Cost

110 calls, **$1.03648** in all, under a hard cap of $3.00 checked before every call against the worst case (worst case reached: $1.788):
- 33 FLUX.2 [klein] 4B edits, $0.33620 (30 fronts at $0.01032, 3 Zei sides at $0.00885)
- 3 Z-Image Turbo fronts (the pilot), $0.00664
- 6 GPT Image 2.5 Sunburst, $0.28009
- 6 Gemini 3.1 Flash Image, $0.40605
- 62 prompt checks, $0.00750

**Nothing counted toward the site's daily image cap** (`IMAGES.dailySpendCapUsd`): the cap is enforced from the site's spend tables, which only `reserve`, `settle` and `recordGuard` write, and none ran; the database was opened once, read-only, for the styles. No call went through the site's API.

## Zei

<sub>From:</sub> <img src="original/zei-sheet.jpg" width="200" alt="Zei original sheet">

<table>
<tr><td align="center" valign="top"><img src="bases/zei-front-bolder-edit.jpg" width="115" alt="Zei · Bolder, AI-generated draft"><br><b>Zei · Bolder</b><br><sub>style Bolder · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/zei-front-core-edit.jpg" width="115" alt="Zei · core, AI-generated draft"><br><b>Zei · core</b><br><sub>style core (v2, “warm light”) · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/zei-front-mood-edit.jpg" width="115" alt="Zei · Mood, AI-generated draft"><br><b>Zei · Mood</b><br><sub>style Mood · FLUX.2 [klein] 4B edit, open weights</sub></td></tr>
<tr><td align="center" valign="top"><img src="bases/zei-front-printed-edit.jpg" width="115" alt="Zei · Printed, AI-generated draft"><br><b>Zei · Printed</b><br><sub>style Printed · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/zei-front-quiet-edit.jpg" width="115" alt="Zei · Quiet, AI-generated draft"><br><b>Zei · Quiet</b><br><sub>style Quiet · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/zei-front-closed-gpt.jpg" width="115" alt="Zei · closed: GPT Image 2.5 Sunburst, AI-generated draft"><br><b>Zei · closed: GPT Image 2.5 Sunburst</b><br><sub>style Mood · a closed model by OpenAI</sub></td></tr>
<tr><td align="center" valign="top"><img src="bases/zei-front-closed-gemini.jpg" width="115" alt="Zei · closed: Gemini 3.1 Flash Image, AI-generated draft"><br><b>Zei · closed: Gemini 3.1 Flash Image</b><br><sub>style Bolder · a closed model by Google</sub></td></tr>
</table>

**Notes.** Open: Bolder, Mood and Printed keep everything (blue streak, visor glasses, orange cropped jacket, black bodysuit with cyan seams, grey gathered trousers, glowing sneakers). core warms the colours and browns the hair a little. **Quiet drifts:** the jacket loses its front and reads as orange sleeves on the bodysuit. Closed: GPT (Mood) is the most stylised, taller and leaner, and **drops the jacket's right sleeve**; Gemini (Bolder) is the most faithful of all seven, a little lighter in line.

## Bai

<sub>From:</sub> <img src="original/bai-sheet.jpg" width="200" alt="Bai original sheet">

<table>
<tr><td align="center" valign="top"><img src="bases/bai-front-bolder-edit.jpg" width="115" alt="Bai · Bolder, AI-generated draft"><br><b>Bai · Bolder</b><br><sub>style Bolder · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/bai-front-core-edit.jpg" width="115" alt="Bai · core, AI-generated draft"><br><b>Bai · core</b><br><sub>style core (v2, “warm light”) · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/bai-front-mood-edit.jpg" width="115" alt="Bai · Mood, AI-generated draft"><br><b>Bai · Mood</b><br><sub>style Mood · FLUX.2 [klein] 4B edit, open weights</sub></td></tr>
<tr><td align="center" valign="top"><img src="bases/bai-front-printed-edit.jpg" width="115" alt="Bai · Printed, AI-generated draft"><br><b>Bai · Printed</b><br><sub>style Printed · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/bai-front-quiet-edit.jpg" width="115" alt="Bai · Quiet, AI-generated draft"><br><b>Bai · Quiet</b><br><sub>style Quiet · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/bai-front-closed-gpt.jpg" width="115" alt="Bai · closed: GPT Image 2.5 Sunburst, AI-generated draft"><br><b>Bai · closed: GPT Image 2.5 Sunburst</b><br><sub>style Mood · a closed model by OpenAI</sub></td></tr>
<tr><td align="center" valign="top"><img src="bases/bai-front-closed-gemini.jpg" width="115" alt="Bai · closed: Gemini 3.1 Flash Image, AI-generated draft"><br><b>Bai · closed: Gemini 3.1 Flash Image</b><br><sub>style Bolder · a closed model by Google</sub></td></tr>
</table>

**Notes.** All five open styles keep her: magenta ponytail, lime vest, black trousers with magenta piping, knee pads, magenta-soled boots. Mood darkens the skin rendering and background. Closed: GPT (Mood) pushes the hair pinker, the trousers baggier and the pose wider; Gemini (Bolder) is faithful with thinner outlines.

## Gladias

<sub>From:</sub> <img src="original/gladias-sheet.jpg" width="200" alt="Gladias original sheet">

<table>
<tr><td align="center" valign="top"><img src="bases/gladias-front-bolder-edit.jpg" width="115" alt="Gladias · Bolder, AI-generated draft"><br><b>Gladias · Bolder</b><br><sub>style Bolder · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/gladias-front-core-edit.jpg" width="115" alt="Gladias · core, AI-generated draft"><br><b>Gladias · core</b><br><sub>style core (v2, “warm light”) · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/gladias-front-mood-edit.jpg" width="115" alt="Gladias · Mood, AI-generated draft"><br><b>Gladias · Mood</b><br><sub>style Mood · FLUX.2 [klein] 4B edit, open weights</sub></td></tr>
<tr><td align="center" valign="top"><img src="bases/gladias-front-printed-edit.jpg" width="115" alt="Gladias · Printed, AI-generated draft"><br><b>Gladias · Printed</b><br><sub>style Printed · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/gladias-front-quiet-edit.jpg" width="115" alt="Gladias · Quiet, AI-generated draft"><br><b>Gladias · Quiet</b><br><sub>style Quiet · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/gladias-front-closed-gpt.jpg" width="115" alt="Gladias · closed: GPT Image 2.5 Sunburst, AI-generated draft"><br><b>Gladias · closed: GPT Image 2.5 Sunburst</b><br><sub>style Mood · a closed model by OpenAI</sub></td></tr>
<tr><td align="center" valign="top"><img src="bases/gladias-front-closed-gemini.jpg" width="115" alt="Gladias · closed: Gemini 3.1 Flash Image, AI-generated draft"><br><b>Gladias · closed: Gemini 3.1 Flash Image</b><br><sub>style Bolder · a closed model by Google</sub></td></tr>
</table>

**Notes.** All five open styles keep him: beard, green tabard, cream sleeves, ochre sash, charcoal leggings, grey boots. Printed shows the paper texture most clearly on the tabard. Closed: GPT (Mood) shortens the sash and darkens the legs, on a textured grey ground; Gemini (Bolder) is faithful.

## Seila

<sub>From:</sub> <img src="original/seila-sheet.jpg" width="200" alt="Seila original sheet">

<table>
<tr><td align="center" valign="top"><img src="bases/seila-front-bolder-edit.jpg" width="115" alt="Seila · Bolder, AI-generated draft"><br><b>Seila · Bolder</b><br><sub>style Bolder · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/seila-front-core-edit.jpg" width="115" alt="Seila · core, AI-generated draft"><br><b>Seila · core</b><br><sub>style core (v2, “warm light”) · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/seila-front-mood-edit.jpg" width="115" alt="Seila · Mood, AI-generated draft"><br><b>Seila · Mood</b><br><sub>style Mood · FLUX.2 [klein] 4B edit, open weights</sub></td></tr>
<tr><td align="center" valign="top"><img src="bases/seila-front-printed-edit.jpg" width="115" alt="Seila · Printed, AI-generated draft"><br><b>Seila · Printed</b><br><sub>style Printed · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/seila-front-quiet-edit.jpg" width="115" alt="Seila · Quiet, AI-generated draft"><br><b>Seila · Quiet</b><br><sub>style Quiet · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/seila-front-closed-gpt.jpg" width="115" alt="Seila · closed: GPT Image 2.5 Sunburst, AI-generated draft"><br><b>Seila · closed: GPT Image 2.5 Sunburst</b><br><sub>style Mood · a closed model by OpenAI</sub></td></tr>
<tr><td align="center" valign="top"><img src="bases/seila-front-closed-gemini.jpg" width="115" alt="Seila · closed: Gemini 3.1 Flash Image, AI-generated draft"><br><b>Seila · closed: Gemini 3.1 Flash Image</b><br><sub>style Bolder · a closed model by Google</sub></td></tr>
</table>

**Notes.** All five open styles keep her: braids, round glasses, rust coat-dress with bronze clasps, olive trousers, tan boots. core makes the coat a little browner. Closed: both keep her well; GPT (Mood) is the most painterly, Gemini (Bolder) the cleanest.

## Deluin

<sub>From:</sub> <img src="original/deluin-sheet.jpg" width="200" alt="Deluin original sheet">

<table>
<tr><td align="center" valign="top"><img src="bases/deluin-front-bolder-edit.jpg" width="115" alt="Deluin · Bolder, AI-generated draft"><br><b>Deluin · Bolder</b><br><sub>style Bolder · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/deluin-front-core-edit.jpg" width="115" alt="Deluin · core, AI-generated draft"><br><b>Deluin · core</b><br><sub>style core (v2, “warm light”) · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/deluin-front-mood-edit.jpg" width="115" alt="Deluin · Mood, AI-generated draft"><br><b>Deluin · Mood</b><br><sub>style Mood · FLUX.2 [klein] 4B edit, open weights</sub></td></tr>
<tr><td align="center" valign="top"><img src="bases/deluin-front-printed-edit.jpg" width="115" alt="Deluin · Printed, AI-generated draft"><br><b>Deluin · Printed</b><br><sub>style Printed · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/deluin-front-quiet-edit.jpg" width="115" alt="Deluin · Quiet, AI-generated draft"><br><b>Deluin · Quiet</b><br><sub>style Quiet · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/deluin-front-closed-gpt.jpg" width="115" alt="Deluin · closed: GPT Image 2.5 Sunburst, AI-generated draft"><br><b>Deluin · closed: GPT Image 2.5 Sunburst</b><br><sub>style Mood · a closed model by OpenAI</sub></td></tr>
<tr><td align="center" valign="top"><img src="bases/deluin-front-closed-gemini.jpg" width="115" alt="Deluin · closed: Gemini 3.1 Flash Image, AI-generated draft"><br><b>Deluin · closed: Gemini 3.1 Flash Image</b><br><sub>style Bolder · a closed model by Google</sub></td></tr>
</table>

**Notes.** All five open styles keep him: shoulder-length hair, cream cable-knit tunic with grey hood, dark sash, green trousers, brown boots. **core turns the tunic yellow** (its warm light). Closed: GPT (Mood) splits the tunic's hem like a skirt over the trousers; Gemini (Bolder) is faithful.

## Mu

<sub>From:</sub> <img src="original/mu-sheet.jpg" width="200" alt="Mu original sheet">

<table>
<tr><td align="center" valign="top"><img src="bases/mu-front-bolder-edit.jpg" width="115" alt="Mu · Bolder, AI-generated draft"><br><b>Mu · Bolder</b><br><sub>style Bolder · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/mu-front-core-edit.jpg" width="115" alt="Mu · core, AI-generated draft"><br><b>Mu · core</b><br><sub>style core (v2, “warm light”) · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/mu-front-mood-edit.jpg" width="115" alt="Mu · Mood, AI-generated draft"><br><b>Mu · Mood</b><br><sub>style Mood · FLUX.2 [klein] 4B edit, open weights</sub></td></tr>
<tr><td align="center" valign="top"><img src="bases/mu-front-printed-edit.jpg" width="115" alt="Mu · Printed, AI-generated draft"><br><b>Mu · Printed</b><br><sub>style Printed · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/mu-front-quiet-edit.jpg" width="115" alt="Mu · Quiet, AI-generated draft"><br><b>Mu · Quiet</b><br><sub>style Quiet · FLUX.2 [klein] 4B edit, open weights</sub></td><td align="center" valign="top"><img src="bases/mu-front-closed-gpt.jpg" width="115" alt="Mu · closed: GPT Image 2.5 Sunburst, AI-generated draft"><br><b>Mu · closed: GPT Image 2.5 Sunburst</b><br><sub>style Mood · a closed model by OpenAI</sub></td></tr>
<tr><td align="center" valign="top"><img src="bases/mu-front-closed-gemini.jpg" width="115" alt="Mu · closed: Gemini 3.1 Flash Image, AI-generated draft"><br><b>Mu · closed: Gemini 3.1 Flash Image</b><br><sub>style Bolder · a closed model by Google</sub></td></tr>
</table>

**Notes.** All five open styles keep her: silver asymmetric cut, red glasses, charcoal tabard with yellow piping and the shoulder panel, cobalt sleeves, black trousers, grey boots. **Mood changes the neckline** (an asymmetric collar). Closed: GPT (Mood) gives a high plain collar; Gemini (Bolder) is faithful.

## Zei side: three seeds

The v2 side view is twisted (head in profile, body turned). Redone three times the way v2 was made: from the v2 front (`v2/zei-front.jpg`, sha256 `564f45de…`), the site's side line, "Techno vistas, views" (the v2 style text), FLUX.2 [klein] 4B edit; no seed is sent, so fal picks one and it is recorded.

<table>
<tr><td align="center" valign="top"><img src="v2/zei-front.jpg" width="115" alt="Zei v2 front"><br><b>v2 front</b><br><sub>made from</sub></td><td align="center" valign="top"><img src="v2/zei-side.jpg" width="115" alt="Zei v2 side"><br><b>v2 side</b><br><sub>twisted</sub></td></tr>
<tr><td align="center" valign="top"><img src="bases/zei-side-seed-A.jpg" width="115" alt="Zei side seed A, AI-generated draft"><br><b>Zei side · seed A</b><br><sub>seed 928937381</sub></td><td align="center" valign="top"><img src="bases/zei-side-seed-B.jpg" width="115" alt="Zei side seed B, AI-generated draft"><br><b>Zei side · seed B</b><br><sub>seed 1681127908</sub></td><td align="center" valign="top"><img src="bases/zei-side-seed-C.jpg" width="115" alt="Zei side seed C, AI-generated draft"><br><b>Zei side · seed C</b><br><sub>seed 1711586004</sub></td></tr>
</table>

- **Seed A:** a three-quarter view, untwisted, the jacket's patch and seams kept; not a true profile.
- **Seed B:** three-quarter, the torso a little more open to the front than the head; the mildest twist of the three.
- **Seed C:** closest to a true profile, head and body turned together; the nearer foot steps slightly forward.

## Decisions owed

1. **The three styles** (my suggestion: Bolder, Printed, Mood). Then the side and back views in those styles, made from each picked front.
2. **The open path:** the edit model from the original sheet (used here) or Z-Image text-to-image (the site's own front path, which drifts).
3. **The closed concepts:** whether either closed model may make a base. A base made by one would need its recipe line ("a closed model by OpenAI/Google") and, before it is published, Terms/Privacy naming the provider (closed models rule, 2026-10-18), and the maker's terms reviewed for publishing under GPL-3.0 (open in `config/models.json`).
4. **"Checked by … and the host's safety checker"** on the closed pictures: `recipeOf` always records `host_safety_checker: passed`. For fal that is its safety checker; for the closed models it can only mean the provider's own moderation returned the picture. If any closed picture is used, decide whether that line stands or the recipe should say so.
5. **core:** the newest version is titled "warm light"; these use it. Say if core v1 was meant.
6. **Zei side:** seed A, B or C (or keep v2).
