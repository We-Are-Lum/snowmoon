# Design direction

Direction for the reader, the living edition and the features around it,
produced as boards in a design tool (Claude Design). **Direction, not spec**:
the build follows it where it fits the book and the data, and the brief
(`../SNOWMOON-BUILD-BRIEF.md`, section 4c) records what was adopted. What is
built, partly built or not built is tracked in `gap-list.md`.

**All wording in the boards is model-drafted.** Anything taken from them ships
labelled as draft until Nate rewrites it.

## The boards (committed 2026-10-07)

| File | What |
|------|------|
| `direction-boards.dc.html` | Revision 2. Veridia, Dzego, the Arctic Empire and the Minpentai board (1a–1d); app type and colour tokens; data-model flags 1–5. PNG: `direction-boards.png`. |
| `living-edition.dc.html` | Chapter 1 as the living edition: scroll view (day one, partly and mostly illustrated, dark) and play view (current block with and without an image); flags 6–11. Updated 2026-10-07 to the newer revision from the Snowmoon.zip export. PNG: `living-edition.png` (older revision). |
| `first-visit-intro.dc.html` | The first-visit intro: five cards, then the book, with the same five items on the About page. Placeholder copy. |
| `minpentai-tutorial.dc.html` | The Minpentai tutorial, 12 screens, a working prototype with a real engine. Its copy loads from `minpentai-tutorial-copy.json` (model-drafted). Lists open issues on the board. |
| `assistant-chat.dc.html` | The assistant chat: ways in, first-time notice, private book questions, planning threads, publish review, "how this was made", states, a flow and the designer's guesses. All wording is draft. |
| `minpentai-tutorial-copy.json` | The tutorial's wording, loaded by its board. Model-drafted. |
| `support.js` | The design tool's runtime (generated from its `dc-runtime`), which the boards load. Committed so the boards open from this folder; it is the tool's code, not this project's. |

To view a board, open it from this folder in a browser (the runtime loads
beside it; the tutorial fetches its JSON, so it needs a local web server such as
`npx serve docs/design`).

One edit to the export: the living-edition board linked to
`Direction%20Boards.dc.html`; the link now points to `direction-boards.dc.html`.
The export's `uploads/` folder (copies of the build brief, the chapter notes
and the Fifteen Days treatment) was not committed: the repo's own copies are
the source of truth.

The handles on the boards are invented placeholders, not real accounts. Ratings,
costs and images in the mockups are sample data too.

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
