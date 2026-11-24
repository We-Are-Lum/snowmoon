# The storyboard guide and the one scene: Privacy items (reread)

Branch `storyboard-guide`, 2026-11-23. Drafted by the coding agent (Claude, a closed model by Anthropic). Nate's reread,
typed in his session on 2026-11-23: "reread: the P2u line as drafted, and the three Privacy items above, word for
word". The three items below are his words; they are in `src/lib/legal.ts` (Privacy words `1mbiyd1`) and ship in the
same release as the guide and the scene step (legal texts describe today). They replace the drafts in this file's
earlier version and in `docs/legal/storyboard-scene-draft.md`. Terms: no change (§5 already says the prompts and any
planning thread that led to a piece are published with it; §8 says storyboard pictures are AI-made and labelled).
`LEGAL.effective` is the merge day, 2026-11-23.

## Privacy §7, a new item after the closed-model challenge item (the scene's references)

> If you make pictures for a storyboard, the model you choose receives the words for each picture, yours or the guide's
> draft, and up to three reference pictures: the scene you kept, the published sheet of the character in it, and other
> shots you kept for this storyboard, which stay private to you until you publish. fal.ai receives them for FLUX; OpenAI
> or Google, through Vercel AI Gateway, for theirs. Each keeps them as set out above for its pictures, and receives
> nothing else about you.

**Its source:**
- the words: `src/lib/voice/shot-picture.ts` (the person's description, or the guide's draft as the person kept or
  edited it, first, word for word);
- the references: `anchor-scene`, `anchor-look`, `continuity` and `other` (the guide may choose other kept shots of this
  storyboard), at most `IMAGES.maxReferences` (3); `board.ts` `shotReferences`;
- private until published: `board-store.ts` (private storage), `publish.ts` (copied to the public bucket);
- the hosts: `src/lib/challenge/models.ts` (fal.ai for FLUX.2 [klein] 4B edit; Vercel AI Gateway for GPT Image 2.5
  Sunburst and Gemini 3.1 Flash Image); the retention terms are §7's existing items, unchanged.

## Privacy §4, a new item after the speeches item (the guide's dialogue)

> Your conversation with the storyboard guide: what you asked and what it drafted, kept with your storyboard until you
> remove it. When you publish the storyboard, each picture's request and the prompt it was made with are published with
> it.

**Its source:** `studio.voice_guide_messages` (`0049_storyboard_guide.sql`), insert only, removed with the board
(`studio.delete_voice_board`) or the draft (`studio.delete_voice_draft`); each picture's recipe `guided`
(`shot-picture.ts`) carries the request word for word and the prompt; `publish.ts` copies the recipe as kept.

## Privacy §7, the Groq item (replaces today's)

**Before:**

> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, and the prompts for images you make,
> which are checked against the published rules.

**Now:**

> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, the prompts for images you make, which
> are checked against the published rules, and what you write to the storyboard guide, with the speech and your
> storyboard's choices; never your recording or your pictures.

**What the guide receives** (`src/lib/voice/guide-server.ts`, `askGuide`): the person's message and the last ten
messages; the speech's sentences, numbered (already public); the board's choices (each shot's sentences, camera, insert,
prompt, whether it has a kept picture; the scene's setting and clothing); the chosen look's published title and text;
kept pictures by key only, never the pictures. The model is the assistant's own (`CHAT.model`, gpt-oss-120b, open
weights) on Groq (zero data retention), through Vercel AI Gateway when Groq is busy. No new service.
