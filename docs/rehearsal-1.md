# Rehearsal 1: the remix challenge, Farcaster only (DRAFT)

Written by the coding agent (Claude, a closed model by Anthropic), 2026-11-04, on branch `contest`. DRAFT until the
owner approves it.

A full run of the remix challenge on your Mac, before the real open: pick a base, remix it, publish, post about it on
Farcaster, Submit, see it listed, withdraw, and see a second submission the same day refused. It runs at
**http://127.0.0.1:3000** against its own database on your Mac. Nothing it does reaches production: not the site,
not its database, not R2.

## Before you start

- `/Users/nathan/snowmoon/.env.rehearsal.local` has `IMAGES_TICKET_SECRET` and `NEYNAR_API_KEY` filled in (checked
  2026-11-04: both have values).
- Nothing else is using port 3000 (stop any `npm run dev`).
- Allow about 5 minutes for the first start (it builds the app).

## Start it

In a terminal, in the contest folder:

```
cd /Users/nathan/snowmoon-contest
```

```
npm run rehearsal:db
```

Leave that terminal open. It says `listening at postgres://postgres@127.0.0.1:54329/postgres` when ready.

Open a second terminal:

```
cd /Users/nathan/snowmoon-contest
```

```
npm run rehearsal
```

It builds (a few minutes), starts, waits about a minute while it gets the challenge pages ready, then says
`rehearsal: ready. Open http://127.0.0.1:3000/challenge`. Open that in your browser.

## What to expect

- **/challenge** is open to everyone on this server (it says nothing about "admins only"). The challenge is called
  `rehearsal-<today's date>` and its entries opened at midnight Pacific today.
- **The bases are stand-ins**: the drafts from branch `challenge-styles` (FLUX.2 [klein] 4B edits, an open model).
  Deluin and Gladias show three each, in a new random order on every visit; the others one. "First remixes by
  @naaate" shows two empty slots.
- **Sign in with Farcaster** as yourself. On this server only, admins are eligible, so your own remix can be an
  entry (you're on the invited list, so the Neynar check passes without a lookup).
- **Remix**: tap a base, press Remix, write what changes, press Remix again. The pictures are made for real and cost
  what they cost on the site (a few cents for a sheet's three views). They are kept on your Mac
  (`~/snowmoon-rehearsal-db/store`), not uploaded to R2.
- **Publish** it. The confirmation says it can be submitted.
- **Post on Farcaster** with the remix's link. The link is the rehearsal's own,
  `http://127.0.0.1:3000/references/designs/<id>`; on this server it counts as the remix's page. (This is a real
  cast from your account. Delete it afterwards if you like.)
- **Submit**: paste the cast's address on the remix's page and press Submit. The site reads the cast through Neynar
  and checks that it exists, is yours, and links to this remix. A cast by someone else, or one without the link, is
  refused.
- **Every entry**: /challenge → "Every entry" lists it, newest first; filter by character; "Shuffled" draws a new
  random order. No like, recast or reply counts anywhere; "Posted on" says "See the conversation on Farcaster".
- **Withdraw** it: it leaves "Every entry".
- **Submit again the same day** (that remix or another): refused, "You’ve already submitted a remix today…". One a
  day, Pacific time; withdrawing doesn't give the day back.

## Stop it

Press **Ctrl-C** in each terminal (the app first, then the database).

## Start again later

The database keeps everything between runs. To start the app again without rebuilding:

```
npm run rehearsal -- --no-build
```

## Reset (start from scratch)

With both stopped:

```
npm run rehearsal:db -- --reset
```

That deletes the rehearsal's database and pictures (`~/snowmoon-rehearsal-db`) and seeds the stand-in bases again.
Then start as above.

## If something goes wrong

- `rehearsal: refused to start: …`: a setting would point the app at a database other than the rehearsal's; nothing
  was started. Tell the coordinator what it says.
- `the rehearsal database isn't answering`: start `npm run rehearsal:db` first.
- `something is already using port 3000`: stop the other server.
- Submit says it can't read the post: Neynar didn't answer, or the cast isn't public yet; try again in a minute.

## The agent's dress run (2026-11-04)

Before handing this over, the coding agent ran the same server with two test persons (Farcaster IDs no real account
has) and stand-in casts read from a file, not Farcaster (`npx tsx scripts/rehearsal-dress.ts`; those stand-ins and the
script now live only on branch `contest-rehearsal`, which never merges to main: this branch has the real Farcaster
sign-in only). 22 of 22 steps
passed: /challenge open signed out with Deluin's three bases; the words screen; a remix of Deluin's base (front, side,
back, made for real); publish ("press Submit"); someone else's cast and a cast without the link refused; Submit;
listed on "Every entry" and under Deluin, not Zei; "See the conversation on Farcaster", no counts; withdraw; a second
submission the same day refused; the database the rehearsal's, the R2 keys blank, the pictures in the rehearsal
store. Pictures cost $0.0264 a run (two full runs, $0.053 in all). The database was then reset, so you start fresh.
Not covered by it: your own Farcaster sign-in and a real cast (they need you), and `npm run rehearsal` itself (the
dress run starts the server with the same settings from its own script).

## What wasn't rehearsed here

- Bluesky and Lens (rehearsal 1 is Farcaster only).
- The real bases (none is published yet) and the owner's first remixes (none exists yet).
- The Terms and Privacy lines for one-a-day and withdrawn submissions kept: drafts in `docs/legal/contest-draft.md`,
  waiting for your reread. The rehearsal doesn't change what the live site says.
