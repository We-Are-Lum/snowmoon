# The challenge's styles and bases: proposal and cost (DRAFT)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-03, on branch `challenge-styles`, for the
owner's words of 2026-11-04: "Styles: a group of styles to choose from, including some made with closed models
(labelled), alongside Techno vistas. Proposal and cost first." and "Bases: three per character, in three styles that
look clearly different from each other." **Proposal only: nothing was generated, nothing spent, nothing published.**
The three new style texts below were drafted by the agent; the owner may rewrite any of them. Every picture named here
is AI-made and keeps that label wherever it is used.

Plan file: [`styles-plan.json`](styles-plan.json). Every number below comes from
`npm run seed:designs -- --bases-plan`, which reads that file and calls nothing (no model, database or network).

## Owner's decisions, 2026-11-04 (recorded)

- **Style test approved, capped at $0.35, drafts only.** Done: [styles-test.md](styles-test.md), **$0.08879 spent**.
  Gouache by Gemini paints; Gouache by the open model doesn't (it keeps its outlines); Miniature by the open model works.
  The two GPT Image 2.5 Sunburst fronts were refused before any call: OpenAI has no zero-data-retention endpoint for it
  on the gateway.
- **Every new closed call** sets `zeroDataRetention: true` and `disallowPromptTraining: true` and pins its provider
  (Google to `vertex`, OpenAI to `openai`), in the shared batch path `scripts/lib/batch-model.ts` (`test:batch-model`).
  Nothing is sent unless the gateway lists that provider with both.
- **Plan:** A (**Gouache, Printed, Miniature**) if the reread lands by Thu 5 Nov; otherwise B, with Gouache by the open
  model if the test showed it can paint, else Mood. **The test says it can't, so B is Mood, Printed, Miniature.**
- **Closed styles are gated like bases:** `closedStyleRefusal` (src/lib/challenge/bases.ts), called by the seed script
  before it publishes a style.
- **Neon night is made by Gemini (Google)** (owner, 2026-11-04), so only Google is named. Its four samples are drafts:
  [neon-night-samples.md](neon-night-samples.md), **$0.26850 spent** (cap $0.35).
- No further spending until the owner OKs the samples and the bases.

## What the drafts show first

The five open drafts of 2026-11-03 ([bases.md](bases.md)) **barely differ from each other**. Side by side, Zei in
Bolder, core, Mood, Printed and Quiet is the same drawing with small changes of line weight and background:
the edit model (FLUX.2 [klein] 4B, open weights) holds on to the original sheet's own drawing, and the style text moves
it only a little. Mood is the furthest (darker, inkier lines, a grey ground); Bolder, core, Printed and Quiet are four
versions of one look. The closed concepts move further: GPT Image 2.5 Sunburst (a closed model by OpenAI) is the most
stylised, with drifts; Gemini 3.1 Flash Image (a closed model by Google) is the most faithful, and close to the
original drawing.

So **none of today's styles gives a painted look or a 3D look**, and three bases "clearly different from each other"
need new styles with stronger texts, and a small style test first to see whether each model really follows them.

## The group: eight styles to choose from

Five exist; three are new. Two of the new ones (Gouache, Neon night) are made with a closed model by Google and labelled so. `core` ("warm light") stays
published on the site but is left out of the group: it is Bolder with warm light, and in the drafts it turned Deluin's
tunic yellow.

| # | Style | Kind | Samples made by | Samples | Why it differs from the others |
|---|---|---|---|---|---|
| 1 | **Techno vistas (starting point)** | clean cel line, wide pastel skies | FLUX.2 [klein] 4B, open weights (rendered locally) | 2, made (style test 2; not committed, in the owner's Drive). Views in it, without its scenery clauses: [Zei v2 front](v2/zei-front.jpg), [Bai](v2/bai-front.jpg), [Mu](v2/mu-front.jpg) | The project's starting style: vistas and megastructures. Not yet published: `seed:designs --apply --style-only` publishes it (dry run 2026-11-03: not on production yet). |
| 2 | **Bolder** | bold-outline comic | Z-Image Turbo, open weights | 4, [published](https://pictures.snowmoon.party/images/readers/00e4c56b168531a8485ea3fa4ab9bf17.jpg). Front: [Zei](bases/zei-front-bolder-edit.jpg), [Mu](bases/mu-front-bolder-edit.jpg) | Thick outer contours, bright flat colour. |
| 3 | **Mood** | dark-line graphic novel, brushy | Z-Image Turbo, open weights | 4, [published](https://pictures.snowmoon.party/images/readers/7af7efadf40af372c083001dcf03543e.jpg). Front: [Zei](bases/zei-front-mood-edit.jpg), [Mu](bases/mu-front-mood-edit.jpg) | The darkest and most expressive of the open styles; the only one with brushstrokes. |
| 4 | **Printed** | printed comic: halftone, offset colour | Z-Image Turbo, open weights | 4, [published](https://pictures.snowmoon.party/images/readers/206a0a4c414bb51eb3858b7c64eb79e5.jpg). Front: [Zei](bases/zei-front-printed-edit.jpg), [Gladias](bases/gladias-front-printed-edit.jpg) | Paper texture, halftone dots in the shadows, slightly offset colour: reads as ink on paper. |
| 5 | **Quiet** | muted, empty space | Z-Image Turbo, open weights | 4, [published](https://pictures.snowmoon.party/images/readers/794beb09bbdb5eedcde517084f7a7e31.jpg). Front: [Zei](bases/zei-front-quiet-edit.jpg), [Bai](bases/bai-front-quiet-edit.jpg) | Muted tones and plain backgrounds, the focus on faces and posture. (Its Zei draft lost the jacket's front.) |
| 6 | **Miniature** (new) | a photographed 3D model | Z-Image Turbo, open weights | 4 to make; test front: [Zei](styles-test/zei-front-miniature-open.jpg) | The only 3D, photographic look: a painted figurine under studio light. |
| 7 | **Gouache** (new) | painted, no outlines | **Gemini 3.1 Flash Image, a closed model by Google** | 4 to make; test front: [Zei](styles-test/zei-front-gouache-gemini.jpg) (and [by the open model](styles-test/zei-front-gouache-open.jpg), which doesn't paint) | The only one with no ink outlines: opaque paint and paper grain. |
| 8 | **Neon night** (new) | night light, glow, reflections | **Gemini 3.1 Flash Image, a closed model by Google** (owner, 2026-11-04) | 4 made as drafts: [neon-night-samples.md](neon-night-samples.md) | The only night palette: lit by glowing panels, wet reflections, rim light. |

The new texts, each under the site's 600 characters, naming no artist, studio or film:

- **Miniature:** "A photograph of a hand-painted miniature model: smooth sculpted resin and painted wood with a satin finish, softly rounded simplified forms, any people as small painted figurines, soft studio light, soft shadows on the ground, shallow depth of field, clear readable faces and hands."
- **Gouache:** "Painted illustration in opaque gouache on textured paper: visible flat brush strokes and dry-brush edges, soft shapes with no ink outlines, a limited warm palette with a few saturated accents, gentle daylight, the paper's grain showing through, clear readable faces and hands."
- **Neon night:** "Painted digital illustration at night: deep blue and violet shadows, light from glowing coloured panels in cyan and magenta, glossy wet reflections, strong rim light on figures, high contrast, crisp edges on figures and a soft glow around lights, clear readable faces and hands."

The existing texts are in [`bases/styles.json`](bases/styles.json) (word for word, as published) and
`content/snowmoon/designs/styles/techno-vistas.json`.

**One thing a remixer should know about the closed styles.** A style is its text; the model is chosen per picture.
Remixers keep the open models (the fork form is unchanged), so a remixer who picks Gouache gets Gouache's text drawn by
FLUX.2 [klein] or Z-Image, which may look less painted than Gemini's samples. The style test includes Gouache on the
open model so we see the difference before publishing. Each sample's recipe already names its model and maker.

## The three bases per character

**Plan A (with the reread): Gouache, Printed, Miniature**, in that order for every character
(`CHALLENGE.baseStyles = ["Gouache", "Printed", "Miniature"]`).

| | 1. Gouache | 2. Printed | 3. Miniature |
|---|---|---|---|
| Kind | **painterly** | **graphic, printed** | **3D, photographic** |
| Made by | Gemini 3.1 Flash Image, a closed model by Google | FLUX.2 [klein] 4B, open weights | FLUX.2 [klein] 4B, open weights |
| What it changes | Paint instead of line: no outlines, brush marks, paper grain | Ink on paper: fine line, flat colour, halftone dots | Form instead of drawing: a lit, sculpted figure with real shadows and depth of field |

Why they read as three different things and not three versions of one: each changes a different layer. Gouache drops
the outline that every open style keeps; Printed keeps the outline and makes it ink on paper; Miniature leaves drawing
for sculpture and photography. Why these models: Gemini kept every character best of the closed models (bases.md), so it
gets the one look the open model can't be trusted to reach (paint); Printed is already drafted for all six with the
open model and keeps them; Miniature is open so the fallback needs only one change.

**Plan B (the fallback, no reread by Thu 5 Nov): Mood, Printed, Miniature**, all open (`["Mood", "Printed",
"Miniature"]`). Only the painterly one changes. **Honest caveat:** Mood and Printed are the least different pair of the
open drafts (Mood is darker and inkier, the same drawing underneath). If the style test shows FLUX.2 [klein] can paint
Gouache convincingly, plan B should use **Gouache made by the open model** instead of Mood, which keeps the same three
names and order in both plans.

**Tested (styles-test.md):** Miniature on the open edit model does leave the sheet's drawing (a photographed toy figure), so it holds in both plans; Gouache by the open model does not paint, so plan B uses Mood.

Characters, in book-mention order: Zei, Gladias, Bai, Seila, Deluin, Mu. (`CHALLENGE.characters` lists them
Zei, Bai, Gladias, Seila, Deluin, Mu, "the owner's order"; this doesn't change it.) Each base is a sheet with three
views: the front made from the character's original sheet, the side and back from that front, as the drafts were.

## Cost

Measured prices: fal's pricing API (read 2026-11-03): FLUX.2 [klein] 4B edit $0.01 per megapixel, billed on output
plus input; Z-Image Turbo $0.005 per megapixel. The Vercel AI Gateway's model list (read 2026-11-03): Gemini 3.1 Flash
Image $0.067 per 1K image plus tokens; GPT Image 2.5 Sunburst $5 / $30 per million input / output tokens. The drafts'
ledger (110 calls, 2026-11-03): Gemini $0.0677 a picture, GPT $0.0467 a picture (1024 × 1536, quality high), the
prompt check $0.00012 a check at 1.3 checks a picture. **Worst** is the reserve held before each call: $0.02 an edit,
$0.005 a Z-Image picture, $0.09 Gemini, $0.08 GPT, $0.0015 a prompt check (two per picture in the worst case).

| Item | Estimate | Worst |
|---|---|---|
| One style sample, Miniature (Z-Image Turbo) | $0.0031 | $0.0080 |
| One style sample, Gouache (Gemini, closed, Google) | $0.0678 | $0.0930 |
| One style sample, Neon night (Gemini, closed, Google; measured 2026-11-03) | $0.0671 | $0.0765 |
| **Style test** (done: 3 fronts; the 2 GPT rows refused) | **$0.08879 spent** | cap $0.35 |
| **Neon night's 4 samples** (done, drafts) | **$0.26850 spent** | cap $0.35 |
| **Style samples still to make:** 8 (Miniature 4, Gouache 4) | **$0.2837** | **$0.4040** |
| One base, open (3 views, FLUX.2 [klein] edit) | $0.0285 | $0.0690 |
| One base, Gouache (3 views, Gemini, closed, Google) | $0.2035 | $0.2790 |
| **Plan A, 18 bases** (6 Gouache, 6 Printed, 6 Miniature) | $1.5628 | |
| Plan A retake allowance (half the views made again) | $0.7814 | |
| **Plan A bases total** | **$2.3442** | **$3.7530** |
| **Plan B, 18 open bases** | $0.5127 | |
| Plan B retake allowance | $0.2564 | |
| **Plan B bases total** | **$0.7691** | **$1.8630** |
| **Everything, plan A** (test + samples + bases) | **$2.9978** | **$4.7940** |
| **Everything, plan B** (test + Miniature's samples + bases) | **$0.9640** | **$2.2000** |
| **Worst of all:** plan A in full, then the reread misses and plan B's 6 Mood bases are made too (Printed and Miniature are shared) | | **$5.4150** |

The retake allowance is half: of 48 draft pictures on 2026-11-03, the visible drifts (bases.md's notes) were on about one in five, and
14 prompt checks needed asking twice. Nothing counts toward the site's daily image cap (a batch job, as the drafts were).
To spend least if the reread is uncertain: make the shared Printed and Miniature bases first, then Gouache.

## What is published when

1. **Now:** nothing.
2. **After the owner's OK to spend on the styles:** the style test (drafts only, never published), then the samples.
   **Miniature** (open) can be published as soon as the owner picks it. **Techno vistas** goes up with
   `seed:designs --apply --style-only --confirm-owner-go`, as already planned.
3. **Gouache and Neon night (the closed styles) and the Gouache bases** are published **only after** the owner's reread
   of the closed-model-bases lines lands and `CHALLENGE.closedBasesAllowed` turns on, in the same merge that puts the
   Privacy §7, Terms §8 and About lines into `src/lib/legal.ts` (P6s fails otherwise). Two things for that reread:
   - The drafted §7 line covers "the remix challenge's bases and references". A closed **style's samples** are neither,
     so for the closed styles it should read "the remix challenge's bases, styles and references" (and Terms §8 the same).
   - Every new closed call now sets `zeroDataRetention: true`, `disallowPromptTraining: true` and its provider pin
     (owner, 2026-11-04). With only Google's Vertex pictures published, the draft's variant B wording (no copy kept) is
     accurate; it is now the draft's recommended line (branch `closed-model-bases`).
4. **Fallback:** if the reread hasn't landed by **Thu 5 Nov**, plan B: three open styles (Mood, Printed, Miniature),
   no closed picture published anywhere, `closedBasesAllowed` stays false. The closed styles can join the group after
   the reread; the bases stay as published.
5. Every base must be published before **Fri 6 Nov 09:00 PT** (17:00 UTC), when the window opens; the seed refuses
   after that.

**Code today:** `closedBaseRefusal` (src/lib/challenge/bases.ts) refuses a closed-model base while the flag is off, and
it reads samples as well as views. Since 2026-11-04 its sibling `closedStyleRefusal` gates a style whose samples name a closed model the same way; the
seed script calls it before it publishes a style, and the plan mode shows it ("PUBLISH WAITS").

## The seed script

`scripts/seed-designs.ts` today makes **one** "Starting point" sheet per character, in Techno vistas, and does not call
`closedBaseRefusal`. It cannot yet make three bases per character. This branch adds `--bases-plan`: it reads
`styles-plan.json`, lists for plan A and plan B the three bases per character in the fixed style order, calls
`closedBaseRefusal` on every base (and on each style's samples) against `CHALLENGE.closedBasesAllowed` as committed, and
prints the cost above. It calls nothing and refuses `--apply`. Its output (2026-11-03): plan A, "6 of 18 bases are
refused by closedBaseRefusal" (the Gouache ones) while the flag is false; plan B refuses none. `test:seed-designs` checks
it with no database and no model keys (37 passed). The run that makes and publishes the bases is not built: it waits for
the picks and the OK to spend.

## Decision recorded (owner, 2026-11-04)

**Google's under-18 clause is fine for bases the owner makes.** Gemini 3.1 Flash Image is used only in a batch job the
owner runs, never as a visitor-facing feature; visitors see only the finished pictures. Recorded in
`docs/proposals/closed-model-bases.md` and the notes of `docs/legal/closed-model-bases-draft.md` (branch
`closed-model-bases`). The Privacy lines still need the owner's reread before any closed base is published. Not asked
yet: whether the same reading covers the Gouache style's **samples** (the same kind of batch job, by Google).

## What the owner needs to say

1. **Styles:** keep the group of eight as listed, or drop or rename any; OK or rewrite the three new texts.
2. **Bases:** plan A's three (Gouache, Printed, Miniature) and plan B's (Mood, Printed, Miniature), or others.
3. ~~The style test~~ and ~~Neon night's samples~~: done ($0.08879 and $0.26850). Next: **"OK to spend up to $0.41 on
   the Miniature and Gouache samples"** (worst; estimate $0.28).
4. **Bases spend, separately** (the brief allows spending on the styles only): "OK to spend up to $3.76 on plan A's
   bases" or "up to $1.87 on plan B's".
5. **The reread** of the closed-model-bases Privacy, Terms and About lines, with "styles" added, by Thu 5 Nov; and
   whether the under-18 decision covers the closed styles' samples too.
