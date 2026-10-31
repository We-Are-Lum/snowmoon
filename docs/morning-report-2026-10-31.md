# Morning report, 2026-10-31 (overnight run)

**Rules kept:**
- worktrees and branches only;
- one merge, the simplified /support (#76), with its footer and About links still hidden;
- no migration applied;
- no production writes by agents.

**Model spend: $0.03 of the $3.** It was routing C's one real trial: 5 calls, $0.029877. Sign-in spent $0.

Nothing stopped the run.

## What each branch needs from you, in the order that unblocks the most

The texts for a) to f) are in **`docs/morning-sitting-2026-10-31.md`** (Drive: "Snowmoon: morning sitting, 2026-10-31").
It's one short doc, with the before and after text, the paste files in order, and the word to send.

| # | Branch (head) | What it unblocks | Send me |
|---|---|---|---|
| 0 | **main**: /support (31c9d3b) | Your $1 test from your phone | The transaction link, and whether you saw "Thank you." |
| a | `phase2-admin` (6d9a462) | Garance's admin powers, admin Hide everywhere, picks | "a: reread, applied" (NEXT_admin_picks, 0030) |
| b | `dashboard-rename` (9747da3) | /you → /dashboard; the later blocks' wording assumes it | "b: reread" |
| c | `agent-pictures` (b4fbb3d): Plan A part 1, then part 2 | Agents draft notes, then pictures | "c: reread part 1, applied; reread part 2" (NEXT_agent_pictures, 0031) |
| d | `social-read` (e6b2ed3) | Posts that link here | "d: reread, applied, switch on" (NEXT_social_read, 0032) |
| e | `agent-pictures` (b4fbb3d): routing C | The assistant's make mode (Kimi K3 on Baseten, its own cap) | "e: reread, Terms yes/no, choices ok" |
| f | `no-token` (#73, 0daf8d8) | Less token talk | "f: reread" |
| g | `signin-lens-bluesky` (21f508a) | Lens and Bluesky sign-in | Later: see section 5 |
| h | `minpentai-book-study` (other session) | Agent-played Minpentai design | See section 6 |

## 1. /support, simplified: merged and live (#76, 31c9d3b)

**On production:**
- Title "Support this site" and your line.
- The address, with copy and QR.
- "Other networks: funds may be lost."
- Network (Base | Ethereum), Token (ETH | USDC), Amount, Send.
- A small Terms link.

**Before Send turns on,** the page reads the wallet's balances on that network:
- ETH needs the amount plus the fee; USDC needs the USDC, and ETH for the fee.
- The page names any shortfall. A wallet on the other network is asked to switch first.
- After sending: a transaction link and "Thank you."

**Links:** the home page and About have 0 links to /support (checked on production).

**For your test:**
1. Open snowmoon.party/support in your phone's wallet browser.
2. Choose Base and USDC, type 1, and tap Send.
3. Send me the link. I'll check on Base that exactly 1000000 USDC units went to 0x93eC…73a3.

The amount is typed in the token now, so "1" with USDC is $1.

**Checks:**
- production: check:shipped passes; principles 53 pass + P6d; check:miniapp passes;
- before the merge: test:support 8/8 (with a stand-in wallet), and a UI check that drives a stand-in wallet in the browser, 59 pages;
- the live UI check on the merge commit broke twice on the known intro flake (card 3's label clicked before the card
  settled), then **passed, 59 pages**, with the settle-wait from phase2-admin applied locally and not committed. The fix
  reaches main when phase2-admin (a) merges. Until then, main's own UI check hits this flake about every other run.

## 2. no-token (#73, 0daf8d8): ready, waiting for f's reread

- Main, including the new /support, is merged in. The old support lines it reworded are gone, so main's page is kept.
- The new page has a "Token: ETH | USDC" label, in your own spec's words.
- **Checks:**
  - check:intro passes;
  - test:support 8/8;
  - test:minpentai-snap passes;
  - UI check 59 pages;
  - principles 51 pass. P6k and P6l fail until your reread is recorded, and P6d is the accepted open item.
- After the merge: live checks, including check:snap-live.

## 3. The morning sitting

**The doc:** `docs/morning-sitting-2026-10-31.md`. The old pack points to it and stays as the record.

**Paste files:** checked byte for byte against their branches. All 9 files match:
- NEXT_admin_picks, NEXT_agent_pictures and NEXT_social_read;
- each with its DRY-RUN and READ-BACK.

**Numbers:** main ends at 0029, so they become 0030, 0031 and 0032 in that order.

## 4. Routing C (agent-pictures b4fbb3d; switched off)

**Built:**
- **Routing:** a forced routing call on gpt-oss-120b, with trial 5 C's words.
- **Book questions:** unchanged, under the $2.
- **Make mode:**
  - Kimi K3 via the gateway, with `only: ['baseten']` and `zeroDataRetention: true`;
  - no fallback: a gateway error, another provider, or a reply without zero retention all give "making is unavailable";
  - a make conversation stays on Kimi, through a signed token kept on the device.
- **The caps:** $3 a day for make mode and 10 make conversations a person a day.
- **No migration.**

**Not built:** drafting. For now, make mode reads the book and plans with you. Drafting needs the assistant to act as
your agent.

**Baseten's terms:**
- "Baseten adheres to a Zero Data Retention posture across all inference products … does not use Customer Content for
  model training" (baseten.co/security-practices).
- Vercel lists Baseten as ZDR with no prompt training.
- The gateway's own listing for Kimi K3 on Baseten shows `has_zdr: true` and `has_no_training: true`.
- Caveat: Baseten's customer is Vercel, so our zero retention rests on Vercel's agreement with Baseten.

**Checks:**
- test:chat-make: 21 checks, 9 rules, each proven on a planted violation, plus 3 deliberate breaks of the real code
  caught;
- test:chat 91; test:chat-route 9;
- principles 53 + P6d;
- UI check 59 pages.

**Real trial:**
- Routing gave "book" and "make" correctly.
- 3 Kimi turns, all served by Baseten with zero retention confirmed.
- $0.03 in all. No production write, and the site's Groq key wasn't used.

**Your four choices** are in block e of the sitting.

## 5. Lens and Bluesky sign-in (signin-lens-bluesky 21f508a; switched off)

**Lens:**
- Sign-in uses Lens's own challenge and authenticate flow, signed by the wallet that owns or manages the account.
- We verify Lens's ID token (RS256, issuer, app, expiry, role), then drop Lens's tokens.

**Bluesky:**
- Sign-in is AT Protocol OAuth, written by hand against the spec, scope `atproto` only.
- Locally it uses the loopback client (test at 127.0.0.1); on the site, a client-metadata JSON.
- We check the state and the issuer, and confirm the DID names that issuer. The tokens are used once and dropped.

**Accounts:**
- Both can sign in, add notes, start drafts and connect agents. Agents still sit behind the allowlist.
- Free generations:
  - Bluesky-only accounts get none;
  - a Lens or Bluesky account linked to Farcaster gets that account's free counts;
  - Lens accounts get them only once you set a score threshold.

**Lens scores, for your threshold:** 644 real accounts, from Lens's public API, 2026-10-31.

| Group | n | median | p90 | max | ≥100 | ≥1000 | ≥5000 |
|---|---|---|---|---|---|---|---|
| Well-known (stani, lens, aave…) | 24 | 9990 | 9997 | 9998 | 83% | 83% | 79% |
| Recent posters | 262 | 0 | 5245 | 9997 | 24% | 13% | 10% |
| 200 newest | 200 | 0 | 0 | 0 | 0% | 0% | 0% |
| Random searches | 161 | 24 | 422 | 9990 | 17% | 4% | 1% |
| All | 644 | 0 | 647 | 9998 | 17% | 9% | 7% |

- The scale looks like 0 to 10,000, in two clusters: under about 700, and about 9,000 or more for established accounts.
- Every account created in 2026 that was sampled scored 0.
- A threshold of 100 lets in about 1 in 6 accounts and no new ones. A threshold of 5000 lets in only established accounts.
- The threshold is `SOCIAL_SIGN_IN.lens.minScore`, null today.
- Source: lens.xyz/docs/protocol/accounts/fetch ("a probability-based measure… follower graphs, content…").

**What's missing before it can go on:**
- the Dashboard panel to link and unlink (the route is built);
- a Lens App registered for the site (it uses Lens's test App now);
- `/@handle` pages for Lens and Bluesky accounts.

**Migration:** `NEXT_signin_lens_bluesky` (draft, not applied). It adds two private tables, social_accounts and
social_links, and stores no tokens. It's in PGlite only, and not in iCloud yet.

**Legal draft:**
- Privacy §3, §4, §6 and §7, and Terms §4 and §5, in variants A (no threshold) and B.
- In the repo: `docs/legal/signin-lens-bluesky-draft.md`. On Drive: "Snowmoon: Lens and Bluesky sign-in, legal draft".
- Privacy §3 overlaps no-token's item 17; whichever merges second keeps "your sign-in".

**Checks:**
- test:signin-lens-bluesky 13/13, each rule proven on a planted violation;
- principles 54 of 55 (a new P6p keeps it off until Privacy describes it);
- UI check 59 pages;
- test:you-page 73/73; test:agents 185; test:wallet 177.
- test:designs has 1 failure that also fails on main ("nothing official…" in design-index.tsx). It's separate, and not
  fixed.

**For later, from you:**
- "reread", with variant A or B;
- "applied";
- the threshold;
- registering a Lens App;
- yes to four new P4a exemptions (the Lens and Bluesky sign-in routes);
- whether the link panel must ship first.

## 6. Agent-played Minpentai: already started by another session

The Minpentai session owns all Minpentai work. Its design is on `minpentai-book-study`:
`docs/proposals/minpentai-agent-play.md`, v2, with your 2026-10-30 decisions. So I didn't write a second one.

**It covers:**
- the MCP connector;
- notifications;
- each agent seeing only its own side;
- simulation;
- standing orders and autopilot;
- turn clocks;
- a new option beside today's game.

**It doesn't yet cover these points from your list:**
- **signing in with Bluesky** (it names Farcaster and wallets);
- **the bigger, book-faithful board** (the book-pieces design covers pieces, not board size);
- **the contest around it**;
- **showing which model played each side** (one line only).

Say if you want me to pass these to that session.

## Principles

- **P1 (say what happens to what you type): tension.** The /support amount box keeps its "Only an amount, for your
  wallet. Never sent to us or published." line, because P1f asks for it. Dropping it is your call.
- **P3 (open models): pass.** Kimi K3 and gpt-oss-120b are open weights; check:principles now checks Kimi K3 too.
- **P4 (a person's action): pass.**
  - Make mode can't draft yet.
  - Lens and Bluesky sign-in write only an account row, and only after a proof is accepted.
  - Four new P4a exemptions wait for your yes.
- **P6 (privacy): pass.**
  - /support's reads and send go through the wallet, and nothing is recorded.
  - Make calls are pinned to Baseten, with zero retention, and no fallback.
  - Sign-in tokens are never stored.
  - Everything new stays off until your rereads, enforced by P6e/f/g/h/i/p.
  - P6d is still the accepted open item.
- **P7: pass.** Principle 7's rewording waits only for f. The Lens score gates only free generations.
- **Legal texts describe today: pass.** Everything new is switched off or unmerged until it's reread.
- **Tensions for you:**
  - The Lens score would be a second outside spam gate, like Neynar's. Variant B sends a Lens address to Lens when
    the maker is used.
  - A site Lens App would show publicly, onchain, that this site uses Lens.
  - Zero retention with Baseten rests on Vercel's agreement, not on a contract of ours.
