# Run status: long run of 2026-11-04 (from about 16:15 PT)

Kept by the coding agent (Claude, a closed model by Anthropic). Pushed after each item. No secrets here. Nothing is
merged, applied to production or published during this run; legal lines go to the coordinator first.

| # | Item | State |
|---|------|-------|
| 1 | Recast redo and views; Midjourney first remixes; contact sheet | done (Deluin b needs your words) |
| 2 | Owed checks on changed branches (M22: the Minpentai session runs it) | done (17:55) |
| 3 | Lane A: challenge-landing task; contest branch; rehearsal; dress run | running (after item 2) |
| 4 | Lane B: paying per person (design, migration copy blocks, draft lines) | done (branch person-balance; whole-project typecheck owed) |
| 5 | Lens page: typecheck, running on localhost | done (ready for you to sign) |

## How the run shares the Mac

8 GB RAM, and the Minpentai session builds too: one heavy step (a Next build or server, a full typecheck, a UI
check) at a time across both sessions, by a shared lock. M22 is run by the Minpentai session in a quiet window.

**M22 (reported by the Minpentai session, 16:3x):** passed tonight inside the agent-MCP suite on both its branches,
#113 (balance) and minpentai-clarity; it runs again in that session's combined build. Not run by this session.

## Done

**1. Recast, views, first remixes** (branch `challenge-styles`, all drafts, nothing published):
- Deluin b redone once: its skin came out flat yellow-orange again. Not used yet (see "Needs the owner").
- Views made for Deluin now and a, Gladias a and b (b with your new words): 8 views. Spent this round $0.60938
  (redo $0.06721, views $0.54217); caps raised by exactly $0.60 (+$0.07 recast, +$0.53 views).
- Gladias's character file and cast.json sheet job now use look b as the current default.
- First remixes by @naaate: 10 Midjourney files copied byte for byte with sha256; recipes only from each file's own
  metadata (prompt, parameters, job ID); your picks marked (two each for Deluin, Gladias, Mu and Seila; one for Zei;
  the Deluin ledge picture a draft). Contact sheet:
  https://github.com/We-Are-Lum/snowmoon/blob/challenge-styles/docs/starting-sheet-drafts/first-remixes-contact-sheet.md
- Proposal, three looks each for Zei, Bai, Seila and Mu (words only):
  https://github.com/We-Are-Lum/snowmoon/blob/challenge-styles/docs/starting-sheet-drafts/three-looks-proposal.md
- Recast sheet: https://github.com/We-Are-Lum/snowmoon/blob/challenge-styles/docs/starting-sheet-drafts/recast-contact-sheet.md

**4. Paying per person** (branch `person-balance`, from signin-lens-bluesky; c53e4727; nothing merged or applied):
- Design: docs/proposals/person-balance.md (Drive: "Snowmoon: Paying per person (design, DRAFT)"). A wallet signs a
  statement naming your Farcaster, Lens or Bluesky account; a payment from that wallet within 24 hours is credited to
  that account; no one can claim another person's transaction; one transaction is credited once, ever.
- Migration copy blocks: supabase/migrations/NEXT_person_balance.sql (dry run, migration, read-back with realistic
  inserts and deletes). Additive; safe with today's live code and after the SQL pack's five. Not safe to run twice (a
  second run stops at its first step and changes nothing).
- Tests: test:person-balance 84 checks with 21 planted faults, all caught; test:person-balance-code 34 checks; wallet,
  images and sign-in suites still pass. Code is behind a switch, off; the browser side isn't built.
- Terms and Privacy drafts: docs/legal/person-balance-draft.md (Drive: "Snowmoon: Paying per person, Terms and Privacy
  lines (DRAFT)"), reviewed by the coordinator for the shortest-true rule; for the owner's reread.

**2. Checks (done 17:55).** Each branch built and served on localhost; every check named its target.

| Branch | check:principles | Fails | Tests | Extra |
|---|---|---|---|---|
| privacy-furthest-chapter | 58/60 | P6a, P6d | none in its diff | |
| fund-page | 58/61 | P6a, P6d, P7c (network) | none | |
| check-decisions | 58/60 | P6a, P6d | 44/44 | |
| remix-landing | 58/60 | P6a, P6d | none | check:ui pass (59 pages); check:miniapp pass |
| remix-submit | 59/61 | P6a, P6d | none | |
| closed-model-bases | 56/60 | P6a, P6d, P6k, P6l (redrafts not reread) | none | |
| remix-model-choice | 59/62 | P6a, P6d, P6k (redrafts not reread) | 17/17 | |
| signin-lens-bluesky | 60/62 | P6a, P6d | 20/20, 44/44 | |
| bluesky-check | 60/63 | P6a, P6d, P6k (redrafts not reread) | 64/64, 20/20, 44/44 | |
| sheet-help | 56/58 | P6a, P6d | 127 | |
| find-a-moment | 61/63 | P6a, P6d | 93, 127 | |
| signin-reread-list | 56/58 | P6a, P6d | 13/13 | |

P6a fails on localhost by design; P6d is the accepted open item; P6k/P6l wait for your reread of those redrafts (no key
was set). P7c on fund-page couldn't load ethereum-rpc.publicnode.com from this network (base.org answers): not shown
passing, re-run it from another network before merging fund-page. Every check caught its planted violation. M22: run by
the Minpentai session (above).

**3. Lane A so far:** challenge-landing has main merged in (365 challenge tests pass). Branch `contest`: merges done;
rehearsal switch, local rehearsal database (starts and seeds), one submission per Pacific day (migration
NEXT_challenge_daily.sql, which replaces the SQL pack's NEXT_challenge_submit.sql); tests pass (challenge 510,
rehearsal 38, daily-sql 25). Your two values are in .env.rehearsal.local (checked by count only). Typecheck, checks
and the dress run wait for the lock.

**5. Lens page** (branch `signin-lens-bluesky`, 82a07763): whole-project typecheck passes; `/admin/lens-app` loads
on localhost (HTTP 200) with the metadata link and "Sign in with my wallet". The server was stopped afterwards.

## Blocked

## Needs the owner

- **Register the Lens App** (when you like): in Terminal, one line at a time:

      cd ~/snowmoon-signin-lens
      npx next dev -p 3005 -H 127.0.0.1

  then open http://127.0.0.1:3005/admin/lens-app in the browser with your wallet. Check the metadata's bytes, sign the
  Builder sign-in, Create the App; if Lens asks you to send a transaction, check to, value and chainId on the page
  before signing. Send me the App address and transaction it shows; stop the server with Ctrl-C.

- **Deluin b's words.** "warm golden-brown" came out yellow-orange twice. Suggest "warm tan skin, straight shoulder-length
  black hair, dark brown eyes" (your own Midjourney prompt for Deluin uses "warm tan skin"). Then one front and its two
  views (about $0.20), and Deluin's character file moves to b.
- **First remixes' references:** what `--sref https://s.mj.run/YwM8K-xTQo0` and `--profile hu97rol rg1f6ql` are (your
  condition 3). And confirm the base each one remixes (proposed on the sheet).
- **Paying per person, 7 questions** (docs/proposals/person-balance.md): can someone who fails the free check still
  pay (Lens and Bluesky can in the draft; Farcaster still passes Neynar first)? Should the signed statement name the
  account in words? Is 24 hours the right claim window? Remix frames aren't wired yet. A merge conflict with
  remix-submit in one file. principles.md's prepaid exception needs an update when it ships. The browser side is next.
- **Withdraw on the contest branch keeps the row** (marked withdrawn, so that day's submission isn't given back), so
  the approved Privacy §4 sentence "If you withdraw a submission, it is deleted" would be false there. Before/after
  drafts: docs/legal/contest-draft.md on `contest`, for your reread.
- **The three-looks proposal** for Zei, Bai, Seila and Mu, and a cap if you want them made.
