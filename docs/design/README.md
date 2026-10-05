# Design direction

Direction for the reader and the living edition, produced as two boards in a
design tool. **Direction, not spec**: the build follows it where it fits the
book and the data, and the brief (`../SNOWMOON-BUILD-BRIEF.md`, section 4c)
records what was adopted.

| File | What |
|------|------|
| `direction-boards.png` | Veridia, Dzego, the Arctic Empire, and the Minpentai board; app type and colour tokens; data-model flags 1–5 |
| `living-edition.png` | Chapter 1 as the living edition: scroll view (day one, partly and mostly illustrated, dark) and play view; flags 6–11 |
| `*.dc.html` | The boards' source. They need the design tool's runtime (`support.js`), which is not part of this repo, so view the PNGs instead |

The handles on the boards are invented placeholders, not real accounts. Ratings,
costs, and images in the mockups are sample data too.

## Adopted so far

- Paper `#F4F2ED` in every chapter; ink `#1D1D1B`, muted `#6A675F`, rule `#DAD6CC`.
  Dark: paper `#161614`, ink `#E7E4DD`.
- A block's setting tints its accent only: Veridia `#2E5A3A` (dark `#8DB58A`),
  Dzego `#B3306E` (dark `#F08DB8`). The Arctic never tints the reader; settings
  without a colour stay ink.
- App chrome: Crimson Pro for reading and headings, DM Mono for labels. Any
  other face appears only inside an in-world template.
- `¶` labels count readable blocks.
- Flags 1–4 and 6–9 and 11 are resolved in the schema or the renderer (brief §4c).
- The board's Veridian vote card is the `veridia/vote` template (brief §4d). The
  slider sits at the centre, as in the source, not where the mockup put it.

## Notes

- **The Minpentai board's "Sandbox · one glider, four turns" panel uses the wrong
  rule.** Its code steps Conway's Game of Life (a cell is born with three
  neighbours and survives with two or three). The book's rule, recovered from
  figure c4-b5 (`../minpentai-rules.md`, section 3.1), is a block rule on 2×2
  blocks whose partition alternates each turn, and its glider is a different
  shape. The sandbox at `/minpentai` follows the board's look (field, grid,
  inset live cells, grey rocks, full-bleed symbol cells with a dashed frame) but
  not that panel.
