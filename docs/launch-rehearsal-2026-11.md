# Launch rehearsal: the remix challenge, 2026-11

DRAFT, written by the coding agent (Claude, a closed model by Anthropic), overnight 2026-11-02, for the owner's review.
Branch `launch-rehearsal`. Screenshots are in `/Users/nathan/snowmoon-rehearsal-shots/` on the owner's computer (not
committed).

## What was rehearsed, and how

The whole entrant path for the remix challenge (`/challenge`, starting sheets, fork, publish, Entry badge, marking,
sharing, "Posted on"), at phone size (390 × 844), inside a stand-in Farcaster client, at three moments:

- Fri 6 Nov 2026, 09:05 Pacific (17:05 UTC), five minutes after entries open;
- Sun 22 Nov 2026, 23:58 Pacific, the last minutes;
- Mon 23 Nov 2026, 00:01 Pacific, just after the close.

The setup, all on this machine:

- **The site:** this branch's production build (`next build`, then `next start` on port 3340). Every variable
  `.env.local` sets was set to a fake for the server (no real key; `STUDIO_DATABASE_URL` pointed at the local database),
  so a call that got out could not have spent anything.
- **The database:** PGlite in memory with every migration (0001 to 0033), served through `pglite-socket`, and the book
  seeded with `scripts/seed-text.ts`.
- **The starting sheets:** `scripts/seed-designs.ts` from branch `origin/starting-sheet-drafts` (103bc8b), run with
  `--apply --confirm-owner-go --picks=… --storage-dir=…` against the local database only, its pictures written to a
  stand-in folder. The clock was 08:30 Pacific on 6 Nov, before the window. It published "Techno vistas (starting
  point)" and the six "Starting point" sheets (Zei, Bai, Gladias, Seila, Deluin, Mu) as FID 6786. **The picks were
  "v2" for every view**, the dry run's assumption: the owner's real picks weren't given. Run again at 00:01 Pacific on
  23 Nov, `--apply` refused as designed ("The window opened at 2026-11-06T17:00:00Z … Nothing done").
- **The clock:** a preload (`--import`) in the site, the database and the seed shifted `Date` to the rehearsal's
  instant. It could be moved without a restart. PGlite's `now()` followed it, and so did the browser (an init script).
- **Sign-in:** the stand-in Farcaster client (after `scripts/miniapp-host/host.ts`) answered the SDK at 390 × 844. Quick
  Auth tokens were signed with a test key, and the site checked them for real (`@farcaster/quick-auth`, jose) against
  that key's JWKS, served by the preload in place of `auth.farcaster.xyz`.
- **Neynar scores, faked:** FID 501 scored 0.92, 502 scored 0.41, 503 scored exactly 0.70 and 504 scored 0.88. 6852
  is on the invited list.
- **Images, faked:** fal.ai answered with one fixed picture ("REHEARSAL STAND-IN"). The prompt check (Groq, or the
  gateway) answered "allow". R2 was a local folder.

## The steps

Step | Screenshot(s) | What happened
---|---|---
1 Find /challenge from the home page | `01a-home-first-visit.png`, `01b-home.png` | The home page has no link to /challenge and doesn't mention the challenge. Its only "remix" is about Adaptations.
1 … from the menu | `01c-menu.png` | The menu has no challenge entry: Adaptations, Book, References, Minpentai, Assistant. Signed in silently as @rehearsal-ada (`ready()` once, sign-in once).
1 … from References | `01d-references.png`, `01e-characters-tab.png` | References › Characters lists the sheets and doesn't mention the challenge. Before fix R5, the only link to /challenge anywhere was an entry's "Entry" badge.
1 /challenge itself (direct link) | `01f-challenge-top-in-app.png`, `01g-challenge-full-web.png` | It reads well: "Entries close Sunday 22 November, 23:59 Pacific", the rules, the six characters in order, each with its count ("0 people have entered · 3 more needed") and its starting sheet. It still shows "Draft wording: drafted for the owner, not yet approved." The bounty text describes six bounties, but none is linked and no amount is shown (`CHALLENGE.bounties` and `bountyAmount` are null).
2 Signed in, passing (0.92) | `02-pass-zei-sheet-top.png`, `02-pass-zei-sheet-bar.png` | Zei's starting sheet shows "Use as my Zei" and "Fork". Before fix R1, the sheet's line read "The project's starting style. Its text was drafted by the coding agent", on a character sheet.
2 Signed in, below (0.41) | `02-below-zei-sheet-*.png`, `02-below-fork-form.png`, `03-below-a-consent.png` … `03-below-f-refusal.png` | The 0.41 account sees exactly the same: Fork, the consent screen ("Read and agree"), the form, editing. It learns only at Generate: "Image making is open to Farcaster accounts with a Neynar score of 0.7 or more … Yours is 0.41." The message appears **below the screen** (174 px below the fold at 390 × 844, under the rules), so the tap seems to do nothing (`03-below-e-after-generate-in-view.png`).
2 Signed out, plain website | `02-signed-out-web-zei-sheet-bar.png`, `02-signed-out-web-fork-form.png`, `02-signed-out-web-sign-in-sheet.png` | Before fix R2, the fork form told a challenge visitor: "For now, making them is open to invited readers only." The website's sign-in itself (the Farcaster relay) wasn't rehearsed: it is blocked here.
3 Fork a starting sheet | `03-pass-b-form.png`, `04-di-b-form.png`, `03-below-g-style-pick.png` | The form opens, credited "Remixed from Starting point v1 · @naaate · maintainer". Before fix R8, no style was chosen: "Choose a style first.", and Generate stayed disabled until the person found the style list further down.
4 Change it | `03-pass-c-changed.png`, `04-di-c-changed.png` | The text box keeps the source's text; changed words are shaded in the preview. Every view has to be made again (3 of the 10 daily generations).
4 Make the views | `04-di-d-front.png`, `04-di-d-side.png`, `04-di-d-back.png` | Front from the text, side and back from the front. Each made by the stand-in.
5 Publish | `03-pass-e-preview.png`, `04-di-e-preview.png`, `03-pass-f-published.png`, `04-di-f-published.png` | "Preview and publish", then "Published. See it". The confirmation doesn't say whether it is now an entry. A sheet with only a front view publishes too (501's Zei).
6 Entry badge | `06a-di-bai-version-top.png` | "ENTRY This is its maker's entry for Bai in the remix challenge. Remix the cast →". Eligibility stored as `passed`, with the time; no score kept in that table.
6 Entrant count | `06b-challenge-count.png` | /challenge: Zei 1, Bai 1, "1 person has entered · 2 more needed". Entries listed newest first. Before fix R4, an untitled sheet's row read "Bai: Bai". Before fix R7, a publish didn't refresh /challenge (marking did).
7 Another version, then mark the first | `07a-di-v2-*.png`, `07b-…` to `07g-…` | v2 becomes the entry (the latest), and v1 shows "Made during the remix challenge. Its maker's latest version counts unless they mark another" with "Mark as my entry". Marking moves the badge (`07f`, `07g`). Before fix R6, the button stayed after "Marked as your entry." (`07e-v1-marked.png`).
8 Share, plain website | `08a-web-share-buttons.png` | Three plain links: `farcaster.xyz/~/compose?text=…&embeds[]=<page>`, `bsky.app/intent/compose?text=… <page>`, `hey.xyz/?text=… <page>`, each in a new tab. A tap on Bluesky opened a tab to bsky.app (refused here). No request to any network while the page was shown.
8 Share, in the mini app | `08b-app-share-buttons.png`, `08c-app-after-compose.png` | Farcaster is a button that calls `composeCast({ text, embeds: [page] })`. The host's answer (a cast hash) was added to "Posted on" ("Added.") through Neynar's cast lookup by hash (faked). Bluesky and Lens stay plain links.
9 Add a Farcaster post | `09a-…` to `09h-posted-on.png` | Refused: `https://farcaster.xyz.evil.example/…` and `https://api.farcaster.xyz@evil.example/…` and `https://127.0.0.1/…` ("That isn't a post on Farcaster…"), `http://farcaster.xyz/…` ("…starts with https://"), and a cast without the page's link ("That post doesn't link to this version's page…"). Accepted: `https://farcaster.xyz/rehearsal-di/0xabcdef12` ("Added.", then "Already listed."). The server asked only Neynar (`/v2/farcaster/cast?identifier=https://farcaster.xyz/rehearsal-di/0xabcdef12&type=url`, the address rebuilt from its checked parts). It never fetched the pasted address: no request to farcaster.xyz, evil.example or 127.0.0.1 came from the server. "Posted on" lists both as text and links only.
Late, Sun 22 Nov 23:58 Pacific | `late-a-challenge.png`, `late-b-zei-sheet-as-cy.png`, `late-c-cy-seila-*.png`, `late-d-luis-front-view.png` | Still open: "Entries close Sunday 22 November, 23:59 Pacific". 503 (not invited, exactly 0.70) forked Seila (the style chosen, fix R8) and published at 23:59:22 Pacific: decision `passed`, counted. The cap read $15 through `imagesDailySpendCapUsd()` and through the status route (fix R3). With $3 already spent that UTC day, invited 6852 still made a view.
Closed, Mon 23 Nov 00:01 Pacific | `closed-a-challenge.png`, `closed-b-zei-sheet-as-cy.png`, `closed-d-luis-front-view.png`, `closed-e-…`, `closed-fixed-e-…` | "Entries closed Sunday 22 November, 23:59 Pacific." Counts kept (Zei 1, Bai 1, Seila 1). Forking stopped for 503: no Fork button, no challenge line, and `POST /api/designs/sample` answered 403 "…open to invited readers only". The cap read $2 both ways, and 6852's next view was refused: "Image making has reached today's spending limit for everyone." Before fix R9, a candidate's page still offered "Mark as my entry", which then said "Entries are closed."
Fixes, re-shot | `fixed-R2-signed-out-fork-form.png`, `fixed-R4-entries-list.png`, `fixed-R6-marked.png`, `closed-fixed-e-di-v2-candidate-after-close.png`, `late-b-zei-sheet-as-cy.png` (R1, R5) | As described below.

## Confusing or broken, ranked

1. **A newcomer can't find /challenge.** Nothing on the home page, the menu or References points to it. Before R5,
   nothing on the sheets did either: only an entry's badge linked there. Anyone arriving from the launch cast's link is
   fine; anyone arriving from the home page, a book page or a sheet isn't. R5 adds a line on the six characters' sheets
   while the window is open. **A home or menu entry is the owner's call** (the menu order is the owner's, 2026-10-29).
2. **An account below 0.7 finds out last, and out of view.** It sees Fork like everyone, agrees to the consent screen,
   edits, chooses a style, taps Generate, and the refusal appears below the screen, under the rules. Not fixed: the
   site only knows the score after the first lookup (at Generate, by design; the owner ruled out lookups on page view).
   Options for the owner: (a) show the refusal beside the Generate buttons and scroll to it (small; no new lookup);
   (b) look the score up when a non-invited person opens a challenge fork form (a new Neynar call, needs your OK and
   maybe a Privacy line).
3. **/challenge says what counts, not who can take part.** "To count as an entry, sign in with a Farcaster account
   that passes the site's check" reads as if a failing account could still remix and just not count. In fact it can't
   make a single view. Owner's wording.
4. **"Draft wording: drafted for the owner, not yet approved."** shows at the top of /challenge, and "Draft wording" at
   the foot of the fork form and the consent screen. Remove it when you approve the words. check:ui currently checks
   that the /challenge line is there, so it changes with it.
5. **The bounties aren't set.** The page promises one bounty per character, with no link and no amount
   (`CHALLENGE.bounties`, `CHALLENGE.bountyAmount` are null). They need setting before the call.
6. *(fixed, R1)* A starting sheet said "The project's starting style".
7. *(fixed, R2)* Signed out during the challenge, the fork form said "open to invited readers only".
8. *(fixed, R8)* The fork form chose no style, so Generate was disabled with "Choose a style first."
9. *(fixed, R9)* After the close, "Mark as my entry" was still offered and then refused.
10. *(fixed, R6)* After marking, the button stayed.
11. *(fixed, R4)* Untitled entries read "Bai: Bai" on /challenge.
12. *(fixed, R7)* /challenge wasn't refreshed by a publish.
13. *(fixed, R3)* The day's cap couldn't be read through the image status route.
14. **"Published. See it"** doesn't say "This is your entry for Bai". The page it links to does. Owner's wording.
15. **"Fork" vs "remix".** The challenge says remix; the button and the form's title say Fork. The form does say
    "Remixed from". Owner's wording.
16. **The share text** ("Bai: Sheet by @rehearsal-di, made on Snowmoon Party") doesn't mention the challenge or the
    bounty. Owner's wording.
17. **The seed's style title differs.** The six sheets say "Views made in the style Techno vistas", a fork made in the
    same style says "Techno vistas (starting point)". The seed writes the sheet's `style.title` from the style file's
    name, not the published title. A one-line change on `starting-sheet-drafts`. Not made here: it isn't this branch's.
18. **A whole sheet to remake for one word.** A fork must make all three views again (3 of 10 generations a day; about
    3 versions a person a day). It is by design (the server publishes only pictures made with the exact text); worth
    saying on /challenge.
19. **A one-view sheet can be an entry.** 501 published a fork with only a front view, and it counts. By design today
    (side and back are optional).
20. **The first visitor after a phase change can see the old phase.** /challenge is cached for 60 seconds and served
    stale while it refreshes. Just after 09:00 or 00:00 Pacific, one more visitor may read "Entries open…" or "Entries
    close…". Small; a `revalidate` of a few seconds around those instants, or a dynamic page, would remove it.

## Legal wording to check (not changed)

- Privacy §4 (the owner's reread of 2026-11-01) says: "When entries close, a record of every entry is published to IPFS
  and referenced on Ethereum…". Nothing on `main` builds that record: no code mentions IPFS outside `src/lib/legal.ts`.
  Since legal texts describe today, the record has to exist at 00:00 Pacific on 23 Nov, or the line needs changing
  before then.
- /challenge says eligibility is "checked once, when you publish". The score is in fact looked up at the first
  Generate and kept a day (Privacy §7 says so), then read again at publish. Privacy is accurate; the /challenge rule
  reads more narrowly than what happens. This is the challenge page's wording, not a legal text.

## Fixes on this branch (each its own commit, each tested in `test:challenge` with a planted proof)

- **R1** `src/lib/images/wording.ts`, the sheet page: a sheet drafted by the coding agent says "The project's starting
  sheet…", a style "…starting style…".
- **R2** `src/components/design-form.tsx`: signed out on a challenge sheet's fork form, "Sign in with Farcaster to remix
  this sheet. During the remix challenge, anyone whose account passes the site's check can fork it."
- **R3** `src/app/api/images/status/route.ts`: the response carries `dailySpendCapUsd`, read through
  `imagesDailySpendCapUsd()`.
- **R4** `/challenge`: an untitled entry's row is "Bai"; a titled one "Bai: <title>".
- **R5** The sheet page: a challenge character's sheet, while the window is open and when the version isn't an
  entry, says "<Name> is in the remix challenge: fork this sheet, change it and publish to enter. Remix the cast →"
  (drafted wording).
- **R6** "Mark as my entry" goes once marked.
- **R7** Publishing a challenge character's fork or version refreshes /challenge.
- **R8** A fork or new version starts with its source's style chosen, when that style is still published.
- **R9** After the close, a candidate's page shows "Made during the remix challenge. Entries are closed: its maker's
  entry for <Name> is another version." and no button.

## Proof that nothing real was called

- **No real key in the site.** Every variable `.env.local` defines was set to a fake for the server (`FAL_KEY`,
  `GROQ_API_KEY`, `NEYNAR_API_KEY` and R2's keys: "fake-…"; `AI_GATEWAY_API_KEY` and `VERCEL_OIDC_TOKEN` empty;
  `STUDIO_DATABASE_URL` the local PGlite). The build ran with no database at all.
- **No connection off this machine.** The preload refused every TCP connection and DNS lookup to anything but
  localhost, and logged each one. The full log is `net-log.jsonl` next to the screenshots. Answered by stand-ins:
  fal.ai 13, prompt check 13, Neynar score 4, Neynar cast 4, Farcaster names 16, Quick Auth JWKS 4, R2 10. Refused, and
  never reached: `telemetry.nextjs.org` (Next's telemetry, during the first build), `auth.farcaster.xyz/nonce` (the
  website's sign-in, once), `registry.npmjs.org` (npx, 3 connections). Nothing reached fal.ai, Groq, the AI Gateway,
  Neynar, R2, Supabase or production.
- **The browser** was refused every request off the local site, except the stand-in host page, the stand-in pictures
  and `auth.farcaster.xyz` (answered locally). The only off-site request recorded was the Bluesky compose tab a tap
  opened (aborted).
- **The rehearsal's spend:** $0. The local database recorded $0.0465 of stand-in "cost" (the site's own price
  estimates), plus a $3 filler row added on purpose to test the cap.

## About the clock tool (`fake-clock.mjs` from the earlier session)

It moves `new Date()` and `Date.now()` in the main thread and in child processes, and PGlite's `now()` follows it. It
doesn't cover:

- `Date()` called without `new`: it throws "Class constructor FakeDate cannot be invoked without 'new'";
- `performance.timeOrigin`, which Next reads for its page cache: shifted only by `Date`, a cached page was never stale
  again, and /challenge stayed at "0 people have entered";
- an `eval` worker thread, which kept the real time.

The rehearsal used its own preload, which fixes all three and can move the clock without a restart.

## Not checked

- The website's own Farcaster sign-in (the relay, a QR code on another device) and wallet sign-in.
- Bluesky and Lens "Add where you posted it" (only Farcaster was asked for); automatic post finding.
- Real pictures, real prompt checks and real Neynar answers; R2's real buckets and their caching.
- Production's data: the build here had no database, so the page cached at build time was empty.
- The owner's picks for the starting views (the rehearsal used v2 throughout).

## Left for the owner

1. A way to /challenge from the home page or the menu (item 1).
2. Decide on the below-0.7 path (item 2: a or b).
3. Approve the challenge wording and drop the "Draft wording" lines (items 3, 4, 14, 15, 16).
4. Set the six bounties' poidh addresses and the amount (item 5).
5. The IPFS entry record that Privacy §4 promises at the close (legal).
6. The starting views' picks for `seed:designs`, and the seed's style title (item 17).
7. Merge this branch, if you want the fixes R1 to R9. They need no migration and don't touch legal texts.
