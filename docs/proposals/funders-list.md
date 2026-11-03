# An optional funders list (DRAFT, a proposal only)

Written by the coding agent (Claude, a closed model by Anthropic), 2026-11-04, on branch `fund-page`, for the owner's
decision ("Later, proposal only"). DRAFT until the owner approves it. **Nothing is built: no code, no migration, no
legal text changed.**

## The idea

People who sent something to the Fund account (`FUND.address`) may choose to be listed on the Fund page as funders.

- They opt in by connecting one identity: **Farcaster, Bluesky, Lens or an ENS name**.
- The list shows names and dates only, **by date, never by amount**. It shows no amount, total or rank (principle 7:
  payments never enter scoring or ordering).
- Not being listed is the default. Leaving the list is one tap, at any time.

## Who can be listed

Anyone who sent ETH or USDC to the Fund account on a ready chain (`FUND.chains`). Any amount counts, with no minimum: a
threshold would make the amount matter.

## The flow

1. On /fund, under the send, a quiet line: "Sent something? You can be listed as a funder (optional)."
2. **Connect an identity.** One of these:
   - **Farcaster:** the site's existing sign-in (Quick Auth). Its verified addresses come from Neynar, which receives
     the FID.
   - **ENS:** Sign-In with Ethereum (the site's wallet sign-in, `src/lib/wallet/session.ts`). The name shown is the
     address's primary ENS name (reverse record, checked forward), read from Ethereum.
   - **Lens:** sign in with the wallet that owns the Lens account. The handle is read from Lens's API, which receives
     the address. This needs the Lens sign-in on branch `signin-lens-bluesky` (off today).
   - **Bluesky:** atproto OAuth (the same branch, off), **plus** a wallet signature. Bluesky has no wallet of its own,
     so the sending address must be proved separately.
3. **Prove the gift.** The person picks or pastes one of their transactions to the Fund account. Our server checks
   on chain, with the same rules as prepaid payments (`src/lib/wallet/chain.ts`), that:
   - it went to `FUND.address`, on a ready chain, in ETH or native USDC, with a value above zero;
   - it was sent from an address the identity controls: a Farcaster-verified address, the signed-in wallet (ENS,
     Lens, Bluesky), or a smart wallet's operation sent by one.
4. **Confirm:** "List me as a funder, as @name, from [month year]." The confirmation also says: "Your gift is public
   on chain; anyone who knows your address can see what it sent." Button: "List me".

## What the list shows

> **Funders.** In order of joining the list, newest first: @alice (Farcaster) · Nov 2026 · bob.eth · Nov 2026 · …

- Each entry has the name, the network it's on (Farcaster, Bluesky, Lens, ENS) as text, and the month of the gift.
  The month, not the day, so an entry is harder to match to a transaction.
- Names are text links to the person's profile on that network, with no avatars or embeds (P6a: no third-party
  requests from our pages).
- It's ordered by when the person joined the list, newest first, with `newestFirst` as the only sort. Nothing reads an
  amount.

## What's stored (a migration sketch, not a file)

```sql
-- NEXT_funders_list.sql (sketch). MUST RUN AS postgres. RLS on; studio_writer select, insert, delete.
create table studio.funders (
  id bigint generated always as identity primary key,
  network text not null check (network in ('farcaster', 'bluesky', 'lens', 'ens')),
  handle text not null check (length(handle) between 1 and 100),
  profile_ref text not null,          -- FID, DID, Lens account address, or the ENS name
  gift_month date not null check (extract(day from gift_month) = 1),
  joined_at timestamptz not null default now(),
  unique (network, profile_ref)
);
-- Kept separately and never shown: the transaction's hash, so one gift can't list two people.
create table studio.funder_proofs (
  funder_id bigint not null references studio.funders(id) on delete cascade,
  chain_id int not null check (chain_id in (1, 8453)),
  tx_hash text not null unique check (tx_hash ~ '^0x[0-9a-f]{64}$')
);
```

- **No amount column, anywhere.** The check reads the value only to confirm it's above zero, then discards it.
- **The sending address is not stored**, only the hash, which stops one gift listing two people. Deleting an entry
  deletes its proof.
- A P7 check would refuse an `amount`, `value` or `usd` column in these tables, and any sort but `newestFirst` in the
  list's code. Its planted violation: a list ordered by value. A P6 check would keep both tables private (P6b).

## Privacy and Terms (to draft when it's built, not before)

- **Privacy §4:** if you choose to be listed as a funder, we keep the name you chose, its network, the month of your
  gift, when you joined, and the gift's transaction hash (to stop it being used twice). We keep no amount and no
  address. Leave the list and all of it is deleted.
- **Privacy §7:** Neynar (Farcaster-verified addresses), Lens's API (the handle, for a Lens account) and Bluesky
  (OAuth) receive what each needs, only when you opt in. Our Ethereum and Base RPCs receive the transaction hash, to
  check it.
- **Terms §6c:** one sentence: "If you choose, the Fund page lists you as a funder, by name and month, never by
  amount; you can leave the list at any time."

## Open questions for the owner

1. Whether the list should exist at all. It adds sign-ins (Lens, Bluesky) that are off today.
2. Month or day, and whether to show the network's name.
3. Whether gifts to the old support address (`0x93eC…73a3`) count.
4. Moderation: a funder's handle is their own, but an offensive ENS name could appear. Proposed: admins can hide an
   entry (a P5b-style exception, labelled), and the person is told.
