# Snowmoon: Linked accounts v2 (DRAFT)

**DRAFT. Drafted by a coding agent (Claude, a closed model by Anthropic)** for the coordinator (session snowmoon-9c),
2026-11-05. Branch `designs-2026-11-05`. Design only: nothing is built, no SQL is written, and no legal words change.
Legal lines are drafts for the coordinator and the owner's reread; they never go into `src/lib/legal.ts` from this
branch. One line, Privacy §6, is approved (section 8).

Builds on: the approved v1 rules A1–A8 (`docs/proposals/linked-accounts.md` on `signin-reread-list`), the v1 build
(`origin/linked-accounts`, head 94833eda, off), paying per person (`origin/person-balance`), the contest
(`origin/contest`: one submission a Pacific day) and the sign-in release (`signin-lens-bluesky` in `bluesky-check`;
migration `NEXT_signin_lens_bluesky` applied on production).

## Words (owner, 2026-11-05)

- **Snowmoon account:** the person's account here. It is one or more linked sign-ins with one chosen name.
- **Social account:** a Farcaster, Lens or Bluesky account.
- **Wallet:** an Ethereum wallet sign-in. It is not a social account.

The site's words, Terms, Privacy and About use only these terms, never "person". Internally the design keeps "person
id" (`studio.people`); a person id **is** a Snowmoon account's id.

## The owner's direction (2026-11-05)

1. Nothing depends on Farcaster. Signing in with any linked social account or wallet signs you in to the whole
   Snowmoon account.
2. The Snowmoon account has one chosen name, and every name shows its network's icon (a wallet as its short
   address). Bylines use the chosen name for work made with any linked social account or wallet, before and after
   linking.
3. Two social accounts or wallets that each have history are joined only by the owner of both signing in with both,
   never by us by hand.
4. Public pages are found by the chosen name. Other linked social accounts are listed only if the owner of the
   Snowmoon account chooses.
5. The challenge bonus: during the challenge window only, each extra linked social account that passes its own check
   adds 1 free challenge remix a day, up to 5.
6. **Balances:** a Snowmoon account may spend the balance of any of its linked social accounts or wallets. Each
   balance stays owned by its own social account or wallet and leaves with it if it is unlinked.
7. **Prizes:** a prize is claimed, and its payout address given, only by signing in with the social account that made
   the entry.
8. **Unlinking:** a social account or wallet can always unlink itself. Unlinking another one from the Snowmoon account
   frees it for someone else only after 30 days.
9. **You page:** shows recent link and unlink events.

## The ownership rule (owner's words)

"Work, challenge entries, balances and check results belong to the social account or wallet they were made with; the
Snowmoon account brings them together (one sign-in, one chosen name, combined limits)."

- No row is owned by, moved to or keyed by the Snowmoon account. Its id only groups social accounts and wallets.
- Unlinking takes the social account's or wallet's own work, entries and balance with it, and its byline goes back to
  its own name.
- **The one exception:** in the sign-in release (before v2), a linked Lens, Bluesky or wallet sign-in signs in as the
  Farcaster account. Work made that way is recorded under, and stays with, that social account. The approved Privacy
  §6 covers it ("…except what it made while linked before {date}, which stays with the social account it signed in
  as").

## 1. The model

- **Snowmoon account** = a row in `studio.people` (v1). It is private: never shown, never in a URL or a public record.
  It owns nothing.
- **Social account or wallet** = what signs in, named by today's person number (`src/lib/people.ts`: FID > 0; wallet
  −id; Lens/Bluesky −(10⁹ + id)). Today's numbers stay as they are. No row is renumbered or rewritten.
- **Membership** = `studio.person_accounts` (v1): each social account or wallet is in one Snowmoon account at a time
  (A1), with history. Limits per Snowmoon account: one Farcaster, one Lens, one Bluesky, up to 3 wallets (A6). A6 is
  also what caps the bonus.
- **Today's data.** v1's backfill copies `wallet_links` and `social_links` into memberships and changes neither table.
  The sign-in release's `social_links` carry over unchanged, given the release-fix lane's refusal of a second social
  account of one network per Snowmoon account.
- **Writes record the real sign-in.** v1 wrote one "acting number" (Farcaster first). v2 writes the social account or
  wallet that actually signed in, into the existing columns (`created_by_fid`, `image_asks.fid`, `remix_asks`,
  `challenge_marks.fid` and the rest). No new columns are needed.
- **v1's `person_id` row columns are dropped** before v1 is applied (on `image_asks`, `remix_asks`,
  `challenge_eligibility`, `challenge_marks`). They would stamp rows with a Snowmoon account and break the ownership
  rule after an unlink. Limits are counted from the sign-in columns plus membership history. `via`/`via_account` on
  eligibility stay, because they name a social account.

### Table by table

| Today (keyed by sign-in number) | Owned by | The Snowmoon account's view |
|---|---|---|
| `image_asks`, `remix_asks`, `sheet_remix_asks` | The social account or wallet that asked | Used count = sum over its linked sign-ins' rows (see open question 3 for the day of an unlink); one limit, not a sum of limits. |
| `check_decisions` | The social account (unchanged) | Passes while any linked social account has a current pass. An unlinked one stops counting at once. |
| Wallet balances, person balances (`person-balance`) | The social account or wallet the payment was credited to | It may spend any linked sign-in's balance (section 4). Each debit and credit-back is recorded against the balance it touched. |
| `chat_calls` | The sign-in that asked | Summed over linked sign-ins (`assistant-any-account.md`). |
| `challenge_eligibility`, `challenge_marks` | The social account that published or submitted (`fid`; the IPFS record names it) | One-a-day is counted over linked sign-ins. "Three different" and the equal share group sign-ins by links (section 3). A prize is claimed only by that social account (section 5). |
| `elements`, `recipes`, `remix_frames`, `storyboards`, designs | The sign-in that made it (the Farcaster account for sign-in-release work) | Byline drawn at render: sign-in, then its Snowmoon account now, then the chosen name. Unlinked: its own name. `by_name` is a fallback only. |
| `agents`, agent keys | The sign-in that made them | 3 agents counted over linked sign-ins. They leave with their sign-in. |
| `AGENTS.people`, `ADMINS` | The listed sign-ins | Applies while any listed sign-in is linked. Nothing carries over after an unlink. |
| `likes`, `take_likes`, `ratings`, `picks` | The sign-in | Public totals count each Snowmoon account once. |
| `contributor_consents` | The sign-in that gave it | Covers the Snowmoon account while linked. |
| `mp_*`, `notes`, `suggestions`, `version_posts` | The sign-in | Listed together on the You page. |
| Link events (`person_accounts` history) | — | Recent link and unlink events on the You page (section 6). |

## 2. The chosen name and icons

- `display_account` per Snowmoon account: a linked social account, or a wallet if there is no social account.
- **Default** (also set when v2 ships, so no byline changes on day one): the name shown today (Farcaster, else Lens,
  else Bluesky, else wallet). For a new Snowmoon account: the first sign-in used.
- **Names:** the Farcaster username (latest seen), the Lens username (`lens/name`), the Bluesky handle only if it
  resolves back to its DID (else "a Bluesky account"), or the wallet address shortened.
- **Icons:** every name, everywhere, carries its network's icon, or a wallet glyph beside the short address. Each has
  screen-reader text ("on Bluesky"). Icons are served from our own files, single-colour, and used only to name the
  network.
- Changing the name changes it everywhere at once, past work included (bylines are drawn at render).

## 3. Joining, rule by rule

- **How:** only by signing in with both in one request. Never by a moderator or the owner. The automatic wallet link
  (Farcaster lists the address) stays only for a wallet with no history.
- **Two Snowmoon accounts with history** become one: the older id survives, and the other's sign-ins are re-added
  under it (`how = 'joined'`). No row changes owner. The join is refused if it breaks A6, A2 or A5.
- **Daily counts:** today's counts add up, and the result is one limit. A join only ever leaves less.
- **Free check:** any current pass counts. Joining never triggers a lookup.
- **Balances:** each stays owned by its sign-in. After the join, the Snowmoon account may spend all of them.
- **Challenge entries made before linking** stay with their social accounts. From the join on, they count as one
  Snowmoon account: one submission a day; if both sides already submitted today, both stand. "At least three
  different" and the equal share count each Snowmoon account once. To stop an unlink from splitting one maker into
  two during the challenge, sign-ins that were linked at any time during the entry window count as one at close.
- **Races:** each link, join, unlink and reserve locks each Snowmoon account involved, in ascending id order, and
  checks again inside the transaction. The unique indexes are the backstop. The loser gets the refusal for the state
  it finds.
- **Linking never raises a cap,** except the bounded challenge bonus (section 5). Rotating sign-ins is blocked by A2
  and A5.

## 4. Balances while linked (owner, 2026-11-05)

- A Snowmoon account may spend the balance of any of its linked social accounts or wallets. The order is the
  signed-in one's own balance first, then the others in the order they were linked. Every debit names the balance it
  came from. A credit-back goes to that same balance, even if it has been unlinked since.
- Each balance stays owned by its sign-in. When that sign-in is unlinked, whatever is left goes with it, and the
  Snowmoon account can no longer spend it. Nothing is ever transferred between balances.
- **What changes in person-balance** (`origin/person-balance`):
  - Its design says a linked wallet's own balance "isn't spent while linked", and that a linked Lens/Bluesky
    account's balance "isn't spent while it signs in as the FID". Both become "spendable by the Snowmoon account while
    linked".
  - Its spending code gains the order above and per-balance debits.
  - Its approved Terms §6a and Privacy §4 sentence "A balance stays with the account it was paid to, including when
    that account is linked to another." stays true but is no longer the whole truth. It is redrafted in section 8.
  - Its signed statement ("Credit my payments to the Farcaster account @name (FID n)…") is unchanged: payments are
    still credited to one social account.

## 5. The challenge bonus and prizes

**Bonus.** In the challenge window, for challenge remixes only, the free count a day =
`min(5, 3 + max(0, passing − 1))`. Here `passing` = the linked Farcaster, Lens and Bluesky accounts with a current
stored pass (today's rule, not expired, not withdrawn). Nothing is looked up to grant it, and wallets never count.
With A6, 5 is also the structural ceiling. Outside the window nothing changes. Paid remixes are unchanged, one
submission a day stays, and linking never adds an entry.

**Not farmable:**
- Relinking to the same Snowmoon account gains nothing.
- Joining another Snowmoon account waits 30 days (A2) with no pass meanwhile. The window is about 17 days.
- One social account can't be in two Snowmoon accounts (A1), and in sequence A2, A5 and A4 block it.
- An unlink drops the bonus from the next count.
- A6 blocks two accounts of one network.
- A payment never creates a pass.

**Prizes.** A prize for an entry is claimed, and its payout address given, only by signing in with the social account
that made the entry. Signing in with another sign-in of the same Snowmoon account isn't enough. The claim page shows
which social account to sign in with (by its public name and icon). The address is kept with that social account's
claim.

**Nudges** (DRAFT; each names only networks not yet linked; the examples are for a Lens sign-in):
- Default (You page, sign-in, everyday images).
  - Doesn't pass: "Your Lens account doesn't qualify for free images yet. Link your Farcaster or Bluesky account: if
    either passes, you get them."
  - Passes: "Link your other accounts to sign in with any of them and keep all your work in one place."
- Challenge (/challenge, challenge remixes, its free-limit refusal).
  - Doesn't pass: "To remix for the challenge for free, link a Farcaster or Bluesky account that qualifies."
  - Passes: "Link your other accounts: each one that also qualifies adds a free challenge remix a day, up to 5."

## 6. Unlinking, waits and the You page

**Which wait applies to which action** (A2 = 30 days before joining a *different* Snowmoon account, with no free
counts, passes or bonus meanwhile; A5 = at most 2 moves in 365 days, where a move is joining a different Snowmoon
account than the last; both unchanged):

| Action | Allowed | Then |
|---|---|---|
| **Self-unlink** (signed in with the sign-in being removed) | Always: even with an entry in an unpaid challenge, and even if others are linked | It is its own Snowmoon account at once and takes its own things. A2: it can join a *different* Snowmoon account only after 30 days. Rejoining the one it left is allowed any time and isn't a move. |
| **Unlink another** (signed in with any other linked sign-in) | If it isn't the last sign-in and isn't held by A7 (an entry or eligible version in an unpaid challenge) | Same as self-unlink: freed for someone else only after 30 days (A2). |
| **Link / join** | If A6, A8 (10 attempts a day), A2 (no wait for a *different* Snowmoon account) and A5 allow it | Joining a different Snowmoon account than the last one counts as a move. |

This reads the owner's "unlinking another … frees it only after 30 days" as A2, unchanged, and applies the same wait
to self-unlink. If self-unlink freed a sign-in at once, a passing social account could leave and join a second
Snowmoon account on the same day, and its free counts and bonus would serve both (open question 1).

**You page: recent events.** A list of the last 30 days of links and unlinks for this Snowmoon account, newest first.
Each line has the date, the sign-in's name and icon, what happened, and which sign-in did it. Examples: "7 Nov · Linked
lens/bea (by @alice)"; "11 Dec · lens/bea unlinked itself"; "13 Dec · @alice unlinked (by lens/cara); it can join
another Snowmoon account from 12 Jan". A sign-in that left sees its own events on its own You page. Nothing in the list
is public.

## 6a. Tests (to be built with the feature, in `test:linked-accounts`)

Dates 2026–2027, at noon Pacific. The challenge `remix-2026-11` takes entries 6–22 Nov. A7 is lifted on 10 Dec
(payout, by emptying `frozenChallenges`).

**T1. The A/B/C/D chain** (every step allowed as dated):

| Date | Step | Rules | Result |
|---|---|---|---|
| 6 Nov | Farcaster **A** signs in (Snowmoon account P): Neynar pass, $2.00, a remix submitted as an entry | — | allowed |
| 7 Nov | Lens **B** links to P: own Lens pass, $1.00; signed in as B, a remix submitted (P's entry for 7 Nov) | A6, B's move 1 | allowed |
| 11 Dec | B unlinks itself | self-unlink | allowed; B's wait to 10 Jan |
| 12 Dec | New Lens **C** links to P | A6, C's move 1 | allowed |
| 13 Dec | C unlinks A (another) | A7 lifted; not the last | allowed; A's wait to 12 Jan |
| 14 Dec | New Farcaster **D** links to P | A6, D's move 1 | allowed |

After 14 Dec (P = {C, D}):
- None of A's or B's work, entries, balance, check results or bylines belongs to or shows under P, C or D.
- A shows under its Farcaster name and B under its Lens name, including B's 7 Nov remix made while linked.
- A's and B's balances are unchanged by C and D.
- P passes only on C's or D's own decisions.
- A and B get no free counts until 12 Jan and 10 Jan.
- A release-window fixture (made by B's sign-in before v2, recorded under A) stays A's throughout.
- The You pages of P, A and B list exactly their own events.

**T1 planted refusals:**
1. C links on 10 Dec while B is linked: A6.
2. A unlinks B on 20 Nov: A7 (B's entry).
3. D links on 12 Dec while A is linked: A6.
4. B joins Q (Farcaster E) on 20 Dec: A2. On 11 Jan: allowed (move 2).
5. B leaves Q on 1 Feb and joins R on 5 Mar (wait over on 3 Mar): A5 (a third move since 7 Nov 2026). On 8 Nov 2027:
   allowed.
6. B rejoins P on 20 Dec: not a move, no wait, but A6 (C). Variant without C: allowed, and B's moves stay 1.
7. A rejoins P on 20 Dec: A6 (D).
8. A asks for a free remix on 20 Dec: A2. On 13 Jan: allowed.
9. Ownership faults, each of which must fail the test:
   - bylines drawn from a Snowmoon account stamped on the row;
   - counting by a row's `person_id`;
   - C counting A's pass.

**T2. Spending a linked balance.**
- On 8 Nov, signed in as A with A's balance at $0, a paid remix is debited from B's $1.00, and the debit names B.
- On 9 Nov a paid remix fails. The credit-back goes to B, even though it is processed after B self-unlinks on 9 Nov.
- After B unlinks, signed in as A: a paid remix can't use B's balance (refused for lack of balance, if A's own
  balance is $0). B keeps the rest.
- Planted faults: a debit with no named balance; a transfer between balances; spending B's balance after the unlink.
  Each must fail the test.

**T3. Prize claim.** B's 7 Nov entry wins.
- Claiming signed in as A (same Snowmoon account, 7 Nov–11 Dec): refused, "Sign in with lens/bea to claim".
- Claiming as C or D after 14 Dec: refused.
- Claiming as B: allowed; the payout address is stored with B's claim.
- Planted fault: a claim accepted from any linked sign-in must fail the test.

**T4. Self-unlink always allowed.**
- B unlinks itself on 20 Nov, with an entry in the unpaid challenge: allowed. The entry stays B's.
- At close (22 Nov) A and B still count as one maker for "three different" and the equal share (linked during the
  window).
- B's wait runs to 20 Dec. B joining Q on 19 Dec is refused (A2); on 20 Dec it is allowed.
- Self-unlink of P's last sign-in is a no-op, not an error.

**T5. Unlinking another frees it only after 30 days.**
- A unlinks B on 11 Dec: allowed. B joining Q on 10 Jan before noon is refused (A2); after 10 Jan noon it is allowed.
- Unlinking another sign-in under A7 is refused; the same sign-in may still unlink itself (T4).

**T6. The bonus.**
- On 8 Nov, P with A and B both passing: free challenge remixes = 4.
- The test also covers:
  - a third (Bluesky) passing account gives 5, and nothing gives 6;
  - a wallet adds nothing;
  - an expired or withdrawn pass adds nothing;
  - after B self-unlinks, the next count is 3;
  - outside the window, the count is unchanged by linking.

## 7. Public pages

- **One page per Snowmoon account, at the chosen name's address:** `/@<fname>` (Farcaster; today's adaptation URLs
  keep working), `/bsky/<handle>`, `/lens/<name>`, `/w/<0x…>`.
- **Contents:** the chosen name with its icon, published work from every linked sign-in (newest first, P5g), and
  other social accounts only if ticked ("Show on my page").
- An unlisted sign-in's own address answers "not found" (a redirect would reveal the link).
- Linking is still public through the work. The texts say so and never promise the link is hidden.

## 8. Terms and Privacy (before and after)

"Before" lines are the approved linked-accounts and person-balance lines on `origin/linked-accounts` (Terms 2n41v2,
Privacy io2dz) and, for §6e, `origin/contest`. "After" lines are DRAFT unless marked approved: shortest true
sentences, no implementation details, no numbers that may change (except the 30 days, already in the approved text).

**Privacy §6: APPROVED** (reviewed by the coordinator, approved by the owner, 2026-11-05), in exactly these words:
"If you link social accounts or wallets to your Snowmoon account, what you made with any of them, before and after
linking, is shown under the one name you choose, so anyone can see that they are yours; if you unlink one, its work
is shown under its own name again, except what it made while linked before {date}, which stays with the social account
it signed in as." `{date}` = the day the v2 release goes live, filled in at merge.
- Before (approved earlier, replaced): "If you link accounts, what you made with any of them, before and after
  linking, is shown under one name (your Farcaster name if you linked one; otherwise your Lens username or your
  Bluesky handle), so anyone can see that they are yours; if you unlink one, its work is shown under its own name
  again."
- The same section's bracket "(your Farcaster name; for a wallet account, its address shortened; for a Lens account,
  its Lens username; for a Bluesky account, its handle; your Farcaster ID on quote cards)" becomes "(the name you
  choose for your Snowmoon account, with its network's mark; a Farcaster ID on quote cards)".

**Terms §4** (the account sentences).
- Before: "Your account here is a Farcaster account, a wallet address, a Lens account or a Bluesky account. You can
  link several of them, each by signing in with it; linked accounts are one person here, so free daily images and
  frames, limits and the remix challenge count once for them all, and you pass the site's check if any of them does.
  An account belongs to one person at a time, we don't merge two people's accounts, and an account you unlink can be
  linked to someone else only after 30 days."
- After: "You sign in with a social account (Farcaster, Lens or Bluesky) or a wallet. Your Snowmoon account is the
  social accounts and wallets you link to it, each by signing in with it; signing in with any of them signs you in to
  it. What you make, your challenge entries, balances and check results belong to the social account or wallet you
  made them with; your Snowmoon account brings them together under one name, free daily images and frames, limits and
  the remix challenge count once for it (except as section 6e says), and it passes the site's check if any of its
  social accounts does. A social account or wallet is in one Snowmoon account at a time, and two are joined only when
  you sign in with both, never by us. A social account or wallet can always unlink itself; once unlinked, it can join
  another Snowmoon account only after 30 days."
- The rest of §4 ("Free daily images and frames come with a Farcaster account, with a Lens account whose Lens score
  is…") changes "account" only where it means a sign-in, which it already does. One edit: "You can prepay for
  generations with any of these accounts (section 6a)" becomes "…with any social account or wallet (section 6a)".

**Terms §5** (the byline).
- Before: "Your name is shown with it: your Farcaster name; for a wallet account, its address shortened; for a Lens
  account, its Lens username; for a Bluesky account, its handle. Work made with a wallet that is linked to your
  Farcaster account is shown with your Farcaster name."
- After: "Your name is shown with it: the name you choose for your Snowmoon account (a Farcaster name, a Lens username,
  a Bluesky handle or a wallet's address shortened), with its network's mark, on work made with any of its social
  accounts or wallets."

**Terms §6a** (balances).
- Before: "A balance stays with the account it was paid to, including when that account is linked to another."
- After: "A balance belongs to the social account or wallet it was paid to; while that one is linked, your Snowmoon
  account can spend it, and if it is unlinked, its balance goes with it."

**Terms §6e** (the challenge).
- Before (contest): "During the challenge, anyone signed in with a Farcaster account or a Bluesky account that passes
  the site's check for it may remix its characters' sheets; making other sheets and styles stays by invitation."
- After: "During the challenge, anyone whose Snowmoon account passes the site's check may remix its characters'
  sheets; making other sheets and styles stays by invitation. Each further linked social account that passes its own
  check adds free challenge remixes a day, up to the number the challenge page shows; it never adds an entry."
- Before (contest): "Each person can submit one entry a day (Pacific time), for any character, and can withdraw any
  of them until entries close; a withdrawn entry still uses its day. A character needs entries from at least three
  different people to get a final version; several entries by one person count once."
- After: "Each Snowmoon account can submit one entry a day (Pacific time), for any character, and can withdraw any of
  them until entries close; a withdrawn entry still uses its day. A character needs entries from at least three
  different Snowmoon accounts to get a final version; several entries from one count once, as do entries from social
  accounts that were linked together at any time while entries were open."
- New sentence (prizes): "A prize for an entry is claimed, and its payout address given, only by signing in with the
  social account that made the entry."
- In the IPFS record sentence: "its maker's Farcaster ID (or, for a Bluesky account, its DID)" becomes "the public id
  of the social account it was made with (a Farcaster ID, a Lens address or a Bluesky DID)".

**Privacy §4** (the linking record).
- Before: "If you link accounts (each by signing in with it, or, for a wallet, because Farcaster lists its address as
  your account's): which accounts are linked, how and when each was linked or unlinked, and why a link ended. Linked
  accounts are one person here. You can unlink an account on your You page; it can be linked to someone else only
  after 30 days, and until then gets no free images or frames."
- After: "If you link social accounts or wallets to your Snowmoon account (each by signing in with it, or, for a
  wallet, because Farcaster lists its address as your account's): which are linked, how and when each was linked or
  unlinked and by which of them, why a link ended, the name you chose to show, and which you chose to list on your
  page. Your You page shows recent links and unlinks. A social account or wallet can always unlink itself; once
  unlinked, it can join another Snowmoon account only after 30 days, and until then gets no free images or frames.
  During the remix challenge, the stored check results of your linked social accounts decide your free challenge
  remixes."
- Prepaid paragraph. Before: "A balance stays with the account it was paid to, including when that account is linked
  to another." After: "A balance belongs to the social account or wallet it was paid to; while that one is linked,
  your Snowmoon account can spend it."
- Challenge paragraph: "whether one of your linked accounts passed the site's check, and which one" becomes "whether
  one of your linked social accounts passed the site's check, and which one". New: "If you claim a prize: the payout
  address you give, kept with the social account that made the entry."

**Privacy §7.** Unchanged in substance. "a current pass of any of your linked accounts counts" becomes "…of any of your
linked social accounts counts".

**About** ("Signing in", before on `bluesky-check`): "Reading needs no account. Saving cards and liking need a
Farcaster sign-in, and the assistant a Farcaster account or one linked to it. Making images needs a sign-in." After:
"Reading needs no account. To make images or ask the assistant, sign in with a social account (Farcaster, Lens or
Bluesky) or a wallet; link more of them to your Snowmoon account to sign in with any of them." (Saving cards and
liking: if they stay Farcaster-only, add "Saving cards and liking need a Farcaster account in your Snowmoon
account.")

**Site words** (DRAFT):
- You page heading: "Your Snowmoon account". The list heading is "Signs in with", followed by each social account or
  wallet with its icon.
- Buttons: "Link a social account or wallet", "Unlink", "Unlink this one" (on the signed-in sign-in), "Show on my page".
- Refusals:
  - A6: "Your Snowmoon account already has a Lens account. Unlink it first."
  - A2: "lens/bea was unlinked on 11 Dec. It can join another Snowmoon account from 10 Jan."
  - A5: "This account has moved between Snowmoon accounts twice this year. It can move again from 8 Nov 2027."
  - A7, unlinking another: "lens/bea has a challenge entry. It can unlink itself now, or you can unlink it after the
    payout."
  - Prize: "Sign in with lens/bea to claim this prize: the entry was made with it."
- Balance panel: "Balances you can spend", listing each balance with its owner's name and icon.

## 9. Migration outline (`NEXT_linked_accounts_v2.sql`; not the SQL yet)

Additive and safe with live code; nothing reads it until `LINKED_ACCOUNTS.enabled` is on. It assumes v1's
`NEXT_linked_accounts`, edited first to remove its four `person_id` row columns.
1. `studio.person_profile (person_id pk, display_account, updated_at)`. A trigger refuses a non-member.
2. `studio.person_listed (person_id, account, listed_at)`. RLS on, no public read.
3. `person_accounts`: `how` gains `'joined'` (a superset check); `ended_by` gains `'self'` and `'other'` (who
   unlinked), plus `ended_via` (the sign-in that did it) for the You page events.
4. `studio.person_joins (into_person, from_person, at)`, insert-only.
5. Person balance: each debit and credit-back row names its balance's owner (already true per balance table), plus
   `spent_by` (the sign-in that spent it).
6. Prize claims: `(challenge, entry, account, payout_address, at)`, insert-only, with a check that `account` is the
   entry's `fid`. It may land with the payout work instead.
7. Read-back: a realistic insert and delete of each, with the planted refusals.

## 10. Build order

0. The release fix (same-network refusal).
1. v1 on main's current state, without `person_id` row columns, writing the real sign-in, bylines at render.
2. The chosen name, icons, You page with events.
3. Joining with history, races, the waits table.
4. Spending linked balances (person-balance changes).
5. The bonus and nudges.
6. Prize claim by the entry's social account (with the payout work).
7. Public pages.
8. The reread of section 8, check:principles, the switch.

## 11. Open questions

1. **Self-unlink and the 30 days.** As drafted, self-unlink waits 30 days before joining a different Snowmoon account,
   like unlinking another. The owner's wording names the wait only for unlinking another. If self-unlink should free
   at once, a passing social account could serve two Snowmoon accounts' free counts and bonus in one day. I recommend
   keeping the wait for both.
2. **Self-unlink during the challenge.** "Always" overrides the A7 freeze for self-unlink only. Entries stay with
   their social account, and "linked at any time while entries were open counts as one" stops a split from adding a
   maker. Confirm.
3. **Same-day counts after an unlink.** Counting only sign-ins linked now lets a throwaway sign-in, using the
   Snowmoon account's pass, reset the day's count when unlinked (up to A8's 10 a day). Proposal: count the rows of
   every sign-in linked at any time that counting day.
4. Adaptation URLs when the chosen name moves off Farcaster: new canonical URLs, old ones kept (recommended)?
5. Quote cards: keep a Farcaster ID, or follow the chosen name?
6. The bonus counts "beyond the first" passing social account: confirm that one passing plus one non-passing gives 3.
7. Saving cards and liking: open to any sign-in in v2, or Farcaster-only (decides the About line)?

## Principles

- **1 (public recipes):** not touched.
- **2 (AI declared; words human):** pass. Work stays credited to the sign-in that made it.
- **3 (model allowlist):** not touched.
- **4 (nothing published without a person's action):** pass. Joins need both sign-ins. Prizes need the entry's own
  sign-in.
- **5 (nothing canon):** pass. No manual merges. Pages and events are newest first. The bonus orders nothing.
- **6 (no third-party requests; totals only; texts describe today):** pass, with concerns. Like totals must count each
  Snowmoon account once. Icons must be our own files. Linking is described as public through the work. Privacy §6 is
  approved, and the other lines are drafts.
- **7 (payments never enter scoring or ordering):** pass. Spending a linked balance moves no money between owners.
  Paying never creates a pass, a bonus or an entry. Prize claims are tied to the entry, not to payment.
- **8 (Minpentai):** not touched.
- **Tensions:**
  - The bonus is a deliberate, bounded exception to "linking never raises caps".
  - "Self-unlink always" overrides the challenge freeze. It is mitigated by window-wide grouping (open question 2).
