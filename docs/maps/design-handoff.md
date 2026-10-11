# Maps of Snowmoon: handoff to design

> By the coding agent (Claude, a closed model), 2026-10-11, from the owner's decisions of the same day. AI-made, not by the author. Data and docs only so far: no UI is built, nothing is merged.

## What to design

Three maps, published in this order:

1. **Pafogai Du.** View: `pafogai-du.svg`.
2. **Central Meldan.** View: `meldan-center.svg`. The whole-city view, `meldan.svg`, is for context only.
3. **The world**, titled **"one possible layout"**. Views:
   - `world.svg` (main);
   - `world-northshore.svg` (inset);
   - `world-united-cities.svg` (inset);
   - `world-dzego.svg`: Dzego's own inset, with its line "(draft) The book doesn't say where Dzego lies relative to the United Cities."

The SVGs are drafts that show positions and the book/ours distinction. They are not the visual design. Every coordinate is in `content/snowmoon/maps/<map>.json`, alongside each place's shape, provenance, note and tap text.

## The one rule: book or placed by us

Every place on every map is one of two kinds. The reader must always be able to tell which:

- **Book.** The book fixes where it is, relative to what's already placed. Its outline may still be ours.
- **Placed by us.** The book doesn't say where it is, so we chose.

The drafts show book places with solid lines, filled dots and upright labels. Places that are ours have dashed lines, pale fills, hollow dots and italic labels. Design may restyle both kinds, but the difference has to stay visible without tapping.

## On every map

- **The label**, from the map file's `label`: AI-made, by Claude (a closed model), not by the author.
- **The licence:** GPL-3.0, like the book.
- **The full "placed by us" list** (`<map>-placed-by-us.md`), published with the map. The owner decided no author sign-off; publishing the list is how readers can check.
- **"Report a mistake"**, beside the list and in each tap sheet:
  - email snowmoon@wearelum.xyz with the subject "Map mistake: <map> <id>";
  - or open an issue at https://github.com/We-Are-Lum/snowmoon/issues.
  - Each place has an id (in brackets in the list) so a report can name it.
  - Nothing new is needed on the server: the email address is the one on the About page.

## Tap sheets

Tapping a place opens its sheet. The text is in `<map>-tap-sheets.md`, one section per labelled place. Each sheet has:
- whether the place is book or placed by us;
- the explanation;
- the world guide lines it rests on, with their book passages (block ids like c29-b25).

Spoilers: every world guide line carries `from_chapter`. If a sheet is shown to someone partway through the book, only lines at or before their chapter should appear (as the assistant and the coach already do).

Three sheets carry the owner's specific wording:
- **Group Center and Group South** (world, Northshore inset): drawn as on the book's battle map. Each sheet quotes the text, which differs: c29-b25 and c29-b27 (world guide wg-367, wg-368).
- **Arturia** (United Cities inset): placed by us, north-west of Redshire. It quotes c26-b149 and c26-b151, and says the chapter 5 figure shows links between cities, not a map.
- **The stair to the pyramid's main door** (Pafogai Du): placed by us. It quotes the ten percent line (c4-b52) and the twenty-minute line (c24-b21).

## Errata

`errata.md` lists where the book disagrees with itself, with both passages quoted:
- the battle groups' directions;
- Redshire–Devanvil, 15 or 12 percent.

It also lists three things that look like errors but aren't. Link it from the world map.

## Files

In the Drive folder "Snowmoon maps for design" (also in the repository, branch `plan-coach`):

| File | What |
|---|---|
| `design-handoff` | This document |
| `feasibility` | What the book fixes, what's ambiguous, what we placed, and the owner's decisions |
| `errata` | Contradictions, quoted |
| `<map>-placed-by-us` | The list each map publishes |
| `<map>-tap-sheets` | Tap-sheet text for every labelled place |
| `*.svg`, `*.png` | Draft views (the PNGs are screenshots of the SVGs) |
| `data/<map>.json` | Coordinates, shapes, provenance, notes and tap text |
| `data/world-guide-geography.json` | The 92 geography lines the maps rest on, with their sources and chapters |

If design changes a position, rerun `npx tsx scripts/maps.ts check`. It tests every cited relation (113 tests) against the coordinates.
