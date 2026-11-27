# Glossary definition drafts (DRAFT, not approved)

Written by the coding agent (Claude, a closed model by Anthropic) and its helper agents (the same model), 2026-11-24/25,
in cloud session `session_015MNLwvqWNRKiBmpphsR2Lj`. Every draft is marked `status: draft` and `approved: false`, and
carries "drafted with AI help (Claude, by Anthropic)". They are for Garance and Nate to approve or correct, as the
challenge's Learn more texts were. None of them is on the site.

- `drafts/<slug>.json` holds one draft for each of the glossary's 211 terms: 1 to 3 sentences, each citing at least one
  block (`c<chapter>-b<block>`). Quotes are segments of their own and word for word.
- `index.html` is the review page: one card a term, with the cited blocks' text under it. It is built by
  `npx tsx scripts/glossary-definitions-page.ts`.
- `npx tsx scripts/test-glossary-definitions.ts` is the check. Every term has a draft, every quote is word for word at
  its block (the challenge's quote rule, `src/lib/challenge/book-quotes.ts`), and every sentence is cited. Five planted
  faults must fail.
- How they were made, and the prompts word for word: `docs/prompts/013-glossary-definitions.md`.

## What the check can't see

The check proves the quotes and that each sentence has a citation. It doesn't prove that the words outside quotation
marks say only what the cited blocks say. That was checked by reading: the drafting agents reread their own drafts, the
coding agent read a sample, and four checking agents then read every draft against its blocks and changed 73 of the
210 they checked. Most of the changes were a speaker the book doesn't name, a gender it doesn't state, or a detail
from outside the cited block. A person should still read each draft against the blocks shown under it on the review
page.

## Terms worth a closer look

The helper agents flagged these, where the book says little or is unclear.

- **Glossary entries that may be the wrong kind or overlap:**
  - **gun**, **su** and **mu** are listed as Dzegoban words, but in the book they are people. The drafts treat them
    as people.
  - **sa-dzu-du** may overlap with "Sadzu Du".
  - **selwert** is spelled "Sewlert" once (c26-b174).
- **Words the book never translates:**
  - gei-zen, lei-kai-fun, kai-can, gui-sau, sho-hei-dai, ten-min, gi-dai, sen-hu, dia-lau-shau, fai-hie, lin-man, tei,
    pa-gu.
  - These drafts say only where the word appears.
- **Only in dates:**
  - bloomtime, firemoon, frostime, fruitmoon, grapetime, grasstime, harvestmoon, mistime, rainmoon, snowmoon,
    windmoon.
  - The book never calls them months, so no draft does: each says the word appears in the book's datelines. (Three
    first drafts called them months; the coding agent changed them.)
- **One label in a diagram or chart (c17-b73, c5-b46):**
  - The Graph Funding chart (c17-b73): bonne, pov, imerry, poppe, mawart, dalias, kudlin, melana, vidrik. Bonne may be
    part of one name, "Vidrik Bonne".
  - The co-governance diagram (c5-b46): petersvil, arturia, arturian. Arturian is linked to Arturia without the book
    saying so.
- **One passing mention:**
  - The Helisport and redball game in chapter 11: dommus, dela, meny, plat, egardo.
  - Other single mentions: dzundei, geijaken, eldil, pelow, ja, zau, zume, clearhill, dolinar, zin-go, messalia,
    northgladers, belpakian, dzego-man, jin, seiza, dza-dzingo, fau, mogna.
- **Major characters (zei, fin):** the drafts are short statements of who they are. A person may want to choose what
  best defines them. Zei's draft was rewritten by the coding agent after the first draft claimed things its blocks
  don't support.
