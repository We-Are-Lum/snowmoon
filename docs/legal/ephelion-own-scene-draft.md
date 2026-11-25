# Ephelion: your own scene, one free picture. Privacy and Terms lines (DRAFT, awaiting Nate's reread)

Branch `ephelion-own-scene`, 2026-11-25. Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT until
Nate rereads it. Nothing here is in `src/lib/legal.ts` yet. These lines go into it on this branch, in the release that
turns the free picture on, and never before (CLAUDE.md: legal texts describe today).

## The flow these lines describe

The feature isn't built yet. Each line below assumes this flow. If the build differs, the line changes with it, and
Nate rereads it again.

1. **Choosing a scene.** When recording a speech for Lord Ephelion, the person picks one of the three shared scenes
   (study, TV commercial, speech to a crowd) or "describe your own".
2. **The words are checked.** For their own scene, they write a description. It's checked against the published rules
   like any image prompt: Groq, or Vercel AI Gateway when Groq is busy.
3. **The picture is made.** The description and up to three of Ephelion's published profile pictures go through Vercel
   AI Gateway to OpenAI (GPT Image 2.5 Sunburst), with no prompt training. Those are the master front and the outfit's
   front and three-quarter views.
4. **One free picture.** Each account gets one picture of its own scene, free. It isn't charged to a balance and doesn't
   count toward the day's free pictures. Open question 1 asks whether that's once per account or once per speech.
5. **A draft until published.** The picture is kept as the person's draft with their speech, private, until they
   publish or remove it. When published, their description is published with it, as storyboard pictures' requests are
   today.

## Privacy

**Section 4 (Kept by us when you sign in): a new list item after the speeches item.**

> A scene you describe for Lord Ephelion: your words and the picture made from them, kept as your draft with your speech
> until you remove it or publish it, and that you have used your free picture. When you publish, your words are
> published with the picture.

**Section 7 (Outside services and what they receive): a new list item after the storyboard pictures item.**

> If you describe your own scene for Lord Ephelion, OpenAI receives through Vercel AI Gateway your words and up to three
> of his published profile pictures, to make the picture. It receives nothing else about you, and may not train on
> them. OpenAI may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required
> by law. The gateway keeps no copy.

**Section 7, the Groq item: no change.** It already covers this check: "the prompts for images you make, which are
checked against the published rules".

**Section 3 (Kept on your device only): no change.** The picture is saved by us, not on the device.

## Terms

**Section 5 (What you add): add after the speech sentences.**

> When you record a speech for Lord Ephelion, you can describe a scene of your own and have one picture of him made in
> it, free.

**Section 8 (AI-made material): one phrase.** Today it reads "by the project or by someone who chooses one for a
challenge picture". The draft:

> by the project, by someone who chooses one for a challenge picture, or for a scene someone describes for Lord Ephelion

**Section 6 (What you must not do): no change.** It already says "don't make pictures of real people".

## Open questions for Nate (each one changes a line above)

1. **Once per account, or once per speech?** The draft says one per account, with no number in the Terms. If it's per
   speech, Terms §5 becomes "one picture of him made in it for each speech, free".
2. **Words in the picture.** The three shared scenes have no words in them. Should a description with words in quotation
   marks be refused, or drawn and read back by OpenAI as challenge pictures are?
   - **If refused:** no line is needed, and the refusal wording comes to you.
   - **If read back:** Privacy §7's new item adds the read-back sentence from the challenge item.
3. **Who can make one.** Does it follow the voice pages (admins and invited testers now), or anyone signed in who passes
   the site's check? This draft doesn't say, because Terms §4 and the challenge's check already cover access.
4. **A redo.** Can the person try again if the picture is refused or comes out wrong? Terms §6a already gives back a
   paid generation that gives no picture. For a free one, the draft assumes a refused or failed picture doesn't use up
   the free picture. If that's wrong, Privacy §4's "that you have used your free picture" needs "or tried to".
