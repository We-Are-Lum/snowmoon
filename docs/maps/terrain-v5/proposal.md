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
