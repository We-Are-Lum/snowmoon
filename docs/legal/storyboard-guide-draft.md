# The storyboard guide: Privacy lines (DRAFT, for Nate's reread)

Branch `storyboard-guide`, 2026-11-23. Drafted by the coding agent (Claude, a closed model by Anthropic); DRAFT until
Nate's reread. Not in `src/lib/legal.ts` yet: they go in, word for word as reread, in this branch, and ship in the same
release as the guide (legal texts describe today). Terms: no change proposed. §5 already says "the prompts and any
planning thread that led to the piece are published with it" where the Service says so before publishing.

The line for sending a person's own kept pictures as references (the scene engine) is in
`docs/legal/storyboard-scene-draft.md`, also for reread.

## What the guide receives (as built: `src/lib/voice/guide-server.ts`, `askGuide`)

- the person's message, word for word, and the last ten messages of the dialogue;
- the speech's sentences, numbered (the book's c13-b64 or the team's speeches: already public);
- the board's choices: each shot's sentence numbers, camera, insert or not, its prompt if written, whether it has a kept
  picture; the scene's setting and clothing as written;
- the chosen look's sheet: its title and published text;
- the kept pictures by key ("scene", "s3"), never the pictures themselves.

It receives no recording, no audio, no picture, and nothing about the person but what they type. The model is the
assistant's own (`CHAT.model`, gpt-oss-120b, open weights) on the assistant's provider (`CHAT.provider`, Groq, with zero
data retention, Nate confirmed in the Groq console on 2026-10-08), and through Vercel AI Gateway when Groq is busy
(`CHAT.gatewayFallback`). No new service.

## Privacy §7, the Groq item

**Today:**

> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, and the prompts for images you make,
> which are checked against the published rules.

**Proposed:**

> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, the prompts for images you make, which
> are checked against the published rules, and what you write to the storyboard guide, with the speech and your
> storyboard's choices; never your recording or your pictures.

## Privacy §4, a new item after the storyboards item

> Your conversation with the storyboard guide: what you asked and what it drafted, kept with your storyboard until you
> remove it. When you publish the storyboard, what each picture answered and the prompt it was made with are published
> with it.

**Its source:**
- `studio.voice_guide_messages` (`NEXT_storyboard_guide.sql`): insert only; removed with the board
  (`studio.delete_voice_board`) or the draft (`studio.delete_voice_draft`);
- each picture's recipe `guided` (`src/lib/voice/shot-picture.ts`) carries the request word for word and the prompt;
- `publish.ts` copies the recipe as kept.
