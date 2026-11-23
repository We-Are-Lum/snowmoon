# Opening the Ephelion challenge in early December: the launch list (DRAFT)

2026-11-23, overnight. Drafted by the coding agent (Claude, a closed model by Anthropic) for Nate; DRAFT until he approves
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
- **Speeches:** c13-b64 from the book, and the three invented speeches v2 with their credits (#209).
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
| #220, speech 3 v3 | test:voice passed | v3's `aiHelp` (true or false), then the merge word |
| `storyboard-guide`, the guided dialogue over the one-scene engine (PR to open on Nate's word) | test:voice 310 ok; one real board ($0.17) | the build's go; reread: the P2u line, 3 Privacy lines; SQL: test then apply `NEXT_storyboard_scene.sql` and `NEXT_storyboard_guide.sql` |
| Rehearsal fixes: take down on a reading; Remove my storyboard; the record page's "stays in this tab" wording | three PRs (see the report) | the merge word for each; the wording for reread |

## Left before opening

1. **The production test of #213**: Nate closes the tab during "Converting…"; the agent confirms the draft read-only.
2. **The continuity decision**:
   - The test stopped by the 20% rule after GPT Image's shot 2 ($0.32 spent). GPT Image's extra references cost about
     $0.012 each, not $0.006.
   - Gemini didn't run. Nate decides whether to finish it (about $0.60 more, at measured rates) and picks the default
     model.
   - FLUX held Ephelion and his clothes best and is the cheapest; GPT Image held the room best.
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
