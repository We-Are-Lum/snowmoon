# "Make your own": drafted Privacy lines — DRAFT

**DRAFT, for the owner's reread, not live.** Drafted by the coding agent, 2026-10-19 (owner's long run 2, item 5).
`src/lib/legal.ts` is unchanged. These lines ship only on the day `MAKE_YOUR_OWN` (src/lib/make/flag.ts) is turned on,
together with migration 0017 (supabase/drafts/0017_adaptation_drafts.sql, not applied).

Updated 2026-10-19 after the owner's answers ("Story flow: end card stays on the repo until it's switched on; open to
wallet accounts; coach 50 a day; coach may suggest visual details as questions or options, never written description").

What the feature does (and so what the texts must say):
- Signed in with Farcaster **or a wallet** (getPerson; the wallet button shows only while wallet sign-in is open).
- The person's idea, beats and text storyboard are saved by us as a **private draft**: only they can open it. They can
  delete it; deleting removes it (no copy kept). At most 20 drafts.
- Each message to the coach, with the draft's text, goes to the assistant's models through the assistant's route (Groq,
  or Vercel AI Gateway to Groq when Groq is busy; both set to keep nothing). We keep no copy of the messages or the
  coach's replies; the conversation stays on the device.
- **Its own daily count: 50 coach messages a day**, apart from the assistant's 30. To count it we record, per message,
  the account (Farcaster ID or wallet account) and the time, nothing else, and delete those records after two days.
  The day's spending limit is shared with the assistant.
- The coach may suggest visual details only as questions or short options ("would a clenched jaw show it?"), never as
  written description; every reply is checked before it is shown.
- Nothing about a draft is public. Publishing a draft as an adaptation is a later step, with its own consent.
- /make stays the end card's link to the repository until the flow is switched on (owner); the flow is at
  /make-your-own.

## Privacy §3 (kept on your device only), added to the list

> … your questions to the assistant and its answers, **your conversations with the story coach in "Make your own"**,
> drafts of images you make until you publish them, …

## Privacy §4 (kept by us when you sign in, with Farcaster or a wallet), a new item

> Drafts you save in "Make your own": your idea, your beats and your text storyboard. Only you can see them, and you
> can delete them; a deleted draft is removed. To count the story coach's daily limit, we record when you send it a
> message, under your Farcaster ID or wallet account, and delete those records after two days.

## Privacy §5 (the assistant), one sentence added

> The story coach in "Make your own" works the same way: your message and the draft you're working on are sent to
> answer it, and nothing of the conversation is kept. It has its own limit of 50 messages a day, and shares the
> assistant's daily spending limit.

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
3. Daily count: the coach's own, 50 a day.
4. Visual details: as questions or options, never written description.

## Needs the owner's decision

1. **Free wallets and the shared spending limit.** Any wallet can sign in for free, so one person with many wallets
   gets 50 coach messages per wallet. Spend stays capped (the assistant's $2 a day across everyone; a coach message
   cost about $0.0007 in the red-team, so about 3,000 messages a day), but a flood of coach messages could use up that
   cap and close the reading assistant for everyone until 00:00 UTC. Options: leave it; give the coach its own
   spending cap; or a lower count for wallets that have never paid (as with notes: 3 a day). Not built either way.
2. **The wallet sign-in message** says "Sign in to Snowmoon to make images with a prepaid balance." Signing in for
   "Make your own" shows the same message. Change it to a general one?
3. **Wallet sign-in is only open while prepaid images are open** (prepaidOpen). Fine as is, or open wallet sign-in
   for "Make your own" on its own?
