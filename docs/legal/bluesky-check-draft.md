# The Bluesky check: Privacy and Terms wording (DRAFT, for the owner's reread)

Branch `bluesky-check` (built on `signin-lens-bluesky` at 1aca85e, with `origin/main` merged in), 2026-11-04. Drafted
by the coding agent (Anthropic's Claude, a closed model). **Not reread.** The lines below are in `src/lib/legal.ts` on
this branch; `LEGAL.ownerReread` still records the earlier words, so `/terms` and `/privacy` carry their Draft line and
check:principles P6k and P6l fail until the owner says "reread".

What they describe (owner, 2026-11-04): a Bluesky account that isn't linked to a Farcaster account gets the free daily
images and frames, and can remix and enter the remix challenge, only if it passes the Bluesky check, Bluesky's
counterpart of Neynar's score:

1. the account was made before 6 November 2026 (00:00 Pacific), and
2. it posted at least 5 times (its own posts and replies, not reposts) in the last 30 days.

Asked of Bluesky's public AppView (`public.api.bsky.app`, `app.bsky.actor.getProfile` and
`app.bsky.feed.getAuthorFeed`), with the account's DID only and no key. Decided at Generate and at publish, the same
way as Neynar's score today. Only the decision ('passed', 'new', 'idle') and its time are kept, in
`studio.bluesky_checks`, for a day; the remix challenge keeps its per-version decision as it does for Neynar
(`studio.challenge_eligibility`, now with `account` = 'bluesky'). Code: `src/lib/social/bluesky-check.ts`,
`src/lib/social/free.ts`, `src/lib/challenge/record.ts`; migration `NEXT_social_bluesky_check.sql`. The check is off
(`SOCIAL_SIGN_IN.bluesky.check.on = false`), and it only matters once Bluesky sign-in is on.

**When it ships.** Bluesky sign-in and its lines (`docs/legal/signin-lens-bluesky-draft.md`) and these lines ship in the
same release: on Friday 6 November only if the owner's reread of signin-lens-bluesky lands by Wednesday; otherwise both
on 12 November (owner, 2026-11-04).

## 1. Privacy §7 (Outside services and what they receive): a new item, after the Neynar item

**Proposed (new):**
> If you sign in with Bluesky and your Bluesky account isn't linked to a Farcaster account: when you first make an image or a frame on a given day, and when you publish a remix during the remix challenge, our server sends your Bluesky account's identifier (its DID, not your handle) to Bluesky's public AppView (public.api.bsky.app), to read when your account was made and its latest posts. This check decides whether you can make images and frames for free and whether a remix can count as an entry. We keep only its outcome (passed, made too recently, or too few recent posts) and when it was decided, for a day; never the dates or posts we read. Bluesky is never asked about you when someone views a page.

What it describes: `blueskyFacts` sends `GET /xrpc/app.bsky.actor.getProfile?actor=<DID>` and
`GET /xrpc/app.bsky.feed.getAuthorFeed?actor=<DID>&limit=50&filter=posts_with_replies`, from our server only (never the
browser), and nothing else about the person. "A day": `SOCIAL_SIGN_IN.bluesky.check.cacheHours` (24), as Neynar's.

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

## 4. Terms §4 (Who can use it): a change to the sign-in draft, not yet in legal.ts

Terms §4 today names only Farcaster and wallets; its Lens and Bluesky version is in
`docs/legal/signin-lens-bluesky-draft.md` §5 and goes into `legal.ts` with sign-in. That draft's sentence "Free daily
images and frames come with a Farcaster account; a Lens or Bluesky account gets them only while it is linked to one."
would no longer be true. **Proposed replacement (variant A, Lens threshold still null):**
> Free daily images and frames come with a Farcaster account, and with a Bluesky account that passes the site's Bluesky check (made before 6 November 2026, and at least 5 posts of its own in the last 30 days); a Lens account gets them only while it is linked to a Farcaster account.

**Variant B (once the owner sets a Lens score threshold, planned 12 November):**
> Free daily images and frames come with a Farcaster account, with a Bluesky account that passes the site's Bluesky check (made before 6 November 2026, and at least 5 posts of its own in the last 30 days), and with a Lens account whose Lens score is at least the one the Service shows.

The sign-in draft's §6e note ("a version made by a Lens or Bluesky account … is never a candidate") is no longer true
for Bluesky with the check on; for Lens it stays true until 12 November.

## 5. Words on the site that will need the same change (not legal text; owned by the challenge pages)

`src/lib/challenge/wording.ts` (`whoCanEnter`, the rules) and `src/lib/images/wording.ts` say "a Farcaster account that
passes the site's check". They stay as they are while Bluesky sign-in is off; they change in the release that turns it
on. The refusals a Bluesky account sees (`BLUESKY_CHECK_WORDING` in `src/lib/social/bluesky-check.ts`) are DRAFT too:
> Free images and frames are open to Bluesky accounts made before 6 November 2026, to keep out accounts made to use them. Link a Farcaster account, or sign in with a wallet to pay.

> Free images and frames are open to Bluesky accounts that posted at least 5 times in the last 30 days, to keep out unused accounts. Link a Farcaster account, or sign in with a wallet to pay.

> We can't check your Bluesky account right now (Bluesky can't be reached). Try again later.

## Lens (12 November)

Left for 12 November, with Lens sign-in. Planned: Lens's own check is its Lens score against `SOCIAL_SIGN_IN.lens.minScore`
(null today: no Lens account gets free generations, and the score is never looked up). The number is the owner's; the
sample in `docs/branch-reports/signin-lens-bluesky.md` suggests 1000. Its Privacy line is variant B of the sign-in
draft's §2a; to match this check, its "We keep the score in memory for up to an hour" may become "We keep only whether
it passed, for a day".
