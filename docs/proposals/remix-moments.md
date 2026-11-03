# Remix moments: "Set in the book" and "Find a moment" (DRAFT)

Proposal by the coding agent (Claude, a closed model by Anthropic), 2026-11-03, on branch `remix-moments`, for the
owner. **DRAFT until the owner approves it. Proposal only: no code, no migration file, nothing applied.** No model was
called and nothing was spent; every cost below is from the site's own price table (`CHAT.prices`,
`src/lib/config.ts`). Production was not queried (nothing here needed it).

Read for this: main at `17e2c63`; `origin/sheet-help` at `9fe99e8` (`docs/proposals/sheet-help.md`,
`docs/legal/sheet-help-draft.md`, `src/lib/sheet-help/*`, `NEXT_sheet_help.sql`); `origin/deep-funding`
(`docs/proposals/challenge-record.md`).

## In one paragraph

A maker can say where in the book a version of their sheet is set: one passage, quoted word for word with its block
id. "Find a moment", a mode inside "Ask for help", helps them choose one: they describe a mood and a character, book
search finds candidates, the model picks 3 to 5 from those results only, and the server checks each quote is the
book's exact words before showing it. Tapping one attaches it to the version, or opens Make an image at that moment.
Quotes past where a reader has read are covered. **It needs a small migration** (the anchors table can't take it, see
1.1). A search costs about **$0.0012**, worst case **$0.0065**, and counts as one of "Ask for help"'s 20 messages and
against its $1 a day. **For 12 Nov:** "Find a moment" without attaching can ship with "Ask for help", if its one
Privacy sentence joins the same reread. "Set in the book" waits for its own migration and reread.

---

## 1. "Set in the book"

### What the maker sees

When publishing a version (sheet remixes first: character sheets, then places and styles), and later on the
version's page, there's an optional **"Set in the book"** row:

- empty: "Not set. Choose a passage · Find a moment".
- set: "Set in Chapter 9 · ¶ 14", the quote, "Read it in the book →", "Make an image here →", and for the maker
  "Change · Clear". If "Find a moment" suggested it: "Found with Find a moment (AI suggestions from book search)".

"Choose a passage" opens the book's own picker (the one `/references/new` uses: browse a chapter, tap a paragraph),
then the person picks one or more whole sentences of that block. A new version of the same sheet starts with the
previous version's passage filled in. The maker can keep it, change it or clear it.

**What it is not:** not part of the recipe (it isn't how the pictures were made), not a placement in the reader (the
sheet doesn't appear in the chapter), and not something that counts for anything in the challenge.

### 1.1 The anchors table: why not

`studio.anchors` (0001_core.sql, lines 136–145) is one row per version (`version_id` primary key), with `chapter`,
`start_idx`, `end_idx`. Images (`/api/images/publish`) and quote cards (`src/lib/cards.ts`) write it when they
publish, and the reader, the Pictures feed and the You page join it (all filtered to `element_type = 'image'`). It
doesn't fit, for three reasons, each enforced in the database:

1. **Design versions can't be anchored.** The trigger `studio.check_anchor_type` (0001) refuses any version that
   isn't text, image, render or clip; `test:db` checks it ("a design version cannot be anchored"). Build brief v4c,
   point 1: "Only text, image, render, and clip versions can be anchored; a design version cannot." An anchor means
   *placed in the book*: a take or the player shows that version over that block range. A sheet set at a moment isn't
   placed; it says where its maker pictures the character.
2. **Anchors are append-only and one per version.** `anchors_append_only` rejects any update or delete, and the
   primary key allows one row per version. The maker couldn't change or clear a passage without publishing a new
   version, and a new sheet version means new pictures.
3. **No room for the quote.** An anchor is a block range. "Find a moment" quotes whole sentences inside one block, and
   a range can't hold those.

Relaxing the trigger would change what "anchored" means for every reader of that table (takes, the player, admin
picks of a moment's image). A separate table is smaller and safer.

### 1.2 Migration: yes, one small table (sketch, no SQL file)

`supabase/migrations/NEXT_version_moments.sql`, numbered at merge. It follows `studio.admin_picks` (0030):
append-only, the latest row per version counts, and clearing is a row of its own.

**`studio.version_moments`**

| column | type | notes |
|---|---|---|
| `id` | bigint identity, primary key | |
| `version_id` | uuid, not null, references `studio.element_versions(id)` | |
| `work_id` | text, not null, references `studio.works(id)` | |
| `chapter`, `idx` | int, null when cleared | with `work_id`, a foreign key to `studio.text_blocks (work_id, chapter, idx)` (already unique), so the block exists |
| `quote` | text, null when cleared, 1–420 characters | the book's words, whole sentences of that block; 420 is `MAX_QUOTE` from `src/lib/quote.ts` |
| `block_hash` | text, null when cleared | `text_blocks.content_hash` when set, so a later re-ingest that changed the block is detectable |
| `found_with` | text, check in (`'self'`, `'find'`), null when cleared | whether the maker chose it or took a "Find a moment" suggestion (P2) |
| `cleared` | boolean, not null, default false | check: cleared rows have every passage column null, others have all of them |
| `set_by_fid` | bigint, not null | |
| `set_at` | timestamptz, not null, default now() | |

Index `(version_id, set_at desc)`.

**Rules in the database** (defence in depth: the app checks first):

- **Append-only:** `studio.reject_mutation()` on update, delete and truncate, as for anchors and links.
- **Maker only:** a trigger refuses a row unless `set_by_fid` is the `created_by_fid` of the version's element, and
  that element is a published design. Wallet accounts: the element's own creator id. A linked wallet's Farcaster
  account can't set it on the wallet's work (open question 6).
- **Exact words:** the same trigger refuses a row whose `quote` isn't a substring of its block's content with the
  speaker-colour span tags removed (`regexp_replace(content, '</?span[^>]*>', '', 'g')`, the rule
  `momentSource()` in `src/lib/home.ts` uses). Whole sentences are checked in the app (1.5), not in SQL.

**Privacy (who can read it):**

- RLS on. Public read policy for the *current* row only: the latest row of a version whose element is published,
  and not cleared. The passage is public on the version's page anyway.
- Earlier rows (changes, clears) are readable only by `studio_writer`, so the site can show the current one.
- `studio_writer`: select and insert only. anon and authenticated: select through the policy, no write.
- **What it holds about a person:** `set_by_fid`, which is always the maker, already public on the version.
  Nothing from "Find a moment" is kept: no mood, no message, no candidate list.

**Read-back** (CLAUDE.md's two-part form):

1. One read-only SELECT whose rows are all true:
   - the table exists with RLS on;
   - both triggers exist;
   - anon has no insert;
   - studio_writer has no update or delete;
   - anon's policy returns no cleared or superseded row.
2. One `do $$` block that:
   - picks a published character-sheet version and its maker;
   - inserts a realistic row: chapter 1, block 12, the sentence `HOME_MOMENTS` already quotes there, `found_with
     'find'`;
   - checks that it reads back;
   - checks the refusals: a row with one word changed, a row by another FID, and a row on an image version must each
     be refused;
   - checks that a delete is refused (append-only).

   It then ends in `raise exception` so everything rolls back. On an append-only table, the rollback stands in for
   the delete, and the refused delete is itself part of the test.

### 1.3 Who can set or change it

- **The maker only:** the person signed in as the element's `created_by_fid`, checked by the route
  (`POST /api/designs/version/moment`, `{ versionId, chapter, idx, quote, foundWith }` or `{ versionId, clear: true }`)
  and again by the trigger.
- Not admins, moderators or agents. A later agent tool, `set_moment`, would draft it for the person to confirm on
  their You page, like any agent draft.
- The maker can change it any time while the version is published. A hidden version's moment isn't shown and can't
  be changed.

### 1.4 Does it show publicly?

Yes, once the version is published:

- **The version page** (`/references/designs/[id]`) shows the chapter, the ¶ label and the quote, with the spoiler
  cover (section 3).
- **`/challenge` entries and the sheets lists** show the chapter only ("Ch 9"), never the quote. See the P5 tension
  in section 7.
- **The reader doesn't show it.** The sheet doesn't appear at that block. If it did, it would join that moment's
  images and the admin-pick switch (P5d), which is a separate decision (open question 3).

### 1.5 The exact-words check (shared with "Find a moment")

There is one function: `src/lib/moments/quote.ts`, `checkMomentQuote(block, quote)`. It takes the whole-sentence
logic out of `momentProblems()` in `src/lib/home.ts`, and home's P2i check then calls the shared function. The rules:

- the block's kind is paragraph or quote;
- the quote is found in `momentSource(content)` (speaker-colour span tags removed, nothing else changed: no quote
  marks normalised, no whitespace collapsed);
- it starts at the block's start or after a sentence end, and ends a sentence;
- it is at most 420 characters.

It runs on every write (the route re-reads the block from `studio.text_blocks` and never trusts the device's copy) and
on every "Find a moment" result before it's shown (2.3).

### 1.6 The challenge's fingerprint record: recommend **no**

The entries record (`snowmoon.challenge.entries/1`, deep-funding's `docs/proposals/challenge-record.md`) holds each
entry's picture and recipe fingerprints, maker FID, publish time and what it was built on. Leave the moment out:

- **It's not provenance.** The record says what an entry was made from. The book is already its implied root, and a
  moment is the maker's note about where the character is.
- **It can change.** The maker can change it after the close. A record that froze it would disagree with the page
  the next day.
- **Terms 6e and Privacy §4 list exactly what the record holds,** and both are live and reread. Adding a field
  means rewording them and re-running the record's dry run (its sha256 and CID are already published in the
  proposal).
- **The recipe fingerprint stays as it is.** `snowmoon.recipe/1` hashes the recipe as the page shows it, and the
  moment isn't part of the recipe, so nothing changes there.

If the owner wants it in later: a `set_in` field (`{ block, quote_sha256 }`, frozen at the close) in an
`entries/2` schema, with the Terms 6e and §4 wording changed in the same release.

---

## 2. "Find a moment," inside "Ask for help"

### 2.1 The flow

"Ask for help" (`src/components/sheet-help.tsx` on `sheet-help`) gets a second tab: **"Find a moment"**.

1. The person writes a mood or a situation (at most 200 characters, e.g. "tired after a long argument, trying to stay
   polite"). They pick a character: the sheet's character, chosen to start with, or another of the book's cast.
   There's also a switch, **"Include chapters past Chapter N"** (section 3), off.
2. The server checks `sheetHelpLive` and the new `SHEET_HELP.findMoment` switch, then takes one of the person's
   "Ask for help" messages (`reserveHelp`, section 4).
3. **Book search:** `retrieve()` (`src/lib/chat/retrieve.ts`) with the character's name plus the mood, its aliases
   expanded (`config/aliases.json`), limited to the person's chapter limit, 12 hits with their neighbours, paragraphs
   and quotes only. Mood words are rarely the book's own words, so first comes the coach's search-terms step
   (`config/prompts/chat-search-terms.md`, `CHAT.searchTerms`): a short model call that lists words a matching
   passage would use. Those are searched with the mood and never shown or kept.
4. **The pick:** the model gets those passages with their block ids and returns 3 to 5 lines, each
   `c<ch>-b<idx> | <the exact sentence or sentences> | <why, at most 20 words>`. Its own prompt:
   `config/prompts/find-moment.md`.
5. **The checks** (2.3). What passes is shown. Nothing is stored.
6. **Each result shows:**
   - the quote, set as the book's words (in `<q>`, with the ¶ label and "c9-b14");
   - below it, in the AI-note style with the "AI ⓘ" label, the model's "why";
   - three buttons: **"Set in the book"** (attach it to this version: section 1, `found_with 'find'`), **"Make an
     image here"** (opens `/references/new?chapter=9&start=14&end=14` in a new tab, so the sheet draft isn't lost),
     and **"Read it"** (the chapter at that block).

### 2.2 Picks only from search, or also a "why"?

**Recommendation: the model picks only from the search results, and also writes a short "why" (at most 20 words),
labelled as AI and kept apart from the quote.**

- **Picks only from search:** any id the model gives that wasn't in what it was sent is dropped (the `allowed` set,
  as `citations()` in `src/lib/sheet-help/help.ts` does). The quote's words must be the block's words (2.3). The
  model can't bring in a passage from memory, or from past the limit.
- **The "why"** is what makes a mood search useful ("she agrees out loud but her hands are still fists"). It is the
  model's words, so:
  - it is never inside quote marks or `<q>`, and never next to the quote without the "AI ⓘ" label;
  - it is never attached to the version and never stored: only the book's words are attached;
  - it passes `checkNote()` (no story text, `src/lib/sheet-help/no-story.ts`), the pronoun check, and the guard model
    (`gpt-oss-safeguard-20b`, failing closed);
  - **new:** it may not contain quote marks, or any run of 5 or more words that appears in a passage it was sent, so
    it can't pass the book's words off as its own, or its own as the book's.

  A "why" that fails is dropped and its quote is still shown, since the quote is the book's words and already
  checked.
- **Cheaper option:** picks only, no "why". No guard call is needed, so it costs about $0.0011 a search (section 4).
  Open question 1.

### 2.3 The exact-substring check: where it lives, how it's tested

**Where:**

- `checkMomentQuote()` in `src/lib/moments/quote.ts` (1.5), called by `src/lib/sheet-help/find-moment.ts` on each
  parsed line, before the response is built. A line is dropped unless:
  - its id was in the search results;
  - its chapter is within the limit;
  - its block is a paragraph or a quote;
  - its quote passes `checkMomentQuote` against the block's content as read from the database;
  - it isn't a repeat.
- The quote shown is the **database's** text cut at the checked offsets, not the model's string. Once the check has
  passed they are identical, so this only guards against a mistake in the check itself.
- If fewer than 3 survive: one retry with a reminder naming what failed. If there are still fewer than 3, the rest are
  filled with the top search hits' first whole sentence, labelled **"From search"** with no "why" (no model words).
- On "Set in the book" the device sends the block and the quote back. The set route checks again (1.5), and so does
  the trigger (1.2).

**Tests:** `scripts/test-remix-moments.ts` (`npm run test:remix-moments`).

- It runs on PGlite with main's migrations plus `NEXT_sheet_help` and `NEXT_version_moments`, with **recorded model
  answers only** (a stand-in `complete`, as `test:sheet-help` does). No model is called.
- **Planted cases,** each of which must be dropped or refused:
  - one word changed;
  - straight quotes where the book has curly ones;
  - a quote that runs across two blocks;
  - half a sentence;
  - an id that wasn't in the search results;
  - a block from Chapter 30 when the limit is 5;
  - a heading block;
  - a "why" that contains six words from a passage;
  - a "why" in quote marks;
  - a "why" with a story line.
- **Must pass:** a real sentence of c1-b12, the case where speaker-colour spans are removed, and the "From search"
  fill.
- The set route's tests: a non-maker refused, a cleared row, the latest row winning, a hidden version refused.

---

## 3. Spoilers

The rules already on the site:

- **The reader's furthest chapter is kept on the device only** (Privacy §3; `snowmoon.read-to`, read with
  `openedChapters()` in `src/lib/chat/device.ts`).
- **What's past it is covered** with a count and "Show anyway": the glossary, the Pictures feed, the sheet's "What the
  book says" (`src/components/design-book.tsx`). Until the device has been read, and in the server's HTML, the limit
  is Chapter 1.
- **The assistant and "Ask for help"** send that number with each request as the search limit, and the server never
  searches past it (`retrieve()`'s `chapter <= $3`).

### 3.1 Show the chapter

The chapter number is shown to everyone: "Set in Chapter 9". On `/challenge` and in the sheets lists, the chapter is
all that's shown. A chapter number alone gives away little; open question 4 asks whether even that is too much for
late chapters.

### 3.2 Cover the quote for a reader who hasn't reached it

**How "reached" is known for someone who isn't the maker:** the same way as everywhere else. The server doesn't know,
and must not learn it. The viewer's own device decides.

- The version page's server HTML renders the moment covered: "Set in Chapter 9 · past where you've read · Show
  anyway". The quote isn't in the HTML text. It's in the page's data, as the glossary's and the feed's later
  chapters are.
- After hydration, if `max(openedChapters()) >= chapter`, the quote shows. Otherwise it stays covered until "Show
  anyway", which reveals that one quote for that view only and isn't remembered.
- The maker gets the same rule. They've seen it, but they may be on another device.

### 3.3 "Find a moment" stays within the person's furthest chapter unless they opt in

- **The limit** is the device's furthest chapter, sent as a number (as the assistant and "Ask for help" already do)
  and clamped to 1–32 on the server.
- **Unlike "Ask for help"'s prompt help, there's no floor at the character's first chapter.** `validateHelp()` raises
  `upTo` to the character's first chapter; for a moment search that would serve passages the person hasn't read. If
  the limit is below the character's first chapter, the panel says "Mu first appears in Chapter 14, past where
  you've read", with the opt-in.
- **The opt-in lives in the "Find a moment" panel** as the switch "Include chapters past Chapter N". When it's on, the
  request carries `pastLimit: true` and the limit becomes 32.
- **It isn't remembered:** off each time the panel opens, kept only in the open page (like "Ask for help"'s
  conversation), never in localStorage and never on the server. A spoiler choice is better made each time. Open
  question 5 offers "remember on this device" instead.
- Results past the person's furthest chapter are marked "Past where you've read". Their quotes are shown, since they
  asked.
- If later chapters matched better (`heldBack` from `retrieve()`), the panel says "Better matches may be in later
  chapters" with the switch beside it, as the assistant does.

---

## 4. Cost per search

The site's prices: gpt-oss-120b $0.15 in and $0.60 out per million tokens; gpt-oss-safeguard-20b $0.075 and $0.30.

The book's paragraphs average 160 characters, about 40 tokens (4,021 paragraph and quote blocks). Twelve hits with
two neighbours on each side come to at most 60 blocks, about 2,400 tokens, plus the prompt and the character's facts.

| Call | Typical tokens (in / out) | Typical | Worst tokens (in / out) | Worst |
|---|---|---|---|---|
| Search terms (gpt-oss-120b) | 800 / 150 | $0.00021 | 1,000 / 300 | $0.00033 |
| The pick (gpt-oss-120b) | 4,000 / 450 | $0.00087 | 9,000 / 900, **twice** (the retry) | $0.00378 |
| Guard on the "why" (safeguard-20b) | 1,200 / 150 | $0.00014 | 2,000 / 1,500, **4 times** (2 per reply, fails closed) | $0.00240 |
| **A search** | | **≈ $0.0012** | | **≈ $0.0065** |

- **Picks only (no "why"):** no guard, about $0.0011 typical and $0.0041 worst.
- **Reserved before the first call:** `worstCaseUsd(2100, 6000, 19000)` (`src/lib/chat/limits.ts`) = $0.0073. That's
  at least the worst case above, because the formula also counts the full input for the guard.
- **Per person:** 20 searches a day at the worst case is $0.13. **Site-wide:** $1 covers about 830 typical searches.
- **Noticed while reading:** `sheet-help.md` gives a reserved worst case of "about $0.003", but the code reserves
  `helpWorstUsd()` = `worstCaseUsd(1200, 6000, 20000)` = **$0.0070**. The code is the safe side; the proposal's table
  is out of date.

**Counting: recommend it counts toward "Ask for help"'s own limits, not a new count.**

- One search is one of the 20 messages a day (`studio.sheet_help_calls`), and its calls add to
  `studio.sheet_help_costs` under the same $1 a day.
- It is a mode of "Ask for help", the owner's caps were set for "Ask for help", and a second pair of caps would need
  more tables and a second Privacy line about counting.
- Its calls are recorded as kind `'answer'` (the search-terms and pick calls) and `'guard'`, which
  `NEXT_sheet_help.sql` already allows. **No change to the sheet-help migration.**
- If the owner wants to see the cost of "Find a moment" separately: add `'moment'` to that table's `kind` check
  before it's applied, since it's still unnumbered (open question 2).

---

## 5. Privacy and Terms (drafts, for the owner's reread)

Every **before** is main's `src/lib/legal.ts` at `17e2c63`, word for word. Where "Ask for help"'s own draft
(`docs/legal/sheet-help-draft.md`) adds to the same section, the **after** includes its words, marked [sheet-help], so
the two read together. New words are marked [new]. Nothing else changes.

**What's sent where:**

- **"Find a moment" sends** the mood and character the person wrote, the passages book search found (the book's
  text), the character's facts from the book, and the chapter limit, to Groq (or through Vercel AI Gateway when Groq is
  busy), set to keep nothing. It's the same route and models as "Ask for help", and no new service.
- **Nothing is kept** except one count under the FID and the daily cost totals: "Ask for help"'s.
- **What's kept from "Set in the book":** the passage (chapter, block, the quoted words), whether "Find a moment"
  suggested it, who set it (the maker) and when. The current one is public with the version, and earlier ones are
  kept by us and not shown.

### Privacy §5 (The assistant.): one sentence [new], after sheet-help's

**Before:**

> Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals, without your ID, to track our spending.

**After:**

> Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals, without your ID, to track our spending. [sheet-help] On a character sheet, 'Ask for help' sends your message, the sheet's prompt draft and recipe, and the character's facts from the book to Groq (or through Vercel AI Gateway when Groq is busy), set to keep nothing. We keep no copy of the conversation. Under your Farcaster ID we record only how many messages you send and when, to count the daily limit; costs are kept as daily totals without your ID. [new] Its 'Find a moment' sends what you describe, the passages found by searching the book, and the furthest chapter you have opened (or that you chose to include later chapters) the same way, and counts as one of those messages; we keep nothing else about it.

### Privacy §4 (Kept by us when you sign in.): the character-sheets item, one sentence [new]

Only needed when "Set in the book" ships.

**Before:**

> Character sheets you publish, with their text, their views, your name and the record of how each view was made. These are public. During the remix challenge, anyone who passes the same check as making images can publish a remix of its characters' sheets.

**After:**

> Character sheets you publish, with their text, their views, your name and the record of how each view was made. These are public. [new] If you set a version in the book, the passage you chose (its chapter, its place and the book's words you quoted), and whether 'Find a moment' suggested it, are kept with it and shown on its page; you can change or clear it, and we keep your earlier choices without showing them. During the remix challenge, anyone who passes the same check as making images can publish a remix of its characters' sheets.

### Privacy §6 (What you publish.): one sentence [new], after sheet-help's

**Before** (main's §6, ending):

> … During the remix challenge, a version of one of its characters that you publish may be shown as your entry, on its page and on the challenge page.

**After:**

> … During the remix challenge, a version of one of its characters that you publish may be shown as your entry, on its page and on the challenge page. [sheet-help] If you publish a sheet whose prompt includes words you accepted from 'Ask for help', its recipe says it includes words from AI suggestions. [new] If you set a version in the book, the chapter is shown with it wherever it is listed, and the passage on its page, covered for readers who haven't reached that chapter until they choose to see it.

(The "…" stands for main's §6 text before it, unchanged, quoted in full in `docs/legal/sheet-help-draft.md`.)

### Terms §6e (The remix challenge.): one sentence [new], after sheet-help's

Needed only when "Set in the book" ships during the challenge. It follows the recommendation in 1.6 (not in the
record).

**Before** (main's 6e, ending):

> … Anything that follows the challenge, including any mint, is a plan, not a promise, and is decided as the challenge page says. We may change or end the challenge, and the page will say so.

**After:**

> … Anything that follows the challenge, including any mint, is a plan, not a promise, and is decided as the challenge page says. We may change or end the challenge, and the page will say so. [sheet-help] 'Ask for help' is optional; entries are judged the same either way. [new] Setting a version in the book is optional too; it isn't part of the record and doesn't change whether a version counts or how it is judged.

### Not changed, and why

- **§7 (outside services):** no new service. "Ask for help"'s draft already suggests adding "'Ask for help' messages"
  to the Groq item, and "Find a moment" falls under that.
- **§3 (kept on your device):** it says the furthest chapter "stay[s] on your device". The assistant and "Ask for
  help" already send it as a number with each request, for the search limit, and "Find a moment" does the same.
  The words don't say so. Open question 7 suggests a clause: "…the furthest chapter you have opened (sent as a number
  with a question to the assistant or 'Ask for help', so answers stay within it)…".
- **The consent screen:** unchanged. Setting a moment publishes the book's words and the maker's choice, nothing the
  person wrote.

---

## 6. How it fits the 12 Nov "Ask for help" release

**Could ship with it, if the owner wants and it's ready by about Mon 9 Nov:**

- "Find a moment" as a tab of "Ask for help", with **"Make an image here"** and **"Read it"** but **not "Set in the
  book"**.
- It stores nothing new and needs no migration of its own. It uses `NEXT_sheet_help`'s count and cost tables
  unchanged.
- Its only legal change is the one §5 sentence above, which goes into the same reread pack as "Ask for help"'s §5,
  §6 and 6e lines.
- Behind its own switch, `SHEET_HELP.findMoment`, off, so "Ask for help" can go live without it if the build or the
  reread isn't ready. P6r is extended (section 7).

**Must wait:**

- **"Set in the book":** attaching, the version page row, the `/challenge` chapter tag and the spoiler cover. It
  needs `NEXT_version_moments` written, tested and applied, its §4 and §6 sentences and 6e reread, and live checks.
- Two migrations and two legal changes in one release, nine days out, with "Ask for help"'s own migration still
  unapplied, is more risk than the halfway post needs.
- **Suggested target:** a release after 12 Nov and before entries close (Sun 22 Nov), so remixes made in the second
  half can be set in the book. Or after the challenge, if the owner prefers to change nothing mid-challenge.

**Dependencies:**

- **Sheet-help's migration** (`NEXT_sheet_help.sql`, not applied) is needed for the count. "Find a moment" can't go
  live before it.
- **Sheet-help's reread** (Privacy §5, §6, Terms 6e): "Find a moment"'s §5 sentence is read in the same pass, and
  `sheetHelpLive` stays the gate.
- **Agent-pictures part 2** (per-phrase marking): **not needed.** "Find a moment" adds no words to a prompt. If the
  person then asks "Ask for help" to change a prompt part to fit the moment, that's an ordinary accepted suggestion
  and is marked as sheet-help already marks one.
- **The challenge record** (`deep-funding`): nothing, if 1.6's "no" is accepted.
- **`NEXT_version_moments`:** only for "Set in the book". It requires 0001 only and is independent of sheet-help's
  migration.

---

## 7. Principle checks

### P2: AI declared; the book never altered; nothing generated passed off as the author's

- **Existing checks that apply:**
  - `P2a`: the text is unaltered, so a quote checked against a block is a quote of the book.
  - `P2i`: home moments are whole sentences, verbatim. Its function becomes the shared `checkMomentQuote`, and the
    proof (one word changed) carries over.
  - `P2b`: the "AI ⓘ" label.
- **New `P2k`:** every current `version_moments` row (read on the live database as `studio_writer`, read-only) passes
  `checkMomentQuote` against its block, and its `block_hash` is the block's current `content_hash`.
  - *Planted violation:* a fixture row with one word changed in the quote (the trigger is bypassed as postgres in the
    fixture); a row whose `block_hash` is stale.
- **New `P2l`:** "Find a moment"'s model words never sit where they could be taken for the book's:
  - in `test:remix-moments`, every result's `why` is outside the quote element, carries the AI label, has no quote
    marks and shares no 5-word run with any passage;
  - a version page with `found_with 'find'` shows "Found with Find a moment (AI suggestions from book search)".
  - *Planted violation:* a recorded answer whose why is `"She could not stop smiling"` in quote marks; a recorded
    answer whose why copies six words of c1-b12; a render that puts the why inside `<q>`.
- **Tension:** none in substance. "Found with Find a moment" declares that a model helped choose the passage, even
  though every word shown is the book's. That's stricter than P2 strictly needs, and the owner may find it too much
  (open question 8).

### P5: nothing featured; owners, not votes

- **Existing checks that apply:**
  - `P5a`: no canon, official or featured field; `version_moments` has none.
  - `P5g` (pending): `/challenge` is in time order only.
  - `P5e`: nothing reads `admin_picks` outside the pick code.
- **New `P5h`:** no code orders, filters or counts `/challenge` entries or the sheets lists by whether a version has a
  moment, or by its chapter. The chapter tag is shown the same way on every entry that has one, and no "Set in the
  book" badge, count or filter appears.
  - *Planted violation:* a `.sort()` in `src/lib/challenge/` that reads `moment`; a "with a moment only" filter in
    the challenge page.
- **Tension, flagged:**
  - A chapter tag on `/challenge` entries could read as a mark of a better or more serious entry ("this one's set in
    the book"), and a cluster of tags on one chapter could look like an official moment.
  - **Recommendation:** show the tag only on the version's own page for the challenge's duration, and on
    `/challenge` only after entries close; or show it on `/challenge` as plain text ("Ch 9"), never styled as a badge.
    Owner's call (open question 4).
  - The reader is a bigger version of the same tension. If set sheets appeared at their block, they'd join that
    moment's image list and the admin-pick switch. That's left out here (1.4, open question 3).

### P6: privacy; no third parties

- **Existing checks that apply:**
  - `P6a`: no third-party requests. The panel calls only the site's own route.
  - `P6b`: the private-table list is unchanged; `version_moments` is public by design and holds only the maker's
    FID, already public.
  - `P6g`–`P6i`: services named consistently. No new service.
  - `P6r` (pending): "Ask for help" is on only while §5 and §6 describe it.
- **Extend `P6r`:** `SHEET_HELP.findMoment` on fails unless Privacy §5 contains "Find a moment" and says what it
  sends.
  - *Planted violation:* the switch on with main's §5.
- **New `P6s`** (only when "Set in the book" ships): "Set in the book" is on only while Privacy §4 says the passage is
  kept and shown. The read-back proves anon sees only current rows.
  - *Planted violation:* the switch on with §4 unchanged; a fixture where anon reads a superseded row.
- **In `test:remix-moments`:** no table gains a column that holds the mood or the message.
  `studio.sheet_help_calls` keeps exactly `fid, at`.
  - *Planted violation:* a fixture migration that adds `message text`.
- **Tension:** §3's words versus the chapter number sent as a search limit (section 5, open question 7). Not new, but
  "Find a moment" makes it more visible.

### Spoilers

- **Existing checks:** none checks the chapter limit directly. `test:chat` covers `retrieve()`'s limit; the glossary
  and feed covers are UI conventions.
- **New `SPa`** (in `test:remix-moments`):
  - "Find a moment" never returns a block past the limit unless `pastLimit` is true;
  - the limit is clamped to 1–32;
  - there's no floor at the character's first chapter.
  - *Planted violation:* a recorded answer naming c30-b5 with limit 5; a request with `upTo: 99`; a stand-in
    `validateHelp`-style floor that raises the limit.
- **New `SPb`** (in `check:ui`, against a target with a fixture version set in Chapter 20): the version page's served
  HTML text doesn't contain the quote, and the cover says "Chapter 20" and "Show anyway". The quote appears only after
  "Show anyway" on a fresh device.
  - *Planted violation:* render the quote in the server HTML.
- **Tension:** the chapter number is shown uncovered (by the brief). See open question 4.

---

## 8. Open questions for the owner

1. "Find a moment" picks plus a 20-word AI "why" (about $0.0012), or picks only (about $0.0011, no guard)?
2. Count its cost inside "Ask for help"'s totals (recommended), or add a `'moment'` kind to `NEXT_sheet_help.sql`
   before it's applied?
3. Should a sheet set in the book ever appear in the reader at its block, joining that moment's images and the pick
   switch? (Recommended: not in this slice.)
4. The chapter tag on `/challenge` entries: plain "Ch 9" during the challenge, only after entries close, or not at
   all? Is a late chapter's number itself too much of a spoiler?
5. The "Include later chapters" switch: off every time (recommended), or remembered on the device?
6. May a linked wallet's Farcaster account set the moment on work made with that wallet?
7. Add the §3 clause saying the furthest chapter is sent as a number with assistant and "Ask for help" requests?
8. Keep the "Found with Find a moment" label on a version's moment, or show only the book's words?
9. Ship "Find a moment" (without attaching) on 12 Nov, or hold all of it for one later release?
10. "Set in the book": a release before 22 Nov, or after the challenge?
11. The moment in the challenge record: no (recommended), or an `entries/2` field frozen at the close?
12. After sheets: places and styles too, and later Remix frames (which already belong to a chapter's scene)?
