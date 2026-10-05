# 008: Narration for the whole book, first image tests

Date: 2026-10-03. Agent: Claude Code.

The prompts in this session, in order. Between them the agent asked two
multiple-choice questions; the answers are noted where they came.

```text
Trial run for Milestone 3. Narrate Chapter 1 with an open-weights
speech model running locally. No hosted APIs, no cost.

1. Use Kokoro. Before generating, read the model card and the card
   for the specific voice you pick. Quote the license line for each
   in your report. If either does not clearly allow redistributing
   the audio under GPL-3.0, stop and tell me.
2. One stock voice. Never a cloned or real person's voice.
3. Write scripts/narrate.* in the repo. It reads the committed
   chapter JSON and generates one audio file per readable block.
   Break blocks become a short silence.
4. Screen and figure blocks: draft a short spoken description for
   each and save them as proposed read_aloud overrides in the repo,
   marked unreviewed. Do not read tables aloud cell by cell.
5. List every invented word or name in the chapter and the
   pronunciation you used, in content/snowmoon/pronunciation.json.
6. Output goes to a gitignored folder: the per-block files, one
   stitched file for the whole chapter, and a manifest with each
   block's duration plus model, version, voice, and settings.
7. Do not write to the database. Do not build the player.

Stop after Chapter 1 and report: total duration, how long it took
to generate, the two license quotes, the pronunciation list, and
where the stitched file is. Do not start Chapters 2 and 3.
```

The agent stopped at step 1: the model card's license line is
`license: apache-2.0`, but no voice has a license line of its own.

```text
You can also copy the file to my Google Drive after so I can easily listen from
My phone
```

Answers: proceed with `af_heart`, relying on the repository-wide Apache-2.0
license; copy to the [Google Drive folder synced on the author's Mac].

```text
Seems good enough. How much did it cost? Have noticed a mispronounced Medieval. But maybe best to just do all the other chapters. And then give people the ability to generate pictures on top of it. Plus let people create and use each others "style guide" and "character profiles" usually if a person chooses each of these it will be used througput their generarions
```

```text
There are open source video models right? I wonder if people can propose them for now? But we don't run them right away
```

```text
I wonder if we can give people a higher number of image proposals too. And I run them locally on my machine for free later?
```

```text
Which models work for this project and have the best character consistency? I can get more space potentially
```

```text
Also want people to have a wallet address for their work. And our app makes EAS attestations about what everyone has done with the app, including model and prompt and link to output? Maybe this is a later build?
```

```text
Ok. Yes some test images would be good. Would be cool to seed the whole audiobook with some scattered images per chapter
```

```text
Was it part of Vitaliks plan to have people rewrite the text?
```

```text
Made the statement on his blog. Or on the website he published the whole thing
```

```text
We should have the website accept donations, and we record it associated with a wallet address (they can manually input one if they want) and can assoacite donatipm with farcaster account if it's from an associated wallet
```

```text
How can we get better images? Can people add hand drawn image released with same license
```

```text
Yeah, commit. And push to main. start seeding some casting profiles. And then seeding chapters with some key images
```

```text
Or could we do a detailed one layer of the Farcaster arch?
```

```text
Ignore my last thing
```

```text
Great. Continue
```

```text
Would be cool to allow people to choose which model (of ones that work for the rights) they want to use to generate images
```

```text
Of course. All this works needs to be tracking prompts and models used. To be shared publicly later
```

```text
This cast doesn't feel very futuristic. Feels kind of modern
Needs a stronger aesthetic sense. More in the train of successfully cypherpunk style comics or graphic novels
Can you research what image and graphic styles have been successful in similar kinds of stories?
```

```text
Yes, test many of these directions
```

```text
Great
```

```text
A and e are my favorites. Iterate around there
```

```text
We could let people leave text notes connected to the audiobook. We can also have a section of the app to explore creating a different audiobook voice
```

```text
People could actually record themselves reading the whole book. As long as they allow it to be used anywhere right?
```

[An image of the AE3 "techno vistas" test renders was attached.]

```text
Pretty cool. Like this the best. Mainly because of the background buildings. Maybe we need to also do some basic renderings of the different cities and spaces, that people agree to and is loaded as context depending on part of the story they are generating images for
```

```text
Still working?
```

```text
1 first. Going to sleep now so try to do a lot in the next 7 hours without stopping
```

```text
Great
```

```text
Can you reply with full v5 proposal text? You need me to approve that before proceeding right?
```

```text
We don't need to make video. We can just have a player that plays the audio with images shown as it plays. Can also allow people to download audio. Would it be within our rights to put the audio on Spotify?
```

```text
Run with RLS option added?
```

```text
Ah yes. RSS podcast makes sense
```

```text
V5 looks good. Sql with RLS?
```

```text
Sql error: Error: Failed to run sql query: ERROR: 3F000: schema "studio" does not exist
```

```text
Can you give me 001 sql to copy and paste in a block. Followed by 2?
```

```text
Ran both
```

```text
For now can we login with Farcaster as a miniapp?
```

[The owner pasted the verification query result: 23 tables in `studio`, all with RLS on.]

```text
I already had created the vercel
```

```text
And I have snowmoon.party as the url
```

[The owner pasted the signed account association for snowmoon.party (public by design: it is served in the manifest).]

```text
Can you make the environmental variables easily copy and paste into vercel
```

```text
Added them and redeploying now
```

```text
Looks good on miniapp! Let's remove this from about: and what you see by default is decided by ratings and by how often others build on it, never by a person.
```

```text
Ok. Yes. Going to sleep soon. So try to do as much as you can progressing forward without me. Let me know now if there will be any blockers you think might come up
```

Answers: narration records credited to FID 6786; the player goes live if all checks pass, otherwise stays on a preview; show the seeded images except the three that still clone characters.

```text
I think a key thing is to get to the point when people can create something very shareable: like an image with a quote, then getting to short comics, that includes summaries and rewriting, that can be shared, and can receive likes and expression of approval
```

```text
Ok.
```

```text
Ok
```
