# Opening the Ephelion challenge in early December: the launch list (DRAFT)

2026-11-23, overnight; v2 the same day (the continuity result, #220 merged, the proposed numbers); v3 (Nate's take caps and default model, the GPT Image picture numbers); v4 (the picture numbers decided, the reviews, moderation's changes). Drafted by the coding agent (Claude, a closed model by Anthropic) for Nate; DRAFT until he approves
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

- **Since 2026-11-23:** the take caps (#228); the #418 fix (#227); the storyboard guide over the one-scene engine (#224, migrations 0048 and 0049); the record page's top and Learn more (#219), take down on a reading (#221), the "stays on this
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
| #225, moderation (report, one queue with images, a reversible hide) | Nate's changes made; test:voice 345 ok | test the changed SQL, "applied", the merge word (reread done) |
| #229, storyboard pictures' own allowance and pool | built; test:voice 332 ok | reread: the out-of-cap lines and the Privacy line; test, then apply, `NEXT_storyboard_pictures.sql`; the merge word |
| #231, test:challenge reads the Learn more parts where #219 moved them | 565 + 268 pass (main fails 2) | the merge word |

## Left before opening

1. **The production test of #213**: Nate closes the tab during "Converting…"; the agent confirms the draft read-only.
2. **The continuity test and the default model**: done. All 21 pictures, $1.09
   (https://media.snowmoon.party/review/c22fb345ffa3fb0475936a2232831380/index.html); Nate chose GPT Image 2.5 Sunburst
   as the default (2026-11-23).
3. **Caps and the ElevenLabs plan**: decided and live (#228). Nate, 2026-11-23: 6,000 credits a day fits a
   two-week challenge within the plan. **Review after the challenge.**
4. **Who pays for everyone's storyboard pictures**: decided (Numbers, below), built (#229, not merged).
5. **Moderation of published storyboards**: built (#225, not merged), with Nate's changes of 2026-11-23: storyboard
   reporters counted only since the last dismissal, the log kept when a storyboard is removed, one queue with images.
   **Later fix:** images still count reporters for all time, so after a dismissal one new reporter hides an image
   again; make images count since the last dismissal too.
6. **The challenge's own rules** (a reread). Terms has §6e for the remix challenge. The Ephelion challenge needs its own
   short section: the dates, who can take part, what counts (a published storyboard of one of the four speeches), and
   any reward. Drafted when Nate gives the dates and rewards.
7. **The ready-made readings**: 8 of the 9 still to make (the three invented speeches × three voices, less the one
   made), by an admin on production, about 1,700 credits each, and timed on first storyboard (about 55 credits each).
8. **The legal texts for opening** (reread):
   - the ntfy item for storyboard reports (#225): reread 2026-11-23;
   - #229's Privacy line (storyboard pictures as a daily count) and its out-of-cap lines;
   - the Ephelion challenge section;
   - Privacy for everyone's storyboards (today's lines were written for the admins' trial: check they read true once
     `open`).
9. **A live check that sees the voice pages**:
   - check:ui and check:shipped can't sign in as an admin, so /storyboard/* is untested on production today.
   - Proposed: a `check:voice-live` that fetches the public pages (/storyboard/record's embed, a published storyboard's
     page) and, with an admin's test token never stored, the status route.
10. **React #418 on /storyboard/spoken/<id>**: fixed and live (#227).
11. **Cleanup**: the throwaway worktrees of this work (listed in the report), on Nate's OK.

## Numbers (2026-11-23)

### Decided by Nate (2026-11-23)

- **Takes:** 2 whole takes per person a day, and 6,000 credits a day for everyone's takes (about 3 whole 2.5-minute
  takes with their word checks, $1.09). Ready-made readings don't count: they and their timing are paid from the admins'
  pool. Live (#228).
- **Default picture model for storyboards:** GPT Image 2.5 Sunburst wherever OpenAI serves; FLUX stays in the picker as
  the cheaper choice. Already so on production (storyboards use the chapter pictures' default).

### Storyboard pictures: decided by Nate (2026-11-23)

- **20 storyboard pictures a person a day, on any model**; a GPT picture counts as 1. Their own allowance, apart from
  the images' 10 a day.
- **A $20-a-day storyboard pool**, apart from the admins', the images' and the remix challenge's.
- **Review both after the challenge's first three days.**
- No prepaid line until prepaid storyboard pictures exist. When the pool is used up, the line says when it resets.
- The out-of-cap lines (pictures and takes) are in its PR for Nate's reread.

At the measured rates ($0.047 a picture plus about $0.012 a reference): a shot in the scene is $0.083; a 12-shot board
is $1.10 with one try each, about $1.60 with 6 redos. The pool covers about 12 full boards a day, or 18 with one try each.

## The order

1. Done on 2026-11-23: #220, #219, #221, #223 and #222, each with live checks, and the guide (#224, merged); the continuity test;
   the default model.
2. Done: the take caps (#228) and the #418 fix (#227). Next: moderation (#225: SQL test, "applied", merge); the
   storyboard pictures (#229: reread, SQL test, "applied", merge); #231.
3. Launch decisions: the challenge section drafted and reread; the reviews (pictures after the first three days, takes
   after the challenge).
4. The eight readings made and timed (admin, production).
5. The switches, one at a time, with live checks after each:
   - `publish` (admins first, for a day);
   - `realPictures` true (with the chosen pool);
   - `open`;
   - `publishInvented`.
6. The announcement: Nate's cast of /storyboard/record (it opens on the page since #218).
