# The assistant as an agent: notice and Privacy §5 lines (REREAD by the owner, 2026-10-29, with one change)

Owner, 2026-10-29: "The assistant as an agent: run the gpt-oss tool-use trial first and report; draft the notice and
Privacy §5 lines for my reread before building." Drafted by the coding agent.

**Reread, 2026-10-29:** "Notice draft: item 4 must say the words of my request are saved with the draft, as the Privacy
paragraph does: 'When you ask it to make something, its drafts, with the words of your request, are kept privately on
your dashboard…'. Otherwise reread. Ship with the feature, not before." The change is made below. Nothing in
`src/lib/chat/notice.ts` or `src/lib/legal.ts` changes until the feature ships, in the same release.

What changes for a reader: the assistant can now draft things for you (a reference picture, an image for a moment, a
storyboard, a frame for your own scene), saved privately on your dashboard. Drafts with a cost wait for your Make it.
It still never writes story words. Your conversation itself still stays on your device.

## The notice (src/lib/chat/notice.ts), four items today

| # | Today | Proposed |
| --- | --- | --- |
| 1 | **It helps you read.** Ask about the book. Answers point to the passages they rest on, with chapter and ¶, and show the book's own words. | **It helps you read and make.** Ask about the book, or say what you'd like to make. Answers point to the passages they rest on and show the book's own words. |
| 2 | **It won't write for you.** No dialogue, narration or description. It gives context and commentary only. | **It won't write the story for you.** No dialogue or narration: lines in anything it drafts are the book's own words or yours, exactly. It writes only the prompts for pictures, shown in their recipe. |
| 3 | **Your messages go to Groq (not the Grok of X).** Groq runs gpt-oss-120b, an open-weights model… set to keep nothing, and this app keeps no copy of your messages. | Unchanged. |
| 4 | **Your questions are saved only on this device.** They are sent to Groq… to be answered, and never published… | **Your questions stay on this device; drafts go to your dashboard.** Your questions are sent to Groq to be answered and never published; another device won't have them. When you ask it to make something, its drafts, with the words of your request, are kept privately on your dashboard until you publish or discard them. Anything with a cost waits for you to tap Make it. |

The notice key changes with the words, so everyone who dismissed the old notice sees the new one once.

## Privacy §5 (The assistant), one paragraph added

Today: "Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are
set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many
questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals, without
your ID, to track our spending."

Added after it:

> If you ask the assistant to make something, it works as your agent: it saves drafts to your dashboard (what it
> drafted, the words of your request that it answers, and the recipe), privately, until you publish or discard them.
> We still keep no copy of the conversation itself. As with any agent, when one of its tools refuses or fails, or it
> can't do what you asked, it records that, and the site's owner sees it with your name (section 4).

## No other change

- §7 (outside services): none; pictures it drafts are made only on your Make it, by the services §7 already names.
- Terms 6b (Agents): the assistant counts as one of your agents, under the same limits; one sentence, for the same
  reread: "The site's own assistant can act as your agent too, with the same limits."
- Terms 8 (AI-made material): unchanged.
