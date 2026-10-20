# "Make your own": drafted Privacy lines — DRAFT

**DRAFT, for the owner's reread, not live.** Drafted by the coding agent, 2026-10-19 (owner's long run 2, item 5).
`src/lib/legal.ts` is unchanged. These lines ship only on the day `MAKE_YOUR_OWN` (src/lib/make/flag.ts) is turned on,
together with migration 0017 (supabase/drafts/0017_adaptation_drafts.sql, not applied).

Updated 2026-10-19 after the owner's answers ("Story flow: end card stays on the repo until it's switched on; open to
wallet accounts; coach 50 a day; coach may suggest visual details as questions or options, never written description").

Updated again the same day after the owner's second answers ("1 yes (coach gets its own $1 a day; never-paid
wallets 10 coach messages a day), 2 yes, 3 ok for now, but once wallets use the coach and the You page, wallet
sign-in should always show, not only while prepaid is open. 4 maker + me, 5 go").

What the feature does (and so what the texts must say):
- Signed in with Farcaster **or a wallet** (getPerson; the wallet button shows only while wallet sign-in is open).
- The person's idea, beats and text storyboard are saved by us as a **private draft**: only they can open it. They can
  delete it; deleting removes it (no copy kept). At most 20 drafts.
- Each message to the coach, with the draft's text, goes to the assistant's models through the assistant's route (Groq,
  or Vercel AI Gateway to Groq when Groq is busy; both set to keep nothing). We keep no copy of the messages or the
  coach's replies; the conversation stays on the device.
- **Its own limits:** 50 coach messages a day for a Farcaster account or a wallet with at least one payment, **10 for
  a wallet that has never paid**, apart from the assistant's 30. To count them we record, per message, the account
  (Farcaster ID or wallet account) and the time, nothing else, and delete those records after two days. **A message
  whose reply is refused after the retry isn't counted** (owner, 2026-10-19): its record is deleted in the same
  request. Its model calls still count toward the $1 below, since they were paid for. Whether a wallet has paid is read from the payments we already keep. **Its own spending limit, $1 a day across everyone**,
  apart from the assistant's $2, with its own daily cost totals (no account, no time of day).
- The coach may suggest visual details only as questions or short options ("would a clenched jaw show it?"), never as
  written description; every reply is checked before it is shown.
- Nothing about a draft is public. Publishing a draft as an adaptation is a later step, with its own consent.
- /make stays the end card's link to the repository until the flow is switched on (owner); the flow is at
  /make-your-own.

**Note for later (owner, 2026-10-19):** wallet sign-in is tied to prepaid images for now (`prepaidOpen()`; "ok for
now"). Once wallets use the coach and the You page, wallet sign-in should always show, not only while prepaid is
open. That is a change to /api/wallet/sign-in and /api/wallet/nonce (both answer 503 while prepaid is closed) and to
this page's `walletSignIn` prop, and to the Privacy text that ties wallet accounts to prepaid images.

**Wallet sign-in message (DRAFT):** "Sign in to Snowmoon with your wallet. Paid features use a prepaid balance."
(was "Sign in to Snowmoon to make images with a prepaid balance."; src/app/api/wallet/nonce/route.ts). The note under
the wallet button (IMAGE_WORDING.prepaid.signInNote) still says "A wallet account pays for each image in advance"; it
is shown only next to images today, so it is unchanged.

## Privacy §3 (kept on your device only), added to the list

> … your questions to the assistant and its answers, **your conversations with the story coach in "Make your own"**,
> drafts of images you make until you publish them, …

## Privacy §4 (kept by us when you sign in, with Farcaster or a wallet), a new item

> Drafts you save in "Make your own": your idea, your beats and your text storyboard. Only you can see them, and you
> can delete them; a deleted draft is removed. To count the story coach's daily limit, we record when you send it a
> message, under your Farcaster ID or wallet account, and delete those records after two days (straight away, if
> the coach's reply couldn't be shown). For a wallet
> account, the limit depends on whether it has made a payment, which we read from the payments we already keep.

## Privacy §5 (the assistant), one sentence added

> The story coach in "Make your own" works the same way: your message and the draft you're working on are sent to
> answer it, and nothing of the conversation is kept. It has its own limits: 50 messages a day (10 for a wallet
> account that has never made a payment) and its own daily spending limit. A message whose reply couldn't be shown
> doesn't count toward your 50 (or 10).

## Privacy §7 (outside services), the Groq item reworded

> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, **messages to the story coach with the
> draft they are about**, and the prompts for images you make, which are checked against the published rules.

## Terms

The AI labels on the coach's notes already say what it is. If the Terms list what wallet accounts can use, add
"Make your own" to that list (to verify against src/lib/legal.ts on the day it ships).

## Consent

None needed for v1: nothing the person writes in "Make your own" is published. Publishing a draft later would fall
under own-words consent (v5 or later), with its own wording.

## Answered by the owner (2026-10-19)

1. /make: stays on the repository until the flow is switched on.
2. Wallet accounts: yes.
3. Daily count: the coach's own, 50 a day; 10 for wallets that have never paid.
4. Visual details: as questions or options, never written description.
5. Spend: the coach's own $1 a day, with its own cost rows.
6. The wallet sign-in message: made general (DRAFT above).
7. Wallet sign-in tied to prepaid: ok for now (note above).
8. The live boundary red-team: run, $0.0246 (docs/make-your-own/redteam.md).

## Needs the owner's decision

None open for this feature beyond the reread of these lines.
