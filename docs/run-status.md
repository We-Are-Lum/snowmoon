# Run status: long run of 2026-11-04 (from about 16:15 PT)

Kept by the coding agent (Claude, a closed model by Anthropic). Pushed after each item. No secrets here. Nothing is
merged, applied to production or published during this run; legal lines go to the coordinator first.

| # | Item | State |
|---|------|-------|
| 1 | Recast redo and views; Midjourney first remixes; contact sheet | done (Deluin b needs your words) |
| 2 | Owed checks on changed branches (M22: the Minpentai session runs it) | waiting for the build lock |
| 3 | Lane A: challenge-landing task; contest branch; rehearsal; dress run | running (after item 2) |
| 4 | Lane B: paying per person (design, migration copy blocks, draft lines) | done (branch person-balance; whole-project typecheck owed) |
| 5 | Lens page: typecheck, running on localhost | waiting |

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

## Blocked

## Needs the owner

- **Deluin b's words.** "warm golden-brown" came out yellow-orange twice. Suggest "warm tan skin, straight shoulder-length
  black hair, dark brown eyes" (your own Midjourney prompt for Deluin uses "warm tan skin"). Then one front and its two
  views (about $0.20), and Deluin's character file moves to b.
- **First remixes' references:** what `--sref https://s.mj.run/YwM8K-xTQo0` and `--profile hu97rol rg1f6ql` are (your
  condition 3). And confirm the base each one remixes (proposed on the sheet).
- **Paying per person, 7 questions** (docs/proposals/person-balance.md): can someone who fails the free check still
  pay (Lens and Bluesky can in the draft; Farcaster still passes Neynar first)? Should the signed statement name the
  account in words? Is 24 hours the right claim window? Remix frames aren't wired yet. A merge conflict with
  remix-submit in one file. principles.md's prepaid exception needs an update when it ships. The browser side is next.
- **The three-looks proposal** for Zei, Bai, Seila and Mu, and a cap if you want them made.
