# The assistant uses the whole book: lines for the owner's reread

Written by the coding agent (Claude, a closed model by Anthropic) on 2026-11-17 for branch `chat-summaries`.
**Reread by the owner on 2026-11-17.** Privacy §3 ships in the owner's own words (below). The notes line (4a) is approved
as drafted. The other new lines (4b, 4c) are the coding agent's DRAFT wording.

The owner's decision (2026-11-17, item 0): "Spoilers no longer matter. The assistant uses the whole book for every
question." The branch removes the assistant's chapter limit. It keeps the reader's chapter only as a hint for "where was I".

## 1. Privacy §3 (legal text: needs "reread")

`src/lib/legal.ts`, Privacy item 3, "Kept on your device only." The branch leaves this text unchanged until the reread.
With the branch merged as it is, the current sentence would no longer be true.

**Current:**

> These stay on your device, except that the assistant sends the furthest chapter, as a number (or another chapter you
> choose for a conversation), with each question and its search of the book, so that answers stay within it; it isn't kept.

**Proposed by the coding agent:**

> These stay on your device, except that the assistant sends the chapter you opened last, as a number, with each
> question, so it can answer "where was I"; it isn't kept.

**Reread by the owner (2026-11-17), exactly, as shipped:**

> These stay on your device, except that the assistant sends the chapter you're reading, as a number, with each
> question, so it can answer “where was I”; it isn't kept.

Why: the branch sends `position` (the chapter opened last on this device, or the furthest opened when no last one is
recorded) with every question. The server uses it only for "where was I / recap / what's happened so far", and keeps
nothing. Nothing else in §3 changes ("the furthest chapter you have opened" is still stored on the device).

## 2. Principle 9

Retired on main (#182, b52b185e) before this branch merged, so no exception is needed.

## 3. The assistant's screen (owner's words, removed as item 0 asks)

These are the owner's wording (`src/components/assistant.tsx`, `data-wording` = the owner). The branch removes them:

| Where | Current words | On the branch |
|---|---|---|
| Thread header | "Answering from ch 1–{n}, what you've read" / "…, by your choice", with an "Up to ch n" picker | Removed |
| Answer, held back | "More in later chapters" · "A fuller answer uses chapters after {n}." · Show it / Keep it hidden | Removed |
| Held-back reply | "Held back · needs chapters after {n}" · "Up to chapter {n}, the book doesn't say. A fuller answer uses later chapters." | Removed (see 4c for old threads) |
| "The passages don't say" | "…Try asking another way, or include more chapters." · "Later chapters may say more." | "…Try asking another way." |
| Thread list | "ch 1–{n} · {date}" | "{date}" |

## 4. New wording on the branch (DRAFT, coding agent)

a. **The notes line** (approved by the owner as drafted, 2026-11-17) under an answer that cites a reviewed note (`src/lib/chat/notes.ts`, `NOTE_WORDING`; item 3). It
uses the AI label the chapter summaries carry ("AI summary · written by an AI model, Claude, not by the author, and
checked against the book by AI."):

- Chapter summaries: "Uses the chapter summaries · AI summary, written by an AI model, Claude, not by the author, and
  checked against the book by AI."
- Learn more, an approved agent draft (Gladias, Bai, Seila, Deluin, Mu, Ephelion): "Uses "Learn more about Bai" ·
  written by an AI model, Claude, not by the author, and approved by the site's owner."
- Learn more, the owner's own (Zei): "Uses "Learn more about Zei" · written by the site's owner, not by the author."

b. **"Where was I" with no chapter known**: "Assistant · which chapter?" · "Which chapter are you on? Pick it and the
assistant recaps it and the two before it." · a "Chapter n" picker · **Recap**.

c. **An old thread's held-back reply** (saved on a device before this change): "Assistant · the passages don't say" ·
"Ask again: the assistant now uses the whole book."

## 5. Unchanged: the notice, and spoiler lines elsewhere

- **The first-time notice** ("What the assistant does", `src/lib/chat/notice.ts`) says nothing about chapters. Its
  words are unchanged; the coding agent rereads it for the new fingerprint (P6e).
- **/about** has no chat line about chapters.
- **Not the assistant, so left as they are:**
  - the chapter page's summary: "Chapter n in brief · spoilers for this chapter", and "…Nothing from later chapters.";
  - the glossary: "No sentence up to where you've read explains this word.";
  - Make an image: "past where you've read", "What the book says · from the chapters you've read";
  - the Minpentai kit's Spoilers section.

  Tell me if any of them should change too.
