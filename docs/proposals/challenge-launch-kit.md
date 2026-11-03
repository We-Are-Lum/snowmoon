# Remix challenge: launch kit (drafts)

Drafted 2026-11-01 for Nate by Claude Code (Claude, a closed model by Anthropic), and updated the same day for the owner's decisions of 2026-11-01 (Gladias released), and on 2026-11-04 for the owner's decision of that day: no bounties at all, so the bounty texts, the replies that linked them and every mention in the posts are gone. Text drafts only: nothing here has been posted or sent. Built on `docs/proposals/remix-challenge-plan.md` (its Corrections section), `CHALLENGE` in `src/lib/config.ts` and the /challenge wording (`src/lib/challenge/wording.ts`), all on `origin/remix-challenge` as of this date.

**Before posting anything:** check every date against `CHALLENGE.dates` in `src/lib/config.ts` on the branch that is live (or against /challenge itself, which builds its dates from that config). The dates below were copied from it on 2026-11-01:

| Config key | Instant (UTC) | Written in the posts as |
|---|---|---|
| `opens` | 2026-11-06T17:00:00Z | Fri 6 Nov, 09:00 PT |
| `closes` | 2026-11-23T08:00:00Z (first instant that no longer counts) | Sun 22 Nov, 23:59 PT |
| `results` | 2026-12-04T17:00:00Z | Fri 4 Dec (the call) |

All Pacific times are PST (the clocks changed on 1 Nov). The halfway date, Thu 12 Nov, is from the plan's timeline, not the config. Characters, in the owner's order: `CHALLENGE.characters` = Zei, Bai, Gladias, Seila, Deluin, Mu.

The mint is left out of every post on purpose. If it has to be mentioned anywhere, use only: "We plan to mint each final version as an open edition, with what it raises going to everyone it was built on. Details come with the mint page."

All post texts are plain ASCII (straight apostrophes, no emoji), so characters, UTF-8 bytes and Bluesky graphemes are the same number. Counts exclude the trailing newline. Links are counted in full.

## 1. Launch posts

### Farcaster

Limit: a standard cast is at most **320 UTF-8 bytes**. The hub also accepts long casts (321 to 1,024 bytes) and 10k casts (1,025 to 10,000 bytes). Source: `validateCastAddBody` in https://raw.githubusercontent.com/farcasterxyz/hub-monorepo/main/packages/core/src/validations.ts ("text > 320 bytes", "text > 1024 bytes for long cast", "text > 10,000 bytes for 10k cast"). Which accounts can post the longer kinds is set by the apps, not the hub: Farcaster Pro (a paid subscription) was announced with 10,000-character casts (https://www.bankless.com/read/whats-new-with-farcaster). I couldn't confirm from an official page whether non-Pro accounts can still post 1,024-byte casts, so every cast here fits the standard 320.

Cast (**274 bytes**, 46 to spare):

```
Remix the cast of Snowmoon: fork a sheet of Zei, Bai, Gladias, Seila, Deluin or Mu with the site's own tools, from Fri 6 Nov, 09:00 PT, to Sun 22 Nov, 23:59 PT. Entering is free.

https://snowmoon.party/challenge

Independent adaptation; not affiliated with Vitalik Buterin.
```

### Bluesky

Limit: **300 graphemes** (and 3,000 bytes) for a post's text, from the `app.bsky.feed.post` lexicon (`maxGraphemes: 300`, `maxLength: 3000`): https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json. (GitHub didn't serve the file to me directly; the two numbers are as quoted by search results citing that file and by the `@atcute/bluesky` limits, https://app.unpkg.com/@atcute/bluesky@3.3.0/files/dist/limits.d.ts.) The Bluesky app may shorten a pasted link in the text it saves, which only lowers the count.

Post (**268 graphemes**, 32 to spare):

```
Remix Snowmoon's cast: fork a sheet of Zei, Bai, Gladias, Seila, Deluin or Mu. Fri 6 Nov, 09:00 PT, to Sun 22 Nov, 23:59 PT. Free; entries need a checked Farcaster account.

https://snowmoon.party/challenge

Independent adaptation; not affiliated with Vitalik Buterin.
```

Most Bluesky readers have no Farcaster account, so the post says entries need one. "Checked" stands for the Neynar check; the rules page explains it.

### Lens

Limit: the Lens protocol sets none that I could find for a post. In `@lens-protocol/metadata` 2.1.0 (npm, read 2026-11-01), the v3 post schema's `content` is a non-empty Markdown string with no maximum (`jsonschemas/posts/text-only/3.0.0.json`); the older v2 publication schema capped it at 30,000 characters. Docs: https://lens.xyz/docs/protocol/best-practices/metadata-standards and https://github.com/lens-protocol/metadata. Apps (such as Hey) may set their own lower limit; I found none published. The post below is long enough to carry the rules but short of any likely app limit.

Post (**811 characters**):

```
Remix the cast of Snowmoon.

From Friday 6 November, 09:00 Pacific, to Sunday 22 November, 23:59 Pacific, make your own version of Zei, Bai, Gladias, Seila, Deluin or Mu on snowmoon.party. Start from a published sheet or someone else's remix, change it with the site's own tools, and publish. Your version gets its own page, credited back to what you built on.

One entry per person per character. Entering is free. To count, sign in with a Farcaster account that passes the site's check.

At the call on Friday 4 December, Nate shows the final versions, built from the remixes and credited to their makers. A character needs at least three different people with an entry to get one.

https://snowmoon.party/challenge

An independent adaptation of Snowmoon by Vitalik Buterin (GPL-3.0); not affiliated with him.
```

## 2. Personal invite (DM)

**372 characters**. Fits a Farcaster direct message; for anyone without a Farcaster account it isn't worth sending, since they can't enter. Eligibility is a Neynar score of at least 0.7 or the invited list, and the owner decided on 2026-10-31 to add no new invitees, so send it to people who already pass.

```
Hi [name], I'm running a remix challenge on snowmoon.party, the open adaptation of Snowmoon, and I'd like you in it. From Fri 6 Nov to Sun 22 Nov, 23:59 PT, you fork a sheet of Zei, Bai, Gladias, Seila, Deluin or Mu with the site's tools, change it, and publish. Entering is free; you sign in with Farcaster. Rules and the starting sheets: https://snowmoon.party/challenge
```

## 3. Halfway post (Thu 12 Nov), template

Counts only, never rankings: no "leading", no "most popular", no names of entrants, no order other than the owner's character order. Fill the placeholders from /challenge (it shows each character's count of different eligible entrants) on the morning of the post.

```
Snowmoon remix challenge, halfway: [N entries so far] from [N people].

Still below three entrants: [characters still below three entrants]. A character needs three different people with an entry to get a final version.

Entries close Sun 22 Nov, 23:59 PT.

https://snowmoon.party/challenge
```

As written with its placeholders it is 290 characters. Filled in like the example below it is **270 characters**, so it fits a standard Farcaster cast (320 bytes) and Bluesky (300 graphemes) as long as the filled-in text stays under about 300. The "not affiliated" line doesn't fit beside it on Farcaster or Bluesky; on Lens, add it at the end. If every character already has three entrants, replace the second paragraph with "Every character has at least three entrants."

Example (made-up numbers, 270 characters):

```
Snowmoon remix challenge, halfway: 14 entries so far from 11 people.

Still below three entrants: Gladias, Seila and Mu. A character needs three different people with an entry to get a final version.

Entries close Sun 22 Nov, 23:59 PT.

https://snowmoon.party/challenge
```

## Open points for Nate

1. **Gladias is released** (owner, 2026-11-01), but `CHALLENGE.held` on `origin/remix-challenge` still lists `gladias`, so /challenge still says his starting sheet is held. That needs a config change and his sheet published before 6 Nov; the posts already name him.
2. **Dates** in every post are written out by hand: re-check against `CHALLENGE.dates` before posting, and again if any date moves.
