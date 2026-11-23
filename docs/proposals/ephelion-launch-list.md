# Opening the Ephelion challenge in early December: the launch list (DRAFT)

2026-11-23, overnight; v2 the same day (the continuity result, #220 merged, the proposed numbers). Drafted by the coding agent (Claude, a closed model by Anthropic) for Nate; DRAFT until he approves
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
| #219, the record page's top, Learn more, the speeches' lines | tests and check:ui passed; 390 px screenshot | approve the one draft Learn more item ("Where he speaks from"), then the merge word |
| `storyboard-guide`, the guided dialogue over the one-scene engine (PR to open on Nate's word) | test:voice 310 ok; one real board ($0.17) | the build's go; reread: the P2u line, 3 Privacy lines; SQL: test then apply `NEXT_storyboard_scene.sql` and `NEXT_storyboard_guide.sql` |
| Rehearsal fixes: take down on a reading; Remove my storyboard; the record page's "stays in this tab" wording | three PRs (see the report) | the merge word for each; the wording for reread |

## Left before opening

1. **The production test of #213**: Nate closes the tab during "Converting…"; the agent confirms the draft read-only.
2. **The continuity decision**:
   - Finished on Nate's word (2026-11-23): all 21 pictures, $1.09 in all, review page
     https://media.snowmoon.party/review/c22fb345ffa3fb0475936a2232831380/index.html.
   - Measured per picture: FLUX $0.016 to $0.022; GPT Image $0.073 with three references; Gemini $0.068 to $0.069.
   - Nate picks the default model.
3. **Caps and the ElevenLabs plan** (a decision). Today's caps are placeholders: 20,000 credits a day site-wide, $4, and
   3 whole takes per person a day.
   - A 2.5-minute take is about 1,700 credits with its word check, so about 11 takes a day for everyone together.
   - The plan's 121,000 credits a month is about 70 takes a month.
   - Before `open`: set the caps, and the plan (upgrade, or a waiting list).
4. **Who pays for everyone's storyboard pictures** (a decision).
   - Today only admins make real pictures, on their $20/day pool.
   - At launch: a per-person daily count and a pool (the free pool, a new one, or prepaid), and whether closed models
     are offered to everyone.
   - A 12-shot board is 14 pictures (scene, 12 shots, closing card), up to 3 tries each: about $0.34 to $1 on FLUX, and
     $0.80 to $2.50 on GPT Image.
5. **Moderation of published storyboards** (a gap):
   - A published storyboard has no "report" link and no moderator hide; today only its maker can take it down.
   - Terms §7 says moderators may hide content that breaks the Terms.
   - Needed before `publish`: a report link on /storyboard/spoken/<id>, and a moderator take-down (the admin queue).
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
10. **A React hydration error (#418)** seen by the rehearsal on an admin's page. The re-run names the page; the fix
    comes with it.
11. **Cleanup**: the throwaway worktrees of this work (listed in the report), on Nate's OK.

## Proposed numbers (2026-11-23, for Nate to decide)

All from measured rates; all days are UTC days as today (midnight UTC is 4 pm Pacific).

**A take.** A 2.5-minute take is about 1,700 credits with its word check (convert 665 a minute, transcribe 0.4 a second).
The plan is 121,000 credits a month for $22, so a take costs about $0.31.

**1. The daily take cap.**
- Per person: **2 whole takes a day** (today 3). One to try, one to keep; redone sentences don't count.
- Everyone together: **10 takes a day**, so `dailyCredits` **17,000** and `dailyUsd` **$3.10** (today 20,000 and $4).
- The plan: 10 takes a day is about 510,000 credits a month, four times today's plan. Either a bigger ElevenLabs plan
  before `open` (about $93 a month at today's price per credit, if the bigger plan's is no worse), or keep today's plan
  and set the site-wide cap to **2 takes a day** (3,400 credits) with a waiting list.

**2. A site-paid daily pool for FLUX boards** (non-admins; closed models stay admins-only at launch).
- A board is 14 pictures (scene, 12 shots, closing card), up to 3 tries each. On FLUX: about $0.25 with one try each,
  about $0.40 typical (one and a half), $0.92 at most.
- Per person: **30 FLUX pictures a day** (one board with some tries; at most about $0.66).
- Everyone together: **$10 a day**, a new pool `voice` apart from the admins' $20 and the remix challenge's: about 25
  typical boards a day, or 15 people at their full 30.

**3. What a person sees.** Before either runs out, the count left: "2 takes left today" and "18 pictures left today".
When it runs out (each time shown in the person's own time zone, here as 4:00 pm):
- their takes: "You've converted today's 2 takes. Your drafts are kept, and your recording stays on this device:
  convert it again from 4:00 pm."
- everyone's takes: "Today's recordings for everyone are used up. Your recording stays on this device: convert it from
  4:00 pm."
- their pictures: "You've made today's 30 pictures. Your storyboard is saved: make the rest from 4:00 pm."
- everyone's pictures: "Today's pictures for everyone are used up. Your storyboard is saved: make the rest from
  4:00 pm."

Wording drafted by the coding agent: "Draft wording" on the page until Nate's reread. Nothing here is built.

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
