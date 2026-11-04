# Wallet ↔ Farcaster link by custody address: Privacy wording (DRAFT, waiting for the owner's reread)

Branch `wallet-fid-link`, 2026-11-04. Drafted by the coding agent (Claude, a model made by Anthropic). **DRAFT: not
reread by the owner.** The words below are already in `src/lib/legal.ts` on this branch. `LEGAL.ownerReread.privacy`
is unchanged, so `check:principles` P6k fails on this branch until the owner says "reread". That failure is deliberate.
The new Privacy key is `1wgu7z`; the reread words were `1frr16h`.

Owner, 2026-11-04: "Fix it so a wallet that is verified by, or is the custody address of, exactly one Farcaster
account gets linked. Draft any Privacy wording change."

## What changes, and what doesn't

| | Before | After |
|---|---|---|
| What Neynar receives | The wallet's address (`address_types=verified_address`) | The same address, nothing more (`address_types=custody_address,verified_address`) |
| What Neynar's answer is used for | Accounts that **verified** the address | Accounts whose **custody address** it is, or that verified it |
| What we keep | The link (`studio.wallet_links`) and the lookup's answer for a day (`studio.wallet_fid_lookups`) | The same rows, and no new columns. A custody link is kept as `'verified'`, which now means "Farcaster lists this address as the account's". |
| When it's asked | On a wallet's signed-in request (getPerson) | The same, plus the wallet panel's balance request and the You page when a wallet sits beside a Farcaster sign-in. Still at most once a day per wallet (the answer is kept a day). |

No new outside service, nothing new sent and no new kind of data kept. The only change to the text is what Neynar's
answer means: "has verified it" becomes "whose custody address it is or that has verified it".

## Privacy §4 (one item)

Before:

> If your wallet is linked to your Farcaster account (because that account verified the wallet's address on Farcaster,
> or because you linked them while signed in with both): …

After:

> If your wallet is linked to your Farcaster account (because Farcaster lists the wallet's address as that account's,
> as its custody address or as an address it verified, or because you linked them while signed in with both): …

(The rest of the item is unchanged.)

## Privacy §7 (the Neynar item, its wallet sentences)

Before:

> When you sign in with a wallet, Neynar also receives the wallet's address, to find the Farcaster account that has
> verified it; if exactly one has, your wallet is linked to that account (section 4). We keep the answer for a day. A
> linked wallet is looked up again at most once a day, and its link ends if that account no longer verifies it; a
> wallet you unlinked isn't looked up again.

After:

> When you sign in with a wallet, Neynar also receives the wallet's address, to find the Farcaster account whose
> custody address it is or that has verified it; if exactly one account has it, your wallet is linked to that account
> (section 4). We keep the answer for a day. A linked wallet is looked up again at most once a day, and its link ends if
> that account no longer has it; a wallet you unlinked isn't looked up again.

The last sentence was the owner's own (2026-10-22). It changes from "no longer verifies it" to "no longer has it",
because a link made from a custody address would otherwise end on its next check. Please confirm that word.

## Not changed

- **Terms §4 and §5.** They say a wallet can be linked, not how.
- **The 30-day note** (`LINK_NOTE`, the owner's words, shown until 2026-11-21): "New: if your wallet is verified on
  Farcaster, it now links to that account automatically." It is still true: a verified wallet still links. It just
  doesn't mention custody addresses. Leave it as it is, or the owner can choose new words.
- **The You page's lines.** These are draft UI wording, not legal text: the "Linked because…" line, and the two new
  "Not linked automatically: …" lines (no account, or more than one).

## When it goes live

Ship it in the same deploy as the code on this branch (legal texts describe today). Once the owner rereads it, set
`LEGAL.ownerReread.privacy` to `{ words: '1wgu7z', on: <date>, by: 'FID 6786' }`, and change `LEGAL.effective` to the
merge day. If anything else changes the Privacy words before then, recompute the key.
