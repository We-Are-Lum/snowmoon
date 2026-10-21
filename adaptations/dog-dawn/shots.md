# DOG at dawn: shots

What was made for each beat of `script.md`. Every attempt is a job in
`content/snowmoon/illustrations/adaptation-dog-dawn.json`, so every attempt has a
recipe in `content/snowmoon/recipes/images/adaptation-dog-dawn.json` (FLUX.2 [klein] 4B,
open weights, Apache-2.0, run locally; cost $0). Lettering is drawn in code by
`scripts/letter-images.py`; its record is
`content/snowmoon/recipes/images/adaptation-dog-dawn.lettering.json`.

Style: `designs/styles/techno-vistas.json` as is, for this piece (owner
decision, Oct 5, 2026). No night variant yet: the style's bright pastel skies
tend to turn night into dusk, so night and pre-dawn are graded in code.

Audio: none yet. Narration waits until the owner has written the lines.

| Beat | Attempt | Seed | Render sha256 | Seconds | Lettering | Picked | Note |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 50011 | `eeaa218dd9f0` | 204 | — |  | Reads as dusk, not night; three guards |
| 1 | 2 | 50012 | `df5f88d92e1c` | 217 | — |  | Night, but Deluin appears twice |
| 1 | 3 | 50013 | `cb29c85020db` | 210 | — | yes | Night, one Deluin, two guards behind glass |
| 2 | 1 | 50021 | `a6d7adba7ea4` | 184 | — | yes | Dusk; graded to night in code |
| 2 | 2 | 50022 | `87b03f22486a` | 176 | — |  | Fire burns a crystalline Arctic building; wrong |
| 3 | 1 | 50031 | `c544644e6e64` | 170 | — |  | Sleeve is not his sweater |
| 3 | 2 | 50032 | `b874adf42825` | 197 | — |  | Rejected by the owner: thumb passes through the screen, stray second hand |
| 4 | 1 | 50041 | `cc6324265344` | 187 | — | yes |  |
| 5 | 1 | 50051 | `2f6b8999512a` | 207 | — |  | Guard stands in the room, not behind glass |
| 5 | 2 | 50052 | `2af39159182e` | 282 | — |  | Rejected by the owner: head faces backward on the body; grade muddy |
| 5 | 3 | 50053 | `003124396bda` | 282 | — | yes | Prompt changed to a pose with no twist; profile at the console, guard behind glass; dusk, ungraded |
| 6 | 1 | 50061 | `ed1852d227cd` | 202 | — | yes |  |
| 8 | 1 | 50071 | `eb4c88c1d23d` | 213 | DOG, DOG |  | Drones fly rather than plough the snow |
| 8 | 2 | 50072 | `ae06c2ac8e0d` | 201 | — | yes | Ploughs through snow; no plate, so no city; one megastructure from the style |
| 9 | 1 | 50081 | `ed75695093fd` | 202 | — | yes |  |
| 10 | 1 | 50091 | `bc77355df9da` | 260 | — | yes | One watcher visible, not two |

Total render time: 56.6 minutes on the maintainer's Mac. Total cost: $0 (local, open-weight model).

Beat 7 is not rendered (see below). Beats 2, 3 and 5 now come from hosted
open-weight models (below).

## Hosted renders (fal.ai)

Recipe: `adaptations/dog-dawn/ab-test/recipe.json` (endpoint, date, request id,
exact prompt, seed, cost, sha256). The post looks like beat 1: pale faceted
crystal walls, night through the windows (owner's revision, Oct 5, 2026).

| Beat | Pick | Model | Note |
|---|---|---|---|
| 2 | `ab-e-02-a1` | ERNIE-Image Turbo | Night through the window, fire and drone lights; the room matches beat 1 |
| 3 | `ab-e-03-a1` | ERNIE-Image Turbo | One hand in the cream sleeve; the warm thread leaves the heartbeat line |
| 5 | owner to choose: `ab-e-05-a2` (a) or `ab-zc-05-a2` (b) | ERNIE-Image Turbo, re-prompted / Z-Image Turbo ControlNet from attempt 3 | (a) working at the console, faceless silhouette behind frosted glass, starry windows; (b) attempt 3's layout, but the guard stands in a starry window rather than behind frosted glass |

### Final pass: one Deluin (owner, Oct 5, 2026)

Every panel he is in uses the fixed description in
`designs/characters/deluin.json` (`fixed_description`), word for word; the
hand-only close-up uses its sweater words. Previous versions are kept.

| Beat | New (candidate) | Old (kept) | Note |
|---|---|---|---|
| 1 | `ab-e-01-a1` | `dd-01-a3` (FLUX klein) | Alone at the post, two faceless guards behind frosted glass, starry night |
| 3 | `ab-e-03-a2` | `ab-e-03-a1` | Same seed; hand and thread against pale crystal, starry window |
| 5 | `ab-e-05-a3` | `ab-e-05-a2` (the owner's pick, (a)) | Same seed and composition; only the character wording changed |
| 9 | `ab-e-09-a1` + screen (cut) | `dd-08-a1` + screen (cut) | Monitor faces the viewer; screen composited in code; OCR reads every word |

Beat 10 also has Deluin and is still FLUX klein; it was not in this pass.

### Wording fix (owner's notes, Oct 5, 2026)

Beat 3: `ab-e-03-a2` is taken. The fixed description now matches beat 10's
outfit (a long cream cable-knit wool tunic to mid-thigh, plain leather belt,
hood down; dark green wool trousers; brown leather boots; no zips,
drawstrings, pockets or logos) and asks for warm, natural skin, with the
screen's light only on the desk and his hands. Beats 1, 5 and 9 re-rendered
with the same seeds, changing only those words (attempt limit waived by the
owner). The old description is kept in `deluin.json`
(`fixed_description_history`).

| Beat | New | Previous (kept) |
|---|---|---|
| 1 | `ab-e-01-a2` | `ab-e-01-a1` |
| 5 | `ab-e-05-a4` | `ab-e-05-a3` |
| 9 | `ab-e-09-a2` + screen (cut; OCR exact at text width 170) | `ab-e-09-a1` + screen |

Hosted spend so far: $0.1363 (A/B and all rounds), cap $1 per round.

## Steps in code after the render

Each keeps the clean render and has its own record in
`content/snowmoon/recipes/images/`. Text drawn in code appears only on flat
surfaces facing the viewer (owner's notes, round 3).

| Beat | Pick | Steps | Record |
|---|---|---|---|
| 2 | a1 | night grade (fire and lamps kept) | `adaptation-dog-dawn.grade.json` |
| 4 | a1 | sky and towers above the grid filled dark | `adaptation-dog-dawn.grade.json` |
| 6 | a1 | pre-dawn grade; pattern only, no word | `adaptation-dog-dawn.grade.json` |
| 7 | drawn | one printed sheet, face-on, drawn entirely in code: paper, squiggles, DOG; OCR exact | `adaptation-dog-dawn.drawn.json` |
| 8 | a2 | plain; and an overlay version, the Arctic drone's view with a code-drawn label DOG; OCR exact | `adaptation-dog-dawn.drawn.json` |
| 9 | a1 | the book's screen c30-b61, captured from the reader's template, composited with glow and spill; the cut version (first line … sign-off) | `adaptation-dog-dawn.screens.json` |

Superseded and kept on record: DOG lettered on angled sheets (beats 6 and 8,
`adaptation-dog-dawn.lettering.json`), sheets laid on drone bodies
(`adaptation-dog-dawn.sheets.json`), four model repaints all rejected by OCR
(`adaptation-dog-dawn.harmonise.json`), and the full-length screen on beat 9.

Deluin's post has a location plate: `designs/locations/arctic-command-post.json`
(invented; its plate's recipe is in `recipes/images/locations.json`). The
forest plate itself holds the city, so beat 6 keeps it; beat 8's render did not
use the plate, and the style still adds one megastructure.
