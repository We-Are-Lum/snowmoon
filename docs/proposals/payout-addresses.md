# Payout addresses (DRAFT, a proposal only)

Written by the coding agent (Claude, a closed model by Anthropic), 2026-11-01, on branch `deep-funding`, for the
owner's decision of 2026-11-01. DRAFT until the owner approves it. **A proposal only: no code, no migration file, no
legal text changed.** `src/lib/deep-funding/payout.ts` points here.

## The rule

Before the splits are made, each recipient confirms a payout address on the site.

- It defaults to their primary verified Farcaster address.
- The site checks it works on mainnet: an ordinary wallet, or a contract wallet actually deployed there. It screens
  it against the sanctions list.
- Addresses are stored only for recipients, and only once they've confirmed.
- No one's wallets are read or stored at publish.

A recipient who doesn't confirm in time, or whose address fails the checks, has their share go to the Lake (the deep
funding test's rule 5: "any recipient without a usable mainnet address").

## Who is a recipient

After the results (the 4 Dec call), a recipient is a maker (FID) whose share, after Lake rules 1 to 4 (owner's
originality, the book, admins and ineligible makers, under 1%), is still theirs. That list comes from the runner's
results file (`scripts/deep-funding.ts decide`, which can produce it without addresses) and is committed with the
results as `recipients.json`: challenge, character, FID, share. It is public anyway in the results record. Nobody else
sees the confirm screen or can store an address.

## The flow and screens

**When:** from the results (Fri 4 Dec, 09:00 Pacific) to a confirm deadline before the splits are made. Proposed:
**Mon 7 Dec, 12:00 Pacific**, in `CHALLENGE.dates` as `payoutConfirmCloses`. The splits and tokens are created after
it, before the mint opens (Tue 8 Dec, 09:00). Three days is short; the owner may want it longer, which moves the mint.

**Telling them:** /challenge lists each character's recipients by name and share (public results). A recipient who
signs in sees a card on /you and on /challenge: "You're credited in the final Bai: 19.6% of what it raises. Confirm
where it should go by Monday 7 December, 12:00 Pacific, or your share goes to the Lake." The site sends no
notification of its own; the owner may cast a list on the 4 Dec call.

**Screen 1, the address:**
- Signed in with Farcaster (Quick Auth), the person opens "Confirm your payout address".
- The server asks Neynar for their verified Ethereum addresses (Neynar receives their FID; nothing else), at that
  moment only, and offers the **primary** one, selected, and any other verified Ethereum address as choices.
- **Another address** is allowed only by signing in with that wallet on the same screen (the site's existing
  Sign-In with Ethereum, `src/lib/wallet/session.ts`), so a typo or someone else's address can't be confirmed. No
  free-text address box.

**Screen 2, the checks** (on our server, before anything is stored):
- **Works on mainnet:** `eth_getCode` on Ethereum mainnet.
  - No code: an ordinary wallet. Accepted.
  - EIP-7702 delegation code (`0xef0100…`): an ordinary wallet with a delegation. Accepted.
  - Other code: a contract wallet deployed on mainnet. Accepted, with a note: "a contract wallet; make sure it can
    receive ETH on Ethereum".
  - A smart wallet verified on Farcaster but not deployed on mainnet (for example a Base-only smart wallet) has no
    code there: it looks like an ordinary wallet but nobody may control that address on mainnet. Where the
    verification says it is a smart-contract wallet (Neynar's verified address data includes how it was verified,
    to check), it is **refused** unless deployed on mainnet: "This wallet isn't on Ethereum yet; choose another, or
    deploy it there first."
- **Sanctions:** Chainalysis' sanctions oracle on mainnet (`isSanctioned(address)`, an `eth_call` to its contract),
  so no screening service receives the address beyond our Ethereum RPC. A hit is refused with a neutral message and
  the owner is told; the share goes to the Lake.
- The checks' results (the block number, code length, the oracle's answer) are kept with the confirmation.

**Screen 3, confirm:** "Your share of the final Bai, 19.6% of what its token raises, will go to 0x12…ab on Ethereum,
through a split contract that can't be changed once made. Check you control this address on Ethereum; payments to it
can't be reversed." Button: "Confirm". Changing it is allowed until the deadline (a new confirmation replaces the
old); after it, nothing can change.

**Before the splits:** the owner's tool re-runs both checks on every confirmed address (the state may change), then
writes the address file the runner takes (`--addresses`), and the split is made.

## Storage (a migration sketch, not a file)

```sql
-- NEXT_payout_addresses.sql (sketch). MUST RUN AS postgres. RLS on; studio_writer select and insert only.
create table studio.payout_confirmations (
  id bigint generated always as identity primary key,
  challenge text not null check (challenge ~ '^[a-z0-9-]{1,40}$'),
  fid bigint not null check (fid > 0),
  address text not null check (address ~ '^0x[0-9a-fA-F]{40}$'),
  source text not null check (source in ('farcaster-primary', 'farcaster-verified', 'signed-wallet')),
  wallet_kind text not null check (wallet_kind in ('ordinary', 'delegated', 'contract')),
  checked_block bigint not null,
  sanctions_clear boolean not null check (sanctions_clear),
  confirmed_at timestamptz not null default now()
);
create index on studio.payout_confirmations (challenge, fid, confirmed_at desc);
-- The latest row per (challenge, fid) counts. Only FIDs in the results' recipients list may insert (checked by the
-- route; the list is a committed file). anon and authenticated: no privileges.
```

- One row per confirmation, append-only; the latest counts. A failed check stores nothing.
- **Retention:** the rows are deleted 90 days after the splits are created. The confirmed addresses stay public in
  each split on chain (that is the point of the split), so nothing private is lost; the rows only record that the
  person confirmed. The owner runs the delete (a dated SQL statement in `supabase/drafts/`).
- Nothing about wallets is read or stored at publish, or for anyone not on the recipients list.

The read-back for the real migration follows the house rule: (a) one SELECT, every row true; (b) one DO block that
inserts a realistic confirmation, checks it, checks a bad address and a sanctioned flag are refused, deletes it, and
raises 'READ-BACK FAILED: …'.

## What's sent where

| To | What | When |
| --- | --- | --- |
| Neynar | the recipient's FID, to read their verified addresses | when they open the confirm screen |
| Our Ethereum RPC (to name; today Base uses its public endpoint, so mainnet needs one chosen) | the address (`eth_getCode`, the oracle `eth_call`) | at confirm, and again before the splits |
| Ethereum (public, permanent) | the address and its share, in the split | when the owner creates the split |

## A missing confirmation falls to the Lake

At the deadline, the owner's tool reads the latest confirmation per recipient. No confirmation, a failed re-check, or
a sanctions hit: the runner's `addressOf` returns null (or `usable` false), and rule 5 moves that share to the Lake,
recorded with the reason `no-address` in the results. The results record and /challenge say how much went to the Lake
for that reason, without naming who (owner's choice; naming would say who didn't confirm).

## Privacy and Terms words it needs

**Privacy §4 (Kept by us when you sign in), a new item:**

> If you are credited in the remix challenge's results and confirm a payout address: the address, how you chose it
> (your primary verified Farcaster address, another verified one, or a wallet you signed in with), the result of our
> checks (that it can receive on Ethereum and is not on the sanctions list), and when you confirmed it. The address is
> written, with your share, into a split contract on Ethereum, where it is public and permanent. We delete our record
> of the confirmation 90 days after the splits are made. We read and keep no one's wallet address otherwise.

**Privacy §7 (Outside services), added to the Neynar item:**

> If you are credited in the remix challenge's results, Neynar receives your Farcaster ID when you open "Confirm your
> payout address", to read your verified addresses.

**Privacy §7, a new item:**

> To check a payout address, our Ethereum provider (named here) receives the address, to read whether it holds a
> contract and to ask the Chainalysis sanctions list on Ethereum whether it is listed.

**Terms, a new section after 6e (the deep funding test):**

> **6f. Payout addresses.** If the results credit you, you may confirm an address on Ethereum for your share by the
> date the challenge page gives. Confirm only an address you control on Ethereum: payments to it can't be reversed,
> and the split it goes into can't be changed. We may refuse an address that can't receive on Ethereum or that is on a
> sanctions list. If you don't confirm a usable address in time, your share goes to the Lake, the site's support
> wallet.

## Open questions

1. The deadline (proposed Mon 7 Dec, 12:00 Pacific) and whether the mint should move to allow longer.
2. Which Ethereum RPC provider, named in Privacy.
3. Whether a smart wallet's type can be read reliably from Neynar's verification data; if not, refuse every
   no-code address that Farcaster verified with a contract signature (ERC-1271), and say so.
4. Whether /challenge says how much went to the Lake for missing addresses, and whether it names nobody (proposed).
5. Whether recipients may confirm an address on Base instead, if the token is later on Base. Out of scope: the mint
   is on mainnet.
