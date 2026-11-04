# Privacy §3: the furthest chapter, sent with assistant questions (DRAFT)

Drafted by the coding agent (Claude, a closed model by Anthropic), DRAFT. Not reread by the owner.

Branch `privacy-furthest-chapter`, 2026-11-04. The owner's request (2026-11-04): "Privacy §3 is wrong today: the
assistant already sends the furthest chapter as a number. Fix it on main now, separately. Draft one clause for my OK
saying it's sent as a number with questions and searches, so that answers stay within it, and that it isn't kept."

The change is already made in `src/lib/legal.ts` on this branch. Main (wallet-fid-link, reread 2026-11-04) was merged
in on 2026-11-04; main's words win everywhere else. `LEGAL.ownerReread.privacy` stays at main's words (`1wgu7z`, reread
2026-11-04) until the owner says "reread". The new words' key, for the clause as drafted on top of main, is **`129tv6s`**
(Terms unchanged at `15lsr9u`). The earlier key `1ruixoi` was computed on the words before wallet-fid-link and is stale.
Until the reread, check:principles' P6k fails on this branch, as it should. On the reread: set `ownerReread.privacy` to
`{ words: '129tv6s', on: <day>, by: 'FID 6786' }` and `LEGAL.effective` to the merge day. If main's Privacy words change
again before then, the key has to be recomputed.

The owner's answer on the parenthesis (2026-11-04, reread pack item 1.1): keep it.

## Privacy §3 (Kept on your device only): one clause added

Before (word for word, main at 70d36ef; §3 is unchanged since 233f5e0):
> Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark
> setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its
> answers, drafts of images you make until you publish them, a few other settings of yours, and, on the website, your
> sign-in, which lasts about an hour (a day for a wallet sign-in), and a payment you have sent but not yet seen
> credited. These stay on your device. Clearing your browser's site data removes them. Frames you make in Remix are not
> drafts: they are saved by us as soon as they are made (section 4). So are the frames and video tests your agent makes
> when you approve them, but privately: only you can see them (section 4).

After (only the sentence "These stay on your device." changes):
> … and a payment you have sent but not yet seen credited. These stay on your device, except that the assistant sends
> the furthest chapter, as a number (or another chapter you choose for a conversation), with each question and its
> search of the book, so that answers stay within it; it isn't kept. Clearing your browser's site data removes them. …

The clause on its own:
> except that the assistant sends the furthest chapter, as a number (or another chapter you choose for a conversation),
> with each question and its search of the book, so that answers stay within it; it isn't kept.

Why the parenthesis: the number sent is the conversation's chapter limit. It starts at the furthest chapter opened
(or the chapter a conversation is started from, if later), and the reader can pick any chapter 1–32 for it. Without the
parenthesis the clause is true for the default but not when a reader picks another chapter. The owner chose to keep it.

The heading "Kept on your device only." is unchanged; the clause names the one exception.

## Evidence: where the furthest chapter leaves the device

Stored on the device:
- `src/lib/chat/device.ts:36` key `snowmoon.read-to`; `:55–58` `readTo()`; `:62–63` `recordChapterOpened` raises it.
- `src/lib/chat/device.ts:95–97` `newThread(limit, …)` saves the conversation (thread) with that limit, on the device.

Set as a conversation's limit:
- `src/components/assistant.tsx:588` a new conversation: `newThread(readTo())`.
- `src/components/assistant.tsx:551–552` a conversation started from a block or a chapter: `Math.max(readTo(), ch)`.
- `src/components/assistant.tsx:393–400` the reader can change it ("Chapters this thread may use", 1–32).

Sent:
- `src/components/assistant.tsx:365–369` `POST /api/chat/ask` with body `{ question, limit, attached, history }`. This
  is the only request that carries it.

Used on the server, in memory only, for that one request:
- `src/app/api/chat/ask/route.ts:23–35` passes the body to `ask()`.
- `src/lib/chat/ask.ts:86–91` checks it is 1–32 and that attached blocks are within it.
- `src/lib/chat/ask.ts:109` and `src/lib/chat/glossary.ts:95,102` glossary words: filtered by it in code (the database
  query at `glossary.ts:88–91` doesn't receive it).
- `src/lib/chat/ask.ts:117` and `src/lib/chat/retrieve.ts:109–110,125` the search of the book: a query parameter (`$3`)
  to the database (Supabase), read-only (`select … where chapter <= $3`, and `chapter > $3` for "held back").
- `src/lib/chat/retrieve.ts:150–151`, `ask.ts:144,231` the cited blocks: filtered by it.
- `src/lib/chat/ask.ts:125,127` sent to the answering model (Groq, or through Vercel AI Gateway) in the system prompt
  (`{{LIMIT}}` in `config/prompts/chat-ask.md:9`) and as "Passages from chapters 1–N". Privacy §5 already says Groq and
  the Gateway are set to keep nothing. The search-words call (`ask.ts:209–216`), the guard (`ask.ts:186–193`) and the
  support check (`ask.ts:240–246`) don't receive the number.

Not sent anywhere else:
- `/api/chat/status` (`assistant.tsx:510`) has no body. `/api/book/block?id=` (`assistant.tsx:125`) sends a block id
  the reader attached, not the limit.
- "Make an image" search (`src/components/image-create.tsx:201`, `src/lib/book-search.ts:5–9`) fetches the whole book
  and searches on the device; the furthest chapter only hides later chapters there, on the device
  (`image-create.tsx:46–47`).
- The glossary, references, design sheets and design book (`glossary.tsx:29`, `reference-cards.tsx:18`,
  `design-sheets.tsx:98`, `design-book.tsx:17`) use it on the device only.
- Agents (`search_book`, `src/lib/agent/tools.ts:98–106`) have no device record; their `limit` is a result count.
- "Make your own" (`src/lib/make/draft.ts:26,73`) sends and keeps a chapter the person picks in the draft (default 32),
  not the furthest chapter. Its draft is covered by §4.

## Evidence: it isn't kept

- `studio.chat_calls` (`supabase/migrations/0007_chat_costs_without_person.sql:74–87`): fid, at, kind, model, plus
  columns forced empty by checks. No chapter. Written at `src/lib/chat/limits.ts:44` with fid, kind and model only.
- `studio.chat_costs` (`0007:47`, written at `limits.ts:61–67`): daily totals by kind, model, provider, verdict. No
  chapter. No later migration adds a column to either table.
- Logs: `src/app/api/chat/ask/route.ts:42` and `src/app/api/chat/status/route.ts:30` log only the error's code or name.
  `src/lib/chat/` has no other `console.*`; `src/lib/chat/model.ts` logs nothing.
- The reply returns no limit to keep; the device keeps the thread, as §3 already says.

Not checked: Vercel's own request logs (they record the path, not request bodies) and the providers' settings beyond
what §5 and §7 already state.
