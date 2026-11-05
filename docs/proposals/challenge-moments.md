# Challenge rethink: moments (DRAFT)

Drafted by a coding agent (Claude, a closed model by Anthropic), 2026-11-05, on branch `challenge-moments` (from
`origin/contest` at `97db91d8`), from the owner's rehearsal 1 notes of 2026-11-05. **DRAFT until the owner approves
it. Design only: no code, no migration, nothing made, nothing spent, no production read.**

Read for this: `contest` (`src/lib/challenge/*`, `src/components/challenge-*.tsx`, `design-form.tsx`,
`src/app/references/designs/{new,[id]}`, `src/lib/legal.ts`, `docs/legal/contest-draft.md`, `docs/rehearsal-1.md`);
`remix-model-choice` (`src/lib/config.ts` `CLOSED_*`, `docs/legal/remix-model-choice-draft.md`); `challenge-styles`
(bases, recasts, first remixes); `find-a-moment` (principle 9 as adopted); `remix-moments` (the earlier "Set in the
book" proposal); the six character files; `content/snowmoon/illustrations/chapter-*.json`; the book's text.

The goal, in the owner's words: **easy, fun, social**, for people new to the book. Meet a character → write
something → remix → publish → share.

## In one paragraph

An entry stops being a character sheet (front, side, back) and becomes **one picture of a character at a moment from
the book**. The person taps a picture on a character's card (one of its bases, or someone's remix), lands on a remix
screen where that picture is already the reference, picks a moment (or "Surprise me"), types what to change, previews,
publishes, and is handed the share buttons with a ready post. Submit stays one tap. Under the hood this is the site's
existing **image** pipeline ("Make an image": a passage anchor, sheets as reference pictures, `remixed_from` links),
not the sheet pipeline, so it needs **no migration** for the core (the challenge tables key on any element version).
The bases stay sheets; makers never see front/side/back. Three things need the owner first: a narrow **P9 exception**
(§5.1), who writes and approves the **character bullets** (§5.2), and the **moments list** (§3).

---

## 1. (a) Flow and screens

### 1.1 The flow, and taps per step

| Step | What the person does | Taps (returning, signed in) | Taps today (rehearsal 1) |
|---|---|---|---|
| Meet | Scrolls /challenge, reads a card's bullets; may expand | 0 (1–2 to expand) | 0 |
| Pick | Taps any picture on a card (a base or a remix) | **1** | 2 (tap base, then Remix) |
| Moment | Kept from the picture, or tap one, or "Surprise me" | **0–1** | n/a |
| Write | Taps the empty box, types what to change | 1 + typing | 1 + typing (box pre-filled with the old prompt, to edit) |
| Make | "Make it" | **1** | 1 (Remix), then three views in turn |
| Preview → Publish | "Publish" (the prompt is shown with it) | **1** | 1 + "See it" link |
| Share | "Post on Farcaster" (opens compose, filled) + Cast in the app | **2** | 3+ (find Share, copy link, open app, paste) |
| Submit | "Submit" (post found, or pasted) | **1** (2 with Paste) | 2+ (paste address, Submit) |

**Total: about 7 taps plus typing** from /challenge to a submitted entry, against 12 or more today. First time only:
sign in (2–3 taps, in place), the own-words consent screen (1 tap, P1, must stay), and for a closed model its notice
and the 18+ box (remix-model-choice; 1–2 taps).

### 1.2 Navigation model (item 1: "the back button doesn't go where you expect")

What goes wrong today, found in the code:

- `/challenge` → tap base → **Remix** goes to `/references/designs/new?from=<id>`, whose crumb "← <base title>" points
  to the base's sheet page, not back to /challenge.
- After Publish, the form turns into "Published. See it" in place. **See it** opens the new sheet page, whose crumb
  "← Deluin" goes to `/references/designs/character/deluin` (the sheets index), a page the person never saw.
- Browser back from the new sheet page returns to the form URL, which renders an **empty form** (the words, the views
  and the publish are gone), inviting a second remix by accident.
- Submit lives at the bottom of the sheet page, below the pictures, the recipe and "Posted on".

The model proposed, standard for a multi-step creative flow (a wizard with a hub):

1. **A hub and a flow.** `/challenge` is the hub. The flow is `/challenge/make/…`. Every step has its own URL, so
   browser back, the in-page back and a refresh all agree.
2. **Steps push, tweaks replace.** Moving between steps (`make` → `preview`) is `router.push`; changing a moment, a
   look or the model inside a step is `router.replace` (the URL keeps the choice; back doesn't replay every tap).
3. **Back goes one step; ✕ leaves.** Each flow screen has "‹ Back" (the previous step, same as the browser's) and
   "✕" (close: back to the hub at that character's card, `/challenge#bai`). Never a crumb into References.
4. **Nothing is lost going back.** The words, the moment and the made picture are kept for the flow (the picture is
   already saved on the server as a draft image with its ticket; the words in `sessionStorage` for that flow id, on
   the device only). Back from Preview shows the words as typed and the picture already made.
5. **Publish replaces.** Publishing `router.replace`s Preview with the published picture's page, so back can't return
   to a publish form. Back from the published page goes to the hub, not the form.
6. **Sign-in in place.** Signing in opens over the step and returns to it, with the words kept.
7. **Leaving with an unpublished picture asks once** ("Leave without publishing? Your picture is kept in You for
   later."), only when a made picture is unpublished.

Back behaviour per screen:

| Screen | URL | ‹ Back / browser back | ✕ |
|---|---|---|---|
| S0 Hub | `/challenge` (`#<character>` when a card is open) | the page before the challenge | none |
| S1 Card expanded | same page; expansion is in-page state (`#bai`, replace) | previous page (expanding adds no history) | collapses |
| S2 Remix | `/challenge/make?from=<version>&moment=<id>` | S0 at that card | S0 at that card |
| S3 Preview | `/challenge/make/<draft>` | S2 with words, moment and picture kept | S0 (asks once if unpublished) |
| S4 Published + Share | `/challenge/p/<version>` (replaces S3) | S0 at that card | S0 |
| S5 Submitted | same page, Submit state changes in place | S0 | S0 |

### 1.3 Screens (text wireframes, phone width)

**S0 Hub: the character picker (`/challenge`)** (item 2)

```
 Remix the cast                                    Rules · Every entry
 Pick a character. Tap a picture to remix it. Entries close Sun 22 Nov, 23:59 PT.
 Moments from the whole book, including the ending.                (P9 note, §5.1)

 ┌───────────────────────────────────────────────┐
 │ [ big picture: one of Bai's bases ]   AI ⓘ    │
 │ BAI                                           │
 │ Zei's Minpentai rival, then his closest ally. │  ← one line (§5.2)
 │ • About Zei's age  (c4-b70)                   │  ← 3 bullets, each cites its block
 │ • Has beaten Zei three times out of three     │
 │ • Self-made: worked side jobs in high school  │
 │ More about Bai ▾                              │  ← level 2, then level 3 (item 3)
 │                                               │
 │ Bases          [pic] [pic] [pic]              │  ← tap any picture = remix it
 │ Remixes (12)   [pic] [pic] [pic]  Show more ▾ │  ← newest three; no empty slots
 └───────────────────────────────────────────────┘
 (same card for Zei, Gladias, Seila, Deluin, Mu: P5h order)
```

- One card per character, in the book-mentions order (P5h). The card's big picture is one of its bases (a fresh
  random one per visit when there are several, the existing P5g shuffle), labelled "AI ⓘ" (P2) and, on tap of ⓘ,
  "Look invented by this edition: the book doesn't describe it."
- **Tap any picture → S2.** No Remix button, no selected state, no "Not here yet" slots, no "First remixes" heading
  when empty (§2.6 asks about the owner's first remixes).
- "Remixes": the **newest three** published remixes of that character (time order, P5g), then "Show more" adds 12 at
  a time in place. Hidden entirely when there are none. The owner wrote "first three"; I read it as the first three
  shown (newest), because P5g allows only newest-first on challenge lists. If he meant the three oldest, that is a new
  order and needs his word (Q3).
- The global "Remixes: a random few" block and the counts row move to /challenge/remixes and the rules page, so the
  hub is just the six cards.

**S1 The card, progressive disclosure** (item 3)

Level 1 is on the card (one line + 3 bullets). "More about Bai ▾" opens level 2 in place: the fuller description
(4–6 sentences, this edition's words) and the rest of the bullets. At the bottom of level 2, "Where Bai appears in the
book ▾" opens level 3: the passages, each a word-for-word quote with its block ID and "Read it →" (the reader at that
block), grouped by chapter, oldest first (book order). Level 3 is fetched when opened, not sent in the page. Best
practice followed: one disclosure at a time, the summary is never hidden by the detail, each level says how much is
inside ("12 passages, chapters 4–31"), the control is a real `<button aria-expanded>`, and opening it doesn't move the
picture rows off screen (they sit above "More about"). No chapter gating here (owner's note), under the exception in §5.1.

**S2 The remix screen** (`/challenge/make?from=…`) (items 4, 5)

```
 ‹ Back                                                         ✕
 [ the picture you tapped, full width ]  AI ⓘ

 Moment  [ Surprise me ⟳ ] [The wall comes down · Ch 2] [Bai's symbol · Ch 4] [The final · Ch 7] …  →
         "Bai, next intervention turn is your chance to shine."  c4-b129   Read it →

 ┌─────────────────────────────────────────────┐
 │ Describe what to change                     │   ← empty; placeholder only
 └─────────────────────────────────────────────┘
 Model  FLUX.2 [klein] · Black Forest Labs · open ▾        (picker when model choice is on)
 Style  As this picture ▾                                  (optional)

                 [ Make it ]
 Public, permanent, GPL-3.0, shown with your name.          (the P1 publication line, kept)
```

- Gone, per the owner: "Remixed from … (rehearsal stand-in)" and "Shown on yours for good. It credits …" (the credit
  stays in the recipe and on the published page), "Views · front, side, back", "Side and back are made from the front
  view", the model's licence line (it moves to the recipe; the chip still names model and maker, which P2 and the
  closed-models rule require), the rules text and "What the book says about …" (the moment's quote replaces it).
- **The picture is the reference.** The old prompt is not shown or pre-filled. What the model receives: the reference
  picture, the moment's scene line (§3.3), and the person's words. All three go in the recipe (P1).
- **Moment strip:** the curated moments with this character, in book order, as chips with the edition's title and
  chapter; one selected. Starting from a remix, its moment is selected; starting from a base, a moment is drawn by
  "Surprise me" (§3.4) and shown selected, so there's nothing to choose unless you want to. Tapping a chip shows its
  quote under the strip (word for word, block ID, "Read it →" opens the reader in a new tab so the flow stays).
- **Changing the look:** tap "‹ Back" and pick another picture, or tap the picture here for a sheet of the
  character's bases and remixes ("Use this look"). Choosing someone else's remix with a new moment is how a look
  travels ("remix characters, styles and moments").
- **Model:** the open default, as a chip. With `IMAGES.designs.modelChoice` on (branch remix-model-choice, not in
  contest yet), the chip opens the picker; the closed models' notice and the 18+ box appear on first pick, as that
  branch has them. Planned in §4, R5.
- Signed out, the button reads "Sign in to make it" and opens sign-in in place. An account below the check sees one
  line at the button: "Your account doesn't pass the site's check, so it can't make pictures yet." (replaces the
  up-front rules text; see Q8).

**S3 Preview** (`/challenge/make/<draft>`)

```
 ‹ Back                                                         ✕
 [ the new picture ]  AI ⓘ           [ the one you started from, small ]
 Bai · Bai's symbol (Ch 4)
 Your words: "make her grin, neon arena light"          ← exactly what will be published
 [ Try again ]   [ Publish ]
 How it was made ▸  (the full prompt and model: the recipe, collapsed)
```

"Try again" makes another with the same words (it counts as a picture); "‹ Back" edits the words. This is the step
the owner called good; only its place in the history changes.

**S4 Published, share first** (`/challenge/p/<version>`, replaces S3) (item 6)

```
 ✕
 [ the picture ]  AI ⓘ
 Published. Now post it:
 [ Post on Farcaster ] [ Post on Bluesky ] [ Post on Lens ] [ Copy link ]
 "Bai at Bai's symbol, my remix for the Snowmoon Party remix challenge" + link   (edit in the app)

 Then submit it as an entry  ·  one a day
 ✓ Found your post on Farcaster          [ Submit ]        (option A, needs a Privacy line)
   or  [ Paste your post's link ] [ Submit ]               (option B, today's check)
```

- The post buttons are the existing "Post it first" buttons (approved 2026-11-05) moved to the top; the text gains the
  moment's title. Nothing is posted or stored by us.
- **Submit, one tap** once there's a post. Option A (recommended for "very few taps"): on return from the network,
  the page offers "Find my post" (or runs it once on focus): the server reads the person's own latest posts through
  the same reader Submit uses and finds the one linking to this page. This sends the person's Farcaster ID to Neynar
  (or their DID to Bluesky's AppView) for a new purpose, so it needs a Privacy line (§2.7). Option B: a "Paste"
  button (clipboard, one tap with the browser's permission) next to Submit: two taps, no legal change.
- Below, small: the recipe link, "See it in Every entry", "Make another" (back to S0 at this card).

**S5 Submitted:** "Submitted: this is now one of your entries." Withdraw stays, below, unchanged.

---

## 2. (b) What changes in the challenge

### 2.1 Entries

| | Today (contest) | Proposed |
|---|---|---|
| What an entry is | a version of a character **sheet** (front, side, back), forked from a base or a remix of one | **one picture** (an image version) of a challenge character at one of the challenge's moments, remixed from one of the character's bases or from another challenge picture whose line reaches one |
| Which character it counts for | the sheet's character | the character whose picture it was remixed from (one per entry; others in the scene don't count) |
| Pipeline | sheet fork: three views, edit model from the source's front | the image pipeline: one picture, edit model with the tapped picture as reference, anchored to the moment's passage (`studio.anchors`, which already takes images), `uses` link to the look's sheet when it starts from a base, `remixed_from` link to the picture it starts from |
| Counts as a remix | `remixOfBase` over the sheet line | the same rule over the picture's line: a `uses` link to a base, or `remixed_from` back to a picture that has one |
| Moment | none | required, from `CHALLENGE.moments` only (§3) |
| Submit, eligibility, post check, withdraw | as built | **unchanged** (`challenge_marks`, `challenge_eligibility`, `version_posts` reference any element version) |
| Free limit | 3 sheet remixes a day (`IMAGES.designs.remixesPerDay`) | the image count (`IMAGES.generationsPerDay`, 10 a day), one picture each |
| Cost per remix | about $0.026 (three views) | about $0.009 (one picture), from the same price table |

Bases stay published sheets (they are the looks); makers never see their views. Sheet forks of challenge characters
stop counting (`CHALLENGE.openSheets` off, so making sheets returns to invitation only).

### 2.2 The shortlist

Not built yet (1–3 Dec). With moments: per character, the shortlist is drawn from that character's entries (pictures),
listed newest first or shuffled, as "Every entry" is; jurors and the vote see pictures with their moment. No change to
how it's decided, since that is still undefined in the plan. It gets easier to judge: one picture each, not three views.

### 2.3 What a final version is, per character

Today: a final **sheet** that Nate takes into Episode 1, credit split by models and a jury among what it was built on,
minted as an open edition. Two options:

- **A (recommended): the final version stays a sheet, "the final look".** Episode 1 needs a look that holds across
  shots, which is what a sheet is for. After the shortlist, Nate makes each character's final look from the looks in
  its shortlisted pictures; the credit test splits it among the entries it drew on, as now. The mint is unchanged in
  kind. What changes is only where it comes from: entries are pictures, the final is a sheet made from them.
- **B: the final version is one picture per character** (the shortlist's pick), minted as is. Simpler and more
  attractive to collect, but Episode 1 then has no reference sheet, and "final" sits closer to "canon" (P5): a single
  picture of a character marked final.

Either way the wording "final version" is kept from turning into "official look": Episode 1's look is "the look
Nate took into Episode 1", credited, and every other look stays as published (P5).

### 2.4 The one-a-day rule

**Keep it**, unchanged: one submission per person per Pacific day, any character, withdrawn ones keep their day.
Making and publishing pictures are not limited by it (only by the free count). Pictures are faster to make than sheets,
so the rule matters more, not less: it keeps the entry list small enough to judge and stops one person flooding a
character. The minimum of **3 different makers per character** also stays as is.

### 2.5 The challenge record (IPFS, Ethereum)

Unchanged in kind: per entry, a fingerprint of its picture and recipe, the maker's ID, when it was published and what
it was built on. "Built on" now includes the moment (its block IDs) along with the look and the picture remixed. One
word changes in the legal lines ("pictures" → "picture").

### 2.6 What stays, what goes

Stays: Submit and its post check, one a day, withdraw, the 3-maker minimum, the Neynar and Bluesky checks at publish,
the admin rule, the record, "Every entry", "Posted on" without counts, the rehearsal switch, the owner's switch.

Goes or changes: sheet forks as entries; the "First remixes by @naaate" row and its empty slots (P5g's third exception,
pending): if the owner makes first remixes as moment pictures, they appear as remixes by @naaate in time order, never
entries (Q4); the hub's global random block (P5g's second exception) moves to /challenge/remixes or is dropped (Q5).

### 2.7 Every changed line, before and after

Terms §6e and Privacy were approved on contest (2026-11-04, words `jskf6i` and `1x81p6y`). These would need the owner's
reread, and ship in the release that makes pictures the entries (legal describes today). Shortest true sentence; no
implementation detail.

**Terms §6e**

| Before | After |
|---|---|
| During the challenge, anyone signed in with a Farcaster account or a Bluesky account that passes the site's check for it may remix its characters' sheets; making other sheets and styles stays by invitation. | During the challenge, anyone signed in with a Farcaster account or a Bluesky account that passes the site's check for it may remix pictures of its characters; making sheets and styles stays by invitation. |
| …and only if it is a remix (not a sheet made from scratch) made on the Service during the challenge by an account we invited or one that passed the site's check when the version was published. | …and only if it is a picture of a challenge character at one of the challenge's moments, remixed from one of its pictures on the challenge page (not made from scratch), made on the Service during the challenge by an account we invited or one that passed the site's check when it was published. |
| A version counts as an entry only once its maker submits it… | A picture counts as an entry only once its maker submits it… |
| …a fingerprint of its pictures and recipe (not the pictures or words themselves)… | …a fingerprint of its picture and recipe (not the picture or words themselves)… |
| A character needs entries from at least three different people to get a final version… | unchanged (option A or B both keep "final version") |
| *(new, only with the P9 exception)* | none: spoilers are not a legal matter; the note is site wording |

**Privacy §4**

| Before | After |
|---|---|
| Character sheets you publish, … These are public. During the remix challenge, anyone who passes the same check as making images can publish a remix of its characters' sheets. | Character sheets you publish, … These are public. *(last sentence removed: sheet remixes are no longer the challenge)* |
| If you take part in the remix challenge: for each version of a challenge character you publish, whether it can count as an entry and why… | If you take part in the remix challenge: for each picture of a challenge character you publish, whether it can count as an entry and why… |
| …and each version you submit as an entry, with its character and when you submitted it. | …and each picture you submit as an entry, with its character and when you submitted it. |
| Whether a version is an entry is shown on its page and on the challenge page… | Whether a picture is an entry is shown on its page and on the challenge page… |
| …a fingerprint of its pictures and recipe (not the pictures or words themselves)… | …a fingerprint of its picture and recipe (not the picture or words themselves)… |
| How many images, sheet remixes and Remix frames you make each day… | unchanged (true either way) |

**Privacy §6:** "a version of one of its characters that you publish and submit is shown as an entry" → "a picture of
one of its characters that you publish and submit is shown as an entry".

**Privacy §7:** Neynar item: "when you publish a remix of a challenge character" → "when you publish a picture of a
challenge character". Bluesky item: unchanged ("publish a remix" stays true). **Only with Submit option A**, one new
sentence in each: Neynar: "When you ask the site to find your post about a picture, Neynar receives your Farcaster ID,
to read your latest posts." Bluesky: "When you ask the site to find your post about a picture, our server reads your
latest posts there by your DID." **Only with model choice in the remix screen:** remix-model-choice's §7 lines for
OpenAI and Google say "sheet remixes"; they become "pictures you remix", in that branch's own reread.

**Site lines** (all "Draft wording" until approved; files on contest)

| Where | Before | After |
|---|---|---|
| Landing line (`landing-wording.ts`) | Pick a character, tap its base or a first remix, then Remix to make it your own. Entries … close … | Pick a character. Tap a picture to remix it. Entries close … |
| P9 note (new, §5.1) | — | Moments from the whole book, including the ending. |
| Bases heading | Bases to start from | Bases |
| Remixes on a card | First remixes by @naaate · Not here yet | Remixes · Show more (hidden when none) |
| Tile labels, "Tap a picture to remix it", "Remix", "See this base" | as now | removed (tapping is the action) |
| Picture alt | AI-generated front view of Bai, not by the author | AI-generated picture of Bai, not by the author |
| Remix form band | Remixed from Zei (rehearsal stand-in) v1 · by … / Shown on yours for good. It credits … | removed (credit in the recipe and the published page) |
| Views, view model, licence line | Views · front, side, back / Side and back are made from the front view / … open weights, Apache-2.0 · runs on fal.ai | removed; the model chip: FLUX.2 [klein] · Black Forest Labs · open |
| Prompt box | pre-filled with the source's sheet text | empty; placeholder "Describe what to change" |
| Sign-in gate | Sign in with Farcaster to remix this sheet. During the remix challenge, anyone whose account passes the site's check can remix it. | Sign in to make it (button) |
| Who can enter (`whoCanEnter`, said up front) | Entering needs a Farcaster account with a Neynar score of 0.7 or more; we check when you press Generate. | on the Rules page only, plus at the button for an account below it (Q8) |
| Rules: what counts | Only remixes count: for each character, start from one of its bases, or someone else's remix. A new sheet made from scratch isn't an entry. | Only remixes count: start from one of a character's pictures on the challenge page and set it at one of the moments. A picture made from scratch isn't an entry. |
| Rules: free | Remixing is free: three remixes a day. A remix is one sheet's three views; if one of them fails, make it again inside the same remix without using another. | Remixing is free: ten pictures a day. |
| Rules: to remix at all | …An account below it can't make the pictures, so it can't remix or enter. It's checked when you press Generate, and again when you publish. | …It's checked when you press Make it, and again when you publish. |
| Intro | …start from a published sheet, or from someone else's remix, change it, and publish. Your version gets its own page… | …pick a moment from the book, change what you like, and publish. Your picture gets its own page, credited back to what you built on. |
| What happens next | …shows the versions he's taking into Episode 1, built from your remixes… | (A) …shows the looks he's taking into Episode 1, made from your pictures and credited to you… |
| Sheet invite (`sheetInvite`) | Bai is in the remix challenge: remix this sheet, change it and publish to enter. | removed from sheet pages; on a challenge picture's page: "Bai is in the remix challenge: remix this picture to enter." |
| Candidate notes, badge note | …It isn't an entry for Bai unless its maker submits it. / Submitted as an entry for Bai… | unchanged ("version" nowhere in them) |
| Publish confirmation | Published. To enter it for Bai, press Submit on its page, with the link to your post about it. See it | Published. Now post it: (S4) |
| Post text (`submitPostText`) | My remix of Bai, for the Snowmoon Party remix challenge | Bai at Bai's symbol, my remix for the Snowmoon Party remix challenge |
| Submit head and note | Submit as an entry / A remix becomes an entry only when you submit it, with the link to your post… | Then submit it as an entry · one a day |
| Feed untitled | Bai, remixed | Bai at Bai's symbol |

---

## 3. (c) The moments list

Fifteen candidates for the owner to pick from, plus three reserves. Each quote is the book's own words, checked as an
exact substring of its block (markup removed) by the agent on 2026-11-05; a build would check them again (§4, a P8c-
style test). **Titles, "why" and scene lines are this edition's own words**, drafted by the agent for the owner. The
"Depth" note says how far into the book (32 chapters) the moment sits; the "Job" is the existing illustration job at
or near it, whose model-drafted prompt can seed the scene line.

| # | Title (edition's) | Characters (challenge ones in bold) | Passage | Quote (book, word for word) | Why it's compelling | Depth | Job |
|---|---|---|---|---|---|---|---|
| 1 | The concert in a privacy robe | **Gladias** | c1-b44–b50 | "He soon got to the concert stage area, and was able to clearly hear the gnarly voice of Dreadknot's lead singer." (c1-b50) | the book's first scene: a hidden judge in a dark purple robe in a dancing crowd; a strong setting and costume | Ch 1: none | none (c1-b082 is near) |
| 2 | The wall comes down | **Zei**, Fin | c2-b98–b100 | "A fraction of a tick later, part of the wall and the floor came crashing down." (c2-b99) | the moment the war becomes real for Zei; action, dust, the broken arm | Ch 2: very light | c2-b099-blast |
| 3 | Bai's symbol | **Zei**, **Bai** (**Mu** watching) | c4-b118–b135 | "Bai, next intervention turn is your chance to shine." (c4-b129) … "Bai's symbol." (c4-b133) | rivals forced to team up; the first words between them win the quarterfinal | Ch 4: light | c4-b081-arena |
| 4 | Lunch with a stranger | **Seila**, **Zei**, **Bai**, Jahn | c5-b55–b62 | "I'm Seila", the woman replied. (c5-b58) | the two storylines meet by chance at a Freetown table; a bright travel scene | Ch 5: light | c5-b073-lunch-table |
| 5 | The tower: Keeper | **Gladias** | c6-b146–b158 | "I am applying to become a Keeper." (c6-b158) | a lone climb up a mountain stair to a choice that drives his whole story | Ch 6: light | c6-b147-tower-top |
| 6 | To our future | **Mu**, **Zei**, **Bai** | c7-b44–b50 | Mu raised the glass. "To our future," she said. (c7-b49) | a toast that sounds like a battle cry, before the final; three characters in one frame | Ch 7: light | c7-b049-toast |
| 7 | The championship final | **Zei**, **Bai** | c7-b101–b111 | "Bai's AI started thinking about countermeasures to all sixteen strategies, but soon hit a limit: it could not optimize defenses against all of them at the same time." (c7-b104) | the championship match the owner named: Zei's sixteen-strategy factory against Bai | Ch 7: light (who wins) | none (c7-b100-audience is near) |
| 8 | "Hi, I'm Deluin" | **Deluin**, **Zei** | c12-b68–b75 | "An older teenage boy sat down beside Zei." (c12-b70) "Hi, I'm Deluin", he said. (c12-b71) | a friendship begins at the national championship; Deluin's first scene | Ch 12: moderate | c12-b070-orientation |
| 9 | Pictures of Redshire | **Deluin**, **Zei** | c14-b123–b130 | "He saw castles, pine forests, large pristine grasslands, red-colored mountains with their tops covered in snow, and one giant icy waterfall." (c14-b124) | a whole country in one hand device, a week before it falls; a landscape moment | Ch 14: moderate | c14-b124-redshire-photos |
| 10 | "Gladias, you idiot!" | **Seila** (**Gladias** on the call) | c21-b45–b52 | "Gladias, you idiot! Do you know what you've done?!!!!" (c21-b49) | Seila works out the book's great deception before anyone else | Ch 21: heavy (reveals who Delwart is) | c21-b040-basement-call |
| 11 | The hug in the library | **Bai**, **Gladias** | c24-b36–b42 | "So don't worry, I won't ask any questions." (c24-b38) "She walked up to Gladias, and gently hugged him." (c24-b39) | the rival who only knew winning comforts a stranger; quiet and tender | Ch 24: heavy (Lily) | c24-b039-hug |
| 12 | Seila runs to him | **Seila**, **Gladias**, **Zei** | c26-b73–b76 | "She turned toward him, and began running toward him with outstretched arms." (c26-b75) "It was Seila." (c26-b76) | a reunion at a hotel door after the worst weeks of their lives | Ch 26: heavy | c26-b075-seila-runs |
| 13 | New plan: fly low | **Mu**, **Zei** (Den) | c26-b119–b128 | "New plan. Everyone fly low, under the buildings and trees. Fly through the streets. …" (c26-b122) | the rescue falls apart and Mu takes over; streetlights blink, drones race through streets | Ch 26: heavy | c26-b120-console-despair |
| 14 | Before the battle | **Zei**, **Mu**, **Bai** | c29-b2–b10 | "Do you think we're ready?", Zei asked. (c29-b4) "No", Mu replied. "But nothing meaningful ever happens when people are ready." (c29-b5) | a snowy hilltop at sunrise on the day of the war; three of the six together | Ch 29: heavy | c29-b002-snowy-hill-sunrise |
| 15 | Deluin on the summit | **Deluin**, **Zei**, **Bai** | c31-b5–b12 | "He reached the top, and almost threw Zei off balance as he threw himself into his arms for a hug." (c31-b9) | the friend everyone feared lost; the book's warmest reunion | Ch 31: the ending (that Deluin is alive and free) | c31-b009-reunion-hug |

Reserves: **R1** "Ah, Zei, we meet again" (Zei, Bai; c4-b70–b75; "Bai walked up closer, and put her hand on Zei's
shoulder." c4-b73; Ch 4). **R2** Smoke over the city (Zei, Bai, Fin; c7-b33–b38; "A few moments later, from their
high vantage point already a third of the way up the mountain, they could see a cloud of smoke emerging in the
distance, somewhere in the outskirts of the city." c7-b33; Ch 7). **R3** Drones marked DOG (Zei; c30-b47; "…each
paper containing many colorful and squiggly patterns - and in a giant font, the word "**DOG**"." c30-b47; Ch 30, the
battle's turn).

Coverage of the six (main list): Zei 12, Bai 7, Gladias 5, Mu 4, Seila 3, Deluin 3. Every character has at least
three moments; Seila's and Deluin's are mostly past chapter 12, which is why the exception in §5.1 matters for them.

### 3.1 Spoiler depth at a glance

Chapters 1–7: moments 1–7 (the first fifth: safe for a newcomer). Chapters 12–14: 8–9. Chapters 21–31: 10–15 (the
second half, including the ending). If the owner wants less exposure without gating, the list can stop at chapter 14
for the launch and add the rest later (Q2).

### 3.2 How a moment is stored (for the build)

`CHALLENGE.moments`: per moment, an id (e.g. `c4-b129-bais-symbol`), the edition's title, the passage
(`chapter`, `start`, `end`, the anchor), the quote's block and words, the characters in it, and a scene line (§3.3).
Fixed order: book order (chapter, then block), which is the book's, not a ranking.

### 3.3 The scene line (what the model receives for the moment)

The quote is shown; it is not sent to the model (a dialogue line makes a poor image prompt). Each moment has a short
scene line, e.g. "a physics classroom; part of the wall and floor crash down; dust and falling stone". That is a
**prompt, not story words**, so P2 allows it to be model-drafted when labelled (`assist` in the recipe), as the
illustration jobs' prompts are. Proposed: the agent drafts each line from the job's prompt and the passage, the owner
approves the list in one pass, and each recipe records "scene line: drafted by the coding agent, approved by the
owner". It is the edition's own and labelled so in the recipe.

### 3.4 How "Surprise me" picks

- **From the curated list only** (`CHALLENGE.moments`), never from the whole book, so every quote shown has been
  checked and approved.
- **Unweighted**: a fresh uniform draw each time (the existing `shuffleFresh`, in the browser), from the moments that
  include the character being remixed, excluding the one already selected. Not weighted by popularity, use count,
  spoiler depth or anything else (P5g, P5i).
- If the owner wants newcomers to land early more often, the honest version is a filter, not a weight: "Surprise me"
  draws from chapters 1–14 unless the person taps "whole book" (Q2). I don't recommend weighting.

---

## 4. (d) Build order, effort, and rehearsal 2

Small releases, each on its own branch from contest, each merged only on the owner's OK. Effort is the agent's
working time, with tests.

| Release | What | Needs first | Effort |
|---|---|---|---|
| R0 | Owner decisions: this doc, the P9 exception (§5.1), the moments (§3), the bullets (§5.2), options A/B, Q1–Q9 | — | owner's time; agent 0.5 day to fold answers in |
| R1 | **The hub**: character cards (picture, one line, three bullets, two disclosure levels), bases and newest-three remixes per card, tap a picture to remix, the P9 note; nothing else on /challenge. Tap still opens today's form until R2. Checks: P5g (newest three, shuffle), P5h order, bullets cite blocks (a P8c-style test), the P9 exception check | owner-approved bullets and the exception | 1.5 days |
| R2 | **The moments remix screen** and its flow: `/challenge/make`, preview, publish-replaces, back/✕ per §1.2, empty prompt, moment strip, "Surprise me", one picture through the image pipeline with the tapped picture as reference, anchored; entries switch from sheets to pictures (`rules.ts`, `entries.ts`, `record.ts`); `openSheets` off; Terms §6e and Privacy lines (§2.7) in the same branch. Tests: the remix-line rule on pictures, moment quotes word for word, the anchor, a planted sheet fork that must not count | R1; moments and scene lines approved; legal reread | 3 days |
| R3 | **Share first**: the published screen (S4) with post buttons at the top, the ready text, Submit beside them; option B (Paste) in R3, option A (Find my post) as R3b with its Privacy line | R2 | 1 day (+1 day for A) |
| R4 | Rehearsal 2 on this machine (§4.1) | R1–R3 | 0.5 day |
| R5 | **Model choice on the remix screen**: remix-model-choice merged into contest, its migration applied, its picker on S2, Privacy naming the providers for pictures | remix-model-choice merged and `NEXT_remix_model_choice.sql` applied; its reread | 1 day |
| R6 | The shortlist and the final version (A or B) | the vote's design; not needed before 1 Dec | later |

About 6–7 agent days for R1–R4, more with option A and R5. No migration for R1–R4 (the challenge tables and anchors
already take image versions; to be confirmed against the rehearsal database in R2, not production).

### 4.1 Does rehearsal 2 wait?

**Recommendation: yes, rehearsal 2 waits for R1–R3.** Rehearsing today's sheet flow again would test the screens this
replaces (the form, three views, the crumbs), and the owner's notes are mostly about those screens. What does not
change (sign-in, Submit's post check, one a day, withdraw, "Every entry") was covered by rehearsal 1 for Farcaster. If
the owner wants Bluesky and Lens covered sooner, a short **rehearsal 2a** of Submit with a Bluesky and a Lens post can
run on contest now, since that part is untouched by this design.

The challenge's dates (open Fri 6 Nov 09:00 PT in `CHALLENGE.dates`) don't fit R1–R4; nothing opens by date alone
(`CHALLENGE.public` is off), so the owner sets a new open date when he turns it on (Q9).

---

## 5. Questions the owner decides (raised, not resolved)

### 5.1 P9 (spoilers): a narrow, explicit exception

The owner's note ("Don't limit this by chapters read. No spoiler gating here.") conflicts with adopted principle 9
("Nothing past where a reader has read is shown, or sent to a model on their behalf, unless they choose it each
time"), its "Names count" rule, and P9c (`BookQuotes`, which today hides later quotes). Deluin first appears in
chapter 12, and moments 10–15 come from chapters 21–31. Proposed wording for `docs/principles.md` (DRAFT, owner's
decision):

> **Recorded exception: the remix challenge (owner, 2026-11-05; pending the owner's yes).** While the challenge runs,
> /challenge and its remix screens show its six characters' cards and passages and its moments (`CHALLENGE.moments`)
> from the whole book, whatever the reader has read. Each of those pages says so at the top, in one line, before any
> of it: "Moments from the whole book, including the ending." Nothing else is covered by this: the reader, the
> search, "Find a moment", the assistant, the sheets and every other page keep principle 9, and nothing from the
> challenge pages raises a limit anywhere else. Only the moment a person picked for their picture is sent to a model,
> when they press Make it. The exception ends when entries close. *Planted:* a challenge page without the line, a
> passage on a challenge page not from the six characters or the moments, and a moment's quote shown on a sheet page
> past the limit.

Minimal courtesies, for the owner to pick (none gates anything):

1. The one line above, at the top of /challenge and the remix screen (recommended; it is part of the exception).
2. The chapter on each moment chip ("Ch 29"), so a reader can avoid what's past them (recommended; also helps).
3. "Surprise me" draws from chapters 1–14 by default, "whole book" one tap away (optional; see Q2).

Not proposed: covering, blurring or a chapter switch, which the owner ruled out here.

### 5.2 Who writes the character bullets and descriptions

The book never describes looks (each character file says so), so a card has three kinds of words, marked apart:

- **Book facts** (the bullets): each bullet is the edition's short phrase for one fact, and links to the book's own
  words with the block ID ("About Zei's age · c4-b70"; tapping shows the quote: "Another woman walked in, about the
  same age as Zei."). The character files already hold such facts with quotes and blocks; they become the source.
- **The one line and the fuller description**: this edition's own words, saying what the book says without
  inventing; marked "This edition's summary".
- **The look**: "Look invented by this edition: the book doesn't describe it", on the picture's ⓘ.

These are not story words (narration or dialogue), so an agent may draft them, as it drafted the character files'
`about` and `facts`. Proposed approval: the agent drafts all six cards in one file (`src/lib/challenge/cards.ts`),
each bullet with its block and quote; a test fails if a quote isn't word for word in its block or a fact cites
nothing; the owner reads the six cards in one pass and approves them as written or with changes; until then they show
the site's "Draft wording" mark, and /challenge doesn't open to the public with unapproved cards. If the owner prefers
to write the one-liners himself, the agent drafts only the bullets (Q1).

### 5.3 P5 (nothing canon), and the other principles touched

- **The curated moments list is a choice by the owner** that steers what people make. Like the first remixes, it
  should say whose it is ("Moments picked by @naaate", on the Rules page and the strip's ⓘ), be in book order (not a
  ranking), and never be described as the official or best moments. Proposed as a P5g exception: the moments' fixed
  book order and "Surprise me"'s uniform draw, with a planted weighted draw that must fail.
- **No picture is "the" look.** Bases are labelled "Base", not default; option B's single final picture is closer to
  canon than option A's credited sheet, one reason A is recommended.
- **"Newest three" remixes** per card are time order (P5g); no counts on cards (P5i).
- **The pre-selected moment** from a base is a random draw, shown as selected, so no moment is a default.
- **P1**: the published picture's recipe holds the person's words, the scene line, the reference picture's hash and
  the model; the consent screen stays.
- **P2**: AI labels on every picture; the moments' quotes are the book's, word for word; titles, bullets and scene
  lines are marked as the edition's.
- **P6**: no new third party; Submit option A sends an ID to Neynar or Bluesky for a new purpose (Privacy line).
- **P7**: unchanged.
- **P8**: the moments' quotes and the bullets' quotes get a P8c-style word-for-word check; Dzegoban in moment 6
  ("Dze go ba fau gie" follows the quoted words in c7-b49) is quoted only as written.

### 5.4 The other questions

- **Q1** Bullets: the agent drafts and the owner approves (recommended), or the owner writes the one-liners?
- **Q2** Moments: which 10–15 of the 18; the whole book at launch, or chapters 1–14 first; "Surprise me" whole book
  or 1–14 by default?
- **Q3** "First three community remixes": the newest three (recommended, P5g), or the three oldest?
- **Q4** The owner's first remixes: drop the row, or make them as moment pictures shown among remixes, labelled by
  @naaate, never entries?
- **Q5** The hub's random "Remixes" block: move to /challenge/remixes, or drop?
- **Q6** Final version: A (final look sheet, recommended) or B (one picture per character)?
- **Q7** Submit: option A ("Find my post", one tap, new Privacy line) or B (Paste + Submit, no legal change)?
- **Q8** The owner's 2026-11-03 rule that who can enter is said up front, before the consent screen: does today's
  "drop the rules text" replace it (shown on Rules and at the button for an account below the check)?
- **Q9** A new open date, once R1–R4 are done.
- **Q10** Multi-character moments: the picture's focus character comes from the tapped picture; the others in the
  moment are drawn from their bases (named in the recipe). Is that right, or should a moment show only the focus
  character?

---

## Principles

- **P1 (public recipes; people know their words are public):** pass by design. The prompt (the person's words, the
  scene line, the reference) is in each published picture's recipe; the publication line and consent stay; publish
  shows the words.
- **P2 (AI declared; book unaltered; words human):** pass by design. Quotes are word for word with block IDs (checked
  for all 29 quoted passages in this doc); titles, bullets, scene lines and looks are marked as the edition's. Concern:
  bullets and scene lines are agent-drafted and need the owner's approval (§5.2, §3.3).
- **P5 (nothing canon):** concern, for the owner. The curated moments list and "Surprise me" need a P5g exception;
  option B for the final version leans toward canon.
- **P6 (privacy):** pass, unless Submit option A is chosen (a new Privacy line for Neynar and Bluesky).
- **P7 (payments):** not touched.
- **P8 (in-world text matches the source):** pass by design, with a word-for-word check for every moment and bullet.
- **P9 (spoilers):** **conflict**, raised in §5.1 with a narrow exception for the owner to accept, change or refuse.
- **New tension:** "very little text" against the up-front "who can enter" line the owner asked for on 2026-11-03
  (Q8), and against the labels P2 requires (kept to one "AI ⓘ" per picture and one model chip).
