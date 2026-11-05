# Run status: long run of 2026-11-04 (from about 16:15 PT; all five items done by about 18:25)

Kept by the coding agent (Claude, a closed model by Anthropic). Pushed after each item. No secrets here. Nothing is
merged, applied to production or published during this run; legal lines go to the coordinator first.

| # | Item | State |
|---|------|-------|
| 1 | Recast redo and views; Midjourney first remixes; contact sheet | done (Deluin b needs your words) |
| 2 | Owed checks on changed branches (M22: the Minpentai session runs it) | done (17:55) |
| 3 | Lane A: challenge-landing task; contest branch; rehearsal; dress run | done; rehearsal 1 ready for you |
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

**3a. challenge-landing (done, 390ea1eb):** main merged in (merge commit; conflicts in 5 files resolved toward main's
admin-only gate and the branch's landing). "First remixes by @naaate" is a heading over the row; first remixes are
never entries (no badge, no count, not in any entry list). Deluin and Gladias have three bases each, shown in a fresh
random order on each visit (P5g extended, with planted faults); "current default" wording only (a test now refuses
"canonical"/"official" in the config). Typecheck passes; challenge tests 365/365; check:principles 58 pass, only P6a
and P6d failing.

**3b. Branch `contest` (done):** merges check-decisions, remix-submit, remix-landing, challenge-landing (merge commits).
Rehearsal switch (on only off Vercel and with a local database; a new check, P6w, proves production, previews and the
production pooler turn it off); local rehearsal database (PGlite on 127.0.0.1, its own data folder; nothing goes to
R2); `npm run rehearsal` at http://127.0.0.1:3000, refusing any database but the local one; one submission per Pacific
day (withdraw keeps the row); Submit's post check; /challenge/entries (newest first, character filter, your own
shuffle; "See the conversation on …" links; counts off). Typecheck and build pass; tests: challenge 510, rehearsal 38,
daily-sql 25; check:principles 61/64 (P6a, P6d, and P6k: the merged Privacy text waits for your reread).

**3c–3d. Rehearsal ready (done 18:2x).** Your two values are in .env.rehearsal.local (count only). Dress run with two
made-up test persons and stand-in casts from a file: 22 of 22 steps passed (remix made for real, publish, someone
else's cast and a cast without the link refused, Submit, listed on "Every entry" and under its character, no counts,
withdraw, a second same-day submission refused, database the rehearsal's, R2 untouched). $0.053 for two runs, under
the $1 cap. The database was reset; no servers running. **How to run it:** docs/rehearsal-1.md on `contest` (Drive:
"Snowmoon: Rehearsal 1 (Farcaster), how to run it"). Legal drafts: docs/legal/contest-draft.md (Drive: "Snowmoon:
Contest branch, new words and legal lines (DRAFT)"), with the coordinator's note on Terms §6e.

**3. Lane A along the way:** challenge-landing has main merged in (365 challenge tests pass). Branch `contest`: merges done;
rehearsal switch, local rehearsal database (starts and seeds), one submission per Pacific day (migration
NEXT_challenge_daily.sql, which replaces the SQL pack's NEXT_challenge_submit.sql); tests pass (challenge 510,
rehearsal 38, daily-sql 25). Your two values are in .env.rehearsal.local (checked by count only). Typecheck, checks
and the dress run wait for the lock.

**5. Lens page** (branch `signin-lens-bluesky`, 82a07763): whole-project typecheck passes; `/admin/lens-app` loads
on localhost (HTTP 200) with the metadata link and "Sign in with my wallet". The server was stopped afterwards.

## After the owner's answers (evening, 2026-11-04)

- **Admins see /challenge/rules and /challenge/remixes** while private, like /challenge (challenge-landing 5f41aab8,
  merged into contest). Tests pass; not looked at in a browser.
- **Contest's approved legal lines** are in legal.ts (contest a4e0c00d): Terms §6e your sentence exactly, Privacy §4 as
  drafted; reread keys set with your approval recorded; P6k and P6l pass.
- **Test sign-in off contest** (contest 6f4901bd): your rehearsal uses your real Farcaster sign-in. The dress-run
  stand-ins live only on `contest-rehearsal` (bc4e5287), which must never merge (a check there always fails).
  contest: typecheck and build pass; tests challenge 510, rehearsal 36, daily-sql 26; check:principles 62/64 (only
  P6a, P6d).
- **SQL pack item 4** is now NEXT_challenge_daily (sql-pack 51272b02); test:sql-pack 149 passed, 0 failed.
- **Deluin b** in your words: front and views, $0.20276; his files moved to b. A green shoulder bag appeared (see the
  recast sheet).
- **Lens page**: the empty-list bug fixed (f442aeaf).
- **Paying per person, browser side** (person-balance 4c4fae5b): your five answers built. Anyone signed in with
  Farcaster, Lens or Bluesky can pay even if they fail the free check (free generations still need it); the signed
  message names the account in words; 24 hours. The panel (balance, Add funds with USDC or ETH on Base, claim, add by
  transaction) shows in Pictures, Remix and the You page. The approved Terms §4/§6a and Privacy §4/§7 lines are in,
  reread keys set with your approval recorded. The switch is ON on this branch: its migration (NEXT_person_balance)
  must be applied before it merges. Tests: person-balance 84 + 61, wallet 193, images, sign-in all pass; typecheck and
  build clean; check:principles fails only P6a (localhost) and P6d. Not tried with a real browser wallet; the
  Farcaster app's own wallet isn't supported yet. Its panel words are draft UI wording for your look
  (src/lib/balance/wording.ts).

## Blocked

Nothing blocked. Not checked: your own Farcaster sign-in on 127.0.0.1 and a real cast through Neynar (they need
you); `npm run rehearsal` as a command (the dress run started the same server from its own script); P7c on fund-page
(network).

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
- **Test sign-in on `contest`:** for the dress run, lane A added a sign-in for two made-up test FIDs and a local file
  of fake casts, both gated by the rehearsal switch. It must never reach main: before contest merges, remove it or
  prove it can't run there (P6w covers the switch).
- **Admins and the challenge sub-pages:** while the challenge is private, /challenge/rules and /challenge/remixes now
  answer "not found" to everyone, admins included (only /challenge itself shows admins the landing). Say if admins
  should see those two pages too.
- **Recast bases are closed-model drafts** (Gemini): they can be bases only once the closed-model Terms/Privacy release
  (closed-model-bases) is live. The rehearsal uses the open-model drafts as stand-ins.
- **The three-looks proposal** for Zei, Bai, Seila and Mu, and a cap if you want them made.
