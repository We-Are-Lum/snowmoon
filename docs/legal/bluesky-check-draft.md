# The Bluesky check: Privacy and Terms wording (DRAFT, for the owner's reread)

Branch `bluesky-check` (built on `signin-lens-bluesky` at 1aca85e, with `origin/main` merged in), 2026-11-04. Drafted
by the coding agent (Anthropic's Claude, a closed model). **Not reread.** The lines below are in `src/lib/legal.ts` on
this branch; `LEGAL.ownerReread` still records the earlier words, so `/terms` and `/privacy` carry their Draft line and
check:principles P6k and P6l fail until the owner says "reread".

What they describe (owner, 2026-11-04): a Bluesky account that isn't linked to a Farcaster account gets the free daily
images and frames, and can remix and enter the remix challenge, only if it passes the Bluesky check, Bluesky's
counterpart of Neynar's score:

1. the account is at least 30 days old when it is checked (a rolling rule; owner, 2026-11-04, replacing the fixed
   6 November 2026 cut-off, which would have shut out every newer account for good), and
2. it posted at least 5 times (its own posts and replies, not reposts) in the last 30 days.

Asked of Bluesky's public AppView (`public.api.bsky.app`, `app.bsky.actor.getProfile` and
`app.bsky.feed.getAuthorFeed`), with the account's DID only and no key. Decided at Generate and at publish, the same
way as Neynar's score today. Only whether the account passed, when, and the rule used are kept, in the shared decision
store `studio.check_decisions` (branch check-decisions; network 'bluesky', account = the DID, threshold
'age30d+5posts30d'; a pass for 90 days, a fail re-asked after 24 hours). Why a fail failed is not kept:
a stored fail is refused with a wording that names both rules. There is no `studio.bluesky_checks` (owner, 2026-11-04:
one shared store). The remix challenge keeps its per-version decision as it does for Neynar
(`studio.challenge_eligibility`, now with `account` = 'bluesky'). Code: `src/lib/social/bluesky-check.ts`,
`src/lib/social/free.ts`, `src/lib/challenge/record.ts`; migration `NEXT_social_bluesky_check.sql`. The check is off
(`SOCIAL_SIGN_IN.bluesky.check.on = false`), and it only matters once Bluesky sign-in is on.

**Owner's decisions (2026-11-04):** the check is approved as planned (made before 6 November 2026, and 5 posts in the
last 30 days); later the same day, "store the decision, not the numbers": a pass kept 90 days, a fail re-asked after 24 hours. The remix challenge is admin-only on Friday (another branch gates
it), so the check isn't needed then: it ships with Bluesky sign-in on 12 November, in the same release as these lines.

## The owner's answers after the restart (2026-11-04; reread pack items 4.1 to 4.7)

"Reviewed by the coordinator, approved by the owner." The sections below this one are the earlier drafts, kept for the
record; what is in `legal.ts` now is listed here.

- **The rule is rolling:** at least 30 days old and at least 5 posts in the last 30 days, judged when we check
  (`SOCIAL_SIGN_IN.bluesky.check.minAgeDays`, rule key `age30d+5posts30d`). The fixed 6 November cut-off is gone.
- **4.1, Privacy §7 (REDRAFTED; owner, 2026-11-04 14:15: "linked to a Farcaster or Lens account", matching the code).** The combined line, with the rolling rule and the early re-check.
  Before (pack's recommended combined line): "… We keep only whether your account passed (made before 6 November 2026,
  with at least 5 posts in the last 30 days) and when, for up to 90 days (a day if it didn't pass); never the dates or
  posts we read. Bluesky is never asked about you when someone views a page." After:

  > If you sign in with Bluesky and your Bluesky account isn't linked to a Farcaster or Lens account: when you make an image or a frame, or publish a remix during the remix challenge, and your account has no current check, our server sends your Bluesky account's identifier (its DID, not your handle) to Bluesky's public AppView (public.api.bsky.app), to read when your account was made and its latest posts. This check decides whether you can make images and frames for free and whether a remix can count as an entry. We keep only whether your account passed (at least 30 days old, with at least 5 posts in the last 30 days, when we check) and when, for up to 90 days (a day if it didn't pass); never the dates or posts we read. We check again sooner if your account is reported or one of your pictures is hidden by a moderator. Bluesky is never asked about you when someone views a page.

- **4.2, Privacy §4 (REDRAFTED, needs the owner's OK).** No numbers outside §7 (the owner's new rule), plus the
  Farcaster item's own early-removal sentence. Before (check-decisions' draft): "Whether your Bluesky account passed the
  check for making images (made before 6 November 2026, with at least 5 posts in the last 30 days), and when that was
  decided; never its age or its post count. A pass is kept for 90 days and a fail for a day." After:

  > Whether your Bluesky account passed the check for making images (section 7), and when that was decided; never its age or its post count. A pass is kept for 90 days and a fail for a day. A pass is removed sooner if your account is reported or one of your pictures is hidden by a moderator.

- **4.3 to 4.5:** in `legal.ts` as drafted (sections 2 and 3 below). Terms is recorded as reread; Privacy is not, until
  the owner OKs 4.1 and 4.2.
- **4.6:** the check is on the shared store, and a report or a moderator's hide now withdraws a Bluesky pass early
  (`recheckMaker`, `src/lib/checks/decisions.ts`; test K6).
- **4.7:** `src/lib/challenge/wording.ts` ("whoCanEnter") and `src/lib/images/wording.ts` change only in the release
  that turns Bluesky on. Not changed here.
- **Free remixes (remix-submit's `studio.sheet_remix_asks`):** not used by this branch's code. On remix-submit,
  `countsRemixes` needs `fid > 0`, and `reserve` sends every negative number to the prepaid path. At the merge of the
  two branches, `countsRemixes` must also take a Bluesky person that passes (`isSocialPerson`), and `reserve` must use
  `isWalletPerson` (as here) instead of `fid < 0`. Not built here: both are remix-submit's files.

## 1. Privacy §7 (Outside services and what they receive): a new item, after the Neynar item

**Proposed (new):**
> If you sign in with Bluesky and your Bluesky account isn't linked to a Farcaster or Lens account: when you first make an image or a frame on a given day, and when you publish a remix during the remix challenge, our server sends your Bluesky account's identifier (its DID, not your handle) to Bluesky's public AppView (public.api.bsky.app), to read when your account was made and its latest posts. This check decides whether you can make images and frames for free and whether a remix can count as an entry. We keep only whether your account passed and when, for up to 90 days; never the dates or posts we read. Bluesky is never asked about you when someone views a page.

What it describes: `blueskyFacts` sends `GET /xrpc/app.bsky.actor.getProfile?actor=<DID>` and
`GET /xrpc/app.bsky.feed.getAuthorFeed?actor=<DID>&limit=50&filter=posts_with_replies`, from our server only (never the
browser), and nothing else about the person. "For up to 90 days" (owner, 2026-11-04: store the decision, not the
numbers; the words are check-decisions' draft): a pass is kept 90 days (`CHECKS.passDays`); a fail is kept with its
time and asked again no sooner than 24 hours later (`CHECKS.failHours`), or at once if the rule changes; the rule used
is kept with it (`thresholdKey`, never a number of the account's), in `studio.check_decisions`. Re-asking early when a
Bluesky account is reported or one of its pictures is hidden is not wired yet (`recheckMaker` withdraws Farcaster
passes only), so the line does not claim it.

**For the owner's reread (agent's note, 2026-11-04):** with a pass kept 90 days, "when you first make an image or a
frame on a given day" overstates how often Bluesky is asked: it is asked when you make an image or a frame (or publish
a challenge remix) and your account has no current check. Check-decisions' Neynar line already says it that way ("and
your account has no current check"); this line may want the same words. Not changed here: the words are yours.

## 2. Privacy §4 (Kept by us when you sign in): the remix challenge's items, two phrases

### 2a. Why a version can count

**Today (the phrase):**
> …whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check), decided once, when you publish it…

**Proposed:**
> …whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check: Neynar's score for a Farcaster account, the Bluesky check for a Bluesky account), decided once, when you publish it…

### 2b. The record published when entries close

**Today (the phrase):**
> …a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID, when it was published and what it was built on. Hiding a version later removes it from this site…

**Proposed:**
> …a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID (or, for a Bluesky account, its DID), when it was published and what it was built on. Hiding a version later removes it from this site…

Note: the record itself isn't built yet; whoever builds it must write a Bluesky maker's DID there (not a person number).

## 3. Terms §6e (The remix challenge): two phrases

**Today (the phrase):**
> During the challenge, anyone signed in with a Farcaster account that passes the site's check may remix its characters' sheets;

**Proposed:**
> During the challenge, anyone signed in with a Farcaster account or a Bluesky account that passes the site's check for it may remix its characters' sheets;

**Today (the phrase):**
> …its maker's Farcaster ID, when it was published and what it was built on; hiding a version later…

**Proposed:**
> …its maker's Farcaster ID (or, for a Bluesky account, its DID), when it was published and what it was built on; hiding a version later…

## 4. Terms §4 (Who can use it): on signin-lens-bluesky, not here

Terms §4's Lens and Bluesky wording belongs to the sign-in branch: the owner's reread answers there (2026-11-04) reword
it so that a Bluesky account that passes the site's check gets free images and frames. This branch changes only the
Bluesky check's own lines (sections 1 to 3 above) and takes §4 from signin-lens-bluesky when it is merged in.

## 5. Words on the site that will need the same change (not legal text; owned by the challenge pages)

`src/lib/challenge/wording.ts` (`whoCanEnter`, the rules) and `src/lib/images/wording.ts` say "a Farcaster account that
passes the site's check". They stay as they are while Bluesky sign-in is off; they change in the release that turns it
on. The refusals a Bluesky account sees (`BLUESKY_CHECK_WORDING` in `src/lib/social/bluesky-check.ts`) are DRAFT too:
> Free images and frames are open to Bluesky accounts at least 30 days old, to keep out accounts made to use them. Link a Farcaster account, or sign in with a wallet to pay.

> Free images and frames are open to Bluesky accounts that posted at least 5 times in the last 30 days, to keep out unused accounts. Link a Farcaster account, or sign in with a wallet to pay.

> We can't check your Bluesky account right now (Bluesky can't be reached). Try again later.

## Lens (12 November)

Left for 12 November, with Lens sign-in. Planned (owner, 2026-11-04, applied on signin-lens-bluesky): Lens's check is
its Lens score, looked up at Generate, against a threshold of 1,000 (`SOCIAL_SIGN_IN.lens.minScore`). Its Privacy line
is the sign-in draft's §2a variant B.
