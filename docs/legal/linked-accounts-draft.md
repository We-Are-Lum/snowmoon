# Linked accounts: Terms and Privacy lines (DRAFT, for the coordinator)

Drafted by a coding agent (Claude, a closed model made by Anthropic) on the owner's overnight run of 2026-11-05,
Lane B, item 7. Branch `linked-accounts`. **DRAFT: nothing here is in `src/lib/legal.ts`**, and nothing should be
until the release that turns `LINKED_ACCOUNTS.enabled` on (legal texts describe today). For the coordinator's review,
then the owner's reread.

**Before** is `origin/main` as it is now (5559f56e, Privacy words bv4cvf after #116). The sign-in release
(`signin-lens-bluesky`, own-words-v5) changes several of the same sentences first; if it merges before this, each
"before" becomes its words and each "after" below stays as it is. Each "after" is the shortest true sentence for what
the branch builds (owner, 2026-11-04): no internal labels and no thresholds that may change (the 2-moves-in-365-days
limit, the 3 wallets and the 10 attempts a day are shown on the page, not in the texts). The 30-day wait stays: it is
already in the owner's approved sign-in wording (3a).

The proposal's longer drafts (`docs/proposals/linked-accounts.md` section 10) are replaced by these, except the
widened record line, which is kept word for word as drafted and approved for drafting (owner, 2026-11-04).

## Terms

### §4 Who can use it

Before:
> Your account here is a Farcaster account or a wallet address. You can link a wallet to your Farcaster account; while it is linked, signing in with the wallet is signing in as that account. Other ways to sign in may come later; these Terms will list each one when it does.

After:
> Your account here is a Farcaster account, a wallet address, a Lens account or a Bluesky account. You can link several of them, each by signing in with it; linked accounts are one person here, so free daily images and frames, limits and the remix challenge count once for them all, and you pass the site's check if any of them does. An account belongs to one person at a time, we don't merge two people's accounts, and an account you unlink can be linked to someone else only after 30 days.

### §6 What you must not do

Before:
> …don't try to get around sign-in, daily limits or spending caps; don't interfere with the Service.

After:
> …don't try to get around sign-in, daily limits, spending caps or the challenge's rules, including by moving accounts between people; don't interfere with the Service.

### §6e The remix challenge, who may remix

Before:
> During the challenge, anyone signed in with a Farcaster account that passes the site's check may remix its characters' sheets;

After:
> During the challenge, anyone signed in with an account that passes the site's check, or is linked to one that does, may remix its characters' sheets;

### §6e The record

Before:
> …a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID, when it was published and what it was built on;…

After:
> …a fingerprint of its pictures and recipe (not the pictures or words themselves), the public id of the account its maker published it with (a Farcaster ID, a Lens address or a Bluesky DID), when it was published and what it was built on;…

(The contest branch's approved §6e sentence, "Each person can submit one entry a day (Pacific time), …", already says
"person"; with linking on, a person is all their linked accounts together. No change to it.)

## Privacy

### §4, the link item (replaces the wallet-link item)

Before:
> If your wallet is linked to your Farcaster account (because Farcaster lists the wallet's address as that account's, as its custody address or as an address it verified, or because you linked them while signed in with both): which wallet is linked to which account, how, when it was linked or unlinked, and why a link ended. While linked, signing in with the wallet is signing in as that account. You can unlink it on your You page.

After:
> If you link accounts (each by signing in with it, or, for a wallet, because Farcaster lists its address as your account's): which accounts are linked, how and when each was linked or unlinked, and why a link ended. Linked accounts are one person here. You can unlink an account on your You page; it can be linked to someone else only after 30 days, and until then gets no free images or frames.

### §4, the daily-count item (adds link attempts, which the branch counts)

Before:
> How many images and Remix frames you make each day, to count the daily limits, and the reports you make.

After:
> How many images and Remix frames you make each day, and how many times you try to link an account, to count the daily limits, and the reports you make.

### §4, the challenge item, one phrase

Before:
> …(you were invited, you are an admin, or whether your account passed the site's check)…

After:
> …(you were invited, you are an admin, or whether one of your linked accounts passed the site's check, and which one)…

### §4, the challenge record item, widened (as already drafted, word for word)

Before:
> When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID, when it was published and what it was built on. Hiding a version later removes it from this site, but not its fingerprint from that record.

After:
> When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), the public id of the account its maker published it with (a Farcaster ID, a Lens account's address or a Bluesky account's identifier, its DID), when it was published and what it was built on. It doesn't say which accounts are linked to each other. Hiding a version later removes it from this site, but not its fingerprint from that record.

### §6 What you publish, the wallet sentence

Before:
> If you link a wallet to your Farcaster account, what you made with the wallet, before and after linking, is shown under your Farcaster name, so anyone can see that the two are yours; if you unlink it, that work is shown with the wallet's address again.

After:
> If you link accounts, what you make while they are linked is shown under one name (your Farcaster name if you linked one; otherwise your Lens username or your Bluesky handle), so anyone can see that they are yours.

**Not yet true; for the coordinator:** the branch writes new work under the person's first account (Farcaster, else
Lens, else Bluesky), so "what you make while they are linked" is true. Today's wallet byline (`src/lib/wallet/credit.ts`)
also shows a linked wallet's *earlier* work under the Farcaster name, from `wallet_links`, which the branch no longer
writes. Before the switch goes on, either that byline is moved to `person_accounts` (then the sentence can keep
"before and after linking" and "if you unlink one, its earlier work is shown under its own name again"), or it is
left as is and the sentence above is the true one. Open item for the owner.

### §7 Outside services, one sentence after the Neynar and Lens items

After (new):
> Linking accounts sends nothing new to these services: a current pass of any of your linked accounts counts.

(True of the branch: a pass is read from what is already kept, never looked up for the other accounts.)

## No change

- The refusal's next step ("Link another account", or prepay; never prepay on Submit) adds no data and sends nothing
  (proposal 12.5); its words are approved (reread pack item 10).
- Terms §6a's approved sentence "A balance stays with the account it was paid to, including when that account is
  linked to another" (person-balance) is already true with linking on: balances stay per account.
- Consent screen: unchanged.
