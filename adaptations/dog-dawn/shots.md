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
| 3 | 2 | 50032 | `b874adf42825` | 197 | — | yes | Cream cable-knit sleeve; a faint second hand at the lower left edge |
| 4 | 1 | 50041 | `cc6324265344` | 187 | — | yes |  |
| 5 | 1 | 50051 | `2f6b8999512a` | 207 | — |  | Guard stands in the room, not behind glass |
| 5 | 2 | 50052 | `2af39159182e` | 282 | — | yes | On the post plate; guard behind frosted glass; a lightning streak in the left window |
| 6 | 1 | 50061 | `ed1852d227cd` | 202 | DOG, DOG | yes |  |
| 7 | 1 | 50071 | `eb4c88c1d23d` | 213 | DOG, DOG |  | Drones fly rather than plough the snow |
| 7 | 2 | 50072 | `ae06c2ac8e0d` | 201 | DOG, DOG | yes | Ploughs through snow; no plate, so no city; one megastructure from the style |
| 8 | 1 | 50081 | `ed75695093fd` | 202 | — | yes |  |
| 9 | 1 | 50091 | `bc77355df9da` | 260 | — | yes | One watcher visible, not two |

Total render time: 51.9 minutes on the maintainer's Mac. Total cost: $0 (local, open-weight model).

## Steps in code after the render

Each keeps the clean render and has its own record in
`content/snowmoon/recipes/images/`.

| Beat | Pick | Steps | Record |
|---|---|---|---|
| 2 | a1 | night grade (fire and lamps kept) | `adaptation-dog-dawn.grade.json` |
| 3 | a2 | light night grade | `adaptation-dog-dawn.grade.json` |
| 4 | a1 | sky and towers above the grid filled dark | `adaptation-dog-dawn.grade.json` |
| 5 | a2 | night grade | `adaptation-dog-dawn.grade.json` |
| 6 | a1 | pre-dawn grade, then DOG lettered | `adaptation-dog-dawn.grade.json`, `adaptation-dog-dawn.lettering.json` |
| 7 | a2 (proposed) | (a) full sheets drawn in code and laid on in perspective; OCR reads DOG on both. (b) model repaint of (a): four tries, all rejected by OCR | `adaptation-dog-dawn.sheets.json`, `adaptation-dog-dawn.harmonise.json` |
| 8 | a1 | book screen c30-b61 captured from the reader's template, composited onto the monitor with glow and light spill; full and cut (first line … sign-off) versions | `adaptation-dog-dawn.screens.json` |

Deluin's post has a location plate: `designs/locations/arctic-command-post.json`
(invented; its plate's recipe is in `recipes/images/locations.json`). Panels 6
and 7: the forest plate itself holds the city, so 6 keeps it; 7's retry was
rendered without the plate, and the style still adds one megastructure.
