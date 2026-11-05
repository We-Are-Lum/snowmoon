# Check decisions, not scores: Privacy draft (DRAFT)

Branch `check-decisions`. Drafted by a coding agent (Claude, a closed model made by Anthropic) on 2026-11-03, for the
owner's rule of 2026-11-04: "look each account up as rarely as possible". **DRAFT until the owner says "reread".**
These words are in `src/lib/legal.ts` on this branch only; `check:principles` P6k stays red until the owner rereads them
(then set `LEGAL.ownerReread.privacy.words` to the value P6k prints).

What the site does with this branch: for the Neynar check, it keeps only whether the account passed, when, and the
threshold it was decided under (`studio.check_decisions`). A pass is used for 90 days and a fail for 24 hours without
asking Neynar again. A pass is withdrawn early when the account is reported or one of its pictures is hidden by a
moderator, an admin or the reporting rules (three reporters, or one "minor" report); a changed threshold is asked again.
The migration deletes every kept score. A maker hiding their own picture does **not** withdraw their pass
(`CHECKS.recheckOnOwnHide = false`); see "Decisions owed".

## 1. Privacy §7, the Neynar item (this branch)

Only the first three sentences change; the rest of the item (posts, wallets, the Minpentai hub) is unchanged.

**Before (main, word for word):**

> Neynar receives your Farcaster ID when you first make an image on a given day, to look up its account score, which
> decides whether you can make images. We keep the score for a day. During the remix challenge, that check also
> decides, once, when you publish a remix of a challenge character, whether it can count as an entry.

**After (this branch, word for word):**

> Neynar receives your Farcaster ID when you make or publish an image or a character sheet and your account has no
> current check, to look up its account score, which decides whether you can make images. We don't keep the score: we
> keep only whether your account passed and when, for up to 90 days (a day if it didn't pass), and we check again sooner
> if your account is reported, one of your pictures is hidden by a moderator, or the score needed changes. During the
> remix challenge, that check also decides, once, when you publish a remix of a challenge character, whether it can
> count as an entry.

Why "make or publish an image or a character sheet": the gate runs at Generate, at a sheet's samples and views, and when
a design is published; main's "when you first make an image on a given day" was already narrower than the code.

## 2. Privacy §4, a new item (this branch)

§4 ("Kept by us when you sign in") had no item for the check; main kept the score under §7 only. Inserted after "How
many images and Remix frames you make each day, to count the daily limits, and the reports you make."

**Before (main):** no such item.

**After (this branch, word for word):**

> Whether your Farcaster account passed the check for making images (its Neynar score against the score needed), when
> that was decided, and the score needed then; never the score itself. A pass is kept for 90 days and a fail for a day.
> A pass is removed sooner if your account is reported or one of your pictures is hidden by a moderator.

The remix challenge's §4 item ("whether it can count as an entry and why … whether your account passed the site's
check, decided once, when you publish it") is unchanged and still true.

## 3. About (not a legal page; same reread)

**Before (main):**

> Neynar receives your Farcaster ID when you make an image, to look up its account score, which decides whether you can
> make images. The score is kept for a day.

**After (this branch):**

> Neynar receives your Farcaster ID when you make an image and your account has no current check, to look up its
> account score, which decides whether you can make images. The score isn't kept: only whether your account passed and
> when, for up to 90 days (a day if it didn't pass).

The image consent screen (`config/consent.json`: "your Farcaster ID to Neynar to check your account's score") stays
true and is not changed.

## 4. Lines for the other branches to adopt (not in this branch's legal.ts)

Each ships only in its own branch's release (legal texts describe today). Each uses this branch's store; the wording
mirrors the Neynar item. The service names and what they receive are drafts for those branches to confirm against
their code.

**Lens, branch `signin-lens-bluesky` (§7, a new item, or added to its Lens sign-in item):**

> Lens receives your Lens account's address when you press Generate and your account has no current check, to look up
> its Lens score, which decides whether you can make images. We don't keep the score: we keep only whether your account
> passed and when, for up to 90 days (a day if it didn't pass), and we check again sooner if your account is reported,
> one of your pictures is hidden by a moderator, or the score needed changes.

And in §4, after the Neynar check's item:

> Whether your Lens account passed the check for making images (its Lens score against the score needed), when that was
> decided, and the score needed then; never the score itself. A pass is kept for 90 days and a fail for a day.

**Bluesky, branch `bluesky-check` (§7, added to the Bluesky item):**

> When you sign in with Bluesky and your account has no current check, Bluesky's public API receives your account's id
> (its DID), so we can read when the account was made and how many posts it made in the last 30 days, which decide
> whether you can make images. We don't keep those: we keep only whether your account passed (made before 6 November
> 2026, with at least 5 posts in the last 30 days) and when, for up to 90 days (a day if it didn't pass), and we check
> again sooner if your account is reported or one of your pictures is hidden by a moderator.

And in §4:

> Whether your Bluesky account passed the check for making images (made before 6 November 2026, with at least 5 posts
> in the last 30 days), and when that was decided; never its age or its post count. A pass is kept for 90 days and a
> fail for a day.

## The owner's answers (2026-11-04, reread pack items 2.1 and 2.2)

- **2.1 no:** a maker hiding their own picture doesn't withdraw their pass. The code matches: `CHECKS.recheckOnOwnHide`
  is false, and only the report, moderator, admin and rule hides call `recheckMaker`.
- **2.2 delete:** the migration deletes every kept score (`delete from studio.image_scores`) and revokes insert and
  update on it. The code matches.
- After main's merge (wallet-fid-link, Privacy 1wgu7z), §7's Neynar item is this branch's first two sentences, then
  main's words from "Neynar is never asked" on (reread pack, Overlap B). Main's wallet sentences win.

- **Reread:** item 2 approved as drafted ("reviewed by the coordinator, approved by the owner", 2026-11-04). Recorded
  as Privacy `1rsayc0`. The About line is part of the same approval. Merging still needs the migration applied.

## Decisions owed

1. Reread the §7 and §4 lines above ("reread"), or change them.
2. A maker hiding their own picture: withdraw their pass too (`CHECKS.recheckOnOwnHide = true`), or not (today's draft:
   not; a self-hide is not a signal and costs a lookup). If yes, §7's "hidden by a moderator" becomes "hidden".
3. Old score rows: this branch deletes them in the migration (recommended) rather than letting them expire, so the new
   Privacy words are true the day they go live. A follow-up migration drops the empty `studio.image_scores` once this
   branch is live.
