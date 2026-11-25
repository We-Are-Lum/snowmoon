# Episode 1: the opening, legal lines (DRAFT, for the owner's reread)

DRAFT. Drafted by the coding agent (Claude, by Anthropic), branch `episode1-opening`, 2026-11-24. Not in
`src/lib/legal.ts` yet. Legal texts describe today: these lines go into `src/lib/legal.ts` (with the reread record
and the effective date) in the release that turns `EPISODE.public` on, after the owner's reread. Until then
`check:principles` P6ae refuses `EPISODE.public` on.

What the lines describe, so each can be checked against the code:
- Drafts stay on the device (localStorage) until Submit; nothing is sent before then
  (`src/components/challenge-episode-make.tsx`).
- At Submit, the account check runs once (`accountDecision` in `src/lib/challenge/record.ts`). Only an account
  that passes can submit, and the outline keeps why it could: `admin`, `invited` or `passed`. Nothing is kept for one
  that doesn't pass.
- Kept with the outline (`studio.challenge_outlines`, `NEXT_episode_outlines.sql`): cards (each half, and a picture's
  version id if any), their order, where the first-minute line sits, the optional title, the name shown, the person
  number, why the account could submit, and when it was submitted. Withdrawing or a moderator's Hide sets a time (and,
  for Hide, who). Nothing is deleted.
- The AI comment: the draft's words only (no pictures, no name) go to Groq, or through Vercel AI Gateway to Groq when
  Groq is busy, as for the assistant. It counts as one of the day's assistant questions. Neither the words nor the
  comment is kept; only the call's cost goes into the day's totals.
- Pictures: only pictures already published on the Service, with their maker and recipe. Nothing is generated.

## Privacy §4: a new item (after the remix challenge's)

> If you take part in Episode 1: the opening, your outline stays on your device until you submit it. When you submit
> it, we check your account as we do for the remix challenge; only an account that passes can submit, and we keep
> with the outline why it could (you are an admin, you were invited, or it passed the check). We keep the outline's
> cards, their order, where the first minute ends, its title, any picture from the Service you attached, your name
> and when you submitted. It is public. If you withdraw it, or a moderator hides it, it is no longer shown, but is
> kept, marked withdrawn or hidden, with when.

Changed from the proposal's line (2026-11-24): it adds the account check and why it passed (the build keeps it, as
the remix challenge does), the title, and a moderator's Hide (the build has one; a public text needs a way to take it
down).

## Privacy §5 (The assistant): one sentence added at the end

Before:
> Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to
> keep nothing. We keep no copy of your questions or the answers. With your account we record only how many questions
> you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals, not linked to your
> account, to track our spending.

After (added at the end):
> … to track our spending. Asking for a comment on an Episode 1 outline counts as a question.

## Privacy §7: the Groq line

Before:
> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, the prompts for images you make, which
> are checked against the published rules, and what you write to the storyboard guide, with the speech and your
> storyboard's choices; never your recording or your pictures.

After:
> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, the prompts for images you make, which
> are checked against the published rules, what you write to the storyboard guide, with the speech and your
> storyboard's choices, and the words of an Episode 1 outline you ask to have commented on; never your recording or
> your pictures.

## Terms §6f: new (after §6e, The remix challenge)

> **6f. Episode 1: the opening.** The challenge page sets out its dates. During it, anyone signed in with a Farcaster,
> Lens or Bluesky account that passes the site's check may submit outlines for the first episode. Every word of an
> outline must be your own: not written by an AI, and not copied from the sample deck. A card may show a picture
> already published on the Service, credited to its maker; nothing is made for the challenge. An outline you submit
> is public, like anything you publish here, and you can withdraw it until submissions close. Entering is free, and
> there is no prize.

## Not in the legal texts (on the pages instead)

The number of live outlines per person (3), the card limits (10 cards, 120 characters a half) and the dates are on the
challenge's rules (`src/lib/challenge/episode/wording.ts`), not in Terms or Privacy: limits that can change stay out of
the legal texts (owner, "shortest true sentence").
