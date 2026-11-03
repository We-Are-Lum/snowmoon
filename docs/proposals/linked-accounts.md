# One person, many linked accounts (DRAFT proposal)

For the owner, 2026-11-04. Drafted by the coding agent (Anthropic's Claude, a closed model). Branch
`signin-reread-list`. **A proposal only:** nothing is built, no migration is written, and no legal words change.

**The owner's answers (2026-11-04):** built **after sign-in merges and before the challenge goes public**. The wait
after unlinking is **30 days**. **Up to 3 wallets** per person. **No manual merges** for now. The challenge record
names each maker by the **public id of the account they submitted with** (Farcaster ID, Lens address or Bluesky DID).
And (section 12): when a check doesn't pass, the refusal offers a next step: link another account, or prepay with a
wallet. The sections below are updated to match; the questions at the end are answered.

The owner's words (2026-11-04): "A person can link Farcaster, Bluesky, Lens and wallets, each by signing in with it.
Caps and free remixes count per person, not per account, and a person passes the check if any linked account does."

## Decisions in short

1. **A person id.** A new private table `studio.people` holds one row per person. Each account (a Farcaster ID, a
   wallet, a Lens account, a Bluesky account) belongs to exactly one person at a time. Existing rows keep the
   acting account's number, as they do now. Counting and eligibility add a `person_id`.
2. **Linking needs both sign-ins in one request**, as `/api/wallet-link` and `/api/social-link` already do. The one
   exception is a wallet the FID verified on Farcaster (today's automatic link), which only ever joins a wallet
   that is alone.
3. **A person can have** at most one Farcaster account, one Lens account, one Bluesky account and three wallets.
4. **Two people never merge.** You can only add an account that is alone: it has no other accounts, and it isn't a
   second Farcaster account. Anything else is refused with the reason. **No manual merges for now** (owner,
   2026-11-04): someone with two histories unlinks one side's accounts and links them again, one by one.
5. **Unlinking** happens on the You page. The account becomes a person of its own again. It can join a
   **different** person only after **30 days**, and gets no free counts or check passes of its own in that time.
   Rejoining the same person is allowed at any time.
6. **Caps follow both the person and the account.** A daily cap counts every row that has the person's id, plus
   every row made by any account the person has now.
7. **"Passes if any linked account does"** is decided at the same moments as today (at Generate, and once at
   publish for the challenge). The checks are tried in a fixed order, and each service is asked only if the ones
   before it didn't pass. The decision is stored with which kind of account passed. Later links never change a
   stored decision.
8. **The challenge counts per person:** up to 3 submissions, at least 3 different people per character, and
   one equal share per person. During a challenge and until its payout, an account with a submission can't leave
   its person.
9. **Separate from the sign-in reread** (reasons at the end). The 30-day relink wait went in with sign-in (owner,
   2026-11-04, 3a), so its words change only once.
10. **The challenge record** names each maker by the public id of the account they submitted with: a Farcaster ID,
   a Lens address or a Bluesky DID. Never the person id.
11. **A refusal offers a next step** (section 12): "Link another account" (the networks not linked yet), or prepay
   with a wallet. Until linking is built, only the prepay route.

## 1. How identity works today

**Person numbers** (`src/lib/people.ts` on `signin-lens-bluesky`; the idea is on main since 0011):
- above zero: a Farcaster ID (FID), from Quick Auth / Sign In with Farcaster (`getFid`);
- −1 and below: minus a wallet account's id (`studio.wallet_accounts`, Sign-In with Ethereum, a day-long `w1.`
  session);
- −1,000,000,000 and below: minus (10⁹ + a Lens or Bluesky account's id) (`studio.social_accounts`, a day-long
  `s1.` session; branch only, not merged).

`getPerson` (`src/lib/auth.ts`) returns the FID, or a wallet's linked FID (`linkedFidFor`), or the wallet's own
number. On the branch it also returns a Lens or Bluesky account's linked FID, or its own number. A Bluesky account
linked to a Lens account goes one step further, to that Lens account's FID or number. The number is written into
every per-person column: `image_asks.fid`, `remix_asks`, `elements.created_by_fid`, `recipes.created_by_fid`,
`contributor_consents.fid` and the agents' tables.

**Caps.** Pictures: 10 free a day per person number, behind the Neynar score (`studio.image_scores`, by FID, kept
24 h, 0010). Remix frames: `studio.remix_asks`, the same way. A wallet gets nothing free and pays from its own
prepaid balance, which stays with the wallet even when it is linked. Agents: 3 per person (`AGENTS.perPerson`).

**Wallet ↔ Farcaster links** (0026, branches `wallet-farcaster-link` and `link-garance-wallet`, both merged).
`studio.wallet_links` has one active link per wallet, always to a FID. A link is `verified` (the FID verified the
address on Farcaster, found through Neynar; ended automatically with `unverified` if it stops) or `signed` (both
sign-ins). The person can end it with `person`, and such a wallet is never looked up again. Earlier work shows
under the Farcaster name (`src/lib/wallet/credit.ts`) without rewriting records. Nothing stops a wallet being
unlinked and then signed into another FID right away.

**Lens and Bluesky** (`signin-lens-bluesky`, off). `studio.social_links` has one active link per account, to a FID
or (Bluesky only) to a Lens account. Linking is immediate with both sign-ins, and unlinking is immediate. Free counts
(`src/lib/social/free.ts`): a linked account uses the FID's counts (shared, not added). A Lens account on its own
gets free counts only with a Lens score at or above the threshold. A Bluesky account on its own gets none; on
`bluesky-check` (draft, off) it can pass a check: account made before 6 Nov, and 5 posts in 30 days.

**The challenge** (0033). `studio.challenge_eligibility` stores one row per version, decided once at publish:
the maker's FID (`fid > 0`), the decision (`admin`, `invited`, `passed`, `below`, `unchecked`) and the time. Only
FIDs can be eligible. A wallet linked to an FID publishes as that FID. `studio.challenge_marks` is by FID. The
owner's Submit rules (2026-11-04, `remix-submit`, not built): up to 3 submissions per person, at least 3 different
submitters per character, and an optional 20% equal share per person.

**What's missing.** A person without a FID can't hold two accounts. A FID can't be added to a person who started
with Bluesky. Checks look only at the account that is acting. Caps follow the acting number, so a Lens account
with a passing score that is unlinked from its FID has a second set of caps.

## 2. The person id

- `studio.people (id bigint identity, created_at)`. The id is private: never shown, never in a URL, and never
  in a public table or record. The challenge's IPFS record names each maker by the public id of the account they
  submitted with (owner, 2026-11-04): a Farcaster ID, a Lens address or a Bluesky DID, never the person id. Two
  entries by one person from two linked accounts show two ids; the record doesn't say they are one person. The
  widened Privacy §4 and Terms §6e lines are drafted in section 10.
- `studio.person_accounts`: one row for each time an account belongs to a person. A new row is added for each link,
  and ending one sets `unlinked_at` and `ended_by` once, the way `wallet_links` works. A unique partial index allows
  one active row per account.
- An account is named by its person number as today (FID, −wallet, −(10⁹+social)). So every existing row already
  names exactly one account, and needs no rewrite.
- `getPerson` returns `{ person, account }`. Writes keep putting the **acting account's** number in the existing
  columns. **Change from today:** a linked wallet or Lens/Bluesky account writes its own number, not the FID's.
  Counting and eligibility also write `person_id`.
- **The name shown**, in a fixed order with no setting: the Farcaster name; else the Lens username; else the
  Bluesky handle; else the wallet, shortened. Like the wallet credit today, work made by any of a person's
  accounts shows under that name. After an unlink, the work shows under the account's own name again.
- **Money stays with the wallet** (unchanged): a balance is per wallet account, and paying needs the wallet's own
  sign-in. Privacy §4 already says the balance stays with the wallet.

## 3. Linking

- From the You page, signed in as the person with any account: "Link a Farcaster account / a wallet / Lens /
  Bluesky". The page runs that account's own sign-in (Quick Auth or SIWF, SIWE, Lens's challenge, Bluesky OAuth).
  The server needs **both proofs in one request**: the person's current session, and the new account's fresh
  sign-in. Nothing is linked on a handle, a post or the page's word.
- A confirm screen says what becomes public: "Your work from both accounts will be shown under one name, so
  anyone can see they are yours." The wallet's `signed` link already has a screen like this.
- The automatic `verified` wallet link stays, with one limit: it only joins a wallet that is alone (no other
  accounts, no history under another person in the last 30 days) to the person who has that FID.
- The project's pay-to address is never linked (as now). Link attempts are limited to 10 a day per person.

## 4. Unlinking

- On the You page, a person can unlink any of their accounts except the last one. The account doesn't need to
  sign in, so a lost wallet can be removed.
- The account becomes a person of its own again (a new `people` row), with `ended_by = 'person'`. Its earlier work
  shows under its own name again. A `verified` wallet that its FID stops verifying ends with `unverified`, as now.
- The wait rule (section 8, A2) starts. Unlinking never changes a stored check decision or a submission.

## 5. Two people's accounts meeting

When the account being added already belongs to a person with other accounts, or is a second Farcaster account:
- **Refuse.** The page says: "This account already belongs to someone with other accounts. Unlink it there first."
  For a second FID: "You can link one Farcaster account."
- **No merges at all for now** (owner, 2026-11-04): no review queue, and no owner merge by hand. A merge joins two
  histories (caps, check decisions, submissions and payout shares) and can't be cleanly undone. Someone who made two
  by mistake unlinks the accounts on one side and links them to the other, one at a time, under the 30-day wait (A2)
  and the move limit (A5). Moderators only hide (P5).
- An account that is alone and joins a person brings its history with it (section 6).

## 6. What counts per person

- **Free daily images and frames** (10 images; 3 remixes a day, where a closed-model remix counts as 3): count the
  rows in the UTC day **where `person_id = P` or the account is one of P's accounts now**. The first part keeps a
  person's own history when an account leaves. The second brings an account's history when it joins. Both apply,
  so rotating accounts never frees a count.
- **Agents**: 3 per person.
- **Challenge submissions**: up to 3 per person (any mix of characters), counted the same way, over the whole
  window.
- **At least 3 different submitters** per character means 3 distinct `person_id`s.
- **The payout.** The optional 20% equal share is one share per distinct person with an eligible submission at
  close. Deep funding's 80% follows versions. Each version's share goes to the person its maker account belongs to
  at close. One payout address per person, confirmed after results. Who-is-who at close is kept privately. The
  published result shows shares by version and recipient, as planned, not the account map.
- **Admins**: if any account of a person is an admin (6786, 193912), the person is an admin. Their versions are
  never eligible, whichever account published them.

## 7. "Passes the check if any linked account does"

- **When**: as today. At Generate, for free counts (cached as now). Once at publish, for the challenge, never on a
  page view.
- **Order**: admin, then invited, then Farcaster (Neynar 0.7, cached 24 h), then Lens (score at or above the
  threshold, cached 1 h), then Bluesky (`bluesky-check`, cached 24 h). Stop at the first pass. A later service is
  asked only if the ones before it didn't pass, so a person with a passing FID never has their Lens address sent to
  Lens for this.
- **Stored**: `challenge_eligibility` keeps its decision, and adds `person_id` and `via` (`farcaster`, `lens`,
  `bluesky`, or null). No score, date or count is kept (the owner's rule of 2026-11-01). `unchecked` means none
  passed and at least one service didn't answer.
- **Decided once**: linking a passing account later doesn't turn an earlier version into an entry, and unlinking
  doesn't take one away. The person can publish a new version.
- **Borrowing a passing account** is blocked by A2 and A4 below.

## 8. Abuse rules

- **A1. One person per account at a time** (the unique index).
- **A2. The 30-day wait.** An account that leaves a person can join a *different* person only after 30 days.
  Until then, on its own, it gets no free counts and passes no check. Rejoining the same person is allowed at any
  time. 30 days is longer than any daily cap and longer than the challenge window (17 days as planned).
- **A3. Caps follow the account's history and the person's** (section 6).
- **A4. A check follows the account.** In one challenge, an account that passed for one person never passes for
  another.
- **A5. Few moves.** An account can change person at most 2 times in 90 days. After that it stays where it is (no
  manual moves for now). Section 12.4 proposes tightening this to 2 times in 365 days.
- **A6. Limits per person**: one Farcaster, one Lens, one Bluesky, three wallets (owner, 2026-11-04: up to 3). This also stops one person
  gathering many passing accounts of one kind.
- **A7. Freeze during a challenge.** From an account's first submission until that challenge's payout, the account
  can't leave its person.
- **A8.** The pay-to address never links. Link attempts are limited to 10 a day.
- **What linking can't fix:** a person can keep accounts *unlinked* and get a set of caps on each network. Each
  network's own check (Neynar, the Lens score, the Bluesky check) is the defence there, as it is now. Linking only
  ever lowers caps, so the rules are about it not being used to raise them.

## 9. The migration (outline only; `NEXT_linked_accounts.sql`)

Runs as postgres, after `NEXT_signin_lens_bluesky` (which makes `social_accounts`) and after Submit's table.
Dry run first, ending in `rollback;`.

1. `studio.people (id bigint generated always as identity primary key, created_at timestamptz default now())`.
2. `studio.person_accounts`: `id`, `person_id` (fk), `kind` (`farcaster`, `wallet`, `lens`, `bluesky`),
   `account bigint` (the person number, with checks that match `kind`'s range), `how` (`first`, `signed`,
   `verified`), `linked_at`, `unlinked_at` and `ended_by` (`person`, `unverified`). No `owner` value: no manual
   merges for now (owner, 2026-11-04).
   Unique `(account) where unlinked_at is null`; index `(person_id)` and `(account, linked_at)` for A2 and A5.
   The app inserts rows and only ever ends them, once.
3. **Backfill**: one person for each FID found in any person column, in `wallet_links` or in `social_links`. Each
   wallet with an active link, and each Lens or Bluesky account with one, joins its FID's person. A Bluesky account
   linked to a Lens account joins that Lens account's person. Every other account gets a person of its own. The
   link histories are copied as ended rows. `wallet_links` and `social_links` stay, read-only, and aren't dropped.
4. `person_id bigint` (nullable, then backfilled) on `image_asks`, `remix_asks`, `challenge_eligibility`, Submit's
   table and the agents' accounts, each with an index `(person_id, at)`.
5. `challenge_eligibility`: relax `fid > 0` to `fid <> 0` (the acting account), and add `via`.
6. Row-level security on, no public read, nothing for anon or authenticated. The P6b list grows by `people` and
   `person_accounts`.
7. Read-back: one select that should be all true, then a `do $$` block. It adds a person with a FID and a wallet,
   tries a second active row for the wallet (refused), unlinks it, tries a move inside 30 days (refused by the app
   test, since the database can't know the clock rule), adds a realistic `image_asks` row with `person_id`, and
   deletes them all.

## 10. Privacy and Terms lines (DRAFT, for the release that builds this)

These describe the feature as proposed. They go in only in the release that ships it (legal texts describe today).
They replace the "linked" sentences from the sign-in reread (its items 7 and 12).

**Privacy §4, one item, replacing the wallet-link item and the Lens/Bluesky link item:**
> If you link accounts (a Farcaster account, wallets, a Lens account, a Bluesky account), each by signing in with it: which accounts are linked together, how and when each was linked or unlinked, and why a link ended. Linked accounts are one person here: free daily images and frames, limits and the remix challenge count once for all of them together. You can unlink an account on your You page. An account you unlink can be linked to someone else only after 30 days, and until then it gets no free images or frames of its own. A wallet's prepaid balance stays with that wallet.

**Privacy §4, the challenge item, one phrase:**
Now: "…(you were invited, you are an admin, or whether your account passed the site's check)…"
After: "…(you were invited, you are an admin, or whether one of your linked accounts passed the site's check, and which kind of account it was)…"

**Privacy §4, the challenge record item, widened** (the owner's answer of 2026-11-04: the record names the account
submitted with). DRAFT for the owner's reread later; not in `legal.ts`.

Now:
> When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID, when it was published and what it was built on. Hiding a version later removes it from this site, but not its fingerprint from that record.

After:
> When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), the public id of the account its maker published it with (a Farcaster ID, a Lens account's address or a Bluesky account's identifier, its DID), when it was published and what it was built on. It doesn't say which accounts are linked to each other. Hiding a version later removes it from this site, but not its fingerprint from that record.

(`bluesky-check` drafts a narrower form of the same phrase, "its maker's Farcaster ID (or, for a Bluesky account,
its DID)", for its own release. If both ship, this wording replaces it.)

**Terms §6e, the record phrase, matching:**
Now: "…a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID, when it was published and what it was built on;…"
After: "…a fingerprint of its pictures and recipe (not the pictures or words themselves), the public id of the account its maker published it with (a Farcaster ID, a Lens address or a Bluesky DID), when it was published and what it was built on;…"

**Privacy §6, replacing the wallet sentence:**
> If you link accounts, what you made with any of them, before and after linking, is shown under one name (your Farcaster name if you linked one; otherwise your Lens username, your Bluesky handle or your wallet's address, in that order), so anyone can see that they are yours. If you unlink one, its work is shown under its own name again.

**Privacy §7, new item, after the Bluesky item:**
> When we check whether you can make free images or frames, or whether a version can count as a challenge entry, we check your linked accounts one at a time, in this order, and stop at the first that passes: your Farcaster account (Neynar receives your Farcaster ID), your Lens account (Lens's API receives its address) and your Bluesky account (Bluesky's public server receives its identifier). A service is asked only when the accounts before it didn't pass.

**Terms §4, replacing the linking sentences:**
> You can link several accounts, each by signing in with it: one Farcaster account, one Lens account, one Bluesky account and up to three wallets. Linked accounts are one person here: free daily images and frames, limits, the remix challenge's submissions and any reward count once per person, and you pass the site's checks if any of your linked accounts does. An account belongs to one person at a time. We refuse a link that would join two people's accounts, we don't merge them by hand, and an account you unlink can be linked to someone else only after 30 days.

**Terms §6 (What you must not do), one new item:**
> Use more than one person here, or move accounts between people, to get more free generations, submissions or rewards. We may unlink accounts that do, or refuse their entries.

**Terms §6e, one phrase:**
Now: "anyone signed in with a Farcaster account that passes the site's check"
After: "anyone signed in with an account that passes the site's check, or that is linked to one that does"
The "per person" sentence is updated in the same release by Submit's own wording ("all your linked accounts
together").

## 11. Fold into the sign-in reread, or separate?

**Separate.** Reasons:
- **Legal texts describe today.** The reread list's lines describe what `signin-lens-bluesky` does now: accounts
  linked one way, to a FID. This proposal's lines describe code that doesn't exist yet. Rereading them now would
  approve words ahead of the feature.
- **It is its own release.** It needs a migration that adds person ids to caps and the challenge's tables, and a
  `getPerson` change that touches every route that writes. That is more than the sign-in branch. It shouldn't
  hold Lens and Bluesky back from 12 Nov.
- **Little would be thrown away.** The sign-in branch's links backfill straight into `person_accounts`. The one
  rule worth having from the start, the 30-day relink wait, went in with sign-in (owner, 2026-11-04, 3a), so its
  words change only once.

**When to build it.** After `signin-lens-bluesky` and `bluesky-check` merge, and before the challenge opens to the
public. "Per person" for submissions and shares matters most there. Until it lands, the challenge's person is the
FID, as today.

## Questions for the owner (answered 2026-11-04)

1. The wait after unlinking: **30 days** (A2).
2. Wallets per person: **up to 3** (A6).
3. Manual merges: **none for now** (section 5).
4. The challenge's IPFS record: **the public id of the account submitted with** (Farcaster ID, Lens address or
   Bluesky DID); its Privacy §4 and Terms §6e words are drafted in section 10, for a reread later.
5. New: a refusal that offers a next step (section 12). Its wording waits for the owner's OK.

## 12. A refusal that offers a next step (owner, 2026-11-04)

"When someone's check doesn't pass, the refusal offers a next step instead of a dead end": **Link another account**
(only the networks not linked yet, among Farcaster, Bluesky and Lens; if any linked account passes, they pass), or
**prepay with a wallet** (the existing paid route). Until linking is built, only the prepay route. **Nothing is
built for this yet:** the interim refusal waits for the owner's OK of its words.

### 12.1 Today's refusals (before), word for word

Checked against `origin/main` at 233f5e0 (2026-11-04).

- `src/lib/images/gate.ts`, lines 30–31 (`GATE_WORDING.below`), shown at Generate for images, sheet views, style
  samples and Remix frames, and in the image and frame makers' status:
  > Image making is open to Farcaster accounts with a Neynar score of ${IMAGES.neynarMinScore} or more, to keep out spam accounts. Yours is ${shown(value)}. Reading, listening, saving cards and everything else still work.
- `src/lib/challenge/wording.ts`, line 46 (the challenge page, who can enter):
  > To remix at all, sign in with a Farcaster account that passes the site’s check. An account below it can’t make the pictures, so it can’t remix or enter. It’s checked when you press Generate, and again when you publish.
- On `signin-lens-bluesky` (not on main), `src/lib/social/free.ts`, `FREE_WORDING.lensBelow`:
  > Free images and frames are open to Lens accounts with a Lens score of ${min} or more, to keep out spam accounts. Yours is below that. Link a Farcaster account, or sign in with a wallet to pay.
- On `bluesky-check` (not on main), `src/lib/social/bluesky-check.ts`, `BLUESKY_CHECK_WORDING` (the "made before
  6 November" and "5 posts" refusals), each ending "Link a Farcaster account, or sign in with a wallet to pay."

The prepay route they point to: a wallet sign-in ("Sign in with a wallet", `IMAGE_WORDING.prepaid.signIn`,
`src/lib/images/wording.ts` line 305), then Add funds, paid in USDC or ETH on Base to `IMAGES.prepaid.payTo`
(`0x4FEA94B8947926DdD3c02f4e133357B547F74FfA`, `src/lib/config.ts` line 553), charged per Generate (Terms §6a). The
Support address (`SUPPORT.address`, a Splits account) is a gift and buys nothing; it is not a prepay route and the
refusal never names it.

### 12.2 The new refusal, two short lines (Drafted by the coding agent, for the owner's OK)

**(a) Interim, until linking is built (prepay only).** Drafted by the coding agent, for the owner's OK.
> Your account doesn’t pass the site’s check for free images and frames.
> You can still make them: sign in with a wallet and prepay.

**(b) After linking is built.** Drafted by the coding agent, for the owner's OK. `{networks}` lists only the ones
the person hasn't linked, in this order: Farcaster, Lens, Bluesky ("a Farcaster or Lens account", "a Lens account",
…); with all three linked, line 2 is (a)'s.
> Your account doesn’t pass the site’s check for free images and frames.
> Link {networks} that passes, or sign in with a wallet and prepay.

The first line replaces the score sentence; the per-network detail (the threshold, and for Neynar today the
person's own score) can stay as a third line under "Why?" if the owner wants it.

**Challenge Submit is different.** Prepaying makes pictures, but a version made by a wallet account, or by an
account below the check, can't count as an entry (Terms §6e: an account "that passed the site's check when the
version was published", or invited). So on Submit:
- (a) interim, Drafted by the coding agent, for the owner's OK:
  > This version can’t count as an entry: your account didn’t pass the site’s check when you published it.
  > You can still remix and share it, but only an account that passes can enter.
- (b) after linking, Drafted by the coding agent, for the owner's OK:
  > This version can’t count as an entry: your account didn’t pass the site’s check when you published it.
  > Link {networks} that passes, then publish a new version to enter.

**Tension to settle:** the owner's note lists challenge Submit among the refusals that offer prepay. Prepay doesn't
make an entry, so offering it there would mislead. The drafts above leave it out of Submit. Say if you want it in
anyway (for example "Prepay to keep making pictures; they won't count as entries").

### 12.3 Which refusals, and their code paths

| Refusal | Code path |
|---|---|
| Generate, images | `src/lib/images/gate.ts` `mayGenerate` (reasons `score`, and on the sign-in branches `lens-score`, `bluesky-new`, `bluesky-idle`), called by `src/app/api/images/generate/route.ts`, `src/app/api/designs/route.ts` (sheet views) and `src/app/api/designs/sample/route.ts`; shown before Generate by `src/app/api/images/status/route.ts` (`refusal`) |
| Generate, Remix frames | the same `mayGenerate`, called by `src/app/api/remix/generate/route.ts`; shown by `src/app/api/remix/status/route.ts` |
| Free remixes (the count) | `src/lib/remix/limits.ts` and `src/lib/images/limits.ts` `reserve` (`no-free` for a Lens or Bluesky account without free counts), worded by `src/lib/remix/make.ts` and `src/lib/images/paid.ts` (`FREE_WORDING.none`); agents' approved frames come this way (`src/lib/agents/approve.ts`) |
| Remixing a challenge sheet | `src/lib/challenge/wording.ts` (`whoCanEnter`, line 46) and `src/lib/images/wording.ts` (`signInChallenge`, line 187) |
| Challenge Submit | the entry decision at publish (`src/lib/challenge/rules.ts` `below`, stored by `src/lib/challenge/record.ts`), shown after publishing by `src/components/design-form.tsx`; Submit itself is on `remix-submit` (not built) |

Only the person sees a refusal. The networks it names come from their own links, already kept (section 2).

### 12.4 How the linking limits stop one high-score account being shared around

| Abuse | Rule that stops it |
|---|---|
| Two people use one strong account at once | **A1** one person per account at a time (the unique index) |
| Pass it from person to person quickly | **A2** the 30-day wait before an unlinked account can join someone else; during the wait it gets nothing of its own |
| Rotate accounts to reset daily caps | **A3** caps follow both histories: the person's rows and the account's |
| Lend it during a challenge to make several people eligible | **A4** in one challenge, an account that passed for one person never passes for another |
| Lend it many times a year | **A5** at most 2 moves in 90 days |
| Gather many strong accounts of one kind | **A6** per person: 1 Farcaster, 1 Lens, 1 Bluesky, 3 wallets |
| Link a strong account to submit, then pass it on before payout | **A7** an account with a submission stays with its person until that challenge's payout |
| Probe links by brute force | **A8** 10 link attempts a day per person |

**The worst case, honestly.** A2 and A5 together: an account can join a new person, leave, wait 30 days, join
another, and so on, at most 2 joins in any 90 days. That is about **8 people a year** for one strong account
(2 per 90 days; the 30-day wait alone would allow about 12). Each of them gets free daily images and frames while
linked, though never two at once (A1), and caps follow the account (A3). In a challenge it helps **only one
person** (A4 and A7), so rewards can't be multiplied. What it can multiply is free images and frames, spread over a
year.

**Is that acceptable?** For free pictures alone it is a small leak, but it is the one way a single good account
becomes many. **Proposed, tighter: A5 becomes "at most 2 moves in 365 days"**, which caps one strong account at 3
people a year (where it started plus 2), and still leaves room for a real mistake. A cheaper alternative is to
count a linked account's pass only after the link is 30 days old, which makes each loan cost a month; it can be
added later if A5 isn't enough. The owner chooses; neither is built.

### 12.5 Privacy

The refusal itself adds no data: nothing new is kept and nothing new is sent anywhere. It reads the person's own
links (already kept, section 2) to name the missing networks, and shows them only to that person. The prepay route
is today's wallet sign-in and payment, already in Privacy §4 and §7. No legal line changes for the refusal.

## Principles

- **P1** (public recipes; people know their words are public): no change. The confirm screen says what becomes
  public before a link.
- **P4** (a signed-in person's action): every link needs both sign-ins. The owner's manual merge is recorded and
  publishes nothing.
- **P5** (moderators hide only): moderators get no part in merges.
- **P6** (privacy): the new tables are private (P6b). The person id is never public. Checks ask the fewest outside
  services. **Tension:** linking makes it public that accounts are one person, through the shared byline. That is
  already true of `signed` wallet links, and the confirm screen says it.
- **P7** (payments never enter scoring): balances stay per wallet. Payout shares are per person and decided by deep
  funding, not by payment.
- Legal texts describe today: the lines above wait for the release that builds this.
