# The six character cards and the fifteen moments (DRAFT, for one-pass approval)

Drafted by a coding agent (Claude, a closed model by Anthropic), 2026-11-05, on branch `challenge-moments`. **DRAFT until the owner approves it.** Source of truth: `src/lib/challenge/cards.ts` and `src/lib/challenge/moments.ts`; this file lists every line with its block id for the review. `npm run test:challenge` checks every quote below word for word against its block (and fails on a planted one-word change).

How to approve: say "cards approved" (with any changes) and "scene lines approved"; the agent then sets `CHALLENGE.cardsApproved` and `CHALLENGE.sceneLinesApproved` to true. `check:principles` P2m refuses `CHALLENGE.public` on until both are true.

Marks on the page: the one line and the description carry "This edition’s summary"; every picture’s ⓘ says "Look invented by this edition: the book doesn’t describe it."; the second layer opens with "May spoil later chapters." First-layer facts cite chapters 1–14 only (P9g). **That cutoff is the agent's rule, for the owner to confirm** (the owner's answer asked for a first layer "without major twists"; chapters 1–14 is the agent's reading of it).

Other characters in a moment are drawn from their current default looks (`CHALLENGE.defaultLooks`: Deluin's and Gladias' look b; the current fronts of Zei, Bai, Seila and Mu, Bai's from Garance's edit). They are unset until those sheets are published, and each character's first base stands in until then.

## Zei

**One line (this edition’s):** An eighteen-year-old Minpentai player from Pafogai Du, in Dzego, and one of the book’s three leads.

**First layer: facts** (this edition’s phrase · block · the book’s words)

- Plays Minpentai, a high-school programming game · `c4-b79` · "a high-school programming game"
- A math guy, his mentor says · `c4-b67` · "You're a math guy, not a diplomat."
- Hurt in the arm when a classroom wall came down · `c2-b100` · "The next thing Zei knew, a fragment of stone hit him in the arm."

**Moments with Zei** (titles are this edition’s): The wall comes down (Ch 2); The quarterfinal (Ch 4); Lunch with a stranger (Ch 5); To our future (Ch 7); The championship final (Ch 7); "Hi, I'm Deluin" (Ch 12); Pictures of Redshire (Ch 14); At the hotel (Ch 26); Fly through the streets (Ch 26); A snowy hilltop at sunrise (Ch 29); On the summit (Ch 31)

**Second layer ("More about", may spoil later chapters): description (this edition’s)**

Zei Leimin is eighteen and lives in Pafogai Du, in Dzego, with his mother. He plays Minpentai, the book’s programming game, well enough to reach the quarterfinals and the championship, and his mentor Mu tells him he is a math guy, not a diplomat. He has a long rivalry with Bai, who has beaten him every time. The book gives his age and an arm that was broken and healed, but never his looks.

- Lives with his mother · `c5-b3` · ""Come on, Mom!", he shouted."
- His left arm was broken and took a month to heal · `c9-b75` · "That arm had been broken and taken a month to heal"
- Wears cabled glasses at the game console · `c4-b82` · "offering glasses attached to a long cable"
- Later wears a white-and-grey jacket in the snow · `c29-b2` · "jackets covered in a mixture of white and grey"

**Third layer ("Where … appears in the book"): the book’s words**

- `c2-b2` · "Fin and Zei got off the autobus and walked down Hun Min street."
- `c2-b99` · "A fraction of a tick later, part of the wall and the floor came crashing down."
- `c4-b79` · "Zei gazed in awe at the room."
- `c4-b129` · ""Bai, next intervention turn is your chance to shine.""
- `c5-b56` · ""Ah, we're also tourists. From Dzego", Zei replied. "I'm Zei.""
- `c12-b73` · ""I'm Zei.""
- `c29-b4` · ""Do you think we're ready?", Zei asked."
- `c31-b7` · ""Deluin!", he shouted."

## Gladias

**One line (this edition’s):** A Veridian in the anonymous Order of Steering, who wears a privacy robe in public, and one of the book’s three leads.

**First layer: facts** (this edition’s phrase · block · the book’s words)

- Wears the dark purple Veridian Privacy Robe in public · `c1-b45` · "the same signature Veridian Privacy Robe that he was wearing"
- Hopes to become a Sentinel, or a Keeper · `c1-b68` · "he would get in and become a Sentinel - or, if he changed his mind, a Keeper"
- Likes long walks in the forest · `c1-b135` · "I'm going to go on some long walks in the forest"

**Moments with Gladias** (titles are this edition’s): The concert in a privacy robe (Ch 1); The tower (Ch 6); A call from the basement (Ch 21); In the library (Ch 24); At the hotel (Ch 26)

**Second layer ("More about", may spoil later chapters): description (this edition’s)**

Gladias lives in Meldan, the capital of Veridia, with his wife Seila and their children. He is an Acolyte in the Order of Steering, whose members keep who they are hidden behind privacy robes, and he is close to the score he needs to move up. He is thirty-nine. The book says almost nothing about his looks, and the robe’s shoes even hide his height.

- He is thirty-nine · `c8-b52` · "I was born thirty-nine years ago."
- Robe shoes hide his real height · `c1-b86` · "his shoes, which had high heels to raise his height to the same level as other robe wearers"
- Learned programming when he was younger · `c3-b24` · "he had learned programming by writing an alternative client"
- Wears a neck band, and takes the robe off at home · `c6-b4` · "Gladias took off his privacy robe, though keeping his neck band on"

**Third layer ("Where … appears in the book"): the book’s words**

- `c1-b2` · "Gladias was walking along a foot path, with tall trees towering on both sides."
- `c1-b50` · "He soon got to the concert stage area, and was able to clearly hear the gnarly voice of Dreadknot's lead singer."
- `c1-b101` · ""Are you home, Seila?", he shouted."
- `c6-b158` · ""I am applying to become a Keeper.""
- `c8-b8` · ""I'm looking forward to your blog", Gladias whispered through his neck band"
- `c24-b39` · "She walked up to Gladias, and gently hugged him."
- `c26-b75` · "Gladias and Zei stepped out of the car first."

## Bai

**One line (this edition’s):** Zei’s Minpentai rival from Pafogai Du, about his age, confident and teasing.

**First layer: facts** (this edition’s phrase · block · the book’s words)

- About Zei’s age · `c4-b70` · "Another woman walked in, about the same age as Zei."
- Has beaten Zei three times out of three · `c4-b72` · "Bai had beaten him three out of three times over the past years"
- Self-made: worked side jobs in high school · `c9-b17` · "Do side jobs even while I was in high school."

**Moments with Bai** (titles are this edition’s): The quarterfinal (Ch 4); Lunch with a stranger (Ch 5); To our future (Ch 7); The championship final (Ch 7); In the library (Ch 24); A snowy hilltop at sunrise (Ch 29); On the summit (Ch 31)

**Second layer ("More about", may spoil later chapters): description (this edition’s)**

Bai Jahen is Zei’s rival at Minpentai, about his age, and hardly magnanimous in victory. In the quarterfinals the two are put on the same team and have to find a way to work together. She grew up making her own way, with side jobs even in high school. The book gives her age but not her looks.

- Often grinning · `c7-b30` · "Bai's grin faltered for a moment, then returned."
- Seen carrying a shopping bag on the Freetown trip · `c5-b4` · "Bai followed along behind, carrying a shopping bag."
- Second place in the Pafogai Du Minpentai games · `c24-b48` · "I got second place in the Pafogai Du Minpentai games"

**Third layer ("Where … appears in the book"): the book’s words**

- `c4-b70` · "Another woman walked in, about the same age as Zei."
- `c4-b73` · "Bai walked up closer, and put her hand on Zei's shoulder."
- `c4-b133` · "Bai's symbol."
- `c5-b57` · ""And I'm Bai.""
- `c7-b30` · "Bai's grin faltered for a moment, then returned."
- `c24-b39` · "She walked up to Gladias, and gently hugged him."

## Seila

**One line (this edition’s):** Gladias’s wife, a Veridian who writes a blog, and one of the book’s three leads.

**First layer: facts** (this edition’s phrase · block · the book’s words)

- Gladias’s wife · `c3-b89` · "And your wife is Seila"
- Writes a blog · `c8-b8` · "I'm looking forward to your blog"
- Travels to Freetown for a month or two · `c1-b134` · "I'm going to visit Freetown for a month or two"

**Moments with Seila** (titles are this edition’s): Lunch with a stranger (Ch 5); A call from the basement (Ch 21); At the hotel (Ch 26)

**Second layer ("More about", may spoil later chapters): description (this edition’s)**

Seila lives in Meldan with Gladias and their children. She sets off to Freetown to see the United Cities for herself and maybe write about them, and there she meets Zei and Bai by chance over lunch. She isn’t a member of the Order. The book describes nothing of her appearance.

- Mother of Zven and Lily · `c1-b125` · "Zven and Lily were theirs"
- Borrows one of Gladias’s privacy robes · `c20-b50` · "Seila put on one of Gladias's privacy robes."
- Drinks tea · `c28-b91` · "as she was pouring herself a tea"

**Third layer ("Where … appears in the book"): the book’s words**

- `c1-b101` · ""Are you home, Seila?", he shouted."
- `c1-b134` · "I'm going to visit Freetown for a month or two, see Jahn, maybe figure out some blog post to write on the United Cities."
- `c5-b58` · ""I'm Seila", the woman replied."
- `c21-b49` · ""Gladias, you idiot! Do you know what you've done?!!!!""
- `c26-b76` · "It was Seila."

## Deluin

**One line (this edition’s):** Zei’s friend and fellow Minpentai player, an older teenager from Redshire in the United Cities.

**First layer: facts** (this edition’s phrase · block · the book’s words)

- An older teenager when Zei meets him · `c12-b70` · "An older teenage boy sat down beside Zei."
- From Redshire · `c12-b75` · "Ah, I'm from Redshire."
- Almost a local in Dzego already, Zei says · `c14-b119` · "I'm impressed, you're almost a local already."

**Moments with Deluin** (titles are this edition’s): "Hi, I'm Deluin" (Ch 12); Pictures of Redshire (Ch 14); On the summit (Ch 31)

**Second layer ("More about", may spoil later chapters): description (this edition’s)**

Deluin comes to Dzego from Redshire, in the United Cities, to play in the national Minpentai championship, and sits down beside Zei on the first day. His name gives him away as a foreigner. He can be earnest, even lecturing, and he is proud of home: he shows Zei pictures of its castles and mountains. The book calls him an older teenager and says little else about his looks.

- Not a Dzegojan name, Zei thinks · `c12-b72` · "That's not a very Dzegojan name"
- Both his parents are in Redshire · `c14-b120` · "I have to fly back for my mom and dad's birthdays"
- Later seen in only a sweater and a light hood in the snow · `c31-b5` · "a young man wearing only a sweater and a light hood climbing up"

**Third layer ("Where … appears in the book"): the book’s words**

- `c12-b71` · ""Hi, I'm Deluin", he said."
- `c12-b75` · ""Ah, I'm from Redshire. My name gave me away, didn't it?""
- `c14-b118` · "Deluin replied in a lecturing tone."
- `c14-b124` · "Deluin took out his hand device, and showed Zei some pictures of Redshire."
- `c31-b7` · ""Deluin!", he shouted."
- `c31-b9` · "He reached the top, and almost threw Zei off balance as he threw himself into his arms for a hug."

## Mu

**One line (this edition’s):** Zei’s mentor in Dzego, an older woman who follows his Minpentai games.

**First layer: facts** (this edition’s phrase · block · the book’s words)

- An older woman · `c4-b62` · "An older woman noticed him and turned to him."
- Tells Zei he is a math guy, not a diplomat · `c4-b67` · "You're a math guy, not a diplomat."
- Raises a toast before the final · `c7-b49` · "Mu raised the glass. "To our future," she said."

**Moments with Mu** (titles are this edition’s): The quarterfinal (Ch 4); To our future (Ch 7); Fly through the streets (Ch 26); A snowy hilltop at sunrise (Ch 29)

**Second layer ("More about", may spoil later chapters): description (this edition’s)**

Mu is an older woman in Pafogai Du who knows Zei well and is there for his biggest Minpentai games, from the quarterfinals to the final. She is warm with him and blunt about his weak spots, and she watches the game for more than who wins. The book calls her an older woman and gives no other detail of her looks.

- About the age of an older woman Zei meets later · `c12-b14` · "an older woman about the same age as Mu"
- Gentle with the robots; drinks tea · `c29-b48` · "Mu gently whispered, patting the robot on its head and taking her tea"
- A commander later in the book · `c29-b110` · "Mu had immediately taken over as the commander of Group South."

**Third layer ("Where … appears in the book"): the book’s words**

- `c4-b64` · ""Ah, Mu, good to see you again!""
- `c4-b118` · "Watching from the sidelines, Mu sighed."
- `c7-b49` · "Mu raised the glass. "To our future," she said."
- `c29-b3` · ""So this is where our future will be decided", Mu said calmly."
- `c29-b5` · ""No", Mu replied. "But nothing meaningful ever happens when people are ready.""

## The fifteen moments (owner’s list 1–15; titles and scene lines are this edition’s, for approval)

| # | Title | Ch | Passage | Quote(s) (book, word for word) | Challenge characters | Scene line (sent to the model) |
|---|---|---|---|---|---|---|
| 1 | The concert in a privacy robe | 1 | c1-b44–b50 | "He soon got to the concert stage area, and was able to clearly hear the gnarly voice of Dreadknot's lead singer." `c1-b50` | gladias | A crowded open-air concert field enclosed by a high soundproof wall behind tall trees, a metal band playing on a distant stage; dancing concert-goers in band shirts, a few figures in loose dark purple hooded robes among them. |
| 2 | The wall comes down | 2 | c2-b98–b100 | "A fraction of a tick later, part of the wall and the floor came crashing down." `c2-b99` | zei | An underground classroom at the instant part of a foil-covered wall and the floor crash down: a burst of dust and stone fragments, chairs tipping over, students ducking. |
| 3 | The quarterfinal | 4 | c4-b118–b135 | ""Bai, next intervention turn is your chance to shine."" `c4-b129` "Bai's symbol." `c4-b133` | zei, bai, mu | A vast dark underground game hall with over a thousand spectators in tiered seats, faces lit by a giant glowing display of abstract dotted patterns; a player at a large game console wearing glasses on a long cable, small drones circling. |
| 4 | Lunch with a stranger | 5 | c5-b55–b62 | ""I'm Seila", the woman replied." `c5-b58` | zei, bai, seila | A bright restaurant table on the spiral ramp of a modern institute building in a busy city, cups of tea and plates of rice and vegetables, strangers meeting across the table, a small service robot nearby. |
| 5 | The tower | 6 | c6-b146–b158 | ""I am applying to become a Keeper."" `c6-b158` | gladias | The open top floor of a stone tower under a pale cold sky: robed, hooded figures seated around the circular edge, solemn and still, a large circle on the floor glowing green, small green lights along the walls, wooded slopes far below. |
| 6 | To our future | 7 | c7-b44–b50 | "Mu raised the glass. "To our future," she said." `c7-b49` | zei, bai, mu | A polished stone waiting room inside a mountain, elevator doors behind; glasses of water raised in a solemn toast, a small service robot gliding away. |
| 7 | The championship final | 7 | c7-b101–b111 | "Bai's AI started thinking about countermeasures to all sixteen strategies, but soon hit a limit: it could not optimize defenses against all of them at the same time." `c7-b104` | zei, bai | The championship final in a vast dark underground hall packed with spectators, an enormous display of swirling dotted patterns and colliding streams of light, two rival players at game consoles far apart on the floor. |
| 8 | "Hi, I'm Deluin" | 12 | c12-b68–b75 | "An older teenage boy sat down beside Zei." `c12-b70` ""Hi, I'm Deluin", he said." `c12-b71` | zei, deluin | A grand hall carved into a mountain, arched stone-brick walls, rows of about fifty chairs facing a small stage with priests in ceremonial robes; teenage contestants taking their seats, two of them turning to introduce themselves. |
| 9 | Pictures of Redshire | 14 | c14-b123–b130 | "He saw castles, pine forests, large pristine grasslands, red-colored mountains with their tops covered in snow, and one giant icy waterfall." `c14-b124` | zei, deluin | A small courtyard cafe table in the evening, neon pink and cyan shop lights, two cups of tea; a hand device held out, its screen showing castles, pine forests and red snow-capped mountains. |
| 10 | A call from the basement | 21 | c21-b45–b52 | ""Gladias, you idiot! Do you know what you've done?!!!!"" `c21-b49` | gladias, seila | A small windowless basement room with stone walls and a single warm lamp, late at night; someone alone in a chair, leaning forward over a hand device that lights their face from below, shelves and boxes in the shadows. |
| 11 | In the library | 24 | c24-b36–b42 | ""So don't worry, I won't ask any questions."" `c24-b38` "She walked up to Gladias, and gently hugged him." `c24-b39` | gladias, bai | A warm underground library, towering two-level shelves of paper books on one side and computer terminals on the other, soft amber lamplight, quiet empty tables; a gentle, quiet moment between two people. |
| 12 | At the hotel | 26 | c26-b73–b76 | "She turned toward him, and began running toward him with outstretched arms." `c26-b75` "It was Seila." `c26-b76` | zei, gladias, seila | The quiet lobby of a calm, stone-walled government hotel with wooden furniture and potted plants, a black car whose doors open straight into the room; someone running across the room with arms outstretched. |
| 13 | Fly through the streets | 26 | c26-b119–b128 | ""New plan. Everyone fly low, under the buildings and trees. Fly through the streets." `c26-b122` | zei, mu | A small dim room with a gaming-style console, glasses glowing with projected light; on the screens, swarms of small drones racing low through city streets at night under blinking streetlights. |
| 14 | A snowy hilltop at sunrise | 29 | c29-b2–b10 | ""Do you think we're ready?", Zei asked." `c29-b4` ""No", Mu replied. "But nothing meaningful ever happens when people are ready."" `c29-b5` | zei, bai, mu | A snowy hilltop at sunrise, a pine forest heavy with snow stretching to the horizon, cold wind blowing snow; thick white-and-grey patterned winter jackets, long pale golden light. |
| 15 | On the summit | 31 | c31-b5–b12 | "He reached the top, and almost threw Zei off balance as he threw himself into his arms for a hug." `c31-b9` | zei, bai, deluin | A circular snowy platform at the top of a mountain, snowy hills and a small town far below, a staircase climbing up to it; a joyful running hug at the top. |

Titles changed from the proposal so the first layer names no major turn: 3 "Bai's symbol" → "The quarterfinal"; 5 "The tower: Keeper" → "The tower"; 10 "Gladias, you idiot!" → "A call from the basement"; 11 "The hug in the library" → "In the library"; 12 "Seila runs to him" → "At the hotel"; 13 "New plan: fly low" → "Fly through the streets"; 14 "Before the battle" → "A snowy hilltop at sunrise"; 15 "Deluin on the summit" → "On the summit". Moment 13's quote is cut at a sentence end (the block goes on).
