# Sprint to Friday 16 October

The running list for the bounty sprint (poidh bounty closes Sunday 18 October, 11:59pm Pacific). Kept by the coding agent;
anyone can see where things are. Newest first within each section. Model-drafted working note.

## Rules in force (owner, 2026-10-14)

- While the owner is out: merge nothing to main, publish nothing, no spend over $5.
- Questions go in "Waiting for the owner" below; work carries on with the next task.
- Published words (narration, dialogue, voice descriptions, sound lines, styles) are the owner's. Per-shot and per-cue prompts may be model-drafted and are labelled.
- Open-weight models only for published assets. Fifteen Days carries spoilers through chapter 15.

## Done

- 2026-10-14: `scenes-sound` checked (no audio, no keys, no env values; `.env.example` holds names only) and pushed to GitHub as a backup, with preview deploys off for it and `dog-dawn-comic`. `dog-dawn-comic` was already merged into it on 13 October.
- 2026-10-14: FID 6786's per-person caps raised (branch `site-styles-per-day`, not merged): 10,000 Generates, 1,000 image publishes, 1,000 styles or sheets a day. Local checks pass. The site-wide daily spend caps ($2 free images, $2 assistant) still apply, so they are the real limit.
- 2026-10-14: the Assistant's 1,000 a day for FID 6786 is on its own branch, `site-chat-owner-cap`; it waits on the owner's reread of the notice (words unchanged).

## In progress

- check:ui crash: is it the environment or the caps change? (30 minutes at most)
- Timeline, mixer and video render, end to end on the dog-dawn panels with placeholder audio.
- Voice conversion test (Chatterbox, local).
- Model cards for the test allowlist, against the scenes plan.
- Fifteen Days as a seed with a model-drafted brief.

## Waiting for the owner

1. The style for the piece: the message said "[style]", unfilled.
2. The two test lines for voice conversion: the message said "[path]", unfilled, and no recent recording is in Downloads or on the Desktop.
3. The Assistant notice reread (words unchanged), so `site-chat-owner-cap` can record it.
4. P1c fails on production: two published element versions have no recipe (227626d9-…, 6cbf8e03-…), new since 10 October. Reading them needs the owner's OK for a production database read.
