# Remix challenge: launch kit (drafts)

Drafted 2026-11-01 for Nate by Claude Code (Claude, a closed model by Anthropic). Text drafts only: nothing here has been posted or sent. Built on `docs/proposals/remix-challenge-plan.md` (its Corrections section), `CHALLENGE` in `src/lib/config.ts` and the /challenge wording (`src/lib/challenge/wording.ts`), all on `origin/remix-challenge` as of this date.

**Before posting anything:** check every date against `CHALLENGE.dates` in `src/lib/config.ts` on the branch that is live (or against /challenge itself, which builds its dates from that config). The dates below were copied from it on 2026-11-01:

| Config key | Instant (UTC) | Written in the posts as |
|---|---|---|
| `opens` | 2026-11-06T17:00:00Z | Fri 6 Nov, 09:00 PT |
| `closes` | 2026-11-23T08:00:00Z (first instant that no longer counts) | Sun 22 Nov, 23:59 PT |
| `results` | 2026-12-04T17:00:00Z | Fri 4 Dec (the call) |

All Pacific times are PST (the clocks changed on 1 Nov). The halfway date, Thu 12 Nov, is from the plan's timeline, not the config. Characters, in the owner's order: `CHALLENGE.characters` = Zei, Bai, Gladias, Seila, Deluin, Mu.

The mint is left out of every post on purpose. If it has to be mentioned anywhere, use only: "We plan to mint each final version as an open edition, with what it raises going to everyone it was built on. Details come with the mint page."

All post texts are plain ASCII (straight apostrophes, no emoji), so characters, UTF-8 bytes and Bluesky graphemes are the same number. Counts exclude the trailing newline. Links are counted in full.

## 1. The poidh bounty

Suggested setup, from the plan's recommendation (open decision 6, for Nate to confirm): a **solo** bounty on **Base**, funded by Nate, who picks the one winner. On poidh a solo bounty can't take money from others, and a single-contributor bounty pays out when its creator confirms a claim, with no 48-hour vote.

**Title** (poidh says links can't go in a claim title; keep the bounty title short too):

> Remix a Snowmoon character on snowmoon.party

**Description** (poidh's description field takes Markdown):

> One bounty for the whole Snowmoon remix challenge: AMOUNT.
>
> **What it's for.** The remix that most changes how we see the character while staying true to the book.
>
> **What counts.** An entry in the remix challenge at https://snowmoon.party/challenge: a fork of a sheet of Zei, Bai, Gladias, Seila, Deluin or Mu (or of someone else's remix), made on snowmoon.party with the site's own tools and published between Fri 6 Nov, 09:00 PT, and Sun 22 Nov, 23:59 PT. A new sheet from scratch isn't an entry. One entry per person per character. To count, the maker signs in with a Farcaster account that passes the site's check (a Neynar score of at least 0.7) or is on the invited list. Admins aren't eligible.
>
> **How to claim.** Post your version's link (its page on snowmoon.party) as a claim on this bounty: put the link in the claim description, and use the front view of your version as the claim image.
>
> **Judging.** Nate picks one winner after entries close and names it at the call on Fri 4 Dec. Only versions that are entries on /challenge are considered.
>
> **Costs.** Entering the challenge is free, and minting isn't needed for anything. Claiming here is a transaction on Base: poidh records each claim as an NFT, so it costs a little gas, and poidh takes 2.5% of the payout.
>
> An independent adaptation of Snowmoon by Vitalik Buterin (GPL-3.0), not affiliated with him.

**What poidh's site says, and what I used** (read 2026-11-01):
- Bounty fields are title, description (Markdown, with a preview), amount, chain (Ethereum mainnet, Base or Arbitrum) and type (open or solo). No length limits or minimum amount are stated. A bounty can be cancelled at any time unless it is under vote, with no fee. Source: https://docs.poidh.xyz/using-poidh/creating-a-bounty.html
- A claim has a title (no links allowed in it), a description (links allowed) and an image; evidence can be photos, video, links or text. A claim is minted as an NFT when it is submitted. Bounties with several contributors have a 48-hour vote; single-contributor bounties pay out at once when confirmed. Source: https://docs.poidh.xyz/using-poidh/claiming-a-bounty.html
- poidh takes a 2.5% protocol fee from the payout. On open bounties, contributors vote on a claim, weighted by what they put in; more than 50% yes pays out. Source: https://docs.poidh.xyz/start-here/how-it-works.html
- The docs don't say whether a claim image is required, or whether a bounty can have a deadline; there is no deadline field, so the close date lives in the description only.

## 2. Launch posts

### Farcaster

Limit: a standard cast is at most **320 UTF-8 bytes**. The hub also accepts long casts (321 to 1,024 bytes) and 10k casts (1,025 to 10,000 bytes). Source: `validateCastAddBody` in https://raw.githubusercontent.com/farcasterxyz/hub-monorepo/main/packages/core/src/validations.ts ("text > 320 bytes", "text > 1024 bytes for long cast", "text > 10,000 bytes for 10k cast"). Which accounts can post the longer kinds is set by the apps, not the hub: Farcaster Pro (a paid subscription) was announced with 10,000-character casts (https://www.bankless.com/read/whats-new-with-farcaster). I couldn't confirm from an official page whether non-Pro accounts can still post 1,024-byte casts, so the cast below fits the standard 320.

Cast (**316 bytes**, 4 to spare; any edit that adds words will need a cut):

```
Remix the cast of Snowmoon: fork a sheet of Zei, Bai, Gladias, Seila, Deluin or Mu with the site's own tools, from Fri 6 Nov, 09:00 PT, to Sun 22 Nov, 23:59 PT. Entering is free. One poidh bounty for the whole challenge.

https://snowmoon.party/challenge

Independent adaptation; not affiliated with Vitalik Buterin.
```

Optional reply under it, once the bounty is live (**205 bytes** as written; about 220 with a real amount and link):

```
The poidh bounty, AMOUNT: [poidh bounty link]

It goes to the remix that most changes how we see a character while staying true to the book. To be in the running, post your version's link as a claim on it.
```

### Bluesky

Limit: **300 graphemes** (and 3,000 bytes) for a post's text, from the `app.bsky.feed.post` lexicon (`maxGraphemes: 300`, `maxLength: 3000`): https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json. (GitHub didn't serve the file to me directly tonight; the two numbers are as quoted by search results citing that file and by the `@atcute/bluesky` limits, https://app.unpkg.com/@atcute/bluesky@3.3.0/files/dist/limits.d.ts.) The Bluesky app may shorten a pasted link in the text it saves, which only lowers the count.

Post (**291 graphemes**):

```
Remix the cast of Snowmoon: fork a sheet of Zei, Bai, Gladias, Seila, Deluin or Mu on snowmoon.party. Fri 6 Nov, 09:00 PT, to Sun 22 Nov, 23:59 PT. Free; entries need a checked Farcaster account.

https://snowmoon.party/challenge

Independent adaptation; not affiliated with Vitalik Buterin.
```

Most Bluesky readers have no Farcaster account, so the post says entries need one. "Checked" stands for the Neynar check; the rules page explains it.

### Lens

Limit: the Lens protocol sets none that I could find for a post. In `@lens-protocol/metadata` 2.1.0 (npm, read 2026-11-01), the v3 post schema's `content` is a non-empty Markdown string with no maximum (`jsonschemas/posts/text-only/3.0.0.json`); the older v2 publication schema capped it at 30,000 characters. Docs: https://lens.xyz/docs/protocol/best-practices/metadata-standards and https://github.com/lens-protocol/metadata. Apps (such as Hey) may set their own lower limit; I found none published. The post below is long enough to carry the rules but short of any likely app limit.

Post (**861 characters**):

```
Remix the cast of Snowmoon.

From Friday 6 November, 09:00 Pacific, to Sunday 22 November, 23:59 Pacific, make your own version of Zei, Bai, Gladias, Seila, Deluin or Mu on snowmoon.party. Start from a published sheet or someone else's remix, change it with the site's own tools, and publish. Your version gets its own page, credited back to what you built on.

One entry per person per character. Entering is free. To count, sign in with a Farcaster account that passes the site's check.

At the call on Friday 4 December, Nate shows the final versions, built from the remixes and credited to their makers. A character needs at least three different people with an entry to get one. There's one poidh bounty for the whole challenge.

https://snowmoon.party/challenge

An independent adaptation of Snowmoon by Vitalik Buterin (GPL-3.0); not affiliated with him.
```

## 3. Personal invite (DM)

**372 characters**. Fits a Farcaster direct message; for anyone without a Farcaster account it isn't worth sending, since they can't enter. Eligibility is a Neynar score of at least 0.7 or the invited list, and the owner decided on 2026-10-31 to add no new invitees, so send it to people who already pass.

```
Hi [name], I'm running a remix challenge on snowmoon.party, the open adaptation of Snowmoon, and I'd like you in it. From Fri 6 Nov to Sun 22 Nov, 23:59 PT, you fork a sheet of Zei, Bai, Gladias, Seila, Deluin or Mu with the site's tools, change it, and publish. Entering is free; you sign in with Farcaster. Rules and the starting sheets: https://snowmoon.party/challenge
```

## 4. Halfway post (Thu 12 Nov), template

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

1. **Bounty AMOUNT**, chain and type (plan recommends solo on Base). Not set.
2. **Claiming costs gas.** The owner's line "minting isn't needed for anything" holds for entering, but a poidh claim is itself minted as an NFT on Base when submitted, so the bounty text says claiming costs a little gas. Please check that wording.
3. **Who can win the bounty.** The draft limits the bounty to versions that are entries on /challenge (eligible makers, in the window, forks only). The plan didn't say this outright; confirm.
4. **"The character" vs "a character".** The judging line is the plan's ("how we see the character"); /challenge says "a character". Either reads fine; pick one for both.
5. **Gladias is held** (`CHALLENGE.held`): /challenge says his starting sheet is held for a check. If it's still held on 6 Nov, the posts still name him but there'd be nothing to fork. Drop him from the posts, or publish the sheet first.
6. **The bounty link on /challenge.** The page's bounty paragraph has no link to the poidh bounty; add one once it exists, so a claim is easy to find.
7. **Dates** in every post are written out by hand: re-check against `CHALLENGE.dates` before posting, and again if any date moves.
