# Sign-in final words: three changed lines (DRAFT)

For the owner, 2026-11-04. Drafted by the coding agent (Anthropic's Claude, a closed model). Branch
`signin-lens-bluesky`. Source: your answers to `docs/legal/signin-reread-list.md` (branch `signin-reread-list`).

Everything else you approved word for word is in `src/lib/legal.ts` on this branch as drafted (items 5, 6, 7, 8, the
first part of 9, 10 and 11). These three lines are new words, so they need your final OK. **Until you OK them, the
reread record stays at the old words**, the pages show their "Draft wording" line on a preview, and
check:principles P6k and P6l fail on this branch, as they should.

Say "OK" (or give changes) for each of 1–3. With all three OK as written, and check-decisions' own Privacy lines
(`docs/legal/check-decisions-draft.md`, merged into this branch, also pending your reread), the record becomes
privacy `qdj3pt`, terms `f2hfa7`, dated the day you say so, and `LEGAL.effective` becomes the merge day.

## 1. Privacy §7, the Lens item (item 9, its second part)

Why it changed: variant B now looks the score up at Generate (as Neynar's), not when the image or frame maker opens;
and your rule of 2026-11-04, "store the decision, not the score". The wording of the kept part is check-decisions'
own, word for word from its Neynar line ("We don't keep the score: we keep only whether your account passed and
when, for up to 90 days (a day if it didn't pass), and we check again sooner if …").

**Before** (as drafted in the reread list, with variant B):
> When you open the image or frame maker, or make an image or a frame, without a linked Farcaster account, Lens's API also receives your Lens account's address, to look up its Lens score, which decides whether you get free images and frames. We keep the score in memory for up to an hour.

**After:**
> When you make an image or a frame without a linked Farcaster account, and we have no current decision for your Lens account, Lens's API also receives your Lens account's address, to look up its Lens score, which decides whether you get free images and frames. We don't keep the score: we keep only whether your account passed and when, for up to 90 days (a day if it didn't pass), and we check again sooner if your account is reported, one of your pictures is hidden by a moderator, or the score needed changes. Lens is never asked about you when someone views a page or when you open the image or frame maker.

What the code does (`src/lib/social/lens-check.ts`): a pass is reused for 90 days and a fail for 24 hours with no
call to Lens; a report, a hidden picture or a new threshold makes the next Generate ask again. The stored row is the
network ('lens'), the Lens address, the rule ('lens-score>=1000'), passed or not, and when
(`studio.check_decisions`, from `check-decisions`).

**A related suggestion, not in `legal.ts`:** check-decisions adds a Privacy §4 item that names only the Farcaster
check ("Whether your Farcaster account passed the check for making images (its Neynar score against the score
needed), when that was decided, and the score needed then; never the score itself. …"). The same row is kept for a
Lens account. If you agree, that item could read "Whether your Farcaster account, or your Lens account, passed the
check for making images (its Neynar score, or its Lens score, against the score needed), …". It is check-decisions'
line, so it's your call there; until then §7's Lens item says what is kept.

## 2. Privacy §4, the link item (item 7): the 30-day sentence added

Your words (answer 3a). It's in code too: `src/lib/social/accounts.ts` refuses a link to a different account
within 30 days of an unlink; relinking to the same account is allowed at any time.

**Before** (item 7 as drafted):
> If your Lens or Bluesky account is linked to your Farcaster account, or your Bluesky account to your Lens account (you linked them while signed in with both): which is linked to which, and when it was linked or unlinked. While linked, signing in with it is signing in as that account. You can unlink it on your You page.

**After:**
> If your Lens or Bluesky account is linked to your Farcaster account, or your Bluesky account to your Lens account (you linked them while signed in with both): which is linked to which, and when it was linked or unlinked. While linked, signing in with it is signing in as that account. You can unlink it on your You page. An account you unlink can be linked to a different account only after 30 days.

## 3. Terms §4 (Who can use it)

Why it changed: your answer 5. A Bluesky account that passes the site's check gets free images and frames too, not
only a linked one (the check on `bluesky-check`: made before 6 November 2026, and 5 posts in the last 30 days).

**Before** (item 12 as drafted, variant B):
> Anyone can read and listen without an account. To sign in you must be at least 18 years old. Your account here is a Farcaster account, a wallet address, a Lens account or a Bluesky account. You can link a wallet, a Lens account or a Bluesky account to your Farcaster account, and a Bluesky account to your Lens account; while it is linked, signing in with it is signing in as that account. Free daily images and frames come with a Farcaster account, and with a Lens account whose Lens score is at least the one the Service shows; a Bluesky account gets them only while it is linked to a Farcaster or Lens account. To prepay for generations, sign in with a wallet (section 6a).

**After:**
> Anyone can read and listen without an account. To sign in you must be at least 18 years old. Your account here is a Farcaster account, a wallet address, a Lens account or a Bluesky account. You can link a wallet, a Lens account or a Bluesky account to your Farcaster account, and a Bluesky account to your Lens account; while it is linked, signing in with it is signing in as that account. Free daily images and frames come with a Farcaster account, with a Lens account whose Lens score is at least the one the Service shows, and with a Bluesky account that passes the site's check (made before 6 November 2026, with at least 5 posts in the last 30 days); a Bluesky account that doesn't pass gets them only while it is linked to a Farcaster or Lens account. To prepay for generations, sign in with a wallet (section 6a).

Note: this sentence describes the Bluesky check, which lives on `bluesky-check`. It is true only once that branch
is in the same release (it merges this branch in, and ships with Bluesky sign-in on 12 November). If Bluesky sign-in
shipped without the check, the "Before" wording would be the true one. The Bluesky check's own Privacy lines (its §7
item, retention for 24 hours) are `bluesky-check`'s, in `docs/legal/bluesky-check-draft.md`.

## The owner's answers (2026-11-04, reread pack items 3.1 to 3.5 and 6.1)

"Reviewed by the coordinator, approved by the owner." Recorded in `LEGAL.ownerReread` (Terms `15utl87`, Privacy
`iqpiw8`), since every changed line is approved as drafted or is the owner's own words:

- **3.1, 3.2:** as drafted.
- **3.3, Terms §4:** no numbers for the Bluesky rule. The owner's words: "a Bluesky account that passes the site's
  check (Privacy, section 7)". Privacy §7 keeps the details (branch `bluesky-check`).
- **3.4:** Privacy §4 gains check-decisions' Lens item, with the Farcaster item's own sentence: "A pass is removed
  sooner if your account is reported or one of your pictures is hidden by a moderator."
- **3.5 and 6.1:** one new consent version for everyone, `own-words-v5` (below). It needs the owner's reread.

## Consent own-words-v5 (DRAFT, written by the coding agent, Claude by Anthropic; not reread)

`config/consent.json` now has `own-words-v5` as current. Its line and title, and its first four paragraphs, are v4's.

**Paragraph 5. Before (v4):**

> It is shown with your name: your Farcaster name, or, for a wallet account, its address shortened.

**After:**

> It is shown with your name: your Farcaster name; for a wallet account, its address shortened; for a Lens account, its Lens username; for a Bluesky account, its handle.

**Paragraph 6. Before (v4):**

> To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to fal.ai to make it, and your Farcaster ID to Neynar to check your account's score. In Remix, every frame you make is saved and public at its link as soon as it is made, with your words. Elsewhere, drafts you don’t publish stay on your device.

**After** (owner, 2026-11-05: the sign-in release ships apart from model choice, so v5 has only the Lens and Bluesky
sentence, after the first; remix-model-choice's closed-model sentence, which an earlier draft carried here, moved to
remix-model-choice's own consent version, own-words-v6, in its own release; see
`docs/legal/signin-release-2026-11-05.md`):

> To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to fal.ai to make it, and your Farcaster ID to Neynar to check your account's score. With a Lens account, its address goes to Lens instead, to check its Lens score; with a Bluesky account, its identifier goes to Bluesky, to check its age and recent posts. In Remix, every frame you make is saved and public at its link as soon as it is made, with your words. Elsewhere, drafts you don’t publish stay on your device.

**When it can ship:** only in a release that has Lens and Bluesky sign-in and the Bluesky check (`bluesky-check`,
which carries this branch). Not in a release with this branch alone: "to check its age and recent posts" is the
Bluesky check's.
