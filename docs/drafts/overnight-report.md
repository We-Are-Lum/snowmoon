# Overnight report, 14 to 15 October

Coding agent. Nothing merged, published or spent; no Vercel or database changes.

## Worries first

1. **Wallets are live with no Privacy section.** Prepaid is open on production (`payTo` set on
   main), and the live Privacy Policy doesn't mention wallets. The draft is ready for your reread.
2. **Live today, a failed Generate still charges.** On main, a wallet pays even when our prompt
   check or fal doesn't answer. Fixed on `refund-on-outage`, which needs migration 0013 first.
3. **Live today, a payment can get stuck.** If mainnet.base.org rate-limits us, a paid payment
   isn't added, and only that browser remembers its hash. Fixed by `payment-recovery`, plus
   `BASE_RPC_URL` (Thursday task in sprint.md).
4. **The end card has 5 lines that aren't true yet**, including "Narration: Kokoro" (there's no
   narrator) and a /make link that doesn't exist. Options in `friday-post.md`.
5. **`test:glossary` fails on main** (a stale hash; one line). Not fixed: no branch was asked for.

## Done, by branch

| Branch | What | Tests |
|---|---|---|
| `remote-oct14` | Privacy wallet draft; Terms draft with refunds, recovery and the shutdown line | docs only |
| `refund-on-outage` | Outages credited back; blocked and dropped stay charged; 0013 | wallet 58, 9 fail without the fix |
| `payment-recovery` | Paste a hash on the balance screen; "it's safe" message | wallet 71; full suite passes except glossary (as on main) and P1c (live database, known) |
| `fork-ready` | A fresh clone renders the example scene with no keys; 2 failures from the dog-dawn merge fixed; README; `docs/make-a-scene.md` | full suite passes; fresh-clone render 87 s, 1080p, -16 LUFS |
| `friday-drafts` | End card A/B/C, cast (308 characters with links), bounty post | — |
| `overnight-report` | This file | — |

Job 5 (maps) was skipped: no zip was attached to this session.

## Merge order for Thursday

1. Reread Privacy and Terms; their words go into `legal.ts`.
2. Apply 0012, then 0013, by hand (dry run first).
3. Set `BASE_RPC_URL` and name the provider in section 7.
4. Merge `payment-recovery`. It holds `site-chat-owner-cap`, `site-launch-caps` and
   `refund-on-outage`.
5. Merge `fork-ready` (it holds `scenes-sound` as of 07ee435). Merge in any newer `scenes-sound`
   commits from the Mac session first. This makes the guide link live.
6. The drafts branches are docs only, any time. `site-styles-per-day` is separate; your call.

## Questions for Nate (each has a default, marked assumption)

1. "Deluin Arctic" in the glossary: recorded as covered by "Deluin". *Assumption.*
2. Arctic command post summary: "during the battle" instead of naming chapters. *Assumption.*
3. own-voice-v1: the docs say it's in `config/consent.json`, but it's only in
   `docs/proposals/`. Move it there? *Assumed: wait for you.*
4. Privacy section 9: which payment records does the law require, and for how long? Not checked.
5. The payment screen line "If our prompt check or the image model doesn't answer, you aren't
   charged": add it? *Assumed: not added.*
6. The end card: A, B or C, plus which image model and how the sound was made.

## Smaller findings

- The voice and recording scripts hard-code `/Users/nathan/...` paths. Left alone, as asked; the
  guide warns about it.
- Podcast recipes record a `/Users/nathan` path (your username, public).
- `npm audit`: 1 high, in PostCSS via Next.js (build time only); the fix needs Next 16.
- The new hash box wasn't seen in a browser signed in with a wallet; `check:ui` doesn't sign in.
