# "Find a moment" in "Ask for help": one Privacy sentence (DRAFT, for the owner's reread)

**DRAFT.** Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-04, on branch `find-a-moment`
(built on `sheet-help`), from `docs/proposals/remix-moments.md` §5 and the owner's decisions of 2026-11-04 ("Find a
moment" ships with the 12 Nov release without attaching; the AI "why" kept as one line, labelled as AI, never in quote
marks, never stored). **Not in `src/lib/legal.ts`.** It goes in only after the owner says "reread", in the same pass as
"Ask for help"'s own lines (`docs/legal/sheet-help-draft.md`), and in the release that turns `SHEET_HELP.findMoment` on
(legal texts describe today, owner 2026-10-18).

`npm run check:principles` (**P6w**) fails if `SHEET_HELP.findMoment` is on while Privacy §5 doesn't name "Find a
moment", say it sends the passages found, name Groq, and say it counts as one of the "Ask for help" messages. Even with
the switch on, it waits for these words by itself (`findMomentLive`, `src/lib/sheet-help/flag.ts`, which also needs
"Ask for help" to be live).

Every "before" is main's `src/lib/legal.ts` at `26bf405`, word for word (unchanged since `17e2c63`, which
`sheet-help-draft.md` quotes). The "after" includes "Ask for help"'s draft words for the same section, marked
[sheet-help], so the two read together; the one new sentence is marked [new]. Nothing else changes.

---

## Privacy §5 (The assistant.): one sentence [new], after sheet-help's

**Before** (main):

> Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals, without your ID, to track our spending.

**After:**

> Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals, without your ID, to track our spending. [sheet-help] On a character sheet, 'Ask for help' sends your message, the sheet's prompt draft and recipe, and the character's facts from the book to Groq (or through Vercel AI Gateway when Groq is busy), set to keep nothing. We keep no copy of the conversation. We keep a fingerprint of each change it suggests to you (not the words themselves, and never your message), with your Farcaster ID and the sheet, for 2 days, so that if you publish that sheet with those words, its recipe says it includes words from AI suggestions. Under your Farcaster ID we also record how many messages you send and when, to count the daily limit; costs are kept as daily totals without your ID. [new] Its 'Find a moment' sends what you describe and the character you choose, with the passages found by searching the book and the furthest chapter you have opened (or that you chose to include later chapters), the same way, and counts as one of those messages; we keep nothing else about it.

**The new sentence alone** (for pasting):

> Its 'Find a moment' sends what you describe and the character you choose, with the passages found by searching the book and the furthest chapter you have opened (or that you chose to include later chapters), the same way, and counts as one of those messages; we keep nothing else about it.

## Why each part is there

- **"what you describe and the character you choose"**: the mood box and the character picker (`validateMoment`,
  `src/lib/sheet-help/find-moment.ts`).
- **"the passages found by searching the book"**: book search's results, the book's own text, are sent to the model to
  pick from. The search-terms step sends the mood and the character's name too; it is covered by "what you describe".
- **"the furthest chapter you have opened (or that you chose to include later chapters)"**: the chapter limit, sent as
  a number, or 32 with the switch on.
- **"the same way"**: to Groq, or through Vercel AI Gateway to Groq when Groq is busy, set to keep nothing, as the
  sheet-help sentence before it says. Same route and models; no new service.
- **"counts as one of those messages"**: one of the 20 a day under the FID (`reserveHelp`), its calls in the same daily
  cost totals. No new table, no migration.
- **"we keep nothing else about it"**: the mood, the picks and the AI's reasons are not stored. Nothing is served for
  the recipe label either (no `sheet_help_served` row): "Find a moment" adds no words to a prompt.

## Not changed, and why

- **§6 (What you publish) and Terms 6e:** nothing is published or attached ("Set in the book" waits until after
  22 Nov, owner 2026-11-04, with its own §4, §6 and 6e lines; `docs/proposals/remix-moments.md` §5).
- **§7 (outside services):** no new service; sheet-help's suggested §7 wording ("'Ask for help' messages") covers it.
- **§3 (kept on your device):** the furthest chapter "stays on your device", but the assistant and "Ask for help"
  already send it as a number for the search limit. The proposal's open question 7 (a clause saying so) is still the
  owner's call; this sentence says it for "Find a moment" itself.
- **The consent screen:** unchanged. Nothing the person writes is published.
