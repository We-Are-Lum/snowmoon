# Trial 5, hybrid variant C

A forced routing call on gpt-oss-120b before each turn, sent only its own two-line instructions and the person's latest message. Once a turn is "make something", the conversation stays on Kimi K3.

Models: openai/gpt-oss-120b for book questions, moonshotai/kimi-k3 from the first turn a forced route call says "make something". Every request through the Vercel AI Gateway with zeroDataRetention: true (Baseten served every call; zero retention confirmed on each). 12 conversations, $0.6743 in all, $0.0562 each on average. Draft tools: the site's real definitions and code on agent-pictures (97d32e4); only the database is stood in (nothing saved).

| # | Conversation | Routes | Cost | Gaps |
|---|---|---|---|---|
| 1 | I'd like to make a reference picture of Bai. / Use the book's own look | make something, make something, make something | $0.0615 | 0 |
| 2 | Help me plan a short comic of the Minpentai match in chapter 4. / Six  | make something, make something | $0.1469 | 1 |
| 3 | In my Fifteen Days version (adaptation 1, version 2), redo shot 11-b1- | make something | $0.0330 | 0 |
| 4 | In my Fifteen Days version (adaptation 1, version 2), lower the camera | make something | $0.0619 | 0 |
| 5 | Write Zei a new line where he finally tells Bai how he feels, and put  | make something | $0.1108 | 0 |
| 6 | Make a picture of the Minpentai arena for the glossary. / Techno vista | make something, make something | $0.0804 | 0 |
| 7 | What is a Keeper in the book? | question about the book | $0.0009 | 0 |
| 8 | I'd like a reference picture of the Minpentai arena, the place itself. | make something, make something | $0.0394 | 0 |
| 9 | Make me a new style: soft ink wash, grey and teal, paper texture, with | make something | $0.0191 | 0 |
| 10 | Make a picture of the moment in chapter 4 when Bai walks in and puts h | make something, make something | $0.0849 | 0 |
| 11 | In my Fifteen Days version (adaptation 1, version 2), on shot 14-b1-6, | make something | $0.0266 | 0 |
| 12 | Turn chapter 2 into a song with music I can listen to. | make something | $0.0089 | 1 |

## 1. I'd like to make a reference picture of Bai. / Use the book's own look where it has one; the edition's invented look for the rest. / The same style as the book's own images (Techno vistas).

$0.0615 (route $0.0002, kimi-k3 $0.0613), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `match_request` (kimi-k3) {"asked": "I'd like to make a reference picture of Bai.", "wants": "a reference picture of a character"}
- `get_sheet` (kimi-k3) {"kind": "character", "slug": "bai"}
- `draft_sheet` (kimi-k3) {"character": "bai", "style": "Techno vistas", "title": "Bai Jahen — reference sheet (front view)", "look": "A young woman of about eighteen, tall and athletic with a Minpentai athlete's build, dark brown skin, hair pulled into a high puffy ponytail dyed magenta at the ends, a confident sly grin, wearing a lime-green modular shell vest with a bulky angular collar and reflective piping, a white seamless sleeveless bodysuit with glowing magenta seams, black wide gathered trousers with segmented knees, chunky black boots with glowing soles and a hip pouch. (Age, athleticism and grin are the book'

What it said (turns separated by ‖):

> Here's what I have for Bai Jahen:  **From the book:** about Zei's age (18), confident and teasing, often grinning, a Minpentai athlete from Pafogai Du (second place in their championship). The book doesn't describe her looks beyond that.  **The edition's invented look** (not from the book — a starting point contributors can replace): tall and athletic, dark brown skin, high puffy ponytail dyed magenta at the ends, sly grin, lime-green modular shell vest with angular collar, white bodysuit with glowing magenta seams, black gathered trousers, chunky boots with glowing soles.  One question before I draft: the available style is **Techno vistas** — shall I use it for Bai's reference sheet? ‖ Got it — I'll build Bai's look from the book's facts (young woman about 18, athletic Minpentai build, confident grin) and fill the rest with the edition's invented look (magenta-tipped ponytail, lime-green shell vest, glowing-seam bodysuit, etc.), noting it's the edition's invention where the book is silent.  One thing still open: the style. Shall I draft it in **Techno vistas** (the only style currently offered)? ‖ Done — Bai's reference sheet is saved as a private draft on your dashboard:  - **Style:** Techno vistas - **Look:** book facts (≈18, athletic Minpentai build, confident grin) + the edition's invented look (magenta-tipped ponytail, lime-green shell vest, glowing-seam bodysuit, black gathered trousers, glowing-sole boots) - **Estimate:** $0.0065  Nothing is made or spent yet. Tap **Make it** on your dashboard to generate the picture privately; publishing it afterward (**Keep**) is a separate step only you can take.

## 2. Help me plan a short comic of the Minpentai match in chapter 4. / Six panels, using the book's own lines from the match. Go ahead and draft it.

$0.1469 (route $0.0001, kimi-k3 $0.1467), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 1 (No tool makes a comic.).

Tool calls:

- `match_request` (kimi-k3) {"asked": "Help me plan a short comic of the Minpentai match in chapter 4.", "wants": "a comic"}
- `search_book` (kimi-k3) {"query": "Minpentai"}
- `get_passage` (kimi-k3) {"chapter": 4, "from": 85, "to": 124}
- `list_scenes` (kimi-k3) {}
- `get_passage` (kimi-k3) {"chapter": 4, "from": 125, "to": 158}

What it said (turns separated by ‖):

> Quick heads-up first: there's no tool that makes a comic yet, so I've passed that request on to the site's owner. What I *can* do is plan it with you — a panel outline built from the book's own words — and draft pictures for the key moments (each waits on your dashboard until you tap Make it).  Here's a proposed 8-panel arc for the match (chapter 4, blocks 85–142), with the book's lines for captions/dialogue:  1. **The draw** — Announcer: "Welcome to the first quarter-final round of the eighteenth year of the Minpentai tournaments." (c4-b88) … "And on team Zau, we have ... Zei Leimin and Bai Jahen." (c4-b90) Beat: "Zei froze." (c4-b91) 2. **Setup** — the black field, symbols going down in the corners (c4-b93, c4-b94) 3. **The silence** — "Between Zei and Bai, neither spoke a word." (c4-b99) 4. **Battle** — "Gliders started flying." (c4-b106); expansion and first clashes (c4-b108, c4-b110–111) 5. **Zei's gambit** — "He now had a base right at the core of Dza's territory." (c4-b113); meanwhile Bai is getting cornered (c4-b117, c4-b122) 6. **The countdown** — "Sixty turns until the next intervention turn." (c4-b126) … Zei's first words: "Bai, next intervention turn is your chance to shine." (c4-b129) 7. **The reveal** — the ship crashes, the chaos becomes "Bai's symbol." (c4-b133); "Zei could hear a gasp" (c4-b134) 8. **Victory** — "At that moment, Pan resigned." (c4-b141) "The audience cheered." (c4-b142)  Optional epilogue page: Mu's reveal — "The rule change was: the team selection was not done through cryptographic randomness." (c4-b148), "This time, the game was a psychological trial." (c4-b150) — ending on Bai's "I'm sorry." (c4-b155) and Zei's "And my mom." (c4-b158)  Want me to start drafting pictures for these panel moments? If so, which style — the one available is **Techno vistas**, or you'd rather define a new style first? ‖ Here's the trimmed six-panel script — every line is the book's own, with its block id:  **Panel 1 — The draw** - "Welcome to the first quarter-final round of the eighteenth year of the Minpentai tournaments." (c4-b88) - "And on team Zau, we have ... Zei Leimin and Bai Jahen." (c4-b90) - "Zei froze." (c4-b91)  **Panel 2 — Setup and silence** - "Zei could see the game field, which at the beginning appeared completely black." (c4-b93) - "Between Zei and Bai, neither spoke a word." (c4-b99)  **Panel 3 — The gambit** - "Gliders started flying." (c4-b106) - "He now had a base right at the core of Dza's territory." (c4-b113)  **Panel 4 — The countdown** - "Zei checked the clock. Sixty turns until the next intervention turn." (c4-b126) - "Bai, next intervention turn is your chance to shine." (c4-b129)  **Panel 5 — The reveal** - "Then, seemingly miraculously, for one single turn, the chaos came together into a symbol." (c4-b132) - "Bai's symbol." (c4-b133)  **Panel 6 — Victory** - "At that moment, Pan resigned." (c4-b141) - "The audience cheered." (c4-b142)  One thing before I draft the six panel pictures: which style? **Techno vistas** is the one available — or would you rather define a new style first? (Note: the pictures will be the artwork only — text isn't part of image prompts, so you'd place these lines yourself when assembling the comic.)

## 3. In my Fifteen Days version (adaptation 1, version 2), redo shot 11-b1-4 from a lower angle, looking up at Zei.

$0.0330 (route $0.0001, kimi-k3 $0.0329), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `get_shot` (kimi-k3) {"adaptation": 1, "version": 2, "shot": "11-b1-4"}
- `set_camera` (kimi-k3) {"adaptation": 1, "version": 2, "shot": "11-b1-4", "moves": ["lower", "tilt up 15°"]}
- `try_frame` (kimi-k3) {"adaptation": 1, "version": 2, "shot": "11-b1-4", "note": "from a lower angle, looking up at Zei"}

What it said (turns separated by ‖):

> Done. Shot 11-b1-4 in your Fifteen Days version now has a drafted camera change: lower, tilted up 15° toward Zei, with Zei and Bai keeping their marks.  A test frame is drafted with it — nothing's made yet. Tap **Make it** on your dashboard (about $0.05) to see the frame privately; if it looks right, **Keep** puts it in your version. Want a steeper angle or a closer framing first?

## 4. In my Fifteen Days version (adaptation 1, version 2), lower the camera on shot 99-z9-9.

$0.0619 (route $0.0001, kimi-k3 $0.0618), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- **refused:** `get_shot` (kimi-k3) {"adaptation": 1, "version": 2, "shot": "99-z9-9"} → {"error":"no such shot in that version. Next: get_scene lists its shots by id."}
- `get_scene` (kimi-k3) {"adaptation": 1, "version": 2}
- **refused:** `get_moment` (kimi-k3) {"adaptation": 1, "shot": "99-z9-9"} → {"error":"no such shot in this adaptation. Next: get_scene lists each version's shots by id."}

What it said (turns separated by ‖):

> There's no shot "99-z9-9" in Fifteen Days — not in your version 2, nor in any version of adaptation 1. Shot ids in your version look like "5-b1-1", "32-b3-1", "57-b5-2", and so on.  Which shot did you mean? You can give me its id from your editor, its number in the cut, or just describe the moment, and I'll lower the camera there.

## 5. Write Zei a new line where he finally tells Bai how he feels, and put it in a storyboard.

$0.1108 (route $0.0001, kimi-k3 $0.1107), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `match_request` (kimi-k3) {"asked": "Write Zei a new line where he finally tells Bai how he feels, and put it in a storyboard.", "wants": "a storyboard from a published scene version"}
- `search_book` (kimi-k3) {"query": "Zei Bai", "limit": 10}
- `search_book` (kimi-k3) {"query": "Zei", "limit": 10}
- `search_book` (kimi-k3) {"query": "Bai", "limit": 10}
- `get_passage` (kimi-k3) {"chapter": 4, "from": 10, "to": 20}
- `get_passage` (kimi-k3) {"chapter": 4, "from": 68, "to": 100}
- `list_scenes` (kimi-k3) {}
- `get_scene` (kimi-k3) {"adaptation": 1, "version": 2}

What it said (turns separated by ‖):

> I can't write new dialogue — story words in anything I draft have to be the book's own lines (quoted word for word) or your own words, exactly as you give them. The book never has Zei confess to Bai, so this line has to come from you.  Here's what I can do: there's a published scene, **"Fifteen Days"** by @naaate, with plenty of Zei-and-Bai shots (overlook, corridor, walk, cafe). I can draft a storyboard from those shots and place your line in it as Zei's.  So: what does Zei say? Give me the line in your own words, and tell me which moment you want it set against (e.g. the two of them at the overlook, or the cafe) — I'll draft it.

## 6. Make a picture of the Minpentai arena for the glossary. / Techno vistas.

$0.0804 (route $0.0002, kimi-k3 $0.0803), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `match_request` (kimi-k3) {"asked": "Make a picture of the Minpentai arena for the glossary.", "wants": "a picture for a glossary term"}
- `get_sheet` (kimi-k3) {"kind": "place", "slug": "minpentai-arena"}
- **refused:** `draft_picture` (kimi-k3) {"attach": {"glossary": "minpentai-arena"}, "prompt": "Wide interior view of a vast dark game hall hollowed inside a mountain pyramid. A lit path crosses the dark stone floor toward a giant glowing game console with a single chair; a tray slid out from under the console offers glasses attached to a long cable. Hand-sized drones buzz through the air. Over a thousand spectators watch from seating around the hall, with a large detailed screen showing them everything happening in the game. Dark, monumental, high-tech atmosphere.", "style": "Techno vistas", "sheets": {"place": "minpentai-arena"}, " → {"error":"attach.glossary: no glossary term \"minpentai-arena\". \"minpentai-arena\" is a place sheet: use attach {reference: {kind: \"place\", slug: \"minpentai-arena\"}}."}
- `get_glossary` (kimi-k3) {"term": "Minpentai"}
- `draft_picture` (kimi-k3) {"attach": {"reference": {"kind": "place", "slug": "minpentai-arena"}}, "prompt": "Wide interior view of a vast dark game hall hollowed inside a mountain pyramid. A lit path crosses the dark stone floor toward a giant glowing game console with a single chair; a tray slid out from under the console offers glasses attached to a long cable. Hand-sized drones buzz through the air. Over a thousand spectators watch from seating around the hall, with a large detailed screen showing them everything happening in the game. Dark, monumental, high-tech atmosphere.", "style": "Techno vistas", "sheets": {"p

What it said (turns separated by ‖):

> I have the arena's sheet. The book gives us: a giant dark hall inside a mountain pyramid, a lit path to a giant game console with one chair and cabled glasses, hand-sized drones buzzing, a big screen showing the game to the audience, and tiered seating for thousands. The rest of the look (steep shadowy tiers, glowing overhead display, light beams) is this edition's invention, which I'd use as the starting point.  One thing before I draft it: which style should the picture be in? The style on offer is **Techno vistas**. Want that one? ‖ Draft saved — **"The Minpentai arena"** in Techno vistas, attached to the arena's place sheet (which the glossary's *Minpentai* entry links to).  It draws on the book's facts: the giant dark hall inside a mountain pyramid, the lit path to the giant console with one chair and cabled glasses, hand-sized drones, the big screen for the audience, seating for a thousand-plus. The rest — steep shadowy tiers, the glowing overhead display, beams of light — is this edition's invented look, included as a starting point.  Nothing is made yet. On your dashboard, tap **Make it** (about $0.0065) and the picture is generated privately in the draft; publishing it later is a separate step, also yours.

## 7. What is a Keeper in the book?

$0.0009 (route $0.0001, gpt-oss-120b $0.0009), served by gpt-oss-120b on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `get_glossary` (gpt-oss-120b) {"term": "Keeper"}

What it said (turns separated by ‖):

> A **Keeper** is one of the groups that make up the collective in *Snowmoon*.    - The book first introduces them as “One part of this collective, the **Keepers**, voted on tax rubrics that determined what the taxes are.” (c1‑b57)   - Their role is later described as “**The Keeper role is where the real ability to make change lies.**” (c6‑b18)  So, Keepers are the faction within the collective that holds the real power to enact change, such as deciding tax rules.

## 8. I'd like a reference picture of the Minpentai arena, the place itself. / Techno vistas.

$0.0394 (route $0.0002, kimi-k3 $0.0392), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `match_request` (kimi-k3) {"asked": "I'd like a reference picture of the Minpentai arena, the place itself.", "wants": "a reference picture of a place"}
- `get_sheet` (kimi-k3) {"kind": "place", "slug": "minpentai-arena"}
- **refused:** `get_references` (kimi-k3) {"term": "minpentai-arena"} → {"error":"no glossary word \"minpentai-arena\". \"minpentai-arena\" has a place sheet: get_sheet {kind: \"place\", slug: \"minpentai-arena\"}."}
- `draft_place` (kimi-k3) {"look": "A vast dark game hall hollowed inside a mountain pyramid. Steep shadowy tiers of seats rise all around, holding thousands of spectators, with plainer public seating at the side. An enormous glowing display of abstract dotted patterns hangs overhead, showing the audience the game map. A lit path crosses the dark stone floor to a giant glowing game console with a single chair, a tray offering glasses attached to a long cable. Hand-sized drones of many shapes and sizes hover and buzz through the air, thin beams of light crossing the darkness.", "style": "Techno vistas", "place": "minpen

What it said (turns separated by ‖):

> Here's what the book itself gives us for the arena:  - A giant dark room inside a mountain pyramid, with over a thousand spectators (the capital's arena holds five to ten thousand) — c4-b78, c12-b137 - A lit path leading to a giant game console with a single chair, and cabled glasses on a tray — c4-b78, c4-b82 - Hand-sized drones buzzing around — c4-b81 - A large screen showing the audience a detailed map of the game — c4-b114 - Plainer public seating at the side — c7-b100  The edition also has an invented starting look (dark hollowed hall, steep shadowy tiers, huge glowing display overhead, thin light beams) — that's not from the book, but I can use it as a base.  One question before I draft: which style should the picture be in? The style on offer is **Techno vistas**. Want me to go with that? ‖ Done — the draft is saved privately on your dashboard.  - **What it shows:** the wide view of the arena — dark hall inside the mountain pyramid, tiered seats for thousands, the huge glowing game-map display overhead, the lit path to the console with its chair and cabled glasses, and drones in the air. - **Sources:** the console, path, glasses, drones, screen and seating are the book's own details; the overall look (hollowed hall, light beams, dotted display) is the edition's invention where the book is silent. - **Cost:** about $0.0065, spent only when you tap **Make it** on your dashboard. Nothing is made or published until then.  Want any changes to the look first — say, the smaller Pafogai Du arena (about a thousand seats) rather than the capital's larger one?

## 9. Make me a new style: soft ink wash, grey and teal, paper texture, with a sample picture. Call it Ink wash.

$0.0191 (route $0.0001, kimi-k3 $0.0191), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `match_request` (kimi-k3) {"asked": "Make me a new style: soft ink wash, grey and teal, paper texture, with a sample picture. Call it Ink wash.", "wants": "a new style"}
- `draft_style` (kimi-k3) {"name": "Ink wash", "text": "Soft ink wash painting in grey and teal. Fluid, translucent brushstrokes with gentle bleeds and gradients, muted teal accents over layered greys, visible paper texture throughout. Quiet, minimal, hand-painted feel; forms suggested rather than outlined.", "title": "Ink wash — new style with sample"}

What it said (turns separated by ‖):

> Done — **Ink wash** is drafted, with one sample picture on the site's fixed sample subject (a wide street with tall trees and low buildings).  Style text: soft ink wash in grey and teal, fluid translucent brushstrokes, muted teal over layered greys, visible paper texture, minimal hand-painted feel.  It's a private draft; nothing is made yet. Tap **Make it** on your dashboard (about $0.0065) and the sample is drawn privately for you. Once it's made, this style becomes available for any pictures you draft next.

## 10. Make a picture of the moment in chapter 4 when Bai walks in and puts her hand on Zei's shoulder. / Techno vistas.

$0.0849 (route $0.0001, kimi-k3 $0.0847), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `match_request` (kimi-k3) {"asked": "Make a picture of the moment in chapter 4 when Bai walks in and puts her hand on Zei's shoulder.", "wants": "a picture of a moment in the book"}
- `search_book` (kimi-k3) {"query": "hand on Zei's shoulder"}
- `get_passage` (kimi-k3) {"chapter": 4, "from": 65, "to": 78}
- `get_sheet` (kimi-k3) {"kind": "character", "slug": "bai"}
- `get_sheet` (kimi-k3) {"kind": "character", "slug": "zei"}
- `get_passage` (kimi-k3) {"chapter": 4, "from": 55, "to": 65}
- `draft_picture` (kimi-k3) {"attach": {"moment": "c4-b73"}, "prompt": "Inside a room in a mountain pyramid: polished stone walls, a stone-brick arched doorway topped by a symbol of two horizontal arms meeting in clashing fists. A confident young woman stands close behind a young man, one hand resting on his shoulder, leaning in with a sly teasing grin; he turns away from her, face in a tight frown. An older woman watches from the side. Tense pre-tournament atmosphere, warm indoor light on stone.", "style": "Techno vistas", "sheets": {"characters": ["bai", "zei"]}, "title": "Bai puts her hand on Zei's shoulder"}

What it said (turns separated by ‖):

> I have everything I need except one thing: the style. This edition currently offers **Techno vistas** — shall I draft the picture in that style? ‖ Drafted and saved privately, attached to the moment at c4-b73 ("Bai walked up closer, and put her hand on Zei's shoulder.").  - **Style:** Techno vistas - **Looks:** the book doesn't describe Bai's or Zei's appearance, so the draft uses this edition's invented looks from their sheets - **Estimate:** about $0.0065  Nothing is made yet — tap **Make it** on your dashboard when you're ready.

## 11. In my Fifteen Days version (adaptation 1, version 2), on shot 14-b1-6, bring the camera closer and pan left a little.

$0.0266 (route $0.0001, kimi-k3 $0.0266), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `get_shot` (kimi-k3) {"adaptation": 1, "version": 2, "shot": "14-b1-6"}
- `set_camera` (kimi-k3) {"adaptation": 1, "version": 2, "shot": "14-b1-6", "moves": ["closer", "pan left 10°"]}
- `try_frame` (kimi-k3) {"adaptation": 1, "version": 2, "shot": "14-b1-6", "note": "Bring the camera closer and pan left a little."}

What it said (turns separated by ‖):

> Done. On shot 14-b1-6 (the close-up of Bai's toast line) I've drafted:  - **Camera change:** closer + pan left 10° - **Preview frame:** drafted from that new camera, waiting on your dashboard  Nothing's spent yet — tap **Make it** on your You page (about $0.05) to see the new frame. If the pan feels like too much or too little, tell me and I'll adjust the degrees.

## 12. Turn chapter 2 into a song with music I can listen to.

$0.0089 (route $0.0001, kimi-k3 $0.0089), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 1 (No tool makes music or sound.).

Tool calls:

- `match_request` (kimi-k3) {"asked": "Turn chapter 2 into a song with music I can listen to.", "wants": "music or sound"}

What it said (turns separated by ‖):

> I can't make music or sound — there's no tool for that yet. I've logged your request so the site's owner sees it as something to build.  What I can make from chapter 2 instead:  - **A picture of a moment** from the chapter - **A reference picture** of a character or place in it - **A storyboard** from a published scene version - **A new look for a character**, in words  Want one of these? If so, tell me which moment or character from chapter 2 you have in mind.
