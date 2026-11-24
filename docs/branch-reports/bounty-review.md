# Branch report: bounty-review (DRAFT)

The owner's request of 2026-11-23: a private review tool for the poidh backstory bounty
(poidh.xyz/base/bounty/1546; bounty 560 on PoidhV3 on Base), to go through the claims and make a shortlist before the
challenge closes on 29 Nov, and the same tool for the challenge's entries. Written by the coding agent (Anthropic's
Claude, a closed model). **Not merged, no pull request.** Branch `bounty-review`, from `origin/main` at 8bf0b667.
The owner applied the migration (now 0050_bounty_review.sql; numbered 0048 first, then 0050 after #224 took 0048 and 0049) on 2026-11-23 and asked for the merge once the checks pass. $0 spent; no model called.

## What it is

- **/admin/bounty**, admins only. Everyone else (signed out, any other account) gets the site's usual "not found",
  status 404, exactly as /admin/activity. The page shell is always `notFound()`; a signed-in admin's browser draws the
  review from `GET /api/admin/bounty`, which answers 404 to anyone but an admin before anything is read (on Base or in
  the database).
- **Two tabs:** "Bounty claims" (every claim on bounty 560, newest first, read from Base) and "Challenge entries" (the
  challenge's entries from /challenge/entries, newest first, admin examples left out) for the deep-funding shortlist.
- **Phone-first:** one claim per screen; big Back and Next fixed at the bottom; the arrow keys work on a laptop. Each
  claim shows its picture, name, description in full, the claimer's address (and their site name when the site links
  that wallet to an account), when it was made, and the claim number.
- **Three labels**, tapped on and off: "Followed directions", "Good", "Top", each showing which admin set it and when,
  and a **private note** (280 characters). Filters: All, Unlabelled, Followed directions, Good, Top, with counts. A
  filter's list is fixed when it is chosen, so labelling a claim under "Unlabelled" doesn't make it jump away; tap the
  filter again to redraw.
- **Hints, never labels** (dashed box, ✓ / ✗ / ?): whether the description links a published challenge picture on
  snowmoon.party, and its character (also when the claim's picture is the site's own file); the paragraph count (link
  lines left out); whether it came in before the close; and the address's count of claims on the bounty. Each hint
  quotes the bounty's own words it was checked against. **The rules are read from the bounty itself** on Base
  (`bounties(560).description`), not from our config: the close ("Entries close Sunday 29 November, 11:59pm PT."),
  "one to three paragraphs", "Up to three entries per person." and "The picture must be made on snowmoon.party." If
  the bounty's text stopped saying one of these, that hint shows "?" and says so, rather than using a value of ours.
  The page quotes the bounty's numbered directions and its rules in "The bounty's rules, as it states them".
- **Read-only:** view functions only (`bounties`, `bountyClaims`, `claims`, and the claim NFT's `tokenURI`), batched
  through Multicall3. Nothing is sent to poidh; no transaction; no wallet. The owner still picks the winner on poidh.
- **Pictures** come through the site (`/api/admin/bounty/image?claim=<id>`, admins only): the server reads the claim's
  tokenURI on Base (never from the request), fetches it with the guards from warplore's comic bounty (https to a
  public host name only, never an address or a name that resolves to a private one; redirects re-checked; 12 MB cap;
  40 MP cap) and sends a JPEG it drew itself. After the owner's review (2026-11-23): the private-address check is the
  connection's own DNS lookup on every hop (node:https `lookup`), so DNS rebinding can't slip a private address past a
  separate check; and only JPEG, PNG, WebP, GIF or AVIF are accepted, known by their bytes and sharp's reading (never
  SVG). An admin's browser never asks a claimer's host for anything (P6).

## Which Base RPC it reads

`src/lib/wallet/chain.ts`, the site's existing Base reader (sign-in and prepaid checks use it):
`process.env.BASE_RPC_URL` if it is set for the deployment, else Base's public endpoint **https://mainnet.base.org**
(`IMAGES.prepaid.rpcUrl`). I can't see production settings (no production env reads), so I don't know whether
BASE_RPC_URL is set there; the page itself says which one answered ("read … through https://mainnet.base.org" or
"through BASE_RPC_URL (set for this deployment)", never the URL of a set one, which may hold a key). Reads are cached a
minute; "Read Base again" asks now. A full read of today's 41 claims is 1 call plus 2 batched calls (Multicall3).
IPFS pictures go through the public gateway `https://ipfs.io/ipfs/` (config `BOUNTY_REVIEW.ipfsGateway`), server-side.

## Does Privacy change? No (my reading; the owner decides)

Everything shown is public chain data (the bounty, claims, addresses, pictures the claimers published). The labels and
notes are the two admins' own working notes, kept private, about public claims; nothing about visitors is collected,
nothing new is sent anywhere on a visitor's behalf, and no page anyone else sees changes. One fact for the owner's
reread: the server, when an admin opens a claim, fetches that claim's picture from the host the claimer named (or the
IPFS gateway). That request carries no visitor data (it is the site's server, not the admin's browser). No legal text is
changed on this branch.

## The migration: 0050_bounty_review.sql (applied by the owner, 2026-11-23, before 0048 and 0049; separate tables)

Three new tables, additive, nothing else changes. Must run as `postgres` in the Supabase SQL Editor: A dry run (ends in
rollback), B migration, C read-back (inside a transaction ending in rollback: rights read with has_table_privilege,
realistic rows inserted, bad rows refused, rows deleted; ends READ-BACK PASSED), D undo.

- `studio.review_labels` (kind 'bounty_claim' / 'challenge_entry', subject "560:<claim>" or the entry's version id,
  label, set_by FID, set_at). studio_writer: select, insert, delete.
- `studio.review_notes` (one note per claim or entry, ≤ 280 chars). studio_writer: select, insert, update, delete.
- `studio.review_log` (every label on/off and note set/cleared, with who and when). studio_writer: select, insert.
- anon and authenticated: nothing on any of them; row level security on.

Tested locally on PGlite against main's 0001–0047 (`npm run test:bounty-review`): A changes nothing; B applies twice;
C passes and keeps nothing; D removes the tables and B applies again; five planted faults each make C fail (an update
grant on labels, a read grant to anon, RLS off, the label check dropped, a note check refusing every note). Until it is
applied the page still lists every claim and says "Labels can't be saved yet".

## Tests

- `npm run test:bounty-review`: 117 passed, 0 failed (no network, no production database; Base is a stub answering as
  PoidhV3, with the bounty's real text). The gate (404 and nothing read for signed-out and non-admins), the claims
  (only this bounty's, newest first, linked-wallet name), the hints (23:59:30 PT on 29 Nov is on time, 00:00:30 on 30
  Nov is late; four paragraphs is a ✗; an address's 4th claim is over three; a page link with no published picture is
  a ✗), labels and the log, the picture guards (private addresses, a redirect to 169.254.169.254, oversize), and P5
  (only the review's own files touch the review tables or code; P5b passes by the 404 gate, with planted faults).
- A real read of Base on 2026-11-23 (the screenshot data): 41 claims; pictures read for the newest 7 through the
  guards (Pinata, pinata.cloud gateway, snowmoon.party).
- `npx tsc --noEmit -p .` (the whole project, under the heavy lock, 2026-11-23 11:06 PT): passes.
- Not run: check:principles against a deployment (no preview with a database: previews have none), check:ui.

## Principles

- **P5 (nothing featured; picks labelled):** touched. Pass, with one tension to raise. The labels are private: only
  /admin/bounty's own files read or write them (scanned on every file under src/, with planted faults), no public
  page, feed, agent tool or API reads them, and nothing anyone else sees is ordered or marked by them. The page sorts
  newest first under P5b's admin-only exception (its own 404 gate). **Tension:** P5b's text says admin code may write
  `studio.admin_picks` "and nothing else"; these private labels are a second admin write. p5b.ts doesn't test writes,
  so the check passed, and the principle's wording needed a line. **Resolved 2026-11-23:** the owner's line, reread
  word for word, is in principles.md's P5b, and scripts/lib/p5b.ts now enforces it (only src/lib/review/ writes or
  reads the review tables; planted faults in test:bounty-review, test:admin-activity and check:principles P5b-review).
- **P6 (no third-party requests):** touched. Pass: the admin's browser loads only from the site (pictures are proxied
  and re-encoded by the server). Ratings/likes untouched.
- **P7 (payments never enter scoring or ordering):** not touched (the bounty's amount is shown as read; nothing orders
  by it).
- **P4 (no model output published without a person):** not touched; no model is called. Hints are plain code.
- **P1–P3, P8:** not touched.
- New tension: only the P5b wording above.
