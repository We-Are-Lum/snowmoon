# Maps v5: real terrain, disguised (proposal)

> By the coding agent (Claude, a closed model), 2026-10-12, on branch `plan-coach`, from the
> owner's brief of the same day. Proposal and renders only: nothing merged, no UI. No image model.
> Draft label: **"Terrain adapted from real elevation data (source in the recipe), reshaped to fit the book."**

## What it is

v4's procedural terrain is replaced by real elevation data:
- **The move:** each real patch is carried to the book's frame by a rigid motion of the sphere. The frame's centre goes onto a source point, turned in 15° steps, mirrored or not, at true scale. Real distances and shapes are kept exactly.
- **The reshaping:** v4's pins hold every book fact, as before.
- **Recomputed from the real heights and the book's latitudes:** climate, forests, lakes and rivers.

The generator is `scripts/terrain-v5.ts`. It reuses v4's pins, hydrology, climate, render and tests.

## Data (public domain only)

Each dataset is recorded like a model entry, with its licence line quoted, in `content/snowmoon/maps/terrain-v5/sources.json`.

| Dataset | Used for | Licence line (quoted) | Attribution |
|---|---|---|---|
| NOAA ETOPO 2022 v1, 60 arc-second surface elevation, land and bathymetry | The region, Northshore, Dzego | "NOAA waives any potential copyright and related rights in these data worldwide through the Creative Commons Zero 1.0 Universal Public Domain Dedication (CC0-1.0)." | NOAA NCEI (2022), ETOPO 2022 Global Relief Model, doi:10.25921/fd45-gt74 |
| NASA SRTM GL1 v003, 1 arc-second | The Meldan and Pafogai Du city patches | "Unless the content is marked with a use restriction or license, data provided from a NASA-led mission are licensed as Creative Commons Zero (CC0)." (NASA Earthdata) | NASA JPL (2013), doi:10.5067/MEASURES/SRTM/SRTMGL1.003, via OpenTopography, doi:10.5069/G9445JDF |

**Notes on the data:**
- OpenTopography's own page for its SRTM copy says "Use License: Not Provided". The line above is NASA's, for the mission's data.
- ETOPO is not to be used for navigation.
- The downloads are in `data-cache/`, which is gitignored. The ETOPO file's SHA-256 is `9d27d4b8…a7fd08e`.

## How the places were chosen

**The region search:**
- Every source centre on a 1.5° grid from 58°S to 76°N, every rotation in 15° steps, mirrored and not: 805,632 placements.
- Each placement is scored on how much of the book the real terrain already meets, before any reshaping, in five parts:
  - the battle map;
  - named places on real land, counted one each;
  - the book's other seas;
  - other land;
  - relief: Meldan on a low plain, Redshire's snowy peaks, mountains on the United Cities' continent.
- The weights are fixed shares, so neither the land pins nor the sea pins can win on numbers alone.
- Placements are cut hard if:
  - fewer than 80% of the named places are on real land; or
  - most of the book's other seas are missing; or
  - Meldan is on high ground.
- A penalty applies for each famous coastline or landmark in the frame. There are 70 of them, each checked at several outline points. The penalty is lower when the window is mirrored or turned more than 45°.
- The best 1,500 placements are re-scored on the 1-arc-minute grid and nudged by half a degree.
- The list keeps source centres at least 1,500 km apart.

**The Northshore patch, a deviation from the brief, flagged:**
- No region-scale window has a real coast resembling the chapter 29 battle map, with its inlet, the peninsula, Thaldur, the strait and Northglade's island. Where the coast differed, the pins cut the drawing into the real terrain, and it read as pasted on.
- So the battle map's area, about 1,250 × 830 km, comes from its own real patch, found by the same search with the battle map's seas and land as its only targets.
- The patch is blended into each region candidate over about 220 km, with an irregular edge.

**City patches, on SRTM:**
1. Screen ETOPO's 1-arc-minute grid for lone hills (Meldan), and for flat lowland with a steep rise behind it (Pafogai Du).
2. Check the shortlist on SRTM, trying every rotation in 15° steps, mirrored and not, plus a small horizontal and vertical scale.
3. Exclude famous or sacred hills: Uluru, Kata Tjuta, Sugarloaf, Table Mountain, Bear Butte, Devils Tower, Stone Mountain, Sigiriya and others.

## The top 5 region candidates

Each is rendered at 4096 px, with layers, tiles and data, in `out/maps-v5/candidate-N/region/`. All five side by side are in `docs/maps/terrain-v5/candidates-region.png`. The renders name no source; the sources are named only in this report and in the recipe.

| Rank | Source centre (lon, lat) | Rotation | Mirrored | Real area under the frame | Famous coasts or landmarks inside the frame | Redshire range raised | Tests |
|---|---|---|---|---|---|---|---|
| 1 | 6.71, 5.50 | 225° | yes | West and Central Africa, the Gulf of Guinea | Gulf of Guinea, East African rift lakes | 25 m | all pass (113 of 113 hold; 31 of 31 terrain checks) |
| 2 | 68.99, 51.50 | 300° | yes | Central Asia and the Russian plain | Black Sea, Caspian Sea, Persian Gulf, Arabian peninsula, Tibet and the Himalaya | 0 | all pass (113 of 113 hold; 31 of 31 terrain checks) |
| 3 | 19.25, 15.50 | 135° | yes | The Sahara and the Sahel, Lake Chad | Mediterranean, Nile delta, Red Sea, Arabian peninsula, Gulf of Guinea | 0 | all pass (113 of 113 hold; 31 of 31 terrain checks) |
| 4 | 77.61, 38.00 | 210° | no | Xinjiang, the Tarim basin, Tibet | Black Sea, Caspian Sea, Persian Gulf, Hainan, Tibet and the Himalaya | 0 | all pass (113 of 113 hold; 31 of 31 terrain checks) |
| 5 | 103.53, 52.00 | 60° | no | Siberia around Lake Baikal, Mongolia | Korean peninsula, Taiwan, Lake Baikal | 813 m | all pass (113 of 113 hold; 31 of 31 terrain checks) |

**The shared parts:**
- **Northshore patch:** 125.95°E, 73°N, turned 135°, mirrored. A low Arctic coast with islands; no famous coast inside.
- **Dzego:** 72.75°W, 45°S, turned 150°, mirrored. A fjord coast and its range. Sadzu Du's river is carved from the book's pin: the real drainage has no river within 12 km of the town.
- **Meldan:** a lone hill at 131.694°E, 47.037°N, turned 225°, mirrored, scaled 1.75× across (real km per frame km) and 1.2× in height.
- **Pafogai Du:** a valley floor beside a steep massif at 121.925°W, 49.208°N, turned 135°, unscaled.

## What "reshaped to fit the book" means here

**Every book fact is held by v4's pins, as before. Changes from v4, for real terrain:**
- **Northshore's land:**
  - v4 held the battle map's "dark ground" right up to the drawing's border. v5 holds it only inside an irregular line 26–100 km in from the border, because the border is where the picture stops, not a coast.
  - There is no gap where the peninsula joins Northshore.
- **The battle map's seas** run on past the drawing's north, south and east borders, as v4 already did for the east.
- **Open water around the peninsula and Thaldur:** an irregular area east of Northshore is open sea (placed by us), because Thaldur is an island and the real patch had land there.
- **Before the pins act,** the real seabed is lifted to 40 m below sea level inside the book's land shapes, and real land is lowered to 40 m inside its seas. The pins' soft pulls then act only where the real terrain disagrees.
- **Where a pin made land out of real sea,** the land gets gentle hills. Where a pin made sea out of real land, the seabed deepens over about 60 km from the coast. Real sea keeps its real depth.
- **Redshire's red mountains with snowy tops:** where the real relief along our range peaks below 2,300 m, it is raised by the shortfall, fading over about 60 km. The amount raised is in the table above.
- **Cities:**
  - v4's invented mountain shapes are dropped, and the hills are real.
  - Meldan keeps its land and forest pins. Pafogai Du keeps the flat grid, the 10% path and the 500 m pyramid.
  - SRTM is smoothed over about 150 m: its per-pixel noise would otherwise read as slopes on flat ground.
  - Lakes are drained in both city frames. A real floodplain otherwise flooded Pafogai Du's grid.
- **Unchanged:** climate is computed from the book's latitudes, not the source's, with real heights. Rivers come from flow accumulation on the real terrain.

## Tests

The same tests as v4: 113 map tests and 31 terrain checks, on every candidate.

| Rank | Redshire's highest peak | Meldan (region scale) | Northglade's island | Northglade's summit | North and south | Border river |
|---|---|---|---|---|---|---|
| 1 | 2383 m, -9.7 °C at the top | temperate grassland | 23 km wide | summit 369 m, boreal pine forest, 0.4 °C | north 0.3 °C, south 10.7 °C | 100% of its line is a drawn river; sea at its mouth |
| 2 | 4133 m, -22.7 °C at the top | temperate grassland | 23 km wide | summit 369 m, boreal pine forest, 0.4 °C | north -3.1 °C, south 7.9 °C | 100% of its line is a drawn river; sea at its mouth |
| 3 | 2470 m, -12.0 °C at the top | temperate forest | 23 km wide | summit 369 m, boreal pine forest, 0.4 °C | north -4.7 °C, south 10.8 °C | 100% of its line is a drawn river; sea at its mouth |
| 4 | 4712 m, -26.7 °C at the top | temperate grassland | 23 km wide | summit 369 m, boreal pine forest, 0.4 °C | north -5.3 °C, south 7.0 °C | 100% of its line is a drawn river; sea at its mouth |
| 5 | 2121 m, -10.8 °C at the top | temperate grassland | 23 km wide | summit 369 m, boreal pine forest, 0.4 °C | north -3.2 °C, south 8.3 °C | 100% of its line is a drawn river; sea at its mouth |

**Shared by all five:**
- Meldan's hill: 413 m above the city; 100% wooded
- Parliament: 31 m
- The staircase: 187 m
- Meldan's plain: 90% under a 5% slope
- Lakes in Meldan: 0 lake cells
- Pafogai Du's grid: 0 steep cells
- The path at Dzai Gun: -0 m, layout 0 m
- The path at the pyramid's foot: 62 m, layout 60 m
- The path at the main door: 254 m, layout 250 m
- The pyramid: 498 m
- Dzego: 62% of Dzego above 300 m
- Sadzu Du: a river within 12 km

## Limits and decisions

1. **At the region's size, about 6,400 × 3,300 km, the disguise is partial.** Every well-fitting window in the search contains a famous coast or landmark. In an earlier run of the search, the only window among the top 30 with none met only 48% of the book. Mirroring and rotation help, but the Caspian, the Red Sea or Tibet stay recognisable in relief. Options:
   - accept one of these;
   - search at a smaller scale, which would be a change to the brief;
   - build the region from several smaller real patches, as already done for Northshore.
2. **The Northshore patch** departs from "one window at the region's scale". It's how the battle map comes to read as real coast rather than a cut-out. Keep it?
3. **The city patches are scaled:** Meldan 1.75× across and 1.2× in height. The book's staircase, parliament and flat city need a steeper, more compact hill than the real ones.
4. **Candidate 5 needed Redshire's range raised by 813 m;** the others needed 0–25 m.
5. **The label:** keep the draft?

**Known flaws in these renders:**
- **The open water east of Northshore:** where the real patch had land, the pinned sea there is a synthetic shallow seabed. Its edge against the region's real deep ocean still shows as a pale block in candidates 1 and 3, and it is visible in the others. Choosing a Northshore patch with real sea east of the peninsula, or a deeper synthetic seabed, would fix it.
- **Meldan's plain is exactly at its limit:** 90% of it is under a 5% slope, against a required 90%.
- **Dzego is a mirrored fjord coast.** Fjord coasts are distinctive even when turned.

## Revision 2: the owner's review (2026-10-12)

**Decisions:**
- **Region:** candidate 1, with disguise accepted as partial.
- **Kept:** the Northshore patch and the city-hill scaling (both recorded in the recipe).
- **Label:** AI-made, in the owner's words.
- **New check:** Pafogai Du has no lake.
- **Branch:** the maps work moves to its own branch, `maps-v5`.

### The Northshore seam

1. **The patch now covers the open water east of the peninsula and around Thaldur.** It is about 1,500 × 830 km, against about 1,250 km before.
2. **The patch was searched again with candidate 1 fixed:**
   - The new patch (79.75°W 6.5°S, turned 285°, mirrored) has real sea under 85% of that open water.
   - Its seabed is the same kind as the region's (land, shelf, slope or deep) at 95% of the points around the blend ring.
   - The blend is about 250 km wide.
3. **East of the peninsula is real deep ocean,** where the pale square used to be.
4. **Thaldur's two open-water rectangles are gone.** The strait and the peninsula's join to Northshore have irregular outlines.
5. **The book's seas still run past the drawing's borders,** along irregular edges.
6. **Synthetic seabed remains only where the book needs sea on the patch's real land,** mainly Northshore's southern sea. There it is one smooth surface:
   - it runs from the coast (−5 m) to the surrounding real depth;
   - it deepens toward the middle of an enclosed sea, to at most 600 m;
   - it has natural relief of about ±20%;
   - it is graded into the real seabed over a 300 km band.

   Real sea keeps its real depth.

**Before and after, at full resolution:**
- `docs/maps/terrain-v5/northshore-before.png`;
- `northshore-review-1.png`;
- `northshore-review-1-seam-runs.png`, with the five flagged runs drawn in red.

### The seam check (new; run with the 113 map tests and 31 terrain checks)

**What is measured:**
- **Contours:** the coastline and the 50, 200 and 1,000 m depth contours are traced. A straight run is one whose every point lies within 1.5% of its length (at least 0.8 km) of the line between its ends.
- **"Anywhere":** any straight run longer than 80 km, wherever it is. Reported, not gating, because candidate 1's real source has long straight coasts. One example is its coast around 80°E 58°N in the book's frame: 138 km of coastline and 309 km of the 50 m contour.
- **"Seam":** the same, counted only where at least half the run lies on terrain the pipeline moved across that level, or in the blend band. Runs that the real terrain already has nearby are excluded: at least 40% as long, within 25 km, in the same direction. These gate.
- **Blend step:** cell-to-cell depth steps in the blend band, against the same measure in the real seabed around it. Fails if the 99th percentile is more than 1.5 times larger, or the largest step is larger.

| Check | First v5 build | Now |
|---|---|---|
| Coastline, seam | (not measured then) | none |
| 50 m, seam | (not measured then) | 2 runs: 108 km, 85 km |
| 200 m, seam | (not measured then) | 3 runs: 140, 87, 85 km |
| 1,000 m, seam | (not measured then) | none |
| Anywhere: coastline / 50 / 200 / 1,000 m, longest straight run | 137 / 309 / 147 / 151 km | 138 / 309 / 147 / 151 km |
| Blend band depth step (99th percentile, largest) | 233 m, 1,021 m (real around it: 426 m, 1,908 m) | 266 m, 1,289 m (real around it: 458 m, 1,908 m) |

**The five seam runs left:**
- **The 108 km run at 50 m** follows Northshore's southern shore, which is a straight line in the book's battle map. Letting the drawn shore wander was tried. It broke the book-sea test, because moving the edge "outward" moved some concave edges into the sea, so it was reverted.
- **The 85 km and 87 km runs at 200 m** follow drawn shapes: the peninsula's north side, and the southern sea's north shore.
- **The 140 km run at 200 m** follows the patch's real coast, which is straight in the source. The 300 km grading moved its contour a little.
- **The 85 km run at 50 m** is at the blend's south-east edge, against the region's own straight real coast.

**So the seam check fails, on the book's drawn shapes and on straight real coasts nearby; none of the runs is a blend or synthetic-seabed seam.**

### Meldan

**Hills checked:** 17 hills were scored, and the five that met the summit, staircase and parliament checks were built at full resolution:

| Hill | Summit | Parliament | Staircase | Flat (90% required) | The 113 map tests | Result |
|---|---|---|---|---|---|---|
| **131.69°E 47.04°N (kept)** | 413 m | 31 m | 187 m | 90.1% | all hold | **passes everything** |
| 66.67°W 0.28°N | 276 m | 32 m | 202 m | 94.2% | 112 of 113: parliament 0.06 km from the traced mountain edge (wg-322) | fails one map test |
| 18.34°E 12.38°N | 442 m | 44 m | 246 m | 93.0% | 112 of 113: parliament 0.07 km from the traced mountain edge (wg-322) | fails one map test |
| Five others | | | | 77–86% | | fail flatness |

Both hills over 92% pass every terrain check, but fail one map test. On them, parliament sits right at the edge of the mountain's traced foot rather than on its slope. So no hill at 92% or more passes everything, and the 90.1% hill stays.

**Meldan's surroundings:**
- **At region scale,** no forest pin covers Meldan. The only region-scale forest pins are Elenar Forest and Northglade. The climate gives temperate grassland at Meldan's cell, on 99% of the land within 50 km and 90% within 150 km. The rain there is below the forest threshold.
- **The city frame comes out 100% temperate forest,** from its own climate and its forest pins for the mountain and Kalimar.
- **So the two scales disagree.** As asked, the climate rules are unchanged.

### Label

**The declaration, in the owner's words with two additions:** "Map made with AI-written code from real public elevation data, reshaped to fit the book. Sources in the recipe. Made by Snowmoon Party, not by the author."

**How it fits the site's labels** (`src/lib/ai-declared.ts`, check:principles P2b):
- **Every declaration names who made it and says "not by the author"** (owner, 2026-10-09). The suggested sentence had neither, so those two clauses are added.
- **The site's visible labels are short** ("AI image · by Snowmoon Party"), and the full declaration sits in the recipe sheet. The matching visible label would be "AI map · by Snowmoon Party", recorded as `short_label`.
- **The site says "AI-generated" for model output,** and the code-made cover says "Drawn in code by the project, with no model". "Made with AI-written code" is accurate here: no model produced the terrain.

### Tests now (candidate 1)

- **Map tests:** 113 of 113 hold.
- **Terrain checks:** 31 of 31.
- **Pafogai Du no-lake check:** passes (0 lake cells).
- **Blend depth step:** passes.
- **Seam check:** the coastline and the 1,000 m contour pass. The 50 m and 200 m contours fail on the five runs above.

## Revision 3: the owner's second review (2026-10-12)

**What changed:**
- **The battle map is treated as a sketch.** All its drawn coasts may move within 20 km, with the real terrain deciding the line. Only each shape's interior is held, beyond a line that wanders 1–20 km in from the drawing.
  - The book-sea test now counts cells more than 20 km inside the drawn line (it was 6 km).
  - All the changes to book tests are listed in the recipe under `book_test_changes`.
- **A new Northshore patch** (14.97°W 11°N, turned 270°, mirrored): a low coast of hills and islands. The previous patch (79.75°W 6.5°S) was the northern Andes, with peaks up to 5,977 m; it is now ruled out by a "hills, not high mountains" target.
- **Thaldur is a real island** of 20,787 km², turned 90° and mirrored. Its source (124.95°E 11.55°N) is in the recipe, under `thaldur_island`.
- **Thin features are removed.** No land or sea feature is narrower than about 5 km unless it is a named book feature. Spurs the rules left behind are opened away.
- **Meldan has a region-scale forest cover pin** (c1-b2, c32-b107). The region now gives temperate forest at Meldan.
- **The label is accepted:** the full declaration, plus "AI map · by Snowmoon Party".

**New seam checks:**
- right-angle corners with both legs straight for 20 km or more;
- needles about one cell (3 km) wide;
- flat stamped areas.

They are scoped to cells the pins and v5's rules changed, not the light erosion.

**Before and after:** `northshore-review-1.png` and `northshore-review-2.png`. `northshore-review-2-flagged.png` marks what the checks still flag: straight runs in red, flat areas in yellow.

## Revision 4: the owner's third review (2026-10-12), frozen

**What changed:**
- **The peninsula and the inlet** are held only as their roles (meandering strips). The inlet arm is left out of the northern sea's area test.
- **The inner sea** is a real gulf (the head of the Shelikhov Gulf), transplanted.
- **The pale dots were stranded shallow plates in deep water,** left where a land hold had lifted the seabed. The real depth now returns wherever the lift did not end as land.
- **Islets under about 400 km² are sunk** in the battle map's area.
- **Thaldur's source is named:** Samar and Leyte, joined at these grids' resolution.
- **The previous Northshore patch duplicated a coast the region already showed.** 1,524 of its 1,947 sample points were also visible on the region's west coast. Patch searches now reject any source the region shows, and the patch is now southern Tanzania's coast.

**Crop:** `northshore-review-3.png`. **Handoff:** `handoff.md`.
