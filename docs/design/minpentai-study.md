# Minpentai tutorial v3: a design study of the Claude Design build

**What this is.** A complete reading of Claude Design's "Minpentai intro v3" mockup (`Minpentai Intro v3.dc.html`), written so the build can be made from it without opening the file. It records every screen, state, string, timing and measured value. It then compares the mockup with the Minpentai the app has today.

**Sources read, every line:**
- `docs/design/minpentai-intro-v3.dc.html` (Design's `Minpentai Intro v3.dc.html`, 957 lines). This is the version to build.
- `scratchpad/design2/Minpentai Intro v2.dc.html` (838 lines). Only what v3 changed is noted (section 11).
- The rendered tiles `design2-shots/v3-0.png` … `v3-3.png` and `Minpentai-Intro-v2-full.png`.
- The reference scraps in `design2/scraps/*.jpg`. There are 30 JPEG crops of Design's earlier iterations: `01-les.jpg` … `05-les.jpg`, `les3/les7`, `*-les4/8` (lesson screens), and `*-mp2-*`, `*-mp3` (the opening match). I looked at four. `01-les.jpg` and `01-mp3.jpg` show the v2 page header, "The match first, the cells after". `01-mp2-c.jpg` is an older v2 phone. It has a "BOOK · CH 4" tag and a countdown card wrapped onto two lines ("MU GU GEI TAU / FA"). `02-les8.jpg` is v2's "The board is alive" lesson. It shows the 2×2 block grid and a "NEXT STEP · BLOCKS AT (0,0)" chip. They are screenshots Design was shown of its own earlier work, and nothing in v3 depends on them.
- The app's Minpentai, read-only, in `/Users/nathan/snowmoon-site`: `src/app/minpentai/{page,sandbox,match-view}.tsx`, `minpentai.css`, `src/lib/minpentai/*.ts`, `docs/minpentai-rules.md`, `docs/minpentai-sandbox.md`. The committed state is `f21b536` (branch `site-minpentai`).
- Book blocks that Design cites, read from `content/snowmoon/text/chapter-N.json`, to check the citations (section 8).

**Where the working files are.** Paths starting `scratchpad/` (the v2 file, the tiles, the 46 screenshots) were the study's working copies on the build machine and are not in the repo; Design's v3 file is.

**How it was checked.** I loaded the served file (`http://localhost:8766/Minpentai Intro v3.dc.html`) in Chrome through playwright-core. I stepped through every screen and lesson, ran each demo, forced the failure and toast states, and played the practice match to its end. The screenshots, at 2× (780 × 1390), are in `scratchpad/study/shots/` (list at the end). Every number below is quoted from the file's inline styles or its `<script type="text/x-dc">` unless it says "measured".

**A note on the app repo while I read it.** `/Users/nathan/snowmoon-site` had uncommitted, in-progress work from another session: `src/lib/minpentai/broadcast.ts`, `src/app/minpentai/broadcast.tsx` (714 lines, which appeared while I was reading), `scripts/probe-minpentai-pieces.ts`, and `three ^0.186.1` / `@types/three` added to `package.json`. Section 12 compares against the **committed** app. It mentions that work-in-progress only where it bears on a gap. I ran the uncommitted probe script, which is read-only, to measure what the engine does with each piece (section 12.3).

---

## 1. Overview

### 1.1 What the experience is

It is a phone-sized tutorial (390 × 695, "the Farcaster frame height") titled **"Learn Minpentai"**. It teaches Minpentai, the cellular-automaton strategy game in chapter 4 of the book, in four movements. Each movement reveals one layer:

1. **WATCH, 8 screens: the broadcast.** The visitor first watches a whole four-player match, as a crowd in the stadium might see it on a 3D sports broadcast. It shows towers on a dark field, drones flying, crews setting blocks, and hard camera cuts to close-ups as towers fall. A player cam shows the face of whoever was just hit. The commentary line carries the story. Each screen replays its own slice of the same match, and the text under it names one idea: the stadium and the secret rule, players who each see only part of the board, the battle running itself, the turn to act, losing towers, winning, your own stakes, and finally "Now try it yourself". On the last screen the camera rises overhead and the whole 3D battle **flattens into a flat board**. That flat board is the board the lessons use.
2. **LEARN, 7 lessons: the pieces.** A simplified "pieces-level" board, 15 × 10 squares, with towers (circles), gliders (arrowheads), squares and rocks. Each lesson teaches one rule with a small set-up and a goal. The one big button always "does the lesson for you". The lessons are: the goal and the score, gliders fly straight, a hit destroys a tower, squares bounce gliders, your turn to act (spend 8 points), you only see near your towers, and every match has a new rule.
3. **PRACTICE: a full small match** on the same board, against a simple Amber bot. There are turns to act every 12 steps, 96 steps in all, fog at 3 squares, and one random "new rule" announced at the start.
4. **UNDER THE HOOD, optional.** One extra lesson that shows the real cell rule from the book on a single glider, with a "How the rule works" card. It is reached only from a quiet link on lesson 7, and it is marked "You never need this to play."

A "SKIP TO FREE PLAY" button in the top bar leaves at any point. In the mockup it only shows a toast.

### 1.2 The order, and why it works

- **Spectacle before rules.** The opening does what the book does in chapter 4. Zei walks into a hall with "over a thousand people watching" (c4-b78), and the match is shown before any rule is explained. The visitor's first question is "what is going on?", not "what is a cell?". The canvas states the thesis: "The visitor watches a whole match as the crowd sees it before learning any piece of it."
- **Every screen earns its place by adding one idea, and the camera serves that idea.**
  - Screen 1 is a slow crane over the dark field as towers rise, with the Dzegoban countdown card. It sets the stakes and the secret rule.
  - Screen 2 cuts away to four player cams. Each face sits above a small board showing what that player sees. This teaches fog of war before the word "fog" ever appears.
  - Screen 3 follows a single cyan glider at low height ("CAM 4 · FOLLOW"), then skims "low across the rocks". This teaches that gliders fly straight and bounce.
  - Screen 4 shows little crews walking out from the cyan and amber towers to set blocks. This teaches the turn to act.
  - Screen 5 is the first violence. A white ring pulses on a target tower, a glider arcs in, the tower bursts, a "−1 PINK" pops on the scoreboard, and the camera cuts to Pink's face. This teaches scoring and elimination.
  - Screen 6 shows Violet out, Amber resigning, and a crane around the cyan corner. This teaches winning.
  - Screen 7 is a low drift over the wreckage, with the personal stakes ("Your season").
  - Screen 8 is the bridge. The overhead camera and the flattening turn the spectacle into the lesson board, so the board feels earned rather than abstract.
- **Attention is directed by staging, not by text.** The scoreboard sits top-left and the camera label top-right, like TV chrome. Only one centre banner appears at a time ("BATTLE BEGINS", "INTERVENTION TURN", "PINK IS OUT", "VIOLET IS OUT", "CYAN WINS"). The white warning ring pulses on exactly the tower about to be hit, starting 0.6 s before the strike launches. Slow motion is used only twice, for the 0.9 s around each elimination. Every hit is followed by a face reaction cam. The commentary line at the bottom is a single sentence that changes with the events.
- **Pacing.** Each watch screen loops its own 8 to 16 seconds of the match, so a visitor who reads slowly never misses the beat. Screen 8 holds its last frame instead of looping. NEXT moves on; BACK and the pause button let the visitor linger.
- **The lessons repeat one pattern.** Each lesson gives a set-up, a goal, a big button that performs it, and the same four board controls (◁ STEP, PLAY, STEP ▷, RESET) in the same place. When the goal is met the status reads "NICE. YOU DID IT." if the visitor did it, or "LIKE THAT." if the demo did. The big button then turns into NEXT. Failure is shown, not just stated: "YOUR TOWER FELL. PRESS RESET AND TRY AGAIN."
- **Honesty is built in.** Every screen carries tags ("FROM THE BOOK", "BROADCAST IMAGINED", "GAME SIMPLIFIED", "CLEAR LENSES INVENTED", "SYMBOL SHAPE INVENTED", "DRAFT WORDING"). Every screen has a "SOURCES (n)" disclosure listing block ids.

---

## 2. The frame and the parts every screen shares

### 2.1 The phone, top to bottom (measured at 1×)

| Region | y (px) | Height | Present on |
|---|---|---|---|
| App bar | 0 | 45 (44 + 1 border) | always |
| Stage (3D broadcast or lesson board) | 45 | 260 | always |
| Board controls (◁ STEP / PLAY / STEP ▷ / RESET) | 305 | 52 (8 top padding + 44) | lessons 2–6 and Under the hood |
| Palette (GLIDER / SQUARE / TOWER + arrows) | 357 (lesson 5) | 100 | lesson 5; practice while it is your turn |
| Tags row | 305, or below the tools | 64 when the tags wrap to two lines (all 3-tag screens at 390 px) | always except practice |
| Text area (scrolls) | 369 on watch | 229 on watch screens; **only 77 on lesson 5** | always |
| Footer (progress + BACK + main button) | 598 | 97 | always |

On lesson 5 the title, text, caption and status share a 77 px scrolling box. Most of the lesson text is below the fold (screenshot `l5a.png`).

### 2.2 App bar
- Height 44, `padding: 0 6px 0 18px`, `border-bottom: 1px solid th.rule`, flex with space-between.
- Left: **"Learn Minpentai"**, Crimson Pro 18px.
- Right: a **"SKIP TO FREE PLAY"** button. It has `min-height: 44px`, `padding: 0 12px`, no border, a transparent background, colour `th.muted`, DM Mono 12px, `letter-spacing: .04em`. On tap it shows the toast "Opens free play (the sandbox). Not part of this mockup." for 2200 ms.
- There is no × in the bar, by design: "The app bar has no ×, because Farcaster draws its own close button."

### 2.3 Stage (260 px)
- `role="img"`. The aria-label is "Imagined broadcast of a Minpentai match. " + the current commentary line while watching, and "Minpentai board. " + the board strip while learning.
- Background `#050507`. The three.js canvas fills it (`position:absolute; inset:0`).
- In LEARN mode an overlay (`z-index: 5`, background `#060608`) covers the 3D. It holds a 2D canvas at 780 × 520 drawn at 390 × 260 (`touch-action: manipulation`; the cursor is a pointer when the lesson allows placing). The 3D HUD stays in the DOM underneath but is hidden. In LEARN mode the 3D also stops rendering, because `tick()` returns early.
- Note for the build: the commentary (`aria-live`), the pause button and the CELLS button all sit *inside* the `role="img"` element. Assistive technology treats the children of `role="img"` as presentational, so these may not be reachable or announced.

### 2.4 Footer
- `border-top: 1px solid th.rule`, `padding: 10px 18px 14px`, column with `gap: 8px`.
- Row 1 is the progress bar. A flex row of segments (`gap: 3px`; each `flex:1; height:3px`) is `aria-hidden`, and it is followed by the step text (DM Mono 12px, `th.muted`):
  - Watch: 8 segments, "WATCH · n / 8". The current segment is `th.ink`, past ones `th.muted`, future ones `th.rule`.
  - Learn: 7 segments (the non-optional lessons), "LEARN · n / 7". The canvas note says "LEARN · n / 8", which is stale.
  - Under the hood: all 7 segments `th.muted`, "LEARN · OPTIONAL".
  - Practice: all 7 segments `th.muted`, "PRACTICE".
- Row 2 holds two buttons with `gap: 8px`:
  - **BACK** is 76 × 48, `border: 1px solid th.rule`, radius 3, transparent, DM Mono 13px, `.04em`. On watch screen 1 it is `visibility:hidden`, `aria-hidden="true"` and `tabindex="-1"`.
  - **Main button** is `flex:1`, height 48, no border, radius 3, background `th.btn`, colour `th.btnInk`, DM Mono 13px, `letter-spacing: .06em`.
- **Toast** (`role="status"`): `position:absolute; left:18px; right:18px; bottom:90px`, background `th.btn`, colour `th.btnInk`, `padding: 10px 12px`, radius 3, DM Mono 12px, line-height 1.5. It sits just above the footer.

### 2.5 Text area
- `flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; overflow-wrap:anywhere; padding: 8px 18px 8px`, column with `gap: 8px`.
- Title: Crimson Pro 26px, line-height 1.1, `text-wrap: pretty`.
- Text: 18px, line-height 1.42.
- Caption, if any: 16px, line-height 1.4, `th.muted`.
- Status line (`aria-live="polite"`): DM Mono 12px, `.04em`, colour `th.link`. It is empty unless a lesson is met or failed.
- Optional blocks: the reasons list, the "UNDER THE HOOD, OPTIONAL →" link, and the rule card toggle.
- **"SOURCES (n)"** disclosure: a button with `aria-expanded`, `min-height: 44px`, no padding, DM Mono 12px `.04em`, `th.link`. It toggles to "HIDE SOURCES (n)". Each source shows as a list item: text 15px/1.3, then the id in DM Mono 12px `th.muted`, with `border-top: 1px solid th.rule` and `padding: 7px 0`. The sources close whenever the screen changes.

### 2.6 Tags
- The row is `padding: 10px 18px 0`, `gap: 6px`, and wraps.
- Each tag is DM Mono 12px, `letter-spacing: .04em`, `padding: 3px 7px`, `border-radius: 2px`, `border: 1px <style> <colour>`.

| Key | Text | Border | Background |
|---|---|---|---|
| book | FROM THE BOOK | solid `th.ink` | transparent |
| imag | BROADCAST IMAGINED | dashed `th.muted` | transparent |
| lens | CLEAR LENSES INVENTED | dashed `th.muted` | transparent |
| inv | SYMBOL SHAPE INVENTED | dashed `th.muted` | transparent |
| model | GAME SIMPLIFIED | dashed `th.muted` | transparent |
| draft | DRAFT WORDING | solid `th.soft` | `th.soft` (filled chip) |
| rocks | ROCKS INVENTED | dashed `th.muted` | transparent (defined, unused in v3) |
| recon | RIGHT HALF RECONSTRUCTED | dashed `th.muted` | transparent (defined, unused in v3) |
| note | MOCKUP NOTE | solid `th.soft` | `th.soft` (defined, unused in v3) |

All tag text is `th.ink`. The tag names in the brief map as follows: "From the book" = `book`, "Broadcast imagined" = `imag`, "Invented" = `lens`/`inv` (and `model`, which is labelled "GAME SIMPLIFIED"), "Draft wording" = `draft`.

### 2.7 Interaction model (all screens)
- **Taps only.** Every control is a native `<button>`, so Enter and Space work and Tab order follows the DOM. There are **no keyboard shortcuts** and no `keydown` handlers. Placing pieces on the lesson board is **pointer only** (`onPointerDown` on the canvas), with no keyboard alternative.
- Focus ring: `button:focus-visible { outline: 2px solid #46D7E8; outline-offset: 2px }`.
- No swiping, no drag, no long-press.
- Reduced motion is read from `prefers-reduced-motion: reduce` on mount. The canvas has a "REDUCED MOTION" toggle to preview it.
- The mockup settings sit above the phone, in a group with `aria-label="Mockup settings"`: **LIGHT**, **DARK**, **REDUCED MOTION**. Each is a pressed-state button: `min-height: 44px; padding: 0 12px; border: 1px solid #1D1D1B; radius 3; DM Mono 12px`. Pressed is background `#1D1D1B` with text `#F4F2ED`; unpressed is transparent with `#1D1D1B`.

---
## 3. WATCH: the eight broadcast screens

### 3.0 What every watch screen shares

**The match clock.** The broadcast is one scripted 78-second match, `S.t` from 0 to 78. It is simulated at a fixed step of `DT = 1/30` s. Each screen owns a segment (`SEG`) and loops it. When `S.t` reaches the end, the sim is rebuilt from 0 and stepped forward to the segment start (`seekTo`). The run is deterministic: seeded RNGs `rng(7)` for rocks, `rng(11)` for wall timing, `rng(42)` for the sim. So the loop replays identically. Screen 8 is the exception: it **holds** at its end (`hold = i >= 7`).

| Screen | Segment (s) | Loops? |
|---|---|---|
| 1 | 0–8 | yes |
| 2 | 8–16 | yes |
| 3 | 16–26 | yes |
| 4 | 26–34 | yes |
| 5 | 34–46 | yes |
| 6 | 46–62 | yes |
| 7 | 62–70 | yes |
| 8 | 70–78 | holds at 78 |

`SEG` has a 9th entry `[70,78]`, which is never used (`SEGS_LEN = SCREENS.length = 8`). `go(i)` re-seeks only if the current time is outside the new screen's segment. So NEXT from screen n usually continues smoothly into n+1, because segments are contiguous. BACK rebuilds and seeks.

**The HUD on the stage**, top to bottom:
- **Scoreboard box**, top-left (`left:8px; top:8px`): `rgba(5,5,7,.78)` background, `padding: 6px 8px`, radius 3, DM Mono 12px, `letter-spacing: .04em`, column with `gap: 3px`.
  - Line 1: a 7 × 7 pink dot (`#FF5C8A`, circle), then **"LIVE · TURN n"** in `#E7E4DD`. `n = floor(t × 34)`, formatted `en-US` with commas, so it runs 0 → about 2,652 over 78 s. The intervention at t = 26.5 reads "TURN 901", which echoes the book's "a thousand turns later" (c4-b110).
  - Below, a 2-column grid (`column-gap: 10px; row-gap: 1px`): **"CYAN ●●●"**, **"AMBER ●●●"**, **"PINK ●●●"**, **"VIOLET ●●●"**. Each line shows one dot per standing tower, in the player colour. A player with no towers yet (towers rising at the start) shows just the name. An out player shows "PINK OUT" in `#7A7D88`.
- **Camera label**, top-right (`right:8px; top:8px`): same box, DM Mono 12px `#B4B3BA`. For example "CAM 1 · CRANE".
- **"−1 NAME"** (for example "−1 PINK"): centred at `top: 44px`, DM Mono 30px weight 500, player colour, `text-shadow: 0 2px 14px #000`. Shown for 1.8 s after each strike's impact.
- **Countdown card**, centred with `translate(-50%,-30%)`: background `#F4F2ED`, text `#1D1D1B`, `padding: 8px 12px`.
  - **"MU GU GEI TAU FA"**: Crimson Pro 22px weight 600, `letter-spacing: .03em`.
  - Below it, *"The battle begins in fifty ticks."*: 16px italic `#4A463F`.
  - Visible while `t < 4.8`.
- **Banner**, centred: `rgba(5,5,7,.82)`, `border-top: 2px solid <colour>`, `padding: 9px 14px`, DM Mono 16px, `letter-spacing: .12em`, `#F4F2ED`. It shows for 2.4 s after its event ("CYAN WINS" for 3.8 s). One at a time.

  | Event t | Banner | Border colour |
  |---|---|---|
  | 5 | BATTLE BEGINS | cyan |
  | 26.5 | INTERVENTION TURN | cyan |
  | 44.5 | PINK IS OUT | pink |
  | 55.5 | VIOLET IS OUT | violet |
  | 58.2 | CYAN WINS | cyan |

- **Reaction cam**, bottom-left (`left:8px; bottom:52px`). It shows for 2.4 s after each `REACT` time, but not on screen 2 and not during the countdown.
  - A label "NAME · AT THE CONSOLE" (DM Mono 12px, player colour, on `rgba(5,5,7,.82)`, `padding: 2px 6px`).
  - Above it, a face card 97 × 62, bordered 1px in the player colour, scaled `1.2` from the bottom-left, with `margin-top: 12px`.
  - `REACT` times: 26.5 Cyan, 38 Pink, 41 Pink, 42.5 Amber, 44.5 Pink, 49 Cyan, 51 Violet, 53 Violet, 55.5 Violet, 57 Amber, 58.2 Cyan. At 58.2 the eyes are drawn 8 px tall (a "win" face).
- **Commentary line**, bottom (`left:8px; right:60px; bottom:8px`, `min-height: 36px`): `rgba(5,5,7,.82)`, `border-left: 2px solid #E7E4DD`, `padding: 6px 9px`, DM Mono 12px, line-height 1.4, `#E7E4DD`, `aria-live="polite"`. It shows the latest event line (section 9.2). Hidden on screen 2.
- **Pause button**, bottom-right (`right:8px; bottom:8px`): 44 × 44, `border: 1px solid #4A4843`, radius 3, `rgba(5,5,7,.82)`, `#E7E4DD`, DM Mono 13px. The glyph is **"II"** while playing and **"▶"** while paused. The aria-label is "Pause the match" / "Play the match". Pausing freezes the sim while rendering continues. Hidden on screen 2 together with the commentary, because both use `display: commentDisp`. **So screen 2 has no pause.**
- **No WebGL**: if three.js fails to load, a centred message in DM Mono 12px `#B4B3BA`, `padding: 24px`, reads "3D isn't available here. The build falls back to the flat match view."

**The face cards**, used both in the reaction cam and on screen 2. Each is a 97 × 62 box with background `#141519` and opacity 0.45 when the player is out:
- shoulders: 70 × 22 at (14, 50), radius `20px 20px 0 0`, `#2A2C34`;
- head: 42 × 50 ellipse at (28, 6), `#3A3B42`;
- cable: 1 × 34 line at (73, 28), `#5A5C66`;
- glasses (lens bar): 54 × 15 at (22, 21), radius 5, 1px border in the player colour, background the player colour at alpha `2E` (about 18%), glow `0 0 10px` in the same colour;
- eyes: two 11 × 7 whites `#E7E4DD` with 5 × 5 pupils `#050507`.
  - Pupils move: `ex = round(sin(1.3t + 2p)·2 + sin(3.1t + p)·0.8)`, `ey = round(cos(1.7t + p))`.
  - Blink when `((0.7t + 0.37p) mod 1) < 0.06`: the eye height drops to 1 px.
  - An out player has the eye height at 1, `ey = 2` (eyes down) and opacity 0.45.

**Main button and BACK**: NEXT goes to the next screen. On screen 8 the button reads "START THE LESSONS" and opens lesson 1. BACK goes to the previous screen (hidden on screen 1).

---

### 3.1 Screen 1: "A game a whole country watches"

- **Progress:** "WATCH · 1 / 8"; BACK hidden.
- **Segment:** 0–8 s, looping.
- **Shots:**
  - 0–5 s **CAM 1 · CRANE**: radius 38, start height 22, start angle 0.9 rad, turning 0.07 rad/s round the field centre, descending 0.4 units/s, looking at (0, 0, 0).
  - 5–8 s **CAM 2 · WIDE**: a dolly from (0, 9, 31) to (0, 6.5, 23), the look moving (0, 0, 3) → (0, 0, 2), eased by smoothstep.
- **What happens:**
  - The 12 home towers rise one by one between 0.6 and 2.7 s, each growing over 0.8 s.
  - The first 24 walls (two per tower) pop up between 1 and 4.5 s, growing over 0.5 s. Crews walk out to them.
  - The countdown card shows until 4.8 s.
  - At 5 s "BATTLE BEGINS" appears and the first drones launch (one per player at 5, 5.15, 5.3 and 5.45 s).
- **Commentary:** "Setup. Each player builds in their own corner." (from 0 s), then "The battle begins." (from 5 s).
- **Reaction cam:** none.
- **Tags:** FROM THE BOOK · BROADCAST IMAGINED · DRAFT WORDING.
- **Title:** "A game a whole country watches".
- **Text:** "In Dzego, Minpentai fills a giant hall inside a mountain, with over a thousand people watching. Before every match, the priests secretly choose a new rule."
- **Caption:** "Players learn the rule only when the match starts, then get a set time to build. In one match it is twenty minutes."
- **SOURCES (5).**
- **Button:** NEXT.
- Screenshots: `w1.png`, `x-w1-sources.png`, `x-w1-dark.png`, `x-skip-toast.png`.

### 3.2 Screen 2: "Every player plays alone"

- **Progress:** "WATCH · 2 / 8".
- **Segment:** 8–16 s.
- **Shot:** 8–16 s **CAM 2 · WIDE**, a dolly from (−34, 27, 30) to (−28, 23, 24), looking (0, 0, 0) → (2, 0, 0). Only the top of the 3D frame (about 115 px) shows above the player-cam strip.
- **Overlay: the four player cams** are a grid of 4 equal columns pinned to the bottom of the stage.
  - The strip has background `#050507` and `border-top: 1px solid #2A2C34`. Each column has `border-right: 1px solid #2A2C34`.
  - Each column holds:
    1. a label (DM Mono 12px, player colour, `padding: 2px 5px`): "CYAN", "AMBER", "PINK", "VIOLET", or "NAME · OUT";
    2. the 97 × 62 face card;
    3. a 192 × 128 canvas drawn at 97 × 64 (`border-top: 1px solid #2A2C34`) showing **what that player sees**.
  - The sight view is the field at 4 px per cell (`k = 192/48`), clipped to circles of radius 7 cells around that player's standing towers, and black elsewhere. Inside the clip it shows the field `#0E0F13`, rocks `#4B4C55`, every placed wall in its owner's colour at alpha 0.6, every drone in its owner's colour (1.4-cell squares), and every tower's 4 symbol cells.
- The commentary line and pause button are **hidden** on this screen. The reaction cam is suppressed.
- **Commentary** (not visible here, but still the aria-live text): "The players see only near their own towers. The crowd sees all of it." (from 9 s).
- **Tags:** FROM THE BOOK · CLEAR LENSES INVENTED · BROADCAST IMAGINED · DRAFT WORDING.
- **Title:** "Every player plays alone".
- **Text:** "Each player sits at a console in glasses on a cable, and sees only the board near their own towers. The crowd sees the whole board, and the players' faces."
- **Caption:** "Under each face is what that player sees right now."
- **SOURCES (8).** **Button:** NEXT.
- Screenshot: `w2.png`.

### 3.3 Screen 3: "Then the battle runs itself"

- **Progress:** "WATCH · 3 / 8".
- **Segment:** 16–26 s.
- **Shots:**
  - 16–21 s **CAM 4 · FOLLOW**: the camera tracks the newest cyan drone. It sits 3.4 units behind the drone at height 1.3 and looks 6 units ahead at height 0.4. If that drone dies it re-acquires the newest cyan drone. With no drone it uses (0, 26, 28) looking at the origin.
  - 21–26 s **CAM 5 · LOW**: a dolly from (−12, 2.4, 9) to (10, 2.4, 9), looking (−4, 0.6, 0) → (4, 0.6, 0). It skims across the rocks at block height.
- **Commentary:** "Gliders fly straight and bounce off squares and rocks." (from 16 s).
- **Tags:** FROM THE BOOK · BROADCAST IMAGINED · DRAFT WORDING.
- **Title:** "Then the battle runs itself".
- **Text:** "Once it starts, the players can only watch. Gliders fly out in straight lines. Squares and rocks bounce them back."
- **Caption:** "In the broadcast, each glider is drawn as a drone."
- **SOURCES (2).** **Button:** NEXT.
- Screenshots: `w3.png`; with reduced motion, `x-w3-reduced*.png`.

### 3.4 Screen 4: "A turn to act"

- **Progress:** "WATCH · 4 / 8".
- **Segment:** 26–34 s.
- **Shots:**
  - 26–30 s **CAM 3 · CYAN CORNER**: a dolly from (27, 12, 22) to (23, 9, 18), looking (13, 0, 7) → (12, 0, 6).
  - 30–34 s **CAM 6 · AMBER CORNER**: a dolly from (−27, 7, 18) to (−22, 5, 13), looking (−13, 0, 5) → (−12, 0, 4).
- **What happens:**
  - At 26.5 s, "INTERVENTION TURN" and a Cyan reaction cam.
  - Each player's crew lays a diagonal line of 5 walls out from its first tower, born at 27.4 + 0.25·p + 0.8·k s (k = 0…4).
  - At 30.3/30.5 s, two cyan crews walk to (30, 20) and the **Cyan forward tower** rises (born 30.5).
  - At 31/31.2 s, two amber crews walk to (14, 18) and the **Amber forward tower** rises (born 31.2).
- **Commentary:** "Intervention turn. Everyone may put down a few squares." (26.5), then "Cyan and Amber each build a forward tower." (31).
- **Tags:** FROM THE BOOK · BROADCAST IMAGINED · DRAFT WORDING.
- **Title:** "A turn to act".
- **Text:** "Every so often, each player may put down a few pieces near their own towers. Then the match runs on without them."
- **Caption:** "The crews stand for squares being placed."
- **SOURCES (1).** **Button:** NEXT.
- Screenshot: `w4.png`.

### 3.5 Screen 5: "Lose every tower and you are out"

- **Progress:** "WATCH · 5 / 8".
- **Segment:** 34–46 s.
- **Shots:**

  | Time (s) | Shot | Detail |
  |---|---|---|
  | 34–36.8 | CAM 2 · WIDE | dolly (−6, 30, 34) → (−10, 26, 28), look (−8, 0, −2) → (−10, 0, −3) |
  | 36.8–39.5 | CAM 7 · SYMBOL | tower 8 (Pink, at 4, 10); hit at 38 |
  | 39.5–41 | CAM 4 · FOLLOW | strike 1 (Cyan forward tower → Pink tower 7) |
  | 41–42.2 | CAM 7 · SYMBOL | tower 7 (Pink, at 10, 3); hit at 41 |
  | 42.2–43.4 | CAM 4 · FOLLOW | strike 3 (Cyan → Pink tower 6) |
  | 43.4–46 | CAM 7 · SYMBOL | tower 6 (Pink, at 6, 6); hit at 44.5, in **slow motion 44.1–45 s at 0.3×** |

- **What happens:** Amber hits Pink (38), Cyan hits Pink (41), Violet hits Amber (42.5), Cyan hits Pink's last tower (44.5) and "PINK IS OUT".
  - Each target shows the pulsing **white ring** from 0.6 s before launch until impact.
  - At impact: 34 debris pieces, a 1-second flash, "−1 NAME" for 1.8 s, and the victim's reaction cam.
- **Commentary:** "Pink loses a tower. Two left." (38), "Pink loses another. One left." (41), "Violet hits back at Amber." (42.5), "Pink is out." (44.5). Before 38 s the line still reads "Cyan and Amber each build a forward tower."
- **Tags:** FROM THE BOOK · SYMBOL SHAPE INVENTED · BROADCAST IMAGINED · DRAFT WORDING.
- **Title:** "Lose every tower and you are out".
- **Text:** "Each player starts with a few towers. A glider that reaches an enemy tower destroys it. The scoreboard counts the towers each player has left."
- **Caption:** "A white ring marks the tower about to be hit. The book calls towers symbols."
- **SOURCES (3).** **Button:** NEXT.
- Screenshots: `w5.png`, `w5b.png`.

### 3.6 Screen 6: "The last one standing wins"

- **Progress:** "WATCH · 6 / 8".
- **Segment:** 46–62 s.
- **Shots:**

  | Time (s) | Shot | Detail |
  |---|---|---|
  | 46–48.3 | CAM 2 · WIDE | dolly (30, 28, 30) → (26, 24, 24), look (4, 0, −2) → (6, 0, −3) |
  | 48.3–50 | CAM 7 · SYMBOL | tower 12 (Cyan forward); hit by Violet at 49 |
  | 50–51.8 | CAM 7 · SYMBOL | tower 11 (Violet, at 44, 10); hit by Cyan at 51 |
  | 51.8–53.6 | CAM 4 · FOLLOW | strike 6 (Amber forward → Violet tower 10), impact 53 |
  | 53.6–56.8 | CAM 7 · SYMBOL | tower 9 (Violet, at 42, 6); hit at 55.5, **slow motion 55.1–56 s at 0.3×** |
  | 56.8–58.2 | CAM 4 · FOLLOW | strike 8 (Cyan → Amber forward tower 13), impact 57 |
  | 58.2–62 | CAM 3 · CYAN CORNER | crane, radius 13, height 7, start angle 0.2 rad, 0.16 rad/s, round (16, 0, 9), descending 0.4/s |

- **What happens:** drones stop launching at 58.2 s, and Amber is "out" at 58.2 (it resigns).
- **Commentary:** "Violet takes out Cyan's forward tower." (49), "Cyan answers. Violet is down to two." (51), "Amber hits Violet too." (53), "Violet is out." (55.5), "Cyan strikes Amber's forward tower." (57), "Amber resigns. Cyan wins." (58.2). Banners "VIOLET IS OUT" and "CYAN WINS" (3.8 s).
- **Tags:** FROM THE BOOK · BROADCAST IMAGINED · DRAFT WORDING.
- **Title:** "The last one standing wins".
- **Text:** "The last player with towers left wins. If time runs out, most towers wins. A player who sees the end coming can resign."
- **Caption:** none.
- **SOURCES (2).** **Button:** NEXT.
- Screenshots: `w6.png`, `w6b.png`.

### 3.7 Screen 7: "Your season"

- **Progress:** "WATCH · 7 / 8".
- **Segment:** 62–70 s.
- **Shot:** **CAM 5 · LOW**, a dolly from (−22, 3, 14) to (16, 3.6, −8), looking (−6, 0, 2) → (8, 0, −4). It is a slow drift over the wreckage. No drones are left, and the debris (up to 1,400 pieces) has settled and greyed.
- **Commentary:** "Most of the board is wreckage now." (62).
- **Scoreboard:** "CYAN ●●● · AMBER OUT · PINK OUT · VIOLET OUT".
- **Tags:** FROM THE BOOK · DRAFT WORDING. There is no "Broadcast imagined" tag here, although the broadcast is on screen.
- **Title:** "Your season".
- **Text:** "You are a young player in your last year of school tournaments. Win, and you go to the nationals, with prize money on the line."
- **Caption:** "Practice against bots only goes so far. They play the standard rules well and adapt badly to a new one."
- **SOURCES (4).** **Button:** NEXT.
- Screenshot: `w7.png`.

### 3.8 Screen 8: "Now try it yourself"

- **Progress:** "WATCH · 8 / 8".
- **Segment:** 70–78 s, **held at the end** (no loop).
- **Shot:** **CAM 8 · OVERHEAD**.
  - The camera rises from (16, 3.6, −8) to (0, 46, 0.01), looking (8, 0, −4) → (0, 0, 0).
  - The field of view narrows from 50° to 38°.
  - All of this follows `smooth(70.3, 74.5, t)`, a smoothstep over 4.2 s.
- **The flattening**, `f = smooth(70.5, 74.5, t)`:
  - Rocks sink from their 0.5–1.8 height to 0.1.
  - Walls sink from 0.7 to 0.1.
  - Drones snap to whole cells, grow to 0.9-cell squares (spacing 0.38 → 1) and drop to y 0.06.
  - Tower columns shrink to nothing, and the symbol on top stops spinning. Its 4 cubes lay flat on the ground at full cell size (gap 0.36 → 1). Each tower becomes the 4-cell symbol drawn flat.
  - The sight discs and rings fade out. Tower glows drop to 30% opacity.
  - The grid lines brighten from `#1C1D24` to `#2A2C34`.
  - Crews hide.
- **Commentary:** "From above, the same match is a flat board." (70).
- **Tags:** FROM THE BOOK · DRAFT WORDING.
- **Title:** "Now try it yourself".
- **Text:** "From above, the match is a flat board of towers, gliders and squares. Next, learn each piece on that board."
- **Caption:** none.
- **SOURCES (1).**
- **Button:** **START THE LESSONS**, which opens lesson 1.
- Screenshot: `w8.png`.

---
## 4. LEARN: the pieces-level board, seven lessons, Under the hood, and the practice match

### 4.1 The pieces-level model (Design's "pieces-level version of match.ts")

The canvas says: "This is a pieces-level version of match.ts. One square per step stands for a real glider's two cells every four turns."

So **1 square = 2 cells** and **1 step = 4 turns**.

- **Board:** `PW = 15` × `PH = 10` squares. It has hard edges: it does not wrap.
- **Pieces:** `{ k, x, y, p, dx, dy }`, where `k` is `'tower' | 'glider' | 'square' | 'rock'` and `p` is the player (0 Cyan, 1 Amber).
- **One step (`pStep`)** moves each living glider one square, in list order:
  1. **Trail:** the glider's previous 3 positions are kept, for drawing.
  2. **Edge:** if the next square is off the board, the glider reverses the out-of-bounds axis and **stays put this step**.
  3. **Enemy tower** in the next square: the **tower and the glider are both destroyed**, and a hit is recorded.
  4. **Square** in the next square, any owner including your own: its hit points start at 2 and drop by 1.
     - At 0 the **square and the glider both break**.
     - Otherwise (the first hit) the square is now "cracked", and the glider reverses (`dx = -dx; dy = -dy`) and stays put.
  5. **Any other piece** (a rock, or **your own tower**): the glider reverses and stays put.
  6. Otherwise the glider moves.
  7. After all gliders have moved, **two gliders of different players** on the same square, or swapping squares (a head-on pass), are **both destroyed** (a "crash"). Gliders of the same player pass through each other.
- **Towers** never move. **Rocks** never move or break. **Squares** never move.
- **Sight** (`near`) is the Chebyshev distance: `max(|dx|, |dy|) ≤ r` from any of your towers.
- **Costs:** `COST = { glider: 4, square: 1, tower: 4 }`. The budget is 8 points per turn to act.
- **Build zone:** squares within Chebyshev `zone = 3` of one of your towers.

### 4.2 How the lesson board is drawn (canvas 780 × 520, shown at 390 × 260; one square is 52 px, or 26 CSS px)

| Element | Drawing |
|---|---|
| Background | `#060608` |
| Each square | `#0E0F13`, inset 1 px, which leaves 2 px `#060608` grid lines |
| Build zone (lit area) | `rgba(70,215,232,.12)` over the square, only while placing is allowed |
| Hint outlines (lesson 4, turn 0, empty hints only) | dashed `[7, 5]`, `rgba(255,255,255,.75)`, width 2.5, inset 6 |
| Rock | `#4B4C55`, inset 4 (44 × 44) |
| Tower | a disc of radius 0.36·cp in the player colour; a `#0E0F13` hole of radius 0.17·cp; a centre square 0.12·cp in the player colour (a "ring with a dot") |
| Glider | an arrowhead in the player colour, pointing along its direction: tip at +0.36·cp, back corners at −0.26·cp forward ± 0.28·cp sideways, notch at −0.12·cp. Trail: its last 3 squares as small squares (0.22·cp) at alpha 0.32, 0.23, 0.14 |
| Square | a 36 × 36 box (inset 8) filled at alpha 0.45 in the player colour, with a 2.5 px stroke in the player colour. When cracked (hp 1): a zig-zag in `#E7E4DD`, 2 px, from (6, 4) → (16, 16) → (11, 22) → (cp−22, cp−18) |
| Fog | each unseen square is covered with `rgba(4,4,6,.88)`, except squares with a rock, and in practice Amber's towers on step 0 |
| Hidden pieces | enemy pieces on unseen squares are not drawn. Your own pieces and rocks always are |
| Hit flash | a ring of radius `cp·(0.4 + 1.8a)`, line 4, alpha `1 − a`, over 1600 ms. The colour is the hit tower's owner colour for a tower hit, otherwise `#E7E4DD` (square break, crash) |
| **CELLS on** | each piece is drawn as its cells, squares of `0.9 × cp/4.6`. Glider: the 4-cell glider (`.##.` / `#..#`) oriented by its direction, with the pair of cells in front. Tower: the 4-cell symbol (`#..` / `.##` / `.#.`). Square: a 2 × 2 block. Rocks are unchanged |

**Overlays on the lesson board:**
- **Strip**, top-left: `rgba(5,5,7,.8)`, `padding: 5px 8px`, radius 3, DM Mono 12px `#E7E4DD`, `max-width: calc(100% - 92px)`, truncated with an ellipsis. Text:
  - lessons: "TURN n · CYAN ●● · AMBER ●●". "OUT" replaces the dots when a player has none. While points can be spent, " · n PTS" is added.
  - practice: "n/96 · CYAN … · AMBER … [· n PTS]".
  - Under the hood: "TURN n · LIVE CELLS 4".
- **"−1 NAME"**, centred at `top: 44px`, DM Mono 30px weight 500, player colour, black text-shadow, while a tower-hit flash is younger than 1600 ms.
- **CELLS** toggle, top-right: 44 px tall, `padding: 0 10px`, `border: 1px solid #4A4843`, radius 3, DM Mono 12px `.04em`, `aria-pressed`. Off: `rgba(5,5,7,.8)` with `#E7E4DD` text. On: `#E7E4DD` with `#050507` text. It persists across lessons (`cellsOn` is component state) and is absent on Under the hood.

### 4.3 Controls shared by the lessons

- **Board controls** (`role="group"`, `aria-label="Board controls"`): a 4-column grid with `gap: 6px` and `padding: 8px 18px 0`. Each button is 44 px tall, `border: 1px solid th.rule`, radius 3, transparent, DM Mono 12px `.04em`.
  - **"◁ STEP"** (`aria-label="Step back one turn"`) pops the last saved state (history up to 300). Under the hood it steps the cell rule backward, but not before the lesson's start turn.
  - **"PLAY"/"PAUSE"** (`aria-pressed`) toggles running and cancels any demo.
  - **"STEP ▷"** (`aria-label="Step forward one turn"`) steps one.
  - **"RESET"** rebuilds the lesson's starting position and clears placed pieces, points spent, flashes and failure.
  - Shown on every lesson except the two "read" lessons (1 and 7) and practice.
- **The big button** (`lessonPrimary`):
  - On a "read" lesson, or once the goal is met: it goes on. From lesson 7 it goes to **practice**. From Under the hood it also goes to **practice**.
  - Otherwise, if a demo is running, it does nothing (no "finish the demo at once").
  - Otherwise it **resets the lesson and performs the demo**:
    - `play` demos start running.
    - `place` demos select the demo tool, place each demo square at 300 ms and then every 550 ms, and then start running.
- **Labels:** before the goal, the lesson's own label ("PLAY IT", "BLOCK IT FOR ME", "DO IT FOR ME"). After the goal, "NEXT", or "START A PRACTICE MATCH" on Under the hood. Read lessons always show their own label.
- **Status line**:
  - goal met by you: "NICE. YOU DID IT.";
  - goal met by the demo: "LIKE THAT.";
  - lessons 3 and 6 override both with their own met text ("AMBER −1." and "YOU LOST A TOWER, AND YOUR VIEW SHRANK.");
  - on failure: the lesson's fail text.
  - The goal check stops once met. The board keeps playing after the goal unless paused.
- **BACK:** on lesson 1 it returns to **watch screen 8**. Otherwise it opens the previous entry in the lesson list. From Under the hood (list index 7) that is lesson 7, "Every match, a new rule" (index 6).
- **Taps on the board** (`onPointerDown`): the square is `floor((clientX − left)/width × 15)`, `floor((clientY − top)/height × 10)`. Taps are ignored during a demo or on lessons without placing.
- **Run speed:** lessons step at **3 steps/s** (`d.speed || 3`), Under the hood at **6 turns/s**, practice at **4 steps/s**. At most 10 steps per frame.

### 4.4 The lessons

Starting positions use (x, y) squares. "BASE" is Cyan towers at (2, 3) and (2, 7), and Amber towers at (12, 3) and (12, 7).

#### Lesson 1: "Keep your towers. Destroy theirs." (`goal`, read)
- **Progress:** "LEARN · 1 / 7".
- **Board:** BASE, static. CELLS is available. There are no board controls.
- **Tags:** FROM THE BOOK · GAME SIMPLIFIED · DRAFT WORDING.
- **Text:** "You are Cyan. Each player starts with a few towers, and your score is how many you have left. Lose them all and you are out. The last player with towers wins."
- **Caption:** "If a match runs long, whoever has the most towers when time runs out wins."
- **Button:** NEXT. BACK returns to watch screen 8.
- **SOURCES (3).**
- Screenshots: `l1a.png`, `x-l1-cells.png`.

#### Lesson 2: "Gliders fly straight" (`glider`)
- **Board:** BASE plus a Cyan glider at (4, 5) flying right.
- **Goal:** 8 steps have passed (`s.turn >= 8`).
- **Demo:** play.
- **Text:** "A glider flies in a straight line, up, down, left or right, one square per step. It bounces off the edge. Press play."
- **Caption:** "In the match, these were the drones."
- **Button:** PLAY IT → NEXT.
- **Status:** "LIKE THAT." / "NICE. YOU DID IT."
- **SOURCES (2).**
- The glider reaches the right edge at x = 14 after 10 steps and bounces. It keeps bouncing forever, because row 5 has no towers.
- Screenshots: `l2a.png`, `l2b.png`.

#### Lesson 3: "A hit destroys a tower" (`hit`)
- **Board:** BASE plus a Cyan glider at (4, 3) flying right, in Amber's top tower's row.
- **Goal:** Amber has fewer than 2 towers (after 8 steps).
- **Demo:** play.
- **Met text:** **"AMBER −1."** At the hit: a "−1 AMBER" overlay and an amber ring flash.
- **Text:** "When a glider reaches an enemy tower, the tower is gone. That is how you score. Press play and watch Amber's score."
- No caption.
- **Button:** PLAY IT → NEXT.
- **SOURCES (1).**
- Screenshots: `l3a.png`, `l3b.png`.

#### Lesson 4: "Squares bounce gliders" (`square`)
- **Board:** BASE plus an Amber glider at (10, 7) flying left, at Cyan's lower tower.
- **Hint outlines** at (4, 7), (5, 7) and (6, 7).
- **Placing:** only on a hint square, and only at turn 0. Tapping an empty hint adds a Cyan square. Tapping your square there removes it. Other taps do nothing, silently.
- **Goal:** turn ≥ 10 and Cyan still has 2 towers.
- **Fail:** Cyan has fewer than 2 towers. Fail text: **"YOUR TOWER FELL. PRESS RESET AND TRY AGAIN."**
- **Demo:** place a square at (5, 7), then play.
- **What the visitor sees with a square at (5, 7):**
  - The glider hits it at step 5. The square cracks and the glider bounces right.
  - The glider then bounces off Amber's own tower at (12, 7).
  - It returns, and at step 17 its second hit breaks the square and the glider.
- **Text:** "An Amber glider is coming for your tower. Tap one of the outlined spots to put a square in its way, then press play."
- **Caption:** "A square survives one hit and cracks. The second hit breaks it, and the glider breaks with it."
- **Button:** BLOCK IT FOR ME → NEXT.
- **SOURCES (2).**
- Screenshots: `l4a.png`, `x-l4-fail.png` (turn 8, "−1 CYAN"), `x-l4-placed.png`, `x-l4-cracked.png`, `x-l4-you.png`, `l4b.png`.

#### Lesson 5: "Your turn to act" (`turn`)
- **Board:** Cyan towers at (2, 3) and (2, 7). One Amber tower at (12, 5), guarded by Amber squares at (10, 2), (10, 3), (10, 7) and (10, 8). Only row 5 reaches the tower.
- **Placing:** with the palette. Budget 8, zone 3, only at turn 0. The lit area is drawn.
- **Palette** (`role="group"`, `aria-label="Pieces to place"`): 3 columns with `gap: 6px`. The buttons are **"GLIDER · 4"**, **"SQUARE · 1"** and **"TOWER · 4"**. Each is 44 px tall, `border: 1px solid th.ink`, radius 3, DM Mono 12px `.04em`, `aria-pressed`. The selected one is filled `th.btn` / `th.btnInk`.
- **Direction row** (only while GLIDER is picked): 4 buttons **"←" "↑" "↓" "→"**, `flex: 1`, 44 px tall, `border: 1px solid th.rule`, DM Mono 16px. Their aria-labels are "Glider flies left", "Glider flies up", "Glider flies down" and "Glider flies right". Default is →.
- **Tapping:**
  - An empty square in the zone places the picked piece and spends its cost.
  - Tapping a piece you placed this turn removes it and refunds it.
  - Tapping other occupied squares does nothing.
- **Toasts**, 2400 ms each:
  - out of the zone: **"Too far from your towers. Build in the lit area."**
  - over budget: **"Not enough points left. Tap a piece you placed to take it back."**
  - any tap after turn 0: **"Your turn to act is over. Press reset to plan again."**
- **Goal:** Amber has 0 towers.
- **Fail:** turn ≥ 24. Fail text: **"MISSED. PRESS RESET AND TRY ANOTHER ROW."**
- **Demo:** pick GLIDER and place it at (4, 5). It uses whatever direction is currently selected, which is → unless the visitor changed it. Then play.
- **Text:** "Every so often you get 8 points to spend near your own towers. A glider costs 4, a square 1 and a tower 4. Pick a glider's direction with the arrows. Take out Amber's last tower."
- **Caption:** "Between turns to act, the match runs by itself. The lit area is where you may build."
- **Button:** DO IT FOR ME → NEXT.
- **SOURCES (2).**
- Screenshots: `l5a.png`, `l5b.png`, `x-l5-zone-toast.png`, `x-l5-square-pick.png`, `x-l5-cost-toast.png`, `x-l5-locked.png`.

#### Lesson 6: "You only see near your towers" (`sight`)
- **Board:** Cyan towers at (2, 2) and (3, 7). Amber tower at (12, 4), hidden. An Amber glider at (13, 7) flies left at Cyan's (3, 7), hidden until it enters sight.
- **Fog:** 3 (Chebyshev).
- **Goal:** Cyan has fewer than 2 towers.
- **Demo:** play.
- **Met text:** **"YOU LOST A TOWER, AND YOUR VIEW SHRANK."** The lit area visibly shrinks to the surviving tower's 7 × 7 square.
- The strip still reads "AMBER ●" while Amber's tower is in the dark.
- **Text:** "Beyond a few squares of your towers, the board is dark. Press play. Something is coming."
- **Caption:** "Lose a tower and you see less. Build one and you see more."
- **Button:** PLAY IT → NEXT.
- **SOURCES (1).**
- Screenshots: `l6a.png`, `x-l6-fog.png`, `l6b.png`.

#### Lesson 7: "Every match, a new rule" (`rule`, read)
- **Progress:** "LEARN · 7 / 7".
- **Board:** BASE, static. CELLS is available. No board controls.
- **Tags:** FROM THE BOOK · DRAFT WORDING.
- **Text:** "Before each match, the priests pick a new rule, and players learn it only when the match begins. That is what makes Minpentai hard:"
- **Reasons list** (numbered 1–4; rows `grid 22px 1fr`, `padding: 7px 0`, `border-top: 1px solid th.rule`; the number in DM Mono 12px muted; the text 17px/1.35):
  1. "You only see near your towers."
  2. "You can act only on your turns."
  3. "The rules change every match."
  4. "No square stops everything forever."
- Then the link **"UNDER THE HOOD, OPTIONAL →"** (DM Mono 12px `.04em`, `th.link`, 44 px tall, no border), which opens Under the hood.
- **Button:** **START A PRACTICE MATCH**.
- **SOURCES (2).**
- Screenshot: `l7a.png`.

### 4.5 Under the hood (`hood`, optional)

- **Progress:** "LEARN · OPTIONAL", with all 7 segments muted.
- **Board:** the real cell rule (`bApply`, the same code as `engine.ts`). It runs on a 48 × 32 wrapping board with one glider (`.##.` / `#..#`) stamped at (23, 25).
  - Zoom 2: a 24 × 16-cell view from (12, 16). Each cell is 32.5 backing px (16.25 CSS px).
  - Cell squares are `#0E0F13`, inset 1. Live cells are `#46D7E8`, inset 3. There is no block grid.
- **Strip:** "TURN n · LIVE CELLS 4". No CELLS toggle.
- **Board controls:** present. Step back is allowed down to the start turn.
- **Speed:** 6 turns/s.
- **Goal:** 16 turns played. **Demo:** play.
- **Tags:** FROM THE BOOK · DRAFT WORDING.
- **Text:** "Every piece is a few cells, moved by one rule from the book. This is a glider, cell by cell. Press play."
- **Caption:** "You never need this to play."
- **Rule card toggle:** **"HOW THE RULE WORKS"** / **"HIDE HOW THE RULE WORKS"** (`aria-expanded`).
  - Rows use `grid 88px 1fr` with `gap: 10px`, `padding: 8px 0` and a top rule. Each row shows a 2 × 2 "before" mini-block → "after" mini-block. Each cell is 12 × 12 with a 2 px gap and 3 px padding on `#0E0F13`; live is `#46D7E8`, empty is `#23252C`; the "→" is DM Mono 12px muted. Then the heading (DM Mono 12px) and the description (15px/1.3 `th.body`).
    - "0 OR 4 LIVE": "Nothing changes."
    - "1 LIVE": "On odd turns it jumps to the opposite corner." (1000 → 0001)
    - "2 LIVE": "Every cell flips: live becomes empty, empty becomes live." (1100 → 0011)
    - "3 LIVE": "On even turns the block turns half a circle." (1110 → 0111)
  - Closing line: "The blocks shift one cell diagonally every turn, so cells pass from block to block. Nothing is ever created or destroyed."
- **Button:** PLAY IT → **START A PRACTICE MATCH**. BACK goes to lesson 7.
- **SOURCES (1).**
- Screenshots: `hood-a.png`, `hood-b.png`, `hood-c.png`, `x-hood-rule.png`.

### 4.6 The practice match (`practice`, optional)

- **Board:**
  - Cyan towers at (1, 2) and (1, 7). Amber towers at (13, 2) and (13, 7).
  - Six rocks at (7, 4), (7, 5), (6, 0), (8, 9), (5, 6) and (9, 3).
- **Parameters:** `budget 8`, `zone 3`, `fog 3`, `limit 96` steps, turns to act `every 12` steps. 4 steps/s when running.
- **One random new rule per match.** `Math.random()` picks one of four, shown as the caption "New rule this match: …":
  1. "Gliders may also fly diagonally." Adds the arrows "↖" "↗" "↙" "↘" (aria "Glider flies up left" / "up right" / "down left" / "down right"), giving 8 direction buttons.
  2. "Gliders cost 3 points." Costs become glider 3, square 1, tower 4, and the palette reads "GLIDER · 3".
  3. "You see only 2 squares around your towers." Fog 2; the build zone stays 3.
  4. "Turns to act come every 8 steps."
- **Phases:**
  - **act**:
    - The palette is shown with no board controls.
    - Lit zone; the strip shows " · n PTS".
    - Status: "YOUR TURN · STEP n".
    - At step 0 Amber's towers are visible through the fog. Rocks are always visible.
    - Text at step 0: "Amber's towers mirror yours on the far side. You see them only until this turn ends. Spend 8 points in the lit area, then end your turn."
    - Text at later act turns: "Your turn. Amber's towers are where they started. Spend 8 points, then end your turn."
    - Button: **END TURN**. It runs the **bot's turn**, locks your pieces (they can no longer be taken back), and starts running.
  - **run**:
    - Text: "The match runs by itself until your next turn. Pause any time."
    - Status: "NEXT TURN AT STEP n", where `n = min(96, ceil((step+1)/every)·every)`.
    - Button: **PAUSE** / **RESUME**.
    - The run stops at every multiple of `every`. Points refill to 8.
  - **over**: when either side has 0 towers, or at step 96.
    - Win (Amber has 0, or Cyan has more towers at 96):
      - title "You win";
      - text "Amber is out of towers, or had fewer when time ran out.";
      - status "YOU WIN.".
    - Lose:
      - title "Amber wins";
      - text "Amber outlasted you. Squares in your towers' rows are your best defence.";
      - status "AMBER WINS.".
    - Draw (both 0, or equal at 96):
      - title "A draw";
      - text "Same number of towers when time ran out.";
      - status "DRAW.".
    - Button: **PLAY AGAIN**, which restarts with a new random rule.
- **Chrome:**
  - Title "Practice match".
  - **No tags.** `practiceVals` sets `tags: []`, although the definition lists GAME SIMPLIFIED and DRAFT WORDING.
  - "SOURCES (5)".
  - Progress "PRACTICE", all segments muted.
  - BACK goes to lesson 7.
- **The bot (Amber, `botTurn`)** always has 8 points, priced by the match's costs. It reads the **whole** state and does not respect fog.
  1. **Defend:** for each Amber tower, if a Cyan glider is in the same row, flying right (`dx === 1`), left of the tower, with no non-glider piece between, it puts **one square** in the first free in-zone square 1–3 to the left of the tower.
  2. **Attack:** up to 24 tries. Pick a random Cyan tower. For the first 5 tries aim at its row; after that pick a random row. Place a **glider flying left** at x = 12, 11 or 10 (the first free in-zone one) and pay for it.
  3. **Fill:** spend what is left on **squares** at random x 10–12 and random rows, until the tries reach 40.
  - It never builds towers and never fires diagonally.
- Screenshots: `x-pr-act0.png` (the diagonal rule), `x-pr-placed.png`, `x-pr-run.png`, `x-pr-act2.png`, `x-pr-over.png` ("Amber wins" at step 36).

---
## 5. Every animation and timing

### 5.1 Loops and clocks

| What | Value | Code |
|---|---|---|
| Render loop | `requestAnimationFrame`, each frame calling `tick()` | `loop` |
| Watchdog (keeps the sim running when frames stall, e.g. in a background tab) | `setInterval` every **100 ms**; it calls `tick()` if no frame came for over **180 ms** | `boot` |
| Frame delta clamp | `dt = min(0.05, …)` s | `tick` |
| Broadcast sim step | fixed `DT = 1/30` s, at most **10 steps per frame** | `tick` |
| HUD refresh (watch) | at most every **150 ms**; React state set only when the HUD changes | `hudTick` |
| Board strip refresh (learn) | at most every **120 ms** | `lhud` |
| Lesson run speed | **3 steps/s** (lessons 2–6); **6 turns/s** (Under the hood); **4 steps/s** (practice); at most 10 per frame | `lessonTick` |
| Demo placement | first piece at **300 ms**, then every **550 ms**, then auto-play | `lessonPrimary`, `lessonTick` |
| Hit flash (lesson board) | **1600 ms** expanding ring; radius 0.4 → 2.2 squares; alpha 1 → 0 | `drawBoard` |
| "−1 NAME" on lesson board | while a tower-hit flash is under 1600 ms | `lhud` |
| Lesson toasts | **2400 ms** | `ltoast` |
| Skip toast | **2200 ms** | `skip` |
| Board redraw (learn) | only when dirty (a step, a placement, or a live flash) | `lessonTick` |

### 5.2 Broadcast events and their durations

| Thing | Timing |
|---|---|
| Countdown card | visible while `t < 4.8` s |
| Banner | **2.4 s** after its event ("CYAN WINS" **3.8 s**) |
| "−1 NAME" | **1.8 s** after each strike impact |
| Reaction cam | **2.4 s** after each `REACT` time, not on screen 2, not during the countdown |
| Tower rise | over **0.8 s** from its birth time (home towers at 0.6, 1.4, 2.2, 0.9, 1.7, 2.5, 1.1, 1.9, 2.7, 0.7, 1.5, 2.3 s; forward towers at 30.5 and 31.2 s) |
| Wall growth | over **0.5 s**. Home walls are born at `1 + rand·3.5` s (1–4.5 s). Intervention walls at `27.4 + 0.25p + 0.8k` s |
| Crews | appear **1.8 s** before their wall is born and walk out (smoothstep). They walk back over **1.4 s** after. They bob `|sin(12t + i)|·0.06`. Hidden once flattening starts |
| Tower symbol spin | `0.8` rad/s about the vertical axis, stopping as it flattens |
| Drone bob | `sin(6t + id)·0.07` around height 0.55 |
| Warning ring | from **0.6 s before launch** to impact. Opacity `0.45 + 0.45·sin(16t)`; scale `1 + 0.15·sin(8t)`. Only before flattening |
| Strike flight | launch = `impact − distance/6`, so **6 units/s** along a straight ground line. Height `2.2 + sin(πu)·apex − 0.8u` with `apex = min(6, 0.18·distance)`. The trail is the last **1.4 s** of path in 30 points, opacity 0.65 |
| Impact flash | **1 s**. A sprite at height 1.6, scale `2 + 14a`, opacity `1 − a`. At most 3 shown |
| Impact debris | **34** cubes. Speed 1–7 outward, 3–10 upward. ⅔ grey `#8A8C96`, ⅓ in the victim's colour |
| Debris physics | gravity **18** units/s². On the ground (y ≤ 0.12) it bounces with `vy·−0.3` and halves its horizontal speed. It settles when |vy| < 2.5. Tumbling `rx + 4t` while airborne. Settled debris is tinted 78% toward `#3E4049`; airborne 20%. At most **1,400** in the sim, oldest settled removed first; 1,500 drawn |
| Drone launches | every **2.4–3.8 s** per player (`t + 2.4 + rand·1.4`), first at 5, 5.15, 5.3 and 5.45 s. None before 5 s, after 58.2 s, or after the player is out. Each launches from a random standing tower of that player, toward the field centre along x or z (50/50). Life 8–14 s |
| Drone speed | **4.2 units/s** |
| Drone bounces | at the field edge (0.3 margin): reverse that axis. Rock: 50% reverse, 50% turn 90° in a random direction. Enemy wall: reverse, and **35%** chance the wall breaks (3 debris). **Own walls are passed through** |
| Drone collision | enemy drones within 0.55 of each other both die (2 debris each) |
| Drone end of life | becomes 1 settled debris cube in its colour |
| Slow motion | **0.3×** speed for `44.1 < t < 45` (Pink out at 44.5) and `55.1 < t < 56` (Violet out at 55.5) |
| Turn counter | `floor(t·34)` |
| Eyes | blink when `((0.7t + 0.37p) mod 1) < 0.06` (about 6% of each 1.43 s cycle); pupils drift as in 3.0 |
| Flatten | `f = smooth(70.5, 74.5, t)` |
| Overhead camera | `smooth(70.3, 74.5, t)`; FOV 50 → 38 |

### 5.3 Camera motion

- **Shots switch by time.** `SHOTS` lists 22 entries (section 6.6). When the shot index changes, the camera **cuts** (snaps position and target). These are the "hard cuts, as in a sports broadcast".
- **Within a shot** the camera eases toward the shot's moving target with exponential smoothing, `k = 1 − exp(−7·dt)` per frame (a time constant of about 0.14 s).
- **Dolly** shots interpolate start → end with smoothstep `e = u²(3 − 2u)` over the shot's length.
- **Crane** shots orbit at `a0 + sp·(t − start)` and descend 0.4 units/s.
- **Symbol close-up** (`tower`):
  - The camera sits on the line from the field centre out through the tower, at a distance easing 7 → 5, offset 2.2 units sideways, at height 1.3.
  - It looks at the tower top (height 1.7). FOV 46.
- **Follow (strike)**: 5 units behind the craft along its direction of flight, 1.8 above it. It looks 6 units ahead and 0.6 below.
- **Follow (drone)**: described in 3.3.

### 5.4 What reduced motion changes

| Element | Normal | Reduced motion |
|---|---|---|
| Dolly shots | move start → end | **hold at the start position** (`u = 0`) |
| Crane shots | orbit and descend | **hold** at angle `a0` and height `h` |
| Symbol close-up | push in 7 → 5 | hold at distance 7 |
| Follow shots (drone and strike) | track the moving object | **replaced by a fixed wide shot**, (0, 26, 28) looking at the origin |
| Overhead | rises over 4.2 s | **jumps straight overhead** (`f = 1`) at the shot start |
| Slow motion | 0.3× around eliminations | **off** (speed 1) |
| Cuts | hard cuts | hard cuts between fixed shots |
| Turning on the toggle | — | forces a re-cut (`lastShot = -1`) |

Reduced motion does **not** change:
- drones moving, the bobbing, crews walking, towers rising and spinning;
- the warning-ring pulse, impact flashes and debris;
- the **flatten** animation on screen 8;
- eye movement and blinking;
- lesson playback and flashes.

The canvas text promises "With reduced motion, the camera holds still and cuts between fixed shots." The mockup does exactly that much, and only that.

---

## 6. The 3D broadcast: how it is built

### 6.1 Loading and renderer
- three.js **0.160.0**, loaded at runtime with `import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js')`. If that fails it shows the no-WebGL message. "For the build" asks for self-hosting.
- `WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })`, pixel ratio `min(2, devicePixelRatio)`, sized to the stage (390 × 260).
- Tone mapping `ACESFilmicToneMapping`, output colour space `SRGBColorSpace`.
- Shadows on, `PCFSoftShadowMap`.
- Scene background `#050507`; fog `FogExp2('#050507', 0.016)`.
- Camera `PerspectiveCamera(50, w/h, 0.1, 400)`.
- On unmount: cancel the animation frame, clear the timers, dispose the renderer.

### 6.2 Lights
- `HemisphereLight(0x8899aa, 0x080808, 0.55)`.
- `DirectionalLight(0xffffff, 1.5)` at (18, 40, 12), casting shadows. Shadow camera left/right ±32, top/bottom ±24, near 1, far 100. Map 1024 × 1024.

### 6.3 The field (48 × 32 cells, 1 world unit per cell, centred on the origin: `wx(x) = x + 0.5 − 24`, `wz(z) = z + 0.5 − 16`)

| Object | Geometry and material |
|---|---|
| Floor | `PlaneGeometry(240, 240)`, `MeshStandardMaterial #08080A`, roughness 1, at y −0.02, receives shadow |
| Field | `PlaneGeometry(48, 32)`, `#0E0F13`, roughness 0.95, receives shadow |
| Grid | `LineSegments` every cell at y 0.01. `LineBasicMaterial #1C1D24`, opacity 0.9 (→ `#2A2C34` once f > 0.5) |
| Edge | `EdgesGeometry(BoxGeometry(48, 0.02, 32))`, `#4A4D5A`, at y 0.02 |
| Rocks | an `InstancedMesh` of unit boxes, `MeshStandardMaterial #4B4C55`, roughness 0.85, casting and receiving shadow. Footprint 0.98. Height `0.5 + rand·1.3` per cell. Built by random walks of 4–9 steps from 16 centres: (18,10) (24,16) (30,23) (24,8) (23,25) (14,15) (34,15) (20,20) (28,12) (10,15) (38,18) (17,5) (32,28) (8,19) (40,13) (27,18). Cleared within 2 cells of every tower and under every wall |
| Walls ("squares a player put down") | `InstancedMesh` boxes, `MeshStandardMaterial #ffffff`, roughness 0.5, emissive `#111111`. Instance colour = player colour × 0.55. Footprint 0.9, height 0.7, casting shadow. 24 home walls at (x + 3dx, z + 2dz) and (x + 2dx, z + 3dz) from each home tower (d points toward the centre). Plus 4 intervention lines of 5 at (x + (5+k)dx, z + (5−k)dz) |
| Drones (gliders) | `InstancedMesh` of up to **900** boxes, `MeshBasicMaterial`, dynamic. **4 cubes per drone in the glider shape** (cells (1,0) (2,0) (0,1) (3,1), front pair forward). Cube 0.32, spacing 0.38, height 0.55 with bob |
| Drone glow | `Points` (up to **260**). A 64 px radial-gradient canvas texture (white 1 → 0.45 at 25% → 0). Size 1.5 (→ 0.6), vertex colours at 0.7 × player colour, additive, no depth write |
| Debris | `InstancedMesh` of up to **1,500** boxes 0.22 (flattened to 0.08 high), `MeshStandardMaterial`, roughness 0.9, casting shadow |
| Crews | `InstancedMesh` of `CapsuleGeometry(0.12, 0.26, 4, 8)`, `MeshStandardMaterial`, roughness 0.6, instance colour = player colour, casting shadow. One per wall plus 4 for the forward towers |
| Towers | one group per tower (14). Column: `CylinderGeometry(0.16, 0.3, 2.2, 10)`, `#2A2C34`, metalness 0.6, roughness 0.4, centre y 1.1. **Top**: a group at y 2.6 holding 4 unit cubes in the **symbol shape** (cells (0,0) (1,1) (2,1) (1,2)), `MeshBasicMaterial` in the player colour, scale 0.34, gap 0.36, spinning. Base ring: `RingGeometry(0.5, 0.75, 28)`. **Sight disc**: `CircleGeometry(7, 48)` at opacity 0.05. **Sight ring**: `RingGeometry(6.88, 7, 64)` at opacity 0.32. Glow sprite: scale 2.6, additive. **Warning ring**: `RingGeometry(1.1, 1.35, 32)`, white, opacity 0.8 base |
| Strike craft ("glider about to hit a tower") | one group per strike (9). 4 cubes in the **glider shape**, scale 0.4, spacing 0.44, player colour, `MeshBasic`. Glow sprite scale 4. Trail: a `Line` of 30 points |
| Impact flashes | 3 additive sprites with the glow texture |

### 6.4 The players and the scripted story

**Colours**:
- Cyan `#46D7E8`, Amber `#FFB43A`, Pink `#FF5C8A`, Violet `#A98BFF`.
- Out players are drawn `#7A7D88` on the scoreboard.

**Towers** (`TOWERS`, as x, z, player, birth s):

| # | Owner | Cell | Born |
|---|---|---|---|
| 0 | Cyan | (40, 26) | 0.6 |
| 1 | Cyan | (44, 22) | 1.4 |
| 2 | Cyan | (37, 29) | 2.2 |
| 3 | Amber | (6, 26) | 0.9 |
| 4 | Amber | (10, 29) | 1.7 |
| 5 | Amber | (4, 22) | 2.5 |
| 6 | Pink | (6, 6) | 1.1 |
| 7 | Pink | (10, 3) | 1.9 |
| 8 | Pink | (4, 10) | 2.7 |
| 9 | Violet | (42, 6) | 0.7 |
| 10 | Violet | (38, 3) | 1.5 |
| 11 | Violet | (44, 10) | 2.3 |
| 12 | Cyan, forward | (30, 20) | 30.5 |
| 13 | Amber, forward | (14, 18) | 31.2 |

Cyan's home is the bottom-right, Amber's bottom-left, Pink's top-left and Violet's top-right.

**Strikes** (scripted, `STRIKES`; launch = impact − distance/6):

| # | Attacker (from tower) | Target tower | Distance | Launch s | Impact s | Apex |
|---|---|---|---|---|---|---|
| 0 | Amber (5) | Pink 8 | 12.0 | 36.00 | 38 | 2.16 |
| 1 | Cyan (12) | Pink 7 | 26.2 | 36.63 | 41 | 4.72 |
| 2 | Violet (10) | Amber 5 | 38.9 | 36.01 | 42.5 | 6.00 |
| 3 | Cyan (2) | Pink 6 | 38.6 | 38.07 | 44.5 | 6.00 |
| 4 | Violet (11) | Cyan 12 | 17.2 | 46.13 | 49 | 3.10 |
| 5 | Cyan (1) | Violet 11 | 12.0 | 49.00 | 51 | 2.16 |
| 6 | Amber (13) | Violet 10 | 28.3 | 48.28 | 53 | 5.09 |
| 7 | Cyan (0) | Violet 9 | 20.1 | 52.15 | 55.5 | 3.62 |
| 8 | Cyan (1) | Amber 13 | 30.3 | 51.96 | 57 | 5.45 |

Out times (`OUT_AT`): Cyan never (99), Amber 58.2 (resigns), Pink 44.5, Violet 55.5. The score runs from 3 each (4 for Cyan and Amber after their forward towers) to the end state: Cyan 3, everyone else out.

**The drones never destroy towers.** All tower losses are the scripted strikes. The drones are atmosphere. They bounce, collide, break walls and leave rubble. The canvas says as much: "The mockup's battle is a stand-in, with towers and strikes timed by hand over simple drone physics."

### 6.5 Mapping from board things to broadcast things (verbatim from the canvas, "WHAT EACH THING ON THE BOARD BECOMES IN THE BROADCAST")

| On the board | In the broadcast |
|---|---|
| Glider (4 live cells) | A drone: four lit cubes in the glider shape, at the height of the walls |
| A glider about to hit a tower | Lifts into a short arc with a trail. A white ring pulses on the target, then −1 shows on the scoreboard. |
| Rock | A grey block. Gliders bounce off it. |
| Squares a player put down | A block in the player's colour |
| A copy of a symbol | A tower with the pattern turning on top, and its circle of sight on the ground |
| Intervention turn | Crews walk out from the symbols and set the squares |
| Collision debris | Rubble that stays on the field |
| A player's sight | The small board under each player cam. The broadcast always shows everything. |
| A player at the console | A player cam: the face, with the board glowing in clear lenses. The broadcast cuts to it after each hit, resignation and win. |

### 6.6 Every shot (`SHOTS`)

The canvas calls these "six shots: crane, wide, follow (behind a glider or spaceship), low across the rocks, symbol close-up, and overhead". Two corner dollies are labelled "CAM 3 · CYAN CORNER" and "CAM 6 · AMBER CORNER".

| # | From–to (s) | Type | Parameters | Label |
|---|---|---|---|---|
| 0 | 0–5 | crane | R 38, h 22, a0 0.9, sp 0.07, look (0,0,0) | CAM 1 · CRANE |
| 1 | 5–8 | dolly | (0,9,31) → (0,6.5,23); look (0,0,3) → (0,0,2) | CAM 2 · WIDE |
| 2 | 8–16 | dolly | (−34,27,30) → (−28,23,24); look (0,0,0) → (2,0,0) | CAM 2 · WIDE |
| 3 | 16–21 | follow | newest drone of Cyan | CAM 4 · FOLLOW |
| 4 | 21–26 | dolly | (−12,2.4,9) → (10,2.4,9); look (−4,0.6,0) → (4,0.6,0) | CAM 5 · LOW |
| 5 | 26–30 | dolly | (27,12,22) → (23,9,18); look (13,0,7) → (12,0,6) | CAM 3 · CYAN CORNER |
| 6 | 30–34 | dolly | (−27,7,18) → (−22,5,13); look (−13,0,5) → (−12,0,4) | CAM 6 · AMBER CORNER |
| 7 | 34–36.8 | dolly | (−6,30,34) → (−10,26,28); look (−8,0,−2) → (−10,0,−3) | CAM 2 · WIDE |
| 8 | 36.8–39.5 | tower | tower 8 | CAM 7 · SYMBOL |
| 9 | 39.5–41 | strike | strike 1 | CAM 4 · FOLLOW |
| 10 | 41–42.2 | tower | tower 7 | CAM 7 · SYMBOL |
| 11 | 42.2–43.4 | strike | strike 3 | CAM 4 · FOLLOW |
| 12 | 43.4–46 | tower | tower 6 | CAM 7 · SYMBOL |
| 13 | 46–48.3 | dolly | (30,28,30) → (26,24,24); look (4,0,−2) → (6,0,−3) | CAM 2 · WIDE |
| 14 | 48.3–50 | tower | tower 12 | CAM 7 · SYMBOL |
| 15 | 50–51.8 | tower | tower 11 | CAM 7 · SYMBOL |
| 16 | 51.8–53.6 | strike | strike 6 | CAM 4 · FOLLOW |
| 17 | 53.6–56.8 | tower | tower 9 | CAM 7 · SYMBOL |
| 18 | 56.8–58.2 | strike | strike 8 | CAM 4 · FOLLOW |
| 19 | 58.2–62 | crane | R 13, h 7, a0 0.2, sp 0.16, look (16,0,9) | CAM 3 · CYAN CORNER |
| 20 | 62–70 | dolly | (−22,3,14) → (16,3.6,−8); look (−6,0,2) → (8,0,−4) | CAM 5 · LOW |
| 21 | 70–99 | top | rise to (0,46,0.01), FOV 50 → 38 | CAM 8 · OVERHEAD |

### 6.7 Player cams, scoreboard and countdown
- **Player cams** are 2D. They are HTML/CSS faces (3.0) plus a 2D canvas per player for the sight view (3.2). They are not three.js. They show on screen 2 and as the single reaction cam elsewhere.
- **Scoreboard**: HTML (3.0). Dots per standing tower, "OUT" when out.
- **The Dzegoban countdown**: an HTML card, "MU GU GEI TAU FA" with *"The battle begins in fifty ticks."* under it, while `t < 4.8`. Its source is "c4-b97–b98", and the canvas order list calls it "the countdown in Dzegoban".

### 6.8 The canvas notes on the camera (verbatim)
> "There are six shots: crane, wide, follow (behind a glider or spaceship), low across the rocks, symbol close-up, and overhead. Cuts are hard cuts, as in a sports broadcast. Slow motion is used only for the half-second around an elimination. After each hit, resignation or win, a player cam shows the face of the player it happened to. With reduced motion, the camera holds still and cuts between fixed shots."
>
> "The rules are deterministic, so in the build the director can run a copy of the match a few hundred turns ahead. That tells it where a symbol is about to fall, and it can cut there before the hit lands. Everything else in the mockup is scripted by hand."

The mockup's slow motion actually lasts 0.9 s (44.1–45 and 55.1–56), not half a second.

---

## 7. Measured visual values

### 7.1 Colour tokens

**Phone themes (`TH`)**:

| Token | Light | Dark |
|---|---|---|
| paper | `#F4F2ED` | `#161614` |
| ink | `#1D1D1B` | `#E7E4DD` |
| body | `#4A463F` | `#B9B5AB` |
| muted | `#6A675F` | `#9C988E` |
| rule | `#DAD6CC` | `#33322E` |
| soft | `#E6E2D9` | `#24231F` |
| link | `#2E5A3A` | `#8DB58A` |
| btn | `#1D1D1B` | `#E7E4DD` |
| btnInk | `#F4F2ED` | `#161614` |

The stage and everything on it (HUD, board) is the same dark in both themes.

**Players**:

| Player | Colour | Lens tint |
|---|---|---|
| Cyan | `#46D7E8` | `#46D7E82E` |
| Amber | `#FFB43A` | `#FFB43A2E` |
| Pink | `#FF5C8A` | `#FF5C8A2E` |
| Violet | `#A98BFF` | `#A98BFF2E` |
| Out (scoreboard) | `#7A7D88` | — |

**Stage and board colours**:

| Use | Colour |
|---|---|
| Stage background, scene background and fog | `#050507` |
| Lesson overlay and board background | `#060608` |
| Field, board square, rule-card background | `#0E0F13` |
| 3D floor | `#08080A` |
| Grid lines (3D) | `#1C1D24`, flat `#2A2C34` |
| Field edge (3D) | `#4A4D5A` |
| Rock | `#4B4C55` |
| Tower column | `#2A2C34` |
| Impact debris grey | `#8A8C96` |
| Default debris | `#5A5C66` |
| Settled debris tint | `#3E4049` |
| Live cell (Under the hood, rule card) | `#46D7E8` |
| Empty cell (rule card) | `#23252C` |
| HUD box | `rgba(5,5,7,.78)` |
| Banner, commentary, reaction label, pause | `rgba(5,5,7,.82)` |
| Board strip, CELLS (off) | `rgba(5,5,7,.8)` |
| HUD text | `#E7E4DD` |
| Camera label, no-GL text | `#B4B3BA` |
| Banner text | `#F4F2ED` |
| LIVE dot | `#FF5C8A` |
| Pause and CELLS border | `#4A4843` |
| Cam strip borders | `#2A2C34` |
| Face card | bg `#141519`, shoulders `#2A2C34`, head `#3A3B42`, cable `#5A5C66`, eye whites `#E7E4DD`, pupils `#050507` |
| Countdown card | bg `#F4F2ED`, text `#1D1D1B`, sub `#4A463F` |
| Lit zone | `rgba(70,215,232,.12)` |
| Hint dash | `rgba(255,255,255,.75)` |
| Fog | `rgba(4,4,6,.88)` |
| Crack | `#E7E4DD` |

**Canvas page (outside the phone)**:

| Use | Colour |
|---|---|
| Page background | `#E9E6DF` |
| Text | `#1D1D1B` |
| Secondary text | `#4A463F` |
| Labels | `#6A675F` |
| Rules (dividers) | `#DAD6CC` |
| Phone outline | `0 0 0 1px #CFCAC0` |
| Phone shadow | `0 24px 60px rgba(29,29,27,.18)` |
| Links | `#2E5A3A`, hover `#1D1D1B` |
| Focus ring | `#46D7E8` |
| "1a" chip | bg `#1D1D1B`, text `#F4F2ED` |

### 7.2 Type

Fonts: **Crimson Pro** (400, 500, 600, italic 400) and **DM Mono** (400, 500), from Google Fonts.

| Element | Family | Size / line-height | Weight | Letter-spacing |
|---|---|---|---|---|
| App bar title | Crimson Pro | 18 | 400 | — |
| Skip, step text, tags, status, sources link, palette, board controls, HUD, strip, cam labels, toast | DM Mono | 12 | 400 | .04em (HUD, skip, tags, status, tools); none on strip and cam |
| Main button, BACK | DM Mono | 13 | 400 | .06em main, .04em back |
| Pause glyph | DM Mono | 13 | 400 | — |
| Direction arrows | DM Mono | 16 | 400 | — |
| Banner | DM Mono | 16 | 400 | .12em |
| "−1 NAME" | DM Mono | 30 | 500 | — |
| Commentary | DM Mono | 12 / 1.4 | 400 | — |
| Countdown | Crimson Pro | 22 | 600 | .03em |
| Countdown sub | Crimson Pro italic | 16 | 400 | — |
| Screen title | Crimson Pro | 26 / 1.1 | 400 | — |
| Screen text | Crimson Pro | 18 / 1.42 | 400 | — |
| Caption | Crimson Pro | 16 / 1.4 | 400 | — |
| Reasons | Crimson Pro | 17 / 1.35 | 400 | — |
| Rule-card text, source text | Crimson Pro | 15 / 1.3 (closing note 15 / 1.35) | 400 | — |
| Toast | DM Mono | 12 / 1.5 | 400 | — |
| Canvas eyebrow | DM Mono | 12 | 400 | .06em |
| Canvas title | Crimson Pro | 40 / 1.05 | 400 | — |
| Canvas intro | Crimson Pro | 19 / 1.45 | 400 | — |
| Canvas body | Crimson Pro | 17 / 1.5; sub-lines 15 | 400 | — |

The floor is 12 px: "Nothing is smaller than 12px."

### 7.3 Sizes, spacing, borders and radii

| Item | Value |
|---|---|
| Phone | 390 × 695, radius 18, overflow hidden |
| App bar | height 44; padding 0 6 0 18; bottom border 1 `th.rule` |
| Stage | height 260 |
| HUD boxes | inset 8; padding 6 × 8; radius 3; gap 3 |
| Commentary | left 8, right 60, bottom 8; min-height 36; padding 6 × 9; left border 2 `#E7E4DD` |
| Pause | 44 × 44; border 1; radius 3 |
| Banner | padding 9 × 14; top border 2 |
| Countdown | padding 8 × 12; gap 1 |
| Reaction cam | left 8, bottom 52; face 97 × 62 × scale 1.2; margin-top 12 |
| Cam strip | 4 × 97 px columns; faces 97 × 62; sight canvases 97 × 64 (192 × 128 backing) |
| Lesson canvas | 390 × 260 (780 × 520 backing); a square is 26 CSS px |
| CELLS | height 44; padding 0 10; border 1 `#4A4843`; radius 3 |
| Board controls | 4 columns, gap 6; padding 8 18 0; buttons 44 high, border 1 `th.rule`, radius 3 |
| Palette | 3 columns, gap 6; padding 8 18 0; buttons 44 high, border 1 `th.ink`, radius 3; arrows flex row gap 4, 44 high |
| Tags row | padding 10 18 0; gap 6; tag padding 3 × 7, radius 2, border 1 |
| Text area | padding 8 18 8; gap 8 |
| Reason rows | grid 22px 1fr; gap 6; padding 7 0; top border 1 |
| Rule-card rows | grid 88px 1fr; gap 10; padding 8 0; mini cells 12 × 12, gap 2, padding 3 |
| Source rows | gap 2; padding 7 0; top border 1; list padding-bottom 8 |
| Footer | top border 1; padding 10 18 14; gap 8; progress segments height 3, gap 3 |
| BACK | 76 × 48; border 1; radius 3 |
| Main button | flex 1 × 48; no border; radius 3 |
| Toast | left/right 18; bottom 90; padding 10 × 12; radius 3 |
| Text links (sources, rule, hood) | min-height 44; no padding |
| Mockup setting buttons | min-height 44; padding 0 12; border 1 `#1D1D1B`; radius 3 |
| Canvas section | padding 48; gap 28; columns gap 48; right column min 320, max 620, gap 26 |

---
## 8. Every statement the build makes about the book

Each row is a source line as the mockup shows it under "SOURCES (n)", with the id Design gives. The last column is my check against `content/snowmoon/text/` ("ok" means the block says it). After the table come the statements in the visible text that carry no block id.

### 8.1 With an id (the SOURCES lists)

| Screen | Statement (verbatim) | Id given | Check |
|---|---|---|---|
| W1 | A giant room inside the mountain, over a thousand watching | c4-b78–b79 | Partly. c4-b78 has "a giant room with over a thousand people watching". The mountain is c4-b49/b50/b58, not b78–b79 |
| W1 | A new rule every game; the priests decide the rule sets | c4-b84 · c4-b148 | ok ("every game there's always some kind of new rule"; "the priests went into the dungeon to decide on the rule sets") |
| W1 | "MU GU GEI TAU FA" · The battle begins in fifty ticks. | c4-b97–b98 | ok |
| W1 | Players are kept offline so they cannot learn the rule early | c12-b133–b134 | ok |
| W1 | Twenty minutes to build before the battle | c12-b143 | **Wrong id.** c12-b143 is "Zei opened his eyes again." The twenty minutes is **c12-b149** ("You will have twenty minutes to figure out your structures"), as `docs/minpentai-rules.md` §1.2 has it |
| W2 | Devices handed over in the elevator | c4-b77 | ok |
| W2 | A giant game console with a chair | c4-b79 | **Off by one.** The console is in **c4-b78** ("a giant game console with a chair"). c4-b79 is Zei gazing at the room |
| W2 | Glasses on a cable at the console | c4-b82 | ok ("glasses attached to a long cable") |
| W2 | The book never says whether the lenses are clear. Here they are, so the eyes show. | invented | — |
| W2 | Teammates normally talk by voice chat | c4-b99 | ok |
| W2 | "On the big screen, the audience watched." | c7 | No block id. The line is **c7-b86** |
| W2 | A symbol lets its owner see within thirty squares | c4-b93 | ok |
| W2 | The crowd sees a large detailed map | c4-b114 | ok |
| W3 | Gliders, walls, rocks | c4-b84 | ok |
| W3 | In the book, gliders hitting rocks can make more gliders. Here rocks only bounce them. | c4-b108 | ok |
| W4 | "All players were able to put down more squares near any copy of their symbols" | c4-b110 | ok (the book: "all players were able to put down more squares near any copy of their symbols") |
| W5 | Symbols give sight around them | c4-b93 | ok |
| W5 | A player with no symbols left is out | c4-b136–b138 | ok |
| W5 | The symbol shape is invented; the book never draws one | docs/minpentai-rules.md §1.3 | ok (the doc lists "Symbol shapes: Unspecified") |
| W6 | A player resigns | c4-b141 | ok ("At that moment, Pan resigned.") |
| W6 | A player is out when every symbol is gone | c4-b136–b138 | ok |
| W7 | Last year to compete; winning means the nationals | c4-b15 | ok |
| W7 | Prize money | c4-b73 | ok |
| W7 | Bots are strong on stock Minpentai, weak on new rules | c7-b13 | **Off by one.** c7-b13 is "Did about five games against the bots… diminishing returns". The claim is **c7-b14** ("the bots play better than me on stock Minpentai, but they are much worse at adapting to any new situation") |
| W7 | "A high-entropy wasteland" | c4-b140 | ok |
| W8 | The rule was recovered from the book's animated board | c4-b5 · c4-b7 | ok (figure c4-b5; "rotate one eighty if three", c4-b7) |
| L1 | A player with no symbols left is out | c4-b136–b138 | ok |
| L1 | The book calls them symbols. Here they are drawn as towers. | invented | — |
| L1 | Most towers when time runs out | src/lib/minpentai/match.ts | code, not book (match.ts `maxTurns`) |
| L2 | Gliders | c4-b84 | ok |
| L2 | One square per step stands for a real glider's two cells every four turns | src/lib/minpentai/glider.ts | code (glider.ts: "moving 2 cells every 4 turns") |
| L3 | Symbols lost to attacks; out when none are left | c4-b136–b138 | ok for "out" |
| L4 | Walls | c4-b84 | ok |
| L4 | No wall is invincible | c4-b9 · c4-b13 | ok |
| L5 | Players put down more squares near their symbols | c4-b110 | ok |
| L5 | 8 points; glider 4, square 1, tower 4 | src/lib/minpentai/match.ts | code. The budget is 8 in match.ts. The 4/1/4 costs are stamp sizes, listed in match-view.tsx `COST` |
| L6 | A symbol lets its owner see around it | c4-b93 | ok |
| L7 | A new rule every game | c4-b84 | ok |
| L7 | Players are kept offline so they cannot learn it early | c12-b133–b134 | ok |
| Hood | The rule, recovered from the book's animated board | c4-b5 · c4-b7 | ok |
| Practice | Players put down squares near their symbols on turns to act | c4-b110 | ok |
| Practice | A new rule every game | c4-b84 | ok |
| Practice | Sight near your symbols | c4-b93 | ok |
| Practice | 8 points; glider 4, square 1, tower 4 | src/lib/minpentai/match.ts | code |
| Practice | Amber is a simple bot. In the book, bots handle new rules badly. | c7-b13 | **Off by one**, as above: **c7-b14** |

**Ids in the canvas notes** (Guesses to check; section 10): c4-b114 (the map), c4-b82 (glasses), c4-b108 (rocks make gliders), c4-b9 and c4-b13 (no invincible wall), c4-b110 (about every thousand turns). Also docs/minpentai-sandbox.md (the straight glider).

### 8.2 Statements in the visible text with no block id on that screen

- **W1:**
  - "In Dzego" (the dateline, c4-b1, not cited).
  - "Players learn the rule only when the match starts, then get a set time to build." Covered loosely by c12-b133–b134 and c12-b149.
- **W2:** "Each player sits at a console" (cited as c4-b79, which should be b78).
- **W3:** "Once it starts, the players can only watch." No id; `docs/minpentai-rules.md` calls this *Implied* (c7-b92).
- **W4:** "Every so often, each player may put down a few pieces near their own towers." Cited c4-b110. The book says "squares … near any copy of their symbols"; "pieces" and "towers" are the tutorial's words.
- **W5:** "A glider that reaches an enemy tower destroys it." No id. The book's nearest is "shredded through both of his remaining symbols" (c10-b163), not cited, and from beyond chapter 4.
- **W6:** "If time runs out, most towers wins." No id, and the screen is tagged FROM THE BOOK. The rules doc says the book has no time limit ("Games have no fixed turn limit", Implied). The rule is match.ts's.
- **Commentary lines** (no ids anywhere):
  - "The players see only near their own towers. The crowd sees all of it." (c4-b114 is on W2's list).
  - "Intervention turn. Everyone may put down a few squares." (c4-b110).
  - "Amber resigns. Cyan wins." (resigning: c4-b141; in the book it is Pan who resigns).
  - "Most of the board is wreckage now." (c4-b140, on W7's list).
- **Lesson 7, reason 4:** "No square stops everything forever." Its id (c4-b9 · c4-b13) is on lesson 4's list, not lesson 7's.
- **Lesson 7, reasons 1–3:** sight (c4-b93), acting only on your turns (c4-b110), and rules changing every match (c4-b84). Only c4-b84 and c12-b133–b134 are listed on lesson 7.

---

## 9. Every string, verbatim

### 9.1 Canvas page (outside the phone)

- **Page `<title>`:** "Minpentai intro v3 · the match, then the pieces"
- **Eyebrow:** "MINPENTAI TUTORIAL · VERSION 3 · ALL WORDING IS DRAFT"
- **Title:** "The match first, then the pieces"
- **Intro:** "The visitor watches a whole match as the crowd sees it before learning any piece of it. The broadcast is imagined; the book's crowd sees a map. Facts from later chapters are used only where they give nothing away. Every scene in it stands for pieces on the board."
- **Mockup label:** "1a", "390 × 695, the Farcaster frame height". Settings group aria "Mockup settings"; buttons "LIGHT", "DARK", "REDUCED MOTION".
- **Under the phone:** "Tap NEXT the whole way through, or pause and go back. Each screen replays its own part of the match."
- **"NEW ORDER"** (number · title · shot · tag):
  1. "A game a whole country watches" · "Crane over the dark field as towers rise; the countdown in Dzegoban" · "BOOK"
  2. "Every player plays alone" · "Four player cams, each above that player's own view of the board" · "BOOK · INVENTED"
  3. "Then the battle runs itself" · "Follow a glider, then low across the rocks" · "BOOK"
  4. "A turn to act" · "Crews build in the cyan and amber corners" · "BOOK"
  5. "Lose every tower and you are out" · "Strikes and symbol close-ups, ending with Pink out" · "BOOK · INVENTED"
  6. "The last one standing wins" · "Violet out, Amber resigns, crane round Cyan" · "BOOK"
  7. "Your season" · "Low drift over the wreckage" · "BOOK"
  8. "Now try it yourself" · "The camera rises overhead and the battle flattens into the lesson board" · "BOOK"
  - → "Then seven lessons and a practice match, with an optional lesson under the hood, below. The old "A full match" screen is dropped, because the match now opens the tutorial." · "LEARN"
- **"THE GAME, AS THE LESSONS TEACH IT":**
  1. "Goal: keep at least one tower and destroy everyone else's. Your score is towers left. The last player with towers wins. If time runs out (turn 480 in match.ts), most towers wins."
  2. "Glider: flies straight up, down, left or right, one square per step. It flies diagonally only when a match's new rule allows it. It destroys an enemy tower it reaches. Two enemy gliders that meet destroy each other."
  3. "Square: bounces a glider back and cracks. The second hit breaks it, and that glider too. Rocks never break and are on the board from the start."
  4. "Tower: your score, your sight, and where you may build."
  5. "Turn to act: every so often (24 turns in match.ts) each player spends 8 points near their towers. A glider costs 4, a square 1, a tower 4. Between turns the match runs itself."
  6. "Sight: you see only near your own towers."
  7. "New rule: every match changes one thing, announced at the start."
  - Paragraph: "This is a pieces-level version of match.ts. One square per step stands for a real glider's two cells every four turns. CELLS on the board shows what each piece is made of, and the cell rule itself is the optional last lesson. Every lesson has the same board controls, and the big button does the lesson for you."
  - Lesson notes:
    - 1 "Keep your towers. Destroy theirs." · "The goal and the score first. Replaces "The board is alive"."
    - 2 "Gliders fly straight" · "Pieces view. One arrow, one square per step."
    - 3 "A hit destroys a tower" · "The scoring play, with −1 on the scoreboard."
    - 4 "Squares bounce gliders" · "Tap to block an incoming glider. Failing shows why."
    - 5 "Your turn to act" · "Spend 8 points in the lit area to take out the last tower."
    - 6 "You only see near your towers" · "Fog. Losing a tower shrinks your view."
    - 7 "Every match, a new rule" · "The four reasons it is hard, then practice."
    - ▶ "Practice match" · "Cyan against a simple Amber bot. Turns to act every 12 steps, 96 steps in all, fog of 3 squares and one random new rule per match."
    - + "Under the hood (optional)" · "The real cell rule on a glider, with the rule card. "Running backward", "Rocks" and "The book's own board" can live here or in the sandbox."
- **"WHAT EACH THING ON THE BOARD BECOMES IN THE BROADCAST":** section 6.5.
- **"THE CAMERA":** section 6.8.
- **"FOR THE BUILD", "TAKEN FROM THE CODE REVIEW OF MY LAST MOCKUP", "GUESSES TO CHECK":** section 10.

### 9.2 Phone, WATCH mode

- **App bar:** "Learn Minpentai", "SKIP TO FREE PLAY"
- **Skip toast:** "Opens free play (the sandbox). Not part of this mockup."
- **HUD:**
  - "LIVE · TURN {n}"
  - "CYAN {●…}" / "AMBER …" / "PINK …" / "VIOLET …", or "{NAME} OUT"
  - camera labels: "CAM 1 · CRANE", "CAM 2 · WIDE", "CAM 3 · CYAN CORNER", "CAM 4 · FOLLOW", "CAM 5 · LOW", "CAM 6 · AMBER CORNER", "CAM 7 · SYMBOL", "CAM 8 · OVERHEAD"
- **Countdown:** "MU GU GEI TAU FA" / "The battle begins in fifty ticks."
- **Banners:** "BATTLE BEGINS", "INTERVENTION TURN", "PINK IS OUT", "VIOLET IS OUT", "CYAN WINS"
- **Score pop:** "−1 PINK" / "−1 AMBER" / "−1 CYAN" / "−1 VIOLET"
- **Reaction label:** "{NAME} · AT THE CONSOLE"
- **Cam labels (screen 2):** "CYAN", "AMBER", "PINK", "VIOLET", or "{NAME} · OUT"
- **Pause:** glyphs "II" / "▶"; aria-labels "Pause the match" / "Play the match"
- **No WebGL:** "3D isn't available here. The build falls back to the flat match view."
- **Stage aria-label:** "Imagined broadcast of a Minpentai match. {commentary}"
- **Commentary (`EVENTS`, by time):**
  - 0 "Setup. Each player builds in their own corner."
  - 5 "The battle begins."
  - 9 "The players see only near their own towers. The crowd sees all of it."
  - 16 "Gliders fly straight and bounce off squares and rocks."
  - 26.5 "Intervention turn. Everyone may put down a few squares."
  - 31 "Cyan and Amber each build a forward tower."
  - 38 "Pink loses a tower. Two left."
  - 41 "Pink loses another. One left."
  - 42.5 "Violet hits back at Amber."
  - 44.5 "Pink is out."
  - 49 "Violet takes out Cyan's forward tower."
  - 51 "Cyan answers. Violet is down to two."
  - 53 "Amber hits Violet too."
  - 55.5 "Violet is out."
  - 57 "Cyan strikes Amber's forward tower."
  - 58.2 "Amber resigns. Cyan wins."
  - 62 "Most of the board is wreckage now."
  - 70 "From above, the same match is a flat board."
- **Screen titles, texts and captions:** quoted in 3.1–3.8.
- **Sources:** quoted in 8.1.
- **Progress:** "WATCH · {n} / 8"
- **Buttons:** "BACK", "NEXT", "START THE LESSONS"
- **Disclosure:** "SOURCES ({n})" / "HIDE SOURCES ({n})"
- **Tags:** "FROM THE BOOK", "BROADCAST IMAGINED", "CLEAR LENSES INVENTED", "SYMBOL SHAPE INVENTED", "DRAFT WORDING"

### 9.3 Phone, LEARN mode

- **Board strip:**
  - "TURN {n} · CYAN {●●|OUT} · AMBER {●●|OUT}[ · {n} PTS]"
  - practice: "{n}/96 · CYAN … · AMBER …[ · {n} PTS]"
  - Under the hood: "TURN {n} · LIVE CELLS {n}"
- **Stage aria-label:** "Minpentai board. {strip}"
- **Board buttons:**
  - "CELLS"
  - "◁ STEP" (aria "Step back one turn"), "PLAY" / "PAUSE", "STEP ▷" (aria "Step forward one turn"), "RESET"
  - group aria "Board controls"
- **Palette** (group aria "Pieces to place"):
  - "GLIDER · 4", "SQUARE · 1", "TOWER · 4"; under the cost rule, "GLIDER · 3"
  - arrows "←" "↑" "↓" "→" "↖" "↗" "↙" "↘", with aria "Glider flies left" / "up" / "down" / "right" / "up left" / "up right" / "down left" / "down right"
- **Tags:** "FROM THE BOOK", "GAME SIMPLIFIED", "DRAFT WORDING"
- **Lesson titles, texts, captions and buttons:** quoted in 4.4–4.6. Lesson buttons: "NEXT", "PLAY IT", "BLOCK IT FOR ME", "DO IT FOR ME", "START A PRACTICE MATCH", "END TURN", "PAUSE", "RESUME", "PLAY AGAIN".
- **Status:**
  - "NICE. YOU DID IT.", "LIKE THAT.", "AMBER −1.", "YOU LOST A TOWER, AND YOUR VIEW SHRANK."
  - "YOUR TOWER FELL. PRESS RESET AND TRY AGAIN.", "MISSED. PRESS RESET AND TRY ANOTHER ROW."
  - practice: "YOUR TURN · STEP {n}", "NEXT TURN AT STEP {n}", "YOU WIN.", "AMBER WINS.", "DRAW."
- **Toasts:**
  - "Your turn to act is over. Press reset to plan again."
  - "Too far from your towers. Build in the lit area."
  - "Not enough points left. Tap a piece you placed to take it back."
- **Reasons:** "You only see near your towers.", "You can act only on your turns.", "The rules change every match.", "No square stops everything forever."
- **Links:** "UNDER THE HOOD, OPTIONAL →", "HOW THE RULE WORKS" / "HIDE HOW THE RULE WORKS"
- **Rule card:**
  - "0 OR 4 LIVE" / "Nothing changes."
  - "1 LIVE" / "On odd turns it jumps to the opposite corner."
  - "2 LIVE" / "Every cell flips: live becomes empty, empty becomes live."
  - "3 LIVE" / "On even turns the block turns half a circle."
  - "The blocks shift one cell diagonally every turn, so cells pass from block to block. Nothing is ever created or destroyed."
- **Practice:**
  - titles: "Practice match", "You win", "Amber wins", "A draw"
  - caption: "New rule this match: {rule}", where the rule is one of "Gliders may also fly diagonally.", "Gliders cost 3 points.", "You see only 2 squares around your towers.", "Turns to act come every 8 steps."
  - texts as in 4.6
- **Progress:** "LEARN · {n} / 7", "LEARN · OPTIONAL", "PRACTICE"
- **Computed but never shown:** "POINTS LEFT {n} OF {m}" (the binding `points`).

---
## 10. Design's own notes, verbatim

### 10.1 GUESSES TO CHECK
1. The book's crowd watches "a large detailed map" (c4-b114). The 3D battle goes beyond that, so under principle 8 it carries "Broadcast imagined" on every screen that shows it.
2. The lenses are clear so the eyes always show. The book gives glasses on a cable (c4-b82) and never says what they look like. The faces are simple stand-ins for illustrations.
3. I added people: crews walk out on intervention turns and set the squares. They picture the squares being placed and stand for no rule.
4. The match is four players, last one standing. The chapter 4 match is 2 v 2, but teams would be one more rule to explain before any rule is taught.
5. Symbols are called towers everywhere a player sees them. "Symbol" stays in the sources, and its cell shape appears only under CELLS and in Under the hood.
6. Rocks only bounce gliders, as built. In the book, gliders hitting rocks make more gliders (c4-b108). That would make matches far busier, so it waits.
7. A square breaks on its second hit. That is invented: the book says no wall is invincible (c4-b9, c4-b13) but not how walls fall.
8. Diagonal gliders appear only as a match's new rule. The glider the book's rule allows moves straight (docs/minpentai-sandbox.md).
9. Turns to act: the book says about every thousand turns (c4-b110), and match.ts uses 24. The tutorial says "every so often" until that is settled.

Two of these do not match the mockup:
- Guess 1 says every screen that shows the broadcast carries "Broadcast imagined", but screens 7 and 8 show it without that tag.
- Guess 5 says symbol shapes appear only under CELLS and in Under the hood, but screen 8's flattening also lays each tower's symbol cells flat on the field.

### 10.2 FOR THE BUILD
- Render from the same Match state that the existing WatchMatch uses (match.ts, matches.ts). The mockup's battle is a stand-in, with towers and strikes timed by hand over simple drone physics.
- three.js has to be self-hosted, because production pages make no third-party requests (principle 6). The mockup loads it from a public CDN.
- The broadcast is a canvas with role="img". The commentary line is aria-live and carries the story, so nothing depends on seeing the 3D. Without WebGL, show the flat WatchMatch.
- Screen 2's inset is the existing MatchCanvas with viewer set to the cyan player.

The last bullet is carried over from v2. The v3 screen 2 shows **four** player cams, each with that player's own sight view, not a single cyan inset.

### 10.3 TAKEN FROM THE CODE REVIEW OF MY LAST MOCKUP
- Every control is a real button at least 44px tall. Progress dots are decoration, and "WATCH · n / 8" or "LEARN · n / 8" is the text.
- Nothing is smaller than 12px. Faint grey is never used for text.
- The phone is drawn at the Farcaster frame height (695), with no status bar. The app bar has no ×, because Farcaster draws its own close button.
- There are no sample people. Players are named by colour, as the app already does.
- Every claim about the book carries its block id, and everything invented carries a tag.

"LEARN · n / 8" is stale: the mockup shows "LEARN · n / 7".

---

## 11. What v3 changed from v2 (brief)

- **Thesis.** "The match first, the cells after" became "The match first, then the pieces". "Every scene in it stands for cells on the board" became "… pieces on the board".
- **Wording, from symbols to towers.** "Symbol" became "tower" in screen 2's text and in commentary lines 9, 31, 38, 49 and 57.
- **Screen 3.**
  - Text: "Gliders fly out, strike rocks and make more gliders." became "Gliders fly out in straight lines. Squares and rocks bounce them back."
  - Commentary 16: "Gliders strike the rocks and make more gliders." became "Gliders fly straight and bounce off squares and rocks."
  - The source c4-b106–b108 became c4-b84, plus a c4-b108 note.
- **Screen 4.** "About every thousand turns, each player may put down a few squares near their symbols." became "Every so often, each player may put down a few pieces near their own towers."
- **Screen 5.** Retitled from "Lose every symbol and you are out". The text now explains towers, hits and the scoreboard. The caption is now about the white ring.
- **Screen 6.** Adds "If time runs out, most towers wins."
- **Screen 8.** "Underneath, it is all cells" ("Every glider, wall and symbol you just watched is a few cells on a grid, moved by one rule. Next, learn that rule with your own hands.") became "Now try it yourself". Commentary 70: "Underneath, every piece is a few cells on a grid." became "From above, the same match is a flat board."
- **Broadcast sim.**
  - Drone launches slowed from every 0.42–0.67 s to every 2.4–3.8 s per player.
  - v2's rock hits spawned extra gliders (30% chance, capped at 170 drones). v3 drops this.
  - The strike craft changed from v2's 8-cube "spaceship" to a 4-cube glider shape.
  - New: the white **warning ring**, the **"−1 NAME"** pop, and **dots** instead of numbers on the scoreboard (v2 showed "CYAN 3").
- **Mapping table.** The row "Spaceship (a large slow glider)" was replaced by "A glider about to hit a tower". The Rock row changed from "Its height is only for looks." to "Gliders bounce off it."
- **Lessons were replaced wholesale.**
  - v2 had 8 cell-level lessons running a port of engine.ts: "The board is alive" (block grid and rule card), "Running the rules backward", "The glider", "Build one", "Rocks", "Your symbol" (symbol detection with dashed frames), "Why it is hard" (the broadcast replayed as Cyan saw it, through the player-cam sight view), and "The book's own board" (c4-b5 with the gold wall band).
  - At the end, v2 only showed a toast: "Opens the practice match, which is already built in the app."
  - v3 has 7 pieces-level lessons, a playable practice match, and one optional cell lesson.
  - Dropped from v3: running backward, building a glider by tapping cells, the rock lesson, symbol formation, the c4-b5 board, the block-grid overlay with its "NEXT STEP · BLOCKS AT (0,0)" chip, and the v2 strip "TURN n · LIVE n · SYMBOLS n".
  - New in v3: CELLS, the palette, fog, points, toasts, the fail state and the bot.
- **Reasons.**
  - "You only see the board near your symbols." became "You only see near your towers."
  - "You can act only on intervention turns." became "You can act only on your turns."
  - "No wall is invincible." became "No square stops everything forever."
- **Canvas.**
  - "THE LESSONS, AND WHAT CHANGED FROM THE BUILT ONES" became "THE GAME, AS THE LESSONS TEACH IT".
  - v2's guesses 5 ("The symbol appears first as a tower and gets its shape only in the lessons…") and 6 ("About every thousand turns" … "The existing match rules use 24.") were replaced by v3 guesses 5–9.
  - The LEARN row now says "seven lessons and a practice match".

---

## 12. The gap: what the app has today and what is missing or different

### 12.1 The app today (committed, `f21b536`)

- **Route `/minpentai`** (`page.tsx`) contains:
  - a provenance box ("**An unofficial reconstruction.** The rule and the chapter 4 board come from the book; anything marked *invented* does not.");
  - an `h1` "Minpentai";
  - the `Sandbox` component;
  - a footnote on what is from the book and what is invented.
- **`Sandbox`** (`sandbox.tsx`):
  - Four tabs at the top: **Learn, Practice, Play, Sandbox**.
  - A first visit opens the tutorial. `localStorage['minpentai-tutorial-done']` sends returning visitors to free play.
  - URL options: `?lesson=N`, `?mode=practice|play|free`, `?s=` (a shared board).
- **The tutorial: 11 cell-level screens** (`tutorial.ts`, wording in `tutorial-text.ts`):
  1. arena: c4-b5 board autoplay
  2. you: your symbol cycling
  3. alive
  4. backward
  5. glider
  6. build
  7. rock
  8. symbol
  9. match: the recorded match, as the crowd sees it
  10. hard: the same match as cyan sees it, with four reasons
  11. book: c4-b5, then "Practice match"
- **Tutorial layout:**
  - A header "Minpentai" with "n / 11" and 11 marks.
  - A board with a strip "TURN · LIVE · SYMBOLS invented" under it.
  - Transport "◁|", "Play/Pause", "|▷" on "do" screens.
  - Tags "Book · ch 4" or "invented", plus "Draft wording".
  - Title, text, reasons, caption, a status line, and a "Jump to a screen" `<select>`.
  - A sticky dock with "Skip to free play" and the one main button.
- **Practice** (`PracticeMatch`): a **scripted** 5-step lesson ("A practice match", "Spread out", "Block", "Attack", "You win") against a rival with one symbol, on the 48 × 32 engine board. It has a Test button, Undo, and a tool row (Glider / Square / Symbol, with costs in squares).
- **Play** (`PlayComputer`): a full match against the 'easy' AI, with Run / Skip ahead / Play again.
- **Sandbox** (`FreePlay`): cell and rock brushes, zoom 1×/2×/3×, pan, speed 1–30, presets, share link, and the symbol legend.
- **No 3D.** `three` is not a committed dependency. (Uncommitted work in progress adds `three ^0.186.1`, `broadcast.ts` and `broadcast.tsx`, which render the engine's recorded match as a broadcast.)

### 12.2 Screen by screen

| Design screen | What the app has | Missing or different |
|---|---|---|
| Frame and chrome | The page inside the site layout, with a provenance box, nav tabs, the tutorial header with "n / 11" marks, and a sticky dock | Design's 390 × 695 frame has a 44 px app bar ("Learn Minpentai" + "SKIP TO FREE PLAY") and no tabs. The progress text is "WATCH · n / 8" or "LEARN · n / 7", and there is a BACK button. The app has no BACK button (it has a jump `<select>`). The app's tags read "Book · ch 4" and "invented"; Design has six tag kinds. The app has no "SOURCES (n)" disclosure with block ids; its ids live only in code comments in `tutorial-text.ts` |
| W1 A game a whole country watches | Screen 1 "arena": the same title. Text "…fills a **stadium** inside a mountain…". Caption "MU GU GEI FA · starting in fifty ticks" (the pre-start countdown, c4-b83). The c4-b5 cell board autoplays at zoom 2, 6 turns/s | Everything visual: the 3D broadcast, crane shot, rising towers, HUD, countdown card. Design's countdown is the *battle* countdown, "MU GU GEI TAU FA / The battle begins in fifty ticks." (c4-b97–b98). The text differs ("giant hall" vs "stadium"), as does the caption (set time to build, twenty minutes) |
| W2 Every player plays alone | Nothing equivalent at this point. Screen 10 "hard" shows the recorded match as cyan sees it (`WatchMatch viewer={0}`) | Player faces, the four sight views, the "glasses on a cable" text, the CLEAR LENSES INVENTED tag |
| W3 Then the battle runs itself | Screens 5 "glider" and 7 "rock" teach the same facts on the cell board | Follow and low shots, drones |
| W4 A turn to act | Screen 9 "match" headline "A turn to act: everyone puts down squares." for 6 turns after each intervention | Crews, corner shots, the INTERVENTION TURN banner, forward towers |
| W5 Lose every tower and you are out | Screen 9's strip counts "CYAN 2 AMBER 2 …" (numbers) and the line "{Name} is out." | Close-ups, the warning ring, strike arcs, "−1 NAME", slow motion, reaction cams, "towers" wording (the app says "symbols") |
| W6 The last one standing wins | Screen 9 ends "{Name} wins." with a "Watch again" button | Resigning: **the engine has no resign** (`MatchEvent` kinds are placed / symbolLost / symbolGained / out / end). In the recorded match **Violet** wins (seed 2; amber out at 178, cyan at 267, pink at 346); Design's story has **Cyan** win and Pink out first. "If time runs out, most towers wins" matches `maxTurns 480` |
| W7 Your season | Screen 2 "you": the same title and text, caption "Your symbol", over the symbol cycling | Design's caption about bots; the wreckage drift |
| W8 Now try it yourself | — | The overhead rise and the flatten into the board. The app's watched match is 56 × 56 with 2 symbols per player and 8 single-cell rocks; Design's field is 48 × 32 with 3 towers each and random-walk rock clusters |
| L1 Keep your towers | Not taught as a screen. The goal appears in the practice/play intro text | The whole lesson; the CELLS toggle (no app equivalent) |
| L2 Gliders fly straight | Screen 5 "The glider" (cell board, 16 turns at 8 turns/s) and screen 6 "Build one" | Pieces view; edge bounce (the engine board wraps) |
| L3 A hit destroys a tower | No lesson. Practice step "Attack" covers it with a full-information forecast | The lesson; the instant "−1" |
| L4 Squares bounce gliders | Practice step "Block" ("One square in its path bounces it away…") | Hint spots, the crack, the second-hit break, the fail state. See 12.3 |
| L5 Your turn to act | Practice "Spread" / "Block" / "Attack" and Play use the tool row (Glider · 4 sq, Square · 1 sq, Symbol · 4 sq), arrows ↑ ↓ ← →, Undo, Test | Design names the symbol "Tower" and costs in points. Design has no Test, no Undo button (tap-to-take-back instead), no tap-twice-to-confirm, and no crowding rule. Its toasts differ from the app's problem lines ("Too far from your symbols.", "Too close to other cells.", "Not enough squares left.", "Wait for your next turn to act.") |
| L6 You only see near your towers | Fog exists only in matches (`sightMask`, sight 10). Screen 10 "hard" shows cyan's view | A dedicated fog lesson; the "view shrank" moment |
| L7 Every match, a new rule | Screen 10 "Why it is hard": four reasons in the app's v2 wording ("You only see the board near your symbols.", "You can act only on intervention turns.", "The rules change every match.", "No wall is invincible.") | Design's wording of the reasons; the link to Under the hood |
| Under the hood | Screens 3–8 and 11 are all cell-level. The sandbox has the rule and presets | The single optional lesson; the "How the rule works" **rule card** (the app has no rule card; the rule table is only in the docs) |
| Practice match | Practice is scripted (5 fixed steps against a 1-symbol rival). Play the computer is a free match against 'easy' | Design's practice is a free match on a 15 × 10 pieces board against its own simple bot, with a **random new rule**. The app has **no new-rule system**. Design drops the Play and Sandbox tabs from the flow (only "SKIP TO FREE PLAY") |

### 12.3 Where Design's pieces-level rules differ from what the engine does

The engine is the book's cell rule. `match.ts` adds ownership on top: who owns each cell, sites, sight, placing and elimination. Pieces are not objects in the engine; they are patterns of cells. So "what a glider does to X" is an emergent outcome of the rule, which I measured with the uncommitted read-only probe `scripts/probe-minpentai-pieces.ts`. In its sweep, each target gets 112 shots: 4 directions × sideways offsets −3…+3 × gap 10–13. Some offset shots miss the target, so "through" counts include misses.

**Units.** Design's mapping is 1 square = 2 cells and 1 step = 4 turns (canvas; glider.ts: "moving 2 cells every 4 turns"). The conversions below use it.

| Rule | Design (pieces-level, `pStep` and lesson defs) | Engine (`engine.ts`, `match.ts`, `ai.ts`) |
|---|---|---|
| Board | 15 × 10 squares (≈ 30 × 20 cells), **hard edges**; a glider at an edge reverses and waits a step | 48 × 32 cells (practice and play), 56 × 56 (watched match), **wrapping on all edges** (`engine.ts` header: "wrapping on all edges"). A glider leaves one side and comes back on the other |
| Glider speed and direction | 1 square/step, 4 straight directions; **diagonal only as a new rule** | 2 cells / 4 turns, 4 straight directions only. `GLIDERS` has up/down/left/right (`match.ts` l.174–179); `Dir` has no diagonals. The sandbox doc says the rule has "exactly one glider" among patterns up to 8 cells, and it travels straight. **The engine has no diagonal glider**, so the "Gliders may also fly diagonally" rule cannot be played on the engine as it stands |
| Glider reaches an **enemy tower** | Tower destroyed at once, **and the glider is destroyed** (`o.dead = g.dead = true`) | Depends on alignment and timing. In the probe's straight-on shot (a glider flying up into a p1 symbol), the glider **bounces back at about turn 24 and the tower stands**. The tower is lost only at about turn 80, after the glider wraps round and hits from the other side. Sweep: 44 shots tower stands with the glider bounced back; 40 tower lost with the glider bounced back; 16 tower lost with no glider left; 8 tower lost with the glider passing through; 4 tower lost with the glider deflected sideways. So the engine's glider usually **survives** a hit, and the tower survived 44 of the 112 shots. Also, loss is not instant: a site lasts `SITE_GRACE = 8` turns after its symbol was last recognised (`match.ts` l.41, l.144), so a tower falls up to 8 turns (2 steps) after the hit |
| Glider reaches **your own tower** | Bounces; the tower is safe (`o.p !== g.p` check, then `if (o)` reverse) | **No ownership in the physics.** Probe "glider (p0) up into own tower": p0's sites go 2 → 1 by turn 80. `minpentai-rules.md` §1.1: "Cells have no owner; a glider harms whoever it hits, including its sender's side" (Implied, c4-b109) |
| Glider hits a **square** | Square hp 2. The first hit **cracks** it and bounces the glider. The **second hit breaks the square and the glider** | A square is a single owned cell (`'mirror'`, `stampRows` `['#']`). Probe film "single square, first hit": the glider **bounces back and the square cell stays**, oscillating within its block. It never cracks, and the cell count stays at 13 throughout. Sweep: 64 bounce back, 48 "through" (includes misses); no square ever disappears, because **live cells are conserved** (`engine.ts` header; `minpentai-rules.md` c14-b35). **Neither the square nor the glider breaks** |
| Glider hits **your own square** | Same as an enemy square: cracks and breaks (no owner check in the pieces model) | Same as any square, since there are no owners in the physics. Both models agree here. Design's **3D broadcast** differs: drones **pass through their own walls**, and enemy walls **break 35% of the time** when hit |
| **Two gliders meet** | Enemy gliders on the same square or swapping squares: **both destroyed**. Same-player gliders pass through each other | Probe "two gliders head-on": both vanish from glider detection mid-collision (turn 16), then **both reappear reversed** (turn 24) and fly apart. **They bounce off each other and survive.** Sweep: 88 cases where the fired glider comes back; 24 where no glider is left afterward. Ownership plays no part |
| Glider hits a **rock** | Bounces straight back. The broadcast drones bounce back half the time and turn 90° the other half | A rock is one fixed cell; any 2×2 block containing it is frozen that turn (`engine.ts` `applyPhase`). The sandbox doc: "a glider fired straight at one bounces back", and a symbol may form on impact for a turn or two (`impactPreset`, turns 22–23 and 26–27). Sweep: 48 back, 64 "through" (includes misses). Neither makes more gliders (the book's c4-b108); Design's guess 6 says so |
| What a "tower" is | A piece. Placing one makes a tower at once (score and sight) | A **site**: a recognised symbol (`findSymbols`, any of its 13 cycle states, with an empty margin) with at least 3 of its 4 cells yours (`ownedSymbols`). Placing a "symbol" puts 4 owned cells; it becomes a site on the next `advance` if recognised. Symbols can also **form from collisions**, and anyone can form anyone's |
| Costs and budget | 8 points per turn to act: glider 4, square 1, tower 4 (`COST`) | 8 cells per intervention (`DEFAULT_RULES.budget = 8`). The cost is the number of cells stamped (`place`: `left[id] -= xy.length`): glider 4, mirror 1, symbol 4 (`match-view.tsx` `COST`). **This matches.** Design's "Gliders cost 3" rule has no engine equivalent (a glider is always 4 cells) |
| Where you may place | Within Chebyshev **3 squares** (≈ 6 cells) of one of your towers, on any empty square, only at the turn to act | Each placed cell within Chebyshev **`reach = 7` cells** of one of your sites. Also **`'crowded'`**: no live cell in the one-cell margin round the new shape, and no rock under it. Gliders **snap** to odd coordinates (`snap`). Only on `isIntervention` turns |
| Sight | Chebyshev **3 squares** (≈ 6 cells); 2 under the fog rule. The 3D broadcast's sight discs and cam clips are **circles of radius 7 cells** | Chebyshev **`sight = 10` cells** round each site (`sightMask`). Rocks always shown. The book: thirty squares (c4-b93) |
| What fog hides | Enemy pieces in the dark are not drawn. In practice, Amber's towers show through the fog **at step 0**. The strip **always shows Amber's tower count** | Cells outside sight are blank. The strip shows **"AMBER ?"** for a player whose sites you cannot see (`Counts`, `T.match.hidden`). Out players and finished matches see everything |
| Turns to act | Lessons: "every so often". Lesson 5: one turn at step 0. **Practice: every 12 steps** (= 48 turns); "every 8 steps" (= 32 turns) under that rule | `interval = 24` turns (= 6 steps). The book: about 1,000 (c4-b110). The canvas cites "24 turns in match.ts", but the practice runs at twice that |
| Match length and end | Practice: **96 steps** (= 384 turns); ends when either side has no towers. Most towers at the limit wins; equal is a draw; both zero is a draw | `maxTurns = 480` turns (= 120 steps). The last player in wins (`alive.length <= 1`). At 480 the most sites wins; ties are a draw (`advance`). **This matches in kind**; the length differs |
| Resign | "Amber resigns" in the broadcast | Not in the engine |
| New rule per match | One of four, chosen at random | None |
| The opponent | Design's bot reads the **whole board** (ignores fog). It blocks a glider in its tower's row with one square, fires up to two leftward gliders from x 10–12, and fills with random squares. It never builds towers | `ai.ts` plays **fair** (`knowledge`: only what it sees, plus rocks). 'easy': an untested rough shot 50% of the time, slow spreading of new symbols, a 40% chance of an extra unaimed glider, never defends. 'normal': tests options by `forecast` |
| Time running backward | Lessons let ◁ STEP undo steps (a history of up to 300 states); Under the hood steps the cell rule back to its start | The tutorial's cell screens step back to turn 0 (`TimeControls minTurn={0}`). Matches never step back; the app's text says "In a match, time only moves forward." |
| Tower loss timing and score | Instant; score = towers standing | Delayed by up to 8 turns (`SITE_GRACE`); score = sites |

**Summary of the rule gaps:**
- Design's squares crack and break; the engine's never do.
- Design's gliders always destroy an enemy tower they reach and die doing it; the engine's usually bounce, survive, and sometimes leave the tower standing.
- Design's enemy gliders destroy each other; the engine's bounce apart.
- Design's own towers are safe from your gliders; the engine's are not.
- Design's board has edges; the engine's wraps.
- Design's diagonal gliders, its cost-3 gliders, its new-rule system and resigning have no engine counterpart.
- Sight (3 squares ≈ 6 cells vs 10 cells), reach (3 squares ≈ 6 vs 7), interval (12 steps = 48 turns vs 24) and length (96 steps = 384 turns vs 480) all differ in number.

I have not decided fixes, as asked.

### 12.4 Other differences worth knowing

- **The broadcast is hand-scripted.** Design's own "For the build" asks to render from the real `Match`. The recorded match in `watch-moves.ts` runs 346 turns: Amber out at 178, Cyan at 267, Pink at 346, **Violet wins**. Design's commentary, banners, strike list, slow-motion windows, shot list and segment boundaries are all keyed to the scripted story, in which **Cyan wins** and Pink falls first. None of them can be reused as is. The "TURN" counter (to about 2,650) also does not match the engine's turn numbers.
- **Turn counts.** The watched match runs at 16 turns/s in the app (`WatchMatch`), about 22 s for 346 turns. Design's broadcast is 78 s.
- **Fallback.** Design's no-WebGL fallback is the flat `WatchMatch`, which exists.
- **"Screen 2's inset is the existing MatchCanvas with viewer set to the cyan player."** `MatchCanvas` with `viewer={0}` exists. Design's screen 2 shows four viewers.
- **Wording file.** The app keeps every word in `tutorial-text.ts` with `modelDrafted: true`. None of Design's v3 strings are there. The app still uses "symbol" in player-facing text where Design says "tower".
- **Accessibility.** The app's `BoardView` and `MatchCanvas` canvases each have their own `role="img"` and aria-label. Their strips and captions sit outside the image and are `aria-live`. In Design, the commentary, the pause button and the CELLS button are nested inside the stage's `role="img"` (2.3). Design's board placement is pointer-only; so is the app's.
- **Reduced motion.** The app's `WatchMatch` does not autoplay under reduced motion. Design keeps playing and only fixes the camera (5.4).

---

## 13. Things in the mockup that look unintended

These are recorded as found. None of them is decided here.

1. Screen 2 hides the pause button along with the commentary, because both are bound to `commentDisp`.
2. "LEARN · n / 8" in the canvas notes vs "LEARN · n / 7" on the phone.
3. Screens 7 and 8 show the broadcast without the "BROADCAST IMAGINED" tag, contrary to guess 1.
4. The practice match shows no tags at all (`tags: []`), not even "DRAFT WORDING" or "GAME SIMPLIFIED".
5. The practice toast for a tap during the run phase says "Press reset to plan again", but practice has no reset.
6. Lesson 5's demo fires in whatever direction the visitor last chose, not necessarily → (`L.dir` is not reset).
7. The big button ignores taps while a demo runs; there is no "finish at once".
8. In lesson 6 and in practice, the strip's Amber tower count gives away hidden information.
9. On lesson 5 and in practice the text area shrinks to about 77 px and must scroll; the status line is often below the fold.
10. Unused code: tag definitions `rocks`, `recon`, `note`; bindings `isHand`, `pipRef`, `points`; the ninth `SEG` entry.
11. The citation errors in 8.1: c12-b143 (should be b149), c4-b79 (b78), c7-b13 (b14), "c7" (b86).
12. "Slow motion … the half-second around an elimination" vs the 0.9 s windows in the code.

---

## Screenshots (`scratchpad/study/shots/`, 780 × 1390, the phone only)

| File | State |
|---|---|
| `w1.png` … `w8.png` | Watch screens 1–8 |
| `w5b.png`, `w6b.png` | Later moments in screens 5 and 6 |
| `x-w1-sources.png` | Screen 1 with the sources open |
| `x-w1-dark.png` | Screen 1 in dark theme |
| `x-skip-toast.png` | The skip toast |
| `x-w3-reduced.png`, `x-w3-reduced-b.png` | Screen 3 with reduced motion (fixed wide shot in place of follow; held low dolly) |
| `l1a.png` … `l7a.png` | Lessons 1–7 at start |
| `l2b.png` … `l6b.png` | The same lessons after the demo ("LIKE THAT." or met text) |
| `x-l1-cells.png` | CELLS on |
| `x-l4-fail.png` | Lesson 4 fail state |
| `x-l4-placed.png` | Lesson 4 with a square placed |
| `x-l4-cracked.png` | Lesson 4 with the square cracked |
| `x-l4-you.png` | Lesson 4 solved: "NICE. YOU DID IT." |
| `x-l5-zone-toast.png`, `x-l5-cost-toast.png`, `x-l5-locked.png` | The three lesson toasts |
| `x-l5-square-pick.png` | SQUARE picked (arrows hidden) |
| `x-l6-fog.png` | Fog at the start of lesson 6 |
| `hood-a.png` … `hood-c.png` | Under the hood running |
| `x-hood-rule.png` | The rule card open |
| `x-pr-act0.png` | Practice, first turn, diagonal rule |
| `x-pr-placed.png` | Practice with pieces placed |
| `x-pr-run.png` | Practice running |
| `x-pr-act2.png` | Practice, second turn |
| `x-pr-over.png` | "Amber wins" |


---

## 14. What was built (step 2, branch `site-minpentai`)

*Superseded (2026-10-09): the owner reversed "the engine stays". Learn is now Design's game ported as its own engine; see `docs/design/minpentai-learn-port.md`. The citation corrections in §14.3 still apply.*

The Learn flow follows Design's order, frame, pacing and motion: eight watch screens over a 3D broadcast, seven lessons, the optional Under the hood, and a practice match. **The engine is unchanged.** Every lesson is a real match (`match.ts`) on a 30 × 20 board, and the broadcast draws the recorded match turn by turn, so nothing a visitor sees is scripted by hand.

### 14.1 Files

| File | What it is |
|---|---|
| `src/lib/minpentai/broadcast.ts` | Runs the recorded match once (347 frames) and names what is on the board at each turn: towers (sites, with ids that persist), drones (recognised gliders, owned by majority), blocks, squares placed, and the story (begins, turn to act, tower lost, out, end) |
| `src/app/minpentai/broadcast.tsx` | The three.js broadcast, loaded only on watch screens (three.js bundled, no outside request). Towers, drones, debris, crews, sight discs, the HUD, the countdown, banners, "−1 NAME", reaction cam, player cams. The director cuts to a close-up of any tower about to fall, by looking ahead in the story. Slow motion (0.3×) around each fall. Without WebGL: a flat top view of the same frames |
| `src/lib/minpentai/segment.ts` | Which turns each watch screen replays, the shots, the speed |
| `src/lib/minpentai/lessons.ts` | The watch segments, the lesson setups, goals, failures and demos, Under the hood's board, the practice match and its four possible new rules |
| `src/lib/minpentai/pieces.ts` | The board as pieces (towers, gliders, blocks), shared by the lessons |
| `src/app/minpentai/pieces-board.tsx` | The lesson board: Design's drawing (rings, arrowheads with trails, tiles, rocks, lit area, hint outlines, fog, hit ring, "−1 NAME", CELLS), placing by tap **or keyboard** |
| `src/app/minpentai/cells-view.tsx` | Under the hood: the real cells, with the rule's 2 × 2 blocks for this turn outlined |
| `src/app/minpentai/learn.tsx` | The frame (app bar, stage, controls, scrolling text, footer), the screens, the demos, practice |
| `src/lib/minpentai/learn-text.ts` | Every word, with sources |
| `scripts/test-minpentai-lessons.ts` | Each lesson does on the engine what its words say (42 checks) |
| `scripts/search-minpentai-lessons.ts`, `scripts/probe-minpentai-pieces.ts` | How the setups were found; what each piece does |
| `scripts/check-principles.ts` P8c | Every book claim in the Learn wording cites a block that exists; quoted words are in it; the countdown is c4-b97–b98 |

The old cell-level tutorial (`tutorial.ts`, eleven screens), the scripted practice and the flat `WatchMatch` are removed. Play the computer and the Sandbox stay as they were, behind "Skip to free play".

### 14.2 Where the lessons say what the engine does, not what Design said

| Design | Built | Why |
|---|---|---|
| A glider moves one square per step | "It moves two cells every four turns" | The engine's glider (glider.ts) |
| Gliders bounce off the edge | "Off one edge, it comes back on the other" | The board wraps |
| A glider that reaches an enemy tower destroys it, and dies | "When a glider hits an enemy tower squarely, the tower is gone… A glider that only grazes a tower can bounce off instead." The lesson's glider is aimed so it does | In the probe sweep the tower stood in 44 of 112 shots, and the glider usually survives |
| Your own towers are safe from your gliders | "Gliders hit your own towers too." (c4-b109 shows it happening in the book) | Cells have no owner in the rule |
| A square cracks on the first hit and breaks, with the glider, on the second | "The glider bounces back the way it came, and the square stays where it is." | Live cells are conserved; nothing breaks |
| Two enemy gliders destroy each other | Not taught | They bounce apart in the engine |
| A tower falls the moment it is hit | It fades inside a white ring and goes up to 8 turns later | `SITE_GRACE` |
| Tower costs 4, glider 4, square 1 | Same, and the sources say why: a piece costs one point per cell | Matches the engine |
| Fog 3 squares, build zone 3 squares (≈ 6 cells) | Sight 6 cells, reach 6 cells on the lesson board | The lesson board is smaller than a match board (match: sight 10, reach 7). Both invented, tagged |
| Practice: turns to act every 12 steps (48 turns), 96 steps | Every 24 turns, 384 turns | 24 is the match engine's interval; 384 = Design's 96 steps × 4 |
| Practice new rules: diagonal gliders; gliders cost 3; sight 2; every 8 steps | Turns to act every 16 turns; sight 4; 12 points; reach 9 | Only rules the engine can express. There is no diagonal glider in the rule, and a glider is always 4 cells |
| Practice bot sees the whole board; Amber's towers show at step 0 | The existing computer player (`ai.ts`, easy), which plays fair: it sees only what its towers see | Fair play; the strip counts only towers you can see and adds "?" |
| The broadcast's story: Pink out first, Amber resigns, Cyan wins | The recorded match: Pink out at turn 178, Amber at 267, Cyan at 346; Violet wins. Screen 6's caption: "In this match, Violet outlasts the other three." Resigning is in the sources (c4-b141) as something this version does not have | The engine has no resign; the broadcast must narrate the real match |
| The TURN counter runs to about 2,650 | The engine's turns (0–346) | The real turn number |
| Rocks: random-walk clusters, 3 towers each, 48 × 32 field | The recorded match's 56 × 56 board, 8 single-cell rocks, 2 towers each at the start | The recorded match |
| Design's no-WebGL fallback: "the flat WatchMatch" | A flat top view drawn from the same frames, in the same frame and HUD | One source of truth for both |
| Screen 2 hides its pause button | Pause stays on every screen | Design slip (section 13, item 1) |
| Lesson board placement is pointer only | Tap, or arrow keys and Enter on the focused board | Keyboard access |
| The commentary, pause and CELLS sit inside the `role="img"` stage | They are siblings of the image, so they are announced and reachable | Section 2.3 |
| The tags on the lessons: GAME SIMPLIFIED | MATCH RULES INVENTED | The lessons are the real game, not a simplified one; the match rules are invented |
| Screens 7 and 8 have no BROADCAST IMAGINED tag | They have it | Design's own guess 1 |
| Practice has no tags | MATCH RULES INVENTED and DRAFT WORDING | Every screen says what is invented |
| "−1 NAME" at top 44 px | At top 70 px | At 44 it sits on the two-line scoreboard |

### 14.3 Citations corrected from Design

| Design | Built |
|---|---|
| Twenty minutes to build: c12-b143 | c12-b149 |
| A giant game console with a chair: c4-b79 | c4-b78 |
| "On the big screen, the audience watched.": c7 | c7-b86 |
| Bots strong on stock rules, weak on new ones: c7-b13 | c7-b13–b14 (b14 says it) |
| A giant hall inside a mountain: c4-b78–b79 | the mountain is c4-b58; the room and the crowd c4-b78 |

### 14.4 Differences not closed

- **Lesson 5 on a phone.** With the site's own top bar (44 px) above Design's frame, lesson 5's palette leaves about 50 px for the text at 390 × 695; the tags, title and text scroll. Design had 77 px. The tags now scroll with the text, so the title is reached first.
- **Squares are one cell.** Design's square is a full grid square (two cells); the engine's is one cell, so it is drawn at half Design's size.
- **The first visit's "What is this?" link** (on the first page of a first visit only) pushes the frame down 40 px, so the footer needs a small scroll on that one visit.
- **Watch pacing.** Design's 78-second scripted match becomes segments of the real one at 3–8 turns a second. Lesson pace matches Design's 3 steps a second (12 turns), practice 4 steps (16 turns), Under the hood 6 turns.
- **No crews per placed square in the corner shot.** Crews walk from the nearest tower to each square actually placed; they are not Design's hand-placed crews.
- **Faces.** Design's face card is reproduced (head, shoulders, cable, clear lenses, moving pupils, blinks; eyes down when out). A reaction cam shows only on "out" and the win, not after every hit (the recorded match has 81 losses).
