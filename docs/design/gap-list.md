# Gap list: the design boards against the app

Every screen and idea on the five boards in this folder, checked against `main`
on 2026-10-07 (commit `096ea66`) and, for Minpentai, the `minpentai-rules`
branch. Written by the coding agent. The boards are direction, not spec; this
list says what exists, not what should be built.

**Status:** **Live** (on main, works) · **Partly** (some of it exists) ·
**Not built** · **Conflict** (the board disagrees with the brief, a principle or
the data, so it can't be built as drawn). A conflict may also be partly built.

**Size** of the remaining work: **S** (hours, one file or two) · **M** (a day or
two, several files, maybe a check) · **L** (a migration, a new service, or a week
or more).

Only stages 3–7 of the 2026-10-07 instructions build from this list:
foundations, the first-visit intro, the Minpentai restyle, the chat proposal and
chat slice 1 (ask about the book).

## Summary

| Board | Items | Live | Partly | Not built | Conflict |
|---|---|---|---|---|---|
| Direction Boards | 27 | 7 | 6 | 12 | 2 |
| Living Edition | 25 | 4 | 8 | 11 | 2 |
| First Visit Intro | 8 | 1 | 4 | 1 | 2 |
| Minpentai Tutorial | 10 | 1 | 4 | 2 | 3 |
| Assistant Chat | 24 | 0 | 1 | 18 | 4 |
| **Total** | **94** | **13** | **23** | **44** | **13** |

One item (A24, the Guesses panel) is a list of decisions, not a feature.

Conflicts that need Nate (details in each table):
1. **Fake content on the boards.** Living Edition 2b–2d, the intro's card 3 and the
   chat board show creators, ratings, costs and sponsors (@ilse, @tovah,
   "$0.031 · funded by @nadia", "take score +0.71") that don't exist. Takes,
   ratings and sponsorship aren't built. Building those screens now would mean
   showing sample data as real.
2. **Minpentai symbols.** Board 1c draws 5×5 player symbols; the tutorial board's
   engine uses a 4-cell symbol; the `minpentai-rules` branch has its own engine.
   One has to change before matches are built (the tutorial board says so too).
3. **Chat and principle 6.** A hosted model receives users' messages; principle 6
   is about pages making no third-party requests. A server-side call keeps the
   page clean, but the message still leaves for a third party. The board's notice
   names the host; that is necessary, not sufficient (chat proposal).
4. **Planning threads "can't be trimmed" vs the removal policy.** `docs/removal.md`
   lets a person hide their own work at once. A whole published thread can be
   hidden with its piece; trimming single messages is what the board rules out.
   Consistent only if hiding is all-or-nothing. Needs saying in the consent
   wording.
5. **"Private questions are kept for you" (chat 9d)** vs the instruction that
   private threads live on the device only. The wording must say "on this
   device".
6. **¶ numbers on the chat board are guesses** ("¶ 20", "¶ 21"). The app's ¶
   labels count readable blocks; quotes must render the real label from the
   text, never a number the model gives.

## Direction Boards (`direction-boards.dc.html`)

| # | Screen or idea | Status | Size | Notes |
|---|---|---|---|---|
| D1 | App chrome tokens: paper, ink, muted, rule, dark values | Live | S | `globals.css`. Spread across rules; stage 3 gathers them. |
| D2 | Crimson Pro for reading and headings, DM Mono for labels | Live | — | Self-hosted through `next/font`. `check:ui` checks chrome fonts. |
| D3 | A world tints the accent only; paper never changes | Live | — | `data-setting` on blocks. |
| D4 | Veridia accent #2E5A3A / #8DB58A in the reader | Live | — | |
| D5 | Dzego accent #B3306E / #F08DB8 in the reader | Live | — | |
| D6 | The Arctic never tints the reader | Live | — | |
| D7 | Veridian vote card as a template (Instrument Sans, hairlines) | Live | — | `veridia/vote`, c1-b18 and c1-b31. |
| D8 | Veridian palette (green season), textures, reference images | Not built | M | Palettes are for illustrators; no design entries for them yet. |
| D9 | Snow season palette (ch 29–31) | Not built | S | Reference only. |
| D10 | Veridian in-world screens beyond the vote: tax table, watch check, anonymous message | Partly | M | Source screens render as drawn; only the vote has a template. |
| D11 | Dzego palette, street and mural textures, reference images | Not built | M | Reference only. |
| D12 | Shop sign at true scale in DotGothic16 | Not built | S | A template font; allowed inside templates only. |
| D13 | Dzegoban lettering, full: original semibold, translation in italic | Partly | M | Lettering exists on seeded images (`lettering.json`); the reader shows Dzegoban as the source sets it, without this layout. |
| D14 | Dzegoban lettering, compact (numbered pairs, 15px) for long blocks, "Hide originals" | Not built | M | Brief flag 3: `layout: full \| compact` not added. Ch 23, 26. |
| D15 | Dzego in-world screens in Rubik (watch, messages) | Partly | M | Source screens render as drawn; no Dzego templates. |
| D16 | Decimal clock explainer | Not built | S | |
| D17 | Minpentai board in code (1c): owner colours, walls, symbols, rocks, debris, fog | Partly | L | Sandbox and engine on `minpentai-rules`, not on main. Board legend and colours not applied there. |
| D18 | A panel framing one region at 390px (render with viewport) | Not built | M | `render` element type exists (brief 4c); no renderer. |
| D19 | Player symbols differ by shape, not only colour | Conflict | M | 5×5 symbols here vs the tutorial board's 4-cell symbol (conflict 2). |
| D20 | Sandbox: one glider, four turns | Partly | S | On `minpentai-rules`. |
| D21 | Summary view (Fin's hand device: symbol locations only) | Not built | S | |
| D22 | Hex grid (ch 12) and shrines (ch 14) variants | Not built | L | Rules investigation on the branch; not implemented. |
| D23 | Countdown lettering ("LE MU GEI TAU FA") | Not built | S | |
| D24 | Arctic palette, textures | Not built | S | Reference only. |
| D25 | Arctic media templates: tunnel poster (c3-b5), restaurant takeover (c13-b64), Big Shoulders and Archivo | Not built | M | Both ingest as `screen` blocks and render as drawn. |
| D26 | Data-model flags 1–5 | Partly | — | 1–4 resolved (brief 4c); 5 not an issue. Lettering `layout` (part of 3) still open. |
| D27 | Image tiles as placeholders for illustrator references | Conflict | — | Must stay placeholders; the app must not show them as images. |

## Living Edition (`living-edition.dc.html`)

| # | Screen or idea | Status | Size | Notes |
|---|---|---|---|---|
| L1 | Top bar "× Snowmoon ···" | Partly | S | The app's bar is "Snowmoon · Cards · About · fid". Stage 3 brings the bar to the board's proportions without new menus. |
| L2 | Chapter selector "CH 1 / 32 ▾" | Not built | M | Chapter nav exists only at the foot of a chapter and on the contents page. |
| L3 | READ / LISTEN tabs | Partly | M | Listening exists (the player and its "Listen" button); no tabs. |
| L4 | IMAGE / VIDEO tabs, video disabled | Not built | S | |
| L5 | 2a "Living edition · the book" banner, day one | Not built | S | The reader is the book text plus seeded images; there is no living edition yet. |
| L6 | Dateline and chapter heading | Live | — | |
| L7 | Scene label "Scene 1 · ¶ 2–9" | Live | — | Without "no images · + Add an image". |
| L8 | "+ Add an image" on a scene | Not built | L | Needs the composer (Milestone 4). |
| L9 | Device template inline, "table as written in the book" | Live | — | `veridia/vote` default template; other screens as drawn. |
| L10 | 2b take header: title, by, remixed from, coverage, creators, take score | Not built | L | Takes and ratings not built. |
| L11 | Element attribution line: ¶ range, creator, version, score, raters | Partly | M | Seeded images show ¶, "AI-generated image" and the recipe link; no creators, versions or scores. |
| L12 | Recipe excerpt inline: prompt, model, cost, "funded by" | Partly | M | Recipe is one link away; cost and sponsorship (Milestone 7) not built. |
| L13 | "uses Kalimar path · @ilse v5" (design references) | Not built | L | Designs and `uses` links exist in the schema, not in the reader. |
| L14 | Full recipe · Book text ▾ · Remix · Rate | Partly | L | Recipe link live; Book text toggle (`display: beside \| replace`) in the schema only; Remix and Rate not built. |
| L15 | 2c mostly illustrated, image replacing 6 blocks, narration reads them all | Not built | L | |
| L16 | 2d dark mode | Live | — | Dark follows the system setting. The vote template stays light, as drawn. |
| L17 | 3a play view: current block with its image | Partly | M | The player shows the current block's seeded image and highlights the block. Layout differs from the board (bottom bar, not a full play screen). |
| L18 | 3b play view, no image: "+ Add an image to this moment" | Not built | M | Depends on the composer. |
| L19 | Section summary, spoiler-limited | Not built | L | Analysis (Milestone 2) not in the reader. |
| L20 | Progress bar with one tick per block, coloured where a take has an element | Not built | M | The player has a time bar. |
| L21 | Skip by block, speed 1.0×, house / voice | Partly | S | Speed and position live; voice choice not built (one house narration). |
| L22 | Flags 6–11 | Partly | — | 6–9, 11 resolved (brief 4c); 10 open. |
| L23 | Sample creators, scores, costs and sponsors shown as data | Conflict | — | Conflict 1: no fake content. |
| L24 | "9:41" status bar in the mockups | Conflict | — | Device chrome, not app content. Never built. |
| L25 | Video tab | Not built | — | Clips are Later. |

## First Visit Intro (`first-visit-intro.dc.html`)

| # | Screen or idea | Status | Size | Notes |
|---|---|---|---|---|
| F1 | Five cards before the book, once, home page | Live | — | `config/intro.json`, `src/components/first-visit.tsx`. Stage 4 rebuilds the look from the board. |
| F2 | Skip in the header on every card; swipe or tap through; Back | Partly | M | Skip and Next exist at the foot of the card; no Back, no swipe, no header placement. Stage 4. |
| F3 | Card 1: title, author, licence line, and the disclaimer as a second line | Partly | S | Card 1 has the independence and no-token line (`check:intro`). Board's "[Author name]" and "[LICENCE NAME]" are placeholders; the app has the real values. Stage 4. |
| F4 | Card 3: "How this was made" sample with @ilse, img-a 4.0, $0.031, funded by @nadia, credits | Conflict | — | Conflict 1. Stage 4 uses a real seeded image and its real recipe facts instead. |
| F5 | Card 5: planned, dashed outlines, hatching, PLANNED stamp, no buttons | Partly | S | Card 5 is "coming"; the treatment is not built. Stage 4. |
| F6 | Live list vs planned list | Partly | S | `status: live \| coming` per card in config, as the board's note suggests. |
| F7 | About page: the same five items, at the bottom; disclaimer at the top | Not built | S | About has "Replay intro screens" at the top and its own text. Stage 4. |
| F8 | Visuals from chapter 1 only | Conflict | S | The app's intro uses seeded images from chapters 1, 3, 14, 30 and 31. Chapter 1 has fewer seeded images than five cards need without repeats; stage 4 decides per card and says so. |

## Minpentai Tutorial (`minpentai-tutorial.dc.html`, `minpentai-tutorial-copy.json`)

| # | Screen or idea | Status | Size | Notes |
|---|---|---|---|---|
| M1 | 12-screen tutorial from chapters 2–4 | Partly | L | `minpentai-rules` has a seven-lesson tutorial and matches with its own wording (`src/lib/minpentai/tutorial-text.ts`). Stage 5 restyles and reconciles wording. |
| M2 | Engine: 2×2 blocks on a shifting grid, rotate 180° on 1 or 3 cells, exactly reversible | Partly | M | The branch has an engine (`engine.ts`); whether it matches this rule is checked in stage 5. |
| M3 | Board styling from 1c | Not built | M | Stage 5. |
| M4 | Lettering with gloss, image note, rivals strip | Not built | M | Stage 5, from the copy file. |
| M5 | Transport: step back, play, step forward, zoom | Partly | S | The sandbox has its own controls. |
| M6 | "Skip tutorial" and "Screens · tap to jump" | Partly | S | |
| M7 | Open issue: 1c's 5×5 symbols vs the 4-cell symbol | Conflict | M | Conflict 2. |
| M8 | Open issue: rock behaviour is the designer's choice | Conflict | S | The book doesn't define rocks this way; must be labelled as invented. |
| M9 | Open issue: screen 12 plays a random board in place of c4-b5 | Conflict | M | The branch has `figure.ts` for c4-b5; stage 5 checks whether the real figure can be used. Stage 5 also adds "Play this figure" under c4-b5 in the reader. |
| M10 | Claim ids as strings ("c4-b79") break on re-ingest | Live | — | Block IDs are the anchor and stay stable across re-ingest (brief 4c item 5); `check:adaptations` checks cited IDs exist. Not a problem in this repo. |

## Assistant Chat (`assistant-chat.dc.html`)

| # | Screen or idea | Status | Size | Notes |
|---|---|---|---|---|
| A1 | Two thread kinds told apart at a glance (○ dashed, no fill; ● filled band, signed) | Not built | S | Slice 1 builds ○ only. |
| A2 | 1a Ask about a block (¶ tap or long-press; sheet: Ask about this · Add image · Copy link) | Partly | M | The reader has selection for quote cards. Slice 1 adds "Ask about this". "Add image" not built. |
| A3 | 1b Ask about a chapter from a chapter menu, "you've read to ch 3" | Not built | M | No chapter menu (L2) and no reading-progress record. Slice 1 adds a device-only reading record and a chapter entry. |
| A4 | 1c Plan an adaptation from /adaptations | Not built | L | Maps to the existing `/adaptations` page; not in slice 1. |
| A5 | 1d General entry: ··· menu → Assistant, thread lists, Pictures coming | Not built | M | Slice 1: asking only; the planning list and Pictures entry stay off. |
| A6 | 2 First-time notice: what it does, never writes for you, host, may become public, "don't show again" | Not built | S | Slice 1, naming the host. "May become public" applies to planning, not slice 1. |
| A7 | 3 Book question with quote cards, ch and ¶, "open in reader", spoiler limit, model name, messages left | Not built | L | Slice 1. Quotes rendered from the text by block ID, never from model output. |
| A8 | 4 Start writing / talk it through | Not built | M | Not in slice 1. |
| A9 | 5a planning thread, "published with your piece as @name" | Not built | L | Not in slice 1. Needs the own-words consent (`config/consent.json`). |
| A10 | 5b the person's piece, kept apart from the chat | Not built | L | Pieces don't exist yet. |
| A11 | 6a/6b a private question turns into planning; private thread isn't copied | Not built | M | Not in slice 1. |
| A12 | 7 Publish review, always shown, can't trim | Conflict | L | Conflict 4. Not in slice 1. |
| A13 | 8 "How this was made" with overlap flags | Not built | L | Not in slice 1. Overlap check deferred. |
| A14 | 9a Declines to write a line, offers what it can do | Not built | M | Slice 1's refusal path (asking threads can be asked to write too). |
| A15 | 9b Answer held back for spoilers, per-thread opt-in | Not built | M | Slice 1. |
| A16 | 9c Daily limit, resets 00:00 UTC | Not built | S | Slice 1, 30 a day. |
| A17 | 9d Signed out | Not built | S | Slice 1. Wording conflict 5. |
| A18 | Model name "open weights · via host" in the composer | Not built | S | Slice 1. Model must be on `config/models.json`. |
| A19 | Book quotes with ¶ numbers | Conflict | S | Conflict 6: the board's numbers are guesses. |
| A20 | Every planning message signed with the person's name | Not built | M | Needs consent. |
| A21 | A hosted model receives messages | Conflict | — | Conflict 3 (principle 6). |
| A22 | Planning thread published in full with the piece | Conflict | L | Principle 2 allows model text shown labelled as model-drafted, never inside the piece; the board does label it. Conflict 4 with removal. |
| A23 | Pictures as a single "coming" entry | Not built | S | Not in slice 1. |
| A24 | The Guesses panel | — | — | Listed as open decisions in `docs/proposals/chat.md`. |
