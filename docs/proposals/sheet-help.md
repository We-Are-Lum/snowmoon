# "Ask for help" beside the sheet prompt box (remix challenge)

Proposal by the coding agent (Anthropic's Claude), 2026-10-31. **Approved by the owner on 2026-10-31, with the
decisions below.** Target: on by Thu 12 Nov, the challenge's halfway post. It is built on this branch only after the
launch build (`remix-challenge`) merges, and it never delays that build. It stays switched off until the owner rereads
its Privacy and Terms lines.

## The owner's decisions (2026-10-31)

- **Go, as proposed, for Thu 12 Nov.**
- **Caps:** 20 messages per person per day; $1 a day across the whole site.
- **One part of the prompt at a time.** It never drafts the whole prompt.
- **Recipe marking:**
  - if Plan A part 2 (`agent-pictures`, which records whose words each part of a prompt is) has merged by Tue 10 Nov,
    mark each phrase that came from an accepted suggestion;
  - if not, label the whole prompt "includes words from AI suggestions", and add per-phrase marking later.
- **Terms:** add the optional line: help is optional, and entries are judged the same either way.
- **Migration:** the owner gets the SQL and the two-part read-back before he applies it.

## What it does

- An optional **"Ask for help"** chat beside a character sheet's prompt box, during the challenge. The plain prompt box
  stays the main way to make a sheet.
- **What the model reads:**
  - the person's message;
  - the character's facts from the book, as the Make-your-own coach uses them;
  - the current sheet's prompt draft and recipe text.

  It doesn't see the sheet's images. The assistant's model reads text only; seeing the images would need a vision
  model, another cost, and a Privacy change.
- **What it proposes:** a change to one part of the prompt draft, shown as before and after. The person taps Accept or
  Reject. Nothing changes the prompt without that tap.
- **The recipe** shows which words came from accepted suggestions (marking as above), and the published sheet's recipe
  keeps it (P1, P2).

## What it reuses

- **From the Make-your-own coach (`src/lib/make/coach.ts`, on main):**
  - the model and its route: gpt-oss-120b on Groq, or through Vercel AI Gateway when Groq is busy;
  - the guard model, gpt-oss-safeguard-20b, with the retry-then-decline flow;
  - book search, with quotes taken from the database;
  - the character facts and the pronoun check (`src/lib/make/cast.ts`);
  - the reserve-then-record pattern for limits and spend (`src/lib/make/limits.ts`).
- **New:**
  - **Its own system prompt and guard policy.** The coach must never write description; this help writes visual prompt
    text, one part at a time. It must still never write dialogue, narration or story lines.
  - **Its output is a proposed change** to one named part of the prompt, not a note.
  - **The accept/reject change view.**
  - **Recipe marking,** as decided above.
- **From routing C's make mode** (on `agent-pictures`): only the pattern of a separate cap. No routing call is needed,
  and nothing goes to Kimi K3.
- **Migration: a small one.**
  - The coach's count tables have no kind column, and the assistant's tables only allow their current kinds.
  - Either a new pair of count and cost tables, or a `kind` column on the coach's two tables.
  - The read-back is in the two-part form: one read-only SELECT whose rows are all true, and one `do $$` block that
    inserts a realistic row, checks it and deletes it.

## Cost

These are at the site's prices: gpt-oss-120b at $0.15 in and $0.60 out per million tokens; the guard model at $0.075
and $0.30.

| | Tokens | Cost |
|---|---|---|
| Typical message | about 4k in and 400 out, plus the guard | about $0.001 |
| Worst case, reserved | 8k in, 900 out, guard 1,500 | about $0.003 |

The $1 cap covers about 1,000 typical messages a day across the site, or about 350 at the worst case.

## Privacy and Terms lines (drafts, for the owner's reread)

- **Privacy §5 (the assistant):** "On a character sheet, 'Ask for help' sends your message, the sheet's prompt draft
  and recipe, and the character's facts from the book to Groq (or through Vercel AI Gateway when Groq is busy), set to
  keep nothing. We keep no copy of the conversation. Under your Farcaster ID we record only how many messages you send
  and when, to count the daily limit; costs are kept as daily totals without your ID."
- **Privacy §6 (what you publish):** "If you publish a sheet whose prompt includes words you accepted from 'Ask for
  help', its recipe shows which words those are." Or, without per-phrase marking: "…its recipe says it includes words
  from AI suggestions."
- **Terms, the remix challenge section:** "'Ask for help' is optional; entries are judged the same either way."

## Principles

- **P1 and P2 (recipes; AI declared):** every accepted suggestion is marked in the recipe, and nothing changes the
  prompt without the person's tap.
- **Story words stay human:** it writes picture prompts only, one part at a time, never story lines. Its own guard
  enforces this.
- **P3 (open models):** gpt-oss-120b and gpt-oss-safeguard-20b.
- **P5 (owners, not votes):** help has no effect on entry or eligibility.
- **P6 (privacy, no third parties):** nothing is stored except a count and daily cost totals. It stays off until the
  Privacy lines are reread.
