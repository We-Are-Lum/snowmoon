# Challenge release: every final text (v5; v3 reread by the owner; v5's additions NOT YET REREAD)

Written by the coding agent (Claude, a closed model by Anthropic), 2026-11-08, on branch `challenge-models` (v4 adds the closing line of 2026-11-09 and the bases' style; v3 was at `9ae0aa13`) (with challenge-simple's final head `1efcbeaf`). **v3:** the owner reread every text of v2 on 2026-11-08, via the coordinator's check, with changes 1–2 below applied word for word (the notice labels; the closed refusals) and the rules above Generate extended; the "none left" line approved as drafted
(which carries `challenge-simple`). Every text below is copied from the code as it
stands on that commit (dumped from `src/lib/legal.ts`, `config/consent.json`, the wording modules and `src/app/about`),
not retyped. "Before" is `origin/main` at `00722d70`. Where a text didn't exist, there's no before. `{…}` marks a value
filled in at run time. `LEGAL.ownerReread` is set to these words on the owner's instruction (relayed by the coordinator): privacy `d8fe0h`,
terms `1finiyh`; P6k and P6l pass.

## Terms

### §6 What you must not do (the owner's words, 2026-11-08; ships with the prompt check's new categories)

**Before:**

> Don't post anything unlawful, harassing or sexual involving minors; don't post other people's private information; don't impersonate anyone or present your work as the author's or as official; don't try to get around sign-in, daily limits or spending caps; don't interfere with the Service.

**After:**

> Don't make or post anything unlawful, harassing or sexual, or anything that promotes self-harm, terrorism or violence; don't make pictures of real people or post other people's private information; don't impersonate anyone or present your work as the author's or as official, or AI-made work as made by hand; don't use the Service to deceive, defraud, spam or campaign for a real election, party or candidate; don't try to get around sign-in, daily limits, spending caps or the safety checks, or test them without our permission; don't interfere with the Service or anyone else's.

### §6e The remix challenge (challenge-simple's change: the entry sentence; the rest unchanged)

**Before:**

> The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed in with a Farcaster, Lens or Bluesky account that passes the site's check for it may remix pictures of its characters; making sheets and styles stays by invitation. Entering is free and needs no purchase. A picture counts as an entry only once its maker submits it on the Service, with a link to their own post about it on Farcaster, Bluesky or Lens that links to its page, and only if it is a picture of a challenge character at one of the challenge's moments, remixed from one of its pictures on the challenge page (not made from scratch), made on the Service during the challenge by an account we invited or one that passed the site's check when it was published. Each person can submit one entry a day (Pacific time), for any character, and can withdraw any of them until entries close; a withdrawn entry still uses its day. Admins can make pictures, but theirs aren't entries. There is no prize for now. How the final version is chosen, and any prize, are added to the challenge's rules before entries close. We may change or end the challenge, and the page will say so.

**After:**

> The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed in with a Farcaster, Lens or Bluesky account that passes the site's check for it may remix pictures of its characters; making sheets and styles stays by invitation. Entering is free and needs no purchase. A picture counts as an entry only once its maker submits it on the Service, with a link to their own post about it on Farcaster, Bluesky or Lens that links to its page, and only if it is a picture of a challenge character, remixed from one of that character's pictures on the challenge pages (a base or any remix, including your own; not made from scratch), made on the Service during the challenge by an account we invited or one that passed the site's check when it was published. Each person can submit one entry a day (Pacific time), for any character, and can withdraw any of them until entries close; a withdrawn entry still uses its day. Admins can make pictures, but theirs aren't entries. There is no prize for now. How the final version is chosen, and any prize, are added to the challenge's rules before entries close. We may change or end the challenge, and the page will say so.

### §8 AI-made material

**Before:**

> The narration, many pictures (every frame made in Remix among them) and the assistant's answers are produced by AI models and are labelled as such. They can be wrong. The assistant's commentary is not the book and is not advice of any kind. Some of the project's own pictures are made with closed models by OpenAI and Google, or by the owner with Midjourney outside the Service, named with their maker on each picture's recipe; they are offered under the licence in section 3, as far as anyone holds rights in them, and their makers' terms bind us, not you.

**After:**

> The narration, many pictures (every frame made in Remix among them) and the assistant's answers are produced by AI models and are labelled as such. They can be wrong. The assistant's commentary is not the book and is not advice of any kind. Some pictures are made with closed models by OpenAI and Google, by the project or by someone who chooses one for a challenge picture, or by the owner with Midjourney outside the Service, named with their maker on each picture's recipe; they are offered under the licence in section 3, as far as anyone holds rights in them, and their makers' terms bind us, not you.

## Privacy

### §3 Kept on your device only

**Before:**

> Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its answers, drafts of images you make until you publish them, a few other settings of yours, and, on the website, your sign-in, which lasts about an hour (a day for a wallet, Lens or Bluesky sign-in), a note of a Bluesky sign-in under way, kept in that tab for at most ten minutes, the Bluesky handle you last signed in with, to fill it in next time, and a payment you have sent but not yet seen credited. These stay on your device, except that the assistant sends the furthest chapter, as a number (or another chapter you choose for a conversation), with each question and its search of the book, so that answers stay within it; it isn't kept. Clearing your browser's site data removes them. Frames you make in Remix are not drafts: they are saved by us as soon as they are made (section 4). So are the frames and video tests your agent makes when you approve them, but privately: only you can see them (section 4).

**After:**

> Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its answers, drafts of images you make until you publish them, a few other settings of yours, and, on the website, your sign-in, which lasts about an hour (a day for a wallet, Lens or Bluesky sign-in), a note of a Bluesky sign-in under way, kept in that tab for at most ten minutes, the Bluesky handle you last signed in with, to fill it in next time, and a payment you have sent but not yet seen credited. If you choose a closed model for a challenge picture, it also stores that you confirmed you are 18 or older, and which makers' notices you asked not to be shown again; with each such picture we receive only that you confirmed, and don't keep it. These stay on your device, except that the assistant sends the furthest chapter, as a number (or another chapter you choose for a conversation), with each question and its search of the book, so that answers stay within it; it isn't kept. Clearing your browser's site data removes them. Frames you make in Remix are not drafts: they are saved by us as soon as they are made (section 4). So are the frames and video tests your agent makes when you approve them, but privately: only you can see them (section 4).

### §4 Kept by us when you sign in: the remix challenge item

**Before:**

> If you take part in the remix challenge: for each picture of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check: Neynar's score for a Farcaster account, the Bluesky check for a Bluesky account), decided once, when you publish it, and kept with the time it was decided; and each picture you submit as an entry, with its character and when you submitted it. Submitting needs the link to your own post about it, which is kept and listed on the picture's page like any post you add (below); for a Farcaster, Bluesky or Lens post, the site checks with its network that you wrote it. If you withdraw a submission, it stops being an entry but is kept, marked withdrawn, with when; the post stays listed until you remove it. Whether a picture is an entry is shown on its page and on the challenge page, with how many people have submitted for each character.

**After:**

> If you take part in the remix challenge: for each picture of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check: Neynar's score for a Farcaster account, the Bluesky check for a Bluesky account), decided once, when you publish it, and kept with the time it was decided; and each picture you submit as an entry, with its character and when you submitted it. Submitting needs the link to your own post about it, which is kept and listed on the picture's page like any post you add (below); for a Farcaster, Bluesky or Lens post, the site checks with its network that you wrote it. If you withdraw a submission, it stops being an entry but is kept, marked withdrawn, with when; the post stays listed until you remove it. Whether a picture is an entry is shown on its page and on the challenge page, with how many people have submitted for each character. When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture's record. A picture made with a closed model counts as three of your free pictures that day.

### §7 Outside services: the Vercel item (the country line)

**Before:**

> Vercel hosts the site and sees your IP address and browser details, as any web host does.

**After:**

> Vercel hosts the site and sees your IP address and browser details, as any web host does. To offer a model only where its maker serves, we read the country your connection comes from; we don't keep it.

### §7 Outside services: new item

**Before:** none.

**After:**

> If you choose a closed model for a challenge picture, its maker, OpenAI or Google, receives through Vercel AI Gateway your prompt and the picture you chose. It receives nothing else about you, and may not train on them. OpenAI may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law. Google keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days. The gateway keeps no copy.

## About, "Where it runs" (the sentence that changes)

**Before:**

> Supabase holds the database. OpenAI and Google receive, through Vercel AI Gateway, the prompts and pictures for some of the project's own pictures, and nothing about you, and neither may train on them (OpenAI may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law; Google keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days).

**After:**

> Supabase holds the database. OpenAI and Google receive, through Vercel AI Gateway, the prompts and pictures for some of the project's own pictures and for a challenge picture someone makes with one of their closed models, and nothing about you, and neither may train on them (OpenAI may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law; Google keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days).

## The closed models' notices (version 4: v3's words with the new labels), the 18+ line and the buttons

Before (v2), the middle paragraph only: "OpenAI receives your prompt for each view and, for the side and back, the front
view it made, through Vercel AI Gateway. Nothing else about you." (and the same for Google). Everything else unchanged.

**OpenAI:** title "A closed model by OpenAI"; label "OpenAI may keep prompts and pictures up to 30 days" (v3, the owner's words; before "OpenAI keeps prompts up to 30 days").

> GPT Image 2.5 Sunburst is made by OpenAI. Its weights aren't published, so its recipe can't be re-run exactly.
> OpenAI receives your prompt and the picture you chose, through Vercel AI Gateway. Nothing else about you.
> OpenAI may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law. It doesn't train its models on them. The gateway keeps no copy.

**Google:** title "A closed model by Google"; label "Google keeps no copy; abuse logs up to 90 days" (v3, the owner's words; before "Google keeps no copy past 24 hours").

> Gemini 3.1 Flash Image is made by Google. Its weights aren't published, so its recipe can't be re-run exactly.
> Google receives your prompt and the picture you chose, through Vercel AI Gateway. Nothing else about you.
> Google keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days. It doesn't train its models on them. The gateway keeps no copy.

**The 18+ line and box** (unchanged): "Closed models are for people 18 or older, as signing in here is (Terms, section 4)." ☐ "I'm 18 or older". **Buttons** (unchanged):
"OK" · "Don't remind me again".

## Consent own-words-v6 (v5 plus one sentence; everyone is asked again)

**Before (v5), last paragraph:**

> To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to fal.ai to make it, and your Farcaster ID to Neynar to check your account's score. With a Lens account, its address goes to Lens instead, to check its Lens score; with a Bluesky account, its identifier goes to Bluesky, to check its age and recent posts. In Remix, every frame you make is saved and public at its link as soon as it is made, with your words. Elsewhere, drafts you don’t publish stay on your device.

**After (v6), last paragraph:**

> To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to fal.ai to make it, and your Farcaster ID to Neynar to check your account's score. With a Lens account, its address goes to Lens instead, to check its Lens score; with a Bluesky account, its identifier goes to Bluesky, to check its age and recent posts. If you choose a closed model for a challenge picture, your prompt and the picture you chose go through Vercel AI Gateway to its maker instead of fal.ai: OpenAI, which may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law, or Google, which keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days. In Remix, every frame you make is saved and public at its link as soon as it is made, with your words. Elsewhere, drafts you don’t publish stay on your device.

The other paragraphs, the line and the title are v5's word for word: "Public, permanent, GPL-3.0, shown with your name. You can hide it." / "Your words will be public".

## The remix screen: the Model row (new)

- Chips (the server's list; a chip is "{model} · {maker} · open|closed"): "FLUX.2 [klein] 4B · Black Forest Labs · open",
  "Qwen-Image-Edit · Alibaba's Qwen team · open", "GPT Image 2.5 Sunburst · OpenAI · closed", "Gemini 3.1 Flash Image ·
  Google · closed". Heading: "Model".
- Under a closed pick (the owner's words): OpenAI "a closed model by OpenAI · costs us about $0.05 · OpenAI may keep your prompt and picture up to 30 days · uses 3 of today's pictures"; Google "a closed model by Google · costs us about $0.07 · Google keeps no copy; abuse logs up to 90 days · uses 3 of today's pictures".
- Too few left (the owner's words; `{reset}` is 00:00 UTC in the visitor's own time, rendered in the browser, e.g.
  "4:00 pm"): "A closed model uses 3 of today's pictures; you have {n} left, enough for the open models. More pictures at {reset}."
- With none left (n = 0; drafted by this agent, **approved by the owner as drafted**):
  "A closed model uses 3 of today's pictures; you have none left today. More pictures at {reset}."
- A wallet account, in place of the closed models (the owner's words): "Closed models need a Farcaster, Lens or Bluesky sign-in."
- Refusals (DRAFT): "That model isn’t offered here. Choose another." · "Read the model’s notice first." · "Confirm you’re 18 or older first." · when fewer than 3 are left
  (the owner's words, v3): "A closed model uses 3 of today’s pictures, and you have fewer left. You can still use an open model." · the closed cap (the owner's words, v3; `{reset}` filled in by the browser in the visitor's own time from the instant the server sends): "Closed models have reached today’s spending limit for everyone. The open models still work; closed ones come back at {reset}."
- The recipe's crop note (DRAFT): "cropped from 3:2 to 16:9, mostly from the bottom".

## The remix screen: the rest (challenge-simple; DRAFT unless marked the owner's)

- "Remixing Zei" · "The picture of Zei you start from" (existed before).
- The box's label: "Change {Name}: clothes, colours, age, pose…"
- Style row: "Style" · "Random" · "Write your own" (the owner's words); the own-style
  box: "Your style, in a few words"; in "How it was made": "Style: {style}, drawn at random" (the owner's words, 2026-11-08; it replaced "Style: Random: {style}").
- The four errors: "Pick a style first." · "Write your style first." · "Write your style in up to {n} characters." ·
  "Pick one of the models listed."
- In the prompt (public in every recipe): "{Name} is the person in reference image 1, the main figure." and the keep
  line (the owner's words, v4, 2026-11-09, after the look test): "Keep the face recognisable; change anything else the words describe." (before, v3: "Keep the same character: face, hair, build and clothes, unless the change says otherwise.")

## The rules and the challenge pages (challenge-simple)

- Rules intro (the owner's words; dates and names from config): "From 17 to 29 November, make your own picture of Zei,
  Gladias, Bai, Seila, Deluin or Mu: start from one of their pictures, change what you like, pick a style and a model,
  and publish it. To enter, post it on Farcaster, Lens or Bluesky and submit the post. Your picture gets its own page,
  credited back to what you built on."
  Before: "From {dates}, make your own picture of {names}: start from one of their pictures, set it at a moment from the
  book, change what you like, and publish it. To enter, post it on Farcaster, Lens or Bluesky and submit the post. Your
  picture gets its own page, credited back to what you built on."
- Rules line (DRAFT): "Only remixes count: start from one of a character's pictures on the challenge pages, a base or any
  remix, including your own. A picture made from scratch isn't an entry." Before: "Only remixes count: start from one of
  a character's pictures on the challenge page and set it at one of the moments. A picture made from scratch isn't an
  entry."
- Character page: title "{Name}: Remix challenge"; description "The remix challenge on Snowmoon Party: {Name}'s bases
  and every remix."
- Share texts: your own picture "My remix of {Name}, for the Snowmoon Party remix challenge" (before, with the moments: "My remix of
  {Name} in "{moment}", for the Snowmoon Party remix challenge"); someone else's (the owner's words)
  "A remix of {Name} by {@maker}, for the Snowmoon Party remix challenge" (before: "{Name} in "{moment}", a remix
  by {@maker} for the Snowmoon Party remix challenge").

## The prompt check (public policy, `config/prompts/image-guard.md`), new and changed lines

- someone_elses_work: "a named character, logo, brand, film or franchise from another work, or the style of a named
  artist or studio." (before: "a named character, logo, brand or franchise from another work, or the style of a named
  living artist.")
- New: self_harm "self-harm, suicide or disordered eating, shown approvingly or as something to copy."; extremism
  "praise, symbols or propaganda for terrorist or violent extremist groups, or incitement to violence."; campaign
  "campaign material for a real election, party or candidate (posters, slogans, endorsements, attacks)."
- Allowed line: "…styles named by movement or medium rather than by an artist, studio or film." (before: "…rather than
  by a living artist.")
- The rules shown above Generate (and on About), v3: "No real people. No sexual content. Nothing violent or hateful. No
  characters or logos from other works. Don’t ask for words in the picture. No self-harm, extremism or election
  campaigning. Describe styles by look, not by artist, studio or film." (before: the same without the last two sentences).

## v4 additions (2026-11-09)

- The closing line of every challenge prompt (public in every recipe): "Keep the face recognisable; change anything else
  the words describe." (the owner's words; above).
- A published style, "Animated series" (the bases' own look; the owner publishes it with `scripts/publish-style.ts`):
  title "Animated series"; text "Animated series look: clean bold black ink outlines of even weight, flat saturated cel
  colour with a single hard-edged shadow tone, simple graphic shapes, large expressive eyes and readable eyebrows, lively
  faces full of personality, slightly stylised proportions, crisp characters against soft muted backgrounds, clear
  readable faces and hands." (word for word the drafts' style). A remix of a base made in it starts on it.

## v5 additions (2026-11-09): Backstory and the look lines — NOT YET REREAD

These are drafts for the owner's new reread; they don't ride on the earlier one. `LEGAL.ownerReread` is not changed, so
`check:principles` P6k (Privacy) is red until the owner rereads; P6l (Terms) stays green (Terms don't change: §5
already covers a backstory, the same licence as the picture).

### Privacy §4, the remix challenge item (DRAFT, not yet reread)

**Before** (its last two sentences, as reread on 2026-11-08):

> … When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture's record. A picture made with a closed model counts as three of your free pictures that day.

**After** (one sentence added at the end):

> … When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture's record. A picture made with a closed model counts as three of your free pictures that day. If you add a backstory to a challenge picture, it is kept and shown with the picture, with whether you marked it as mentioning later chapters and when you added it.

### The rules (the coordinator's draft, not yet reread)

**Before:** none. **After**, after "Only remixes count …" and Submit's line, before "Entering is free…":

> You can add a short backstory in your own words; it’s shown as invented by you, not from the book.

### Backstory on the publish screen and the picture's page (the owner's approved words)

- Box label: "Backstory (optional)", up to 400 characters, with the publication line ("Public, permanent, GPL-3.0,
  shown with your name. You can hide it." as every PublishedTextField).
- Hints above it (never put in the box): "What changed for {Name}?" · "Where are they now?" · "What do they want that they
  didn't before?"
- The tick: "Mentions things from later in the book" → on the picture's page: "May spoil later chapters."
- Under the picture: the backstory, then "Invented by {@maker}, not from the book".
- DRAFT (the agent's): the refusal "The prompt check didn't allow this backstory. Change it, or publish without it."; the
  button "Publish without it"; the admin's "Add backstory" and "Save backstory"; "Write the backstory in up to 400
  characters."

### The look lines (this edition's invention; owner-approved 2026-11-09), public in every recipe

Right after "{Name} is the person in reference image 1, the main figure." in every challenge prompt, for every model:

- Zei: "Unless the change says otherwise: a young man of eighteen, slim and of medium height, light golden-tan skin, spiky black hair with close-cut sides and one teal-blue streak, dark eyes."
- Gladias: "Unless the change says otherwise: a man of about forty, slim and of medium height, warm light-brown skin, short straight black hair, a neatly trimmed short beard, dark eyes."
- Bai: "Unless the change says otherwise: a young woman of about eighteen, tall and athletic, dark brown skin, one side of her head shaved and long magenta hair swept over the other, tattooed arms, gold earrings."
- Seila: "Unless the change says otherwise: a woman in her late thirties, tall and slender, deep brown skin, shoulder-length black braids gathered back, small round gold-rimmed glasses."
- Deluin: "Unless the change says otherwise: a young man of about eighteen, tall and long-limbed, warm tan skin, straight shoulder-length black hair, dark brown eyes, a calm, slightly serious face."
- Mu: "Unless the change says otherwise: a woman in her early sixties, small and wiry, medium brown skin, short silver hair in a sharp asymmetric cut, thin red-framed glasses."

The prompt's order: the change words; "{Name} is the person in reference image 1, the main figure."; the look line; the
style's text; "Keep the face recognisable; change anything else the words describe."; the no-lettering line.
