# Sprint to Friday 16 October

The running list for the bounty sprint (poidh bounty closes Sunday 18 October, 11:59pm Pacific). Kept by the coding agent;
anyone can see where things are. Newest first within each section. Model-drafted working note.

## Rules in force (owner, 2026-10-14)

- While the owner is out: merge nothing to main, publish nothing, no spend over $5.
- Questions go in "Waiting for the owner" below; work carries on with the next task.
- Published words (narration, dialogue, voice descriptions, sound lines, styles) are the owner's. Per-shot and per-cue prompts may be model-drafted and are labelled.
- Open-weight models only for published assets. Fifteen Days carries spoilers through chapter 15.

## Done

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
8. **The Perth watermark** is confirmed in the local code for Chatterbox and Turbo; no fal page says whether hosted outputs carry it.
9. Wan on fal has its safety checkers off by default; most other endpoints have them on.
10. Every fal endpoint is listed as commercial-use; fal's own terms of service were not read.

The allowlist was not changed; items 1 and 2 need a reviewed correction.

## In progress

- Nothing running.

## Waiting for the owner

1. The style for the piece: the message said "[style]", unfilled.
2. The two test lines for voice conversion: the message said "[path]", unfilled, and no recent recording is in Downloads or on the Desktop. When they're in a private folder, one command converts them: `.venv-voice/bin/python scripts/convert-voice.py fifteen-days --take <file> --voices zei deluin bai`.
3. The Assistant notice reread (words unchanged), so `site-chat-owner-cap` can record it.
4. P1c fails on production: two published element versions have no recipe (227626d9-…, 6cbf8e03-…), new since 10 October. Reading them needs the owner's OK for a production database read.
5. Fifteen Days brief questions (brief section 4): the old hurt, Bai at the tea, the ending, the smile, the title, the narrator's point of view.
6. The final video's AI declaration: an end card listing what was generated and with which models, or only the description and the page? Principle 2 asks for a label wherever generated media plays.
7. Correct the allowlist prices for LongCat-Video-Avatar and Kandinsky (model cards, items 1 and 2)?
