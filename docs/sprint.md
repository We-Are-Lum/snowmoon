# Sprint to Friday 16 October

The running list for the bounty sprint (poidh bounty closes Sunday 18 October, 11:59pm Pacific). Kept by the coding agent;
anyone can see where things are. Newest first within each section. Model-drafted working note.

## Rules in force (owner, 2026-10-14)

- While the owner is out: merge nothing to main, publish nothing, no spend over $5.
- Questions go in "Waiting for the owner" below; work carries on with the next task.
- Published words (narration, dialogue, voice descriptions, sound lines, styles) are the owner's. Per-shot and per-cue prompts may be model-drafted and are labelled.
- Open-weight models only for published assets. Fifteen Days carries spoilers through chapter 19 while the c19 on-screen line is in.

## Done

- 2026-10-14: **Style test, round one**: 23 styles (9 from the repo, 6 forks and 4 bigger swings from the image ideas doc, 4 new) x 3 frames (the café two-shot, Bai alone watching, the vigil close-up), same subject and seed per frame, Z-Image Turbo via the owner pipeline, $0.345 of a $2 cap. Owner-only page with favourites: https://claude.ai/artifact/41FYkzf29asiwEhhEHWqUv. Test prompts model-drafted and labelled; no artist or studio named.
- 2026-10-14: **End card and description** from one file, `adaptations/fifteen-days/end-card.json` (DRAFT wording): AI declaration, words, voices, pictures, GPL v3, source and make-your-own links. The renderer draws it after the last shot; `scripts/scene-description.py` writes the matching description.
- 2026-10-14: **Allowlist prices corrected**: Kandinsky 5 ($0.04 a second at 512P, $0.12 at 1024P) and LongCat-Video-Avatar ($0.30 a second at 720p per fal's page, budgeted at $0.60 until an invoice settles fal's own contradiction).
- 2026-10-14: **Launch caps** on branch `site-launch-caps` (stacked on `site-chat-owner-cap`; for approval, not merged): free images $15 a day site-wide, 10 per person, 50 on 16 to 19 October UTC; Assistant $5 a day; prepaid 300 a day per wallet, counted in image_asks, with a $200 circuit breaker and ntfy alerts at 50% and 100% (migration 0012, not applied). A wallet at its count sees: "This wallet has made 300 images today, the most for one day. Your balance is kept; more tomorrow (00:00 UTC)." (draft). Wallet accounts publish 3 images a day, as before (tested).
- 2026-10-14: **Assistant notice**: the owner's reread recorded on `site-chat-owner-cap` (words unchanged), covering the 1,000 a day for FID 6786 and the $5 site-wide cap. P6e and P6f pass.
- 2026-10-14: **P1c read (read-only)**: the two flagged rows are the owner's own style "core" (v1) and "warm light" (v2), published 13 October; styles keep each sample's recipe inside their body and never set recipe_id, which is what P1c checks. All 5 published style versions have recipe_id empty. Nothing changed; the fix is to the check (count a style whose samples all carry recipes).

- 2026-10-14: **Fifteen Days is a seed** (`adaptations/fifteen-days/brief.md`, `config/adaptations.json`, working title): citations from chapters 4 to 15 only (spoilers through 15), everything not in the book marked invented, the proposed six-beat Friday cut, and six open questions. `check:adaptations` passes. Model-drafted; structure only.
- 2026-10-14: **Voice test, stand-in source** (`scripts/design-voice.py`, `scripts/convert-voice.py`): three placeholder voices (Zei, Deluin, Bai; descriptions model-drafted from the scenes plan, neutral accents) designed on Qwen3-TTS VoiceDesign via fal for at most $0.27, then two stand-in lines (Kokoro, not a person) converted into each locally with Chatterbox on the CPU, 45 to 93 s per line. Outputs carry the Perth watermark. The converter refuses a take inside a repository folder, never copies it, and records only its sha256. Waiting for the owner's two takes (question 2).
- 2026-10-14: **Timeline, mixer and renderer, end to end** on the dog-dawn panels with placeholder audio: `adaptations/dog-dawn/timeline.json` (test, placeholders only), `scripts/scene-placeholders.py`, `scripts/mix-scene.py`, `scripts/render-scene.py`. 20 cues, 11 shots, 3 beds with J-cut lead-ins, 4 Foley hits, cuts and dissolves, a move on every shot, lettering fading in on cue and moving with the image. Mix at -16.3 LUFS, peak -1.0 dBTP (the podcast's target); video 85.1 s, 1920x1080, 30 fps, -16.2 LUFS. Rendered in 640 s while other work ran (about 0.13 s a frame alone, so roughly 6 to 12 minutes for a 3-minute piece).
- 2026-10-14: The locked dog-dawn panels were missing locally (images-out was lost on 8 October); all 11 restored from the owner's Drive folder "Snowmoon images/dog-dawn panels", matched by sha256.
- 2026-10-14: **check:ui crash: the environment, not the caps change.** On main, three runs in a row: pass, fail ("/chapter/1 #c1-b31 live (light): Reset leaves it at 50"), pass, the failing run while a video render loaded the CPU. On the caps branch: one Node crash, then a full pass with nothing else running. The suite is timing-sensitive under load. Run checks alone, and rerun once before believing a failure. Not fixed (30 minutes, as asked).
- 2026-10-14: `scenes-sound` checked (no audio, no keys, no env values; `.env.example` holds names only) and pushed to GitHub as a backup, with preview deploys off for it and `dog-dawn-comic`. `dog-dawn-comic` was already merged into it on 13 October.
- 2026-10-14: FID 6786's per-person caps raised (branch `site-styles-per-day`, not merged): 10,000 Generates, 1,000 image publishes, 1,000 styles or sheets a day. Local checks pass. The site-wide daily spend caps ($2 free images, $2 assistant) still apply, so they are the real limit.
- 2026-10-14: the Assistant's 1,000 a day for FID 6786 is on its own branch, `site-chat-owner-cap`; it waits on the owner's reread of the notice (words unchanged).

## To watch and listen to

- The placeholder video: `scenes-out/dog-dawn/video/dog-dawn.mp4` (placeholder voices and synthesised sound; it tests timing, moves, cuts, dissolves, lettering and loudness, not taste).
- The three designed voices: `scenes-out/fifteen-days/voices/{zei,deluin,bai}.ref.wav`.
- The conversions: `scenes-out/fifteen-days/voice-test/standin-{1,2}.{zei,deluin,bai}.wav`, against their sources `standin-{1,2}.source.wav`.

## Model cards against the scenes plan (read 2026-10-14)

All ten test models' pinned card revisions are still current, and every licence is as the plan and allowlist say (Apache-2.0 or MIT; no non-commercial, territory or revenue terms). Differences:

1. **LongCat-Video-Avatar price is wrong in the allowlist**: fal lists $0.30 a second at 720p and $0.15 at 480p, and its own schema suggests 720p may cost 4 units a second ($0.60). The allowlist says "$0.15 per unit (unit not stated)".
2. **Kandinsky 5 I2V Pro**: the allowlist's "$0.2 per video (5 s)" is the 512P price; 1024P is $0.60 a clip. Clips are fixed at 5 s.
3. **Maya1 "rated above Qwen3"** compares against a closed, API-only Qwen TTS, not the open VoiceDesign model, so it says nothing about our pick.
4. **LongCat multi-avatar on fal** is deprecated but still listed, not retired.
5. **Chatterbox Turbo tags**: `[sigh]` and `[gasp]` are only in fal's schema; the card names `[cough]`, `[laugh]`, `[chuckle]`.
6. **Wan 2.2's card links a LICENSE.txt that isn't in the Hugging Face repo**; the GitHub copy is plain Apache-2.0.
7. **LongCat-Video and LongCat-Video-Avatar** grant no Meituan trademark or patent rights (a line beyond MIT).
8. **The Perth watermark** is applied in the local code for Chatterbox and Turbo, but can't be verified: Perth's detector scores clean audio as watermarked (a sine 0.98, the owner's raw take 0.67, which rounds to 1; test of 2026-10-14). No fal page says whether hosted outputs carry it.
9. Wan on fal has its safety checkers off by default; most other endpoints have them on.
10. Every fal endpoint is listed as commercial-use; fal's own terms of service were not read.

The allowlist was not changed; items 1 and 2 need a reviewed correction.

## In progress

- 2026-10-15 13:31: **Style test round two started** (round two started) with the coding agent's picks, because the owner hadn't named three by 1:30pm (owner's instruction): **techno-vistas** (the most consistent faces and the brightest future city, big skies, readable at phone size), **fork-night** (the same clean line in evening light, for the dusk and lobby beats), **new-screen-print** (flat and graphic, the clearest at phone size, and the most different of the three). Four frames each with the cast sheets as face references, the same frames without, and a motion test each. **Done, $0.16: comparison page (private) https://claude.ai/artifact/2EFFCk3onGHQSzLMXDNE7C.** Faces and costumes hold across frames; the face-locked frames pull the three styles closer together; the menu frame shows Deluin twice.
- 2026-10-15: **The takes.** All six beats recorded. The automatic slate reader failed (Whisper hears "line twenty-two" as "9/22"), so the coding agent matched takes to lines from the full ordered transcript (`scripts/cut-takes.py`, `~/snowmoon-takes/full/takes/assign.json`). All 41 voiced lines and four laughs are converted; listen in `~/snowmoon-takes/full/listen/` (flagged first). The robot isn't converted (no voice sheet).
- 2026-10-15: **Script as performed.** The owner approved the 25 wording changes; 24 applied (tagged `by FID 6786 on 2026-10-15`; book lines b111 and b113 reworded become the owner's, "after"). Pending: "Hope to see you there! Bai." (line 12), "Ooh, hmm" or "Whoa" (line 21), and the four unclear words.
- 2026-10-15: **Dreadnaught**: four 12-second versions on ACE-Step v1 (fal, $0.04; the owner's fallback, because the Mac fetched ACE-Step 1.5's weights at about 75 KB/s). **Sound effects**: `sound-effects.md`, 33 effects, 66 CC0 Freesound candidates, `scripts/add-sound.py` records each sound's source URL, licence and author. Stability not used (owner).
- 2026-10-15: **Shot list drafted** (`shots.json`, labelled): 41 shots, 37 to draw, 4 book inserts; motion candidates s01, s13, s25, s32. `scripts/make-shots.py <style>` draws them the moment a style is picked (about 7 minutes a frame locally, so roughly 4 hours for all 37).
- Overnight 14 to 15 October (owner away; the Mac kept awake with caffeinate until about 10:20 on the 15th):
  - Recording from the phone: the recording sheet is copied to iCloud Drive/snowmoon-takes/. `scripts/watch-takes.py` watches iCloud Drive/snowmoon-takes/full/. Each beat-<n> file that has finished syncing is copied to ~/snowmoon-takes/full/. Once nothing new has arrived for 30 minutes, the files are split and converted. Each iCloud copy is deleted after a run that finished. A re-recorded beat replaces the older file, which is kept in full/replaced/. Log: ~/snowmoon-takes/full/takes/watch.log.
  - Style test round two: the style page is checked for stars at :07 and :37 past each hour. When there are one to three favourites, `scripts/style-round-two.py` runs:
    - four new frames per style (corridor, robot menu, Bai's headphones, gate at dusk) on FLUX.2 klein, locally, with the cast v2 character sheets as face references, about 7 minutes a frame;
    - the same frames on Z-Image without references, for comparison;
    - a 5-second LongCat 480p motion test per style;
    - a phone page, published private;
    - a $1 cap. A test of one frame, one Z frame and one clip in techno-vistas cost $0.03.
    The frame subjects and the motion prompt are model-drafted test prompts, labelled.
- Voice test on the owner's takes (2026-10-14): converted locally to WAV in ~/snowmoon-takes (outside the repo), then into the matching voices with Chatterbox on CPU. Each 48-second take takes about 8 minutes per voice. Cross-voice conversions (Bai's take as Deluin and so on) were dropped after the first one, to save time.

## Waiting for the owner

1. Round two of the style test: the owner's top three styles, named in chat (2026-10-15: polling the page stopped at the owner's word; round two runs as soon as they're named).
2. Fifteen Days: the questions still open are in brief.md section 4 (the hurt, the title, length about 4 minutes, where Dreadnaught is set up, Bai's interrogation, the robot's voice and who performs Zei and the robot, Deluin's solo chant).
3. The end-card wording, with the script.
4. The wallet privacy draft reread, then 0012, then the site-launch-caps merge when the owner says.
5. Merge status for site-styles-per-day and site-chat-owner-cap.
6. Question: round two's motion tests use the cheapest model on the allowlist, LongCat distilled at 480p ($0.025 a clip). In the test clip, Deluin bends down and drops his device instead of tapping it. Should the winning style also get a clip on Kandinsky 5 at 512P ($0.20 a clip) or Wan 2.2 ($0.40 for 5 s) for comparison? Not started.
7. Question: klein, with the face references, still draws lettering-like marks on shop signs despite "no text" in the prompt. Should signs be left blank by a clean-up pass (the letter-images step), or should the prompt name blank signs? Not started.
8. Question: when you've picked the style, will you write its description in your words, or should I draft one from the prompt for your edit? Published style text is yours.
9. Question (sound, 2026-10-15): for the Dreadnaught clip, ACE-Step 1.5 (MIT, trained on licensed music, runs locally through MLX; about 5 GB of weights)? For the sound effects, Stable Audio 3 small-sfx: this one needs your signup, because its Community Licence asks commercial users to register with Stability AI and to credit "Powered by Stability AI". MusicGen, MMAudio, TangoFlux, AudioLDM2 and AudioX are out (their weights are non-commercial). Not started.
