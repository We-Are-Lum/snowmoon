# Privacy Policy: fact-check (2026-10-09; redone 2026-10-10 for the owner's wording, and 4.0 again after the Minpentai sentence)

Every factual statement on `/privacy` (the owner's legal starter, sections 1–11, words in
`src/lib/legal.ts`), checked against the code, migrations, config and principle checks of branch
`site-legal` (from main at `8dd5415`). The wording is not changed here; the owner changes it.

Verdicts: **true**; **false** (the code or schema says otherwise, including a list that leaves
something out); **can't tell** (not decidable from the repository); **true once
site-images-everyone merges** (the Neynar gate, judged against its spec: score ≥ 0.7, looked up at
Generate with only the FID, cached a day in a new table, invited FIDs skip; the code is not on this
branch at first). Minpentai Play is judged on branch `site-minpentai-play-2`; migration 0009 was
applied on production by the owner on 2026-10-09, and the branch went to main on 2026-10-10.

**Redone, 2026-10-10, after the owner's wording changes** (§3, §4, §5, §6, §7, §8, applied exactly in
`src/lib/legal.ts`): every row those changes touch is re-judged below against branch
`site-images-everyone` at the time of writing; rows the changes don't touch keep their verdict. Rows
removed with the words they checked: 4.3 (ratings), 5.5's old wording. New rows: 4.1b, 7.9b, 7.14.

**Earlier update, 2026-10-10 (after site-legal merged into site-images-everyone):** 0009 is applied on
production (owner, 2026-10-09 23:55), so 4.9–4.12 are true once site-minpentai-play-2 is live.
7.10 and 7.11 were checked against the gate's code (`src/lib/images/neynar.ts`, `gate.ts`, 0010):
true once site-images-everyone merges; 7.11's rows are deleted, not only treated as stale (each
lookup deletes rows older than a day). 7.x: the ntfy alert carries only the text
"Snowmoon: N reports waiting" (`src/lib/images/alert.ts`), but ntfy is still not named. Nothing
else was re-judged; the wording is unchanged.

| # | Statement | Verdict | Evidence |
|---|---|---|---|
| 1.1 | Lum LLC, a Wyoming limited liability company, operates Snowmoon Party. | can't tell | Not in code. Indirect: `src/lib/config.ts:17` repo `We-Are-Lum/snowmoon`; `src/lib/config.ts:115` contact `snowmoon@wearelum.xyz`. |
| 2.1 | You can read and listen without an account. | true | Chapters, listen view, podcast need no sign-in; `getFid` is called only in the sign-in-gated API routes (`src/lib/auth.ts:21`); check:principles P4a names the signed-out exemptions. |
| 2.2 | We keep nothing about you when you read and listen without an account. | true for the app; can't tell for the host | No server write without a FID: every `insert` in `src/lib` and `src/app/api` follows `getFid` (e.g. `src/lib/chat/limits.ts:44`, `src/lib/images/limits.ts:40`, `src/lib/cards.ts:90`). Vercel's own request logs (IP, path) are kept by Vercel under its retention, outside the code. |
| 2.3 | We use no advertising or analytics trackers. | true | `package.json:36-52`: no analytics package (no `@vercel/analytics`, `@vercel/speed-insights`, gtag, Plausible, PostHog, Segment); no third-party script in `src/app/layout.tsx:54` (the theme script only); check:principles P6a fails on any off-site request from the production pages (`scripts/check-principles.ts:913`). |
| 2.4 | We set no cookies. | true | No `document.cookie`, `cookies()`, `Set-Cookie` or cookie header anywhere in `src`; no middleware; `vercel.json` holds only the no-preview-deployment setting; sign-in is a bearer token, "No cookie" (`src/lib/auth.ts:5-10`; `src/lib/sign-in-text.ts:3`). |
| 2.5 | We do not sell data. | can't tell | A promise, not a code fact. Nothing in the code sends data to a buyer; the only outside recipients are those in section 7 (and see 7.x below). |
| 3.1 | The browser stores whether you have seen the introduction. | true | `snowmoon.intro-seen`, `src/components/first-visit.tsx:15,28`. |
| 3.2 | …your light or dark setting. | true | `snowmoon.theme`, `src/lib/theme.ts:7`, `src/components/theme-switch.tsx:24`. |
| 3.3 | …the furthest chapter you have opened. | true | `snowmoon.read-to` (`src/lib/chat/device.ts:36`); also every chapter opened and the last one (`device.ts:59-67`), which "a few other settings of yours" now covers. |
| 3.4 | …your questions to the assistant and its answers. | true | `snowmoon.ask.threads.v1`, `src/lib/chat/device.ts:35,90`. |
| 3.5 | …drafts of images you make until you publish them. | true | IndexedDB `snowmoon` / `image-drafts`, `src/lib/images/client.ts:28-35`; deleted on publish, `src/components/image-composer.tsx:164`. |
| 3.6 | …on the website, a sign-in token that lasts about an hour. | true, with a nuance | One-hour Quick Auth token, `src/lib/client-auth.ts:10,49`. The same entry (`snowmoon.signin`) also holds the FID, username and a server-signed name proof valid 30 days (`src/lib/client-auth.ts:49`, `src/lib/names.ts:13`), and it is not removed when the token expires, only ignored (`src/lib/client-auth.ts:38-40`) until sign-out (`:63`). |
| 3.7 | "where you stopped listening" and "a few other settings of yours" (the list is now complete) | true | Where you stopped listening: `snowmoon:position:cN` (`src/components/chapter-player.tsx:85,205`). Other settings: rail and panel state (`app-shell.tsx:44-45`), the notice's "Don't show this again" (`device.ts:37,107`), `snowmoon.visited` (`first-visit.tsx:272,283`), Minpentai's tutorial done (`minpentai-app.tsx:18,52`). No other `localStorage`, `sessionStorage` or IndexedDB key in `src`. Nuance kept from 3.6: the sign-in entry also holds the FID, username and a 30-day name proof. |
| 3.8 | These stay on your device. | true | Stored only client-side; threads are sent with a question to be answered (section 5) but never stored by the server (`src/lib/chat/device.ts:2`); drafts are sent only on Publish (`src/components/image-composer.tsx:161`). |
| 3.9 | Clearing your browser's site data removes them. | true | All of it is localStorage or IndexedDB of this origin (above); nothing in cookies or elsewhere. |
| 4.0 | Kept by us when you sign in (the list) | true, with nuances | Complete since the owner's sentence of 2026-10-10 in the Minpentai bullet: challenges (`mp_challenges`, deleted once `least(expires_at, closed_at)` is an hour past, `src/lib/minpentai/play-server/store.ts:401-402`, `MINPENTAI_PLAY.challengeKeepMs` = 1 h) and today's Play request count (`mp_rate.day_count`, deleted once its day is before today, `store.ts:417`). Nuances: the same `mp_rate` row also holds this minute's count and the time of your last match and lobby views (`0009_minpentai_play.sql:234-242`), used for the poll intervals; deletion runs when a later Play request triggers the cleanup, so it can come later than stated if nobody plays. The Neynar score under your FID is said in §7, the assistant's count in §5. |
| 4.1 | Quote cards you save, and your likes. A saved card's page is public. | true | `studio.elements.created_by_fid`, `src/lib/cards.ts:88-90`; likes `cards.ts:156`, `images/[id]/like/route.ts:24`; card page public (`card/[id]/page.tsx:14`). |
| 4.1b | That you agreed to the terms for publishing, and any of your own work you have hidden. | true | `studio.contributor_consents` (FID, wording hash, time; `0002_v5.sql:95`, `src/lib/consent.ts:61`); your own hides and unhides in `studio.removal_log` with `by_fid` (`src/app/api/images/[id]/hide/route.ts:30-42`). |
| 4.3 | (ratings) | removed | The words about ratings are gone; nothing writes `studio.ratings`. |
| 4.4 | A saved card's page is public. | true | `/card/[id]` renders for anyone, `src/app/card/[id]/page.tsx:14`; it shows "saved by FID n" (`:43`). |
| 4.5 | Your individual likes are private; only totals are shown. | true | `0004_private_ratings_and_likes.sql:41,51`; P6b and P6c check it. |
| 4.6 | Images you publish, with their prompt, your Farcaster username and the record of how they were made. These are public. | true | `src/app/api/images/publish/route.ts:62-91`: recipe with `prompt`, `user_prompt`, `by_name`, request id, settings, checks; recipes are public (P1d). The recipe also keeps that image's `cost_usd` under `created_by_fid` (`:86-87`); About now says so ("a published image's recipe shows its own cost", owner, 2026-10-10). |
| 4.7 | How many images you make each day, to count the daily limit. | true | `studio.image_asks (fid, at)`, `supabase/migrations/0008_images.sql:34`, `src/lib/images/limits.ts:19,40`. |
| 4.8 | …and the reports you make. | true | `studio.removal_log` step `reported`, `by_fid`, reason, note, `src/app/api/images/[id]/report/route.ts:35`; `supabase/migrations/0008_images.sql:78-90`. |
| 4.9 | Minpentai: your progress against the computer and the people you block, kept until you ask us to delete them. | true (Play live since 2026-10-10) | `0009_minpentai_play.sql` (that branch) lines 15, 28, 56-57: `mp_progress`, `mp_blocks` "kept until the person asks for erasure". Not listed: `mp_challenges` (deleted 1 h after they expire or are answered, line 49) and `mp_rate` (per-FID request counts for today, deleted daily, lines 29-31, 54). |
| 4.10 | …your matches, deleted 30 days after they end. | true (Play live since 2026-10-10) | 0009 lines 51-53 (an unpolled match is ended as abandoned after 24 h, then deleted 30 days after it ended). Cleanup runs on later Play requests, no cron (line 45), so deletion can lag if nobody plays. |
| 4.11 | …and invites, deleted when they expire after 24 hours. | true (Play live since 2026-10-10) | 0009 lines 27, 48 (same cleanup caveat). |
| 4.12 | While you say you are ready to play, other signed-in players see your Farcaster username. | true (Play live since 2026-10-10) | `mp_lobby.username` (0009 line 88); the lobby view lists ready players' username and FID to signed-in players only (`src/lib/minpentai/play-server/store.ts:78-91`, `route.ts` 401 without a FID, on that branch). |
| 5.1 | Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. | true | `src/lib/chat/model.ts:77` (direct, `api.groq.com`, `src/lib/config.ts:69`) then `:109` (gateway, `src/lib/config.ts:58`) when the direct call fails and `gatewayFallback` is on (`src/lib/config.ts:75`); pinned to Groq (`src/lib/chat/provider.ts:10`). |
| 5.2 | Both are set to keep nothing. | true for the gateway; can't tell for Groq from code | Gateway: `zeroDataRetention` asked per request, `src/lib/chat/provider.ts:10`. Groq direct: a console setting the owner confirmed on 2026-10-08 (`src/lib/config.ts:63-67`; docs/principles.md §6); nothing in code or Groq's replies shows it. |
| 5.3 | We keep no copy of your questions or the answers. | true | `studio.chat_calls` has no question or answer column (`supabase/migrations/0007_chat_costs_without_person.sql`); errors log only the error type (`src/app/api/chat/ask/route.ts:37-38`). |
| 5.4 | Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. | true | After 0007, `chat_calls` = FID, time, model (`src/lib/chat/limits.ts:44`; 0007 header). 0007 is live on production (owner, confirmed 2026-10-10; relayed by another Snowmoon session). |
| 5.5 | The assistant's costs are kept only as daily totals, without your ID, to track our spending. | true | `studio.chat_costs` holds daily totals per kind, model, provider and verdict, with no FID (`0007_chat_costs_without_person.sql`, `src/lib/chat/limits.ts:61`). 0007 is live (see 5.4). |
| 6.1 | Anything you publish is public… | true | Images (P1d), cards (`src/app/card/[id]/page.tsx`). |
| 6.2 | Anything you publish is public, shown with your Farcaster username (your Farcaster ID on quote cards), the date, and the record of how it was made. | true, with a nuance | Images show `by_name` (`publish/route.ts:80`); cards show "saved by FID n" (`card/[id]/page.tsx:43`). Nuance: if no username can be found at publish, an image shows "FID n" too (`src/lib/names.ts:10`). |
| 6.3 | …the date, and the record of how it was made. | true | Recipe `made_at` and version `created_at`; recipe linked from every published image (P1d, P2b). |
| 7.1 | Vercel hosts the site and sees your IP address and browser details. | true | Deployed on Vercel (check:principles P6d reads the Vercel project; `next.config.ts` uses `VERCEL_GIT_COMMIT_SHA`). |
| 7.2 | Cloudflare stores and serves the pictures and audio, and sees the same when your device fetches them. | true | R2: `src/lib/images/store.ts:21` (readers' images, `pictures.snowmoon.party`), book media `media.snowmoon.party` (`content/snowmoon/illustrations/published.json:27`), uploaded with `R2_*` (`scripts/publish-narration.ts:70`). |
| 7.3 | Supabase holds our database. | true | `STUDIO_DATABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` (`scripts/check-principles.ts`, P1c, P6c); `supabase/migrations/`. |
| 7.4 | Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions. | true | As 5.1. |
| 7.5 | …and the prompts for images you make, which are checked against the published rules. | true | `src/lib/images/guard.ts:19` uses the same `complete()` (Groq, then the gateway); rules `config/prompts/image-guard.md`. The image consent screen (own-words-v3) and the composer now name the gateway too (owner, 2026-10-10). |
| 7.6 | fal.ai receives the prompt for an image you make, and makes the image. It is asked to keep no copy. | true | `src/lib/images/fal.ts:34-37`: `sync_mode`, `X-Fal-Store-IO: 0`. Whether fal.ai honours it can't be seen from here. |
| 7.7 | Farcaster's sign-in services confirm who you are when you sign in. | true | `relay.farcaster.xyz` (`src/app/api/auth/web/start/route.ts:13,21`), `auth.farcaster.xyz` nonce and token verification (`@farcaster/quick-auth`, `src/lib/auth.ts:12,25`); in a Farcaster app, `sdk.quickAuth.fetch` (`src/lib/client-auth.ts:72`). |
| 7.8 | They learn your Farcaster ID and that you signed in here, not what you read or ask. | true | Only the domain, nonce and channel go to the relay (`start/route.ts:21-29`); no reading or question data is sent to Farcaster. |
| 7.9 | Farcaster's public API receives a Farcaster ID when we look up the username to show with published work, and in Minpentai's lobby and matches. | true | `src/lib/names.ts:50`, cached a day; at publish (`publish/route.ts:58`); on site-minpentai-play-2 the lobby, challenges and invites use the same lookup (`play-server/route.ts`, `verifiedName`). |
| 7.10 | Neynar receives your Farcaster ID when you first make an image on a given day, to look up its account score, which decides whether you can make images. | true once site-images-everyone merges | `src/lib/images/neynar.ts:42-43`: `GET …/user/bulk?fids=<fid>` with only the `x-api-key` header, at Generate (`src/lib/images/gate.ts`), score ≥ `IMAGES.neynarMinScore` (0.7). Two nuances: the cache is "a day" from the lookup, so the next lookup is about 24 h later, not the first image of each calendar day; invited FIDs are never looked up. |
| 7.11 | We keep the score for a day. | true once site-images-everyone merges | `studio.image_scores` (0010); a kept score is used for 24 h from its lookup, and each lookup deletes rows older than a day (`src/lib/images/neynar.ts`). Low scores are kept a day too. |
| 7.12 | If you listen as a podcast, your podcast app fetches the audio from our media host; Spotify serves its own copy. | true for the feed; can't tell from code for Spotify | Enclosures point at the media host (`src/lib/podcast.ts:107`). That Spotify re-hosts the audio is Spotify for Creators' practice for RSS shows, outside the code. |
| 7.13 | A "report" link may open GitHub or Farcaster, where what you post is public and under their terms. | true | Mispronunciation reports: a prefilled GitHub issue or a cast to /snowmoon (`src/lib/report-pronunciation.ts:3-8,32`). Image reports are in-app (4.8). |
| 7.14 | ntfy delivers a short alert to us when an image is reported. It carries no content and nothing about you. | true once site-images-everyone merges | The POST body is exactly `Snowmoon: N reports waiting`, with only `Content-Type: text/plain` (`src/lib/images/alert.ts:30,50`); it is sent from our server, so ntfy sees our server, not the reader. Also sent when an author hides their own image (not only on a report); the words say "when an image is reported". |
| 7.x | (the list of outside services is complete) | true, with one nuance | Every outside service the code calls is named: Vercel, Vercel AI Gateway, Cloudflare, Supabase, Groq, fal.ai, Farcaster, Neynar, ntfy, Spotify (podcast), GitHub (report link). Nuance: inside a Farcaster app, the host app also sees that the mini app is used; not named. |
| 8.1 | The Service is not directed to children under 13. | can't tell | A statement of intent; nothing in code. |
| 8.2 | You must be at least 18 to sign in; we do not verify age. | true | A rule (Terms §4) with no age check in the sign-in flow (`src/components/sign-in.tsx`, `src/lib/auth.ts`), as the words now say. |
| 9.1 | We keep account-linked records while you use the Service. | true, mostly longer | No automatic deletion for cards, likes, consents, image_asks, removal_log or recipes (append-only; `0008_images.sql:44,96`); they stay after you stop using the Service until an erasure (docs/removal.md §2, line 58). Exceptions: Minpentai matches, invites, challenges, rate rows (4.10-4.11). |
| 9.2 | Write to us to ask for a copy or for deletion. | true for deletion; can't tell for a copy | Erasure is a logged maintainer procedure (docs/removal.md:58-83). No procedure or tooling for giving a person a copy of their data exists in the repo. |
| 9.3 | Work you have published can be hidden on request. | true | The maker hides at once (`src/app/api/images/[id]/hide/route.ts`), moderators hide (`src/app/api/moderate/route.ts:37`), by email for signed-out (About). |
| 10.1 | A change to what is collected or where it is sent will also be announced on the Service. | can't tell | A promise; no mechanism in code. |
| 11.1 | Contact: snowmoon@wearelum.xyz | true | `src/lib/config.ts:115`. |

## For the owner

- **False:** none.
- **Nuances, not false:** 4.0 (the Play request row also holds this minute's count and the last
  view times; Play's deletions run on later Play requests, so they can lag if nobody plays); 6.2 (an image whose maker has no username found shows "FID n"); 7.14
  (the alert also goes out when an author hides their own image, not only on a report); 3.6 (the
  sign-in entry also holds the FID, username and a 30-day name proof).
- **Can't tell from the code:** 1.1, 2.5, 8.1, 10.1 (promises or facts outside the code); 5.2 for
  Groq (console setting); 7.12
  (Spotify's copy); 9.2 (a copy of one's data).
- **Depends on the unmerged branch:** 7.10, 7.11, 7.14 (site-images-everyone; 0010 is applied on
  production, 2026-10-10). Minpentai Play (4.9–4.12, 7.9) is live since 2026-10-10.
- The consent screen now names Vercel AI Gateway for the prompt check, as §7 does (own-words-v3,
  revised before it shipped).
