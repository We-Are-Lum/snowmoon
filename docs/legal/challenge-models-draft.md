# Model choice on the challenge's remix screen: Privacy, Terms, About, the notices, the 18+ line and consent v6 (DRAFT, not reread)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-08, on branch `challenge-models`. **DRAFT:
not reread by the owner.** Not legal advice. It adapts [`remix-model-choice-draft.md`](remix-model-choice-draft.md) (v4,
the owner's decisions of 2026-11-04 stand: one notice per maker, a one-time 18+ box remembered on the device only,
Gemini allowed for remixers, the two retention descriptions word for word) from the sheet form to the challenge's
one-picture remix screen, and [`age-terms-closed-models.md`](age-terms-closed-models.md).

Legal texts describe today: these words are in `src/lib/legal.ts`, `src/app/about/page.tsx` and `config/consent.json`
on this branch, which is the release that turns `CHALLENGE.modelChoice` on. Merge only after the owner says "reread"
(P6k, P6l fail until then: after the reread, `LEGAL.ownerReread.privacy.words` becomes `5m8tc2` and
`LEGAL.ownerReread.terms.words` becomes `hegeoz`), and only once `NEXT_remix_model_choice.sql` is applied.

"Before" is main at `00722d70`. Shortest true sentences; no labels, gateway accounts or changeable thresholds (the
number 3 and the caps are on the screen, not in the legal texts).

## What the code does, which the words must match

- The remix screen's Model row lists, in order: **FLUX.2 [klein] 4B edit** (Black Forest Labs, open weights,
  Apache-2.0, fal.ai; the default), **Qwen-Image-Edit** (Alibaba's Qwen team, open weights, Apache-2.0, fal.ai,
  `fal-ai/qwen-image-edit-plus` = 2509), **GPT Image 2.5 Sunburst** (a closed model by OpenAI, Vercel AI Gateway, provider
  `openai` only), **Gemini 3.1 Flash Image** (a closed model by Google, Vercel AI Gateway, provider `vertex` only, never
  `google`).
- Each model gets the person's prompt and the picture they tapped as its single reference image (the open default keeps
  today's extra references, the other characters' looks). The maker receives nothing else: no FID, name, IP, country.
- **Country:** the server reads Vercel's `x-vercel-ip-country` (and, for Ukraine only, `x-vercel-ip-country-region`)
  for that one request, to decide which closed models to offer and accept; it is never stored, logged or sent on.
  OpenAI's model only in OpenAI's supported countries; Google's everywhere but the embargoed set; neither in Cuba, Iran,
  North Korea, Syria, Crimea, Sevastopol, Donetsk or Luhansk (nor a Ukrainian connection with no region). No header: no
  closed model.
- **Notice and 18+:** the first time a device picks a maker's model, its notice shows; the first notice also asks "I'm 18
  or older". Both answers stay on the device. New on this branch: the make request for a closed model carries
  `notice: { version, adult: true }`, and the server refuses a closed model without it (it can't verify it; it only
  refuses a request that skipped the screen). Nothing of it is kept. That is why Privacy §3's new sentence says "we
  receive only that you confirmed, and don't keep it" (owner question 1 below).
- **Counts:** a closed picture counts as 3 of the day's free pictures, and also within the closed models' own daily
  count (6) and closed spend cap ($5 inside the free cap). Wallet (prepaid) accounts can't choose a closed model.
- The recipe names the model and its terms ("a closed model by OpenAI"), records the endpoint, the host and the cost,
  and for a closed model that no host safety checker ran and the "can't be re-run exactly" line.

## Privacy §3 (Kept on your device only)

One sentence added before "These stay on your device, except that …":

> If you choose a closed model for a challenge picture, it also stores that you confirmed you are 18 or older, and which makers' notices you asked not to be shown again; with each such picture we receive only that you confirmed, and don't keep it.

**Before:**

> Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its answers, drafts of images you make until you publish them, a few other settings of yours, and, on the website, your sign-in, which lasts about an hour (a day for a wallet, Lens or Bluesky sign-in), a note of a Bluesky sign-in under way, kept in that tab for at most ten minutes, the Bluesky handle you last signed in with, to fill it in next time, and a payment you have sent but not yet seen credited. These stay on your device, except that the assistant sends the furthest chapter, as a number (or another chapter you choose for a conversation), with each question and its search of the book, so that answers stay within it; it isn't kept. Clearing your browser's site data removes them. Frames you make in Remix are not drafts: they are saved by us as soon as they are made (section 4). So are the frames and video tests your agent makes when you approve them, but privately: only you can see them (section 4).

**After:**

> Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its answers, drafts of images you make until you publish them, a few other settings of yours, and, on the website, your sign-in, which lasts about an hour (a day for a wallet, Lens or Bluesky sign-in), a note of a Bluesky sign-in under way, kept in that tab for at most ten minutes, the Bluesky handle you last signed in with, to fill it in next time, and a payment you have sent but not yet seen credited. If you choose a closed model for a challenge picture, it also stores that you confirmed you are 18 or older, and which makers' notices you asked not to be shown again; with each such picture we receive only that you confirmed, and don't keep it. These stay on your device, except that the assistant sends the furthest chapter, as a number (or another chapter you choose for a conversation), with each question and its search of the book, so that answers stay within it; it isn't kept. Clearing your browser's site data removes them. Frames you make in Remix are not drafts: they are saved by us as soon as they are made (section 4). So are the frames and video tests your agent makes when you approve them, but privately: only you can see them (section 4).

## Privacy §4 (Kept by us when you sign in): the remix challenge item

Two sentences added at its end:

> When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture's record. We count the pictures you make with closed models apart from the others each day.

**Before:**

> If you take part in the remix challenge: for each picture of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check: Neynar's score for a Farcaster account, the Bluesky check for a Bluesky account), decided once, when you publish it, and kept with the time it was decided; and each picture you submit as an entry, with its character and when you submitted it. Submitting needs the link to your own post about it, which is kept and listed on the picture's page like any post you add (below); for a Farcaster, Bluesky or Lens post, the site checks with its network that you wrote it. If you withdraw a submission, it stops being an entry but is kept, marked withdrawn, with when; the post stays listed until you remove it. Whether a picture is an entry is shown on its page and on the challenge page, with how many people have submitted for each character.

**After:**

> If you take part in the remix challenge: for each picture of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check: Neynar's score for a Farcaster account, the Bluesky check for a Bluesky account), decided once, when you publish it, and kept with the time it was decided; and each picture you submit as an entry, with its character and when you submitted it. Submitting needs the link to your own post about it, which is kept and listed on the picture's page like any post you add (below); for a Farcaster, Bluesky or Lens post, the site checks with its network that you wrote it. If you withdraw a submission, it stops being an entry but is kept, marked withdrawn, with when; the post stays listed until you remove it. Whether a picture is an entry is shown on its page and on the challenge page, with how many people have submitted for each character. When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture's record. We count the pictures you make with closed models apart from the others each day.

## Privacy §7 (Outside services): the Vercel item (the country line)

**Before:**

> Vercel hosts the site and sees your IP address and browser details, as any web host does.

**After:**

> Vercel hosts the site and sees your IP address and browser details, as any web host does. To offer a model only where its maker serves, we read the country your connection comes from; we don't keep it.

## Privacy §7: one new item, after the fal.ai item and before the project's own OpenAI/Google item

**Before:** none. (The sheet form's item in remix-model-choice-draft.md, "If you choose a closed model when you remix a
character's sheet …", is not used: the sheet form stays off.)

**After:**

> If you choose a closed model for a challenge picture, its maker, OpenAI or Google, receives through Vercel AI Gateway your prompt and the picture you chose. It receives nothing else about you, and may not train on them. OpenAI may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law. Google keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days. The gateway keeps no copy.

The project's own OpenAI/Google item (bases, styles, references) is unchanged. Qwen-Image-Edit runs on fal.ai, which the
fal.ai item already covers ("the prompt for an image you make, and any pictures sent with it"); no change.

## Terms §8 (AI-made material)

**Before:**

> The narration, many pictures (every frame made in Remix among them) and the assistant's answers are produced by AI models and are labelled as such. They can be wrong. The assistant's commentary is not the book and is not advice of any kind. Some of the project's own pictures are made with closed models by OpenAI and Google, or by the owner with Midjourney outside the Service, named with their maker on each picture's recipe; they are offered under the licence in section 3, as far as anyone holds rights in them, and their makers' terms bind us, not you.

**After:**

> The narration, many pictures (every frame made in Remix among them) and the assistant's answers are produced by AI models and are labelled as such. They can be wrong. The assistant's commentary is not the book and is not advice of any kind. Some pictures are made with closed models by OpenAI and Google, by the project or by someone who chooses one for a challenge picture, or by the owner with Midjourney outside the Service, named with their maker on each picture's recipe; they are offered under the licence in section 3, as far as anyone holds rights in them, and their makers' terms bind us, not you.

No Terms §4 change: the owner chose the device-only 18+ box (2026-11-04), and §4 already says signing in needs 18.

## About, "Where it runs"

**Before:**

> … Supabase holds the database. OpenAI and Google receive, through Vercel AI Gateway, the prompts and pictures for some of the project's own pictures, and nothing about you, and neither may train on them (OpenAI may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law; Google keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days). …

**After:**

> … Supabase holds the database. OpenAI and Google receive, through Vercel AI Gateway, the prompts and pictures for some of the project's own pictures and for a challenge picture someone makes with one of their closed models, and nothing about you, and neither may train on them (OpenAI may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law; Google keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days). …

## The notices (`MODEL_NOTICES`, notice version 2 → 3 for both makers)

Only the middle paragraph changes. A device that chose "Don't remind me again" for version 2 sees version 3 once.

**OpenAI. Before (v2):**

> OpenAI receives your prompt for each view and, for the side and back, the front view it made, through Vercel AI Gateway. Nothing else about you.

**After (v3):**

> OpenAI receives your prompt and the picture you chose, through Vercel AI Gateway. Nothing else about you.

**Google. Before (v2):**

> Google receives your prompt for each view and, for the side and back, the front view it made, through Vercel AI Gateway. Nothing else about you.

**After (v3):**

> Google receives your prompt and the picture you chose, through Vercel AI Gateway. Nothing else about you.

Unchanged: the titles ("A closed model by OpenAI", "A closed model by Google"), the first paragraphs ("… Its weights
aren't published, so its recipe can't be re-run exactly."), the last paragraphs (the two retention descriptions, "It
doesn't train its models on them. The gateway keeps no copy."), the labels ("OpenAI keeps prompts up to 30 days",
"Google keeps no copy past 24 hours") and the buttons ("OK" · "Don't remind me again"). The sheet form (off) shares
these notices: it would need its own middle paragraph back before its switch goes on.

## The 18+ line (unchanged)

> Closed models are for people 18 or older, as signing in here is (Terms, section 4).
>
> ☐ I'm 18 or older

## Consent own-words-v6

v5's words, with one sentence added to the last paragraph after "… to check its age and recent posts.":

> If you choose a closed model for a challenge picture, your prompt and the picture you chose go through Vercel AI Gateway to its maker instead of fal.ai: OpenAI, which may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law, or Google, which keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days.

**Before (own-words-v5, last paragraph):**

> To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to fal.ai to make it, and your Farcaster ID to Neynar to check your account's score. With a Lens account, its address goes to Lens instead, to check its Lens score; with a Bluesky account, its identifier goes to Bluesky, to check its age and recent posts. In Remix, every frame you make is saved and public at its link as soon as it is made, with your words. Elsewhere, drafts you don’t publish stay on your device.

**After (own-words-v6, last paragraph):**

> To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to fal.ai to make it, and your Farcaster ID to Neynar to check your account's score. With a Lens account, its address goes to Lens instead, to check its Lens score; with a Bluesky account, its identifier goes to Bluesky, to check its age and recent posts. If you choose a closed model for a challenge picture, your prompt and the picture you chose go through Vercel AI Gateway to its maker instead of fal.ai: OpenAI, which may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law, or Google, which keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days. In Remix, every frame you make is saved and public at its link as soon as it is made, with your words. Elsewhere, drafts you don’t publish stay on your device.

Everything else in v6 is v5 word for word. Everyone who agreed to v5 is asked again before their next Generate or publish.

## OpenAI's supported countries: source

<https://developers.openai.com/api/docs/supported-countries>, read 2026-11-08 by the agent's fetch tool (HTTP 200; no
"last updated" date on the page): 208 countries and territories, copied by name with ISO codes in
`src/lib/images/countries.ts`. The page: "Accessing or offering access to our services outside of the countries and
territories listed below … may result in your account being blocked or suspended". Not on it (so GPT is not offered
there): among others Russia, Belarus, China, Hong Kong, Macau, Venezuela, Cuba, Iran, North Korea, Syria, and US
territories the header reports as their own country (Puerto Rico, Guam, the US Virgin Islands …). "Ukraine (with certain
exceptions)" is read as the sanctioned regions.

## Cost per picture (today's prices)

| Model | Usually | Reserved before (worst case, with the prompt check's $0.0015) | Source |
| --- | --- | --- | --- |
| FLUX.2 [klein] 4B edit | ~$0.012 (1024 × 576 out + the picture, $0.01/MP) | as today, `editReserveUsd(references)` | fal pricing API |
| Qwen-Image-Edit (2509) | ~$0.048 ($0.03 × (1 MP at least + ~0.59 MP reference)) | the same formula | fal's page "$0.03 per megapixel" (coordinator, 2026-11-08); **rounding to confirm** |
| GPT Image 2.5 Sunburst | ~$0.047 (bases, measured with one reference) | $0.0815 | the gateway's reported cost, 2026-11-03 |
| Gemini 3.1 Flash Image | ~$0.068 (bases, measured) | $0.0915 | the gateway's reported cost, 2026-11-03 |

## Decisions owed (the owner's)

1. **The 18+ answer reaches the server as a yes** with each closed picture (not kept), so the server can refuse a
   request that skipped the notice. The 2026-11-04 decision said nothing is sent. Keep this (Privacy §3 says so), or go
   back to device-only and accept that the server can't refuse it?
2. **Ukraine:** Donetsk and Luhansk are refused as whole regions (the header can't tell the line of control), and so is
   a Ukrainian connection with no region. Zaporizhzhia and Kherson are not refused (not under the comprehensive
   sanctions). OK?
3. **Gemini in countries OpenAI doesn't serve** (e.g. Russia, China): offered, since Google publishes no end-user list
   for Vertex and only the embargoed set is excluded. OK?
4. **Counting:** a closed picture uses 3 of the 10 free pictures *and* one of the closed models' own 6. With 10 a day,
   only admins (300 a day) ever reach the 6. Keep both, or drop the 6?
5. The picture is converted to 1024 × 576 by fitting the whole picture and padding (GPT returns 3:2, so thin side bars);
   crop instead?
6. Whether a closed-model picture can be a challenge entry (remix-model-choice-draft.md, decision 7): today it can.
7. Qwen: keep 2509 (`fal-ai/qwen-image-edit-plus`) or switch to 2511 (`fal-ai/qwen-image-edit-2511`, one config entry).
8. Reread every line above. The Model row's own words (`src/lib/challenge/model-wording.ts`) are draft wording too.
