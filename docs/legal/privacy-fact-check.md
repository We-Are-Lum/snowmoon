# Privacy Policy: fact-check (2026-10-09)

Every factual statement on `/privacy` (the owner's legal starter, sections 1–11, words in
`src/lib/legal.ts`), checked against the code, migrations, config and principle checks of branch
`site-legal` (from main at `8dd5415`). The wording is not changed here; the owner changes it.

Verdicts: **true**; **false** (the code or schema says otherwise, including a list that leaves
something out); **can't tell** (not decidable from the repository); **true once
site-images-everyone merges** (the Neynar gate, judged against its spec: score ≥ 0.7, looked up at
Generate with only the FID, cached a day in a new table, invited FIDs skip; the code is not on this
branch). Minpentai Play is judged on branch `site-minpentai-play-2` (read-only; migration 0009 not
applied), so those lines are "true on site-minpentai-play-2, not live".

| # | Statement | Verdict | Evidence |
|---|---|---|---|
| 1.1 | Lum LLC, a Wyoming limited liability company, operates Snowmoon Party. | can't tell | Not in code. Indirect: `src/lib/config.ts:17` repo `We-Are-Lum/snowmoon`; `src/lib/config.ts:115` contact `snowmoon@wearelum.xyz`. |
| 2.1 | You can read and listen without an account. | true | Chapters, listen view, podcast need no sign-in; `getFid` is called only in the sign-in-gated API routes (`src/lib/auth.ts:21`); check:principles P4a names the signed-out exemptions. |
| 2.2 | We keep nothing about you when you read and listen without an account. | true for the app; can't tell for the host | No server write without a FID: every `insert` in `src/lib` and `src/app/api` follows `getFid` (e.g. `src/lib/chat/limits.ts:44`, `src/lib/images/limits.ts:40`, `src/lib/cards.ts:90`). Vercel's own request logs (IP, path) are kept by Vercel under its retention, outside the code. |
| 2.3 | We use no advertising or analytics trackers. | true | `package.json:36-52`: no analytics package (no `@vercel/analytics`, `@vercel/speed-insights`, gtag, Plausible, PostHog, Segment); no third-party script in `src/app/layout.tsx:54` (the theme script only); check:principles P6a fails on any off-site request from the production pages (`scripts/check-principles.ts:913`). |
| 2.4 | We set no cookies. | true | No `document.cookie`, `cookies()`, `Set-Cookie` or cookie header anywhere in `src`; no middleware, no `vercel.json`; sign-in is a bearer token, "No cookie" (`src/lib/auth.ts:5-10`; `src/lib/sign-in-text.ts:3`). |
| 2.5 | We do not sell data. | can't tell | A promise, not a code fact. Nothing in the code sends data to a buyer; the only outside recipients are those in section 7 (and see 7.x below). |
| 3.1 | The browser stores whether you have seen the introduction. | true | `snowmoon.intro-seen`, `src/components/first-visit.tsx:15,28`. |
| 3.2 | …your light or dark setting. | true | `snowmoon.theme`, `src/lib/theme.ts:7`, `src/components/theme-switch.tsx:24`. |
| 3.3 | …the furthest chapter you have opened. | true, and more | `snowmoon.read-to` (`src/lib/chat/device.ts:36`); also every chapter opened (`snowmoon.opened`) and the last one (`snowmoon.last-chapter`), `src/lib/chat/device.ts:59-67`. |
| 3.4 | …your questions to the assistant and its answers. | true | `snowmoon.ask.threads.v1`, `src/lib/chat/device.ts:35,90`. |
| 3.5 | …drafts of images you make until you publish them. | true | IndexedDB `snowmoon` / `image-drafts`, `src/lib/images/client.ts:28-35`; deleted on publish, `src/components/image-composer.tsx:164`. |
| 3.6 | …on the website, a sign-in token that lasts about an hour. | true, with a nuance | One-hour Quick Auth token, `src/lib/client-auth.ts:10,49`. The same entry (`snowmoon.signin`) also holds the FID, username and a server-signed name proof valid 30 days (`src/lib/client-auth.ts:49`, `src/lib/names.ts:13`), and it is not removed when the token expires, only ignored (`src/lib/client-auth.ts:38-40`) until sign-out (`:63`). |
| 3.7 | "a few things" (the list of what is stored) | false (incomplete) | Also stored, not listed: the audio position per chapter `snowmoon:position:cN` (`src/components/chapter-player.tsx:85,205`); the rail collapsed and the assistant panel closed, `snowmoon.rail` / `snowmoon.panel` (`src/components/app-shell.tsx:44-45`); the notice's "Don't show this again", `snowmoon.ask.notice-seen` (`src/lib/chat/device.ts:37,107`); a first-visit flag `snowmoon.visited` (`src/components/first-visit.tsx:272,283`); Minpentai's tutorial done, `minpentai-tutorial-done` (`src/app/minpentai/minpentai-app.tsx:18,52`, `src/app/minpentai/sandbox.tsx:24,69`). None is sent anywhere. |
| 3.8 | These stay on your device. | true | Stored only client-side; threads are sent with a question to be answered (section 5) but never stored by the server (`src/lib/chat/device.ts:2`); drafts are sent only on Publish (`src/components/image-composer.tsx:161`). |
| 3.9 | Clearing your browser's site data removes them. | true | All of it is localStorage or IndexedDB of this origin (above); nothing in cookies or elsewhere. |
| 4.0 | Kept by us when you sign in: your Farcaster ID, and what you do with it here (the list) | false (incomplete) | Also kept under the FID, not listed: your agreement to the publication wording (FID, wording hash, time), `studio.contributor_consents` (`supabase/migrations/0002_v5.sql:95`, `src/lib/consent.ts:61`); hiding and unhiding your own image, `studio.removal_log` with `by_fid` (`src/app/api/images/[id]/hide/route.ts:30-42`); the assistant's question count (said in section 5); Minpentai challenges and per-person request counts (see 4.9). |
| 4.1 | Quote cards you save. | true | `studio.elements.created_by_fid`, `src/lib/cards.ts:88-90`. |
| 4.2 | …and your likes. | true | `studio.likes (version_id, fid)`, `src/lib/cards.ts:156`, `src/app/api/images/[id]/like/route.ts:24`. |
| 4.3 | …and your ratings. | false (not collected) | `studio.ratings` exists (`supabase/migrations/0001_core.sql:147`) but no route or library writes it (no `ratings` insert in `src`). |
| 4.4 | A saved card's page is public. | true | `/card/[id]` renders for anyone, `src/app/card/[id]/page.tsx:14`; it shows "saved by FID n" (`:43`). |
| 4.5 | Your individual likes and ratings are private; only totals are shown. | true | `supabase/migrations/0004_private_ratings_and_likes.sql:41,51` (totals views); P6b (`scripts/check-principles.ts`, PRIVATE_FID_TABLES) and P6c (live API) check it. |
| 4.6 | Images you publish, with their prompt, your Farcaster username and the record of how they were made. These are public. | true | `src/app/api/images/publish/route.ts:62-91`: recipe with `prompt`, `user_prompt`, `by_name`, request id, settings, checks; recipes are public (P1d). The recipe also keeps that image's `cost_usd` under `created_by_fid` (`:86-87`), which About's "what they cost is kept only as daily totals, with no names" does not allow for. |
| 4.7 | How many images you make each day, to count the daily limit. | true | `studio.image_asks (fid, at)`, `supabase/migrations/0008_images.sql:34`, `src/lib/images/limits.ts:19,40`. |
| 4.8 | …and the reports you make. | true | `studio.removal_log` step `reported`, `by_fid`, reason, note, `src/app/api/images/[id]/report/route.ts:35`; `supabase/migrations/0008_images.sql:78-90`. |
| 4.9 | Minpentai: your progress against the computer and the people you block, kept until you ask us to delete them. | true on site-minpentai-play-2, not live | `0009_minpentai_play.sql` (that branch) lines 15, 28, 56-57: `mp_progress`, `mp_blocks` "kept until the person asks for erasure". Not listed: `mp_challenges` (deleted 1 h after they expire or are answered, line 49) and `mp_rate` (per-FID request counts for today, deleted daily, lines 29-31, 54). |
| 4.10 | …your matches, deleted 30 days after they end. | true on site-minpentai-play-2, not live | 0009 lines 51-53 (an unpolled match is ended as abandoned after 24 h, then deleted 30 days after it ended). Cleanup runs on later Play requests, no cron (line 45), so deletion can lag if nobody plays. |
| 4.11 | …and invites, deleted when they expire after 24 hours. | true on site-minpentai-play-2, not live | 0009 lines 27, 48 (same cleanup caveat). |
| 4.12 | While you say you are ready to play, other signed-in players see your Farcaster username. | true on site-minpentai-play-2, not live | `mp_lobby.username` (0009 line 88); the lobby view lists ready players' username and FID to signed-in players only (`src/lib/minpentai/play-server/store.ts:78-91`, `route.ts` 401 without a FID, on that branch). |
| 5.1 | Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. | true | `src/lib/chat/model.ts:77` (direct, `api.groq.com`, `src/lib/config.ts:69`) then `:109` (gateway, `src/lib/config.ts:58`) when the direct call fails and `gatewayFallback` is on (`src/lib/config.ts:75`); pinned to Groq (`src/lib/chat/provider.ts:10`). |
| 5.2 | Both are set to keep nothing. | true for the gateway; can't tell for Groq from code | Gateway: `zeroDataRetention` asked per request, `src/lib/chat/provider.ts:10`. Groq direct: a console setting the owner confirmed on 2026-10-08 (`src/lib/config.ts:63-67`; docs/principles.md §6); nothing in code or Groq's replies shows it. |
| 5.3 | We keep no copy of your questions or the answers. | true | `studio.chat_calls` has no question or answer column (`supabase/migrations/0007_chat_costs_without_person.sql`); errors log only the error type (`src/app/api/chat/ask/route.ts:37-38`). |
| 5.4 | Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. | true in code; can't tell whether 0007 is live | After 0007, `chat_calls` = FID, time, model (`src/lib/chat/limits.ts:44`; 0007 header). The starter assumes 0007 is applied; the file header still says "NOT APPLIED", and `src/lib/chat/notice.ts:32,35` records the owner applying it on 2026-10-08. The live database can't be read from here. Before 0007, cost rows with request ids were kept under the FID. |
| 5.5 | Records of each answer's size and cost are kept without your ID, to track our spending. | false as worded | There are no per-answer records: `studio.chat_costs` holds daily totals per kind, model, provider and verdict (`supabase/migrations/0007_chat_costs_without_person.sql`, `src/lib/chat/limits.ts:61`). Without the ID: true. |
| 6.1 | Anything you publish is public… | true | Images (P1d), cards (`src/app/card/[id]/page.tsx`). |
| 6.2 | …and is shown with your Farcaster name… | false for quote cards | Images: `by_name` (`src/app/api/images/publish/route.ts:80`). A saved card shows "saved by FID n", not a name (`src/app/card/[id]/page.tsx:43`); an image with no name found shows "FID n" (`src/lib/names.ts:10`). |
| 6.3 | …the date, and the record of how it was made. | true | Recipe `made_at` and version `created_at`; recipe linked from every published image (P1d, P2b). |
| 7.1 | Vercel hosts the site and sees your IP address and browser details. | true | Deployed on Vercel (check:principles P6d reads the Vercel project; `next.config.ts` uses `VERCEL_GIT_COMMIT_SHA`). |
| 7.2 | Cloudflare stores and serves the pictures and audio, and sees the same when your device fetches them. | true | R2: `src/lib/images/store.ts:21` (readers' images, `pictures.snowmoon.party`), book media `media.snowmoon.party` (`content/snowmoon/illustrations/published.json:27`), uploaded with `R2_*` (`scripts/publish-narration.ts:70`). |
| 7.3 | Supabase holds our database. | true | `STUDIO_DATABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` (`scripts/check-principles.ts`, P1c, P6c); `supabase/migrations/`. |
| 7.4 | Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions. | true | As 5.1. |
| 7.5 | …and the prompts for images you make, which are checked against the published rules. | true | `src/lib/images/guard.ts:19` uses the same `complete()` (Groq, then the gateway); rules `config/prompts/image-guard.md`. Note: the image consent screen names only Groq for the check, not the gateway (see "For the owner"). |
| 7.6 | fal.ai receives the prompt for an image you make, and makes the image. It is asked to keep no copy. | true | `src/lib/images/fal.ts:34-37`: `sync_mode`, `X-Fal-Store-IO: 0`. Whether fal.ai honours it can't be seen from here. |
| 7.7 | Farcaster's sign-in services confirm who you are when you sign in. | true | `relay.farcaster.xyz` (`src/app/api/auth/web/start/route.ts:13,21`), `auth.farcaster.xyz` nonce and token verification (`@farcaster/quick-auth`, `src/lib/auth.ts:12,25`); in a Farcaster app, `sdk.quickAuth.fetch` (`src/lib/client-auth.ts:72`). |
| 7.8 | They learn your Farcaster ID and that you signed in here, not what you read or ask. | true | Only the domain, nonce and channel go to the relay (`start/route.ts:21-29`); no reading or question data is sent to Farcaster. |
| 7.9 | Farcaster's public API receives a Farcaster ID when we look up the username to show with published work. | true (and more on site-minpentai-play-2) | `src/lib/names.ts:50` (`api.farcaster.xyz/v2/user?fid=`), cached a day (`:44-56`), used at publish (`publish/route.ts:58`). On site-minpentai-play-2 the same lookup also names Play players (`play-server/route.ts` imports `bylineName`), which is not "published work". |
| 7.10 | Neynar receives your Farcaster ID when you first make an image on a given day, to look up its account score, which decides whether you can make images. | true once site-images-everyone merges | Not on this branch: `src/lib/config.ts:126` "No Neynar key"; no Neynar call in `src`. Per the spec (only the FID, at Generate, score ≥ 0.7). Two nuances: the cache is "a day" from the lookup, so the next lookup is about 24 h later, not the first image of each calendar day; invited FIDs are never looked up. |
| 7.11 | We keep the score for a day. | true once site-images-everyone merges | Spec: cached a day in a new table. Whether old rows are deleted after a day or only treated as stale can't be told until that branch's migration and code are read. |
| 7.12 | If you listen as a podcast, your podcast app fetches the audio from our media host. | true for the feed; can't tell for Spotify | Enclosures point at the media host (`src/lib/podcast.ts:107`). The show is also on Spotify (`src/lib/config.ts:19`, linked from About and Listen); Spotify usually ingests a feed's audio and serves it itself, and then Spotify, not our media host, sees the listener. Spotify is not named on the Privacy page. |
| 7.13 | A "report" link may open GitHub or Farcaster, where what you post is public and under their terms. | true | Mispronunciation reports: a prefilled GitHub issue or a cast to /snowmoon (`src/lib/report-pronunciation.ts:3-8,32`). Image reports are in-app (4.8). |
| 7.x | (the list of outside services is complete) | false once site-images-everyone merges | That branch adds report alerts through ntfy (per the parallel task); ntfy is not named. What an alert carries (image id, reason, note, reporter?) can't be told from here. Spotify: see 7.12. Inside a Farcaster app, the host app (e.g. Warpcast) also sees that the mini app is used; not named. |
| 8.1 | The Service is not directed to children under 13. | can't tell | A statement of intent; nothing in code. |
| 8.2 | Signing in requires that you be at least 18. | false as a fact of the Service (true as a rule) | No age check anywhere in the sign-in flow (`src/components/sign-in.tsx`, `src/lib/auth.ts`); it is a rule in Terms §4. |
| 9.1 | We keep account-linked records while you use the Service. | true, mostly longer | No automatic deletion for cards, likes, consents, image_asks, removal_log or recipes (append-only; `0008_images.sql:44,96`); they stay after you stop using the Service until an erasure (docs/removal.md §2, line 58). Exceptions: Minpentai matches, invites, challenges, rate rows (4.10-4.11). |
| 9.2 | Write to us to ask for a copy or for deletion. | true for deletion; can't tell for a copy | Erasure is a logged maintainer procedure (docs/removal.md:58-83). No procedure or tooling for giving a person a copy of their data exists in the repo. |
| 9.3 | Work you have published can be hidden on request. | true | The maker hides at once (`src/app/api/images/[id]/hide/route.ts`), moderators hide (`src/app/api/moderate/route.ts:37`), by email for signed-out (About). |
| 10.1 | A change to what is collected or where it is sent will also be announced on the Service. | can't tell | A promise; no mechanism in code. |
| 11.1 | Contact: snowmoon@wearelum.xyz | true | `src/lib/config.ts:115`. |

## For the owner

- **False:** 3.7 (device list leaves out the audio position, rail/panel state, the notice's
  "don't show again", the visited flag and Minpentai's tutorial flag); 4.0 (consent records and
  your own hides are kept under your FID, not listed); 4.3 (ratings are not collected); 5.5
  ("records of each answer": they are daily totals); 6.2 (quote cards show the FID, not a name);
  8.2 (no age check exists); 7.x once the images branch merges (ntfy not named).
- **Can't tell:** 1.1, 2.5, 8.1, 10.1 (promises or facts outside the code); 5.2 for Groq (console
  setting, your confirmation of 2026-10-08); 5.4 (whether 0007 is applied on the live database:
  the notice records that you applied it on 2026-10-08, the migration header still says
  NOT APPLIED); 7.11 (how the score rows are expired); 7.12 (Spotify); 9.2 (a copy of one's data).
- **Depends on unmerged branches:** 7.10–7.11 (site-images-everyone); 4.9–4.12 and the Play
  half of 7.9 (site-minpentai-play-2, 0009 not applied). Ship section 4's Minpentai bullet only
  with that branch, or the page describes something that isn't there.
- The consent screen (own-words-v3) says the prompt goes "to Groq to be checked"; when Groq is
  busy it goes through Vercel AI Gateway (7.5). The Privacy page says so; the consent screen
  doesn't.
