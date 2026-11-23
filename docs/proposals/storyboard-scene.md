# A storyboard is one scene, shot with several cameras (proposal, DRAFT, v3: the guided dialogue)

Branch `storyboard-scene`, 2026-11-22. Drafted by the coding agent (Claude, a closed model by Anthropic) from Nate's
direction of 2026-11-22; DRAFT until Nate approves it. **Building is held** (Nate, 2026-11-22): v2's engine is on the
branch (commit 250be0a0, not merged, migration `NEXT_storyboard_scene.sql` not applied); the guided dialogue below is
not built. Phone mocks (390 px): `docs/proposals/storyboard-scene/dialogue-mock-390.png` (v3, the dialogue) and
`scene-mock-390.png` (v2, the engine's controls). The continuity test (section 7) comes first, before anyone uses it.

**The direction (Nate):** a storyboard is one scene, shot as if with several cameras, or in several takes on the same
day. Cutting between angles and close-ups is fine. What must not change is the place, the light, the clothes and
Ephelion himself. **v3 (Nate, 2026-11-22):** the shot step on a phone isn't good. The scene, his clothing and the plan of
shots come first, as a dialogue, with AI guiding the person through what they need. v2 stays the engine underneath.

## 0. The guided dialogue (v3)

**The ruling (Nate, 2026-11-22; now in P2, `docs/principles.md`):** "Storyboard pictures: the person asks the guide in
their own words; the guide may write each picture's prompt and choose its reference pictures, never the speech's words.
The recipe keeps the person's request, the guide's model, the prompt it wrote, the references it chose, and every edit."

The page becomes one conversation, top to bottom, with what has been decided pinned above it as cards: the scene
picture, his clothing, the plan. Each step ends in a card the person approves or edits before the next one starts.
Every guide message and every draft is labelled "Drafted by the guide · gpt-oss-120b (open model)" and has **Edit**.

1. **The scene.**
   - The guide asks where he speaks from, the light and the mood.
   - For c13-b64 it first shows the book's words as a **Book** quote: c13-b63 word for word ("An image of Lord Ephelion
     appeared on the left side of the screen, and a multi-paragraph message on the right side."). The book doesn't say
     where he is.
   - The person answers in their own words. The guide drafts the setting (two or three sentences, a prompt, not story
     words). The person approves it or edits it.
   - The scene picture is made, up to 3 tries, and one is kept: v2's anchor, made with the look as its one reference.
2. **His clothing.**
   - The person picks one of his published looks and says, in their own words, what he wears in this scene.
   - The guide folds that into the scene's prompt ("in the look's clothes, with …") and shows it; the person approves or
     edits it.
   - It is part of the scene: it goes into the scene picture, so the scene is made after this step. The order on the
     page is setting, clothing, then the scene picture.
3. **The shot plan.**
   - The guide reads the speech (its sentences, numbered) and the cuts proposed at sentence ends.
   - It proposes, for each shot: its sentences (by number, never rewritten), a camera (v2's coverage as its default,
     which it may change and must say why), and whether it is an insert (with what it shows).
   - The plan shows as a list the person changes freely before any picture is made: cuts, cameras, inserts, the order.
   - An insert is proposed, never forced: it shows as "Insert (proposed)" until the person keeps it.
4. **The shots.**
   - For each shot the guide writes the picture's prompt and chooses its reference pictures. By default these are v2's:
     the scene, the look and the previous kept shot in the scene; an insert gets the style and a look only if a
     character is in it. It may choose another kept picture (an earlier shot, or another character's published sheet)
     and must say why, at most 3 in all.
   - The person sees the prompt and the references, can edit either, and presses Make. The guide never makes a picture
     on its own.
5. **Fixes by asking.**
   - The person writes "make him lean in on shot 4". The guide answers with a changed prompt (and references, if needed)
     for that shot, shown as a change against the last one.
   - The person approves it, edits it or drops it; nothing is made until they press Make.

**What the guide never does.** It never writes or changes the speech's words: they are placed from the speech file and
shown as **Book** or **Invented** with their block or version. It never cuts inside a sentence, publishes, spends, or
makes a picture without the person's press. Its messages are not story words; none is spoken or shown in the
play-through.

**Writing it yourself (skipping the guide).** The first message offers "Guide me" (the default) or "I'll write it
myself".
- Write it myself is v2's form, as on the branch: the setting box, the look, the cameras (v2's coverage, changeable)
  and each shot's own words. No model is called for the words, and every prompt's recipe says `by: the person`.
- The person can switch either way at any step. A draft the guide wrote stays labelled as the guide's until the person
  edits it. The recipe then keeps both: the guide's draft and the person's edit.

**Reusing the agents' conventions** (`src/lib/agents/tools.ts`, `draft_storyboard`, `draft_frames`):
- every draft answers a request (here, the person's message, by its id in the dialogue);
- its stamp keeps what the person did apart from what the guide did;
- frame prompts are drafted per shot, as `draft_frames`' `{ shot, prompt, note }`;
- story lines carry their source (`book`, `person`, `ai`), and the guide's is never a line.
Unlike an agent, the guide runs on the site, for the person on the page; nothing it drafts is public until they publish.

### What each picture's recipe keeps (the ruling, made concrete)

```
guide: { model: "openai/gpt-oss-120b", host: "Groq (or Vercel AI Gateway when Groq is busy)", open: true } | null
request: { text: "<the person's message, word for word>", at, messageId }   // the one this picture answers
prompt: { text: "<as sent>", by: "guide" | "person", draft: "<the guide's text, if the person changed it>" }
references: [ { role: "anchor-scene" | "anchor-look" | "continuity" | "other", ref: <sha256 / version id / shot key>,
                chosenBy: "guide" | "person", why: "<the guide's one line, or 'default'>" } ]
edits: [ { what: "prompt" | "references" | "camera" | "insert" | "setting" | "clothing", before, after, at } ]
camera: { angle, by: "rule" | "guide" | "person", why } ; insert: true | false ; scene: { sha256, setting, clothing }
```

The scene picture's recipe keeps the same for the setting and the clothing. The board version keeps the plan as the
guide proposed it and as the person saved it. The published recipe carries all of it (Terms §5 already says "the
prompts and any planning thread that led to the piece are published with it" where the Service says so before
publishing; the publish screen says so).

### The guide's model, and its cost per board

- **Recommended: gpt-oss-120b, an open model** (OpenAI's open weights, Apache-2.0), the assistant's own: on Groq with
  zero data retention (Nate confirmed it in the Groq console, 2026-10-08), or through Vercel AI Gateway when Groq is
  busy. It is already on the allowlist, at $0.10 and $0.50 per million input and output tokens (`config/models.json`).
- **Per board**, estimated for 12 shots with a few fixes: about 20 guide turns.
  - Input: about 5,000 tokens a turn (its instructions, the speech of about 900 tokens, the board's state, the recent
    dialogue), so about 100,000 tokens, $0.01.
  - Output: about 600 tokens a turn, so about 12,000 tokens, $0.006.
  - In all, about **$0.02 a board**, measured on the first boards before the estimate is relied on (the 20% rule).
- A closed model (Claude Sonnet, for example) would be about $0.50 a board. It is not proposed: the open model is
  enough to plan and write prompts, and no new provider would need naming.

### What the guide receives, and the Privacy lines it changes (drafted for Nate's reread)

**It receives only text:**
- the person's messages;
- the speech's sentences (the book's or the team's, already public), numbered;
- the board's choices (cuts with their sentence numbers, cameras, inserts, the setting and clothing as written);
- the published sheet's text for the chosen look;
- a list of the kept pictures by name and role ("the scene", "shot 3 as kept"), never the pictures themselves.

It receives no recording, no audio, no picture and nothing about the person but what they type. gpt-oss-120b reads text
only.

**Privacy §7, the Groq item. Today:**
> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, and the prompts for images you make,
> which are checked against the published rules.

**Proposed:**
> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, the prompts for images you make, which
> are checked against the published rules, and what you write to the storyboard guide, with the speech and your
> storyboard's choices; never your recording or your pictures.

**Privacy §4, after the storyboards item, a new item:**
> Your conversation with the storyboard guide: what you asked and what it drafted, kept with your storyboard until you
> remove it. When you publish the storyboard, what each picture answered and the prompt it was made with are published
> with it.

**Sources:**
- the guide's request builder sends exactly those fields; it is not built yet, and its test will fail on a picture,
  audio or any other field;
- `CHAT.provider` and `CHAT.direct` (Groq, zero data retention), and `CHAT.gatewayFallback`;
- `publish.ts`, which copies the recipe as kept.

### The planted fault: a recipe missing the person's request

**A new check, P2u**, in `scripts/check-principles.ts`, beside the voice proof, plus `test:voice`:
- every storyboard picture whose prompt is `by: "guide"` must keep a non-empty `request.text`, the guide's `model`, the
  prompt as sent and the guide's draft, each reference with `chosenBy` and `why`, and an `edits` array;
- it also requires that the speech's sentences never appear in a guide-written field except as `n` numbers.

**Its planted faults, each of which must be caught:**
- a guide-written prompt's recipe with `request` removed (the case Nate named);
- with the guide's `model` removed;
- with an edit dropped (the person's change not in `edits`);
- a guide message carrying a sentence of the speech as words.

The check runs the real recipe builder on a stand-in board (no model called) and on each planted copy, as P1h does for
recordings.

## 1. The scene, made and kept first (the engine, v2)

A new first step, above the cuts: **1. The scene**.

- The person writes where he is: the place, the light and what is around him. The look (his sheet) and the style are chosen
  here, once, as today's settings are.
- "Make the scene" makes one establishing picture: a wide, eye-level shot of Lord Ephelion, in the look's clothes, in that
  setting. It sends the look's front view as its one reference.
- Up to 3 tries, the same as a shot. One is kept, and no shot can be made until a scene is kept.
- **Changing the kept scene** marks every kept shot "made with an earlier scene". Those shots stay, but the notes say so,
  and the board can't be published until each one is remade or confirmed.

**What the book gives for c13-b64.** The book never says where Ephelion is when he gives this speech. It shows only how
the family sees it, on a restaurant screen:

> Suddenly, the Helisport game cut out, and was replaced by a completely different broadcast. (c13-b62)

> An image of Lord Ephelion appeared on the left side of the screen, and a multi-paragraph message on the right side.
> (c13-b63)

Elsewhere the book calls him "Lord Ephelion, Arctic ambassador to Veridia" (c8-b17), and his messages "sermons"
(c11-b109). Its words for where the speech happens are therefore c13-b62–63, which describe the broadcast, not his room.

**Proposed default:** for c13-b64, the page shows c13-b63 word for word as a **Book** quote above the setting box. It
says that the book doesn't say where he is, and the box itself starts empty for the person's own words. Two other ways are
possible; I recommend the first:

1. **Recommended:** the quote above, an empty box. The setting is the person's own words (P2), and the book is placed
   only as itself.
2. The box starts with c13-b63's sentence, editable. But that sentence describes the screen, not a place, so every
   scene would be "a screen in a restaurant" unless the person rewrites it.
3. The scene *is* the broadcast: Ephelion's image on the left of a screen, the message on the right, with c13-b63 as
   the setting. This is true to the book, but it is one framing only, so it allows no other cameras.

**For the invented speeches**, the source doc gives no place. There is no Book quote, the box starts empty, and the
speech's label ("Invented, not from the book") stays beside it.

## 2. Every shot: the scene and the look as anchors, plus the previous shot

Each shot's picture sends three reference pictures, always in this order:

1. **the kept scene** (anchor: the place and the light);
2. **the chosen look's front view** (anchor: Ephelion and his clothes);
3. **the previous kept shot** (continuity). Shot 1 has none, so it sends only the two anchors.

The anchors go with every shot, so differences can't build up from shot to shot. The previous shot only helps the cut
look continuous.

The prompt stays as today: the person's words first, word for word, then the camera, then the sheets' own texts and the
site's rules. One line is added: "The same place, light, clothes and person as the first reference pictures."
Under each shot the page shows "Sent with: the scene · his look · shot N as kept".

## 3. Default camera coverage, as a multi-camera shoot would have

The coverage is placed by a rule, not an AI model, and is labelled Automatic. There are five cameras, all on Ephelion's
front side of the line: he faces the audience, so every camera stays in front of him and no shot reverses the screen
direction.

| Camera | Angle (today's list) | Text sent |
|---|---|---|
| A, the master | Wide shot | the whole place, as the scene |
| B | Medium shot | waist up, straight on |
| C | Close-up | the face |
| D | Medium, from his left (new: the same medium, 30° to his left) | waist up, from the left |
| E | Low angle | looking up |

**Assigning cameras to the cuts** (the cuts themselves are unchanged):

- Shot 1 and the last shot get A, the wide master that opens and closes.
- The shots between cycle B, C, D, C, E, B, C, D… so a close-up comes every other shot, and no angle comes twice in a
  row.
- A shot of 4 seconds or less gets a close-up (C), not a wide.

For example, 6 cuts read A, B, C, D, C, A, and 12 cuts read A, B, C, D, C, E, B, C, D, C, E, A.

Every shot's camera stays a dropdown, so the person can change any of them. The rule only fills in shots whose camera
hasn't been chosen. A shot's own words are always the person's.

## 3b. Inserts: shots outside the scene

The person may make any shot an **insert**: a picture outside the scene, about what the speech is saying, while his
voice goes on (Nate's examples: a family at dinner, a ship going to space).

- **Only the person makes an insert.** A shot's card has a switch, "In the scene / Insert", which starts on In the
  scene. The coverage rule never makes a shot an insert, and an insert has no default camera.
- **What an insert sends:**
  - its words, the person's own, as every shot's;
  - the style, as text;
  - a look only if the person picks a character for it. That look's front view is then the one reference. With no
    character, there is no reference picture at all, so it is text to image.
  - It never sends the scene picture or a previous shot, and it has no "same place, light, clothes and person" line.
- **Continuity skips inserts.** The next shot in the scene takes the last kept shot *in the scene* as its third
  reference, never an insert. For example, with shot 4 an insert, shot 5 is sent with the scene, the look and shot 3.
- **The camera rule skips inserts too:** the coverage cycle continues over the shots in the scene as if the inserts
  weren't there. That keeps the master, close-up rhythm intact around them.
- **On the page**, an insert's card is marked "Insert · outside the scene", and its "Sent with" line names only what is
  sent ("the style · no reference picture", or "the style · Bai's look").
- **The recipe:**
  - `insert: true`, with its references: none, or `anchor-look` for the chosen character;
  - each shot in the scene records `continuity: <shot key>`, the in-scene shot it followed.
  - The card's credits list inserts as "Insert: <the person's words> (outside the scene)".
- **Cost:** an insert costs no more than a shot in the scene. With no reference, FLUX runs text to image (about
  $0.005), GPT Image is about $0.04 and Gemini $0.067; with a look, it costs the same as today's one-reference prices.

## 4. The cost per shot with three reference pictures

| Model | One picture today | With 3 references (estimate) | Measured? |
|---|---|---|---|
| FLUX.2 [klein] 4B edit (open, Black Forest Labs, default) | $0.012 (1 reference) | about $0.024 ($0.01/MP on the output plus every input, all about 0.6 MP); reserve $0.0425 | the price is per MP, so this is arithmetic; confirmed on the first real shot |
| GPT Image 2.5 Sunburst (closed, OpenAI) | $0.047 (1 reference, measured) | about $0.05 to $0.06 (each input picture adds image-input tokens) | **no**: one shot measured before any count is relied on (20% rule) |
| Gemini 3.1 Flash Image (closed, Google) | $0.068 (measured on the bases) | about $0.07 (input pictures are tokens, small beside $0.067 an image) | **no**: measured the same way |

A 12-shot board on FLUX is about $0.31 at one try a shot, plus the scene, and $0.90 at the most (3 tries for every shot
and the scene). On GPT Image the same board is about $0.65 to $2.20.

**Is IMAGES.maxReferences (3) enough?** Yes, for this design: it is exactly the scene, the look and the previous shot.
The style stays text, as today. A fourth reference would be needed only for a second character in shot, or for a style
sample sent as a picture. FLUX edit takes up to 4 (Remix sends 4), so raising it later is a one-line change, but I
wouldn't now: each picture adds cost, and the anchors matter more.

## 5. P2: who writes the default text, and what the recipe records

- **Default text:**
  - The setting is the person's own words. The book's c13-b62–63 is shown only as a quote, word for word with its
    blocks, and is never sent as if they had written it.
  - The camera defaults are fixed angle texts from the site's list (as today's "Medium shot"). They are camera
    directions, not story words, placed by a rule and labelled Automatic.
  - No shot description and no setting is written by an AI model. The agents' tools can't fill them either.
- An insert is never made by default: the switch starts on In the scene, and only the person turns it. It holds only
  the person's words.
- **What each shot's recipe adds:**
  - `scene`: its kept picture's sha256, its setting text, and who wrote it ("the person").
  - `references`: in order, each with its role (anchor-scene, anchor-look, continuity), version id or shot key, and sha256.
  - `camera`: the angle, and whether the rule placed it or the person chose it (`by: 'rule' | 'person'`).
  - `coverage`: the rule's name and version.
  - `insert`: true or false. For a shot in the scene, `continuity` names the in-scene shot it followed.
- **The published card** says "Scene: the person's words; pictures by <model> (closed/open), each with the scene and
  his look as references".

## 7. Before anyone uses it: the continuity test (Nate, 2026-11-22)

- **What:** one speech; one scene, look and style; 6 shots on each of FLUX, GPT Image and Gemini, up to $1.50 in all
  (about $1.05 estimated at one try a shot).
- **Shown:** the three boards side by side on a review page, so Nate can judge whether Ephelion, his clothes and the
  room stay the same from shot to shot. He picks the default model from it.
- **Before it runs** (raised, not assumed): the setting and the six shots' words must be a person's (P2).
  - With the guide built, Nate asks it in his own words and it writes the prompts, as the ruling allows.
  - Before the guide exists, the words are Nate's, or Nate says the test may use words marked "typed by the agent for
    the test, never published".

## 8. How many shots a person can make in a day, today

Real storyboard pictures are on for admins only (`VOICE.realPictures: 'admins'`), on the admins' pool.
- **The pool:** `CHAPTER_PICTURES.adminDailyCapUsd`, $20 a UTC day, shared by every admin and by the admins' chapter
  pictures. There is no per-person count; each picture reserves its worst case and settles to its real cost.
- **Tries:** at most 3 per shot, the scene and the closing card each (`VOICE.board.maxTriesPerShot`).

| Model | With 3 references (estimate) | Pictures in $20, if one admin used it all | A 12-shot board (scene + 12 shots + closing = 14 pictures) |
|---|---|---|---|
| FLUX.2 [klein] 4B edit | about $0.024 | about 830 | fits: about $0.34, or $1.01 at 3 tries each |
| GPT Image 2.5 Sunburst | about $0.05 to $0.06 | about 330 to 400 | fits: about $0.80, or $2.50 at 3 tries each |
| Gemini 3.1 Flash Image | about $0.07 | about 285 | fits: about $1.00, or $2.95 at 3 tries each |

So a 12-shot board fits in one day on any model, even at every try, as long as other admins' chapter pictures haven't
used the pool. Non-admins can't make real storyboard pictures yet.

## Order and what it needs

- **Order:** held until Nate's word. Then: the continuity test (section 7); the engine (v2, on the branch); the guide
  (v3) on top; P2u with its planted faults; the Privacy lines after Nate's reread.
- **Legal, to check before building:** today a shot sends only a published sheet's front view. This design also sends
  the person's own kept scene and previous shot to the image model's host. I haven't found a Privacy line that names a
  person's own private board pictures being sent as references. If none covers it, a one-line Privacy draft goes in this
  branch for your reread, shipped in the same release.
- **SQL:** one migration, `NEXT_storyboard_scene.sql`. It adds the kept scene: a `scene` column on the board version, or
  a scene picture row like a shot's. It is numbered at merge.
- **Checks:** the board tests (test:voice B and K), check:ui at 390 and 1440, and a P2 check that no default fills a
  description or a setting.
