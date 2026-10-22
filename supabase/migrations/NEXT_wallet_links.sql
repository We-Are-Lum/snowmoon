-- NEXT_wallet_links.sql — wallet ↔ Farcaster links as a regular feature (owner, 2026-10-22: "After you are signed in
-- with a wallet you can have an offer to sign in with Farcaster to associate the account with this wallet. If we
-- can't just use neynar to find out if the wallet is already associated."). DRAFT, NOT APPLIED. Numbered at merge
-- (owner's standing rule, 2026-10-22). Written by the coding agent on branch wallet-farcaster-link.
--
-- MUST RUN AS postgres, in the Supabase SQL Editor, after 0011 (wallet accounts). Dry run first: replace the final
-- `commit;` with `rollback;`. Tested only in PGlite (npm run test:wallet). Until it is applied, the app keeps reading
-- LINKED_WALLETS in src/lib/config.ts, so nothing changes before then.
--
-- What it adds (none of it publicly readable):
-- 1. studio.wallet_links: a wallet account linked to a Farcaster ID. A linked wallet's sign-in is that FID
--    everywhere getPerson is used. How:
--      'verified': the FID itself verified the address on Farcaster (seeded below for the two owner-curated links;
--                  later found by the automatic Neynar lookup, which is switched off until the Privacy reread);
--      'signed':   the person signed in with the wallet and with that FID in the same session and confirmed.
--    Append-friendly: a link is a row; unlinking sets its unlinked_at once and never clears it; linking again is a
--    new row. The app can add and read rows, and can change only unlinked_at, only from empty to a time. At most
--    one active (not unlinked) link per wallet account.
-- 2. studio.wallet_fid_lookups: the last Neynar answer for a wallet account (the FIDs that verified its address,
--    possibly none), kept a day like the Neynar score (0010), so the lookup isn't made on every sign-in. A failed
--    lookup is never kept. Empty while the lookup is switched off.
-- 3. Seeds the two links in LINKED_WALLETS as 'verified' (each verified by that FID on Farcaster, checked by the
--    owner when added). Makes their wallet accounts if they don't exist yet, as their next sign-in would.

begin;

-- ---------------------------------------------------------------------------
-- 1. Links.
-- ---------------------------------------------------------------------------

create table studio.wallet_links (
  id bigint generated always as identity primary key,
  account_id bigint not null references studio.wallet_accounts(id),
  fid bigint not null check (fid > 0),
  how text not null check (how in ('verified', 'signed')),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  check (unlinked_at is null or unlinked_at >= linked_at)
);
-- One active link per wallet: the newest active link is the only one.
create unique index wallet_links_one_active on studio.wallet_links (account_id) where unlinked_at is null;
create index wallet_links_account on studio.wallet_links (account_id, linked_at desc);
create index wallet_links_fid on studio.wallet_links (fid);

alter table studio.wallet_links enable row level security;
create policy writer_insert on studio.wallet_links for insert to studio_writer with check (unlinked_at is null);
create policy writer_read on studio.wallet_links for select to studio_writer using (true);
-- Unlink only: an active row may be given an unlinked_at; nothing else can change (column grant below).
create policy writer_unlink on studio.wallet_links for update to studio_writer using (unlinked_at is null) with check (unlinked_at is not null);
revoke all on studio.wallet_links from anon, authenticated;
revoke update, delete, truncate, references, trigger on studio.wallet_links from studio_writer;
grant select, insert on studio.wallet_links to studio_writer;
grant update (unlinked_at) on studio.wallet_links to studio_writer;

-- ---------------------------------------------------------------------------
-- 2. The Neynar lookup's answer, kept a day.
-- ---------------------------------------------------------------------------

create table studio.wallet_fid_lookups (
  account_id bigint primary key references studio.wallet_accounts(id),
  fids bigint[] not null,
  fetched_at timestamptz not null default now()
);
create index wallet_fid_lookups_fetched_at on studio.wallet_fid_lookups (fetched_at);

alter table studio.wallet_fid_lookups enable row level security;
create policy writer_insert on studio.wallet_fid_lookups for insert to studio_writer with check (true);
create policy writer_read on studio.wallet_fid_lookups for select to studio_writer using (true);
create policy writer_update on studio.wallet_fid_lookups for update to studio_writer using (true) with check (true);
create policy writer_delete on studio.wallet_fid_lookups for delete to studio_writer using (true);
revoke all on studio.wallet_fid_lookups from anon, authenticated;
revoke truncate, references, trigger on studio.wallet_fid_lookups from studio_writer;
grant select, insert, update, delete on studio.wallet_fid_lookups to studio_writer;

-- ---------------------------------------------------------------------------
-- 3. The two owner-curated links (LINKED_WALLETS), as 'verified'.
-- ---------------------------------------------------------------------------

insert into studio.wallet_accounts (address) values
  ('0x003276c5c24cdaff1d804170ab5cbb914f51f78a'), -- m.luisotravez.eth, @luisotravez
  ('0x317a1ea96dc4b10c1ea60e3af59c472316d31303')  -- garance.eth, @garance
on conflict (address) do nothing;

insert into studio.wallet_links (account_id, fid, how)
select a.id, v.fid, 'verified'
from (values ('0x003276c5c24cdaff1d804170ab5cbb914f51f78a', 6852), ('0x317a1ea96dc4b10c1ea60e3af59c472316d31303', 193912)) as v(address, fid)
join studio.wallet_accounts a on a.address = v.address
where not exists (select 1 from studio.wallet_links l where l.account_id = a.id);

commit;
