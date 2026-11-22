# A storyboard is one scene, shot with several cameras (proposal, DRAFT)

Branch `storyboard-scene`, 2026-11-22. Drafted by the coding agent (Claude, a closed model by Anthropic) from Nate's
direction of 2026-11-22; DRAFT until Nate approves it. Nothing is built yet. Phone mock (390 px):
`docs/proposals/storyboard-scene/scene-mock-390.png` (its HTML beside it).

**The direction (Nate):** a storyboard is one scene, shot as if with several cameras, or in several takes on the same
day. Cutting between angles and close-ups is fine. What must not change is the place, the light, the clothes and
Ephelion himself.

## 1. The scene, made and kept first

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

## 4. The cost per shot with three reference pictures

| Model | One picture today | With 3 references (estimate) | Measured? |
|---|---|---|---|
| FLUX.2 [klein] 4B edit (open, Black Forest Labs, default) | $0.012 (1 reference) | about $0.024 ($0.01/MP on the output plus every input, all about 0.6 MP); reserve $0.0425 | the price is per MP, so this is arithmetic; confirmed on the first real shot |
| GPT Image 2.5 Sunburst (closed, OpenAI) | $0.047 (1 reference, measured) | about $0.05 to $0.06 (each input picture adds image-input tokens) | **no**: one shot measured before any count is relied on (20% rule) |
| Gemini 3.1 Flash Image (closed, Google) | $0.068 (measured on the bases) | about $0.07 (input pictures are tokens, small beside $0.067 an image) | **no**: measured the same way |

A 12-shot board on FLUX is about $0.31 at one kept try a shot, $0.87 at the most (3 tries a shot, plus the scene). On
GPT Image that is about $0.70 to $2.30.

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
- **What each shot's recipe adds:**
  - `scene`: its kept picture's sha256, its setting text, and who wrote it ("the person").
  - `references`: in order, each with its role (anchor-scene, anchor-look, continuity), version id or shot key, and sha256.
  - `camera`: the angle, and whether the rule placed it or the person chose it (`by: 'rule' | 'person'`).
  - `coverage`: the rule's name and version.
- **The published card** says "Scene: the person's words; pictures by <model> (closed/open), each with the scene and
  his look as references".

## Order and what it needs

- **Order:** it builds on main once voice-keep-takes (#213) is merged.
- **Legal, to check before building:** today a shot sends only a published sheet's front view. This design also sends
  the person's own kept scene and previous shot to the image model's host. I haven't found a Privacy line that names a
  person's own private board pictures being sent as references. If none covers it, a one-line Privacy draft goes in this
  branch for your reread, shipped in the same release.
- **SQL:** one migration, `NEXT_storyboard_scene.sql`. It adds the kept scene: a `scene` column on the board version, or
  a scene picture row like a shot's. It is numbered at merge.
- **Checks:** the board tests (test:voice B and K), check:ui at 390 and 1440, and a P2 check that no default fills a
  description or a setting.
