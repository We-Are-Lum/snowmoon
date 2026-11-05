# Snowmoon: Linked accounts v2, the words (DRAFT)

**DRAFT. Drafted by a coding agent (Claude, a closed model by Anthropic)** for the accounts session (snowmoon-9c),
2026-11-05. Branch `linked-accounts`. Nothing here is approved, and nothing here is in `src/lib/legal.ts`,
`config/consent.json` or any notice: those files are untouched, and `LEGAL.ownerReread` is not set.

## What changed in legal.ts on this branch (read first)

Merging `origin/main` (fd632855, the sign-in release) into `linked-accounts` conflicted in `src/lib/legal.ts`. It was
resolved **toward main's released words**: the branch's `legal.ts` is now main's, word for word. So the lines the
branch had recorded as approved for v1 (Terms 2n41v2, Privacy io2dz: linking as "one person", §6's "shown under its own
name again") and for person-balance (§4's "prepay with any of these accounts", §6a's signed statement and "a balance
stays with the account it was paid to") are **no longer in the branch's legal.ts**. v2's model supersedes v1's lines.
The person-balance lines were approved separately (2026-11-04) and will need to come back with v2's changes below,
in the release that ships paying per person.

The "before" lines below are therefore what is live today (main, 9tvzf3 / erie8c), and the v1 and person-balance drafts
are given where v2 replaces them.

## Terms and Privacy (before → after)

The "after" lines are those of the design, `docs/proposals/linked-accounts-v2.md` section 8 (on
`designs-2026-11-05`, f08b11a4), unchanged: the build follows them and adds no new promise. Shortest true sentences;
no implementation details.

| Where | Before (live, or the v1 / person-balance draft it replaces) | After (DRAFT) |
|---|---|---|
| Terms §4 | Live: "Your account here is a Farcaster account, a wallet address, a Lens account or a Bluesky account…" (and v1's draft: "…linked accounts are one person here…") | Design §8, "Terms §4 After", word for word. |
| Terms §5 | Live byline sentence. | Design §8, "Terms §5 After". |
| Terms §6a | person-balance's approved sentences (not live). | Design §8, "Terms §6a After". |
| Terms §6e | Live: "…anyone signed in with a Farcaster account or a Bluesky account that passes the site's check for it…" and "…three different people…" | Design §8, "Terms §6e" (the remix sentence, the makers sentence, the new prize sentence, the submitting sentence, the record's public id). |
| Privacy §4 | Live: the wallet-link item and the Lens/Bluesky-link item. | Design §8, "Privacy §4 After" (one item for linking, the main, requests, the name, listed sign-ins; the 30 days), the prepaid sentence, the prize line, the challenge line. **Not** the notifications line. |
| Privacy §6 | Live: "if you unlink it, that work is shown with the wallet's address again" | Design §8, "Privacy §6 After (DRAFT)". |
| Privacy §7 | — | **Nothing this release.** The notification line waits for notifications (not built). |
| About | Live "Signing in" | Design §8, "About After". |

Two notes for the reread, from the build:
1. **The stable address is now real**: every Snowmoon account gets `public_id` at the migration (8 letters and
   digits), so Terms §5's "a page at an address that doesn't change" and the payment message's "({its stable address})"
   are true once the pages are built. The pages (`/u/<id>` and the redirects) are **not built in this run**, so the §5
   sentence must not ship before them.
2. **Recovery ships with the banner only** (owner: no notification now). Privacy §4's recovery item ("any request for
   a new main sign-in (which sign-in asked, when, and whether it was cancelled)") is true as built; the mini-app
   notification lines (§4 "New (notifications)" and §7) stay out.

## Site words (DRAFT, in `src/lib/linked/v2-wording.ts`; shown only while the switch is on)

Refusals, shortest true sentence. Where the design has a draft, it is used as written; the others are new (marked *).

- off*: "Linking accounts isn't open yet."
- not-linked*: "That sign-in isn't part of your Snowmoon account."
- not-main: "Only your main sign-in can do that." (The design's "Sign in with lens/bea to continue." is added by the
  page, which knows the main's name.)
- is-main*: "This is already your main sign-in."
- only-main-cancels: "Only your main sign-in can cancel this request."
- last-sign-in*: "This is your Snowmoon account's only sign-in."
- has-account*: "That sign-in is part of another Snowmoon account. To join the two, sign in with the main sign-in of each."
- kind-taken: "Your Snowmoon account already has an account on that network." (the design's "…already has a Lens
  account", made network-free)
- wallets*: "Your Snowmoon account already has 3 wallets."
- attempts*: "Too many tries to link today. Try again tomorrow."
- wait-start: "This sign-in left a Snowmoon account recently. It can join another or start a new one from {date}."
- wait-join: "This sign-in left a Snowmoon account recently. It can join another Snowmoon account, or start one, from {date}."
- moves: "This account has moved between Snowmoon accounts twice this year. It can move again from {date}."
- pending*: "A request for a new main sign-in is already waiting."
- no-request*: "There is no request to cancel."
- same-account*: "Those sign-ins are already one Snowmoon account."
- social-only: "To submit, sign in with one of your social accounts (Farcaster, Lens or Bluesky): your entry links to your own post there."

Before → after for the two the design had with a date of leaving: the design's "lens/bea was unlinked on 11 Dec. It
can join … from 10 Jan." and "This sign-in left a Snowmoon account on 11 Dec. …" become "…left a Snowmoon account
recently. …from {date}": the code knows the end of the wait for certain; the page can add the leaving date when it
shows the sign-in's name.

Not built in this run (words stay as the design drafts them): the recovery banner, the single-sign-in nudge, the
existing-wallet notice, "Your Snowmoon account", "Main sign-in" / "Choose another", "Other sign-ins", "Link a social
account or wallet (needs your main sign-in)", "Ask to become the main sign-in".
