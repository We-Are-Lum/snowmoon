# Model choice on the challenge's remix screen: Privacy, Terms, About, the notices, the 18+ line and consent v6 (DRAFT v2, not reread)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-08, on branch `challenge-models`. **v2**
(same day) applies the owner's decisions after the coordinator's review (the retention lines approved as drafted): the
18+ "yes" reaches the server, never kept (kept); Ukraine as drafted (counsel question 6); one country list for both
closed models; no separate per-person closed count, and Privacy §4's last sentence in the owner's words; GPT pictures
cropped to 16:9, not padded; closed-model pictures can be entries; Qwen 2509; the wallet line; the Terms §8 coverage
table below and counsel question 7. **DRAFT:
not reread by the owner.** Not legal advice. It adapts [`remix-model-choice-draft.md`](remix-model-choice-draft.md) (v4,
the owner's decisions of 2026-11-04 stand: one notice per maker, a one-time 18+ box remembered on the device only,
Gemini allowed for remixers, the two retention descriptions word for word) from the sheet form to the challenge's
one-picture remix screen, and [`age-terms-closed-models.md`](age-terms-closed-models.md).

Legal texts describe today: these words are in `src/lib/legal.ts`, `src/app/about/page.tsx` and `config/consent.json`
on this branch, which is the release that turns `CHALLENGE.modelChoice` on. Merge only after the owner says "reread"
(P6k, P6l fail until then: after the reread, `LEGAL.ownerReread.privacy.words` becomes `d8fe0h` and
`LEGAL.ownerReread.terms.words` becomes `fyqkb6`; v2's keys, which also cover challenge-simple's §6e redraft, merged in
here from `docs/legal/challenge-simple-draft.md`), and only once `NEXT_remix_model_choice.sql` is applied.

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
  One list for both closed models (owner, v2): OpenAI's supported countries, minus the embargoed set (Cuba, Iran, North
  Korea, Syria, Crimea, Sevastopol, Donetsk, Luhansk, and a Ukrainian connection with no region). No header: no closed
  model.
- **Notice and 18+:** the first time a device picks a maker's model, its notice shows; the first notice also asks "I'm 18
  or older". Both answers stay on the device. New on this branch: the make request for a closed model carries
  `notice: { version, adult: true }`, and the server refuses a closed model without it (it can't verify it; it only
  refuses a request that skipped the screen). Nothing of it is kept. That is why Privacy §3's new sentence says "we
  receive only that you confirmed, and don't keep it" (owner question 1 below).
- **Counts:** a closed picture counts as 3 of the day's free pictures; no separate per-person closed count (v2: the 6 a
  day is gone); the closed spend cap ($5 inside the free cap) stays. Wallet (prepaid) accounts can't choose a closed
  model; their Model row says "Closed models need a Farcaster, Lens or Bluesky sign-in." (the owner's words).
- **Shape:** a closed picture is cropped to 16:9, never padded: GPT's 1536 × 1024 loses 160 rows, 40 from the top and
  120 from the bottom (a quarter and three quarters), so heads stay. Its recipe's settings say "cropped from 3:2 to
  16:9, mostly from the bottom" (DRAFT words; also "not cropped (already 16:9)" and "cropped from … to 16:9, from both
  sides" for other shapes), with the pixels removed.
- **Refusals:** a picture the model's own check refuses (Qwen's 422 content_policy_violation, a gateway moderation
  block) or the host's checker flags (FLUX's blacked-out picture) gets the usual "dropped" answer: counted, nothing
  shown, recorded as flagged, not as a success.
- **Qwen's size:** it ignores the size asked and returns 1376 × 768; the picture is cropped and scaled to 1024 × 576
  like a closed one, and the recipe records the size it returned.
- **Content credentials:** GPT's and Gemini's originals carry a C2PA manifest; the site's JPEG doesn't keep it, and the
  recipe's settings say so ("the original had a C2PA manifest from its maker; the JPEG does not keep it").
- The prompt check gets the same budget as a sheet's views (1,200 tokens); at 400, 62 of 90 style-test prompts came
  back "unclear" and were refused.
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

Two sentences added at its end (the second in the owner's words, v2):

> When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture's record. A picture made with a closed model counts as three of your free pictures that day.

**Before:**

> If you take part in the remix challenge: for each picture of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check: Neynar's score for a Farcaster account, the Bluesky check for a Bluesky account), decided once, when you publish it, and kept with the time it was decided; and each picture you submit as an entry, with its character and when you submitted it. Submitting needs the link to your own post about it, which is kept and listed on the picture's page like any post you add (below); for a Farcaster, Bluesky or Lens post, the site checks with its network that you wrote it. If you withdraw a submission, it stops being an entry but is kept, marked withdrawn, with when; the post stays listed until you remove it. Whether a picture is an entry is shown on its page and on the challenge page, with how many people have submitted for each character.

**After:**

> If you take part in the remix challenge: for each picture of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check: Neynar's score for a Farcaster account, the Bluesky check for a Bluesky account), decided once, when you publish it, and kept with the time it was decided; and each picture you submit as an entry, with its character and when you submitted it. Submitting needs the link to your own post about it, which is kept and listed on the picture's page like any post you add (below); for a Farcaster, Bluesky or Lens post, the site checks with its network that you wrote it. If you withdraw a submission, it stops being an entry but is kept, marked withdrawn, with when; the post stays listed until you remove it. Whether a picture is an entry is shown on its page and on the challenge page, with how many people have submitted for each character. When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture's record. A picture made with a closed model counts as three of your free pictures that day.

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
there, and since v2 neither is Gemini): among others Russia, Belarus, China, Hong Kong, Macau, Venezuela, Cuba, Iran,
North Korea, Syria, and US territories the header reports as their own country (Puerto Rico, Guam, the US Virgin Islands
…). "Ukraine (with certain exceptions)" is read as the sanctioned regions.

## Cost per picture (today's prices)

| Model | Usually | Reserved before (worst case, with the prompt check's $0.0015) | Source |
| --- | --- | --- | --- |
| FLUX.2 [klein] 4B edit | ~$0.012 (1024 × 576 out + the picture, $0.01/MP) | as today, `editReserveUsd(references)` | fal pricing API |
| Qwen-Image-Edit (2509) | $0.06 (it returns 1376 × 768 whatever size is asked, and fal bills whole megapixels: 2 × $0.03) | $0.0615 | the style test of 2026-11-08 (branch style-test, its ledger); fal's page "$0.03 per megapixel" |
| GPT Image 2.5 Sunburst | ~$0.047 (bases, measured with one reference) | $0.0815 | the gateway's reported cost, 2026-11-03 |
| Gemini 3.1 Flash Image | ~$0.068 (bases, measured) | $0.0915 | the gateway's reported cost, 2026-11-03 |

## Visible words added in v2 (DRAFT, for the owner)

- The Model row, for a wallet account: "Closed models need a Farcaster, Lens or Bluesky sign-in." (the owner's exact
  words; also the route's refusal).
- The crop, in the recipe's settings: "cropped from 3:2 to 16:9, mostly from the bottom" (DRAFT).
- Under a closed pick (DRAFT, `src/lib/challenge/model-wording.ts`): "a closed model by {maker} · about $0.05 a picture ·
  {the maker's label} · Uses 3 of today's pictures".
- The refusal when fewer than 3 are left (DRAFT): "Not enough of today's pictures left for a closed model: each uses 3.
  The open models may still work; more at 00:00 UTC."

## Terms §8 and §6: do our rules cover the makers' policies? (v2, item 9)

Our rules: **Terms §6** "Don't post anything unlawful, harassing or sexual involving minors; don't post other people's
private information; don't impersonate anyone or present your work as the author's or as official; don't try to get
around sign-in, daily limits or spending caps; don't interfere with the Service." **The prompt check**
(`config/prompts/image-guard.md`, every prompt, before any model): minor, sexual, real_person, violence (gore, graphic
injury, torture), hateful, someone_elses_work, words; plus the blocked-names list; the rules shown above Generate: "No
real people. No sexual content. Nothing violent or hateful. No characters or logos from other works. Don't ask for words
in the picture." And the site's facts: sign-in needs 18+ (Terms §4); every picture is labelled AI-made with its recipe;
no words in pictures (so instructions, phishing text or slogans can't be drawn on purpose).

Sources: Google's Generative AI Prohibited Use Policy, <https://policies.google.com/terms/generative-ai/use-policy>,
"Last Modified: December 17, 2024", read 2026-11-08. OpenAI's Usage Policies, "Effective: October 29, 2025": the live
page refused the fetch (403); read from the copy printed 2025-11-07 that `age-terms-closed-models.md` cites
(<https://docs.databricks.com/aws/en/assets/files/usage-policies-openai-923e062e72487537e2a8df04bcec7f6d.pdf>),
text extracted 2026-11-08. **Re-check the OpenAI list on the live page in a browser.**

### Google

| Google's prohibited use | Our clause(s) | Covered? |
| --- | --- | --- |
| 1.1 child sexual abuse or exploitation | Terms §6 "sexual involving minors"; check: minor, sexual | Yes |
| 1.2 violent extremism or terrorism | Terms §6 "unlawful"; check: violence (gore only), hateful (hate symbols) | **Partly**: extremist praise or propaganda isn't named |
| 1.3 non-consensual intimate imagery | check: sexual, real_person | Yes (check); Terms only through "sexual involving minors" and "unlawful" |
| 1.4 self-harm | — | **Gap** |
| 1.5 illegal activities, instructions | Terms §6 "unlawful"; no words in pictures | Yes |
| 1.6 others' rights, privacy, IP | Terms §6 private information, impersonation; §5 your own work; check: real_person, someone_elses_work | Yes |
| 1.7 tracking people without consent | Terms §6 private information | Yes (not a picture use) |
| 1.8 automated high-stakes decisions | — | Not applicable (pictures only) |
| 2.1 spam, phishing, malware | Terms §6 "interfere with the Service"; no words in pictures | **Partly**: spam and phishing aren't named |
| 2.2 harm to Google's or others' services | Terms §6 "interfere with the Service" (ours only) | **Partly** |
| 2.3 circumventing safety filters | Terms §6 "get around sign-in, daily limits or spending caps" | **Gap**: the prompt check and the makers' filters aren't named |
| 3.1 hate | check: hateful; Terms §6 harassing | Yes |
| 3.2 harassment, bullying, abuse | Terms §6 harassing | Yes |
| 3.3 violence or incitement | check: violence (gore) | **Partly**: incitement isn't named |
| 3.4 sexually explicit content | check: sexual | Yes (check); **Terms gap**: §6 forbids only sexual content involving minors |
| 4.1 frauds, scams, deception | — | **Gap** |
| 4.2 impersonating someone, to deceive | Terms §6 "don't impersonate anyone"; check: real_person | Yes |
| 4.3 misleading claims of expertise | — | Not applicable (pictures, no words) |
| 4.4 misleading claims about elections or health | check: real_person, words | **Partly** |
| 4.5 claiming generated content is human-made | Terms §6 "present your work as the author's"; every picture labelled AI | **Partly**: passing off as hand-made isn't named |

### OpenAI

| OpenAI's prohibited use | Our clause(s) | Covered? |
| --- | --- | --- |
| Protect people: threats, intimidation, harassment, defamation | Terms §6 harassing, unlawful | Yes (defamation through "unlawful") |
| suicide, self-harm, disordered eating | — | **Gap** |
| sexual violence, non-consensual intimate content | check: sexual, real_person, violence | Yes (check) |
| terrorism or violence, incl. hate-based violence | check: violence, hateful; Terms "unlawful" | **Partly** (as Google 1.2, 3.3) |
| weapons development, procurement or use (incl. CBRNE) | Terms "unlawful"; no words in pictures | Yes for pictures (a picture of a weapon in the novel's story isn't development) |
| illicit activities, goods, services | Terms "unlawful" | Yes |
| breach of others' systems; infringing IP | Terms §6 interfere; §5; check: someone_elses_work | Yes for IP; **partly** for others' systems |
| real money gambling | — | Not applicable |
| tailored licensed advice | — | Not applicable |
| unsolicited safety testing | — | **Gap** |
| circumventing safeguards | Terms §6 (sign-in, limits, caps) | **Gap** (as Google 2.3) |
| national security or intelligence uses | — | Not applicable |
| Respect privacy: aggregating private information | Terms §6 private information | Yes |
| facial recognition, remote biometric identification, social scoring, emotion inference, crime prediction | — | Not applicable (no such feature) |
| likeness without consent, confusing authenticity | check: real_person; Terms §6 impersonation | Yes |
| Keep minors safe: CSAM | Terms §6; check: minor, sexual | Yes |
| grooming; dangerous challenges; underage sexual or violent roleplay; underage access to age-restricted goods | Terms §4 (18+ to sign in), §6 unlawful | Yes (no chat or roleplay in picture making) |
| exposing minors to age-inappropriate content | check: sexual, violence; 18+ sign-in | Yes |
| unhealthy dieting or exercise; body shaming of minors | check: minor (sexual only); Terms harassing | **Partly** |
| Empower people: academic dishonesty | — | Not applicable |
| deceit, fraud, scams, spam, impersonation | Terms §6 impersonation | **Partly** (as Google 4.1, 2.1) |
| political campaigning, lobbying, election interference | check: real_person | **Gap**: campaign material without a real person isn't named |
| automating high-stakes decisions | — | Not applicable |

### Proposed wording (not applied; for the owner and counsel)

Terms §6, one sentence in place of today's (shortest true):

> Don't post anything unlawful, harassing, sexual, or that promotes self-harm, terrorism or violence; don't post other people's private information; don't impersonate anyone or present your work as the author's or as official, or AI-made work as made by hand; don't use the Service to deceive, defraud, spam or campaign politically; don't try to get around sign-in, daily limits, spending caps or the safety checks, or test them without our permission; don't interfere with the Service or anyone else's.

The prompt check (`config/prompts/image-guard.md`), two categories added (the policy is public; changing it changes
what is refused, so it is the owner's call): **self_harm** ("self-harm, suicide or disordered eating, shown approvingly")
and **extremism** ("praise or propaganda for terrorist or violent extremist groups, or incitement to violence"); and
"campaign material for a real election, party or candidate" under real_person.

Counsel question 7 (added): "Does 'their makers' terms bind us, not you' still hold now that people choose closed
models?"

## Decisions owed (the owner's)

Decided 2026-11-08 (v2): 1 keep the 18+ "yes" to the server, never kept; 2 Ukraine as drafted (counsel question 6);
3 one list for both closed models; 4 no separate 6 a day, the $5 cap stays, Privacy §4 in the owner's words; 5 crop,
mostly from the bottom; 6 closed-model pictures can be entries; 7 Qwen 2509; 8 the wallet line.

Still owed:

1. Reread every line above (Privacy §3, §4, §7; Terms §8; About; the notices; consent v6) and the visible DRAFT words.
2. The Terms §6 and prompt-check proposals above.
3. The free daily number itself (3 or 10): the coordinator is asking; nothing here changes it.
4. OpenAI's Usage Policies on the live page (the fetch was refused).
