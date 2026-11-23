# Reporting and hiding published storyboards (DRAFT proposal, not built)

2026-11-23. Drafted by the coding agent (Claude, a closed model by Anthropic) for Nate; DRAFT until he approves it.
Nothing here is built. It is needed before `VOICE.publish` is turned on (launch list, item 5): today a published
storyboard (/storyboard/spoken/<id>) can be taken down only by its maker, while Terms §7 says moderators may hide
content that breaks the Terms.

The proposal copies what images already do (`src/app/api/images/[id]/report/route.ts`, `studio.removal_log`,
`/api/admin/hide`, the admin review queue), so one rule set covers both and moderators learn nothing new.

## 1. "Report" on each published storyboard (signed-in people)

- A small "Report" link under the storyboard, beside its recipe. Signed out, it says "Sign in to report".
- It opens in the page (no window.confirm): the same reasons as images (a minor, sexual, a real person, violence,
  hateful, someone else's work, misrepresents the book, spam, other), and an optional private note of up to 280
  characters. "Send the report" and "Cancel".
- One report per person per storyboard; it counts toward the same daily report limit as images (`IMAGES.reportsPerDay`,
  20). Its maker can't report their own.
- After sending: "Thanks. A moderator will look at it." Who reported is in the private log only; moderators never see it.
- The same stated rules as images: one "a minor" report hides it at once; three different reporters hide it until a
  moderator looks. Otherwise it stays up and waits in the queue.
- The moderator's push stays as today: "Snowmoon: N reports waiting", nothing else (ntfy).

## 2. The admin queue

- A "Storyboards" section on the admin review page: each reported storyboard with its title, its maker's name, the
  reasons and how many people reported (never who), the notes, a link to the page, and when it was published.
- Buttons: "Hide" and "Dismiss" (the report was wrong: it leaves the queue, the storyboard stays up). Both asked in the
  page, "Hide it / Keep it", like Remove.
- A "Hidden storyboards" list with "Unhide" for each, and who hid it (a moderator, or a stated rule).

## 3. A reversible "Hide", with its record

- **Hiding** sets the publication hidden (new columns `hidden_at`, `hidden_by`, `hidden_role`) and moves its files
  (pictures, audio, the saved video) from the public bucket back to private storage, as a hidden image's are.
- **The page** then answers "This storyboard was hidden by a moderator." to everyone, with no pictures or audio; its
  embed card stops showing it. Its maker sees the same, plus the reason and "Write to us if you think this is wrong."
- **Unhiding** clears the columns, moves the files back to the public bucket, and the page is as before.
- **The record**: a new append-only log, `studio.voice_publication_log` (publication, step: reported, hidden, unhidden,
  dismissed, moved_private, restored_public; by whom; role: reader, moderator, maintainer, rule; reason; note; when),
  the same shape as `studio.removal_log`. Insert only for `studio_writer`; no update or delete.
- A hidden storyboard's maker is checked again at their next Generate or publish, as for images (`recheckMaker`).
- Taking down (the maker's own) stays as today and is final; a hidden storyboard can still be taken down by its maker.

## What it needs

- **A migration**, `NEXT_voice_moderation.sql`: the three columns on `studio.voice_publications`, the log table and its
  policies; dry run, migration, read-back with a realistic report, hide and unhide row inserted and deleted.
- **Routes**: `POST /api/voice/publications/[id]/report`; the admin hide route gains kind `"storyboard"` (hide, unhide,
  dismiss).
- **Legal (reread)**: Privacy §7's ntfy item says "when an image is reported"; it would say "when an image or a
  storyboard is reported". §4's reports and §9's hiding already cover it ("the reports you make"; "Work you have
  published can be hidden"). Terms: no change (§7 already says moderators may hide).
- **Tests**: `test:voice` (a report, the daily limit, the minor rule, three reporters, hide and unhide moving the files
  both ways, the log); a check:principles item that a hidden storyboard's files are not public, with a planted fault.

## For Nate to decide

1. The same rules as images (one "minor" report, or three reporters, hides at once)? Recommended: yes.
2. A hidden page: the notice (recommended) or "not found"?
3. Who moderates storyboards: the admins (6786, 193912), as for images? Recommended: yes.

---

## React #418 on /storyboard/spoken/<id>: not found yet

- The rehearsal saw a hydration error (#418) on the published storyboard's page, signed in. The production build's
  message is minified.
- 2026-11-23: the rehearsal re-run on a development server (`next dev`) didn't reach that page. Each route's first
  compile answered 500 and the steps timed out one after another, so no storyboard was published and no #418 appeared.
- The page's own code renders nothing client-only (its one date is fixed to UTC and en-US).
- Next, proposed (one lock slot, no model calls): on the production build, publish one stand-in storyboard and compare
  the page's server HTML with the hydrated page, signed out and signed in. The text that differs names the cause.
