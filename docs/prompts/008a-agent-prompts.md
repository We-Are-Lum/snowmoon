# 008a: Prompts the coding agent gave its helper agents

Date: 2026-10-03. Agent: Claude Code.

During session 008 the coding agent split some drafting across helper agents
running in parallel. Their output is committed (read-aloud text, the word lists
behind `pronunciation.json`, character profiles, key moments), so the prompts
that produced it are recorded here, verbatim. Each prompt was sent several times
with only the chapter list changed; the lists are given above each prompt.

## Read-aloud descriptions and invented-word lists

Sent four times, for chapters 2–9, 10–17, 18–25 and 26–32. Shown for 2–9.

```text
You are preparing narration inputs for the Snowmoon audiobook in the repo at [the repository root] (a GPL-3.0 adaptation of Vitalik Buterin's novel). Your chapters: 2, 3, 4, 5, 6, 7, 8, 9.

Do NOT run any speech model, do NOT touch the database, do NOT edit any file other than the outputs listed below, and do NOT git commit.

Inputs:
- content/snowmoon/text/chapter-N.json: {blocks:[{idx, kind, content, sha256, data?}]}. kinds: heading, dateline, paragraph, quote, screen, figure, break.
- Screen/figure blocks have data.fields (structured table/text/button/svg fields). Figures also have an exported SVG at docs/source-figures/c{N}-b{idx}.svg — read the SVG (text labels, path coordinates) to describe what it shows accurately.
- The worked example for chapter 1 is content/snowmoon/read-aloud/chapter-1.json. Match its format, tone, and length exactly.

TASK 1 — For each of your chapters, write content/snowmoon/read-aloud/chapter-N.json in the same format as chapter 1 (work_id, chapter, about (copy chapter 1's about text), overrides[]). Include one override for EVERY block that is (a) kind screen, (b) kind figure, or (c) kind quote whose content contains "dz-card" (Dzegoban lyric cards). Each override: idx, kind, block_sha256 (copy the block's sha256 exactly), read_aloud, status "unreviewed".
Rules for read_aloud text:
- It is spoken by a narrator in the middle of the chapter, right after the preceding paragraph. Read the paragraphs before and after so it flows and doesn't repeat what the prose already says or is about to say.
- Short: usually one to three sentences; a large rubric or map can be up to ~5 sentences. Summarize; NEVER read a table cell by cell. Keep numbers that matter to the story.
- Write numbers, units, and symbols as words the way a narrator would say them ("one point five one percent", "eleven oh three", "at least two hundred"). No markdown, no HTML, no symbols like ≥ → % #.
- Messages/notifications: say who it's from and quote the message text verbatim (it's dialogue the reader needs). Skip timestamps and decorative UI.
- Describe only what is on the screen/figure; do not add interpretation or spoilers from later chapters.
- Dzegoban (the invented language: romanized syllables like "zui fia kun zun", "dzu hu sun du"): wrap every run of Dzegoban words in curly braces, e.g. {zui fia kun zun}. A script converts braced text to phonemes. For dz-card lyric blocks, read the Dzegoban line(s) in braces, then give the English meaning if the book provides it in the card or nearby prose (e.g. "{zui fia kun zun}, meaning ..."). Never put English inside braces.
- If a screen block is identical to an earlier one (same sha256), still give it its own override, phrased as "The same screen again: ..." or similar short wording, as chapter 1 does for block 31.

TASK 2 — For each of your chapters, write /tmp/snowmoon-pron/chapter-N.json (mkdir -p the folder) as {"chapter": N, "words": [...]}, listing every invented word or name that appears in that chapter's text (prose, quotes, screens, figures) — anything a standard English dictionary wouldn't have: character names, places, brands, bands, invented months/units, coinages, and every Dzegoban word or phrase. Do not list ordinary English words or real-world names (e.g. Emerald, Lily, Freetown is invented — include it; Arctic is real — skip). Each item: {"word": exact spelling as in text, "kind": one of name|place|brand|time|coinage|dzegoban, "first_idx": block idx of first appearance, "context": a few words around it, "meaning": English meaning if the text gives one, else null}. For Dzegoban, "kind": "dzegoban" and list (i) each multi-word Dzegoban phrase exactly as it appears in prose (often italic, e.g. "dzu hu sun du") and (ii) each Dzegoban-derived name (e.g. Zei, Bai, Sadzu Du, Pafogai Du, Kungaupei, Minpentai). Names that are Dzegoban-derived (characters/places from Dzego) should be kind "dzegoban" too. Include plurals/derived forms (e.g. Veridians) only if spelled differently from the base word in a way that matters.

When done, reply with a short summary: per chapter, number of overrides written and number of words listed, plus any block you found hard to describe or any doubt about whether something is Dzegoban. Verify each JSON file parses (python3 -m json.tool) and that every screen/figure/dz-card block in your chapters has exactly one override with a matching sha256.
```

The coding agent merged the word lists into `content/snowmoon/pronunciation.json`
and chose the forced pronunciations itself.

## Character profiles

Sent once.

```text
You are building character profiles for illustrating the Snowmoon novel, in the repo at [the repository root] (a GPL-3.0 adaptation of Vitalik Buterin's novel). Do NOT run any image model, do NOT touch the database, do NOT git commit, and do NOT edit files other than the outputs below.

Inputs: content/snowmoon/text/chapter-1.json … chapter-32.json ({blocks:[{idx, kind, content}]}; content is Markdown with <span> tags around dialogue), and docs/SNOWMOON-CHAPTER-NOTES.md (summary, "People" section; not quote-verified — verify against the text). The privacy robe is already a prop at content/snowmoon/designs/props/privacy-robe.json.

Characters (use exactly these slugs): gladias, seila, zven, lily, febric, hreda, vil, daia, mov, delwart, ephelion, verdow, lektor, zei, bai, fin, mu, den, min (Zei's mother), deluin, jahn, tafindel.

TASK 1 — For each character, search the whole book and collect facts relevant to how they should be drawn: age or life stage, pronouns, role, family relations, home world/setting (veridia, dzego, united-cities, arctic), any physical description at all (hair, height, build, clothing, glasses, injuries, how they carry themselves), habits shown visually (e.g. Febric carries a hand device cabled to a compute box), and whether they wear the Veridian Privacy Robe in public. Every fact needs a chapter, block idx, and a short verbatim quote. The book has very little physical description; record what exists and don't invent facts.

Then write content/snowmoon/designs/characters/<slug>.json:
{
  "kind": "character",
  "name": "<name as in the book>",
  "slug": "<slug>",
  "status": "starting point",
  "about": "One or two sentences: who they are (no late-book spoilers beyond what's needed), and that the appearance is invented because the book barely describes it, so contributors can replace it.",
  "setting": "veridia|dzego|united-cities|arctic",
  "facts": [{"chapter": N, "idx": N, "quote": "...", "fact": "..."}],
  "descriptor": "...",
  "wears_privacy_robe_in_public": true|false,
  "sheet_prompt": "..."
}
- "descriptor": a single noun phrase starting with "a" that describes an invented, fictional appearance consistent with every fact: age, build, hair, face, skin tone, everyday outfit with specific colors. 30 to 60 words. NEVER include the character's name or any other name, and no text or logos on clothing. It is used as "Reference image 1 shows <descriptor>", so phrase it to fit that. Make the cast visually distinct from each other at a glance (hair color/style, silhouette, outfit color), so two characters in one picture can't be confused. Family members can share a resemblance. Keep the two worlds' looks as invented fashion (e.g. Dzego clothes can be bright, practical, techy; Veridian clothes calm, natural fibers, greens and earth tones), and do NOT map either world onto a real-world ethnicity or nationality, and avoid stereotypes. Make the cast varied in skin tone, features and build across both worlds. Never describe a real person or a resemblance to anyone real. Children and teens: describe age-appropriately and plainly.
- "sheet_prompt": the prompt for a character reference sheet: "Character reference sheet on a plain warm off-white background: three full-body views of the same person side by side, front view facing the viewer, three-quarter view, and back view, neutral standing pose, even lighting. <descriptor, rephrased as 'The person is ...'>" No name.

TASK 2 — Write content/snowmoon/illustrations/cast.json:
{"about": "Reference sheets for the starting cast. Each profile's sheet is used as a reference image whenever that character appears.", "style": "designs/styles/watercolor.json", "jobs": [ {"id": "<slug>-sheet", "chapter": null, "idx": null, "characters": [], "setting": "<setting>", "prompt": "<sheet_prompt>", "width": 1024, "height": 576, "seed": <a distinct integer per character, e.g. 5000 + position>} , ... ]} in the order listed above.

Validate that every file parses with python3 -m json.tool and that no descriptor or sheet_prompt contains any character name from the list (check with a script). When done, reply with a table: slug, age/life stage you settled on with the evidence, setting, robe yes/no, and the descriptor. Flag any character whose facts conflict or whom you couldn't find much on.
```

## Key moments per chapter

Sent four times, for chapters 1–8, 9–16, 17–24 and 25–32. Shown for 1–8.

```text
You are choosing key moments to illustrate in the Snowmoon audiobook, in the repo at [the repository root] (a GPL-3.0 adaptation of Vitalik Buterin's novel). Your chapters: 1, 2, 3, 4, 5, 6, 7, 8. Do NOT run any image model, do NOT touch the database, do NOT git commit, and do NOT edit files other than your outputs.

Inputs: content/snowmoon/text/chapter-N.json ({blocks:[{idx, kind, content}]}; read every paragraph of your chapters), docs/SNOWMOON-CHAPTER-NOTES.md (summary; not quote-verified), content/snowmoon/designs/styles/watercolor.json (style, with per-setting notes), content/snowmoon/designs/props/privacy-robe.json.

Character profiles are being written right now by another agent at content/snowmoon/designs/characters/<slug>.json, with reference sheets that will be rendered as images-out/cast/<slug>-sheet.png. The slugs are exactly: gladias, seila, zven, lily, febric, hreda, vil, daia, mov, delwart, ephelion, verdow, lektor, zei, bai, fin, mu, den, min (Zei's mother), deluin, jahn, tafindel. Anyone else appears unnamed and generic.

For each chapter, write content/snowmoon/illustrations/chapter-N.json:
{"about": "Key moments for chapter N, seeded by the project as a starting point.", "style": "designs/styles/watercolor.json", "jobs": [ ... ]}
with 4 jobs (3 for a very short chapter, 5 for a very long or eventful one). Each job:
{
  "id": "c<N>-b<idx zero-padded to 3>-<short-slug>",
  "chapter": N,
  "idx": <the paragraph block it illustrates — must be kind paragraph or quote, never screen/figure/break>,
  "setting": "veridia|dzego|united-cities|arctic" (where the scene physically is, from the most recent dateline and the prose),
  "characters": ["designs/characters/<slug>.json", ...]  — at most 2, only characters whose faces are visible; ordered as they are referred to in the prompt,
  "references": ["cast/<slug>-sheet", ...]  — same characters, same order,
  "props": ["designs/props/privacy-robe.json"] only if someone in the image wears a privacy robe, else [],
  "prompt": "...",
  "width": 1024, "height": 576,
  "seed": N*1000 + idx
}

How to choose moments:
- Spread them across the chapter (beginning, middle, end), favoring visually strong, concrete moments the text actually describes: places, actions, objects, weather, crowds, confrontations. Avoid interior monologue and abstract discussion. Each chapter should include at least one establishing image of its main location.
- Prefer moments that show the book's distinctive world: the robe, hand devices, sky bridges, autobuses, Dzego streets and pyramids, Minpentai halls, helisport, underground foil-lined rooms, drones.
- War and violence can be shown, but not graphically: no gore, no visible wounds or bodies.

How to write each prompt (this matters, the model is literal):
- 50 to 110 words. Describe the shot: framing (wide/medium/close), where the people are, what they're doing, their expressions, the setting details from the text, time of day and light.
- NEVER write a character's name or any proper noun (no place names, brand names, Dzegoban words). Refer to profiled people as "the person from reference image 1", "the person from reference image 2" (you may add "the man"/"the woman"/"the boy"/"the girl" consistent with the book). Names in prompts get painted into the image as text.
- Avoid anything that would contain text: signs, posters, screens with words, labels, numbers on boxes, books with visible titles, scoreboards. If a hand device or screen is in the scene, say its screen shows "soft abstract colored shapes" or keep it turned away.
- Robed people: say "a figure in a privacy robe" — their face is hidden, so they are not in "characters" (Gladias robed in public needs no reference; Gladias at home unrobed does).
- Unnamed extras are fine ("a grandmother with a small child", "a crowd of concert-goers").
- Be faithful to the text. Don't invent major plot events. Don't spoil later chapters.

Validate: every file parses (python3 -m json.tool), every idx exists and is a paragraph or quote block, characters and references match in length and order, every slug is from the list, and no prompt contains any name from the slug list or any capitalized proper noun from the book (write a quick script to check prompts against the chapter's capitalized words). When done, reply with a short table per chapter: id and a one-line description of each moment, and anything you were unsure about.
```

After the agents finished, the coding agent changed six jobs to use the
hood-down robe prop and removed the United Cities palette from c26-b132.
