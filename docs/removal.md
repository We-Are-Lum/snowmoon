# Removal: hiding at once, erasure by procedure

> **Policy, approved by the owner on Oct 5, 2026. Not built yet.** "Hide
> this" is built together with the first form that stores a person's own
> words. Until then the consent wording does not promise immediate hiding; it
> says the maintainer can be asked to hide. When "Hide this" ships, a new
> wording version (`own-words-v2` in `config/consent.json`) promises it, and
> everyone is asked again.
>
> **Built for readers' images (slice 1, branch site-images, 2026-10-08):** "Hide this" on one's
> own image, reports, stated auto-hide rules and a moderator queue (hide or dismiss only),
> `studio.removal_log` (migration 0008), and `own-words-v2`. One change to step 1, approved as
> decision 21 of the add-an-image proposal: when an image is hidden, its public file is copied to
> a private bucket and deleted from the public one, so its link stops working; public copies are
> cached for five minutes only, so it also leaves the cache. The record and the bytes are kept,
> as below. Unhiding is for the author's own hides; a hide by a moderator or a stated rule is
> undone only by the maintainer (decision 22).

People are told before their first contribution that their words are public,
permanent, GPL-3.0 and shown with their Farcaster name (`config/consent.json`).
"Permanent" means the project keeps the record. It does not mean a person
cannot get their work out of view. This document says how they can, in two
steps: hiding, which is immediate, and erasure, which is rare and logged.

## 1. Hide on request, at once

**Who can ask.** The person who made it (signed in with the same FID), or
anyone pointing to a legal or safety reason, which a moderator decides.

**How.** A "Hide this" action on the person's own elements, takes and
narrations; for anyone else, a request form that reaches the moderators
(`MODERATOR_FIDS`). A person's own request needs no approval.

**What happens, immediately and in one transaction:**
- `studio.elements.status` becomes `hidden` (or `studio.narrations.hidden`
  becomes true; `studio.takes.status` becomes `hidden`).
- From then on, the public read policies stop returning it: the element, its
  versions, anchors, links, likes and rating totals, and (after 0005) its
  recipe, so the prompt is no longer public either.
- Cached pages are revalidated, and the asset's public URL is removed from
  every published index.
- A row is written to a `studio.removal_log` (to be added): who asked, which
  rows, when, which step (`hidden`), and the reason if given. The log is
  private; the public sees only that something was hidden, not what.

**What does not happen.** Nothing is deleted. The rows, the recipe and the
media object stay, so the work can be shown again if the person asks
("unhide"), and so the record of what was published stays intact.

**Limits to say plainly.** Hiding cannot recall copies others have made
(casts, downloads, forks of the public repository). Text or prompts that were
committed to the public git repository (the project's own pipeline) remain in
its history; hiding them there needs step 2.

**The house narration** cannot be hidden directly (0002 enforces this); a
different narration must become the house narration first.

## 2. True erasure: a logged maintainer procedure

For cases where hiding is not enough: a legal requirement, personal data, or a
safety risk. Rare by design, because the tables are append-only.

**Who decides.** The maintainer (FID 6786), after the content is already
hidden. The decision and its reason are written in the removal log before
anything is erased.

**Procedure (run by the maintainer, as `postgres`, never from the app):**
1. Confirm the content is hidden and record the request in
   `studio.removal_log` with step `erasure_approved`, the reason, and the rows
   and objects affected.
2. In one transaction in the Supabase SQL Editor: temporarily disable the
   append-only trigger on the affected tables, overwrite the personal content
   (prompt, body text, lines) with a fixed tombstone such as
   `[erased on <date>, removal log <id>]`, keep ids, hashes and foreign keys so
   nothing else breaks, re-enable the trigger, and write step `erased` to the
   log. A dry run with `rollback;` first, as with every migration.
3. Delete the media objects from R2 (`snowmoon-media`) by key, and record each
   key and its sha256 in the log.
4. If the content is in the public git repository: replace it in a new commit
   with the same tombstone. Rewriting history (and asking forks to do the same)
   is a separate decision, recorded in the log, because it affects everyone
   who has cloned the repository.
5. Note in the public changelog that an erasure happened, with the date and
   the log id, and nothing about the content.

**What is kept.** The log entry (private), the tombstone, ids and hashes. A
hash of erased text proves nothing about its content to anyone without it.

## Report alerts (owner, 2026-10-09)

When an image is reported (`/api/images/[id]/report`, including the stated rules that hide it at
once) or its author hides it (`/api/images/[id]/hide`), the server sends a push to the moderator
through ntfy, at `SNOWMOON_ALERT_URL` (`src/lib/images/alert.ts`). It runs after the answer
(Next's `after()`), so it can never slow, fail or change a report or a hide.

- **What it says:** exactly `Snowmoon: N reports waiting`, as a plain-text body. No title, tags or
  click link; no image, prompt, FID, name, URL or reason. The only header set is
  `Content-Type: text/plain`.
- **What "waiting" means:** the moderator queue (`reportQueue`, `/moderate`): images whose latest
  step among reported / hidden / dismissed is a report, or a hide by a stated rule (it stays until
  a moderator looks). N counts the reports on those images made since each one's last dismissal.
  A moderator's hide, a dismissal, or the author's own hide takes an image off the list. Nothing
  is sent when N is 0.
- **How often:** at most one an hour (`IMAGES.alertEveryMinutes`) across every server. The send
  time is kept in `studio.alert_state` (migration 0010; no FID, no count) and claimed in one
  statement (`insert … on conflict do update … where sent_at < now() - 60 minutes returning`), so
  two servers can't both send. If the push fails, the hour is given back, so the next report
  tries again.
- **Unset:** with no `SNOWMOON_ALERT_URL`, nothing is sent (the log says the variable's name
  only). Image making stays closed to everyone outside the invited list until it is set
  (`src/lib/images/gate.ts`).
- **Checked by** `npm run test:images-gate`, with a planted report and a local stand-in for ntfy.

## What would need building

- `studio.removal_log` (private, append-only) and the "Hide this" route, in a
  migration run as postgres.
- The request form for moderators.
- A maintainer script that prepares step 2 as SQL for review, never runs it.
- A check that every hidden element is absent from every published index and
  public read.
