# The shortlist vote (DRAFT proposal, no code)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-01, on branch `shortlist-vote`, for the
owner. **DRAFT until the owner approves it. Proposal only:** nothing here is built, merged, posted or deployed, and no
model was called.

Builds on: the remix challenge plan (`docs/proposals/remix-challenge-plan.md` on `remix-challenge`, whose Corrections
of 2026-10-31 override its body: "the shortlist vote stays a date only (not built)"; "one poidh bounty for the whole
challenge"), `CHALLENGE` in `src/lib/config.ts` on that branch, the sign-in branch `signin-lens-bluesky` (its branch
report and `docs/legal/signin-lens-bluesky-draft.md`), and `docs/principles.md` (P5, P6, P7).

**Dates** (already in `CHALLENGE.dates`, unchanged): the vote opens Tue 1 Dec 2026, 00:00 Pacific
(`shortlistOpens: 2026-12-01T08:00:00Z`) and closes at the end of Thu 3 Dec 2026, 23:59 Pacific
(`shortlistCloses: 2026-12-04T08:00:00Z`, the first instant that no longer counts). Results at the Fri 4 Dec call,
09:00 Pacific (`results`). The jurors' deep funding questions run in the same days but are a separate page and a
separate record (below).

## In brief

- On the site, signed in, **one vote per person per character**, for one of that character's entries.
- The vote makes a **shortlist** per character. The shortlist decides **support only**: which entries are in the
  running for the one poidh bounty. It never changes a version, a final version, the credit, the split or any order.
- **The bounty stays judged:** the owner funds a solo poidh bounty on Base and picks the one winner, from the
  shortlists. The vote narrows the field; it doesn't pick the winner and nothing is drawn.
- Voters: Farcaster with a Neynar score of at least 0.7 (the site's check), Lens above a score setting, Bluesky
  accounts created before 6 Nov 2026. **No wallet-only votes.** Linked accounts are one person, one vote.
- **Totals are hidden until the close, in the database itself**, not only on the page: the app's database role can't
  read the ballots, and the totals view returns nothing before the close.

---

## 1. Mechanics

### What's voted on

For each challenge character with at least `CHALLENGE.minEntrants` (3) different eligible entrants, the ballot is
that character's **counting entries**: for each eligible person, the version they marked as their entry, or else
their latest version in the window (`standing()` in `src/lib/challenge/entries.ts`). Not on the ballot: versions by
admins (not eligible for rewards), versions by ineligible makers, the owner's final versions, and the starting sheets.
Characters under the minimum get no final version, credit test or token (owner, 2026-10-31); I propose they get no
vote either, so the bounty field matches the rest (open question 3).

The ballot lists entries **in time order, newest first** (`newestFirst`, the same order as everywhere in the challenge;
P5g). No counts, no "leading", no badge while the vote is open.

A voter picks one entry per character, or none. They may change their pick until the close; the latest counts. They
cannot vote for their own entry (any entry whose maker is one of the voter's linked accounts).

### What a "shortlist" is

**Proposal:** a character's shortlist is its entries with the most votes, up to `CHALLENGE.vote.shortlistSize` (3),
with ties at the cut all included, and only entries with at least `CHALLENGE.vote.minVotes` (proposed 3) votes. With
six characters that's at most about 18 entries across the challenge. After the close, each character's shortlist is
shown **in time order**, labelled "Shortlisted by the vote, 1 to 3 Dec", never as a ranking (no 1st/2nd/3rd).

### How it relates to the owner's final version

It doesn't. The owner publishes the final versions between 23 and 30 Nov, **before** the vote opens, from the
remixes he chooses (owners, not votes). The vote can't change what a final version is, which entries it credits, or
anything about them. It runs after the content is settled, and only on support.

### How it relates to the poidh bounty

There is one bounty for the whole challenge (owner, 2026-10-31). The proposal: **the owner picks the winner from the
union of the six characters' shortlists**, against the published judging line ("the remix that most changes how we
see the character while staying true to the book"). The vote makes the field; the owner judges within it. That is
the vote deciding support (who can receive the bounty) and nothing else.

The alternative is a purely advisory vote (the owner may pick any entry). That keeps more judgement with the owner,
but then the vote decides nothing, and I'd rather not run a vote whose result can be ignored silently. Open question 1.

### What a vote result can and can't change

| A vote result **can** | A vote result **can't** |
|---|---|
| Put an entry on its character's shortlist | Change any version, final version, sheet or recipe |
| Make an entry eligible to be picked for the poidh bounty | Pick the bounty winner (the owner judges) |
| Be shown, as totals, after the close | Change which entries a final version credits |
| | Enter the deep funding test: the jurors, the models, the weights or the split |
| | Change whether a version counts as an entry, or a character's entrant count |
| | Order, sort, feature or badge anything anywhere (feed, search, profiles, /challenge, agents, read API) |
| | Decide whether a character gets a final version or a token |
| | Change the mint: price, window, metadata or payout |

## 2. Who can vote, per network

A voter is a **person**: a sign-in plus every account linked to it (§2e). The person can vote if **any one** of their
accounts passes its network's check below. The check is made **once, when they first vote** in the window, and stored
with the ballot (the same rule as entries: "checked once and stored; never on page view"). Viewing the vote page asks
no outside service anything.

Admins (`ADMINS`: the owner, @garance) don't vote: the owner judges the bounty, and admins aren't eligible for
rewards. Invited FIDs (`IMAGES.invited`) skip the score, as for entries. Jurors may vote (open question 8).

### 2a. Farcaster: Neynar score at least 0.7

Reuse the site's existing check: `lookUp(sql, fid)` in `src/lib/images/neynar.ts`, against `IMAGES.neynarMinScore`
(0.7), with its day-long cache in `studio.image_scores` (migration 0010), as `mayGenerate` in `src/lib/images/gate.ts`
does and as `src/lib/challenge/record.ts` does at publish. Neynar unreachable: "We couldn't check your account; try
again in a minute", and no ballot is written. The score is stored with the ballot (like
`studio.challenge_eligibility.score`) and never shown.

### 2b. Lens: a score threshold, as a setting

A new setting, **`CHALLENGE.vote.lensMinScore`**, null by default: while null, Lens accounts can't vote and Lens's
score is never looked up for the vote. It's separate from `SOCIAL_SIGN_IN.lens.minScore` (free generations), because
the stakes differ: a vote moves bounty money; a free image costs us a fraction of a cent. The lookup reuses
`lensScore` from `src/lib/social/free.ts` (our server to `api.lens.xyz`; never from the browser).

What the number means, from the sign-in branch's sample of 644 Lens accounts (2026-10-31): the score runs 0 to about
10,000 and is bimodal; every account made in 2026 among recent posters scored 0; established accounts sit at
9,986–9,998. **1000** lets in about one in eleven of a broad sample and no new account; **5000** essentially only
established accounts. I'd suggest **5000** for the vote (open question 4).

### 2c. Bluesky: accounts created before 6 Nov 2026

**What I checked (2026-11-01, ~06:30 UTC, read-only, no sign-in).** `app.bsky.actor.getProfile` on
`public.api.bsky.app` returns a `createdAt` field:

```
$ curl -s "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=jay.bsky.team"
{"did":"did:plc:oky5czdrnfjpqslsw2a5iclo","handle":"jay.bsky.team", … ,"createdAt":"2022-11-17T06:31:40.296Z", … }
HTTP 200
```

**Is it the profile record's date or the account's?** The account's, as Bluesky's own AppView saw it, **not** the
profile record's:

- The profile record (`app.bsky.actor.profile/self`, in the person's own repository) has an optional `createdAt` that
  the person's client writes and the person can set to anything. For older accounts it's absent: Jay's record has no
  `createdAt` at all, yet getProfile shows one.
- For eight long-standing accounts (jay.bsky.team, bsky.app, pfrazee.com, atproto.com, nytimes.com, theonion.com,
  bnewbold.net, emilyliu.me) getProfile's `createdAt` equals, to the millisecond, the `createdAt` of the account's
  first operation in the PLC directory's audit log (`https://plc.directory/<did>/log/audit`), e.g. Jay:
  `2022-11-17T06:31:40.296Z` in both.
- **The decisive case:** among the newest followers of bsky.app, one account's profile record says
  `"createdAt":"2230-01-02T05:03:21.973Z"` (the year 2230). getProfile shows `"createdAt":"2026-06-21T10:26:10.660Z"`,
  1.5 seconds after its PLC creation (`2026-06-21T10:26:09.184Z`). So getProfile ignores the record's date.
- Bluesky's open-source AppView passes the record's date through, with the comment "`@NOTE profile creation date not
  trusted in production`" (`packages/bsky/src/data-plane/server/routes/profile.ts` in bluesky-social/atproto). The
  production AppView evidently uses its own date instead: equal to PLC creation for accounts it backfilled, and its
  first sight of the account (seconds to hours after PLC creation) for newer ones. That last part is my reading of the
  data, not a documented guarantee.

**Can it be faked?** Not by editing the profile: that date is ignored. The PLC directory's `createdAt` is set by
plc.directory when it accepts the operation, so it can't be backdated either. What can't be stopped:

- **Making accounts before the cutoff.** Today is 1 Nov; anyone can create many free Bluesky accounts before 6 Nov and
  vote with each in December. A date cutoff only stops accounts made *after* it. An earlier cutoff (for example
  "before 1 Nov 2026", before the challenge was announced) would be stronger. Open question 5.
- **Bought or handed-over accounts.** Old accounts change hands; nothing in the date shows that.
- **`did:web` accounts** have no PLC log; only the AppView's first-sight date exists for them.

**Proposal:** our server reads the account's creation date from **plc.directory's audit log** (the first operation's
`createdAt`), which the Bluesky sign-in draft already names in Privacy §7, so no new outside service; `did:web`
accounts can't vote. The alternative is getProfile on Bluesky's AppView (`public.api.bsky.app`, which would be a new
name in Privacy §7); it agreed with PLC in every case I tried. Setting: **`CHALLENGE.vote.blueskyCreatedBefore:
'2026-11-06T08:00:00Z'`** (00:00 Pacific on Fri 6 Nov; PST, since the clocks changed on 1 Nov). Open question 6
(PLC or AppView).

### 2d. Wallets

**A wallet on its own can't vote,** for the same reason the owner removed wallet eligibility for entries: no wallet
path until wallets can make sheets, and a wallet costs nothing to make, so it would be a free extra vote. A wallet
**linked** to a Farcaster account signs in as that FID today (`getPerson`), so it votes as that FID, with the FID's
check, and only once. P7 too: money never buys a vote, so a prepaid balance plays no part.

### 2e. One person, several linked accounts: one vote

Today a linked wallet, Lens or Bluesky account signs in as the account it's linked to (`getPerson`; `studio.wallet_links`,
and `studio.social_links` on the sign-in branch). That alone doesn't stop two loopholes: vote with an unlinked Bluesky
account, then link it and vote again as the FID; or vote as the FID, unlink, and vote again with the Bluesky account.

**How it's enforced:**

1. **At the ballot, in the database.** A ballot records every account in the voter's **cluster**: the signed-in
   account plus every account linked to it, now or at any time since the vote opened (from the link tables' history:
   `linked_at`, `unlinked_at`). Each account is a key: `fid:6786`, `wallet:12`, `lens:0x…`, `bluesky:did:plc:…`. A
   unique constraint on (challenge, character, account key) means a second ballot touching any account that's already
   on one fails in the database, whatever the app does. Changing your pick updates your one ballot; it doesn't add one.
2. **At the tally (the close).** Clusters are recomputed from the full link history in the window (union of every link
   active at any moment from `shortlistOpens` to `shortlistCloses`). If two ballots now share a cluster (two accounts
   linked after both voted), only the earlier ballot counts, and the later one is marked "merged" in the private record.
3. **Unlinking during the window doesn't split a person:** a link that existed at any time in the window counts.

What this can't catch: one human with accounts that are **never** linked (a Farcaster account and a separate Bluesky
account). That's the reason for the per-network checks; it's the same residual as entries and free images. Said
plainly in the rules: "one vote per person; we count linked accounts as one person; voting with several unlinked
accounts breaks the rules and those votes may be removed".

## 3. Totals hidden until the close

### Who can see what, when

| When | The voter | Everyone else | Entrants | The owner and admins |
|---|---|---|---|---|
| Before 1 Dec | Nothing (the page says when it opens) | Same | Same | Same |
| 1–3 Dec (open) | Their own pick per character, and that they can change it | That the vote is open, the ballot (entries in time order), no numbers | Same as everyone: no count for their own entry | Same as everyone, on the site |
| From the close (4 Dec 08:00 UTC, the night before the call) | Their own pick (until deletion) | Each entry's total, and each character's shortlist, in time order | Same | Same |
| Never | — | Who voted, or who voted for what | Who voted for them | Who voted for what (not on the site; see the residual) |

Totals are shown per entry after the close (P6: "only totals are" readable). They are never sorted by count, never
summed into "most voted overall", and the shortlist label doesn't rank.

### How "hidden" is guaranteed, server-side

1. **The app's role can't read ballots.** `studio_writer` gets **no select** on the ballot tables (unlike every other
   table so far). It writes and reads only through two `security definer` functions: `cast_vote(...)` (refuses outside
   the window, by the database clock, and checks the entry is a counting, eligible entry and not the voter's own) and
   `my_votes(account_keys)` (returns only the caller's own picks).
2. **The window lives in the database,** in a row the migration writes (`studio.vote_rounds`: opens, closes), owned by
   `postgres`; the app can't move the close. A test checks it equals `CHALLENGE.dates`.
3. **The totals view returns nothing before the close:** `studio.vote_totals` filters on `now() >= closes` from that row.
   Before the close, any route, agent tool or bug that asks gets zero rows, not hidden rows.
4. **No public read** on any of it (P6b, P6c), and the totals view is readable by `studio_writer` only, so even after
   the close the public sees totals through the pages, as for likes.
5. **The page renders no count before the close,** and its cache is keyed so a pre-close render can't be served after.

**Residual, said plainly:** the owner, as `postgres` in the Supabase SQL Editor, can read the ballots at any time.
The proposal is that he commits not to (and says so in the rules), and that the vote's numbers come only from the
totals view. Nobody else can.

## 4. How the winner's poidh claim gets paid

### How poidh works today (docs.poidh.xyz, read 2026-11-01)

- **Chains:** Ethereum mainnet, Base and Arbitrum (v3 contracts; on Base, `0x5555Fa783936C260f77385b4E153B9725feF1719`,
  deployed 19 Jan 2026). Minimum bounty 0.001 ETH. Rewards are in ETH. ("creating a bounty", "deployment")
- **Two bounty types.** A **solo bounty** "is funded exclusively by its creator. Other people cannot add funds to
  it." An **open bounty** can be funded by anyone (up to 150 wallets). ("creating a bounty", "how poidh works")
- **Who picks the winner.** "It's up to the bounty creator to decide which one best fulfills the bounty." One winner
  per bounty, the whole reward, no splits. **Solo:** the creator clicks "accept" and "confirming a winner immediately
  completes the bounty … There is no additional review step." **Open:** the creator nominates; contributors then have
  48 hours to vote, weighted by what they put in; more than 50% of participating voters approving pays, otherwise the
  bounty resets. Nominating or accepting can't be undone. ("confirming a claim", "voting on claims", "how poidh works")
- **Claims.** A claim is the participant's evidence (title, description with links, an image), **minted as an NFT** on
  submission, from the claimant's wallet (so it costs them a little gas). The winning claim's NFT goes to the bounty
  creator; the others are "effectively burned". The bounty page shows the claim's wallet, and its Farcaster account if
  the wallet is verified on Farcaster. ("claiming a bounty", "claim NFTs")
- **Payment.** Pull payment: the winner connects the wallet that submitted the claim and withdraws from their poidh
  profile. A flat **2.5% protocol fee** is taken; the winner also pays the chain's gas. ("getting paid")
- **Cancelling:** the creator can cancel any time it isn't under vote; funds return, no fee. Deadlines in the text
  aren't enforced by the protocol. ("creating a bounty", "how poidh works")

Sources: <https://docs.poidh.xyz/start-here/how-it-works.html>,
<https://docs.poidh.xyz/using-poidh/creating-a-bounty.html>,
<https://docs.poidh.xyz/using-poidh/claiming-a-bounty.html>,
<https://docs.poidh.xyz/using-poidh/confirming-a-claim.html>,
<https://docs.poidh.xyz/using-poidh/voting-on-claims.html>,
<https://docs.poidh.xyz/using-poidh/getting-paid.html>, <https://docs.poidh.xyz/features/claim-nfts.html>,
<https://docs.poidh.xyz/contracts/deployment.html>; poidh's blog on open bounties,
<https://paragraph.xyz/@poidh/poidh-open-multiplayer-bounties-explained>.

### The flow, with the plan's solo bounty on Base

1. **6 Nov:** the owner creates a **solo** bounty on Base from his own wallet, amount his choice, with the judging line
   and the rule "the winner is picked by Nate from the entries shortlisted by the site's vote, 1 to 3 Dec". Solo, so
   nobody can add money and nobody's money votes on the winner (P7: payments never enter scoring; an open bounty would
   put a money-weighted vote on top of ours).
2. **6 Nov to 3 Dec:** entrants who want to be in the running post a poidh claim with their version's page link (the
   plan's rules already say so). **Proposed rule:** claims by the vote's close, 23:59 Pacific Thu 3 Dec; poidh enforces
   no deadline, so this is ours to state.
3. **4 Dec 08:00 UTC:** the vote closes; the shortlists exist.
4. **Before or at the 4 Dec call:** the owner reads the shortlisted entries' claims, checks each claim belongs to that
   entry's maker (the claim links the version page, and its wallet is one of the maker's Farcaster-verified addresses,
   which poidh's page shows; for a Lens or Bluesky entrant that would need another proof, but entries are Farcaster
   only today), picks one against the judging line, and clicks "accept". It settles at once.
5. **The winner withdraws** from their poidh profile: 97.5% of the bounty, less Base gas.
6. The site shows "poidh bounty: picked by Nate" on the winning version's page, labelled as the owner's pick (P5's rule
   for picks), with a plain link to the bounty (a link, no embed: P6a).

If no shortlisted entry has a valid claim, the owner picks the shortlisted entry whose maker can still make one (a
day's grace), or cancels the bounty and says so. Open question 9.

### Judged, not voted, and the legal notes

**The bounty is judged.** The owner picks the winner; the vote only decides which entries he picks from. Nothing is
drawn, so there's no chance element, and entering and voting are free. The plan's legal note ("The bounty is judged,
not drawn. That keeps it out of lottery territory") still holds, with three additions for the tax adviser (not advice):

- **The rules must say who judges and on what,** and that a public vote shortlists first. A popularity stage is still
  not chance, but it should be described as what it is.
- **The poidh claim costs the entrant gas** (it's minted as an NFT). That's paid to the network, not to us, and
  only to be in the running for the bounty, not to enter the challenge; worth naming so "free to enter" stays true.
- **The prize is paid from the owner's wallet** (not the LLC's) unless he funds it from the LLC. Whose payment it is
  matters for the earlier tax questions (payments to people outside the US). And the winner's wallet should be
  screened against the sanctions list before accepting, as for split recipients.

## 5. What it needs from the sign-in branch (`signin-lens-bluesky`)

Lens and Bluesky can vote only once their sign-in is live. From that branch's report, still to happen:

1. The owner's **"reread"** of `docs/legal/signin-lens-bluesky-draft.md` (variant A or B), its lines in `legal.ts` in
   the same release.
2. **"applied"** for `NEXT_signin_lens_bluesky.sql` (`studio.social_accounts`, `studio.social_links`).
3. **Linking in the UI:** the You page link/unlink panel (the route `/api/social-link` exists; no page offers it yet).
   The vote's one-person rule depends on link history, so `studio.social_links` must keep `linked_at` and
   `unlinked_at` (it does).
4. **The score setting:** the branch has `SOCIAL_SIGN_IN.lens.minScore` (null) and `lensScore()`. The vote adds its
   own `CHALLENGE.vote.lensMinScore` and reuses `lensScore()`.
5. **A registered Lens App** for the site (the branch uses Lens's test App).
6. Then turning `lens` and `bluesky` on in `SIGN_IN_METHODS`.

If those aren't done by about 24 Nov, the vote runs Farcaster-only (and linked wallets), and the rules say so. Open
question 7.

## 6. Storage: a migration sketch (no SQL file)

`NEXT_shortlist_vote.sql`, numbered at merge, run as `postgres` with the usual dry run and a read-back that inserts
and deletes a realistic ballot. Needs the remix challenge's migration (entries, eligibility) and, for Lens and
Bluesky, the sign-in branch's.

- **`studio.vote_rounds`** (challenge, opens, closes, results): one row, written by the migration. Readable by
  `studio_writer`; not writable by it.
- **`studio.vote_ballots`**: id; challenge; character; `version_id` (references `element_versions`); the voter's
  person number; the network and check that qualified them (`'neynar' | 'invited' | 'lens' | 'bluesky-age'`) and its
  value (score, or the creation date); cast_at; changed_at; status (`'counted' | 'merged' | 'removed'`). Unique per
  (challenge, character, person).
- **`studio.vote_accounts`**: ballot id; challenge; character; account key (`fid:…`, `wallet:…`, `lens:…`,
  `bluesky:…`). **Unique (challenge, character, account key)**: the one-vote rule in the database.
- **`studio.vote_totals`** (view, owner `postgres`, security definer): per entry, the count of counted ballots,
  **only where `now() >= closes`**. Readable by `studio_writer`.
- **`studio.vote_results`** (written once after the close by the owner, as `postgres`): per character, the entries,
  their totals and the shortlist flag. Kept for good, with no person in it.
- **Functions** (security definer): `cast_vote(...)`, `my_votes(...)`.

**Privacy:** RLS on; nothing for `anon` or `authenticated`; `studio_writer` has no select, update or delete on
`vote_ballots` or `vote_accounts`, only execute on the two functions and select on the view. No IP address, user
agent or device data is kept.

**Retention:** ballots and their account keys (who voted for what, and the score or date that qualified them) are
deleted **30 days after results**, on **3 Jan 2027**, by a `postgres` statement the owner runs (no scheduled job holds
the rights); `vote_results` stays. Until then a person can ask for a copy or deletion of their ballot (Privacy §9).
The 30 days are for disputes about the bounty.

## 7. Privacy and Terms lines (drafts, not reread)

They ship in the vote's own release, after the owner's "reread", with the switch `CHALLENGE.vote.on` (off until then).
Wording for the Bluesky and Lens lines assumes their sign-in is live; without it, drop them.

**Privacy §4 (Kept by us when you sign in), new item:**

> If you vote in the remix challenge's shortlist vote: which entry you picked for each character, when, which of your
> accounts (and the accounts linked to it) the vote was cast with, and what qualified you to vote (your Farcaster
> account's score, your Lens score, or when your Bluesky account was created). Your picks are never shown to anyone
> but you, and nobody, including us on the site, can see any count until the vote closes. After it closes, each entry's
> total is public. We delete your picks and what qualified you 30 days after the results; the totals stay.

**Privacy §7 (Outside services), additions:**

> Neynar: "…When you vote in the remix challenge's shortlist vote, Neynar receives your Farcaster ID, if we haven't
> looked up its score that day."

> Lens (with the sign-in's Lens item): "When you vote in the shortlist vote with a Lens account, Lens's API receives
> your Lens account's address, to look up its Lens score."

> Bluesky (with the sign-in's Bluesky item): "When you vote in the shortlist vote with a Bluesky account, our server
> reads when your account was created from plc.directory, which receives your account's identifier (its DID)."

**Privacy §9 (Keeping and deleting), one sentence:**

> Shortlist votes are kept until 30 days after the results, then deleted; only the totals are kept.

**Terms, a new paragraph under §4 (Who can use it), or a short challenge section:**

> The remix challenge's shortlist vote runs from 00:00 Pacific on Tuesday 1 December to 23:59 Pacific on Thursday
> 3 December 2026. You can vote if you are signed in with a Farcaster account whose score is at least the one the
> Service shows, a Lens account whose Lens score is at least the one the Service shows, or a Bluesky account created
> before 6 November 2026; a wallet votes only through the account it is linked to. One vote per person per character:
> accounts linked to each other count as one person, and votes cast with several accounts of one person may be
> removed. You can't vote for your own entry, and admins don't vote. The vote makes a shortlist for the challenge's
> poidh bounty and nothing else: it doesn't change any version, final version, credit or order. The bounty is judged,
> not drawn: Nate picks its one winner from the shortlisted entries. The bounty is paid on poidh, under poidh's own
> terms; to be in the running, post a claim on it by the end of the vote. Voting is free.

**Terms §2** ("Nothing else here is for sale"): unchanged; the vote sells nothing.

## 8. Principle checks

Existing checks that cover it, and new ones. Each new check is proven to fail on a planted violation, as the others are.

| Check | What | Planted violation |
|---|---|---|
| P5a (existing) | No "featured/official/canon" field or UI words | A `featured boolean` on `vote_results`, or "Featured: the people's choice" on the shortlist |
| P5g (existing, remix-challenge) | Challenge lists in time order only | The ballot sorted by `created_at` ascending, or by `likes` |
| P6a (existing) | No third-party requests from pages; add `/challenge/vote` to its list | A poidh bounty embed or a Bluesky avatar `<img>` on the vote page |
| P6b, P6c (existing) | No public read on per-person tables; add `vote_ballots`, `vote_accounts` | `grant select on studio.vote_ballots to anon` |
| P7a (existing) | No ordering or scoring reads payments | The ballot's eligibility reading `wallet_payments` ("prepaid voters count double") |
| **P5h (new)** | Vote totals order nothing: no `.sort`, `order by` or rank reads a vote total or the shortlist flag, anywhere | `entries.sort((a, b) => b.votes - a.votes)` on the results page |
| **P5i (new)** | The vote decides support only: no code outside `src/lib/challenge/vote*` and the results page reads `vote_ballots`, `vote_totals` or `vote_results`; in particular not the final version, deep funding, split, entries or mint code | The deep funding runner importing `vote_totals` to weight entries |
| **P6r (new)** | Totals hidden in the database: on PGlite (`test:db`), as `studio_writer`, selecting `vote_ballots` is refused, and `vote_totals` returns zero rows before `closes` and the totals after (clock moved by the test) | `grant select on studio.vote_ballots to studio_writer`, or the view without its `now() >= closes` filter |
| **P6s (new)** | `CHALLENGE.vote.on` only while Privacy §4 describes the vote and §7 names what each network receives (as P6p/P6q) | `vote.on: true` with no shortlist-vote line in Privacy |
| **P6t (new)** | One person, one vote: two ballots from linked accounts (FID + Bluesky linked before or during the window) can't both count, in the database and at the tally | Drop the unique on (challenge, character, account key); or build the cluster from active links only, so unlinking splits a person |
| **P6u (new)** | Who can vote: wallet-only persons refused; Bluesky's date read from PLC (or the AppView), never the profile record; Lens refused while `lensMinScore` is null and never looked up | Allow `isWalletPerson`; read `app.bsky.actor.profile`'s `createdAt` (a stand-in record dated 2230 or 2025 must not pass); look up Lens with the setting null |
| **P6v (new)** | No outside call on page view: the vote page and results page call no Neynar, Lens, PLC or Bluesky (only `cast_vote` does, once per person) | Looking up the viewer's Neynar score to show "you can vote" |

## 9. Principles

- **P5 (nothing featured; owners, not votes; votes decide support):** pass as proposed. The vote runs after the final
  versions are published, touches only who can receive the bounty, and orders nothing (P5h, P5i). **Tension:** a
  shortlist chosen by most votes is a ranking by popularity. It's shown in time order and only narrows a judged prize,
  but it is still "most votes wins a place". The owner should confirm that's within "votes decide support".
- **P6 (no third-party requests from pages; individual votes private, totals only):** pass as proposed: lookups are
  server-side and once per voter; ballots unreadable even by the app's role; totals only after the close. **Concern:**
  the owner as `postgres` can read ballots (stated); and new outside recipients at vote time (Neynar for FIDs, Lens,
  plc.directory) need Privacy lines.
- **P7 (payments never enter scoring):** pass. Solo bounty, no money-weighted vote, wallets can't vote on their own,
  prepaid balances play no part. An open poidh bounty would conflict.
- **P4 (a signed-in person's action):** pass; every ballot is a signed-in person's act.
- **Legal texts describe today:** the vote's switch stays off until its lines are reread and live (P6s).

## 10. Open questions for the owner

1. Is the shortlist binding (you pick the winner only from it), as proposed, or advisory?
2. Shortlist size 3 per character with ties, and at least 3 votes to make it: OK, or other numbers?
3. Only characters with at least 3 eligible entrants get a vote (so the bounty field matches the final versions)?
4. Lens vote threshold: 5000 (established accounts only), 1000, or Lens doesn't vote?
5. Bluesky cutoff: before 6 Nov as you said, or earlier (before 1 Nov) so accounts made for the challenge can't vote?
6. Bluesky date from plc.directory (already named for sign-in), or Bluesky's AppView getProfile (a new name in Privacy)?
7. If Lens and Bluesky sign-in aren't live by about 24 Nov, run the vote Farcaster-only?
8. Can jurors also vote, and can entrants vote in their own character (not for themselves)?
9. poidh claims due by the end of the vote (23:59 PT Thu 3 Dec)? And if no shortlisted entry has a claim?
10. Is the bounty funded from your own wallet or the LLC's (for the tax adviser)?
11. Delete ballots 30 days after results (3 Jan 2027), as proposed?
12. Totals shown per entry after the close, or only the shortlist (no numbers at all)?
