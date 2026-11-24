# Storyboard pictures' own daily count: the Privacy line (DRAFT, for Nate's reread)

Branch `voice-picture-allowance`, 2026-11-23. Drafted by the coding agent (Claude, a closed model by Anthropic); DRAFT
until Nate's reread. In `src/lib/legal.ts` without its reread key (P6k is red until he says "reread"); it ships in the
same release as the allowance (legal texts describe today). Terms: no change.

## Why

Storyboard pictures get their own daily count (Nate, 2026-11-23: 20 a person a day, apart from the images' 10): one row
per picture in `studio.image_asks`, pool `storyboard` (the person number and the time, as every row), read to count the
day's limit. Privacy §4's daily-counts item lists what is counted each day; it doesn't name storyboard pictures.

## Privacy §4, the daily-counts item

**Before:**

> How many images, sheet remixes, Remix frames and voice conversions you make each day, to count the daily limits, and
> the reports you make. The count of voice conversions is deleted the next day.

**Proposed:**

> How many images, sheet remixes, Remix frames, storyboard pictures and voice conversions you make each day, to count
> the daily limits, and the reports you make. The count of voice conversions is deleted the next day.

**Its source:** `src/lib/images/limits.ts` (`reserve`, pool `storyboard`; `storyboardPicturesLeft`),
`NEXT_storyboard_pictures.sql`. The pool's money is kept only as daily totals in `studio.image_costs` (funded
`storyboard`), with no person, as every cost row: nothing new to say there.
