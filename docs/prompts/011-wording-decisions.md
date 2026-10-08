# 011: The owner's wording decisions

Given to the coding agent (Claude Code) on 2026-10-08, verbatim, in reply to the
draft-wording doc ("Snowmoon: draft wording, for your words", Google Drive; 188
rows, exported from branch site-lightness at afc272c). Row numbers refer to that doc.

> Wording decisions, by row number in the draft-wording doc.
>
> OK as written: 1, 3, 5–28, 30–54, 55–58, 61–94, 96–109.
>
> My wording:
> - 2: Sign in to ask questions
> - 4: Your questions are saved only on this device. They are sent to Groq to be answered (through Vercel AI Gateway when Groq is busy) and are never published. The daily limit is counted per Farcaster account.
> - 29: Saved only on this device. Sent to Groq to be answered (through Vercel AI Gateway when Groq is busy). Never published.
> - 59: Your messages go to Groq. Groq runs gpt-oss-120b, an open-weights model. When Groq is busy, a message goes through Vercel AI Gateway to Groq instead. Both are set to keep nothing, and this app keeps no copy of your messages.
> - 60: Your questions are saved only on this device. They are sent to Groq (or through Vercel AI Gateway when Groq is busy) to be answered, and never published. Another device won't have them. The app records only how many you ask and when, under your Farcaster ID, to count the daily limit.
> - 95: The spoken opener at the start of every podcast episode. A person wrote the words; the voice is synthetic.
>
> Rows 57–60 together are my reread of the notice. Record it.
>
> Intro cards (110–128): update config/intro.json so the lists match what is live.
> - Live: Read · Listen · Listen as a podcast · Save a passage · Play Minpentai · Ask about the book (testing) · Browse adaptation seeds
> - Planned: Add characters, places and styles · Pick favourites that carry into your work · Start an adaptation
> - 113: Build anything you like from it, as long as you share how you made it under the same open licence.
> - 115: This app keeps that record: every picture and recording here links to how it was made.
> - 117: Today you can read, listen, play Minpentai, save a passage, ask about the book and browse adaptation seeds.
> - 110–112, 114, 116, 118–120: OK as written.
>
> Minpentai (129–188): not approved yet. For rows 131, 132, 135, 164 and 184, give me the block ID behind each statement about the book, or tell me it isn't in the book. Rows 150–154: rocks are invented, and the tutorial doesn't say so; add the "invented" label there. I'll approve the screen after that.

## What was done (branch site-wording)

- **Applied, tagged as the owner's words** (`data-wording="FID 6786"`, `src/lib/wording.ts`), with
  no "Draft wording" line: the assistant signed out (rows 1–6), home (7–18), a thread (19–54),
  the sign-in step (63–73), the recipe sheet (74–102), the pronunciation page (103–109).
  Rows 4 and 29 name the gateway only while it is the fallback (`CHAT.gatewayFallback`), so the
  sentence stays true if the fallback is turned off.
- **Intro** (110–128): `config/intro.json` lines and feature lists as given; `model_drafted`
  false, `edited_by_fid` 6786, `edited_on` 2026-10-08. check:intro now knows /minpentai and
  /assistant exist.
- **Held: the notice (rows 55–62) and its reread.** Row 60's "The app records only how many
  you ask and when, under your Farcaster ID" is narrower than what is stored:
  `studio.chat_calls` (supabase/migrations/0006_chat.sql) also keeps, per question and under
  the FID, an answer row and a guard row with the model, provider, the provider's request id,
  token counts, cost and the guard's verdict (never the text). The chat session found the same
  and put two fixes to the owner (accurate wording, or a migration that drops the FID from those
  rows). The reread covered the four items together, so none is applied or recorded until the
  owner chooses; the notice keeps its draft line. Owned by the chat session (branch
  chat-notice-owner, which adds P6f for the owner's reread).
- **Minpentai** (129–188): not approved; still labelled draft. Rows 150–155 (Rocks, Your
  symbol) already show the "invented" tag on screen; the doc did not carry the tags. The block
  IDs asked for are in the report of 2026-10-08.
