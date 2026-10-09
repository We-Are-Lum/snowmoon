# Minpentai Learn: Design's game, ported

**Owner's instruction (2026-10-09).** Port Claude Design's game from `docs/design/minpentai-intro-v3.dc.html` exactly, as its own engine for Learn, with tests that each lesson plays out as it does there. Label it plainly as rules invented for this edition; say that in the book the rule changes every match, with the block that says so; point to the sandbox for the rule recovered from the book's figure. The sandbox and the reconstruction stay as they are. P8 applies to what is presented as the book's and must not force the Learn game onto the recovered rule.

This replaces the engine-based Learn described in `minpentai-study.md` §14 (removed).

## 1. What was ported

Everything in Design's `<script type="text/x-dc">` that the phone uses: the pieces model, the seven lessons, Under the hood, the practice match and its bot, the scripted four-player broadcast, the camera, the HUD, and the frame.

| File | What it is | Design's source (script lines) |
|---|---|---|
| `src/lib/minpentai/learn-game/pieces.ts` | `PW`, `PH`, `COST`, `P_ T_ G_ Q_`, `BASE`, `pNew`, `pClone`, `towers`, `near`, `pStep`, `DIRS`, `DIAG`, `RULES` | 341–371 |
| `src/lib/minpentai/learn-game/cells.ts` | Under the hood's cell rule: `bApply`, `bStep`, `bBack`, `bStamp`, `live`, `GL` | 323–340 |
| `src/lib/minpentai/learn-game/lessons.ts` | `LS`: starts, goals, failures, demos, hints, zones, budgets, fog | 372–395 |
| `src/lib/minpentai/learn-game/broadcast.ts` | `TOWERS`, `STRIKES`, `OUT_AT`, `REACT`, `EVENTS`, `SEG`, `SHOTS`, `rng`, `makeWorld`/`WORLD`, `newSim`, `stepSim`, `slowAt`, `strikePos`; `shotAt` (Component.shot); `hudAt` (Component.hudTick) | 251–304, 403–485, 580–602, 670–681 |
| `src/lib/minpentai/learn-game/controller.ts` | Design's `Component`, method for method, with clock, random numbers and timers passed in: `seekTo`, `go`, `tick`, camera cut-or-ease, `hudTick`, `startLesson`, `lstep`, `lchange`, `lhud`, `lessonTick`, `pCheck`, `endTurn`, `botTurn`, `lreset`, `lessonPrimary`, `ltool`, `place`, `tap` (boardTap); `view()` = renderVals/learnVals/practiceVals as data | 487–953 |
| `src/app/minpentai/broadcast-scene.ts` | three.js scene (`build`) and per-frame drawing (`draw`) | 502–559, 603–655 |
| `src/app/minpentai/learn-draw.ts` | `drawBoard` (lesson board), `drawView` (player cams; whole field when WebGL is missing) | 657–669, 807–848 |
| `src/app/minpentai/learn.tsx`, `learn.css` | The frame: app bar, stage, HUD, controls, palette, tags, text, sources, footer, toast; the loop and 100 ms watchdog | markup 33–166; `loop`, `boot` |
| `src/lib/minpentai/learn-text.ts` | Every word (Design's plus this build's), draft | strings throughout |

Numbers, seeds (rng 7, 11, 42), speeds (DT 1/30, 10 steps a frame, 3/6/4 steps a second), timings (HUD 150 ms, strip 120 ms, toasts 2400 ms, demo 300 + 550 ms, flash 1600 ms, banners 2.4/3.8 s, slow motion 0.3× at 44.1–45 and 55.1–56) and the order of every random draw are Design's.

Routing: `/minpentai` first visit opens Learn (watch 1), as before the rebuild; tabs Learn, Practice, Play, Sandbox; `?lesson=1…17` (1–8 watch, 9–15 lessons, 16 Under the hood, 17 practice) and `?mode=practice`. The rail's meta reads "Tutorial" again. The old engine-based Learn (`lessons.ts`, `pieces.ts`, `segment.ts`, `broadcast.ts`, `broadcast.tsx`, `pieces-board.tsx`, `cells-view.tsx`, `scripts/test-minpentai-lessons.ts`, `scripts/search-minpentai-lessons.ts`) is removed. The sandbox, Play the computer, `engine.ts`, `match.ts`, `ai.ts` are unchanged.

## 2. Tests

`npm run test:minpentai-learn` (`scripts/test-minpentai-learn.ts`) reads Design's script out of `docs/design/minpentai-intro-v3.dc.html` at test time, runs it in `node:vm` (React, three.js and the DOM stubbed; `Math.random`, `performance.now` and the timers shared with the port), and runs the same actions on Design's `Component` and on `LearnController`. It asserts identical:

- constants and the world (towers, strikes with launch times, events, segments, shots, the rock field, walls, crews, lesson parameters and start positions, rule card, reasons, new rules);
- `bStep`/`bBack` on 20 random boards; `pStep` on 300 random positions × 40 steps (every rule: edges, enemy and own towers, squares cracking and breaking, rocks, enemy gliders meeting or swapping, diagonals);
- the broadcast at every frame across all eight screens: sim (drones, debris, walls, towers, flashes, emitters), HUD, the shot (position, look, FOV, label), the followed drone; also pause, BACK, looping past a segment's end, the hold on screen 8, slow motion, reduced motion, uneven frame times;
- every lesson: start, CELLS, sources, the demo by the big button (and a second press during it), ◁ STEP/STEP ▷/RESET, the visitor's own taps (hints, zone and cost toasts, taking back, every palette piece and direction), PLAY/PAUSE, failures (lesson 4 tower falls, lesson 5 miss), goals, BACK (lesson 1 → watch 8);
- Under the hood forward, back (not before its start), reset, the rule card;
- the practice match under each of the four new rules (seeds 7, 12, 1, 4), played to its end by a scripted visitor (squares, gliders, diagonals, towers, refused taps, pause, resume), then PLAY AGAIN and BACK;
- the screen's words: everything equal to Design's except the deliberate differences listed in the test's `DELIBERATE` (tags, corrected ids, added source lines).

Result: 25,946 checks, all identical. Planted divergences are caught (square hit points 2 → 3; the bot's square column 10–12 → 9–11; wall break chance .35 → .6). A tiny change that no random draw in the scripted runs reaches (wall break .35 → .36) is not caught; that is the limit of a run-based comparison.

Other runs: `npx tsc --noEmit` clean; `test-minpentai.ts` OK; `test-minpentai-match.ts` OK; `check:intro` passed; `check:ui` against a production build passed (56 pages, with every Learn screen); `check:principles --url=http://localhost:3318`: 30 pass, P6a fails only for `media.snowmoon.party` on localhost, P6d not run (the owner's accepted open item); 32 of 32 proven on planted violations.

## 3. Recordings

`scratchpad/learn-sbs/` (session scratchpad): Design served locally (three.js from its CDN, locally only) on the left, this build's production server on the right, the same actions by Playwright (Chrome) at 390 × 695, chapter by chapter: `watch1.mp4` … `watch8.mp4`, `l1.mp4` … `l7.mp4`, `hood.mp4`, `practice.mp4` (both sides seeded the same, so the same new rule and the same bot moves). `at-424/`: this build at 424 × 695 (watch 1, 2, lessons 4, 5, practice). `still-1440-pair.png`: both at 1440. `frames/`: stills taken from the pairs.

## 4. Differences from Design, screen by screen

Behaviour and timing are identical on every screen (section 2). What differs is listed; ✔ closed, ✖ not closed.

**Every screen**
- ✔ **The site's top bar** (closed 2026-10-09, owner: "Full screen for Learn's lessons and practice. Inside Farcaster, fill the frame."). Every Learn screen (watch, lessons, Under the hood, practice) is full screen under 768 px and inside the Farcaster mini app at any width: the frame is `position: fixed`, 100dvh, inside the safe area (`env(safe-area-inset-*)`, or in the mini app the host's `context.client.safeAreaInsets`), and the site's top bar and first-visit "What is this?" link are hidden (in the mini app also the rail and the assistant panel). Before, the frame sat under the 44 px top bar (and, on a first visit, the 31 px "What is this?" link). Full screen for all Learn screens, not only lessons and practice, because Design's frame is the same on every screen and switching the site's bar on and off between screens would jump.
- ✔ deliberate **× back to the site** (added with full screen): a 44 × 44 × link at the left of Design's app bar, to `/`, labelled "Exit Learn, back to Snowmoon"; shown only when full screen. The title moves 26 px right. Farcaster draws its own close button over the mini app. Escape does nothing: leaving the page on Escape would surprise, and on tablet and desktop, where a keyboard is usual, Learn is not full screen.
- ✔ deliberate **Tags scroll with the text.** Design's tag row is fixed above the text; here it is the first thing in the scrolling text area, same spacing, so lesson 5 and practice keep the footer in view on short phones.
- ✔ deliberate **"RULES INVENTED FOR THIS EDITION" tag** on every watch screen, lessons 1–7 and practice (replacing GAME SIMPLIFIED on the lessons). Not on Under the hood (the book's rule). Rows wrap one line more.
- ✔ deliberate **Text back at the top on a new screen** (Design's text box keeps its scroll position between screens).
- ✔ deliberate **Skip to free play** opens Free play, Design's practice match on its own (Design shows "Not part of this mockup"). Until 2026-10-09 it opened the sandbox (§11).
- ✖ **Glyphs DM Mono lacks** (← ↑ ↓ → and the diagonals, ●, ◁, ▷, ▶) come from the site's DM Mono fallback face; Design's browser drew them in plain `monospace`. The direction arrows look visibly larger than Design's. Not closed: drawing them in `monospace` fails check:ui's rule that chrome uses only the site's fonts; closing it means adding an arrow glyph source to the site's label font, the owner's call.
- ✔ deliberate **Tablet and desktop (768 px and up, outside the mini app):** Design's 390 × 695 phone, centred in the page beside the site's rail, with the site's rail and assistant (not full screen).
- ✔ deliberate **Address bar** follows the screen (`?lesson=n`, `?mode=practice`).

**Watch 1–8**
- ✖ **three.js 0.186 (bundled) vs 0.160 (CDN).** 0.186 removed `PCFSoftShadowMap` and uses `PCFShadowMap`: shadow edges are slightly harder. Everything else in the scene is the same code.
- ✖ **At 424 px wide** the broadcast is 424 × 260, so the camera's aspect is a little wider than Design's 390 × 260.
- ✔ deliberate **Commentary, pause, CELLS outside `role="img"`.** The stage image holds only the 3D; HUD boxes are decorative (`aria-hidden`); commentary is `aria-live`.
- ✔ deliberate **Screen 2 keeps its pause** (Design hides it with the commentary, §13.1), at top 44 px right, above the player cams; the commentary is visually hidden there but still announced.
- ✔ deliberate **Screens 7 and 8 tagged BROADCAST IMAGINED** (§13.3).
- ✔ deliberate **No WebGL:** the same scripted match drawn flat from above (Design showed a note promising "the flat match view").
- ✔ Pause glyph sits top-left in its box, as in Design (`display: flex`).
- ✔ Corrected source ids (study §14.3): c4-b58 · c4-b78, c12-b149, c4-b78, c7-b86, c7-b13–b14. Watch 1 adds a source line saying the Learn game's rules are invented.
- ✔ deliberate: watch 1, lesson 7 and practice quote c4-b84 ("every game there's always some kind of new rule") where Design wrote "A new rule every game" (§6).

**Lesson 1 Keep your towers** — ✔ deliberate: the rules note and the sandbox link; sources add c4-b84 (quoted) and c4-b5 · c4-b7; "Most towers when time runs out" now cites *invented* (Design cited match.ts, which Learn no longer uses).
**Lesson 2 Gliders fly straight** — no difference beyond the tag.
**Lesson 3 A hit destroys a tower** — none beyond the tag.
**Lesson 4 Squares bounce gliders** — ✔ deliberate: keyboard placing (below).
**Lesson 5 Your turn to act** — ✔ deliberate: keyboard placing; "8 points; glider 4…" cites *invented*. ✔ the text area is 138 px at 390 × 695 and 424 × 695, full screen (Design 77 px, §13.9; before full screen it was 63 px under the top bar and the first-visit link).
**Lesson 6 You only see near your towers** — none beyond the tag.
**Lesson 7 Every match, a new rule** — ✔ deliberate: rules note and sandbox link; added sources; Design's "A new rule every game" is replaced by the c4-b84 quote (listed once).
**Under the hood** — none.
**Practice** — ✔ deliberate: tags RULES INVENTED + DRAFT WORDING (Design none, §13.4); rules note; c7-b13–b14; keyboard placing.

**Keyboard placing (added).** When a board takes pieces it is focusable (`role="application"`): arrow keys move a dashed outline, Enter or Space taps that square (the same `tap` as a pointer). The outline shows only for keyboard focus. The board's label says which square and what is on it.

## 5. What is inconsistent or unfinished in Design's game

Ported as Design has it unless an owner non-negotiable says otherwise; the old engine is never substituted.

1. **Resigning exists only in the scripted broadcast** (Amber at 58.2 s). Screen 6 says "A player who sees the end coming can resign", but the practice match has no way to resign and the bot never does. Ported as is; a resign control would be new design.
2. **The broadcast's rules are not the lessons' rules.** Drones never destroy towers (every tower loss is a hand-timed strike); drones pass through their own walls and break enemy walls 35% of the time on one hit (lessons: any square cracks, breaks on the second hit, with the glider); rocks turn a drone 90° half the time (lessons: always straight back); drones expire after 8–14 s. Ported as is.
3. **RESET does not clear a met goal.** After a lesson's goal is met, RESET restarts the board but the status keeps "NICE. YOU DID IT."/"LIKE THAT." and the button stays NEXT, so the demo can no longer be seen there. Ported as is.
4. **Diagonal gliders that cross between squares don't meet.** Only same-square or exact swaps count; two enemy diagonals crossing in an X pass through. Ported as is.
5. **The bot** reads the whole board (ignores fog), never builds towers, never fires diagonally even under the diagonal rule, and always has 8 points. Ported as is.
6. **Hidden information shows**: in lesson 6 and practice the strip counts Amber's towers in the dark (§13.8). Ported as is.
7. **Practice toast** "Press reset to plan again" though practice has no reset (§13.5). Ported as is (draft wording).
8. **Lesson 5's demo fires in the last direction chosen** (§13.6). Ported as is (the test exercises it).
9. **The big button ignores presses during a demo** (§13.7). Ported as is.
10. **Screen 2 hides the pause** (§13.1): not ported (an accessibility rule: moving content must be pausable).
11. **Screens 7, 8 lack BROADCAST IMAGINED; practice has no tags** (§13.3, §13.4): fixed (everything invented carries a tag).
12. **Citation slips** (§13.11): corrected.
13. **"Slow motion for the half-second"** vs 0.9 s windows in code (§13.12): the code's 0.9 s is ported.
14. **The "−1 NAME" at top 44 px** touches the two-line scoreboard when the name is long: ported as is.
15. **Text area of 77 px on lesson 5 and practice** (§13.9): here 138 px (lesson 5) and 190 px (practice) at 390 × 695, full screen; the tags scroll with the text (see §4).
16. Unused mockup code (tags `rocks`, `recon`, `note`; `isHand`, `pipRef`, `points`; the ninth `SEG`; `SHIP` = `GLIDER`): not ported except `SEG[8]` and `SHIP`, kept for the line-for-line comparison.

## 6. The block on new rules (c4-b84), quoted

**c4-b84**: "Though every game there's always some kind of new rule, and the most important tactic of all was knowing how to adapt." That is the one block that says it of every game, and the note quotes it rather than paraphrasing it (owner, 2026-10-09: "Quote that; don't say the rule changes every match"). Supporting, not cited on the screen: c4-b148 (the priests decide the rule sets), c12-b147 ("today's rule change … played on a hex grid"), c7-b13–b14, c7-b63, c14-b33. Caveat: c4-b84 says "some kind of new rule", not that the board's cell rule changes; in c4-b102–b148 the new rule turns out to be about team selection, not the cells. The note quotes c4-b84's words so P8c checks them.

Wording on lesson 1, lesson 7 and practice (draft): "The rules of this game are invented for this edition. The book says that "every game there's always some kind of new rule" (c4-b84). The rule recovered from the book's figure (c4-b5, c4-b7) has its own page." Link: "THE RULE RECOVERED FROM THE BOOK'S FIGURE →" to `/minpentai/rule` (§11). (Before 2026-10-09 it read "In the book, the rule changes every match: …", and its last sentence and link pointed to the sandbox.)

The source lines that read "A new rule every game" (watch 1, lesson 7, practice; Design's) now quote c4-b84; lesson 7 lists the quote once. Kept as Design's framing of its own game, not presented as the book's words: watch 1's "Before every match, the priests secretly choose a new rule." (Design's paraphrase of c4-b84 and c4-b148, both cited beside it), lesson 7's title "Every match, a new rule" and its text, and the reasons list's "The rules change every match." (in Design's game the practice match does draw a new rule each time: `practice.rule`).

## 7. Check changes

**P8c, before** ("the Minpentai lessons cite a real block for every book claim, and their Dzegoban is the source's"): read the sources of the old `LEARN_TEXT.watch/lessons/hood/practice`; each source must be a block id that exists (quoted words in it), `invented…`, or `src/…`; every FROM THE BOOK screen cites a block; every all-caps run of four or more words in `src/app/minpentai/broadcast.tsx` must appear in chapter 4, and that file must contain "The battle begins in fifty ticks." (c4-b98). Plant: a source → `c4-b9999`; the countdown → "TAO".

**P8c, after** ("what Learn says about the book cites a real block, and its Dzegoban is the source's (its own game is not checked against the book)"):
- inputs: every screen's sources in the new `learn-text.ts` (watch, lessons, hood, practice) **plus the rules note** (its block ids and its quote);
- a source may also be `docs/…`, and a `src/…` or `docs/…` source must now **exist** (stricter);
- the countdown is checked from `learn-text.ts`: `hud.dz` must be c4-b97's Dzegoban, `hud.dzEnglish` must equal c4-b98, and `learn.tsx` must render both. The all-caps scan of a source file is dropped: it now reads Learn's own labels (e.g. "RULES INVENTED FOR THIS EDITION") as Dzegoban;
- unchanged: block ids exist, quotes in the cited blocks, FROM THE BOOK screens cite a block;
- **nothing in P8c reads the Learn game's rules**: they are invented and not compared with the recovered rule (it never did compare them; what bound the old Learn to the engine was `test-minpentai-lessons.ts`, now removed, and that build's choice).
- Plant: a source → `c4-b9999`; `hud.dz` → "TAO". Each part was also proven separately: the Dzegoban (TAO), the note's quote ("novel rule" → not in c4-b84), a missing `docs/` file.

**P8d, new** ("the Learn game is labelled as rules invented for this edition, and points to the book's rule in the sandbox"): the `rules` tag says "invented for this edition"; every watch screen, lesson and practice carries it and DRAFT WORDING; Under the hood does **not** carry it and cites c4-b5; the note says invented for this edition, says with c4-b84 that the rule changes every match, names c4-b5 and the sandbox; lessons goal, rule and practice show it; `learn.tsx` renders the tags and the note with its sandbox link. Plant: drop the tag from one screen (also proven: the tag on Under the hood; the note's sentence changed).

**P8d, changed 2026-10-09** (owner: quote c4-b84, don't say the rule changes every match). Name before: "the Learn game is labelled as rules invented for this edition, and points to the book's rule in the sandbox"; after: "the Learn game is labelled as rules invented for this edition, quotes c4-b84 on new rules, and points to the book's rule in the sandbox".
- Before: `if (!/rule changes every match/i.test(note.text) || !/c4-b84/.test(note.text))` → "rules note: does not say, with c4-b84, that in the book the rule changes every match".
- After: the note must contain the quote `"every game there's always some kind of new rule"` (straight or curly apostrophe) and `c4-b84`; and outside quotation marks, the note, its link and every screen's source line must not match `rule(s) change/changes/changed/changing/is changed/are changed [with/for/in] every/each match/game` or `new/different rule(s) every/each match/game`.
- Plant unchanged (drop the tag from one screen). The new parts proven separately: the old note and Design's three "A new rule every game" source lines fail (4 problems); a note without the quote fails.

**check:ui**: `MINPENTAI_LESSONS` 1 → 17 (every Learn screen, light and dark, 390 px); new per-screen checks: the "RULES INVENTED FOR THIS EDITION" tag is shown (absent on Under the hood), and the footer is in view.

**check:ui, full screen (2026-10-09).** Before: at 390 × 844 each Learn screen checked the tag and that the footer is in view; at 424 × 695 only that /chapter/1 has no rail; at 1024/1440/2000 /minpentai was checked like any page (floors, no sideways scroll, column ≤ 700 px, no top bar). After, added: (1) at 390 × 844, on all 17 Learn screens, light and dark, `checkLearnFullScreen`: the frame's box is the viewport (0, 0, full width and height, ±1 px), the site's top bar is not visible, and a visible `.ml-exit` links to `/`; (2) at 424 × 695 (the Farcaster frame) the same on watch 1, lesson 5, Under the hood and practice, plus the footer in view; (3) at 1024/1440/2000, /minpentai shows no `.ml-exit` and the rail is visible (not full screen). Proven: injecting `.ml-learn{position:relative;height:600px} .ml-exit{display:none}` fails it (80 problems).

**check:miniapp, full screen (2026-10-09).** Before: home, a chapter and /assistant in the stand-in Farcaster client. After, added: /minpentai?lesson=13 and ?mode=practice in the 424 × 695 iframe: Learn marks itself in the mini app (`html.ml-in-app`), its frame is the iframe's viewport (±1 px), the site's top bar is hidden, `.ml-exit` links to `/`, ready() is called once, no page errors. (It caught one bug while being written: `sdk.context.catch` is sent to the host as a remote call.)

**docs/principles.md §8** updated to say this.

## 8. Wording

All strings are in `src/lib/minpentai/learn-text.ts`, draft, one DRAFT WORDING tag per screen. New in this build (not Design's): the RULES INVENTED FOR THIS EDITION tag; the rules note and its link; the source lines "In the book, "every game there's always some kind of new rule"" (c4-b84), "The rule page runs the rule recovered from the book's animated board" (c4-b5 · c4-b7), "The rules of the Learn game … are invented for this edition" (invented); the keyboard hint and square descriptions; the no-WebGL line; the full-screen × and its label. The full list is in section 10.

## 9. Principles

**Tensions first.**
- *Exact port vs accessibility (owner rules).* Design hides the pause on screen 2, nests controls in `role="img"`, places pieces by pointer only: changed (pause kept, controls outside the image, keyboard placing). Everything else in Design's behaviour is kept, including slips that are not accessibility problems (§5).
- *Exact port vs the site frame.* Closed 2026-10-09: Learn is full screen on phones and in the Farcaster frame. Tension left: on a first visit straight to /minpentai on a phone, full screen hides the site's menu and "What is this?" link (the intro and the "not affiliated" line are one tap away, through × to the home page).
- *Labelling vs Design's look.* The new tag adds a line of tags on every screen.

1. **Recipes for generated assets** — pass; nothing generated.
2. **AI declarations / human authors** — pass; all Learn wording is marked draft (model-drafted, Design's and this build's), as before.
3. **Open models, recipes** — pass; no models.
4. **Signed-in writes** — pass; no writes.
5. **Nothing canon** — pass; the Learn game is labelled invented, the book's rule is pointed to.
6. **Privacy, no third-party requests** — pass: three.js is bundled (0.186.1), fonts are the site's; Design's CDN loads only on the local recording server. P6a's failure is localhost-only (media.snowmoon.party); P6d is the accepted open item.
7. **Payments don't change ranking** — pass.
8. **Dzegoban, Minpentai and in-world screens match the source** — pass with the scope the owner set: what is presented as the book's (the sandbox's recovered rule and c4-b5 board, unchanged; Under the hood; the Dzegoban countdown c4-b97–b98; every book claim with a block id, corrected per §14.3) is checked by P8a–P8c; the Learn game is invented and says so (P8d). Concern: c4-b84 says "some kind of new rule" every game, not that the cell rule itself changes (§6).

## 10. Every string (from `learn-text.ts`)

Templates show their slots as `{a}`, `{b}`.

- `appTitle`: "Learn Minpentai"
- `skip`: "SKIP TO FREE PLAY"
- `exit`: "×"
- `exitLabel`: "Exit Learn, back to Snowmoon"
- `back`: "BACK"
- `next`: "NEXT"
- `startLessons`: "START THE LESSONS"
- `startPractice`: "START A PRACTICE MATCH"
- `watchOf`: "WATCH · {a} / {b}"
- `learnOf`: "LEARN · {a} / {b}"
- `learnOptional`: "LEARN · OPTIONAL"
- `practiceLabel`: "PRACTICE"
- `sources`: "HIDE SOURCES ({b})"
- `tags.book`: "FROM THE BOOK"
- `tags.imag`: "BROADCAST IMAGINED"
- `tags.lens`: "CLEAR LENSES INVENTED"
- `tags.inv`: "SYMBOL SHAPE INVENTED"
- `tags.rules`: "RULES INVENTED FOR THIS EDITION"
- `tags.draft`: "DRAFT WORDING"
- `rulesNote.text`: "The rules of this game are invented for this edition. The book says that \"every game there's always some kind of new rule\" (c4-b84). The rule recovered from the book's figure (c4-b5, c4-b7) has its own page."
- `rulesNote.link`: "THE RULE RECOVERED FROM THE BOOK'S FIGURE →"
- `rulesNote.href`: "/minpentai/rule"
- `cams.crane`: "CAM 1 · CRANE"
- `cams.wide`: "CAM 2 · WIDE"
- `cams.cyanCorner`: "CAM 3 · CYAN CORNER"
- `cams.follow`: "CAM 4 · FOLLOW"
- `cams.low`: "CAM 5 · LOW"
- `cams.amberCorner`: "CAM 6 · AMBER CORNER"
- `cams.symbol`: "CAM 7 · SYMBOL"
- `cams.overhead`: "CAM 8 · OVERHEAD"
- `events.setup`: "Setup. Each player builds in their own corner."
- `events.begins`: "The battle begins."
- `events.see`: "The players see only near their own towers. The crowd sees all of it."
- `events.fly`: "Gliders fly straight and bounce off squares and rocks."
- `events.intervention`: "Intervention turn. Everyone may put down a few squares."
- `events.forward`: "Cyan and Amber each build a forward tower."
- `events.pink1`: "Pink loses a tower. Two left."
- `events.pink2`: "Pink loses another. One left."
- `events.violetHits`: "Violet hits back at Amber."
- `events.pinkOut`: "Pink is out."
- `events.violetForward`: "Violet takes out Cyan's forward tower."
- `events.cyanAnswers`: "Cyan answers. Violet is down to two."
- `events.amberHits`: "Amber hits Violet too."
- `events.violetOut`: "Violet is out."
- `events.cyanStrikes`: "Cyan strikes Amber's forward tower."
- `events.resigns`: "Amber resigns. Cyan wins."
- `events.wreckage`: "Most of the board is wreckage now."
- `events.above`: "From above, the same match is a flat board."
- `events.bBegins`: "BATTLE BEGINS"
- `events.bIntervention`: "INTERVENTION TURN"
- `events.bPinkOut`: "PINK IS OUT"
- `events.bVioletOut`: "VIOLET IS OUT"
- `events.bCyanWins`: "CYAN WINS"
- `hud.live`: "LIVE · "
- `hud.turn`: "TURN {a}"
- `hud.out`: "OUT"
- `hud.minus`: "−1 {A}"
- `hud.atConsole`: "{A} · AT THE CONSOLE"
- `hud.camOut`: " · OUT"
- `hud.dz`: "MU GU GEI TAU FA"
- `hud.dzEnglish`: "The battle begins in fifty ticks."
- `hud.pause`: "II"
- `hud.play`: "▶"
- `hud.pauseLabel`: "Pause the match"
- `hud.playLabel`: "Play the match"
- `hud.noGL`: "3D isn't available here. This is the same match from above."
- `stageWatch`: "Imagined broadcast of a Minpentai match. "
- `stageLearn`: "Minpentai board. "
- `watch[0].title`: "A game a whole country watches"
- `watch[0].text`: "In Dzego, Minpentai fills a giant hall inside a mountain, with over a thousand people watching. Before every match, the priests secretly choose a new rule."
- `watch[0].caption`: "Players learn the rule only when the match starts, then get a set time to build. In one match it is twenty minutes."
- `watch[0].button`: "NEXT"
- `watch[0].sources[0][0]`: "A giant room inside the mountain, over a thousand watching"
- `watch[0].sources[0][1]`: "c4-b58 · c4-b78"
- `watch[0].sources[1][0]`: "\"Every game there's always some kind of new rule\"; the priests \"decide on the rule sets\""
- `watch[0].sources[1][1]`: "c4-b84 · c4-b148"
- `watch[0].sources[2][0]`: "\"MU GU GEI TAU FA\" · The battle begins in fifty ticks."
- `watch[0].sources[2][1]`: "c4-b97–b98"
- `watch[0].sources[3][0]`: "Players are kept offline so they cannot learn the rule early"
- `watch[0].sources[3][1]`: "c12-b133–b134"
- `watch[0].sources[4][0]`: "Twenty minutes to build before the battle"
- `watch[0].sources[4][1]`: "c12-b149"
- `watch[0].sources[5][0]`: "The rules of the Learn game (towers, gliders, squares, rocks, turns to act, the new rules) are invented for this edition"
- `watch[0].sources[5][1]`: "invented"
- `watch[1].title`: "Every player plays alone"
- `watch[1].text`: "Each player sits at a console in glasses on a cable, and sees only the board near their own towers. The crowd sees the whole board, and the players' faces."
- `watch[1].caption`: "Under each face is what that player sees right now."
- `watch[1].button`: "NEXT"
- `watch[1].sources[0][0]`: "Devices handed over in the elevator"
- `watch[1].sources[0][1]`: "c4-b77"
- `watch[1].sources[1][0]`: "A giant game console with a chair"
- `watch[1].sources[1][1]`: "c4-b78"
- `watch[1].sources[2][0]`: "Glasses on a cable at the console"
- `watch[1].sources[2][1]`: "c4-b82"
- `watch[1].sources[3][0]`: "The book never says whether the lenses are clear. Here they are, so the eyes show."
- `watch[1].sources[3][1]`: "invented"
- `watch[1].sources[4][0]`: "Teammates normally talk by voice chat"
- `watch[1].sources[4][1]`: "c4-b99"
- `watch[1].sources[5][0]`: "\"On the big screen, the audience watched.\""
- `watch[1].sources[5][1]`: "c7-b86"
- `watch[1].sources[6][0]`: "A symbol lets its owner see within thirty squares"
- `watch[1].sources[6][1]`: "c4-b93"
- `watch[1].sources[7][0]`: "The crowd sees a large detailed map"
- `watch[1].sources[7][1]`: "c4-b114"
- `watch[2].title`: "Then the battle runs itself"
- `watch[2].text`: "Once it starts, the players can only watch. Gliders fly out in straight lines. Squares and rocks bounce them back."
- `watch[2].caption`: "In the broadcast, each glider is drawn as a drone."
- `watch[2].button`: "NEXT"
- `watch[2].sources[0][0]`: "Gliders, walls, rocks"
- `watch[2].sources[0][1]`: "c4-b84"
- `watch[2].sources[1][0]`: "In the book, gliders hitting rocks can make more gliders. Here rocks only bounce them."
- `watch[2].sources[1][1]`: "c4-b108"
- `watch[3].title`: "A turn to act"
- `watch[3].text`: "Every so often, each player may put down a few pieces near their own towers. Then the match runs on without them."
- `watch[3].caption`: "The crews stand for squares being placed."
- `watch[3].button`: "NEXT"
- `watch[3].sources[0][0]`: "\"All players were able to put down more squares near any copy of their symbols\""
- `watch[3].sources[0][1]`: "c4-b110"
- `watch[4].title`: "Lose every tower and you are out"
- `watch[4].text`: "Each player starts with a few towers. A glider that reaches an enemy tower destroys it. The scoreboard counts the towers each player has left."
- `watch[4].caption`: "A white ring marks the tower about to be hit. The book calls towers symbols."
- `watch[4].button`: "NEXT"
- `watch[4].sources[0][0]`: "Symbols give sight around them"
- `watch[4].sources[0][1]`: "c4-b93"
- `watch[4].sources[1][0]`: "A player with no symbols left is out"
- `watch[4].sources[1][1]`: "c4-b136–b138"
- `watch[4].sources[2][0]`: "The symbol shape is invented; the book never draws one"
- `watch[4].sources[2][1]`: "docs/minpentai-rules.md §1.3"
- `watch[5].title`: "The last one standing wins"
- `watch[5].text`: "The last player with towers left wins. If time runs out, most towers wins. A player who sees the end coming can resign."
- `watch[5].button`: "NEXT"
- `watch[5].sources[0][0]`: "A player resigns"
- `watch[5].sources[0][1]`: "c4-b141"
- `watch[5].sources[1][0]`: "A player is out when every symbol is gone"
- `watch[5].sources[1][1]`: "c4-b136–b138"
- `watch[6].title`: "Your season"
- `watch[6].text`: "You are a young player in your last year of school tournaments. Win, and you go to the nationals, with prize money on the line."
- `watch[6].caption`: "Practice against bots only goes so far. They play the standard rules well and adapt badly to a new one."
- `watch[6].button`: "NEXT"
- `watch[6].sources[0][0]`: "Last year to compete; winning means the nationals"
- `watch[6].sources[0][1]`: "c4-b15"
- `watch[6].sources[1][0]`: "Prize money"
- `watch[6].sources[1][1]`: "c4-b73"
- `watch[6].sources[2][0]`: "Bots are strong on stock Minpentai, weak on new rules"
- `watch[6].sources[2][1]`: "c7-b13–b14"
- `watch[6].sources[3][0]`: "\"A high-entropy wasteland\""
- `watch[6].sources[3][1]`: "c4-b140"
- `watch[7].title`: "Now try it yourself"
- `watch[7].text`: "From above, the match is a flat board of towers, gliders and squares. Next, learn each piece on that board."
- `watch[7].button`: "START THE LESSONS"
- `watch[7].sources[0][0]`: "The rule was recovered from the book's animated board"
- `watch[7].sources[0][1]`: "c4-b5 · c4-b7"
- `lessons.goal.title`: "Keep your towers. Destroy theirs."
- `lessons.goal.text`: "You are Cyan. Each player starts with a few towers, and your score is how many you have left. Lose them all and you are out. The last player with towers wins."
- `lessons.goal.caption`: "If a match runs long, whoever has the most towers when time runs out wins."
- `lessons.goal.button`: "NEXT"
- `lessons.goal.sources[0][0]`: "A player with no symbols left is out"
- `lessons.goal.sources[0][1]`: "c4-b136–b138"
- `lessons.goal.sources[1][0]`: "The book calls them symbols. Here they are drawn as towers."
- `lessons.goal.sources[1][1]`: "invented"
- `lessons.goal.sources[2][0]`: "Most towers when time runs out"
- `lessons.goal.sources[2][1]`: "invented"
- `lessons.goal.sources[3][0]`: "In the book, \"every game there's always some kind of new rule\""
- `lessons.goal.sources[3][1]`: "c4-b84"
- `lessons.goal.sources[4][0]`: "The rule page runs the rule recovered from the book's animated board"
- `lessons.goal.sources[4][1]`: "c4-b5 · c4-b7"
- `lessons.glider.title`: "Gliders fly straight"
- `lessons.glider.text`: "A glider flies in a straight line, up, down, left or right, one square per step. It bounces off the edge. Press play."
- `lessons.glider.caption`: "In the match, these were the drones."
- `lessons.glider.button`: "PLAY IT"
- `lessons.glider.sources[0][0]`: "Gliders"
- `lessons.glider.sources[0][1]`: "c4-b84"
- `lessons.glider.sources[1][0]`: "One square per step stands for a real glider’s two cells every four turns"
- `lessons.glider.sources[1][1]`: "src/lib/minpentai/glider.ts"
- `lessons.hit.title`: "A hit destroys a tower"
- `lessons.hit.text`: "When a glider reaches an enemy tower, the tower is gone. That is how you score. Press play and watch Amber’s score."
- `lessons.hit.button`: "PLAY IT"
- `lessons.hit.metText`: "AMBER −1."
- `lessons.hit.sources[0][0]`: "Symbols lost to attacks; out when none are left"
- `lessons.hit.sources[0][1]`: "c4-b136–b138"
- `lessons.square.title`: "Squares bounce gliders"
- `lessons.square.text`: "An Amber glider is coming for your tower. Tap one of the outlined spots to put a square in its way, then press play."
- `lessons.square.caption`: "A square survives one hit and cracks. The second hit breaks it, and the glider breaks with it."
- `lessons.square.button`: "BLOCK IT FOR ME"
- `lessons.square.failText`: "YOUR TOWER FELL. PRESS RESET AND TRY AGAIN."
- `lessons.square.sources[0][0]`: "Walls"
- `lessons.square.sources[0][1]`: "c4-b84"
- `lessons.square.sources[1][0]`: "No wall is invincible"
- `lessons.square.sources[1][1]`: "c4-b9 · c4-b13"
- `lessons.turn.title`: "Your turn to act"
- `lessons.turn.text`: "Every so often you get 8 points to spend near your own towers. A glider costs 4, a square 1 and a tower 4. Pick a glider’s direction with the arrows. Take out Amber’s last tower."
- `lessons.turn.caption`: "Between turns to act, the match runs by itself. The lit area is where you may build."
- `lessons.turn.button`: "DO IT FOR ME"
- `lessons.turn.failText`: "MISSED. PRESS RESET AND TRY ANOTHER ROW."
- `lessons.turn.sources[0][0]`: "Players put down more squares near their symbols"
- `lessons.turn.sources[0][1]`: "c4-b110"
- `lessons.turn.sources[1][0]`: "8 points; glider 4, square 1, tower 4"
- `lessons.turn.sources[1][1]`: "invented"
- `lessons.sight.title`: "You only see near your towers"
- `lessons.sight.text`: "Beyond a few squares of your towers, the board is dark. Press play. Something is coming."
- `lessons.sight.caption`: "Lose a tower and you see less. Build one and you see more."
- `lessons.sight.button`: "PLAY IT"
- `lessons.sight.metText`: "YOU LOST A TOWER, AND YOUR VIEW SHRANK."
- `lessons.sight.sources[0][0]`: "A symbol lets its owner see around it"
- `lessons.sight.sources[0][1]`: "c4-b93"
- `lessons.rule.title`: "Every match, a new rule"
- `lessons.rule.text`: "Before each match, the priests pick a new rule, and players learn it only when the match begins. That is what makes Minpentai hard:"
- `lessons.rule.button`: "START A PRACTICE MATCH"
- `lessons.rule.sources[0][0]`: "In the book, \"every game there's always some kind of new rule\""
- `lessons.rule.sources[0][1]`: "c4-b84"
- `lessons.rule.sources[1][0]`: "Players are kept offline so they cannot learn it early"
- `lessons.rule.sources[1][1]`: "c12-b133–b134"
- `lessons.rule.sources[2][0]`: "The rule page runs the rule recovered from the book's animated board"
- `lessons.rule.sources[2][1]`: "c4-b5 · c4-b7"
- `lessons.hood.title`: "Under the hood"
- `lessons.hood.text`: "Every piece is a few cells, moved by one rule from the book. This is a glider, cell by cell. Press play."
- `lessons.hood.caption`: "You never need this to play."
- `lessons.hood.button`: "PLAY IT"
- `lessons.hood.sources[0][0]`: "The rule, recovered from the book’s animated board"
- `lessons.hood.sources[0][1]`: "c4-b5 · c4-b7"
- `lessons.practice.title`: "Practice match"
- `lessons.practice.text`: ""
- `lessons.practice.button`: "END TURN"
- `lessons.practice.sources[0][0]`: "Players put down squares near their symbols on turns to act"
- `lessons.practice.sources[0][1]`: "c4-b110"
- `lessons.practice.sources[1][0]`: "In the book, \"every game there's always some kind of new rule\""
- `lessons.practice.sources[1][1]`: "c4-b84"
- `lessons.practice.sources[2][0]`: "Sight near your symbols"
- `lessons.practice.sources[2][1]`: "c4-b93"
- `lessons.practice.sources[3][0]`: "8 points; glider 4, square 1, tower 4"
- `lessons.practice.sources[3][1]`: "invented"
- `lessons.practice.sources[4][0]`: "Amber is a simple bot. In the book, bots handle new rules badly."
- `lessons.practice.sources[4][1]`: "c7-b13–b14"
- `lessons.practice.sources[5][0]`: "The rule page runs the rule recovered from the book's animated board"
- `lessons.practice.sources[5][1]`: "c4-b5 · c4-b7"
- `status.you`: "NICE. YOU DID IT."
- `status.demo`: "LIKE THAT."
- `toasts.locked`: "Your turn to act is over. Press reset to plan again."
- `toasts.zone`: "Too far from your towers. Build in the lit area."
- `toasts.cost`: "Not enough points left. Tap a piece you placed to take it back."
- `board.controls`: "Board controls"
- `board.stepBack`: "◁ STEP"
- `board.stepBackLabel`: "Step back one turn"
- `board.play`: "PLAY"
- `board.pause`: "PAUSE"
- `board.step`: "STEP ▷"
- `board.stepLabel`: "Step forward one turn"
- `board.reset`: "RESET"
- `board.cells`: "CELLS"
- `board.pieces`: "Pieces to place"
- `board.tool`: "{A} · {b}"
- `board.dir`: "Glider flies {a}"
- `board.strip`: "{a} · CYAN {b} · AMBER {c}{d}"
- `board.stripTurn`: "TURN {a}"
- `board.stripPts`: " · {a} PTS"
- `board.stripCells`: "TURN {a} · LIVE CELLS {b}"
- `board.out`: "OUT"
- `board.keys`: "Arrow keys move the outline on the board; Enter or Space puts a piece down, or takes back one you placed."
- `board.at`: "Square {a}1 across, {b}1 down: {c}."
- `board.what.empty`: "empty"
- `board.what.dark`: "dark"
- `board.what.tower`: "tower"
- `board.what.glider`: "glider"
- `board.what.square`: "square"
- `board.what.rock`: "rock"
- `board.what.cyan`: "Cyan"
- `board.what.amber`: "Amber"
- `reasons[0]`: "You only see near your towers."
- `reasons[1]`: "You can act only on your turns."
- `reasons[2]`: "The rules change every match."
- `reasons[3]`: "No square stops everything forever."
- `hoodLink`: "UNDER THE HOOD, OPTIONAL →"
- `rule.show`: "HOW THE RULE WORKS"
- `rule.hide`: "HIDE HOW THE RULE WORKS"
- `rule.rows[0][0]`: "0 OR 4 LIVE"
- `rule.rows[0][1]`: "Nothing changes."
- `rule.rows[1][0]`: "1 LIVE"
- `rule.rows[1][1]`: "On odd turns it jumps to the opposite corner."
- `rule.rows[2][0]`: "2 LIVE"
- `rule.rows[2][1]`: "Every cell flips: live becomes empty, empty becomes live."
- `rule.rows[3][0]`: "3 LIVE"
- `rule.rows[3][1]`: "On even turns the block turns half a circle."
- `rule.closing`: "The blocks shift one cell diagonally every turn, so cells pass from block to block. Nothing is ever created or destroyed."
- `practice.titles.win`: "You win"
- `practice.titles.lose`: "Amber wins"
- `practice.titles.draw`: "A draw"
- `practice.act0`: "Amber’s towers mirror yours on the far side. You see them only until this turn ends. Spend 8 points in the lit area, then end your turn."
- `practice.act`: "Your turn. Amber’s towers are where they started. Spend 8 points, then end your turn."
- `practice.run`: "The match runs by itself until your next turn. Pause any time."
- `practice.over.win`: "Amber is out of towers, or had fewer when time ran out."
- `practice.over.lose`: "Amber outlasted you. Squares in your towers’ rows are your best defence."
- `practice.over.draw`: "Same number of towers when time ran out."
- `practice.rule`: "New rule this match: {a}"
- `practice.rules.diag`: "Gliders may also fly diagonally."
- `practice.rules.cost`: "Gliders cost 3 points."
- `practice.rules.fog`: "You see only 2 squares around your towers."
- `practice.rules.every`: "Turns to act come every 8 steps."
- `practice.buttons.act`: "END TURN"
- `practice.buttons.pause`: "PAUSE"
- `practice.buttons.resume`: "RESUME"
- `practice.buttons.again`: "PLAY AGAIN"
- `practice.status.act`: "YOUR TURN · STEP {a}"
- `practice.status.run`: "NEXT TURN AT STEP {a}"
- `practice.status.win`: "YOU WIN."
- `practice.status.lose`: "AMBER WINS."
- `practice.status.draw`: "DRAW."

## 11. Free play, and the book's rule on its own page (2026-10-09)

Owner: "Take the sandbox and the old 'Play the computer' out of the tabs. Free play becomes Design's game. Keep the rule recovered from the book's figure on one small page, linked from the rules note, and point P8d at it. Keep the old code and docs in the repo."

**Free play is Design's practice match on its own.** Design's file has one game a player can play freely: the practice match against Amber, with a new rule drawn each time (`practice.rules`). It has no free board. A free board would be a new game, invented here. Free play opens that match in Design's frame (`learn.tsx` with `free`), without the course around it: the app bar reads "Minpentai" and "LEARN THE GAME" (to watch 1), the body title is "Free play" (Design: "Practice match"; the win, lose and draw titles are kept), the footer reads "FREE PLAY" with no lesson dots and no BACK. Tags (RULES INVENTED FOR THIS EDITION, DRAFT WORDING), the rules note and the sources are the practice screen's. PLAY AGAIN starts a new match with a new rule. It is full screen like Learn (§4).

**No separate Practice tab.** The practice match and Free play are the same game, so there are two places, Learn and Free play. Learn keeps its practice match as its last step (lesson 7's START A PRACTICE MATCH, `?mode=practice`). The old row of tabs (Learn / Practice / Play / Sandbox) lived on the sandbox's page. Both places are now Design's full-screen frame, which has no room for a tab row above it, so the app bar switches between them: "SKIP TO FREE PLAY" in Learn and "LEARN THE GAME" in Free play.

**Addresses.** `?mode=free` is Free play. The old links: `?mode=free` (the sandbox) and `?mode=play` (Play the computer) open Free play; `?s=…` (a shared sandbox board) opens `/minpentai/rule`. That page always opens on the figure's board, so a shared board is not shown. Returning visitors (`minpentai-tutorial-done`) open Free play, as they used to open the sandbox. Chapter 4's "Play this figure" (c4-b5) now goes to `/minpentai/rule`. The rail's meta for Minpentai is "Learn · play" (was "Tutorial").

**`/minpentai/rule`** (`src/app/minpentai/rule/`). The c4-b5 figure's 24 × 16 squares, the top left of `c4b5Preset()` (the figure's first frame, plus the invented hidden side that lets it replay all 120 frames), running on `engine.ts`. It has ◁ STEP, PLAY/PAUSE, STEP ▷ and RESET, and like the figure it loops after 120 turns at 10 a second. Nothing plays until asked. Below the board come Design's rule card (`rule.rows`, `rule.closing`), a caption, a link to `docs/minpentai-rules.md` on GitHub (`REPO_URL`), and the sources. It is tagged FROM THE BOOK and DRAFT WORDING, never RULES INVENTED, and it is an ordinary page with the site's top bar.

**Kept in the repo, out of the UI:** `sandbox.tsx`, `match-view.tsx`, `match.ts`, `ai.ts`, `tutorial-text.ts`, `presets.ts` (still used by the rule page), `url.ts`, `minpentai.css`, their tests (`test-minpentai.ts`, `test-minpentai-match.ts`) and `docs/minpentai-sandbox.md`. `page.tsx` renders `minpentai-app.tsx` instead of `Sandbox`.

**Check changes.**
- **P8c.** Before: the inputs were every Learn screen's sources and the rules note. After: also `LEARN_TEXT.rulePage`, its sources (block ids exist, quotes in the blocks, `docs/minpentai-rules.md` exists) and its text's quote ("rotate one eighty if three", c4-b7). The FROM THE BOOK rule now covers it as well. Plant unchanged.
- **P8d.** Name before: "… quotes c4-b84 on new rules, and points to the book's rule in the sandbox". After: "… quotes c4-b84 on new rules, and links to the book's rule on /minpentai/rule, which is labelled as the book's".
  - Before: `!/sandbox/i.test(note.text) || !/c4-b5/.test(note.text) || !/sandbox/i.test(note.link)`, and `learn.tsx` matched `onClick={onFree}>{T.rulesNote.link}`.
  - After: `note.href === '/minpentai/rule'`, the note names c4-b5, and the link says "rule recovered from the book's figure". `learn.tsx` must render `<Link href={T.rulesNote.href} …>{T.rulesNote.link}</Link>`.
  - New for the rule page: its tags include `book` and not `rules`; c4-b5 and c4-b7 appear in both its text and its sources; `rule/page.tsx` renders `<RuleView`; `rule-view.tsx` renders its tags and imports `engine.ts` and `c4b5Preset`.
  - Plant unchanged. Proven separately: rule page tags → `rules`, the note's href → `/minpentai?mode=free`, c4-b7 → c4-b9 (four problems).
- **check:ui.** Before: 17 Learn screens plus `?mode=practice`, `?mode=play` and `?mode=free` at 390. Only the Learn screens and practice got the tag, footer and full-screen checks; play and free got the floors and no sideways scroll. After:
  - All 20 get the tag, footer, full-screen and rules-note-link (`/minpentai/rule`) checks.
  - `?mode=free` and `?mode=play` must show FREE PLAY and LEARN THE GAME and end at `?mode=free`.
  - `/minpentai/rule` at 390, light and dark, gets the floors, no sideways scroll, FROM THE BOOK without RULES INVENTED, c4-b5 and c4-b7 in its words, the GitHub link, STEP ▷ advancing to TURN 1, and the site's top bar shown.
  - `/minpentai?s=…` must land on `/minpentai/rule`.
  - `/minpentai/rule` joins the 1024/1440/2000 pages.
  - `?mode=free` joins the 424 × 695 frame list.
  - Count line: 57 pages, 8 at desktop widths.
- **check:miniapp.** `/minpentai?mode=free` is added to the full-screen list.
- **check:intro.** Unchanged: the feature "Play Minpentai" → `/minpentai` is still true.
- **test:minpentai-learn.** The deliberate source line "The rule page runs …" (was "The sandbox runs …").

**New strings (draft):**
- `freePlay.appTitle` "Minpentai"
- `freePlay.label` "Minpentai free play"
- `freePlay.title` "Free play"
- `freePlay.stepOf` "FREE PLAY"
- `freePlay.learn` "LEARN THE GAME"
- `rulesNote.link` "THE RULE RECOVERED FROM THE BOOK'S FIGURE →"
- `rulePage.title` "The rule from the book's figure"
- `rulePage.text` "In chapter 4 the book draws a Minpentai board in motion (c4-b5), and a player names its rule: "rotate one eighty if three" (c4-b7). This board runs that rule, recovered from the figure, and opens on the figure's first frame."
- `rulePage.caption` "Cells live in 2 × 2 blocks, and the blocks shift one cell diagonally every turn. The game in Learn and Free play does not use this rule: its rules are invented for this edition."
- `rulePage.stageLabel` "The board of the book's figure c4-b5, running the rule recovered from it. "
- `rulePage.recipe` "HOW THE RULE WAS RECOVERED (GITHUB) →"
- `rulePage.back` "← MINPENTAI"
- `rulePage.sources`:
  - "The board, the figure's 24 × 16 squares, and its first frame" (c4-b5)
  - ""rotate one eighty if three"" (c4-b7)
  - "How the rule was recovered from the figure's 120 frames" (docs/minpentai-rules.md)
  - "Beyond the figure's right edge, cells the book does not show, chosen so the figure's squares replay all 120 frames" (invented)
- Rail meta "Learn · play"

The rule page reuses `board.*`, `rule.*`, `sources` and `tags.*`.
