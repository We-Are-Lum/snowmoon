# Morning sitting, 2026-10-31 (about 20 minutes)

Six blocks, in the order that unblocks the most. Each one gives:
- the text to reread, before and after;
- the paste files, in order (if any);
- the word to send me.

Answer a block with its word, or with your changes. Once a block is cleared, I merge it, one at a time, with live checks
after each.

**The paste files** are in iCloud, `snowmoon-takes/overnight-2026-10-21/migrations/`. I checked each one byte for byte
against its branch on 2026-10-31. For each migration, in the Supabase SQL Editor, as `postgres`:
1. the DRY-RUN file (it ends in `rollback;`): it runs with no error;
2. the real file (it ends in `commit;`);
3. the READ-BACK file: every row says true. It adds a realistic row, checks it and deletes it, so nothing is kept.

The numbers in brackets are what each migration becomes when it merges: main ends at 0029 today.

---

## a) phase2-admin: Garance's admin powers (about 4 min)

**What it unblocks:**
- @garance gets every admin power;
- admin Hide on seeded images, reaching everywhere (home, About, quote cards, the player, share images);
- picks with the switch;
- /admin/review.

**Paste:** `NEXT_admin_picks` (0030):
1. `NEXT_admin_picks.DRY-RUN.sql`
2. `NEXT_admin_picks.sql`
3. `READ-BACK-admin_picks.sql`

**Reread, Terms §7: two sentences added (in bold).**
- Before: "Nothing on the Service is official or canonical. We may hide content that breaks these Terms. You may hide
  your own work yourself where the Service offers "Hide", or ask us to hide it, at any time. How this works is set out
  in our removal policy, linked from About."
- After: "Nothing on the Service is official or canonical. We may hide content that breaks these Terms. **Admins may
  also hide the images the project made itself, its starting points, for any reason.** You may hide your own work
  yourself where the Service offers "Hide", or ask us to hide it, at any time. How this works is set out in our removal
  policy, linked from About. **Admins (the site's owner and people the owner names) may pick which image shows first
  for a moment of the book or a glossary item; it is labelled with who picked it, and you can switch to the most liked,
  the newest or the images you liked, and every other image stays one tap away.**"

There's no Privacy change: a pick stores the admin's FID and the time, and the switch's choice stays on the device.

**Send:** "a: reread, applied"

---

## b) dashboard-rename: "You page" → "Dashboard" (about 3 min)

**What it unblocks:**
- /you becomes /dashboard;
- every new legal sentence below already says "Dashboard".

There's no migration.

**Reread, three legal sentences:**
1. Terms §6b, last sentence: "If it gets out, disconnect it on your ~~You page~~ **Dashboard**."
2. Privacy §4, the wallet link: "You can unlink it on your ~~You page~~ **Dashboard**."
3. Privacy §4, the agent paragraph: "That record is shown to you on your ~~You page~~ **Dashboard**, and to the site's
   owner, who reads them, with your name, to decide what to build next."

**And 19 non-legal lines,** where "You page" becomes "Dashboard":
- the MCP instructions (2);
- the tool descriptions (3);
- the tool replies (3);
- agents.md (6, plus 2 new lines pointing at snowmoon.party/dashboard);
- the agent connect screen (3);
- a wallet's sign-in hint (1).

Nothing else in those lines changes. Every line is in `reread-pack-2026-10-30.md`, item 4, if you want to see one.

**Send:** "b: reread"

---

## c) Plan A: agent pictures, part 1, then part 2 (about 5 min)

**What it unblocks:**
- **part 1:** agents draft notes, and their refusals are recorded;
- **part 2:** agents draft pictures, sheets, places and styles, each made only when you tap Make it.

**Paste, part 1 only:** `NEXT_agent_pictures` (0031):
1. `NEXT_agent_pictures.DRY-RUN.sql`
2. `NEXT_agent_pictures.sql`
3. `READ-BACK-agent_pictures.sql`

**Part 1: reread Privacy §4, the agent paragraph, with two sentences added at its end:**
> Your agent may also draft notes: on your own drafts, on your published work, or on work others have published. A note
> it drafts stays private, shown to you on your Dashboard and to the site's owner, and appears publicly only if you
> publish it and the work it is on is published. When one of your agent's tools refuses or fails, we record which tool,
> when and why (the message your agent was given, with anything it sent taken out) and the names of what it sent, never
> what it sent. That record is shown to you on your Dashboard and to the site's owner, with your name, to find and fix
> what went wrong. It is never published.

**Part 2: reread three changes.**
- **Privacy §4, the agent paragraph, first two sentences.** After:
  "…each with the note it was drafted from; **and the pictures it drafts for you (a picture of a moment, a shot, a
  reference or a glossary word; a character sheet; a place; a new style and its sample), each with what it is for, the
  style you chose, and its prompt, showing whose words each part is.** A frame, video test **or picture** you approve
  is kept with what it cost, the model, **the prompt** and the pictures sent, privately and only for you**, until you
  publish or discard it**."
- **Privacy §7:** the Groq and fal.ai items each add "(or approve from your agent's drafts)" after "images you make" /
  "an image you make".
- **Terms §6b,** first paragraph. After:
  "…When an agent drafts something that costs money (a new frame, a video test **or a picture**)… A frame counts like
  any other Remix frame, **and a picture like any other picture you make**: on a Farcaster account it uses your free
  frames **or pictures** for the day; on a wallet account it's charged to your balance at the price shown (section 6a).
  Video tests are paid by us for now."

**Send:** "c: reread part 1, applied; reread part 2". Part 2 merges after part 1.

---

## d) social-read: posts that link here (about 4 min)

**What it unblocks:** "Posts that link here" under chapters, images and scenes. They come from Farcaster through
Neynar, and from Bluesky's public API; no avatars or pictures are shown. The feature merges switched off, and I turn
it on after you OK.

**Paste:** `NEXT_social_read` (0032):
1. `NEXT_social_read.DRY-RUN.sql`
2. `NEXT_social_read.sql`
3. `READ-BACK-social_read.sql`

**Reread:**
- **Privacy §6,** a new last paragraph:
  > If you post on Farcaster or Bluesky with a link to a page here, your post may be shown on that page, under "Posts
  > that link here": your handle on that network, the date, the post's text (up to 500 characters) and a link to it,
  > newest first. We never show your picture or display name, and nothing is counted or ranked. We find these posts
  > through Neynar (for Farcaster) and Bluesky's public service (section 7), and keep them only in our server's
  > short-term cache, for about half an hour, not in our database. A Bluesky post or account with a label, including an
  > account that asks not to be shown to people who aren't signed in, is not shown. If you delete your post, it leaves
  > this site within about an hour. To have it removed here sooner, or kept off, write to snowmoon@wearelum.xyz; we then
  > keep only the post's id, to keep it hidden.
- **Privacy §7, the Neynar item,** added at the end: "To find public Farcaster posts that link to pages here, our server
  asks Neynar for them, at most every half hour; this sends nothing about you."
- **Privacy §7, a new item:** "Bluesky's public service (api.bsky.app) is asked by our server, at most every half hour,
  for public posts that link to pages here. It receives nothing about you or what you read; your browser doesn't contact
  it."
- **Terms §7,** after "We may hide content that breaks these Terms.": "Public posts on other networks that link to a
  page here may be shown on that page; they are their writers' and under those networks' terms, not part of the
  Service's own content, and we may hide any of them, and do so when the person who wrote one asks."
- **About** (shown only while the switch is on): "Posts that link here: under a chapter, an image or a scene, public
  posts on Farcaster and Bluesky that link to that page are shown, newest first, with the writer's handle, the date and
  a link to the post. Our server finds them, through Neynar for Farcaster and Bluesky's public API, sending only this
  site's address; your browser asks neither. Moderators can hide any of them, and the person who wrote one can ask us to
  remove it at snowmoon@wearelum.xyz."

**Send:** "d: reread, applied, switch on". Or leave out "switch on" to merge it switched off.

---

## e) The assistant: routing C, Kimi K3 on Baseten, the make cap (about 4 min)

**Built overnight** on agent-pictures (b4fbb3d), and **switched off** (`CHAT.make.enabled: false`), so production is
unchanged until you reread.
- **Routing:** gpt-oss-120b reads each message, until a conversation turns to making. Book questions stay on gpt-oss
  under the chat's $2.
- **Making:** Kimi K3 through Vercel AI Gateway, pinned to Baseten with zero retention, and no fallback. Any other
  provider, or a reply without zero retention, gets "making is unavailable".
- **The make cap:** $3 a day site-wide, and 10 make conversations a person a day.
- **No migration:** the caps use the existing tables.
- **Not built yet:** for now make mode reads the book and plans with you. Drafting needs the assistant to act as your
  agent, which isn't built.
- **Checks:**
  - test:chat-make: 21 checks, 9 rules, each proven on a planted violation;
  - test:chat 91; test:chat-route 9;
  - principles 53 + P6d;
  - UI check 59 pages.
- **Real trial: $0.03.** Every Kimi turn was served by Baseten, and zero retention was confirmed on each.
- **Baseten's terms:**
  - "Baseten adheres to a Zero Data Retention posture across all inference products", and "does not use Customer Content
    for model training" (baseten.co/security-practices).
  - Vercel lists Baseten with ZDR and no prompt training (vercel.com/docs/ai-gateway/security-and-compliance/zdr).
  - Caveat: Baseten's customer is Vercel. Our zero retention rests on Vercel's agreement with Baseten, not on a
    contract of ours.

**Reread** (the full before and after text is in `docs/legal/routing-c-draft.md` on agent-pictures):
- **Privacy §5.** After: "Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq
  is busy. **Until you ask the assistant to make something, Groq first reads each message on its own, to tell a
  question about the book from a request to make something. When you do, the conversation from then on is sent
  through Vercel AI Gateway to Baseten, which runs Kimi K3, and to no other provider.** All are set to keep nothing. We
  keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask,
  **and how many times you start making something,** and when, to count the daily limits. The assistant's costs are
  kept only as daily totals, without your ID, to track our spending **and to pause the assistant, or its making, for the
  day when its spending limit is reached**."
- **Privacy §7.**
  - The Groq item adds: "When you ask the assistant to make something, Vercel AI Gateway also receives the conversation
    and passes it to Baseten."
  - A new item: "Baseten runs Kimi K3 for the assistant when you ask it to make something. It receives assistant
    questions in that conversation through Vercel AI Gateway, answers them, and keeps nothing (its zero-data-retention
    terms, and Vercel's agreement with it)."
- **The notice** (shown only in make mode):
  1. "**It helps you read and plan.** Ask about the book, or say what you'd like to make. Answers point to the passages
     they rest on and show the book's own words. It can plan something with you from the book, but it can't draft or
     make anything yet."
  2. "**It won't write the story for you.** No dialogue or narration: lines it plans with you are the book's own words
     or yours, exactly. When you make something, it may describe what a picture should show."
  3. "**Your messages go to Groq (not the Grok of X), or to Baseten when you make something.** Questions about the
     book go to Groq, which runs gpt-oss-120b, an open-weights model; when Groq is busy, through Vercel AI Gateway
     instead. Until you ask to make something, gpt-oss-120b first reads each message on its own, to tell a question
     from a request to make something. From then on, the conversation goes through Vercel AI Gateway to Baseten, which
     runs Kimi K3, an open-weights model by Moonshot AI; if Baseten isn't available, making is paused rather than sent
     elsewhere. All are set to keep nothing, and this app keeps no copy of your messages."
  4. "**Your questions are saved only on this device.** They are sent to Groq (or, when you make something, to Baseten)
     to be answered, and never published. Another device won't have them. The app records only how many you ask, and
     how many times you start making something (10 a day), and when, under your Farcaster ID, to count the daily
     limits. Cost records are kept without your ID."
- **About,** a second paragraph under "The reading assistant": "When you ask it to make something, the conversation
  goes instead through Vercel AI Gateway to Baseten, which runs Kimi K3 (Moonshot AI, open weights), with zero data
  retention required and no other provider allowed: if Baseten isn't available, making pauses. Making has its own daily
  limits: 10 conversations for you and a spending limit for the whole site."
- **Terms §8 (optional),** added: "When you ask the assistant to make something, each day is limited to 10 such
  conversations for you and to a spending limit for the whole site; when either is reached, making pauses until the
  next day, and questions about the book still work."

**Four quick choices** (defaults in brackets):
1. Who gets make mode: [everyone signed in with Farcaster] or only the agents allowlist (you, 6852, Garance).
2. Skip the routing call once a conversation is making: [yes].
3. The routing call is shown as "search" in the daily cost totals: [fine], or add a small migration for its own label.
4. Drafting tools for make mode next (the assistant as your agent; likely a migration): [yes, next].

**Send:** "e: reread, Terms yes/no, choices ok". It merges after c, and the switch goes on in the same release.

---

## f) The token items (about 1 min)

**What it unblocks:** the no-token branch (#73):
- the disclaimer line loses "· No token";
- About keeps only the credit fact;
- principle 7 is reworded.

There's no migration.

**Reread:**
- **Terms §2,** one sentence removed. After: "… It is not affiliated with or endorsed by the author. You can prepay for
  generations. Payments are final. Nothing else here is for sale."
- **Privacy §3.** After: "… and, on the website, your sign-in, which lasts about an hour (a day for a wallet sign-in),
  and a payment you have sent but not yet seen credited."

**Send:** "f: reread". It doesn't wait for anything else.

---

## Not in this sitting

- **Sign-in with Lens and Bluesky** (signin-lens-bluesky): its drafts are in the morning report. They're for a later
  sitting.
- **open-call's fal cleanup** (`open-call-0004`): it's for the open-call database, not snowmoon. Same three steps, when
  you want the bench restarted.
