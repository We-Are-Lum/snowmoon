# The assistant for any account, step 1: legal and notice lines (APPROVED)

Drafted by a coding agent (Claude, a closed model by Anthropic) on branch `assistant-any-account`, 2026-11-05, for the
accounts session (snowmoon-9c). **Approved, 2026-11-05: "reviewed by the coordinator, approved by the owner"**, as
drafted, with the owner's fixes, which are applied below: Privacy §5's last sentence ("not linked to your account"), the
notice's last sentence ("Cost records aren't linked to your account."), "or the assistant" kept in §7's Lens sentence,
and the refusals name only links that help today (Bluesky: "a Farcaster or Lens account"; Lens: "a Farcaster account").
Invited FIDs and admins skip Neynar for the assistant, as for images (kept). The words are in `src/lib/legal.ts`
(Privacy uxou8g, was 9tvzf3; Terms unchanged, erie8c), `src/lib/chat/notice.ts` (item 4; notice key 1ijrpib, was
1xrxl4h; P6e 70a28a9c8ee48471) and `src/app/about/page.tsx` (A1, A2), and ship with the switch on, in the same release
(legal texts describe today).

## What they describe (owner, 2026-11-05)

Step 1, built behind one switch, `ASSISTANT.anyAccount` (src/lib/config.ts), **off**:

- **One rule for every network** (the owner's answer, 2026-11-05): everyone who asks passes their own network's check,
  the same stored decision images use: a Farcaster account the Neynar score, a Lens account the Lens score, a Bluesky
  account the Bluesky check. A current decision is used as it is; only when there is none is the network asked, at the
  moment someone sends a question (never when the assistant is opened or a page is viewed). A decision made for an
  image counts for the assistant, and the other way round.
- What is sent: Neynar receives the FID; Lens's API receives the Lens account's address; Bluesky's public AppView
  receives the account's DID. Nothing about the question. Only the decision is kept (passed or not, when, the rule), as
  for images: a pass for 90 days, a fail for a day.
- A Lens or Bluesky account linked to a Farcaster account signs in as that FID: it is checked and counted as that FID.
  A Bluesky account linked to a Lens account is that Lens account. Otherwise a Lens or Bluesky account asks under its
  own account, with the same free daily limit (30), counted per account.
- Wallet-only sign-ins can't ask (no payments for questions yet).
- With the switch off (today): any FID, or an account linked to one, asks with no check; no one else can.

check:principles **P6ab** refuses the switch on until Privacy §5 no longer counts questions only "under your Farcaster
ID", §7's Neynar, Lens-score and Bluesky-check sentences each name the assistant, and the notice no longer says
"Farcaster ID". The lines below are written to pass it.

"Before" lines are quoted word for word from `origin/main` (fd632855): `src/lib/legal.ts`, `src/lib/chat/notice.ts`,
`src/app/about/page.tsx` and `src/components/assistant.tsx`, as they read on the page. Changed words are in **bold** in
"After".

## Privacy

**P1. §5 The assistant.**

- Before: "Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both
  are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how
  many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals,
  without your ID, to track our spending."
- After: "Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both
  are set to keep nothing. We keep no copy of your questions or the answers. **With your account** we record only how
  many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals,
  **not linked to your account**, to track our spending." (The owner's fix, 2026-11-05.)

**P2. §4, the Neynar decision.**

- Before: "Whether your Farcaster account passed the check for making images (its Neynar score against the score
  needed), when that was decided, and the score needed then; never the score itself. A pass is kept for 90 days and a
  fail for a day. A pass is removed sooner if your account is reported or one of your pictures is hidden by a
  moderator."
- After: "Whether your Farcaster account passed the check for making images **and asking the assistant** (its Neynar
  score against the score needed), when that was decided, and the score needed then; never the score itself. A pass is
  kept for 90 days and a fail for a day. A pass is removed sooner if your account is reported or one of your pictures is
  hidden by a moderator."

**P3. §4, the Lens decision.**

- Before: "Whether your Lens account passed the check for making images (its Lens score against the score needed),
  when that was decided, and the score needed then; never the score itself. A pass is kept for 90 days and a fail for a
  day. A pass is removed sooner if your account is reported or one of your pictures is hidden by a moderator."
- After: "Whether your Lens account passed the check for making images **and asking the assistant** (its Lens score
  against the score needed), when that was decided, and the score needed then; never the score itself. A pass is kept
  for 90 days and a fail for a day. A pass is removed sooner if your account is reported or one of your pictures is
  hidden by a moderator."

**P4. §4, the Bluesky decision.**

- Before: "Whether your Bluesky account passed the check for making images (section 7), and when that was decided;
  never its age or its post count. A pass is kept for 90 days and a fail for a day. A pass is removed sooner if your
  account is reported or one of your pictures is hidden by a moderator."
- After: "Whether your Bluesky account passed the check for making images **and asking the assistant** (section 7),
  and when that was decided; never its age or its post count. A pass is kept for 90 days and a fail for a day. A pass is
  removed sooner if your account is reported or one of your pictures is hidden by a moderator."

**P5. §7, Neynar (first sentence only; the rest of the item is unchanged).**

- Before: "Neynar receives your Farcaster ID when you make or publish an image or a character sheet and your account
  has no current check, to look up its account score, which decides whether you can make images."
- After: "Neynar receives your Farcaster ID when you make or publish an image or a character sheet, **or ask the
  assistant,** and your account has no current check, to look up its account score, which decides whether you can make
  images **and ask the assistant**."
- Unchanged and still true: "Neynar is never asked about you when someone views a page." (Opening the assistant never
  asks Neynar either; the status route reads only a kept decision.)

**P6. §7, Lens (the score sentence and the last sentence; the sign-in sentences are unchanged).**

- Before: "When you make an image or a frame without a linked Farcaster account, and we have no current decision for
  your Lens account, Lens's API also receives your Lens account's address, to look up its Lens score, which decides
  whether you get free images and frames." … "Lens is never asked about you when someone views a page or when you open
  the image or frame maker."
- After: "When you make an image or a frame, **or ask the assistant,** without a linked Farcaster account, and we have no
  current decision for your Lens account, Lens's API also receives your Lens account's address, to look up its Lens
  score, which decides whether you get free images and frames **and can ask the assistant**." … "Lens is never asked
  about you when someone views a page or when you open the image or frame maker **or the assistant**."

**P7. §7, Bluesky (the first two sentences; the rest is unchanged).**

- Before: "If you sign in with Bluesky and your Bluesky account isn't linked to a Farcaster or Lens account: when you
  make an image or a frame, or publish a remix during the remix challenge, and your account has no current check, our
  server sends your Bluesky account's identifier (its DID, not your handle) to Bluesky's public AppView
  (public.api.bsky.app), to read when your account was made and its latest posts. This check decides whether you can
  make images and frames for free and whether a remix can count as an entry."
- After: "If you sign in with Bluesky and your Bluesky account isn't linked to a Farcaster or Lens account: when you
  make an image or a frame, **ask the assistant,** or publish a remix during the remix challenge, and your account has
  no current check, our server sends your Bluesky account's identifier (its DID, not your handle) to Bluesky's public
  AppView (public.api.bsky.app), to read when your account was made and its latest posts. This check decides whether
  you can make images and frames for free, **whether you can ask the assistant,** and whether a remix can count as an
  entry."

No other Privacy line says the assistant is Farcaster-only. §3 (the furthest chapter sent with each question) and §7's
Groq line are unchanged: no new service receives questions (P6i holds).

## The assistant's notice (src/lib/chat/notice.ts, item 4; P6e, P6f)

**N1.**

- Before: "They are sent to Groq (or through Vercel AI Gateway when Groq is busy) to be answered, and never published.
  Another device won’t have them. The app records only how many you ask and when, under your Farcaster ID, to count the
  daily limit. Cost records are kept without your ID."
- After: "They are sent to Groq (or through Vercel AI Gateway when Groq is busy) to be answered, and never published.
  Another device won’t have them. The app records only how many you ask and when, **with your account**, to count the
  daily limit. Cost records **aren’t linked to your account**." (The owner's fix, 2026-11-05.)

Items 1 to 3 are unchanged. The changed words give a new `noticeKey`, so P6f needs the owner's reread recorded
(`ownerReread.words`), and readers who ticked "Don't show this again" see the notice once more. P6e: the chat's code
changed on this branch (the gate), so `reviewedFor` takes the new fingerprint (the words today are unchanged, so the
agent's reread is enough until the switch goes on).

## About (src/app/about/page.tsx)

**A1. "Signing in"** (the owner's approved A1 of docs/legal/signin-release-2026-11-05.md).

- Before: "Reading needs no account. Saving cards and liking need a Farcaster sign-in, and the assistant a Farcaster
  account or one linked to it. Making images needs a sign-in."
- After: "Reading needs no account. Saving cards and liking need a Farcaster sign-in, and the assistant a Farcaster,
  **Lens or Bluesky account that passes the site's check, or an account linked to one**. Making images needs a
  sign-in."

**A2. The Neynar paragraph under "References".**

- Before: "Neynar receives your Farcaster ID when you make an image and your account has no current check, to look up
  its account score, which decides whether you can make images. The score isn't kept: only whether your account passed
  and when, for up to 90 days (a day if it didn't pass)."
- After: "Neynar receives your Farcaster ID when you make an image **or ask the assistant** and your account has no
  current check, to look up its account score, which decides whether you can make images **and ask the assistant**. The
  score isn't kept: only whether your account passed and when, for up to 90 days (a day if it didn't pass)."

The About assistant paragraph ("this app keeps no copy, only a count and the cost") is unchanged and still true.

## The assistant's panel (not legal text; approved with the refusals' fix)

Built on this branch, in `src/lib/chat/who-can-ask.ts`; each follows the switch, so today's build shows the left column.

| Where | Switch off (today, built) | Switch on (built, off) |
|---|---|---|
| Who can ask (signed out, and the fallback) | "Asking questions needs a Farcaster account." (on main) | "Asking questions needs a Farcaster, Lens or Bluesky account that passes its check." |
| Signed in with a wallet | "Asking questions needs a Farcaster account. Sign in with one to ask." | "Asking questions needs a Farcaster, Lens or Bluesky account. Sign in with one to ask." |
| Signed in with Lens or Bluesky, not linked | "Asking questions needs a Farcaster account. Link this account to one, or sign in with Farcaster, to ask." | (asks if it passes) |
| Lens below the score | | "Asking questions is open to Lens accounts with a Lens score of 1,000 or more, to keep out spam accounts. Yours is below that. Link it to a Farcaster account that passes its check to ask." |
| Bluesky too new | | "Asking questions is open to Bluesky accounts at least 30 days old, to keep out accounts made to use it. Link it to a Farcaster or Lens account that passes its check to ask." |
| Bluesky idle | | "Asking questions is open to Bluesky accounts that posted at least 5 times in the last 30 days, to keep out unused accounts. Link it to a Farcaster or Lens account that passes its check to ask." |
| Bluesky, a kept fail | | "Asking questions is open to Bluesky accounts at least 30 days old that posted at least 5 times in the last 30 days. Yours didn’t pass when we last checked; we can check again a day after that. Link it to a Farcaster or Lens account that passes its check to ask." |
| Farcaster below Neynar | | "Asking questions is open to Farcaster accounts with a Neynar score of 0.7 or more, to keep out spam accounts. Yours is 0.31." (or, from a kept fail: "Yours was below that when we last checked; we can check again in about N hours.") |
| Neynar can't be reached | | "The assistant can’t check your account right now (Neynar, which scores Farcaster accounts, can’t be reached). Try again later." |
| Lens / Bluesky can't be reached | | The images' words: "We can’t check your Lens account right now (the Lens API can’t be reached). Try again later." / "We can’t check your Bluesky account right now (Bluesky can’t be reached). Try again later." |
| The panel's privacy line | "The daily limit is counted per Farcaster account." (owner's words, on main) | "The daily limit is counted per account." |

Someone signed in who can't ask no longer sees the "Sign in to ask questions" heading (built, today): only the refusal,
the panel's one-line description, "Link accounts on your You page" (Lens, Bluesky) or the ways that can ask (wallet),
and "Keep reading without it".

## Not changed

- **Terms:** no Terms line says who can ask the assistant (§4 speaks of free images and frames only), so none changes.
- **Consent screen** (`config/consent.json`): it doesn't mention the assistant or who can ask.

## Questions for the owner (answered 2026-11-05)

1. Invited FIDs and admins skip the Neynar check for images; the assistant's gate does the same. **Keep.**
2. P6 above adds "or the assistant" to "Lens is never asked … when you open …". **Keep.**
3. Refusals name only links that help today: Bluesky "Link it to a Farcaster or Lens account that passes its check to
   ask."; Lens "Link it to a Farcaster account that passes its check to ask." **Applied.**
