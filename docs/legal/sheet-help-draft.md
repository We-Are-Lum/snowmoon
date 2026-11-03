# "Ask for help" beside the sheet prompt box: Privacy and Terms lines (DRAFT, for the owner's reread)

**DRAFT.** Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-02, on branch `sheet-help`, from
the lines the owner approved in `docs/proposals/sheet-help.md` (2026-10-31). **Not in `src/lib/legal.ts`.** They go in
there only after the owner says "reread", in the same release that switches `SHEET_HELP.on` on (legal texts describe
today, owner 2026-10-18).

`npm run check:principles` (P6r) fails if `SHEET_HELP.on` is on while Privacy §5 doesn't say what "Ask for help"
sends (naming Groq) and keeps (including "for 2 days", the served suggestions' window), or §6 doesn't say the recipe
shows it. Even with the switch on, the feature waits for
these words by itself (`sheetHelpLive`, `src/lib/sheet-help/flag.ts`, which looks for "Ask for help" in §5 and §6), and
for the challenge's entry window.

Recipe marking: agent-pictures part 2 has not merged into main (checked 2026-11-02), so §6 uses the proposal's
"without per-phrase marking" wording: the recipe says the prompt *includes words from AI suggestions*. If per-phrase
marking ships before this goes live, §6 takes the proposal's other wording ("…its recipe shows which words those are").

Every "before" below is main's `src/lib/legal.ts` at `17e2c63` (Privacy and Terms effective as main has them), word for
word. Each "after" is the same text with the new words added at the end; nothing else changes.

---

## Privacy §5 (The assistant.): four new sentences, at the end

Revised 2026-11-03 for the owner's decision that the server, not the browser, sets the recipe's label: the third
sentence (the fingerprints kept for 2 days, `SHEET_HELP.servedDays`) is new, and "we record only" became "we also
record", since the count is no longer the only thing kept under your ID.

**Before:**

> Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals, without your ID, to track our spending.

**After:**

> Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals, without your ID, to track our spending. On a character sheet, 'Ask for help' sends your message, the sheet's prompt draft and recipe, and the character's facts from the book to Groq (or through Vercel AI Gateway when Groq is busy), set to keep nothing. We keep no copy of the conversation. We keep a fingerprint of each change it suggests to you (not the words themselves, and never your message), with your Farcaster ID and the sheet, for 2 days, so that if you publish that sheet with those words, its recipe says it includes words from AI suggestions. Under your Farcaster ID we also record how many messages you send and when, to count the daily limit; costs are kept as daily totals without your ID.

## Privacy §6 (What you publish.): one sentence, at the end

**Before:**

> Anything you publish, and every frame you make in Remix, is public, shown with your name (your Farcaster name, or, for a wallet account, its address shortened; your Farcaster ID on quote cards), the date, and the record of how it was made. If you link a wallet to your Farcaster account, what you made with the wallet, before and after linking, is shown under your Farcaster name, so anyone can see that the two are yours; if you unlink it, that work is shown with the wallet's address again. See the Terms, sections 5 and 7. If you share a Minpentai win, your own Farcaster or X app posts it; its link carries only the opponent you beat and the number of steps, its card is drawn from that link, and we keep nothing about it. If you share a Minpentai challenge from a Farcaster cast, your Farcaster app posts it; its link carries the match's start (its random seed, the computer level and the extra rule) and your result (how and at which step it ended, how many towers were left and how many taps you used). It does not carry your moves or your Farcaster ID, though anyone who opens the link can read what it does carry. Its card is drawn from that link, and we keep nothing about it. During the remix challenge, a version of one of its characters that you publish may be shown as your entry, on its page and on the challenge page.

**After:**

> Anything you publish, and every frame you make in Remix, is public, shown with your name (your Farcaster name, or, for a wallet account, its address shortened; your Farcaster ID on quote cards), the date, and the record of how it was made. If you link a wallet to your Farcaster account, what you made with the wallet, before and after linking, is shown under your Farcaster name, so anyone can see that the two are yours; if you unlink it, that work is shown with the wallet's address again. See the Terms, sections 5 and 7. If you share a Minpentai win, your own Farcaster or X app posts it; its link carries only the opponent you beat and the number of steps, its card is drawn from that link, and we keep nothing about it. If you share a Minpentai challenge from a Farcaster cast, your Farcaster app posts it; its link carries the match's start (its random seed, the computer level and the extra rule) and your result (how and at which step it ended, how many towers were left and how many taps you used). It does not carry your moves or your Farcaster ID, though anyone who opens the link can read what it does carry. Its card is drawn from that link, and we keep nothing about it. During the remix challenge, a version of one of its characters that you publish may be shown as your entry, on its page and on the challenge page. If you publish a sheet whose prompt includes words it suggested to you in 'Ask for help', its recipe says it includes words from AI suggestions.

## Terms §6e (The remix challenge.): one sentence, at the end

**Before:**

> The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed in with a Farcaster account that passes the site's check may remix its characters' sheets; making other sheets and styles stays by invitation. Entering is free and needs no purchase, and minting isn't needed for anything. A version counts as an entry if it is a remix (not a sheet made from scratch) made on the Service during the challenge by an account we invited or one that passed the site's check when the version was published. One entry per person per character: your latest version counts unless you mark another. Admins can make versions but aren't eligible for rewards. When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID, when it was published and what it was built on; hiding a version later removes it from the Service, but not its fingerprint from that record. Anything that follows the challenge, including any mint, is a plan, not a promise, and is decided as the challenge page says. We may change or end the challenge, and the page will say so.

**After:**

> The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed in with a Farcaster account that passes the site's check may remix its characters' sheets; making other sheets and styles stays by invitation. Entering is free and needs no purchase, and minting isn't needed for anything. A version counts as an entry if it is a remix (not a sheet made from scratch) made on the Service during the challenge by an account we invited or one that passed the site's check when the version was published. One entry per person per character: your latest version counts unless you mark another. Admins can make versions but aren't eligible for rewards. When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID, when it was published and what it was built on; hiding a version later removes it from the Service, but not its fingerprint from that record. Anything that follows the challenge, including any mint, is a plan, not a promise, and is decided as the challenge page says. We may change or end the challenge, and the page will say so. 'Ask for help' is optional; entries are judged the same either way.

---

## For the owner to decide (not drafted as lines)

- **Privacy §7 (outside services).** Its Groq item says Groq and Vercel AI Gateway "receive assistant questions, and the
  prompts for images you make". §5's new words already say "Ask for help" goes to Groq, so §7 could stay as it is, or
  add "'Ask for help' messages" to that item. The proposal names no §7 change; the agent suggests adding it, so §7's
  list stays complete:
  > Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, 'Ask for help' messages, and the prompts for images you make, which are checked against the published rules.
- **Privacy §3 (kept on your device).** The conversation is kept only in the open page (not in the browser's storage),
  and is gone when the page is left; nothing to add, unless the owner wants that said.
- **The consent screen** is unchanged: "Ask for help" publishes nothing by itself; what is published is the sheet, with
  its label.
