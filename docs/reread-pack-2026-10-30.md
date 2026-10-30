# Reread pack, 2026-10-30

Every pending legal draft in one place, each change shown **before** and **after**, then every pending migration in
the order to apply it. Answer each numbered item with "reread" or your changes. Nothing here is in `src/lib/legal.ts`
yet. Each text goes in with its own feature's merge, never ahead (owner, 2026-10-18).

**One assumption runs through the pack: dashboard-rename merges first** (it needs only its reread, items 1 to 3).
So every new sentence below already says "your Dashboard", not "your You page". If you'd rather it waited, say so and
I'll switch the wording back.

How a merged section reads: where several items add to the same section, "Combined" (near the end) shows Terms §7 as it would read
once everything here has shipped, in the order the features merge.

---

## Part A: the dashboard rename (branch `dashboard-rename`)

The live texts say "You page" in three sentences. The branch's own draft listed two; the third (the agent paragraph,
item 3) was missed, and is added here.

### 1. Terms §6b (Agents), second paragraph, last sentence

- Before: "If it gets out, disconnect it on your You page."
- After: "If it gets out, disconnect it on your Dashboard."

### 2. Privacy §4, the wallet-link item, last sentence

- Before: "You can unlink it on your You page."
- After: "You can unlink it on your Dashboard."

### 3. Privacy §4, the agent paragraph, fourth sentence (missed by the branch's draft)

- Before: "That record is shown to you on your You page, and to the site's owner, who reads them, with your name, to
  decide what to build next."
- After: "That record is shown to you on your Dashboard, and to the site's owner, who reads them, with your name, to
  decide what to build next."

(The branch's optional Privacy §6 sentence about the public profile is dropped: with your decision of today, the
profile lists only scenes until consent v5, so §6 already covers it.)

### 4. What agents and people are told (tool descriptions, tool replies, the agent guide, the connect screen)

These aren't legal texts, but they tell people and agents where things happen. The branch changed each one as below;
answer "reread" for all, or name a line.

| # | Where | Before | After |
|---|---|---|---|
| 4.1 | MCP server instructions (every agent reads them first) | "…nothing you make is public until they publish it from their You page." | "…from their Dashboard." |
| 4.2 | MCP server instructions | "…your person approves the spend on their You page." | "…on their Dashboard." |
| 4.3 | Tool `try_frame` description | "…their You page shows the estimate…" | "…their Dashboard shows the estimate…" |
| 4.4 | Tool `request_video_test` description | "…is shown on their You page; nothing is spent until they approve." | "…on their Dashboard…" |
| 4.5 | Tool `log_gap` description | "It shows on their You page and to the site's owner…" | "It shows on their Dashboard and to the site's owner…" |
| 4.6 | Reply after a frame or video draft | "Waiting for your person to approve about $X on their You page; nothing is spent before." | "…on their Dashboard…" (on agent-pictures this reply is replaced by item 9's wording) |
| 4.7 | Reply after `log_gap` | "shown to your person on their You page, under "What your agent couldn't do"…" | "…on their Dashboard…" |
| 4.8 | Refusal when a person has 3 agents | "…disconnect one on your You page first" | "…on your Dashboard first" |
| 4.9 | agents.md (the guide agents read) | "Nothing you make is public, kept or paid for until they say so on their You page" | "…on their Dashboard (snowmoon.party/dashboard)." |
| 4.10 | agents.md | "If you see a key in a conversation, tell your person to end it on their You page and make a new one." | "…on their Dashboard…" |
| 4.11 | agents.md | "Either way, your person can disconnect you from their You page in one tap." | "…from their Dashboard…" |
| 4.12 | agents.md | "Your person's ideas and notes, typed or spoken on their You page, are your…" | "…on their Dashboard…" |
| 4.13 | agents.md | "Nothing is made or spent until your person approves it on their You page." | "…on their Dashboard." |
| 4.14 | agents.md | "They see these on their You page, and so does the site's owner." | "…on their Dashboard…" |
| 4.15 | agents.md (new lines) | (none) | "Your person makes the key on snowmoon.party/dashboard → Agents → "Make an agent key"." and "3. Tell your person what's waiting for them on snowmoon.party/dashboard." |
| 4.16 | The agent connect screen (people read it before Allow) | "It can't publish anything (you publish its drafts from your You page)…" | "…from your Dashboard)…" |
| 4.17 | The agent connect screen | "…your You page shows the estimated cost, and nothing is made or paid for until you tap Make it there." | "…your Dashboard shows…" |
| 4.18 | The agent connect screen | "Disconnect it on your You page at any time; that stops it at once." | "…on your Dashboard…" |
| 4.19 | A wallet's sign-in hint | "Have a Farcaster account? Link this wallet to it on your You page." | "…on your Dashboard." |

The connect screen's words (4.16 to 4.18) aren't a recorded consent (nothing hashes them), so changing them needs only
your reread.

---

## Part B: Plan A part 1 (branch `agent-pictures`; ships with NEXT_agent_pictures)

### 5. Privacy §4, the agent paragraph: two sentences added at its end

- Before (it ends): "…That record is shown to you on your Dashboard, and to the site's owner, who reads them, with
  your name, to decide what to build next. It is never published."
- After (added):
  > Your agent may also draft notes: on your own drafts, on your published work, or on work others have published. A
  > note it drafts stays private, shown to you on your Dashboard and to the site's owner, and appears publicly only if
  > you publish it and the work it is on is published. When one of your agent's tools refuses or fails, we record which
  > tool, when and why (the message your agent was given, with anything it sent taken out) and the names of what it
  > sent, never what it sent. That record is shown to you on your Dashboard and to the site's owner, with your name, to
  > find and fix what went wrong. It is never published.

  (Changed from the 2026-10-25 draft only by "You page" → "Dashboard", twice.)

---

## Part C: Plan A part 2, agent pictures (branch `agent-pictures`; ships after part 1)

### 6. Privacy §4, the agent paragraph: its first two sentences

- Before: "If you use an agent here (for now, only people the site has invited): the edits it drafts for your own scene
  versions (a new frame, another voice take, a shot's timing, who speaks in a shot, a video test), each with the note
  it was drafted from. A frame or video test you approve is kept with what it cost, the model and the pictures sent,
  privately and only for you."
- After: "If you use an agent here (for now, only people the site has invited): the edits it drafts for your own scene
  versions (a new frame, another voice take, a shot's timing, who speaks in a shot, a video test), each with the note
  it was drafted from; and the pictures it drafts for you (a picture of a moment, a shot, a reference or a glossary
  word; a character sheet; a place; a new style and its sample), each with what it is for, the style you chose, and its
  prompt, showing whose words each part is. A frame, video test or picture you approve is kept with what it cost, the
  model, the prompt and the pictures sent, privately and only for you, until you publish or discard it."

### 7. Privacy §7 (outside services): two items name an agent's pictures

- Groq item, before: "Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, and the prompts for
  images you make, which are checked against the published rules."
- Groq item, after (part 2 alone): "…and the prompts for images you make (or approve from your agent's drafts), which
  are checked against the published rules." (Item 12 below changes this item again for the assistant.)
- fal.ai item, before: "fal.ai receives the prompt for an image you make, and any pictures sent with it…"
- fal.ai item, after: "fal.ai receives the prompt for an image you make (or approve from your agent's drafts), and any
  pictures sent with it…" (the rest as today).

### 8. Terms §6b (Agents), first paragraph

- Before: "…When an agent drafts something that costs money (a new frame or a video test), it shows the estimated cost,
  and nothing is made until you approve it. Each draft is made at most once, and each day is limited to 20 frames, 5
  video tests and $2 in all. A frame counts like any other Remix frame: on a Farcaster account it uses your free frames
  for the day; on a wallet account it's charged to your balance at the price shown (section 6a). Video tests are paid
  by us for now."
- After: "…When an agent drafts something that costs money (a new frame, a video test or a picture), it shows the
  estimated cost, and nothing is made until you approve it. Each draft is made at most once, and each day is limited to
  20 frames, 5 video tests and $2 in all. A frame counts like any other Remix frame, and a picture like any other
  picture you make: on a Farcaster account it uses your free frames or pictures for the day; on a wallet account it's
  charged to your balance at the price shown (section 6a). Video tests are paid by us for now."

### 9. What an agent is told after drafting a picture (tool reply; not a legal text)

> Saved as a private draft; nothing is made or spent yet. Next, your person taps Make it on their dashboard (up to $X):
> that makes the picture privately, inside the draft, seen only by them. Publishing it is a separate step, Keep, which
> only your person can take.

The same for a frame or a video ("…that makes the frame/video privately…").

---

## Part D: admin picks and the admin Hide (branch `phase2-admin`; ships with NEXT_admin_picks)

### 10. Terms §7 (Hiding and removal): two sentences added

- Before: "Nothing on the Service is official or canonical. We may hide content that breaks these Terms. You may hide
  your own work yourself where the Service offers "Hide", or ask us to hide it, at any time. How this works is set out
  in our removal policy, linked from About."
- After: "Nothing on the Service is official or canonical. We may hide content that breaks these Terms. **Admins may
  also hide the images the project made itself, its starting points, for any reason.** You may hide your own work
  yourself where the Service offers "Hide", or ask us to hide it, at any time. How this works is set out in our
  removal policy, linked from About. **Admins (the site's owner and people the owner names) may pick which image shows
  first for a moment of the book or a glossary item; it is labelled with who picked it, and you can switch to the most
  liked, the newest or the images you liked, and every other image stays one tap away.**"

No Privacy change: a pick stores the admin's FID and the time; the switch's choice stays on the reader's device.

---

## Part E: posts that link here (branch `social-read`; ships with NEXT_social_read, then its switch)

### 11a. Privacy §6 (What you publish): a paragraph added at its end

- Before (it ends): "…Its card is drawn from that link, and we keep nothing about it."
- After (new paragraph):
  > If you post on Farcaster or Bluesky with a link to a page here, your post may be shown on that page, under "Posts
  > that link here": your handle on that network, the date, the post's text (up to 500 characters) and a link to it,
  > newest first. We never show your picture or display name, and nothing is counted or ranked. We find these posts
  > through Neynar (for Farcaster) and Bluesky's public service (section 7), and keep them only in our server's
  > short-term cache, for about half an hour, not in our database. A Bluesky post or account with a label, including
  > an account that asks not to be shown to people who aren't signed in, is not shown. If you delete your post, it
  > leaves this site within about an hour. To have it removed here sooner, or kept off, write to
  > snowmoon@wearelum.xyz; we then keep only the post's id, to keep it hidden.

### 11b. Privacy §7: the Neynar item, one sentence added at its end

- Before (it ends): "…Neynar receives your Farcaster ID, and we keep its answer in memory for five minutes."
- After (added): "To find public Farcaster posts that link to pages here, our server asks Neynar for them, at most
  every half hour; this sends nothing about you."

### 11c. Privacy §7: a new item, after Neynar

> Bluesky's public service (api.bsky.app) is asked by our server, at most every half hour, for public posts that link
> to pages here. It receives nothing about you or what you read; your browser doesn't contact it.

### 11d. Terms §7: one more sentence (after "We may hide content that breaks these Terms.")

> Public posts on other networks that link to a page here may be shown on that page; they are their writers' and under
> those networks' terms, not part of the Service's own content, and we may hide any of them, and do so when the person
> who wrote one asks.

### 11e. About (not a legal page; shown only while the switch is on)

> Posts that link here: under a chapter, an image or a scene, public posts on Farcaster and Bluesky that link to that
> page are shown, newest first, with the writer's handle, the date and a link to the post. Our server finds them,
> through Neynar for Farcaster and Bluesky's public API, sending only this site's address; your browser asks neither.
> Moderators can hide any of them, and the person who wrote one can ask us to remove it at snowmoon@wearelum.xyz.

The branch's notes for this reread (spam, the networks' own terms, "within about an hour") are in
`docs/legal/social-read-draft.md` on `social-read`.

---

## Part F: the assistant as an agent (ships with the feature; not built yet)

You reread the notice and the Privacy §5 paragraph on 2026-10-29 (`docs/legal/assistant-agent-draft.md`). Today's
decisions change where messages go and how making is limited:
- **Routing C:** book questions stay on gpt-oss-120b (Groq). "Make" conversations go to Kimi K3 through Vercel AI
  Gateway, **pinned to Baseten**, with no fallback: if Baseten is down, make mode says it's unavailable.
- **Limits:** make mode has its own cap, about **$3 a day for the whole site** and **10 make conversations per person a
  day**. Book questions keep the chat's $2 a day.

The reread words said only Groq, so items 12 and 13 are new drafts. Item 14 repeats the reread words, with "You page"
→ "Dashboard" and the Baseten change.

**Baseten's terms, checked 2026-10-30:**
- Its security page says its Model APIs keep a zero-data-retention posture: it "does not log or store customer content,
  or write it to persistent storage, after real-time processing" ([security practices](https://www.baseten.co/security-practices/);
  [data request policy](https://www.baseten.co/data-request-policy/)).
- The exception is Baseten's async (queued) inference, which can hold a request for up to 72 hours. The site would call
  it synchronously, through the gateway's chat endpoint, so the exception doesn't apply.
- Vercel AI Gateway lists Baseten among the providers with a zero-retention and no-prompt-training agreement for gateway
  traffic ([Vercel ZDR](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr)).
- Pinning is done per request (`only: ['baseten']` with `zeroDataRetention: true`). If Baseten can't serve, the gateway
  refuses rather than going elsewhere.
- Not found: an express "no training" clause in Baseten's own terms. For gateway traffic it rests on Vercel's agreement.

### 12. The notice, item 3 (where messages go)

- Before (today, and the 10-29 reread "Unchanged"): "**Your messages go to Groq (not the Grok of X).** Groq runs
  gpt-oss-120b, an open-weights model. When Groq is busy, a message goes through Vercel AI Gateway to Groq instead.
  Both are set to keep nothing, and this app keeps no copy of your messages."
- After (draft): "**Your messages go to Groq (not the Grok of X), or to Baseten when you make something.** Questions
  about the book go to Groq, which runs gpt-oss-120b, an open-weights model; when Groq is busy, through Vercel AI
  Gateway instead. gpt-oss-120b also reads each message first, to tell a question from a request to make something.
  When you ask it to make something, the conversation goes through Vercel AI Gateway to Baseten, which runs Kimi K3, an
  open-weights model by Moonshot AI; if Baseten isn't available, making is paused rather than sent elsewhere. All are
  set to keep nothing, and this app keeps no copy of your messages."

### 13. Privacy §5 (The assistant), first paragraph, and §7

- §5 before: "Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy.
  Both are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record
  only how many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily
  totals, without your ID, to track our spending."
- §5 after (draft): "Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is
  busy. When you ask the assistant to make something, the conversation is sent through Vercel AI Gateway to Baseten,
  which runs Kimi K3, and to no other provider. All are set to keep nothing. We keep no copy of your questions or the
  answers. Under your Farcaster ID we record only how many questions you ask, and how many times you start making
  something, and when, to count the daily limits. The assistant's costs are kept only as daily totals, without your ID,
  to track our spending and to pause the assistant, or its making, for the day when its spending limit is reached."
- §7 Groq item, after (with item 7): "Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, and
  the prompts for images you make (or approve from your agent's drafts), which are checked against the published
  rules. When you ask the assistant to make something, Vercel AI Gateway also receives the conversation and passes it
  to Baseten."
- §7, a new item after it (draft): "Baseten runs Kimi K3 for the assistant when you ask it to make something. It
  receives the conversation through Vercel AI Gateway, answers it, and keeps nothing (its zero-data-retention terms,
  and Vercel's agreement with it)."

**The limits, in numbers:**
- **Book questions:** the chat's $2 a day for the whole site, and the existing 30 a person a day. About $0.0009 each.
- **Making:** its own $3 a day for the whole site, and 10 make conversations a person a day. At about $0.06 each, the $3
  covers about 50 make conversations a day site-wide before making pauses until 00:00 UTC; book questions keep working.
- **A "make conversation"** is counted when the routing call first says "make something" in a conversation. Later
  turns in it don't count again.

### 14. The notice, items 1, 2 and 4, and the §5 agent paragraph (reread 2026-10-29; repeated for the record)

- Item 1, before: "**It helps you read.** Ask about the book. Answers point to the passages they rest on, with chapter
  and ¶, and show the book's own words."
- Item 1, after: "**It helps you read and make.** Ask about the book, or say what you'd like to make. Answers point to
  the passages they rest on and show the book's own words."
- Item 2, before: "**It won't write for you.** No dialogue, narration or description. It gives context and commentary
  only."
- Item 2, after: "**It won't write the story for you.** No dialogue or narration: lines in anything it drafts are the
  book's own words or yours, exactly. It writes only the prompts for pictures, shown in their recipe."
- Item 4, before: "**Your questions are saved only on this device.** They are sent to Groq… to be answered, and never
  published…"
- Item 4, after: "**Your questions stay on this device; drafts go to your Dashboard.** Your questions are sent to Groq
  (or, when you make something, to Baseten) to be answered and never published; another device won't have them. When
  you ask it to make something, its drafts, with the words of your request, are kept privately on your Dashboard until
  you publish or discard them. Anything with a cost waits for you to tap Make it." (Changed from the reread words only
  by "dashboard" → "Dashboard" and "(or, when you make something, to Kimi K3)".)
- §5, a paragraph added after it (reread): "If you ask the assistant to make something, it works as your agent: it
  saves drafts to your Dashboard (what it drafted, the words of your request that it answers, and the recipe),
  privately, until you publish or discard them. We still keep no copy of the conversation itself. As with any agent,
  when one of its tools refuses or fails, or it can't do what you asked, it records that, and the site's owner sees it
  with your name (section 4)."
- Terms §6b, one sentence (reread): "The site's own assistant can act as your agent too, with the same limits."
- Terms §6b, a second sentence (new draft, for the make limits): "When you ask the assistant to make something, each
  day is limited to 10 such conversations for you and to a spending limit for the whole site; when either is reached,
  making pauses until the next day, and questions about the book still work."

---

## Combined: Terms §7 as it would read with Parts D and E shipped

> Nothing on the Service is official or canonical. We may hide content that breaks these Terms. Admins may also hide the
> images the project made itself, its starting points, for any reason. Public posts on other networks that link to a
> page here may be shown on that page; they are their writers' and under those networks' terms, not part of the
> Service's own content, and we may hide any of them, and do so when the person who wrote one asks. You may hide your
> own work yourself where the Service offers "Hide", or ask us to hide it, at any time. How this works is set out in our
> removal policy, linked from About. Admins (the site's owner and people the owner names) may pick which image shows
> first for a moment of the book or a glossary item; it is labelled with who picked it, and you can switch to the most
> liked, the newest or the images you liked, and every other image stays one tap away.

---

## Migrations, in the order to apply them

All four paste files are in iCloud, `snowmoon-takes/overnight-2026-10-21/migrations/`, and match their branches
(checked by sha256). For each one, in the Supabase SQL Editor, as postgres:
1. paste the DRY-RUN file (it ends in `rollback;`) and check it runs with no error;
2. paste the real file (it ends in `commit;`);
3. paste the READ-BACK file: every row should say true.

Then tell me "applied" for each.

Every read-back also adds a realistic row as the site's role, checks it, deletes it, and ends in `rollback;`, so nothing
is kept (CLAUDE.md). Each was run against a local database built from its branch's migrations: all rows true.

| # | Migration | Database | Files | Needs | Then |
|---|---|---|---|---|---|
| 1 | open-call `0004_opencall_fal_cleanup` | open-call's (`public.opencall_renders`) | `open-call-0004_opencall_fal_cleanup.DRY-RUN.sql`, `open-call-0004_opencall_fal_cleanup.sql`, `READ-BACK-open-call-0004.sql` | 0001–0003 of open-call | I merge open-call's `fal-cleanup` and restart the bench |
| 2 | `NEXT_agent_pictures` (numbered 0029 at merge) | snowmoon | `NEXT_agent_pictures.DRY-RUN.sql`, `NEXT_agent_pictures.sql`, `READ-BACK-agent_pictures.sql` | 0019 (agents) | with your reread of item 5, I merge Plan A part 1 |
| 3 | `NEXT_admin_picks` (0030 at merge) | snowmoon | `NEXT_admin_picks.DRY-RUN.sql`, `NEXT_admin_picks.sql`, `READ-BACK-admin_picks.sql` | 0001 | with item 10, phase2-admin can merge |
| 4 | `NEXT_social_read` (0031 at merge) | snowmoon | `NEXT_social_read.DRY-RUN.sql`, `NEXT_social_read.sql`, `READ-BACK-social_read.sql` | 0001 | with items 11a–11e, social-read merges, then its switch goes on |

The numbers follow this order; if you apply them in another order, I number them by the order they merge. Each is one
transaction, safe to run twice. None depends on another, so a failure in one doesn't block the rest.

## Merge order after your answers

1. **dashboard-rename:** items 1 to 4 (no migration).
2. **Plan A part 1:** item 5, and migration 2 "applied".
3. **phase2-admin:** item 10, and migration 3 "applied".
4. **social-read:** items 11a to 11e, migration 4 "applied", then its switch.
5. **Plan A part 2:** items 6 to 9 (after part 1).
6. **The assistant as an agent:** items 12 to 14, when it's built (routing C).

One merge at a time, live checks after each, as always.
