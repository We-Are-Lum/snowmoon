# A storyboard is one scene: the Privacy line (DRAFT, for Nate's reread)

Branch `storyboard-scene`, 2026-11-22. Drafted by the coding agent (Claude, a closed model by Anthropic); DRAFT until
Nate's reread. Not yet in `src/lib/legal.ts`: it goes in, word for word as reread, in this branch, and ships in the same
release as the scene step (legal texts describe today). Terms: no change proposed (§8 already says the pictures in
storyboards are AI-made and labelled).

## What is new, and why Privacy needs a line

Today a storyboard picture sends the model the person's words and, as reference pictures, only published sheets (the
character's front view): public pictures. With the scene step, each shot in the scene also sends two of the person's
own **private** pictures: the scene they kept, and the shot they kept just before it. Kept board pictures are private to
their person until they publish the storyboard (`src/lib/voice/board-store.ts`, private storage). Privacy §7 names what
each processor receives; no item covers a person's own private storyboard pictures sent as references.

## The proposed line: Privacy §7, a new item after the closed-model challenge item

> If you make pictures for a storyboard, the model you choose receives your words for each picture and up to three
> reference pictures: the scene you kept, the published sheet of the character in it, and the shot you kept before it,
> which stay private to you until you publish. fal.ai receives them for FLUX; OpenAI or Google, through Vercel AI
> Gateway, for theirs. Each keeps them as set out above for its pictures, and receives nothing else about you.

## Its source, line by line

- **"your words for each picture"**: `src/lib/voice/shot-picture.ts`, the prompt is the person's description first,
  word for word (`shotPrompt`), then the camera, the sheets' own texts, the one same-scene line and the site's rules.
- **"up to three reference pictures: the scene you kept, the published sheet of the character in it, and the shot you
  kept before it"**: `shot-picture.ts` (references in that order: `anchor-scene`, `anchor-look`, `continuity`; at most
  `IMAGES.maxReferences`, 3); `board.ts` `shotReferences` (the previous shot is the last kept shot *in the scene*, never
  an insert). An insert sends only a character's sheet, if one is chosen; the scene picture itself sends only the sheet.
- **"which stay private to you until you publish"**: kept pictures are in private storage and read back only by their
  person (`board-store.ts` `pictureBytes`); publishing copies them to the public bucket (`publish.ts`).
- **"fal.ai receives them for FLUX; OpenAI or Google, through Vercel AI Gateway, for theirs"**: `src/lib/challenge/models.ts`
  (`call.host`: fal.ai for FLUX.2 [klein] 4B edit; Vercel AI Gateway for GPT Image 2.5 Sunburst, `only: ['openai']`, and
  Gemini 3.1 Flash Image, `only: ['vertex']`).
- **"Each keeps them as set out above for its pictures"**: Privacy §7's existing items, unchanged: fal.ai "is asked to
  keep no copy"; OpenAI "may keep them for up to 30 days to check for abuse, and longer if needed …"; Google "keeps no
  copy, except in memory for up to 24 hours, and may keep logs … for up to 90 days"; "The gateway keeps no copy."
- **"receives nothing else about you"**: the request carries only the prompt and the pictures (`makeAdded` in
  `src/lib/chapter-pictures/pictures.ts`, the same call the chapter pictures use).

Shortest true sentence (Nate, 2026-11-04): no thresholds or labels; the retention terms are referred to, not repeated.
