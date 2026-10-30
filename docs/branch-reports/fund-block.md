# Branch report: fund-block (2026-10-30)

**Superseded by branch support-page (2026-10-30). Not to be merged.**

What it built: a small "Fund Snowmoon Party" block on /about (under "No token"), shown only once a wallet address
is set in `FUND.address` (src/lib/config.ts; fail closed, validated as a 0x address). It shows the address with a
copy button (no QR code, no outside request), one line on what gifts pay for (fal.ai image and video models, Groq
and Vercel AI Gateway, hosting and storage), the principle 7 facts (buys nothing, changes no order or default, no
token, final, no record of who gave), and six "What we want to explore" items from docs/next-version.md. All
wording is model-drafted (src/lib/fund.ts), with one "Draft wording" line. No database, no chain read.

Terms/Privacy draft for reread: docs/legal/fund-draft.md (Terms §2 sentence + new §6c "Gifts"; Privacy §4 new
paragraph; §7 unchanged). src/lib/legal.ts is untouched.

Checks: tsc pass; check:principles 53 pass, 0 fail, 1 not run (P6d, Vercel CLI), of 54. Build passed with the
local-only FUND_TEST_ADDRESS. UI check (run once, with the test address): FAILED with 2 failures, both mine: "/about (light|dark): the copy button did
not say Copied". Not root-caused (stopped on supersession); likely the new check reads the button's text right after
the click without waiting, or the clipboard write is refused in headless Chromium. Every other page passed.

## Principles
- P7 (payments never in order or score; no token): pass. No sort or score code touches gifts; P7a/P7b pass.
- P6 (no third-party requests from the browser): pass. Copy uses the browser clipboard; no QR service.
- Legal texts describe today: pass. Nothing added to legal.ts; the block is off until the address is set.
