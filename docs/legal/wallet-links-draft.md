# Wallet ↔ Farcaster links: Privacy and Terms wording (REREAD by the owner, 2026-10-22)

Branch `wallet-farcaster-link`, 2026-10-22. Drafted by the coding agent. **Reread by the owner on 2026-10-22**, on PR
#34: "reread for Privacy sections 1–4 and both Terms sentences, with one change: a linked wallet is looked up again at
most once a day, and an automatic ('verified') link ends if that FID no longer verifies the address. A link I made by
tapping isn't affected. Section 7's last sentence becomes: 'A linked wallet is looked up again at most once a day, and
its link ends if that account no longer verifies it; a wallet you unlinked isn't looked up again.'"

The reread words are now in `src/lib/legal.ts` on the branch (Privacy sections 4, 6 and 7; Terms sections 4 and 5),
with `LEGAL.ownerReread` set for both pages (terms `tvt9ga`, privacy `hqt7ov`, 2026-10-22) and `LEGAL.effective`
2026-10-22. They go live in the one merge deploy, with migration 0026 applied first and `WALLET_LINKS.lookUp` on.
If the merge is on a later day, `LEGAL.effective` should become that day. The sections below are kept as the record
of what was reread; section 1 shows the owner's sentence.

Owner, 2026-10-22: "We should make this a regular feature. After you are signed in with a wallet you can have an
offer to sign in with Farcaster to associate the account with this wallet. If we can't just use neynar to find out
if the wallet is already associated." Then, the approved spec: (1) wallets verified on Farcaster (Neynar shows the
address under a FID) link automatically; (2) an unverified wallet links only when the person taps "link", with a
line next to the button saying the wallet's past work will appear under their Farcaster name; (3) draft a Privacy
line on sending the wallet address to Neynar, to go in legal.ts after your reread.

## What the branch changes

| What | New data, or new place it goes | Switch | State in the PR |
|---|---|---|---|
| Automatic link ('verified'): a wallet's address is sent to Neynar (user by verified address) on a signed-in request; if exactly one Farcaster account verified it, the wallet is linked to it. The answer is kept a day, so a wallet is looked up at most once a day. A verified link ends ('unverified') if its FID no longer verifies the address; a tapped link isn't affected; a wallet the person unlinked isn't looked up again; a wallet whose verified link ended automatically can be linked again if a FID verifies it later. | **New: the address goes to Neynar.** New kept rows: the link (and how it ended), and the lookup's answer (account, FIDs found, when). | `WALLET_LINKS.lookUp` | **On**, after the owner's reread (ships in the merge deploy). |
| Link by tapping ('signed'): signed in with the wallet and with Farcaster in the same session, the person sees who it will link to and taps "Link them". | No outside service. New kept row: the link. | `WALLET_LINKS.offer` | On (answers "not available yet" until the migration is applied). |
| A linked wallet's earlier work shows under the Farcaster name (bylines of images, Remix frames and storyboards, the profile page, the You page). Records are not rewritten; unlinking shows the work as the wallet's again. | Public: for a 'signed' link, the wallet and the Farcaster account are now visibly the same person. (For a 'verified' one, Farcaster already shows it.) | `WALLET_LINKS.creditEarlierWork` | On (section 3, reread). |
| Unlink, on the You page. | Kept: when it was unlinked. | (always, with the table) | On. |

The two wallets in `LINKED_WALLETS` (@luisotravez, @garance) are seeded as 'verified' links by the migration, and
until the migration is applied the code keeps reading `LINKED_WALLETS`. Because `creditEarlierWork` is on, their
earlier wallet work shows under their Farcaster names from the deploy that ships this branch.

## 1. Privacy, section 7 (Outside services): the Neynar item — replace

**Today:**
> Neynar receives your Farcaster ID when you first make an image on a given day, to look up its account score, which
> decides whether you can make images. We keep the score for a day.

**Proposed:**
> Neynar receives your Farcaster ID when you first make an image on a given day, to look up its account score, which
> decides whether you can make images. We keep the score for a day. When you sign in with a wallet, Neynar also
> receives the wallet's address, to find the Farcaster account that has verified it; if exactly one has, your wallet
> is linked to that account (section 4). We keep the answer for a day. A linked wallet is looked up again at most
> once a day, and its link ends if that account no longer verifies it; a wallet you unlinked isn't looked up again.

(The last sentence is the owner's, 2026-10-22; it replaced the draft's "A wallet that is already linked, or that you
unlinked, isn't looked up again.")

Where: `src/lib/legal.ts`, Privacy, `n: 7`, the Neynar item. In, with `WALLET_LINKS.lookUp = true`.

## 2. Privacy, section 4 (Kept by us when you sign in): one new item in the list

**Proposed (new item, after "That you agreed to the terms for publishing…"):**
> If your wallet is linked to your Farcaster account (because that account verified the wallet's address on
> Farcaster, or because you linked them while signed in with both): which wallet is linked to which account, how,
> when it was linked or unlinked, and why a link ended. While linked, signing in with the wallet is signing in as that account. You
> can unlink it on your You page.

And, at the end of the same section's wallet paragraph (line 97 on origin/main), one sentence:
> A wallet's balance stays with the wallet when it is linked to a Farcaster account.

Where: `src/lib/legal.ts`, Privacy, `n: 4`. Describes `studio.wallet_links` (and, with line 1,
`studio.wallet_fid_lookups`), from the day the migration is applied.

## 3. Privacy, section 6 (What you publish): one addition

**Today (start):**
> Anything you publish, and every frame you make in Remix, is public, shown with your name (your Farcaster name, or,
> for a wallet account, its address shortened; your Farcaster ID on quote cards), …

**Proposed:**
> Anything you publish, and every frame you make in Remix, is public, shown with your name (your Farcaster name, or,
> for a wallet account, its address shortened; your Farcaster ID on quote cards). If you link a wallet to your
> Farcaster account, what you made with the wallet, before and after linking, is shown under your Farcaster name,
> so anyone can see that the two are yours; if you unlink it, that work is shown with the wallet's address again. …

As put in `legal.ts`: the existing first sentence is kept whole (it goes on "…, the date, and the record of how it was
made."), and the two reread sentences follow it, before "See the Terms, sections 5 and 7." The words are the reread
ones; only the place they join the paragraph differs from the sketch above.

Where: `src/lib/legal.ts`, Privacy, `n: 6` (line 102 on origin/main).

## 4. Terms, sections 4 and 5: one sentence each

**Section 4 (Who can use it), after "Your account here is a Farcaster account or a wallet address.":**
> You can link a wallet to your Farcaster account; while it is linked, signing in with the wallet is signing in as
> that account.

**Section 5 (What you add), after "Your name is shown with it: your Farcaster name, or, for a wallet account, its
address shortened.":**
> Work made with a wallet that is linked to your Farcaster account is shown with your Farcaster name.

Where: `src/lib/legal.ts`, Terms, `n: 4` and `n: 5` (lines 60–61 on origin/main).

## 5. No change needed (checked)

- About and the consent screen (P6h, P6j): Neynar is already named on both; the consent screen names what is sent at
  Generate, which this doesn't change.

## 6. Still DRAFT: the site's own words (not covered by sections 1–4)

The owner's reread covered the legal texts above. These are interface words, not in sections 1–4, so they keep their
DRAFT marks for a separate reread:

- `src/components/you-page.tsx`, `W`: linkTitle "Link this wallet to Farcaster"; linkOffer "Have a Farcaster account?
  Link this wallet to it, and signing in with this wallet signs you in as that account."; linkSignIn "Sign in with
  Farcaster to link this wallet"; linkConfirm "Link 0x… to @name (FID n)?"; linkWhat "From now on, signing in with this
  wallet signs you in as this Farcaster account."; linkPast "What you made with this wallet before will appear under
  @name, here and on its public pages. Its balance stays with the wallet. You can unlink it here at any time."; linkYes
  "Link them"; linkNo "Not now"; linked "0x… is linked to @name: signing in with it signs you in as @name."; linkedHow
  (verified / signed / config); linkedEarlier; linkedBalance; unlink, unlinkConfirm, unlinkYes, unlinkNo, unlinkAsk;
  viaWallet.
- `src/lib/images/wording.ts`, `prepaid.linkHint`: "Have a Farcaster account? Link this wallet to it on your You page."
- Not yet said anywhere on the You page: that a verified link ends by itself if the account stops verifying the
  address. Privacy section 7 says it; a line on the You page could too.

## 7. Open for the owner

- Privacy section 10 says "A change to what is collected or where it is sent will also be announced on the Service."
  Sending the wallet address to Neynar is such a change. The branch has no announcement; say where you want one, or
  that the dated pages are enough.
- Done (owner, 2026-10-22, "Yes, add 'and why a link ended' to section 4"): section 4 now ends "…how, when it was
  linked or unlinked, and why a link ended." (the table's ended_by: 'person' or 'unverified').
- Done (owner, 2026-10-22, "Yes to the 30-day note"): the announcement for section 10 is a note in the wallet panel
  and on the You page, in the owner's words: "New: if your wallet is verified on Farcaster, it now links to that
  account automatically. Privacy §7." Shown to everyone until `WALLET_LINKS.announceUntil` (2026-11-21, or the merge
  day + 30 if later; set at merge), then gone with no further deploy (src/lib/wallet/announce.ts).

## Before it goes live

1. Migration `0026_wallet_links.sql` is applied (dry run first). Paste files and a read-back are in iCloud
   `snowmoon-takes/overnight-2026-10-21/migrations/0026_wallet_links*.sql` and `READ-BACK-0026.sql`.
2. You say "applied".
3. Merge: `legal.ts` (reread words, `ownerReread` set, effective date), `WALLET_LINKS.lookUp = true` and the code ship
   in one deploy. If that is after 2026-10-22, `LEGAL.effective` becomes the merge day.
