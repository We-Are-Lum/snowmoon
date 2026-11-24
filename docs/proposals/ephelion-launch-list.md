# Opening the Ephelion challenge in early December: the launch list (DRAFT)

2026-11-23, overnight; v2 the same day (the continuity result, #220 merged, the proposed numbers); v3 (Nate's take caps and default model, the GPT Image picture numbers). Drafted by the coding agent (Claude, a closed model by Anthropic) for Nate; DRAFT until he approves
it. "Live" means on production (snowmoon.party) today; "open PR" means not merged. Every merge waits for Nate's word;
every legal text for his "reread"; every migration for his "applied".

## Where the switches stand today (`VOICE` in `src/lib/config.ts`)

| Switch | Today | What it gates |
|---|---|---|
| `adminTrial` | on | admins (6786, 193912) use /storyboard/record and the boards |
| `open` | off | everyone signed in (the launch) |
| `realPictures` | 'admins' | real storyboard pictures, admins' $20/day pool; everyone else gets none |
| `publish` | off | publishing storyboards (public pages, the public bucket) |
| `publishInvented` | off | publishing storyboards of the three invented speeches |

## Done (live)

- **Since 2026-11-23:** the record page's top and Learn more (#219), take down on a reading (#221), the "stays on this
  device" line (#223, reread), Remove my storyboard with an in-page confirm (#222).
- **Recording:**
  - consent own-voice-v3 (reread);
  - the take kept on the device, per FID and speech;
  - each converted take kept as a private draft as soon as it comes back, even if the tab closes (#213);
  - "Check the words" on a draft kept without its check (#217).
- **Speeches:** c13-b64 from the book, and the three invented speeches v2 with their credits (#209); speech 3 v3, aiHelp true (#220, 2026-11-23).
- **Ready-made readings:** made by an admin, shared; timed on first storyboard.
- **Storyboards:** cuts, shots, pictures, the closing card, the play-through, the saved video, publishing and taking down
  (#210, behind `publish`). The phone fixes: whole-figure looks, no sideways scroll, style samples (#214).
- **Miniapp embeds:** a cast of /storyboard/record opens on the page (#218); published storyboards will open on
  themselves.
- **Checks:** P1h with its planted faults (the raw take is never stored); the reading's transcripts deleted.

## Open PRs and branches (not merged)

| What | State | Needs from Nate |
|---|---|---|
| #224, the storyboard guide over the one-scene engine | migrations 0048 and 0049 applied (2026-11-23); check:ui on the branch running | merges on Nate's word once check:ui shows only the known /challenge/make items |
| `voice-take-caps`: 2 takes a person, 6,000 credits a day, readings from the admins' pool | built, test:voice to run | the merge word |
| Moderation (report, the admin queue, hide), on its own branch | being built | reread: the ntfy item; test `NEXT_voice_moderation.sql` |

## Left before opening

1. **The production test of #213**: Nate closes the tab during "Converting…"; the agent confirms the draft read-only.
2. **The continuity test and the default model**: done. All 21 pictures, $1.09
   (https://media.snowmoon.party/review/c22fb345ffa3fb0475936a2232831380/index.html); Nate chose GPT Image 2.5 Sunburst
   as the default (2026-11-23).
3. **Caps and the ElevenLabs plan**: the caps are decided (Numbers, below; branch `voice-take-caps`). 6,000 credits a
   day is about 180,000 a month, still above the plan's 121,000: the plan, or the cap, before `open`.
4. **Who pays for everyone's storyboard pictures**: proposed in Numbers, below, for Nate's decision.
5. **Moderation of published storyboards**: Nate's go (2026-11-23), being built on its own branch.
6. **The challenge's own rules** (a reread). Terms has §6e for the remix challenge. The Ephelion challenge needs its own
   short section: the dates, who can take part, what counts (a published storyboard of one of the four speeches), and
   any reward. Drafted when Nate gives the dates and rewards.
7. **The ready-made readings**: 8 of the 9 still to make (the three invented speeches × three voices, less the one
   made), by an admin on production, about 1,700 credits each, and timed on first storyboard (about 55 credits each).
8. **The legal texts for opening** (reread):
   - the guide's two Privacy lines and the scene-references line (if the guide ships);
   - the Ephelion challenge section;
   - Privacy for everyone's storyboards (today's lines were written for the admins' trial: check they read true once
     `open`).
9. **A live check that sees the voice pages**:
   - check:ui and check:shipped can't sign in as an admin, so /storyboard/* is untested on production today.
   - Proposed: a `check:voice-live` that fetches the public pages (/storyboard/record's embed, a published storyboard's
     page) and, with an admin's test token never stored, the status route.
10. **React #418 on /storyboard/spoken/<id>**: found (2026-11-23). The page read the browser's video recorder while
    rendering, so the server wrote "This browser can't record a video." and the browser didn't. Fixed on branch
    `voice-spoken-418`.
11. **Cleanup**: the throwaway worktrees of this work (listed in the report), on Nate's OK.

## Numbers (2026-11-23)

### Decided by Nate (2026-11-23)

- **Takes:** 2 whole takes per person a day, and 6,000 credits a day for everyone's takes (about 3 whole 2.5-minute
  takes with their word checks, $1.09). Ready-made readings don't count: they and their timing are paid from the admins'
  pool. Built on branch `voice-take-caps` (not merged).
- **Default picture model for storyboards:** GPT Image 2.5 Sunburst wherever OpenAI serves; FLUX stays in the picker as
  the cheaper choice. Already so on production (storyboards use the chapter pictures' default).

### Proposed: storyboard pictures on GPT Image (for Nate to decide)

At the measured rates: $0.047 a picture plus about $0.012 a reference.
- The scene picture has 1 reference (his sheet): $0.059.
- Each shot in the scene has 3 references (the scene, his sheet, the shot before it): $0.083.
- An insert has 0 or 1 reference: $0.047 to $0.059. The closing card has none: $0.047.
- A 12-shot board, one try each: $0.059 + 12 × $0.083 + $0.047 = **$1.10**.
- With 6 redos: **about $1.60**. At the most (3 tries of each of its 14 pictures): **about $3.30**.

**1. Each person's daily allowance.** Today a storyboard picture is one of the day's 10 free pictures, and a GPT picture
counts as 3 of them, so only 3 GPT pictures fit in a day: not one board.
- Proposed: **storyboards get their own allowance, 20 storyboard pictures a day on any model** (a GPT picture counts
  as 1 here). That is a 12-shot board plus 6 redos: about $1.60 on GPT Image at most, $0.45 on FLUX.
- Their own count: storyboard pictures stop counting toward the 10 free images, and images stop counting toward these.
- The per-shot limit (3 tries) stays.

**2. The site-paid daily pool for storyboard pictures.**
- Proposed: **$20 a day**, a new pool `storyboards`, apart from the admins' $20, the images' free cap and the remix
  challenge's.
- It covers **about 12 boards a day at the full 20 pictures** ($1.60 each), or about 18 boards made with one try each
  ($1.10).
- FLUX boards stretch it: one at 20 pictures is about $0.45.

**3. What a person sees** (each time in the person's own time zone, here as 4:00 pm; the reset is midnight UTC).
- Before it runs out, the count left: "14 storyboard pictures left today".
- Their own allowance used up: "You've made today's 20 storyboard pictures. Your storyboard is saved: make the rest from
  4:00 pm."
- Everyone's pool used up: "Today's storyboard pictures for everyone are used up. Your storyboard is saved: make the
  rest from 4:00 pm."
- For a wallet account with a prepaid balance, under either line: "Or use your prepaid balance: $0.11 a shot with GPT
  Image, $0.03 with FLUX." This is the prepaid price with its 30% markup on the measured cost: $0.083 × 1.3 = $0.108, and
  FLUX $0.022 × 1.3 = $0.029. Prepaid storyboard pictures are not built yet.
- Takes, with the decided caps:
  - their own: "You've converted today's 2 takes. Your drafts are kept, and your recording stays on this device: convert
    it again from 4:00 pm."
  - everyone's: "Today's recordings for everyone are used up. Your recording stays on this device: convert it from
    4:00 pm."
  - The lines on production today are "You've converted 2 whole takes today. Redo single sentences, or come back
    tomorrow." and "Today's voice allowance is used up. It resets at midnight UTC."; these would replace them.

The six lines are drafted by the coding agent, for Nate's reread. Nothing in the pictures proposal is built.

## The order

1. This week:
   - the #213 production test;
   - #220 (aiHelp), then #219 (the Learn more approval), then the three rehearsal fixes, one at a time, with live checks
     between.
2. The continuity decision and the default picture model.
3. The guide:
   - Nate's go;
   - open its PR;
   - the reread pack (P2u, three Privacy lines);
   - SQL test, then "applied" (scene, then guide);
   - merge, live checks, then admins try it on their phones.
4. Launch decisions: caps and the ElevenLabs plan; who pays for pictures; moderation built (report and hide); the
   challenge section drafted and reread.
5. The eight readings made and timed (admin, production).
6. The switches, one at a time, with live checks after each:
   - `publish` (admins first, for a day);
   - `realPictures` true (with the chosen pool);
   - `open`;
   - `publishInvented`.
7. The announcement: Nate's cast of /storyboard/record (it opens on the page since #218).
