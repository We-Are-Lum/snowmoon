# Maps v2: generated terrain, shaped to fit the book (proposal)

> By the coding agent (Claude, a closed model), 2026-10-11, on branch `plan-coach`, from the
> owner's brief of the same day. Proposal and previews only: nothing merged, no UI.
> Draft label for anything shown: **"Terrain invented for this edition, shaped to fit the book."**

## What it is

Terrain generated in code from a fixed seed, with every book-fixed feature pinned. No image model
is used. The generator is `scripts/terrain.ts`, with `scripts/lib/terrain-core.ts` and `scripts/lib/noise.ts`.

**How each map is made, in order:**
1. Layered gradient noise, plus ridged noise for mountain ranges.
2. Soft pulls toward the land and sea that the book or our layout gives.
3. Hard pins: the book's features, held exactly.
4. Erosion: water cutting downhill, and steep slopes collapsing. The pins are re-applied after every pass.
5. The book's border river, cut downhill into the inlet.
6. Shallow hollows filled in, as sediment would, and the rest drained, so every land cell flows to the sea or off the map.
7. Rivers, where enough area drains through.
8. Climate, from latitude and height. Rain is carried by the prevailing winds and runs out over high ground, which makes rain shadows.

Climate gets colder toward the Arctic: about −25 + 52·cos(latitude) °C, minus 6.5 °C per km of height.

**Five grids, each in its map's own units:**

| Grid | Units | Cells |
|---|---|---|
| The world | degrees | 385 × 137 |
| Northshore and Thaldur | the chapter 29 battle map's pixels, 2.6 km each | 481 × 241 |
| The United Cities | km from Redshire | 271 × 276 |
| Meldan | 50 m | 265 × 225 |
| Pafogai Du | 20 m | 201 × 311 |

The insets and both cities start from the world's heights and add finer detail.

## The pins

There are 70 constraints in all, each listed in `content/snowmoon/maps/terrain/recipe.json`. Every one names its world guide lines and is marked "book" or "placed by us"; 22 are the book's.

| Feature | How it is held |
|---|---|
| Northshore's coasts (the battle map) | Its seas and its dark ground are held. The coast may move within a 6 km band; beyond that it is fixed. |
| Northglade's island | Land within 8.5 km of its center, and a ring of water around it. The island comes out 21 km wide; the book says "about twenty". A mountain sits at its summit, with the city to the east. |
| Thaldur and the peninsula | Thaldur's core is land, with a strait between it and the peninsula. The peninsula is land and attached to Northshore, with open sea around both. |
| Redshire's gulf | Water held in the gulf's middle. The south islands are land with water around them. |
| Redshire's red, snowy mountains | A range peaking near 2,600 m north-east of Redshire. Where it is, is ours. |
| The border river | Cut downhill along the line we drew, into the inlet. |
| Meldan's mountain | Pinned to the heights the book implies: parliament about 40 m up, and a staircase of about 200 m to the Order's tower. The summit is near 380 m. The rest of the city stays flat and dry, as the book's walks imply. |
| Pafogai Du | The 3.2 km street grid is held flat. The path rises 10% from Dzai Gun to the pyramid's foot. The pyramid is a 500 m square pyramid, cut from a natural massif rising behind it. |
| Places on land | Meldan, every United City, Messalia, Haragmir, Pafogai Du, Sadzu Du, Glasscrown. Where they sit on the globe stays ours, as on the v1 map. |

## How a seed is accepted

**Every map test is run on the generated map.** The physical outlines are traced again from the generated heights before testing:
- both seas;
- Northglade's island, Thaldur, the peninsula;
- Redshire's gulf;
- Meldan's mountain (its steep core and its foot).

There are 113 tests now, not 112: one was added for the pyramid stair after the first count.

**Plus 29 terrain tests,** for what only terrain can show:
- **Climate:** Northglade is snowy, at the boreal forest or colder. Meldan is green. Elenar Forest is snowy pine. Glasscrown is ice or tundra. Redshire has pine forests.
- **Islands are islands;** the peninsula is attached.
- **Rivers:** the border river reaches the inlet. Every river on every grid runs downhill to the sea or off the map.
- **Mountains:** Redshire has snowy mountains. The United Cities' continent has many mountains.
- **Meldan:** its mountain is the high point, in the center. Parliament stands 25 to 60 m up. The staircase climbs 150 to 250 m. The city is mostly flat, with no lake.
- **Pafogai Du:** the grid is flat. The path matches the layout's heights. The pyramid is 500 m tall.

**A seed that breaks any test is rejected.** Of seeds 1 to 17, 14 were rejected, almost all for a lake inside Meldan (the book walks across the city often and never mentions one). Seeds 1, 5 and 17 pass. The full record is in `content/snowmoon/maps/terrain/search.json`.

**The chosen seed is 1.** All three passed the same tests; I chose seed 1 as the first to pass, not on looks. Seed 1's results:
- Northglade's island: 21 km wide.
- Parliament: 42 m up. The staircase: 181 m.
- The pyramid: 494 m.
- The path: 1 m at Dzai Gun, 59 m at the pyramid's foot, 248 m at the door.
- Redshire's peak: 2,600 m.
- The United Cities' continent: 107 peaks over 800 m.

To use another seed: `npx tsx scripts/terrain.ts build --seeds=1,5,17 --chosen=5`.

**Reproducible:** `npx tsx scripts/terrain.ts verify` regenerates seed 1 and fails unless all five grids match the committed heights exactly and every test still holds. It passes.

## The data, for Claude Design to style

In `content/snowmoon/maps/terrain/seed-1/`, five files: `world`, `northshore`, `united-cities`, `meldan`, `pafogai-du`. Each has:
- **height_m**, base64 Int16, in meters. Sea is below 0.
- **water:** the sea rule, plus a lake mask.
- **rivers:** polylines, each with its drainage area.
- **climate_zone:** one of sea, sea ice, ice, tundra, boreal forest, temperate, steppe, desert, subtropical, tropical. The world file also has mean temperature.
- **the overlay:** every book place with its "book" or "placed by us" mark and its lines. Re-traced outlines are flagged `generated_outline`.

The recipe (`recipe.json`) records:
- the seed, the three seeds shown, and the code version (SHA-256 of each source file);
- every parameter, and every constraint with its provenance and lines;
- every test result, and the SHA-256 of each data file.

The previews are in `docs/maps/terrain/`:
- `seeds-world` (the three seeds side by side);
- `meldan-seed-1`;
- `pafogai-du-seed-1`.

They are checks for the owner, not designs: Claude Design styles the data.

## Limits

- **World scale is coarse:** half a degree, about 35–55 km. Northglade's island and the strait only show in the Northshore inset.
- **The world's large shapes are still ours:** where the continents sit, what lies between them, and Dzego's position. The book fixes only the pinned features. Within those, the generator invents coastlines, mountains and rivers.
- **High-latitude rivers run mostly east–west.** The world grid's cells are narrow there. Only the largest rivers are kept, to limit it.
- **The two cities' climate is taken from the world grid at their location.** There is no local weather.
- **Meldan's districts and Pafogai Du's grid are drawn over the terrain, not carved into it.** Roads, tunnels and buildings are not modelled.

## Decisions for the owner

1. The seed: 1 (chosen as the first to pass), 5 or 17?
2. The label: keep the draft, "Terrain invented for this edition, shaped to fit the book."
3. Should the world grid be finer, so Northglade's island shows at world scale? It would cost about four times the run time, still under a minute a seed.
