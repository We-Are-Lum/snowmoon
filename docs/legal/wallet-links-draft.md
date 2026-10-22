# Wallet ↔ Farcaster links: Privacy and Terms wording (DRAFT, for the owner's reread)

Branch `wallet-farcaster-link`, 2026-10-22. Drafted by the coding agent. **Not in `src/lib/legal.ts`**: legal texts
describe what the site does on the day they go live, so these go in only with your reread, in the same deploy that
turns on what they describe (then `LEGAL.ownerReread.privacy` / `.terms` are set again on your word, with a new
effective date).

Owner, 2026-10-22: "We should make this a regular feature. After you are signed in with a wallet you can have an
offer to sign in with Farcaster to associate the account with this wallet. If we can't just use neynar to find out
if the wallet is already associated." Then, the approved spec: (1) wallets verified on Farcaster (Neynar shows the
address under a FID) link automatically; (2) an unverified wallet links only when the person taps "link", with a
line next to the button saying the wallet's past work will appear under their Farcaster name; (3) draft a Privacy
line on sending the wallet address to Neynar, to go in legal.ts after your reread.

## What the branch changes

| What | New data, or new place it goes | Switch | State in the PR |
|---|---|---|---|
| Automatic link ('verified'): a wallet's address is sent to Neynar (user by verified address) on its first signed-in request; if exactly one Farcaster account verified it, the wallet is linked to it. The answer is kept a day. | **New: the address goes to Neynar.** New kept rows: the link, and the lookup's answer (account, FIDs found, when). | `WALLET_LINKS.lookUp` | **Off**, until you reread line 1 below. |
| Link by tapping ('signed'): signed in with the wallet and with Farcaster in the same session, the person sees who it will link to and taps "Link them". | No outside service. New kept row: the link. | `WALLET_LINKS.offer` | On (answers "not available yet" until the migration is applied). |
| A linked wallet's earlier work shows under the Farcaster name (bylines of images, Remix frames and storyboards, the profile page, the You page). Records are not rewritten; unlinking shows the work as the wallet's again. | Public: for a 'signed' link, the wallet and the Farcaster account are now visibly the same person. (For a 'verified' one, Farcaster already shows it.) | `WALLET_LINKS.creditEarlierWork` | On, per the approved spec. **Your call**: see "Before it goes live". |
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
> is linked to that account (section 4). We keep the answer for a day. A wallet that is already linked, or that you
> unlinked, isn't looked up again.

Where: `src/lib/legal.ts`, Privacy, `n: 7`, the Neynar item (line 114 on origin/main). Goes in with
`WALLET_LINKS.lookUp = true`.

## 2. Privacy, section 4 (Kept by us when you sign in): one new item in the list

**Proposed (new item, after "That you agreed to the terms for publishing…"):**
> If your wallet is linked to your Farcaster account (because that account verified the wallet's address on
> Farcaster, or because you linked them while signed in with both): which wallet is linked to which account, how,
> and when it was linked or unlinked. While linked, signing in with the wallet is signing in as that account. You
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
- The words on the You page and the wallet panel ("Link this wallet to Farcaster", "What you made with this wallet
  before will appear under @name…") are in `src/components/you-page.tsx` (W) and `src/lib/images/wording.ts`
  (`prepaid.linkHint`), marked DRAFT, for your reread with the rest.

## Before it goes live

1. Migration `NEXT_wallet_links.sql` is applied (numbered at merge; dry run first). Paste files and a read-back:
   iCloud `snowmoon-takes/overnight-2026-10-21/migrations/NEXT_wallet_links*.sql`.
2. You say "reread" for sections 2, 3 and 4 (they describe the offer and the crediting, which are on), and for
   section 1 when you want the automatic link.
3. In the deploy after your reread: `legal.ts` updated, `ownerReread` set on your word, new effective date; and,
   for the automatic link, `WALLET_LINKS.lookUp = true` in the same deploy.

If you'd rather not ship the crediting before your reread, set `WALLET_LINKS.creditEarlierWork = false` for the
merge: the offer still works, earlier work stays the wallet's until it is turned on.
