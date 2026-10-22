# Minpentai build-on kit

> DRAFT, 2026-10-20 (owner's go: kit steps 1–2, then the page, these docs and the rules file). Written by the coding agent (Anthropic's Claude, a closed model); for the owner to rewrite or approve. Rules invented for this edition · not affiliated with the author.

> **Spoilers.** `rules.md` quotes the matches of chapters 2–14; `passages.md` quotes every Minpentai passage in the book, through chapter 31, the later ones under a spoiler heading.

Everything someone needs to build on this edition's Minpentai: what the book says, what this edition invented, and where it all lives in the code.

| File | What it is |
|---|---|
| [`code-map.md`](code-map.md) | Step 1: what exists. The three engines, the pages, the tests. |
| [`rules.md`](rules.md) | Step 2: every rule, marked **from the book** (with the block and its words) or **invented** (with where in the code), and whether the site follows it. Generated. |
| [`passages.md`](passages.md) | All 152 passages about Minpentai, word for word, by chapter. Generated. |
| [`ideas.md`](ideas.md) | Ideas for building on it, easiest first. None is built. |
| `public/minpentai/rules.json` | The table as a file, served at `/minpentai/rules.json`: the rules, Play's numbers, and the passages by block id. Generated. |
| `/minpentai/build` | The same as one page on the site. Every passage from chapters 2–14 is shown; chapters 15 onward are inside a closed Spoilers section (owner, 2026-10-20). |

## How it is made and checked

- The table is written by hand in `src/lib/minpentai/kit-rules.ts`. `npx tsx scripts/build-minpentai-kit.ts` writes `rules.md`, `passages.md` and `rules.json` from it, from the book (`content/snowmoon/text`) and from the code.
- `npm run test:minpentai-kit` fails if: the passages are not 152; a cited block does not exist or is not a passage; a quote is not word for word in its block; a rule from the book cites nothing; an invented rule names no place in the code; a place in the code is not in its file; a generated file is stale.
- `check:principles` P8g checks the same, and that the page is labelled Book, Invented and Draft, says it is not affiliated, shows chapters 2–14, and keeps chapters 15 on under Spoilers, closed. `check:ui` checks the page in a browser.

## Which blocks are passages

A block is a passage if it names Minpentai, is cited in `docs/minpentai-rules.md` (the reading of the book's rules), or is cited by Learn's words (`src/lib/minpentai/learn-text.ts`). A cited range counts every block in it. That gives 152 (52 name Minpentai; the rest are cited). A **rule passage** is one the table cites: 69, all in chapters 2–14. The page shows all 127 passages of chapters 2–14 and folds the 25 from chapter 15 on under Spoilers.

## Not here yet

Section C of the kit's plan also lists `bots.md`, `rules-addons.md` and `replay-format.md`. They would describe interfaces that are not built (a side-neutral bot interface, rule add-ons, a replay file), so for now they are ideas in `ideas.md`.
