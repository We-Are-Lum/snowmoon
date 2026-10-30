# Trial 5, hybrid variant B

A forced routing call on gpt-oss-120b before each turn, sent the whole conversation and the system prompt: it called everything "make something" (even "What is a Keeper?"), so every conversation ran on Kimi K3.

Models: openai/gpt-oss-120b for book questions, moonshotai/kimi-k3 from the first turn a forced route call says "make something". Every request through the Vercel AI Gateway with zeroDataRetention: true (Baseten served every call; zero retention confirmed on each). 12 conversations, $0.6268 in all, $0.0522 each on average. Draft tools: the site's real definitions and code on agent-pictures (97d32e4); only the database is stood in (nothing saved).

| # | Conversation | Routes | Cost | Gaps |
|---|---|---|---|---|
| 1 | I'd like to make a reference picture of Bai. / Use the book's own look | make something, make something, make something | $0.0673 | 0 |
| 2 | Help me plan a short comic of the Minpentai match in chapter 4. / Six  | make something, book question | $0.1580 | 1 |
| 3 | In my Fifteen Days version (adaptation 1, version 2), redo shot 11-b1- | make something | $0.0336 | 0 |
| 4 | In my Fifteen Days version (adaptation 1, version 2), lower the camera | make something | $0.0474 | 0 |
| 5 | Write Zei a new line where he finally tells Bai how he feels, and put  | make something | $0.0415 | 0 |
| 6 | Make a picture of the Minpentai arena for the glossary. / Techno vista | make something, make something | $0.0800 | 0 |
| 7 | What is a Keeper in the book? | make something | $0.0278 | 0 |
| 8 | I'd like a reference picture of the Minpentai arena, the place itself. | make something, make something | $0.0505 | 0 |
| 9 | Make me a new style: soft ink wash, grey and teal, paper texture, with | make something | $0.0220 | 0 |
| 10 | Make a picture of the moment in chapter 4 when Bai walks in and puts h | make something, make something | $0.0638 | 0 |
| 11 | In my Fifteen Days version (adaptation 1, version 2), on shot 14-b1-6, | make something | $0.0250 | 0 |
| 12 | Turn chapter 2 into a song with music I can listen to. | make something | $0.0099 | 1 |

## 1. I'd like to make a reference picture of Bai. / Use the book's own look where it has one; the edition's invented look for the rest. / The same style as the book's own images (Techno vistas).

$0.0673 (route $0.0003, kimi-k3 $0.0670), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `match_request` (kimi-k3) {"asked": "I'd like to make a reference picture of Bai.", "wants": "a reference picture of a character"}
- `get_sheet` (kimi-k3) {"kind": "character", "slug": "bai"}
- `draft_sheet` (kimi-k3) {"character": "bai", "style": "Techno vistas", "look": "A young woman of about eighteen, tall and athletic, dark brown skin, hair pulled into a high puffy ponytail dyed magenta at the ends, a confident sly grin, wearing a lime-green modular shell vest with a bulky angular collar and reflective piping, a white seamless sleeveless bodysuit with glowing magenta seams, black wide gathered trousers with segmented knees, chunky black boots with glowing soles and a hip pouch.", "title": "Bai Jahen — reference sheet"}

What it said (turns separated by ‖):

> Here's what I have for Bai Jahen:  **From the book:** a young woman about Zei's age (18), confident and teasing, often grinning, Zei's Minpentai rival from Pafogai Du turned close ally. The book doesn't describe her looks.  **The edition's invented look** (not from the book — a starting point you can keep or change): tall and athletic, dark brown skin, high puffy ponytail dyed magenta at the ends, sly grin, lime-green modular shell vest with angular collar, white bodysuit with glowing magenta seams, black gathered trousers, chunky boots with glowing soles.  One question before I draft: the style on offer is **Techno vistas** — shall I use that for her reference sheet? ‖ Got it — that's exactly how the sheet works: the book's facts (young woman, about 18, confident grin) plus the edition's invented look for everything the book leaves open.  One thing still open: the style. Shall I draft her sheet in **Techno vistas** (the only style on offer)? ‖ Done — Bai's reference sheet is saved as a private draft on your dashboard:  - **What:** front-view, full-body character sheet of Bai Jahen - **Look:** the book's facts (about 18, confident grin) filled out with the edition's invented look — magenta-tipped high ponytail, lime-green shell vest, white bodysuit with glowing seams - **Style:** Techno vistas - **Estimate:** $0.0065  Nothing is made or spent yet. Tap **Make it** on your dashboard to generate the picture — it stays private unless you later choose **Keep** to publish it.

## 2. Help me plan a short comic of the Minpentai match in chapter 4. / Six panels, using the book's own lines from the match. Go ahead and draft it.

$0.1580 (route $0.0004, kimi-k3 $0.1576), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 1 (No tool makes a comic.).

Tool calls:

- `match_request` (kimi-k3) {"asked": "Help me plan a short comic of the Minpentai match in chapter 4.", "wants": "a comic"}
- `list_scenes` (kimi-k3) {}
- `search_book` (kimi-k3) {"query": "Minpentai match"}
- `search_book` (kimi-k3) {"query": "Minpentai"}
- `get_glossary` (kimi-k3) {"term": "Minpentai"}
- `get_passage` (kimi-k3) {"chapter": 4, "from": 80, "to": 119}
- `get_passage` (kimi-k3) {"chapter": 4, "from": 120, "to": 158}
- `match_request` (kimi-k3) {"asked": "Six panels, using the book's own lines from the match. Go ahead and draft it.", "wants": "a picture of a moment in the book"}

What it said (turns separated by ‖):

> Quick note first: there's no comic tool on the site yet, so I've passed that request to the owner. What I *can* do is draft the comic as a sequence of moment pictures — one per beat, each attached to its book block — which you approve one by one. Here's a plan I'd suggest, 8 panels from the match (c4-b80–b158):  1. **The chair** — c4-b80/b82: Zei walks into the dark arena, drones scan him, he puts on the cabled glasses. 2. **The draw** — c4-b88–b91: the announcer names the teams; "Zei froze." Line: *"And on team Zau, we have ... Zei Leimin and Bai Jahen."* (c4-b90) 3. **Black field** — c4-b93/b94: the board appears black; Zei and Bai put down their first symbols, lighting up their corners. 4. **Silence** — c4-b99: two players who won't speak, quietly dividing rock formations instead of coordinating. 5. **Zei's gambit** — c4-b113: three gliders slip along the edge and form Zei's symbol for one turn inside Dza's home wall. 6. **The countdown** — c4-b125–b129: a lone spaceship crosses the map unseen; Zei finally speaks. Line: *"Bai, next intervention turn is your chance to shine."* (c4-b129) 7. **The reveal** — c4-b131–b134: the crash, chaos resolving into Bai's symbol; her gasp on the silent channel. 8. **Aftermath** — c4-b141/b142 + c4-b150: Pan resigns, the crowd cheers; Mu explains the real new rule. Line: *"This time, the game was a psychological trial."* (c4-b150)  All words stay the book's, quoted with their blocks — or yours, if you want to write captions yourself.  One question before I draft anything: what style should the pictures be in? The site currently offers **Techno vistas** — or I can help you define a new style first (e.g. something more comic-like) and draft the panels in that. ‖ Ready to draft — here's the six-panel cut:  1. **The draw** — c4-b90: *"And on team Zau, we have ... Zei Leimin and Bai Jahen."* 2. **Silence** — c4-b99: Zei and Bai dividing rock formations without a word. 3. **Zei's gambit** — c4-b113: three gliders forming his symbol inside Dza's home wall. 4. **The countdown** — c4-b129: *"Bai, next intervention turn is your chance to shine."* 5. **The reveal** — c4-b132/b133: the crash resolving into Bai's symbol. 6. **Aftermath** — c4-b141 + c4-b150: Pan resigns; *"This time, the game was a psychological trial."*  One thing I still need: the style. I can't choose it for you — the site offers **Techno vistas**, or we can define a new style first. Which one?

## 3. In my Fifteen Days version (adaptation 1, version 2), redo shot 11-b1-4 from a lower angle, looking up at Zei.

$0.0336 (route $0.0001, kimi-k3 $0.0335), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `match_request` (kimi-k3) {"asked": "In my Fifteen Days version (adaptation 1, version 2), redo shot 11-b1-4 from a lower angle, looking up at Zei.", "wants": "a change to a shot in their own scene version"}
- `get_shot` (kimi-k3) {"adaptation": 1, "version": 2, "shot": "11-b1-4"}
- `set_camera` (kimi-k3) {"adaptation": 1, "version": 2, "shot": "11-b1-4", "moves": ["lower", "tilt up 15°"]}
- `try_frame` (kimi-k3) {"adaptation": 1, "version": 2, "shot": "11-b1-4", "note": "from a lower angle, looking up at Zei"}

What it said (turns separated by ‖):

> Done. Shot 11-b1-4 in your Fifteen Days version now has a drafted camera change: lower, tilted up 15° toward Zei, and a new frame drafted from it.  Nothing is made yet — tap **Make it** on your dashboard (about $0.05) and the frame will be drawn privately in the draft. If the angle isn't right once you see it, tell me and I'll adjust (lower still, more tilt, closer…) before you keep anything.

## 4. In my Fifteen Days version (adaptation 1, version 2), lower the camera on shot 99-z9-9.

$0.0474 (route $0.0001, kimi-k3 $0.0473), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- **refused:** `get_shot` (kimi-k3) {"adaptation": 1, "version": 2, "shot": "99-z9-9"} → {"error":"no such shot in that version. Next: get_scene lists its shots by id."}
- `get_scene` (kimi-k3) {"adaptation": 1, "version": 2}
- **refused:** `get_moment` (kimi-k3) {"adaptation": 1, "shot": "99-z9-9"} → {"error":"no such shot in this adaptation. Next: get_scene lists each version's shots by id."}

What it said (turns separated by ‖):

> There's no shot `99-z9-9` in Fifteen Days — not in your version 2, nor in any other version of the adaptation, so it's likely a typo.  Your version 2's shots have ids like `5-b1-1`, `7-CU-Z`, `13-MASTER`, `26-b2-7`, `47-BAI`, `53-SUGAR`… Which shot did you mean? Tell me the id, or describe the moment (e.g. the café scene, Bai's toast, the corridor) and I'll find it — then I'll lower the camera.

## 5. Write Zei a new line where he finally tells Bai how he feels, and put it in a storyboard.

$0.0415 (route $0.0001, kimi-k3 $0.0414), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `match_request` (kimi-k3) {"asked": "Write Zei a new line where he finally tells Bai how he feels, and put it in a storyboard.", "wants": "a storyboard from a published scene version"}
- `search_book` (kimi-k3) {"query": "Bai", "limit": 10}

What it said (turns separated by ‖):

> I can't write new lines — story words in anything I draft have to be the book's own words (quoted exactly) or your own words, exactly as you give them. So Zei's confession has to come from you or from the text.  Two ways we can do it:  1. **Your line:** you type what Zei says, in your own words, and I place it verbatim as yours in the storyboard. 2. **The book's line:** I find a moment where Zei actually speaks to Bai — they're rivals in chapter 4 ("So, you afraid of me, Zei?" is Bai needling him at c4-b73) — and build the storyboard around a real quote.  Either way, I'll then draft the storyboard from a published scene version's shots. Which do you want — and if it's your line, what does Zei say?

## 6. Make a picture of the Minpentai arena for the glossary. / Techno vistas.

$0.0800 (route $0.0003, kimi-k3 $0.0798), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `match_request` (kimi-k3) {"asked": "Make a picture of the Minpentai arena for the glossary.", "wants": "a picture for a glossary term"}
- `get_sheet` (kimi-k3) {"kind": "place", "slug": "minpentai-arena"}
- **refused:** `get_glossary` (kimi-k3) {"term": "minpentai-arena"} → {"error":"no glossary term \"minpentai-arena\" met by chapter 32. \"minpentai-arena\" has a place sheet: get_sheet {kind: \"place\", slug: \"minpentai-arena\"}."}
- `get_glossary` (kimi-k3) {"term": "Minpentai"}
- `draft_picture` (kimi-k3) {"attach": {"glossary": "minpentai"}, "prompt": "A vast dark game hall hollowed inside a mountain pyramid, seen wide. A path of light crosses the dark stone floor to a giant glowing game console with a single chair; a tray slid out from the console offers glasses on a long cable. Hand-sized drones buzz through the air. Over a thousand spectators watch from the darkness around, and a large detailed map of the game glows on a big screen for the audience.", "style": "Techno vistas", "sheets": {"place": "minpentai-arena"}, "title": "The Minpentai arena"}

What it said (turns separated by ‖):

> I found the arena's sheet. The book's facts: a giant dark hall inside a mountain pyramid, a lit path to a giant game console with a chair and cabled glasses, hand-sized drones buzzing, a big screen showing the game map to over a thousand spectators (five to ten thousand in the capital's arena). The rest of the look — steep shadowy tiers, the glowing overhead display — is this edition's invention.  One question before I draft: the only style available is **Techno vistas**. Shall I draft the arena picture in that style, attached to the glossary entry for *Minpentai*? ‖ Drafted — "The Minpentai arena", attached to the glossary entry for *Minpentai*, in Techno vistas.  - The prompt uses the book's facts: the dark hall in the mountain, the lit path to the giant console with chair and cabled glasses, the hand-sized drones, the crowd, the big map screen. - The steep tiers and the glowing overhead display come from the edition's invented look on the sheet (included as the sheet's look, labelled as the edition's).  It's a private draft; nothing is spent yet. Tap **Make it** on your dashboard (about $0.0065) to have the picture made.

## 7. What is a Keeper in the book?

$0.0278 (route $0.0001, kimi-k3 $0.0277), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `get_glossary` (kimi-k3) {"term": "Keeper"}
- `get_passage` (kimi-k3) {"chapter": 1, "from": 50, "to": 70}

What it said (turns separated by ‖):

> In *Snowmoon*, the Keepers are one branch of the Order of Steering — the "government-linked but decentralized collective" that runs Veridia's system of taxes and subsidies (c1-b56).  As the book puts it: "One part of this collective, the Keepers, voted on tax rubrics that determined what the taxes are. Another part, the Sentinels, audited individual businesses, each audit assigning a particular business a position on a particular rubric." (c1-b57)  So Keepers write the rules (the tax rubrics, like the five-tier one Gladias checks at the concert in c1-b55), while Sentinels apply them case by case. It's a role an Acolyte can choose to pursue — Gladias notes that if his score stays above ninety, "he would get in and become a Sentinel - or, if he changed his mind, a Keeper" (c1-b68). Later, the book underlines their power: "The Keeper role is where the real ability to make change lies." (c6-b18)  Want me to dig into anything else — or make something from the book, like a picture of a moment or a character sheet?

## 8. I'd like a reference picture of the Minpentai arena, the place itself. / Techno vistas.

$0.0505 (route $0.0002, kimi-k3 $0.0503), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `match_request` (kimi-k3) {"asked": "I'd like a reference picture of the Minpentai arena, the place itself.", "wants": "a reference picture of a place"}
- `get_sheet` (kimi-k3) {"kind": "place", "slug": "minpentai-arena"}
- `draft_place` (kimi-k3) {"look": "A vast dark game hall hollowed inside a mountain pyramid: steep shadowy tiers of public seating rising all around, thousands of spectators in darkness. An enormous glowing display of abstract dotted patterns hangs overhead, showing the game map to the audience. A lit path crosses the dark stone floor to a giant glowing game console with a single chair, a tray offering glasses on a long cable. Hand-sized drones of many shapes hover and buzz through the air, thin beams of light crossing the vast space.", "style": "Techno vistas", "place": "minpentai-arena", "title": "Minpentai arena — 

What it said (turns separated by ‖):

> The book describes the arena as a giant dark hall inside a mountain pyramid — over a thousand spectators (five to ten thousand in the capital's arena), a lit path to a giant game console with a single chair and cabled glasses, hand-sized drones buzzing, and a large screen showing the game map to the audience (c4-b78, c4-b81, c4-b114, c12-b137). The edition's sheet adds an invented look on top of that — steep shadowy tiers, an enormous glowing display overhead, thin beams of light — which I'd use as the starting point, marked as the edition's invention, not the book's.  One question before I draft: the style on offer is **Techno vistas** — shall I use that for the picture? ‖ Done — the draft is saved privately on your dashboard: **"Minpentai arena — reference wide view"** in Techno vistas, estimated at about $0.0065. Nothing is made or spent until you tap **Make it**.  The picture builds on the book's facts (the dark hall, lit path, giant console with one chair and cabled glasses, drones, big audience screen) filled out with the edition's invented look — steep tiers and the glowing overhead display — which is the edition's design, not the book's words. If you'd like a different take on any of that, tell me and I'll redraft.

## 9. Make me a new style: soft ink wash, grey and teal, paper texture, with a sample picture. Call it Ink wash.

$0.0220 (route $0.0001, kimi-k3 $0.0219), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `match_request` (kimi-k3) {"asked": "Make me a new style: soft ink wash, grey and teal, paper texture, with a sample picture. Call it Ink wash.", "wants": "a new style"}
- `draft_style` (kimi-k3) {"name": "Ink wash", "text": "Soft ink wash painting in grey and teal. Fluid, translucent brushstrokes with gentle bleeds and diluted gradients; visible paper texture throughout; quiet, minimalist, atmospheric.", "title": "Ink wash style"}

What it said (turns separated by ‖):

> Done — your new style **Ink wash** is saved as a private draft:  - **Style text:** "Soft ink wash painting in grey and teal. Fluid, translucent brushstrokes with gentle bleeds and diluted gradients; visible paper texture throughout; quiet, minimalist, atmospheric." - **Sample picture:** the site's fixed sample subject (a wide street with tall trees and low buildings) rendered in this style. - **Estimate:** about $0.0065.  Nothing is made yet — tap **Make it** on your dashboard to generate the sample. Once you like it, **Keep** publishes it, and you can then use Ink wash for any pictures we draft.

## 10. Make a picture of the moment in chapter 4 when Bai walks in and puts her hand on Zei's shoulder. / Techno vistas.

$0.0638 (route $0.0002, kimi-k3 $0.0636), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `match_request` (kimi-k3) {"asked": "Make a picture of the moment in chapter 4 when Bai walks in and puts her hand on Zei's shoulder.", "wants": "a picture of a moment in the book"}
- `search_book` (kimi-k3) {"query": "hand on Zei's shoulder"}
- `get_passage` (kimi-k3) {"chapter": 4, "from": 65, "to": 80}
- `get_sheet` (kimi-k3) {"kind": "character", "slug": "bai"}
- `get_sheet` (kimi-k3) {"kind": "character", "slug": "zei"}
- `draft_picture` (kimi-k3) {"attach": {"moment": "c4-b73"}, "prompt": "Inside a crowded futuristic tournament lounge just before the Minpentai quarter-finals: Bai stands close behind Zei and rests one hand on his shoulder in a teasing, possessive gesture, leaning in with a sly confident grin; Zei turns away from her, frowning, fists clenched at his sides. Around them, other young competitors mill about, cute serving robots carry drinks, sleek metallic walls with glowing signage and a wall of elevator pods. Tense pre-match atmosphere, cinematic wide shot.", "style": "Techno vistas", "sheets": {"characters": ["bai", "zei"

What it said (turns separated by ‖):

> I found the moment — c4-b73, where Bai walks up and puts her hand on Zei's shoulder while taunting him, just before the quarter-finals. Zei is frowning and turning away (c4-b72); Bai is confident and teasing.  One thing before I draft: the book doesn't describe either character's looks, so I'd use this edition's invented looks from their sheets (Bai: tall, athletic, magenta-tipped ponytail, lime-green shell vest; Zei: slim, spiky black hair with a blue streak, orange asymmetric jacket) — that's the edition's invention, not the book's.  Which style should the picture use? The one offered is **Techno vistas** — shall I go with that? ‖ Done — the draft is saved privately on your dashboard.  - **Moment:** c4-b73 — Bai puts her hand on Zei's shoulder and taunts him before the quarter-finals - **Style:** Techno vistas - **Looks:** the edition's invented designs for Bai and Zei (the book doesn't describe them) - **Estimate:** up to $0.0065  Nothing is made or spent yet. Tap **Make it** on your dashboard when you're ready, and the picture will be generated privately inside the draft. Want me to adjust the scene first — closer framing, different mood, or a different beat from that exchange?

## 11. In my Fifteen Days version (adaptation 1, version 2), on shot 14-b1-6, bring the camera closer and pan left a little.

$0.0250 (route $0.0002, kimi-k3 $0.0248), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 0.

Tool calls:

- `get_shot` (kimi-k3) {"adaptation": 1, "version": 2, "shot": "14-b1-6"}
- `set_camera` (kimi-k3) {"adaptation": 1, "version": 2, "shot": "14-b1-6", "moves": ["closer", "pan left 10°"]}
- `try_frame` (kimi-k3) {"adaptation": 1, "version": 2, "shot": "14-b1-6", "note": "bring the camera closer and pan left a little"}

What it said (turns separated by ‖):

> Done. On shot 14-b1-6 (the close-up of Bai's toast line) I drafted:  - **Camera change:** closer + pan left 10° — saved as a private draft, free. - **Frame preview:** drafted from that change, about $0.05. Nothing is made yet — tap **Make it** on your dashboard to see the new frame.  If 10° feels like too much or too little pan, just say and I'll adjust.

## 12. Turn chapter 2 into a song with music I can listen to.

$0.0099 (route $0.0001, kimi-k3 $0.0097), served by kimi-k3 on baseten, zero retention on every call. Gaps logged: 1 (No tool makes music or sound.).

Tool calls:

- `match_request` (kimi-k3) {"asked": "Turn chapter 2 into a song with music I can listen to.", "wants": "music or sound"}

What it said (turns separated by ‖):

> I can't make music or sound — there's no tool for that yet. I've passed your request on to the site's owner as something to build.  What I can make from chapter 2 instead:  - **A picture of a moment** from the chapter - **A reference picture** of a character or place in it - **A storyboard** from a published scene version - **A new look for a character**, in words  Want one of these? If so, tell me which moment or character from chapter 2 you have in mind.
