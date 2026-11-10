# Challenge release: every final text (v11: v9 reread by the owner on 2026-11-08 and 2026-11-09; v10 reviewed by the coordinator and approved by the owner on 2026-11-09; v11's Privacy §4 awaits the owner's reread)

**v11 (2026-11-09, final review; coordinator reviewed, owner approved):** see "v11" at the end. One legal change: a
sentence added to Privacy §4. `LEGAL.ownerReread` is NOT set: P6k is red until the owner rereads §4 and says "reread";
the new privacy key is `k5nsr6` (was `18g3ada`). Terms (`1finiyh`) and consent (own-words-v6) are unchanged.

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
  "GPT Image 2.5 Sunburst · OpenAI · closed", "Gemini 3.1 Flash Image · Google · closed" (v7: Qwen-Image-Edit dropped,
  owner, 2026-11-09). Heading: "Model".
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

- Rules intro (the owner's words, v9 with the new open date; dates and names from config; entries open Thu 12 Nov 2026,
  00:00 PT, and close after Sun 29 Nov, 23:59 PT): "From 12 to 29 November, make your own picture of Zei,
  Gladias, Bai, Seila, Deluin or Mu: start from one of their pictures, change what you like, pick a style and a model,
  and publish it. To enter, post it on Farcaster, Lens or Bluesky and submit the post. Your picture gets its own page,
  credited back to what you built on."
  (v8: "From 17 to 29 November, …".) Before: "From {dates}, make your own picture of {names}: start from one of their pictures, set it at a moment from the
  book, change what you like, and publish it. To enter, post it on Farcaster, Lens or Bluesky and submit the post. Your
  picture gets its own page, credited back to what you built on."
- Rules line (DRAFT): "Only remixes count: start from one of a character's pictures on the challenge pages, a base or any
  remix, including your own. A picture made from scratch isn't an entry." Before: "Only remixes count: start from one of
  a character's pictures on the challenge page and set it at one of the moments. A picture made from scratch isn't an
  entry."
- Character page: title "{Name}: Remix challenge"; description "The remix challenge on Snowmoon Party: {Name}'s bases
  and every remix."
- Character page, under the one line (v8, the owner's words, 2026-11-09): "Read where {Name} first appears" (e.g. "Read
  where Zei first appears"), a link to the reader at the character's first appearance (the card's first block, the same
  block its pictures are anchored to; Zei: c2-b2). The reader keeps its own chapter gating.
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

## v6 (2026-11-09): Backstory, the look lines and the Style row's default — reread by the owner

The owner reread and approved these on 2026-11-09 (relayed by the coordinator). `LEGAL.ownerReread`: privacy `18g3ada`
(terms `1finiyh`, unchanged); P6k and P6l pass. No spoiler marks on the challenge's pages (owner, 2026-11-09): the
backstory has no spoiler tick, and "May spoil later chapters." appears nowhere under /challenge.

### Privacy §4, the remix challenge item

**Before** (its last two sentences, as reread on 2026-11-08):

> … When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture's record. A picture made with a closed model counts as three of your free pictures that day.

**After** (one sentence added at the end, the owner's shorter form):

> … When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture's record. A picture made with a closed model counts as three of your free pictures that day. If you add a backstory to a challenge picture, it is kept and shown with the picture.

### The rules

**Before:** none. **After**, after "Only remixes count …" and Submit's line, before "Entering is free…":

> You can add a short backstory in your own words; it’s shown as invented by you, not from the book.

### Backstory (new pictures only)

- On the publish screen of a new challenge picture: hints above the box (never put in it): "What changed for {Name}?" ·
  "Where are they now?" · "What do they want that they didn’t before?"; the box "Backstory (optional)", up to 400
  characters, with the publication line ("Public, permanent, GPL-3.0, shown with your name. You can hide it.").
- Under the picture: the backstory, then "Invented by {@maker}, not from the book".
- Approved (the agent's draft words): "The prompt check didn’t allow this backstory. Change it, or publish without it." ·
  "Publish without it" · "Write the backstory in up to 400 characters."
- Removed since v5: the tick "Mentions things from later in the book" and its "May spoil later chapters."; "Add
  backstory" and "Save backstory" (pictures already published get none).

### The Style row

- New first choice, selected by default (the owner's words): "Same as this picture". It adds no style text, so a remix
  keeps the look of the picture it starts from; the recipe records it ("Style: Same as this picture").
- v9 (owner, 2026-11-09): the row ships exactly "Same as this picture" (default), "Animated series" (once the owner
  publishes it), "Random" (drawing only from "Animated series"; in "How it was made": "Style: {style}, drawn at random";
  hidden while there's nothing to draw from), "Write your own". The site's other published styles aren't offered here.

### The look lines and the scene line (this edition's invention; owner-approved 2026-11-09), public in every recipe

v7 (owner, 2026-11-09): shorter look lines, and one scene line always after them, for every character and model.

- Zei: "Unless the change says otherwise: a man with light golden-tan skin and dark eyes."
- Gladias: "Unless the change says otherwise: a man with warm light-brown skin, a short beard and dark eyes."
- Bai: "Unless the change says otherwise: a woman with dark brown skin, tattooed arms and gold earrings."
- Seila: "Unless the change says otherwise: a woman with deep brown skin and small round gold-rimmed glasses."
- Deluin: "Unless the change says otherwise: a man with warm tan skin and dark brown eyes."
- Mu: "Unless the change says otherwise: a woman with medium brown skin and thin red-framed glasses."
- The scene line, always: "Unless the change says otherwise: one figure, in a scene that suits the change, not a character sheet."

(Before, v6: "Unless the change says otherwise: a young man of eighteen, slim and of medium height, light golden-tan skin, spiky
black hair with close-cut sides and one teal-blue streak, dark eyes." for Zei, and the like; no scene line.)

The prompt's order: the change words; "{Name} is the person in reference image 1, the main figure."; the look line; the
scene line; the style's text (none with "Same as this picture"); "Keep the face recognisable; change anything else the
words describe."; the no-lettering line.

## v10 (2026-11-09): GPT as the challenge's default, one character per picture, the FLUX block message — NOT YET REREAD

Drafted by the coding agent (Claude, a closed model by Anthropic). DRAFT until the owner rereads it. Nothing in
`src/lib/legal.ts` or `config/consent.json` has changed: every legal "after" below is a proposal only. If the owner
takes any of them, its key goes red until the owner says "reread" and the key is set: Privacy §3, §4 or §7 → **P6k**
(privacy `18g3ada`); Terms §8 → **P6l** (terms `1finiyh`); consent → a new version `own-words-v7` (everyone is asked
again) and P6t/P6j's wording checks follow it.

### What the code now does (the owner's decisions of 2026-11-09)

- **The default.** The Model row starts on GPT Image 2.5 Sunburst for someone signed in with Farcaster, Lens or Bluesky
  (not a wallet account), where OpenAI serves (its supported countries without the embargoed ones; nothing when the
  country header is missing), with closed models on and at least 3 of today's pictures left. Everyone else starts on
  FLUX. The row's order is unchanged (FLUX first, one tap away). At entries close (`CHALLENGE.dates.closes`,
  2026-11-30T08:00:00Z = 29 Nov 23:59:59 PT) everyone starts on FLUX again, by itself. Recorded as P3's one exception
  in `docs/principles.md`; P3e accepts exactly it and fails on anything wider.
  - *Added by this agent, for the owner to confirm:* someone with fewer than 3 pictures left starts on FLUX (GPT would
    be refused for them); a request with no `model` still means FLUX on the server (the screen always sends one).
- **The OpenAI line** shows under the Model row whenever GPT is selected, the default on first load included:
  "a closed model by OpenAI · costs us about $0.05 · OpenAI may keep your prompt and picture up to 30 days · uses 3 of today's pictures".
- **The notice and the 18+ box, where they now appear.** On first load nothing interrupts: the page shows the OpenAI
  line under the Model row. When the person presses **Make it** with GPT selected and this device hasn't answered
  OpenAI's notice (or the 18+ box), the notice appears in place of that line, under the Model row, right above "Make
  it" (the page isn't scrolled: owner, 2026-11-07), with the 18+ box the first time on the device; nothing is sent. Once it is answered ("OK" or "Don't remind me
  again"), the picture is made straight away with the words as they are then. Tapping FLUX instead closes it. The
  server still refuses a closed picture without the notice version and the 18+ answer (unchanged). Picking GPT by
  tapping its chip shows the notice at the tap, as before.
- **The spending caps** (owner, 2026-11-09, after the coordinator's read): the challenge's free (site-wide) cap is
  $25 a day (was $15) and the closed cap $20 (was $5), so FLUX always keeps at least $5 of the day: a closed picture
  stops once closed spending would pass $20, or once the day's whole free spending (open and closed, prompt checks
  included) would pass $20; an open picture goes on to $25. Outside the challenge's window (the $2 cap) no closed
  picture can be made at all, which includes admins trying GPT before the owner turns `CHALLENGE.public` on. Tested
  (M4h: GPT spending can never stop FLUX). No legal text names these amounts (checked: Terms, Privacy, consent and
  About name none of them).
- **One character per picture.** Change words naming another challenge character (Zei, Gladias, Bai, Seila, Deluin,
  Mu; a whole word, any case) are refused before any model or check runs, so the attempt uses none of today's
  pictures. The screen says it at "Make it", before any notice or request; the server refuses it too. Only the change
  box is read, not a "Write your own" style.
- **A FLUX picture fal's safety checker blocks** uses none of today's pictures (its spend still counts against the
  caps; fal's checker stays on), at most 3 times a person a UTC day; the 4th and later count as usual. This needs
  `0041_image_asks_back.sql` (a new append-only table, studio.image_asks_back). Until the owner applies it, the site
  checks for the table on each count and give-back (`to_regclass`), finds none, and counts a blocked picture as
  before; nothing else changes and nothing fails (tested: M4g with the table hidden). Prompt-check refusals, and a
  closed model's own refusals, still count as before.

### New texts on the remix screen (the owner's words, exact)

- The one-character refusal: "One character per picture for now, so leave {Other} out: this picture is of {Name}."
  e.g. "One character per picture for now, so leave Bai out: this picture is of Zei."
- The FLUX block message, for someone who can use a closed model here: "This picture was blocked by the open model's
  safety check. Try other words, or a closed model."; for anyone else (a wallet account, outside OpenAI's and Google's
  regions, no country header): "This picture was blocked by the open model's safety check. Try other words."
  (Before, everywhere: "The image was flagged by the safety checker and dropped." It stays so outside the challenge
  and for closed models.)

### Every text that assumes an open default, with a draft

**Legal texts (proposals only; none changed).**

1. Privacy §3, Kept on your device only.
   Before: "If you choose a closed model for a challenge picture, it also stores that you confirmed you are 18 or older, and which makers' notices you asked not to be shown again; with each such picture we receive only that you confirmed, and don't keep it."
   After (draft): "If you make a challenge picture with a closed model, it also stores that you confirmed you are 18 or older, and which makers' notices you asked not to be shown again; with each such picture we receive only that you confirmed, and don't keep it."
   Agent's view: still true as it stands (the device stores the answers only once the person answers the notice to
   make a closed picture); the draft avoids "choose" now that GPT is pre-selected. → P6k.
2. Privacy §4, the remix challenge item.
   Before: "When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture's record."
   After (draft): "When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture's record; until entries close, a closed model by OpenAI is chosen to start with where it can be used."
   Agent's view: the before is still true; the draft says the default, as the screen shows it. → P6k.
3. Privacy §7, the closed-models item.
   Before: "If you choose a closed model for a challenge picture, its maker, OpenAI or Google, receives through Vercel AI Gateway your prompt and the picture you chose. …"
   After (draft): "If you make a challenge picture with a closed model, its maker, OpenAI or Google, receives through Vercel AI Gateway your prompt and the picture you chose. …" (the rest unchanged).
   Agent's view: still true (nothing reaches OpenAI until the person presses Make it with GPT selected and answers the
   notice); the draft avoids "choose". P6t reads this item's maker and retention words, which don't change. → P6k.
4. Terms §8, AI-made material.
   Before: "Some pictures are made with closed models by OpenAI and Google, by the project or by someone who chooses one for a challenge picture, …"
   After (draft): "Some pictures are made with closed models by OpenAI and Google, by the project or by someone making a challenge picture with one, …"
   Agent's view: optional, as 1–3. → P6l.
5. Consent own-words-v6.
   Before: "If you choose a closed model for a challenge picture, your prompt and the picture you chose go through Vercel AI Gateway to its maker instead of fal.ai: …"
   After (draft, as own-words-v7): "If you make a challenge picture with a closed model, your prompt and the picture you chose go through Vercel AI Gateway to its maker instead of fal.ai: …"
   Agent's view: keep v6 unless the owner takes 1–4: a new version asks everyone again, and v6 is still true.
6. About, "Where it runs": "… and for a challenge picture someone makes with one of their closed models …" — no
   open default assumed; no change proposed.
7. The notices (OpenAI, Google; version 4): "OpenAI receives your prompt and the picture you chose …" — true whether GPT
   was tapped or pre-selected; no change proposed (a change would need notice version 5).

**Screen and page texts (not legal).**

8. The Model row's chips and heading: unchanged; FLUX stays first. No chip says "default" on the challenge screen
   (`MODEL_WORDING.openDefault`, "Open (default)", is defined but not shown there; the sheet form's "The site's open
   models (the default)" is the sheet form's, not the challenge's, and stays true there).
9. Too few left: "A closed model uses 3 of today's pictures; you have {n} left, enough for the open models. More pictures at {reset}." — still true; someone with fewer than 3 left now starts on FLUX, so it shows only if they tap GPT.
10. The closed-limit refusal: "A closed model uses 3 of today's pictures, and you have fewer left. You can still use an open model." — still true.
11. The closed-cap refusal: "Closed models have reached today's spending limit for everyone. The open models still work; closed ones come back at {reset}." — still true (FLUX keeps $5); with GPT the default, more people will see it once the $20 is reached. *Proposal:* none (the screen doesn't switch the default to FLUX when the closed cap is reached; it could, if the owner wants).
12. The rules intro: "… pick a style and a model, and publish it. …" — no default assumed.

**Principles and checks.**

13. `docs/principles.md` P3: the exception recorded (owner, 2026-11-09, challenge only, ends 29 Nov), and P3e's
    description of the challenge's row updated (Qwen gone, FLUX first, the exception checked).
14. check:principles P3e's name, as printed: "the default is open: the remix form's and the challenge's model choice
    list the open models first, as the default (one exception: GPT Image 2.5 Sunburst for the challenge, for those who
    can use it, until entries close); closed ones name their maker and are allowlisted". Principle 3's own heading
    ("… Open-weight models are preferred. Report any closed model in use.") is unchanged.

## v11 (2026-11-09): the final review (coordinator reviewed, owner approved)

Drafted by the coding agent (Claude, a closed model by Anthropic).

### Privacy §4, the remix challenge item — changed; awaits the owner's reread (P6k red, new key `k5nsr6`)

**Before** (the sentence, as reread on 2026-11-08):

> When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture's record.

**After** (the owner's words, exactly):

> When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture's record. Until entries close, the closed model by OpenAI is chosen to start with if you can use it; you can change it before you make the picture.

The whole item after the change (verbatim from `src/lib/legal.ts`):

> If you take part in the remix challenge: for each picture of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check: Neynar's score for a Farcaster account, the Bluesky check for a Bluesky account), decided once, when you publish it, and kept with the time it was decided; and each picture you submit as an entry, with its character and when you submitted it. Submitting needs the link to your own post about it, which is kept and listed on the picture's page like any post you add (below); for a Farcaster, Bluesky or Lens post, the site checks with its network that you wrote it. If you withdraw a submission, it stops being an entry but is kept, marked withdrawn, with when; the post stays listed until you remove it. Whether a picture is an entry is shown on its page and on the challenge page, with how many people have submitted for each character. When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture's record. Until entries close, the closed model by OpenAI is chosen to start with if you can use it; you can change it before you make the picture. A picture made with a closed model counts as three of your free pictures that day. If you add a backstory to a challenge picture, it is kept and shown with the picture.

Not taken (the owner, 2026-11-09): v10's proposals 1, 3, 4 and 5 (Privacy §3, Privacy §7, Terms §8, consent v7).
Consent stays own-words-v6; Terms unchanged. Approved as written: the one-character refusal and both FLUX block messages.

### Behaviours

- Fewer than 3 pictures left: the row starts on FLUX (approved).
- **Changed:** when the closed cap is reached, or would be by one more closed picture (GPT's worst case), the row starts
  on FLUX and shows, under the Model row, the cap line: "Closed models have reached today's spending limit for
  everyone. The open models still work; closed ones come back at {reset}." (`{reset}` in the visitor's own time,
  written by the browser). The row never starts on a model that will refuse.

### The Style row

`CHALLENGE.offeredStyles` = "Animated series", "Comic book", "Comic 3D mix", in that order (whatever order they are
published in). The row: "Same as this picture" (default), the three once published, "Random" (drawing only from the
published offered ones), "Write your own". The styles' prompt texts (the owner's words from the style test, the part
after the colon; public in every recipe that uses them):

- Animated series: "Animated series look: clean bold black ink outlines of even weight, flat saturated cel colour with a single hard-edged shadow tone, simple graphic shapes, large expressive eyes and readable eyebrows, lively faces full of personality, slightly stylised proportions, crisp characters against soft muted backgrounds, clear readable faces and hands." (unchanged)
- Comic book: "bold black ink outlines, flat bright colours, dot-pattern shading, dramatic angle"
- Comic 3D mix: "3D forms drawn over with hand-inked lines, halftone dots and hatching in the shadows, slightly offset colour printing, bold graphic colour"

The owner publishes them after the merge: `npx tsx --conditions=react-server --env-file-if-exists=.env.local
scripts/publish-style.ts` (dry run), then the same with `--apply --confirm-owner-go`. It refuses any style whose name
already exists and publishes the others; `--only=<title>` for one.

## v12 (2026-11-09, branch challenge-settings): the settings pool and Mood — DRAFT, for the owner

Drafted by the coding agent (Claude, a closed model by Anthropic). No legal text changes: Privacy §4 already says
the model and its maker are in the picture's record, and the setting is part of the recipe, public like the rest of it
(the exact prompt included). Keys unchanged: privacy `k5nsr6` (reread by the owner, set on main), terms `1finiyh`;
P6k and P6l pass. Consent stays own-words-v6.

### The setting line (closed models only: GPT Image 2.5 Sunburst and Gemini 3.1 Flash Image; never FLUX)

Right after the scene line, the owner's words, with `{setting}` drawn evenly at random per picture, on the server, at
make time:

> Set it in this world, where it fits: a near future, not a fantasy or medieval past; {setting}. Show this world's own version of anything mentioned, like its games, sports, clothes, vehicles and buildings.

The four settings (this edition's descriptions of the book's setting, not quotes; each cited block checked to exist in
`content/snowmoon/text`). Setting B ("greenery mixed with glass-and-steel buildings with sharp edges", c3-b72, c13-b24)
was dropped by the owner the same day (it gave generic towers on GPT and Gemini); the other letters stay:

- E: "a half-kilometre-tall mountain pyramid at the edge of the city" (c4-b48)
- A: "stone-brick houses behind tall trees, tall apartment towers with many windows above the treetops, small drones overhead" (c1-b2, c1-b13, c1-b4)
- C: "a chaotic mix of stone, concrete and glass-and-steel buildings, tall and short, some half-built" (c5-b11, c22-b2)
- D: "people with watches and hand devices, gates with glowing green circles, small robots with screen faces" (c1-b4, c1-b41, c3-b82)

The prompt's order for a closed model: the change words; "{Name} is the person in reference image 1, the main
figure."; the look line; the scene line; **the setting line**; the style's text (none with "Same as this picture");
"Keep the face recognisable; change anything else the words describe."; the no-lettering line. FLUX's prompt is
unchanged.

### In the recipe and "How it was made" (DRAFT wording)

The recipe records the draw under `challenge.setting`: its letter, its text and its blocks. "How it was made" (the
picture's /image page, and the preview before publishing) shows:

- heading: "Setting (this edition’s description of the book’s setting, not a quote)"
- line: "{text}. Drawn at random from four for a closed model (setting {letter}); it describes the book at {blocks}."
  e.g. "stone-brick houses behind tall trees, tall apartment towers with many windows above the treetops, small drones
  overhead. Drawn at random from four for a closed model (setting A); it describes the book at c1-b2, c1-b13, c1-b4."

It cites the blocks by id and shows none of the book's text.

### P5g

The draw is the challenge's one uniform shuffle (`shuffleFresh(CHALLENGE_SETTINGS, random)[0]`), recorded in
`docs/principles.md` P5g as part of the Random exception (owner, 2026-11-09); check:principles P5g allows it in
`src/lib/challenge/settings.ts` only.

### Mood, the fourth offered style

`CHALLENGE.offeredStyles` = "Animated series", "Comic book", "Comic 3D mix", "Mood", in that order. Mood is already
published on production as "Mood" (exact case) by @naaate, version 712ca63f-de6e-46bf-b3ad-7007b1120e16 (2026-10-15);
its text, read from its public page:

> Intense, highly detailed graphic novel look. Moody. Expressive. Dark lines, bold colors. Visible brushstrokes.

It names no artist, studio or film (tested). `scripts/publish-style.ts` lists it and refuses it on production (it
exists); the Style row is "Same as this picture", Animated series, Comic book, Comic 3D mix, Mood, Random, Write your own.

