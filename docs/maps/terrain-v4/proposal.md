# Maps v4: regional terrain, generated in code (proposal)

> By the coding agent (Claude, a closed model), 2026-10-11, on branch `plan-coach`, from the
> owner's brief of the same day. Proposal and renders only: nothing merged, no UI. No image model.
> Draft label for anything shown: **"Terrain invented for this edition, shaped to fit the book."**

## What changed from Design's v3

Design's v3 terrain was one noise field: scattered lakes, no coherent coast, snow everywhere. v4
replaces it with a generator built like real terrain:

1. **Continents** are masks we drew, as signed distance fields. Their coasts are made irregular with domain-warped noise at two scales, which gives bays, capes and offshore islands.
2. **Mountain chains** run along a few chosen spines, as corridors of ridged noise rather than single bumps.
3. **Pins:** every book fact and Design's checked terrain cues are hard constraints (below). They are applied before erosion and again after it.
4. **Hydraulic erosion:** 520,000 simulated droplets on the region, 380,000 on Dzego (after Beyer, 2015).
5. **Priority-flood:**
   - Lakes are kept only in basins at least 40 cells and 50 m deep, at most 4 in the region and 3 in Dzego, each at most about 7,000 km².
   - Small hollows fill with sediment. Larger ones, and any hollow where the book has no lake, are drained by cutting an outlet.
   - Flats get a gradient that varies smoothly in space, so water crossing them meanders instead of running straight.
6. **Rivers** come from flow accumulation and always drain to the sea or off the frame. The book's border river is cut along its line. Sadzu Du's river is cut along a wandering course.
7. **Climate** comes from latitude, height and a rain shadow:
   - temperature is about −25 + 52·cos(latitude) °C, minus 6.5 °C per km of height;
   - rain is carried by the prevailing winds: trades below 30°, westerlies from 30° to 62°, polar easterlies above;
   - rain falls where air climbs and is lost in the lee.
8. **Biomes** follow from temperature and rain. The book's named forests are forced.

## Frames

The region is cropped to where the story happens, so places fill the frame with no empty margins.

| Frame | Covers | Grid | Cell | Render |
|---|---|---|---|---|
| Region | 8°W–84°E, 36–66°N: Veridia, Northshore and the Arctic's southern edge, the United Cities, the land to their south | 2048 × 1061 | 3.1 km | 4096 px |
| Dzego | 138–160°E, 15–31°N, in its own inset (the book doesn't say where Dzego lies relative to the United Cities) | 1536 × 1214 | 1.5 km | 4096 px |
| Meldan | 28 × 24 km around the city | 1024 × 878 | 27 m | 4096 px |
| Pafogai Du | 11.2 × 11.2 km around the city | 1024 × 1024 | 11 m | 4096 px |

The two cities start from the heights of their larger frame and add finer detail.

## Pins

There are 79 constraints: 51 from the book and 28 placed by us. Each one is listed in
`content/snowmoon/maps/terrain-v4/recipe.json` with its provenance and world guide lines.
The main ones:

- **The battle map's coasts:** the northern and southern seas are water, with the coast free to move within a 4–12 km band.
- **Islands and the peninsula:**
  - Northglade's island is land with water around it;
  - Thaldur is an island, with a strait between it and the peninsula;
  - the peninsula is attached to Northshore.
- **Redshire:** the gulf between Redshire and Arturia is water. Its south islands are islands. Its mountains are red with snowy tops.
- **The border river** (c30-b73) follows our line on the Veridia–Arctic boundary into the inlet.
- **Design's cues:**
  - Northglade: snowy hills and pine (c31-b2, c31-b5);
  - Elenar Forest: snowy hills under thick snowy pine (c29-b2, c29-b19);
  - Sadzu Du: hills and a small river (c12-b30, c12-b31, c12-b107).
- **Meldan:**
  - a wooded mountain in the center;
  - parliament about 40 m up;
  - the Order's staircase of about 200 m;
  - otherwise flat, with no lake.
- **Pafogai Du:**
  - a flat 3.2 km grid;
  - the path's heights from the layout;
  - a 500 m pyramid.
- **Named places on land:** every city in the frames.

## Tests

A seed is used only if it passes everything:
- **The 113 map tests** (not 112; one was added for the pyramid stair). They run on outlines traced again from the generated terrain.
- **31 terrain checks:**
  - every book sea is water;
  - every named place is on land;
  - the border river is a river along its line and reaches the sea;
  - the cues above;
  - colder to the north;
  - Meldan is green;
  - every river runs downhill, in every frame.

Seeds 1, 2 and 3 were tried, and all three pass. The record is in `content/snowmoon/maps/terrain-v4/search.json`.

| | Seed 1 | Seed 2 | Seed 3 |
|---|---|---|---|
| Border river drawn along its line | 100% | 95% | 100% |
| Northglade's summit, temperature | 445 m, 0 °C | 456 m, 0 °C | 446 m, 0 °C |
| Northglade's island width | 27 km | 27 km | 27 km |
| Redshire's highest peak, temperature at the top | 2,237 m, −11 °C | 2,527 m, −13 °C | 3,310 m, −18 °C |
| United Cities' peaks over 900 m | 338 | 300 | 322 |
| Meldan's mountain above the city | 386 m | 385 m | 388 m |
| Parliament, staircase | 41 m, 182 m | 42 m, 182 m | 44 m, 187 m |
| Pyramid; path at the pyramid's foot and at the door | 498 m; 62 m, 254 m | 498 m; 62 m, 254 m | 498 m; 62 m, 254 m |
| Dzego above 300 m | 70% | 70% | 65% |

**Side by side:** `docs/maps/terrain-v4/seeds-region.png`. The seeds differ in:
- coastline detail;
- where the ranges sit and how high they reach;
- the river networks;
- which basins hold lakes.

The continents' places and sizes do not change between seeds: the pins hold them.

## Outputs, for Claude Design to style

For each seed and each frame, in `out/maps-v4/seed-N/<frame>/` (not in the repository; copied to Drive):

- **`composite.png`:** a 4096 px preview, combining hillshade, a muted hypsometric tint blended with the biome, water by depth, rivers by flow, a tree-mark texture on forest, and snow on cold high ground.
- **`layers/`:**
  - `hillshade.png` (grey);
  - `tint.png`;
  - `water.png`;
  - `rivers.png`;
  - `forest.png`.
  Each is the frame's full size, so Design can restyle any one.
- **`tiles/`:** the composite in 512 px tiles, with `tiles.json`.
- **`data/`:**
  - `height.png`: 16-bit, meters + 32768;
  - `biome.png`, with its key in `meta.json`;
  - `rivers.json`: polylines in longitude and latitude, with the drainage area at the mouth and at every point (`flows_km2`);
  - `meta.json`: bounds, projection, label and license.

One per seed, `out/maps-v4/seed-N/overlay.json`: the book's places, each marked "book" or "placed by us", with its lines.

**The recipe** (`recipe.json`) records:
- the seeds and the frames;
- the code version (SHA-256 of each source file);
- the method, masks and spines;
- every constraint, with its provenance;
- every test result;
- the SHA-256 of every output.

`npx tsx scripts/terrain-v4.ts build --seeds=1` regenerates them. The recipe's hashes show whether a rebuild matches; I have not run a rebuild to check.

## Revision 2: the owner's decisions and the realism pass (2026-10-11)

**Decisions:**
- **Seed:** 1.
- **Thaldur and the peninsula:** their battle-map band is widened so they read as natural land.
- **Northglade's island:** narrowed to about 20 km.
- **Label:** the draft label stays.

Seeds 2 and 3 are dropped from the outputs.

**What changed:**
- **Coastlines:**
  - Fractal detail near the coast at four scales, about 220, 70, 22 and 8 km, for bays, headlands, inlets and small islands. It is stronger in the cold north.
  - The book's battle-map seas are seas in the base terrain too, so their seabed is natural. The pins only hold them as water.
  - Edges that are the drawing's border, not a coast, are left out. The seas continue 25 px past the battle map's east edge, where the open sea is. That removes the old pale rectangles and the strip of land at the edge.
- **The Arctic:**
  - East of Northshore the coast is irregular, with gulfs and capes about a degree deep. West of Northshore and around it, it is unchanged, so no book fact moves.
  - Two of the three long, parallel ranges become six of different lengths, heights (about 1,300–2,500 m) and directions, some running north to south.
  - Five ice domes of different sizes.
- **Rivers:**
  - Width grows with the drainage area at each point, so a river widens downstream.
  - Rivers are traced longest first. A branch shorter than 22 cells (about 70 km) that joins another river is pruned, unless it is on the book's carved river.
  - The drainage area needed before a river is drawn rises from 3,500 to 5,000 km² in the region, and from 2,500 to 3,500 km² in Dzego.
  - Gentle low relief on the plains makes drainage wander instead of running in parallel lines.
  - The render draws each river along a smoothed course. `rivers.json` keeps the exact cell path, which the downhill test checks.
- **Shallow water:**
  - The continental shelf's width varies along each coast, from about 12 to 270 km, so some coasts drop off steeply and others have wide shallows.
  - The deep floor has banks and ridges.
  - The seabed is shaded by depth on a continuous ramp (shoals, shelf, slope, deep), with its own relief. There is no uniform halo.
- **Thaldur and the peninsula:**
  - Their bands widen from 12 and 4 km to 30 and 16 km. The rectangles that forced open water around Thaldur become ordinary sea pins with their own band.
  - Thaldur is now an island with an irregular coast. The peninsula keeps the drawing's long, thin shape, but its coast is ragged instead of ruled.
  - The battle-map seas keep their 6 km band, so the book-sea test is unchanged.
- **Northglade's island:** the land disk's radius goes from 8.5 to 6.3 km, and the ring of water around it moves inward to match. It now measures 23 km: 7 cells on the 3.1 km grid, about 20 km of land between the outer cells' centres.

**Tests:** the same 113 map tests and 31 terrain checks. Seed 1 passes all of them.

| Seed 1 | Before | After |
|---|---|---|
| Northglade's island | 27 km | 23 km |
| Northglade's summit | 445 m | 369 m |
| Border river drawn along its line | 100% | 95% |
| Redshire's peak, temperature at the top | 2,237 m, −11 °C | 2,094 m, −10 °C |
| Meldan's mountain, parliament, staircase | 386, 41, 182 m | 386, 41, 182 m |
| Pyramid; path at the door | 498 m; 254 m | 498 m; 254 m |

**Before and after**, in `docs/maps/terrain-v4/`:
- `seed-1-region-before-after.png`;
- `seed-1-dzego-before-after.png`;
- `seed-1-meldan-before-after.png`;
- `seed-1-pafogai-du-before-after.png`.

## Limits

- **The large shapes are ours:** where the continents sit, their outlines beyond the pins, the ranges, and Dzego's shape. The book fixes only what is pinned.
- **The peninsula is still long and thin.** That is the battle map's shape. Its coast is now irregular, but its silhouette follows the drawing.
- **The city frames show terrain only.** Meldan's districts and Pafogai Du's streets are drawn over it, not carved in. Meldan's frame is uniform forest around the mountain, because the region's climate there is a single value with no local variation.
- **Dzego's interior is dry steppe with a forested coast.** That follows from its latitude and the trade winds, with no book cue either way.
- **The ice domes are smooth white shapes at full size.** Their snow cover is drawn as a flat colour, so a dome's surface relief barely shows.
