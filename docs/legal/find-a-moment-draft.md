# "Find a moment" in "Ask for help": its Privacy §5 words, and the widened §3 clause (reread 2026-11-04)

**Reread record: reviewed by the coordinator, approved by the owner, 2026-11-04** (reread pack items 1.2, 7 and 12,
approved as drafted). The words below are the drafts as approved; none was redrafted. They still go into
`src/lib/legal.ts` only in the release that turns "Ask for help" and "Find a moment" on (legal texts describe today).

**DRAFT, v2 (2026-11-04).** v2 takes the owner's own words for the sentence (2026-11-04), replacing the agent's
v1 draft; it still goes with "Ask for help"'s reread. Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-04, on branch `find-a-moment`
(built on `sheet-help`), from `docs/proposals/remix-moments.md` §5 and the owner's decisions of 2026-11-04 ("Find a
moment" ships with the 12 Nov release without attaching; the AI "why" kept as one line, labelled as AI, never in quote
marks, never stored). **Not in `src/lib/legal.ts`.** It goes in only after the owner says "reread", in the same pass as
"Ask for help"'s own lines (`docs/legal/sheet-help-draft.md`), and in the release that turns `SHEET_HELP.findMoment` on
(legal texts describe today, owner 2026-10-18).

`npm run check:principles` (**P6w**) fails if `SHEET_HELP.findMoment` is on while Privacy §5 doesn't carry the owner's
words below (naming "Find a moment", the furthest chapter, the passages book search found, the count and that nothing
else is kept) and Groq. Even with
the switch on, it waits for these words by itself (`findMomentLive`, `src/lib/sheet-help/flag.ts`, which also needs
"Ask for help" to be live).

Every "before" is main's `src/lib/legal.ts` at `26bf405`, word for word (unchanged since `17e2c63`, which
`sheet-help-draft.md` quotes). The "after" includes "Ask for help"'s draft words for the same section, marked
[sheet-help], so the two read together; the new words (the owner's, two sentences) are marked [new]. Nothing else changes.

---

## Privacy §5 (The assistant.): two sentences [new, the owner's words], after sheet-help's

**Before** (main):

> Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals, without your ID, to track our spending.

**After:**

> Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals, without your ID, to track our spending. [sheet-help] On a character sheet, 'Ask for help' sends your message, the sheet's prompt draft and recipe, and the character's facts from the book to Groq (or through Vercel AI Gateway when Groq is busy), set to keep nothing. We keep no copy of the conversation. We keep a fingerprint of each change it suggests to you (not the words themselves, and never your message), with your Farcaster ID and the sheet, for 2 days, so that if you publish that sheet with those words, its recipe says it includes words from AI suggestions. Under your Farcaster ID we also record how many messages you send and when, to count the daily limit; costs are kept as daily totals without your ID. [new] 'Find a moment' sends what you describe, the character you choose and the furthest chapter you've opened (or that you chose to include later chapters), with the passages book search found, the same way. Each search counts as one of those messages, and we keep nothing else about it.

**The new words alone** (for pasting; the owner's words, two sentences, kept as one block):

> 'Find a moment' sends what you describe, the character you choose and the furthest chapter you've opened (or that you chose to include later chapters), with the passages book search found, the same way. Each search counts as one of those messages, and we keep nothing else about it.

## Privacy §3 (Kept on your device only): the clause widened (reread pack 1.2, approved as recommended)

The owner's answer (2026-11-04, pack 1.2): when "Ask for help" and "Find a moment" ship, widen the clause from
`privacy-furthest-chapter` (pack item 1, which ships first). These are the pack's words as recommended, not redrafted.

**Before** (`privacy-furthest-chapter`'s §3 sentence, approved 2026-11-04, key `129tv6s` on that branch):

> These stay on your device, except that the assistant sends the furthest chapter, as a number (or another chapter you choose for a conversation), with each question and its search of the book, so that answers stay within it; it isn't kept.

**After:**

> These stay on your device, except that the assistant, and 'Ask for help' and 'Find a moment' on a character sheet, send the furthest chapter, as a number (or another chapter you choose for a conversation), with each question and its search of the book, so that answers stay within it; it isn't kept.

It goes into `legal.ts` with §5's lines, after `privacy-furthest-chapter` has merged. If Overlap A's other §3 phrases
(items 3 and 6) merge first, only this clause changes.

## Why each part is there

- **"what you describe, the character you choose"**: the mood box and the character picker (`validateMoment`,
  `src/lib/sheet-help/find-moment.ts`). The search-terms step sends the mood and the character's name too; it is
  covered by "what you describe" and "the character you choose".
- **"the furthest chapter you've opened (or that you chose to include later chapters)"**: the chapter limit, sent as a
  number; 32 only when the person turned on "Include chapters past Chapter N" for that search.
- **"with the passages book search found"**: `retrieve()`'s results within that limit, the book's own text, are sent to
  the model to pick from.
- **"the same way"**: to Groq, or through Vercel AI Gateway to Groq when Groq is busy, set to keep nothing, as the
  sheet-help sentences before it say. Same route and models; no new service.
- **"Each search counts as one of those messages"**: one of the 20 a day under the FID (`reserveHelp`), its calls in
  "Ask for help"'s daily cost totals (owner, 2026-11-04: costs count inside Ask for help's totals). No new table, no
  migration.
- **"we keep nothing else about it"**: the mood, the picks and the AI's reasons are not stored. Nothing is served for
  the recipe label either (no `sheet_help_served` row): "Find a moment" adds no words to a prompt.

`check:principles` P6w looks for these words in §5: "Find a moment", "the furthest chapter you've opened", "the
passages book search found", "counts as one of those messages" and "we keep nothing else about it", and Groq.

## Not changed, and why

- **§6 (What you publish) and Terms 6e:** nothing is published or attached ("Set in the book" waits until after
  22 Nov, owner 2026-11-04, with its own §4, §6 and 6e lines; `docs/proposals/remix-moments.md` §5).
- **§7 (outside services):** no new service; sheet-help's suggested §7 wording ("'Ask for help' messages") covers it.
- **The consent screen:** unchanged. Nothing the person writes is published.
