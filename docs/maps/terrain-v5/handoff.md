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
| Dzego | Its core around both cities: the fjord coast of southern Chile, centred 72.75°W 45°S. The rest: eastern South Africa, centred 29.11°E 29.5°S (since 2026-10-13) | 150°, yes; the rest 255°, no |
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

## City fix round (2026-10-12, after the freeze)

The owner reviewed the city previews; these are display and city-frame fixes only:
- **Meldan's rivers:** the combed, parallel rivers came from the plain being nearly flat. 80% of the frame lies within 9 m (58 to 67 m), with an overall tilt of only 0.32 m/km. On ground that flat, the flood-fill's tie-breaking gradient and the eight-direction routing decided where water went, not the real heights. Now:
  - rivers draw only above 40 km² of catchment (it was 1.5 km²);
  - the 150 m smoothing applies only on the city's plain; elsewhere it is about 40 m;
  - city rivers are drawn with gentle bends.
- **Meldan's hill:** display exaggeration 4×, up from 1.6×. Heights are unchanged.
- **Pafogai Du's hills:** the 150 m smoothing applies only on the grid and 500 m around it; about 40 m elsewhere. The frame's 11 m cells still sample SRTM's 30 m pixels, about 2.7× finer, so some softness remains.
- **Pafogai Du's ghost rectangle:** it was the forest pin painting one forest biome over another. Forest pins no longer replace a forest the climate already made.
- **Pafogai Du's river sawtooth:** two causes.
  - The display line followed grid cells: it now thins them and draws smooth bends.
  - The terrain had stair-stepped drainage trenches: city frames now fill small hollows instead.
- **City specks:** specks of ground just below sea level are lifted to 1 m.
- **Region:** forest pins are feathered into the climate's own biome with lobed, patchy edges, so Meldan's woods are no longer a disc. The long east–west forest edge south of Northshore is the climate's boreal/temperate line, which follows latitude, not a pin; it is unchanged.
- **Tests:** still 113/113 and 31/31; the lake and blend checks pass. Parliament is now 26 m (25 to 60 m required).

## Dzego re-based, and the styled world map (2026-10-13, after Design's "World Map Styled")

The owner's notes on Design's render (2026-10-12): southern Chile still read as Chile zoomed out (the coast "coming to a point plus the hook bay on the opposite coast"); "it all looks too natural", so towns and roads; and the intense river.

**Dzego, re-based.** Chile now shows only as a core of 230 km around both cities (centred 148.8°E 23.4°N in the book's frame), blended over about 200 km into a different real land mass:
- **The base:** eastern South Africa and its neighbours, centred 29.11°E 29.5°S, turned 255°, not mirrored. What shows: the coasts of the Eastern Cape (East London, Gqeberha) and southern Mozambique (Maputo), the highveld, Eswatini and south-eastern Botswana. Lesotho and Durban's coast fall under the Chilean core. Search: `search-dzego-base.json`, rank 2. It scored within 0.002 of rank 1 (north-east Brazil), and was chosen by eye: its coast curves into a broad bay, and a high plateau stands behind the core. Rank 5's coast (south-east Brazil) carries the Lagoa dos Patos, which some would recognise.
- **How the base is chosen:** the search scores how well the base's ground (land, shelf, slope or deep sea) matches the core's source around the blend. It skips bases whose source another part of the map already shows.
- **Famous coasts:** Patagonia's landmarks are now in the famous-coast list: Península Valdés and the gulfs, the Strait of Magellan, Chiloé and the Taitao peninsula. None is in the frame.
- **Dzego's seam checks** all pass: no straight runs, corners, needles or flat stamped areas where the pipeline moved the terrain, and no sharp depth step across the blend. The flat-area check now measures area (about 200 km²) rather than counting cells, since Dzego's cells are smaller than the region's.
- **Sadzu Du's river** now comes from the real drainage, not a carved pin.

**The styled world map** (`/maps` on this branch; `scripts/maps-style.ts` bakes `public/maps/v5/`). It is drawn from the frozen layers; no shape moves.
- **Land:** Design's palette and hillshade. Biome edges are blended and gently warped, not 3 km steps.
- **Sea:** coloured by real depth, from a pale shelf to slate.
- **The coast** is drawn from a land–sea field, so it is smooth at any zoom, and inland cells just below sea level are no longer drawn as coast.
- **Rivers:** drawn from `rivers.json`, their width growing with the log of the catchment and capped. The intense river is the region's largest, draining about 3.55 million km² of real West and Central Africa (in effect the Congo), turned and mirrored. It is now a strong line, not a band.
- **Towns and roads:** texture, invented by the same code and unnamed, so not from the book. They are placed on suitable ground: low, gentle slopes, by rivers and coasts, not on ice, tundra or alpine ground. They are joined by least-cost routes over the real relief, as a spanning tree plus a secondary network between the larger towns. The main roads between the United Cities follow the book's links (chapter 5's figure); their courses are ours. The railway from Meldan to Eldil and a railway between Pafogai Du and Sadzu Du are ours. The About panel says all this.
- **Places:** set from the map's own frames (`world-view.json`), not calibrated by eye (Design's note 8).
- **Spoilers:** as the glossary does it, the furthest chapter opened on this device limits what shows.

**Found while building it, not fixed:** Arturia and Hapton (both placed by us) sit on small round pinned islets in open sea, and Imber on a round lobe of the coast. The "city on land" pins lifted a disc of land under each. Since their positions are ours, moving them onto the real coast would remove the islets; that would change `world.json` and its tests, so it waits for the owner.
