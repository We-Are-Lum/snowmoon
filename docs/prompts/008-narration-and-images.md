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

```text
Merge the story-diagnostic branch into main and resolve any
conflicts. Then:

1. In the reader, a block cited by an adaptation shows a small
   marker linking to it.
2. Illustration jobs c30-b041, c30-b048 and c2-b038: keep the
   prompts free of writing, and add the text in code over the
   image (DOG on the sheets, the motto on the banner). Note this
   in each job.

Push when all checks pass.
```

```text
1. Lettered images: confirm that for each of the three jobs the
   original unlettered file is kept, both files have recorded
   hashes, and the record names the lettering script and commit.
   A remix must be able to start from the clean image. Fix it if
   any of that is missing.
2. Likes are stored as +1 ratings, but the brief's scoring counts a
   rater whose ratings are all equal as zero. A person who only
   likes would count for nothing. Propose a fix while the tables
   are empty (a separate likes table in 0002, or a stated rule for
   like-only raters) and wait for my answer.
3. Do not start comics.
4. Leave the story-diagnostic worktree in place.
```

```text
Option A, with these changes:

1. In the read policy, write likes.version_id, not bare version_id.
2. Likes are a sort order only. No LIKE_WEIGHT and no likes term in
   the score. Brief rule 4 gets: "Likes are not ratings. A like
   never enters rating normalization or the score. 'Most liked'
   sorts by distinct likers. Where nothing in a list is ranked by
   ratings, order by likes."
3. Move setLike and the like counts to the new table and remove the
   +1 rating path. Extend test:db to cover: like, unlike, liking
   twice, and likes on a hidden element not readable by the public.
4. Write 0003_likes.sql with a header saying it must run as
   postgres. Do not apply it.
5. Stop after the migration file and tests are committed. Do not
   deploy code that reads the new table until I tell you 0003 is
   applied.
```

```text
I need to run the sql? If so, put the full text in a block for me to copy below
```

```text
0003 is applied. Go ahead.
```

```text
Create docs/principles.md. For each principle below: the statement,
a source link, what it means in this app, and how it is checked
(a named automated test, or a review question). Mark each as an
inference from public writing, not an endorsement.

1. Every published generated asset has a public recipe.
2. AI use is declared on every element. The book's text is never
   altered, and nothing generated is presented as the author's.
3. The model allowlist records each model's license and whether its
   weights are open. Open-weight models are preferred. Report any
   closed model in use.
4. No model output is published without a signed-in person's action.
5. Nothing is marked canon, official, or featured. Moderators can
   hide and nothing else.
6. Production pages make no third-party requests. Individual
   ratings are not publicly readable. Only totals are.
7. Payments never enter scoring or ordering. No token. The
   "not affiliated" line stays on the first screen.
8. Dzegoban, Minpentai, and in-world screens match the source.

Add `npm run check:principles` running every automated check, each
proven to fail on a planted violation. Tell me which of these the
current code fails.

From now on, end every task report with a "Principles" section:
which ones the work touched, pass or concern, and any new tension.
Raise a conflict before you resolve it.
```

```text
Decisions on the principles audit:

1. P2b: label generated images "AI-generated" in captions and on
   quote cards.
2. P3a: add open_weights and license to config/models.json.
3. P4b: record the seeded images and narration as published by the
   maintainer via script, with date and the prompt log as evidence.
   Add that as an allowed, recorded path in principle 4.
4. P6b and likes: write 0004 making individual ratings and
   individual likes unreadable by the public, with a public totals
   view for each. Do not apply it. Stop and tell me when it is
   ready, as with 0003.
5. Spoken screen descriptions: a short tone before each, and a
   visible "description, not the author's words" label.
6. Fill recipes.assist wherever a model drafted an input, including
   your own drafting.
7. An adaptation page shows script.md only when the file is marked
   approved, with who approved it and when.
```

```text
Change of approach. Models build structure and images. People write
every published word.
[The full text is in adaptations/dog-dawn/prompts/001-request.md.]
```

```text
Order of work.

A. Finish and commit the seven-decision work on main first, with
these rulings:
- Principle 2 wording: "The words of a piece (narration, dialogue,
  and any description spoken or shown as part of it) are the
  author's or a signed-in person's. Model-drafted working notes
  and accessibility text may be shown only when labelled as
  model-drafted, and never inside the piece itself."
- Conflicts 1 and 2: keep the 148 spoken descriptions, with the
  tone and label, as a recorded exception. List them in a file.
  The check fails if the list grows. An entry is removed when a
  person rewrites it in 25 words or fewer.
- Conflict 3: an approved adaptation page shows the piece first
  (book lines, people's lines, images). Structure notes go under a
  collapsed "How this was built" section, labelled model-drafted.
- Conflict 4: alt text stays, prefixed "AI-generated image:".
Then hand me 0004 the way you handed me 0003.

B. Then the comic. The structure is approved with two merges:
beats 2 and 3 become one, and beats 7 and 8 become one. Nine beats.
Rebase on main, generate the nine images (at most three attempts
each), show them to me, and stop. I will write the lines.
```

```text
Prompts must be public, and users must know their words will be.

1. Audit: for every published generated asset, is the exact prompt
   reachable by a signed-out visitor? List any that are not, and
   make principle 1's check fail on a missing or private prompt.
2. Consent: before a person's first contribution that stores their
   own words (a prompt or a line), show a blocking screen: public,
   permanent, GPL-3.0, shown with your Farcaster name. Record who
   agreed, when, and to which wording. If 0004 is still unapplied,
   add the table there.
3. Under every text box whose contents will be published, show that
   same line, and show a preview before publishing.
4. Only prompts for published elements are public. Drafts and
   abandoned attempts stay private.
5. Write docs/removal.md: hide on request at once, plus a logged
   maintainer procedure for true erasure. Propose it and build
   nothing yet.
6. Propose, without building, an option to publish without one's
   name while recording the author internally.

Fit this into part A of the current work, before 0004 is handed
over.
```

```text
0004 is applied.

1. Verify on the real database, inside a rolled-back transaction:
   as studio_writer add one like to a published version, then as
   anon confirm like_totals shows it and studio.likes shows
   nothing. Re-run P6c.
2. Take likes private: yes.
3. The assist gap: use the side table. Put it in 0005.
4. The comic's style stays as is for this piece. No night variant
   yet.
```

```text
1. 0005: in recipe_assist's public_read policy, write
   studio.recipe_assist.recipe_id, not bare recipe_id. Re-run
   test:db, push, and tell me when the file is final.
2. "Drafts stay private" applies to people's contributions in the
   app. The maintainer's own pipeline, including rejected
   attempts, stays fully public. Keep the dog-dawn branch unpushed
   anyway until I have written the lines and watched it.
3. Proposals in the render queue stay public. Submitting one is
   publishing it, so it goes through the own_words consent screen
   and preview.
4. docs/removal.md is approved as policy. Build "Hide this" with
   the first form that stores a person's words, and change the
   consent wording to promise it only then.
5. Publish-without-name: not now. Keep the proposal on file.
```
