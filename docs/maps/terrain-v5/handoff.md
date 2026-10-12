# Maps v5, frozen for Claude Design (2026-10-12)

Candidate 1, as built on branch `maps-v5`. Terrain iteration has stopped (owner, review 3). Design styles the layers; the terrain itself is not to be edited further without a new round.

**Label:** "Map made with AI-written code from real public elevation data, reshaped to fit the book. Sources in the recipe. Made by Snowmoon Party, not by the author." The short visible label is "AI map · by Snowmoon Party".

## What's real

Every height comes from public-domain elevation data (`sources.json`), carried by a rigid motion of the sphere: a rotation, sometimes a mirror, at true scale.

| Part | Real source (ETOPO 2022 unless noted) | Rotation, mirrored |
|---|---|---|
| The region | West and Central Africa, centred 6.71°E 5.5°N | 225°, yes |
| Northshore (the battle map's area) | The coast of southern Tanzania, around Lindi, centred 41.36°E 9.5°S | 135°, yes |
| The inner sea (the battle map's southern sea) | The head of the Shelikhov Gulf, northern Sea of Okhotsk, centred 157.84°E 59°N | 90°, yes |
| Thaldur | Samar and Leyte, Philippines, which the 1–2 arc-minute grids join across the San Juanico Strait (about 2 km wide). Samar alone is about 13,400 km², Leyte about 7,400 km². | 90°, yes |
| Dzego | The fjord coast of southern Chile, centred 72.75°W 45°S | 150°, yes |
| Meldan | A lone hill at 131.69°E 47.04°N (SRTM), scaled 1.75× across and 1.2× in height | 225°, yes |
| Pafogai Du | A valley floor beside a 490 m massif at 121.93°W 49.21°N (SRTM) | 135°, no |

**Not shown twice:** none of these sources is also shown elsewhere in the map, and the searches check this.

**Recomputed from the real heights and the book's latitudes:** rivers (flow accumulation), lakes, climate and forests.

## What's reshaped

Each of these is listed in `recipe.json` (`constraints`, `book_test_changes`):
- **Held to the book:** the book's seas, the named places on land, and Northglade's island.
- **Redshire's snowy range:** raised where the real relief fell short (by 25 m).
- **The battle map's coasts move within 20 km.** Only each shape's interior is held.
- **The peninsula and the inlet are held only as their roles,** as meandering strips:
  - the peninsula is land, attached to Northshore and pointing at Thaldur;
  - the inlet is water, from the open northern sea to the border river's mouth.
- **The pipeline's own edits:**
  - Northshore's real patch blended into the region over about 250 km;
  - the gulf and Thaldur transplanted, feathered at their edges;
  - land made from real sea given relief;
  - spurs under about 12 km and pockets under about 25 km removed, in the battle map's area;
  - islets and shoals under about 400 km² sunk;
  - forest pins for Elenar Forest, Northglade and Meldan.

## Tests at the freeze

- **Map tests:** 113 of 113 hold.
- **Terrain checks:** 31 of 31.
- **Pafogai Du no-lake check, and no sharp depth step across the Northshore blend:** both pass.
- **Seam checks:**
  - right-angle corners: pass;
  - straight runs over 80 km where the pipeline moved the line: 1 in the coastline (95 km), 1 at 50 m (80 km), 4 at 200 m (longest 123 km), none at 1,000 m;
  - needles: 183 cells, almost all single cells below sea level inland in the real data, not visible;
  - flat stamped areas: 10, the largest 1,830 km².

## Known flaws (seen in `northshore-review-3.png`)

1. **The peninsula and the inlet** are pinned strips and still read as made. The peninsula is a long finger of even character; the inlet is a narrow, curving channel.
2. **Two small round lakes** lie west of the inner sea.
3. **The inner sea's south shore** keeps small bumps where the held land meets the real gulf.
4. **The battle map's land is mostly low.** Only Northglade's pinned summit (369 m) reads as "snowy hills".
5. **Disguise is partial at the region's scale** (accepted). The region's own straight real coasts fail the "anywhere" straight-run measure: 138 km of coastline, 309 km at 50 m. They are reported, not gating.
6. **Meldan's forest is pinned at region scale** (a cover pin, c1-b2 and c32-b107). The climate alone gives grassland there.
