# Reporting and hiding published storyboards: one Privacy line (DRAFT, for Nate's reread)

Branch `voice-moderation`, 2026-11-23. Drafted by the coding agent (Claude, a closed model by Anthropic); DRAFT until
Nate's reread. It is in `src/lib/legal.ts` on this branch, and ships in the same release as the feature (legal texts
describe today). The Privacy reread key is not set: P6k stays red until Nate says "reread".

## Privacy §7, the ntfy item

**Before:**

> ntfy delivers a short alert to us when an image is reported. It carries no content and nothing about you.

**After:**

> ntfy delivers a short alert to us when an image or a storyboard is reported. It carries no content and nothing about
> you.

**Its source:** `src/lib/images/alert.ts`: `reportsWaiting` now adds the published storyboards' reports
(`storyboardReportsWaiting`, `src/lib/voice/moderation.ts`); the push still says only "Snowmoon: N reports waiting".

## Already covered, no change

- Privacy §4: "the reports you make" (the daily counts item) covers a storyboard report; the log keeps it as an image
  report is kept (`studio.voice_publication_log`, as `studio.removal_log`).
- Privacy §9: "Work you have published can be hidden on request" covers a moderator's hide.
- Terms §7: moderators may hide content that breaks the Terms. No change.
