# Snowmoon: Linked accounts v2 (DRAFT)

**DRAFT. Drafted by a coding agent (Claude, a closed model by Anthropic)** for the coordinator (session snowmoon-9c),
2026-11-05. Branch `designs-2026-11-05`. Design only: nothing is built, no SQL is written, and no legal words change.
Legal lines below are drafts for the coordinator and the owner's reread. They never go into `src/lib/legal.ts` from
this branch.

Builds on: the approved v1 rules A1–A8 (`docs/proposals/linked-accounts.md` on `signin-reread-list`), the v1 build
(`origin/linked-accounts`, head 94833eda: `studio.people`, `studio.person_accounts`, off), paying per person
(`origin/person-balance`), the contest (`origin/contest`: one submission per person per Pacific day) and the sign-in
release (`signin-lens-bluesky` in `bluesky-check`; migration `NEXT_signin_lens_bluesky` applied on production).

## The owner's direction (2026-11-05)

1. Nothing depends on Farcaster. A person is their linked accounts; signing in with any one gives the whole account
   (work, balance, entries, limits).
2. The person chooses which username is shown. Every name shows its network's icon (Farcaster, Lens, Bluesky; a
   wallet as its short address). Bylines use the chosen name for work made with any linked account, before and after
   linking. This replaces "Farcaster name first".
3. Two accounts that each have history are joined only by the person's own action (signing in with both), never by
   us by hand.
4. Public person pages are found by the chosen name. Other linked accounts are listed there only if the person
   chooses.
5. The linking incentive, corrected: during the challenge window only, each extra linked account that passes its own
   check adds 1 free challenge remix a day, up to 5. Everything else is unchanged.

## The ownership rule (owner, 2026-11-05)

**Work, challenge entries, balances and check results belong to an account, never to a person.** A person is only a
view over the accounts linked now: one sign-in, one chosen name, combined limits. The person id groups accounts and
nothing else. No row is owned by, moved to or keyed by the person.
- **Unlinking an account takes its own work, entries and balance with it,** and its byline goes back to its own name.
- **The one exception:** in the sign-in release (before v2), a linked Lens, Bluesky or wallet sign-in signs in as the
  Farcaster account, so work made that way is recorded under, and stays with, the Farcaster account. The planned
  Privacy §6 clause covers it (section 8: "…except what it made while linked before you could choose your name, which
  stays with the account it signed in as").
- **Combined limits** are computed over the accounts' own rows. The limit is the person's; the count is the sum of the
  linked accounts' rows (which accounts count on the day of an unlink is open question 8).

## 1. The model

- **A person** is a row in `studio.people` (v1). It is only a group of accounts. Its id is private: never shown,
  never in a URL or a public record. It belongs to no network, and it owns nothing.
- **An account** is what signs in: a Farcaster ID, a wallet, a Lens account or a Bluesky account. It is named by
  today's person number (`src/lib/people.ts`: FID > 0; wallet −id; Lens/Bluesky −(10⁹ + id)). **Today's person numbers
  stay as they are and become account numbers.** No row is renumbered or rewritten.
- **Membership** is `studio.person_accounts` (v1): one active row per account (A1), with history (linked_at,
  unlinked_at, ended_by). The limits per person stay: one Farcaster, one Lens, one Bluesky and up to 3 wallets (A6).
  A6 is also what caps the challenge bonus (section 5).
- **Mapping today's data.** v1's backfill reads `wallet_links` and `social_links` and copies them. It changes neither
  table. Each existing link becomes a membership. An account seen in no link gets its person the first time it is
  needed (`how = 'first'`). The sign-in release's `social_links` carry over unchanged once that release refuses a second
  account of one network per person. That fix is in the release-fix lane (the urgent answer of 2026-11-05).
- **Sign-in gives the whole account.** Every route resolves `{ account, person }`. The account is the one that signed
  in; the person is whoever it belongs to now. Limits, the name and pages are computed over the person's accounts
  now. What each row is, and whose it is, stays the account's.

### Writes record the real account (change from v1)

v1 kept one "acting number" per person (the first of Farcaster, Lens, Bluesky), so routes wrote the Farcaster ID even
for a Bluesky sign-in. v2 writes **the account that actually signed in** into the existing columns (`created_by_fid`,
`image_asks.fid`, `remix_asks`, `challenge_marks.fid` and the rest). That makes "its work goes back on unlink" exactly
true from v2 on. No new columns are needed: those columns already hold account numbers.

**Drop v1's `person_id` columns.** v1's unapplied `NEXT_linked_accounts` adds `person_id` to `image_asks`,
`remix_asks`, `challenge_eligibility` and `challenge_marks`. That stamps rows with a person, and its countScope counts
"rows with the person's id". After an unlink, that would leave an account's rows counted for, or shown with, the
person it left, which breaks the ownership rule. v2 removes those four columns from v1 before it is applied, and
counts from the account columns plus `person_accounts` history only. The test in section 6a has a planted fault for
exactly this.

**The release window.** Between the sign-in release and v2, a linked Lens/Bluesky sign-in (and, since 0026, a linked
wallet) acts as the Farcaster ID. That follows Terms §4: "while it is linked, signing in with it is signing in as that
account". Work made that way is recorded under the Farcaster account, and which account was used isn't stored. It
stays with the Farcaster account, including after an unlink. Privacy §6 says so (section 8; option A, chosen by the owner 2026-11-05).

### Table by table: what "the whole account" means

| Today (keyed by account number) | v2: owned by | v2: the person's view |
|---|---|---|
| `image_asks`, `remix_asks`, `sheet_remix_asks` (daily counts) | The account that made the request | The used count is the sum over the person's linked accounts' rows; the limit is one person's limit, not a sum of limits. |
| `check_decisions` (per network and account, 0034) | The account (unchanged) | The person passes while any linked account has a current pass. An unlinked account's pass stops counting for the person at once. |
| `wallet_accounts` balances, person balances (`person-balance`) | The account the payment was credited to | The You page shows each linked account's balance. Spending another linked account's balance is the owner's call (open question 2). Every debit and credit-back is recorded against the account whose balance it touched. |
| `chat_calls` (assistant limit) | The account that asked | The count is summed over linked accounts, as for images (see `assistant-any-account.md`). |
| `challenge_eligibility`, `challenge_marks` | The account that published or submitted (`fid`; the IPFS record names it) | One-a-day is counted over the linked accounts. "Three different people" and the equal share group accounts by their links at close. An entry never moves; after an unlink it shows with its own account. |
| `elements`, `recipes`, `remix_frames`, `storyboards`, designs (`created_by_fid`, `by_name`) | The account that made it (the real account from v2; the Farcaster account for sign-in-release work) | The byline is drawn at render: account, then its person now, then that person's chosen name. Unlinked, it shows the account's own name. The stored `by_name` is a fallback only. |
| `agents`, agent keys | The account that made them | 3 agents counted over the linked accounts. A key made by one account acts for that account's person while it is linked. Unlinked, the agent and key go with their account. |
| `AGENTS.people` allowlist, `ADMINS` | The listed accounts | Allowed while any linked account is listed. An admin account makes the person's versions ineligible while linked. Neither carries over after an unlink. |
| `likes`, `take_likes`, `ratings`, `picks` | The account | Public totals count distinct people among the accounts linked now, so two linked accounts never like twice. |
| `contributor_consents` | The account that gave it | Any linked account's consent at the current words covers the person while linked. An unlinked account keeps only its own. |
| `mp_*` (Minpentai), `notes`, `suggestions`, `version_posts` | The account | Listed together on the You page while linked. |

## 2. The chosen name and icons

- **Stored:** `display_account` per person: the account whose name is shown. It must be an active, non-wallet member,
  or a wallet if the person has no other account.
- **Default when nothing is chosen** (and the value set when v2 ships, so no byline changes on release day): the name
  shown today (Farcaster, else Lens, else Bluesky, else wallet). For a person created after v2: the first account they
  signed in with.
- **The name itself** is the account's current name: the Farcaster username (the latest seen, `account_names`), the
  Lens username (`lens/name`), the Bluesky handle only if it resolves back to its DID (else "a Bluesky account"), or the
  wallet address shortened.
- **Icons:** every name, everywhere it appears (bylines, You page, person page, challenge lists), carries its network's
  icon: Farcaster, Lens, Bluesky, or a plain wallet glyph beside the short address. Each icon has text for screen
  readers ("on Bluesky"). The icons are small, single-colour and used only to name the network, never as our branding.
- **Changing it** takes effect everywhere at once, including on past work, because bylines are drawn at render. No
  limit on changes is proposed (open question 3).
- **When the shown account is unlinked,** the default rule picks the next name. The work that leaves shows under its
  own account's name.

## 3. Joining (point 3), rule by rule

**How a join happens.** Only by the person, with both sign-ins in one request (`/api/wallet-link`,
`/api/social-link`, and v1's link route). Never by a moderator or the owner. The one standing exception is the
automatic wallet link (Farcaster lists the address). v2 keeps it only for a wallet with no history and no other
person in the last 30 days. A wallet with history joins only by signing in with both.

**Joining two people (both with history).** v1 refused this ("two people never merge"). v2 allows it, because the
person signed in with both. The two persons become one: the older id survives, and the other's accounts are ended
and re-added under it (`how = 'joined'`, one shared timestamp). Nothing else moves: no row changes owner, because rows
belong to accounts. The join is refused, with the reason, if the result would break A6 (two of one network, or more
than 3 wallets), if an account is inside its 30-day wait for a different person (A2), or if it would exceed A5 (2
moves in 365 days). The other person's `people` row is kept, never deleted.

- **Daily counts:** today's counts add up. After the join, today's used count is the sum of both sides' rows, and the
  limit is the one person's limit. A join only ever leaves less, never more. If the sum is already over, there's
  nothing more free today, and nothing already made is taken back.
- **The free check:** any current pass counts. A member's stored, unexpired pass under today's rule
  (`check_decisions`) makes the person pass. Joining never triggers a lookup. At Generate, the existing order (admin,
  invited, Farcaster, Lens, Bluesky) asks a service only when no member has a current decision, and stops at the first
  pass.
- **Balances:** they stay per account, as approved. No money moves between them, and a join never adds, pools or
  converts a balance. Whether the person may *spend* another linked account's balance, as part of the view, is the
  owner's call (open question 2). An unlinked account takes whatever is left of its balance with it.
- **Challenge entries made before linking:** they stay with the accounts that made them, entries and eligibility
  included (decided once, A4). From the join on, the two sides count as one person. One submission a day means one for the person: if both sides
  have already submitted today, both stand, and the next is tomorrow (Pacific). "At least three different people" and
  the equal share count the person once, worked out at close. A join is allowed during the challenge, because it can
  only lower counts. A7 still stops an account with a submission from *leaving* until payout.
- **Unlinking: the 30-day rule** (section 6).

**Races.** Every link, join, unlink and reserve takes a transaction-scoped advisory lock on each person involved, in
ascending id order (no deadlock), then checks the rules again inside the transaction. The unique indexes (one active
row per account; one per network per person) are the backstop. With two sessions linking at once, one wins and the
other gets the refusal for the state it now finds (for example "already linked", or "you already have a Bluesky
account"). A reserve (Generate, ask, submit) takes the same person lock, so a link can't slip between counting and
inserting.

**Abuse: linking never raises a cap,** with one deliberate, bounded exception (section 5).
- Free counts, assistant questions, agents, submissions and shares are limited per person, counted over the accounts'
  own rows. Joining sums the used counts and keeps one limit.
- Rotating an account to a fresh person is blocked by A2 (30 days, with no free counts or passes on its own during
  the wait) and A5 (2 moves a year). A leaving account takes its rows with it, so its own count never resets. For the
  person it left, see open question 8.
- A4: within one challenge, an account that passed for one person never passes for, or adds a bonus to, another.

## 4. Passing the check, and spending

- **Free counts** need a current pass by any member, as above.
- **Paid:** the signed-in account pays from its own balance, as approved. Spending another linked account's balance
  is the owner's call (open question 2). Paying never makes an entry (P7).
- **The order money is spent in:** the person's free count first, then the balance. The site-wide prepaid daily cap
  stays.

## 5. The challenge bonus (owner, corrected 2026-11-05)

**Rule.** During the challenge window, and only for challenge remixes, a person's free challenge remixes a day are
3, plus 1 for each linked account beyond the first that has its **own current pass** for its own network, up to 5.
Outside the window, or for any other generation, free limits stay as they are and linking changes nothing. Paid
remixes are unchanged. Submissions stay one a day per person, and linking never adds an entry.

**How it's counted.** At each challenge-remix reserve, under the person lock:
`allowance = min(5, 3 + max(0, passing − 1))`, where `passing` is the number of active Farcaster, Lens and Bluesky
members with a current stored pass (`check_decisions`, today's rule, not expired, not withdrawn after a report or
hide). Then `used` is compared with that allowance. No member is looked up to grant a bonus: an account without a
current decision counts 0 until its own Generate or sign-in check decides it. Wallets have no network check and never
count. With A6 (one account per network), `passing` is at most 3, so 5 is also the structural ceiling.

**Why it can't be farmed.**
- **Unlink and relink within 30 days:** relinking to the same person gives back the same count, so nothing is gained.
  Joining a different person is refused for 30 days (A2), and during the wait the account passes no check anywhere,
  so it adds no bonus anywhere. The challenge window (about 17 days) is shorter than the wait.
- **One account linked to two people:** impossible at once (A1). In sequence it is blocked by A2, A5 and A4 (in one
  challenge, an account that counted for one person never counts for another).
- **Unlinking mid-day:** the bonus drops from the next count. Remixes already made aren't taken back. The leaving
  account's rows go with it (open question 8 covers the rest of that day for the person it left).
- **Several accounts of one network:** A6 refuses them. This is why the release fix matters.
- **Buying a bonus:** impossible. A payment never creates a pass, and the bonus counts only passes.

**What the person sees** (DRAFT words; each names only the networks the person hasn't linked; the examples are for a
Lens person):
- Default (You page, sign-in, everyday images). Doesn't pass: "Your Lens account doesn't qualify for free images yet.
  Link your Farcaster or Bluesky account: if either passes, you get them." Passes: "Link your other accounts to sign
  in with any of them and keep all your work in one place."
- Challenge (/challenge, challenge remixes, the free-limit refusal). Doesn't pass: "To remix for the challenge for
  free, link a Farcaster or Bluesky account that qualifies." Passes: "Link your other accounts: each one that also
  qualifies adds a free challenge remix a day, up to 5."
- Wording note for the owner: the default "passes" line has no number, and the challenge line carries "up to 5" on
  the page, where the number belongs (it can change without a legal reread).

## 6. Unlinking

- On the You page, any member can be unlinked except the person's last account. The account being removed doesn't
  have to sign in (so a lost wallet can be removed). A7: an account with a submission or an eligible version in an
  unpaid challenge can't leave until payout.
- The account becomes a person of its own. It takes its work, entries, balance, agents, consents and check results,
  because they were always its own, and its byline goes back to its own name. The one exception is sign-in-release
  work recorded under the Farcaster account, which stays there (the ownership rule).
- **30 days:** it can join a *different* person only after 30 days, with no free counts, passes or bonus on its own
  in that time. Rejoining the same person is allowed at any time and ends the wait (A2, approved).
- Its own used counts go with it and keep counting for it. For the person it left, today's count is open
  question 8.
- If it was the shown name, the default rule picks the next one. If it was listed on the person page, the listing
  ends.

## 6a. Test: a chain of links and unlinks (to be built with the feature, in `test:linked-accounts`)

Dates are 2026–2027, at noon Pacific. The challenge is `remix-2026-11`: entries 6–22 Nov. A7 (the challenge freeze)
holds until payout; the test lifts it on 10 Dec by emptying `frozenChallenges`. A2 is 30 days to join a *different*
person; joining the same person again is never a move and has no wait. A5 is at most 2 moves in 365 days; a move is
joining a different person, and an account's first person of its own isn't one. Each step is allowed as dated.

| Date | Step | Rules checked | Result |
|---|---|---|---|
| 6 Nov | Farcaster **A** signs in (person P). A has a Neynar pass, a $2.00 balance, publishes a remix and submits it as an entry. | — | allowed |
| 7 Nov | Lens **B** links to P (both sign-ins). B has its own Lens pass and $1.00. Signed in as B, B publishes a remix and submits it (P's one entry for 7 Nov). | A6 (one Lens), A5: B's move 1 | allowed |
| 11 Dec | B unlinks from P. | A7 lifted on 10 Dec | allowed; B's wait (A2) runs to 10 Jan |
| 12 Dec | A new Lens **C** links to P. | A6 (B is gone), C's move 1 | allowed |
| 13 Dec | A unlinks from P (P keeps C). | not the last account | allowed; A's wait runs to 12 Jan |
| 14 Dec | A new Farcaster **D** links to P. | A6 (A is gone), D's move 1 | allowed |

**Assertions after 14 Dec** (P = {C, D}):
- **Work:** nothing A or B made appears on P's page or You page, or under C's or D's name. A's work shows under A's
  Farcaster name; B's under B's Lens name. This includes B's 7 Nov remix, made while linked.
- **Entries:** A's and B's marks keep `fid` = A and B; P's You page and challenge lists show none of them. The close-time
  grouping (A and B as one person on 22 Nov) is history and is not recomputed.
- **Balance:** A still has $2.00 minus A's own debits, and B $1.00 minus B's. P can see or spend only C's and D's.
  Every debit row's account is the account whose balance paid.
- **Check results:** A's Neynar pass and B's Lens pass don't make P pass. P passes only on C's or D's own decisions.
- **Bylines:** drawn at render. A, B, C and D each show their own name unless their current person chose another of
  its accounts.
- **Waits:** A on its own gets no free images or remixes until 12 Jan, B none until 10 Jan (A2's "no free counts while
  waiting", unchanged). From those dates on, they get their own counts.
- **Release-window fixture:** a row made before v2 by B's sign-in, recorded under A (signed in as A), stays A's after
  every step and never shows under C or D.

**Planted refusals** (each must be refused with its reason; the test fails if any is accepted):
1. C links on 10 Dec, while B is still linked: refused (A6, a second Lens).
2. B unlinks on 20 Nov: refused (A7, B has an entry in an unpaid challenge).
3. D links on 12 Dec, while A is still linked: refused (A6, a second Farcaster).
4. B joins another person Q (Farcaster E) on 20 Dec: refused (A2, wait until 10 Jan). On 11 Jan: allowed (B's move 2).
5. B leaves Q on 1 Feb and joins person R on 5 Mar (after its wait ends on 3 Mar): refused (A5; it would be B's third
   move since 7 Nov 2026). On 8 Nov 2027, the 7 Nov 2026 move has left the window: allowed.
6. B rejoins P on 20 Dec: not a move and no wait, but refused (A6, C is P's Lens). Variant without C (C never linked):
   B rejoins P on 20 Dec, allowed, and B's moves stay 1.
7. A rejoins P on 20 Dec: refused (A6, D is P's Farcaster).
8. A asks for a free remix on 20 Dec: refused (A2 wait). On 13 Jan: allowed.
9. **Ownership faults** (each makes the test fail): a resolver that draws bylines from a person stamped on the row;
   counting by a row's `person_id`; a debit from A's balance while signed in as D after 13 Dec; C counting A's pass.

## 7. Public person pages

- **One page per person, at the chosen name's address.** Farcaster keeps `/@<fname>` (today's adaptation URLs
  `/@<fname>/<id>` keep working). Bluesky gets `/bsky/<handle>`, Lens `/lens/<name>`, and a wallet `/w/<0x…>`. The
  prefixes avoid collisions (a Farcaster ENS-style name such as `alice.eth` and a Bluesky handle could look alike).
- **Contents:** the chosen name with its icon, the person's published work from every member, newest first (P5g),
  and the other accounts **only if the person ticks them** ("Show on my page"), each with its icon.
- **Unlisted accounts:** their own address answers "not found" rather than redirecting, because a redirect would show
  the link on the page.
- **What isn't secret:** linking is public through the work. Everything made with any member shows under one name,
  and an old URL that contains a Farcaster name still leads to that work. The listing choice decides what the page
  lists, not whether the link can be seen. The texts say exactly that (section 8). They never promise the link is
  hidden.
- Adaptation URLs move with the chosen name: a new name gives new canonical URLs, and the old ones keep working. Open
  question 4.

## 8. Terms and Privacy (DRAFT, before and after)

The "before" lines are the approved linked-accounts lines (`origin/linked-accounts`, Terms 2n41v2, Privacy io2dz) and,
for §6e, the contest's line (`origin/contest`). The "after" lines are written as the shortest true sentences, with no
table names and no numbers that may change.

**Terms §4** (second and third sentences of the linking part).
- Before: "You can link several of them, each by signing in with it; linked accounts are one person here, so free
  daily images and frames, limits and the remix challenge count once for them all, and you pass the site's check if
  any of them does. An account belongs to one person at a time, we don't merge two people's accounts, and an account
  you unlink can be linked to someone else only after 30 days."
- After: "You can link several of them, each by signing in with it; linked accounts are one person here: signing in
  with any of them gives you all of it, free daily images and frames, limits and the remix challenge count once for
  them all (except as section 6e says), and you pass the site's check if any of them does. An account belongs to one
  person at a time; accounts are joined only when you sign in with both, never by us; and an account you unlink can
  be linked to someone else only after 30 days."

**Terms §5** (the byline).
- Before: "Your name is shown with it: your Farcaster name; for a wallet account, its address shortened; for a Lens
  account, its Lens username; for a Bluesky account, its handle. Work made with a wallet that is linked to your
  Farcaster account is shown with your Farcaster name."
- After: "Your name is shown with it: the name you choose from your linked accounts (a Farcaster name, a Lens
  username, a Bluesky handle or a wallet's address shortened), with its network's mark, on work made with any of
  them."

**Terms §6e** (the bonus; a new sentence after "…may remix its characters' sheets;" and its clause).
- Before (contest): "During the challenge, anyone signed in with a Farcaster account or a Bluesky account that passes
  the site's check for it may remix its characters' sheets; making other sheets and styles stays by invitation."
- After: "During the challenge, anyone signed in with an account that passes the site's check, or is linked to one
  that does, may remix its characters' sheets; making other sheets and styles stays by invitation. Each further
  linked account that passes its own check adds free challenge remixes a day, up to the number the challenge page
  shows; it never adds an entry."
- Why no numbers: 3, +1 and 5 are settings the owner may change. The page shows them. Terms binds the rule (own check,
  per linked account, capped, no extra entry). If the owner wants the numbers in Terms, a change to them would then
  need a reread, which is the only reason to put them there.

**Privacy §6** (option A, chosen by the owner on 2026-11-05: v2 records the real account from its release on).
- Before (approved): "If you link accounts, what you made with any of them, before and after linking, is shown under
  one name (your Farcaster name if you linked one; otherwise your Lens username or your Bluesky handle), so anyone can
  see that they are yours; if you unlink one, its work is shown under its own name again."
- After (final draft): "If you link accounts, what you made with any of them, before and after linking, is shown under
  the one name you choose, so anyone can see that they are yours; if you unlink one, its work is shown under its own
  name again, except what it made while linked before you could choose your name, which stays with the account it
  signed in as."
- Why these words:
  - "before you could choose your name" names the release by what it does. The name choice and the recording of the
    real account ship together, so this is exactly the boundary. If the two ever ship apart, a date (that release's
    merge day) becomes truer and replaces it.
  - "the account it signed in as", not "the account it was linked to". A Bluesky account linked to a Lens account that
    is itself linked to a Farcaster ID signed in as the Farcaster ID (one step further, `personForSocial`). In that
    case "linked to" would name the Lens account and be false. "Signed in as" also matches Terms §4's words in the
    sign-in release: "signing in with it is signing in as that account". The same holds for wallets linked since 0026.
- Option B (one acting account per person) was **not chosen** and is removed.
- Also in §6, the bracket "(your Farcaster name; … your Farcaster ID on quote cards)" becomes "(the name you choose,
  with its network's mark; the Farcaster ID on quote cards only if that is the name you chose)". This applies only if
  quote cards follow the choice (open question 5).

**Privacy §4** (the linking record).
- Before (approved): "If you link accounts (each by signing in with it, or, for a wallet, because Farcaster lists its
  address as your account's): which accounts are linked, how and when each was linked or unlinked, and why a link
  ended. Linked accounts are one person here. You can unlink an account on your You page; it can be linked to someone
  else only after 30 days, and until then gets no free images or frames."
- After: the same, plus at the end: "Which of your names you chose to show, and which accounts you chose to list on
  your page. During the remix challenge, the stored check results of all your linked accounts decide your free
  challenge remixes."

**Privacy §7.** Unchanged ("Linking accounts sends nothing new to these services: a current pass of any of your linked
accounts counts." still holds, because the bonus reads stored results only).

## 9. Migration outline (`NEXT_linked_accounts_v2.sql`; not the SQL yet)

Additive and safe with live code. It assumes v1's `NEXT_linked_accounts` is applied (or is folded into the same
release). Nothing reads the new pieces until `LINKED_ACCOUNTS.enabled` is on.
1. `studio.person_profile (person_id pk → people, display_account bigint null, updated_at)`. Null means the default
   rule. The app checks that the account is an active member. A trigger refuses a non-member.
2. `studio.person_listed (person_id, account, listed_at)`, insert and delete by the app only, RLS on, no public read.
   Listing is shown only through the site's own pages.
3. `person_accounts.how` allows `'joined'` (drop the check and add a wider one, a superset, so existing rows pass).
   `studio.person_joins (into_person, from_person, at)` is the audit of joins: insert-only.
4. No column is renamed. No `created_by_fid` is rewritten. v2 code writes the real account into the existing columns.
   v1's unapplied `NEXT_linked_accounts` is edited before it's applied: its `person_id` columns on `image_asks`,
   `remix_asks`, `challenge_eligibility` and `challenge_marks` are removed (the ownership rule). `via`/`via_account`
   on eligibility stay, because they name an account.
5. Read-back: insert and delete a realistic person, profile, listing and join, and check that a non-member display
   account is refused (CLAUDE.md).
6. Release-fix dependency: the sign-in release's same-network refusal must be live before v1's backfill runs, or the
   backfill splits accounts.

## 10. Build order

0. The sign-in release's same-network refusal (release-fix lane).
1. v1 (`linked-accounts`) brought onto main's current state, without its `person_id` row columns. Its acting-number rule replaced by "write the real
   account". Bylines drawn at render.
2. The chosen name, icons, You page choice; defaults set so no byline changes on day one.
3. Joining two persons with history, with the race locks and refusals; `test:linked-accounts` gains planted joins
   (A6 break, A2 wait, A5, a concurrent pair).
4. The bonus and both sets of nudges, with tests: 5 never exceeded; an expired pass, a withdrawn pass or a wallet adds
   nothing; unlink drops it on the next count; a relink inside 30 days to another person adds nothing.
5. Person pages and listing.
6. The legal reread (sections 8 above), consent wording, check:principles, then the switch on, before the challenge
   opens.

## 11. Open questions

1. ~~Privacy §6: option A or B?~~ Answered (owner, 2026-11-05): option A, with the release named by what it does (section 8).
2. **Spending a linked account's balance (the owner's call).** Balances stay per account in every case. The question is
   only whether, while linked, the person may *spend* another linked account's balance as part of the view.
   (a) No: each sign-in spends only its own balance. This is the strictest fit with "per account", and matches
   person-balance's approved "a linked wallet's balance isn't spent while linked". (b) Yes, as a view: the signed-in
   account's balance first, then the others. Each debit is recorded against the account it came from, and spending
   stops at unlink. I lean (a) for the first release. It is simpler to explain and keeps the approved person-balance
   lines unchanged. (b) can follow later with its own Terms §6a line.
3. Should changing the shown name have a cooldown (for example once a day) against confusion? Recommend none for now.
4. Adaptation URLs when the chosen name moves off Farcaster: new canonical URLs with the old ones kept working
   (recommended), or keep `/@fname` URLs forever?
5. Quote cards show the Farcaster ID today: should they follow the chosen name?
6. The bonus counts "beyond the first": should a person whose only passing account is, say, Bluesky, plus a
   non-passing Farcaster account, get 3 (as drafted) or nothing extra? As drafted they get 3, because the bonus needs a
   second passing account.
7. Consent screen: any linked account's consent covering the person (drafted), or once per account?
8. **Combined limits on the day of an unlink (raised by the ownership rule).** If the person's count is over
   "currently linked accounts" only, then linking a throwaway account, using the person's pass to make remixes with
   it, and unlinking it resets the person's count that day. The person's own pass grants the free count, so the
   throwaway needs no pass of its own. A8 (10 link attempts a day) bounds this to about 10× a day, and A5 doesn't
   apply (each throwaway moves once). Proposal, still per account: count the rows of every account that was linked to
   the person at any time during the counting day (from `person_accounts` history), so an unlink never frees a count
   until the next day. This changes no ownership; it only decides which accounts' rows are summed.

## Principles

- **1 (public recipes):** not touched. Recipes still go with each piece. Only the byline's name changes.
- **2 (AI declared; the words are the author's or a signed-in person's):** pass. Work stays credited to a signed-in
  person; the change is only which of their names is shown.
- **3 (model allowlist):** not touched.
- **4 (nothing published without a person's action):** pass. Joining needs the person's own two sign-ins, server
  checked. Nothing is joined or published by us.
- **5 (nothing canon; picks labelled):** pass. No manual merges. Person pages are newest first (P5g). The bonus orders
  nothing.
- **6 (no third-party requests; only totals of ratings and likes):** pass, with a concern. Public like counts must
  count distinct people across linked accounts and stay totals only. The network icons must be served from our own
  files, not hot-linked. Linking is public through bylines, and the texts say so rather than promising it's hidden.
  The release window's work is described honestly (§6, option A as chosen). P6g–P6j don't change (§7 is unchanged).
- **7 (payments never enter scoring or ordering):** pass. Balances aren't pooled. A payment never creates a pass, a
  bonus or an entry.
- **8 (Minpentai and in-world screens):** not touched.
- **New tension:** the challenge bonus is a deliberate exception to "linking never raises caps". It is bounded at 5,
  counted per person, applies to challenge remixes only, needs each account's own current pass, and can't be farmed
  (section 5). The owner set it; recording it as a named exception (for example in P6's or the challenge's notes) is
  the owner's call.
