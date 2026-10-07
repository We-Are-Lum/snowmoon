# The clickable prototype (web and mobile): what was taken

The owner asked (2026-10-07) to take the best ideas from Claude Design's clickable
prototype ("Snowmoon (web and mobile clickable).zip": a mobile shell and a desktop
three-column layout, with new reader, assistant, adaptations, intro and Minpentai
player components) that abide by good design and UI practice. The prototype itself is
not committed: its markup has no real controls (every button is a clickable `span`),
and its screens show sample people, scores and costs as if real. Its four unchanged
boards were already in this folder; the fifth (Living Edition) differs only in a link.

**Built on the `prototype-ideas` branch** (from `chat-slice-1`):

1. **Chapter bar and sheet** (`src/components/chapter-sheet.tsx`): a sticky "Ch n / 32"
   button under the top bar opens a dialog with "Ask about this chapter" and all 32
   chapters. Chapters past the furthest one opened on this device are marked "not
   opened yet", not hidden. Focus starts on the current chapter, Tab stays inside, Escape
   closes and focus returns to the button. The prototype's Read / Listen switch was not
   taken: the chapter player's own bar already has Listen, and a second control for the
   same thing would be one more thing to learn.
2. **The passage card** in a thread opened with "Ask about this": the block's stored text,
   its chapter and ¶, and "Open in reader" (`GET /api/book/block`), in place of the bare
   block id.
3. **Starter questions** in an empty thread: three reading questions per kind of thread
   (a passage, a chapter, or none), marked as draft wording, each answerable from what the
   thread may use.

**Already built on `first-visit-intro`**, so not repeated here: the About page's
one-line disclaimer under the title with the available and planned lists from
`config/intro.json` (recommendation 4), and the intro's Back, Skip in the header and
progress marks (recommendation 5).

**Held for later:** the desktop three-column layout (reading and asking side by side) is
the strongest idea not built. It is a week's work (the assistant reads its state from the
URL) and matters only outside the Farcaster frame.

The review that chose these, by a subagent of the coding agent (scratchpad paths refer to
its working copy):

---


Reviewed 2026-10-07. Prototype: `scratchpad/mockup-v2/` (shell `Snowmoon Prototype.dc.html` plus `SMReader`, `SMAssistant`, `SMAdaptations`, `SMIntro`, `MinpentaiPlayer`). App: `/Users/nathan/snowmoon-design`, branch `chat-slice-1` (`9b7e799`). Read-only; nothing in either repo was changed.

**How it was checked.** The prototype rendered in Chrome (playwright-core, `file://` with `--allow-file-access-from-files`). 21 phone states were captured as 390×844 element shots (`proto-review/m-*.png`), along with a 390×844 page shot and 8 desktop shots at 1440×900 and 1024×768 (`proto-review/d-*.png`). In each state a script measured every clickable element against the 44px tap floor and every text node against the 12px text floor. Contrast was computed from the prototype's theme objects.

**Findings that apply to every screen:**
- **No control is a real control.** Every control is a `<span onClick>` or `<div onClick>`. Across all 21 phone states the script found 0 buttons, links or `tabindex` elements, apart from the single `<input>` in a thread. There are no roles, no `aria-*`, no dialog semantics on the sheets, no focus handling and no Escape. Nothing can be reached by keyboard or announced by a screen reader. The *ideas* can be judged; the markup can't be ported.
- **Floors are broken almost everywhere.** Labels are 10–11px: the ¶ meta lines, "Private. Never published.", the model/limit footer, menu notes, "house voice" and the counters. Many targets fall short: READ/LISTEN tabs 49×26 and 63×26, "CH 1 / 32 ▾" 79×28, Recipe/Rate/Book text 14–28px tall, block-sheet buttons 40px tall, its × 14×13, starter chips 35px, "Include more ▾" 92×14, "Keep it hidden" 29px, intro dots 66×3, intro BACK 37×44, player |◀ ▶| 38×40, speed 47×26, progress ticks 22×6, Minpentai transport 36px tall.
- **Contrast fails in places.** `faint` #ABA79D is used as text for "Pictures", "NOT YET" chapters, "No questions yet" and "VIDEO · NOT YET". That is 2.15:1 on paper and 2.68:1 in dark mode. The app's `tokens.css` already forbids `faint` for text. `muted` on `soft` (11px labels inside the ● cards) is 4.37:1, below 4.5:1.
- **No reduced-motion or responsive rules.** There is no `prefers-reduced-motion` handling. Desktop is a fixed `248px | 1fr | 400px` grid with no breakpoint, so at 1024 wide the reader column is 376px (`d-08-1024.png`). Phone and desktop are switched by hand in the mockup chrome.
- **Farcaster frame (424×695).** Two stacked bars (44px app bar plus a ~44px reader sub-bar) fit. The Listen screen does not fit well: a 300px image, the tabs and a ~140px transport leave about 120px of text at 695 tall.

### Ideas

Verdicts: **adopt now**, **later (blocked by X)**, **reject**. Sizes follow `docs/design/gap-list.md` (S hours · M a day or two · L a week or more). Gap-list ids are given where they exist.

| Idea | Where in prototype | Verdict | Why | Size | Files it would touch |
|---|---|---|---|---|---|
| **Navigation** | | | | | |
| Top bar "× Snowmoon ···" with × closing the miniapp | Shell `showAppBar`; `barLeft` toasts "Closes the miniapp in Farcaster" | Reject the ×; keep the title | Farcaster already draws its own close control, so a second × is redundant and easy to hit by mistake. Outside Farcaster it does nothing. The app bar (`miniapp-bar.tsx`) already matches the board's 44px proportions (L1). | — | — |
| ··· bottom-sheet menu as the main navigation (Read · CH n, Listen, Assistant, Adaptations, Minpentai, About, Pictures COMING) | Shell `menuOpen`, `nav` | Later (when there are more than 4 destinations) | The app has 3 visible links (Ask · Cards · About), which fit in 424px. Hiding them behind ··· makes navigation less predictable. Minpentai isn't on main and Pictures is a dead entry. Rows are 46px, but the notes are 10px and there is no dialog semantics or focus trap. | S | `miniapp-bar.tsx`, `globals.css`, new `nav-sheet.tsx` |
| "Pictures · COMING" entry that only toasts | Menu, assistant home, rail "P" | Reject | Dead control (A23). Uses `faint` text at 2.15:1. "Coming" items belong on the intro's card 5 and on About, not in navigation. | — | — |
| **Reader** | | | | | |
| Reader sub-bar: "CH n / 32 ▾" chapter selector plus READ / LISTEN segmented control | `SMReader` top strip | **Adopt now** (with real buttons ≥44px) | This is chapter navigation at the top of the page; today it exists only at the foot (L2). Listen can just start the existing `ChapterPlayer`, so no separate listen screen is needed (L3). The prototype's sizes (79×28, 49×26) must be rebuilt at 44px. The sticky sub-bar costs 44px in the 695px frame, which is acceptable. | M (with the sheet) | `src/app/chapter/[n]/page.tsx`, new `src/components/chapter-sheet.tsx`, `chapter-player.tsx` (expose a play trigger), `globals.css`, `scripts/check-ui.ts` |
| Chapter sheet: current chapter, ○ Ask about this chapter, chapter list with READ / READING / NOT YET | `SMReader` `isChSheet` | **Adopt now, without "● Plan an adaptation of it"** | "Ask about this chapter" already exists as a link at the foot of the chapter. The device reading record (`lib/chat/device.ts` `readTo()`) can mark chapters, but it only stores the furthest chapter opened, so the label should say that ("opened") rather than READ/READING. List all 32 chapters, not the prototype's 2–8. Use `muted` rather than `faint` for unread chapters. It needs `role="dialog"`, `aria-modal`, focus moved in and returned to the trigger, Escape to close, `aria-current` on the current chapter, and rows ≥44px (the prototype's are 40–42px). Planning is not being built. | M | as above + `lib/chat/device.ts` (read only) |
| Living-edition header: "TOP-RATED TAKE", take title, by/remixed, 142-tick coverage strip, "25% of blocks · 4 creators", "take score +0.19", "14 OTHERS →" | `SMReader` `covInfo` (EDITION toggle a/b/c) | Reject now; later (blocked by takes, ratings, take view) | Every value is sample data (L10, L23). "Top-rated" as the default edition ranks by rating, which is in tension with principle 5 (nothing featured) and principle 6 (only totals). "14 OTHERS →" opens a "not in this mockup" stub. | L | — |
| Day-one banner "Living edition · the book … any image added here becomes a take" | `covInfo.a` | Later (blocked by takes and the composer) | The sentence promises adding images, which doesn't exist (L5). | S | — |
| Image element meta "¶ 2–3 · @ilse · v3 · +0.84" with Recipe · Rate · Book text ▾ | `SMReader` `isImg` | Reject the creator and score; Recipe is already live | Creators, versions and scores are fake (L11, L23). Rate needs ratings. The app already captions seeded images "AI-generated image, a starting point · recipe". Book text ▾ only matters once images *replace* text (L14). | — | — |
| Gap row "¶ 9 · BOOK TEXT · NOT YET ILLUSTRATED · + Add" and "+ Add an image" scene rows | `isGap`, `isAdd` | Later (blocked by the composer) | Opens a stub (L8, L18). Dead "+ Add" controls are worse than none. | L | — |
| Two images side by side for adjacent blocks | `isPair` (EDITION MOSTLY) | Later (blocked by takes and more seeded images) | Fine at 390px (each 240px tall), but the sample creators are fake and there aren't enough real images for it. | M | — |
| Device template inline with "¶ 18 · template veridia/vote@3f1 · human-authored" | `isDev` | Already live | `veridia/vote` renders with a "¶ 18 · template …" caption (L9). | — | — |
| **Block actions** | | | | | |
| Tap a paragraph to select it; inline strip "¶ 4 · SELECTED ×" with ASK ABOUT THIS · ADD IMAGE · COPY LINK | `SMReader` `it.sel` (`m-04-block-actions.png`) | Later, in part; reject ADD IMAGE | Tapping a whole block is easier to discover than text selection, but it fights native selection, which the app's `QuoteShare` relies on for multi-block quote cards. Accidental taps while scrolling would open the strip. The app already offers "Share quote · Ask about this" on selection (A2). ADD IMAGE needs the composer. COPY LINK to `#c1-b4` is cheap but adds little next to Share quote's Copy link. Strip buttons are 40px tall; the × is 14×13. Revisit after testing whether readers find "Ask about this". | M | `quote-share.tsx`, `globals.css` |
| Selected-block ring (3px accent left rule) when coming from "Open in reader" | `applyFocus`, `selC` | Already live | `.block:target` has the accent rule and `scroll-margin-top`, and quote cards link `/chapter/n#id`. | — | — |
| **Listen** | | | | | |
| Full Listen screen: 300px image, current block highlighted with the next block faded, transport (speed, \|◀, 52px play, ▶\|, "house voice"), "¶ 2 of 142 · 0:40 / 22:40" | `SMReader` `isListen` (`m-06-listen.png`) | Later | The app's player already highlights the current block in the page and shows its image (L17). A separate screen hides the text, crowds the 695px frame and repeats the player. Prev/next are 38×40, speed 47×26 and "house voice" is 10px. | M | `chapter-player.tsx` |
| Progress bar with one tick per block, tinted where an image exists, tap to seek | `pticks` | Later | Real data exists (narration cues and seeded images), but each tick is 22×6px. It needs a ≥44px-tall hit area and a slider role with arrow keys (L20). | M | `chapter-player.tsx`, `globals.css` |
| "No image for ¶ n in this take · + Add an image to this moment" | `pl.noImg` | Later (blocked by the composer) | L18. | — | — |
| IMAGE / VIDEO · NOT YET tabs | `isListen` header | Reject | Dead tab, 11px text in `faint` (L4, L25). | — | — |
| **Assistant placement and threads** | | | | | |
| Desktop three columns: nav and chapter list 248px (collapses to a 56px rail), centre content, assistant 400px (closable). "Ask about this" and "Open in reader" update the other column without leaving the current one. | Shell `isDesktop` (`d-02`, `d-03`, `d-04`) | Later (after slice 1 is accepted) | Strong idea for desktop web: reading and asking side by side. But it is L here: `Assistant` reads its state from `window.location`, so it would need props and a panel host. It has no breakpoint (the reader is 376px at 1024 wide) and is irrelevant in the 424px frame. It needs a collapse-to-overlay rule below about 1200px. | L | `assistant.tsx` (props instead of URL), `layout.tsx`, `chapter/[n]/page.tsx`, `quote-share.tsx`, new panel CSS |
| Desktop rail with single letters "R L A Ad M ? P" | Shell `leftClosed` | Reject | Unlabelled abbreviations with no tooltip or accessible name. If a rail is built, use full labels or real icons with names. | — | — |
| Desktop left column: chapter list with READ / READING, "@nate · Sign out" | Shell `leftOpen` | Later (with the desktop layout) | Same reading-record caveat as the chapter sheet. The app has no sign-out (Quick Auth is per session). | M | — |
| Mobile: reader and assistant stay mounted, so a thread survives a trip to the reader | Shell `dReader` / `dAsst` | Not needed | Threads are already kept on the device (`snowmoon.ask.threads.v1`), and `/assistant?t=` reopens a thread. | — | — |
| Assistant home: intro line plus two entry cards (○ Ask about the book / ● Plan a piece), ○ and ● lists | `SMAssistant` `isHome` (`m-08`) | ○ half already live; reject ● now | Planning is not being built (owner decision; A5, A8). The ○ card exists (`as-start`). The ● card's 10px label is `muted` on `soft` at 4.37:1. | — | — |
| **Attached-passage card at the top of an "Ask about this" thread:** "ASKING ABOUT · ¶ 4" plus the block's text in italics, clamped to 4 lines, tap to open in reader | `SMAssistant` `hasCtx` (`d-03-ask-block.png`) | **Adopt now** | The app currently shows the raw id ("Asking about c1-b19", `assistant.tsx` `.as-attached`), which means nothing to a reader. The text must come from the stored book text by block id, never from the model. The card should be a link to `/chapter/n#id` with the real ¶ label. For a chapter thread, "Asking about · Chapter 3". | S | `assistant.tsx`, `src/app/assistant/page.tsx` or a small read-only block endpoint, `lib/chat/device.ts` (keep label and text with the thread), `assistant.css`, `check-ui.ts` |
| **Starter questions ("TRY") in an empty private thread** | `ASK_CHIPS`, `hasChips` (`m-10`) | **Adopt now, reading-only wording** | Lowers the blank-box problem. The prototype's chips are 35px tall, and its third chip ("What should I check before adapting this?") points at planning, so swap it for a reading question. Hide the chips after the first message. The wording is draft (`DraftTag`), and each chip is a `<button>` that sends. `check:ui` replays answers by question, so the fixture needs entries for the chip questions. | S | `assistant.tsx`, `assistant.css`, `scripts/fixtures/chat-live-*.json`, `check-ui.ts` |
| Thread header "○ ASKING · PRIVATE · NEVER PUBLISHED" with dashed rule, and "Answering from ch 1–3, what you've read · Include more ▾" | `isAsk` | Already live (the app's version is better) | The app uses a real `<select>` for the limit. The prototype cycles 3→6→12→32 on a 92×14 text tap. | — | — |
| Quote cards: italic book text, "CH 1 · ¶ n", "OPEN IN READER →" | `isQ` | Already live (the app's version is better) | The app renders quotes from stored text with the real ¶ label (gap conflict 6). The prototype doubles the quotes (`""Five points for me!"…`) and guesses ¶ numbers. | — | — |
| Held back for spoilers: "SHOW IT · INCLUDE UP TO CH 6" / Keep it hidden | `isHeld` | Already live (the app's version is better) | The app lets the reader pick the chapter. | — | — |
| Declined, with "here's what I can do instead" items that send on tap | `script()` decline, `isInst` | Already live (as a list); tap-to-send is optional | The app shows the alternatives as a static list. Making them buttons is S, but the replies would need to stay grounded. Low value. | S | `assistant.tsx` |
| Private question → "● Start a planning thread?" fork, "Bring your question over? It will be public" | `isFork`, `showForkIntro`, `showBring` (`m-13`) | Reject now; later (blocked by planning threads) | Owner decision: ask only (A11). Fork detection by regex would also misfire on reading questions such as "point of view". | M | — |
| Start screen (Start writing / Talk it through first), planning thread signed @name, piece editor tab "YOUR PIECE · n W" | `isStart`, `isPlan`, `showPiece` | Reject now; later (blocked by planning, pieces and own-words consent) | A8–A10, A20. | L | — |
| Publish review "This whole thread goes public. It can't be trimmed", Discard / start clean | `isReview` | Reject now; later (blocked by publishing; conflicts with `docs/removal.md`) | A12, A22 (gap conflict 4). | L | — |
| First-time notice with 4 points and "Don't show this again" | `showNotice` (`m-09`) | Already live | The app's notice is a real dialog with a `<label>` checkbox and names host and provider. The prototype's point 4 ("may become public") is about planning and must stay out. | — | — |
| Daily limit panel replacing the composer: "0 OF 30 LEFT TODAY", reset time, READ THE BOOK / BACK TO THREADS | `limited` (`m-19`) | Live; "Back to threads" is optional | The app has the limit reply and a "Read the book" link. A second action back to the thread list is S and low value. | S | `assistant.tsx` |
| Signed out: "Your threads need a name to sit under … Private questions are kept for you. Planning threads are published …" | `isSignedOut` (`m-20`) | Already live (the app's wording is right) | The prototype wording breaks device-only ("kept for you") and mentions planning (gap conflict 5). The app says "kept on this device only". | — | — |
| Composer footer "‹model› · open weights · via ‹host›" and "n of 30 left today" | `canSend` footer | Already live | The prototype's footer is 10px; the app's is 12px. | — | — |
| Thread "···" options: rename, delete | `onMore` toast | Later | The app already deletes from the list (× with an aria-label). Rename is low value. | S | — |
| **Adaptations** | | | | | |
| Adaptations list: "None of them is official", + PLAN AN ADAPTATION, sorts NEW / TOP RATED / BY CHAPTER, "● HOW THIS WAS MADE / NO ASSISTANT USED" chips | `SMAdaptations` `isList` (`m-15`) | Reject PLAN and TOP RATED; the "not official" line is worth keeping | The seed pieces (@ilse, @kaz, @mira, times, scores) are fake. Planning isn't built and ratings don't exist. The app's `/adaptations` lists real briefs and already says "starting points, not canon". Sort chips are 11px with 3px underlines. | — (line already live) | — |
| Piece view with PIECE / HOW THIS WAS MADE tabs, overlap flags (6-word overlap, highlighted, "SEE IN PIECE →") | `isPiece`, `showMade` (`m-16`) | Later (blocked by published planning threads) | The overlap check is the one real algorithm in the mockup and is worth keeping for planning (A13). The app's briefs already put "How this was built" under the piece, collapsed. | L | — |
| **Intro and About** | | | | | |
| Intro: SKIP in the header, 3px progress dots that jump, BACK + NEXT, last card "START READING" | `SMIntro` intro (`m-01`, `m-02`) | **Adopt now: Back, Skip at the top, progress** | Gap F2 (stage 4). The app has Skip + Next at the foot and "n of 5". Add Back, move Skip to the header, and show progress either as non-interactive `aria-hidden` dots next to "n of 5" or as dots with ≥44px hit areas (the prototype's are 66×3). BACK is 37×44 in the prototype and needs 44 wide. Keep the existing dialog focus and Escape behaviour. | S | `first-visit.tsx`, `globals.css`, `scripts/check-intro.ts` |
| Intro card 1 with "[Author name]", "[LICENCE NAME]" and the independence line | card 1 | Already live (real values) | — | — | — |
| Intro card 2 "HOW THIS WAS MADE … img-a 4.0 · $0.031 · funded by @nadia" and card 3 remix chain @ilse → @tovah → @kaz | cards 2–3 | Reject | Fake creators, cost and sponsor (F4, gap conflict 1). | — | — |
| Intro card 4 "Available now … play the game, browse adaptation seeds" and card 5 "Planned … Start an adaptation" | cards 4–5 | Reject the wording as is | Minpentai isn't on main, so "play the game" is false there. The README itself flags that card 5 contradicts the assistant's planning flow; under the owner's decision card 5 is the right one. The PLANNED stamp and dashed treatment are fine (F5). | S (treatment) | `config/intro.json`, `first-visit.tsx` |
| About: "About this edition" with the one-line "Independent adaptation · Not affiliated with the author · No token" directly under the title, the 5 intro items as numbered sections (live as solid chips, planned as dashed), "Replay the intro →" at the bottom | `SMIntro` about (`m-17`, `d-06`) | **Adopt now (the top line and live/planned sections)** | F7. The app's About states independence and no token in separate paragraphs and puts Replay at the top. The exact one-liner under the H1 is clearer. The live/planned lists can come from `config/intro.json` `status`. Live chips have no link in the prototype; make each one link to its `href`. | S | `src/app/about/page.tsx`, `globals.css`, `lib/intro.ts` |
| The rule that the disclaimer appears *only* on intro card 1 and About | README "Rules carried over" | Reject the "only" | **Conflicts with principle 7**: "The 'not affiliated' line stays on the first screen". `check:ui` asserts this on the home screen. Returning visitors never see intro card 1 and deep links skip it. Keep the line on the first screen as well. | — | — |
| **Minpentai player** | | | | | |
| 12-screen tutorial with × exit, "n / 12", 3px jump dots, canvas board, lettering with gloss, BOOK · CH 4 and DRAFT COPY tags, Sources, Skip tutorial / BEGIN | `MinpentaiPlayer` (`m-18`) | Later (blocked by stage 5 and the symbol conflict) | The tutorial's look is good. It depends on the `minpentai-rules` branch and on gap conflicts 2 and M7–M9. The canvas has no text alternative, the transport buttons are 36px tall and the dots are 3px. | L | branch `minpentai-rules` |
| **States and mockup chrome** | | | | | |
| Dark theme | `TH.dark` everywhere | Already live (system setting) | — | — | — |
| "Not in this mockup yet" stubs and toasts for Recipe, Rate, Composer, Take view, Video, Pictures | `stub()`, `toast()` | Reject | Shipping dead controls breaks predictable navigation. Leave controls out until they work. | — | — |
| "9:41 · FARCASTER" status bar | phone frame | Reject | Device chrome (L24). | — | — |

### Recommended now

Each item is buildable on `chat-slice-1` today with no sample data and no planning, takes, ratings, composer or publishing. Ordered by value.

1. **Reader sub-bar and chapter sheet.** A sticky 44px strip under the app bar holds "Ch n / 32 ▾" and a Read / Listen segmented control, all real `<button>`s at least 44px tall. Listen starts the existing `ChapterPlayer`. The chapter button opens a bottom sheet (`role="dialog"`, focus in, Escape, focus back to the trigger) with three things:
   - "○ Ask about this chapter" → `/assistant?chapter=n`
   - all 32 chapters, `aria-current` on this one, chapters past the device reading record in `muted` (not `faint`) and marked "furthest opened" honestly
   - no "Plan an adaptation".

   Size M. Files: new `src/components/chapter-sheet.tsx`, `src/app/chapter/[n]/page.tsx`, `chapter-player.tsx`, `globals.css`, `check-ui.ts`.
2. **Attached-passage card in "Ask about this" threads.** Replace "Asking about c1-b19" with "Asking about · Ch 1 · ¶ 19". Show the block's stored text in italics (4-line clamp) and link the card to `/chapter/1#c1-b19`. Chapter threads read "Asking about · Chapter n". Size S. Files: `assistant.tsx`, `src/app/assistant/page.tsx` (or a read-only block lookup), `lib/chat/device.ts`, `assistant.css`.
3. **Starter questions in an empty thread.** Three reading-only questions, marked draft, as ≥44px buttons that send on tap and disappear after the first message. Add the matching replay fixtures so `check:ui` still covers the screen. Size S. Files: `assistant.tsx`, `assistant.css`, `scripts/fixtures/…`, `check-ui.ts`.
4. **About: one-line disclaimer under the title, plus live/planned sections from `config/intro.json`.** Live items are solid chips that link to their `href`; planned items are dashed and labelled "Planned". Keep the existing paragraphs. Size S. Files: `src/app/about/page.tsx`, `globals.css`.
5. **Intro: Back, Skip at the top, visible progress.** Add a 44×44 Back from card 2 on. Move Skip into the card header. Keep "n of 5" and add decorative dots (`aria-hidden`) or tappable dots with 44px hit areas. Keep the existing focus and Escape handling and the card 1 line. Size S. Files: `first-visit.tsx`, `globals.css`, `check-intro.ts`.

The desktop three-column layout is the strongest idea that isn't on this list. It is held back only because it is L (the assistant reads its state from the URL) and only matters outside the miniapp frame. It is a good next step once slice 1 is accepted.

### Rejected and why

- **Fake content shown as real.** This covers the take header (title, creators, "take score +0.19", "25% of blocks · 4 creators", "14 others"), the image meta "@ilse · v3 · +0.84", the seed adaptations (@ilse, @kaz, @mira with scores), and intro cards 2–3 ("$0.031 · funded by @nadia", the remix chain). None of it exists, and sponsorship and ratings aren't built (gap conflict 1).
- **"Top-rated take" as the default edition and the TOP RATED sort.** They depend on ratings. Ranking the default edition by score is also in tension with principles 5 and 6.
- **Planning, forking, the piece editor, publish review, "+ Plan an adaptation" and "● Plan an adaptation of it".** Owner decision: only "ask about the book" for now.
- **× close-miniapp in the bar.** It duplicates Farcaster's own close control and does nothing outside Farcaster.
- **The single-letter desktop rail (R L A Ad M ? P).** The labels are unreadable and have no accessible names.
- **Dead controls:** Pictures · coming in navigation, the VIDEO · NOT YET tab, ADD IMAGE, "+ Add an image", Rate, and the "not in this mockup" stubs. They fail predictable navigation, and several use `faint` text below 2.7:1.
- **The disclaimer appearing "only on intro card 1 and About".** This conflicts with principle 7: the line stays on the first screen.
- **The signed-out wording "Private questions are kept for you".** Threads are device-only; the app's "kept on this device only" is correct.
- **The prototype's markup as a base for code.** It has no semantic controls, roles, focus handling or keyboard support. Text is at 10–11px and most targets are under 44px.

### What changed in Living Edition

Only one line differs between `mockup-v2/Living Edition.dc.html` and `docs/design/living-edition.dc.html`. It is the "Board references" link in the intro paragraph (line 20): `href="direction-boards.dc.html"` became `href="Direction%20Boards.dc.html"`. That is just the file name used inside the Design export. Nothing visual, behavioural or textual changed. The other four boards (`Assistant Chat`, `Direction Boards`, `First Visit Intro`, `Minpentai Tutorial`) are byte-identical to the repo copies, as are `support.js` and `minpentai-tutorial-copy.json`. The repo copy's lowercase link is the right one for the repo, so no update is needed.

### Principles

| # | Principle | Touched by this review | Status |
|---|---|---|---|
| 1 | Public recipes; people know their words are public | Recommended items publish nothing | Pass |
| 2 | AI declared; the words of a piece are people's | The attached-passage card must render the book's text from storage, never model output; starter chips are labelled draft | Pass, if built that way |
| 3 | Open-weights allowlist | No model change | Pass |
| 4 | No model output published without a person's action | Planning and publishing rejected for now | Pass |
| 5 | Nothing canon, official or featured | The prototype's "top-rated take" default edition | **Concern** (rejected; raise before takes are designed) |
| 6 | No third-party requests; only rating totals public | Per-element scores on images; chat host already flagged in the proposal | Concern (rejected); the existing tension is unchanged |
| 7 | No token; the "not affiliated" line stays on the first screen | The prototype rule "only on intro card 1 and About" | **Conflict with the prototype**: keep the line on the first screen. Recommendation 4 adds it to About without removing it anywhere |
| 8 | Dzegoban, Minpentai and in-world screens match the source | Minpentai player (later); vote template already live | No change |

`npm run check:principles` was not run: nothing in the repo changed.
