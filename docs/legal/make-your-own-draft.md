# "Make your own": drafted Privacy lines — DRAFT

**DRAFT, for the owner's reread, not live.** Drafted by the coding agent, 2026-10-19 (owner's long run 2, item 5).
`src/lib/legal.ts` is unchanged. These lines ship only on the day `MAKE_YOUR_OWN` (src/lib/make/flag.ts) is turned on,
together with migration 0017 (supabase/drafts/0017_adaptation_drafts.sql, not applied).

What the feature does (and so what the texts must say):
- Signed-in Farcaster accounts only, like the assistant.
- The person's idea, beats and text storyboard are saved by us as a **private draft**: only they can open it. They can
  delete it; deleting removes it (no copy kept). At most 20 drafts.
- Each message to the coach, with the draft's text, goes to the assistant's models through the assistant's route (Groq,
  or Vercel AI Gateway to Groq when Groq is busy; both set to keep nothing). We keep no copy of the messages or the
  coach's replies; the conversation stays on the device. Each message counts as one of the assistant's 30 a day.
- Nothing about a draft is public. Publishing a draft as an adaptation is a later step, with its own consent.

## Privacy §3 (kept on your device only), added to the list

> … your questions to the assistant and its answers, **your conversations with the story coach in "Make your own"**,
> drafts of images you make until you publish them, …

## Privacy §4 (kept by us when you sign in), a new item

> Drafts you save in "Make your own": your idea, your beats and your text storyboard. Only you can see them, and you
> can delete them; a deleted draft is removed.

## Privacy §5 (the assistant), one sentence added

> The story coach in "Make your own" works the same way: your message and the draft you're working on are sent to
> answer it, nothing of the conversation is kept, and each message counts toward the same daily limit.

## Privacy §7 (outside services), the Groq item reworded

> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, **messages to the story coach with the
> draft they are about**, and the prompts for images you make, which are checked against the published rules.

## Consent

None needed for v1: nothing the person writes in "Make your own" is published. Publishing a draft later would fall
under own-words consent (v5 or later), with its own wording.

## Needs the owner's decision

1. **/make.** It is the end card's link and redirects to the GitHub repository (next.config, "temporary, since /make
   may become a page of its own"). The flow lives at /make-your-own; /make is untouched. Should /make point to the
   flow when it is switched on?
2. **Wallet accounts.** v1 is Farcaster-only, like the assistant whose limits it shares. Open it to wallet accounts?
   (The assistant's limits are per FID.)
3. **A shared daily limit.** Coach messages count against the assistant's 30 a day. Keep it shared, or give the coach
   its own count?
4. **Concrete visual suggestions.** In the red-team the coach never wrote a line, beat, shot or description, but its
   notes sometimes name visual ideas ("a clenched jaw", "a lingering look at the board", once "a looming storm cloud").
   They are suggestions inside questions, not text to paste. Allowed, or should the coach only ask ("what could show
   it?")?
