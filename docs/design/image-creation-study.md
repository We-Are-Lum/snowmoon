# Design study: "Image creation" (Claude Design build)

Study of two Claude Design files, compared with the app as it is today (`/Users/nathan/snowmoon-site`, read only; HEAD `f21b536`).

- **Static board:** `design2/Image Creation.dc.html` (691 lines). Title `Snowmoon · image creation`, `design_doc_mode: canvas`. Sections `intro`, `flow`, `g1`…`g7`, `guesses`. There is no script: every value is an inline style.
- **Clickable prototype:** `design2/Image Creation Prototype.dc.html` (515 lines). Title `Snowmoon · image creation · clickable`. One 390 × 695 phone, driven by a `Component extends DCLogic` script (lines 334–513).
- **Screenshots:**
  - Of the board, from earlier: `design2-shots/ic-0.png` … `ic-9.png` (tiles at 75% scale). `ic-10.png` is 119 bytes and empty.
  - Of the prototype's starting state: `Image-Creation-Prototype-full.png`.
  - Taken for this study by clicking through the prototype (phone frame only): `study/proto-*.png`. Each one is cited by name below.

All wording on both files is marked draft ("ALL WORDING IS DRAFT FOR NATE", "ALL WORDING DRAFT").

---

## Contents

1. Overview: the flow map and why the design works
2. Screens and states, one section each
3. Animations, transitions and timing
4. Every string, by screen
5. Measured visual values
6. Data each screen needs, and which values are samples
7. Design's guesses, verbatim
8. The gap: what the app has, and what is missing or different
9. Conflicts with the app's rules
10. Bugs and inconsistencies inside the Design files
11. Principles

---

## 1. Overview

### 1.1 The flow map (board section `flow`)

The board opens with five columns on one panel. Each node is a link to its screen.

| Column | Nodes, in order (verbatim) | Connectors between nodes |
|---|---|---|
| MAKE | 1a · Select a passage in the reader → ADD AN IMAGE / 1b · Compose: prompt, chips from my picks, rules, Generate / 1c · Private draft: generate again, or preview / 1d · Preview exactly as readers see it → PUBLISH | "↓ first time: consent", "↓ generate (counts toward today)", "↓" |
| SEE | 2a · Reader: "2 images by readers · show" / 3 · Feed of new images, spoilers covered / 2b · Image page: prompt, recipe, like, share, hide, report / 2c · Report: reason and a private note | "↓ tap an image" (3 → 2b), "↓ report" (2b → 2c) |
| STYLES | 4a · Style guide page → USE AS MY STYLE / 4b · Create a style / 4c · Fork: "remixed from" is fixed | note: "Reached from a style chip in 1b, the recipe in 2b, or My picks" |
| CHARACTERS, then PRIVATE | 5a · Character sheet → USE AS MY ZEI / 5b · Create or fork a sheet / 6 · My picks: change, clear, newer version | notes: "Same pattern as styles, plus "what the book says"", "Picks pre-fill the chips in 1b" |
| MODERATORS ONLY, then COMING, NOT DESIGNED | 7 · Queue: image, prompt, passage, reasons → HIDE or DISMISS / "Locations · lettering · remixing an image · ratings" | note: "Reached by reports from 2c. Hidden images leave every public view." |

The node borders encode privacy and role before you read a word:

| Border | Means | Nodes |
|---|---|---|
| 1px solid `#1D1D1B` | public or shared screen | 1a, 1b, 1d, 2a, 2b, 2c, 3, 4a, 4b, 4c, 5a, 5b |
| 1px **dashed** `#6A675F` | private to you | 1c (draft), 6 (my picks) |
| 1px solid `#8A2F2F` (warn red) | moderators only | 7 |
| 1px dashed `#ABA79D`, grey text | not designed | Locations · lettering · remixing an image · ratings |

### 1.2 What makes the design work

**One visual language for privacy.** The rule is the same everywhere:

- **Private** means a dashed line and an open circle "○":
  - the draft strip "○ DRAFT · ONLY YOU CAN SEE THIS · KEPT ON THIS DEVICE", with a 1px dashed `#ABA79D` rule under it;
  - the draft image's dashed outline (`outline:1px dashed #6A675F; outline-offset:3px`);
  - "○ PRIVATE · ONLY YOU SEE YOUR PICKS";
  - "○ YOUR PICK" in lists;
  - the report note's dashed box "Note for moderators, optional · private".
- **Public** means a filled dot "●", on every line that says what becomes public:
  - "● Public under your name if you publish…";
  - "● Public, permanent, GPL-3.0, under your name. You can hide it later.";
  - "● Public under your name when you publish the style."

This matches the app's existing convention from the assistant: private threads use ○ and a dashed rule, and planning threads use ●. It is noted in `PROTOTYPE-README.md`.

**"AI-generated" and "not by the author" travel with the image.** Every reader-facing image carries the pair, in the same mono caption, directly under or on top of it:

- 1c: "AI-GENERATED IMAGE · NOT BY THE AUTHOR";
- 1d: "¶ 2–3 · AI-GENERATED IMAGE · BY @NATE · NOT BY THE AUTHOR · RECIPE";
- 2a: "AI-GENERATED · BY @KAZ · NOT BY THE AUTHOR · RECIPE →";
- 2b: "AI-GENERATED IMAGE · NOT BY THE AUTHOR";
- the feed tiles, including covered ones;
- the style and sheet samples: "SAMPLE IMAGES · AI-GENERATED · NOT BY THE AUTHOR";
- the comparison in 6;
- the moderator desktop.

The byline sits between the two phrases, so "by @kaz" can never be read as "by the author". The compose screen ends with "‹model› · open weights · AI-generated" under Generate. The gaps are listed in §9.

**The person's words are kept apart from added text.**

- 1b labels the box "DESCRIBE THE IMAGE · YOUR WORDS".
- 1d shows "PROMPT, PUBLISHED IN FULL" as the person's words plus "+ style text from Kalimar paper v3 + Gladias sheet v2 text".
- 2b (desktop) splits "PROMPT · @KAZ'S WORDS" from "ADDED FROM THE STYLE AND SHEET".
- The passage card says "NOT SENT TO THE MODEL".

This is principle 2 drawn on screen.

**Hierarchy is quiet and consistent.**

| Layer | Style |
|---|---|
| Titles | Crimson Pro 18px |
| Page names | 30px |
| Sheet titles | 26px |
| Labels | DM Mono 12px, grey `#6A675F`, upper case |
| Reading text | 16–19px Crimson |

- **Action bar.** One filled black button per screen carries the main action (GENERATE, PREVIEW →, PUBLISH, USE AS MY STYLE, SEND REPORT). Secondary actions are outlined. The only red button is the moderator's HIDE (`#8A2F2F`). REPORT is a red word on an outlined button.
- **Links** are the app's green `#2E5A3A`: "SHOW ▾", "RECIPE →", "SEE THEM →", "COMPARE →".
- **Weight.** Nothing is bold. Every element is weight 400, and emphasis comes from size, case, fill and borders.

**Sample data is marked so it can't ship by accident.**

- Every sample person, number or value is underlined with `border-bottom:2px dotted #B3306E` (dotted magenta). That covers handles, counts, dates, seeds, costs, prompts, style text, version labels and "7 left".
- Every sample image is a 135° hatched block in one of three muted palettes, labelled "SAMPLE IMAGE…" in mono `#3E4538`.
- The legend in the intro states both conventions.
- Fixed interface words are not underlined, so the dotted marks show exactly which values the app must supply. The model and host are written as placeholders ‹model› and ‹host›.

**Order is always named.** No list is ordered silently.

- The reader strip and the feed say "NEWEST FIRST" or "MOST BUILT ON" (active = 1px black underline).
- Library lists say "MOST BUILT ON" or "NEWEST".
- The moderator queue says "OLDEST FIRST".
- The intro says: "Order is labelled "newest first" or "most built on". Nothing is official, featured or canon."
- The prototype's library adds: "Nothing here is official. "Most built on" counts published images that used each one."
- Pick counts are said never to appear: "No one sees how many people picked anything."

**Versions are pinned and offered, never applied.**

- Chips and picks name a version ("v3").
- A newer version is offered in a green-bordered box, "NEWER VERSION: V4 · COMPARE →".
- The comparison ends in "SWITCH MY PICK TO V4" or "KEEP V3", with the note "Images you already made keep v3."
- Forks carry a fixed "REMIXED FROM" band in `#E6E2D9`, and the forker's changed words are shaded `#E6E2D9` against grey unchanged text.

**Spoilers are covered.**

- Feed covers are solid ink `#1D1D1B` tiles that give only "COVERED · CHAPTER 9" and "SHOW IT ANYWAY".
- Character pages limit "WHAT THE BOOK SAYS" to "FROM THE CHAPTERS YOU'VE READ".

---

## 2. Screens and states

Phone frames are 390 × 695 (the Farcaster frame size stated in the intro). Desktop frames are 1280 × 800. The board is light theme only: "Dark uses the same tokens as the prototype". Neither file contains dark values; see §5.9.

Each section below gives the board layout first, then what the prototype does.

### 2.1 Screen 1a · Reader, passage selected (phone)

Board tag "1a Reader, passage selected". Screenshots: `ic-0`, `proto-00-reader.png`, `proto-01-reader-selected.png`.

**Layout, top to bottom (board)**

1. **Top bar, 44px.** "CH 1 / 32 ▾" (mono 12). A segmented "READ | LISTEN": READ is filled ink with paper text, LISTEN is grey. "···" grey at the right.
2. **Reading column.** Padding 20px 22px 0 8px, gap 14, Crimson 19/1.6.
   - The context paragraph before, grey `#6A675F`, indented 14px: "Suddenly, a small drone flew over his head. Gladias instinctively checked his watch."
   - Two selected blocks, each with a 3px green `#2E5A3A` left rule and 11px left padding: "Gladias was walking along a foot path…" and "He looked around, breathed in…".
3. **Selection action card**, inline under the selection.
   - Border 1px ink, radius 3, fill `#FBFAF6`, mono 12.
   - Header row "¶ 2–3 · 2 BLOCKS SELECTED" with "×" at the right.
   - A three-column grid: "ASK ABOUT THIS" | **"ADD AN IMAGE"** (filled ink) | "COPY LINK" (left rule).
4. **The next paragraph**, grey: "The drone flew off, and continued above a sidewalk branching off to the left."

**Caption under the frame:** "Long-press a block, then tap more blocks to extend, up to 8 in one chapter. Also reached from "+ Add an image" on a scene label."

**Interactions (prototype)**

- The reader shows the eyebrow "MELDAN, VERIDIA · CH 1" (green mono 12) and the heading "Chapter 1" (34px, line-height 1). The top bar title is "Chapter 1"; the back arrow is hidden.
- Tapping either paragraph toggles the selection of both (`selPassage`). The 3px left rule turns green or transparent.
- **ADD AN IMAGE** opens Compose (1b). It clears the "for this image only" chip removals and the tries, keeps any earlier prompt, and clears the selection.
- **ASK ABOUT THIS** shows the toast "Opens the assistant on ¶ 2–3. Designed separately." (`proto-38-ask-toast.png`).
- **COPY LINK** deselects and shows the toast "Link copied · #c1-b2–b3" (`proto-37-copy-link.png`).
- The prototype's selection card has no "×".
- The readers'-images bar (2a) follows the selection, then a hint: "Tap a paragraph to select it."

**Not drawn:** what happens past 8 blocks, a selection across chapters, signed-out or not-invited states.

### 2.2 Screen 1b · Compose (phone)

Tag "1b Compose". Screenshots: `ic-0/1`, `proto-02-compose.png`, `proto-32-compose-chip-removed.png`, `proto-33-compose-empty-prompt.png`, `proto-36-compose-zero-left.png`.

**Layout (board)**

1. **Top bar.** "←" | "Add an image" (18px) | a 16px spacer.
2. **Scroll area.** Padding 14px 18px 0, gap 12.
   - **Passage card.** Border `#DAD6CC`, fill `#FBFAF6`, padding 10px 12px.
     - Label row "CH 1 · ¶ 2–3 · NOT SENT TO THE MODEL", with "− ¶" and "+ ¶" in ink at the right, 14px apart.
     - The passage in italic 16/1.4, clamped to 2 lines (`-webkit-line-clamp:2`).
   - **Prompt.**
     - Label row "DESCRIBE THE IMAGE · YOUR WORDS", with "142 / 600" at the right (142 is sample).
     - The box: border 1px ink, fill `#FBFAF6`, min-height 64, 17/1.4. Its sample text is dotted.
     - Below it, mono 12: "● Public under your name if you publish, with the added style and character text. GPL-3.0. Sent to ‹host› to make it."
   - **Chips.**
     - Label "FROM YOUR PICKS · CHANGE FOR THIS IMAGE ONLY".
     - Chips 40px tall: [STYLE] "Kalimar paper · @tovah v3" × and [CHARACTER] "Gladias · @ilse v2" ×.
     - A dashed "+ ADD" chip.
   - **Rules.** Top rule, then "THE RULES · FULL POLICY →", then 15/1.4: "No real people. No sexual content. Nothing violent or hateful. No characters or logos from other works. No words in the picture."
3. **Action bar.**
   - A 48px filled button: "GENERATE · 7 LEFT TODAY" (7 dotted), mono 13, letter-spacing .06em.
   - Under it, centred mono 12 grey: "‹model› · open weights · AI-generated".

**Interactions (prototype)**

- **Prompt box.** A real `<textarea>`, maxlength 600, 4 rows, no resize. The counter is live: it reads 148 for the default prompt, while the board shows the sample 142.
- **Chip ×.** Each chip's × (36 × 42 button, aria-label "Remove ‹chip› for this image") removes it for this image only.
- **Add button.** With fewer than 2 chips it reads "+ ADD FROM MY PICKS", otherwise "+ ADD". Both open **My picks** (6), so the change there is global, not "for this image only" (§10).
- **Rules link.** The prototype drops "FULL POLICY →"; the label is just "THE RULES".
- **GENERATE**, in this order:
  1. if 0 are left, toast "No generations left today. They come back at 00:00 UTC.";
  2. if the prompt is empty, toast "Describe the image first." (`proto-33`);
  3. if not yet consented, open the consent sheet (2.3);
  4. otherwise take one off the count, add a try and go to Draft (1c).

**Limit state** (`proto-36`): the button reads "0 LEFT TODAY" on a grey `#ABA79D` fill. Tapping it shows the toast.

**Not drawn:** a blocked prompt, the safety checker dropping an image, the model failing, the spend cap, a signed-out person, someone not invited, and the passage widening/narrowing controls ("− ¶ / + ¶" are static on the board and absent from the prototype).

### 2.3 Consent sheet, before the first Generate (prototype only)

This is the board's "↓ first time: consent". Screenshots: `proto-03-consent.png`, `proto-34-consent-not-now.png`.

- A bottom sheet over a scrim `rgba(29,29,27,.45)`. The scrim starts below the 44px top bar (`inset:44px 0 0`), so the bar stays visible. The sheet has a 16px top radius and padding 22px 20px 18px.
- Contents:
  - eyebrow "BEFORE YOUR FIRST IMAGE";
  - title "How images work here" (26/1.1);
  - three 16/1.4 paragraphs, each with a top rule:
    - "Your prompt goes to ‹host›, which runs ‹model› to make the image."
    - "Drafts stay private. If you publish, the image and its full prompt are public, permanent and GPL-3.0, under your Farcaster name."
    - "You can hide your own images at any time. Moderators can hide them too. Copies others have made may remain."
  - buttons in a 1fr : 2fr grid: "NOT NOW" (outlined) and "AGREE AND GENERATE" (filled).
- **Behaviour.**
  - AGREE records consent and immediately runs Generate (`setTimeout(…, 0)`).
  - NOT NOW, or tapping the scrim, closes the sheet with nothing counted.
  - Consent lasts until "RESET EVERYTHING".

### 2.4 Screen 1c · Private draft (phone)

Tag "1c Private draft". Screenshots: `ic-0`, `proto-04-generating.png`, `proto-05-draft.png`, `proto-06-draft-two-tries.png`, `proto-35-draft-zero-left.png`.

**Layout (board)**

1. **Top bar.** "←" | "Draft".
2. **Privacy strip.** Padding 9px 16px, a dashed `#ABA79D` bottom rule, mono 12 grey: "○ DRAFT · ONLY YOU CAN SEE THIS · KEPT ON THIS DEVICE".
3. **Body.** Padding 16px 18px 0, gap 12.
   - The draft image: 200px tall, full width (354px), 1.77:1. It has a dashed outline 3px outside it. Its label is "SAMPLE IMAGE · foot path, tall trees".
   - "AI-GENERATED IMAGE · NOT BY THE AUTHOR" (mono 12, ink).
   - The tries strip: three 72 × 44 thumbnails, the current one ringed `outline:2px solid #1D1D1B`, followed by "this session" in grey.
   - "Every try stays here until you close the app. Only the one you publish becomes public." (16/1.4, `#4A463F`).
   - "EDIT PROMPT ↑" (mono 12 grey).
4. **Action bar.** A two-column grid, gap 8:
   - "AGAIN · 6 LEFT" (outlined `#DAD6CC`, 48px; 6 dotted);
   - "PREVIEW →" (filled, 48px).

**Interactions (prototype)**

- **While generating:** for 1100 ms a paper-coloured veil (`rgba(244,242,237,.85)`) covers the image, with the centred text "GENERATING…". PREVIEW → does nothing during it.
- **Label:** "SAMPLE IMAGE · TRY n".
- **Tries:** thumbnails are 64 × 44 buttons (aria-label "Try n", aria-pressed). Tapping one makes it current. They wrap: after 7 tries there are two rows (`proto-35`).
- **AGAIN** generates again from the draft. Its label is "AGAIN · n LEFT", or "0 LEFT TODAY" at the limit, when a toast appears on tap.
- **"EDIT PROMPT"** (green, no ↑) goes back to Compose.

### 2.5 Screen 1d · Preview and publish (phone)

Tag "1d Preview and publish". Screenshots: `ic-1`, `proto-07-preview.png`, `proto-08-published-toast.png`.

**Layout (board)**

1. **Top bar.** "←" | "Preview".
2. **Body.** Padding 14px 18px 0, gap 10.
   - "AS READERS WILL SEE IT, UNDER CH 1 ¶ 2–3" (grey).
   - The image, 180px tall, with no dashed outline: it is now shown as public.
   - "¶ 2–3 · AI-GENERATED IMAGE · BY @NATE · NOT BY THE AUTHOR · RECIPE".
   - A rule, "PROMPT, PUBLISHED IN FULL", then 15/1.4: the person's prompt (dotted, truncated with "…") + " + style text from Kalimar paper v3 + Gladias sheet v2 text".
   - A two-column grid (96px labels): USES "Kalimar paper v3 · @tovah", (blank) "Gladias · @ilse v2", UNDER "@nate · Nate".
3. **Action bar.**
   - "● Public, permanent, GPL-3.0, under your name. You can hide it later."
   - "PUBLISH" (48, filled, mono 13, .06em).
   - "BACK TO DRAFT" (44, outlined).

**Prototype**

- The image is 190px tall.
- The full prompt is shown, then a grey line naming the added text: "+ Kalimar paper · @tovah v3 text + Gladias · @ilse v2 text", or "No style or character text added." when both chips are removed.
- USES lists the chips; then "UNDER · @nate · Nate".
- **PUBLISH**:
  - prepends the image to the passage;
  - jumps to the reader with the strip open and set to newest first;
  - clears the history;
  - shows the toast "Published under @nate. It shows first under ¶ 2–3."
- **BACK TO DRAFT** goes back.

### 2.6 Screen 1 · DESKTOP: compose in the right column

Tag "1 · DESKTOP Compose in the right column, reader stays in view". Screenshot: `ic-1`/`ic-2`. Not in the prototype ("The desktop layouts are on the static board").

**Grid:** `220px | minmax(0,1fr) | 440px`, 1280 × 800.

| Column | Contents |
|---|---|
| Left rail, 220 wide, `#ECE9E2` | Head 52px "Snowmoon" (22px). Nav at 18px with 8px 20px padding: Read (active `#E6E2D9`), Listen, Images, Styles & characters, My picks, Adaptations, Minpentai |
| Middle | Head 52px "CHAPTER 1 · READ" (mono grey). A 560-wide reading column, 20/1.6, gap 16, padding 30px 0: the two selected blocks with green rules; a green mono line "¶ 2–3 SELECTED · ADDING AN IMAGE →"; then the next paragraph in grey |
| Right panel, 440 wide, rule on the left | Head 52px "Add an image" (20px) with "×" (mono 14). Body padding 16px 20px, gap 14. Footer padding 12px 20px 16px, two 46px buttons |

Right panel body, top to bottom:

1. "CH 1 · ¶ 2–3 · 2 OF 8 BLOCKS" with "− ¶ · + ¶".
2. The prompt box (min-height 110).
3. "● Public under your name if you publish. GPL-3.0." and, in grey on the next line, "Sent to ‹host› to make the image. Private until you publish."
4. Chips: [STYLE] "Kalimar paper v3" ×, [CHAR] "Gladias @ilse v2" ×, "+ ADD".
5. "RULES · " + the rules sentence.
6. The draft image inline: 180 tall, dashed outline. A top-left badge on paper "○ DRAFT · ONLY YOU", and at the bottom-left "SAMPLE IMAGE · AI-GENERATED · NOT BY THE AUTHOR".

Footer buttons: "GENERATE · 6 LEFT TODAY" (outlined ink) and "PREVIEW AND PUBLISH" (filled).

**Desktop vs phone**

- Compose, draft and the preview entry share one panel. There is no separate Draft screen and no tries strip.
- Generate becomes the secondary button once a draft exists.
- The reader stays visible.
- There is no passage text card: the selection itself shows in the reader.
- The chip key shortens from "CHARACTER" to "CHAR".
- The rules lose "FULL POLICY →".

### 2.7 Screen 2a · In the reader, closed and open (phone)

Tag "2a In the reader, closed and open". Screenshots: `ic-2`, `proto-08b…08e`.

**Layout (board)**

1. Top bar: "CH 1 / 32 ▾" … "···".
2. A paragraph, then the **closed bar**: margin 0 22px, 44px tall, rules top and bottom `#DAD6CC`, mono 12. It reads "2 IMAGES BY READERS" with green "SHOW ▾" at the right.
3. A paragraph (`#4A463F`), then the **open bar**: a top rule in ink, and "3 IMAGES BY READERS · ¶ 4–6" with green "HIDE ▴".
4. The sort row: "NEWEST FIRST" (underlined, active) and "MOST BUILT ON" (grey).
5. A horizontal strip:
   - a card 280 wide with a 160-tall image ("SAMPLE IMAGE · watch, green check") and the caption "AI-GENERATED · BY @KAZ · NOT BY THE AUTHOR · RECIPE →";
   - an 80 × 160 sliver of the next card, which signals that the strip scrolls.
6. "SWIPE FOR MORE · + ADD YOURS" (grey).

**Caption:** "Closed by default during the trial. Opening one passage doesn't open the others."

**Prototype**

- The bar reads "n IMAGES BY READERS · ¶ 2–3", with "SHOW ▾" or "HIDE ▴" (aria-expanded).
- When open: the sort buttons, a horizontally scrolling strip of 260-wide cards (150-tall image, caption "AI-GENERATED · BY @RO · NOT BY THE AUTHOR"), and a green "+ ADD YOURS" that opens Compose.
- Tapping a card opens the image page.
- "MOST BUILT ON" re-sorts by the `built` field.
- **Bug:** in the prototype the strip cards render at 0px height, so only the sort row and "+ ADD YOURS" show (`proto-08b`). `proto-08d`/`08e` show the intended cards with the shrinking forced off; see §10.

### 2.8 Screen 2b · Image page (phone)

Tag "2b Image page". Screenshots: `ic-2`, `proto-10-image-page.png`, `proto-10b-liked.png`, `proto-09-own-image.png`, `proto-09b-own-hidden-toast.png`.

**Layout (board)**

1. **Top bar.** "←" | "Image" | "···".
2. **Image.** Full bleed, 210 tall (390 wide, 1.86:1).
3. **Body**, padding 0 18px, gap 10:
   - "AI-GENERATED IMAGE · NOT BY THE AUTHOR"; on the next line in grey, "BY @KAZ · OCT 6 · CH 1 ¶ 4–6 · OPEN IN READER →".
   - **Action grid:** four columns, gap 6, each 44px:
     - "♡ 12" (ink border);
     - "SHARE";
     - "REMIX";
     - "REPORT" (red text `#8A2F2F`).
   - A rule, then "PROMPT · @KAZ'S WORDS" and the prompt (16/1.4).
   - A rule, then a grid with 96px labels:
     - STYLE: "Kalimar paper v3 →" (green);
     - CHARACTERS: "Gladias · @ilse v2 →" (green);
     - MODEL: "‹model› · open weights · via ‹host›";
     - SEED · COST: "4182 · $0.003";
     - FULL RECIPE: "every setting →" (green).

**Caption:** "On your own image, REPORT becomes HIDE THIS, and hiding works at once. REMIX is a placeholder; remixing images isn't designed yet."

**Prototype**

- The meta line reads "BY @KAZ · 1D AGO · CH 1 ¶ 2–3": a relative time, and no "OPEN IN READER →".
- The action buttons are ♡/♥ count, SHARE, **READER** (it replaces REMIX), and REPORT, or **HIDE** on your own image.
- **Like** toggles: the glyph becomes ♥ on an ink fill with paper text, and the count goes up or down by 1.
- **SHARE** shows the toast "Share opens a cast with the image and its recipe link."
- **READER** jumps to the reader with the strip open.
- The STYLE and CHARACTER rows are buttons (min-height 40) that open the style or sheet page. They show only if present.
- The recipe rows are MODEL, SEED · COST ("4182 · $0.003"), and CHECKS "prompt passed · image passed". There is no FULL RECIPE row.
- **Own image:** HIDE hides it at once, goes back, and shows the toast "Hidden from every public view. Unhide from your profile." The reader count drops (`proto-09b`).

### 2.9 Screen 2c · Report (phone)

Tag "2c Report". Screenshots: `ic-2`, `proto-11-report-sheet.png`, `proto-12-report-no-reason.png`, `proto-13-report-reason.png`, `proto-14-report-sent.png`, `proto-14b-report-autohide.png`.

**Layout (board)**

- A full-frame scrim `rgba(29,29,27,.45)` and a bottom sheet: top radius 16, padding 20px 20px 18px, gap 10.
- Contents:
  - "Report this image" (26/1.1);
  - "Moderators see your reason and note, never your name." (15, `#4A463F`);
  - seven radio rows, each 44px tall with a top rule, 17px text, and a 16px circle (1.5px ring; the selected one has a 5px ring). The board shows "A real person" selected;
  - a dashed note box, 56px tall: "Note for moderators, optional · private";
  - "SEND REPORT" (48, filled, mono 13).

**Reasons (board and prototype):**

1. Sexual content, or anything sexual involving a minor
2. A real person
3. Violence or gore
4. Hateful
5. Someone else's character, logo or artwork
6. Misrepresents the book or the author
7. Spam, or something else

**Prototype**

- The rows are `role=radio` buttons (min-height 44, font 16) in a `role=radiogroup`. The note is a real `<textarea>` (2 rows, placeholder "Note for moderators, optional · private").
- **SEND REPORT** is grey `#ABA79D` until a reason is picked. Tapping it then gives the toast "Pick a reason first."
- **On send:**
  - reason 1 ("Sexual content, or anything sexual involving a minor") hides the image at once, goes back, and shows the toast "Reported. This reason hides the image at once until a moderator looks.";
  - any other reason shows the toast "Reported. A moderator will look. The image stays up meanwhile.";
  - either way the report joins the moderator queue.
- Tapping the scrim closes the sheet.

### 2.10 Screen 2 · DESKTOP: image page

Tag "2 · DESKTOP Image page". Screenshot: `ic-3`.

**Grid:** `220px | 1fr`.

- **Rail:** Read, Listen, **Images** (active), Styles & characters, My picks, Adaptations. There is no Minpentai entry, unlike 1-desktop.
- **Head strip, 52px:** "← IMAGES · CH 1 ¶ 4–6".
- **Body:** padding 28px 40px, columns 1.4fr : 1fr, gap 36.

**Left column**

1. The image, 420 tall (about 551 wide, 1.31:1).
2. "AI-GENERATED IMAGE · NOT BY THE AUTHOR · BY @KAZ · OCT 6".
3. A passage card (border `#DAD6CC`, fill `#FBFAF6`, padding 12px 14px):
   - italic 17/1.45: "Suddenly, a small drone flew over his head. Gladias instinctively checked his watch. Almost immediately, a green checkmark lit up."
   - green "CH 1 · ¶ 4 · OPEN IN READER →".

**Right column**, gap 14:

1. **Buttons**, 44 tall with 0 14px padding: "♡ LIKE · 12", "SHARE", "REPORT" (red). There is no REMIX on desktop.
2. "PROMPT · @KAZ'S WORDS" and the prompt (17/1.45).
3. "ADDED FROM THE STYLE AND SHEET": "Flat paper-cut layers, muted greens and greys, soft daylight…" (15, `#4A463F`) and a green "FULL TEXT →".
4. **The recipe grid** (120px labels, row-gap 6):

| Label | Value |
|---|---|
| STYLE | Kalimar paper v3 · @tovah → |
| CHARACTERS | Gladias · @ilse v2 → |
| MODEL · HOST | ‹model› · open weights · ‹host› |
| SIZE · STEPS | 1024 × 576 · 8 |
| SEED | 4182 |
| COST | $0.003 |
| CHECKS | prompt check passed · image check passed |
| REQUEST ID | a91f…07c2 |

5. "GPL-3.0 · ANYONE CAN REBUILD THIS FROM THE RECIPE".

### 2.11 Screen 3 · Feed (phone)

Tag "3 Feed". Screenshots: `ic-3`, `proto-15-feed.png`, `proto-16-feed-most-built.png`, `proto-17-feed-revealed.png`.

**Layout (board)**

1. **Top bar.** "←" | "Images" | "···".
2. **Sort strip.** Padding 10px 16px, bottom rule: "NEWEST FIRST" (active) and "MOST BUILT ON"; at the right "ALL CHAPTERS ▾" (grey).
3. **List**, padding 12px 16px, gap 14:
   - **Item 1:** a 170-tall image; the row "CH 1 ¶ 12–14 · @RO" with "2H AGO" at the right; "AI-GENERATED · NOT BY THE AUTHOR" (grey).
   - **Item 2, covered:** a 170-tall ink tile, centred, padding 0 30px:
     - "COVERED · CHAPTER 9" (mono 12, `#E7E4DD`, .04em);
     - "You've read to chapter 3. This image is from later in the book." (16/1.35);
     - "SHOW IT ANYWAY", a 44px outlined button in `#E7E4DD`.
     - Under the tile: "CH 9 · @MIRA" and "5H AGO".
   - **Item 3:** a 120-tall image, cut off by the frame.

**Caption:** "Covering uses the reader's progress. The caption gives only the chapter number, never the scene."

**Prototype**

- The strip's right label is "READ TO CH 3", not "ALL CHAPTERS ▾". There is no chapter filter.
- Items with chapter > 3 are covered until "SHOW IT ANYWAY" is tapped (per image).
- Every item has the "CH n ¶ x–y · @USER" row with a relative time and "AI-GENERATED · NOT BY THE AUTHOR". The covered item's row also gives "¶ 40", which goes against the board's "only the chapter number" (§10).
- Tapping an image opens 2b. "MOST BUILT ON" re-sorts.
- **Empty feed:** not drawn.

### 2.12 Screen 3 · DESKTOP: feed

Tag "3 · DESKTOP Feed". Screenshot: `ic-3`/`ic-4`.

- **Rail** as in 2-desktop. The head strip has the sort tabs and, at the right, "ALL CHAPTERS ▾ · SPOILERS COVERED AFTER CH 3".
- **Body:** padding 24, a 3-column grid with gap 20. Each tile is 190 tall (about 324 wide, 1.7:1), with a two-line mono caption.

| Tile | Caption line 1 | Caption line 2 |
|---|---|---|
| 1 | "CH 1 ¶ 12–14 · @RO · 2H" | "SAMPLE · AI-GENERATED · NOT BY THE AUTHOR" |
| 2, covered | "CH 9 · @MIRA · 5H" | "AI-GENERATED · NOT BY THE AUTHOR" |
| 3 | "CH 2 ¶ 30 · @TOVAH · 6H" | "SAMPLE · AI-GENERATED · NOT BY THE AUTHOR" |
| 4 | "CH 1 ¶ 4–6 · @KAZ · 1D" | "SAMPLE · AI-GENERATED · NOT BY THE AUTHOR" |
| 5 | "CH 3 ¶ 8–9 · @ILSE · 1D" | "SAMPLE · AI-GENERATED · NOT BY THE AUTHOR" |
| 6, covered | "CH 14 · @RO · 2D" | "AI-GENERATED · NOT BY THE AUTHOR" |

- Tile 2's cover has "COVERED · CHAPTER 9" and a 40px "SHOW IT ANYWAY" button.
- Tile 6's cover has "COVERED · CHAPTER 14" only, with no button. It is an inconsistent state.
- Desktop covers drop the "You've read to chapter 3…" sentence.

### 2.13 Screen 4a · Style guide page (phone)

Tag "4a Style guide page". Screenshots: `ic-4`, `proto-20-style-page-mypick.png`, `proto-20b-style-page-notpick.png`, `proto-20c-use-as-my-style.png`.

**Layout (board)**

1. **Top bar.** "←" | "Style" | "···".
2. **Body**, padding 16px 18px 0, gap 10:
   - "Kalimar paper" (30/1.05).
   - "V3 OF 3 · BY @TOVAH · OCT 4", and on the next line in grey "REMIXED FROM", followed in green by "Techno vistas · project starting point →".
   - A 2 × 2 grid of samples, gap 4, each 92 tall (about 175 wide).
   - "SAMPLE IMAGES · AI-GENERATED · NOT BY THE AUTHOR".
   - A rule, then "STYLE TEXT, ADDED TO PROMPTS · " followed by "Flat paper-cut layers, muted greens and greys, soft daylight, no outlines…".
   - A rule, then "BUILT ON BY 14 IMAGES" and a green "SEE THEM →".
   - "VERSIONS": "V3" (underlined), "V2", "V1" (green links).
3. **Action bar.** A 2fr : 1fr grid of 48px buttons: "USE AS MY STYLE" (filled) and "FORK" (outlined ink).

**Caption:** ""Use as my style" pins this version, v3, privately. Once picked, the button reads "MY STYLE · CHANGE"."

**Prototype**

- The header is "V{v} · BY {by}" with no date. "REMIXED FROM …" is on its own line, as text with a dotted underline but not a link.
- Three samples in one row, each 90 tall.
- "STYLE TEXT · …", then "BUILT ON BY n IMAGES" with no "SEE THEM →", and no VERSIONS row.
- **When this style is your pick**, the green note "○ YOUR PICK · V3 · V4 IS NEWER" appears (the "· V4 IS NEWER" part only when the page's version is newer than the pick), and the button becomes an outlined **"MY STYLE · CLEAR"**, not the board's "MY STYLE · CHANGE".
- **USE AS MY STYLE** pins the page's version, with the toast "Pinned v1 as your style. Only you see this."
- **MY STYLE · CLEAR** clears the pick, with the toast "Pick cleared. Your images will use the most built on."
- **FORK** opens 4c.

### 2.14 Screen 4b · Create a style (phone)

Tag "4b Create a style". Screenshots: `ic-4`, `proto-22-new-style.png`, `proto-23-new-style-samples.png`, `proto-23b-new-style-published.png`.

**Layout (board)**

1. **Top bar.** "×" | "New style".
2. **Body**, padding 16px 18px 0, gap 12:
   - **Name.** "NAME" and an underlined field (bottom rule only, 1px ink, padding 6px 0, 20px) holding "Meldan at dusk".
   - **Style text.** "STYLE TEXT · ADDED TO EVERY PROMPT THAT USES IT", a box (min-height 92, 16/1.4) holding "Low sun, long blue shadows, wet stone, warm window light, painted in thin washes…", and "● Public under your name when you publish the style."
   - **Samples.** "SAMPLE IMAGES · 2 TO 4 · MADE WITH THIS TEXT". A 4-column grid, gap 4, slots 64 tall: two hatched samples, a dashed `#6A675F` "+" slot and an empty dashed `#ABA79D` slot. Under it: "Each sample uses one generation from today's 7."
   - **Rules.** A rule, then "RULES · No living artists' names. No other works' styles by name. The same image rules as Compose."
3. **Action bar.** "PREVIEW AND PUBLISH" (48, filled, mono 13).

**Prototype**

- The title is "New style" and the back arrow returns to the library.
- The name and text fields are real inputs, empty for a new style.
- "SAMPLE IMAGES · AT LEAST 2" with **three** 80-tall slots. The next empty slot reads "+ GENERATE". Each tap uses one generation and fills the slot.
- Under the slots: "Each one uses a generation · n left today".
- At 0 left, the toast "No generations left today."
- The button is **"PUBLISH"**: there is no preview step.
- **Validation toasts:** "Add a name and the text first." and "Generate at least 2 samples first."
- **On publish:** the new style is v1 by @nate with 0 built on. Its page opens with the library under it in the history, and the toast "Published under @nate."

### 2.15 Screen 4c · Fork a style (phone)

Tag "4c Fork a style". Screenshots: `ic-4`, `proto-21-fork-form.png`, `proto-21b-fork-publish-blocked.png`.

**Layout (board)**

1. **Top bar.** "×" | "Fork".
2. **Fixed band**, padding 10px 16px, fill `#E6E2D9`, bottom rule 1px ink: "REMIXED FROM Kalimar paper v3 · @tovah" and, on the next line in grey, "Shown on your style for good. It credits @tovah."
3. **Body:**
   - "NAME": "Kalimar paper, night".
   - "STYLE TEXT · STARTS AS @TOVAH'S, EDIT FREELY". A box (min-height 110, 16/1.45) with grey unchanged text "Flat paper-cut layers, ", the shaded edit (`#E6E2D9` + dotted) "deep blue and silver, moonlight,", and grey " no outlines…". Under it: "Shaded words are yours; the rest is unchanged from v3. The page shows the difference."
   - "SAMPLE IMAGES · NEW ONES NEEDED": four dashed slots, the first "+".
4. **Action bar.** "PREVIEW AND PUBLISH".

**Prototype**

- The band reads "REMIXED FROM Kalimar paper v4 · @tovah / Shown on yours for good.". The name defaults to "‹name›, remix". The text starts as an exact copy, and nothing in the box shades edits.
- The form is otherwise identical to 4b.
- **On publish:** the toast "Published under @nate. It credits @tovah."

### 2.16 Screen 4 · DESKTOP: styles index and a style page

Tag "4 · DESKTOP Styles index and a style page". Screenshot: `ic-5`.

**Grid:** `220 | 340 | 1fr`.

- **Rail:** Read, Images, **Styles & characters** (active), My picks. It is shorter than the other desktops.

**Index column (340)**

- **Tabs** in a 52px head: "STYLES" (underlined), "CHARACTERS", "PLACES · COMING".
- **Sub-row:** "MOST BUILT ON" (underlined) and "NEWEST", with a green "+ NEW" at the right.
- **Rows**, each with a 64 × 48 thumbnail and 12px gap:

| Row | Name (18px) | Meta (mono 12) |
|---|---|---|
| Selected, fill `#E6E2D9` | Kalimar paper | "@tovah · v3 · 14 built on" |
| | Techno vistas | "project starting point · 9 built on" |
| | Meldan at dusk | "@ro · v1 · 2 built on" |

**Detail column**

- **Head, 52px:** "Kalimar paper" (22px). At the right, 40px buttons "USE AS MY STYLE" (filled) and "FORK" (outlined).
- **Body**, padding 20px 24px, gap 14:
  - "V3 OF 3 · BY @TOVAH · REMIXED FROM Techno vistas → · BUILT ON BY 14 IMAGES".
  - Four samples in a row, 150 tall, gap 8.
  - "SAMPLE IMAGES · AI-GENERATED · NOT BY THE AUTHOR".
  - Two columns (1.3fr : 1fr, gap 28):
    - "STYLE TEXT · ADDED TO PROMPTS" with "Flat paper-cut layers, muted greens and greys, soft daylight, no outlines, gentle grain, wide framing…" (18/1.5);
    - "VERSIONS" with rows:
      - "V3 · OCT 4 · deeper greens · 11 built on";
      - "V2 · OCT 2 · 3 built on" (green);
      - "V1 · SEP 30 · 0 built on" (green);
      - "Old versions stay usable."

**Prototype library (phone)**

Screenshots: `proto-18-library-styles.png`, `proto-19-library-characters.png`, `proto-19b-places-toast.png`.

- The title is "Styles & characters". Tabs: STYLES, CHARACTERS, "PLACES · COMING". The last is grey `#ABA79D`; tapping it gives the toast "Location plates are coming. Not designed yet."
- The second row has a static "MOST BUILT ON" label, with no toggle, and a green "+ NEW STYLE" or "+ NEW SHEET".
- Rows are sorted by built-on count. A row reads "‹name›", or "‹Entity› · sheet" for characters, with meta "@by · vN · n built on", plus "○ YOUR PICK" where it applies.
- Footer: "Nothing here is official. "Most built on" counts published images that used each one."

### 2.17 Screen 5a · Character sheet (phone)

Tag "5a Character sheet". Screenshots: `ic-5`/`ic-6`, `proto-24-sheet-zei.png`, `proto-24b-sheet-cleared.png`.

**Layout (board)**

1. **Top bar.** "←" | "Zei" | "···".
2. **Body**, padding 14px 18px 0, gap 10:
   - **Book card** (border `#DAD6CC`, fill `#FBFAF6`):
     - "WHAT THE BOOK SAYS · FROM THE CHAPTERS YOU'VE READ";
     - "A student in Pafogai Du, in his last year of school Minpentai tournaments." with a green "c4-b15 →";
     - "These chapters don't describe his face or clothes. Anything here beyond that is the sheet maker's invention." (15, `#4A463F`).
   - "Sheet by @ilse" (22px), with "V2 OF 2 · 1 OF 4 SHEETS ▸" at the right.
   - Three views in a row, 150 tall (about 115 wide, portrait 0.77:1).
   - "SAMPLE · FRONT, SIDE, BACK · AI-GENERATED · NOT BY THE AUTHOR".
   - A rule, then "SHEET TEXT · " followed by "Seventeen, slight, short dark hair, grey school jacket, glasses on a cable at matches…".
   - "BUILT ON BY 9 IMAGES", with a green "REMIXED FROM @kaz v1 →" at the right.
3. **Action bar.** "USE AS MY ZEI" (2fr, filled) and "FORK".

**Caption:** ""What the book says" follows the reader's spoiler limit. The sheet itself is never covered, since it shows no events."

**Prototype**

- The book text is one block: "A student in Pafogai Du, in his last year of school Minpentai tournaments (c4-b15). These chapters don’t describe his face or clothes."
- Then the title "Sheet by @ilse" at 30px, "V2 · BY @ilse", "REMIXED FROM Zei · @kaz v1", three 90-tall samples, the SHEET TEXT and "BUILT ON BY 9 IMAGES".
- There is no "1 OF 4 SHEETS ▸" and no way to move between sheets.
- The pick button reads "USE AS MY ZEI", or "MY ZEI · CLEAR" when it is your pick.
- The other sheets are reached only from the library's CHARACTERS tab.

### 2.18 Screen 5b · Create or fork a sheet (phone)

Tag "5b Create or fork a sheet". Screenshots: `ic-6`, `proto-25-sheet-fork.png`.

**Layout (board)**

1. **Top bar.** "×" | "New Zei sheet".
2. **Band** (`#E6E2D9`, rule under it): "REMIXED FROM Zei · @ilse v2 · OR START BLANK".
3. **Body:**
   - The book quote, with a 2px `#DAD6CC` left rule (15, `#4A463F`): "The book: a student in Pafogai Du, last year of school tournaments (c4-b15). Nothing on his looks yet."
   - "SHEET TEXT · ADDED WHEN ZEI IS IN A PROMPT". A box (min-height 96) with grey "Seventeen, slight, ", the shaded edit "longer hair tied back,", and grey " grey school jacket…". Under it: "● Public under your name when you publish the sheet."
   - "VIEWS · FRONT, SIDE, BACK": three dashed slots, 84 tall, the first "+ GENERATE".
   - "RULES · Don't base a character on a real person. Don't contradict what the book says."
4. **Action bar.** "PREVIEW AND PUBLISH".

**Prototype**

- The title is "Fork". The band reads "REMIXED FROM Zei v2 · @ilse / Shown on yours for good.".
- The name field is labelled "CHARACTER" and holds "Zei".
- The text label is "SHEET TEXT · ADDED WHEN ZEI IS IN A PROMPT". The samples label is "VIEWS · FRONT, SIDE, BACK", and the rules are as on the board.
- **There is no "start blank" choice from a sheet.** "+ NEW SHEET" in the library always starts a Zei sheet.
- The book quote is not shown in the form.

### 2.19 Screen 6 · My picks (phone)

Tag "6 My picks". Screenshots: `ic-6`/`ic-7`, `proto-26-picks.png`, `proto-26b-picks-style-cleared.png`, `proto-27-compare.png`, `proto-28-switched.png`.

**Layout (board)**

1. **Top bar.** "←" | "My picks".
2. **Privacy strip** (dashed rule): "○ PRIVATE · ONLY YOU SEE YOUR PICKS".
3. **Body**, padding 14px 18px 0, gap 14:
   - "Your picks fill in the style and characters when you make an image. Nobody else's images change." (16, `#4A463F`).
   - **STYLE.** A row with a 56 × 44 thumbnail and "Kalimar paper · @tovah v3" (17px), with green "CHANGE · CLEAR" under it. Below the row, a green-bordered box "NEWER VERSION: V4" with "COMPARE →".
   - **CHARACTERS.** Rows for "Zei · @ilse v2" and "Gladias · @ilse v2" (each with "CHANGE · CLEAR"), then "Emerald · no pick" with an empty dashed thumbnail and "USES THE MOST BUILT ON: @ro v1 · PICK ONE".
   - "No one sees how many people picked anything."

**Caption:** "Picks are pinned to a version. A newer version is offered, never applied for you. Pictures you've already made never change."

**Prototype**

- **Rows.** The style row is "Kalimar paper · @tovah v3". With no pick it reads "No style picked · most built on is used" and "PICK ONE". The no-pick character row is "Emerald · no pick · most built on is used (@ro)".
- **CHANGE** opens the library on the right tab. **CLEAR** removes the pick at once, with no confirmation.
- **COMPARE** opens the "Newer version" screen:
  - "KALIMAR PAPER · YOUR V3 AND @TOVAH'S NEW V4";
  - two 130-tall samples labelled "V3 · YOUR PICK" and "V4 · NEW";
  - "SAMPLE IMAGES · AI-GENERATED · NOT BY THE AUTHOR";
  - the v4 text with "warmer evening light," shaded;
  - "Shaded words changed in v4. Images you already made keep v3.";
  - buttons "KEEP V3" (goes back) and "SWITCH TO V4" (filled). Switching updates the pick, goes back, and shows the toast "Your style is now Kalimar paper v4. Past images keep v3."

### 2.20 Screen 6 · DESKTOP: my picks, comparing a newer version

Tag "6 · DESKTOP My picks, comparing a newer version". Screenshot: `ic-7`.

- **Rail:** Read, Images, Styles & characters, **My picks** (active).
- **Head:** "My picks" (22px) with "○ PRIVATE · ONLY YOU SEE THESE" at the right.
- **Body:** padding 24, grid `360px | 1fr`, gap 32.

**Left column**

- "STYLE": a row with fill `#E6E2D9` and padding 10: "Kalimar paper v3" with "V4 AVAILABLE" at the right.
- "CHARACTERS": "Zei · @ilse v2", "Gladias · @ilse v2", and "Emerald · no pick · most built on is used" (grey).

**Right column**

1. "KALIMAR PAPER · YOUR V3 AND @TOVAH'S NEW V4".
2. Two 200-tall samples (gap 16), "V3 · YOUR PICK" and "V4 · OCT 7".
3. "SAMPLE IMAGES · AI-GENERATED · NOT BY THE AUTHOR".
4. 17/1.5: "Flat paper-cut layers, muted greens and greys, warmer evening light, no outlines…" with the edit shaded.
5. Buttons, 44 tall: "SWITCH MY PICK TO V4" (filled) and "KEEP V3" (outlined `#DAD6CC`).

### 2.21 Screen 7 · Moderator queue (phone)

Tag "7 Queue on a phone". Screenshots: `ic-7`/`ic-8`, `proto-29-queue.png`, `proto-30-queue-empty.png`, `proto-30b-queue-dismissed.png`.

**Layout (board)**

1. **Top bar.** "←" | "Reports" | "1 OF 3" (mono 12, 3 dotted).
2. **Role strip.** Bottom rule `#8A2F2F`, red text: "MODERATORS ONLY · OLDEST FIRST".
3. **Body**, padding 12px 18px 0, gap 10:
   - The image, 170 tall: "SAMPLE IMAGE · AI-GENERATED".
   - "BY @SAMPLE-USER · CH 2 ¶ 30 · OCT 7" and, in grey, "CHECKS: PROMPT PASSED · IMAGE PASSED".
   - "PROMPT": "A crowded market street at night, a famous tech founder buying noodles…".
   - "PASSAGE · CH 2 ¶ 30": "On the left, there were two adjacent stores…" (italic).
   - "REASONS · REPORTERS NEVER SHOWN": "A real person · 2", "Misrepresents the author · 1", and, in Crimson 15, Note: ""looks like a real person"".
4. **Action bar.** "DISMISS" (outlined) and "HIDE" (filled `#8A2F2F`), both 48px, mono 13.

**Prototype**

- The strip reads "MODERATORS ONLY · OLDEST FIRST" and "n WAITING". The note reads "Looks like a real person, next to his book."
- **DISMISS** removes the item, un-hides the image (`hidden:false`), and shows the toast "Dismissed. The image stays up."
- **HIDE** hides the image and shows the toast "Hidden from every public view."
- **Empty state:** "Nothing waiting. Reports from readers appear here." (18px, centred).

### 2.22 Screen 7 · DESKTOP: queue

Tag "7 · DESKTOP Queue". Screenshot: `ic-8`/`ic-9`.

**Grid:** `360 | 1fr`. There is no app rail on this board.

**List column (360)**

- **Head, 52px**, red bottom rule: "Reports" (22px) and red "MODERATORS ONLY".
- **Sub-row:** "OLDEST FIRST · 3 WAITING · 1 AUTO-HIDDEN".
- **Rows** with a 72 × 48 thumbnail:
  - selected (`#E6E2D9`): "A REAL PERSON · 2 / CH 2 · OCT 7";
  - "SPAM · 1 / CH 1 · OCT 7";
  - with an ink thumbnail and red text: "AUTO-HIDDEN · 3 REPORTERS / CH 3 · OCT 6".

**Detail**: padding 24, columns 1.2fr : 1fr, gap 28.

Left column:

1. The image, 340 tall: "SAMPLE IMAGE · AI-GENERATED · NOT BY THE AUTHOR".
2. "BY @SAMPLE-USER · OCT 7 14:02 · ‹model› · SEED 771" and "CHECKS: PROMPT PASSED · IMAGE PASSED".
3. A passage card: "PASSAGE · CH 2 ¶ 30" and "On the left, there were two adjacent stores. One was selling sensors of all kinds - cameras, microphones, biological and chemical…".

Right column:

1. "PROMPT, EXACTLY AS SENT": "A crowded market street at night, a famous tech founder buying noodles, neon, rain…" and "+ STYLE TEXT: Meldan at dusk v1".
2. "REASONS": "A real person · 2", "Misrepresents the book or the author · 1".
3. "NOTES FROM REPORTERS · NAMES NEVER SHOWN": ""Looks like a real person, and it's next to his book.""
4. The explanation: "Hide removes it from every public view and moves the file to private storage. Dismiss keeps it up and closes these reports. There is nothing else to choose."
5. "DISMISS" and "HIDE" (48px), pinned to the bottom (`margin-top:auto`).

### 2.23 Prototype-only screens and controls

| Item | What it is | Screenshot |
|---|---|---|
| Left panel | Not part of the app: the flow launcher. "START A FLOW" lists 8 flows; each jumps to a state and clears the history. "RESET EVERYTHING" restores the sample data | `Image-Creation-Prototype-full.png` |
| ··· menu sheet | "SNOWMOON" eyebrow. Items, 48px tall, 20px text, bottom rules: "Read"; "Images" with "NEWEST FIRST" at the right; "Styles & characters"; "My picks" with "PRIVATE"; "Moderator queue" with "MODERATORS ONLY" in red. Each item jumps to that screen | `proto-31-menu.png` |
| Back arrow | Hidden when the history is empty; pops one screen | — |
| Toast | `role=status`, ink box at the bottom (above the action bar), 2.2 s | many |

The eight flows in "START A FLOW":

| Flow | Subtitle | Lands on |
|---|---|---|
| Make an image | Select → compose → consent → draft → publish | reader, selected |
| See readers' images | Reader strip, sort, image page | reader, strip open |
| Report an image | Image page → report → moderator queue | image i2 |
| Feed with covered spoilers | Newest first or most built on | feed |
| Style guides | Use as my style, fork, create | library, styles |
| Character sheets | Use as my Zei, fork | Zei sheet z1 |
| My picks | Change, clear, compare a newer version | picks |
| Moderator queue | Hide or dismiss | queue |

---

## 3. Animations, transitions and timing

- **Static board:** no script, no `transition`, no `animation`, no `@keyframes`.
- **Prototype:** no CSS transitions or animations. Every screen change, sheet, toast and veil appears instantly. The only timing is in the script:

| What | Timing | Where |
|---|---|---|
| Toast auto-dismiss | 2200 ms after it shows. A new toast cancels the previous timer | `toast(t)`, line 368 |
| "GENERATING…" veil on the draft | 1100 ms, then `generating:false` | `generate()`, line 389 |
| Consent → generate | `setTimeout(…, 0)`: Generate runs on the next tick after AGREE | line 448 |
| Unmount | clears both timers | line 367 |

- **`support.js`** (the canvas runtime) defines `@keyframes sc-shine`, a placeholder shimmer for the design tool's loading state. It is not part of the design.
- **For comparison, the app** animates its bottom sheets (`.menu-sheet, .chapter-sheet, .recipe-sheet`, which includes the composer) with `sheet-up 160ms ease-out`: a 16px rise and fade, only under `prefers-reduced-motion: no-preference` (`shell.css`). The Design specifies no motion, so keeping the app's 160 ms sheet rise is a free choice. The Design's report and consent sheets would inherit it if built as `.recipe-sheet`.

---

## 4. Every string, by screen

Strings are verbatim. "(P)" means the prototype only, "(B)" the board only. Sample values (dotted magenta on the page) are in *italics* here.

### 4.1 Board chrome

| Where | Strings |
|---|---|
| Intro eyebrow | SNOWMOON PARTY · IMAGE CREATION · ALL WORDING IS DRAFT FOR NATE |
| Intro title | Making images from the book |
| Intro lede | Phone at the Farcaster frame size (390 × 695) and desktop (1280 × 800), light theme. Dark uses the same tokens as the prototype. Built on the coding agent's proposals: add-an-image.md and favourites.md. |
| Legend | *@ilse · 7 · 0.003* — "dotted magenta = sample person, number or value" / [hatched swatch] "hatched = sample image" / "Order is labelled "newest first" or "most built on". Nothing is official, featured or canon." |
| Section labels | FLOW · 1 · COMPOSE · 2 · AN IMAGE IN THE READER, AND ITS PAGE · 3 · FEED OF NEW IMAGES · 4 · STYLE GUIDES · 5 · CHARACTER SHEETS · 6 · MY PICKS · 7 · MODERATOR QUEUE · DECISIONS I HAD TO GUESS |
| Frame tags | 1a Reader, passage selected · 1b Compose · 1c Private draft · 1d Preview and publish · 1 · DESKTOP Compose in the right column, reader stays in view · 2a In the reader, closed and open · 2b Image page · 2c Report · 2 · DESKTOP Image page · 3 Feed · 3 · DESKTOP Feed · 4a Style guide page · 4b Create a style · 4c Fork a style · 4 · DESKTOP Styles index and a style page · 5a Character sheet · 5b Create or fork a sheet · 6 My picks · 6 · DESKTOP My picks, comparing a newer version · 7 Queue on a phone · 7 · DESKTOP Queue |
| Flow panel | column heads MAKE, SEE, STYLES, CHARACTERS, PRIVATE, MODERATORS ONLY, COMING, NOT DESIGNED; nodes and notes as in §1.1 |

### 4.2 Prototype chrome (P)

- **Panel:** "SNOWMOON · IMAGE CREATION · CLICKABLE · ALL WORDING DRAFT" / "Every flow, tap by tap" / "People, images and numbers are samples. Dotted magenta marks a sample value, and hatching marks a sample image. Generating is faked." / "START A FLOW" / the 8 flow titles and subtitles (§2.23) / "RESET EVERYTHING" / "The desktop layouts are on the static board (Image Creation.dc.html). This mockup runs the flows at phone size."
- **Screen titles:** Chapter 1 · Add an image · Draft · Preview · Image · Images · Styles & characters · Style · ‹Entity› (e.g. Zei) · New style · New Zei sheet · Fork · My picks · Newer version · Reports.
- **aria-labels:** "Back", "Menu", "Open image", "Remove ‹chip› for this image", "Try n".
- **Menu:** SNOWMOON · Read · Images (NEWEST FIRST) · Styles & characters · My picks (PRIVATE) · Moderator queue (MODERATORS ONLY).
- **Every toast:**
  - Opens the assistant on ¶ 2–3. Designed separately.
  - Link copied · #c1-b2–b3
  - No generations left today. They come back at 00:00 UTC.
  - Describe the image first.
  - Published under @nate. It shows first under ¶ 2–3.
  - Share opens a cast with the image and its recipe link.
  - Hidden from every public view. Unhide from your profile.
  - Pick a reason first.
  - Reported. This reason hides the image at once until a moderator looks.
  - Reported. A moderator will look. The image stays up meanwhile.
  - Location plates are coming. Not designed yet.
  - Pinned v‹n› as your ‹style|Entity›. Only you see this.
  - Pick cleared. Your images will use the most built on.
  - No generations left today.
  - Add a name and the text first.
  - Generate at least 2 samples first.
  - Published under @nate. / Published under @nate. It credits ‹@by›.
  - Your style is now Kalimar paper v4. Past images keep v3.
  - Dismissed. The image stays up.
  - Hidden from every public view.
  - Reset to a first visit.

### 4.3 1a Reader, passage selected

- **(B)** CH 1 / 32 ▾ · READ · LISTEN · ··· · ¶ 2–3 · 2 BLOCKS SELECTED · × · ASK ABOUT THIS · ADD AN IMAGE · COPY LINK
- **Book text (B):** "Suddenly, a small drone flew over his head. Gladias instinctively checked his watch." / "Gladias was walking along a foot path, with tall trees towering on both sides. A series of houses made out of large stone bricks lay behind the trees on both sides…" / "He looked around, breathed in and briefly stopped to enjoy the nature…" / "The drone flew off, and continued above a sidewalk branching off to the left."
- **Caption (B):** Long-press a block, then tap more blocks to extend, up to 8 in one chapter. Also reached from "+ Add an image" on a scene label.
- **(P):** MELDAN, VERIDIA · CH 1 · Chapter 1 · Tap a paragraph to select it.
- **Book text (P):** "…medieval in style but without any of the junk…" / "…dense enough and quiet enough that he almost forgot that he was in the middle of the Kalimar district of Meldan…" / "Suddenly, a small drone flew over his head. Gladias instinctively checked his watch. Almost immediately, a green checkmark lit up."

### 4.4 1b Compose

- **Header:** ← · Add an image
- **Passage:** CH 1 · ¶ 2–3 · NOT SENT TO THE MODEL · − ¶ · + ¶ (B)
- **Prompt:** DESCRIBE THE IMAGE · YOUR WORDS · *142* / 600
- **Sample prompt:** *Wide shot along a foot path between very tall trees, low stone-brick houses half hidden behind them, morning light, one figure walking away from us.*
- **Line under the box:** ● Public under your name if you publish, with the added style and character text. GPL-3.0. Sent to ‹host› to make it.
- **Chips:** FROM YOUR PICKS · CHANGE FOR THIS IMAGE ONLY · STYLE *Kalimar paper · @tovah v3* × · CHARACTER Gladias · *@ilse v2* × · + ADD (B) / + ADD FROM MY PICKS (P, under 2 chips)
- **Rules:** THE RULES · FULL POLICY → (B) / THE RULES (P) · No real people. No sexual content. Nothing violent or hateful. No characters or logos from other works. No words in the picture.
- **Action:** GENERATE · *7* LEFT TODAY · 0 LEFT TODAY (P) · ‹model› · open weights · AI-generated

### 4.5 Consent sheet (P)

BEFORE YOUR FIRST IMAGE · How images work here · Your prompt goes to ‹host›, which runs ‹model› to make the image. · Drafts stay private. If you publish, the image and its full prompt are public, permanent and GPL-3.0, under your Farcaster name. · You can hide your own images at any time. Moderators can hide them too. Copies others have made may remain. · NOT NOW · AGREE AND GENERATE

### 4.6 1c Draft

← · Draft · ○ DRAFT · ONLY YOU CAN SEE THIS · KEPT ON THIS DEVICE · SAMPLE IMAGE · foot path, tall trees (B) / SAMPLE IMAGE · TRY n (P) · GENERATING… (P) · AI-GENERATED IMAGE · NOT BY THE AUTHOR · this session · Every try stays here until you close the app. Only the one you publish becomes public. · EDIT PROMPT ↑ (B) / EDIT PROMPT (P) · AGAIN · *6* LEFT · PREVIEW →

### 4.7 1d Preview

← · Preview · AS READERS WILL SEE IT, UNDER CH 1 ¶ 2–3 · SAMPLE IMAGE · ¶ 2–3 · AI-GENERATED IMAGE · BY *@NATE* · NOT BY THE AUTHOR · RECIPE · PROMPT, PUBLISHED IN FULL · *Wide shot along a foot path between very tall trees…* + style text from Kalimar paper v3 + Gladias sheet v2 text (B) · No style or character text added. (P) · USES · *Kalimar paper v3 · @tovah* · Gladias · *@ilse v2* · UNDER · *@nate · Nate* · ● Public, permanent, GPL-3.0, under your name. You can hide it later. · PUBLISH · BACK TO DRAFT

### 4.8 1 · Desktop compose (B)

- **Rail:** Snowmoon · Read · Listen · Images · Styles & characters · My picks · Adaptations · Minpentai
- **Middle:** CHAPTER 1 · READ · ¶ 2–3 SELECTED · ADDING AN IMAGE →
- **Panel:** Add an image · × · CH 1 · ¶ 2–3 · 2 OF 8 BLOCKS · − ¶ · + ¶ · ● Public under your name if you publish. GPL-3.0. · Sent to ‹host› to make the image. Private until you publish. · STYLE *Kalimar paper v3* × · CHAR Gladias *@ilse v2* × · + ADD · RULES · ‹rules› · ○ DRAFT · ONLY YOU · SAMPLE IMAGE · AI-GENERATED · NOT BY THE AUTHOR · GENERATE · *6* LEFT TODAY · PREVIEW AND PUBLISH
- **Book text:** "…A series of houses made out of large stone bricks lay behind the trees on both sides, medieval in style but without any of the junk…" / "He looked around, breathed in and briefly stopped to enjoy the nature, dense enough and quiet enough that he almost forgot that he was in the middle of the Kalimar district of Meldan…" / "Suddenly, a small drone flew over his head. Gladias instinctively checked his watch. Almost immediately, a green checkmark lit up."

### 4.9 2a Reader images

- **Bars:** *2* IMAGES BY READERS · SHOW ▾ · *3* IMAGES BY READERS · ¶ 4–6 · HIDE ▴
- **Sort:** NEWEST FIRST · MOST BUILT ON
- **Card:** SAMPLE IMAGE · watch, green check · AI-GENERATED · BY *@KAZ* · NOT BY THE AUTHOR · RECIPE →
- **Footer:** SWIPE FOR MORE · + ADD YOURS
- **Caption:** Closed by default during the trial. Opening one passage doesn't open the others.
- **(P):** n IMAGES BY READERS · ¶ 2–3 · + ADD YOURS

### 4.10 2b Image page (phone)

- **Header:** ← · Image · ···
- **Lines:** AI-GENERATED IMAGE · NOT BY THE AUTHOR · BY *@KAZ* · *OCT 6* · CH 1 ¶ 4–6 · OPEN IN READER →
- **Actions:** ♡ *12* · SHARE · REMIX · REPORT
- **Prompt:** PROMPT · *@KAZ*'S WORDS · *Close on a wrist and a small watch face, a green check glowing, a toy drone blurred overhead, trees behind.*
- **Recipe:** STYLE *Kalimar paper v3* → · CHARACTERS Gladias · *@ilse v2* → · MODEL ‹model› · open weights · via ‹host› · SEED · COST *4182 · $0.003* · FULL RECIPE every setting →
- **Caption:** On your own image, REPORT becomes HIDE THIS, and hiding works at once. REMIX is a placeholder; remixing images isn't designed yet.
- **(P):** READER · HIDE · ♥ · CHARACTER (singular) · CHECKS prompt passed · image passed · sample prompts "A man pausing on a forest path, eyes closed, breathing in, morning mist." and the others in §6.3

### 4.11 2c Report

Report this image · Moderators see your reason and note, never your name. · the 7 reasons (§2.9) · Note for moderators, optional · private · SEND REPORT

### 4.12 2 · Desktop image page (B)

← IMAGES · CH 1 ¶ 4–6 · AI-GENERATED IMAGE · NOT BY THE AUTHOR · BY *@KAZ* · *OCT 6* · "Suddenly, a small drone flew over his head. Gladias instinctively checked his watch. Almost immediately, a green checkmark lit up." · CH 1 · ¶ 4 · OPEN IN READER → · ♡ LIKE · *12* · SHARE · REPORT · PROMPT · *@KAZ*'S WORDS · ADDED FROM THE STYLE AND SHEET · Flat paper-cut layers, muted greens and greys, soft daylight… · FULL TEXT → · STYLE · CHARACTERS · MODEL · HOST · SIZE · STEPS · 1024 × 576 · 8 · SEED · *4182* · COST · *$0.003* · CHECKS · prompt check passed · image check passed · REQUEST ID · *a91f…07c2* · GPL-3.0 · ANYONE CAN REBUILD THIS FROM THE RECIPE

### 4.13 3 Feed

- **Header and sort:** ← · Images · ··· · NEWEST FIRST · MOST BUILT ON · ALL CHAPTERS ▾ (B) / READ TO CH 3 (P)
- **Item rows:** CH 1 ¶ 12–14 · *@RO* · *2H* AGO · AI-GENERATED · NOT BY THE AUTHOR
- **Cover:** COVERED · CHAPTER 9 · You've read to chapter 3. This image is from later in the book. · SHOW IT ANYWAY · CH 9 · *@MIRA* · *5H* AGO
- **Caption:** Covering uses the reader's progress. The caption gives only the chapter number, never the scene.
- **Desktop:** ALL CHAPTERS ▾ · SPOILERS COVERED AFTER CH 3 · SAMPLE · AI-GENERATED · NOT BY THE AUTHOR · COVERED · CHAPTER 14 · the tile captions in §2.12

### 4.14 4a / 4b / 4c / 4-desktop

- **4a:** ← · Style · ··· · *Kalimar paper* · V3 OF 3 · BY *@TOVAH* · *OCT 4* · REMIXED FROM Techno vistas · project starting point → · SAMPLE IMAGES · AI-GENERATED · NOT BY THE AUTHOR · STYLE TEXT, ADDED TO PROMPTS · *Flat paper-cut layers, muted greens and greys, soft daylight, no outlines…* · BUILT ON BY *14* IMAGES · SEE THEM → · VERSIONS · V3 · V2 · V1 · USE AS MY STYLE · FORK
  - Caption: "Use as my style" pins this version, v3, privately. Once picked, the button reads "MY STYLE · CHANGE".
  - (P): MY STYLE · CLEAR · ○ YOUR PICK · V3 · V4 IS NEWER · STYLE TEXT
- **4b:** × · New style · NAME · *Meldan at dusk* · STYLE TEXT · ADDED TO EVERY PROMPT THAT USES IT · *Low sun, long blue shadows, wet stone, warm window light, painted in thin washes…* · ● Public under your name when you publish the style. · SAMPLE IMAGES · 2 TO 4 · MADE WITH THIS TEXT · + · Each sample uses one generation from today's *7*. · RULES · No living artists' names. No other works' styles by name. The same image rules as Compose. · PREVIEW AND PUBLISH
  - (P): SAMPLE IMAGES · AT LEAST 2 · + GENERATE · Each one uses a generation · n left today · ● Public under your name when you publish it. · PUBLISH
- **4c:** × · Fork · REMIXED FROM *Kalimar paper v3 · @tovah* · Shown on your style for good. It credits @tovah. · NAME · *Kalimar paper, night* · STYLE TEXT · STARTS AS @TOVAH'S, EDIT FREELY · Flat paper-cut layers, *deep blue and silver, moonlight,* no outlines… · Shaded words are yours; the rest is unchanged from v3. The page shows the difference. · SAMPLE IMAGES · NEW ONES NEEDED · + · PREVIEW AND PUBLISH
  - (P): Shown on yours for good. · ‹name›, remix
- **4-desktop:** STYLES · CHARACTERS · PLACES · COMING · MOST BUILT ON · NEWEST · + NEW · Kalimar paper · *@tovah · v3 · 14 built on* · Techno vistas · project starting point · *9 built on* · *Meldan at dusk* · *@ro · v1 · 2 built on* · USE AS MY STYLE · FORK · V3 OF 3 · BY *@TOVAH* · REMIXED FROM Techno vistas → · BUILT ON BY *14* IMAGES · STYLE TEXT · ADDED TO PROMPTS · *Flat paper-cut layers, muted greens and greys, soft daylight, no outlines, gentle grain, wide framing…* · VERSIONS · V3 · *OCT 4* · deeper greens · *11* built on · V2 · *OCT 2* · *3* built on · V1 · *SEP 30* · *0* built on · Old versions stay usable.
- **Library (P):** STYLES · CHARACTERS · PLACES · COMING · MOST BUILT ON · + NEW STYLE · + NEW SHEET · ‹Entity› · sheet · ○ YOUR PICK · Nothing here is official. "Most built on" counts published images that used each one.

### 4.15 5a / 5b

- **5a:** ← · Zei · ··· · WHAT THE BOOK SAYS · FROM THE CHAPTERS YOU'VE READ · A student in Pafogai Du, in his last year of school Minpentai tournaments. · c4-b15 → · These chapters don't describe his face or clothes. Anything here beyond that is the sheet maker's invention. · Sheet by *@ilse* · V2 OF 2 · 1 OF *4* SHEETS ▸ · SAMPLE · FRONT, SIDE, BACK · AI-GENERATED · NOT BY THE AUTHOR · SHEET TEXT · *Seventeen, slight, short dark hair, grey school jacket, glasses on a cable at matches…* · BUILT ON BY *9* IMAGES · REMIXED FROM *@kaz v1* → · USE AS MY ZEI · FORK
  - Caption: "What the book says" follows the reader's spoiler limit. The sheet itself is never covered, since it shows no events.
- **5b:** × · New Zei sheet · REMIXED FROM *Zei · @ilse v2* · OR START BLANK · The book: a student in Pafogai Du, last year of school tournaments (c4-b15). Nothing on his looks yet. · SHEET TEXT · ADDED WHEN ZEI IS IN A PROMPT · Seventeen, slight, *longer hair tied back,* grey school jacket… · ● Public under your name when you publish the sheet. · VIEWS · FRONT, SIDE, BACK · + GENERATE · RULES · Don't base a character on a real person. Don't contradict what the book says. · PREVIEW AND PUBLISH
- **(P) book lines:**
  - Zei: "A student in Pafogai Du, in his last year of school Minpentai tournaments (c4-b15). These chapters don’t describe his face or clothes."
  - Gladias: "He lives in the Kalimar district of Meldan, the capital of Veridia (c1-b3). The chapter says little about how he looks."
  - Emerald: "The local AI on Gladias’s hand device (c1-b9)."
- **(P) other:** CHARACTER (name label) · MY ZEI · CLEAR

### 4.16 6 My picks

- **Phone:** ← · My picks · ○ PRIVATE · ONLY YOU SEE YOUR PICKS · Your picks fill in the style and characters when you make an image. Nobody else's images change. · STYLE · *Kalimar paper · @tovah v3* · CHANGE · CLEAR · NEWER VERSION: V4 · COMPARE → · CHARACTERS · Zei · *@ilse v2* · Gladias · *@ilse v2* · Emerald · no pick · USES THE MOST BUILT ON: *@ro v1* · PICK ONE · No one sees how many people picked anything.
  - Caption: Picks are pinned to a version. A newer version is offered, never applied for you. Pictures you've already made never change.
- **Desktop:** My picks · ○ PRIVATE · ONLY YOU SEE THESE · STYLE · *Kalimar paper v3* · V4 AVAILABLE · CHARACTERS · Emerald · no pick · most built on is used · KALIMAR PAPER · YOUR V3 AND *@TOVAH*'S NEW V4 · V3 · YOUR PICK · V4 · *OCT 7* · SAMPLE IMAGES · AI-GENERATED · NOT BY THE AUTHOR · Flat paper-cut layers, muted greens and greys, *warmer evening light,* no outlines… · SWITCH MY PICK TO V4 · KEEP V3
- **(P):** No style picked · most built on is used · ‹Entity› · no pick · most built on is used (‹@by›) · V4 · NEW · Shaded words changed in v4. Images you already made keep v3. · SWITCH TO V4 · KEEP V3

### 4.17 7 Moderator queue

- **Phone:** ← · Reports · 1 OF *3* · MODERATORS ONLY · OLDEST FIRST · SAMPLE IMAGE · AI-GENERATED · BY *@SAMPLE-USER* · CH 2 ¶ 30 · *OCT 7* · CHECKS: PROMPT PASSED · IMAGE PASSED · PROMPT · *A crowded market street at night, a famous tech founder buying noodles…* · PASSAGE · CH 2 ¶ 30 · On the left, there were two adjacent stores… · REASONS · REPORTERS NEVER SHOWN · A real person · *2* · Misrepresents the author · *1* · Note: "*looks like a real person*" · DISMISS · HIDE
- **Desktop:** Reports · MODERATORS ONLY · OLDEST FIRST · *3* WAITING · *1* AUTO-HIDDEN · A REAL PERSON · *2* · CH 2 · *OCT 7* · SPAM · *1* · CH 1 · AUTO-HIDDEN · *3* REPORTERS · CH 3 · *OCT 6* · BY *@SAMPLE-USER* · *OCT 7 14:02* · ‹model› · SEED *771* · PASSAGE · CH 2 ¶ 30 · On the left, there were two adjacent stores. One was selling sensors of all kinds - cameras, microphones, biological and chemical… · PROMPT, EXACTLY AS SENT · *A crowded market street at night, a famous tech founder buying noodles, neon, rain…* · + STYLE TEXT: *Meldan at dusk v1* · REASONS · Misrepresents the book or the author · NOTES FROM REPORTERS · NAMES NEVER SHOWN · "*Looks like a real person, and it's next to his book.*" · Hide removes it from every public view and moves the file to private storage. Dismiss keeps it up and closes these reports. There is nothing else to choose.
- **(P):** n WAITING · Note: "Looks like a real person, next to his book." · Nothing waiting. Reports from readers appear here.

### 4.18 Guesses section

See §7, verbatim.

---

## 5. Measured visual values

All values come from the inline styles. Fonts: "Crimson Pro" (400, 500, 600, italic 400) and "DM Mono" (400, 500), from Google Fonts.

### 5.1 Type

| Use | Family | Size | Line-height | Letter-spacing | Other |
|---|---|---|---|---|---|
| Board intro title | Crimson | 44 | 1.05 | — | |
| Board intro lede | Crimson | 19 | 1.45 | — | `#4A463F`, text-wrap pretty |
| Section label, eyebrows | DM Mono | 12 | — | .06em | `#6A675F`, upper case in source |
| Prototype panel title | Crimson | 30 | 1.1 | — | |
| Prototype panel body | Crimson | 16 | 1.45 | — | `#4A463F` |
| Phone top-bar title | Crimson | 18 | — | — | |
| Top-bar glyphs ← ··· × | DM Mono | 16 | — | — | `#6A675F`; desktop panel × is 14 |
| Desktop wordmark "Snowmoon" | Crimson | 22 | — | — | |
| Desktop rail items | Crimson | 18 | — | — | padding 8px 20px |
| Desktop head titles ("My picks", "Reports", style name) | Crimson | 22 | — | — | right panel "Add an image" is 20 |
| Reader text (phone) | Crimson | 19 | 1.6 | — | |
| Reader text (desktop) | Crimson | 20 | 1.6 | — | column 560 wide |
| Prototype chapter heading | Crimson | 34 | 1 | — | |
| All labels, captions, buttons | DM Mono | 12 | 1.5 where multi-line | — | |
| Primary buttons GENERATE / PUBLISH | DM Mono | 13 | — | .06em | |
| SEND REPORT, DISMISS/HIDE, PREVIEW AND PUBLISH (forms) | DM Mono | 13 | — | — | |
| Prompt box | Crimson | 17 | 1.4 | — | |
| Passage card text | Crimson italic | 16 | 1.4 | — | 2-line clamp (1b) |
| Rules text | Crimson | 15 | 1.4 | — | |
| Chip text | Crimson | 16 | — | — | key DM Mono 12 `#6A675F`; × DM Mono 14 |
| Sheet title (Report, consent) | Crimson | 26 | 1.1 | — | |
| Report reason rows | Crimson | 17 (B) / 16 (P) | — | — | |
| Style page name | Crimson | 30 | 1.05 | — | |
| "Sheet by @ilse" | Crimson | 22 (B) / 30 (P) | — | — | |
| Form name field | Crimson | 20 | — | — | |
| Form text boxes | Crimson | 16 | 1.4–1.45 | — | |
| Covered label | DM Mono | 12 | — | .04em | `#E7E4DD` |
| Covered sentence | Crimson | 16 | 1.35 | — | `#E7E4DD` |
| Image overlay label | DM Mono | 12 | — | — | `#3E4538` |
| Menu items (P) | Crimson | 20 | — | — | rows 48 tall |
| Queue empty (P) | Crimson | 18 | — | — | `#4A463F` |
| Moderator note | Crimson | 15 (phone) / 16 (desktop) | 1.4 | — | |

No `font-weight` is set anywhere, so everything is 400. Upper case is typed into the source, not done with `text-transform`.

### 5.2 Colours (light; the only theme in these files)

| Hex | Role in Design | App token (`src/styles/tokens.css`) |
|---|---|---|
| `#E9E6DF` | board/page canvas behind frames | none (outside the app) |
| `#F4F2ED` | paper, phone and desktop background, sheet fill, button text on ink | `--paper` |
| `#1D1D1B` | ink, text, primary buttons, active underline, chip borders, covered tile | `--ink`, `--btn` |
| `#4A463F` | secondary running text | `--body` |
| `#6A675F` | labels, grey text, dashed private outline | `--muted` |
| `#ABA79D` | dashed private rules, empty slots, disabled button fill, "PLACES · COMING" text | `--faint` ("decoration only… never for text") |
| `#DAD6CC` | rules, outlined secondary buttons | `--rule` |
| `#CFCAC0` | device frame ring | none |
| `#E6E2D9` | active rail item, selected list row, fork band, shaded edits | `--soft` |
| `#FBFAF6` | passage cards, text boxes, selection card | `--card` |
| `#ECE9E2` | desktop rail | `--chrome` |
| `#2E5A3A` | links, selection rule, newer-version box | `--veridia` = `--link` |
| `#8A2F2F` | REPORT text, moderator strip and node, HIDE button, auto-hidden text | `--warn` |
| `#B3306E` | **sample marker** (dotted underline) | `--dzego` (the Dzego setting colour) |
| `#E7E4DD` | text and border on the covered ink tile | equals dark `--ink` |
| `#3E4538` | label on hatched images | none |
| hatch green `#C9CFBE`/`#C1C8B5`, beige `#D3D0C4`/`#CBC8BB`, blue-grey `#C4CCC8`/`#BCC4C0` | sample images | none |
| `rgba(29,29,27,.45)` | scrim | `--scrim` (light) |
| `rgba(244,242,237,.85)` | "GENERATING…" veil (P) | none |
| `rgba(29,29,27,.16)` / `.18` | frame shadow, board / prototype | none |

### 5.3 Frames, bars and spacing

| Item | Value |
|---|---|
| Board page | padding 48, sections gap 56, frames gap 32 (flex-wrap), frame-tag gap 8 |
| Phone frame | 390 × 695, radius 18, shadow `0 0 0 1px #CFCAC0, 0 20px 50px rgba(29,29,27,.16)` (P: `0 24px 60px …,.18`) |
| Desktop frame | 1280 × 800, radius 8, same shadow |
| Frame tag chip | `#1D1D1B` fill, `#F4F2ED` text, padding 3px 7px, radius 3 |
| Flow panel | `#F4F2ED`, border `#DAD6CC`, radius 6, padding 28, 5-col grid, gap 18px 26px, max-width 1500, 16/1.35; nodes padding 10, radius 3 |
| Phone top bar | 44 tall, padding 0 16; P back/menu buttons 52 × 44 |
| Desktop head strip | 52 tall, padding 0 24 (0 18/20 in side panels) |
| Desktop rail | 220 wide, head 52 with padding 0 20, list padding 10px 0, item padding 8px 20px |
| Desktop compose grid | 220 / 1fr / 440; reader column 560, padding 30px 0, gap 16 |
| Desktop image page | 220 / 1fr; body padding 28px 40px; 1.4fr / 1fr, gap 36 |
| Desktop feed | 220 / 1fr; body padding 24; 3 cols, gap 20 |
| Desktop styles | 220 / 340 / 1fr; detail padding 20px 24px, gap 14; text/versions 1.3fr / 1fr gap 28 |
| Desktop picks | 220 / 1fr; body padding 24; 360 / 1fr gap 32 |
| Desktop queue | 360 / 1fr; detail padding 24; 1.2fr / 1fr gap 28 |
| Phone body padding | 14px 18px 0 (1b, 1d, 5a, 5b, 6); 16px 18px 0 (1c, 4a, 4b, 4c); 12px 16px (feed); 12px 18px 0 (queue); 0 18px (2b) |
| Phone body gaps | 10 to 14 |
| Action bar | padding 10px 18px 14px, border-top 1px `#DAD6CC`; two-button grid gap 8 |
| Privacy strip | padding 9px 16px, 1px dashed `#ABA79D` bottom |
| Moderator strip | padding 9px 16px, 1px solid `#8A2F2F` bottom, red text |
| Fork band | padding 10px 16px, `#E6E2D9`, 1px solid ink bottom |
| Prototype panel | 300 wide, gap 14; page padding 32px 24px, gap 40 |

### 5.4 Buttons

| Button | Height | Fill / border | Text | Radius |
|---|---|---|---|---|
| Primary (GENERATE, PUBLISH) | 48 | `#1D1D1B` | `#F4F2ED`, mono 13, .06em | 3 |
| Primary (PREVIEW →, USE AS MY STYLE, AGREE AND GENERATE, SWITCH…) | 48 | `#1D1D1B` | mono 12 | 3 |
| Desktop compose buttons | 46 | outlined ink / filled | mono 12 | 3 |
| Desktop style head buttons | 40, padding 0 14 | filled / outlined ink | mono 12 | 3 |
| Secondary (AGAIN, KEEP V3, DISMISS, NOT NOW) | 48 | 1px `#DAD6CC` | ink, mono 12–13 | 3 |
| BACK TO DRAFT | 44 | 1px `#DAD6CC` | mono 12 | 3 |
| FORK | 48 | 1px `#1D1D1B` | mono 12 | 3 |
| Moderator HIDE | 48 | `#8A2F2F` | `#F4F2ED`, mono 13 | 3 |
| Disabled (P: 0 LEFT, SEND REPORT unpicked) | 48 | `#ABA79D` | `#F4F2ED` | 3 |
| Image page actions (phone) | 44, 4 equal cols, gap 6 | like 1px ink; others 1px `#DAD6CC` | mono 12; REPORT `#8A2F2F` | 3 |
| Image page actions (desktop) | 44, padding 0 14, gap 8 | as phone | | 3 |
| SHOW IT ANYWAY | 44 (phone) / 40 (desktop), padding 0 14 / 0 12 | 1px `#E7E4DD` on ink | `#E7E4DD` | 3 |
| Sort and tab buttons (P) | min-height 36 (reader) / 44 (feed, library) | none; active 1px ink bottom | active ink, inactive `#6A675F` | 0 |
| Text links (EDIT PROMPT, + ADD YOURS, CHANGE, CLEAR) (P) | min-height 44 / 32 | none | `#2E5A3A`, mono 12 | 0 |
| Like pressed (P) | 44 | `#1D1D1B` fill | `#F4F2ED`, glyph ♥ | 3 |

### 5.5 Chips (1b, desktop compose)

| Part | Value |
|---|---|
| Chip | `display:flex; gap:8px`, height 40 (B) / 44 (P), border 1px solid `#1D1D1B`, radius 3, padding 0 4px 0 10px (phone B) / 0 10px (desktop) / padding-left 10 (P), Crimson 16 |
| Key | DM Mono 12 `#6A675F`: STYLE, CHARACTER (phone), CHAR (desktop) |
| Value | dotted magenta (sample) |
| × | DM Mono 14 `#6A675F`, padding 0 8 (B); P button 36 × 42 |
| + ADD | height 40/44, 1px **dashed** `#6A675F`, padding 0 12 (phone) / 0 10 (desktop), mono 12 |
| Wrap | flex-wrap, gap 6 |

### 5.6 Draft frame, images and thumbnails

| Item | Size | Ratio (width ÷ height) | Notes |
|---|---|---|---|
| 1c draft (B) | 354 × 200 | 1.77 (≈16:9) | `outline:1px dashed #6A675F; outline-offset:3px` |
| 1c draft (P) | 354 × 210 | 1.69 | same outline; veil while generating |
| Desktop draft | 400 × 180 | 2.22 | dashed outline + top-left badge (paper fill, padding 2px 6px) |
| Tries thumbnails | 72 × 44 (B), 64 × 44 (P) | 1.64 / 1.45 | gap 8; current `outline:2px solid #1D1D1B`; P wraps |
| 1d preview | 354 × 180 (B), 354 × 190 (P) | 1.97 / 1.86 | no outline |
| 2a strip card | 280 × 160 (B), 260 × 150 (P) | 1.75 / 1.73 | strip gap 8 (B) / 10 (P); next card peeks 80 wide (B) |
| 2b phone | 390 × 210 | 1.86 | full bleed |
| 2b desktop | ≈551 × 420 | 1.31 | |
| Feed phone | 358 × 170 (third: 120) | 2.1 | |
| Feed desktop | ≈324 × 190 | 1.71 | |
| 4a samples | ≈175 × 92, 2 × 2, gap 4 | 1.9 | P: 3 in a row, ≈115 × 90 |
| 4b/4c slots | ≈85 × 64, 4 cols, gap 4 | 1.34 | P: 3 cols, 80 tall |
| 4-desktop samples | ≈162 × 150, 4 cols, gap 8 | 1.08 | |
| Library thumbnails | 64 × 48 | 1.33 | |
| 5a views | ≈115 × 150, 3 cols, gap 4 | 0.77 (portrait) | |
| 5b view slots | ≈115 × 84 | 1.37 | dashed |
| Picks thumbnails | 56 × 44 | 1.27 | empty = 1px dashed `#ABA79D` |
| 6-desktop compare | ≈302 × 200 | 1.51 | P: ≈173 × 130 |
| 7 phone | 354 × 170 | 2.08 | |
| 7 desktop | ≈460 × 340 | 1.35 | list thumbnails 72 × 48 |

Hatching: `repeating-linear-gradient(135deg, A 0 Npx, B Npx 2Npx)` with N = 6 (thumbnails), 8 (style and sheet samples), 10 (most images) or 12 (large desktop images). The app's images are fixed at **1024 × 576 (16:9, 1.778)** and drawn `width:100%; height:auto`. Only 1c (board) matches that ratio. Every other frame would crop or letterbox a real image unless it follows the image's own ratio.

### 5.7 Sheets, fields, toast

| Item | Value |
|---|---|
| Scrim | `rgba(29,29,27,.45)`, board inset 0; P inset `44px 0 0` (top bar stays visible), z 5 |
| Sheet | `#F4F2ED`, radius 16px 16px 0 0; padding 20 20 18 (report), 22 20 18 (consent), 16 20 22 (menu); gap 10 (B report) / 8 (P report) / 12 (consent); z 6 |
| Radio row | height 44 (min-height in P), top rule `#DAD6CC`, gap 10; circle 16 × 16, ring 1.5px ink; selected 5px ink ring |
| Report note | B: 56 tall box; P: textarea 2 rows; 1px dashed `#ABA79D`, radius 3, padding 8px 10px, mono 12, `#6A675F` |
| Prompt box | 1px ink, radius 3, `#FBFAF6`, padding 10px 12px; min-height 64 (1b), 110 (desktop); P rows 4, resize none |
| Style/sheet text box | same border; min-height 92 (4b), 110 (4c), 96 (5b) |
| Name field | 1px ink bottom only, padding 6px 0, Crimson 20 |
| Passage card | 1px `#DAD6CC`, radius 3, `#FBFAF6`, padding 10px 12px, gap 6 |
| Book card (5a) | 1px `#DAD6CC`, `#FBFAF6`, padding 10px 12px, gap 6 |
| Newer-version box | 1px `#2E5A3A`, radius 3, padding 8px 10px (P min-height 44) |
| Toast (P) | absolute, left/right 18, bottom 84, z 9, `#1D1D1B`, `#F4F2ED` text, padding 10px 12px, radius 3, mono 12, lh 1.5, `role=status` |
| Selection card (1a) | 1px ink, radius 3, `#FBFAF6`, mono 12; header padding 8px 12px with `#DAD6CC` bottom rule; 3 equal cells, padding 13px 10px (P min-height 44) |
| Readers' images bar | margin 0 22px, height 44, rules `#DAD6CC` top and bottom (closed) or 1px ink top (open) |
| Selected block | 3px `#2E5A3A` left border, padding-left 11 (unselected 14) |
| READ / LISTEN switch | 1px `#DAD6CC`, radius 3, cells padding 5px 10px |

### 5.8 Comparison with the app's frame (`shell.css`, `tokens.css`)

These match the Design: the 44px phone bar, 52px desktop head, 18px titles, 18px rail items with 8px 20px padding, `--chrome` rail, `--soft` active row, 3px radius, 12px label floor, Crimson + DM Mono, and the scrim.

| Differences | Design | App |
|---|---|---|
| Rail width | 220 | `--rail-w: 248px` |
| Right panel width | 440 | `--panel-w: 400px` |
| Sheet top radius | 16 | `--radius-sheet: 14px` (shell.css hard-codes 16) |

### 5.9 Dark theme

Neither file defines dark values. The board says "Dark uses the same tokens as the prototype".

The app's dark tokens would apply: paper `#161614`, ink `#E7E4DD`, body `#B9B5AB`, muted `#9C988E`, faint `#5E5B55`, rule `#33322E`, soft `#24231F`, card `#1E1D1A`, chrome `#1B1B19`, warn `#D99A8C`, veridia `#8DB58A`, dzego `#F08DB8`, scrim `rgba(0,0,0,.6)`.

Open dark questions:

- The covered feed tile is hard-coded ink `#1D1D1B` with `#E7E4DD` text. In dark mode, inverting it to `--ink` would give a *light* tile on a dark page. It needs its own token.
- The hatch palettes and the `#3E4538` label have no dark values. They are samples only, though.

---

## 6. Data each screen needs, and which values are samples

Dotted magenta marks the samples. ‹model› and ‹host› are placeholders the app already knows: Z-Image Turbo, fal.ai, and Groq for the prompt check.

### 6.1 Per screen

| Screen | Fields the app must supply | Sample values shown |
|---|---|---|
| 1a | chapter number and count ("CH 1 / 32"), selected block range and its ¶ labels ("¶ 2–3"), block count, whether the person may add an image | — |
| 1b | passage ¶ labels and text (not sent), prompt and length (max 600), **picks resolved for this passage**: style pick (name, maker, version) and a character pick for each character in the passage, generations left today, rules text, model and host names | 142, the prompt, "Kalimar paper · @tovah v3", "@ilse v2", 7 |
| Consent | consent wording version and hash, agreed-or-not for this FID | — |
| 1c | draft image bytes, the draft's signed record (ticket), list of tries this session, generations left | 6 |
| 1d | passage label, byline handle and **display name** ("@nate · Nate"), final prompt (the person's words + added style text + sheet text), `uses` list (design version ids with names, makers, versions), publishes left (not shown) | @NATE, prompt, "Kalimar paper v3 · @tovah", "@ilse v2", "@nate · Nate" |
| Desktop compose | the above, plus "2 OF 8 BLOCKS" (count and max) | 6 |
| 2a | per passage: count of published images, passage ¶ range, list sorted newest or most built on; per image: url, byline, recipe link | 2, 3, @KAZ |
| 2b | image url, byline, date (absolute "OCT 6" on the board, relative "1D AGO" in P), chapter and ¶, like count and liked-by-me, mine-or-not, the person's prompt, the style used (name, version, maker, link), characters used (name, sheet maker, version, link), model, host, seed, cost | @KAZ, OCT 6, 12, prompt, Kalimar paper v3, @ilse v2, 4182 · $0.003 |
| 2b desktop | the above, plus passage text, added style and sheet text, size, steps, checks, request id, licence | a91f…07c2, the passage quote |
| 2c | reasons list, note (private, length unspecified) | — |
| 3 | per image: chapter, ¶, byline, relative time, covered-or-not (from reading progress), built-on count for ordering, chapter filter; "read to ch N" | @RO, 2H, @MIRA, 5H, @TOVAH 6H, @KAZ 1D, @ILSE 1D, @RO 2D |
| 4a / 4-desktop | style name, version n of m, maker, date, remixed-from (name, maker, version, link), 2–4 sample image urls, style text, built-on count (total and per version), versions list with dates, change note ("deeper greens") and per-version counts, my-pick state | all of these |
| 4b / 4c | name, text, 2–4 samples made with this text (each uses a generation), remixed-from (fixed), diff against the source version, generations left | Meldan at dusk, the text, 7, Kalimar paper v3 · @tovah, Kalimar paper, night |
| 4-desktop index | per style: thumbnail, name, maker, current version, built-on count; sort most built on or newest | @tovah · v3 · 14 built on, 9 built on, @ro · v1 · 2 built on |
| 5a | character name, **what the book says up to the reader's progress** (facts with block refs such as "c4-b15"), whether looks are described, sheet maker, version n of m, sheet n of total for this character, front/side/back view urls, sheet text, built-on count, remixed-from, my-pick state | @ilse, 4 sheets, sheet text, 9, @kaz v1 |
| 5b | the same as 4b/4c for a sheet, plus book facts and three views | Zei · @ilse v2, the shaded edit |
| 6 | my style pick and my pick per character (entity, version, maker), newer version available (latest version number, date), for entities with no pick the most-built-on version, thumbnails | everything with handles and versions |
| 6 desktop compare | two versions' samples, text diff, date | @TOVAH, OCT 7, the shaded words |
| 7 | per reported image: url, creator byline, chapter and ¶, date and time, model, seed, check verdicts, exact prompt and added style text, passage text, reasons with counts, notes, auto-hidden flag and reporter count; queue counts (waiting, auto-hidden) | @SAMPLE-USER, OCT 7, 14:02, 771, 2, 1, 3, the notes |

### 6.2 Version and credit formats used (all samples)

The same thing is written five ways. The app should pick one.

| Format | Where |
|---|---|
| "Kalimar paper · @tovah v3" | 1b chip, 6 picks |
| "Kalimar paper v3 · @tovah" | 1d USES, 2b desktop, 4c band |
| "Kalimar paper v3" | 2b phone, desktop compose chip, 6 desktop |
| "@tovah · v3 · 14 built on" | 4-desktop index |
| "V3 OF 3 · BY @TOVAH · OCT 4" | 4a |

Characters follow the same pattern: "Gladias · @ilse v2", "Zei · @ilse v2", "REMIXED FROM @kaz v1", "Zei · @kaz v1" (P).

### 6.3 Prototype seed data (all samples)

**Images**

| id | by | ch | ¶ | prompt | likes | built | ago | style | char | seed |
|---|---|---|---|---|---|---|---|---|---|---|
| i1 | @ro | 1 | ¶ 2–3 | Low angle up the trunks of very tall trees, a narrow path, stone houses glimpsed between them. | 8 | 3 | 2H AGO | s1 | g1 | 1180 |
| i2 | @kaz | 1 | ¶ 2–3 | A man pausing on a forest path, eyes closed, breathing in, morning mist. | 12 | 6 | 1D AGO | s2 | g1 | 4182 |
| i3 | @mira | 9 | ¶ 40 | [covered sample] | 4 | 0 | 5H AGO | s1 | — | 77 |
| i4 | @tovah | 2 | ¶ 30 | Two narrow shopfronts side by side, one full of small sensors in glass cases. | 5 | 1 | 6H AGO | s1 | — | 903 |
| i5 | @ilse | 3 | ¶ 8–9 | A quiet classroom, smoke clearing, two students looking at each other. | 9 | 2 | 1D AGO | s3 | — | 3310 |
| i6 | @ro | 14 | ¶ 12 | [covered sample] | 2 | 0 | 2D AGO | s2 | — | 51 |

**Styles**

| id | name | by | v | built | from | text |
|---|---|---|---|---|---|---|
| s1 | Kalimar paper | @tovah | 4 | 14 | Techno vistas · project starting point | Flat paper-cut layers, muted greens and greys, warmer evening light, no outlines… |
| s2 | Techno vistas | project starting point | 1 | 9 | — | Clean wide vistas, soft haze, small human figures, calm technology in nature… |
| s3 | Meldan at dusk | @ro | 1 | 2 | — | Low sun, long blue shadows, wet stone, warm window light, thin washes… |

**Sheets**

| id | entity | by | v | built | from | text |
|---|---|---|---|---|---|---|
| z1 | Zei | @ilse | 2 | 9 | Zei · @kaz v1 | Seventeen, slight, short dark hair, grey school jacket, glasses on a cable at matches… |
| z2 | Zei | @kaz | 1 | 4 | — | Tall for his age, quick hands, a plain dark jacket… |
| g1 | Gladias | @ilse | 2 | 11 | — | Thirties, calm, plain grey coat, a hand device worn on the wrist… |
| e1 | Emerald | @ro | 1 | 3 | — | Shown only as a soft green glow on a hand device… |

**Other seed values**

- **Picks:** style s1 at v3, Zei z1 at v2, Gladias g1 at v2. Emerald has no pick.
- **Queue:** one item by @sample-user, ch 2 ¶ 30. Reasons: A real person × 2, Misrepresents the author × 1. Note: "Looks like a real person, next to his book."
- **Default prompt:** "Wide shot along a foot path between very tall trees, low stone-brick houses half hidden behind them, morning light, one figure walking away from us." (148 characters).
- **Fixed values:** 7 generations per day, "read to ch 3", cost "$0.003" everywhere.

---

## 7. Design's guesses, verbatim

From board section `guesses`, "DECISIONS I HAD TO GUESS":

1. Picks fill in the chips on the compose screen (1b). Removing a chip changes only that image, never the pick.
2. The public prompt includes the style and sheet text that were added. The recipe page (2b) shows the person's own words and the added text separately.
3. Drafts stay on the device until the app closes; earlier tries show as a strip in the same session. That follows add-an-image.md, decision 13.
4. Readers' images stay behind "n images by readers · show" in the reader, one passage at a time, during the trial (decision 4).
5. The image order in the reader and the feed defaults to newest first. "Most built on" is the other choice. I left out "most liked" so there are only two labels to learn.
6. Style and character lists default to "most built on", because that's the brief's rule for defaults. With no pick, that version is used and labelled as such.
7. "Built on by n images" is shown on style and character pages. These counts come from published work, so they're public. Pick counts never appear anywhere.
8. A fork's "remixed from" is fixed and can't be removed. The page highlights the forker's words against the original.
9. Sample images for a style or a sheet use generations from the same daily count as images.
10. A sheet's "what the book says" panel follows the reader's spoiler limit. The sheet is never covered, because it shows no events.
11. Feed covers show only the chapter number, with "Show it anyway". The feed has no setting to turn covering off.
12. On your own image, REPORT becomes HIDE THIS. REMIX on the image page is a placeholder; remixing images isn't designed.
13. The moderator queue is oldest first. It shows the creator's public name, never reporters, and nothing else about the creator. It lists auto-hidden items separately.
14. Signed-out readers can see images, pages and the feed. Compose, like, report and picks ask them to sign in (not drawn).
15. Navigation gains "Images", "Styles & characters" and "My picks". The prototype's single "Pictures · coming" entry is replaced.
16. Places (location plates) are left as "coming" on the styles index, as you asked about pictures before.

**How each guess stands against the app:**

| Guess | Against the app |
|---|---|
| 1 | Matches favourites.md |
| 2 | Matches the app's recipe (`params.user_prompt` and `params.style` are kept apart, and `prompt` is the exact final string) |
| 3 | **Conflicts:** the app keeps the draft across app closes, in IndexedDB, one per passage (§9) |
| 4 | Matches |
| 5 | **Conflicts** with the app's current order (§9) |
| 6 | Matches favourites.md |
| 7 | Matches favourites.md, which also raised in its open question 2 the nudge such counts give |
| 8 | Matches the schema (`links` is append-only) |
| 9 | New: there is no cap rule for samples yet |
| 10 | New |
| 11 | Matches the app, which has no off switch for covering either |
| 12 | Matches in part: the app shows "Hide this" and also "Unhide" |
| 13 | **Conflicts** in part (§9) |
| 14 | **Conflicts:** compose is also limited to invited FIDs |
| 15 | **Conflicts:** the app's nav already says "Pictures" (Trial), not "coming" |
| 16 | New |

---

## 8. The gap

### 8a. Screens that exist now

#### Compose: 1a, 1b, desktop compose

**Where it opens today**

- The browser's text selection shows a bar with "Share quote", "Add an image" and "Ask about this" (`quote-share.tsx`). "Add an image" shows only if `useCanAddImage()`: signed in, invited FID, `IMAGES.enabled`.
- Also "+ Add an image" on scene labels (`AddImageButton`, the scene's first 8 blocks) and "+ Add an image to this moment" in the player.
- The composer is a bottom sheet over the reader (`.recipe-sheet`, max-width 40rem) at every width.

**What the composer shows today, top to bottom**

1. The eyebrow "Add an image · Trial" and ×.
2. "Chapter n · ¶ a–b · n blocks", the **full passage text** (scrollable, max 9.5em), four range buttons ("+ before", "− first", "− last", "+ after"), and "The book's text is shown to help you write. It is never sent to a model."
3. Then one of these gates:
   - "Sign in to make an image. The trial is open to invited readers." + Sign in
   - "The trial is open to invited readers only, for now."
   - "Making images isn't set up on this deployment yet."
   - "Before your first image: how your prompt is published." + "Read and agree"
4. Then the form:
   - `PublishedTextField` "Describe the image" (600 max) with the consent line under it: "Public, permanent, GPL-3.0, shown with your Farcaster name. You can hide it.";
   - "Your prompt is sent to Groq to be checked and to fal.ai to make the image. It becomes public only if you publish.";
   - a **Style** radio set ("None" / "Techno vistas (the project's starting style)"). When chosen, the full text is shown: "Added to your prompt, and published with it (model-drafted): …";
   - the model line "Z-Image Turbo · open weights, Apache-2.0 · runs on fal.ai";
   - the rules in a dashed box;
   - Generate ("Generate" / "Generate again" / "Making it…") with "n of 10 left today".

**Missing or different from Design**

| Design | App today |
|---|---|
| Long-press a block, tap more blocks; selection card "¶ 2–3 · 2 BLOCKS SELECTED ×"; actions ASK ABOUT THIS / ADD AN IMAGE / COPY LINK | Text selection; actions Share quote / Add an image / Ask about this; **no "COPY LINK"** |
| Passage card 2-line clamp, "NOT SENT TO THE MODEL", "− ¶ / + ¶" | Full text, four explicit range buttons. Design's two buttons don't say which end they change |
| Chips "FROM YOUR PICKS · CHANGE FOR THIS IMAGE ONLY", style + character, × per chip, "+ ADD" | A style radio with one option. **No characters, no picks, no chips** |
| Line "● Public under your name if you publish, with the added style and character text. GPL-3.0. Sent to ‹host› to make it." | The consent line (fixed by `PUBLICATION_LINE`) plus a second line naming **Groq and fal.ai** |
| Rules "No words in the picture." + "FULL POLICY →" | "Don't ask for words in the picture." with **no policy link** (the proposal says it links to the full policy) |
| GENERATE · n LEFT TODAY as one button; under it "‹model› · open weights · AI-generated" | Generate button + "n of 10 left today"; the model line sits above the rules |
| No "Trial" label | "Add an image · Trial" |
| A gate for each refusal is **not drawn** | Signed-out, not-invited, not-set-up and consent gates; error notes from the server (below) |
| Desktop: right column 440, reader stays in view, draft inline, two buttons | The same bottom sheet at all widths; no side-panel composer |

**Errors the app has that Design never draws**

These come from `generate/route.ts`. Design has only "No generations left today…" and "Describe the image first.".

- "You've made 10 today. More tomorrow (00:00 UTC)."
- "Image making has reached today's spending limit for everyone. It comes back at 00:00 UTC."
- "The trial has used its test budget for now."
- "No real people: the prompt names someone on the blocked list."
- "This prompt asks for something the rules don't allow."
- "The prompt check did not answer. Try again in a moment."
- "The image model did not answer. Try again in a moment."
- "The image was flagged by the safety checker and dropped."
- "Agree to how your words are published first"
- "No connection. Try again."

#### Consent

**App:** consent is a gate inside the composer: "Read and agree" opens `ConsentScreen`. It shows the title "Your words will be public", the line, six paragraphs (own-words-v2), "Your words will be shown with your Farcaster name.", the buttons "I agree" / "Not now", and "Wording own-words-v2". It is recorded with the wording's sha256.

**Gap:**

- Design's sheet ("How images work here", three short paragraphs, "AGREE AND GENERATE") is new wording. Shipping it means a new consent version (§9).
- Design starts the generation straight after agreeing. The app returns to the form, and the person presses Generate.

#### Draft: 1c

**App:**

- Under the form, in the same sheet: "Draft · only you can see this · AI-generated image" and the image (1024 × 576).
- The draft and its signed ticket are saved in **IndexedDB** per passage key `c{ch}-b{start}-b{end}`. They come back when the sheet reopens on that passage, until the ticket expires after 24 h.
- "Generate again" **replaces** the draft.

**Gap:**

- No privacy strip, no dashed frame, no "KEPT ON THIS DEVICE".
- **No tries strip**: there is only one draft.
- No "AGAIN · n LEFT" next to "PREVIEW →".
- No "EDIT PROMPT": the prompt stays editable above.
- No "GENERATING…" veil: the button says "Making it…".
- Design says drafts last "until you close the app". The app keeps the latest across closes (§9).
- Keeping several tries would mean several tickets and images in IndexedDB.

#### Preview and publish: 1d

**App:**

- `PublishFlow`: "Preview" → the section "Preview: this is how it will appear, to anyone" with:
  - the image;
  - the caption "Chapter n · ¶ a–b · AI-generated image · by @name|FID n · not by the author";
  - the full prompt with the style text appended (pre-wrap);
  - the publication line + "Shown as @name.";
  - "Publish" / "Edit".
- After publishing: "Published. See it" (a link).

**Gap:**

- No "AS READERS WILL SEE IT, UNDER CH 1 ¶ 2–3" header.
- No USES list.
- No "UNDER @nate · Nate". The app records only `by_name` (the username), so there is **no display name**.
- No "BACK TO DRAFT" (the app's button is "Edit").
- After publishing, Design returns to the reader with the strip open and a toast. The app shows a link.
- The publish cap (3 a day) and its message "You can publish 3 images a day. More tomorrow (00:00 UTC)." are not in Design.
- Other app messages Design lacks: "This draft has expired or was not made here. Generate it again." and "This image is already published".

#### Image page: 2b and desktop

**App** (`/image/[id]`):

- The label "Pictures · Trial" and the image.
- The caption: "Chapter n · ¶ a–b" (linked to the reader) "· AI-generated image · by … · not by the author · YYYY-MM-DD".
- `ImageActions`: "♡ Like · n" (disabled when signed out), "Cast this", "Share card" (opens `/api/image-card/id`), "Hide this"/"Unhide" (own image) or "Report" (others, signed in), and "Sign in to like or report" when signed out.
- "How this was made", with the rows:
  - "The prompt, as the person wrote it";
  - "Style added (text drafted by the coding agent, a closed model)";
  - "The exact prompt sent to the model";
  - Model (name, id, licence, host, endpoint);
  - Settings (every key, plus seed);
  - Checks ("checked by gpt-oss-safeguard-20b … and the image by the host's safety checker");
  - Request;
  - Cost (`$0.0030`, 4 decimals);
  - Published ("By @name (FID n), date, for Chapter n, ¶. Licence GPL-3.0.");
  - File (sha256).

**Gap:**

- **Layout:** no top-bar title "Image", no 4-button grid, no two-column desktop layout, no passage quote on desktop, no "OPEN IN READER →" link text (the caption itself links).
- **Actions:** no REMIX placeholder. Design's single SHARE stands for the app's "Cast this" + "Share card".
- **Recipe:** no STYLE / CHARACTERS rows linking to design pages (there are no design pages). Design shows "SIZE · STEPS" but not the endpoint or sha256. The app shows all settings, the endpoint and sha256.
- **Cost:** Design writes "$0.003" (3 decimals), the app 4.
- **Date:** Design shows "OCT 6" or relative "1D AGO"; the app shows `YYYY-MM-DD`.
- **After hiding:** the app's page 404s on reload, because `imageByVersion` reads published only. "Unhide" is therefore reachable only in the same visit. Design's toast "Unhide from your profile" points to a profile page that exists in neither.

#### Reader "images by readers": 2a

**App** (`reader-images.tsx`):

- For each passage end-block, a toggle "n images by readers · show/hide" (lower case, link colour), placed after the block and after any seeded image.
- When open: a **vertical** list of full-width images, each captioned "AI-generated image · by @name|FID n · not by the author · n likes · recipe".
- Order: **most liked, then newest**, named only in the aria-label ("Images by readers, most liked first, then newest").

**Gap:**

- No horizontal strip, no "¶ 4–6" in the bar, no visible sort, no "NEWEST FIRST / MOST BUILT ON" choice, no "+ ADD YOURS" (adding is from selection or scene labels), no "SWIPE FOR MORE".
- Design drops the like count from captions.
- **"Most built on" for images has no data today:** nothing links to an image yet (`remixed_from` to images is accepted at publish, but no screen creates it), so every image would score 0.

#### Feed: 3

**App** (`/images`):

- The heading **"Pictures"** with the label "Trial", and the intro "Images readers made for passages of the book, with an image model. Each one is AI-generated, not by the author, and shows the exact prompt that made it."
- Sort links "Newest first" / **"Most liked"**.
- A vertical list, 60 items at most. Each has a caption: "Chapter n · ¶ · AI-generated image · by … · not by the author · n likes · recipe".
- Covering uses the furthest chapter **opened on this device** (`openedChapters()`): a hatched dashed tile, "From chapter 9, past where you've read." and "Show it anyway".
- Empty: "Nothing is published here yet."

**Gap:**

- The name differs: Design says "Images", the app "Pictures".
- Sort: "MOST BUILT ON" vs the app's "Most liked".
- No chapter filter ("ALL CHAPTERS ▾").
- No "READ TO CH 3" / "SPOILERS COVERED AFTER CH 3" indicator.
- No relative times.
- Cover style: ink tile vs hatched tile.
- Cover wording: "COVERED · CHAPTER 9 / You've read to chapter 3. This image is from later in the book." vs "From chapter 9, past where you've read."
- No 3-column desktop grid.
- Design has no empty state.

#### Report: 2c

**App:**

- An inline fieldset on the image page: "Why are you reporting this image?".
- **9** radio reasons:
  1. "Anything sexual involving a minor"
  2. "Sexual content"
  3. "A real person"
  4. "Violence or gore"
  5. "Hateful"
  6. "Someone else's character, logo or artwork"
  7. "Misrepresents the book or the author"
  8. "Spam or nonsense"
  9. "Other"
- `PrivateNoteField` "A note for the moderators (optional)", 280 max, with "Private: only moderators read it, without your name. Never published."
- "Send report" / "Cancel".
- Results:
  - "Reported. It is hidden until a moderator looks." (auto-hide);
  - "Reported. A moderator will look. Thank you.".
- Limits: 1 report per person per image, 20 a day ("You can report 20 images a day").
- Auto-hide: one `minor` report, or 3 distinct reporters.

**Gap:**

- Design uses a bottom sheet with **7** reasons: it merges sexual with minor, and spam with other.
- Design has no Cancel, though the scrim closes the sheet.
- Design's line is "Moderators see your reason and note, never your name." The app's is the fixed private line.
- No note length, no daily limit, no "already reported" state.
- The three-reporter auto-hide is not shown to the reporter.

#### Moderator queue: 7

**App** (`/moderate`, title "Reports"):

- The intro "Reported images, with each reason, its count and the reporters' notes. Who reported is never shown. Moderators can hide an image or dismiss its reports; nothing else."
- Then a vertical list. Each item has:
  - the label "Chapter n · blocks a–b · by **FID n** · YYYY-MM-DD · model · status" (+ " · hidden by a stated rule");
  - the image;
  - the exact prompt;
  - reasons with counts;
  - notes in italics;
  - "Hide" (only if still published) and "Dismiss the reports".
- Empty: "No reports waiting."
- `StorageCheck` below.
- Not in the navigation.

**Gap:**

- **Byline:** "by FID n" vs Design's "@name".
- **Passage:** the app uses block indices ("blocks a–b"), not "¶" labels, and shows **no passage text**. Design shows the passage.
- **Missing details:** seed, time of day, checks line, "+ STYLE TEXT: name vN".
- **Navigation:** no "1 OF 3" paging and no split list/detail on desktop.
- **Counts:** no "3 WAITING · 1 AUTO-HIDDEN".
- **Order label:** no "OLDEST FIRST", though the query is oldest first.
- **Role strip:** no red "MODERATORS ONLY" strip.
- **Explanation:** the app's intro covers it in different words.
- **Rule-hidden items:** Design lists them separately. The app mixes them into one list and offers only Dismiss on them.

#### Navigation

**App:** Read, Listen, Assistant, (Adaptations, hidden), Minpentai, Podcast, **Pictures** (meta "Trial") → `/images`, About.

**Design:** "Images", "Styles & characters", "My picks", plus "Moderator queue" (P menu). Its desktop rails also differ from board to board:

| Board | Rail entries |
|---|---|
| 1-desktop | Read, Listen, Images, Styles & characters, My picks, Adaptations, Minpentai |
| 2- and 3-desktop | the same, without Minpentai |
| 4- and 6-desktop | Read, Images, Styles & characters, My picks |

None of the rails has Assistant, Podcast or About.

### 8b. Screens for things not built

The schema lives in `0001_core.sql` and `0002_v5.sql`; element bodies in `src/lib/element-body.ts`.

| Feature (Design screen) | Tables that could hold it | What is missing |
|---|---|---|
| **Style guides** (4a, 4-desktop) | A style = `studio.elements` with `element_type='design'` and `entity_id` → `studio.entities` (`kind='style'`); each version an `element_versions` row (`version_no`, `body`, `recipe_id`, `asset_url`); the maker is `elements.created_by_fid`; dates are `element_versions.created_at`; "built on by n" = count of `links` with `kind='uses'` and `to_version_id` = a version (index on `(to_version_id, kind)` exists), summed across the element's versions for the total | **Name:** `DesignBody` is only `{ description }`; there is no name or title column on `elements`, and `entities.name` is unique per `(work_id, kind, name)`. **One style slot per person:** if each style is its own entity, `picks` (one row per `(fid, entity_id)`) allows many style picks; if all styles share one `style` entity, the name must live in the version body. **Samples:** a version has one `asset_url`, so 2–4 samples need `body` fields or linked image elements. **Change note** ("deeper greens"): no field. **No routes or pages** for designs. **Today's style** is a file, `content/snowmoon/designs/styles/techno-vistas.json`, whose text changes with the passage's setting (`styleText(id, setting)`); Design's style text is one fixed string. **Publish rule:** `uses` may point only at published `design` versions, so a style must be published as a design element first |
| **Create a style** (4b) | the same; a `recipes` row for each sample (in_app, the model, prompt = style text plus what?) | A generate route for samples (and how a sample's prompt is built), sample storage, counting samples in `image_asks` (Design guess 9), consent (the style text is the person's own words), a check for "No living artists' names" (the prompt check covers only image prompts) |
| **Forking / "remixed from"** (4c, 5b) | `studio.links` `kind='remixed_from'` from the new design version to the source version; append-only (trigger `links_append_only`), so "fixed for good" is already true | The publish route accepts `remixed_from` only to **images** (`type.get(u) !== 'image'` → refused); design-to-design forks need their own route. No diff storage: the diff can be computed from the two `body.description` texts. Board 4a shows "REMIXED FROM Techno vistas · project starting point", so the project's style must exist as a published design element (by FID 6786 or a project FID) to be linked |
| **Remixing an image** (2b REMIX placeholder, "coming") | `links` `remixed_from` image → image (the publish route already accepts it) | No screen, no image-to-image model (Z-Image takes no reference; Part B names FLUX.2 [klein] 4B edit) |
| **Character sheets** (5a, 5b) | `elements` (design) on `entities` (`kind='character'`, e.g. Zei); many sheets per character = many design elements on the same entity; versions as above; "what the book says" = `studio.entity_mentions` (`chapter`, `idx`, `fact`, `quote`), filtered by the reader's chapter; also `content/snowmoon/designs/characters/*.json` (`facts`, `about`) | Front/side/back **views** (3 images) have no place: one `asset_url` per version. "1 OF 4 SHEETS" needs a per-entity list query. Sheet text sent to the model **"when Zei is in a prompt"**: there is no detection; the passage's characters could come from `entity_mentions` by `(chapter, idx)`. Whether sheets go to the model as **text only** (Z-Image) or as **reference images** (FLUX.2 klein edit, up to 4) is undecided. The reader's spoiler limit is device-based today (`openedChapters()`), so a server-rendered sheet page can't filter by it |
| **"Use as my …"** (4a, 5a buttons) | `studio.picks (fid, entity_id, version_id, picked_at)`, PK `(fid, entity_id)`; trigger `picks_valid` requires a design version of that entity; private (no public policy, select revoked from anon/authenticated; P6b checks it) | Routes to set and clear a pick (signed in, own FID only), and the page state "MY STYLE · CHANGE". The one-style-slot question (above) |
| **My picks** (6, 6-desktop) | `picks` joined to `element_versions` and `elements`; "newer version" = max `version_no` of the same element > the picked one | A page, a compare view, "SWITCH MY PICK TO V4" (update `picks.version_id`; picks is not append-only, so update is allowed), fallback "most built on" per entity (count of `uses` links), thumbnails |
| **Picks pre-fill the chips** (1b) | `picks` for the signed-in FID; on publish, each chip used becomes a `links` `uses` row (the route accepts up to 8, published designs only) | The composer reads no picks today. The ticket would need the design version ids and texts, so the signed record covers them. `finalPrompt()` takes one style string, so sheet texts would need adding (and a length cap). The recipe's `assist` handling for human-written style text vs model-drafted |
| **Locations / places** ("coming") | `entities` `kind='location'`, `sections.location_entity_id` | Everything (Design leaves it "coming") |
| **Ratings** ("coming") | `studio.ratings` (−5..5), `rating_totals` view | Everything |

---

## 9. Conflicts with the app's rules

Each item lists the app rule (with its source) and the Design screen that goes against it.

### Bylines

1. **The byline is "@name" or "FID n".**
   - The app: `byline()` gives `@name` if Farcaster gave one at publish, else `FID n`. The image page's "Published" row reads "@name (FID n)". The moderator queue shows "by FID n".
   - Design always shows a handle (@KAZ, @SAMPLE-USER), adds a display name ("UNDER @nate · Nate"), and never shows an FID fallback.
   - The app stores no display name.
2. **The moderator queue shows only FIDs; Design shows "@SAMPLE-USER".** Design's guess 13 says "creator's public name". The proposal also says the public name. That conflicts with the app as built, not with the proposal.

### Who can generate, and caps

3. **Invited only.**
   - The owner's decision (2026-10-08): "Add an image" (selection action, scene links, player link) shows **only to a signed-in invited FID**, and everyone sees the feed and images.
   - Design shows "ADD AN IMAGE" in every selection, "+ ADD YOURS" under every strip, "+ NEW STYLE" / "+ NEW SHEET" and FORK to everyone. Guess 14 limits only signed-out readers.
   - No not-invited state is drawn.
4. **"Trial" label.** The app labels the composer and the Pictures page "Trial" (`IMAGES.label`). Design never shows "Trial", though 2a's caption says "during the trial".
5. **Caps.**
   - The app allows 10 generations a day (blocked attempts count) and **3 publishes** a day, with a $2 daily spend cap for everyone and a $1 trial cap.
   - Design's sample "7 LEFT" is fine as a sample. But the publish cap and the spend and trial caps have no screen or message. Design's limit toast ("They come back at 00:00 UTC.") differs from the app's "You've made 10 today. More tomorrow (00:00 UTC)."
   - Samples for styles and sheets drawing on the same count (guess 9) are a new spend path with no cap rule.

### Consent and the publication line

6. **Consent before the first Generate, with hashed wording.**
   - The timing matches: the sheet appears on the first Generate.
   - But the app's consent text is `own-words-v2`, recorded by sha256. Design's sheet ("How images work here", three new paragraphs, "AGREE AND GENERATE") would need a new version (`own-words-v3`) and a re-agreement by anyone who agreed to v2.
   - Its first paragraph names only one ‹host›. Under owner decision 2 and the built consent, **Groq** (the prompt check) **and fal.ai** must both be named.
7. **The publication line under every published text box.** P1f requires `PublishedTextField`, which always prints `PUBLICATION_LINE` ("Public, permanent, GPL-3.0, shown with your Farcaster name. You can hide it."). Design replaces it with its own lines:
   - 1b: "● Public under your name if you publish, with the added style and character text. GPL-3.0. Sent to ‹host› to make it.";
   - 4b, 4c, 5b: "● Public under your name when you publish the style." and "● Public under your name when you publish it.".
   
   These drop "permanent" and "Farcaster name", and the 1b line drops Groq. The style and sheet name and text boxes are also published text boxes, so they would need `PublishedTextField` and consent.

### Drafts

8. **Drafts are device-only and kept in IndexedDB.**
   - Decision 13 as built keeps the draft **across** app closes, one per passage, for up to 24 h (ticket expiry).
   - Design says "Every try stays here until you close the app" and "KEPT ON THIS DEVICE", and guess 3 claims to follow decision 13. Its claim about closing the app is wrong for the app.
   - Several tries would also mean several drafts and tickets.

### Style text shown in full

9. **Decision 7:** the style text is shown in full on compose, because it becomes part of the public prompt.
   - Design's 1b shows only chip names.
   - 1d shows "+ style text from Kalimar paper v3 + Gladias sheet v2 text", not the text itself.
   - Only 2b desktop shows the added text, and only with "FULL TEXT →".
   - The person would publish words they never saw on the compose or preview screen.
10. **Model-drafted style text must say so.** The app's recipe says "Style added (text drafted by the coding agent, a closed model)", and `assist` records it.
    - Design names the starting style "Techno vistas · project starting point" and never says it was model-drafted.
    - Principle 2 and P3 call for the declaration wherever that text is shown.

### "AI-generated" and "not by the author"

11. **Everywhere an image shows.** P2b checks the files that show readers' images for "AI-generated" and "not by the author". Places where Design omits one or both:
    - the 2a strip cards in the prototype (`proto-08d`) keep both phrases but drop "RECIPE →", so the recipe is one tap further away;
    - the 4-desktop index thumbnails, the prototype library thumbnails, the My picks thumbnails (56 × 44), and the moderator desktop list thumbnails carry **no label at all**;
    - the phone moderator image says "AI-GENERATED" without "NOT BY THE AUTHOR";
    - the third phone feed item has no caption (cropped);
    - the draft tries strip relies on the caption above it.
    
    The app's own captions say "AI-generated image". Design often shortens to "AI-GENERATED". That passes the check's regex (`/\bAI[- ]generated\b/i`) but not the proposal's caption wording "AI-generated image · by @name · not by the author".

### Picks, order and marks

12. **Picks are private and never counted.** Design matches: "No one sees how many people picked anything."
    - But the **"built on by n"** counts sit next to the "USE AS MY …" button, and library lists sort by them.
    - favourites.md open question 2 warns that this "nudges everyone toward the same version". It is an owner decision Design took on its own (guess 7).
13. **The word "pinned" fails check P5a.** `MARK` in `check-principles.ts` includes `pinned`, and only canon, official and featured can be cleared by a denial. These Design strings would fail:
    - the prototype toast "Pinned v‹n› as your style. Only you see this.";
    - the 4a caption ""Use as my style" pins this version…" and the 6 caption "Picks are pinned to a version." ("pins" is not matched by `\bpinned\b`; "pinned" is).
    
    Design's "Nothing is official, featured or canon." and "Nothing here is official." pass as denials.
14. **Nothing official or featured.**
    - "project starting point" as the maker of "Techno vistas" is the only design with no person's handle. Listed among readers' styles with 9 built on, it can read as the house style. The app calls it "the project's starting style".
    - With no picks, the fallback is "most built on". That matches the brief, but it is a de-facto default; Design labels it "most built on is used", which is the agreed wording.
15. **Order in the reader.**
    - Decision 4 and the app order readers' images by **most liked, then newest**. The feed offers "Newest first" / "Most liked" (owner, 2026-10-08).
    - Design changes both to "newest first" / "most built on" and drops "most liked" (guess 5).
    - "Most built on" has no data for images (§8a).
16. **Moderators can only hide.**
    - Design's DISMISS matches in words.
    - The prototype's Dismiss **un-hides** the image (`hidden:false`). The app forbids this: "A moderator's 'Dismiss' never restores an image a stated rule hid… restoring would let moderator code publish (P5b)".
    - Design's desktop list shows auto-hidden items with no action specified.
17. **Auto-hide reasons.**
    - The app hides at once **only** for `minor` ("Anything sexual involving a minor"); "Sexual content" alone waits for review.
    - Design merges the two into one reason, and the prototype hides at once for it, so any sexual-content report would auto-hide.
    - The three-reporter rule (`hideAfterReporters: 3`) isn't shown to reporters.
18. **Report wording.**
    - App reasons: 9, including "Spam or nonsense" and "Other".
    - Design: 7, with "Spam, or something else".
    - The phone queue label "Misrepresents the author" doesn't match the reason "Misrepresents the book or the author".

### Book facts, colour, nav and unhide

19. **The book's facts.** The sample sheet text "Seventeen, slight…" contradicts `content/snowmoon/designs/characters/zei.json`, which says 18 (ch 19). The sheet's own rule is "Don't contradict what the book says." It's a sample, but a real sheet editor needs a check, or at least the book facts shown beside the box.
20. **Colour token clash.**
    - Design's sample marker `#B3306E` is the app's `--dzego` setting colour, so a leftover dotted underline would read as a Dzego accent.
    - Design uses `#ABA79D` (`--faint`, "never for text") as **text** ("PLACES · COMING" in the prototype) and as a disabled button fill under paper text: 2.3:1 or so, below the 4.5:1 the token note demands.
21. **Navigation.**
    - Design guess 15 says the prototype's entry was "Pictures · coming". The app's nav has "Pictures" as a live link with meta "Trial".
    - Renaming to "Images" changes the page's `<h1>`, metadata title and check targets.
22. **"Unhide from your profile".** No profile page exists. The app's Unhide lives on the image page, which 404s for a hidden image after reload.

---

## 10. Bugs and inconsistencies inside the Design files

**Prototype bugs**

1. **The reader strip is invisible.** Its cards compute to **0px tall**: the `overflow-x:auto` row shrinks inside the flex column. Only the sort row and "+ ADD YOURS" show (`proto-08b`). `proto-08d`/`08e` force `flex-shrink:0` to show the intent.
2. **The image page shows the latest style version, not the one used.** It reads `st.v`, so an image made with the v3 pick shows "Kalimar paper v4 →" (`proto-09-own-image.png`). The recipe must record and show the exact version used.
3. **Fork uses the latest version.** FORK credits the design's current version ("Kalimar paper v4"), even when the reader's pick is v3. The style page has no version switcher.
4. **Clearing instead of switching.** On a style page whose version is newer than your pick, the button reads "MY STYLE · CLEAR" and clears the pick rather than offering to switch.
5. **"+ ADD" changes picks globally.** It opens My picks, so changes there apply everywhere, not "for this image only".
6. **Only Gladias can be a character chip.** It is hard-coded, so the Zei pick never reaches Compose.
7. **New sheets are always Zei.** "+ NEW SHEET" fixes the entity as Zei; there is no character chooser.
8. **The covered feed item leaks its paragraph.** Its caption shows "CH 9 ¶ 40", against the board's "only the chapter number, never the scene".
9. **Dismiss un-hides the image** (§9 item 16).
**Board inconsistencies (sample state)**

10. **Version numbers disagree.**
    - 4a says "V3 OF 3" (Oct 4), while 6 offers "NEWER VERSION: V4" (6-desktop: Oct 7).
    - 5a says "1 OF 4 SHEETS", while the prototype has 2 Zei sheets.
    - 2b phone says "CH 1 ¶ 4–6", 2b desktop "CH 1 · ¶ 4".
11. **Pick buttons and labels disagree.**
    - 4a's caption says a picked button reads "MY STYLE · CHANGE"; the prototype uses "MY STYLE · CLEAR".
    - The chip key is "CHARACTER" on phone and "CHAR" on desktop; the image page row is "CHARACTERS" on the board and "CHARACTER" in the prototype.
12. **The feed changes between files and widths.** Its right label is "ALL CHAPTERS ▾" (board) vs "READ TO CH 3" (prototype). The desktop covered tile 6 has no "SHOW IT ANYWAY".
13. **Form labels and steps disagree.**
    - The 4b sample label is "2 TO 4" with 4 slots (board) vs "AT LEAST 2" with 3 slots (prototype).
    - The board says "PREVIEW AND PUBLISH"; the prototype's forms have only "PUBLISH", so there is no preview of a style or sheet before it goes public.
14. **The image page actions differ.** REMIX (board phone) vs READER (prototype) vs absent (board desktop).
15. **The rails differ.** Desktop rail entries vary between boards (§8a, Navigation).
16. **Other.** The 2b note promises "HIDE THIS"; the prototype says "HIDE". `ic-10.png` is empty.

---

## 11. Principles

This study touches all eight principles in `docs/principles.md`. Nothing was built and no check was run; `check:principles` would apply once the screens are built.

| # | Principle | Design as drawn | Status |
|---|---|---|---|
| 1 | Public recipes and prompts; people know first | Full prompt published; recipe page; consent before first Generate. But: added style and sheet text isn't shown on compose or preview (decision 7), custom publication lines replace `PUBLICATION_LINE`, and the new consent wording needs a new version | **Concern** (§9 items 6, 7, 9) |
| 2 | AI declared; nothing presented as the author's | Strong on the main image views. Unlabelled thumbnails in the library, picks and queue lists. The model-drafted starting style is not declared | **Concern** (§9 items 10, 11) |
| 3 | Allowlist, open weights | "‹model› · open weights" placeholders. Reference images for sheets would need FLUX.2 [klein] 4B edit (already allowlisted, per Part B) | Pass, pending the model choice |
| 4 | No model output published without a person's action | PUBLISH is explicit. The prototype's style and sheet forms publish without a preview | Pass; the forms should keep the board's "PREVIEW AND PUBLISH" |
| 5 | Nothing official; moderators only hide | Order labelled; "nothing official" text. But "pinned" fails P5a, the prototype's Dismiss un-hides, and "project starting point" plus "most built on" sit close to a de-facto default | **Concern** (§9 items 13, 14, 16) |
| 6 | No third-party requests from pages; private stays private | Picks private, counts never shown, reporters hidden. Consent names one host where the app sends to two (Groq, fal.ai) | **Concern** (§9 item 6) |
| 7 | Payments never in scoring; no token | Cost shown only as recipe provenance; never used in order | Pass |
| 8 | Screens and Dzegoban match the source | "No words in the picture" kept. A sample sheet contradicts a book fact (Zei's age) | Pass for the design; a sheet-text check is needed later (§9 item 19) |

**New tensions to raise with the owner before building:**

- "Most liked" versus "most built on" as the second order.
- Showing "built on by n" next to the pick button (favourites.md, open question 2).
- Whether drafts last across app closes.
- Collapsing the report reasons, given the minor-only auto-hide rule.
- Opening style, sheet and fork creation beyond invited FIDs.

---

## 12. What was built (step 3)

Branch `site-images-restyle`, from `f21b536`. The screens that already existed were restyled and restructured to the board and the prototype. The rules of slice 1 are unchanged: consent before the first Generate (own-words-v2, its sha256), the prompt check, the safety checker, the caps, invited FIDs only, covered spoilers, "AI-generated" and "not by the author" on every image, hide and report. No server route, migration, outside service or secret was added. Values were measured as computed styles in the built page (390 px, light) and set against §5.

### 12.1 Per screen

| Screen | What changed |
|---|---|
| Compose (1b) | Full-height sheet on a phone (44 px head, scrolling body, action bar at the foot); a right column 440 px wide from 768 px up, the reader still in view beside it (desktop compose). Passage card (rule border, card fill, 10/12 padding) with the passage in italic 16/1.4, clamped to two lines with "Show the whole passage"; the four range buttons kept, in ink mono. Prompt box with 1 px ink border, 17/1.4, counter "n / 600" in the label row. The publication line unchanged, with a filled dot. Style as chips (44 px, ring radio). "The rules" label over a top rule, 15/1.4. One filled Generate button (48 px, mono 13, .06em) carrying the count; the model line under it, centred. |
| Consent | The same component and words; laid out as Design's sheet: 16 px top radius, title 26/1.1, paragraphs 16/1.4 with top rules, "Not now" (outlined) and "I agree" (filled) in a 1 : 2 grid, in that order in the page too. |
| Draft (1c) | Its own step: "○ Draft · only you can see this · kept on this device" strip with a dashed rule; the image in a dashed outline, offset 3 px; "AI-generated image · not by the author"; one sentence on how the draft is kept; "Edit prompt". Action bar: "Generate again · n left" (outlined) and "Preview →" (filled). |
| Preview (1d) | The action bar opens into the screen: label, image, caption with ¶, byline and both phrases, "Prompt, published in full" and the prompt, the style text with "Style added (text drafted by the coding agent, a closed model)", then the publication line, Publish (filled, 48) and Edit (outlined, 44) kept at the foot. |
| Image page (2b) | Image edge to edge on a phone; two mono lines: "AI-generated image · not by the author", then byline, date and "Chapter n · ¶ · Open in reader →". One row of equal 44 px buttons (Like with an ink border and an ink fill when liked; Report and Hide this in warn red). The recipe: the person's words as reading text, the exact prompt in its box, then a 100 px label column. At desktop width, with no assistant beside it or from 1600 px: image and passage card left (1.4fr), actions and recipe right (1fr). Report is a bottom sheet: reasons as 44 px rows with a 16 px ring, the private note in a dashed box, Cancel and Send report. |
| Feed (3) | An order strip with a rule under it: "Newest first" and "Most liked" as 44 px tabs, the active one ink with a 1 px ink underline; "Spoilers covered after ch n" on the right. Items: image, then "Chapter n · ¶ · @name" with the date on the right, then the AI line. Covered spoilers are an ink tile (new token `--cover`, light and dark) and give the chapter only (the ¶ is no longer in a covered item's caption). Three columns from 768 px. |
| Readers' images (2a) | A 44 px bar with rules: "n images by readers · ¶ a–b" and "show ▾" / "hide ▴" in green; open, an ink top rule, the order named ("Most liked first, then newest"), the images side by side (260 px, 280 from 768), swiped with snap, the next one showing at the edge; "+ Add an image" for invited FIDs only. |
| Moderator queue (7) | A red "Moderators only · oldest first" strip with "n waiting"; each item: image with "AI-generated image · not by the author", by FID, chapter, blocks and date, then "Prompt, exactly as sent", "Reasons · reporters never shown", notes; Dismiss the reports (outlined) and Hide (warn fill), 48 px. Desktop: image left, detail right. |

Every screen has one "Draft wording" line (`.as-draft`).

### 12.2 Measured: Design against built (390 px, light)

| Item | Design | Built | |
|---|---|---|---|
| Phone head | 44, title Crimson 18 | 44, Crimson 18, weight 400 | closed |
| Labels | DM Mono 12, #6A675F, upper case, no extra spacing | 12px, rgb(106,103,95), uppercase, spacing normal | closed |
| Passage card | 1px #DAD6CC, #FBFAF6, 10px 12px; italic 16/1.4, 2 lines | same; 16/22.4 italic, clamped to 2 | closed |
| Prompt box | 1px ink, #FBFAF6, 10px 12px, 17/1.4, min 64 (desktop 110) | same | closed |
| Public line under the box | mono 12/1.5 ink, "●" | 12/18 ink, "●" (words unchanged) | closed (look); words differ by rule |
| Rules | top rule, label, 15/1.4 | same | closed |
| Body padding / gap | 14px 18px, 12 | 14px 18px 12px, 12 | closed |
| Action bar | 10px 18px 14px, rule on top | same | closed |
| Primary button | 48, ink, paper text, mono 13, .06em, radius 3 | 48, 13px, 0.78px, radius 3 | closed |
| Secondary | 48, 1px #DAD6CC, mono 12 | same | closed |
| Disabled primary | #ABA79D fill, paper text | outlined, muted text | not closed: #ABA79D under text is about 2.3:1 (`--faint` is never for text) |
| Chips | 44, 1px ink, Crimson 16 | 44, 16px, ink border when chosen, rule otherwise | closed |
| Radio ring | 16, 1.5px; chosen 5px | 16, 1.5px; chosen 5px (44 px target on touch) | closed |
| Privacy strip | 9px 16px, 1px dashed #ABA79D, mono 12 grey | same | closed |
| Draft outline | 1px dashed #6A675F, offset 3 | same | closed |
| Draft text | 16/1.4 #4A463F | 16/22.4 rgb(74,70,63) | closed |
| Publish / Back to draft | 48 mono 13 .06em / 44 outlined | 48 13px .78px / 44 outlined | closed |
| Preview prompt | 16/1.4 | 16/22.4 | closed |
| Image page image | 390 × 210 | 390 × 219 (the image's own 16:9) | not closed: keeping the ratio avoids cropping |
| Image actions | 4 equal, 44, gap 6, like ink border | same | closed |
| Recipe labels | 100 px column | 100 px (120 at desktop) | closed |
| Report sheet | radius 16, 20px 20px 18px; title 26/1.1; rows 44 with top rule, 16px | same | closed |
| Report note | dashed #ABA79D, mono 12 | same | closed |
| Feed tabs | min-height 44, active ink + 1px ink underline, inactive #6A675F | same | closed |
| Feed gap | 16 | 16 | closed |
| Covered tile | #1D1D1B, #E7E4DD, 16/1.35, 0 30px; button 44 outlined #E7E4DD | same; dark theme #2A2925 | closed |
| Reader bar | 44, rules top and bottom; open: ink top | same | closed |
| Strip cards | 260 (P) / 280 (B) wide, gap 10 | 260 (280 from 768), gap 10 | closed |
| Strip image | 150 tall | 146 (16:9 at 260) | not closed: ratio kept |
| Moderator strip | 9px 16px, 1px #8A2F2F, red mono 12 | 9px 0 (inside the page's gutter), same colour | closed |
| Hide / Dismiss | 48, #8A2F2F fill / outlined, mono 13 | same | closed |
| Desktop compose column | 440, head 52, title 20 | 440, 52, 20 | closed |
| Desktop rail | 220 | 248 (the app's) | not changed (frame, not these screens) |

### 12.3 Not closed, and why

- Tries strip (several drafts): each try would need its own signed ticket and stored image; slice 1 keeps one per passage and "Generate again" replaces it. Left out.
- Design's draft sentence ("until you close the app") is not true here; the built line says what the app does (kept on this device for this passage; replaced by Generate again; 24 hours to publish).
- Consent opens from "Read and agree" before the form, as built, not on the first Generate tap, and does not generate straight after agreeing.
- "FROM YOUR PICKS", characters, "+ ADD", USES and "UNDER @name · Name": no picks or sheets exist; no display names are stored.
- "FULL POLICY →": there is no policy page to link to.
- Image page REMIX/READER buttons, absolute "OCT 6" or relative "2H AGO" dates, request id, size/steps rows: the app keeps Cast this + Share card, YYYY-MM-DD, and its fuller recipe.
- "Most built on": no data for images; the orders stay Newest first / Most liked (feed) and most liked then newest (reader).
- After Publish, the app shows "Published. See it" rather than returning to the reader with a toast.
- Moderator queue: no passage text (it would need the moderator API to send it), FID instead of @name, blocks instead of ¶, no paging.
- Phone top-bar titles ("Images", "Image", "Reports"): the frame's bar stays "Snowmoon"; the page names stay "Pictures" and "Reports".
- Generate again's label wraps to two lines at 390 in the half-width button.

### 12.4 New draft wording

See `IMAGE_WORDING_ROWS` in `src/lib/images/wording.ts` (re-exported from `src/lib/wording.ts`).
