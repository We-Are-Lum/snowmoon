# Snowmoon: Linked accounts v2 (DRAFT)

**DRAFT. Drafted by a coding agent (Claude, a closed model by Anthropic)** for the coordinator (session snowmoon-9c),
2026-11-05. Branch `designs-2026-11-05`. Design only: nothing is built, no SQL is written, and no legal words change.
Every legal line here is a draft for the coordinator and the owner's reread. None goes into `src/lib/legal.ts` from
this branch, and **nothing in this version is approved.**

**This version follows the owner's model change of 2026-11-05.** The Snowmoon account owns everything; social
accounts and wallets are ways in; there is a main sign-in. It replaces the per-account ownership model of the
earlier copies (v3, v4). The Privacy §6 approved earlier today was written for that model, so it is superseded and
needs a new approval (section 8). **Updated the same day with the owner's answers** (items 1–9 of 2026-11-05):
existing wallets, self-unlink, the automatic wallet link, the payment message, submitting, the challenge freeze and the
30-day gap, single sign-ins, recovery notices, addresses, quote cards and the bonus.

Builds on: rules A1–A8 (`docs/proposals/linked-accounts.md` on `signin-reread-list`), the v1 build
(`origin/linked-accounts`, 94833eda, off), paying per person (`origin/person-balance`), the contest
(`origin/contest`), and the sign-in release (`signin-lens-bluesky` in `bluesky-check`, whose migration is applied).

## Words

- **Snowmoon account:** the person's account here. It owns their work, challenge entries, balance and chosen name.
  Internally it is the "person id" (`studio.people`).
- **Social account:** a Farcaster, Lens or Bluesky account.
- **Wallet:** an Ethereum wallet sign-in. It is not a social account.
- **Sign-in:** a social account or wallet linked to a Snowmoon account, as a way in.
- **Main sign-in:** the one sign-in that manages the Snowmoon account.

## Summary of the model (owner, 2026-11-05)

1. **The Snowmoon account owns** its work, challenge entries, balance and chosen name. Sign-ins are only ways in.
   Unlinking one takes nothing away from the Snowmoon account.
2. **Checks stay with the social account.** The Snowmoon account qualifies for free images, the challenge and the
   linking bonus only while a linked social account has a current pass.
3. **Any sign-in can make and spend; a social account sign-in can also submit.** Only the **main sign-in** can:
   - link or unlink sign-ins;
   - choose another main sign-in;
   - claim a prize and give its payout address.

   The person chooses the main sign-in; the page suggests a wallet.
4. **Lost main sign-in:** another sign-in can ask for a new main. It takes effect after 30 days. Meanwhile it shows on
   every sign-in's You page, with a Farcaster mini-app notification where there is one, and only the main sign-in can
   cancel it. A single lost sign-in can't be recovered, and nothing is recovered by hand; the site nudges people to add
   a second sign-in.
5. **Any sign-in may unlink itself, and the main may unlink any other; an unlinked sign-in takes nothing with it.** For
   30 days it can neither join another Snowmoon account nor start a new one. It may rejoin its own at once.
6. **Challenge:**
   - Snowmoon accounts that shared a sign-in at any time while entries were open count as one maker.
   - Submitting needs a social account sign-in: the own-post check needs one. The record names the public id of the
     social account the post came from. A wallet sign-in can't submit.
   - The bonus counts only *extra* linked social accounts with a current pass, so one passing plus one non-passing
     account gives 3.
7. **Kept:**
   - A6: one Farcaster, one Lens and one Bluesky account, and up to 3 wallets, per Snowmoon account.
   - A2: the 30-day wait.
   - A5: 2 moves in 365 days. It isn't moot; see section 6.
   - A7, the challenge freeze, is dropped (owner).
   - A8: 10 link attempts a day.

## 1. Ownership and how today's rows map to it

- **Sign-in numbers stay as they are:** FID > 0; wallet −id; Lens/Bluesky −(10⁹ + id) (`src/lib/people.ts`). Each row
  keeps the number of the sign-in that made it, which the challenge record needs.
- **Each owned row also carries its owner:** the Snowmoon account id (`person_id`). This reverses v4, which dropped
  v1's `person_id` columns; in this model they are the owner stamp.
  - **New rows:** the owner is stamped when the row is written, from the signed-in number's Snowmoon account at that
    moment.
  - **Existing rows, at v2's migration:** every row of a number that is in a Snowmoon account belongs to that
    Snowmoon account. The memberships come from v1's backfill of `wallet_links` and `social_links`. A number with rows
    but no link gets a Snowmoon account of its own (`how = 'first'`), which owns its rows.
  - **Rows of a number that later unlinks stay** with the Snowmoon account. Nothing is restamped on unlink.
- **Rows written by old code during the rollout:** a `before insert` trigger fills `person_id` from the number's
  current Snowmoon account when the code leaves it null. The migration is therefore safe with live code.
- **The sign-in release window:** a linked Lens, Bluesky or wallet sign-in signs in as the Farcaster ID, so its work is
  recorded under the FID. It therefore belongs to that FID's Snowmoon account. Unlinking moves nothing, so this model
  needs no exception and no "except" clause.
- **Existing linked wallets (owner: accepted).** Today's live Privacy says that unlinking a wallet shows its work "with
  the wallet's address again". From v2, a wallet linked at the migration has its work and balance owned by the
  Snowmoon account, and unlinking no longer returns them. Each such Snowmoon account sees a notice on its You page,
  once, until dismissed (DRAFT): "Your wallet 0x12…ab is part of your Snowmoon account. From {date}, what you made with
  it and its balance belong to your Snowmoon account, and stay there if you unlink the wallet. Until now, unlinking it
  would have shown that work under the wallet's address again."

### Table by table (owner = the Snowmoon account)

| Today (keyed by sign-in number) | In v2 |
|---|---|
| `image_asks`, `remix_asks`, `sheet_remix_asks`, `chat_calls` | Owned and counted per Snowmoon account. The limit is one Snowmoon account's. Unlinking frees no count, because the rows stay. |
| `check_decisions` | Stay with the social account (unchanged). The Snowmoon account passes while any linked social account has a current pass, and an unlinked one stops counting at once. |
| Wallet balances, person balances | One balance per Snowmoon account: the ledger rows (payments, debits, credit-backs) are stamped with their Snowmoon account. At migration each number's ledger rows go to its Snowmoon account, so its balance is their sum. No money moves; this is only where the rows are counted. Any sign-in can spend it, and it stays when a sign-in leaves. |
| `challenge_marks`, `challenge_eligibility` | Owned by the Snowmoon account. The submission's `fid` is the social account whose own post was checked, and the public record names it. One a day per Snowmoon account. A prize is claimed by the main sign-in. |
| `elements`, `recipes`, `remix_frames`, `storyboards`, designs | Owned by the Snowmoon account. The byline is its chosen name, drawn at render. The stored `by_name` is a fallback only. |
| `agents`, agent keys | Owned by the Snowmoon account, 3 per account. Keys act for it. |
| `AGENTS.people`, `ADMINS` (by sign-in) | Apply while a listed sign-in is linked. |
| `likes`, `take_likes`, `ratings`, `picks` | Owned by the Snowmoon account. Totals count each Snowmoon account once. |
| `contributor_consents` | Owned by the Snowmoon account, recorded with the sign-in that gave the consent. |
| `mp_*`, `notes`, `suggestions`, `version_posts` | Owned by the Snowmoon account. |

## 2. Name, icons and the main sign-in

- **Stable address:** each Snowmoon account gets a public, random, never-reused short id when it is made, for example
  `k7m2qx9d`. Its page is at `snowmoon.party/u/k7m2qx9d`, which never changes. This is "its stable address" in the
  payment message. It isn't the private person id, and it reveals nothing about the sign-ins.
- **Chosen name:** one of the linked sign-ins' names (Farcaster username; Lens `lens/name`; Bluesky handle only if it
  resolves to its DID; a wallet's short address). It carries its network's icon, served from our own files, with
  screen-reader text. The default (also set at migration, so no byline changes on day one) is the name shown today.
  If the named sign-in is unlinked, the next linked one is used, and all the account's work shows under it.
- **Main sign-in:** the person chooses it, and the page suggests a wallet ("A wallet can't be suspended by a
  network"). The default at migration is the Farcaster ID of a linked group, else the oldest sign-in. A new Snowmoon
  account starts with its first sign-in as main.
- **Main-only actions:**
  - link a sign-in;
  - unlink another sign-in;
  - choose another main;
  - claim a prize and give or change its payout address;
  - join another Snowmoon account (section 3).
- **Any sign-in can:** make, publish, spend the balance, withdraw entries, change the chosen name, list sign-ins on the
  page, ask for a new main sign-in, and **unlink itself** (owner). A social account sign-in can also submit.
- **Self-unlink takes nothing.**
  - If the main unlinks itself, it first picks the next main, defaulting to the oldest remaining sign-in.
  - If it is the only sign-in, the page warns that the Snowmoon account will have no way in. Its work stays
    published under its name.

### Recovering a lost main sign-in

- Any other sign-in can ask for a new main sign-in: itself or another linked sign-in. Only one request is pending at a
  time.
- The request takes effect **30 days** after it was made, at the same time of day, unless cancelled.
- **Only the main sign-in can cancel it** (owner). Unlinking the requester also ends it, and only the main can do that.
- **Meanwhile:**
  - A banner shows on the You page for every sign-in of the account: "Someone using @bea asked to become your main
    sign-in on 7 Nov. It takes effect on 7 Dec unless your main sign-in cancels it."
  - The current main keeps every power. The requester gains nothing until day 30.
- **Mini-app notification:** where the Snowmoon account has a Farcaster sign-in and that Farcaster account has added
  the Snowmoon mini app with notifications on, one notification is sent when the request is made, and one when it is
  cancelled or takes effect.
  - The text is: "A request to change your Snowmoon account's main sign-in was made. If it wasn't you, cancel it
    before 7 Dec." It carries no handle.
  - It goes through the Farcaster app's notification address, which that app gave with the token.
  - We keep the token with the Farcaster ID until notifications are turned off or the mini app is removed.
  - Privacy doesn't cover this today, so lines are drafted in section 8.
- **No recovery for a single lost sign-in,** and none by hand (owner). The nudge below is shown to every Snowmoon
  account with one sign-in.
- **Nudge** (DRAFT, on the You page and after sign-in, for an account with one sign-in): "You have one way in. If you
  lose it, no one can get your Snowmoon account back, not even us. Add a second social account or wallet: each social
  account that qualifies also adds a free challenge remix a day."
- Every request, cancellation and change stays in the You page's events.

## 3. Linking and joining

- **Linking a fresh sign-in:** the main sign-in and the new sign-in in one request (both proofs on the server). Refused
  if it breaks A6, A8, A2 (the new sign-in was unlinked from a *different* Snowmoon account less than 30 days ago) or
  A5.
- **Joining two Snowmoon accounts that each have history:** only with **the main sign-in of each**, in one request.
  Never by us, and never through a non-main sign-in, because that would let a lesser key give away an account's work.
  - The older account survives with its main. The other's sign-ins, rows, balance and entries all become the
    survivor's.
  - Rows keep their stamp and resolve through the join record (`person_joins`), so nothing is rewritten.
  - It is final: unlinking afterwards moves nothing back.
  - It is refused if it breaks A6, A2 or A5.
  - **Today's counts add up** under one limit.
  - **Any current pass counts.**
  - **Balances add up** (the same ledger rows, now counted together).
  - **Entries:** both stand, including two made today. From then on there is one a day.
- **The automatic wallet link** (Farcaster lists the address) is kept only when that Farcaster account is the main
  sign-in (owner), and only for a wallet with no history and no wait.
- **Races:** each link, unlink, join, main change and reserve locks each Snowmoon account involved, in ascending id
  order, and checks again inside the transaction. The unique indexes are the backstop.

## 4. Balance

- One balance per Snowmoon account. Any sign-in can spend it, and every debit records the sign-in that spent it.
- A payment is credited to the Snowmoon account named in the wallet's signed statement. The words are exactly the
  owner's: "Credit my payments to my Snowmoon account {name} ({its stable address}) on snowmoon.party. Payments are
  final." `{name}` is the chosen name, and `{its stable address}` is the stable page address (section 2), for example
  "Credit my payments to my Snowmoon account @alice (snowmoon.party/u/k7m2qx9d) on snowmoon.party. Payments are
  final." The server checks the address against this session's Snowmoon account. A name change before the payment
  doesn't matter, because the address decides.
- Unlinking a sign-in leaves the balance where it is. A wallet that leaves takes no balance; its later payments go to
  whichever Snowmoon account it then signs in to.
- A credit-back goes to the Snowmoon account that was debited.
- **What changes in person-balance:**
  - The balance is keyed by the Snowmoon account, not the sign-in number.
  - "A linked wallet's balance isn't spent while linked" goes: there is one balance.
  - The statement's words change (above).
  - Payment rules, finality and the claim checks stay.

## 5. Challenge: entries, bonus, prizes

- **Who may remix:** a Snowmoon account with a linked social account that has a current pass. One submission a day
  per Snowmoon account (Pacific day).
- **Makers at close:** "three different" and the equal share count Snowmoon accounts. Two Snowmoon accounts that
  shared a sign-in at any time while entries were open count as one maker.
- **Submitting** needs a social account sign-in, because the own-post check needs one. The post must be that social
  account's own, and the record names that social account's public id.
- **A wallet sign-in can't submit.** The refusal (DRAFT): "To submit, sign in with one of your social accounts
  (Farcaster, Lens or Bluesky): your entry links to your own post there."
- **Bonus:** challenge remixes only, in the window: `min(5, 3 + max(0, passing − 1))`, where `passing` = the linked
  Farcaster, Lens and Bluesky accounts *now* with a current stored pass. Only *extra* passing accounts add (owner): one
  passing plus one non-passing gives 3. Nothing is looked up to grant it, and wallets don't count. A6 makes 5 the
  ceiling.
  - **Why it can't be farmed:**
    - A passing social account that leaves drops out of the next count.
    - For 30 days it can neither join another Snowmoon account nor start a new one, so it can't lend its pass anywhere
      else within the window.
    - A5 caps how often it can move.
    - A4: in one challenge, a pass that made one Snowmoon account's version eligible never makes another's eligible.
- **Prizes:** claimed, and the payout address given, only with the Snowmoon account's main sign-in. Once given, the
  address can be changed only by the main sign-in, and each change is logged. If a recovery request is pending, the
  claim still needs the current main.
- **Nudges** (DRAFT; each names only the networks not yet linked):
  - Default:
    - Doesn't pass: "Your Lens account doesn't qualify for free images yet. Link your Farcaster or Bluesky account: if
      either passes, you get them."
    - Passes: "Link your other accounts to sign in with any of them and keep all your work in one place."
  - Challenge:
    - Doesn't pass: "To remix for the challenge for free, link a Farcaster or Bluesky account that qualifies."
    - Passes: "Link your other accounts: each one that also qualifies adds a free challenge remix a day, up to 5."
  - With the main sign-in in this model, "Link" goes to a page that asks the main sign-in to confirm.

## 6. Unlinking and the waits

| Action | Who | Allowed | Then |
|---|---|---|---|
| Unlink itself | Any sign-in, the main included (owner) | Always. The main first picks the next main. | It takes nothing. **For 30 days it can neither join another Snowmoon account nor start a new one** (signing in with it alone answers: "This sign-in left a Snowmoon account on 11 Dec. It can join another or start a new one from 10 Jan."). It may rejoin its own at once, which isn't a move. |
| Unlink another sign-in | Main sign-in | Unless it is the last sign-in | The same 30 days. |
| Link or join | Main sign-in (and, for a join, the other account's main) | If A6, A8, A2 and A5 allow it | Joining a different Snowmoon account than its last counts as a move. |
| Ask for a new main | Any non-main sign-in | One request at a time | Takes effect after 30 days unless the main cancels it. |

- **A5 is not moot.** Ownership no longer moves, but a passing social account still lends its pass to whichever
  Snowmoon account it is in. A5 caps how many Snowmoon accounts one pass can serve in a year, and A2 spaces them out.
- **A7 (the challenge freeze) is dropped** (owner). Entries belong to the Snowmoon account and never leave with a
  sign-in. "Shared a sign-in while entries were open" stops a split from adding a maker. Without the new
  "can't start a new one" rule there was a gap: an unlinked passing account could have started its own Snowmoon
  account the same day and qualified it at once. The rule closes that gap.
- **You page events:** links, unlinks, main changes, and recovery requests with their outcome. Each shows the date,
  the sign-in's name and icon, and which sign-in did it. They cover the last 90 days, newest first, and are never
  public.

## 6a. Tests (to be built with the feature, in `test:linked-accounts`)

Dates 2026–2027, noon Pacific. Entries are open 6–22 Nov; results are on 4 Dec.

**T1. The chain.** Which sign-in is main is shown at each step.

| Date | Step | Main | Allowed because |
|---|---|---|---|
| 6 Nov | Farcaster **A** signs in, making Snowmoon account S. A has a pass and pays $2.00 into S. A remixes and submits an entry. | A | — |
| 7 Nov | A (main) links Lens **B**. B has its own pass. B pays $1.00 into S, remixes and submits S's 7 Nov entry. | A | A6; B's move 1 |
| 11 Dec | A (main) unlinks B. | A | main; not the last sign-in |
| 12 Dec | A (main) links a new Lens **C**. | A | A6 (B has gone); C's move 1 |
| 13 Dec | A chooses C as main, then C (main) unlinks A. A's own unlink needs the main sign-in, and A can't unlink itself while it is main. | C | main |
| 14 Dec | C (main) links a new Farcaster **D**. | C | A6 (A has gone); D's move 1 |

**After 14 Dec,** S = {C (main), D}:
- S still owns everything A and B made: their work, both entries, the $3.00 less what was spent, and today's counts.
  It all shows under S's chosen name, which is now C's or D's name.
- A and B each own nothing, and neither is in any Snowmoon account.
- The challenge record still names A's FID and B's Lens address for their entries.
- S passes only on C's or D's own checks. A's and B's passes count for nothing in S.
- A can't join or start a Snowmoon account until 12 Jan, and B until 10 Jan (A2).
- A release-window fixture (made by B's sign-in before v2, recorded under A's FID) belongs to S throughout.
- **Planted faults** that must fail the test: work or balance leaving with A or B; a byline still showing A's name
  after A left; S passing on A's check.

**T2. Takeover through a non-main fails at every step.** At each date in T1, every sign-in that isn't main tries each
of the following, and each is refused with "Only your main sign-in can do that":
- link a new sign-in;
- unlink another sign-in;
- choose itself or another as main;
- claim a prize;
- give or change a payout address;
- join S to another Snowmoon account, even together with that other account's main.

The non-mains tested: B on 7 Nov–11 Dec; C on 12 Dec (when A is main); A after 13 Dec (no longer in S, so refused as
not linked); D on 14 Dec. A non-main may make and spend (allowed), submit if it is a social account (allowed), and unlink itself (allowed;
it takes nothing).

**T3. Recovering the main sign-in.**
- 8 Nov: B asks to become main. The banner shows for A and B, effective 8 Dec.
- A Farcaster mini-app notification goes once to A's stored token. It has no handle. If there is no token, nothing is
  sent and nothing fails.
- 9 Nov: B tries to cancel its own request: refused (only the main). A cancels it: B stays non-main. The events show
  the request and the cancellation, and a second notification says it was cancelled.
- Variant: not cancelled. On 7 Dec B still can't unlink A, claim, or give an address. From 8 Dec noon B is main.
- Variant: A unlinks B on 20 Nov: the request ends.
- Variant: a second request while one is pending: refused.
- Planted fault: a pending request treated as effective before day 30 must fail the test.

**T4. Balance.**
- 8 Nov: B spends from S's $3.00, and the debit records B.
- 11 Dec: after B is unlinked, S's balance is unchanged, and B has no balance anywhere.
- A credit-back for a generation that B started on 10 Dec and that fails after the unlink goes to S.
- On 20 Dec B, unlinked and still waiting, has no Snowmoon account, so a payment can't be signed for one. A statement
  for S signed while B is linked names S's stable address and credits S.
- **Payment message:** the signed text is exactly "Credit my payments to my Snowmoon account @alice
  (snowmoon.party/u/k7m2qx9d) on snowmoon.party. Payments are final." A statement naming another Snowmoon account's
  address, or this account's old name with the right address, is checked by the address: the first is refused, the
  second is accepted.
- Planted faults: the balance splitting by sign-in; a payment credited to S after B left.

**T5. Prize.**
- B's 7 Nov entry, submitted by B with B's own Lens post, wins on 4 Dec. On 5 Dec, B claims: refused (not main). A
  claims and gives the address: allowed.
- On 14 Dec, C (now main) may change the address (logged). A, after leaving, can't.
- The record names B's Lens address, the post's social account.
- A wallet sign-in of S tries to submit on 8 Nov: refused, "To submit, sign in with one of your social accounts…".

**T6. Bonus.**
- 8 Nov: S with A and B passing gets 4 free challenge remixes.
- Variant: A unlinks B on 10 Nov: the next count is 3. B can't start or join a Snowmoon account until 10 Dec. B's attempt
  to join S2 on 15 Nov is refused (A2).
- Also covered:
  - one passing plus one non-passing gives 3;
  - three passing accounts give 5, and nothing gives 6;
  - a wallet adds nothing;
  - an expired or withdrawn pass adds nothing;
  - outside the window, nothing changes.

**T7. The 30 days and A5.**
- B, unlinked on 11 Dec, signs in alone on 12 Dec to start a new Snowmoon account: refused until 10 Jan noon.
- B joins Q on 20 Dec: refused (A2). On 11 Jan: allowed (move 2).
- B self-unlinks (variant): the same 30 days apply.
- B rejoins S on 20 Dec: not a move and no wait, but refused (A6: C is there). In the variant without C, it is allowed.
- B leaves Q on 1 Feb and joins R on 5 Mar: refused (A5: a third move). On 8 Nov 2027: allowed.

**T8. Makers at close.** S (A, B) and S2 never shared a sign-in: two makers. A variant where B left S on 15 Nov and
then (after a wait shortened in the test) joined S2 before 22 Nov: S and S2 count as one maker.

**T9. Migration mapping and the wallet notice.**
- A fixture with a wallet linked to an FID, a Bluesky account linked to Lens and then to that FID, an ended link and
  an unlinked number with rows.
- After the backfill, every row of a linked number belongs to its group's Snowmoon account, and the ended-link and
  unlinked numbers own theirs.
- An insert by old code (owner null) is stamped by the trigger.
- The Snowmoon account with the linked wallet sees the notice once, and not after it is dismissed. Accounts without a
  wallet linked at migration never see it.

**T10. Self-unlink.**
- C (non-main) unlinks itself on 15 Dec: allowed, and takes nothing.
- The main unlinks itself after picking the next main: allowed.
- The only sign-in unlinks itself: allowed after the warning. The account's work stays published. The sign-in can
  rejoin it at once, and can't start a new account for 30 days.

**T11. The automatic wallet link.**
- A wallet Farcaster lists for A links automatically while A is main.
- After C becomes main, a wallet Farcaster lists for a linked FID that isn't main is not linked automatically. The
  offer asks the main sign-in to confirm.

**T12. Addresses.**
- S changes its chosen name from @alice to lens/cara: `/@alice` and `/lens/cara` both redirect (301) to `/u/k7m2qx9d`.
- `/@alice/<adaptation>` redirects to its stable address.
- An unlisted sign-in that was never the name answers 404.
- Quote cards show the chosen name with its mark.

**T13. Single sign-in nudge.** It is shown while S has one sign-in and hidden once there are two.

## 7. Public pages and addresses

- **The stable address** `snowmoon.party/u/<id>` is each Snowmoon account's page, and it never changes (owner).
- **Name addresses redirect to it:** `/@<fname>`, `/bsky/<handle>`, `/lens/<name>`, `/w/<0x…>`, for the chosen name
  now and every chosen name before. So do old adaptation URLs (`/@<fname>/<id>` to `/u/<id>/<adaptation>`).
- An address of a sign-in that was never the chosen name and isn't listed answers "not found", because a redirect
  would reveal the link.
- **The page** shows all the account's work, newest first, and other sign-ins only if ticked.
- **Quote cards** show the chosen name with its network's mark (owner), not a Farcaster ID.
- Linking stays visible through the work, and the texts never promise it's hidden.

## 8. Terms, Privacy and About (DRAFT, before and after; nothing approved)

The "before" lines are on `origin/linked-accounts` (Terms 2n41v2, Privacy io2dz) and, for §6e, `origin/contest`. The
"after" lines are the shortest true sentences, with no implementation details and no changeable numbers beyond the
30 days the texts already state.

**Terms §4.**
- Before: "Your account here is a Farcaster account, a wallet address, a Lens account or a Bluesky account. You can
  link several of them, each by signing in with it; linked accounts are one person here, so free daily images and
  frames, limits and the remix challenge count once for them all, and you pass the site's check if any of them does.
  An account belongs to one person at a time, we don't merge two people's accounts, and an account you unlink can be
  linked to someone else only after 30 days."
- After: "You sign in with a social account (Farcaster, Lens or Bluesky) or a wallet. Your Snowmoon account holds your
  work, challenge entries, balance and name; each social account or wallet you link to it is a way in, and any of them
  can make and spend. One of them is your main sign-in: only it can link the others or unlink them, choose another
  main sign-in or claim a prize. If you lose it, another of your sign-ins can ask to become the main one; that takes
  effect after 30 days unless your main sign-in cancels it. If you lose your only sign-in, your Snowmoon account can't
  be recovered. Your Snowmoon account gets free daily images and frames, and can take part in the remix challenge,
  only while a linked social account passes the site's check, and these count once for it (except as section 6e
  says). Two Snowmoon accounts are joined only when you sign in with the main sign-in of each, never by us. Any sign-in
  can unlink itself; one that is unlinked takes nothing with it, and for 30 days it can't join or start another
  Snowmoon account."

**Terms §5** (byline).
- Before: "Your name is shown with it: your Farcaster name; for a wallet account, its address shortened; for a Lens
  account, its Lens username; for a Bluesky account, its handle. Work made with a wallet that is linked to your
  Farcaster account is shown with your Farcaster name."
- After: "Your name is shown with it: the name you choose for your Snowmoon account from its sign-ins (a Farcaster
  name, a Lens username, a Bluesky handle or a wallet's address shortened), with its network's mark, and your
  Snowmoon account has a page at an address that doesn't change."

**Terms §6a** (person-balance sentences).
- Before: "If you are signed in with Farcaster, Lens or Bluesky, your wallet first signs a message naming your
  account, and a payment from that wallet made soon after is added to that account's balance." and "A balance stays
  with the account it was paid to, including when that account is linked to another."
- After: "Your wallet first signs a message naming your Snowmoon account and its page's address, and a payment from that
  wallet made soon after is added to its balance." and "Your balance belongs to your Snowmoon account: any of its sign-ins can spend
  it, and it stays if one is unlinked."

**Terms §6e** (challenge).
- Before: "During the challenge, anyone signed in with a Farcaster account or a Bluesky account that passes the site's
  check for it may remix its characters' sheets; making other sheets and styles stays by invitation."
- After: "During the challenge, anyone whose Snowmoon account has a linked social account that passes the site's check
  may remix its characters' sheets; making other sheets and styles stays by invitation. Each further linked social
  account that passes its own check adds free challenge remixes a day, up to the number the challenge page shows; it
  never adds an entry."
- Before: "Each person can submit one entry a day (Pacific time)… A character needs entries from at least three
  different people to get a final version; several entries by one person count once."
- After: "Each Snowmoon account can submit one entry a day (Pacific time)… A character needs entries from at least
  three different Snowmoon accounts to get a final version; several entries from one count once, and Snowmoon
  accounts that shared a sign-in while entries were open count as one."
- New: "A prize is claimed, and its payout address given, only with your Snowmoon account's main sign-in."
- Submitting. Before (contest): "A version counts as an entry only once its maker submits it on the Service, with a
  link to their own post about it on Farcaster, Bluesky or Lens that links to its page, …". After: "A version counts as
  an entry only once it is submitted on the Service while signed in with a social account, with a link to that
  account's own post about it on Farcaster, Bluesky or Lens that links to its page, …".
- The record: "its maker's Farcaster ID (or, for a Bluesky account, its DID)" becomes "the public id of the social
  account its post came from (a Farcaster ID, a Lens address or a Bluesky DID)".

**Privacy §6.** The text approved earlier today, now **superseded and needing a new approval**: "If you link social
accounts or wallets to your Snowmoon account, what you made with any of them, before and after linking, is shown
under the one name you choose, so anyone can see that they are yours; if you unlink one, its work is shown under its
own name again, except what it made while linked before {date}, which stays with the social account it signed in as."
- After (DRAFT): "If you link social accounts or wallets to your Snowmoon account, what you made with any of them,
  before and after linking, belongs to your Snowmoon account and is shown under the one name you choose, so anyone can
  see that they are yours; unlinking one doesn't change that."
- The "except" clause goes, because nothing moves on unlink. The bracket "(your Farcaster name; …; your Farcaster ID
  on quote cards)" becomes "(the name you choose for your Snowmoon account, with its network's mark, also on quote
  cards)".
- Today's live wallet sentence, "if you unlink it, that work is shown with the wallet's address again", is replaced.
  The owner accepted this for existing wallets, and those Snowmoon accounts are told on their You page (section 1).

**Privacy §4** (the linking record).
- Before: "If you link accounts (each by signing in with it, or, for a wallet, because Farcaster lists its address as
  your account's): which accounts are linked, how and when each was linked or unlinked, and why a link ended. Linked
  accounts are one person here. You can unlink an account on your You page; it can be linked to someone else only
  after 30 days, and until then gets no free images or frames."
- After: "If you link social accounts or wallets to your Snowmoon account (each by signing in with it, or, for a
  wallet, because Farcaster lists its address as your main sign-in's): which are linked, how and when each was linked
  or unlinked and by which sign-in, why a link ended, which is your main sign-in and when it changed, any request for
  a new main sign-in (which sign-in asked, when, and whether it was cancelled), the name you chose, and which sign-ins
  you list on your page. Your You page shows these. A social account or wallet that is unlinked can't join or start
  another Snowmoon account for 30 days."
- New (notifications): "If you added the Snowmoon mini app in a Farcaster app and turned on its notifications: the
  notification token your Farcaster app gave us, kept with your Farcaster ID until you turn them off or remove the
  app, used only to tell you about a request to change your main sign-in."
- Prepaid paragraph: "A balance stays with the account it was paid to, including when that account is linked to
  another." becomes "Your balance belongs to your Snowmoon account."
- Challenge paragraph: "…whether one of your linked social accounts passed the site's check, and which one…". New: "If
  you claim a prize: the payout address your main sign-in gives." New: "During the remix challenge, the stored check
  results of the social accounts linked to your Snowmoon account decide your free challenge remixes."

**Privacy §7** (new line, which P6g needs because the Farcaster app's notification service receives something): "If you
turned on the Snowmoon mini app's notifications in a Farcaster app, that app's notification service receives the
token and a short message when someone asks to change your main sign-in, and delivers it to you."

**About** ("Signing in").
- Before (`bluesky-check`): "Reading needs no account. Saving cards and liking need a Farcaster sign-in, and the
  assistant a Farcaster account or one linked to it. Making images needs a sign-in."
- After: "Reading needs no account. To make images or ask the assistant, sign in with a social account (Farcaster,
  Lens or Bluesky) or a wallet. Your Snowmoon account keeps your work and balance; you can link more ways in, and your
  main sign-in manages them."

**Site words** (DRAFT): "Your Snowmoon account"; "Main sign-in" (with "Choose another"); "Other sign-ins"; "Link a
social account or wallet (needs your main sign-in)"; "Ask to become the main sign-in"; the recovery banner, the
single-sign-in nudge and the existing-wallet notice (sections 1 and 2). Refusals:
- "Only your main sign-in can do that. Sign in with lens/bea to continue."
- "Your Snowmoon account already has a Lens account."
- "lens/bea was unlinked on 11 Dec. It can join another Snowmoon account from 10 Jan."
- "This account has moved between Snowmoon accounts twice this year. It can move again from 8 Nov 2027."
- "This sign-in left a Snowmoon account on 11 Dec. It can join another or start a new one from 10 Jan."
- "To submit, sign in with one of your social accounts (Farcaster, Lens or Bluesky): your entry links to your own post
  there."
- "Only your main sign-in can cancel this request."

## 9. Migration outline (`NEXT_linked_accounts_v2.sql`, with v1's; not the SQL yet)

Additive and safe with live code. Nothing reads it until `LINKED_ACCOUNTS.enabled` is on.
1. v1's `people`, `person_accounts` and backfill, with the `person_id` columns kept (the owner stamp). Add the same
   nullable `person_id` to the other owned tables:
   - `elements`, `remix_frames`, `storyboards`;
   - `chat_calls`, `agents`, `likes`, `take_likes`, `ratings`, `notes`, `suggestions`, `version_posts`, `mp_*`;
   - the wallet and person-balance ledgers.
2. Backfill `person_id` on every row: its number's Snowmoon account at migration, creating `first` accounts for numbers
   that have rows and no link. Batched, and safe to run twice.
3. A `before insert` trigger on each owned table fills a null `person_id` from the number's current Snowmoon account.
4. `person_profile (person_id pk, public_id unique, display_account, main_account, updated_at)`. `public_id` is
   random, never reused and immutable. A trigger requires both accounts to be active members.
4a. `person_names (person_id, path, since)`: every name address the account has had, for redirects.
4b. `miniapp_tokens (fid, url, token, added_at)`, filled by the mini app's webhook (events: added, notifications
   enabled, disabled, removed) and deleted on disable or remove. RLS on, no public read.
4c. `notices_seen (person_id, notice, at)` for the existing-wallet notice.
5. `main_requests (id, person_id, requested_by, new_main, requested_at, effective_at, ended_at, ended_how ∈
   {cancelled, unlinked, done})`, with one open request per Snowmoon account (partial unique index).
6. `person_joins (into_person, from_person, at)`, insert-only. Ownership resolves through it.
7. `person_accounts.ended_by` gains `'main'`, `'self'` and `'recovery'`, plus `ended_via`.
8. Prize claims: `(challenge, entry, person_id, claimed_via, payout_address, at)`, insert-only, with `claimed_via` as the
   main at the time. This may land with the payout work.
9. A read-back with a realistic insert and delete of each, and the planted refusals.

## 10. Build order

0. The release fix (one account per network).
1. v1 with owner stamps, the backfill and the trigger.
2. The main sign-in and main-only actions (T2).
3. Recovery (T3).
4. One balance per Snowmoon account (person-balance changes, T4).
5. Name and icons, the You page and its events.
6. Joining two accounts by both mains.
7. The bonus and nudges (T6).
8. Prizes with the payout work (T5).
9. Public pages.
10. The reread, check:principles, and the switch.

## 11. Open questions

Answered by the owner (2026-11-05):
- existing wallets accepted, with a notice;
- any sign-in may unlink itself;
- the automatic wallet link only when the Farcaster account is main;
- the payment message;
- submitting needs a social account;
- A7 dropped, with the 30-day "can't start a new one" rule;
- no recovery for a single sign-in, and a nudge;
- only the main cancels;
- stable addresses with redirects;
- quote cards show the chosen name;
- the bonus counts only extra passing accounts.

Still open:
1. **The mini-app webhook and notifications are new code and a new outside service** (the Farcaster app's
   notification server). They need the Privacy §4 and §7 lines above, a P6g check that names the service, and the
   owner's reread. Ship them with recovery, or let recovery ship with the banner only and add notifications after?
2. **The main unlinking itself as the only sign-in** leaves a Snowmoon account with no way in. Allow it (drafted, with
   a warning), or refuse it for the only sign-in?
3. **Stable id format:** 8 lowercase letters and digits (drafted). Confirm.
4. Carried over: whether saving cards and liking stay Farcaster-only (decides the About line).

## Principles

- **1 (public recipes):** not touched.
- **2 (AI declared; words human):** pass. Work is credited to the Snowmoon account's chosen name.
- **3 (model allowlist):** not touched.
- **4 (nothing published without a person's action):** pass. Joins need both mains. Prizes and sign-in changes need
  the main sign-in.
- **5 (nothing canon):** pass. No manual merges or recoveries. Lists are newest first.
- **6 (privacy; texts describe today):** concern. Every line is a draft. The approved §6 is superseded and needs a
  new approval. Open question 1 changes a live promise for existing wallet links. Like totals count each Snowmoon
  account once.
- **7 (payments never enter scoring or ordering):** pass. One balance moves no money between people. Paying never
  creates a pass, a bonus or an entry.
- **8 (Minpentai):** not touched.
- **Tensions:**
  - Any sign-in can spend, so a stolen social account can spend the balance until the main unlinks it or it unlinks
    itself.
  - The mini-app notification adds an outside service (open question 1).
  - The bonus remains a bounded exception to "linking never raises caps".
