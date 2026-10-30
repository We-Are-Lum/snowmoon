# Branch report: social-read ("Posts that link here")

Branch `social-read`, from main `02ddf08`, 2026-10-29/30. Built overnight by the coding agent. Not merged, no PR, no
migration applied, nothing posted, nothing spent.

## What it does

When someone posts on **Farcaster** or **Bluesky** with a link to a page of snowmoon.party, that post can now appear at
the bottom of the page it links to, under the heading **"Posts that link here"**. Each post shows:

- the network (Farcaster or Bluesky), the writer's @handle and the date,
- the post's words, as a quotation (cut at 500 characters),
- a link "See it on Farcaster / Bluesky" to the original post.

Newest first, at most 20 per page. Nothing is counted or ranked: no likes, no reposts, no scores. No avatars or pictures
from those networks are shown, so the reader's browser never contacts them.

**Where it shows:** chapter pages (`/chapter/3`), image pages (`/image/<id>`), and adaptation scene pages, both the
chosen version (`/@name/12`, any title words after the number) and a fixed version (`/@name/12/v/3`). Every way of
writing those links finds the same page (with or without `www.`, `#block`, the title words, or the internal
`/adaptation/12/by/name` path).

**How the posts are found:** our server asks each network one question for the whole site ("posts linking to
snowmoon.party"), at most once every half hour, and remembers the answer for half an hour. Each page then picks out
its own posts. So the networks are asked about 48 times a day each, however many people read the site. Chapter pages
are now remade at most every half hour so new posts can appear on them.

**Removal on request:**
- On `/moderate`, moderators and admins see every post that was found, newest first, with two buttons: "Hide: the
  writer asked" and "Hide: breaks the Terms". A hidden post leaves every page within a few minutes. There is no
  "unhide" button (moderators only hide); you can undo a hide in the database if needed.
- Under the posts, a line tells writers they can ask for removal at snowmoon@wearelum.xyz.
- Bluesky posts or accounts with any label are skipped automatically, including accounts that asked not to be shown
  to signed-out people. A post deleted on its network disappears here within about an hour.

**It is switched off.** Nothing shows until (1) you reread the Privacy/Terms lines, (2) you paste the database
change, and (3) the switch `SOCIAL_READ.show` is turned on. While off, our server does not contact either network.
Even if switched on before the database change, it shows nothing (it "fails closed").

## Free tiers: what works

| Source | Works on the free tier? | Limits found (2026-10-29) |
|---|---|---|
| **Farcaster, through Neynar** (the site's existing `NEYNAR_API_KEY`) | Yes. Neynar's "feed filtered by embed URL" finds casts whose links start with `snowmoon.party`. | Free plan: 10M credits a month, 600 requests a minute per endpoint, "all Read & Write APIs" included ([rate limits](https://docs.neynar.com/reference/what-are-the-rate-limits-on-neynar-apis)). This call costs 4 credits × 100 casts = 400 credits; every half hour that is about **0.6M credits a month (about 6% of the free plan)** ([credit prices](https://docs.neynar.com/reference/compute-units), [the feed call](https://docs.neynar.com/reference/fetch-feed), [Neynar's guide to casts by embed](https://docs.neynar.com/docs/fetch-casts-by-embed-in-farcaster)). Neynar's text search (`cast/search`) was not used: its docs don't say it searches links. |
| **Bluesky, public API, no account** | Yes, with a catch. `app.bsky.feed.searchPosts` with `domain=snowmoon.party` and `sort=latest` answers without signing in on **api.bsky.app**. The host the docs recommend for public use, **public.api.bsky.app, answers 403** for search (tested 2026-10-29). | Bluesky says the direct hosts "do not support authentication" and have "generous rate-limits", with no number given ([Bluesky rate limits](https://bsky.network/docs/rate-limits), [API hosts](https://bsky.network/docs/api-directory)). Without an account only the first page of results is served (reported by developers; [one write-up](https://dev.to/cooki/nobody-is-monitoring-bluesky-so-i-built-a-mentions-scraper-for-it-19mi)), so we read the latest 100 posts. If Bluesky closes search to signed-out callers, this source would need a Bluesky account (not built). |

Not tested against the real Neynar service: the local machine has no `NEYNAR_API_KEY` (it lives on Vercel), and I did
not create one. The Neynar answer's shape was checked against Neynar's published example; the first real look happens
on a deployment with the switch on. Bluesky was tested live (read only).

## What was checked

- `npx tsc --noEmit -p .`: passes.
- `npm run lint`: **there is no lint script on main** ("Missing script: lint"), and ESLint isn't installed, so nothing to run.
- `npm run test:social-read` (new): **60 pass, 0 fail**. Reading both networks' answers (made-up posts shaped like the
  real ones), the page matching, newest-first order, the 20-post cap, labelled Bluesky posts left out, future-dated
  posts placed when Bluesky saw them, the database change (in an in-memory database: the site can read and add hides
  but not change or delete them; the public can't read them; bad ids refused; safe to run twice; the dry run equals
  it), "shows nothing before the database change", a hidden post gone, and the rendered section (no picture, script or
  style; a post's text can't become markup).
- `npm run build`: passes (twice; chapters now remade at most every 30 minutes).
- `npm run -s check:ui -- --url=http://localhost:3321`: **passed** ("59 pages … AI labels on 9 screens at 390 and
  1440"). New expectations: on a test image page, with test posts in place of the networks, the section comes after
  the page's own content, is labelled, is newest first, leaves out the hidden test post and the post for another page,
  shows network, @handle, date, quotation and link, loads no picture, and makes no request outside the site; the
  moderators' list on `/moderate` shows every post with its Hide buttons. The first run found two real problems in
  the moderators' list (buttons in the browser's font, and the page scrolling sideways by 12px on a phone); fixed in
  `45ea159`, then passed.
- `npm run -s check:principles` (against snowmoon.party): **55 pass, 0 fail, 1 not run (P6d: the Vercel CLI isn't
  signed in here); 56 of 56 proven to fail on a planted violation.**
- `npm run -s check:principles -- --url=http://localhost:3321`: 54 pass, 1 fail, 1 not run (P6d). The fail is **P6a**,
  and it comes from testing on localhost: the check counts only the address under test as the site, so pictures from
  `media.snowmoon.party` and `pictures.snowmoon.party` look foreign. A separate run over the same pages listed every
  host asked: `localhost:3321`, `media.snowmoon.party`, `pictures.snowmoon.party`, `localhost:3000` (the local
  build's default site address); nothing outside the site.

## What you need to do

1. **Reread** `docs/legal/social-read-draft.md`: a new paragraph for Privacy §6, one sentence and one new item for
   Privacy §7 (Neynar and Bluesky), and one sentence for Terms §7. Say "reread" (with changes if any); the agent then
   puts them in `src/lib/legal.ts`.
2. **Paste** the database change in the Supabase SQL Editor, as postgres: first
   `supabase/drafts/NEXT_social_read.DRY-RUN.sql` (changes nothing), then `supabase/migrations/NEXT_social_read.sql`,
   then `supabase/drafts/READ-BACK-social_read.sql` to see it worked. Say "applied". It gets its number at merge.
3. **Turn it on**: `SOCIAL_READ.show = true` in `src/lib/config.ts`, in the same merge as the reread words. The check
   P6p fails if it's on before Privacy names Bluesky. About then shows a short paragraph too.
4. Optional choices (in the legal draft's notes): 20 posts per page, 500 characters, every half hour; whether to filter
   Farcaster spam by Neynar score (not built; for now, hide by hand).
5. After it's live: open a page someone has linked to, and `/moderate`, to see the first real posts.

## Principles

- **P1 (recipes, people know their words are public)**: pass. Nothing generated; no new text box (moderators use
  buttons only, so P1f holds).
- **P2 (AI declared; the words are the author's or a signed-in person's)**: pass, with a note. The posts are other
  people's words, shown under their handle, as quotations, under a heading and a rule that set them apart, after the
  page's own content, with "not part of this edition". They are never placed inside a piece or the book's text.
- **P4 (publishing needs a signed-in person)**: pass. The new routes (`/api/moderate/social`) refuse without a signed-in
  moderator or admin (P4a passes). Nothing model-made is published.
- **P5 (nothing featured; picks labelled)**: pass. Newest first only; new check **P5f** fails if anything in the
  feature sorts by something else or reads like/repost/reply/follower counts or a score. Moderator code only hides
  (P5b passes).
- **P6 (no third-party requests; private rows)**: pass, with the localhost P6a note above. Posts are read on our server
  and shown as text and links; no avatar, image or script from either network. The hide list is private (no public
  read). New check **P6p**: the switch can't be on while Privacy doesn't name Bluesky. Bluesky added to the outside
  services the Privacy page, About, the notice and the consent screen must agree on (P6g–P6j). **Concern, for you:**
  this is the first feature that shows other people's personal data (handles, words) from outside the site on our
  pages; the legal draft says what, from where, how long, and how to have it removed.
- **P7 (payments never order anything)**: pass; untouched.
- **P8 (in-world screens)**: pass; untouched.
- **Legal texts describe today**: held. Switch off until the reread; P6p enforces it.
